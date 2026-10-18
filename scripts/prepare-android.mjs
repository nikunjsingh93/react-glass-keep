import fs from 'node:fs';
import path from 'node:path';
const root = 'src-tauri/gen/android';
const keystore = process.env.ANDROID_KEYSTORE_BASE64;
if (!keystore) { console.log('No release signing identity configured; building an unsigned APK.'); process.exit(0); }
fs.writeFileSync(path.join(root,'glass-keep-release.jks'), Buffer.from(keystore,'base64'), {mode:0o600});
const file = path.join(root,'app/build.gradle.kts');
let gradle = fs.readFileSync(file,'utf8');
if (!gradle.includes('create("glassKeepRelease")')) {
  const marker = /([ \t]*)buildTypes\s*\{/;
  if (!marker.test(gradle)) throw new Error('Android build template changed: buildTypes was not found.');
  gradle = gradle.replace(marker, `$1signingConfigs {
        create("glassKeepRelease") {
            storeFile = rootProject.file("glass-keep-release.jks")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = "glass-keep"
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
$1buildTypes {`);
  const release = /getByName\("release"\)\s*\{/;
  if (!release.test(gradle)) throw new Error('Android build template changed: release configuration was not found.');
  gradle = gradle.replace(release, '$&\n            signingConfig = signingConfigs.getByName("glassKeepRelease")');
  fs.writeFileSync(file,gradle);
}
