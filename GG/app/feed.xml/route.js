import { buildBlogRssFeed, feedResponse } from '@/lib/blog-feed';

export const dynamic = 'force-static';
export const revalidate = false;

export async function GET() {
  const xml = await buildBlogRssFeed({
    title: 'AQPrompts Feed',
    description: 'Latest AQPrompts blog posts and AI image prompts.',
    feedPath: '/feed.xml',
  });

  return feedResponse(xml);
}
