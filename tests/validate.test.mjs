import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepository, validateRegistry, validateManifest, checkEntry, checkRemote } from '../scripts/validate.mjs';

const listing = { id: 'example.writing-tools', repository: 'https://github.com/example/writing-tools' };
const manifest = {
  apiVersion: 1, id: listing.id, name: 'Writing Tools', version: '1.0.0',
  description: 'Editable writing prompts.',
  contributes: { commands: [{ id: 'revise', title: 'Revise', prompt: 'Revise this text.\n\n' }] },
};
const endpoint = 'https://api.github.com/repos/example/writing-tools/contents/noeraven-extension.json';
function response(value, url = endpoint, status = 200){
  return { ok: status >= 200 && status < 300, status, url, headers: { get(){ return null; } },
    body: null, async text(){ return JSON.stringify(value); } };
}

test('registry contains only stable IDs and canonical repository URLs', () => {
  assert.equal(parseRepository(listing.repository).apiUrl, endpoint);
  assert.deepEqual(validateRegistry({ registryVersion: 1, extensions: [listing] }), [listing]);
  for(const url of ['http://github.com/example/writing-tools', 'https://github.com.evil.test/example/writing-tools',
    'https://github.com/example/writing-tools.git', 'https://github.com/example/writing-tools?ref=main']){
    assert.throws(() => parseRepository(url));
  }
  assert.throws(() => validateRegistry({ registryVersion: 1, extensions: [listing, listing] }), /Duplicate extension ID/);
  assert.throws(() => validateRegistry({ registryVersion: 1, extensions: [listing,
    { id: 'example.other', repository: 'https://github.com/EXAMPLE/WRITING-TOOLS' }] }), /Duplicate repository/);
  assert.throws(() => validateRegistry({ registryVersion: 1, extensions: [{ ...listing, version: '1.0.0' }] }), /unsupported field/);
});

test('manifest checks follow the data-only extension contract', () => {
  assert.equal(validateManifest(manifest).id, listing.id);
  for(const mutate of [
    value => { value.apiVersion = 2; },
    value => { value.main = 'index.js'; },
    value => { value.contributes.commands[0].script = 'alert(1)'; },
    value => { value.contributes.commands[0].prompt = ''; },
    value => { value.contributes.commands.push(value.contributes.commands[0]); },
  ]){
    const value = structuredClone(manifest); mutate(value);
    assert.throws(() => validateManifest(value));
  }
});

test('remote check validates the declared identity and bounded response', async () => {
  const valid = await checkEntry(listing, async (url, options) => {
    assert.equal(url, endpoint);
    assert.equal(options.headers.Accept, 'application/vnd.github.raw+json');
    return response(manifest);
  });
  assert.equal(valid.version, '1.0.0');
  assert.equal(await checkRemote([listing], async () => response(manifest)), 1);
  await assert.rejects(() => checkEntry(listing, async () => response({ ...manifest, id: 'example.other' })), /does not match/);
  await assert.rejects(() => checkEntry(listing, async () => response(manifest, 'https://evil.test/file')), /outside GitHub/);
  await assert.rejects(() => checkEntry(listing, async () => response(manifest, endpoint, 404)), /HTTP 404/);
  await assert.rejects(() => checkEntry(listing, async () => ({
    ok: true, url: endpoint, headers: { get(){ return null; } },
    body: { getReader(){ return { async read(){ return { done: false, value: new Uint8Array(100001) }; }, releaseLock(){} }; } },
  })), /100 KB/);
});
