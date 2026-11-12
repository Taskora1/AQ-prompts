/**
 * Append Cloudinary auto-optimization transformation parameters to a URL.
 *
 * When `next.config.js` sets `images.unoptimized: true`, Next.js serves
 * external images as-is. This helper adds responsive CDN transformations.
 *
 * @param {string} url - Image URL (Cloudinary or external)
 * @param {{ width?: number, quality?: string }} options - CDN transformation options
 * @returns {string} URL with optimization params injected for Cloudinary URLs, unchanged otherwise
 */
export function optimizeCloudinaryUrl(url, { width = 800, quality = 'eco' } = {}) {
  if (typeof url !== 'string' || !url.includes('cloudinary.com')) return url;

  const qualityTransformation = quality === 'auto' ? 'q_auto' : `q_auto:${quality}`;
  const transformations = `f_auto,${qualityTransformation},w_${width}`;
  const uploadMatch = url.match(/\/upload\/([^/]+)\//);

  if (uploadMatch && !/^v\d+$/.test(uploadMatch[1])) {
    const nextTransformations = uploadMatch[1]
      .split(',')
      .filter((value) => !value.startsWith('f_') && !value.startsWith('q_') && !/^w_\d+$/.test(value));
    return url.replace(uploadMatch[1], [`f_auto`, qualityTransformation, `w_${width}`, ...nextTransformations].join(','));
  }

  return url.replace('/upload/', `/upload/${transformations}/`);
}

export function getCloudinaryResponsiveImage(url, { widths = [320, 360, 480, 640, 720, 800, 960, 1200], quality = 'eco' } = {}) {
  if (typeof url !== 'string' || !url.includes('cloudinary.com') || !url.includes('/upload/')) {
    return null;
  }

  const candidates = [...new Set(widths
    .map(Number)
    .filter((width) => Number.isInteger(width) && width > 0))]
    .sort((a, b) => a - b);
  if (candidates.length === 0) return null;

  return {
    srcSet: candidates
      .map((width) => `${optimizeCloudinaryUrl(url, { width, quality })} ${width}w`)
      .join(', '),
  };
}
