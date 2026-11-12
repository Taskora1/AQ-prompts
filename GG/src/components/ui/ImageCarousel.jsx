'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { optimizeCloudinaryUrl } from '@/lib/cloudinary-optimize';
import { getPromptThumbnailPath, getPromptThumbnailSrcSet } from '@/lib/prompt-images';

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA0MCA1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNTAiIGZpbGw9IiMxMTExMTgiLz48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNTAiIGZpbGw9IiNmZjZiMzUiIG9wYWNpdHk9Ii4xOCIvPjwvc3ZnPg==';

function normalizeImages(images = []) {
  return [...new Set(images.map((image) => String(image || '').trim()).filter(Boolean))];
}

const CLOUDINARY_WIDTHS = [360, 414, 480, 512, 520, 600, 640, 750, 800, 1080, 1200];

function buildCloudinarySrcSet(image, maxWidth) {
  return CLOUDINARY_WIDTHS
    .filter((width) => width <= maxWidth)
    .map((width) => `${optimizeCloudinaryUrl(image, { width })} ${width}w`)
    .join(', ');
}

export default function ImageCarousel({
  images = [],
  alt = '',
  imageAltTexts = {},
  sizes,
  imageWidth = 800,
  responsiveMaxWidth = imageWidth,
  priority = false,
  quality = 65,
  className = '',
  imageClassName = 'object-cover',
  autoPlay = false,
  hoverPlay = false,
  compactIndicators = false,
  showIndicators = true,
  children = null,
}) {
  const validImages = useMemo(() => normalizeImages(images), [images]);
  const displayImages = validImages.length > 0 ? validImages : ['/images/placeholder.webp'];
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isHoverPlaying, setIsHoverPlaying] = useState(false);
  const [timerVersion, setTimerVersion] = useState(0);
  const hasMultipleImages = displayImages.length > 1;
  const activeImage = displayImages[Math.min(activeIndex, displayImages.length - 1)];
  const indicatorWrapClassName = compactIndicators
    ? 'absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-0.5 rounded-full bg-black/35 px-1.5 py-1 backdrop-blur'
    : 'absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full bg-black/30 px-1.5 py-1 backdrop-blur';
  const indicatorButtonClassName =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/80';
  const activeDotClassName = compactIndicators ? 'w-3.5 bg-[#ff6b35]' : 'w-5 bg-[#ff6b35]';
  const inactiveDotClassName = compactIndicators ? 'w-1 bg-white/70' : 'w-1.5 bg-white/70';

  useEffect(() => {
    if (!autoPlay || !hasMultipleImages || isPaused) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % displayImages.length);
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [autoPlay, displayImages.length, hasMultipleImages, isPaused, timerVersion]);

  useEffect(() => {
    if (!hoverPlay || !isHoverPlaying || !hasMultipleImages) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % displayImages.length);
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [hoverPlay, displayImages.length, hasMultipleImages, isHoverPlaying, timerVersion]);

  function goToIndex(index) {
    setActiveIndex((index + displayImages.length) % displayImages.length);
  }

  function handleManualChange(index) {
    goToIndex(index);
    setTimerVersion((version) => version + 1);
  }

  function handlePrevious(event) {
    event.preventDefault();
    event.stopPropagation();
    handleManualChange(activeIndex - 1);
  }

  function handleNext(event) {
    event.preventDefault();
    event.stopPropagation();
    handleManualChange(activeIndex + 1);
  }

  function handleTouchEnd(event) {
    if (touchStartX === null || !hasMultipleImages) return;

    const deltaX = event.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);

    if (Math.abs(deltaX) < 36) return;
    handleManualChange(activeIndex + (deltaX < 0 ? 1 : -1));
  }

  const optimizedActiveImage = optimizeCloudinaryUrl(activeImage, { width: imageWidth });
  const isCloudinaryImage = optimizedActiveImage.includes('res.cloudinary.com');
  // Local prompt images: next.config.js sets images.unoptimized=true, so
  // next/image serves the original file as-is (the 1122px detail hero into
  // a 334px slot). The prebuild script already generates 640px + 360px
  // thumbs for every /images/prompts file, so serve those with a srcSet
  // instead — same pattern as PromptFeedCard (getPromptThumbnailSrcSet).
  // Non-prompt local images (e.g. the placeholder) have no thumb and keep
  // the next/image branch below.
  const localThumbnailSrcSet = isCloudinaryImage ? null : getPromptThumbnailSrcSet(activeImage);
  const localThumbnailSrc = localThumbnailSrcSet ? getPromptThumbnailPath(activeImage) : null;
  const srcSetMaxWidth = Math.max(responsiveMaxWidth, 360);
  const activeAlt = imageAltTexts?.[String(activeIndex)]
    || imageAltTexts?.[activeIndex]
    || (hasMultipleImages ? `${alt} ${activeIndex + 1}` : alt);

  return (
    <div
      className={className}
      onMouseEnter={() => {
        setIsPaused(true);
        if (hoverPlay && hasMultipleImages) {
          setIsHoverPlaying(true);
        }
      }}
      onMouseLeave={() => {
        setIsPaused(false);
        if (hoverPlay) {
          setIsHoverPlaying(false);
          setActiveIndex(0);
        }
      }}
      onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
      onTouchEnd={handleTouchEnd}
    >
      {isCloudinaryImage ? (
        <img
          key={optimizedActiveImage}
          src={optimizedActiveImage}
          srcSet={buildCloudinarySrcSet(activeImage, srcSetMaxWidth)}
          sizes={sizes}
          alt={activeAlt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          className={`absolute inset-0 h-full w-full ${imageClassName}`}
          style={{ backgroundImage: `url("${BLUR_DATA_URL}")`, backgroundSize: 'cover' }}
        />
      ) : localThumbnailSrcSet ? (
        <img
          key={localThumbnailSrc}
          src={localThumbnailSrc}
          srcSet={localThumbnailSrcSet}
          sizes={sizes}
          alt={activeAlt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          className={`absolute inset-0 h-full w-full ${imageClassName}`}
          style={{ backgroundImage: `url("${BLUR_DATA_URL}")`, backgroundSize: 'cover' }}
        />
      ) : (
        <Image
          key={optimizedActiveImage}
          src={optimizedActiveImage}
          alt={activeAlt}
          fill
          sizes={sizes}
          loading={priority ? undefined : 'lazy'}
          priority={priority}
          fetchPriority={priority ? 'high' : undefined}
          quality={quality}
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          className={imageClassName}
        />
      )}

      {children}

      {hasMultipleImages ? (
        <>
          <button
            type="button"
            onClick={handlePrevious}
            className="absolute left-3 top-1/2 z-30 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white shadow-lg backdrop-blur transition hover:bg-[#ff6b35] md:inline-flex"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-3 top-1/2 z-30 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white shadow-lg backdrop-blur transition hover:bg-[#ff6b35] md:inline-flex"
            aria-label="Next image"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          {showIndicators ? (
          <div className={indicatorWrapClassName}>
            {displayImages.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleManualChange(index);
                }}
                className={indicatorButtonClassName}
                aria-label={`Show image ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
              >
                <span
                  className={`h-1.5 rounded-full transition ${
                    index === activeIndex ? activeDotClassName : inactiveDotClassName
                  }`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
