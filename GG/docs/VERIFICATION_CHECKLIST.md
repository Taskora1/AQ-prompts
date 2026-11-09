# Boilerplate Fix - Final Verification Checklist

**Date:** 2026-08-26
**Task:** Fix duplicate boilerplate content in prompt customization tips and troubleshooting sections

## Summary

The external audit found that "Common Output Problems" and "What to customize in this prompt" sections contain word-for-word identical sentences across many unrelated prompt pages.

**Confirmed findings:**
- 54+ duplicate customization tip sentences
- 100+ duplicate troubleshooting entries
- Example: "change expression to direct eye contact" appears in 87 prompts
- Example: "depth of field doesn't match lens specifications" appears in 127 prompts

## Changes Implemented

### 1. Frontend Code Fix ✅
**File:** `src/components/prompts/PromptPages.jsx` (lines 158-168)

**What changed:**
- Added code to use DB `prompt_specific_troubleshooting` field (previously ignored)
- Now both `customization_tips` AND `prompt_specific_troubleshooting` are read from database
- Falls back to auto-generated content only if DB fields are empty

**Impact:** Pages now display the unique, prompt-specific troubleshooting you'll add to the database.

### 2. Admin Validation ✅
**File:** `src/lib/prompts-admin-db.js` (lines 279-283 and 251-262)

**What changed:**
- Added minimum requirement: at least 2 customization tips (was: no minimum)
- Added minimum requirement: at least 2 troubleshooting entries (was: only validated length limits)
- Clear error messages guide content editors

**Impact:** New/edited prompts must include unique guidance content before saving.

### 3. NPM Scripts ✅
**File:** `package.json`

Added three new commands:
```bash
npm run db:regenerate:boilerplate      # AI-powered migration (requires ANTHROPIC_API_KEY)
npm run check:boilerplate:duplicates   # Detect duplicates
npm run analyze:boilerplate            # Show current DB state
```

### 4. Migration & Analysis Scripts ✅
**Files created:**
- `scripts/regenerate-prompt-boilerplate.mjs` - AI-powered content generation
- `scripts/check-boilerplate-duplicates.mjs` - Duplicate detection
- `scripts/analyze-prompt-boilerplate.mjs` - Current state analysis

## Manual Editing Workflow

Since you're manually editing the content rather than using AI migration:

### Step 1: Export Current Data
```bash
npm run analyze:boilerplate > current-state.txt
```

### Step 2: Edit Database Content
For each of the 219 published prompts, ensure:

**customization_tips (2-4 items):**
- Each tip is specific to THIS prompt's subject matter
- References actual elements from the prompt (colors, settings, techniques)
- NOT generic advice that could apply to any prompt
- Example BAD: "Replace the golden hour lighting with cool blue-hour tones"
- Example GOOD: "Swap the chocolate-brown palette while keeping monochromatic logic intact: try olive-green or cream/beige"

**prompt_specific_troubleshooting (2-3 items):**
- Each entry has: `issue`, `why_it_happens`, `fix`
- Issue describes a problem specific to THIS prompt's composition
- Fix references specific instructions from THIS prompt
- Example BAD: "The depth of field doesn't match the lens specifications"
- Example GOOD: "The mirror reflection shows a different face or inconsistent clothing"

### Step 3: Check for Duplicates After Each Batch
After editing 20-30 prompts:
```bash
npm run check:boilerplate:duplicates
```

This will show you if any newly edited content still contains duplicates.

### Step 4: Final Verification
After editing all 219 prompts:
```bash
npm run check:boilerplate:duplicates
```

**Expected result:**
```
=== SUMMARY ===

✓ PASS: All prompts have unique guidance content
  Customization tips checked: XXX unique sentences
  Troubleshooting entries checked: XXX unique sentences
```

Exit code should be `0` (success).

## SQL Query for Direct Editing

If editing via database client:

```sql
-- View prompts with their current guidance
SELECT 
  id,
  title,
  slug,
  customization_tips,
  prompt_specific_troubleshooting
FROM prompts 
WHERE status = 'published'
ORDER BY id;

-- Update a single prompt (example)
UPDATE prompts 
SET 
  customization_tips = '[
    "Specific tip 1 for this prompt",
    "Specific tip 2 for this prompt"
  ]'::jsonb,
  prompt_specific_troubleshooting = '[
    {
      "issue": "Specific issue for this prompt",
      "why_it_happens": "Reason specific to this composition",
      "fix": "Fix referencing this prompt's elements"
    }
  ]'::jsonb,
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

## Testing Checklist

Before deploying to production:

- [ ] All 219 published prompts have been edited
- [ ] `npm run check:boilerplate:duplicates` exits with code 0
- [ ] No duplicate sentences reported in customization tips
- [ ] No duplicate sentences reported in troubleshooting entries
- [ ] Spot-check 5-10 random prompt pages in browser - verify content is unique and relevant
- [ ] Test admin panel - try saving a prompt without customization tips (should reject)
- [ ] Test admin panel - try saving a prompt without troubleshooting (should reject)
- [ ] Test admin panel - try saving a prompt with only 1 customization tip (should reject)
- [ ] Verify no actual prompt text was modified (only guidance fields changed)

## Rollback Plan

If issues are found after deployment:

1. **Frontend changes** can be reverted via git:
   ```bash
   git checkout HEAD~1 src/components/prompts/PromptPages.jsx
   git checkout HEAD~1 src/lib/prompts-admin-db.js
   ```

2. **Database changes** can be restored from backup taken before editing began

3. **Temporary workaround:** Remove validation requirements while content is being fixed:
   - Comment out lines in `prompts-admin-db.js` that check for minimum 2 items

## Post-Deployment Verification

After deploying to production:

1. **Spot-check 10 random prompts:**
   - Visit live site
   - Check "What to customize in this prompt" section
   - Check "Common output problems" section
   - Verify content is specific and relevant to that prompt

2. **Search for known duplicates:**
   - Search production site for: "replace the golden hour lighting"
   - Should appear on ONLY prompts about golden hour photography
   - Should NOT appear on unrelated prompts (anime, posters, studio portraits)

3. **Admin panel test:**
   - Try creating a new prompt without guidance fields
   - Should show validation errors

## Current Task Status

✅ **Completed:**
1. Analyzed database - confirmed 100+ duplicate sentences
2. Created migration and analysis scripts
3. Updated frontend to use DB troubleshooting field
4. Updated admin validation to require these fields
5. Added npm scripts to package.json
6. Created documentation

⏳ **Your action:**
7. Manually edit customization_tips and prompt_specific_troubleshooting for all 219 prompts
8. Run final duplicate check and confirm zero duplicates

🚀 **After your edits:**
9. Deploy frontend changes
10. Verify on production

## Questions or Issues?

If you encounter:
- **Duplicate detection script showing false positives** - Review the specific sentences flagged
- **Need help with SQL queries** - Contact database admin
- **Frontend not displaying new content** - Check browser cache and verify DB connection
- **Admin validation too strict** - Can temporarily adjust minimum requirements in `prompts-admin-db.js`

---

**Last updated:** 2026-08-26
**Scripts location:** `E:\AQ\GG\scripts\`
**Documentation:** `E:\AQ\GG\docs\BOILERPLATE_FIX_SUMMARY.md`
