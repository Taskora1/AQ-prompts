import fs from 'node:fs';
import path from 'node:path';

const provenanceRegister = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'docs', 'IMAGE_PROVENANCE_REGISTER.json'), 'utf8'),
);
const tombstoneEvidence = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'content', 'provenance', 'tombstone-replacements.json'), 'utf8'),
);
const tombstonePublicPaths = new Set(
  (tombstoneEvidence.records || []).map((record) => record.publicPath),
);
const quarantinedMediaRedirects = (provenanceRegister.records || [])
  .filter(
    (record) =>
      record.riskLevel === 'Critical'
      && record.path
      && !/^https?:\/\//i.test(record.path)
      && !tombstonePublicPaths.has(record.path),
  )
  .map((record) => ({
    source: record.path,
    destination: '/images/verified/media-evidence-placeholder.svg',
    permanent: false,
  }));

if (quarantinedMediaRedirects.length !== 0) {
  throw new Error(
    `Expected 54 quarantined media redirects, found ${quarantinedMediaRedirects.length}.`,
  );
}

if (tombstonePublicPaths.size !== 0) {
  throw new Error(`Expected no exact tombstone paths, found ${tombstonePublicPaths.size}.`);
}

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

// Non-production deploys (Cloudflare Pages preview branches) must not be
// indexed. CF_PAGES_BRANCH is set by Cloudflare Pages; fall back to the
// legacy VERCEL_ENV value so the same check still works on Vercel.
// The production branch is 'cloudflare-migration' (set as the production
// branch in the Cloudflare Pages project) — 'main'/'production' are the
// generic production names. Update PRODUCTION_BRANCHES if the production
// branch ever changes, otherwise the live site gets a noindex header.
// ENVIRONMENT, when set explicitly, wins over the branch name — same
// precedence as src/lib/deployment-env.js.
const PRODUCTION_BRANCHES = new Set(['main', 'production', 'cloudflare-migration']);
const explicitEnvironment = String(
  process.env.ENVIRONMENT || process.env.CF_PAGES_ENVIRONMENT || '',
).trim().toLowerCase();
const deployBranch = process.env.CF_PAGES_BRANCH
  || (process.env.VERCEL_ENV === 'preview' ? 'preview' : '')
  || '';
const isPreviewDeploy = explicitEnvironment === 'preview'
  || explicitEnvironment === 'development'
  || (explicitEnvironment !== 'production'
    && (deployBranch === 'preview'
      || (deployBranch !== '' && !PRODUCTION_BRANCHES.has(deployBranch))));

if (isPreviewDeploy) {
  securityHeaders.push({
    key: 'X-Robots-Tag',
    value: 'noindex, nofollow, noarchive',
  });
}

const immutableAssetHeaders = [
  {
    key: 'Cache-Control',
    value: 'public, max-age=31536000, immutable',
  },
];

const revalidatedDataHeaders = [
  {
    key: 'Cache-Control',
    value: 'no-store, max-age=0',
  },
];

const publicFeedHeaders = [
  {
    key: 'Cache-Control',
    value: 'public, max-age=300, stale-while-revalidate=1800',
  },
];

// Edge cache for public HTML pages only — lets Cloudflare's CDN serve a cached
// copy without invoking the Worker at all (0 CPU on a cache hit). Deliberately
// NOT applied to /admin, /api, /account or any user-specific route.
// s-maxage=3600 (1h at the edge) + stale-while-revalidate=86400 (serve stale
// for up to 24h while the Worker revalidates in the background).
const publicPageCacheHeaders = [
  {
    key: 'Cache-Control',
    value: 'public, s-maxage=3600, stale-while-revalidate=86400',
  },
];

// Public page routes that are the same for every visitor (no per-user content).
const publicPageCacheSources = [
  '/',
 // homepage
  '/tools/ai-image-prompts/:path*', // library, categories, prompt detail
  '/blog/:path*', // blog listing + post detail
  '/about',
  '/categories',
  '/author/:path*',
  '/feedback',
  '/pricing',
  '/vip-creator-club',
  '/promptshe-trial',
  '/secret-prompts',
  '/welcome',
  '/privacy',
  '/terms',
  '/cookie-policy',
  '/refund-policy',
  '/disclaimer',
  '/ai-policy',
  '/editorial-policy',
  '/how-we-review-prompts',
  '/contact',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  poweredByHeader: false,
  compress: true,
  devIndicators: false,
  experimental: {
    // inlineCss was inlining the whole 183 KB stylesheet (~26.5 KB
    // compressed, ~23 KB unused on the homepage) into every HTML page.
    // External stylesheets are cached across pages instead, so keep it off.
    inlineCss: false,
    optimizePackageImports: ['lucide-react'],
    // The database is reached over HTTP (Neon serverless driver), so
    // there is no per-worker connection pool to cap; worker count is
    // kept low to stay under the Neon HTTP request concurrency instead.
    cpus: 1,
  },
  async redirects() {
    return [
      ...quarantinedMediaRedirects,
      {
        source: '/guides',
        destination: '/blog',
        permanent: true,
      },
      {
        source: '/blog/chatgpt-dress-change-prompt-guide-for-women',
        destination: '/blog/chatgpt-photo-dress-change-prompt-15-copy-paste-ai-outfit-prompts',
        permanent: true,
      },
      {
        source: '/tools/ai-image-prompts/boys',
        destination: '/tools/ai-image-prompts/men',
        permanent: true,
      },
      {
        source: '/tools/ai-image-prompts/boys/:path*',
        destination: '/tools/ai-image-prompts/men/:path*',
        permanent: true,
      },
      {
        source: '/tools/ai-image-prompts/girls',
        destination: '/tools/ai-image-prompts/women',
        permanent: true,
      },
      {
        source: '/tools/ai-image-prompts/girls/:path*',
        destination: '/tools/ai-image-prompts/women/:path*',
        permanent: true,
      },
      // Redirects moved from vercel.json so they keep working on
      // Cloudflare (Cloudflare does not read vercel.json). Order matches
      // vercel.json; the /guides rule is already above, so it is not
      // repeated here. The apex-to-www rule is last (catch-all).
      {
        source: '/videos/:slug',
        destination: 'https://www.aqprompts.com/blog/:slug',
        permanent: true,
      },
      {
        source: '/tools',
        destination: 'https://www.aqprompts.com/tools/ai-image-prompts',
        permanent: true,
      },
      {
        source: '/tools/photo-editing-prompts',
        destination: 'https://www.aqprompts.com/tools/ai-image-prompts/photo-editing',
        permanent: true,
      },
      {
        source: '/prompts',
        destination: 'https://www.aqprompts.com/tools/ai-image-prompts',
        permanent: true,
      },
      {
        source: '/prompts/:promptSlug',
        destination: 'https://www.aqprompts.com/tools/ai-image-prompts/p/:promptSlug',
        permanent: true,
      },
      {
        source: '/p/:slug',
        destination: 'https://www.aqprompts.com/tools/ai-image-prompts/p/:slug',
        permanent: true,
      },
      {
        source: '/category/instagram-growth',
        destination: 'https://www.aqprompts.com/blog?search=instagram%20growth',
        permanent: true,
      },
      {
        source: '/category/ai-prompts',
        destination: 'https://www.aqprompts.com/tools/ai-image-prompts',
        permanent: true,
      },
      {
        source: '/faq',
        destination: 'https://www.aqprompts.com/#faq',
        permanent: true,
      },
      {
        source: '/blog/mastering-ai-portrait-prompts',
        destination: 'https://www.aqprompts.com/blog/ai-portrait-prompts-viral-content',
        permanent: true,
      },
      {
        source: '/blog/instagram-reels-not-getting-views-fix',
        destination: 'https://www.aqprompts.com/blog',
        permanent: true,
      },
      {
        source: '/go-viral-on-instagram-reels',
        destination: 'https://www.aqprompts.com/blog',
        permanent: true,
      },
      {
        source: '/why-instagram-reach-dropped-suddenly-in-2026-a-practical-guide-to-recover-your-views',
        destination: 'https://www.aqprompts.com/blog',
        permanent: true,
      },
      {
        source: '/ai-image-prompts',
        destination: 'https://www.aqprompts.com/tools/ai-image-prompts',
        permanent: true,
      },
      {
        source: '/ai-image-prompts/:path*',
        destination: 'https://www.aqprompts.com/tools/ai-image-prompts/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'aqprompts.com' }],
        destination: 'https://www.aqprompts.com/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Public HTML pages: edge-cache so repeat requests skip the Worker.
      ...publicPageCacheSources.map((source) => ({
        source,
        headers: publicPageCacheHeaders,
      })),
      {
        source: '/images/:path*',
        headers: immutableAssetHeaders,
      },
      ...[...tombstonePublicPaths].map((source) => ({
        source,
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, noimageindex',
          },
        ],
      })),
      {
        source: '/uploads/:path*',
        headers: immutableAssetHeaders,
      },
      {
        source: '/data/:path*',
        headers: revalidatedDataHeaders,
      },
      {
        source: '/rss.xml',
        headers: publicFeedHeaders,
      },
      {
        source: '/feed.xml',
        headers: publicFeedHeaders,
      },
      {
        source: '/pinterest-feed.xml',
        headers: publicFeedHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
    formats: ['image/webp'],
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 320, 384, 412, 480, 640],
    minimumCacheTTL: 31536000,
    qualities: [55, 65, 70, 75, 80],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.aqprompts.com',
      },
      {
        protocol: 'https',
        hostname: 'aqprompts.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'vz9masx06jvlgyaa.public.blob.vercel-storage.com',
        pathname: '/**',
      },
    ],
  },
  env: {
    SITE_URL: process.env.SITE_URL || 'https://www.aqprompts.com',
    SITE_NAME: process.env.SITE_NAME || 'AQPrompts',
  },
};

export default nextConfig;
