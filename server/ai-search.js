// A small local index plus query expansion from the same answer model avoids a second model.
const STOP=new Set('the a an and or to of in is are my me i what which should can do does about find show please how for with on this that il le la les des du de un une et en mon mes quel quelle quels quelles je moi est que lire मुझे मेरी मेरे क्या कौन कैसे और है हैं यह के की का में'.split(' '));
function terms(text){return [...new Set((String(text).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)||[]).filter(word=>word.length>1&&!STOP.has(word)))].slice(0,24);}
function installSearch(db){
  // External-content FTS stays in the same data volume; triggers cover imports and all edit paths.
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS notes_ai_fts USING fts5(title,content,items_json,tags_json,content='notes',content_rowid='rowid',tokenize='porter unicode61 remove_diacritics 2');
    CREATE TRIGGER IF NOT EXISTS notes_ai_insert AFTER INSERT ON notes BEGIN
      INSERT INTO notes_ai_fts(rowid,title,content,items_json,tags_json) VALUES(new.rowid,new.title,new.content,new.items_json,new.tags_json); END;
    CREATE TRIGGER IF NOT EXISTS notes_ai_delete AFTER DELETE ON notes BEGIN
      INSERT INTO notes_ai_fts(notes_ai_fts,rowid,title,content,items_json,tags_json) VALUES('delete',old.rowid,old.title,old.content,old.items_json,old.tags_json); END;
    CREATE TRIGGER IF NOT EXISTS notes_ai_update AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_ai_fts(notes_ai_fts,rowid,title,content,items_json,tags_json) VALUES('delete',old.rowid,old.title,old.content,old.items_json,old.tags_json);
      INSERT INTO notes_ai_fts(rowid,title,content,items_json,tags_json) VALUES(new.rowid,new.title,new.content,new.items_json,new.tags_json); END;`);
  // Rebuild once per database, including existing notes, inside the schema migration transaction.
  db.exec('CREATE TABLE IF NOT EXISTS ai_migrations(version INTEGER PRIMARY KEY)');
  if(!db.prepare('SELECT version FROM ai_migrations WHERE version=1').get())db.transaction(()=>{
    db.exec("INSERT INTO notes_ai_fts(notes_ai_fts) VALUES('rebuild'); INSERT INTO ai_migrations VALUES(1)");
  })();
  const query=db.prepare(`SELECT n.*,bm25(notes_ai_fts,5,1,1,2) AS score FROM notes_ai_fts JOIN notes n ON n.rowid=notes_ai_fts.rowid
    WHERE notes_ai_fts MATCH ? AND (n.user_id=? OR EXISTS(SELECT 1 FROM note_collaborators c WHERE c.note_id=n.id AND c.user_id=?))
    ORDER BY score,n.timestamp DESC LIMIT 6`);
  return (userId,text)=>{
    const words=terms(text);if(!words.length)return [];
    return query.all(words.map(word=>'"'+word.replaceAll('"','""')+'"*').join(' OR '),userId,userId);
  };
}
function excerpt(note,question,limit=950){
  let items=[];try{items=JSON.parse(note.items_json||'[]');}catch{}
  const body=(note.content+'\n'+items.map(item=>`${item.done?'[x]':'[ ]'} ${item.text||''}`).join('\n'))
    .replace(/!\[[^\]]*\]\([^)]*\)/g,'[image omitted]').replace(/data:[^\s)]+/g,'[attachment omitted]').trim();
  const words=terms(question);const lower=body.toLowerCase();let start=-1;
  for(const word of words){const at=lower.indexOf(word);if(at>=0&&(start<0||at<start))start=at;}
  start=Math.max(0,start-180);return (start?'…':'')+body.slice(start,start+limit)+(body.length>start+limit?'…':'');
}
module.exports={installSearch,terms,excerpt};
