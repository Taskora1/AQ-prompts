export function hasGoogleCmpBootstrap() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  return typeof window.__tcfapi === 'function'
    || Boolean(document.querySelector(
      'script[src*="fundingchoicesmessages.google.com"]',
    ));
}

export function readGoogleCmpConsent() {
  if (typeof window === 'undefined') return null;

  const googlefc = window.googlefc;
  const statuses = googlefc?.ConsentModePurposeStatusEnum;
  if (!statuses || typeof googlefc.getGoogleConsentModeValues !== 'function') return null;

  let values;
  try {
    values = googlefc.getGoogleConsentModeValues();
  } catch {
    return null;
  }
  const granted = statuses.CONSENT_MODE_PURPOSE_STATUS_GRANTED;
  const analytics = values?.analyticsStoragePurposeConsentStatus === granted;
  const advertising = [
    values?.adStoragePurposeConsentStatus,
    values?.adUserDataPurposeConsentStatus,
    values?.adPersonalizationPurposeConsentStatus,
  ].every((value) => value === granted);

  return {
    necessary: true,
    analytics,
    advertising,
    // Google CMP is the authority in covered regions. AQPrompts does not infer
    // separate preference-storage consent from advertising/analytics choices.
    preferences: false,
  };
}
