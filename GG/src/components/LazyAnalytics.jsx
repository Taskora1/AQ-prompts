'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const Analytics = dynamic(() => import('@vercel/analytics/next').then((mod) => mod.Analytics), {
  ssr: false,
  loading: () => null,
});

const SpeedInsights = dynamic(() => import('@vercel/speed-insights/next').then((mod) => mod.SpeedInsights), {
  ssr: false,
  loading: () => null,
});

export default function LazyAnalytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return undefined;

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
      <Analytics />
      <SpeedInsights />
    </>
  );
}
