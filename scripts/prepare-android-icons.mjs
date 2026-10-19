import fs from 'node:fs';
import path from 'node:path';

const source=path.resolve('src-tauri/icons/android');
const android=path.resolve('src-tauri/gen/android/app/src/main');
const manifestFile=path.join(android,'AndroidManifest.xml');
if(!fs.existsSync(manifestFile))throw new Error('Initialize Android first: npm run tauri -- android init --ci');
// Android init creates a fresh project with Tauri's default launcher artwork.
// Install our checked-in resources every time the Android client is built.
for(const name of ['mipmap-mdpi/ic_launcher.png','mipmap-xxxhdpi/ic_launcher.png','mipmap-anydpi-v26/ic_launcher.xml','mipmap-anydpi-v26/ic_launcher_round.xml']){
  if(!fs.existsSync(path.join(source,name)))throw new Error('Missing Glass Keep launcher asset: '+name);
}
fs.cpSync(source,path.join(android,'res'),{recursive:true});
let manifest=fs.readFileSync(manifestFile,'utf8');
if(!/<application\b/.test(manifest))throw new Error('Android application manifest was not found');
if(/android:icon="[^"]*"/.test(manifest))manifest=manifest.replace(/android:icon="[^"]*"/,'android:icon="@mipmap/ic_launcher"');
else manifest=manifest.replace('<application','<application android:icon="@mipmap/ic_launcher"');
if(/android:roundIcon="[^"]*"/.test(manifest))manifest=manifest.replace(/android:roundIcon="[^"]*"/,'android:roundIcon="@mipmap/ic_launcher_round"');
else manifest=manifest.replace('<application','<application android:roundIcon="@mipmap/ic_launcher_round"');
fs.writeFileSync(manifestFile,manifest);
console.log('Installed Glass Keep standard, round and adaptive Android launcher icons.');
