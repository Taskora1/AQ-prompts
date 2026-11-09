# Structured Data Validation Report

Audit date: 2026-05-28
Build target: Next.js production build
Scope: rendered production HTML under `.next/server/app`

## Executive Summary

Breadcrumb structured data is now present across the rendered website and validates cleanly in the local production HTML audit.

Final validation results:

- Indexable pages audited: 85
- Pages missing JSON-LD: 0
- Pages missing BreadcrumbList JSON-LD: 0
- Breadcrumb format issues: 0
- Non-absolute breadcrumb URLs: 0
- Prompt pages missing CreativeWork: 0
- Prompt pages missing ImageObject: 0
- Blog posts missing BlogPosting: 0
- Prompt category/tool pages missing CollectionPage: 0

Production build and lint both pass.

## Changes Completed

### Prompt Detail Pages

Added full breadcrumb JSON-LD through the shared prompt schema path.

Breadcrumb hierarchy now matches actual navigation:

```txt
Home > AI Prompts > Prompt Category > Prompt Detail
```

Example:

```txt
Home > AI Prompts > Boys > Golden Hour Urban Portrait | Boy in Monochromatic Chocolate Brown
```

Preserved schema:

- CreativeWork
- WebSite
- BreadcrumbList

Added/enhanced schema:

- ImageObject inside CreativeWork `image`
- CreativeWork `isPartOf` CollectionPage relationship to the AI prompt library

### Prompt Category Pages

Added BreadcrumbList JSON-LD to all prompt category pages:

- `/tools/ai-image-prompts/boys`
- `/tools/ai-image-prompts/girls`
- `/tools/ai-image-prompts/business`
- `/tools/ai-image-prompts/celebrations`
- `/tools/ai-image-prompts/cinematic`
- `/tools/ai-image-prompts/lifestyle`
- `/tools/ai-image-prompts/photo-editing`

Breadcrumb hierarchy:

```txt
Home > AI Prompts > Category
```

Preserved schema:

- CollectionPage
- ItemList

Added schema:

- WebSite
- BreadcrumbList

### Tool / Prompt Library Page

Added BreadcrumbList JSON-LD to `/tools/ai-image-prompts`.

Breadcrumb hierarchy:

```txt
Home > AI Prompts
```

Preserved schema:

- CollectionPage
- ItemList

Added schema:

- WebSite
- BreadcrumbList

### Blog Posts

Blog posts already used the shared blog post JSON-LD builder. Validation confirms the rendered post keeps:

- BlogPosting
- WebSite
- BreadcrumbList

Breadcrumb hierarchy:

```txt
Home > Blog > Blog Post
```

### Blog Categories

There are no dedicated crawlable App Router blog category pages in the current site. Blog categories are implemented as filters on `/blog`, so `/blog` is the crawlable blog/category hub.

The `/blog` page validates with:

- CollectionPage
- BlogPosting entries in `hasPart`
- WebSite
- BreadcrumbList

Breadcrumb hierarchy:

```txt
Home > Blog
```

## Files Updated

- `src/components/prompts/PromptPages.jsx`
- `src/lib/metadata.js`
- `src/lib/seo.js`

## Rendered Schema Coverage

Final rendered audit type coverage:

```json
{
  "WebSite": 85,
  "BreadcrumbList": 85,
  "BlogPosting": 2,
  "CollectionPage": 79,
  "ItemList": 8,
  "CreativeWork": 70,
  "ImageObject": 85
}
```

Note: `BlogPosting: 2` includes the dedicated blog article plus the blog listing's nested post summary item.

## Validation Checks

The local production HTML audit checked:

- JSON-LD scripts parse as valid JSON
- Every indexable rendered page has BreadcrumbList
- Breadcrumb items use `ListItem`
- Breadcrumb positions are sequential
- Breadcrumb item names are present
- Breadcrumb URLs are absolute and canonical under `https://www.aqprompts.com`
- Prompt detail pages include CreativeWork
- Prompt detail pages include ImageObject
- Blog post pages include BlogPosting
- Prompt listing/category pages include CollectionPage

Result:

```json
{
  "auditedPages": 85,
  "issueCount": 0
}
```

## Build Validation

Passed:

```powershell
npm run lint
```

Passed:

```powershell
npm run build
```

## Remaining Structured Data Issues

None detected in the rendered production HTML audit.
