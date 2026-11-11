import { hasConsent } from './consent.js';

export const FAVORITES_STORAGE_KEY = 'aqprompts_favorites';
export const FAVORITES_CHANGED_EVENT = 'aqprompts:favorites-changed';

function readStoredIds() {
  if (!hasConsent('preferences')) return [];

  try {
    const ids = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
    return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function getFavoritePromptIds() {
  if (typeof window === 'undefined') return [];
  return [...new Set(readStoredIds())];
}

export function isFavoritePrompt(promptId) {
  if (!promptId) return false;
  return getFavoritePromptIds().includes(String(promptId));
}

export function setFavoritePromptIds(ids = []) {
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
  if (!hasConsent('preferences')) return uniqueIds;

  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(uniqueIds));
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: { ids: uniqueIds } }));
  return uniqueIds;
}

export function toggleFavoritePrompt(promptId) {
  const normalizedId = String(promptId || '').trim();
  if (!normalizedId) return { favorite: false, ids: getFavoritePromptIds(), persisted: false };

  const ids = getFavoritePromptIds();
  const favorite = !ids.includes(normalizedId);
  const nextIds = favorite ? [...ids, normalizedId] : ids.filter((id) => id !== normalizedId);

  // Without "preferences" consent the ids are NOT written to storage, so
  // callers must tell the user the save did not stick (see SaveConsentNotice).
  // The consent gate itself is intentionally not bypassed here.
  const persisted = hasConsent('preferences');
  return { favorite, ids: setFavoritePromptIds(nextIds), persisted };
}
