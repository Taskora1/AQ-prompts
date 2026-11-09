'use client';

import { useEffect } from 'react';

const WEBPUSHR_KEY = 'BHO8uqa_M91tprrhGwFRFqgAm7aN-yEzAhKnxpNDYrXqTCBplamFK8vxYWXL5HPXwPLByuz-h9F53htRMBtEiLk';

export default function WebpushrLoader() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function loadWebpushr() {
      if (typeof window.webpushr !== 'function') {
        const webpushr = (...args) => {
          webpushr.q.push(args);
        };
        webpushr.q = [];
        window.webpushr = webpushr;
      }

      window.webpushr('setup', { key: WEBPUSHR_KEY });
      if (document.querySelector('script[src*="webpushr.com/app.min.js"]')) return;

      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src = 'https://cdn.webpushr.com/app.min.js';
      script.onerror = () => console.error('Webpushr failed to load from its CDN.');
      document.head.appendChild(script);
    }

    loadWebpushr();
    return undefined;
  }, []);

  return null;
}
