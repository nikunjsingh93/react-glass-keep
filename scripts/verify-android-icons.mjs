import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';

const [apk,aapt2]=process.argv.slice(2);
assert.ok(apk&&aapt2,'Provide the built APK and Android SDK aapt2 executable.');
const dump=(...args)=>execFileSync(aapt2,['dump',...args],{encoding:'utf8',maxBuffer:10*1024*1024});
const resources=dump('resources',apk),entries=unzipSync(fs.readFileSync(apk));
const markers=[...resources.matchAll(/^\s*resource (0x[\da-f]+) (\S+)/gm)];
const table=new Map(markers.map((match,index)=>[match[2],{id:match[1],text:resources.slice(match.index,markers[index+1]?.index)}]));
const required=name=>{const entry=table.get(name);assert.ok(entry,'Missing packaged launcher resource: '+name);return entry;};
const manifest=dump('xmltree',apk,'--file','AndroidManifest.xml');
const foreground=required('mipmap/ic_launcher_foreground'),background=required('color/ic_launcher_background');
for(const name of ['ic_launcher','ic_launcher_round','ic_launcher_foreground']){
  const resource=required('mipmap/'+name);
  const files=[...resource.text.matchAll(/\(([^)]+)\) \(file\) (\S+) type=(PNG|XML)/g)];
  for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']){
    const file=files.find(match=>match[1].split('-')[0]===density&&match[3]==='PNG');assert.ok(file,`Missing ${density} ${name}`);
    const built=entries[file[2]],source=fs.readFileSync(path.join('src-tauri/icons/android','mipmap-'+density,name+'.png'));
    assert.ok(built,'APK image missing: '+file[2]);
    assert.deepEqual([...built.slice(0,8)],[...source.subarray(0,8)],'Invalid packaged PNG');
    // Android may recompress PNGs; their dimensions must still match our artwork.
    assert.deepEqual([...built.slice(16,24)],[...source.subarray(16,24)],'Packaged icon dimensions differ from Glass Keep artwork');
  }
  if(name==='ic_launcher_foreground')continue;
  const attribute=name==='ic_launcher'?'icon':'roundIcon';
  assert.ok(manifest.includes(`android:${attribute}(`)&&manifest.includes('@'+resource.id),'Manifest does not select '+name);
  const adaptive=files.find(match=>match[1].includes('v26')&&match[3]==='XML');assert.ok(adaptive,'Missing adaptive '+name);
  const xml=dump('xmltree',apk,'--file',adaptive[2]);assert.ok(xml.includes('adaptive-icon'));
  assert.ok(xml.includes('@'+foreground.id)&&xml.includes('@'+background.id),'Adaptive icon does not use the branded foreground and background');
}
console.log('Packaged Glass Keep standard, round and adaptive launcher resources verified across all five densities.');
