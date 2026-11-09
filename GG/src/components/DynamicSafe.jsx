'use client';

import ErrorBoundary from './ErrorBoundary';

/**
 * Client component wrapper that catches rendering errors.
 * Import this from server components — it just wraps children.
 *
 * Usage in a server page:
 *   import DynamicSafe from '@/components/DynamicSafe';
 *   const BlogForm = dynamic(() => import('./BlogForm'), { ssr: false });
 *   <DynamicSafe><BlogForm /></DynamicSafe>
 */
export default function DynamicSafe({ children, fallback }) {
  return (
    <ErrorBoundary fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}