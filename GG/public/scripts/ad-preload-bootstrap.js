(() => {
  const consentKey = 'aqprompts_cookie_consent_v1';
  let consent;

  try {
    consent = JSON.parse(localStorage.getItem(consentKey) || 'null');
  } catch {
    const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${consentKey}=`));
    if (cookie) {
      try {
        consent = JSON.parse(decodeURIComponent(cookie.slice(consentKey.length + 1)));
      } catch {
        consent = null;
      }
    }
  }
  if (consent?.advertising !== true) return;

  const nativeScriptUrl = 'https://pl29777486.profitableratecpmnetwork.com/08e364828f4f82ab5fed9cb95b8ebe2b/invoke.js';
  const displayScriptUrls = {
    '300x250': 'https://www.highperformanceformat.com/c077460f59332352402ebb8e56de5e59/invoke.js',
    '320x50': 'https://www.highperformanceformat.com/a7800e494fb2d80916d8a3a64cbfdff8/invoke.js',
    '468x60': 'https://www.highperformanceformat.com/e3f8e27fbd32d7ee81a4746eebdbfb43/invoke.js',
  };
  const path = location.pathname;
  const nativeRoute = path === '/' || path.startsWith('/blog/');
  const promptRoute = path.startsWith('/tools/ai-image-prompts');
  const promptDetailRoute = path.startsWith('/tools/ai-image-prompts/p/');
  const urls = [];

  if (nativeRoute || promptDetailRoute) urls.push(nativeScriptUrl);
  if (promptRoute && !promptDetailRoute) {
    urls.push(displayScriptUrls['300x250'], displayScriptUrls['320x50']);
  }
  if (promptDetailRoute) {
    const mobile = matchMedia('(max-width: 639px)').matches;
    urls.push(displayScriptUrls[mobile ? '320x50' : '468x60']);
  }

  const origins = new Set();
  for (const href of urls) {
    const url = new URL(href);
    if (!origins.has(url.origin)) {
      origins.add(url.origin);
      const connection = document.createElement('link');
      connection.rel = 'preconnect';
      connection.href = url.origin;
      document.head.appendChild(connection);
    }
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'script';
    preload.href = href;
    preload.fetchPriority = 'high';
    document.head.appendChild(preload);
  }
})();
