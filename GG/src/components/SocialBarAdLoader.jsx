'use client';

import { useEffect } from 'react';

import { CONSENT_EVENT, hasConsent } from '@/lib/consent';

const SOCIAL_BAR_SCRIPT_ID = 'adsterra-social-bar-script';
const SOCIAL_BAR_SCRIPT_URL =
  'https://movementssubscriptionobjection.com/b3/a5/74/b3a5747d1114436a33f4e5158ce408d1.js';

export default function SocialBarAdLoader() {
  useEffect(() => {
    let script;

    const syncAdvertisingConsent = () => {
      if (!hasConsent('advertising')) return;
      if (document.getElementById(SOCIAL_BAR_SCRIPT_ID)) return;

      script = document.createElement('script');
      script.id = SOCIAL_BAR_SCRIPT_ID;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      script.src = SOCIAL_BAR_SCRIPT_URL;
      script.onerror = () => {
        console.error('Adsterra Social Bar script failed to load.');
        script?.remove();
      };
      document.head.appendChild(script);
    };

    syncAdvertisingConsent();
    window.addEventListener(CONSENT_EVENT, syncAdvertisingConsent);

    return () => {
      window.removeEventListener(CONSENT_EVENT, syncAdvertisingConsent);
      script?.remove();
    };
  }, []);

  return null;
}
