import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const siteUrl = process.argv[2] || 'http://127.0.0.1:3010/';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debuggingPort = 9338;
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'aqprompts-google-cmp-test-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
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

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
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
    close: () => socket.close(),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

const googleCmpMock = `
(() => {
  const GRANTED = 1;
  const DENIED = 2;
  let listener;
  let listenerId = 7;
  let values = {
    adStoragePurposeConsentStatus: DENIED,
    adUserDataPurposeConsentStatus: DENIED,
    adPersonalizationPurposeConsentStatus: DENIED,
    analyticsStoragePurposeConsentStatus: DENIED
  };
  const callbackQueue = [];
  callbackQueue.push = (...items) => {
    const length = Array.prototype.push.apply(callbackQueue, items);
    queueMicrotask(() => items.forEach((item) => {
      item.CONSENT_API_READY?.();
      item.CONSENT_MODE_DATA_READY?.();
    }));
    return length;
  };
  window.googlefc = {
    callbackQueue,
    ConsentModePurposeStatusEnum: {
      CONSENT_MODE_PURPOSE_STATUS_GRANTED: GRANTED,
      CONSENT_MODE_PURPOSE_STATUS_DENIED: DENIED
    },
    getGoogleConsentModeValues: () => ({ ...values }),
    showRevocationMessage: () => { window.__mockRevocationShown = true; }
  };
  window.__tcfapi = (command, version, callback, parameter) => {
    if (command === 'addEventListener') {
      listener = callback;
      queueMicrotask(() => listener({ gdprApplies: true, eventStatus: 'tcloaded', listenerId }, true));
    } else if (command === 'removeEventListener' && parameter === listenerId) {
      listener = undefined;
      callback(true);
    }
  };
  window.__setMockGoogleConsent = ({ analytics, advertising }) => {
    values = {
      adStoragePurposeConsentStatus: advertising ? GRANTED : DENIED,
      adUserDataPurposeConsentStatus: advertising ? GRANTED : DENIED,
      adPersonalizationPurposeConsentStatus: advertising ? GRANTED : DENIED,
      analyticsStoragePurposeConsentStatus: analytics ? GRANTED : DENIED
    };
    callbackQueue.forEach((item) => item.CONSENT_MODE_DATA_READY?.());
    listener?.({ gdprApplies: true, eventStatus: 'useractioncomplete', listenerId }, true);
  };
})();
`;

try {
  await waitForDebugger();
  const target = await getJson(`http://127.0.0.1:${debuggingPort}/json/new?about%3Ablank`, { method: 'PUT' });
  const cdp = createCdpClient(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  // Keep this deterministic: the test provides the CMP APIs without loading
  // third-party ad scripts.
  await cdp.send('Network.setBlockedURLs', {
    urls: ['https://pagead2.googlesyndication.com/*'],
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: googleCmpMock });
  await cdp.send('Page.navigate', { url: siteUrl });

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
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await evaluate(expression)) return;
      await delay(200);
    }
    throw new Error(`Timed out waiting for ${message}.`);
  }

  await waitFor(`document.readyState === 'complete' && window.__aqConsentAuthority === 'google'`, 'Google CMP authority');
  assert(
    await evaluate(`!document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"], meta[name="google-adsense-account"]')`),
    'AdSense integration remains absent pending approval',
  );
  assert(
    await evaluate(`window.dataLayer.some((entry) => entry?.[0] === 'consent' && entry?.[1] === 'default' && entry?.[2]?.analytics_storage === 'denied' && entry?.[2]?.ad_storage === 'denied' && entry?.[2]?.ad_user_data === 'denied' && entry?.[2]?.ad_personalization === 'denied')`),
    'Consent Mode v2 defaults are denied before CMP consent',
  );
  assert(await evaluate(`typeof window.__tcfapi === 'function'`), 'TCF API is callable when Google CMP is active');
  assert(!(await evaluate(`Boolean(document.getElementById('cookie-consent-title'))`)), 'AQPrompts banner is suppressed when TCF applies');
  assert(!(await evaluate(`Boolean(document.getElementById('aqprompts-ga-script'))`)), 'GA4 is blocked while Google analytics consent is denied');
  assert(!(await evaluate(`Boolean(document.getElementById('aqprompts-clarity-script'))`)), 'Clarity is blocked while Google analytics consent is denied');

  await evaluate(`window.__setMockGoogleConsent({ analytics: true, advertising: false })`);
  await waitFor(`Boolean(document.getElementById('aqprompts-ga-script'))`, 'GA4 after granular analytics consent');
  await waitFor(`Boolean(document.getElementById('aqprompts-clarity-script'))`, 'Clarity after granular analytics consent');
  assert(!(await evaluate(`window.__aqGoogleCmpConsent.advertising`)), 'granular advertising denial remains denied');
  await evaluate(`window.__setMockGoogleConsent({ analytics: true, advertising: true })`);
  assert(
    await evaluate(`!document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"], meta[name="google-adsense-account"]')`),
    'AdSense remains absent even when optional advertising consent is granted',
  );

  await evaluate(`window.dispatchEvent(new Event('aqprompts:open-cookie-settings'))`);
  await waitFor(`window.__mockRevocationShown === true`, 'Google CMP revocation UI request');
  assert(!(await evaluate(`Boolean(document.querySelector('[role="dialog"][aria-labelledby="cookie-settings-title"]'))`)), 'Cookie Settings does not open the AQPrompts dialog under Google authority');

  cdp.close();
} finally {
  chrome.kill();
  await delay(250);
  await rm(profileDirectory, { recursive: true, force: true });
}
