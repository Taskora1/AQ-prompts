export function getBlogPostCoverImage(post) {
  return [post?.image, post?.coverImage, post?.featuredImage]
    .find((image) => typeof image === 'string' && image.trim())?.trim() || '';
}

export const BLOG_POST_COVER_SIZES =
  '(min-width: 1168px) 704px, (min-width: 1024px) calc(100vw - 464px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 48px)';
