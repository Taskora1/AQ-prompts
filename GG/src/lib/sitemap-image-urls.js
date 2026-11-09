import { VERIFIED_MEDIA_PLACEHOLDER } from './media-safety.js';

export function getSitemapImageUrls(values, origin) {
  const candidates = Array.isArray(values) ? values : [values];
  const imageUrls = new Set();

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    if (candidate.trim() === VERIFIED_MEDIA_PLACEHOLDER) continue;

    try {
      const imageUrl = new URL(candidate.trim(), origin);
      if (
        !['http:', 'https:'].includes(imageUrl.protocol)
        || imageUrl.username
        || imageUrl.password
      ) {
        continue;
      }
      imageUrls.add(imageUrl.toString());
    } catch {
      continue;
    }
  }

  return [...imageUrls];
}
