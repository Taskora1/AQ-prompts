# Local Production Release Report

Verified on July 26, 2026 from `E:\AQ\GG`.

## Result

**LOCAL RELEASE PASSED; PRODUCTION ENVIRONMENT GATE FAILED.**

The application compiles, statically generates, starts, and passes the available
desktop/mobile, content, media-safety, indexing, consent, and browser checks. It
must not be deployed until the environment and release-control blockers in
`PRODUCTION_DEPLOYMENT_READINESS.md` are resolved.

## Clean build

- Existing `.next` output was resolved to the project-local path and removed.
- Dependency reinstall was not required.
- ESLint: pass.
- Next.js compile: pass (42 seconds).
- TypeScript/build validation: pass.
- Static generation: 63 of 63 routes.
- Articles generated: 7.
- Prompt records available: 216.
- Manifest route generated.

## Phase 1-4 audit results

| Audit | Result |
|---|---|
| Content quality | Pass: 7 articles and 216 prompts |
| Prompt indexing | Pass: 149 `index,follow`; 28 `noindex,follow` |
| AdSense indexable-page preflight | Pass: 180 of 180 |
| Testing-claims audit | Pass: no unsupported public testing claims |
| Trademark/copyright public-copy scan | Pass: no flagged public-copy occurrences; 40 prompt records remain documented for review |
| Media-rights audit | Pass with two warnings |
| Provenance register | 629 records: 1 verified, 611 owner-confirmed, 17 unverified |
| Critical media quarantine | 49 records; neutral application placeholder |
| Production security scan | Pass with one non-secret warning |
| External-link audit | Pass: two HTTP 200 responses and one non-broken HTTP 403 documentation response |

The media warnings are that 610 AI assets rely on the owner's project-level
declaration and 49 critical records still require manual disposition. No
quarantined asset was marked safe without evidence.

## Local runtime verification

- The first Phase 3 browser run encountered a cold-start timeout on one prompt
  route. With the production server warmed, the complete rerun passed.
- Mobile and desktop Phase 4 runtime checks passed.
- AI-generated and AI-edited public disclosures rendered as specified.
- The critical-media placeholder rendered in place of a quarantined asset.
- The founder photograph remained classified and rendered as a real photograph.
- Representative homepage, legal, article, prompt, author, editorial,
  review-method, indexable, and noindex routes passed.
- Browser checks found no hydration exception, uncaught console error, or
  horizontal layout overflow.
- Consent tests passed locally at 390px: first-visit banner, keyboard/focus
  behavior, reject and accept flows, persistence, GA4/Clarity blocking before
  consent, and analytics loading after consent.

## Environment validation

`npm run verify:production-env` failed locally with 9 findings and 3 warnings.
The unresolved required names are:

- `RESEND_API_KEY`
- `CRON_SECRET`
- `WEEKLY_PROMPTS_TO`
- `PROMPTSHE_TRIAL_WEB_APP_URL`
- `PROMPTSHE_TRIAL_SHARED_SECRET`

The first four also have empty `.env.local` overrides. Optional
`NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_GSC_VERIFY` are not configured, and the
latter has an empty optional override.

The Vercel Production environment contains the inspected email, cron, database,
Paddle, authentication, analytics, and Promptshe URL names, but
`PROMPTSHE_TRIAL_SHARED_SECRET` was not listed. Values were not printed or
recorded.

## Performance and security

- 106 JavaScript chunks; 1.29 MiB aggregate uncompressed emitted JavaScript.
- No chunk exceeded 250 KiB.
- No public raster image exceeded 750 KiB.
- No local registered raster asset lacked dimensions.
- 157 remote registered images do not store intrinsic dimensions locally and
  rely on stable aspect-ratio containers.
- No credential exposure, public internal report, public source map, or
  oversized raster failure was found.
- One emitted dependency chunk contains the literal development URL
  `http://localhost`; no credential or application production endpoint is
  associated with it.

No PageSpeed Insights or field Core Web Vitals score is claimed.

## Commands used for the final local gate

```text
npm.cmd run audit:content
npm.cmd run audit:content:external
npm.cmd run audit:image-provenance
npm.cmd run audit:image-rights
npm.cmd run audit:testing-claims
npm.cmd run audit:trademarks
npm.cmd run audit:prompt-indexing
npm.cmd run audit:adsense-preflight
npm.cmd run audit:quarantine
npm.cmd run audit:production-security
npm.cmd run audit:production-performance
npm.cmd run verify:production-env
npm.cmd run lint
npm.cmd run build
npm.cmd run verify:phase3-browser
npm.cmd run verify:phase4-runtime
node scripts/verify-consent-runtime.mjs
```

## Release gate

The local build is technically releasable only after all blockers in
`PRODUCTION_DEPLOYMENT_READINESS.md` are closed and a final clean verification is
run against the exact commit intended for deployment.

