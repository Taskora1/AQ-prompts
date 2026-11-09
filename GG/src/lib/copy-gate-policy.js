export const FREE_COPIES_BEFORE_FEEDBACK = 3;

export function hasReachedFeedbackCopyLimit(copyCount) {
  return Number(copyCount) >= FREE_COPIES_BEFORE_FEEDBACK;
}
