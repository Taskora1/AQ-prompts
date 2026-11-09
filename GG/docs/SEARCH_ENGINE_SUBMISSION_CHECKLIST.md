# Search Engine Submission Checklist

## Repository readiness

- Preferred canonical host: `https://www.aqprompts.com`
- Non-www host should redirect directly to the preferred host.
- Admin and API routes are excluded from crawling/sitemaps.
- Account, saved-prompt, welcome, trial, and sensitive prompt routes use `noindex` where appropriate.
- Noindexed prompt routes are excluded from the generated sitemap.
- Sitemap, robots, canonical, author, article, and structured-data behavior passed the local production checks.
- The live site is currently an older deployment and must not be submitted as the verified Phase 5 release.

## Google Search Console manual actions

1. Add or open the Domain property for `aqprompts.com`. Complete DNS verification if it is not already verified.
2. Confirm that both `https://aqprompts.com` and `https://www.aqprompts.com` resolve under the verified property.
3. Submit `https://www.aqprompts.com/sitemap.xml`.
4. Use URL Inspection on the homepage, seven articles, strongest category pages, and selected indexable prompt pages.
5. Test the live URL before requesting indexing. Do not request indexing while old testimonials, unsupported testing claims, or unsafe prompt media remain live.
6. Request indexing gradually for the priority URLs in `docs/PRIORITY_INDEXING_URLS.md`.
7. Monitor Page indexing for soft 404, duplicate canonical, crawled-not-indexed, redirect, and server-error groups.
8. Review Core Web Vitals after sufficient field data exists.
9. Check Manual actions and Security issues before AdSense submission and after major releases.
10. Re-submit the sitemap only when its URLs or canonical decisions materially change.

No Search Console verification, sitemap submission, or indexing request is recorded as completed by this repository work.
