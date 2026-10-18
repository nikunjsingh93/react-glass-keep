export function descendants(items,id) {
  const result=new Set([String(id)]);
  for(let changed=true;changed;) { changed=false; for(const item of items) if(item.parentId && result.has(String(item.parentId)) && !result.has(String(item.id))) {result.add(String(item.id));changed=true;} }
  return result;
}
export function treeOrder(items) {
  const result=[],seen=new Set(),ids=new Set(items.map(i=>i.id));
  const visit=item=>{if(seen.has(item.id))return;seen.add(item.id);result.push(item);items.filter(i=>i.parentId===item.id).forEach(visit);};
  items.filter(i=>!i.parentId || !ids.has(i.parentId)).forEach(visit);
  items.forEach(visit);return result;
}
export function depthOf(items,item) {
  const byId=new Map(items.map(i=>[String(i.id),i])); let depth=0,parent=item.parentId;const visited=new Set([String(item.id)]);
  while(parent && byId.has(String(parent)) && !visited.has(String(parent)) && depth<8) {visited.add(String(parent));depth++;parent=byId.get(String(parent)).parentId;}
  return depth;
}
export function toggleBranch(items,id,done) { const ids=descendants(items,id);return items.map(i=>ids.has(String(i.id))?{...i,done}:i); }
export function removeBranch(items,id) { const ids=descendants(items,id);return items.filter(i=>!ids.has(String(i.id))); }
export function moveBranch(items,id,direction) {
  const item=items.find(i=>i.id===id);if(!item)return items;
  const siblings=items.filter(i=>(i.parentId || null)===(item.parentId || null));const index=siblings.findIndex(i=>i.id===id);const target=siblings[index+direction];if(!target)return items;
  const branch=descendants(items,id), targetBranch=descendants(items,target.id);const moved=items.filter(i=>branch.has(String(i.id)));const rest=items.filter(i=>!branch.has(String(i.id)));
  const position=direction<0?rest.findIndex(i=>i.id===target.id):rest.findLastIndex(i=>targetBranch.has(String(i.id)))+1;
  return [...rest.slice(0,position),...moved,...rest.slice(position)];
}
export function indentBranch(items,id,indent) {
  const item=items.find(i=>i.id===id);if(!item)return items;
  if(!indent) {const parent=items.find(i=>i.id===item.parentId);return items.map(i=>i.id===id?{...i,parentId:parent?.parentId || null}:i);}
  const siblings=items.filter(i=>(i.parentId || null)===(item.parentId || null));const previous=siblings[siblings.findIndex(i=>i.id===id)-1];
  if(!previous || depthOf(items,previous)>=3)return items;
  return items.map(i=>i.id===id?{...i,parentId:previous.id}:i);
}
