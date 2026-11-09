import { buildBlogRssFeed, feedResponse } from '@/lib/blog-feed';

export const revalidate = 86400; // 24h safety net — primary invalidation is on-demand via revalidateBlogContent

export async function GET() {
  const xml = await buildBlogRssFeed({
    title: 'AQPrompts Feed',
    description: 'Latest AQPrompts blog posts and AI image prompts.',
    feedPath: '/rss.xml',
  });

  return feedResponse(xml);
}
