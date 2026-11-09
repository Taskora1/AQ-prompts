import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = (process.argv[2] || 'http://127.0.0.1:3010').replace(/\/$/, '');
const chromePath =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debuggingPort = 9341;
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'aqprompts-phase3-test-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
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
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await getJson(`http://127.0.0.1:${debuggingPort}/json/version`);
    } catch {
      await delay(200);
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
    close() {
      socket.close();
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

const routes = [
  {
    path: '/about',
    expectedSchema: ['AboutPage'],
    expectedText: 'About AQPrompts',
  },
  {
    path: '/contact',
    expectedSchema: ['ContactPage'],
    expectedText: 'Contact',
  },
  {
    path: '/author/abdul-qudoos',
    expectedSchema: ['ProfilePage', 'Person'],
    expectedText: 'Abdul Qudoos',
  },
  {
    path: '/editorial-policy',
    expectedSchema: ['WebPage'],
    expectedText: 'Editorial Policy',
  },
  {
    path: '/how-we-review-prompts',
    expectedSchema: ['WebPage'],
    expectedText: 'How We Review Prompts',
  },
  {
    path: '/blog/luxury-mens-fashion-ai-portrait-prompts',
    expectedSchema: ['BlogPosting'],
    expectedText: 'Common failure cases and troubleshooting',
    expectedAuthorLink: true,
  },
  {
    path: '/tools/ai-image-prompts/p/golden-hour-urban-portrait-boy-in-monochromatic-chocolate-brown',
    expectedSchema: ['CreativeWork'],
    expectedText: 'What to customize',
    expectedNoIndex: true,
  },
  {
    path: '/tools/ai-image-prompts/p/dark-anime-vector-portrait-with-red-neon-rim-light-prompt',
    expectedSchema: ['CreativeWork'],
    expectedText: 'Common output problems',
    expectedNoIndex: false,
  },
];

try {
  await waitForDebugger();
  const target = await getJson(
    `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(`${origin}/`)}`,
    { method: 'PUT' },
  );
  const cdp = createCdpClient(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
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

  async function waitForReady(expectedPath, expectedText) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(
        `location.pathname === ${JSON.stringify(expectedPath)} && document.readyState === 'complete' && Boolean(document.querySelector('h1')) && document.body.innerText.includes(${JSON.stringify(expectedText)})`,
      )) return;
      await delay(200);
    }
    throw new Error('Timed out waiting for route content.');
  }

  for (const route of routes) {
    await cdp.send('Page.navigate', { url: `${origin}${route.path}` });
    await waitForReady(route.path, route.expectedText);
    const result = await evaluate(`(() => {
      const schemas = [];
      const schemaErrors = [];
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const value = JSON.parse(script.textContent);
          const values = Array.isArray(value) ? value : [value];
          for (const item of values) {
            if (item && Array.isArray(item['@graph'])) schemas.push(...item['@graph']);
            else if (item) schemas.push(item);
          }
        } catch (error) {
          schemaErrors.push(error.message);
        }
      }
      const schemaTypes = new Set();
      const visitSchema = (value) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
          value.forEach(visitSchema);
          return;
        }
        const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
        types.filter(Boolean).forEach((type) => schemaTypes.add(type));
        Object.values(value).forEach(visitSchema);
      };
      visitSchema(schemas);
      return {
        title: document.title,
        h1Count: document.querySelectorAll('h1').length,
        hasText: document.body.innerText.includes(${JSON.stringify(route.expectedText)}),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        missingImageAltCount: [...document.images].filter((image) => !image.hasAttribute('alt')).length,
        schemaErrors,
        schemaTypes: [...schemaTypes],
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        robots: document.querySelector('meta[name="robots"]')?.content || '',
        authorLink: Boolean(document.querySelector('a[href="/author/abdul-qudoos"]')),
      };
    })()`);

    assert(result.title.length > 0, `${route.path} has a document title`);
    assert(result.h1Count === 1, `${route.path} has exactly one H1`);
    assert(result.hasText, `${route.path} renders its expected substantive content`);
    assert(result.overflow <= 1, `${route.path} has no 390px horizontal overflow`);
    assert(result.missingImageAltCount === 0, `${route.path} has no rendered image missing alt text`);
    assert(result.schemaErrors.length === 0, `${route.path} has parseable JSON-LD`);
    for (const type of route.expectedSchema) {
      assert(result.schemaTypes.includes(type), `${route.path} includes ${type} structured data`);
    }
    assert(Boolean(result.canonical), `${route.path} has a canonical URL`);
    if (route.expectedAuthorLink) {
      assert(result.authorLink, `${route.path} links its visible byline to Abdul Qudoos`);
    }
    if (route.expectedNoIndex === true) {
      assert(result.robots.toLowerCase().includes('noindex'), `${route.path} is noindex`);
      assert(!result.robots.toLowerCase().includes('nofollow'), `${route.path} remains follow`);
    }
    if (route.expectedNoIndex === false) {
      assert(!result.robots.toLowerCase().includes('noindex'), `${route.path} remains indexable`);
    }
  }

  cdp.close();
} finally {
  chrome.kill();
  await delay(1_000);
  try {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
  } catch (error) {
    console.warn(`WARNING: unable to remove temporary Chrome profile: ${error.message}`);
  }
}
