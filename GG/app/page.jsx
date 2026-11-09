import JsonLd from '@/components/JsonLd';
import HomeLanding from '@/components/home/HomeLanding';
import { buildStaticPageMetadata, buildStaticPageSchema } from '@/lib/metadata';
import { getHomepageBlogPosts } from '@/lib/blog-db';
import { getHomepagePromptData } from '@/lib/prompts-db';

export const revalidate = 86400; // 24h safety net — primary invalidation is on-demand via admin revalidatePath

export function generateMetadata() {
  return buildStaticPageMetadata('home');
}

export default async function Page() {
  const pageStartedAt = Date.now();
  const queryStartedAt = Date.now();
  const [homepagePromptData, guidePosts] = await Promise.all([
    getHomepagePromptData(),
    getHomepageBlogPosts(),
  ]);
  const queryDataMs = Date.now() - queryStartedAt;
  const transformStartedAt = Date.now();
  const homepageGuidePosts = guidePosts.map((post) => ({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    description: post.description,
    category: post.category,
    featuredImage: post.featuredImage,
    featuredImageAltText: post.featuredImageAltText,
  }));
  const transformMs = Date.now() - transformStartedAt;
  console.info(
    `[HOME_TIMING] query_data_ms=${queryDataMs} transform_ms=${transformMs} `
    + `page_data_total_ms=${Date.now() - pageStartedAt}`,
  );
  return (
    <>
      <JsonLd data={buildStaticPageSchema('home')} />
      <HomeLanding
        newlyAddedPrompts={homepagePromptData.prompts}
        categoryCards={homepagePromptData.categoryCards}
        posts={homepageGuidePosts}
        libraryUpdatedAt={homepagePromptData.updatedAt}
      />
    </>
  );
}
