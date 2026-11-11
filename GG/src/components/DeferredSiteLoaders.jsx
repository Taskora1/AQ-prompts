'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const WebpushrLoader = dynamic(() => import('@/components/WebpushrLoader'), {
  ssr: false,
  loading: () => null,
});
const LazyAnalytics = dynamic(() => import('@/components/LazyAnalytics'), {
  ssr: false,
  loading: () => null,
});

export default function DeferredSiteLoaders({ enableVercelAnalytics = false }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Webpushr used to initialise ~10s after load, so its opt-in prompt
    // popped up on first load before the visitor had engaged. Now wait for
    // real engagement (a scroll or a click/tap) or 30s of dwell, whichever
    // comes first. Webpushr itself remembers a dismissal and re-prompts
    // only after the interval set in its dashboard.
    let done = false;
    const enable = () => {
      if (done) return;
      done = true;
      window.removeEventListener('scroll', onEngage, { passive: true });
      window.removeEventListener('pointerdown', onEngage);
      window.clearTimeout(timeout);
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => setEnabled(true), { timeout: 5000 });
      } else {
        setEnabled(true);
      }
    };
    const onEngage = () => enable();
    window.addEventListener('scroll', onEngage, { passive: true });
    window.addEventListener('pointerdown', onEngage);
    const timeout = window.setTimeout(enable, 30000);
    return () => {
      done = true;
      window.removeEventListener('scroll', onEngage, { passive: true });
      window.removeEventListener('pointerdown', onEngage);
      window.clearTimeout(timeout);
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <WebpushrLoader />
      {enableVercelAnalytics ? <LazyAnalytics /> : null}
    </>
  );
}
