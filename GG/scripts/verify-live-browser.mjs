import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const origin = (process.argv[2] || 'https://www.aqprompts.com').replace(/\/$/, '');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9351;
const profile = await mkdtemp(path.join(tmpdir(), 'aqprompts-live-browser-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}
for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    await json(`http://127.0.0.1:${port}/json/version`);
    break;
  } catch {
    if (attempt === 49) throw new Error('Chrome did not start');
    await delay(200);
  }
}
const target = await json(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${origin}/`)}`,
  { method: 'PUT' },
);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
let errors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.text || 'runtime exception');
  if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') errors.push(message.params.entry.text);
});
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

const results = [];
async function inspect(route, width, height) {
  errors = [];
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 600,
  });
  await send('Page.navigate', { url: `${origin}${route}` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(route)}`)) break;
    if (attempt === 79) throw new Error(`Timed out loading ${route}`);
    await delay(200);
  }
  await delay(500);
  const data = await evaluate(`({
    statusText: document.body.innerText.slice(0, 5000),
    h1: document.querySelectorAll('h1').length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    missingAlt: [...document.images].filter((image) => !image.hasAttribute('alt')).length,
    canonical: document.querySelector('link[rel="canonical"]')?.href || '',
    title: document.title
  })`);
  results.push({
    route,
    viewport: `${width}x${height}`,
    passed: data.h1 === 1 && data.overflow <= 1 && data.missingAlt === 0 && errors.length === 0,
    h1: data.h1,
    overflow: data.overflow,
    missingAlt: data.missingAlt,
    runtimeErrors: errors.length,
    canonical: data.canonical,
    phase4Marker: data.statusText.includes('AI-generated example image for demonstration purposes.')
      || data.statusText.includes('Generation evidence not yet published'),
    oldMarker: data.statusText.includes('What Creators Say') || data.statusText.includes('tests every prompt'),
  });
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  for (const viewport of [[390, 844], [1440, 1000]]) {
    await inspect('/', ...viewport);
    await inspect('/blog/luxury-mens-fashion-ai-portrait-prompts', ...viewport);
    await inspect('/tools/ai-image-prompts', ...viewport);
  }
} finally {
  socket.close();
  chrome.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
}

const stale = results.some((result) => !result.phase4Marker || result.oldMarker);
const failed = results.filter((result) => !result.passed);
const lines = [
  '# Live Browser Verification',
  '',
  `Checked: ${new Date().toISOString()}`,
  `Origin: ${origin}`,
  '',
  stale
    ? '**STALE DEPLOYMENT DETECTED:** layout checks may pass, but the current verified disclosure/content release is not live.'
    : failed.length ? '**BROWSER FIXES REQUIRED.**' : '**LIVE BROWSER CHECKS PASSED.**',
  '',
  '| Route | Viewport | Layout/runtime | H1 | Overflow px | Missing alt | Runtime errors | Current marker | Old marker | Canonical |',
  '|---|---|---|---:|---:|---:|---:|---|---|---|',
  ...results.map((result) =>
    `| \`${result.route}\` | ${result.viewport} | ${result.passed ? 'PASS' : 'FAIL'} | ${result.h1} | ${result.overflow} | ${result.missingAlt} | ${result.runtimeErrors} | ${result.phase4Marker ? 'yes' : 'no'} | ${result.oldMarker ? 'yes' : 'no'} | ${result.canonical || 'missing'} |`
  ),
];
fs.writeFileSync(path.join(process.cwd(), 'docs', 'LIVE_BROWSER_VERIFICATION.md'), `${lines.join('\n')}\n`);
console.log(`[live-browser] ${results.length - failed.length}/${results.length} layout/runtime pass; stale=${stale}`);
process.exit(stale || failed.length ? 1 : 0);
