# AQPrompts Ad Placement Safety Plan

Prepared July 26, 2026. No AdSense publisher ID, live ad script or ad unit was added.

## Potential future placements

Only after image rights and AdSense account checks are complete:

- After an article’s introductory and author/evidence information, before a major section.
- Between substantial article sections where the ad is visually separated from content and controls.
- Below the main prompt explanation and responsible-use guidance on an indexable, evidence-safe prompt page.
- After a category’s meaningful introductory content and before a later card group.

Every future placement requires a clear ad label, responsive sizing, reserved layout space and a review for accidental-click risk.

## Prohibited placements

Do not place advertising:

- in or immediately under navigation;
- on admin, login, account, saved/favorites empty-state or payment-management pages;
- inside consent banners or cookie settings;
- beside copy, download, rating, navigation or share buttons;
- on legal, privacy, cookie, disclaimer, refund or editorial-policy pages;
- on thin, noindexed, unsafe or evidence-required pages;
- between an image and its disclosure;
- beside unknown-source or unverified-person imagery;
- above primary content in an intrusive layout;
- in a position resembling a download or action button;
- in email/community preview interfaces;
- where sticky behavior obscures content or consent controls.

## Layout preparation

No visual placeholder is inserted now because empty ad boxes create layout noise and can imply activation. Before enabling ads:

1. Select only routes that pass `docs/ADSENSE_INDEXABLE_PAGE_PREFLIGHT.md`.
2. Reserve height with responsive CSS to prevent layout shift.
3. Load scripts only after the required advertising consent state.
4. Confirm `ads.txt` using the real publisher ID from the approved account.
5. Verify mobile spacing, keyboard order and accidental-click separation.
6. Recheck Core Web Vitals and console/network behavior.

## Governance

Advertising does not change editorial conclusions, indexing decisions, corrections, provenance requirements or removal decisions. Sponsored or affiliate material requires separate disclosure and must not be represented by AdSense placement alone.

