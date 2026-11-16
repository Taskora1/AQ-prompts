// Compact count for card/detail display: 999 -> "999", 1200 -> "1.2k".
export function formatCompactCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count < 1000) return String(count);
  if (count < 1000000) {
    const trimmed = (count / 1000).toFixed(1).replace(/\.0$/, '');
    return `${trimmed}k`;
  }
  const trimmed = (count / 1000000).toFixed(1).replace(/\.0$/, '');
  return `${trimmed}M`;
}

// Minimal card serializer — the exact field set PromptCard needs.
// Used by listing pages (initial hydration slice) and the paginated/search APIs
// so additional pages never ship more data than the cards can display.
export function toPromptCardItem(prompt) {
  const imageAlt = String(
    prompt.imageAlt
      || prompt.imageAltTexts?.['0']
      || prompt.imageAltTexts?.[0]
      || '',
  ).trim();

  return {
    id: prompt.id,
    title: prompt.title,
    slug: prompt.slug,
    image: prompt.image,
    images: prompt.images,
    imageAlt: imageAlt || prompt.title,
    intro: prompt.intro,
    prompt: prompt.prompt,
    category: prompt.category,
    categories: prompt.categories,
    categorySlugs: prompt.categorySlugs,
    useCase: prompt.useCase,
    platform: prompt.platform,
    tags: prompt.tags,
    viewCount: Math.max(0, Number(prompt.viewCount ?? prompt.view_count) || 0),
    likeCount: Math.max(0, Number(prompt.likeCount ?? prompt.like_count) || 0),
  };
}
