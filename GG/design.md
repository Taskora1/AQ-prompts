# AQPrompts Web Design

## 1. Product overview
AQPrompts is a content-heavy marketing and discovery website for AI image prompts. The product combines:

- a public prompt library for creators and social-media users
- category-based prompt browsing and SEO-rich landing pages
- blog and editorial content about AI prompting and creator workflows
- optional newsletter/community conversion flows
- a private/admin content-management layer for adding and moderating prompts and content

The site is built to help users quickly find high-quality prompt ideas, copy them into AI tools, and convert them into repeat visits through editorial trust and search visibility.

## 2. Core user goals

### Primary users
- Creators looking for ready-to-use AI prompts for portraits, photo editing, fashion, lifestyle, and social content
- Designers and marketers who want fast prompt variations for brand visuals
- AI enthusiasts exploring prompt structures and best practices through guides and articles
- Site editors/admins who manage prompt records, editorial pages, and SEO metadata

### Key user journeys
1. Visit the homepage and browse trending or freshly added prompts
2. Filter by platform, category, or use case
3. Open a prompt detail page to read the prompt and copy it
4. Read supporting blog content or category guides
5. Subscribe to newsletter/community offers when relevant
6. Admins manage prompts and content from internal/admin tooling

## 3. Design goals
- Clear and conversion-focused landing pages
- Fast discovery through categories, filters, and curated prompt cards
- Strong SEO and structured data for content ranking
- Trust-first editorial tone with clear disclosure and safety messaging
- Responsive layout across desktop and mobile
- Secure configuration and content publishing workflow

## 4. High-level architecture

### Frontend stack
- Next.js (App Router)
- React 18
- Tailwind CSS for styling
- lucide-react for icons
- custom UI components in `src/components`

### Runtime and hosting
- Deployment target: Vercel
- App uses server-rendered pages and static generation patterns where appropriate
- Metadata and SEO are centralized through reusable helpers
- Dynamic content is often loaded through server-side data fetchers in `src/lib`

### Data and content model
The site is not just a standard marketing landing page; it is a content-driven library with multiple content types:

- Prompts
  - title, slug, category, platform, use case
  - image/media metadata
  - status (published, hidden, draft, etc.)
  - tags, SEO data, and public indexability metadata
- Blog posts / guides
  - editorial copy, excerpts, featured images, categories
  - publication metadata and canonical information
- Admin-managed content
  - prompt CRUD operations
  - revalidation and publishing workflows
  - analytics or content verification scripts

### Code organization
- `app/` — route structure and page entry points
- `src/components/` — UI building blocks and sections
- `src/lib/` — business logic, metadata, DB helpers, prompt utilities, SEO helpers
- `public/` — static assets, images, icons, and social media files
- `scripts/` — content generation, migrations, environment and SEO validation tooling

## 5. Page and feature structure

### Homepage
The homepage is a curated landing experience centered around:
- hero section with CTA to the prompt library
- featured AI tools / platform chips
- newly added prompts
- blog guide cards
- trust and editorial credibility sections
- FAQ schema for search-enhancement

### Prompt library and category pages
The prompt library acts as the core discovery engine. It supports:
- category landing pages
- platform filtering
- search-oriented prompt browsing
- prompt card presentation with metadata and actions
- stable URLs for each prompt and category

### Blog and editorial content
The site includes guide and article content for SEO and thought leadership. This strengthens the brand while also creating content clusters around prompt use cases and AI workflows.

### Account and community flows
The project includes account-related routes and community-style conversion flows such as:
- account management
- free community trial or trial signup
- newsletter and audience growth paths

### Admin and publishing workflows
The admin side enables operations like:
- prompt ingestion and updates
- editorial status management
- revalidation of generated pages
- verification/audit scripts for content quality and production safety

## 6. UX and visual design system

### Design language
- warm-orange accent palette anchored by `#ff6b35`
- high-contrast dark/light theme support
- clean sans-serif typography using Inter
- strong typographic hierarchy for editorial storytelling and CTA emphasis
- card-based layouts for prompt discovery and guide posts

### Interaction patterns
- large CTA buttons for prompt exploration
- clickable category/platform navigation
- copy actions and prompt cards optimized for speed
- responsive collapsible footer sections
- cookie consent and analytics gating for privacy-aware UX

### Accessibility and quality standards
The design and implementation pay attention to:
- skip links for keyboard navigation
- semantic section headings and nav landmarks
- dark mode support
- safe image handling and disclosure metadata
- SEO metadata and social preview metadata

## 7. Technical behaviors and runtime patterns

### Server-first rendering
Several pages are rendered server-side or using static generation patterns to maximize SEO and performance. Metadata is built centrally for dynamic pages and static routes.

### Revalidation and caching
The app uses controlled invalidation and cache refresh strategies, including:
- short- and long-duration revalidation values
- explicit revalidation hooks for admin updates
- rebuild/content pipeline scripts to keep prompt and blog data synchronized

### Data fetching pattern
The project keeps domain logic separated into data-access modules under `src/lib`, which fetch content and shape it before UI rendering. This keeps page components more presentational and easier to maintain.

## 8. SEO and search strategy
SEO is one of the central pillars of this product.

- static metadata generation for pages and content collections
- structured data (JSON-LD) for FAQs and content entities
- canonical URLs and social metadata
- prompt pages optimized as discoverable assets
- blog/content clustering around AI prompt use cases
- sitemap and feed outputs for external discovery

The site explicitly values indexing, social previews, and clearer match quality for user intent around AI prompt discovery.

## 9. Content and trust model
The project presents itself as a quality-oriented prompt library rather than a generic aggregation site. This is reinforced by:
- editorial review language
- clear AI policy and media disclosure patterns
- creator-focused narratives and guide content
- trust sections and founder/author presence
- policies for copyright, privacy, terms, and refund handling

## 10. Security and operational safeguards
The app includes a production-aware configuration discipline:
- environment variables separated into public and server-only categories
- preview vs production deployment checks
- cookie consent and privacy compliance controls
- content validation and audit scripts
- verification tasks to check environment usage, image provenance, and content safety

This keeps the site safer and more production-ready, especially when it operates in a public and content-heavy environment.

## 11. Summary
AQPrompts is designed as a modern content-first AI prompt discovery platform. Its architecture blends a strong SEO and editorial foundation with a practical prompt library, responsive UI, and admin-driven publishing system. The design is optimized for four goals at once:

- discoverability
- usability
- trust-building
- scalable content operations

This combination makes the product feel like both a content brand and a functional tool library, rather than a simple landing page.
