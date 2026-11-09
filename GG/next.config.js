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

if (process.env.VERCEL_ENV === 'preview') {
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
  {
    key: 'Vercel-CDN-Cache-Control',
    value: 'no-store',
  },
];

const publicFeedHeaders = [
  {
    key: 'Cache-Control',
    value: 'public, max-age=300, stale-while-revalidate=1800',
  },
  {
    key: 'Vercel-CDN-Cache-Control',
    value: 'public, s-maxage=86400, stale-while-revalidate=86400',
  },
];/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,  poweredByHeader: false,  compress: true,  devIndicators: false,  experimental: {    inlineCss: true,
    optimizePackageImports: ['lucide-react'],
    // Each static-generation worker is a separate OS process with its own pg
    // pool. Session-mode poolers cap total clients, so keep worker count low
    // to stay under the pooler's client limit (see PG_POOL_MAX in src/lib/db.js).
    cpus: 1,  },
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
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/images/:path*',
        headers: immutableAssetHeaders,
      },
      ...[...tombstonePublicPaths].map((source) => ({
        source,
        headers: [
          {
            key: 'Vercel-CDN-Cache-Control',
            value: 'no-store',
          },
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
