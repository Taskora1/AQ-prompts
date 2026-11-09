# Prompt Listing Performance Optimization Report

Audit date: 2026-05-28
Build target: Next.js production build
Primary route: `/tools/ai-image-prompts`

## Executive Summary

The large prompt listing page has been optimized for a smaller initial HTML payload while preserving crawlable prompt discovery and SEO value.

Final production HTML measurement for `/tools/ai-image-prompts`:

- HTML size: ~203 KB
- Rendered images: 14
- Unique prompt detail links in rendered HTML: 70
- Total prompts in index: 70
- All prompt detail pages discoverable from rendered HTML: yes
- H1 count: 1
- Build: passed
- Lint: passed

The original SEO audit measured `/tools/ai-image-prompts` at about 497 KB HTML with 72 images. The optimized page is now about 59% smaller and renders far fewer initial images.

## Changes Completed

### Initial HTML Payload Reduction

The prompt listing no longer renders every prompt as a full image card on first load.

New strategy:

- `/tools/ai-image-prompts` renders the first 12 featured prompt cards.
- Prompt category pages render the first 18 category prompt cards.
- Remaining prompts are exposed through lightweight text links instead of full image cards.

This keeps the page useful and crawlable while avoiding a huge initial DOM and image workload.

### Crawlable Prompt Discovery Preserved

A lightweight `All prompt pages` directory was added below the main card grid.

Benefits:

- Google can discover every prompt detail URL from rendered HTML.
- Internal linking strength is preserved without rendering every image-heavy card.
- Users still have a complete prompt directory on the page.

Validation:

```json
{
  "promptCount": 70,
  "renderedPromptDetailLinks": 106,
  "uniquePromptDetailLinks": 70,
  "allPromptsDiscoverable": true
}
```

### Search Strategy Improved

The client listing now receives:

- a small full-card prompt set for the initial visible grid
- a lightweight search index for all prompts

Search results render as compact text result cards instead of full image cards. This improves INP readiness by reducing initial client-side component and image work.

### Image Loading Improved

The visible card grid now prioritizes only the first prompt image. Other prompt card images rely on Next/Image lazy loading behavior.

Expected benefits:

- Better LCP targeting for the first visible card image
- Fewer eager image candidates
- Lower mobile network pressure

### Category Filtering Bug Fixed

The `photo-editing` category route was falling through because category matching only checked object keys, not category slugs.

Fix:

- `getPromptsByCategory('photo-editing')` now correctly matches the `photoEditing` category by slug.

Result:

- `/tools/ai-image-prompts/photo-editing` now renders the correct subset instead of all prompts.
- Its HTML size is now about 81 KB.

## Route Measurements

| Route | HTML Size | Rendered Images | Unique Prompt Links Status |
| --- | ---: | ---: | --- |
| `/tools/ai-image-prompts` | ~203 KB | 14 | all 70 prompt pages discoverable |
| `/tools/ai-image-prompts/boys` | ~197 KB | 20 | category prompts discoverable |
| `/tools/ai-image-prompts/cinematic` | ~189 KB | 20 | category prompts discoverable |
| `/tools/ai-image-prompts/photo-editing` | ~81 KB | 6 | category prompts discoverable |

## SEO Preservation

Preserved:

- One H1 per listing page
- Crawlable prompt links
- Category navigation links
- Breadcrumb structured data
- CollectionPage structured data
- Prompt detail pages in sitemap
- Static generation for prompt detail pages

The optimized listing still supports efficient discovery through:

- rendered text links
- category pages
- related prompt links
- sitemap entries
- JSON-LD ItemList entries

## Performance Impact

Expected improvements:

- Lower HTML transfer size
- Smaller initial DOM
- Fewer initial image elements
- Lower hydration work on mobile
- Better INP readiness from fewer interactive card controls
- Better LCP readiness by prioritizing only the first visible card image

## Validation

Passed:

```powershell
npm run lint
```

Passed:

```powershell
npm run build
```

Rendered discovery validation:

```json
{
  "promptCount": 70,
  "uniquePromptDetailLinks": 70,
  "allPromptsDiscoverable": true
}
```

## Remaining Recommendations

No blocking issues remain for this optimization pass.

Future optional improvements:

- Add dedicated paginated routes such as `/tools/ai-image-prompts/page/2` if the prompt library grows beyond a few hundred prompts.
- Add real-user Core Web Vitals monitoring after deployment.
- Consider server-side search only if the prompt index becomes much larger.
