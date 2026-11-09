# Initial Load Styling & FOUC Fix Report

Audit date: 2026-05-29
Scope: Next.js App Router root layout, global CSS, font loading, theme hydration, homepage above-the-fold rendering, production build output

## Summary

Fixed the initial raw-document / unstyled-content flash risk by stabilizing the root CSS, font, theme, and homepage above-the-fold render path.

Key outcomes:

- Root CSS now loads from `app/globals.css`.
- `html` and `body` have stable immediate base styles.
- Fonts are loaded through `next/font/google` and self-hosted by Next.js.
- Font rendering uses `display: swap`.
- The server-rendered `<html>` starts with `data-theme="light"` to avoid theme/background flicker.
- `next-themes` is still available for the existing theme toggle, but transitions are disabled during theme changes.
- Homepage hero prompt cards are seeded from server data instead of appearing as skeletons and swapping after hydration.
- Production build, lint, and SEO sanity checks pass.

## Files Changed

- `app/layout.next.jsx`
- `app/globals.css`
- `app/providers.jsx`
- `app/page.next.jsx`
- `src/index.css`
- `src/styles/base.css`
- `src/components/ThemeProvider.jsx`
- `src/components/home/HomeLanding.jsx`

## Root Layout Fixes

- Kept the root layout as a server component.
- Preserved metadata and viewport exports.
- Added `next/font/google` for Inter and Plus Jakarta Sans.
- Applied font CSS variables to `<html>`.
- Added a stable server-rendered theme attribute: `data-theme="light"`.
- Moved the root stylesheet import to `app/globals.css`.

## Global CSS Fixes

Added stable base styles for:

- `html` min-height
- `body` min-height
- margin reset
- background color
- text color
- color scheme
- box sizing
- font smoothing
- text rendering
- text-size adjustment

This prevents the page from visually falling back to browser-default Times New Roman / white raw document styling while the app hydrates.

## Font Loading Fixes

Implemented:

- `Inter` via `next/font/google`
- `Plus_Jakarta_Sans` via `next/font/google`
- `display: "swap"`
- CSS variables: `--font-sans` and `--font-display`
- self-hosted `.woff2` font output in `.next/static/media`

Production verification found 11 generated font files, all returning 200 from the local production server.

## Theme Flicker Fixes

- Server HTML now starts with `data-theme="light"`.
- `next-themes` still controls the theme toggle.
- `disableTransitionOnChange` prevents color transition flashes when the theme changes.
- `enableColorScheme` keeps browser form controls aligned with theme state.

## Homepage Above-The-Fold Fixes

The homepage previously fetched prompt data in `useEffect`, which made the hero prompt cards render as skeletons first and then swap after hydration.

Now:

- `app/page.next.jsx` reads prompt/post data at build time.
- `HomePage` receives deterministic initial prompts/posts.
- Hero prompt cards render in the initial static HTML.
- Random hero selection was removed from the initial viewport to prevent hydration mismatch and visual changes.

## Production Verification

Passed:

```powershell
npm run lint
```

Passed:

```powershell
npm run build
```

Production HTTP smoke check:

```json
{
  "HomeStatus": 200,
  "CssFiles": 2,
  "FontFiles": 11,
  "HomeHasDataTheme": true,
  "HomeHasHeroPrompt": true
}
```

SEO sanity check after changes:

```json
{
  "pages": 85,
  "issueCount": 0
}
```

Validated no regressions for:

- canonical tags
- meta descriptions
- H1 count
- JSON-LD presence
- sitemap route availability
- robots route availability

## Remaining Notes

No blocking issues remain from the local production audit.

For final visual confirmation, run Lighthouse or Chrome Performance on the deployed Vercel URL and verify the first paint no longer shows raw browser-default styling.
