#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ID = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;
const PART = /^[a-z0-9][a-z0-9-]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const COLORS = ['bg', 'panel', 'panel2', 'panel3', 'text', 'muted', 'faint', 'line', 'lineStrong', 'accent', 'error', 'ok'];
const MAX_MANIFEST_BYTES = 100000;
const MAX_ENTRIES = 500;
const MANIFEST_FILE = 'noeraven-extension.json';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_FILE = path.resolve(HERE, '../registry.json');

function fail(message){ throw new Error(message); }
function object(value){ return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed, label){
  if(!object(value)) fail(label + ' must be an object.');
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if(unknown) fail(label + ' has an unsupported field: ' + unknown + '.');
}
function nonempty(value, max){ return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }

export function parseRepository(input){
  if(typeof input !== 'string') fail('Repository must be a URL string.');
  let url;
  try{ url = new URL(input); }
  catch{ fail('Repository must be a valid URL.'); }
  const parts = url.pathname.split('/').filter(Boolean);
  if(url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password ||
    url.search || url.hash || parts.length !== 2 || url.pathname !== '/' + parts.join('/') ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(parts[0]) || !/^[A-Za-z0-9._-]+$/.test(parts[1]) || parts[1].endsWith('.git')){
    fail('Repository must be a canonical public URL: https://github.com/OWNER/REPOSITORY');
  }
  return {
    url: 'https://github.com/' + parts[0] + '/' + parts[1],
    apiUrl: 'https://api.github.com/repos/' + parts[0] + '/' + parts[1] + '/contents/' + MANIFEST_FILE,
  };
}

export function validateRegistry(value){
  fields(value, ['registryVersion', 'extensions'], 'Registry');
  if(value.registryVersion !== 1) fail('registryVersion must be 1.');
  if(!Array.isArray(value.extensions) || value.extensions.length > MAX_ENTRIES){
    fail('extensions must be an array of at most ' + MAX_ENTRIES + ' entries.');
  }
  const ids = new Set(), repositories = new Set();
  value.extensions.forEach((entry, index) => {
    const label = 'extensions[' + index + ']';
    fields(entry, ['id', 'repository'], label);
    if(!nonempty(entry.id, 100) || !ID.test(entry.id)) fail(label + '.id must use publisher.extension format.');
    const repository = parseRepository(entry.repository);
    const key = repository.url.toLowerCase();
    if(ids.has(entry.id)) fail('Duplicate extension ID: ' + entry.id);
    if(repositories.has(key)) fail('Duplicate repository: ' + entry.repository);
    ids.add(entry.id); repositories.add(key);
  });
  return value.extensions;
}

/* Keep these API v1 checks aligned with the harness validator. The harness
   remains authoritative when a user installs an extension. */
export function validateManifest(manifest){
  fields(manifest, ['apiVersion', 'id', 'name', 'version', 'description', 'contributes'], 'Manifest');
  if(manifest.apiVersion !== 1) fail('Unsupported extension apiVersion.');
  if(!nonempty(manifest.id, 100) || !ID.test(manifest.id)) fail('Manifest ID is invalid.');
  if(!nonempty(manifest.name, 80) || !nonempty(manifest.description, 500) ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version)) fail('Manifest name, description, or version is invalid.');
  fields(manifest.contributes, ['commands', 'themes'], 'contributes');
  const { commands, themes } = manifest.contributes;
  if(commands !== undefined && (!Array.isArray(commands) || commands.length > 30)) fail('commands must have at most 30 items.');
  if(themes !== undefined && (!Array.isArray(themes) || themes.length > 30)) fail('themes must have at most 30 items.');
  if((!commands || !commands.length) && (!themes || !themes.length)) fail('Manifest needs a command or theme.');
  const commandIds = new Set();
  (commands || []).forEach(command => {
    fields(command, ['id', 'title', 'prompt'], 'Command');
    if(!nonempty(command.id, 80) || !PART.test(command.id) || commandIds.has(command.id)) fail('Command ID is invalid or duplicated.');
    if(!nonempty(command.title, 100) || !nonempty(command.prompt, 10000)) fail('Command title or prompt is invalid.');
    commandIds.add(command.id);
  });
  const themeIds = new Set();
  (themes || []).forEach(theme => {
    fields(theme, ['id', 'title', 'category', 'colors'], 'Theme');
    if(!nonempty(theme.id, 80) || !PART.test(theme.id) || themeIds.has(theme.id)) fail('Theme ID is invalid or duplicated.');
    if(!nonempty(theme.title, 100) || !['light', 'dark'].includes(theme.category)) fail('Theme title or category is invalid.');
    fields(theme.colors, COLORS, 'Theme colors');
    if(COLORS.some(key => !HEX.test(theme.colors[key] || ''))) fail('Theme must define all 12 six-digit hex colors.');
    themeIds.add(theme.id);
  });
  if(new TextEncoder().encode(JSON.stringify(manifest)).byteLength > MAX_MANIFEST_BYTES) fail('Manifest exceeds 100 KB.');
  return manifest;
}

async function readLimited(response){
  if(!response.ok) fail('GitHub returned HTTP ' + response.status + '.');
  const final = new URL(response.url);
  if(final.protocol !== 'https:' || !['api.github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com'].includes(final.hostname)){
    fail('Manifest redirected outside GitHub.');
  }
  const length = Number(response.headers?.get('content-length'));
  if(length > MAX_MANIFEST_BYTES) fail('Manifest exceeds 100 KB.');
  if(!response.body?.getReader){
    const body = await response.text();
    if(new TextEncoder().encode(body).byteLength > MAX_MANIFEST_BYTES) fail('Manifest exceeds 100 KB.');
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try{
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      size += value.byteLength;
      if(size > MAX_MANIFEST_BYTES) fail('Manifest exceeds 100 KB.');
      chunks.push(value);
    }
  }finally{ reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for(const chunk of chunks){ bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function checkEntry(entry, fetchImpl = fetch){
  const { apiUrl } = parseRepository(entry.repository);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try{
    const headers = { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'harness-registry-validator' };
    if(process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
    const response = await fetchImpl(apiUrl, { headers, signal: controller.signal, redirect: 'follow' });
    const manifest = validateManifest(JSON.parse(await readLimited(response)));
    if(manifest.id !== entry.id) fail('Registry ID ' + entry.id + ' does not match manifest ID ' + manifest.id + '.');
    return manifest;
  }finally{ clearTimeout(timeout); controller.abort(); }
}

export async function checkRemote(entries, fetchImpl = fetch){
  let next = 0;
  const errors = [];
  const workers = Array.from({ length: Math.min(4, entries.length) }, async () => {
    while(next < entries.length){
      const entry = entries[next++];
      try{ await checkEntry(entry, fetchImpl); }
      catch(error){ errors.push(entry.id + ': ' + error.message); }
    }
  });
  await Promise.all(workers);
  if(errors.length) fail(errors.join('\n'));
  return entries.length;
}

async function main(){
  const args = process.argv.slice(2);
  if(args.some(arg => arg !== '--offline')) fail('Usage: node scripts/validate.mjs [--offline]');
  const registry = JSON.parse(await readFile(REGISTRY_FILE, 'utf8'));
  const entries = validateRegistry(registry);
  if(!args.includes('--offline')) await checkRemote(entries);
  console.log('Registry valid: ' + entries.length + ' extension' + (entries.length === 1 ? '' : 's') +
    (args.includes('--offline') ? ' (local checks only).' : ' (manifests checked).'));
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  main().catch(error => { console.error('Registry validation failed: ' + error.message); process.exitCode = 1; });
}
