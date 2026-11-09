const RESPONSIVE_UPLOADS = new Set([
  'luxury-mens-fashion-ai-prompts.webp',
  'all-black-executive-city-ai-portrait.webp',
  'double-breasted-hotel-fashion-ai-portrait.webp',
  'luxury-mirror-fashion-ai-portrait.webp',
  'black-blazer-white-shirt-ai-portrait.webp',
  'all-white-studio-mens-ai-portrait.webp',
  'ocean-view-luxury-mens-ai-portrait.webp',
]);

export function getStaticResponsiveImage(src) {
  if (typeof src !== 'string' || !src.startsWith('/uploads/')) return null;

  const filename = src.slice('/uploads/'.length);
  if (!RESPONSIVE_UPLOADS.has(filename)) return null;

  const stem = filename.replace(/\.webp$/i, '');
  return {
    srcSet: `/uploads/responsive/${stem}-480.webp 480w, /uploads/responsive/${stem}-960.webp 960w`,
  };
}
