import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

const NavbarLogo = ({ className = '', width = 140, height = 36 }) => {
  return (
    <Link href="/" className={`inline-flex items-center ${className}`.trim()} aria-label="AQPrompts Home">
      <Image
        src="/aqprompts-navbar-logo.webp"
        alt="AQPrompts"
        width={width}
        height={height}
        sizes={`${width}px`}
        loading="eager"
        className="object-contain object-left"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </Link>
  );
};

export default NavbarLogo;
