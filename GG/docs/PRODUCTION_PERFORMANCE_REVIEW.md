# Production Performance Review

Generated July 26, 2026 from the latest local production build. No PageSpeed Insights or Lighthouse score is claimed.

## Routes in scope

- `/`
- `/tools/ai-image-prompts`
- `/tools/ai-image-prompts/cinematic`
- `/tools/ai-image-prompts/p/all-white-luxury-riverside-aesthetic-male-portrait`
- `/blog/luxury-mens-fashion-ai-portrait-prompts`
- `/about`

## Build measurements

- JavaScript chunk files: **132**
- Aggregate emitted JavaScript size before transfer compression: **1.95 MiB**
- Chunks larger than 250 KiB: **1**
- Public raster images larger than 750 KiB: **1**
- Local registered non-SVG assets missing dimensions: **0**
- Remote Blob records without stored intrinsic dimensions: **130**
- Third-party script integrations found in application source: **Google Analytics, Microsoft Clarity, AdSense**

## Largest emitted JavaScript chunks

| Chunk | Size |
|---|---:|
| `.next/static/chunks/96.330b21da2084b0b8.js` | 351.2 KiB |
| `.next/static/chunks/3794-4baabb215de9bea2.js` | 218.8 KiB |
| `.next/static/chunks/4bd1b696-e356ca5ba0218e27.js` | 195.2 KiB |
| `.next/static/chunks/framework-38322766555dfd93.js` | 136.5 KiB |
| `.next/static/chunks/main-b6a3f52212b5e5bd.js` | 131.5 KiB |
| `.next/static/chunks/polyfills-42372ed130431b0a.js` | 110.0 KiB |
| `.next/static/chunks/70e0d97a.337966195abe6fe0.js` | 95.3 KiB |
| `.next/static/chunks/1734.de9ee377ef4714d4.js` | 80.4 KiB |
| `.next/static/chunks/54a60aa6.c91eaf7a7715b2ba.js` | 62.6 KiB |
| `.next/static/chunks/9858.b62a7dbb5a349efb.js` | 51.2 KiB |

## Oversized public raster assets

| Asset | Size |
|---|---:|
| `public/uploads/master-level-luxury-cinematic-ai-portrait-prompts.png` | 1925.5 KiB |

## Findings

- LCP risk is concentrated in prompt-card grids and article cover/example imagery. Next Image responsive sizing, WebP delivery, priority on the first meaningful image, and lazy loading for later images are already used.
- CLS risk is reduced by aspect-ratio containers and explicit image dimensions. Remote Blob images still depend on stable containers because their intrinsic metadata is not stored locally.
- Prompt library and homepage grids carry the largest hydration cost because search, carousel, engagement, saved-state, and consent interactions are client-side.
- Google Analytics and Clarity are the only analytics integrations found. Consent regression confirms they remain blocked before Analytics consent.
- No AdSense script is present. Adding advertising later will increase JavaScript, layout, and consent cost and must be measured after the real integration exists.
- Font loading uses the project’s Next.js font pipeline; production browser checks found no layout overflow or hydration exception.
- The consent banner fits 390px and uses stable fixed positioning, but its impact on real-user LCP/INP should be reviewed in production Core Web Vitals.

## Required follow-up

- Run PageSpeed Insights for the six representative live URLs after the verified release is deployed.
- Review LCP element, INP tasks, CLS sources, unused JavaScript, and image opportunities using real field/lab data.
- Recompress any future image above 750 KiB and retain dimensions/provenance.
- Re-test after adding a real CMP or AdSense code because those scripts are not present in this measurement.
