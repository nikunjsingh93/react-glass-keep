import {unzip} from 'fflate';
const MAX_BYTES=100*1024*1024;
const imageTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
const colorMap={DEFAULT:'default',RED:'red',ORANGE:'peach',YELLOW:'yellow',GREEN:'green',TEAL:'mint',BLUE:'blue',CERULEAN:'sky',PURPLE:'purple',PINK:'mauve',BROWN:'sand',GRAY:'sage'};
const safePath=p=>String(p).replaceAll('\\','/').replace(/^\.\//,'');
function dataURL(bytes,name) {
  const type=imageTypes[name.split('.').pop()?.toLowerCase()]; if(!type)return null;
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return `data:${type};base64,${btoa(binary)}`;
}
export async function readKeepFiles(files) {
  const entries=new Map();let total=0;
  for(const file of Array.from(files || [])) {
    if(file.size>MAX_BYTES)throw new Error('Import files must be smaller than 100 MB.');
    if(/\.zip$/i.test(file.name)) {
      let rejected=false,announced=0,count=0;
      const zipBytes=new Uint8Array(await file.arrayBuffer());
      const result=await new Promise((resolve,reject)=>unzip(zipBytes,{filter:info=>{
        announced+=info.originalSize;count++;
        if(announced+total>MAX_BYTES || count>5000 || safePath(info.name).split('/').includes('..')){rejected=true;return false;}
        return true;
      }},(error,result)=>error?reject(error):resolve(result)));
      if(rejected)throw new Error('ZIP exceeds the safe import limits or contains invalid paths.');
      for(const [name,data] of Object.entries(result)){total+=data.byteLength;entries.set(safePath(name),data);}
    } else {total+=file.size;if(total>MAX_BYTES)throw new Error('Import exceeds 100 MB.');entries.set(safePath(file.webkitRelativePath || file.name),new Uint8Array(await file.arrayBuffer()));}
  }
  return entries;
}
export function parseKeepEntries(entries,{onlyOwned=true,accountEmail=''}={}) {
  const notes=[],warnings=[];let skipped=0;
  for(const [name,bytes] of entries) {
    if(!/\.json$/i.test(name))continue;
    let obj;try{obj=JSON.parse(new TextDecoder().decode(bytes));}catch{warnings.push(`Invalid JSON: ${name}`);continue;}
    if(obj.isTrashed){skipped++;continue;}
    const sharees=Array.isArray(obj.sharees)?obj.sharees:[];
    const owner=sharees.find(s=>s.isOwner===true);
    if(onlyOwned && owner && String(owner.email || '').toLowerCase()!==accountEmail.toLowerCase()){skipped++;continue;}
    const items=(obj.listContent || []).map(i=>({id:String(i.id || i.serverId || crypto.randomUUID()),text:String(i.text || ''),done:!!i.isChecked,parentId:i.parentId || i.parentServerId || i.superListItemId || null}));
    const ids=new Set(items.map(i=>i.id));let previousRoot=null;
    items.forEach((item,index)=>{
      if(item.parentId && !ids.has(String(item.parentId)))item.parentId=null;
      const depth=Number(obj.listContent[index].indentationLevel || obj.listContent[index].indentation || 0);
      if(depth>0 && !item.parentId)item.parentId=previousRoot;
      if(!item.parentId)previousRoot=item.id;
    });
    const images=[];
    for(const attachment of obj.attachments || []) {
      const filePath=safePath(attachment.filePath || '');
      const relative=name.slice(0,name.lastIndexOf('/')+1)+filePath;
      let data=entries.get(relative) || entries.get(filePath);
      if(!data){const matches=[...entries].filter(([p])=>p.endsWith('/'+filePath));if(matches.length===1)data=matches[0][1];}
      if(!data){warnings.push(`Missing attachment: ${filePath}`);continue;}
      const src=dataURL(data,filePath);if(src)images.push({id:crypto.randomUUID(),name:filePath.split('/').pop(),src});else warnings.push(`Unsupported attachment: ${filePath}`);
    }
    const ms=Number(obj.userEditedTimestampUsec || obj.createdTimestampUsec || 0)/1000 || Date.now();
    notes.push({id:crypto.randomUUID(),type:items.length?'checklist':'text',title:String(obj.title || ''),content:items.length?'':String(obj.textContent || ''),items,
      tags:(obj.labels || []).map(l=>l.name).filter(Boolean),images,color:colorMap[obj.color] || 'default',pinned:!!obj.isPinned,archived:!!obj.isArchived,
      timestamp:new Date(ms).toISOString(),position:ms,collaborators:sharees.filter(s=>!s.isOwner && s.email && (!s.type || s.type==='USER')).map(s=>({email:s.email}))});
  }
  return {notes,warnings,skipped};
}
