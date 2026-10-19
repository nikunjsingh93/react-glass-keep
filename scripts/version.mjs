import fs from 'node:fs';

const files = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];
const sources = files.map(file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const json = sources.slice(0, 3).map(source => JSON.parse(source));
const cargoPackage = /(^version = ")([^"]+)(")/m;
const cargoLock = /(\[\[package\]\]\r?\nname = "glass-keep"\r?\nversion = ")([^"]+)(")/;
if (!cargoPackage.test(sources[3]) || !cargoLock.test(sources[4])) throw new Error('Cannot locate Glass Keep Cargo versions');
const versions = [json[0].version, json[1].version, json[1].packages[''].version, json[2].version, sources[3].match(cargoPackage)[2], sources[4].match(cargoLock)[2]];
const requested = process.argv[2];
if (requested === '--check') {
  if (versions.some(version => version !== versions[0])) throw new Error('Release versions differ: ' + versions.join(', '));
  console.log('Web, server and all native clients: ' + versions[0]);
} else {
  if (!/^\d+\.\d+\.\d+$/.test(requested || '')) throw new Error('Usage: npm run release:version -- X.Y.Z (or --check)');
  json[0].version = json[1].version = json[1].packages[''].version = json[2].version = requested;
  const output = [...json.map(value => JSON.stringify(value, null, 2) + '\n'), sources[3].replace(cargoPackage, (_, prefix, old, suffix) => prefix + requested + suffix), sources[4].replace(cargoLock, (_, prefix, old, suffix) => prefix + requested + suffix)];
  files.forEach((file, index) => fs.writeFileSync(new URL('../' + file, import.meta.url), output[index]));
  console.log('Set all release versions to ' + requested);
}
