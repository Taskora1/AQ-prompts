export const IMAGE_PROVENANCE_SCHEMA_VERSION = 1;

export const IMAGE_ASSET_TYPES = [
  'real_photograph',
  'ai_generated',
  'ai_edited',
  'screenshot',
  'logo',
  'illustration',
  'decorative_graphic',
  'unknown',
];

export const IMAGE_RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
export const TRI_STATE = ['yes', 'no', 'unknown'];

export const REQUIRED_IMAGE_PROVENANCE_FIELDS = [
  'assetId',
  'path',
  'publicUrl',
  'pagesUsing',
  'assetCategory',
  'assetType',
  'sourceType',
  'humanSubject',
  'referencePhotoUsed',
  'depictedPersonIdentifiable',
  'creator',
  'creationTool',
  'modelVersion',
  'createdAt',
  'promptRecord',
  'rightsStatus',
  'licence',
  'subjectConsent',
  'referenceImagePermission',
  'commercialUseStatus',
  'disclosureRequirement',
  'currentDisclosureStatus',
  'riskLevel',
  'requiredAction',
  'evidenceFiles',
  'reviewedAt',
];

export function normalizeUnknown(value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  return value;
}

export function validateImageProvenanceRecord(record = {}) {
  const errors = [];

  for (const field of REQUIRED_IMAGE_PROVENANCE_FIELDS) {
    if (!(field in record)) errors.push(`Missing required field: ${field}`);
  }

  if (record.assetType && !IMAGE_ASSET_TYPES.includes(record.assetType)) {
    errors.push(`Unsupported assetType: ${record.assetType}`);
  }
  if (record.riskLevel && !IMAGE_RISK_LEVELS.includes(record.riskLevel)) {
    errors.push(`Unsupported riskLevel: ${record.riskLevel}`);
  }
  for (const field of ['humanSubject', 'referencePhotoUsed', 'depictedPersonIdentifiable']) {
    if (record[field] && !TRI_STATE.includes(record[field])) {
      errors.push(`${field} must be yes, no, or unknown`);
    }
  }
  if (!Array.isArray(record.pagesUsing)) errors.push('pagesUsing must be an array');
  if (!Array.isArray(record.evidenceFiles)) errors.push('evidenceFiles must be an array');

  return { valid: errors.length === 0, errors };
}

export function summarizeProvenance(records = []) {
  const summary = {
    total: records.length,
    verified: 0,
    ownerConfirmed: 0,
    unverified: 0,
    Low: 0,
    Medium: 0,
    High: 0,
    Critical: 0,
  };

  for (const record of records) {
    const rightsStatus = String(record.rightsStatus || '');
    const verified = rightsStatus.startsWith('verified');
    const ownerConfirmed = rightsStatus.startsWith('owner_confirmed');
    if (verified) summary.verified += 1;
    else if (ownerConfirmed) summary.ownerConfirmed += 1;
    else summary.unverified += 1;
    if (record.riskLevel in summary) summary[record.riskLevel] += 1;
  }

  return summary;
}
