import { NextResponse } from 'next/server';

import { getPublishedBlogPostsForFeed } from '@/lib/blog-db';
import {
  getPublishedPromptSitemapRows,
  getPromptUrl,
} from '@/lib/prompts';
import { buildImageSitemapXml } from '@/lib/image-sitemap-xml';
import { getSitemapImageUrls } from '@/lib/sitemap-image-urls';

export const revalidate = 86400;

const CANONICAL_ORIGIN = 'https://www.aqprompts.com';

export async function GET() {
  try {
    const [prompts, posts] = await Promise.all([
      getPublishedPromptSitemapRows(),
      getPublishedBlogPostsForFeed(),
    ]);

    const pages = [
      ...prompts
        .filter((prompt) => prompt?.slug)
        .map((prompt) => ({
          url: `${CANONICAL_ORIGIN}${getPromptUrl(prompt)}`,
          images: getSitemapImageUrls(prompt.images, CANONICAL_ORIGIN),
        })),
      ...posts
        .filter((post) => post?.slug)
        .map((post) => ({
          url: `${CANONICAL_ORIGIN}/blog/${encodeURIComponent(post.slug)}`,
          images: getSitemapImageUrls(post.featuredImage, CANONICAL_ORIGIN),
        })),
    ];

    return new NextResponse(buildImageSitemapXml(pages), {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('Image sitemap generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate image sitemap.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
