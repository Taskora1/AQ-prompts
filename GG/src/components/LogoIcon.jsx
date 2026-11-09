import React from 'react';
import Image from 'next/image';

const LogoIcon = ({ className = '', iconClassName = '' }) => {
  return (
    <Image
      src="/aqprompts-logo.webp"
      alt="AQPrompts logo"
      width={40}
      height={40}
      sizes="40px"
      priority
      className={`h-10 w-10 rounded-lg object-contain ${className} ${iconClassName}`.trim()}
      unoptimized
    />
  );
};

export default LogoIcon;

