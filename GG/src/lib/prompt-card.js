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
  };
}
