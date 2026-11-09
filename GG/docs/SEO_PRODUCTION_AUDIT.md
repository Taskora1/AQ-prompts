# AQPrompts Production SEO Audit

Audit date: 2026-05-28
Build target: Next.js production build
Canonical host: https://www.aqprompts.com

## Executive Summary

The migrated Next.js site is close to indexable, but it is not launch-clean yet. Metadata, canonical tags, robots.txt, static generation, image alt text, and most structured data are present. The main blockers are crawlability issues: the sitemap includes three URLs that return 404, sitewide navigation links point to missing routes, and the live missing blog-post path returns 500 instead of a clean 404.

Priority before launch:

1. Fix or remove sitemap URLs that return 404: `/tools`, `/tools/photo-editing-prompts`, `/category/instagram-growth`.
2. Fix sitewide internal links to those same missing routes.
3. Fix blog post internal links to missing posts or create/redirect those posts.
4. Fix heading structure on `/blog` and `/blog/ai-portrait-prompts-viral-content`.
5. Trim long prompt meta descriptions to search-snippet length.

## SEO Issue Report

### Canonical Tags

Status: mostly pass

Rendered HTML audit found exactly one canonical tag on all 85 generated HTML pages.

Examples:

- `/` canonical: `https://www.aqprompts.com`
- `/blog` canonical: `https://www.aqprompts.com/blog`
- `/tools/ai-image-prompts` canonical: `https://www.aqprompts.com/tools/ai-image-prompts`
- Prompt pages canonicalize to their own `/tools/ai-image-prompts/p/:slug` URL.

Issue:

- Sitemap contains canonical-looking URLs for routes that are not served: `/tools`, `/tools/photo-editing-prompts`, `/category/instagram-growth`.

Recommendation:

- Either create those pages, redirect them to valid pages, or remove them from `app/sitemap.js`.

### Metadata

Status: partial pass

Good:

- Titles and descriptions are rendered for all audited indexable pages.
- Open Graph and Twitter metadata are generated for static, blog, and prompt pages.
- Prompt pages have unique titles and canonical URLs.

Issues:

- Many prompt pages render overlong meta descriptions. Sample rendered lengths: 480, 523, 560, 610 characters.
- `/blog/ai-portrait-prompts-viral-content` rendered description length is 182 characters, slightly long.
- Category/listing titles are short and acceptable, but some are generic.

Recommendation:

- Clamp prompt descriptions to about 150-160 characters in `app/tools/ai-image-prompts/p/[promptSlug]/page.next.jsx`.
- Prefer `seoDescription` fields in `public/data/prompts-index.json` for important prompt pages.

### Structured Data

Status: partial pass

Detected JSON-LD types:

- `WebSite`: static/blog pages
- `BreadcrumbList`: static/blog pages
- `BlogPosting`: blog post page
- `CollectionPage`: blog and prompt listing/category pages
- `CreativeWork`: prompt detail pages

Issues:

- Prompt detail pages only emit `CreativeWork`; they do not emit breadcrumb JSON-LD.
- Prompt listing/category pages emit `CollectionPage`, but not `BreadcrumbList`.
- The 404 page has no JSON-LD, which is acceptable, but noted by the audit.

Recommendation:

- Add breadcrumb JSON-LD to prompt listing, category, and detail pages.
- Consider `ImageObject` within prompt schema for richer image context.

### Sitemap

Status: fail until corrected

Production server check:

- `/sitemap.xml`: returns 200
- URL count: 87

Sitemap URLs returning errors:

- `https://www.aqprompts.com/tools`: 404
- `https://www.aqprompts.com/tools/photo-editing-prompts`: 404
- `https://www.aqprompts.com/category/instagram-growth`: 404

Recommendation:

- Remove these entries from `app/sitemap.js`, or add corresponding App Router pages/redirects.

### Robots.txt

Status: pass

Production server check:

```txt
User-Agent: *
Allow: /
Host: https://www.aqprompts.com
Sitemap: https://www.aqprompts.com/sitemap.xml
```

Recommendation:

- Keep as-is for launch.
- Optional: remove `Host` if you want strict cross-engine minimalism, but it is not a blocker.

### Internal Linking

Status: fail until corrected

Broken or non-serving internal links found in rendered HTML:

- Sitewide/footer/nav links to `/tools`
- Sitewide/footer/nav links to `/tools/photo-editing-prompts`
- Sitewide/footer/nav links to `/category/instagram-growth`
- Home link to `/faq`
- Blog post links to `/blog/mastering-ai-portrait-prompts`
- Blog post links to `/blog/instagram-reels-not-getting-views-fix`
- Blog post category link to `/category/ai-prompts`

Production status samples:

- `/tools`: 404
- `/tools/photo-editing-prompts`: 404
- `/category/instagram-growth`: 404
- `/blog/mastering-ai-portrait-prompts`: 500

Recommendation:

- Create pages, add redirects, or remove/update links before launch.
- Missing dynamic blog slugs should call `notFound()` cleanly rather than throwing a 500.

### Rendered HTML

Status: partial pass

Good:

- 85 static HTML pages generated.
- Rendered pages include canonical tags, meta descriptions, and crawlable HTML content.
- Images have alt attributes in audited rendered HTML.

Issues:

- `/blog` has 0 rendered H1 tags.
- `/blog/ai-portrait-prompts-viral-content` has 2 rendered H1 tags.
- Largest rendered HTML page is `/tools/ai-image-prompts` at about 497 KB, mostly from rendering the full prompt library.

Recommendation:

- Add one visible H1 to `/blog`.
- Remove one H1 from the blog article content or template so each post renders one H1.
- Consider paginating or reducing initial server-rendered prompt cards on the main prompt index.

### Prompt Page SEO

Status: good foundation, needs polish

Good:

- Prompt detail pages are statically generated.
- Each prompt page has a canonical, title, description, image metadata, one H1, and `CreativeWork` JSON-LD.
- Prompt images use WebP and have alt attributes.
- Related prompt links create internal discovery paths.

Issues:

- Meta descriptions are often too long because `intro` is not truncated.
- Prompt JSON-LD lacks breadcrumbs.
- Some prompt listing pages are heavy due to many cards/images in initial HTML.

Recommendation:

- Clamp prompt description output.
- Add breadcrumb JSON-LD.
- Consider pagination or category-first indexing strategy for the main prompt library.

### Blog SEO

Status: needs attention

Good:

- Blog article page has canonical metadata, `BlogPosting` JSON-LD, article dates, author/publisher data, and crawlable article body.
- Blog listing has `CollectionPage` JSON-LD.

Issues:

- `/blog` has no H1.
- The current blog post renders two H1 tags.
- Several in-article links point to posts that do not exist.
- Missing blog slugs can return 500 because JSON-LD generation assumes the post exists.

Recommendation:

- Make blog listing render a single H1.
- Strip the first article-content H1 or render article body starting after the title.
- Create, redirect, or remove missing blog links.
- Wrap dynamic blog page data/schema fetches with `notFound()`.

## Performance Report

### Build Output

Production build passed.

Build characteristics:

- 89 static pages generated by Next.js.
- Shared first-load JS: about 102 KB.
- Prompt detail pages are SSG via `generateStaticParams`.

### Rendered HTML Weight

Largest rendered pages:

- `/tools/ai-image-prompts`: about 497 KB HTML, 72 images
- `/tools/ai-image-prompts/boys`: about 195 KB HTML, 24 images
- `/tools/ai-image-prompts/cinematic`: about 172 KB HTML, 21 images
- `/tools/ai-image-prompts/girls`: about 134 KB HTML, 16 images
- `/tools/ai-image-prompts/celebrations`: about 133 KB HTML, 16 images

### Core Web Vitals Readiness

Likely strengths:

- Static generation improves TTFB readiness.
- WebP assets are used.
- Most images appear lazy-loaded or priority-managed.
- JS bundle size is reasonable for a content site.

Risks:

- The main prompt library renders a large amount of HTML and many images.
- Client components, animations, confetti, and large prompt payloads can affect INP on lower-end mobile devices.
- LCP should be tested with Lighthouse/WebPageTest after deployment because local HTML checks cannot measure real network/font/image timing.

Recommendations:

- Audit LCP image priority on home and prompt listing pages.
- Paginate or virtualize the full prompt library page.
- Run Lighthouse against the deployed Vercel preview before production cutover.

## Indexing Readiness Report

Ready:

- Canonical host is consistent.
- `robots.txt` allows crawling and references sitemap.
- App Router static pages render crawlable HTML.
- Prompt pages and blog post are statically generated.
- Metadata and canonical tags are present.

Not ready:

- Sitemap includes 404 URLs.
- Sitewide internal links point to missing routes.
- Some missing dynamic blog URLs return 500.
- Heading structure has defects on blog listing/article pages.
- Prompt meta descriptions are too long for reliable snippet control.

Indexing readiness verdict: not launch-ready until crawl errors are fixed.

## Launch Checklist

Blocking before launch:

- [ ] Remove or implement `/tools`.
- [ ] Remove or implement `/tools/photo-editing-prompts`.
- [ ] Remove or implement `/category/instagram-growth`.
- [ ] Remove, redirect, or create `/category/ai-prompts`.
- [ ] Remove, redirect, or create `/blog/mastering-ai-portrait-prompts`.
- [ ] Remove, redirect, or create `/blog/instagram-reels-not-getting-views-fix`.
- [ ] Fix missing dynamic blog slugs so they return 404, not 500.
- [ ] Add one H1 to `/blog`.
- [ ] Ensure blog posts render one H1 total.
- [ ] Clamp prompt page meta descriptions.

Strongly recommended:

- [ ] Add breadcrumb JSON-LD to prompt pages and prompt category pages.
- [ ] Reduce initial HTML weight on `/tools/ai-image-prompts`.
- [ ] Run Lighthouse mobile on a Vercel preview URL.
- [ ] Validate sitemap in Google Search Console after deployment.
- [ ] Inspect several prompt pages with URL Inspection after launch.

Post-launch monitoring:

- [ ] Check Search Console Coverage/Indexing daily for the first week.
- [ ] Watch Core Web Vitals field data once available.
- [ ] Monitor 404 and 500 logs in Vercel.
- [ ] Submit sitemap after fixing invalid entries.
