import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('German, French and Russian cover the existing locale keys and preserve every substitution placeholder',()=>{
  const hindi=JSON.parse(readFileSync(new URL('../src/locales/hi.json',import.meta.url)));
  const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const language of ['de','fr','ru']) {
    const translations=JSON.parse(readFileSync(new URL(`../src/locales/${language}.json`,import.meta.url)));
    assert.deepEqual(Object.keys(translations).sort(),Object.keys(hindi).sort(),`${language} keys differ`);
    for(const [key,value] of Object.entries(translations)) {
      assert.ok(typeof value==='string'&&value.trim(),`${language} translation missing: ${key}`);
      assert.deepEqual(placeholders(value),placeholders(key),`${language} placeholders changed: ${key}`);
    }
  }
});
