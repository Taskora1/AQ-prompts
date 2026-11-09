# AdSense Manual Application Checklist

## Required before applying

- [ ] Deploy the verified Phase 5 release.
- [ ] Confirm the live domain is not serving the older homepage/articles/prompt copy.
- [ ] Review all 49 quarantined asset records and keep unresolved media suppressed.
- [ ] Verify the `aqprompts.com` Domain property in Google Search Console.
- [ ] Submit the canonical sitemap and confirm priority URLs are eligible for indexing.
- [ ] Confirm Privacy, Cookie Policy, Terms, Disclaimer, About, Contact, author, editorial, and review pages are live.
- [ ] Confirm the consent manager blocks GA4 and Clarity before consent.
- [ ] Configure and verify a Google-certified CMP where Google’s region/product requirements make it necessary.
- [ ] Verify site ownership in AdSense.
- [ ] Complete identity, payment-profile, tax, and address requirements shown in the AdSense account.
- [ ] Obtain the real `pub-` publisher ID.
- [ ] Generate `public/ads.txt` only with the real ID using `npm run create:ads-txt -- --publisher-id=pub-<16 digits>`.
- [ ] Deploy and verify the real ads.txt response.
- [ ] Add AdSense code only after the real account/site instructions authorize it.
- [ ] Re-run consent, performance, placement, and policy checks after adding ad code.
- [ ] Submit the live site for AdSense review.

## Required after approval or when Google requests it

- [ ] Verify ads.txt status inside AdSense.
- [ ] Complete address PIN verification when triggered.
- [ ] Confirm ads do not appear on account-only, legal, empty saved-state, noindexed, or unsafe-media pages.
- [ ] Monitor Policy Centre notifications and fix issues before requesting another review.
- [ ] Review invalid traffic, accidental-click risk, and ad density.

## Optional but recommended

- [ ] Wait for several priority URLs to be indexed before applying.
- [ ] Review Search Console Core Web Vitals and Page indexing reports.
- [ ] Record an internal screenshot/date for consent, ads.txt, and placement verification.
- [ ] Keep prompt-testing evidence separate from editorial review claims.

No Google-certified CMP account setup, publisher ID, ads.txt publication, AdSense code placement, or review submission is claimed complete.
