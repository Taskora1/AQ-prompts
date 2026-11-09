'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpenText,
  FolderTree,
  Globe,
  Layers,
  LayoutDashboard,
  PenTool,
  Star,
  Users,
} from 'lucide-react';

const primaryLinks = [
  { href: '/admin', label: 'Prompts', icon: LayoutDashboard, exact: true },
  { href: '/admin/text-prompts', label: 'Text prompts', icon: BookOpenText },
  { href: '/admin/blog', label: 'Blog', icon: PenTool },
  { href: '/admin/collections', label: 'Collections', icon: Layers },
  { href: '/admin/categories', label: 'Categories', icon: FolderTree, restricted: true },
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
  { href: '/admin/users', label: 'Users', icon: Users, restricted: true },
  { href: '/admin/authors', label: 'Authors', icon: Users, superAdmin: true },
];

export default function AdminNavigation({ user }) {
  const pathname = usePathname() || '/admin';
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white shadow-lg shadow-slate-950/10">
      <div className="mx-auto flex min-h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/admin" className="shrink-0 rounded-md text-sm font-bold tracking-wide text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          AQPrompts <span className="font-medium text-slate-400">Admin</span>
        </Link>
        <span className="hidden h-6 w-px bg-slate-700 sm:block" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-right text-xs text-slate-400 sm:text-left">
          {user?.email}
        </p>
        <form action="/admin/logout" method="post">
          <button
            type="submit"
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Sign out
          </button>
        </form>
      </div>
      <nav aria-label="Admin sections" className="admin-nav-scroll border-t border-slate-800">
        <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-3 py-2 sm:px-5 lg:px-7">
          {primaryLinks
            .filter((link) => (!link.restricted || isSuperAdmin) && (!link.superAdmin || isSuperAdmin))
            .map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
              const isPromptSection = exact && pathname.startsWith('/admin/prompts/');

              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active || isPromptSection ? 'page' : undefined}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    active || isPromptSection
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          <a
            href="/api/sitemap"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            Sitemap
          </a>
        </div>
      </nav>
    </header>
  );
}
