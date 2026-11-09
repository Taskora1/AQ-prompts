# Production Deployment Readiness

Reviewed on July 26, 2026.

## Executive verdict

**NOT READY TO DEPLOY**

The repository's clean production build and local runtime checks pass, but the
release-control and production-environment gates are not complete. No production
deployment was performed.

## Blocking items

1. `PROMPTSHE_TRIAL_SHARED_SECRET` was not listed in the linked Vercel
   Production environment. Its value must match the receiving Apps Script
   configuration and must not be committed.
2. Local end-to-end checks for email, cron, weekly recipient, and Promptshe
   submission cannot run because the five names listed in
   `LOCAL_PRODUCTION_RELEASE_REPORT.md` are missing or empty locally.
3. The Git executable/status was unavailable in this environment. An owner must
   inspect the exact staged diff, confirm no unrelated files, and record the
   release commit before deployment.
4. The user did not explicitly authorize production deployment. Authentication
   alone is not deployment permission.
5. The public domain serves an older release and cannot be used as proof that
   the current repository passed live verification.

## Deployment access and repository controls

- The repository is linked to the Vercel project `aqprompts`.
- Vercel CLI authentication is available.
- `.vercel`, `.env*`, `node_modules`, `.next`, and local audit artifacts are
  ignored.
- No `.openai/hosting.json` exists; the connected Sites deployment workflow is
  not applicable.
- No push, production deployment, DNS change, database mutation, Search Console
  action, CMP change, or AdSense action was made.

## Configuration review

| Area | Result |
|---|---|
| Build/static generation | Pass locally |
| Redirects/canonical host | Configured; non-www currently redirects to www |
| Security headers | Present on the current live homepage |
| Robots | Public routes allowed; admin and API excluded in current repository |
| Sitemap | Repository audit passes; current live sitemap is stale |
| Database | Production names exist in Vercel; no connection or mutation attempted |
| Analytics | GA4 and Clarity gated by local consent runtime |
| Email/cron | Production names exist, but values and delivery were not exercised |
| Paddle | Production variable names exist; no checkout/payment executed |
| Formspree | No active configuration or application integration found |
| Community preview | Form UI present; no external account action claimed |
| Promptshe trial | URL name exists; shared-secret name missing in Vercel Production |
| AdSense | Not approved; integration and public `ads.txt` intentionally absent. Approval is not a deployment prerequisite. |

## Secret and public-file scan

- No exposed API key, private token, database credential, email credential,
  Paddle secret, session secret, or admin credential was detected in public or
  emitted build files.
- Secret values were not printed during environment checks.
- No source map containing private data was found.
- Internal provenance records, owner declarations, test templates, internal
  docs, package metadata, database backups, and log candidates returned 404 on
  the current public domain.
- Internal absolute Windows paths occur only in local operational context and
  are not intentionally shipped as public page content.
- A third-party emitted browser chunk contains a literal `http://localhost`;
  manual inspection classifies this as library code, not a configured
  production endpoint or credential.

## Live deployment status

The current live domain is stale:

- four current trust pages and the web manifest return 404;
- the Phase 4 marker is absent;
- old testimonial/testing/character copy is present;
- the representative sensitive prompt remains `index,follow`, is still in the
  sitemap, and does not render the quarantine placeholder;
- the live consent banner test fails;
- 29 of 38 representative rendered image requests failed in the HTTP audit.

The full timestamped evidence is in `LIVE_PRODUCTION_VERIFICATION.md`,
`LIVE_BROWSER_VERIFICATION.md`, and `LIVE_CONSENT_VERIFICATION.md`.

## Conditions to change the verdict

1. Add and independently confirm the missing Vercel Production shared-secret
   pair without exposing it.
2. Review `git status`, the full diff, ignored files, and the exact release
   commit on a machine with Git available.
3. Rerun the environment, audit, lint, clean-build, and local runtime gates.
4. Obtain explicit production-deployment authorization.
5. Deploy the recorded build using `MANUAL_PRODUCTION_DEPLOYMENT.md`.
6. Run all live HTTP, browser, consent, form, image, and search-readiness checks.
7. Record either `DEPLOYED - LIVE CHECKS PASSED` or
   `DEPLOYED - FIXES REQUIRED` from observed results.

Rollback steps and triggers are documented in `RELEASE_AND_ROLLBACK_PLAN.md`.
