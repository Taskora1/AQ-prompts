import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const origin = new URL(process.argv[2] || 'https://www.aqprompts.com');
const register = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'docs', 'IMAGE_PROVENANCE_REGISTER.json'), 'utf8'),
);
const tombstoneEvidence = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'content', 'provenance', 'tombstone-replacements.json'),
    'utf8',
  ),
);
const tombstones = new Map(
  tombstoneEvidence.records.map((replacement) => [replacement.publicPath, replacement]),
);
const records = (register.records || []).filter((record) => record.riskLevel === 'Critical');

if (records.length !== 0) {
  throw new Error(`Expected no critical records after owner-approved restoration, found ${records.length}.`);
}

const results = [];
for (let index = 0; index < records.length; index += 8) {
  const batch = records.slice(index, index + 8);
  const batchResults = await Promise.all(batch.map(async (record) => {
    const url = new URL(record.path, origin);
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        headers: {
          Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
          'Cache-Control': 'no-cache',
        },
      });
      const location = response.headers.get('location') || '';
      const safelyRedirected = [301, 302, 307, 308].includes(response.status)
        && location.includes('/images/verified/media-evidence-placeholder.svg');
      const tombstone = tombstones.get(record.path);
      if (tombstone) {
        const body = Buffer.from(await response.arrayBuffer());
        const sha256 = crypto.createHash('sha256').update(body).digest('hex');
        const contentType = response.headers.get('content-type') || '';
        const robots = response.headers.get('x-robots-tag') || '';
        const cacheControl = response.headers.get('cache-control') || '';
        const vercelCacheControl = response.headers.get('vercel-cdn-cache-control') || '';
        const safe = response.status === 200
          && contentType.toLowerCase().startsWith('image/webp')
          && sha256 === tombstone.replacementSha256
          && sha256 !== tombstone.originalSha256
          && robots.toLowerCase().includes('noindex')
          && robots.toLowerCase().includes('noimageindex')
          && !location;
        return {
          path: record.path,
          status: response.status,
          tombstone: true,
          safe,
          sha256,
          originalSha256: tombstone.originalSha256,
          replacementSha256: tombstone.replacementSha256,
          contentType,
          robots,
          cacheControl,
          vercelCacheControl,
          location,
        };
      }
      return {
        path: record.path,
        status: response.status,
        safelyRedirected,
        location,
      };
    } catch (error) {
      return { path: record.path, status: 0, error: error?.message || 'request failed' };
    }
  }));
  results.push(...batchResults);
}

const failures = results.filter(
  (result) => result.tombstone
    ? !result.safe
    : ![404, 410].includes(result.status) && !result.safelyRedirected,
);
console.log(
  `[live-quarantine] checked=${results.length} safe=${results.length - failures.length} `
  + `failures=${failures.length}`,
);
for (const failure of failures) {
  console.error(
    `FAIL: HTTP ${failure.status || 'ERR'} ${failure.path}`
    + `${failure.sha256 ? ` sha256=${failure.sha256}` : ''}`
    + `${failure.error ? ` (${failure.error})` : ''}`,
  );
}

const checkedAt = new Date().toISOString();
const tombstoneResults = results.filter((result) => result.tombstone);
const report = [
  '# Live Tombstone Verification',
  '',
  `- Checked at: ${checkedAt}`,
  `- Origin: ${origin.origin}`,
  `- Quarantined records checked: ${results.length}`,
  `- Safe tombstone responses: ${tombstoneResults.filter((result) => result.safe).length}/0`,
  `- Failures: ${failures.length}`,
  '',
  '| Public path | HTTP | Content-Type | Downloaded SHA-256 | Original SHA-256 | Cache-Control | Vercel CDN cache | X-Robots-Tag | Redirect | Result |',
  '|---|---:|---|---|---|---|---|---|---|---|',
  ...tombstoneResults.map((result) => (
    `| \`${result.path}\` | ${result.status} | ${result.contentType || 'missing'} `
    + `| \`${result.sha256 || 'unavailable'}\` | \`${result.originalSha256}\` `
    + `| ${result.cacheControl || 'missing'} | ${result.vercelCacheControl || 'not exposed'} `
    + `| ${result.robots || 'missing'} | ${result.location || 'none'} `
    + `| ${result.safe ? 'PASS' : 'FAIL'} |`
  )),
  '',
  'The archived originals remain classified as quarantined. This report intentionally omits private archive paths.',
  '',
].join('\n');
fs.writeFileSync(
  path.join(process.cwd(), 'docs', 'LIVE_TOMBSTONE_VERIFICATION.md'),
  report,
  'utf8',
);

if (failures.length > 0) process.exit(1);
console.log(
  '[live-quarantine] PASS: no unapproved critical or tombstone paths remain',
);
