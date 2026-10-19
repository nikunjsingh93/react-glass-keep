import {useEffect,useLayoutEffect,useRef} from 'react';
import {isNative} from './platform';

export default function useAndroidNoteBack(open,onBack) {
  const action=useRef(onBack);
  useLayoutEffect(()=>{action.current=onBack;});
  useEffect(()=>{
    if(!isNative || !open || !/Android/i.test(navigator.userAgent))return;
    let disposed=false,listener,busy=false;
    const handle=async()=>{
      if(disposed || busy)return;
      busy=true;
      try{await action.current();}catch(error){console.error('Could not close the note',error);}finally{busy=false;}
    };
    import('@tauri-apps/api/app').then(async({onBackButtonPress})=>{
      if(disposed)return;
      const registered=await onBackButtonPress(handle);
      if(disposed)await registered.unregister();else listener=registered;
    }).catch(error=>console.error('Could not register Android note Back handling',error));
    return()=>{disposed=true;void listener?.unregister().catch(error=>console.error('Could not release Android note Back handling',error));};
  },[open]);
}
