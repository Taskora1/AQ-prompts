const SUPPORTED_ASPECT_RATIOS = ['4:5', '1:1', '9:16', '16:9'];
const ASPECT_RATIO_PATTERN =
  /\b(?:(?:aspect\s*ratio|ratio)\s*)?(4:5|1:1|9:16|16:9)\b(?:\s*(?:aspect\s*ratio|ratio))?(\s*)/gi;

export function withAspectRatio(promptText, ratio) {
  const source = String(promptText || '');
  let hasRatio = false;
  const updatedPrompt = source.replace(
    ASPECT_RATIO_PATTERN,
    (_match, _currentRatio, trailingWhitespace) => {
      hasRatio = true;
      return `${ratio} aspect ratio${trailingWhitespace}`;
    },
  );

  if (hasRatio) return updatedPrompt;

  const cleanPrompt = source.replace(/[,\s]+$/, '');
  return cleanPrompt ? `${cleanPrompt}, aspect ratio ${ratio}` : `aspect ratio ${ratio}`;
}

export function isSupportedAspectRatio(value) {
  const normalized = String(value || '').trim().replace('/', ':');
  return SUPPORTED_ASPECT_RATIOS.includes(normalized) ? normalized : '';
}
