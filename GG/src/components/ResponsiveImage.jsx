import React from 'react';
import Image from 'next/image';
import { getStaticResponsiveImage } from '@/lib/static-responsive-images';
import { getCloudinaryResponsiveImage, optimizeCloudinaryUrl } from '@/lib/cloudinary-optimize';

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCA0MCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iMjQiIGZpbGw9IiMxMTExMTgiLz48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iMjQiIGZpbGw9IiNmZjZiMzUiIG9wYWNpdHk9Ii4xOCIvPjwvc3ZnPg==';
const DEFAULT_IMAGE_WIDTH = 1200;
const DEFAULT_IMAGE_HEIGHT = 675;

const ResponsiveImage = ({
  src,
  alt,
  className = '',
  sizes = '100vw',
  loading = 'lazy',
  fetchPriority,
  width,
  height,
  rounded = true,
  priority = false,
  quality,
  preserveAspect = false,
  responsiveCloudinary = false,
  // Width (px) for the Cloudinary src URL when the image has no srcSet.
  // The default optimize width is 800 — far too big for small thumbnails
  // (e.g. the 96px sidebar Featured image). Only set where the display
  // size is known and small.
  cloudinaryWidth,
  // When true, the image does not zoom on hover. The zoom scales the image
  // inside an overflow-hidden wrapper, which clips a few percent off every
  // edge while hovered — enough to cut off text baked into a cover image
  // near its edges. Blog list cards pass this; everything else keeps the
  // existing zoom (default false = no behaviour change).
  disableHoverZoom = false,
}) => {
  const roundingClass = rounded ? 'rounded-[28px]' : 'rounded-none';
  const shouldFill = !width || !height;
  const hoverZoomClass = disableHoverZoom ? '' : 'group-hover:scale-[1.05]';
  const wrapperHoverZoomClass = disableHoverZoom ? '' : 'hover:scale-[1.02]';
  const canUseBlur = typeof src === 'string' && !src.endsWith('.svg');
  const blurProps = canUseBlur ? { placeholder: 'blur', blurDataURL: BLUR_DATA_URL } : {};
  const responsiveImage = getStaticResponsiveImage(src);
  const cloudinaryResponsiveImage = responsiveCloudinary
    ? getCloudinaryResponsiveImage(src)
    : null;
  const srcSet = responsiveImage?.srcSet || cloudinaryResponsiveImage?.srcSet;
  const optimizedSrc = optimizeCloudinaryUrl(
    src,
    cloudinaryWidth ? { width: cloudinaryWidth } : undefined,
  );

  return (
    <div className={`relative group w-full ${preserveAspect ? '' : 'h-full'} overflow-hidden ${roundingClass} bg-[#f9fafb] dark:bg-[#111118] shadow-[0_24px_60px_rgba(255,107,53,0.12)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.3)] transition-all duration-500 hover:shadow-[0_32px_80px_rgba(255,107,53,0.2)] dark:hover:shadow-[0_32px_80px_rgba(0,0,0,0.5)] ${wrapperHoverZoomClass}`}>
      <div className="absolute inset-0 bg-[#ff6b3520] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      {responsiveImage ? (
        <img
          src={optimizedSrc}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          width={width || DEFAULT_IMAGE_WIDTH}
          height={height || DEFAULT_IMAGE_HEIGHT}
          className={`${className} ${preserveAspect ? 'h-auto w-full object-contain' : 'h-full w-full object-cover'} transition-transform duration-700 ${hoverZoomClass}`}
          loading={priority ? 'eager' : loading}
          decoding="async"
          {...(fetchPriority ? { fetchPriority } : {})}
        />
      ) : preserveAspect ? (
        <img
          src={optimizedSrc}
          {...(srcSet ? { srcSet } : {})}
          alt={alt}
          width={width || DEFAULT_IMAGE_WIDTH}
          height={height || DEFAULT_IMAGE_HEIGHT}
          className={`${className} h-auto w-full object-contain transition-transform duration-700 ${hoverZoomClass}`}
          sizes={sizes}
          loading={priority ? 'eager' : loading}
          decoding="async"
          {...(fetchPriority ? { fetchPriority } : {})}
        />
      ) : shouldFill ? (
        <Image
          src={optimizedSrc}
          {...(srcSet ? { srcSet } : {})}
          alt={alt}
          fill
          className={`${preserveAspect ? 'h-auto w-full object-contain' : 'object-cover'} transition-transform duration-700 ${hoverZoomClass} ${className}`}
          loading={priority ? undefined : loading}
          priority={priority}
          quality={quality}
          sizes={sizes}
          {...blurProps}
          {...(fetchPriority ? { fetchPriority } : {})}
        />
      ) : (
        <Image
          src={optimizedSrc}
          {...(srcSet ? { srcSet } : {})}
          alt={alt}
          className={`h-full w-full object-cover transition-transform duration-700 ${hoverZoomClass} ${className}`}
          loading={priority ? undefined : loading}
          priority={priority}
          quality={quality}
          sizes={sizes}
          width={width}
          height={height}
          {...blurProps}
          {...(fetchPriority ? { fetchPriority } : {})}
        />
      )}
      <div
        className={`absolute inset-0 border border-[#ff6b35]/30 dark:border-[#ff6b35]/30 ${roundingClass} pointer-events-none`}
      ></div>
    </div>
  );
};

export default ResponsiveImage;
