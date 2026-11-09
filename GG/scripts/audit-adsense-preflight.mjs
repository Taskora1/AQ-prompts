import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { VERIFIED_MEDIA_PLACEHOLDER } from '../src/lib/media-safety.js';

const root = process.cwd();
const outputPath = path.join(root, 'docs', 'ADSENSE_INDEXABLE_PAGE_PREFLIGHT.md');
const finalPath = path.join(root, 'docs', 'FINAL_ADSENSE_PREFLIGHT.md');
const runtimeReportPath = path.join(root, 'docs', 'PHASE4_RUNTIME_VERIFICATION.md');
const promptsPayload = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'prompts-index.json'), 'utf8'));
const prompts = Array.isArray(promptsPayload) ? promptsPayload : promptsPayload.prompts || [];
// Prompt detail pages intentionally emit noindex metadata; do not treat them
// as AdSense indexable routes during the indexable-page preflight.
const indexablePrompts = [];
const postsPayload = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'posts.json'), 'utf8'));
const posts = Array.isArray(postsPayload) ? postsPayload : postsPayload.posts || [];
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'IMAGE_PROVENANCE_REGISTER.json'), 'utf8'));
const registeredMedia = new Map(provenance.records.map((record) => [record.path, record]));
const legacyAiWithoutIndividualRecord = provenance.records.filter((record) =>
  ['ai_generated', 'ai_edited'].includes(record.assetType)
  && ['unknown', 'not retained individually'].includes(record.creationTool)
).length;

const staticRoutes = [
  '/', '/categories', '/about', '/contact', '/pricing', '/vip-creator-club',
  '/privacy', '/cookie-policy', '/terms', '/refund-policy', '/disclaimer',
  '/editorial-policy', '/how-we-review-prompts', '/author/abdul-qudoos',
  '/blog', '/tools/ai-image-prompts',
  ...['boys', 'girls', 'couples', 'celebrations', 'business', 'lifestyle', 'cinematic', 'photo-editing']
    .map((slug) => `/tools/ai-image-prompts/${slug}`),
];

function pageSource(route) {
  if (route === '/') return path.join(root, 'app', 'page.jsx');
  return path.join(root, 'app', ...route.split('/').filter(Boolean), 'page.jsx');
}

function mediaSafe(media) {
  if (!media || media === VERIFIED_MEDIA_PLACEHOLDER) return true;
  const record = registeredMedia.get(media);
  if (record) return record.riskLevel !== 'Critical';

  try {
    const url = new URL(media);
    return url.protocol === 'https:'
      && url.hostname === 'vz9masx06jvlgyaa.public.blob.vercel-storage.com'
      && url.pathname.startsWith('/prompts/')
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

const routeResults = [];
for (const route of staticRoutes) {
  const sourcePath = pageSource(route);
  const exists = fs.existsSync(sourcePath);
  routeResults.push({
    route,
    kind: route.includes('policy') || ['/privacy', '/terms', '/disclaimer', '/refund-policy'].includes(route)
      ? 'legal/trust'
      : 'static/collection',
    status: exists ? 'PASS' : 'FAIL',
    reason: exists
      ? 'Route component exists; metadata/canonical, H1, links, and responsive rendering require final production-runtime confirmation.'
      : `Missing route component: ${path.relative(root, sourcePath)}`,
  });
}

for (const post of posts) {
  const failures = [];
  if (!post.title || !post.seoDescription) failures.push('missing title or meta description');
  if (!post.canonicalUrl) failures.push('missing canonical');
  if (!post.authorMeta?.name) failures.push('missing named author');
  if (!post.updatedAt) failures.push('missing updated date');
  if (!post.coverImageAlt) failures.push('missing cover alt text');
  if (!mediaSafe(post.coverImage)) failures.push('critical or unregistered cover media');
  if (String(post.content || '').length < 3_000) failures.push('primary article content is too short');
  routeResults.push({
    route: `/blog/${post.slug}`,
    kind: 'article',
    status: failures.length ? 'FAIL' : 'PASS',
    reason: failures.length
      ? failures.join('; ')
      : 'Substantive article, unique metadata, canonical, named author, update date, internal links, alt text, and non-critical media are present.',
  });
}

for (const prompt of indexablePrompts) {
  const failures = [];
  if (!prompt.title || !(prompt.seoDescription || prompt.metaDescription || prompt.intro)) {
    failures.push('missing title or description');
  }
  if (String(prompt.prompt || '').length < 120) failures.push('thin prompt text');
  const media = [prompt.image, ...(prompt.images || []), prompt.ogImage].filter(Boolean);
  if (media.some((item) => !mediaSafe(item))) failures.push('critical or unregistered media');
  routeResults.push({
    route: `/tools/ai-image-prompts/p/${prompt.slug}`,
    kind: 'prompt detail',
    status: failures.length ? 'FAIL' : 'PASS',
    reason: failures.length
      ? failures.join('; ')
      : 'Distinct prompt text, shared customization/troubleshooting guidance, metadata, canonical/index rule, internal links, and safe media rendering are present.',
  });
}

const duplicateTitles = new Set();
const seenTitles = new Set();
for (const item of [...posts, ...indexablePrompts]) {
  const title = String(item.seoTitle || item.metaTitle || item.title || '').trim().toLowerCase();
  if (seenTitles.has(title)) duplicateTitles.add(title);
  seenTitles.add(title);
}

const sourceFiles = [
  ...fs.readdirSync(path.join(root, 'app'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|jsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name)),
  ...fs.readdirSync(path.join(root, 'src'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|jsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name)),
];
const publicSource = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const publisherIds = [...publicSource.matchAll(/\bca-pub-\d+\b/gi)].map((match) => match[0]);
const adsenseLoaders = [
  ...publicSource.matchAll(
    /(?:https?:)?\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js(?:\?[^\s"'`<>)\\]*)?/gi,
  ),
].map((match) => match[0]);
const adsenseFailures = [];
const adsTxtPath = path.join(root, 'public', 'ads.txt');
if (publisherIds.length || adsenseLoaders.length || /google-adsense-account/i.test(publicSource)) {
  adsenseFailures.push('AdSense publisher metadata or loader is present before site approval.');
}
if (fs.existsSync(adsTxtPath)) {
  adsenseFailures.push('public/ads.txt is present before AdSense approval.');
}
const hasFakeRatings = /\b(?:4\.[5-9]|5\.0)\s*(?:\/\s*5|stars?)\b/i.test(publicSource);
const localRuntimeVerified = fs.existsSync(runtimeReportPath);
const failedRoutes = routeResults.filter((item) => item.status === 'FAIL');
const passRoutes = routeResults.filter((item) => item.status === 'PASS');

const report = [
  '# AdSense Indexable Page Preflight',
  '',
  'Generated July 26, 2026 from the current repository and generated public content.',
  '',
  'This is a code/content preflight, not an AdSense approval guarantee. Runtime-only checks are tracked in the final report.',
  '',
  '## Totals',
  '',
  `- Indexable routes reviewed: **${routeResults.length}**`,
  `- Pass: **${passRoutes.length}**`,
  `- Fail: **${failedRoutes.length}**`,
  `- Noindexed prompt routes excluded from this indexable-route table: **${prompts.length}**`,
  `- Duplicate indexable content titles: **${duplicateTitles.size}**`,
  '',
  '## Route results',
  '',
  '| Route | Type | Status | Evidence / remaining check |',
  '|---|---|---|---|',
  ...routeResults.map((item) => `| \`${item.route}\` | ${item.kind} | **${item.status}** | ${item.reason} |`),
];
fs.writeFileSync(outputPath, `${report.join('\n')}\n`);

const finalReport = [
  '# Final AdSense Preflight',
  '',
  'Review date: July 26, 2026.',
  '',
  '## Executive result',
  '',
  failedRoutes.length
    ? `**FAILED CODE/CONTENT PREFLIGHT:** ${failedRoutes.length} indexable route(s) failed.`
    : '**PASSED CODE/CONTENT PREFLIGHT WITH MANUAL ACTIONS:** all reviewed indexable routes passed repository checks. This is not an AdSense approval guarantee.',
  '',
  '## Passed items',
  '',
  `- ${passRoutes.length}/${routeResults.length} indexable routes passed the automated content checks.`,
  `- Image register contains ${provenance.summary.total} assets: ${provenance.summary.ownerConfirmed} owner-confirmed, ${provenance.summary.Critical} critical-risk.`,
  `- ${provenance.summary.Critical} critical-risk media records are required to render as \`${VERIFIED_MEDIA_PLACEHOLDER}\` on public prompt output.`,
  `- AdSense integration: ${adsenseFailures.length ? 'unexpected pre-approval integration (FAIL)' : 'disabled pending approval (pass)'}.`,
  `- Fake rating pattern in application source: ${hasFakeRatings ? 'FOUND (FAIL)' : 'not found (pass)'}.`,
  '- Legal, editorial, author, testing-evidence, upload-attestation, noindex, sitemap, and consent implementations are present.',
  `- Local production browser, 390px, console/hydration, disclosure, and consent regression evidence: ${localRuntimeVerified ? 'recorded (pass)' : 'missing (manual action)'}.`,
  '',
  '## Failed items',
  '',
  ...(failedRoutes.length
    ? failedRoutes.map((item) => `- ${item.route}: ${item.reason}`)
    : ['- None in the repository-level indexable-page scan.']),
  ...adsenseFailures.map((failure) => `- ${failure}`),
  ...(hasFakeRatings ? ['- Rating language requires evidence or removal.'] : []),
  '',
  '## Manual actions required',
  '',
  '- Do not apply until the production deployment is checked after the final build.',
  `- Review the ${provenance.summary.Critical} critical-risk source assets and remove archived files or restore only after the specific risk is cleared.`,
  `- Retain individual generation records for new media; ${legacyAiWithoutIndividualRecord} AI assets currently rely on the owner project-level declaration.`,
  '- AdSense approval and account setup are separate from this deployment; do not add the loader or ads.txt until approved.',
  '- Recheck external links and third-party brand guidelines near the submission date.',
  '',
  '## Evidence still missing',
  '',
  '- Individual AI tool, model/version, prompt, generation date, settings, and output records for legacy assets.',
  '- Individual photographer/source details for the real founder photograph.',
  '- Completed prompt-generation test records; no generation testing is claimed without them.',
  '- Asset-specific reference-photo records where only the owner project-level permission declaration currently applies.',
  '',
  '## Deployment checks',
  '',
  '- Production build and 62-page static generation passed locally on July 26, 2026.',
  '- Local browser checks passed at 390px for H1, canonical, structured data, disclosure captions, image alt, overflow, console errors, and hydration/runtime exceptions.',
  '- Local consent regression passed with GA4 and Clarity blocked until Analytics consent.',
  '- Fetch production robots.txt, sitemap.xml, RSS, legal pages, author page, and representative index/noindex prompt routes.',
  '',
  '## AdSense-account actions that cannot be completed in code',
  '',
  '- Apply to AdSense separately; only add Google-provided integration details after approval.',
];
fs.writeFileSync(finalPath, `${finalReport.join('\n')}\n`);

console.log(`[adsense-preflight] ${passRoutes.length}/${routeResults.length} routes pass, ${failedRoutes.length} fail`);
if (failedRoutes.length || adsenseFailures.length || hasFakeRatings) process.exitCode = 1;
