import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  AI_EDITED_DISCLOSURE,
  AI_GENERATED_DISCLOSURE,
  VERIFIED_MEDIA_PLACEHOLDER,
  classifyPublicMedia,
} from '../src/lib/media-safety.js';

const origin = (process.argv[2] || 'http://127.0.0.1:3010').replace(/\/$/, '');
const promptsPayload = JSON.parse(fs.readFileSync('public/data/prompts-index.json', 'utf8'));
const prompts = Array.isArray(promptsPayload) ? promptsPayload : promptsPayload.prompts || [];
const contextFor = (prompt) => [
  prompt.title, prompt.prompt, prompt.intro, ...(prompt.tags || []),
].filter(Boolean).join(' ');
const editedPrompt = prompts.find((prompt) =>
  prompt.image !== VERIFIED_MEDIA_PLACEHOLDER
  && classifyPublicMedia(prompt.image, contextFor(prompt)) === 'ai_edited'
);
const generatedPrompt = prompts.find((prompt) =>
  prompt.image !== VERIFIED_MEDIA_PLACEHOLDER
  && classifyPublicMedia(prompt.image, contextFor(prompt)) === 'ai_generated'
);
const withheldPrompt = prompts.find((prompt) => prompt.image === VERIFIED_MEDIA_PLACEHOLDER);
if (!editedPrompt || !generatedPrompt || !withheldPrompt) {
  throw new Error('Could not select generated, edited, and withheld prompt fixtures.');
}

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debuggingPort = 9347;
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'aqprompts-phase4-test-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profileDirectory}`,
  'about:blank',
], { stdio: 'ignore' });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}
for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    await getJson(`http://127.0.0.1:${debuggingPort}/json/version`);
    break;
  } catch {
    if (attempt === 49) throw new Error('Chrome DevTools did not become ready.');
    await delay(200);
  }
}

const target = await getJson(
  `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(`${origin}/`)}`,
  { method: 'PUT' },
);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
let runtimeErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params?.exceptionDetails?.text || 'runtime exception');
  }
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
    runtimeErrors.push(message.params.entry.text);
  }
});
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function visit(route) {
  runtimeErrors = [];
  await send('Page.navigate', { url: `${origin}${route}` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(route)} && Boolean(document.querySelector('h1'))`)) break;
    if (attempt === 79) throw new Error(`Timed out loading ${route}`);
    await delay(200);
  }
  await delay(500);
  const basics = await evaluate(`({
    h1: document.querySelectorAll('h1').length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    missingAlt: [...document.images].filter((image) => !image.hasAttribute('alt')).length
  })`);
  assert(basics.h1 === 1, `${route} has one H1`);
  assert(basics.overflow <= 1, `${route} has no 390px overflow`);
  assert(basics.missingAlt === 0, `${route} has no image missing alt`);
  assert(runtimeErrors.length === 0, `${route} has no console/log or runtime exceptions`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });

  await visit(`/tools/ai-image-prompts/p/${generatedPrompt.slug}`);
  assert(
    await evaluate(`document.body.innerText.includes(${JSON.stringify(AI_GENERATED_DISCLOSURE)})`),
    'generated prompt displays the exact AI-generated disclosure',
  );

  await visit(`/tools/ai-image-prompts/p/${editedPrompt.slug}`);
  assert(
    await evaluate(`document.body.innerText.includes(${JSON.stringify(AI_EDITED_DISCLOSURE)})`),
    'edited prompt displays the exact AI-edited disclosure',
  );

  await visit(`/tools/ai-image-prompts/p/${withheldPrompt.slug}`);
  assert(
    await evaluate(`[...document.images].some((image) => image.src.includes(${JSON.stringify(VERIFIED_MEDIA_PLACEHOLDER)}))`),
    'specific high-risk prompt renders the neutral placeholder',
  );

  await visit('/blog/luxury-mens-fashion-ai-portrait-prompts');
  assert(
    await evaluate(`document.body.innerText.includes(${JSON.stringify(AI_GENERATED_DISCLOSURE)}) || document.body.innerText.includes(${JSON.stringify(AI_EDITED_DISCLOSURE)})`),
    'article example images display an AI demonstration disclosure',
  );

  await visit('/author/abdul-qudoos');
  assert(
    await evaluate(`[...document.images].some((image) => decodeURIComponent(image.src).includes('/images/founder-aqprompts.webp'))`),
    'founder image remains a real founder photograph rather than an AI placeholder',
  );

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await visit('/');
  assert(
    await evaluate(`document.body.innerText.includes(${JSON.stringify(AI_GENERATED_DISCLOSURE)}) || document.body.innerText.includes(${JSON.stringify(AI_EDITED_DISCLOSURE)})`),
    'desktop homepage prompt cards display AI media disclosures',
  );
  await visit('/blog/luxury-mens-fashion-ai-portrait-prompts');
  assert(
    await evaluate(`document.querySelector('link[rel="canonical"]')?.href.includes('/blog/luxury-mens-fashion-ai-portrait-prompts')`),
    'desktop article retains its canonical URL',
  );
} finally {
  socket.close();
  chrome.kill();
  await delay(500);
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
}
