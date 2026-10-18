import React, {useState} from 'react';
import {depthOf,moveBranch,indentBranch,toggleBranch,removeBranch,treeOrder} from './checklist';
import {t} from './i18n';

export default function ChecklistEditor({items,onChange,readOnly=false,storageKey}) {
  items=treeOrder(items);
  const commit=next=>onChange(treeOrder(next));
  const [input,setInput]=useState('');
  const [hideDone,setHideDone]=useState(()=>localStorage.getItem(storageKey)==='true');
  const add=(parentId=null)=>commit([...items,{id:crypto.randomUUID(),text:parentId?'':input.trim(),done:false,parentId}]);
  return <div className="space-y-3">
    {!readOnly && <form className="flex gap-2" onSubmit={e=>{e.preventDefault();if(input.trim()){add();setInput('');}}}>
      <input aria-label={t('New checklist item')} placeholder={t('List item…')} value={input} onChange={e=>setInput(e.target.value)} className="flex-1 min-w-0 rounded border p-2 bg-transparent"/>
      <button className="rounded bg-indigo-600 text-white px-3" type="submit">{t('Add')}</button>
    </form>}
    <button type="button" className="text-sm underline" aria-pressed={hideDone} onClick={()=>{setHideDone(!hideDone);localStorage.setItem(storageKey,String(!hideDone));}}>{t(hideDone?'Show completed':'Hide completed')}</button>
    {items.filter(item=>!hideDone || !item.done).map(item=><div key={item.id} data-checklist-item={item.id} className="flex gap-2 items-start" style={{marginLeft:depthOf(items,item)*20}}>
      <input type="checkbox" aria-label={`${t('Complete')}: ${item.text}`} checked={!!item.done} disabled={readOnly} onChange={e=>onChange(toggleBranch(items,item.id,e.target.checked))} className="mt-3 w-5 h-5"/>
      <input aria-label={t('Checklist item')} value={item.text} readOnly={readOnly} onChange={e=>onChange(items.map(i=>i.id===item.id?{...i,text:e.target.value}:i))} className={`flex-1 min-w-0 bg-transparent p-2 border-b ${item.done?'line-through opacity-60':''}`}/>
      {!readOnly && <div className="flex flex-wrap gap-1 max-w-32">
        <button aria-label={t('Move up')} title={t('Move up')} onClick={()=>onChange(moveBranch(items,item.id,-1))}>↑</button>
        <button aria-label={t('Move down')} title={t('Move down')} onClick={()=>onChange(moveBranch(items,item.id,1))}>↓</button>
        <button aria-label={t('Indent')} title={t('Indent')} onClick={()=>commit(indentBranch(items,item.id,true))}>→</button>
        <button aria-label={t('Outdent')} title={t('Outdent')} onClick={()=>commit(indentBranch(items,item.id,false))}>←</button>
        <button aria-label={t('Add sub-item')} title={t('Add sub-item')} onClick={()=>add(item.id)}>＋</button>
        <button aria-label={t('Remove item')} title={t('Remove item')} onClick={()=>onChange(removeBranch(items,item.id))}>×</button>
      </div>}
    </div>)}
  </div>;
}
