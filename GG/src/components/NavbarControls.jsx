'use client';

import Link from 'next/link';
import { Bookmark, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FAVORITES_CHANGED_EVENT, getFavoritePromptIds } from '@/lib/favorites';
import { hasConsent } from '@/lib/consent';

function useFavoriteCount() {
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    function syncCount() {
      setCount(getFavoritePromptIds().length);
    }

    setMounted(true);
    syncCount();
    window.addEventListener(FAVORITES_CHANGED_EVENT, syncCount);
    window.addEventListener('storage', syncCount);

    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, syncCount);
      window.removeEventListener('storage', syncCount);
    };
  }, []);

  return mounted ? count : 0;
}

export function NavbarDesktopControls() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState('light');
  const favoriteCount = useFavoriteCount();

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setTheme(currentTheme);
    setMounted(true);
  }, []);

  const isDark = theme === 'dark';

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    const root = document.documentElement;
    root.setAttribute('data-theme', nextTheme);
    root.classList.toggle('dark', nextTheme === 'dark');
    root.style.colorScheme = nextTheme;
    if (hasConsent('preferences')) {
      window.localStorage.setItem('theme', nextTheme);
    }
    setTheme(nextTheme);
  };

  return (
    <>
      <Link
        href="/tools/ai-image-prompts/favorites"
        // prefetch={false}: the favorites page server-renders ALL 586 prompts
        // (getSlimAllPrompts) so its RSC payload is ~253 KB. Next prefetches
        // in-viewport links, so every page load downloaded 253 KB of
        // favorites data before the LCP image — ~1.3s of Slow-4G bandwidth.
        // Saved prompts is a rarely-visited personal page; it loads on click
        // instead (one ~253 KB fetch then, not on every page).
        prefetch={false}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#ff6b35]/35 bg-[#fff4ef] px-4 text-sm font-black text-[#b94713] shadow-sm transition hover:border-[#ff6b35] hover:bg-[#ff6b35] hover:text-white dark:border-[#ff6b35]/40 dark:bg-[#ff6b35]/15 dark:text-[#ff9b73] dark:hover:bg-[#ff6b35] dark:hover:text-white"
        aria-label={`Open saved prompts (${favoriteCount} saved)`}
        title="Open saved prompts"
      >
        <Bookmark className={`h-4 w-4 ${favoriteCount > 0 ? 'fill-current' : ''}`} aria-hidden="true" />
        Saved Prompts ({favoriteCount})
      </Link>
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[#4b5563] shadow-sm transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:border-white/10 dark:bg-[#111118] dark:text-[#9ca3af] dark:hover:border-[#ff6b35] dark:hover:text-[#c2410c]"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {mounted ? (
          isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
        ) : (
          <span className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </>
  );
}

export function NavbarMobileSavedLink() {
  const favoriteCount = useFavoriteCount();

  return (
    <Link
      href="/tools/ai-image-prompts/favorites"
      // prefetch={false}: same 253 KB favorites RSC payload as the desktop
      // link — this bookmark icon is in the viewport on every mobile page,
      // so it was prefetched on every mobile load, starving the LCP image.
      prefetch={false}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white/90 text-[#4b5563] shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:border-white/10 dark:bg-[#0a0a0f]/90 dark:text-[#9ca3af] dark:hover:border-[#ff6b35] dark:hover:text-[#ff9b73]"
      aria-label={`Open saved prompts (${favoriteCount} saved)`}
      title={`Saved prompts (${favoriteCount})`}
    >
      <Bookmark className={`h-4 w-4 ${favoriteCount > 0 ? 'fill-current' : ''}`} aria-hidden="true" />
    </Link>
  );
}

export function NavbarMobileThemeButton({ inline = false }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setTheme(currentTheme);
    setMounted(true);
  }, []);

  const isDark = theme === 'dark';

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    const root = document.documentElement;
    root.setAttribute('data-theme', nextTheme);
    root.classList.toggle('dark', nextTheme === 'dark');
    root.style.colorScheme = nextTheme;
    if (hasConsent('preferences')) {
      window.localStorage.setItem('theme', nextTheme);
    }
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${inline ? 'inline-flex' : 'absolute right-3 top-[58px] z-50 inline-flex md:hidden'} h-9 w-9 items-center justify-center rounded-full border border-[#e5e7eb] bg-white/90 text-[#4b5563] shadow-[0_12px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl transition hover:border-[#ff6b35] hover:text-[#c2410c] dark:border-white/10 dark:bg-[#0a0a0f]/90 dark:text-[#9ca3af] dark:hover:border-[#ff6b35] dark:hover:text-[#c2410c]`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {mounted ? (
        isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
      ) : (
        <span className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
