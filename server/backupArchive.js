const crypto = require('node:crypto');
const {zip} = require('fflate');
const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

function userExport(db, userId) {
  const estimate=db.prepare(`SELECT COALESCE(SUM(length(CAST(title AS BLOB))+length(CAST(content AS BLOB))+length(CAST(items_json AS BLOB))+length(CAST(tags_json AS BLOB))+length(CAST(images_json AS BLOB))),0) AS bytes FROM notes WHERE user_id=?`).get(userId);
  if(estimate.bytes>MAX_BACKUP_BYTES)throw new Error('Your backup exceeds the 200 MB export limit.');
  const rows = db.prepare('SELECT * FROM notes WHERE user_id=? ORDER BY id').all(userId);
  return {app:'glass-keep',version:2,appVersion:require('../package.json').version,exportedAt:new Date().toISOString(),notes:rows.map(row=>({
    id:row.id,type:row.type,title:row.title,content:row.content,
    items:JSON.parse(row.items_json),tags:JSON.parse(row.tags_json),images:JSON.parse(row.images_json),
    color:row.color,pinned:!!row.pinned,position:row.position,timestamp:row.timestamp,archived:!!row.archived,
  }))};
}

async function createArchive(db,userId) {
  const payload=userExport(db,userId);
  const json=Buffer.from(JSON.stringify(payload));
  if(json.length>MAX_BACKUP_BYTES)throw new Error('Your backup exceeds the 200 MB export limit.');
  const hash=crypto.createHash('sha256').update(JSON.stringify(payload.notes)).digest('hex');
  const bytes=await new Promise((resolve,reject)=>zip({'backup.json':new Uint8Array(json)},{level:6},(error,result)=>error?reject(error):resolve(Buffer.from(result))));
  return {bytes,hash,count:payload.notes.length};
}

module.exports={createArchive,userExport,MAX_BACKUP_BYTES};
