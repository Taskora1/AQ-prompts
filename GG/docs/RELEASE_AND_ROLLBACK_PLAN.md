# Release and Rollback Plan

## Pre-deployment

1. Record the current production deployment ID and URL.
2. Confirm database backups and retention through the database provider. Do not export credentials into the repository.
3. Review pending database migrations; Phase 5 introduces no destructive migration.
4. Confirm required Vercel environment-variable names and resolve missing values.
5. Review Git status/diff and create the intended release commit.
6. Run the complete local production release checklist.

## Deployment and smoke test

1. Deploy the reviewed commit without changing DNS.
2. Record deployment ID, commit SHA, actor, and UTC timestamp.
3. Verify domain redirect, homepage, legal pages, author/editorial pages, article, indexable prompt, noindexed prompt, robots, sitemap, RSS, manifest, icons, and security headers.
4. Verify consent before/after Analytics consent at mobile and desktop widths.
5. Verify newsletter, copy unlock, account sign-in, Paddle checkout/portal, trial verification, and protected admin routing without using real customer data unnecessarily.

## Rollback triggers

- Sustained 5xx/blank pages
- Database or authentication failure
- Payment/webhook configuration mismatch
- Analytics loading before consent
- Unsafe/quarantined media becoming visible
- Canonical/noindex/sitemap regression
- Exposed secrets or internal files
- Severe mobile overflow, hydration failure, or broken navigation

## Rollback

1. Promote the last known-good Vercel production deployment.
2. Do not change DNS unless the hosting provider itself is unavailable.
3. Do not reverse database changes without a migration-specific rollback review.
4. Repeat the smoke tests and confirm the failing release is no longer served.
5. Document the incident, affected deployment, rollback timestamp, and corrective action.
