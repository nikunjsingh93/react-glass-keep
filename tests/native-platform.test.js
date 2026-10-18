import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeServer,storageKey} from '../src/platform.js';
test('native server setup accepts origins and rejects embedded credentials and URL components',()=>{
  assert.equal(normalizeServer(' https://keep.example.com/ '),'https://keep.example.com');
  assert.equal(normalizeServer('http://192.168.1.20:8080'),'http://192.168.1.20:8080');
  for(const input of ['file:///etc/passwd','javascript:alert(1)','https://user:secret@keep.example.com','https://keep.example.com/path','https://keep.example.com/?token=secret','https://keep.example.com/#notes'])assert.throws(()=>normalizeServer(input));
  assert.equal(storageKey('glass-keep-auth'),'glass-keep-auth');
});
