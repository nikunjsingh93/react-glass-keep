import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('French covers the existing locale keys and preserves every substitution placeholder',()=>{
  const french=JSON.parse(readFileSync(new URL('../src/locales/fr.json',import.meta.url)));
  const hindi=JSON.parse(readFileSync(new URL('../src/locales/hi.json',import.meta.url)));
  for(const key of Object.keys(hindi))assert.ok(typeof french[key]==='string'&&french[key].trim(),`French translation missing: ${key}`);
  const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const [key,value] of Object.entries(french))assert.deepEqual(placeholders(value),placeholders(key),`French placeholders changed: ${key}`);
});
