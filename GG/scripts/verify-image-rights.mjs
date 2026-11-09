import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  summarizeProvenance,
  validateImageProvenanceRecord,
} from '../src/lib/image-provenance.js';
import { VERIFIED_MEDIA_PLACEHOLDER } from '../src/lib/media-safety.js';

const root = process.cwd();
const registerPath = path.join(root, 'docs', 'IMAGE_PROVENANCE_REGISTER.json');
const declarationPath = path.join(root, 'content', 'provenance', 'OWNER_MEDIA_DECLARATION.json');
const strict = process.argv.includes('--strict');
const failures = [];
const warnings = [];
let records = [];
let recordsByPath = new Map();
let missingGenerationMetadata = 0;

if (!fs.existsSync(declarationPath)) {
  failures.push('Missing owner media declaration');
}

if (!fs.existsSync(registerPath)) {
  failures.push('Missing docs/IMAGE_PROVENANCE_REGISTER.json');
} else {
  const payload = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
  records = Array.isArray(payload.records) ? payload.records : [];
  recordsByPath = new Map(records.map((record) => [record.path, record]));

  for (const record of records) {
    const validation = validateImageProvenanceRecord(record);
    if (!validation.valid) {
      failures.push(`${record.path || 'unknown asset'}: ${validation.errors.join('; ')}`);
    }
    const isRemote = /^https?:\/\//i.test(record.path);
    const localPath = path.join(root, 'public', String(record.path || '').replace(/^\/+/, ''));
    if (
      !isRemote
      && !fs.existsSync(localPath)
      && !(record.originalAssetStatus === 'quarantined' && record.publiclyServed === false)
    ) {
      failures.push(`Registered image is missing: ${record.path}`);
    }
    if (!isRemote && !record.width && record.format !== 'svg') warnings.push(`Dimensions unavailable: ${record.path}`);
    if (
      ['ai_generated', 'ai_edited'].includes(record.assetType)
      && ['unknown', 'not retained individually'].includes(record.creationTool)
    ) {
      missingGenerationMetadata += 1;
    }
    if (record.assetType === 'ai_edited' && record.referenceImagePermission !== 'owner-confirmed') {
      failures.push(`AI-edited asset lacks owner-confirmed reference permission: ${record.path}`);
    }
  }

  const summary = summarizeProvenance(records);
  if (missingGenerationMetadata > 0) {
    warnings.push(`${missingGenerationMetadata} AI asset(s) rely on the owner declaration without individual generation metadata`);
  }
  if (summary.High > 0 || summary.Critical > 0) {
    warnings.push(`${summary.High} high-risk and ${summary.Critical} critical asset(s) require manual action`);
  }
}

function checkPublicMedia(mediaPath, label) {
  if (!mediaPath || mediaPath === VERIFIED_MEDIA_PLACEHOLDER) return;
  const record = recordsByPath.get(mediaPath);
  if (!record) {
    failures.push(`${label} exposes an unregistered image: ${mediaPath}`);
    return;
  }
  if (record.riskLevel === 'Critical') {
    failures.push(`${label} exposes a critical-risk image instead of the neutral placeholder: ${mediaPath}`);
  }
  if (
    !['ai_generated', 'ai_edited', 'real_photograph', 'logo', 'screenshot', 'decorative_graphic', 'illustration']
      .includes(record.assetType)
  ) {
    failures.push(`${label} exposes an unclassified image: ${mediaPath}`);
  }
}

const promptIndexPath = path.join(root, 'public', 'data', 'prompts-index.json');
if (fs.existsSync(promptIndexPath)) {
  const payload = JSON.parse(fs.readFileSync(promptIndexPath, 'utf8'));
  const prompts = Array.isArray(payload) ? payload : payload.prompts || [];
  for (const prompt of prompts) {
    const media = [prompt.image, ...(prompt.images || []), prompt.ogImage].filter(Boolean);
    for (const image of media) checkPublicMedia(image, `Prompt ${prompt.slug || prompt.title}`);
  }
}

for (const fileName of ['posts.json', 'posts-index.json']) {
  const filePath = path.join(root, 'public', 'data', fileName);
  if (!fs.existsSync(filePath)) continue;
  const source = fs.readFileSync(filePath, 'utf8');
  const mediaPaths = [...source.matchAll(/\/(?:uploads|images\/prompts|images\/prompt-thumbs)\/[^"'<>\s\\]+/g)]
    .map((match) => match[0]);
  for (const mediaPath of [...new Set(mediaPaths)]) checkPublicMedia(mediaPath, fileName);
}

const placeholderPath = path.join(root, 'public', VERIFIED_MEDIA_PLACEHOLDER.replace(/^\/+/, ''));
if (!fs.existsSync(placeholderPath)) failures.push(`Neutral placeholder is missing: ${VERIFIED_MEDIA_PLACEHOLDER}`);

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);

console.log(`[image-rights] ${failures.length} failure(s), ${warnings.length} warning(s)`);
if (failures.length || (strict && warnings.length)) process.exitCode = 1;
