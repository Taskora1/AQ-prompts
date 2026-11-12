const LEGACY_BLOB_HOSTNAME = 'vz9masx06jvlgyaa.public.blob.vercel-storage.com';
const LEGACY_PROMPT_PREFIX = '/prompts/';
const LEGACY_ADMIN_PROMPT_PREFIX = '/admin-prompts/';
const LOCAL_PROMPT_PREFIX = '/images/prompts/';
const UNAVAILABLE_IMAGE_PLACEHOLDER = '/images/verified/media-evidence-placeholder.svg';

// Recoverable admin uploads are served from the app so they keep working when
// the legacy Vercel Blob store is unavailable.
const RECOVERED_ADMIN_PROMPT_IMAGES = new Map([
  ['green-watercolor-double-portrait-fashion-poster-ai-prompt-bZ77Y4hVOzz4ajJDPE8tduIlgGEZJO.webp', 'green-watercolor-double-portrait-fashion-poster-ai-prompt.webp'],
  ['misty-forest-double-exposure-portrait-ai-prompt-GPfN62mHaWRO0lDOH2F5ySIcLhLQwL.webp', 'misty-forest-double-exposure-portrait-ai-prompt.webp'],
  ['cinematic-smoke-floor-pose-male-portrait-ai-prompt-ty92jdHzHUCAApRpPSXuAAFMR9rgn9.webp', 'cinematic-smoke-floor-pose-male-portrait-ai-prompt.webp'],
  ['green-watercolor-double-portrait-fashion-poster-ai-prompt-bZ77Y4hVOzz4ajJDPE8tduIlgGEZJO.webp', 'green-watercolor-double-portrait-fashion-poster-ai-prompt.webp'],
  ['misty-forest-double-exposure-portrait-ai-prompt-GPfN62mHaWRO0lDOH2F5ySIcLhLQwL.webp', 'misty-forest-double-exposure-portrait-ai-prompt.webp'],
  ['cinematic-smoke-floor-pose-male-portrait-ai-prompt-ty92jdHzHUCAApRpPSXuAAFMR9rgn9.webp', 'cinematic-smoke-floor-pose-male-portrait-ai-prompt.webp'],
  ['cozy-chibi-doll-clone-lifestyle-portrait-ai-prompt-VnudIEy9J4X7pg3x2j4hizjpNNBEkh.webp', 'cozy-chibi-doll-clone-lifestyle-portrait-ai-prompt.webp'],
  ['chatgpt-image-jul-16-2026-08-26-21-pm-zWhpjLLwEC7bpawBX3IaTRe0DXryGx.webp', 'black-pantsuit-executive-editorial-portrait-ai-prompt.webp'],
  ['chatgpt-image-jul-27-2026-07-06-44-pm-5KDAQYEnKCmQAAVIeIUD0mTqur7ntP.webp', 'high-fashion-beauty-poster-ai-photo-editing-prompt.webp'],
  ['cathedral-street-style-fashion-portrait-ai-prompt-webp-PwhQxyfLsYOlJcr2XfnNuoIUrkYozt.webp', 'cathedral-street-style-fashion-portrait-ai-prompt.webp'],
  ['cinematic-night-portrait-golden-rim-light-ai-prompt-webp-CLKn0uVitAM1oMUbw6CpawsTGVRNtS.webp', 'cinematic-night-portrait-with-golden-rim-light-ai-prompt.webp'],
  ['holographic-butterfly-side-profile-portrait-ai-prompt-webp-I4ZQh2VVc4TrDnyCRq4K1G3sRpxqBK.webp', 'holographic-butterfly-side-profile-portrait-ai-prompt.webp'],
  ['elegant-cafe-lifestyle-portrait-ai-prompt-webp-c2SEwGM7BpM7zjvFd9L264VHy6YLYP.webp', 'elegant-caf-lifestyle-portrait-ai-prompt.webp'],
  ['purple-corporate-fashion-portrait-ai-prompt-webp-hCilmGnqGO30BlBmrQUCRIiTlEtACF.webp', 'purple-corporate-fashion-portrait-ai-prompt.webp'],
  ['yellow-background-male-streetwear-portrait-ai-prompt-mK8G2fl2eZTh2Ym4JyIS0iPAoG4U63.webp', 'yellow-background-male-streetwear-portrait-ai-prompt.webp'],
  ['black-background-anime-male-portrait-ai-prompt-OjUZ2ON6YqcyFwHvB9vU5QJBo1RdXq.webp', 'black-background-anime-male-portrait-ai-prompt.webp'],
  ['blue-rim-light-streetwear-portrait-ai-prompt-C4UE5SAghBA0s5pZcbTqBurGLjhjhE.webp', 'blue-rim-light-streetwear-portrait-ai-prompt.webp'],
  ['golden-hour-anime-streetwear-portrait-ai-prompt-6YlitPHyprTFRG0rs7rA1I2FV5IWf5.webp', 'golden-hour-anime-streetwear-portrait-ai-prompt.webp'],
  ['seaside-cliff-golden-hour-male-portrait-ai-prompt-webp-NOTpTIq0MNyt0YFKkMtZ4xjB2xmd8C.webp', 'seaside-cliff-golden-hour-male-portrait-ai-prompt.webp'],
  ['fantasy-fire-phoenix-female-portrait-ai-prompt-1M8EfB7lJWKufCy2k0j0bQ3cH0uDN9.webp', 'fantasy-fire-phoenix-female-portrait-ai-prompt.webp'],
  ['golden-smoke-luxury-fashion-portrait-ai-prompt-JIQ87XQHgdCFVR3sob8w0fKm1XnXHK.webp', 'golden-smoke-luxury-fashion-portrait-ai-prompt.webp'],
  ['rooftop-double-exposure-fashion-poster-ai-prompt-dGXkBNuWhFtUsIIoUTWvsjvgEtkKws.webp', 'rooftop-double-exposure-fashion-poster-ai-prompt.webp'],
  ['luxury-businessman-office-portrait-ai-prompt-OComXVA5XAYkNDgXwYpoiytUGc4Ih7.webp', 'luxury-businessman-office-portrait-ai-prompt.webp'],
  ['night-city-all-white-businessman-portrait-ai-prompt-ld8q1y4DZXisVnuUjb9sn2AmKw505C.webp', 'night-city-all-white-businessman-portrait-ai-prompt.webp'],
  ['luxury-penthouse-lifestyle-portrait-ai-prompt-hJtKnkTfpXoEfPk1extXPJ8WY7eb74.webp', 'luxury-penthouse-lifestyle-portrait-ai-prompt.webp'],
  ['purple-magenta-studio-portrait-ai-prompt-9jUKcpEKV0VDALrBvC8drOaUt2Obnh.webp', 'purple-magenta-studio-portrait-ai-prompt.webp'],
]);

export function resolvePromptImagePath(imagePath = '') {
  const value = String(imagePath || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    if (url.hostname !== LEGACY_BLOB_HOSTNAME) {
      return value;
    }
    if (url.pathname.startsWith(LEGACY_ADMIN_PROMPT_PREFIX)) {
      const filename = decodeURIComponent(url.pathname.slice(LEGACY_ADMIN_PROMPT_PREFIX.length));
      const recoveredFilename = RECOVERED_ADMIN_PROMPT_IMAGES.get(filename);
      return recoveredFilename
        ? `${LOCAL_PROMPT_PREFIX}${encodeURIComponent(recoveredFilename)}`
        : UNAVAILABLE_IMAGE_PLACEHOLDER;
    }
    if (!url.pathname.startsWith(LEGACY_PROMPT_PREFIX)) return value;

    const filename = decodeURIComponent(url.pathname.slice(LEGACY_PROMPT_PREFIX.length));
    if (!filename || filename.includes('/')) {
      return UNAVAILABLE_IMAGE_PLACEHOLDER;
    }

    return `${LOCAL_PROMPT_PREFIX}${encodeURIComponent(filename)}`;
  } catch {
    return value;
  }
}

export function getPromptThumbnailPath(imagePath = '') {
  const value = resolvePromptImagePath(imagePath);

  if (value.startsWith('/images/prompts/')) {
    return value.replace('/images/prompts/', '/images/prompt-thumbs/').replace(/\.(?:jpe?g|png|webp)$/i, '.webp');
  }

  return value;
}

export function getPromptThumbnailPaths(images = []) {
  return images.map(getPromptThumbnailPath).filter(Boolean);
}

// Responsive srcSet for local prompt thumbs. The thumbnail generator also
// writes a 360px-wide variant (`<name>-360.webp`) next to each 640px thumb,
// so a browser can pick the small file at low DPR / small viewports and the
// full thumb at high DPR. Returns null for Cloudinary images (those already
// get a responsive srcSet from getCloudinaryResponsiveImage) and for any
// path that is not a local prompt thumb.
export function getPromptThumbnailSrcSet(imagePath = '') {
  const thumbnail = getPromptThumbnailPath(imagePath);

  if (
    !thumbnail.startsWith('/images/prompt-thumbs/')
    || !thumbnail.toLowerCase().endsWith('.webp')
  ) {
    return null;
  }

  const small = thumbnail.replace(/\.webp$/i, '-360.webp');
  return `${small} 360w, ${thumbnail} 640w`;
}
