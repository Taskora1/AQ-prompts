'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';

import NavbarLogo from '@/components/NavbarLogo';
import { NavbarDesktopControls, NavbarMobileSavedLink, NavbarMobileThemeButton } from '@/components/NavbarControls';
import { PROMPT_BASE_PATH } from '@/lib/prompt-constants';

const MobileSideDrawer = dynamic(() => import('@/components/MobileSideDrawer'), {
  ssr: false,
  loading: () => null,
});

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Explore', href: PROMPT_BASE_PATH },
  { label: 'Categories', href: '/categories' },
  { label: 'Prompt Guides', href: '/blog' },
  { label: 'Feedback', href: '/feedback' },
];

const navLinkClass =
  'text-sm font-semibold text-[#4b5563] transition hover:text-[#c2410c] dark:text-[#9ca3af] dark:hover:text-[#c2410c]';

export default function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-50">
        {/* Desktop header (xl+) */}
        <header className="hidden border-b border-[#e5e7eb]/80 bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/70 xl:block dark:border-white/10 dark:bg-[#0a0a0f]/80 dark:shadow-[0_18px_60px_rgba(0,0,0,0.28)] dark:supports-[backdrop-filter]:bg-[#0a0a0f]/70">
          <nav
            className="mx-auto flex h-16 max-w-7xl items-center justify-between px-8"
            aria-label="Main navigation"
          >
            <NavbarLogo className="shrink-0" width={106} height={28} />

            <div className="hidden items-center gap-7 xl:flex">
              {navLinks.map((link) => (
                <Link key={link.label} href={link.href} className={navLinkClass}>
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="hidden items-center gap-3 xl:flex">
              <Link
                href="/#newsletter"
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#ff6b35] px-4 text-sm font-black text-[#111118] transition hover:bg-[#e85d28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111118] focus-visible:ring-offset-2"
              >
                Get Free Prompts
              </Link>
              <NavbarDesktopControls />
            </div>
          </nav>
        </header>

        {/* Mobile / Tablet header */}
        <header className="border-b border-[#e5e7eb]/80 bg-white/90 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] backdrop-blur-xl xl:hidden dark:border-white/10 dark:bg-[#0a0a0f]/90 dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.12)]">
          <nav
            className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
            aria-label="Mobile navigation"
          >
            {/* Left: Hamburger + Logo */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-[#374151] transition hover:bg-[#f3f4f6] dark:text-[#d1d5db] dark:hover:bg-white/10"
                aria-label="Open navigation menu"
                aria-expanded={drawerOpen}
              >
                <Menu className="h-5 w-5" />
              </button>
              <NavbarLogo className="shrink-0" width={90} height={24} />
            </div>

            {/* Right: Saved prompts and theme toggle */}
            <div className="flex items-center gap-2">
              <NavbarMobileSavedLink />
              <NavbarMobileThemeButton inline />
            </div>
          </nav>
        </header>
      </div>

      {/* Side Drawer (mobile only) */}
      <MobileSideDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
