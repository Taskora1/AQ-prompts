import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

// Header lockup: the AQ mark (square) + the "AQPrompts" wordmark as text,
// so the brand name is always readable next to the mark.
const NavbarLogo = ({ className = '', width = 140, height = 36 }) => {
  const markSize = height;
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`.trim()} aria-label="AQPrompts Home">
      <Image
        src="/aqprompts-navbar-logo.webp"
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
