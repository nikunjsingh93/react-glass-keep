import {useEffect,useRef,useState} from 'react';
import {createAutoExport,readExport,DEFAULT_EXPORT} from './autoExport';
import {storageKey,saveBlob,isNative} from './platform';
import {exportFolder,writeExportFolder} from './exportFolders';

export default function useAutoExport({api,token,user}) {
  const key=user?.id?storageKey(`glass-keep-auto-export-${user.id}`):null;
  const [settings,setSettings]=useState(DEFAULT_EXPORT),[busy,setBusy]=useState(false);
  const controller=useRef(null),identity=useRef(null);
  identity.current=token?key:null;
  useEffect(()=>{
    if(!key || !token){setSettings(DEFAULT_EXPORT);controller.current=null;return;}
    let alive=true;
    const active=()=>alive&&identity.current===key;
    const engine=createAutoExport({storage:localStorage,key,active,changed:value=>{if(active())setSettings(value);},download:async canSave=>{
      const payload=await api('/notes/export',{token});
      if(!canSave())return false;
      const filename=`glass-keep-notes-${user.id}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
      const json=JSON.stringify(payload);
      const folder=readExport(localStorage,key).folder;
      if(isNative){const {invoke}=await import('@tauri-apps/api/core');if(!canSave())return false;await invoke('save_auto_export',{filename,json,directory:folder?.directory || null});return true;}
      if(folder)return writeExportFolder(key,filename,json,canSave);
      return saveBlob(new Blob([json],{type:'application/json;charset=utf-8'}),filename);
    }});
    const run=async(manual=false)=>{
      if(!active())return false;
      setBusy(true);
      try {
        const task=()=>engine.run(manual);
        return navigator.locks?await navigator.locks.request(key,{ifAvailable:true},lock=>lock?task():false):await task();
      } finally {if(active())setBusy(false);}
    };
    controller.current={run,configure:engine.configure,destination:engine.destination};
    const check=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void run();};
    const refresh=event=>{if(event.key===key){setSettings(readExport(localStorage,key));check();}};
    setSettings(readExport(localStorage,key));check();
    const timer=setInterval(check,60000);
    window.addEventListener('focus',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',check);window.addEventListener('storage',refresh);
    return()=>{alive=false;controller.current=null;clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('online',check);document.removeEventListener('visibilitychange',check);window.removeEventListener('storage',refresh);};
  },[key,token]);
  const chooseFolder=async()=>{
    try {
      if(isNative){const {invoke}=await import('@tauri-apps/api/core');const folder=await invoke('choose_export_folder');if(folder&&identity.current===key)controller.current?.destination(folder);}
      else {
        const folder=await window.showDirectoryPicker({mode:'readwrite',id:'glass-keep-exports'});
        if(identity.current!==key)return;
        await exportFolder(key,folder);controller.current?.destination({name:folder.name});
      }
    } catch(error){if(error.name!=='AbortError')throw error;}
  };
  return {settings,busy,chooseFolder,canChooseFolder:isNative||typeof window.showDirectoryPicker==='function',useDownloads:async()=>{if(!isNative)await exportFolder(key,null);controller.current?.destination(null);},configure:days=>{controller.current?.configure(days);if(days)void controller.current?.run();},download:()=>controller.current?.run(true)};
}
