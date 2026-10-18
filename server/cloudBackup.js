const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {createProviders,PROVIDERS}=require('./cloudProviders');
const {createArchive}=require('./backupArchive');
const {rateLimit}=require('express-rate-limit');

const DAY=86400000;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

function credentialKey(dbFile) {
  const file=path.join(path.dirname(path.resolve(dbFile)),'cloud-backup.key');
  try {fs.writeFileSync(file,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  const key=fs.readFileSync(file);
  if(key.length!==32)throw new Error('Cloud backup credential key is invalid. Restore cloud-backup.key or reconnect after replacing it.');
  return key;
}
function vault(key) {
  return {
    seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');},
    open(value){try{const bytes=Buffer.from(value,'base64'),decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());}catch{throw new Error('Cloud credentials could not be unlocked. Please reconnect your account.');}},
  };
}

function installCloudBackup(app,{db,dbFile,auth,providers=createProviders(),key,now=()=>Date.now(),scheduler=true}) {
  const encryptionKey=key || credentialKey(dbFile);
  const secure=vault(encryptionKey);
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_backup_accounts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK(provider IN ('google','onedrive')),
    credentials TEXT NOT NULL, interval_days INTEGER NOT NULL DEFAULT 7 CHECK(interval_days IN (1,7,30)),
    next_run INTEGER NOT NULL, last_success INTEGER, last_checked INTEGER, last_error TEXT,
    last_hash TEXT, failures INTEGER NOT NULL DEFAULT 0,
    generation TEXT NOT NULL, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id,provider)
  );
  CREATE TABLE IF NOT EXISTS cloud_backup_oauth (
    state_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, verifier TEXT NOT NULL, interval_days INTEGER NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cloud_backup_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO cloud_backup_metadata VALUES(?,?)').run('installation',crypto.randomUUID());
  const installation=db.prepare('SELECT value FROM cloud_backup_metadata WHERE key=?').get('installation').value;
  const account=(userId,provider)=>db.prepare('SELECT * FROM cloud_backup_accounts WHERE user_id=? AND provider=?').get(userId,provider);
  const active=new Map();
  const requestLimit=rateLimit({windowMs:60000,limit:6,keyGenerator:req=>String(req.user.id),standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many backup requests. Try again in a minute.'}});
  const asyncRoute=fn=>(req,res,next)=>{Promise.resolve().then(()=>fn(req,res)).catch(error=>{
    if(req.cloudBackupReturn && providers.publicUrl){console.warn('Cloud connection failed:',req.params.provider,error.status || 400);res.redirect(303,`${providers.publicUrl}/#/notes?cloudBackupError=1`);}
    else res.status(error.status || 400).json({error:error.message});
  });};
  const validProvider=value=>Object.hasOwn(PROVIDERS,value);
  const validDays=value=>Number.isInteger(value) && [1,7,30].includes(value);
  const scopeFor=userId=>crypto.createHmac('sha256',encryptionKey).update(`glass-keep:${installation}:user:${userId}`).digest('hex').slice(0,16);
  const cookieName=provider=>`${providers.publicUrl.startsWith('https:')?'__Host-':''}glass-keep-cloud-${provider}`;

  function checkpoint(row) {
    const current=account(row.user_id,row.provider);
    if(!current || current.generation!==row.generation || current.lease_token!==row.lease_token)throw new Error('Cloud connection changed. The old backup job was stopped.');
    return current;
  }
  async function client(row) {
    let token=secure.open(row.credentials);
    if(!token.refresh_token)throw new Error('Cloud account needs offline access. Please reconnect it.');
    if(!token.expires_at || token.expires_at<=now()+60000) {
      const renewed=await providers.refresh(row.provider,token);
      token={...token,...renewed,refresh_token:renewed.refresh_token || token.refresh_token};
      checkpoint(row);
      db.prepare('UPDATE cloud_backup_accounts SET credentials=? WHERE user_id=? AND provider=? AND generation=?').run(secure.seal(token),row.user_id,row.provider,row.generation);
    }
    return providers.drive(row.provider,token.access_token,scopeFor(row.user_id));
  }
  async function retainThree(remote,row) {
    const files=await remote.list();checkpoint(row);
    files.sort((a,b)=>b.name.localeCompare(a.name));
    for(const file of files.slice(3)){checkpoint(row);await remote.remove(file.id);}
  }
  async function perform(row,force) {
    try {
      const remote=await client(row);
      const archive=await createArchive(db,row.user_id);checkpoint(row);
      if(!force && archive.hash===row.last_hash) {
        // Confirm the last snapshot still exists before treating an unchanged run as protected.
        const files=await remote.list();checkpoint(row);
        if(files.some(file=>file.name.includes(`-${archive.hash.slice(0,16)}-`))) {
          await retainThree(remote,row);
          db.prepare('UPDATE cloud_backup_accounts SET last_checked=?,next_run=?,last_error=NULL,failures=0 WHERE user_id=? AND provider=? AND lease_token=?').run(now(),now()+row.interval_days*DAY,row.user_id,row.provider,row.lease_token);
          return {ok:true,skipped:true};
        }
      }
      const stamp=new Date(now()).toISOString().replace(/[:.]/g,'-');
      const name=`glass-keep-${scopeFor(row.user_id)}-${stamp}-${archive.hash.slice(0,16)}-${crypto.randomBytes(4).toString('hex')}.zip`;
      checkpoint(row);await remote.upload(name,archive.bytes);checkpoint(row);
      db.prepare('UPDATE cloud_backup_accounts SET last_success=?,last_checked=?,last_hash=?,last_error=NULL,failures=0,next_run=? WHERE user_id=? AND provider=? AND lease_token=?').run(now(),now(),archive.hash,now()+row.interval_days*DAY,row.user_id,row.provider,row.lease_token);
      // Old copies are removed only after a new archive has been uploaded and verified.
      await retainThree(remote,row);
      return {ok:true,skipped:false,size:archive.bytes.length,count:archive.count};
    } catch(error) {
      const current=account(row.user_id,row.provider);
      if(current?.generation===row.generation && current.lease_token===row.lease_token) {
        const failures=current.failures+1;
        const retry=Math.min(6*3600000,15*60000*2**Math.min(failures-1,5));
        db.prepare('UPDATE cloud_backup_accounts SET last_error=?,last_checked=?,failures=?,next_run=? WHERE user_id=? AND provider=? AND lease_token=?').run(error.message.slice(0,300),now(),failures,now()+retry,row.user_id,row.provider,row.lease_token);
      }
      throw error;
    } finally {
      db.prepare('UPDATE cloud_backup_accounts SET lease_until=0,lease_token=NULL WHERE user_id=? AND provider=? AND lease_token=?').run(row.user_id,row.provider,row.lease_token);
    }
  }
  async function run(userId,provider,{force=false,onStarted}={}) {
    if(!validProvider(provider))throw new Error('Unknown cloud provider.');
    if(!providers.configured(provider))throw new Error('This cloud provider has not been enabled on this server.');
    const id=`${userId}:${provider}`;
    if(active.has(id))throw Object.assign(new Error('A backup is already running.'),{status:409});
    if(active.size>=2)throw Object.assign(new Error('Backup service is busy. Please try again shortly.'),{status:409});
    const lease=crypto.randomUUID();
    const claimed=db.prepare('UPDATE cloud_backup_accounts SET lease_token=?,lease_until=? WHERE user_id=? AND provider=? AND lease_until<=?').run(lease,now()+30*60000,userId,provider,now());
    if(!claimed.changes)throw Object.assign(new Error(account(userId,provider)?'A backup is already running.':'Connect your cloud account first.'),{status:409});
    const row=account(userId,provider);
    const heartbeat=setInterval(()=>db.prepare('UPDATE cloud_backup_accounts SET lease_until=? WHERE user_id=? AND provider=? AND lease_token=?').run(now()+30*60000,userId,provider,lease),30000);
    heartbeat.unref();
    const task=perform(row,force);active.set(id,task);
    try{onStarted?.();return await task;}finally{clearInterval(heartbeat);active.delete(id);}
  }
  async function tick() {
    const due=db.prepare('SELECT user_id,provider FROM cloud_backup_accounts WHERE next_run<=? AND lease_until<=? ORDER BY next_run LIMIT 10').all(now(),now());
    for(const row of due){if(active.size>=2)break;if(providers.configured(row.provider))void run(row.user_id,row.provider).catch(()=>{});}
    db.prepare('DELETE FROM cloud_backup_oauth WHERE expires_at<?').run(now());
  }
  app.get('/api/cloud-backup',auth,asyncRoute(async(req,res)=>{
    const connections=Object.entries(PROVIDERS).map(([provider,config])=>{
      const row=account(req.user.id,provider);
      return {provider,name:config.name,available:providers.configured(provider),connected:!!row,days:row?.interval_days || 7,
        nextRun:row?.next_run || null,lastSuccess:row?.last_success || null,lastChecked:row?.last_checked || null,error:row?.last_error || null,
        unchanged:!!(row?.last_success && row.last_checked>row.last_success && !row.last_error),running:!!(row && row.lease_until>now())};
    });
    res.json({connections,retainedVersions:3});
  }));
  app.post('/api/cloud-backup/connect/:provider',auth,requestLimit,asyncRoute(async(req,res)=>{
    const provider=req.params.provider,days=req.body?.days ?? 7;
    if(!validProvider(provider) || !validDays(days))throw new Error('Choose a provider and a 1, 7 or 30 day schedule.');
    const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
    const url=providers.authorization(provider,state,verifier);
    db.prepare('DELETE FROM cloud_backup_oauth WHERE user_id=? AND provider=?').run(req.user.id,provider);
    const version=db.prepare('SELECT token_version FROM users WHERE id=?').get(req.user.id).token_version;
    db.prepare('INSERT INTO cloud_backup_oauth VALUES(?,?,?,?,?,?)').run(digest(state),req.user.id,provider,secure.seal({verifier,version}),days,now()+10*60000);
    res.cookie(cookieName(provider),state,{httpOnly:true,secure:providers.publicUrl.startsWith('https:'),sameSite:'lax',path:'/',maxAge:10*60000});
    res.json({url});
  }));
  app.get('/api/cloud-backup/callback/:provider',asyncRoute(async(req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer');
    const provider=req.params.provider,state=req.query.state;
    if(!validProvider(provider) || typeof state!=='string' || !/^[\w-]{43}$/.test(state))throw new Error('Invalid cloud connection response.');
    const cookie=(req.headers.cookie || '').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${cookieName(provider)}=`))?.slice(cookieName(provider).length+1);
    if(!cookie || !/^[\w-]{43}$/.test(cookie) || !crypto.timingSafeEqual(Buffer.from(cookie),Buffer.from(state)))throw new Error('Open the cloud connection in the same browser where you started it.');
    res.clearCookie(cookieName(provider),{path:'/',httpOnly:true,secure:providers.publicUrl.startsWith('https:'),sameSite:'lax'});
    const pending=db.transaction(()=>{
      const row=db.prepare('SELECT * FROM cloud_backup_oauth WHERE state_hash=? AND provider=? AND expires_at>?').get(digest(state),provider,now());
      if(row)db.prepare('DELETE FROM cloud_backup_oauth WHERE state_hash=?').run(digest(state));return row;
    })();
    if(!pending)throw new Error('Cloud connection expired or was already used. Please try connecting again.');
    req.cloudBackupReturn=true;
    if(req.query.error || typeof req.query.code!=='string')throw new Error('Cloud connection was cancelled. Return to Glass Keep and try again.');
    const original=secure.open(pending.verifier);
    const user=db.prepare('SELECT id,token_version FROM users WHERE id=?').get(pending.user_id);
    if(!user || user.token_version!==original.version)throw new Error('Your session changed. Sign in and connect your cloud account again.');
    const token=await providers.exchange(provider,req.query.code,original.verifier);
    if(!token.refresh_token)throw new Error('Offline cloud access was not granted. Please reconnect and approve backup access.');
    const currentUser=db.prepare('SELECT token_version FROM users WHERE id=?').get(pending.user_id);
    if(!currentUser || currentUser.token_version!==original.version)throw new Error('Your session changed. Sign in and connect your cloud account again.');
    db.prepare(`INSERT INTO cloud_backup_accounts(user_id,provider,credentials,interval_days,next_run,generation) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,provider) DO UPDATE SET credentials=excluded.credentials,interval_days=excluded.interval_days,next_run=excluded.next_run,
      generation=excluded.generation,lease_token=NULL,lease_until=0,last_hash=NULL,last_error=NULL,failures=0`).run(pending.user_id,provider,secure.seal(token),pending.interval_days,now(),crypto.randomUUID());
    res.redirect(303,`${providers.publicUrl}/#/notes?cloudBackup=connected`);
    if(scheduler)void tick();
  }));
  app.put('/api/cloud-backup/:provider',auth,asyncRoute(async(req,res)=>{
    if(!validProvider(req.params.provider) || !validDays(req.body?.days))throw new Error('Choose a 1, 7 or 30 day schedule.');
    const result=db.prepare('UPDATE cloud_backup_accounts SET interval_days=?,next_run=? WHERE user_id=? AND provider=?').run(req.body.days,now()+req.body.days*DAY,req.user.id,req.params.provider);
    if(!result.changes)throw new Error('Connect your cloud account first.');res.json({ok:true});
  }));
  app.delete('/api/cloud-backup/:provider',auth,asyncRoute(async(req,res)=>{
    if(!validProvider(req.params.provider))throw new Error('Unknown cloud provider.');
    db.transaction(()=>{db.prepare('DELETE FROM cloud_backup_accounts WHERE user_id=? AND provider=?').run(req.user.id,req.params.provider);db.prepare('DELETE FROM cloud_backup_oauth WHERE user_id=? AND provider=?').run(req.user.id,req.params.provider);})();
    res.json({ok:true});
  }));
  app.post('/api/cloud-backup/:provider/run',auth,requestLimit,(req,res)=>{
    // A large upload can outlast the browser request. Persist progress and poll status.
    void run(req.user.id,req.params.provider,{onStarted:()=>res.status(202).json({started:true})}).catch(error=>{
      if(!res.headersSent)res.status(error.status || 400).json({error:error.message});
    });
  });
  let downloads=0;
  app.get('/api/cloud-backup/download',auth,requestLimit,asyncRoute(async(req,res)=>{
    if(downloads>=2)throw Object.assign(new Error('Backup service is busy. Try again shortly.'),{status:429});
    downloads++;
    try {
      const archive=await createArchive(db,req.user.id);
      res.setHeader('Content-Type','application/zip');
      res.setHeader('Content-Disposition',`attachment; filename="glass-keep-notes-${new Date(now()).toISOString().slice(0,10)}.zip"`);
      res.send(archive.bytes);
    }finally{downloads--;}
  }));
  let timer;
  if(scheduler){timer=setInterval(()=>{void tick().catch(()=>{});},60000);timer.unref();void tick().catch(()=>{});}
  return {run,tick,stop:()=>clearInterval(timer),account,secure,scopeFor};
}
module.exports={installCloudBackup,credentialKey,vault};
