const crypto=require('node:crypto');

const PROVIDERS={
  google:{name:'Google Drive',authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/drive.file',client:'GOOGLE_DRIVE_CLIENT_ID',secret:'GOOGLE_DRIVE_CLIENT_SECRET'},
  onedrive:{name:'OneDrive',authorize:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:'https://login.microsoftonline.com/common/oauth2/v2.0/token',scope:'offline_access Files.ReadWrite.AppFolder',client:'ONEDRIVE_CLIENT_ID',secret:'ONEDRIVE_CLIENT_SECRET'},
};

class ProviderError extends Error {
  constructor(message,status){super(message);this.status=status;}
}

function createProviders({env=process.env,fetcher=fetch}={}) {
  let publicUrl='';
  try {
    const url=new URL(env.CLOUD_BACKUP_PUBLIC_URL);
    if((url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) && !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash)publicUrl=url.origin;
  } catch {}
  const configured=provider=>!!(publicUrl && PROVIDERS[provider] && env[PROVIDERS[provider].client] && env[PROVIDERS[provider].secret]);
  const redirect=provider=>`${publicUrl}/api/cloud-backup/callback/${provider}`;
  async function request(url,options={}) {
    let response;
    try {response=await fetcher(url,{...options,signal:AbortSignal.timeout(120000),redirect:'error'});}catch{throw new ProviderError('Cloud service could not be reached. Please try again.',503);}
    if(!response.ok) {
      const status=response.status;
      // Never surface token responses, authorization codes or upload-session URLs.
      throw new ProviderError(status===401?'Cloud authorization expired. Reconnect your account.':status===403?'Cloud access was denied. Check permissions and available storage.':status===429?'Cloud service is busy. Your backup will be retried.':`Cloud service returned HTTP ${status}.`,status);
    }
    return response;
  }
  async function tokenRequest(provider,fields) {
    const config=PROVIDERS[provider];
    const response=await request(config.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env[config.client],client_secret:env[config.secret],...fields})});
    const token=await response.json();
    if(typeof token.access_token!=='string')throw new ProviderError('Cloud authorization was incomplete. Reconnect your account.',401);
    return {access_token:token.access_token,refresh_token:token.refresh_token,expires_at:Date.now()+(Number(token.expires_in)||3600)*1000};
  }
  function authorization(provider,state,verifier) {
    if(!configured(provider))throw new Error('This cloud provider has not been enabled on this server.');
    const config=PROVIDERS[provider],url=new URL(config.authorize);
    const params={client_id:env[config.client],redirect_uri:redirect(provider),response_type:'code',scope:config.scope,state,
      code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'};
    if(provider==='google'){params.access_type='offline';params.prompt='consent';}
    else params.prompt='select_account';
    url.search=new URLSearchParams(params);return url.toString();
  }
  const exchange=(provider,code,verifier)=>tokenRequest(provider,{code,code_verifier:verifier,redirect_uri:redirect(provider),grant_type:'authorization_code'});
  const refresh=(provider,token)=>tokenRequest(provider,{refresh_token:token.refresh_token,grant_type:'refresh_token',...(provider==='onedrive'?{scope:PROVIDERS[provider].scope}:{})});

  function drive(provider,accessToken,scope) {
    const headers={Authorization:`Bearer ${accessToken}`};
    const json=async(url,options={})=>(await request(url,{...options,headers:{...headers,...options.headers}})).json();
    let folder;
    async function folderId() {
      if(folder)return folder;
      if(provider==='google') {
        const q=`trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='glassKeepScope' and value='${scope}' }`;
        const result=await json('https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q,fields:'files(id)',pageSize:'100'}));
        folder=result.files?.[0]?.id;
        if(!folder)folder=(await json('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`Glass Keep Backups ${scope}`,mimeType:'application/vnd.google-apps.folder',appProperties:{glassKeepScope:scope}})})).id;
      } else {
        const name=`Glass Keep Backups ${scope}`;
        // The first direct approot request creates the application's folder.
        await json('https://graph.microsoft.com/v1.0/me/drive/special/approot');
        try {folder=(await json(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(name)}`)).id;}
        catch(error){if(error.status!==404)throw error;folder=(await json('https://graph.microsoft.com/v1.0/me/drive/special/approot/children',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'})})).id;}
      }
      if(typeof folder!=='string')throw new Error('Cloud backup folder could not be created.');
      return folder;
    }
    async function list() {
      const id=await folderId(),files=[];
      let url=provider==='google'?'https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q:`'${id.replaceAll("'","\\'")}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,size,createdTime,md5Checksum)',pageSize:'1000'}):`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}/children?$select=id,name,size,createdDateTime&$top=200`;
      for(let page=0;url && page<100;page++) {
        const parsed=new URL(url);
        const expectedOrigin=provider==='google'?'https://www.googleapis.com':'https://graph.microsoft.com';
        if(parsed.origin!==expectedOrigin || parsed.username || parsed.password)throw new Error('Cloud service returned an invalid folder page.');
        const data=await json(url);
        files.push(...(provider==='google'?data.files || []:data.value || []));
        if(provider==='google' && data.nextPageToken){const next=new URL(url);next.searchParams.set('pageToken',data.nextPageToken);url=next.toString();}
        else url=provider==='onedrive'?data['@odata.nextLink']:null;
        if(page===99 && url)throw new Error('Cloud backup folder contains too many files.');
      }
      return files.filter(f=>f.name?.startsWith(`glass-keep-${scope}-`) && f.name.endsWith('.zip'));
    }
    async function remove(id) {
      const url=provider==='google'?`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`:`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}`;
      try {await request(url,{method:'DELETE',headers});}catch(error){if(error.status!==404)throw error;}
    }
    async function upload(name,bytes) {
      const id=await folderId();
      let file;
      if(provider==='google') {
        const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,md5Checksum',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Upload-Content-Type':'application/zip','X-Upload-Content-Length':String(bytes.length)},body:JSON.stringify({name,parents:[id],appProperties:{glassKeepScope:scope}})});
        const location=response.headers.get('location');
        if(!location || new URL(location).origin!=='https://www.googleapis.com')throw new Error('Cloud service returned an invalid upload location.');
        file=await json(location,{method:'PUT',headers:{'Content-Type':'application/zip','Content-Length':String(bytes.length)},body:bytes});
        if(file.id)file=await json(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?fields=id,name,size,md5Checksum`);
        if(file.md5Checksum!==crypto.createHash('md5').update(bytes).digest('hex'))throw new Error('Uploaded backup failed its checksum check.');
      } else {
        // Simple uploads support files up to 250 MB; our archive limit is 200 MB.
        file=await json(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}:/${encodeURIComponent(name)}:/content`,{method:'PUT',headers:{'Content-Type':'application/zip'},body:bytes});
      }
      if(!file.id || Number(file.size)!==bytes.length)throw new Error('Uploaded backup size could not be verified.');
      const hashes=file.file?.hashes;
      for(const [field,algorithm] of [['sha1Hash','sha1'],['sha256Hash','sha256']])if(hashes?.[field] && hashes[field].toLowerCase()!==crypto.createHash(algorithm).update(bytes).digest('hex'))throw new Error('Uploaded backup failed its checksum check.');
      return file;
    }
    return {list,remove,upload};
  }
  return {configured,authorization,exchange,refresh,drive,publicUrl};
}
module.exports={createProviders,PROVIDERS,ProviderError};
