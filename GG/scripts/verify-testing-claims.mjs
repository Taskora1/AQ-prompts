import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { validateTestingEvidence } from '../src/lib/testing-evidence.js';

const root = process.cwd();
const testingDirectory = path.join(root, 'content', 'testing');
const reportPath = path.join(root, 'docs', 'TESTING_CLAIMS_AUDIT.json');

const claimPatterns = [
  { label: 'tested-on claim', regex: /\btested on\b/i },
  { label: 'universal testing claim', regex: /\b(?:every|all)\s+prompts?\b.{0,40}\btested\b/i },
  { label: 'first-person generation claim', regex: /\bwe\s+(?:generated|tested|compared)\b/i },
  { label: 'comparative performance claim', regex: /\b(?:best-performing|more consistent|produced better results?|reduced errors?)\b/i },
  { label: 'attempt success-rate claim', regex: /\bworked in\s+\d+\s+(?:out of|\/)\s+\d+\s+(?:attempts?|generations?)\b/i },
  { label: 'retained test-count claim', regex: /\b(?:our|we ran)\s+\d+\s+(?:tests?|generations?|attempts?)\b/i },
];

const negationPatterns = [
  /\bnot\b/i,
  /\bno retained\b/i,
  /\bwithout\b.{0,30}\bevidence\b/i,
  /\bunless\b.{0,50}\bevidence\b/i,
  /\bdoes not\b/i,
  /\bdo not\b/i,
  /\bnever\b/i,
  /\bprohibit/i,
  /\bunsupported\b/i,
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

const testingRecords = [];
const recordErrors = [];
for (const filePath of walk(testingDirectory)) {
  if (!filePath.endsWith('.json') || path.basename(filePath).startsWith('_')) continue;
  try {
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const validation = validateTestingEvidence(record);
    testingRecords.push({
      file: relative(filePath),
      testId: record.testId,
      reviewStatus: record.reviewStatus,
      publishable: validation.publishable,
    });
    if (!validation.valid) {
      recordErrors.push({
        file: relative(filePath),
        errors: validation.errors,
      });
    }
    for (const evidencePath of record.evidenceImagePaths || []) {
      if (!fs.existsSync(path.join(root, evidencePath))) {
        recordErrors.push({
          file: relative(filePath),
          errors: [`Evidence file does not exist: ${evidencePath}`],
        });
      }
    }
  } catch (error) {
    recordErrors.push({
      file: relative(filePath),
      errors: [`Invalid JSON: ${error.message}`],
    });
  }
}

const publishedEvidenceIds = new Set(
  testingRecords
    .filter((record) => record.publishable && record.testId)
    .map((record) => record.testId),
);

const scanRoots = [
  path.join(root, 'content', 'blog'),
  path.join(root, 'app'),
  path.join(root, 'src', 'components'),
  path.join(root, 'src', 'route-views'),
  path.join(root, 'src', 'lib', 'metadata.js'),
  path.join(root, 'src', 'lib', 'author.js'),
  path.join(root, 'src', 'generated'),
  path.join(root, 'public', 'data', 'posts.json'),
  path.join(root, 'public', 'data', 'posts-index.json'),
  path.join(root, 'public', 'data', 'prompts-index.json'),
];

const filesToScan = scanRoots.flatMap((item) => {
  if (!fs.existsSync(item)) return [];
  return fs.statSync(item).isDirectory() ? walk(item) : [item];
}).filter((filePath) =>
  /\.(?:js|jsx|json|mdx)$/.test(filePath)
  && !filePath.includes(`${path.sep}admin${path.sep}`)
  && !filePath.endsWith(`${path.sep}testing-evidence.js`)
);

const unsupportedClaims = [];
for (const filePath of [...new Set(filesToScan)]) {
  const source = fs.readFileSync(filePath, 'utf8');
  const linkedEvidenceIds = [
    ...source.matchAll(/testingEvidence:\s*\[([^\]]*)\]/g),
  ].flatMap((match) => match[1].split(',').map((value) => value.replace(/['"\s]/g, '')).filter(Boolean));
  const hasPublishedLinkedEvidence =
    linkedEvidenceIds.length > 0
    && linkedEvidenceIds.every((id) => publishedEvidenceIds.has(id));

  source.split(/\r?\n/).forEach((line, index) => {
    for (const pattern of claimPatterns) {
      if (!pattern.regex.test(line)) continue;
      if (negationPatterns.some((negation) => negation.test(line))) continue;
      if (hasPublishedLinkedEvidence) continue;
      unsupportedClaims.push({
        file: relative(filePath),
        line: index + 1,
        claimType: pattern.label,
        excerpt: line.trim().slice(0, 400),
        requiredEvidenceIds: linkedEvidenceIds,
      });
    }
  });
}

const report = {
  generatedAt: '2026-07-26T00:00:00.000Z',
  testingRecords,
  publishedEvidenceRecordCount: publishedEvidenceIds.size,
  recordErrors,
  unsupportedClaims,
  passed: recordErrors.length === 0 && unsupportedClaims.length === 0,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `[testing-claims] ${testingRecords.length} completed record(s), `
  + `${publishedEvidenceIds.size} publishable, ${unsupportedClaims.length} unsupported claim(s)`,
);

for (const item of recordErrors) {
  console.error(`INVALID EVIDENCE ${item.file}: ${item.errors.join('; ')}`);
}
for (const item of unsupportedClaims) {
  console.error(`UNSUPPORTED CLAIM ${item.file}:${item.line} ${item.excerpt}`);
}

if (!report.passed) process.exitCode = 1;
