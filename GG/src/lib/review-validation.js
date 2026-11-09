export const MIN_REVIEW_WORDS = 4;

export function countReviewWords(value) {
  return String(value || '').trim().split(/\s+/u).filter(Boolean).length;
}
