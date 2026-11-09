# Prompt Boilerplate Fix - Implementation Summary

## Problem Identified

External audit found that "Common Output Problems" and "What to customize in this prompt" sections contain **word-for-word identical sentences across many unrelated prompt pages**.

### Duplicate Detection Results
- **Total prompts analyzed:** 219 published prompts
- **Duplicate sentences found:** 100+ unique sentences appearing across multiple prompts
- **Most duplicated examples:**
  - "change the expression from confident to direct eye contact..." → **87 prompts**
  - "replace the golden hour lighting with cool blue-hour tones..." → **66 prompts**
  - "add a colored rim light (warm amber or cool teal)..." → **68 prompts**
  - "The depth of field doesn't match the lens specifications..." → **127 prompts**
  - "move the setting outdoors to a park or urban location..." → **75 prompts**

### Root Cause

The database **does** have fields for both `customization_tips` and `prompt_specific_troubleshooting`, but:

1. **Existing DB data contains boilerplate:** The customization_tips stored in the database were previously populated with templated content (not unique per prompt)
2. **Code ignores troubleshooting field:** `buildPromptGuidance()` in `PromptPages.jsx` (lines 111-168) uses DB `customization_tips` BUT completely ignores DB `prompt_specific_troubleshooting`, always falling back to auto-generated boilerplate based on keyword pattern matching

## Solution Components

### 1. Database Migration Script
**File:** `scripts/regenerate-prompt-boilerplate.mjs`
- Uses Claude Opus API to generate unique, prompt-specific content
- Analyzes each prompt's title, tags, and full prompt text
- Generates 2-4 unique customization tips per prompt
- Generates 2-3 unique troubleshooting entries per prompt
- **Requires:** `ANTHROPIC_API_KEY` in `.env` file

**Usage:**
```bash
# Test with 5 sample prompts (dry run)
npm run db:regenerate:boilerplate -- --sample

# Run on all 219 prompts (dry run, no changes)
npm run db:regenerate:boilerplate

# Apply changes to database (CAUTION: modifies 219 records)
npm run db:regenerate:boilerplate -- --apply

# Apply to sample only
npm run db:regenerate:boilerplate -- --sample --apply
```

### 2. Frontend Code Fix
**File:** `src/components/prompts/PromptPages.jsx`

**Current code (line 165):**
```javascript
commonIssues: [...new Set(commonIssues)].slice(0, 4),
```

**Should be changed to:**
```javascript
// Prefer DB-stored troubleshooting over auto-generated ones
const dbTroubleshooting = Array.isArray(prompt.promptSpecificTroubleshooting)
  ? prompt.promptSpecificTroubleshooting.filter((entry) => entry?.issue && entry?.fix)
  : [];

return {
  customizations: dbTips.length > 0 ? dbTips.slice(0, 4) : [...new Set(customizations)].slice(0, 4),
  commonIssues: dbTroubleshooting.length > 0 ? dbTroubleshooting : [...new Set(commonIssues)].slice(0, 4),
  requiresPermission: /reference|identity|same face|photo of|uploaded/.test(source),
};
```

This ensures the page uses DB troubleshooting content when available, just like it does for customization tips.

### 3. Admin Validation Update
**File:** `src/lib/prompts-admin-db.js`

**Current validation (lines 279-283):**
```javascript
if (customizationTips.length > LIMITS.customizationTips) {
  errors.customizationTips = `Use no more than ${LIMITS.customizationTips} customization tips.`;
} else if (customizationTips.some((tip) => tip.length > LIMITS.customizationTipItem)) {
  errors.customizationTips = `Each tip must be ${LIMITS.customizationTipItem} characters or fewer.`;
}
```

**Should be enhanced to:**
```javascript
// Require at least 2 customization tips for new/edited prompts
if (customizationTips.length === 0) {
  errors.customizationTips = 'Add at least 2 customization tips specific to this prompt.';
} else if (customizationTips.length < 2) {
  errors.customizationTips = 'Add at least 2 customization tips (current: ${customizationTips.length}).';
} else if (customizationTips.length > LIMITS.customizationTips) {
  errors.customizationTips = `Use no more than ${LIMITS.customizationTips} customization tips.`;
} else if (customizationTips.some((tip) => tip.length > LIMITS.customizationTipItem)) {
  errors.customizationTips = `Each tip must be ${LIMITS.customizationTipItem} characters or fewer.`;
}

// Require at least 2 troubleshooting entries for new/edited prompts
if (promptSpecificTroubleshooting.length === 0) {
  errors.promptSpecificTroubleshooting = 'Add at least 2 troubleshooting entries specific to this prompt.';
} else if (promptSpecificTroubleshooting.length < 2) {
  errors.promptSpecificTroubleshooting = `Add at least 2 troubleshooting entries (current: ${promptSpecificTroubleshooting.length}).`;
} else if (promptSpecificTroubleshooting.length > LIMITS.troubleshootingItems) {
  // existing validation...
```

### 4. Duplicate Detection Script
**File:** `scripts/check-boilerplate-duplicates.mjs`

Run this **after migration** to verify no duplicates remain:
```bash
npm run check:boilerplate:duplicates
```

Should report: `✓ PASS: All prompts have unique guidance content`

### 5. Analysis Script
**File:** `scripts/analyze-prompt-boilerplate.mjs`

Shows current state of the database:
```bash
npm run analyze:boilerplate
```

## Implementation Steps

### ⚠️ BEFORE PROCEEDING

**This migration will modify 219 database records.** While it doesn't touch the actual prompt text, it replaces customization tips and troubleshooting guidance site-wide.

### Step 1: Add API Key
Add your Anthropic API key to `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### Step 2: Test Sample Migration
```bash
npm run db:regenerate:boilerplate -- --sample
```
Review the 5 sample before/after comparisons to verify quality.

### Step 3: Run Full Migration (Dry Run)
```bash
npm run db:regenerate:boilerplate
```
Shows what would change across all 219 prompts without committing.

### Step 4: Apply Migration
```bash
npm run db:regenerate:boilerplate -- --apply
```

**Note:** This will take ~3-4 minutes (219 prompts × 800ms rate limit delay + API time).

### Step 5: Verify No Duplicates
```bash
npm run check:boilerplate:duplicates
```
Should exit with code 0 and report no duplicates found.

### Step 6: Update Frontend Code
Apply the code changes to `PromptPages.jsx` so the site uses the DB troubleshooting field.

### Step 7: Update Validation
Apply the validation changes to `prompts-admin-db.js` so new prompts require these fields.

### Step 8: Add NPM Scripts
Add to `package.json` scripts:
```json
{
  "db:regenerate:boilerplate": "node scripts/regenerate-prompt-boilerplate.mjs",
  "check:boilerplate:duplicates": "node scripts/check-boilerplate-duplicates.mjs",
  "analyze:boilerplate": "node scripts/analyze-prompt-boilerplate.mjs"
}
```

## Verification Checklist

Before deploying:
- [ ] Migration completed successfully (all 219 prompts)
- [ ] Duplicate check passes (0 duplicates found)
- [ ] Sample 5-10 prompt pages in browser - content is unique and relevant
- [ ] Admin panel rejects prompts without customization tips / troubleshooting
- [ ] No prompt text was modified (only guidance fields)

## Rollback Plan

If issues arise post-deployment:
1. The `.env.production.backup` contains the production DATABASE_URL
2. Database has `updated_at` timestamps - can query for records updated during migration window
3. Can restore from database backup taken before migration
4. Frontend code change can be reverted in git

## Files Created/Modified

### New Files:
- `scripts/regenerate-prompt-boilerplate.mjs` - AI-powered migration
- `scripts/check-boilerplate-duplicates.mjs` - Duplicate detector
- `scripts/analyze-prompt-boilerplate.mjs` - Current state analyzer
- `docs/BOILERPLATE_FIX_SUMMARY.md` - This document

### Files to Modify:
- `src/components/prompts/PromptPages.jsx` - Use DB troubleshooting field
- `src/lib/prompts-admin-db.js` - Require these fields for new prompts
- `package.json` - Add npm scripts

## Cost Estimate

**Claude Opus API:**
- ~1,200 input tokens per prompt (title + tags + prompt text + system prompt)
- ~400 output tokens per prompt (customization tips + troubleshooting)
- 219 prompts × 1,600 tokens ≈ 350K tokens
- At $15/$3 per M tokens ≈ **$5.25 total**

## Questions?

Contact the developer who created this implementation for support.
