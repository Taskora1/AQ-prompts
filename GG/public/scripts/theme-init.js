(() => {
  try {
    const consent = JSON.parse(window.localStorage.getItem('aqprompts_cookie_consent_v1') || 'null');
    const storedTheme = consent && consent.version === 1 && consent.preferences === true
      ? window.localStorage.getItem('theme')
      : null;
    const theme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'light';
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  } catch {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  }
})();
