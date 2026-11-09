import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { shouldNoIndexPrompt } from '../src/lib/prompt-constants.js';
import { VERIFIED_MEDIA_PLACEHOLDER } from '../src/lib/media-safety.js';

const root = process.cwd();
const promptIndexPath = path.join(root, 'public', 'data', 'prompts-index.json');
const outputPath = path.join(root, 'docs', 'PROMPT_PAGE_INDEXING_REVIEW.md');
const payload = JSON.parse(fs.readFileSync(promptIndexPath, 'utf8'));
const prompts = Array.isArray(payload) ? payload : payload.prompts || [];

function normalizedPromptText(prompt) {
  return String(prompt.prompt || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

const duplicateGroups = new Map();
for (const prompt of prompts) {
  const fingerprint = normalizedPromptText(prompt);
  if (!fingerprint) continue;
  const group = duplicateGroups.get(fingerprint) || [];
  group.push(prompt.slug);
  duplicateGroups.set(fingerprint, group);
}
const duplicateSlugs = new Set(
  [...duplicateGroups.values()].filter((group) => group.length > 1).flat(),
);

const decisions = prompts.map((prompt) => {
  const noIndex = shouldNoIndexPrompt(prompt);
  const mergeCandidate = duplicateSlugs.has(prompt.slug);
  const source = [
    prompt.slug,
    prompt.title,
    prompt.prompt,
    ...(prompt.tags || []),
  ].join(' ').toLowerCase();
  const reasons = [];
  if (/\b(?:[0-9]|1[0-7])[- ]year[- ]old\b|\b(?:child|minor|teenager|teen boy|teen girl)\b/.test(source)) {
    reasons.push('explicit or ambiguous minor-age signal');
  }
  if (/\b(imran khan|pti|celebrity|disney|pixar|netflix|vogue|forbes|gq|tedx)\b/.test(source)) {
    reasons.push('public-figure, event, media, or protected-entertainment signal');
  }
  if (mergeCandidate) reasons.push('exact duplicate prompt text');
  if (!reasons.length) reasons.push('distinct text and no current sensitive indexing trigger');

  return {
    route: `/tools/ai-image-prompts/p/${prompt.slug}`,
    primaryDecision: noIndex
      ? 'noindex,follow'
      : mergeCandidate
        ? 'merge candidate'
        : 'index,follow',
    evidenceStatus: 'evidence required',
    mediaStatus: prompt.image === VERIFIED_MEDIA_PLACEHOLDER
      ? 'neutral placeholder rendered for a specific high-risk media signal'
      : 'owner-declared AI demonstration image retained with public disclosure',
    reasons,
  };
});

const totals = {
  total: decisions.length,
  index: decisions.filter((item) => item.primaryDecision === 'index,follow').length,
  noindex: decisions.filter((item) => item.primaryDecision === 'noindex,follow').length,
  merge: decisions.filter((item) => item.primaryDecision === 'merge candidate').length,
  remove: decisions.filter((item) => item.primaryDecision === 'remove candidate').length,
  evidenceRequired: decisions.filter((item) => item.evidenceStatus === 'evidence required').length,
};

const sitemapSource = fs.readFileSync(path.join(root, 'app', 'sitemap.js'), 'utf8');
const metadataSource = fs.readFileSync(path.join(root, 'src', 'lib', 'metadata.js'), 'utf8');
const robotsSource = fs.readFileSync(path.join(root, 'public', 'robots.txt'), 'utf8');
const integrationFailures = [];
if (!sitemapSource.includes('getIndexablePrompts') || !sitemapSource.includes('entry(getPromptUrl(prompt)')) {
  integrationFailures.push('Sitemap does not include indexable prompt detail URLs');
}
if (!metadataSource.includes('noIndex: !isIndexablePrompt(prompt)')) {
  integrationFailures.push('Prompt metadata does not apply the prompt indexability policy');
}
if (!metadataSource.includes('noFollow: false')) {
  integrationFailures.push('Prompt metadata does not preserve follow for noindexed pages');
}
if (!robotsSource.includes('Allow: /tools/ai-image-prompts/p/')) {
  integrationFailures.push('robots.txt does not explicitly allow prompt detail pages');
}
const adsenseRules = robotsSource.match(/User-agent: Mediapartners-Google([\s\S]*?)(?=\nUser-agent:|$)/)?.[1] || '';
if (!adsenseRules.includes('Allow: /') || /Disallow:\s*\/tools\/ai-image-prompts\/p\//.test(adsenseRules)) {
  integrationFailures.push('robots.txt blocks AdSense from prompt detail pages');
}

const lines = [
  '# Prompt Detail Page Indexing Review',
  '',
  'Final Phase 4 review date: July 26, 2026.',
  '',
  '## Decision rule',
  '',
  '- `noindex,follow`: explicit minors, named/public figures, protected entertainment/media/event signals, or other sensitive triggers requiring manual rights and safety review.',
  '- `merge candidate`: exact duplicate prompt text. No approximate similarity decision is automated.',
  '- `index,follow`: distinct prompt text with no current sensitive trigger and meaningful shared customization/troubleshooting context.',
  '- `evidence required`: individual generation metadata remains desirable even where the project-level owner source declaration applies.',
  `- Public rendering uses \`${VERIFIED_MEDIA_PLACEHOLDER}\` only for a specific high-risk media signal; safe owner-declared AI media remains visible.`,
  '',
  '## Totals',
  '',
  `- Total prompt records: **${totals.total}**`,
  `- index,follow: **${totals.index}**`,
  `- noindex,follow: **${totals.noindex}**`,
  `- merge candidates: **${totals.merge}**`,
  `- remove candidates: **${totals.remove}**`,
  `- original-media evidence required: **${totals.evidenceRequired}**`,
  '',
  'No page was mass-indexed or mass-noindexed merely to change page count. Missing embedded generation metadata alone does not remove or suppress owner-declared AI media.',
  '',
  '## Route decisions',
  '',
  '| Route | Primary decision | Media/provenance | Evidence | Reason |',
  '|---|---|---|---|---|',
  ...decisions.map((item) =>
    `| \`${item.route}\` | ${item.primaryDecision} | ${item.mediaStatus} | ${item.evidenceStatus} | ${item.reasons.join('; ')} |`
  ),
  '',
  '## Reindex requirements',
  '',
  '- Rewrite minor, public-figure, protected-character, brand, event, or deceptive-status content.',
  '- Retain verified source, creation, reference-permission, consent, and commercial-publication evidence for replacement media.',
  '- Re-run this script and verify production robots metadata and sitemap output.',
  '- Do not treat a sanitized title, placeholder image, or editorial review as generation evidence.',
];

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(
  `[prompt-indexing] ${totals.total} total, ${totals.index} index, `
  + `${totals.noindex} noindex, ${totals.merge} merge, ${totals.remove} remove`,
);
for (const failure of integrationFailures) console.error(`FAIL: ${failure}`);
if (integrationFailures.length) process.exitCode = 1;
