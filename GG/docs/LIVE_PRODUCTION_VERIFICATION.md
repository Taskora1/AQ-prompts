# Live Production Verification

Checked at: 2026-07-26T14:27:51.714Z
Primary input domain: https://aqprompts.com
Expected canonical origin: https://www.aqprompts.com

## Verdict

**DEPLOYED VERSION IS STALE — LIVE CHECKS DO NOT REPRESENT THE VERIFIED LOCAL RELEASE.**

- Checks passed: **16**
- Checks failed: **38**
- Sitemap URLs tested: **0**

| Check | Status | Detail | URL |
|---|---|---|---|
| Non-www canonical redirect | FAIL | HTTP 404; target missing | https://aqprompts.com/ |
| / status | FAIL | HTTP 404 | https://www.aqprompts.com/ |
| /privacy status | FAIL | HTTP 404 | https://www.aqprompts.com/privacy |
| /cookie-policy status | FAIL | HTTP 404 | https://www.aqprompts.com/cookie-policy |
| /terms status | FAIL | HTTP 404 | https://www.aqprompts.com/terms |
| /disclaimer status | FAIL | HTTP 404 | https://www.aqprompts.com/disclaimer |
| /author/abdul-qudoos status | FAIL | HTTP 404 | https://www.aqprompts.com/author/abdul-qudoos |
| /editorial-policy status | FAIL | HTTP 404 | https://www.aqprompts.com/editorial-policy |
| /how-we-review-prompts status | FAIL | HTTP 404 | https://www.aqprompts.com/how-we-review-prompts |
| /account/sign-in status | FAIL | HTTP 404 | https://www.aqprompts.com/account/sign-in |
| /promptshe-trial status | FAIL | HTTP 404 | https://www.aqprompts.com/promptshe-trial |
| /blog/luxury-mens-fashion-ai-portrait-prompts status | FAIL | HTTP 404 | https://www.aqprompts.com/blog/luxury-mens-fashion-ai-portrait-prompts |
| /tools/ai-image-prompts/p/all-white-luxury-riverside-aesthetic-male-portrait status | FAIL | HTTP 404 | https://www.aqprompts.com/tools/ai-image-prompts/p/all-white-luxury-riverside-aesthetic-male-portrait |
| /tools/ai-image-prompts/p/golden-hour-urban-portrait-boy-in-monochromatic-chocolate-brown status | FAIL | HTTP 404 | https://www.aqprompts.com/tools/ai-image-prompts/p/golden-hour-urban-portrait-boy-in-monochromatic-chocolate-brown |
| /robots.txt status | FAIL | HTTP 404 | https://www.aqprompts.com/robots.txt |
| /sitemap.xml status | FAIL | HTTP 404 | https://www.aqprompts.com/sitemap.xml |
| /rss.xml status | FAIL | HTTP 404 | https://www.aqprompts.com/rss.xml |
| /favicon.svg status | FAIL | HTTP 404 | https://www.aqprompts.com/favicon.svg |
| /apple-touch-icon.png status | FAIL | HTTP 404 | https://www.aqprompts.com/apple-touch-icon.png |
| /manifest.webmanifest status | FAIL | HTTP 404 | https://www.aqprompts.com/manifest.webmanifest |
| HTTPS final URL | PASS | https://www.aqprompts.com/ | https://www.aqprompts.com/ |
| Security header: x-content-type-options | FAIL | missing |  |
| Security header: x-frame-options | FAIL | missing |  |
| Security header: referrer-policy | FAIL | missing |  |
| Security header: permissions-policy | FAIL | missing |  |
| Security header: strict-transport-security | PASS | max-age=63072000 |  |
| Response compression | FAIL | not reported |  |
| Homepage cache policy | PASS | public, max-age=0, must-revalidate |  |
| Homepage visible H1 | FAIL | missing |  |
| Homepage structured data | FAIL | missing |  |
| Homepage canonical | FAIL | missing |  |
| Open Graph image loads | FAIL | og:image missing |  |
| Current Phase 4 deployment marker | FAIL | current marker absent |  |
| Old or unsupported homepage copy absent | PASS | no old marker found |  |
| Sensitive prompt is noindex,follow | FAIL | robots meta missing |  |
| Representative safe prompt remains indexable | PASS | default indexable |  |
| Quarantined prompt placeholder | FAIL | placeholder absent |  |
| Newsletter form present | FAIL | not detected |  |
| Copy-unlock control present | FAIL | not detected |  |
| Account sign-in form present | FAIL | not detected |  |
| Community-preview form present | FAIL | not detected |  |
| robots excludes admin | FAIL | missing |  |
| Sitemap excludes admin/API | PASS | none found |  |
| Noindex prompt excluded from sitemap | PASS | excluded |  |
| All sitemap URLs return 200 | FAIL | 0 checked; 0 non-200 |  |
| Representative rendered images load | PASS | 0 checked; 0 non-200 |  |
| Private path blocked: /.env | PASS | HTTP 404 |  |
| Private path blocked: /.git/config | PASS | HTTP 404 |  |
| Private path blocked: /docs/IMAGE_PROVENANCE_REGISTER.json | PASS | HTTP 404 |  |
| Private path blocked: /content/provenance/OWNER_MEDIA_DECLARATION.json | PASS | HTTP 404 |  |
| Private path blocked: /content/testing/_TEMPLATE.json | PASS | HTTP 404 |  |
| Private path blocked: /package.json | PASS | HTTP 404 |  |
| Private path blocked: /database.sql | PASS | HTTP 404 |  |
| Private path blocked: /debug.log | PASS | HTTP 404 |  |

## Browser/account limitations

- HTTP verification does not submit account, newsletter, copy-unlock, Paddle, or trial forms.
- Consent network behavior and mobile/desktop layout require the separate browser regression scripts.
- No Search Console, AdSense, CMP-provider, DNS, or indexing action is claimed.
