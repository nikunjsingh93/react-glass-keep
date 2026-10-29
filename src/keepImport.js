import {openZipArchive,importPath,ZIP_LIMITS} from './zipArchive.js';
const MAX_JSON=2*1024*1024, MAX_METADATA=64*1024*1024, MAX_ATTACHMENT=12*1024*1024;
const imageTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
const colorMap={DEFAULT:'default',RED:'red',ORANGE:'peach',YELLOW:'yellow',GREEN:'green',TEAL:'mint',BLUE:'blue',CERULEAN:'sky',PURPLE:'purple',PINK:'mauve',BROWN:'sand',GRAY:'sage'};
const safePath=p=>String(p).replaceAll('\\','/').replace(/^\.\//,'');
export function mergeKeepFiles(previous,next) {
  const files=new Map(Array.from(previous || [],file=>[file.webkitRelativePath || file.name,file]));
  for(const file of Array.from(next || []))files.set(file.webkitRelativePath || file.name,file);
  return [...files.values()];
}
function dataURL(bytes,name) {
  const type=imageTypes[name.split('.').pop()?.toLowerCase()]; if(!type)return null;
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return `data:${type};base64,${btoa(binary)}`;
}
export async function readKeepFiles(files,{signal,onProgress}={}) {
  const entries=new Map();let total=0,metadata=0;
  const add=(name,entry)=>{
    name=importPath(name);total+=entry.size;
    if(entries.has(name)||entries.size>=ZIP_LIMITS.entries||total>ZIP_LIMITS.expanded)throw new Error('ZIP exceeds the safe import limits or contains invalid paths.');
    entries.set(name,entry);
  };
  for(const file of Array.from(files || [])) {
    signal?.throwIfAborted();
    if(/\.zip$/i.test(file.name)) {
      for(const [name,entry] of await openZipArchive(file,{signal}))add(name,entry);
    } else add(file.webkitRelativePath || file.name,{size:file.size,async read({maxBytes,signal}={}){
      signal?.throwIfAborted();if(file.size>maxBytes)throw new Error('One import file exceeds the safe per-file limit.');
      const data=new Uint8Array(await file.arrayBuffer());signal?.throwIfAborted();return data;
    }});
  }
  const hasKeepFolder=[...entries.keys()].some(name=>/(^|\/)Keep\/.*\.json$/i.test(name));
  for(const [name,entry] of entries) {
    if(!/\.json$/i.test(name)||(hasKeepFolder&&!/(^|\/)Keep\//i.test(name)))continue;
    metadata+=entry.size;if(metadata>MAX_METADATA)throw new Error('The export contains too much note metadata. Import smaller folders instead.');
    entries.set(name,await entry.read({maxBytes:MAX_JSON,signal}));onProgress?.();
  }
  return entries;
}
export function parseKeepEntries(entries,{onlyOwned=true,accountEmail=''}={}) {
  const notes=[],warnings=[],missingAttachments=[],byName=new Map();let skipped=0;
  for(const name of entries.keys()){const base=name.split('/').pop();if(!byName.has(base))byName.set(base,[]);byName.get(base).push(name);}
  for(const [name,bytes] of entries) {
    if(!/\.json$/i.test(name)||!(bytes instanceof Uint8Array))continue;
    let obj;try{obj=JSON.parse(new TextDecoder().decode(bytes));}catch{warnings.push(`Invalid JSON: ${name}`);continue;}
    if(!obj||Array.isArray(obj)||typeof obj!=='object'||typeof obj.title!=='string'||!['textContent','listContent','createdTimestampUsec','userEditedTimestampUsec','isArchived','sharees'].some(key=>key in obj))continue;
    try {
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
    const images=[],missingImages=[];
    for(const attachment of obj.attachments || []) {
      const filePath=safePath(attachment.filePath || '');
      const relative=name.slice(0,name.lastIndexOf('/')+1)+filePath;
      let entryName=entries.has(relative)?relative:entries.has(filePath)?filePath:null;
      if(!entryName){
        const candidates=byName.get(filePath.split('/').pop()) || [];
        const matches=candidates.filter(p=>p.endsWith('/'+filePath));
        if(matches.length===1)entryName=matches[0];
        else if(!matches.length&&candidates.length===1)entryName=candidates[0];
      }
      const data=entries.get(entryName);
      if(!imageTypes[filePath.split('.').pop()?.toLowerCase()]){warnings.push(`Unsupported attachment: ${filePath}`);continue;}
      if(!data){missingImages.push({noteName:name,filePath});continue;}
      images.push({id:crypto.randomUUID(),name:filePath.split('/').pop(),src:data instanceof Uint8Array?dataURL(data,filePath):null,...(data instanceof Uint8Array?{}:{entryName})});
    }
    const ms=Number(obj.userEditedTimestampUsec || obj.createdTimestampUsec || 0)/1000 || Date.now();
    notes.push({id:crypto.randomUUID(),type:items.length?'checklist':'text',title:String(obj.title || ''),content:items.length?'':String(obj.textContent || ''),items,
      tags:(obj.labels || []).map(l=>l.name).filter(Boolean),images,color:colorMap[obj.color] || 'default',pinned:!!obj.isPinned,archived:!!obj.isArchived,
      timestamp:new Date(ms).toISOString(),position:ms,collaborators:sharees.filter(s=>!s.isOwner && s.email && (!s.type || s.type==='USER')).map(s=>({email:s.email}))});
    missingAttachments.push(...missingImages);
    } catch { warnings.push(`Invalid JSON: ${name}`); }
  }
  return {notes,warnings,missingAttachments,skipped};
}

export async function* keepNotesWithAttachments(notes,entries,{signal}={}) {
  for(const note of notes){
    signal?.throwIfAborted();const images=[];
    let budget=new TextEncoder().encode(JSON.stringify({...note,images:[]})).byteLength;
    for(const image of note.images){
      if(!image.entryName){images.push(image);continue;}
      const entry=entries.get(image.entryName);
      budget+=Math.ceil(entry.size/3)*4+new TextEncoder().encode(JSON.stringify({id:image.id,name:image.name,src:''})).byteLength+128;
      if(budget>19*1024*1024)throw new Error('One note exceeds the API upload limit.');
      const data=await entry.read({maxBytes:MAX_ATTACHMENT,signal});
      images.push({id:image.id,name:image.name,src:dataURL(data,image.name)});
    }
    yield {...note,images};
  }
}
