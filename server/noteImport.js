const crypto = require('crypto');
const {fingerprint} = require('./noteFeatures');
const CHUNK_BYTES = 256 * 1024, MAX_NOTE_BYTES = 128 * 1024 * 1024;
const TTL = 60 * 60 * 1000;

function installNoteImport(app,{db,auth,insertNote,getUserByEmail,notify}) {
  // Cache only duplicate fingerprints. Updating content invalidates the cache;
  // existing databases are indexed lazily, one row at a time on their next import.
  db.exec(`CREATE TABLE IF NOT EXISTS note_import_hashes (
    note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, hash TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS note_import_hash_user ON note_import_hashes(user_id,hash);
    CREATE TRIGGER IF NOT EXISTS invalidate_import_hash AFTER UPDATE OF type,title,content,items_json,tags_json,images_json,user_id ON notes
      BEGIN DELETE FROM note_import_hashes WHERE note_id=NEW.id; END;
    CREATE TABLE IF NOT EXISTS note_import_uploads (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
      bytes INTEGER NOT NULL, chunks INTEGER NOT NULL, deduplicate INTEGER NOT NULL,
      restore_sharing INTEGER NOT NULL, expires INTEGER NOT NULL, result_json TEXT,
      PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS note_import_chunks (
      user_id INTEGER NOT NULL, upload_id TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL,
      PRIMARY KEY(user_id,upload_id,part),
      FOREIGN KEY(user_id,upload_id) REFERENCES note_import_uploads(user_id,id) ON DELETE CASCADE);`);
  const saveHash=db.prepare('INSERT OR REPLACE INTO note_import_hashes VALUES(?,?,?)');
  const missing=db.prepare('SELECT n.id FROM notes n LEFT JOIN note_import_hashes h ON h.note_id=n.id WHERE n.user_id=? AND h.note_id IS NULL');
  const noteById=db.prepare('SELECT * FROM notes WHERE id=?');
  const hasId=db.prepare('SELECT 1 FROM notes WHERE id=?');
  const byId=db.prepare('SELECT * FROM note_import_uploads WHERE user_id=? AND id=?');
  const clean=()=>db.prepare('DELETE FROM note_import_uploads WHERE expires<?').run(Date.now());
  clean();setInterval(clean,60000).unref();
  const fail=(res,status,error)=>res.status(status).json({error});
  const upload=(req,res)=>{
    clean();const found=byId.get(req.user.id,req.params.id);
    if(!found)fail(res,404,'Import upload expired. Retry this note.');
    return found;
  };
  const importNotes=(userId,payload)=>{
    const src=Array.isArray(payload)?payload:payload.notes;
    if(!Array.isArray(src)||!src.length)throw new Error('No notes to import.');
    const recipients=new Set(),result={ok:true,imported:0,skipped:0,sharingWarnings:[]};
    db.transaction(()=>{
      for(const row of missing.all(userId))saveHash.run(row.id,userId,fingerprint(noteById.get(row.id)));
      const hashes=new Set(db.prepare('SELECT hash FROM note_import_hashes WHERE user_id=?').all(userId).map(row=>row.hash));
      for(const n of src){
        if(!n||typeof n!=='object'||Array.isArray(n))throw new Error('Invalid imported note');
        const hash=fingerprint(n);
        if(payload.deduplicate!==false&&hashes.has(hash)){result.skipped++;continue;}
        const id=!n.id||hasId.get(String(n.id))?crypto.randomUUID():String(n.id);
        insertNote.run({id,user_id:userId,type:n.type==='checklist'?'checklist':n.type==='draw'?'draw':'text',
          title:String(n.title||''),content:n.type==='checklist'?'':String(n.content||''),
          items_json:JSON.stringify(Array.isArray(n.items)?n.items:[]),tags_json:JSON.stringify(Array.isArray(n.tags)?n.tags:[]),
          images_json:JSON.stringify(Array.isArray(n.images)?n.images:[]),color:typeof n.color==='string'?n.color:'default',
          pinned:n.pinned?1:0,position:typeof n.position==='number'?n.position:Date.now(),timestamp:n.timestamp||new Date().toISOString(),archived:n.archived?1:0});
        saveHash.run(id,userId,hash);hashes.add(hash);result.imported++;recipients.add(userId);
        if(payload.restoreSharing===true&&Array.isArray(n.collaborators))for(const identity of n.collaborators){
          const email=typeof identity==='string'?identity:identity?.email;
          const user=typeof email==='string'?getUserByEmail.get(email.trim()):null;
          if(user&&user.id!==userId){db.prepare('INSERT OR IGNORE INTO note_collaborators(note_id,user_id,added_by,added_at) VALUES(?,?,?,?)').run(id,user.id,userId,new Date().toISOString());recipients.add(user.id);}
          else if(!user)result.sharingWarnings.push(String(email||'Unknown collaborator'));
        }
      }
    })();
    return {result,recipients};
  };
  app.post('/api/notes/import',auth,(req,res)=>{
    if(!(Array.isArray(req.body)?req.body:req.body?.notes)?.length)return fail(res,400,'No notes to import.');
    const {result,recipients}=importNotes(req.user.id,req.body);res.json(result);notify(recipients);
  });
  app.put('/api/notes/import/uploads/:id',auth,(req,res)=>{
    clean();const {bytes,chunks}=req.body||{};
    if(!/^[\w-]{16,100}$/.test(req.params.id)||!Number.isSafeInteger(bytes)||bytes<2||bytes>MAX_NOTE_BYTES||chunks!==Math.ceil(bytes/CHUNK_BYTES))return fail(res,400,'Invalid import upload.');
    const previous=byId.get(req.user.id,req.params.id);
    const deduplicate=req.body.deduplicate!==false?1:0,sharing=req.body.restoreSharing===true?1:0;
    if(previous){if(previous.bytes!==bytes||previous.chunks!==chunks||previous.deduplicate!==deduplicate||previous.restore_sharing!==sharing)return fail(res,409,'Import upload already exists with different options.');return res.json({ok:true});}
    const quota=db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes,COUNT(*) AS count FROM note_import_uploads WHERE result_json IS NULL AND user_id=?').get(req.user.id);
    const global=db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM note_import_uploads WHERE result_json IS NULL').get();
    if(quota.count>=2||quota.bytes+bytes>MAX_NOTE_BYTES||global.bytes+bytes>512*1024*1024)return fail(res,429,'Import upload storage is busy. Retry later.');
    db.prepare('INSERT INTO note_import_uploads VALUES(?,?,?,?,?,?,?,NULL)').run(req.user.id,req.params.id,bytes,chunks,deduplicate,sharing,Date.now()+TTL);
    res.json({ok:true});
  });
  app.put('/api/notes/import/uploads/:id/chunks/:part',auth,(req,res)=>{
    const item=upload(req,res);if(!item)return;
    const part=Number(req.params.part),encoded=req.body?.data;
    if(!Number.isInteger(part)||part<0||part>=item.chunks||typeof encoded!=='string'||encoded.length>Math.ceil(CHUNK_BYTES/3)*4||! /^[A-Za-z0-9+/]*={0,2}$/.test(encoded))return fail(res,400,'Invalid import chunk.');
    const data=Buffer.from(encoded,'base64');
    if(data.length!==Math.min(CHUNK_BYTES,item.bytes-part*CHUNK_BYTES)||data.toString('base64')!==encoded)return fail(res,400,'Invalid import chunk.');
    if(item.result_json)return res.json({ok:true});
    const previous=db.prepare('SELECT data FROM note_import_chunks WHERE user_id=? AND upload_id=? AND part=?').get(req.user.id,item.id,part);
    if(previous&&!previous.data.equals(data))return fail(res,409,'Import chunk already exists with different data.');
    db.prepare('INSERT OR IGNORE INTO note_import_chunks VALUES(?,?,?,?)').run(req.user.id,item.id,part,data);
    db.prepare('UPDATE note_import_uploads SET expires=? WHERE user_id=? AND id=?').run(Date.now()+TTL,req.user.id,item.id);
    res.json({ok:true});
  });
  app.post('/api/notes/import/uploads/:id/commit',auth,(req,res)=>{
    const item=upload(req,res);if(!item)return;
    if(item.result_json)return res.json(JSON.parse(item.result_json));
    const count=db.prepare('SELECT COUNT(*) AS count FROM note_import_chunks WHERE user_id=? AND upload_id=?').get(req.user.id,item.id).count;
    if(count!==item.chunks)return fail(res,409,'Import upload is incomplete.');
    const bytes=Buffer.allocUnsafe(item.bytes);let offset=0;
    for(const row of db.prepare('SELECT data FROM note_import_chunks WHERE user_id=? AND upload_id=? ORDER BY part').iterate(req.user.id,item.id)){row.data.copy(bytes,offset);offset+=row.data.length;}
    let note;try{note=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return fail(res,400,'Invalid imported note');}
    if(!note||typeof note!=='object'||Array.isArray(note))return fail(res,400,'Invalid imported note');
    let saved;
    db.transaction(()=>{
      saved=importNotes(req.user.id,{notes:[note],deduplicate:!!item.deduplicate,restoreSharing:!!item.restore_sharing});
      db.prepare('UPDATE note_import_uploads SET result_json=?,expires=? WHERE user_id=? AND id=?').run(JSON.stringify(saved.result),Date.now()+TTL,req.user.id,item.id);
      db.prepare('DELETE FROM note_import_chunks WHERE user_id=? AND upload_id=?').run(req.user.id,item.id);
    })();
    res.json(saved.result);notify(saved.recipients);
  });
  app.delete('/api/notes/import/uploads/:id',auth,(req,res)=>{
    db.prepare('DELETE FROM note_import_uploads WHERE user_id=? AND id=? AND result_json IS NULL').run(req.user.id,req.params.id);res.json({ok:true});
  });
}
module.exports={installNoteImport,CHUNK_BYTES,MAX_NOTE_BYTES};
