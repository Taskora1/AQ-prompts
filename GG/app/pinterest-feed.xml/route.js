import { buildBlogRssFeed, feedResponse } from '@/lib/blog-feed';

export const dynamic = 'force-static';
export const revalidate = false;

export async function GET() {
  const xml = await buildBlogRssFeed({
    title: 'AQPrompts Pinterest Feed',
    description: 'Pinterest-ready AQPrompts feed with blog posts and AI image prompts.',
    feedPath: '/pinterest-feed.xml',
  });

  return feedResponse(xml);
}
