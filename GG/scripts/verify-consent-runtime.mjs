import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const siteUrl = process.argv[2] || 'http://127.0.0.1:3010/';
const chromePath =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debuggingPort = 9337;
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'aqprompts-consent-test-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDirectory}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await getJson(`http://127.0.0.1:${debuggingPort}/json/version`);
    } catch {
      await delay(250);
    }
  }
  throw new Error('Chrome DevTools did not become ready.');
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }

    for (const listener of listeners.get(message.method) || []) listener(message.params);
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }),
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(method, listener) {
      const current = listeners.get(method) || [];
      current.push(listener);
      listeners.set(method, current);
    },
    close() {
      socket.close();
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

try {
  await waitForDebugger();
  const target = await getJson(
    `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(siteUrl)}`,
    { method: 'PUT' },
  );
  const cdp = createCdpClient(target.webSocketDebuggerUrl);
  await cdp.ready;

  const requests = [];
  cdp.on('Network.requestWillBeSent', ({ request }) => requests.push(request.url));
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  async function evaluate(expression) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  async function waitFor(expression, message) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await evaluate(expression)) return;
      await delay(200);
    }
    throw new Error(`Timed out waiting for ${message}.`);
  }

  await waitFor(
    `document.readyState === 'complete' && Boolean(document.getElementById('cookie-consent-title'))`,
    'the first-visit consent banner',
  );
  assert(
    !(requests.some((url) => url.includes('googletagmanager.com/gtag/js'))),
    'Google Analytics does not load before consent',
  );
  assert(
    !(requests.some((url) => url.includes('clarity.ms/tag'))),
    'Microsoft Clarity does not load before consent',
  );

  const mobileBanner = await evaluate(`(() => {
    const banner = document.querySelector('[aria-labelledby="cookie-consent-title"]');
    const rect = banner.getBoundingClientRect();
    const buttons = [...banner.querySelectorAll('button')];
    return {
      withinViewport: rect.left >= 0 && rect.right <= window.innerWidth,
      buttonsLargeEnough: buttons.every((button) => button.getBoundingClientRect().height >= 40)
    };
  })()`);
  assert(mobileBanner.withinViewport, 'consent banner fits a 390px mobile viewport');
  assert(mobileBanner.buttonsLargeEnough, 'mobile consent controls have usable touch targets');

  await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Reject optional').click()`);
  const rejected = JSON.parse(
    await evaluate(`localStorage.getItem('aqprompts_cookie_consent_v1')`),
  );
  assert(
    rejected.analytics === false && rejected.advertising === false && rejected.preferences === false,
    'Reject optional persists all optional categories as disabled',
  );

  await waitFor(
    `[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Cookie Settings')`,
    'permanent Cookie Settings control',
  );
  await evaluate(`window.dispatchEvent(new Event('aqprompts:open-cookie-settings'))`);
  await waitFor(`Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))`, 'cookie settings dialog');
  assert(
    await evaluate(`document.activeElement === document.querySelector('[role="dialog"]')`),
    'cookie settings dialog receives focus when opened',
  );
  await evaluate(`document.querySelector('input[aria-label="Analytics cookies"]').click()`);
  await evaluate(`document.querySelector('input[aria-label="Preferences cookies"]').click()`);
  await evaluate(`document.querySelector('[role="dialog"] button').closest('[role="dialog"]'); [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Save preferences').click()`);
  await waitFor(
    `JSON.parse(localStorage.getItem('aqprompts_cookie_consent_v1')).analytics === true`,
    'granular consent persistence',
  );
  await waitFor(
    `Boolean(document.getElementById('aqprompts-ga-script'))`,
    'Google Analytics script insertion after consent',
  );
  await waitFor(
    `Boolean(document.getElementById('aqprompts-clarity-script'))`,
    'Microsoft Clarity script insertion after consent',
  );
  assert(
    await evaluate(`document.getElementById('aqprompts-ga-script').src.includes('googletagmanager.com/gtag/js')`),
    'Google Analytics loads after Analytics consent',
  );
  assert(
    await evaluate(`document.getElementById('aqprompts-clarity-script').src.includes('clarity.ms/tag')`),
    'Microsoft Clarity loads after Analytics consent',
  );

  await cdp.send('Network.clearBrowserCookies');
  await evaluate(`localStorage.clear(); location.reload()`);
  await waitFor(`Boolean(document.getElementById('cookie-consent-title'))`, 'banner after cleared consent');
  await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Accept all').click()`);
  const accepted = JSON.parse(
    await evaluate(`localStorage.getItem('aqprompts_cookie_consent_v1')`),
  );
  assert(
    accepted.analytics === true && accepted.advertising === true && accepted.preferences === true,
    'Accept all persists every optional category as enabled',
  );

  await cdp.send('Network.clearBrowserCookies');
  await evaluate(`localStorage.clear(); location.reload()`);
  await waitFor(`Boolean(document.getElementById('cookie-consent-title'))`, 'banner for keyboard test');
  await evaluate(`document.querySelector('[aria-labelledby="cookie-consent-title"] button:last-child').click()`);
  await waitFor(`Boolean(document.querySelector('[role="dialog"]'))`, 'dialog for keyboard test');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await waitFor(`!document.querySelector('[role="dialog"]')`, 'Escape to close settings');
  assert(true, 'Escape closes the cookie settings dialog');

  cdp.close();
} finally {
  chrome.kill();
  await delay(250);
  await rm(profileDirectory, { recursive: true, force: true });
}
