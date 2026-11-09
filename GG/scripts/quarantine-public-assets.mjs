import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const publicRoot = path.resolve(root, 'public');
const archiveRoot = path.resolve(root, 'content', 'quarantine-assets');
const registerPath = path.resolve(root, 'docs', 'IMAGE_PROVENANCE_REGISTER.json');
const tombstoneEvidencePath = path.resolve(
  root,
  'content',
  'provenance',
  'tombstone-replacements.json',
);
const apply = process.argv.includes('--apply');
const runningOnVercel = Boolean(process.env.VERCEL);

function inside(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function digest(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

const register = JSON.parse(await fs.readFile(registerPath, 'utf8'));
const records = (register.records || []).filter((record) =>
  record.riskLevel === 'Critical' && !/^https?:\/\//i.test(record.path)
);
const tombstoneEvidence = JSON.parse(await fs.readFile(tombstoneEvidencePath, 'utf8'));
const tombstoneByPath = new Map(
  (tombstoneEvidence.records || []).map((record) => [record.publicPath, record]),
);

if (records.length !== 0) {
  throw new Error(`Expected no critical records after owner-approved restoration, found ${records.length}.`);
}

let moved = 0;
let archived = 0;
let tombstoned = 0;
const failures = [];

for (const record of records) {
  const relativePath = String(record.path || '').replace(/^[/\\]+/, '').replaceAll('/', path.sep);
  const publicPath = path.resolve(publicRoot, relativePath);
  const archivePath = path.resolve(archiveRoot, relativePath);

  if (!inside(publicRoot, publicPath) || !inside(archiveRoot, archivePath)) {
    failures.push(`${record.assetId}: unsafe path ${record.path}`);
    continue;
  }

  const publicExists = await exists(publicPath);
  const archiveExists = await exists(archivePath);
  const tombstone = tombstoneByPath.get(record.path);

  if (tombstone) {
    if (!publicExists) {
      failures.push(`${record.assetId}: safe tombstone is missing at ${record.path}`);
      continue;
    }
    const publicHash = await digest(publicPath);
    if (publicHash !== tombstone.replacementSha256) {
      failures.push(`${record.assetId}: public bytes do not match the safe tombstone hash`);
      continue;
    }
    if (publicHash === tombstone.originalSha256) {
      failures.push(`${record.assetId}: public bytes match the quarantined original`);
      continue;
    }
    if (archiveExists && await digest(archivePath) !== tombstone.originalSha256) {
      failures.push(`${record.assetId}: private archived original hash changed`);
      continue;
    }
    tombstoned += 1;
    if (archiveExists) archived += 1;
    continue;
  }

  if (publicExists && archiveExists) {
    const [publicHash, archiveHash] = await Promise.all([digest(publicPath), digest(archivePath)]);
    failures.push(
      `${record.assetId}: both public and archive copies exist`
      + (publicHash === archiveHash ? ' with matching content' : ' with different content'),
    );
    continue;
  }

  if (publicExists && apply) {
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.rename(publicPath, archivePath);
    moved += 1;
  }

  if (await exists(archivePath) && !await exists(publicPath)) {
    archived += 1;
  } else if (runningOnVercel && !await exists(publicPath)) {
    // Private quarantine archives are intentionally excluded from Vercel uploads.
  } else if (!apply) {
    failures.push(`${record.assetId}: still publicly present at ${record.path}`);
  } else {
    failures.push(`${record.assetId}: archive verification failed for ${record.path}`);
  }
}

console.log(
  `[quarantine-public-assets] mode=${apply ? 'apply' : 'check'} `
  + `critical=${records.length} moved=${moved} archived=${archived} tombstoned=${tombstoned}`,
);

if (failures.length > 0) {
  failures.forEach((finding) => console.error(`FAIL: ${finding}`));
  process.exit(1);
}

console.log('[quarantine-public-assets] PASS: no unapproved critical original remains under public/');
