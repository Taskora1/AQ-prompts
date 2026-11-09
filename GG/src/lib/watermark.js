/**
 * Watermark overlay utilities using Cloudinary URL transformations.
 *
 * Applies a text or logo watermark to images via Cloudinary's
 * overlay parameters — no server-side image processing needed.
 */

const WATERMARK_DEFAULTS = {
  text: 'AQPrompts',
  fontSize: 24,
  fontFace: 'arial',
  color: 'white',
  opacity: 40, // 0-100
  position: 'south_east', // Cloudinary gravity
  x: 20,
  y: 20,
};

const POSITION_MAP = {
  north_west: 'north_west',
  north: 'north',
  north_east: 'north_east',
  west: 'west',
  center: 'center',
  east: 'east',
  south_west: 'south_west',
  south: 'south',
  south_east: 'south_east',
  top_left: 'north_west',
  top_center: 'north',
  top_right: 'north_east',
  middle_left: 'west',
  middle_center: 'center',
  middle_right: 'east',
  bottom_left: 'south_west',
  bottom_center: 'south',
  bottom_right: 'south_east',
};

/**
 * Build a Cloudinary URL with a text watermark overlay.
 *
 * @param {string} imageUrl - Original Cloudinary or external image URL
 * @param {object} [options] - Watermark options
 * @param {string} [options.text] - Watermark text
 * @param {number} [options.fontSize] - Font size in pixels
 * @param {string} [options.color] - Text color (hex without #)
 * @param {number} [options.opacity] - Opacity 0-100
 * @param {string} [options.position] - Position key (e.g. 'bottom_right')
 * @param {number} [options.x] - Horizontal offset in pixels
 * @param {number} [options.y] - Vertical offset in pixels
 * @returns {string} Transformed Cloudinary URL
 */
export function addTextWatermark(imageUrl, options = {}) {
  if (!imageUrl) return '';

  const config = { ...WATERMARK_DEFAULTS, ...options };
  const gravity = POSITION_MAP[config.position] || config.position;

  // Build Cloudinary overlay text
  // Format: l_text:{fontface}_{size}:{text},co_{color},o_{opacity}
  const overlayText = config.text
    .replace(/%/g, '%25')
    .replace(/,/g, '%2C')
    .replace(/\//g, '%2F');

  const overlay = [
    `l_text:${config.fontFace}_${config.fontSize}:${overlayText}`,
    `co_rgb:${config.color.replace('#', '')}`,
    `o_${config.opacity}`,
    `g_${gravity}`,
    `x_${config.x}`,
    `y_${config.y}`,
  ].join(',');

  // Insert transformation before the upload folder path
  if (imageUrl.includes('cloudinary.com')) {
    const parts = imageUrl.split('/upload/');
    if (parts.length === 2) {
      return `${parts[0]}/upload/${overlay}/${parts[1]}`;
    }
  }

  // Non-Cloudinary URL — return as-is
  return imageUrl;
}

/**
 * Build a Cloudinary URL with a logo watermark overlay.
 *
 * @param {string} imageUrl - Original image URL
 * @param {string} logoUrl - Cloudinary public ID of the logo (e.g. 'watermark-logo')
 * @param {object} [options] - Options
 * @param {number} [options.opacity] - Opacity 0-100
 * @param {string} [options.position] - Position key
 * @param {number} [options.width] - Logo width in pixels
 * @param {number} [options.x] - Horizontal offset
 * @param {number} [options.y] - Vertical offset
 * @returns {string} Transformed Cloudinary URL
 */
export function addLogoWatermark(imageUrl, logoUrl, options = {}) {
  if (!imageUrl || !logoUrl) return imageUrl;

  const config = {
    opacity: 30,
    position: 'south_east',
    width: 120,
    x: 20,
    y: 20,
    ...options,
  };
  const gravity = POSITION_MAP[config.position] || config.position;

  const overlay = [
    `l_${logoUrl}`,
    `w_${config.width}`,
    `o_${config.opacity}`,
    `g_${gravity}`,
    `x_${config.x}`,
    `y_${config.y}`,
  ].join(',');

  if (imageUrl.includes('cloudinary.com')) {
    const parts = imageUrl.split('/upload/');
    if (parts.length === 2) {
      return `${parts[0]}/upload/${overlay}/${parts[1]}`;
    }
  }

  return imageUrl;
}

/**
 * Strip watermark transformations from a Cloudinary URL.
 *
 * @param {string} url - Cloudinary URL possibly with watermarks
 * @returns {string} Clean URL without watermark overlays
 */
export function stripWatermark(url) {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace(/\/upload\/l_[^/]+,.*?\//, '/upload/');
}

/**
 * Check if a URL has a watermark overlay applied.
 *
 * @param {string} url - Image URL
 * @returns {boolean}
 */
export function hasWatermark(url) {
  if (!url) return false;
  return url.includes('/upload/l_');
}