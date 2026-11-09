import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const publicRoot = path.join(root, 'public');
const archiveRoot = path.join(root, 'content', 'quarantine-assets');
const evidencePath = path.join(root, 'content', 'provenance', 'tombstone-replacements.json');
const reportPath = path.join(root, 'docs', 'TOMBSTONE_REPLACEMENT_EVIDENCE.md');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const failures = [];

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : [filePath];
  });
}

const commonPath = path.join(publicRoot, evidence.commonPlaceholderPath.replace(/^\/+/, ''));
if (!fs.existsSync(commonPath)) failures.push('Common safe tombstone is missing');
const commonHash = fs.existsSync(commonPath) ? digest(commonPath) : '';
if (commonHash !== evidence.commonPlaceholderSha256) {
  failures.push('Common safe tombstone SHA-256 does not match evidence');
}

const verifiedRows = [];
for (const record of evidence.records || []) {
  const relativePath = record.publicPath.replace(/^\/+/, '');
  const replacementPath = path.join(publicRoot, relativePath);
  const archivedOriginalPath = path.join(archiveRoot, relativePath);
  if (!fs.existsSync(replacementPath)) {
    failures.push(`Missing public tombstone: ${record.publicPath}`);
    continue;
  }

  const replacementHash = digest(replacementPath);
  if (replacementHash !== record.replacementSha256 || replacementHash !== commonHash) {
    failures.push(`Replacement hash mismatch: ${record.publicPath}`);
  }
  if (replacementHash === record.originalSha256) {
    failures.push(`Replacement byte-matches quarantined original: ${record.publicPath}`);
  }

  let archivedOriginalVerified = 'excluded from this environment';
  if (fs.existsSync(archivedOriginalPath)) {
    const originalHash = digest(archivedOriginalPath);
    archivedOriginalVerified = originalHash === record.originalSha256 ? 'yes' : 'NO';
    if (originalHash !== record.originalSha256) {
      failures.push(`Archived original hash mismatch: ${record.publicPath}`);
    }
  }

  const metadata = await sharp(replacementPath).metadata();
  if (metadata.format !== 'webp') failures.push(`Replacement is not WebP: ${record.publicPath}`);
  if (metadata.width !== 640 || metadata.height !== 640) {
    failures.push(`Replacement dimensions must be 640x640: ${record.publicPath}`);
  }

  verifiedRows.push({
    ...record,
    replacementHash,
    archivedOriginalVerified,
  });
}

const originalHashes = new Set((evidence.records || []).map((record) => record.originalSha256));
const archivedSizes = new Set(
  (evidence.records || [])
    .map((record) => path.join(archiveRoot, record.publicPath.replace(/^\/+/, '')))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.statSync(file).size),
);
const outputRoots = [
  path.join(root, 'public'),
  path.join(root, '.next'),
].filter((directory) => fs.existsSync(directory));
for (const file of outputRoots.flatMap(walk)) {
  if (!archivedSizes.has(fs.statSync(file).size)) continue;
  const hash = digest(file);
  if (originalHashes.has(hash)) {
    failures.push(`Quarantined original bytes found in output: ${path.relative(root, file)}`);
  }
}

const generatedTextFiles = [
  ...walk(path.join(root, 'public', 'data')),
  ...walk(path.join(root, 'src', 'generated')),
].filter((file) => /\.(?:js|json|xml|txt)$/i.test(file));
for (const file of generatedTextFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const record of evidence.records || []) {
    if (source.includes(record.publicPath)) {
      failures.push(`Generated content references quarantined original path: ${path.relative(root, file)}`);
    }
  }
}

const vercelIgnore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
if (!/^content\/quarantine-assets\/\s*$/m.test(vercelIgnore)) {
  failures.push('Private quarantine archive is not excluded by .vercelignore');
}

const lines = [
  '# Tombstone Replacement Evidence',
  '',
  'The original assets remain quarantined. Private archive locations are intentionally not published in this report.',
  '',
  `- Common safe tombstone: \`${evidence.commonPlaceholderPath}\``,
  `- Common safe tombstone SHA-256: \`${commonHash || 'missing'}\``,
  '- Replacement constraints: no person, child, celebrity, protected character, entertainment branding, or third-party trademark.',
  '',
  '| Public URL path | Original status | Original SHA-256 | Replacement SHA-256 | Archived original hash verified locally |',
  '|---|---|---|---|---|',
  ...verifiedRows.map((record) =>
    `| \`${record.publicPath}\` | ${record.originalStatus} | \`${record.originalSha256}\` | \`${record.replacementHash}\` | ${record.archivedOriginalVerified} |`
  ),
  '',
  `Verification result: **${failures.length === 0 ? 'PASS' : 'FAIL'}**`,
];
fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);

for (const failure of failures) console.error(`FAIL: ${failure}`);
console.log(
  `[tombstone-verification] replacements=${verifiedRows.length} `
  + `failures=${failures.length} commonSha256=${commonHash || 'missing'}`,
);
if (failures.length > 0) process.exit(1);
