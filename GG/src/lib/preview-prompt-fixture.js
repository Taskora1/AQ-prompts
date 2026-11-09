export const PREVIEW_SYNTHETIC_PROMPT = Object.freeze({
  title: 'Synthetic Preview Photo Prompt',
  prompt: 'Create a fictional geometric landscape with balanced colors and simple shapes.',
  slug: 'synthetic-preview-photo-prompt',
  image: '/images/verified/media-evidence-placeholder.svg',
  images: ['/images/verified/media-evidence-placeholder.svg'],
  category: 'Lifestyle',
  categories: ['Lifestyle'],
  categorySlugs: ['lifestyle'],
  useCase: 'Lifestyle',
  tags: ['synthetic', 'preview'],
  intro: 'Synthetic-only Preview fixture.',
  libraryType: 'photo',
  status: 'published',
});

export function isPreviewEnvironment(env = process.env) {
  return env.VERCEL_ENV === 'preview';
}
