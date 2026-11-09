export const CONSENT_STORAGE_KEY = 'aqprompts_cookie_consent_v1';
export const CONSENT_EVENT = 'aqprompts:consent-changed';
export const OPEN_CONSENT_SETTINGS_EVENT = 'aqprompts:open-cookie-settings';
export const CONSENT_VERSION = 1;
export const CONSENT_AUTHORITY_PENDING = 'pending';
export const CONSENT_AUTHORITY_CUSTOM = 'custom';
export const CONSENT_AUTHORITY_GOOGLE = 'google';
const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_CONSENT = Object.freeze({
  necessary: true,
  analytics: false,
  advertising: false,
  preferences: false,
});

export function normalizeConsent(value) {
  if (!value || typeof value !== 'object' || value.version !== CONSENT_VERSION) return null;

  return {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: value.analytics === true,
    advertising: value.advertising === true,
    preferences: value.preferences === true,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

export function readConsent() {
  if (typeof window === 'undefined') return null;

  try {
    const localConsent = normalizeConsent(
      JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || 'null'),
    );
    if (localConsent) return localConsent;

    const cookieValue = document.cookie
      .split('; ')
      .find((item) => item.startsWith(`${CONSENT_STORAGE_KEY}=`))
      ?.slice(CONSENT_STORAGE_KEY.length + 1);

    return normalizeConsent(JSON.parse(decodeURIComponent(cookieValue || 'null')));
  } catch {
    return null;
  }
}

export function hasConsent(category) {
  if (category === 'necessary') return true;
  if (typeof window === 'undefined') return false;

  const authority = window.__aqConsentAuthority || CONSENT_AUTHORITY_PENDING;
  if (authority === CONSENT_AUTHORITY_PENDING) return false;
  if (authority === CONSENT_AUTHORITY_GOOGLE) {
    return window.__aqGoogleCmpConsent?.[category] === true;
  }

  return readConsent()?.[category] === true;
}

export function setConsentAuthority(authority, consent = DEFAULT_CONSENT) {
  window.__aqConsentAuthority = authority;
  if (authority === CONSENT_AUTHORITY_GOOGLE) {
    window.__aqGoogleCmpConsent = {
      necessary: true,
      analytics: consent.analytics === true,
      advertising: consent.advertising === true,
      preferences: false,
    };
  }

  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, {
    detail: authority === CONSENT_AUTHORITY_GOOGLE ? window.__aqGoogleCmpConsent : consent,
  }));
}

export function saveConsent(value) {
  const consent = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: value?.analytics === true,
    advertising: value?.advertising === true,
    preferences: value?.preferences === true,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  const isAqPromptsDomain = /(^|\.)aqprompts\.com$/i.test(window.location.hostname);
  const cookieDomain = isAqPromptsDomain ? '; Domain=.aqprompts.com' : '';
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(consent))}`
    + `; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE}; SameSite=Lax${secure}${cookieDomain}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
  return consent;
}
