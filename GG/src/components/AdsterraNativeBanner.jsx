'use client';

import { useEffect, useRef, useState } from 'react';

import { CONSENT_EVENT, hasConsent } from '@/lib/consent';
import {
  ADSTERRA_NATIVE_CONTAINER_ID,
  ADSTERRA_NATIVE_SCRIPT_ID,
  ADSTERRA_NATIVE_SCRIPT_URL,
} from '@/lib/adsterra-ads';

export default function AdsterraNativeBanner({ className = '' }) {
  const [advertisingAllowed, setAdvertisingAllowed] = useState(false);
  const [hasAdContent, setHasAdContent] = useState(true);
  const containerRef = useRef(null);

  useEffect(() => {
    const syncAdvertisingConsent = () => {
      setAdvertisingAllowed(hasConsent('advertising'));
    };

    syncAdvertisingConsent();
    window.addEventListener(CONSENT_EVENT, syncAdvertisingConsent);
    return () => window.removeEventListener(CONSENT_EVENT, syncAdvertisingConsent);
  }, []);

  useEffect(() => {
    if (!advertisingAllowed) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    let script;
    let loaded = false;
    let observer;
    let emptyTimer;

    const loadBanner = () => {
      if (loaded || !hasConsent('advertising')) return;
      loaded = true;

      if (container.childNodes.length === 0) {
        observer = new MutationObserver(() => {
          if (container.childNodes.length > 0) {
            window.clearTimeout(emptyTimer);
            observer.disconnect();
          }
        });
        observer.observe(container, { childList: true, subtree: true });
        emptyTimer = window.setTimeout(() => {
          if (container.childNodes.length === 0) setHasAdContent(false);
          observer.disconnect();
        }, 8000);
      }

      if (document.getElementById(ADSTERRA_NATIVE_SCRIPT_ID)) {
        setHasAdContent(false);
        return;
      }

      script = document.createElement('script');
      script.id = ADSTERRA_NATIVE_SCRIPT_ID;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      script.fetchPriority = 'high';
      script.src = ADSTERRA_NATIVE_SCRIPT_URL;
      script.onerror = () => {
        window.clearTimeout(emptyTimer);
        observer?.disconnect();
        script.remove();
        setHasAdContent(false);
      };
      container.before(script);
    };

    loadBanner();

    return () => {
      observer?.disconnect();
      window.clearTimeout(emptyTimer);
      script?.remove();
      container.replaceChildren();
    };
  }, [advertisingAllowed]);

  if (!advertisingAllowed) return null;

  if (!hasAdContent) return null;

  return (
    <aside className={`article-adsterra-slot adsterra-native-slot ${className}`.trim()} aria-label="Advertisement">
      <p className="article-adsterra-label">Advertisement</p>
      <div
        id={ADSTERRA_NATIVE_CONTAINER_ID}
        ref={containerRef}
        className="article-adsterra-container"
      />
    </aside>
  );
}
