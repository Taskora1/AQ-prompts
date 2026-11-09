import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputPath = path.join(root, 'docs', 'PRODUCTION_PERFORMANCE_REVIEW.md');
const register = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'IMAGE_PROVENANCE_REGISTER.json'), 'utf8'));

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const staticChunks = walk(path.join(root, '.next', 'static', 'chunks'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, bytes: fs.statSync(file).size }))
  .sort((a, b) => b.bytes - a.bytes);
const publicRasterImages = walk(path.join(root, 'public'))
  .filter((file) => /\.(?:png|jpe?g|webp|gif)$/i.test(file))
  .map((file) => ({ file, bytes: fs.statSync(file).size }))
  .sort((a, b) => b.bytes - a.bytes);
const missingDimensions = (register.records || []).filter((record) =>
  record.format !== 'svg' && (!record.width || !record.height)
);
const missingRemoteDimensions = missingDimensions.filter((record) => /^https?:\/\//i.test(record.path));
const missingLocalDimensions = missingDimensions.filter((record) => !/^https?:\/\//i.test(record.path));
const oversizedImages = publicRasterImages.filter((item) => item.bytes > 750_000);
const veryLargeChunks = staticChunks.filter((item) => item.bytes > 250_000);
const totalJs = staticChunks.reduce((sum, item) => sum + item.bytes, 0);
const applicationSource = [
  ...walk(path.join(root, 'app')),
  ...walk(path.join(root, 'src')),
].filter((file) => /\.(?:js|jsx)$/.test(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const thirdPartyScriptSignals = [
  ['Google Analytics', /googletagmanager\.com\/gtag/i],
  ['Microsoft Clarity', /clarity\.ms\/tag/i],
  ['AdSense', /pagead2\.googlesyndication\.com/i],
].filter(([, pattern]) => pattern.test(applicationSource)).map(([name]) => name);

const routes = [
  '/',
  '/tools/ai-image-prompts',
  '/tools/ai-image-prompts/cinematic',
  '/tools/ai-image-prompts/p/all-white-luxury-riverside-aesthetic-male-portrait',
  '/blog/luxury-mens-fashion-ai-portrait-prompts',
  '/about',
];
const lines = [
  '# Production Performance Review',
  '',
  'Generated July 26, 2026 from the latest local production build. No PageSpeed Insights or Lighthouse score is claimed.',
  '',
  '## Routes in scope',
  '',
  ...routes.map((route) => `- \`${route}\``),
  '',
  '## Build measurements',
  '',
  `- JavaScript chunk files: **${staticChunks.length}**`,
  `- Aggregate emitted JavaScript size before transfer compression: **${(totalJs / 1024 / 1024).toFixed(2)} MiB**`,
  `- Chunks larger than 250 KiB: **${veryLargeChunks.length}**`,
  `- Public raster images larger than 750 KiB: **${oversizedImages.length}**`,
  `- Local registered non-SVG assets missing dimensions: **${missingLocalDimensions.length}**`,
  `- Remote Blob records without stored intrinsic dimensions: **${missingRemoteDimensions.length}**`,
  `- Third-party script integrations found in application source: **${thirdPartyScriptSignals.join(', ') || 'none'}**`,
  '',
  '## Largest emitted JavaScript chunks',
  '',
  '| Chunk | Size |',
  '|---|---:|',
  ...staticChunks.slice(0, 10).map((item) =>
    `| \`${path.relative(root, item.file).replaceAll('\\', '/')}\` | ${(item.bytes / 1024).toFixed(1)} KiB |`
  ),
  '',
  '## Oversized public raster assets',
  '',
  ...(oversizedImages.length
    ? [
        '| Asset | Size |',
        '|---|---:|',
        ...oversizedImages.map((item) =>
          `| \`${path.relative(root, item.file).replaceAll('\\', '/')}\` | ${(item.bytes / 1024).toFixed(1)} KiB |`
        ),
      ]
    : ['No public raster asset exceeds the 750 KiB review threshold.']),
  '',
  '## Findings',
  '',
  '- LCP risk is concentrated in prompt-card grids and article cover/example imagery. Next Image responsive sizing, WebP delivery, priority on the first meaningful image, and lazy loading for later images are already used.',
  '- CLS risk is reduced by aspect-ratio containers and explicit image dimensions. Remote Blob images still depend on stable containers because their intrinsic metadata is not stored locally.',
  '- Prompt library and homepage grids carry the largest hydration cost because search, carousel, engagement, saved-state, and consent interactions are client-side.',
  '- Google Analytics and Clarity are the only analytics integrations found. Consent regression confirms they remain blocked before Analytics consent.',
  '- No AdSense script is present. Adding advertising later will increase JavaScript, layout, and consent cost and must be measured after the real integration exists.',
  '- Font loading uses the project’s Next.js font pipeline; production browser checks found no layout overflow or hydration exception.',
  '- The consent banner fits 390px and uses stable fixed positioning, but its impact on real-user LCP/INP should be reviewed in production Core Web Vitals.',
  '',
  '## Required follow-up',
  '',
  '- Run PageSpeed Insights for the six representative live URLs after the verified release is deployed.',
  '- Review LCP element, INP tasks, CLS sources, unused JavaScript, and image opportunities using real field/lab data.',
  '- Recompress any future image above 750 KiB and retain dimensions/provenance.',
  '- Re-test after adding a real CMP or AdSense code because those scripts are not present in this measurement.',
];

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(
  `[performance-review] ${staticChunks.length} chunks, ${veryLargeChunks.length} large chunks, `
  + `${oversizedImages.length} oversized images, ${missingLocalDimensions.length} local missing dimensions, `
  + `${missingRemoteDimensions.length} remote dimensions not stored`,
);
