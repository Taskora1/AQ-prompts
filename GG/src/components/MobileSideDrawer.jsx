'use client';

import { useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { X, House, Search, BookOpen, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';

import NavbarLogo from '@/components/NavbarLogo';
import { PROMPT_BASE_PATH, PROMPT_CATEGORIES } from '@/lib/prompt-constants';

const promptCategories = Object.values(PROMPT_CATEGORIES);

const mainLinks = [
  { label: 'Home', href: '/', icon: House },
  { label: 'Explore Prompts', href: PROMPT_BASE_PATH, icon: Search },
];

const secondaryLinks = [
  { label: 'Prompt Guides', href: '/blog', icon: BookOpen },
  { label: 'Feedback', href: '/feedback', icon: BookOpen },
];

const footerLinks = [
  { label: 'About', href: '/about' },
];

const linkClass =
  'flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition';
const activeClass = 'bg-[#fff4ef] text-[#b94713] dark:bg-[#ff6b35]/15 dark:text-[#ff8a5c]';
const inactiveClass = 'text-[#374151] hover:bg-[#f3f4f6] dark:text-[#d1d5db] dark:hover:bg-white/5';

function isActive(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function MobileSideDrawer({ isOpen, onClose }) {
  const pathname = usePathname() || '/';
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Focus the close button when drawer opens
    setTimeout(() => closeButtonRef.current?.focus(), 100);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, close]);

  // Close drawer on route change
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      close();
    }
  }, [pathname, close]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] xl:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        ref={panelRef}
        className="absolute inset-y-0 left-0 flex w-[min(85vw,320px)] flex-col bg-white shadow-[0_24px_80px_rgba(0,0,0,0.2)] dark:bg-[#0f0f17]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-4 dark:border-white/10">
          <NavbarLogo width={100} height={26} />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827] dark:text-[#9ca3af] dark:hover:bg-white/10"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile navigation">
          {/* Main Links */}
          <ul className="space-y-1">
            {mainLinks.map(({ label, href, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`${linkClass} ${isActive(pathname, href) ? activeClass : inactiveClass}`}
                  aria-current={isActive(pathname, href) ? 'page' : undefined}
                >
                  {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  {!Icon && <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Categories Section */}
          <div className="mt-5">
            <p className="mb-2 px-4 text-[11px] font-bold uppercase tracking-wider text-[#9ca3af] dark:text-[#6b7280]">
              Categories
            </p>
            <ul className="space-y-0.5">
              {promptCategories.map((category) => {
                const href = `${PROMPT_BASE_PATH}/${category.slug}`;
                return (
                  <li key={category.slug}>
                    <Link
                      href={href}
                      className={`${linkClass} text-[14px] ${isActive(pathname, href) ? activeClass : inactiveClass}`}
                      aria-current={isActive(pathname, href) ? 'page' : undefined}
                    >
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#d1d5db] dark:text-[#4b5563]" aria-hidden="true" />
                      {category.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Secondary Links */}
          <div className="mt-5 border-t border-[#e5e7eb] pt-4 dark:border-white/10">
            <ul className="space-y-1">
              {secondaryLinks.map(({ label, href, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={`${linkClass} ${isActive(pathname, href) ? activeClass : inactiveClass}`}
                    aria-current={isActive(pathname, href) ? 'page' : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-[#e5e7eb] px-3 py-4 dark:border-white/10">
          <ul className="space-y-1">
            {footerLinks.map(({ label, href }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`${linkClass} text-[14px] ${isActive(pathname, href) ? activeClass : inactiveClass}`}
                  aria-current={isActive(pathname, href) ? 'page' : undefined}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
