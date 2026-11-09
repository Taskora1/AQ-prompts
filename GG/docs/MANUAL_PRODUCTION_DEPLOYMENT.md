# Manual Production Deployment

Project root: `E:\AQ\GG`

The repository is linked to the Vercel project `aqprompts`, and authenticated CLI access was detected. No deployment was performed because this Phase 5 request did not explicitly authorize a production deployment.

## Before deployment

1. Install a Git client and review `git status`, the complete diff, ignored files, and the intended release commit.
2. Add `PROMPTSHE_TRIAL_SHARED_SECRET` to the Vercel Production and Preview environments. It must match the server-side value expected by the Google Apps Script endpoint.
3. Confirm every other required variable name with:

   `vercel env ls production`

4. Pull production variables into a temporary local file only when necessary. Keep that file ignored and delete it securely after validation.
5. From `E:\AQ\GG`, run:

   `npm ci`

   `npm run verify:production-env`

   `npm run audit:provenance`

   `npm run verify:image-rights`

   `npm run verify:testing-claims`

   `npm run verify:prompt-indexing`

   `npm run audit:trademarks`

   `npm run audit:adsense-preflight`

   `npm run lint`

   `npm run build`

6. Start the built application locally and run the Phase 3, Phase 4, and consent browser checks.

## Production deployment

Only after the owner explicitly authorizes deployment:

1. Run `vercel --prod` from `E:\AQ\GG`, or deploy the reviewed release commit through the linked Vercel project.
2. Record the deployment URL, deployment ID, commit SHA, actor, and UTC timestamp.
3. Confirm `https://aqprompts.com` redirects once to `https://www.aqprompts.com`.
4. Run `node scripts/verify-live-production.mjs https://aqprompts.com`.
5. Run live mobile/desktop and consent regression tests.

## Safe rollback

1. Stop promotion if smoke tests expose 5xx responses, broken authentication, missing content, unsafe media, failed consent blocking, or incorrect payment configuration.
2. In Vercel, select the last known-good production deployment and promote it to Production. Do not change DNS for an application-code rollback.
3. If using the CLI, inspect the intended previous deployment before invoking the supported Vercel rollback/promote command.
4. Re-run homepage, legal, author, article, prompt, robots, sitemap, consent, authentication, and Paddle smoke checks.
5. Preserve logs and the failed deployment ID for diagnosis. Do not roll back database state unless a separately reviewed migration requires it.
