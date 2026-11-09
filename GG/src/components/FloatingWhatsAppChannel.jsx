'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { SOCIAL_LINKS } from '@/lib/site-social';

export default function FloatingWhatsAppChannel() {
  const [showLabel, setShowLabel] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const hideTimeout = window.setTimeout(() => setShowLabel(false), 65_000);
    const showTimeout = window.setTimeout(() => setShowLabel(true), 60_000);
    return () => {
      window.clearTimeout(showTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, []);

  if (
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/tools/ai-image-prompts/p/')
  ) return null;

  return (
    <a
      href={SOCIAL_LINKS.whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join the AQPrompts WhatsApp channel (opens in a new tab)"
      className={`fixed right-4 top-1/2 z-[60] inline-flex min-h-11 -translate-y-1/2 items-center rounded-full bg-[#25d366] py-1 text-xs font-black text-white shadow-[0_6px_18px_rgba(0,0,0,0.2)] transition-[transform,background-color,box-shadow,padding] duration-300 hover:scale-105 hover:bg-[#20bd5a] hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25d366]/40 focus-visible:ring-offset-2 motion-safe:animate-[wa-pulse_2.8s_ease-in-out_infinite] motion-reduce:animate-none sm:right-6 ${
        showLabel ? 'gap-1.5 pl-3 pr-1 sm:gap-2 sm:pl-3.5' : 'justify-center px-1'
      }`}
    >
      <span
        aria-hidden={!showLabel}
        className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-500 ${
          showLabel ? 'max-w-28 opacity-100' : 'max-w-0 opacity-0'
        }`}
      >
        Join WhatsApp
      </span>
      <Image
        src="/whatsapp-logo.svg"
        alt=""
        width={40}
        height={40}
        className="h-9 w-9 shrink-0"
        aria-hidden="true"
      />
    </a>
  );
}
