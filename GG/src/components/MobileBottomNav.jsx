'use client';

import Link from 'next/link';
import { BookOpen, House, LayoutGrid } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { PROMPT_BASE_PATH } from '@/lib/prompt-constants';

const savedPromptsPath = `${PROMPT_BASE_PATH}/favorites`;

const baseLinkClass =
  'flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium leading-none transition';
const inactiveLinkClass = 'text-[#4b5563] hover:text-[#d4520a] dark:text-[#9ca3af]';
const activeLinkClass = 'bg-[#fff4ef] font-bold text-[#b94713] dark:bg-white/5 dark:text-[#ff9b73]';
function isGuideRoute(pathname) {
  return pathname === '/blog'
    || pathname.startsWith('/blog/')
    || pathname === '/guides'
    || pathname.startsWith('/guides/');
}

function isLibraryRoute(pathname) {
  return pathname !== savedPromptsPath
    && (pathname === PROMPT_BASE_PATH || pathname.startsWith(`${PROMPT_BASE_PATH}/`));
}

function MobileNavLink({ active, href, icon: Icon, label }) {
  return (
    <Link
      href={href}
      className={`${baseLinkClass} ${active ? activeLinkClass : inactiveLinkClass}`}
      aria-current={active ? 'page' : undefined}
      data-mobile-nav-item={label.toLowerCase()}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

export default function MobileBottomNav() {
  const pathname = usePathname() || '/';
  const homeActive = pathname === '/';
  const guidesActive = isGuideRoute(pathname);
  const libraryActive = isLibraryRoute(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex w-full items-center justify-center pb-[env(safe-area-inset-bottom)] xl:hidden"
      aria-label="Mobile quick navigation"
    >
      <div className="grid w-full grid-cols-3 rounded-t-[22px] border-t border-[#e5e7eb] bg-white/95 px-2 pb-2 pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0a0a0f]/95">
        <MobileNavLink active={homeActive} href="/" icon={House} label="Home" />
        <MobileNavLink active={libraryActive} href={PROMPT_BASE_PATH} icon={LayoutGrid} label="Library" />
        <MobileNavLink active={guidesActive} href="/blog" icon={BookOpen} label="Guides" />
      </div>
    </nav>
  );
}
