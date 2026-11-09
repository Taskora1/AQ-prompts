# Prompt Testing Evidence Workflow

Reviewed July 26, 2026.

AQPrompts currently distinguishes editorial review from documented generation testing. No completed public testing record exists in the repository.

## Record location

- Blank template: `content/testing/_TEMPLATE.json`
- Validator: `src/lib/testing-evidence.js`
- Claim scanner: `scripts/verify-testing-claims.mjs`

Copy the template to a unique filename only after a real test begins. Do not modify the template into a fictional example.

## Workflow

1. Assign a unique test ID and connect it to a prompt ID or article slug.
2. Save the exact prompt version before generation.
3. Record the real tester and test date.
4. Record the actual tool, model/version and relevant subscription tier.
5. Record aspect ratio, seed and settings only when known.
6. Record whether a reference image was used and where its permission evidence is stored.
7. Record the exact number of generations.
8. Preserve both successful and failed outputs without selectively inventing counts.
9. Record observed issues and the exact revision made.
10. Verify publication rights for every evidence image.
11. Set `reviewStatus` to `review_required`.
12. A reviewer may set it to `published` only when the validator passes and the evidence may legally be shown.

## Public-claim gate

Claims including “tested,” “we generated,” “we compared,” “best-performing,” “more consistent,” “produced better results,” “reduced errors,” or numerical attempt success rates require a valid published evidence record linked to the content.

Neutral editorial language remains allowed:

- designed for;
- may help;
- users may experience;
- results vary;
- this guide explains;
- editorially reviewed.

Draft, missing, rejected or review-required evidence cannot support a public performance claim.

## Evidence images

Evidence images must have their own provenance records. A valid prompt test does not automatically establish ownership of an output, permission for an uploaded reference image, subject consent, or commercial-publication rights.

## Corrections

If a public test record becomes inaccurate or loses its rights basis:

- remove the public evidence component;
- change the evidence record from `published`;
- remove or qualify dependent claims;
- update the article date/note where material;
- rerun all Phase 4 verification scripts.

