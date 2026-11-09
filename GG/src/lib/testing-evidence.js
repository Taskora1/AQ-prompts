export const TESTING_EVIDENCE_SCHEMA_VERSION = 1;

export const TEST_REVIEW_STATUSES = ['draft', 'review_required', 'published', 'rejected'];

export const REQUIRED_TEST_FIELDS = [
  'testId',
  'promptId',
  'articleSlug',
  'exactPromptVersion',
  'tester',
  'testDate',
  'aiTool',
  'modelVersion',
  'subscriptionTier',
  'aspectRatio',
  'seed',
  'referenceImageUsed',
  'referenceImagePermissionStatus',
  'settings',
  'numberOfGenerations',
  'successfulOutputs',
  'failedOutputs',
  'observedIssues',
  'promptRevision',
  'evidenceImagePaths',
  'publicationRightsStatus',
  'notes',
  'reviewStatus',
];

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateTestingEvidence(record = {}) {
  const errors = [];
  const warnings = [];

  for (const field of REQUIRED_TEST_FIELDS) {
    if (!(field in record)) errors.push(`Missing required field: ${field}`);
  }

  if (record.reviewStatus && !TEST_REVIEW_STATUSES.includes(record.reviewStatus)) {
    errors.push(`Unsupported reviewStatus: ${record.reviewStatus}`);
  }
  if (!Array.isArray(record.successfulOutputs)) errors.push('successfulOutputs must be an array');
  if (!Array.isArray(record.failedOutputs)) errors.push('failedOutputs must be an array');
  if (!Array.isArray(record.observedIssues)) errors.push('observedIssues must be an array');
  if (!Array.isArray(record.evidenceImagePaths)) errors.push('evidenceImagePaths must be an array');
  if (!record.promptId && !record.articleSlug) {
    errors.push('At least one of promptId or articleSlug is required');
  }

  if (record.reviewStatus === 'published') {
    const requiredPublishedText = [
      'testId',
      'exactPromptVersion',
      'tester',
      'testDate',
      'aiTool',
      'modelVersion',
      'referenceImagePermissionStatus',
      'publicationRightsStatus',
    ];
    for (const field of requiredPublishedText) {
      if (!hasText(record[field])) errors.push(`Published evidence requires ${field}`);
    }
    if (!Number.isInteger(record.numberOfGenerations) || record.numberOfGenerations < 1) {
      errors.push('Published evidence requires a positive integer numberOfGenerations');
    }
    const outputCount =
      (record.successfulOutputs?.length || 0) + (record.failedOutputs?.length || 0);
    if (outputCount < 1) errors.push('Published evidence requires at least one recorded output');
    if (!record.evidenceImagePaths?.length) {
      errors.push('Published evidence requires retained evidence image paths');
    }
    if (record.publicationRightsStatus !== 'verified') {
      errors.push('Published evidence requires verified publication rights');
    }
    if (
      record.referenceImageUsed === true
      && record.referenceImagePermissionStatus !== 'verified'
    ) {
      errors.push('A used reference image requires verified permission before publication');
    }
  } else if (record.reviewStatus === 'draft') {
    warnings.push('Draft records cannot support public testing or performance claims');
  }

  return {
    valid: errors.length === 0,
    publishable: errors.length === 0 && record.reviewStatus === 'published',
    errors,
    warnings,
  };
}

export function testingEvidenceSupportsClaims(record = {}) {
  return validateTestingEvidence(record).publishable;
}
