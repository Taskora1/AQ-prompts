import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const canonicalOrigin = 'https://www.aqprompts.com';
const inputOrigin = (process.argv[2] || 'https://aqprompts.com').replace(/\/$/, '');
const outputPath = path.join(process.cwd(), 'docs', 'LIVE_PRODUCTION_VERIFICATION.md');
const checkedAt = new Date().toISOString();
const checks = [];

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      redirect: options.redirect || 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'AQPrompts-production-readiness/1.0',
        'accept-encoding': 'gzip, br',
      },
    });
    return { response, body: options.body === false ? '' : await response.text() };
  } catch (error) {
    return { error: error?.message || String(error), response: null, body: '' };
  } finally {
    clearTimeout(timeout);
  }
}

function add(label, passed, detail, url = '') {
  checks.push({ label, passed, detail, url });
}
function attr(html, tagPattern, name) {
  const tag = html.match(tagPattern)?.[0] || '';
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] || '';
}

const nonWww = await request(`${inputOrigin}/`, { redirect: 'manual', body: false });
add(
  'Non-www canonical redirect',
  [301, 308].includes(nonWww.response?.status)
    && String(nonWww.response?.headers.get('location') || '').startsWith(canonicalOrigin),
  nonWww.response
    ? `HTTP ${nonWww.response.status}; target ${nonWww.response.headers.get('location') || 'missing'}`
    : `Request failed: ${nonWww.error}`,
  `${inputOrigin}/`,
);

const routes = [
  '/',
  '/privacy',
  '/cookie-policy',
  '/terms',
  '/disclaimer',
  '/author/abdul-qudoos',
  '/editorial-policy',
  '/how-we-review-prompts',
  '/account/sign-in',
  '/promptshe-trial',
  '/blog/luxury-mens-fashion-ai-portrait-prompts',
  '/tools/ai-image-prompts/p/all-white-luxury-riverside-aesthetic-male-portrait',
  '/tools/ai-image-prompts/p/golden-hour-urban-portrait-boy-in-monochromatic-chocolate-brown',
  '/robots.txt',
  '/sitemap.xml',
  '/rss.xml',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
];
const routeResults = new Map();
for (const route of routes) {
  const url = `${canonicalOrigin}${route}`;
  const result = await request(url);
  routeResults.set(route, result);
  add(`${route} status`, result.response?.status === 200, result.response ? `HTTP ${result.response.status}` : result.error, url);
}

const homepage = routeResults.get('/');
const homepageHtml = homepage?.body || '';
add('HTTPS final URL', homepage?.response?.url.startsWith('https://') === true, homepage?.response?.url || 'missing', `${canonicalOrigin}/`);
for (const header of [
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'strict-transport-security',
]) {
  add(`Security header: ${header}`, Boolean(homepage?.response?.headers.get(header)), homepage?.response?.headers.get(header) || 'missing');
}
add('Response compression', Boolean(homepage?.response?.headers.get('content-encoding')), homepage?.response?.headers.get('content-encoding') || 'not reported');
add('Homepage cache policy', Boolean(homepage?.response?.headers.get('cache-control')), homepage?.response?.headers.get('cache-control') || 'missing');
add('Homepage visible H1', /<h1\b/i.test(homepageHtml), /<h1\b/i.test(homepageHtml) ? 'present' : 'missing');
add('Homepage structured data', /application\/ld\+json/i.test(homepageHtml), /application\/ld\+json/i.test(homepageHtml) ? 'present' : 'missing');
add(
  'Homepage canonical',
  attr(homepageHtml, /<link\b[^>]*rel=["']canonical["'][^>]*>/i, 'href').replace(/\/$/, '') === canonicalOrigin,
  attr(homepageHtml, /<link\b[^>]*rel=["']canonical["'][^>]*>/i, 'href') || 'missing',
);
const ogImage = attr(homepageHtml, /<meta\b[^>]*property=["']og:image["'][^>]*>/i, 'content');
if (ogImage) {
  const ogResult = await request(new URL(ogImage, canonicalOrigin).toString(), { body: false });
  add('Open Graph image loads', ogResult.response?.status === 200, ogResult.response ? `HTTP ${ogResult.response.status}` : ogResult.error, ogImage);
} else {
  add('Open Graph image loads', false, 'og:image missing');
}

const phase4Markers = [
  'AI-generated example image for demonstration purposes.',
  'Generation evidence not yet published',
];
const oldMarkers = [
  'What Creators Say',
  'tests every prompt',
  'Disney Pixar Inspired Scrapbook Collage Portrait',
];
add(
  'Current Phase 4 deployment marker',
  phase4Markers.some((marker) => homepageHtml.includes(marker)),
  phase4Markers.some((marker) => homepageHtml.includes(marker))
    ? 'current disclosure/evidence marker found'
    : 'current marker absent',
);
add(
  'Old or unsupported homepage copy absent',
  !oldMarkers.some((marker) => homepageHtml.includes(marker)),
  oldMarkers.filter((marker) => homepageHtml.includes(marker)).join('; ') || 'no old marker found',
);

const noindexHtml = routeResults.get('/tools/ai-image-prompts/p/golden-hour-urban-portrait-boy-in-monochromatic-chocolate-brown')?.body || '';
const noindexMeta = attr(noindexHtml, /<meta\b[^>]*name=["']robots["'][^>]*>/i, 'content');
add('Sensitive prompt is noindex,follow', /noindex/i.test(noindexMeta) && !/nofollow/i.test(noindexMeta), noindexMeta || 'robots meta missing');
const indexHtml = routeResults.get('/tools/ai-image-prompts/p/all-white-luxury-riverside-aesthetic-male-portrait')?.body || '';
const indexRobots = attr(indexHtml, /<meta\b[^>]*name=["']robots["'][^>]*>/i, 'content');
add('Representative safe prompt remains indexable', !/noindex/i.test(indexRobots), indexRobots || 'default indexable');
add(
  'Quarantined prompt placeholder',
  noindexHtml.includes('media-evidence-placeholder.svg'),
  noindexHtml.includes('media-evidence-placeholder.svg') ? 'placeholder present' : 'placeholder absent',
);
add(
  'Newsletter form present',
  /Enter your email|Join Free|newsletter/i.test(homepageHtml),
  /Enter your email|Join Free|newsletter/i.test(homepageHtml) ? 'form copy present' : 'not detected',
);
add(
  'Copy-unlock control present',
  /Copy Full Prompt|Copy prompt/i.test(indexHtml),
  /Copy Full Prompt|Copy prompt/i.test(indexHtml) ? 'control copy present' : 'not detected',
);
const accountHtml = routeResults.get('/account/sign-in')?.body || '';
add('Account sign-in form present', /type=["']email["']|sign in/i.test(accountHtml), /type=["']email["']|sign in/i.test(accountHtml) ? 'present' : 'not detected');
const trialHtml = routeResults.get('/promptshe-trial')?.body || '';
add('Community-preview form present', /WhatsApp Number|Verify &amp; Join|Verify & Join/i.test(trialHtml), /WhatsApp Number|Verify &amp; Join|Verify & Join/i.test(trialHtml) ? 'present' : 'not detected');

const robotsText = routeResults.get('/robots.txt')?.body || '';
add('robots excludes admin', /Disallow:\s*\/admin/i.test(robotsText), /Disallow:\s*\/admin/i.test(robotsText) ? 'present' : 'missing');
const sitemapText = routeResults.get('/sitemap.xml')?.body || '';
add('Sitemap excludes admin/API', !/\/(?:admin|api)\b/i.test(sitemapText), /\/(?:admin|api)\b/i.test(sitemapText) ? 'unsafe URL found' : 'none found');
add(
  'Noindex prompt excluded from sitemap',
  !sitemapText.includes('golden-hour-urban-portrait-boy-in-monochromatic-chocolate-brown'),
  sitemapText.includes('golden-hour-urban-portrait-boy-in-monochromatic-chocolate-brown') ? 'unsafe URL present' : 'excluded',
);

const sitemapUrls = [...sitemapText.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map((match) => match[1]);
let sitemapFailures = 0;
for (let index = 0; index < sitemapUrls.length; index += 8) {
  const batch = sitemapUrls.slice(index, index + 8);
  const results = await Promise.all(batch.map((url) => request(url, { body: false })));
  sitemapFailures += results.filter((result) => result.response?.status !== 200).length;
}
add('All sitemap URLs return 200', sitemapUrls.length > 0 && sitemapFailures === 0, `${sitemapUrls.length} checked; ${sitemapFailures} non-200`);

const representativeHtml = [
  homepageHtml,
  routeResults.get('/blog/luxury-mens-fashion-ai-portrait-prompts')?.body || '',
  indexHtml,
];
const imageUrls = [...new Set(representativeHtml.flatMap((html) =>
  [...html.matchAll(/<(?:img|source)\b[^>]*(?:src|srcset)=["']([^"']+)["']/gi)]
    .flatMap((match) => match[1].split(',').map((item) => item.trim().split(/\s+/)[0]))
    .filter(Boolean)
    .map((url) => new URL(url.replaceAll('&amp;', '&'), canonicalOrigin).toString())
))].slice(0, 60);
let brokenImages = 0;
for (let index = 0; index < imageUrls.length; index += 8) {
  const results = await Promise.all(imageUrls.slice(index, index + 8).map((url) => request(url, { body: false })));
  brokenImages += results.filter((result) => result.response?.status !== 200).length;
}
add('Representative rendered images load', brokenImages === 0, `${imageUrls.length} checked; ${brokenImages} non-200`);

const privatePaths = [
  '/.env',
  '/.git/config',
  '/docs/IMAGE_PROVENANCE_REGISTER.json',
  '/content/provenance/OWNER_MEDIA_DECLARATION.json',
  '/content/testing/_TEMPLATE.json',
  '/package.json',
  '/database.sql',
  '/debug.log',
];
for (const route of privatePaths) {
  const result = await request(`${canonicalOrigin}${route}`, { body: false });
  add(`Private path blocked: ${route}`, [403, 404].includes(result.response?.status), result.response ? `HTTP ${result.response.status}` : result.error);
}

const passed = checks.filter((check) => check.passed).length;
const failed = checks.length - passed;
const staleDeployment = checks.some((check) => check.label === 'Current Phase 4 deployment marker' && !check.passed)
  || checks.some((check) => check.label === 'Old or unsupported homepage copy absent' && !check.passed);
const lines = [
  '# Live Production Verification',
  '',
  `Checked at: ${checkedAt}`,
  `Primary input domain: ${inputOrigin}`,
  `Expected canonical origin: ${canonicalOrigin}`,
  '',
  '## Verdict',
  '',
  staleDeployment
    ? '**DEPLOYED VERSION IS STALE — LIVE CHECKS DO NOT REPRESENT THE VERIFIED LOCAL RELEASE.**'
    : failed
      ? '**LIVE FIXES REQUIRED.**'
      : '**LIVE HTTP CHECKS PASSED.**',
  '',
  `- Checks passed: **${passed}**`,
  `- Checks failed: **${failed}**`,
  `- Sitemap URLs tested: **${sitemapUrls.length}**`,
  '',
  '| Check | Status | Detail | URL |',
  '|---|---|---|---|',
  ...checks.map((check) => `| ${check.label} | ${check.passed ? 'PASS' : 'FAIL'} | ${String(check.detail).replace(/\|/g, '\\|')} | ${check.url || ''} |`),
  '',
  '## Browser/account limitations',
  '',
  '- HTTP verification does not submit account, newsletter, copy-unlock, Paddle, or trial forms.',
  '- Consent network behavior and mobile/desktop layout require the separate browser regression scripts.',
  '- No Search Console, AdSense, CMP-provider, DNS, or indexing action is claimed.',
];
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`[live-production] ${passed}/${checks.length} passed; ${failed} failed; stale=${staleDeployment}`);
process.exit(failed || staleDeployment ? 1 : 0);
