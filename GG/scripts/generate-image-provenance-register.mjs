import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

import {
  IMAGE_PROVENANCE_SCHEMA_VERSION,
  summarizeProvenance,
  validateImageProvenanceRecord,
} from '../src/lib/image-provenance.js';
import {
  AI_EDITED_DISCLOSURE,
  AI_GENERATED_DISCLOSURE,
  VERIFIED_MEDIA_PLACEHOLDER,
  classifyPublicMedia,
  isHighRiskPublicMedia,
} from '../src/lib/media-safety.js';
import { hasOwnerApprovedMediaRisk } from '../src/lib/owner-approved-media.js';

const root = process.cwd();
const publicDirectory = path.join(root, 'public');
const docsDirectory = path.join(root, 'docs');
const markdownPath = path.join(docsDirectory, 'IMAGE_PROVENANCE_REGISTER.md');
const jsonPath = path.join(docsDirectory, 'IMAGE_PROVENANCE_REGISTER.json');
const actionsPath = path.join(docsDirectory, 'HIGH_RISK_ASSET_ACTIONS.md');
const replacementPath = path.join(docsDirectory, 'IMAGE_REPLACEMENT_PLAN.md');
const verifiedPath = path.join(root, 'content', 'provenance', 'verified-assets.json');
const declarationPath = path.join(root, 'content', 'provenance', 'OWNER_MEDIA_DECLARATION.json');
const tombstoneEvidencePath = path.join(root, 'content', 'provenance', 'tombstone-replacements.json');
const reviewDate = '2026-07-26';
const siteOrigin = 'https://www.aqprompts.com';
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const tombstoneEvidence = JSON.parse(fs.readFileSync(tombstoneEvidencePath, 'utf8'));
const tombstoneByPath = new Map(
  (tombstoneEvidence.records || []).map((record) => [record.publicPath, record]),
);
const previousRegister = fs.existsSync(jsonPath)
  ? JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  : { records: [] };
const previousCriticalRecords = new Map(
  (previousRegister.records || [])
    .filter((record) => record.riskLevel === 'Critical' && !/^https?:\/\//i.test(record.path))
    .map((record) => [record.path, record]),
);

const THIRD_PARTY_LOGO_RE =
  /^\/(?:chatgpt|gemini|leonardo|midjourney|stable-diffusion|facebook|instagram|linkedin|tiktok|twitter|whatsapp|youtube)[-_].*\.(?:svg|webp|png)$/i;
const HUMAN_CUE_RE =
  /\b(portrait|person|subject|woman|women|man|men|boy|girl|couple|face|selfie|headshot|fashion|founder|bride|groom)\b/i;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function publicPath(filePath) {
  return `/${path.relative(publicDirectory, filePath).split(path.sep).join('/')}`;
}

function cleanCell(value) {
  if (Array.isArray(value)) return value.length ? value.join('<br>') : 'none';
  if (value === null || value === undefined || value === '') return 'unknown';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function loadVerifiedRecords() {
  if (!fs.existsSync(verifiedPath)) return new Map();
  const payload = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));
  return new Map((payload.records || []).map((record) => [record.path, record]));
}

function loadOwnerDeclaration() {
  if (!fs.existsSync(declarationPath)) {
    throw new Error('Missing content/provenance/OWNER_MEDIA_DECLARATION.json');
  }
  return JSON.parse(fs.readFileSync(declarationPath, 'utf8'));
}

function loadArticleReferences() {
  const directory = path.join(root, 'content', 'blog');
  const references = [];
  for (const file of fs.readdirSync(directory).filter((item) => item.endsWith('.mdx') && !item.startsWith('_'))) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    const slug = source.match(/^slug:\s*['"]?([^'"\r\n]+)['"]?/m)?.[1]?.trim()
      || file.replace(/\.mdx$/, '');
    const matches = [
      ...source.matchAll(/(?:featuredImage|coverImage|ogImage):\s*['"]?([^'"\s]+)['"]?/g),
      ...source.matchAll(/!\[[^\]]*\]\((\/[^)\s]+)(?:\s+["'][^"']*["'])?\)/g),
    ];
    for (const match of matches) {
      const asset = match[1];
      const contextStart = Math.max(0, (match.index || 0) - 500);
      const contextEnd = Math.min(source.length, (match.index || 0) + 2500);
      references.push({
        asset,
        page: `/blog/${slug}`,
        sourceFile: `content/blog/${file}`,
        context: source.slice(contextStart, contextEnd),
      });
    }
  }
  return references;
}

function loadPromptReferences() {
  const filePath = path.join(publicDirectory, 'data', 'prompts-index.json');
  const currentReferences = [];
  if (fs.existsSync(filePath)) {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const prompts = Array.isArray(payload) ? payload : payload.prompts || [];
    currentReferences.push(...prompts.flatMap((prompt) => {
    const assets = [...new Set([prompt.image, ...(prompt.images || []), prompt.ogImage].filter(Boolean))];
    return assets.map((asset) => ({
      asset,
      page: `/tools/ai-image-prompts/p/${prompt.slug}`,
      sourceFile: 'public/data/prompts-index.json',
      context: [
        prompt.slug,
        prompt.title,
        prompt.prompt,
        prompt.intro,
        ...(prompt.tags || []),
      ].join(' '),
    }));
    }));
  }

  if (fs.existsSync(jsonPath)) {
    const previous = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const record of previous.records || []) {
      if (/^https?:\/\//i.test(record.path)) continue;
      for (const page of record.pagesUsing || []) {
        if (!page.startsWith('/tools/ai-image-prompts/p/')) continue;
        currentReferences.push({
          asset: record.path,
          page,
          sourceFile: 'docs/IMAGE_PROVENANCE_REGISTER.json',
          context: `${record.path} ${page}`,
        });
      }
    }
  }

  return currentReferences;
}

function getDimensions(filePath) {
  return sharp(filePath)
    .metadata()
    .then((metadata) => ({
      width: metadata.width || null,
      height: metadata.height || null,
      format: metadata.format || path.extname(filePath).slice(1).toLowerCase(),
    }))
    .catch(() => ({
      width: null,
      height: null,
      format: path.extname(filePath).slice(1).toLowerCase(),
    }));
}

function baseClassification(assetPath, context, verified, ownerDeclaration) {
  const tombstone = tombstoneByPath.get(assetPath);
  if (tombstone) {
    return {
      assetCategory: 'I. Quarantined originals with safe public tombstones',
      assetType: 'decorative_graphic',
      sourceType: 'safe_tombstone_replacement_for_quarantined_original',
      humanSubject: 'no',
      referencePhotoUsed: 'no',
      depictedPersonIdentifiable: 'no',
      creator: ownerDeclaration.declaredBy,
      creationTool: 'unknown',
      modelVersion: 'unknown',
      createdAt: reviewDate,
      promptRecord: 'neutral media-unavailable tombstone',
      rightsStatus: 'owner_confirmed_safe_tombstone_original_quarantined',
      licence: 'first-party site tombstone',
      subjectConsent: 'not_applicable',
      referenceImagePermission: 'not_applicable',
      commercialUseStatus: 'owner_confirmed_for_site_display',
      disclosureRequirement: 'media unavailable tombstone',
      currentDisclosureStatus: 'public_url_safe_tombstone_original_quarantined',
      riskLevel: 'Critical',
      requiredAction: 'Keep the original quarantined; the public URL may serve only the recorded harmless tombstone hash.',
      evidenceFiles: ['content/provenance/tombstone-replacements.json'],
      reviewedBy: 'AQPrompts tombstone replacement verification',
      notes: 'Original asset remains quarantined and excluded from deployment. Public bytes contain no protected subject.',
      originalAssetStatus: tombstone.originalStatus,
      originalSha256: tombstone.originalSha256,
      publicUrlStatus: tombstone.publicUrlStatus,
      replacementSha256: tombstone.replacementSha256,
      originalDeploymentStatus: tombstone.originalDeploymentStatus,
      replacementContainsProtectedSubject: tombstone.replacementContainsProtectedSubject,
      publiclyServed: true,
    };
  }

  if (assetPath === tombstoneEvidence.commonPlaceholderPath) {
    return {
      assetCategory: 'A. Verified first-party safety assets',
      assetType: 'decorative_graphic',
      sourceType: 'owner_created_safe_tombstone',
      humanSubject: 'no',
      referencePhotoUsed: 'no',
      depictedPersonIdentifiable: 'no',
      creator: ownerDeclaration.declaredBy,
      creationTool: 'unknown',
      modelVersion: 'unknown',
      createdAt: reviewDate,
      promptRecord: 'neutral media-unavailable tombstone',
      rightsStatus: 'owner_confirmed_safe_tombstone',
      licence: 'first-party site asset',
      subjectConsent: 'not_applicable',
      referenceImagePermission: 'not_applicable',
      commercialUseStatus: 'owner_confirmed_for_site_display',
      disclosureRequirement: 'not required; non-person safety graphic',
      currentDisclosureStatus: 'published_as_safe_tombstone',
      riskLevel: 'Low',
      requiredAction: 'Retain the recorded SHA-256 and non-person visual constraints.',
      evidenceFiles: ['content/provenance/tombstone-replacements.json'],
      reviewedBy: 'AQPrompts tombstone replacement verification',
      notes: 'Contains no person, protected subject, entertainment branding, or third-party trademark.',
    };
  }

  if (verified) {
    return {
      assetCategory: 'A. Verified first-party brand assets',
      assetType: verified.assetType,
      sourceType: verified.sourceType,
      humanSubject: verified.humanSubject,
      referencePhotoUsed: 'no',
      depictedPersonIdentifiable: 'no',
      creator: verified.creator,
      creationTool: verified.creationTool,
      modelVersion: verified.modelVersion,
      createdAt: verified.createdAt,
      promptRecord: verified.promptRecord,
      rightsStatus: verified.rightsStatus,
      licence: verified.licence,
      subjectConsent: verified.subjectConsent,
      referenceImagePermission: verified.referenceImagePermission,
      commercialUseStatus: verified.commercialUseStatus,
      disclosureRequirement: 'none',
      currentDisclosureStatus: verified.disclosure,
      riskLevel: verified.riskLevel,
      requiredAction: 'Retain the evidence record with the asset.',
      evidenceFiles: verified.evidenceFiles || [],
      reviewedBy: verified.reviewedBy,
      notes: verified.notes,
    };
  }

  if (assetPath === '/images/founder-aqprompts.webp') {
    return {
      assetCategory: 'B. Founder/author real photograph',
      assetType: 'real_photograph',
      sourceType: 'owner_supplied',
      humanSubject: 'yes',
      referencePhotoUsed: 'no',
      depictedPersonIdentifiable: 'yes',
      creator: 'not recorded individually',
      creationTool: 'not_applicable',
      modelVersion: 'not_applicable',
      createdAt: 'unknown',
      promptRecord: 'not_applicable',
      rightsStatus: 'owner_confirmed_for_site_display',
      licence: 'owner declaration; individual capture record not retained',
      subjectConsent: 'owner-confirmed',
      referenceImagePermission: 'not_applicable',
      commercialUseStatus: 'owner_confirmed_for_site_display',
      disclosureRequirement: 'real photograph; no AI disclosure',
      currentDisclosureStatus: 'published_as_real_founder_photograph',
      riskLevel: 'Medium',
      requiredAction: 'Retain an individual photographer/source record when available; keep classified as a real photograph.',
      evidenceFiles: ['content/provenance/OWNER_MEDIA_DECLARATION.json'],
      reviewedBy: 'AQPrompts Phase 4 automated review',
      notes: 'Owner-confirmed site asset. The declaration does not identify the photographer or capture date.',
    };
  }

  if (THIRD_PARTY_LOGO_RE.test(assetPath)) {
    return {
      assetCategory: 'E. Third-party logos or platform marks',
      assetType: 'logo',
      sourceType: 'third_party',
      humanSubject: 'no',
      referencePhotoUsed: 'no',
      depictedPersonIdentifiable: 'no',
      creator: 'third-party brand; exact source unverified',
      creationTool: 'unknown',
      modelVersion: 'not_applicable',
      createdAt: 'unknown',
      promptRecord: 'not_applicable',
      rightsStatus: 'unverified_nominative_use',
      licence: 'brand guideline record required',
      subjectConsent: 'not_applicable',
      referenceImagePermission: 'not_applicable',
      commercialUseStatus: 'manual_review_required',
      disclosureRequirement: 'non-affiliation context where displayed',
      currentDisclosureStatus: 'retained_for_descriptive_platform_links',
      riskLevel: 'Medium',
      requiredAction: 'Retain official source and current brand-guideline evidence; remove if use exceeds identification.',
      evidenceFiles: [],
      reviewedBy: 'AQPrompts Phase 4 automated review',
      notes: 'Trademark ownership remains with the named third party.',
    };
  }

  const promptMedia = assetPath.startsWith('/images/prompts/');
  const promptThumb = assetPath.startsWith('/images/prompt-thumbs/');
  const articleMedia = assetPath.startsWith('/uploads/');
  const homeOrDemoMedia = /(?:og-cover|homepage|demonstration|example)/i.test(assetPath);
  const referencedContentMedia = Boolean(context) && /\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(assetPath);
  if (promptMedia || promptThumb || articleMedia || homeOrDemoMedia || referencedContentMedia) {
    const contextText = `${assetPath} ${context}`;
    const hasHumanCue = HUMAN_CUE_RE.test(contextText);
    const critical = isHighRiskPublicMedia(assetPath, context);
    const ownerApprovedRisk = hasOwnerApprovedMediaRisk(assetPath);
    const assetType = classifyPublicMedia(assetPath, context);
    const isEdited = assetType === 'ai_edited';
    return {
      assetCategory: promptThumb
        ? `${isEdited ? 'D' : 'C'}. Owner-declared AI derivative assets`
        : `${isEdited ? 'D' : 'C'}. Owner-declared AI demonstration assets`,
      assetType,
      sourceType: 'owner_declared_ai_media',
      humanSubject: hasHumanCue ? 'yes' : 'unknown',
      referencePhotoUsed: isEdited ? 'yes' : 'no',
      depictedPersonIdentifiable: hasHumanCue ? 'unknown' : 'no',
      creator: ownerDeclaration.declaredBy,
      creationTool: 'unknown',
      modelVersion: 'unknown',
      createdAt: 'unknown',
      promptRecord: 'not retained individually',
      rightsStatus: 'owner_confirmed_source_declaration',
      licence: 'owner declaration; individual generation record not retained',
      subjectConsent: hasHumanCue && isEdited ? 'owner-confirmed where owner-provided or permitted reference applies' : 'not_applicable_or_unknown',
      referenceImagePermission: isEdited ? 'owner-confirmed' : 'not_applicable',
      commercialUseStatus: 'owner_confirmed_for_site_display',
      disclosureRequirement: isEdited ? AI_EDITED_DISCLOSURE : AI_GENERATED_DISCLOSURE,
      currentDisclosureStatus: critical
        ? 'suppressed_from_public_rendering_due_specific_risk'
        : ownerApprovedRisk ? 'published_with_explicit_owner_risk_acceptance'
        : isEdited ? 'published_with_ai_edited_disclosure' : 'published_with_ai_generated_disclosure',
      riskLevel: critical || ownerApprovedRisk ? 'Medium' : isEdited ? 'Medium' : 'Low',
      requiredAction: critical
        ? 'Keep suppressed; replace or document and manually clear the specific public-figure, character, minor, watermark, trademark, or reference-image risk.'
        : ownerApprovedRisk
          ? 'Publication explicitly approved by the site owner after reviewing the prior provenance and AdSense warning; retain AI disclosure and the approval record.'
        : 'Retain the owner declaration and public AI disclosure; add the individual tool/model/prompt/date record if it becomes available.',
      evidenceFiles: ['content/provenance/OWNER_MEDIA_DECLARATION.json'],
      reviewedBy: 'AQPrompts Phase 4 automated review',
      notes: promptThumb
        ? 'Classification inherits the project-level owner declaration; generation details for the underlying image were not retained.'
        : 'Classification relies on the current project-level owner declaration, not missing embedded metadata.',
    };
  }

  return {
    assetCategory: 'H. Unknown-source assets',
    assetType: /logo|icon|favicon|og-cover/i.test(assetPath) ? 'decorative_graphic' : 'unknown',
    sourceType: 'unknown',
    humanSubject: HUMAN_CUE_RE.test(`${assetPath} ${context}`) ? 'unknown' : 'no',
    referencePhotoUsed: 'unknown',
    depictedPersonIdentifiable: 'unknown',
    creator: 'unknown',
    creationTool: 'unknown',
    modelVersion: 'unknown',
    createdAt: 'unknown',
    promptRecord: 'unknown',
    rightsStatus: 'unverified',
    licence: 'unknown',
    subjectConsent: 'unknown',
    referenceImagePermission: 'unknown',
    commercialUseStatus: 'unverified',
    disclosureRequirement: 'context review required',
    currentDisclosureStatus: 'not_publicly_classified',
    riskLevel: 'Medium',
    requiredAction: 'Supply source and ownership evidence or replace with a verified first-party asset.',
    evidenceFiles: [],
    reviewedBy: 'AQPrompts Phase 4 automated review',
    notes: 'No reliable provenance record was found in the repository.',
  };
}

fs.mkdirSync(docsDirectory, { recursive: true });
const verifiedRecords = loadVerifiedRecords();
const ownerDeclaration = loadOwnerDeclaration();
const references = [...loadArticleReferences(), ...loadPromptReferences()];
const referencesByAsset = new Map();
for (const reference of references) {
  const items = referencesByAsset.get(reference.asset) || [];
  items.push(reference);
  referencesByAsset.set(reference.asset, items);
}

const files = walk(publicDirectory)
  .filter((file) => imageExtensions.has(path.extname(file).toLowerCase()))
  .sort((a, b) => a.localeCompare(b));

const fileHashes = new Map();
for (const file of files) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const paths = fileHashes.get(hash) || [];
  paths.push(publicPath(file));
  fileHashes.set(hash, paths);
}

const records = [];
for (const file of files) {
  const assetPath = publicPath(file);
  const assetReferences = referencesByAsset.get(assetPath) || [];
  const context = assetReferences.map((item) => item.context).join(' ');
  const verified = verifiedRecords.get(assetPath);
  const classification = baseClassification(assetPath, context, verified, ownerDeclaration);
  const stat = fs.statSync(file);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const dimensions = await getDimensions(file);
  const pagesUsing = [...new Set(assetReferences.map((item) => item.page))].sort();
  const sourceFiles = [...new Set(assetReferences.map((item) => item.sourceFile))].sort();

  const record = {
    assetId: `asset-${crypto.createHash('sha256').update(assetPath).digest('hex').slice(0, 12)}`,
    path: assetPath,
    publicUrl: `${siteOrigin}${assetPath}`,
    pagesUsing,
    sourceFiles,
    ...classification,
    evidenceFileLocation: classification.evidenceFiles?.length
      ? classification.evidenceFiles
      : 'evidence_required',
    reviewedAt: reviewDate,
    bytes: stat.size,
    width: dimensions.width,
    height: dimensions.height,
    format: dimensions.format,
    sha256: hash,
    duplicateAssetPaths: fileHashes.get(hash).filter((item) => item !== assetPath),
  };

  const validation = validateImageProvenanceRecord(record);
  if (!validation.valid) {
    throw new Error(`${assetPath}: ${validation.errors.join('; ')}`);
  }
  records.push(record);
}

const externalAssets = [...referencesByAsset.keys()]
  .filter((asset) => /^https?:\/\//i.test(asset) && !records.some((record) => record.path === asset))
  .sort((a, b) => a.localeCompare(b));

for (const assetPath of externalAssets) {
  const assetReferences = referencesByAsset.get(assetPath) || [];
  const context = assetReferences.map((item) => item.context).join(' ');
  const classification = baseClassification(assetPath, context, null, ownerDeclaration);
  const record = {
    assetId: `asset-${crypto.createHash('sha256').update(assetPath).digest('hex').slice(0, 12)}`,
    path: assetPath,
    publicUrl: assetPath,
    pagesUsing: [...new Set(assetReferences.map((item) => item.page))].sort(),
    sourceFiles: [...new Set(assetReferences.map((item) => item.sourceFile))].sort(),
    ...classification,
    evidenceFileLocation: classification.evidenceFiles?.length
      ? classification.evidenceFiles
      : 'evidence_required',
    reviewedAt: reviewDate,
    bytes: null,
    width: null,
    height: null,
    format: path.extname(new URL(assetPath).pathname).slice(1).toLowerCase() || 'unknown',
    sha256: 'remote_asset_hash_not_retained',
    duplicateAssetPaths: [],
  };
  const validation = validateImageProvenanceRecord(record);
  if (!validation.valid) throw new Error(`${assetPath}: ${validation.errors.join('; ')}`);
  records.push(record);
}

for (const [assetPath, previous] of previousCriticalRecords) {
  if (records.some((record) => record.path === assetPath)) continue;

  const record = {
    ...previous,
    originalAssetStatus: 'quarantined',
    originalSha256: previous.originalSha256 || previous.sha256,
    publicUrlStatus: 'original_not_publicly_served',
    originalDeploymentStatus: 'retained_privately_or_excluded_from_deployment',
    replacementContainsProtectedSubject: false,
    publiclyServed: false,
    currentDisclosureStatus: 'original_quarantined_not_present_in_public',
    requiredAction: 'Keep the original quarantined and excluded from public and deployment output.',
    evidenceFiles: [...new Set([
      ...(Array.isArray(previous.evidenceFiles) ? previous.evidenceFiles : []),
      'content/provenance/tombstone-replacements.json',
    ])],
    reviewedAt: reviewDate,
    notes: 'Historical original-asset record retained for quarantine evidence; the original file is not present under public/.',
  };
  const validation = validateImageProvenanceRecord(record);
  if (!validation.valid) throw new Error(`${assetPath}: ${validation.errors.join('; ')}`);
  records.push(record);
}

const summary = summarizeProvenance(records);
const payload = {
  schemaVersion: IMAGE_PROVENANCE_SCHEMA_VERSION,
  generatedAt: `${reviewDate}T00:00:00.000Z`,
  source: 'Repository evidence plus the recorded AQPrompts owner media declaration; individual tool, model, prompt, date, and settings are not inferred.',
  ownerDeclaration: 'content/provenance/OWNER_MEDIA_DECLARATION.json',
  publicFallbackAsset: VERIFIED_MEDIA_PLACEHOLDER,
  summary,
  records,
};
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);

const markdown = [
  '# AQPrompts Image Provenance Register',
  '',
  `Repository review date: ${reviewDate}. Machine-readable source: \`docs/IMAGE_PROVENANCE_REGISTER.json\`.`,
  '',
  'The website owner has declared that in-scope portrait, article, prompt-card, homepage, and demonstration images are fully AI-generated or AI-edited from owner-provided or permitted references. That declaration establishes the current source classification, but missing individual tool, model, prompt, date, and settings remain unknown.',
  '',
  '## Summary',
  '',
  `- Total assets: **${summary.total}**`,
  `- Verified rights records: **${summary.verified}**`,
  `- Owner-confirmed source declarations: **${summary.ownerConfirmed}**`,
  `- Records without either asset-specific verification or the owner source declaration: **${summary.unverified}**`,
  `- Low risk: **${summary.Low}**`,
  `- Medium risk: **${summary.Medium}**`,
  `- High risk: **${summary.High}**`,
  `- Critical risk: **${summary.Critical}**`,
  '',
  'Ordinary owner-declared AI media remains published with an accurate AI-generated or AI-edited demonstration disclosure. Only assets with specific high-risk cues are suppressed at render time. Founder/author photographs remain real photographs.',
  '',
  '## Safe tombstone replacements for quarantined originals',
  '',
  'The original media at each path below remains quarantined. The public URL serves the same non-person media-unavailable WebP tombstone; originals are retained privately or excluded from deployment. A replacement record does not verify or clear the original.',
  '',
  `- Common safe placeholder SHA-256: \`${tombstoneEvidence.commonPlaceholderSha256}\``,
  '',
  '| Public path | Original status / SHA-256 | Public URL status / replacement SHA-256 | Protected subject |',
  '|---|---|---|---|',
  ...(tombstoneEvidence.records || []).map((record) =>
    `| \`${record.publicPath}\` | ${record.originalStatus}<br>\`${record.originalSha256}\` | ${record.publicUrlStatus}<br>\`${record.replacementSha256}\` | ${record.replacementContainsProtectedSubject ? 'present' : 'none'} |`
  ),
  '',
  '## Asset records',
  '',
  '| Asset ID | File / public URL | Pages | Category / type | Human / identifiable / reference | Creator / tool / model / date | Rights / licence / consent / commercial use | Disclosure status | Risk | Required action | Evidence |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
];

for (const record of records) {
  markdown.push(`| ${[
    record.assetId,
    `\`${record.path}\`<br>${record.publicUrl}`,
    cleanCell(record.pagesUsing),
    `${record.assetCategory}<br>${record.assetType} / ${record.sourceType}`,
    `${record.humanSubject} / ${record.depictedPersonIdentifiable} / ${record.referencePhotoUsed}`,
    `${record.creator}<br>${record.creationTool} / ${record.modelVersion} / ${record.createdAt}`,
    `${record.rightsStatus}<br>${record.licence}<br>${record.subjectConsent}<br>${record.commercialUseStatus}`,
    `${record.disclosureRequirement}<br>${record.currentDisclosureStatus}`,
    record.riskLevel,
    record.requiredAction,
    cleanCell(record.evidenceFiles),
  ].map(cleanCell).join(' | ')} |`);
}
fs.writeFileSync(markdownPath, `${markdown.join('\n')}\n`);

const risky = records.filter((record) => ['High', 'Critical'].includes(record.riskLevel));
const actions = [
  '# High-Risk Asset Actions',
  '',
  `Reviewed ${reviewDate}. These actions are based only on repository evidence.`,
  '',
  '## Action implemented',
  '',
  `Only assets with specific high-risk cues are replaced in page rendering with \`${VERIFIED_MEDIA_PLACEHOLDER}\`. Ordinary owner-declared AI-generated and AI-edited assets remain available with public disclosures. Original high-risk files are retained only in the private local quarantine archive and excluded from deployment. Three legacy exact URLs serve a recorded harmless tombstone replacement while their originals remain quarantined.`,
  '',
  '| Asset | Pages affected | Risk | Action taken | Remaining evidence needed |',
  '|---|---|---|---|---|',
  ...risky.map((record) => `| ${cleanCell(record.path)} | ${cleanCell(record.pagesUsing)} | ${record.riskLevel} | ${record.publicUrlStatus === 'safe_tombstone_replacement' ? 'Original quarantined; exact public URL serves the safe tombstone replacement.' : record.riskLevel === 'Critical' ? 'Original excluded from public; neutral placeholder used in page rendering.' : 'Retained with classification; manual review recommended.'} | ${cleanCell(record.requiredAction)} |`),
];
fs.writeFileSync(actionsPath, `${actions.join('\n')}\n`);

const replacementCandidates = records
  .filter((record) => ['High', 'Critical'].includes(record.riskLevel))
  .sort((a, b) => {
    const priority = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return priority[a.riskLevel] - priority[b.riskLevel]
      || b.pagesUsing.length - a.pagesUsing.length
      || a.path.localeCompare(b.path);
  });
const replacement = [
  '# Image Replacement Plan',
  '',
  `Prepared ${reviewDate}. Safe owner-declared AI media is not a replacement candidate merely because embedded generation metadata is absent.`,
  '',
  'Priority order: homepage/prominent cards; article covers; organic prompt pages; social/OG assets; author media; trademark-heavy graphics; remaining assets.',
  '',
  '| Priority | Current asset | Risk reason | Replacement requirements | Dimensions | Subject | AI acceptable? | Evidence to retain | Pages |',
  '|---:|---|---|---|---|---|---|---|---|',
  ...replacementCandidates.map((record, index) => {
    const dimensions = record.width && record.height ? `${record.width}×${record.height}` : 'match current layout; verify dimensions';
    const subject = record.humanSubject === 'yes' ? 'Adult subject only, or use a non-person illustration' : 'Prefer non-person abstract or object';
    return `| ${index + 1} | ${cleanCell(record.path)} | ${record.riskLevel}: ${cleanCell(record.rightsStatus)} | Original first-party replacement with no logo, public figure, protected character, watermark, or unverifiable property claim. | ${dimensions} | ${subject} | Yes, only with retained tool/model/date/prompt/output/rights records; otherwise use first-party vector art. | Source file, creator, date, licence/ownership basis, prompt/test record if generated, subject/reference permission, and commercial-use approval. | ${cleanCell(record.pagesUsing)} |`;
  }),
];
fs.writeFileSync(replacementPath, `${replacement.join('\n')}\n`);

console.log(
  `[image-provenance] ${summary.total} assets: ${summary.verified} verified, `
  + `${summary.ownerConfirmed} owner-confirmed, ${summary.unverified} unverified, `
  + `${summary.High} high, ${summary.Critical} critical`,
);
