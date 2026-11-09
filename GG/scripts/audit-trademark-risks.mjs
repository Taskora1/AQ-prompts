import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { shouldNoIndexPrompt } from '../src/lib/prompt-constants.js';

const root = process.cwd();
const outputPath = path.join(root, 'docs', 'TRADEMARK_AND_COPYRIGHT_REVIEW.md');
const promptIndexPath = path.join(root, 'public', 'data', 'prompts-index.json');
const payload = JSON.parse(fs.readFileSync(promptIndexPath, 'utf8'));
const prompts = Array.isArray(payload) ? payload : payload.prompts || [];

const riskTerms = [
  ['Public figure/political identity', /\b(?:Imran Khan|PTI)\b/i],
  ['Protected animation/character shorthand', /\b(?:Disney|Pixar|DreamWorks)\b/i],
  ['Entertainment/media brand', /\b(?:Netflix|Vogue|GQ|Forbes|TEDx)\b/i],
  ['Fashion/vehicle brand', /\b(?:Nike|BMW|Lamborghini)\b/i],
  ['Living artist style request', /\bin the style of\b/i],
  ['Derivative style wording', /\binspired by\b/i],
  ['Watermark request or reference', /\bwatermark\b/i],
];

function matches(text) {
  return riskTerms.filter(([, regex]) => regex.test(text)).map(([label]) => label);
}

const promptFindings = [];
for (const prompt of prompts) {
  const text = [
    prompt.slug,
    prompt.title,
    prompt.prompt,
    prompt.intro,
    prompt.uniqueFeature,
    prompt.bestUseCase,
    ...(prompt.tags || []),
  ].join(' ');
  const categories = matches(text);
  if (!categories.length) continue;
  const noIndex = shouldNoIndexPrompt(prompt);
  promptFindings.push({
    route: `/tools/ai-image-prompts/p/${prompt.slug}`,
    categories,
    noIndex,
    action: noIndex
      ? 'Keep noindex,follow; suppress unverified image; rewrite protected or identity-specific shorthand before reindexing.'
      : 'Manual context review; retain only factual/nominative wording or genericize the unnecessary reference.',
  });
}

const sourceFiles = [
  ...fs.readdirSync(path.join(root, 'content', 'blog'))
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => path.join(root, 'content', 'blog', file)),
  path.join(root, 'src', 'route-views', 'AboutPage.jsx'),
  path.join(root, 'src', 'route-views', 'ContactPage.jsx'),
  path.join(root, 'src', 'components', 'prompts', 'PromptPages.jsx'),
];

const publicCopyFindings = [];
for (const filePath of sourceFiles) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const categories = matches(line);
    if (!categories.length) return;
    const compatibilityContext =
      /\b(?:official|documentation|tool|platform|compatib|not affiliated|no watermark)\b/i.test(line);
    publicCopyFindings.push({
      file: path.relative(root, filePath).split(path.sep).join('/'),
      line: index + 1,
      categories,
      context: line.trim().slice(0, 280),
      action: compatibilityContext
        ? 'Retain after manual review as factual compatibility, safety, or non-affiliation context.'
        : 'Genericize or remove unless the reference is essential and legally supportable.',
    });
  });
}

const lines = [
  '# Trademark and Copyright Review',
  '',
  'Reviewed July 26, 2026. This is an editorial risk inventory, not legal advice and not a licence determination.',
  '',
  '## Policy applied',
  '',
  '- Official AI-tool names may remain in factual compatibility and documentation links.',
  '- Third-party platform marks remain third-party property; AQPrompts does not claim affiliation.',
  '- Public-figure impersonation, protected-character shortcuts, media-publication branding, and event-brand shortcuts require noindex and manual rewriting.',
  '- A filename or database slug is not treated as permission to publish an associated image.',
  '- “Inspired by” and “in the style of” wording requires individual review; living-artist imitation should be removed.',
  '',
  `Prompt records with review signals: **${promptFindings.length}**`,
  `Public-copy occurrences reviewed: **${publicCopyFindings.length}**`,
  '',
  '## Prompt findings',
  '',
  '| Route | Signals | Current indexing | Action |',
  '|---|---|---|---|',
  ...promptFindings.map((item) =>
    `| \`${item.route}\` | ${item.categories.join('; ')} | ${item.noIndex ? 'noindex,follow' : 'index,follow pending manual context review'} | ${item.action} |`
  ),
  '',
  '## Article and shared-copy findings',
  '',
  '| Source | Signals | Context | Action |',
  '|---|---|---|---|',
  ...publicCopyFindings.map((item) =>
    `| \`${item.file}:${item.line}\` | ${item.categories.join('; ')} | ${item.context.replace(/\|/g, '\\|')} | ${item.action} |`
  ),
  '',
  '## Remaining manual work',
  '',
  '- Retain current official brand-guideline URLs or copies for any platform logos kept for identification.',
  '- Review noindexed prompt records in the database, not only sanitized public output.',
  '- Replace or verify every trademark-heavy image before reindexing its page.',
  '- Remove watermarks rather than cropping them unless the rights holder supplies a clean licensed original.',
];

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(
  `[trademark-review] ${promptFindings.length} prompt finding(s), `
  + `${publicCopyFindings.length} public-copy occurrence(s)`,
);
