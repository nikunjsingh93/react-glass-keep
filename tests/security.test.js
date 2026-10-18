import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createNoteWriter } from '../src/noteWriter.js';
import { importNoteBatches } from '../src/importBackup.js';

test('Markdown preserves formatting while stripping executable HTML and links', async () => {
  const dom = new JSDOM('<!doctype html>');
  globalThis.window = dom.window;
  const { renderMarkdown } = await import('../src/markdown.js');
  const html = renderMarkdown('# Hello\n**bold**\n<img src=x onerror="alert(1)"><svg onload="alert(2)"></svg><script>alert(3)</script><a href="javascript:alert(4)">link</a><iframe srcdoc="bad"></iframe>');
  assert.match(html, /<h1>Hello<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.doesNotMatch(html, /onerror|onload|javascript:|<script|<iframe|<svg/i);
  dom.window.close();
});

test('legacy API caches are removed without deleting static asset caches', async () => {
  const names=[];
  globalThis.caches = { delete: async name => { names.push(name); return true; } };
  const { clearLegacyApiCaches } = await import('../src/privateCache.js');
  await clearLegacyApiCaches();
  assert.deepEqual(names.sort(), ['api-cache','notes-cache']);
  delete globalThis.caches;
});

test('queued edits advance only their own revisions; stale remote writes are not retried', async () => {
  let current=1;
  const requests=[];
  const write=createNoteWriter(async (id, body) => {
    requests.push({ id, ...body });
    if (body.revision !== current) throw Object.assign(new Error('Conflict'), {status:409});
    await new Promise(resolve => setTimeout(resolve, 5));
    return { id, ...body, revision: ++current };
  });
  const [first, second]=await Promise.all([write('a',{title:'one'},1),write('a',{title:'two'},1)]);
  assert.equal(first.revision,2); assert.equal(second.revision,3);
  current=4; // Another device wrote a new revision.
  await assert.rejects(write('a',{title:'stale'},3), /Conflict/);
  assert.equal(requests.length,3);
  assert.equal(requests[2].revision,3);
});

test('large backup imports split by UTF-8 size and report partial failures', async () => {
  const notes=Array.from({length:5},(_,id)=>({id,title:'é'.repeat(30),archived:true}));
  const sent=[];
  assert.equal(await importNoteBatches(notes,async body=>sent.push(body),220),5);
  assert.ok(sent.length>1);
  assert.deepEqual(sent.flatMap(body=>body.notes),notes);
  assert.ok(sent.every(body=>new TextEncoder().encode(JSON.stringify(body)).byteLength<=220));
  let count=0;
  await assert.rejects(importNoteBatches(notes,async()=>{if(++count===2)throw new Error('Offline');},220),/after 2 notes.*Offline/);
});
