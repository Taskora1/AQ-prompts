import assert from 'node:assert/strict';

import { readGoogleCmpConsent } from '../src/lib/google-cmp.js';

const GRANTED = 1;
const DENIED = 2;

global.window = {
  googlefc: {
    ConsentModePurposeStatusEnum: {
      CONSENT_MODE_PURPOSE_STATUS_GRANTED: GRANTED,
      CONSENT_MODE_PURPOSE_STATUS_DENIED: DENIED,
    },
    getGoogleConsentModeValues: () => ({
      adStoragePurposeConsentStatus: GRANTED,
      adUserDataPurposeConsentStatus: GRANTED,
      adPersonalizationPurposeConsentStatus: GRANTED,
      analyticsStoragePurposeConsentStatus: GRANTED,
    }),
  },
};

assert.deepEqual(readGoogleCmpConsent(), {
  necessary: true,
  analytics: true,
  advertising: true,
  preferences: false,
});

window.googlefc.getGoogleConsentModeValues = () => ({
  adStoragePurposeConsentStatus: GRANTED,
  adUserDataPurposeConsentStatus: DENIED,
  adPersonalizationPurposeConsentStatus: GRANTED,
  analyticsStoragePurposeConsentStatus: DENIED,
});

assert.deepEqual(readGoogleCmpConsent(), {
  necessary: true,
  analytics: false,
  advertising: false,
  preferences: false,
});

delete window.googlefc.ConsentModePurposeStatusEnum;
assert.equal(readGoogleCmpConsent(), null);

console.log('PASS: Google CMP consent-mode mapping remains fail-closed.');
