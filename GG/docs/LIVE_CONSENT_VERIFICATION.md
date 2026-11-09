# Live Consent Verification

Checked on July 26, 2026 against:

- `https://www.aqprompts.com/`
- Mobile viewport: 390px

## Result

**FAIL - THE LIVE DEPLOYMENT IS STALE.**

The automated consent regression timed out while waiting for the first-visit
consent banner. Therefore the following live behaviors are not verified:

- first-visit banner visibility;
- GA4 blocking before Analytics consent;
- Microsoft Clarity blocking before Analytics consent;
- Analytics loading after consent;
- accept/reject behavior;
- preference persistence;
- keyboard and focus behavior.

These behaviors pass against the verified local production build. That local
result is not evidence that the current live deployment passes.

## Required retest

After deploying the verified release:

```text
node scripts/verify-consent-runtime.mjs https://www.aqprompts.com/
npm run verify:live-browser -- https://www.aqprompts.com
```

Also perform a clean-browser manual check in every region where the intended
Google-certified CMP requirements apply. No external CMP configuration is
claimed.
