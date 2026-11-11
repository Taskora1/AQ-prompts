'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import CookieSettingsButton from '@/components/CookieSettingsButton';
import { HomeSocialLinks } from '@/components/home/HomeTrustSections';
import NavbarLogo from '@/components/NavbarLogo';
import { PROMPT_BASE_PATH, PROMPT_CATEGORIES } from '@/lib/prompt-constants';

const categoryLinks = [
  { label: 'All Prompt Categories', href: PROMPT_BASE_PATH },
  ...Object.values(PROMPT_CATEGORIES).map((category) => ({
    label: category.label,
    href: `${PROMPT_BASE_PATH}/${category.slug}`,
  })),
];

const footerGroups = [
  {
    title: 'Prompt Categories',
    links: categoryLinks,
  },
  {
    title: 'Explore',
    links: [
      { label: 'My Account', href: '/account' },
      { label: 'Free Community', href: '/promptshe-trial' },
      { label: 'Prompt Library', href: '/tools/ai-image-prompts' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Guides', href: '/blog' },
      { label: 'Categories', href: '/categories' },
      { label: 'How We Review Prompts', href: '/how-we-review-prompts' },
      { label: 'Feedback', href: '/feedback' },
      { label: 'Editorial Policy', href: '/editorial-policy' },
      { label: 'AI Policy', href: '/ai-policy' },
      { label: 'Sitemap', href: '/sitemap.xml' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Abdul Qudoos, Founder', href: '/author/abdul-qudoos' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Cookie Policy', href: '/cookie-policy' },
      { label: 'Terms and Conditions', href: '/terms' },
      { label: 'Disclaimer', href: '/disclaimer' },
      { label: 'Refund Policy', href: '/refund-policy' },
    ],
  },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const [openGroup, setOpenGroup] = useState(null);

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white dark:border-white/10 dark:bg-[#0a0a0f]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="grid items-start gap-0 md:grid-cols-2 md:gap-6 lg:grid-cols-[1.25fr_repeat(4,minmax(0,1fr))] lg:gap-7">
          <div className="mb-6 md:mb-0">
            <NavbarLogo />
            <p className="mt-4 text-sm leading-6 text-slate-700 dark:text-slate-300">
              Free digital AI prompt library for creators, with practical prompts for portraits, social content, and photo editing.
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-400">
              Support: <a href="mailto:hello@aqprompts.com" className="text-[#c2410c] hover:underline">hello@aqprompts.com</a>
            </p>
            <HomeSocialLinks className="mt-4" />
            <a
              href="https://findly.tools/aq-prompts?utm_source=aq-prompts"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-[#c2410c] hover:text-[#c2410c] dark:border-white/10 dark:text-slate-300 dark:hover:border-[#ff8a5c] dark:hover:text-[#ff8a5c]"
            >
              Featured on Findly.tools
            </a>
          </div>

          {footerGroups.map((group, index) => {
            const isOpen = openGroup === index;

            return (
            <div key={group.title} className="border-t border-slate-200 md:border-0 dark:border-white/10">
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? null : index)}
                className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left md:hidden"
                aria-expanded={isOpen}
                aria-controls={`footer-group-${index}`}
              >
                <h2 className="whitespace-nowrap text-sm font-black uppercase tracking-[0.16em] text-slate-950 dark:text-white">
                  {group.title}
                </h2>
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[#d4520a] dark:border-white/10 dark:bg-[#111118] dark:text-[#ff9b73]"
                  aria-hidden="true"
                >
                  <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              <div
                id={`footer-group-${index}`}
                className={`grid transition-[grid-template-rows] duration-200 md:grid-rows-[1fr] ${
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <nav aria-label={group.title} className="overflow-hidden">
                  <h2 className="hidden whitespace-nowrap text-sm font-black uppercase tracking-[0.16em] text-slate-950 md:block dark:text-white">
                    {group.title}
                  </h2>
                  <ul className="space-y-2 pb-4 md:mt-3 md:pb-0">
                    {group.links.map((link) => (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="text-sm font-medium text-[#374151] transition hover:text-[#c2410c] dark:text-[#9ca3af] dark:hover:text-[#c2410c]"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
            );
          })}
        </div>

        <div className="mt-7 flex flex-col gap-3 border-t border-slate-200 pt-5 text-sm text-slate-600 dark:border-white/10 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright {currentYear} AQPrompts. Digital AI Prompt Library. All rights reserved.</p>
          <CookieSettingsButton className="w-fit font-semibold text-slate-700 underline-offset-4 hover:text-[#c2410c] hover:underline dark:text-slate-300" />
        </div>
      </div>
    </footer>
  );
}
