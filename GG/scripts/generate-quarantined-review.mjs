import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const registerPath = path.join(root, 'docs', 'IMAGE_PROVENANCE_REGISTER.json');
const outputPath = path.join(root, 'docs', 'QUARANTINED_ASSET_MANUAL_REVIEW.md');
const payload = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
const records = (payload.records || []).filter((record) => record.riskLevel === 'Critical');
const publicRoot = path.join(root, 'public');
const archiveRoot = path.join(root, 'content', 'quarantine-assets');

function stem(value = '') {
  return path.basename(String(value)).replace(/\.[^.]+$/, '').replace(/-\d+$/, '');
}

function reasonsFor(record) {
  const source = `${record.path} ${(record.pagesUsing || []).join(' ')}`.toLowerCase();
  const reasons = [];
  if (/\b(imran[-_/ ]?khan|pti|celebrity)\b/.test(source)) reasons.push('public figure');
  if (/\b(disney|pixar|marvel|barbie|harry[-_/ ]?potter)\b/.test(source)) {
    reasons.push('protected character');
  }
  if (
    /\b(teen(?:ager)?|child|minor|\d{1,2}[-_/ ]?(?:year|yr)[-_/ ]?old)\b/.test(source)
    || /(?:^|[-_/])(boy|girl)(?:[-_./]|$)/i.test(record.path)
  ) {
    reasons.push('minor or ambiguous age');
  }
  if (/\b(lamborghini|nike|bmw|vogue|forbes|gq|netflix|tedx)[-_/ ]?(?:logo|campaign|cover|poster|advert|ad|branding)?\b/.test(source)) {
    reasons.push('trademark');
  }
  if (record.assetType === 'ai_edited' && record.referenceImagePermission !== 'owner-confirmed') {
    reasons.push('unknown reference permission');
  }
  if (!reasons.length) reasons.push('other reason: context-level safety trigger; owner review required');
  return reasons;
}

const criticalByStem = new Map();
for (const record of records) {
  const items = criticalByStem.get(stem(record.path)) || [];
  items.push(record);
  criticalByStem.set(stem(record.path), items);
}

function pagesFor(record) {
  const direct = record.pagesUsing || [];
  if (direct.length) return direct;
  return [...new Set(
    (criticalByStem.get(stem(record.path)) || []).flatMap((item) => item.pagesUsing || []),
  )];
}

function storageFor(record) {
  const relativePath = String(record.path || '').replace(/^[/\\]+/, '');
  return {
    publicExists: fs.existsSync(path.join(publicRoot, relativePath)),
    archiveExists: fs.existsSync(path.join(archiveRoot, relativePath)),
  };
}

function recommendation(reasons) {
  if (reasons.includes('public figure')) {
    return 'Keep quarantined; rewrite the prompt to a generic adult subject; replace the image; retain noindex until rewritten and manually reviewed.';
  }
  if (reasons.includes('protected character')) {
    return 'Keep quarantined; remove protected-character targeting; replace with an original generic visual style; retain noindex until reviewed.';
  }
  if (reasons.includes('minor or ambiguous age')) {
    return 'Keep quarantined; rewrite the subject as explicitly adult; replace the image with an adult or non-person example; retain noindex until reviewed.';
  }
  if (reasons.includes('trademark')) {
    return 'Keep quarantined; remove endorsement-like branding; replace with an unbranded image; owner verification required before any restoration.';
  }
  if (reasons.includes('unknown reference permission')) {
    return 'Keep quarantined; owner verification and asset-specific reference permission are required; otherwise replace the image.';
  }
  return 'Keep quarantined and complete a file-specific owner review; replace the image if the triggering context cannot be cleared.';
}

function usefulness(reasons) {
  if (reasons.includes('public figure') || reasons.includes('protected character')) {
    return 'Limited: the current page intent is tied to the risky subject. It becomes useful only after a generic rewrite.';
  }
  if (reasons.includes('minor or ambiguous age')) {
    return 'Conditional: the layout and technique remain useful, but the subject must be rewritten as explicitly adult.';
  }
  return 'Yes, if the text remains generic and the neutral placeholder does not remove the page’s primary instructional value.';
}

const totals = new Map();
for (const record of records) {
  for (const reason of reasonsFor(record)) totals.set(reason, (totals.get(reason) || 0) + 1);
}

const lines = [
  '# Quarantined Asset Manual Review',
  '',
  'Generated July 26, 2026 from `docs/IMAGE_PROVENANCE_REGISTER.json`. No record is marked safe by this report.',
  '',
  '## Important limitation',
  '',
  'The application replaces these assets in prompt and article rendering with the neutral placeholder. The originals are retained only in `content/quarantine-assets/`, excluded from the Vercel upload, and must not exist under `public/`.',
  '',
  '## Summary',
  '',
  `- Critical records reviewed: **${records.length}**`,
  ...[...totals.entries()].map(([reason, count]) => `- ${reason}: **${count}**`),
  '',
  '## Asset-by-asset decisions',
  '',
  '| Asset ID | File | Prompt/article page | Critical reason | Current public behaviour | Useful with placeholder? | Recommended action |',
  '|---|---|---|---|---|---|---|',
  ...records.map((record) => {
    const reasons = reasonsFor(record);
    const pages = pagesFor(record);
    const storage = storageFor(record);
    const behaviour = storage.publicExists
      ? 'Placeholder rendered, but the original still exists under public and must not be deployed.'
      : storage.archiveExists
        ? 'Placeholder rendered; original moved to the internal quarantine archive and excluded from deployment.'
        : 'Placeholder rendered; original absent from both public and the local quarantine archive.';
    return `| ${record.assetId} | \`${record.path}\` | ${pages.length ? pages.map((page) => `\`${page}\``).join('<br>') : 'No current page reference; derivative/archive asset'} | ${reasons.join('; ')} | ${behaviour} | ${usefulness(reasons)} | ${recommendation(reasons)} |`;
  }),
  '',
  '## Owner review procedure',
  '',
  '1. Confirm the prompt subject and original reference source.',
  '2. Do not restore a public figure, protected character, ambiguous minor, watermark, or endorsement-like trademark asset.',
  '3. If retained, rewrite the prompt and generate or select a new compliant image.',
  '4. Update the provenance record and rerun the Phase 4 and Phase 5 checks.',
  '5. Keep the route `noindex,follow` until the textual and visual risk is cleared.',
];

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`[quarantine-review] ${records.length} critical asset record(s) documented`);
