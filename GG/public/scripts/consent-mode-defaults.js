(() => {
  window.__aqConsentAuthority = 'pending';
  window.__aqGoogleCmpConsent = {
    necessary: true,
    analytics: false,
    advertising: false,
    preferences: false,
  };
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });
})();
