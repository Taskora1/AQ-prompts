'use client';

// Vercel Analytics and Speed Insights were removed for the Cloudflare
// migration (they are Vercel-only and cannot run on Cloudflare Workers).
// This component is kept as a no-op so existing imports keep working.
// Cloudflare Web Analytics can be added later via a script tag if needed.
export default function LazyAnalytics() {
  return null;
}
