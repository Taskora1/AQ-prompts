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
    const enable = () => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => setEnabled(true), { timeout: 5000 });
      } else {
        setEnabled(true);
      }
    };
    const timeout = window.setTimeout(enable, 10000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <WebpushrLoader />
      {enableVercelAnalytics ? <LazyAnalytics /> : null}
    </>
  );
}
