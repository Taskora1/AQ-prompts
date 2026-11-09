'use client';

import { useEffect, useRef, useState } from 'react';

import { CONSENT_EVENT, hasConsent } from '@/lib/consent';
import {
  ADSTERRA_DISPLAY_UNITS,
  getAdsterraDisplayScriptUrl,
} from '@/lib/adsterra-ads';

let adsterraLoadQueue = Promise.resolve();

function enqueueAdsterraScript(unit, container) {
  let cancelled = false;
  let cancelActiveLoad = () => {};
  const load = adsterraLoadQueue.then(() => new Promise((resolve, reject) => {
    if (cancelled || !hasConsent('advertising') || !container.isConnected) {
      resolve();
      return;
    }

    window.atOptions = {
      key: unit.key,
      format: 'iframe',
      height: unit.height,
      width: unit.width,
      params: {},
    };

    const script = document.createElement('script');
    let timeoutId;
    let settled = false;
    const clearUnitMarker = () => {
      if (container.dataset.adsterraUnit === unit.key) {
        delete container.dataset.adsterraUnit;
      }
    };
    const settle = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        clearUnitMarker();
        reject(error);
      } else {
        resolve();
      }
    };

    cancelActiveLoad = () => {
      if (!settled) {
        settle();
        script.remove();
        clearUnitMarker();
      }
    };

    container.dataset.adsterraUnit = unit.key;
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.fetchPriority = 'high';
    script.src = getAdsterraDisplayScriptUrl(unit);
    script.onload = () => settle();
    script.onerror = () => settle(new Error('The ad script request was blocked or unavailable.'));
    timeoutId = window.setTimeout(
      () => settle(new Error('The ad script request timed out.')),
      15000,
    );
    container.appendChild(script);
  }));
  adsterraLoadQueue = load.catch(() => {});
  return {
    promise: load,
    cancel() {
      cancelled = true;
      cancelActiveLoad();
    },
  };
}

export default function AdsterraBanner({ unitName, mobileUnitName, className = '' }) {
  const [advertisingAllowed, setAdvertisingAllowed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const containerRef = useRef(null);
  const activeUnitName = isMobile && mobileUnitName ? mobileUnitName : unitName;
  const unit = ADSTERRA_DISPLAY_UNITS[activeUnitName];

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const syncViewport = () => setIsMobile(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    const syncAdvertisingConsent = () => {
      setAdvertisingAllowed(hasConsent('advertising'));
    };

    syncAdvertisingConsent();
    window.addEventListener(CONSENT_EVENT, syncAdvertisingConsent);
    return () => window.removeEventListener(CONSENT_EVENT, syncAdvertisingConsent);
  }, []);

  useEffect(() => {
    if (!advertisingAllowed || !unit) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    let loaded = false;
    let active = true;

    const loadBanner = () => {
      if (loaded || !hasConsent('advertising')) return;
      if (container.dataset.adsterraUnit === unit.key && container.firstChild) return;
      if (container.dataset.adsterraUnit !== unit.key) container.replaceChildren();
      loaded = true;
      setLoadFailed(false);
      const request = enqueueAdsterraScript(unit, container);
      request.promise.catch(() => {
        if (active) setLoadFailed(true);
      });
      cancelRequest = request.cancel;
    };

    let cancelRequest = () => {};
    loadBanner();

    return () => {
      active = false;
      cancelRequest();
    };
  }, [advertisingAllowed, unit]);

  if (!unit || !advertisingAllowed) return null;

  return (
    <aside
      className={`adsterra-feed-slot adsterra-feed-slot--${activeUnitName} ${className}`.trim()}
      aria-label="Advertisement"
    >
      <p className="article-adsterra-label">Advertisement</p>
      <div
        ref={containerRef}
        className="adsterra-feed-container"
        style={{ width: unit.width, height: unit.height }}
      />
      {loadFailed ? (
        <p className="adsterra-feed-error" role="status">
          Ad unavailable. Your browser or network may be blocking it.
        </p>
      ) : null}
    </aside>
  );
}
