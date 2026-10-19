export const DAY = 86400000;
export const DEFAULT_EXPORT = {days:0,lastRun:0,nextRun:0,retryAt:0,error:''};
export function readExport(storage,key) {
  try {
    const value=JSON.parse(storage.getItem(key));
    if(!value || ![0,1,7,30].includes(value.days))return {...DEFAULT_EXPORT};
    return {...DEFAULT_EXPORT,...value};
  } catch {return {...DEFAULT_EXPORT};}
}
export function exportDue(settings,now) {
  return settings.days>0 && now>=settings.nextRun && now>=settings.retryAt;
}
export function createAutoExport({storage,key,now=Date.now,download,active=()=>true,changed=()=>{}}) {
  let busy=false;
  const update=value=>{storage.setItem(key,JSON.stringify(value));changed(value);return value;};
  const configure=days=>{
    if(![0,1,7,30].includes(days))throw Error('Invalid export schedule');
    const previous=readExport(storage,key);
    return update({...previous,days,nextRun:days?(previous.lastRun?previous.lastRun+days*DAY:now()):0,retryAt:0,error:''});
  };
  const run=async(manual=false)=>{
    if(busy || !active())return false;
    const previous=readExport(storage,key);
    if(!manual && !exportDue(previous,now()))return false;
    busy=true;
    try {
      // Check again after acquiring a cross-tab lock and before writing any file.
      const current=readExport(storage,key);
      if(!active() || (!manual && !exportDue(current,now())))return false;
      const result=await download(()=>active()&&(manual||readExport(storage,key).days>0));
      if(!result || !active())return false;
      const latest=readExport(storage,key),time=now();
      update({...latest,lastRun:time,nextRun:latest.days?time+latest.days*DAY:0,retryAt:0,error:''});
      return true;
    } catch(error) {
      if(active())update({...readExport(storage,key),retryAt:now()+15*60000,error:error.message || 'Export failed'});
      return false;
    } finally {busy=false;}
  };
  return {configure,run};
}
