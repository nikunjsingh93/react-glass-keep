const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const model = require('./ai-model.json');

async function sha256(file) {
  const hash=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class LocalAI {
  constructor({cacheDir, binary=process.env.LLAMA_SERVER_BIN || '/usr/local/bin/llama-server', idleMs=Number(process.env.AI_IDLE_SECONDS || 60)*1000}={}) {
    this.cacheDir=cacheDir; this.binary=binary;
    this.idleMs=Number.isFinite(idleMs)?Math.max(0,Math.min(idleMs,3600000)):60000;
    this.state='unloaded'; this.progress=0; this.child=null; this.timer=null; this.ready=null; this.verified=false;
  }
  status(){return {state:this.state,initialized:!!this.child&&this.state==='ready',modelName:model.name,modelSize:'533 MB download; RAM usage varies',downloadBytes:model.bytes,progress:this.progress,idleSeconds:this.idleMs/1000};}
  async ensureModel(signal,onState){
    await fsp.mkdir(this.cacheDir,{recursive:true});
    const file=path.join(this.cacheDir,model.file);
    if(this.verified)return file;
    try {
      const stat=await fsp.stat(file);
      if(stat.size!==model.bytes||await sha256(file)!==model.sha256)throw new Error('Cached AI model failed verification. Remove only the Qwen GGUF file from the AI model folder and retry.');
      this.verified=true;return file;
    } catch(error){if(error.code!=='ENOENT')throw error;}
    this.state='downloading';this.progress=0;onState?.(this.status());
    const temporary=file+'.'+crypto.randomUUID()+'.partial';
    try {
      const response=await fetch(`https://huggingface.co/${model.repository}/resolve/${model.revision}/${model.file}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(600000)])});
      if(!response.ok||!response.body)throw new Error('Could not download the AI model. Check the server internet connection and free disk space.');
      let received=0;const hash=crypto.createHash('sha256');
      const meter=new Transform({transform:(chunk,_encoding,callback)=>{
        received+=chunk.length;hash.update(chunk);
        if(received>model.bytes)return callback(new Error('AI model download exceeded its expected size.'));
        this.progress=Math.round(received/model.bytes*100);onState?.(this.status());callback(null,chunk);
      }});
      await pipeline(Readable.fromWeb(response.body),meter,fs.createWriteStream(temporary,{flags:'wx'}),{signal});
      if(received!==model.bytes||hash.digest('hex')!==model.sha256)throw new Error('AI model download failed verification. Please retry.');
      await fsp.rename(temporary,file);this.verified=true;return file;
    } finally {await fsp.rm(temporary,{force:true}).catch(()=>{});}
  }
  async ensure(signal,onState){
    clearTimeout(this.timer);
    if(this.child&&this.state==='ready')return;
    if(this.ready)return this.ready;
    this.ready=(async()=>{
      const file=await this.ensureModel(signal,onState);
      signal.throwIfAborted();this.state='loading';onState?.(this.status());
      const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
      const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
      this.url=`http://127.0.0.1:${port}`;this.key=crypto.randomBytes(32).toString('hex');
      const count=Math.max(1,Math.min(4,os.availableParallelism()));
      const configured=Number(process.env.AI_THREADS);const threads=Number.isInteger(configured)&&configured>0?Math.min(configured,64):count;
      const child=spawn(this.binary,['--model',file,'--host','127.0.0.1','--port',String(port),'--api-key',this.key,
        '--ctx-size','4096','--parallel','1','--threads',String(threads),'--threads-batch',String(threads),'--batch-size','256','--ubatch-size','128',
        '--n-gpu-layers','0','--jinja','--reasoning-budget','0','--no-webui'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
      this.child=child;let launchError;
      child.on('error',error=>{launchError=error;});
      // Do not log inference prompts or note contents. Always drain stderr to avoid blocking the worker.
      child.stderr.on('data',()=>{});
      child.on('exit',()=>{if(this.child===child){this.child=null;this.state='unloaded';}});
      for(let i=0;i<1200;i++){
        signal.throwIfAborted();
        if(launchError)throw new Error('llama.cpp could not start. Install llama-server or set LLAMA_SERVER_BIN; Docker includes it.');
        if(child.exitCode!==null)throw new Error('The AI worker stopped while loading. Check available server memory and CPU compatibility.');
        try{const health=await fetch(this.url+'/health',{headers:{Authorization:`Bearer ${this.key}`},signal:AbortSignal.any([signal,AbortSignal.timeout(1000)])});if(health.ok){this.state='ready';onState?.(this.status());return;}}catch(error){signal.throwIfAborted();}
        await pause(100);
      }
      throw new Error('AI loading timed out. Check available server resources and retry.');
    })();
    try{await this.ready;}catch(error){await this.stop();throw error;}finally{this.ready=null;}
  }
  async complete(messages,{signal,onToken,maxTokens=280}={}){
    const headers={'Content-Type':'application/json',Authorization:`Bearer ${this.key}`};
    // Bound context using the model's tokenizer, including languages with many tokens per character.
    messages=messages.map(message=>({...message}));
    for(let attempt=0;attempt<8;attempt++){
      const measured=await fetch(this.url+'/tokenize',{method:'POST',headers,signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),
        body:JSON.stringify({content:messages.map(message=>message.content).join('\n'),parse_special:false})});
      if(!measured.ok)throw new Error('The AI tokenizer is unavailable. Please retry.');
      const {tokens}=await measured.json();
      if(tokens.length+maxTokens+256<=4096)break;
      const last=messages.at(-1);let context;
      try{context=JSON.parse(last.content);}catch{}
      if(!context?.note_excerpts||attempt===7)throw new Error('The question is too long for the AI context. Please shorten it.');
      for(const note of context.note_excerpts)note.text=note.text.slice(0,Math.max(80,Math.floor(note.text.length*0.65)));
      last.content=JSON.stringify(context);
    }
    const response=await fetch(this.url+'/v1/chat/completions',{method:'POST',headers,
      signal:AbortSignal.any([signal,AbortSignal.timeout(120000)]),body:JSON.stringify({messages,stream:true,max_tokens:maxTokens,temperature:0.2,chat_template_kwargs:{enable_thinking:false}})});
    if(!response.ok||!response.body)throw new Error('The AI worker could not answer. Try a shorter question.');
    let pending='',answer='';const decoder=new TextDecoder();
    for await(const chunk of response.body){
      pending+=decoder.decode(chunk,{stream:true});const lines=pending.split('\n');pending=lines.pop();
      for(const line of lines){
        if(!line.startsWith('data:'))continue;const value=line.slice(5).trim();if(!value||value==='[DONE]')continue;
        const event=JSON.parse(value);if(event.error)throw new Error('AI generation failed. Please retry.');
        const token=event.choices?.[0]?.delta?.content;if(token){answer+=token;if(answer.length>16000)throw new Error('AI response exceeded its limit.');onToken?.(answer);}
      }
    }
    return answer.trim();
  }
  idle(){clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.stop();},this.idleMs);this.timer.unref();}
  async stop(){
    clearTimeout(this.timer);const child=this.child;this.child=null;this.state='unloaded';
    if(child?.pid&&child.exitCode===null){
      const ended=once(child,'exit').catch(()=>{});child.kill();
      const force=setTimeout(()=>child.kill('SIGKILL'),3000);force.unref();await ended;clearTimeout(force);
    }
  }
}
module.exports={LocalAI,model};
