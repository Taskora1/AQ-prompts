# Phase 4 Runtime Verification

Verified July 26, 2026 against the locally built production server at `http://127.0.0.1:3010`.

## Production and mobile checks

- Representative trust, article, indexable prompt, and noindexed prompt routes rendered successfully.
- Every checked route had one visible H1, a canonical, parseable expected JSON-LD, and no missing image alt attributes.
- Every checked route fit a 390px viewport without horizontal overflow.
- The homepage and a representative article also passed at a 1440×1000 desktop viewport.
- The Phase 4 disclosure run found no browser log errors, runtime exceptions, or hydration exceptions.
- A generated prompt displayed “AI-generated example image for demonstration purposes.”
- An edited prompt displayed “AI-edited example image for demonstration purposes.”
- A specifically high-risk prompt displayed the neutral non-person placeholder.
- Article example imagery displayed an AI demonstration disclosure.
- The founder page rendered the real founder photograph, not an AI placeholder.

## Consent regression

- Google Analytics and Microsoft Clarity did not load before consent.
- The 390px consent banner fit the viewport and controls met the runtime touch-target check.
- Reject optional persisted all optional categories as disabled.
- The settings dialog received focus and closed with Escape.
- GA and Clarity loaded only after Analytics consent.
- Accept all persisted all optional categories as enabled.

## Scope

This verifies the local production build. The deployed production domain must still be checked after deployment because environment variables, CDN behavior, headers, and third-party services can differ.
