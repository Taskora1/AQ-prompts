# AQPrompts ISR Writes Audit

Audited July 26, 2026 in `E:\AQ\GG`. This report describes the verified local
release. It was not deployed.

## Executive finding

The code had five short time-based regeneration paths:

| Previous route/cache | Previous interval | Write mechanism |
|---|---:|---|
| `/` | 300 seconds | Route ISR plus an internal trending fetch with `next.revalidate: 300` |
| `/tools/ai-image-prompts/trending` | 300 seconds | Route ISR despite the page being a static client shell |
| `/api/prompts` | 300 seconds | Route-handler ISR |
| `/api/prompts/stats` | 60 seconds | Frequently requested engagement payload ISR |
| `/api/prompts/trending` | 300 seconds | Route ISR plus a second `unstable_cache` entry at 300 seconds |

The exact contribution of each path to Vercel's 201K writes cannot be proven
without provider-level usage logs. The code-level root cause is the combination
of these short intervals on high-traffic routes, the duplicated trending cache,
and broad admin invalidation.

Before this change, one prompt mutation could invalidate:

- homepage and categories index;
- prompt library, favourites, and trending pages;
- prompt, stats, and trending APIs;
- sitemap and three feed routes;
- all eight public category pages;
- every supplied old/new prompt slug.

That was at least 20 public cache targets for a common mutation, even when only
one prompt changed. Engagement POST routes did not directly call revalidation,
but the one-minute stats cache and five-minute trending caches still regenerated
as those engagement surfaces were read.

## Final cache architecture

- There are **no time-based revalidation intervals** in application source.
- The built prerender manifest contains **0 time-based ISR routes**.
- Homepage editorial content is deployment-static.
- All seven articles are build-time SSG and reject unknown article slugs.
- All 216 known prompt-detail slugs are build-time SSG.
- Legal, trust, author, category, library, and feed routes are build-static.
- Prompt stats and trending data are dynamic `no-store` endpoints. They never
  regenerate public HTML.
- Views, copies, likes, ratings, favourites, and recent-history interactions do
  not call any Next.js cache-invalidation primitive.
- Only authenticated admin content mutations can invoke bounded, deduplicated
  `revalidatePath` sets.

`â—‹` means static output, `â—` means build-time SSG using
`generateStaticParams`, and `Æ’` means dynamic request-time execution.

## Public page route audit

| Route | Mode | Interval | Regeneration trigger | ISR required? | Excess-write risk | Recommendation |
|---|---|---:|---|---|---|---|
| `/` | â—‹ Static | None | New deployment only | No | None | Keep deployment-static; trending cards use the build snapshot |
| `/about` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/author/abdul-qudoos` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/blog` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/blog/consistent-face-ai-portrait-prompts-women-girls-2026` | â— SSG | None | New deployment | No | None | Keep SSG |
| `/blog/free-ai-fashion-photo-prompts-instagram-2026` | â— SSG | None | New deployment | No | None | Keep SSG |
| `/blog/elegant-female-ai-portrait-prompts` | â— SSG | None | New deployment | No | None | Keep SSG |
| `/blog/luxury-ai-fashion-photography-prompts-for-women` | â— SSG | None | New deployment | No | None | Keep SSG |
| `/blog/luxury-businessman-ai-portrait-prompts` | â— SSG | None | New deployment | No | None | Keep SSG |
| `/blog/luxury-mens-fashion-ai-portrait-prompts` | â— SSG | None | New deployment | No | None | Keep SSG |
| `/blog/luxury-travel-ai-portrait-prompts` | â— SSG | None | New deployment | No | None | Keep SSG |
| `/categories` | â—‹ Static | None | Deployment; structural admin prompt/category change | Only on admin change | Low | Keep static and narrowly invalidate only for count/structure changes |
| `/contact` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/cookie-policy` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/disclaimer` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/editorial-policy` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/guides` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/how-we-review-prompts` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/privacy` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/prompts` | â—‹ Static | None | New deployment | No | None | Keep static redirect/landing behavior |
| `/promptshe-trial` | â—‹ Static | None | New deployment | No | None | Keep static shell; submission stays dynamic API |
| `/refund-policy` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/terms` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/tools` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/tools/ai-image-prompts` | â—‹ Static | None | Deployment; one admin prompt mutation | Only on admin change | Low | Keep build-static with narrow on-demand admin refresh |
| `/tools/ai-image-prompts/boys` | â—‹ Static | None | Deployment; mutation of a matching prompt | Only on admin change | Low | Keep static; invalidate this category only when affected |
| `/tools/ai-image-prompts/business` | â—‹ Static | None | Deployment; mutation of a matching prompt | Only on admin change | Low | Keep static; invalidate this category only when affected |
| `/tools/ai-image-prompts/celebrations` | â—‹ Static | None | Deployment; mutation of a matching prompt | Only on admin change | Low | Keep static; invalidate this category only when affected |
| `/tools/ai-image-prompts/cinematic` | â—‹ Static | None | Deployment; mutation of a matching prompt | Only on admin change | Low | Keep static; invalidate this category only when affected |
| `/tools/ai-image-prompts/couples` | â—‹ Static | None | Deployment; mutation of a matching prompt | Only on admin change | Low | Keep static; invalidate this category only when affected |
| `/tools/ai-image-prompts/girls` | â—‹ Static | None | Deployment; mutation of a matching prompt | Only on admin change | Low | Keep static; invalidate this category only when affected |
| `/tools/ai-image-prompts/lifestyle` | â—‹ Static | None | Deployment; mutation of a matching prompt | Only on admin change | Low | Keep static; invalidate this category only when affected |
| `/tools/ai-image-prompts/photo-editing` | â—‹ Static | None | Deployment; mutation of a matching prompt | Only on admin change | Low | Keep static; invalidate this category only when affected |
| `/tools/ai-image-prompts/favorites` | â—‹ Static shell | None | New deployment | No | None | Keep client-side favourites; never invalidate for user actions |
| `/tools/ai-image-prompts/trending` | â—‹ Static shell | None | New deployment | No | None | Keep shell static; fetch dynamic trending data client-side |
| `/tools/ai-image-prompts/p/[promptSlug]` (216 known slugs) | â— SSG | None | Deployment; targeted admin change for that slug; first request for a newly created valid admin slug | Only on admin change/new slug | Low to medium | Keep known slugs SSG; revalidate only old/new affected slug |
| `/vip-creator-club` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/welcome` | â—‹ Static | None | New deployment | No | None | Keep static, noindex |
| `/_not-found` | â—‹ Static | None | New deployment | No | None | Keep static |

The prompt dynamic pattern remains open for a newly created, valid database
prompt so the admin create flow can publish one route without rebuilding all 216
existing prompt pages. Known slugs are generated during the build.

## User-specific and commerce page audit

| Route | Mode | Interval | What makes it dynamic | ISR required? | Risk | Recommendation |
|---|---|---:|---|---|---|---|
| `/account` | Æ’ Dynamic | None | Authenticated user/subscription state | No | None | Keep request-dynamic |
| `/account/sign-in` | Æ’ Dynamic | None | Query-string error state | No | None | Keep dynamic and noindex |
| `/account/portal` | Æ’ POST route | None | Authenticated Paddle portal session | No | None | Keep dynamic/no-store |
| `/pricing` | Æ’ Dynamic | None | Request headers, country, and signed-in user | No | None | Keep dynamic; Paddle client handles localized prices |

## Admin route audit

All admin pages and mutations are request-dynamic and protected by the admin
proxy. They have no time-based ISR interval.

| Route | Mode | Regeneration/invalidation behavior | Risk | Recommendation |
|---|---|---|---|---|
| `/admin` | Æ’ | Reads current admin/dashboard data; no invalidation | None | Keep dynamic |
| `/admin/activity` | Æ’ | Reads activity records; no invalidation | None | Keep dynamic |
| `/admin/analytics` | Æ’ | Reads analytics; no invalidation | None | Keep dynamic |
| `/admin/categories` | Æ’ | Reads category data; no page regeneration on GET | None | Keep dynamic |
| `/admin/login` | Æ’ | Session-aware login | None | Keep dynamic |
| `/admin/prompts/new` | Æ’ | Form shell; mutation occurs in API | None | Keep dynamic |
| `/admin/prompts/[id]/edit` | Æ’ | Reads one current prompt; mutation occurs in API | None | Keep dynamic |
| `/admin/users` | Æ’ | Reads protected user data | None | Keep dynamic |
| `/admin/api/prompts` | Æ’ POST | At most 10 unique cache paths on create | Low, admin-only | Keep bounded invalidation |
| `/admin/api/prompts/[id]` | Æ’ PUT/DELETE | 4-5 paths for normal edit; at most 12 for structural edit; at most 10 for delete | Low, admin-only | Keep bounded invalidation |
| `/admin/api/categories` | Æ’ POST | No public invalidation because a new admin category has no mapped public page | None | Keep dynamic |
| `/admin/api/categories/[id]` | Æ’ PUT/DELETE | Rename invalidates at most 6 paths; safe delete performs no broad invalidation | Low, admin-only | Keep bounded invalidation |
| `/admin/api/upload` | Æ’ POST | Upload only; no page invalidation | None | Keep dynamic |
| `/admin/api/users` | Æ’ POST | User mutation only; no public invalidation | None | Keep dynamic |
| `/admin/api/users/[id]` | Æ’ PUT/DELETE | User mutation only; no public invalidation | None | Keep dynamic |
| `/admin/login/submit` | Æ’ POST | Session mutation only | None | Keep dynamic |
| `/admin/logout` | Æ’ POST | Session mutation only | None | Keep dynamic |

### Exact admin invalidation bounds

- Prompt create: homepage, prompt library, prompt JSON API, new prompt route,
  its one relevant category, categories index, sitemap, RSS, Atom/feed, and
  Pinterest feed: **at most 10 unique paths**.
- Ordinary prompt edit with the same slug/status: library, prompt JSON API,
  affected prompt, and old/new relevant categories: **4-5 unique paths**.
- Slug/status-changing prompt edit: adds the homepage, old/new prompt routes,
  categories index, sitemap, and three feeds: **at most 12 unique paths**.
- Prompt delete: same structural set for the deleted prompt: **at most 10 unique
  paths**.
- Category rename: categories index, prompt library, prompt JSON API, old/new
  category routes, and sitemap: **at most 6 unique paths**.

All arrays are filtered and deduplicated before `revalidatePath` executes.
Favourites shell, trending shell, engagement APIs, unrelated categories,
unrelated prompt pages, and all existing prompt routes are excluded. The
homepage is invalidated only for structural prompt changes so Newly Added can
include newly published prompts.

## Public API and metadata route audit

| Route | Mode | Interval/cache | Regeneration trigger | ISR required? | Risk | Recommendation |
|---|---|---|---|---|---|---|
| `/api/prompts` | â—‹ Static route | None; long-lived CDN response | Deployment or targeted admin prompt change | Only on admin change | Low | Keep force-static and invalidate once per content mutation |
| `/api/prompts/stats` | Æ’ Dynamic | `private, no-store` | Every request reads engagement storage | No | None | Keep dynamic; never invalidate HTML |
| `/api/prompts/trending` | Æ’ Dynamic | `private, no-store` | Every request computes current ranking | No | None | Keep dynamic; no `unstable_cache` |
| `/api/prompts/[id]/view` | Æ’ POST | No page cache | Valid unique view updates KV | No | None | Keep engagement-only |
| `/api/prompts/[id]/copy` | Æ’ POST | No page cache | Valid unique copy updates KV | No | None | Keep engagement-only |
| `/api/prompts/[id]/like` | Æ’ POST | No page cache | Like toggle updates KV | No | None | Keep engagement-only |
| `/api/prompts/[id]/rate` | Æ’ POST | No page cache | Rating updates KV | No | None | Keep engagement-only |
| `/api/auth/request-link` | Æ’ POST | No page cache | Email/auth mutation | No | None | Keep dynamic |
| `/api/auth/sign-out` | Æ’ POST | No page cache | Session mutation | No | None | Keep dynamic |
| `/api/auth/verify` | Æ’ GET | No invalidation | Token verification/session mutation | No | None | Keep dynamic |
| `/api/cron/weekly-prompts` | Æ’ GET | No invalidation | Scheduled email delivery only | No | None | Keep dynamic and authenticated |
| `/api/newsletter/subscribe` | Æ’ POST | No page cache | Subscription/email operation | No | None | Keep dynamic |
| `/api/paddle/webhook` | Æ’ POST | Force-dynamic | Verified billing webhook/database mutation | No | None | Keep dynamic; no content invalidation |
| `/api/promptshe/trial` | Æ’ POST | `no-store` | Trial submission | No | None | Keep dynamic |
| `/robots.txt` | â—‹ Static | None | New deployment | No | None | Keep static |
| `/sitemap.xml` | â—‹ Static | None | Deployment or structural prompt/category admin change | Only on structural admin change | Low | Keep static with narrow invalidation |
| `/rss.xml` | â—‹ Static | None | Deployment or structural prompt admin change | Only on structural admin change | Low | Keep static |
| `/feed.xml` | â—‹ Static | None | Deployment or structural prompt admin change | Only on structural admin change | Low | Keep static |
| `/pinterest-feed.xml` | â—‹ Static | None | Deployment or structural prompt admin change | Only on structural admin change | Low | Keep static |
| `/manifest.webmanifest` | â—‹ Static | None | New deployment | No | None | Keep static |

The cron GET route sends weekly email but contains no cache-invalidation
primitive. Webhooks and database/account mutations do not invalidate editorial
or prompt pages.

## Engagement separation

- Views, likes, ratings, and copies remain rate-limited KV/API mutations.
- Favourites, liked state, ratings state, viewed-session state, and recent
  history remain client-side where applicable.
- `/api/prompts/stats` and `/api/prompts/trending` are dynamic data endpoints,
  not ISR pages.
- The homepage no longer server-fetches trending engagement data.
- The trending page is a static shell whose client fetches current ranking.
- No engagement route imports or calls `revalidatePath`, `revalidateTag`,
  `updateTag`, `unstable_cache`, `cacheLife`, or `cacheTag`.

## Safeguard

Run:

```text
npm run audit:isr
```

The audit fails on:

- time-based revalidation below one hour;
- broad literal `revalidatePath` targets;
- invalidation in a GET handler module;
- cache invalidation in view/like/rate/copy endpoints;
- duplicated literal revalidation targets;
- looped revalidation that is not visibly deduplicated;
- future `revalidateTag`, `updateTag`, `unstable_cache`, `cacheLife`, and
  `cacheTag` usage is counted in its report for review.

Final result: 169 source files scanned, 0 intervals, 2 centralized
`revalidatePath` call sites, and 0 unsafe patterns.

## Verification

- `npm run audit:isr`: pass.
- `npm run lint`: pass.
- `npm run build`: pass.
- Static pages generated: 238 of 238.
- Prerendered route records: 223.
- Time-based ISR route records: 0.
- Homepage, library, two categories, two prompt pages, and all seven articles:
  HTTP 200 locally.
- Account and protected admin page navigation: reachable; admin mutation
  requests redirect unauthenticated callers before mutation.
- Engagement POST endpoints reject malformed test actions with HTTP 400 before
  touching KV.
- Local stats/trending requests return HTTP 500 because the local KV integration
  is not configured/reachable. This is an environment limitation, not an ISR
  regression, and no successful engagement-storage claim is made.
- A real authenticated admin mutation was not performed against the connected
  database; its bounded path behavior was verified from the centralized code and
  unauthenticated HTTP boundary.

## Expected effect

Normal traffic can no longer create writes through one-minute/five-minute page
or data-cache regeneration. The remaining writes are limited to deliberate,
authenticated content changes and the possible first render of a newly created
valid prompt slug. This should reduce ISR writes dramatically, but an exact
number or percentage is not claimed. Confirm the actual reduction in Vercel
usage after a future authorized deployment.


