const INDEXNOW_API_PATH = '/api/indexnow';
const DEFAULT_SITE_URL = 'https://www.aqprompts.com';

function getApiUrl() {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${INDEXNOW_API_PATH}`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  return new URL(INDEXNOW_API_PATH, siteUrl).toString();
}

export async function submitToIndexNow(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new TypeError('urls must be a non-empty array.');
  }

  if (urls.some((url) => typeof url !== 'string' || url.trim().length === 0)) {
    throw new TypeError('urls must contain only non-empty strings.');
  }

  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ urlList: urls }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(result.error || 'IndexNow submission failed.');
    error.status = response.status;
    error.details = result.details;
    throw error;
  }

  return result;
}
