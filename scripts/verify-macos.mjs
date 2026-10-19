import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';

assert.equal(process.platform,'darwin','Run this check on macOS.');
const architecture=process.argv[2];
assert.ok(['arm64','x64'].includes(architecture));
const app=path.resolve('src-tauri/target/release/bundle/macos/Glass Keep.app');
const binary=path.join(app,'Contents/MacOS/glass-keep');
const plist=path.join(app,'Contents/Info.plist');
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8'}).trim();
run('codesign',['--verify','--deep','--strict',app]);
assert.equal(run('lipo',['-archs',binary]),architecture==='x64'?'x86_64':'arm64');
assert.equal(run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',plist]),JSON.parse(readFileSync('src-tauri/tauri.conf.json')).version);
assert.equal(run('/usr/libexec/PlistBuddy',['-c','Print :LSMinimumSystemVersion',plist]),'13.0');
const directory='src-tauri/target/release/bundle/dmg';
const images=readdirSync(directory).filter(name=>name.endsWith('.dmg'));assert.equal(images.length,1);
run('hdiutil',['verify',path.join(directory,images[0])]);
// A fresh hosted Mac has no production session. Check that the packaged app stays
// alive through native initialization; interactive feature testing is separate.
const child=spawn(binary,[],{stdio:['ignore','pipe','pipe']});let output='';let launchError;
child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',error=>launchError=error);
try{
  await new Promise(resolve=>setTimeout(resolve,8000));
  assert.ifError(launchError);assert.equal(child.exitCode,null,'Packaged app exited during startup: '+output);assert.equal(child.signalCode,null);
}finally{
  if(child.exitCode===null && !launchError){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}
}
console.log(`macOS ${architecture}: architecture, version, local signature, DMG integrity and packaged app startup passed`);
