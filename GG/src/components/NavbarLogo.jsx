import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { NAVBAR_LOGO_DATA_URI } from '@/lib/brand-logos';

// Header lockup: the AQ mark (square) + the "AQPrompts" wordmark as text,
// so the brand name is always readable next to the mark.
const NavbarLogo = ({ className = '', width = 140, height = 36 }) => {
  const markSize = height;
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`.trim()} aria-label="AQPrompts Home">
      <Image
        // 128px logo inlined as a data URI (see src/lib/brand-logos.js):
        // no 33 KB 512px fetch, no preload, no competition with the hero
        // (LCP) image. next/image renders data URIs as-is (unoptimized).
        src={NAVBAR_LOGO_DATA_URI}
        alt=""
        width={markSize}
        height={markSize}
        sizes={`${markSize}px`}
        loading="eager"
        className="shrink-0 object-contain"
        style={{ width: `${markSize}px`, height: `${markSize}px` }}
      />
      <span
        className="whitespace-nowrap font-black tracking-tight text-slate-950 dark:text-white"
        style={{ fontSize: `${Math.round(height * 0.62)}px`, lineHeight: 1 }}
        aria-hidden="true"
      >
        AQ<span className="text-[#c2410c] dark:text-[#ff9a73]">Prompts</span>
      </span>
    </Link>
  );
};

export default NavbarLogo;
