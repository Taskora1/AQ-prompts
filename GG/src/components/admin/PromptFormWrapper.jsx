'use client';

import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';

const PromptForm = dynamic(() => import('../../../app/admin/PromptForm'), { ssr: false });

const EditorErrorFallback = (
  <div className="rounded border border-amber-200 bg-amber-50 p-6 text-center">
    <p className="text-sm font-semibold text-amber-800">Failed to load the prompt editor.</p>
    <p className="mt-1 text-xs text-amber-700">This may be caused by a browser extension. Try disabling extensions and refreshing.</p>
  </div>
);

export default function PromptFormWrapper(props) {
  return (
    <ErrorBoundary fallback={EditorErrorFallback}>
      <PromptForm {...props} />
    </ErrorBoundary>
  );
}