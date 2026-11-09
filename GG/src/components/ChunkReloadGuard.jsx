'use client';

import { useEffect } from 'react';

function isChunkLoadFailure(value) {
  const message =
    typeof value === 'string'
      ? value
      : value?.message || value?.reason?.message || value?.error?.message || '';

  return /ChunkLoadError|Loading chunk|failed to fetch dynamically imported module/i.test(message);
}

export default function ChunkReloadGuard() {
  useEffect(() => {
    function reloadOnce() {
      const storageKey = 'aqprompts:chunk-reload-attempted';

      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, '1');
      window.location.reload();
    }

    function handleError(event) {
      if (isChunkLoadFailure(event)) {
        reloadOnce();
      }
    }

    function handleUnhandledRejection(event) {
      if (isChunkLoadFailure(event)) {
        reloadOnce();
      }
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
