import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const generatedRootNames = [path.join('.next', 'server'), path.join('.next', 'static')];
const scanRootNames = [
  'app',
  'src',
  'public',
  path.join('.next', 'server'),
  path.join('.next', 'static'),
];
const scanRoots = scanRootNames.map((directory) => path.join(root, directory));
const textExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.html', '.json', '.txt', '.xml']);
const publisherIdPattern = /\bca-pub-\d+\b/gi;
const loaderPattern =
  /(?:https?:)?\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js(?:\?[^\s"'`<>)\\]*)?/gi;
const publisherIdCheck = /\bca-pub-\d+\b/i;
const loaderCheck =
  /(?:https?:)?\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js(?:\?[^\s"'`<>)\\]*)?/i;
const runtimeCallPattern = /\badsbygoogle\s*\.\s*push\s*\(/i;
const findings = [];
let scanned = 0;
let generatedArtifactsPresent = false;

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : [filePath];
  });
}

for (const file of scanRoots.flatMap(walk)) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const stat = fs.statSync(file);
  if (stat.size > 10 * 1024 * 1024) continue;
  scanned += 1;
  const source = fs.readFileSync(file, 'utf8');
  const relativePath = path.relative(root, file);
  const isGeneratedFile = generatedRootNames.some((directory) =>
    relativePath === directory || relativePath.startsWith(`${directory}${path.sep}`));
  if (isGeneratedFile) generatedArtifactsPresent = true;

  const publisherIds = [...source.matchAll(publisherIdPattern)].map((match) => match[0]);
  if (publisherIds.length) {
    findings.push(`AdSense publisher ID is present before site approval: ${relativePath}`);
  }

  const loaders = [...source.matchAll(loaderPattern)].map((match) => match[0]);
  if (loaders.length) {
    findings.push(`AdSense loader is present before site approval: ${relativePath}`);
  }
  if (/google-adsense-account/i.test(source)) {
    findings.push(`AdSense publisher metadata is present before site approval: ${relativePath}`);
  }

  if (runtimeCallPattern.test(source)) {
    findings.push(`AdSense runtime ad-unit call: ${relativePath}`);
  }
}

if (generatedArtifactsPresent) {
  const generatedSource = generatedRootNames
    .flatMap((directory) => walk(path.join(root, directory)))
    .filter((file) => textExtensions.has(path.extname(file).toLowerCase()))
    .filter((file) => fs.statSync(file).size <= 10 * 1024 * 1024)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  if (
    publisherIdCheck.test(generatedSource)
    || loaderCheck.test(generatedSource)
    || /google-adsense-account/i.test(generatedSource)
  ) {
    findings.push('generated Next.js artifacts contain AdSense integration before site approval');
  }
}

const adsTxtPath = path.join(root, 'public', 'ads.txt');
if (fs.existsSync(adsTxtPath)) {
  findings.push('public/ads.txt is present before AdSense approval');
}

if (findings.length > 0) {
  findings.forEach((finding) => console.error(`FAIL: ${finding}`));
  console.error(`[adsense-artifacts] ${findings.length} finding(s)`);
  process.exit(1);
}

console.log(
  `[adsense-artifacts] PASS: ${scanned} source/build files checked; `
  + 'AdSense publisher metadata, loader, runtime calls, and ads.txt are absent pending approval',
);
