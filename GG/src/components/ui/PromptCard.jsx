import Image from 'next/image';
import Link from 'next/link';

import ImageCarousel from '@/components/ui/ImageCarousel';
import { optimizeCloudinaryUrl } from '@/lib/cloudinary-optimize';
import { getPromptThumbnailPaths } from '@/lib/prompt-images';
import { getCategoryDisplayName, getPromptUrl } from '@/lib/prompt-constants';

export default function PromptCard({
  title,
  description,
  category,
  platform,
  image,
  images = [],
  slug,
  initialStats = null,
  priority = false,
  staticImage = false,
  actionLabel = 'Open, Copy & Rate',
}) {
  const promptUrl = getPromptUrl({ slug, title });
  const previewImages = Array.isArray(images) && images.length > 0 ? images : [image || '/images/placeholder.webp'];
  const cardImages = getPromptThumbnailPaths(previewImages);
  const cardImage = cardImages[0] || previewImages[0];
  const categoryLabel = getCategoryDisplayName(category);
  return (
    <article
      className="group flex h-full min-w-0 w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:border-[#ff6b35] hover:shadow-[0_28px_90px_rgba(255,107,53,0.14)] focus:outline-none focus:ring-2 focus:ring-[#ff6b35] focus:ring-offset-2 focus:ring-offset-white dark:border-white/10 dark:bg-[#111118] dark:shadow-[0_24px_70px_rgba(0,0,0,0.28)] dark:hover:border-[#ff6b35]/40 dark:focus:ring-offset-[#0a0a0f]"
    >
      <div className="relative block aspect-[4/5] w-full overflow-hidden bg-[#ff6b3520] focus-within:ring-2 focus-within:ring-[#ff6b35] dark:bg-[#1a1a2e]">
        {staticImage ? (
          <>
            <Image
              src={optimizeCloudinaryUrl(cardImage, { width: 480 })}
              alt={title}
              fill
              sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 378px"
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : undefined}
              className="object-cover transition duration-500 group-hover:scale-105"
            />
            <Link
              href={promptUrl}
              aria-label={`Open prompt: ${title}`}
              className="absolute inset-0 z-10 focus:outline-none"
            />
          </>
        ) : (
          <ImageCarousel
            images={cardImages.length > 0 ? cardImages : previewImages}
            alt={title}
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 378px"
            imageWidth={480}
            priority={priority}
            quality={55}
            hoverPlay
            compactIndicators
            className="absolute inset-0"
            imageClassName="object-cover transition duration-500 group-hover:scale-105"
          >
            <Link
              href={promptUrl}
              aria-label={`Open prompt: ${title}`}
              className="absolute inset-0 z-10 focus:outline-none"
            />
          </ImageCarousel>
        )}

        {platform ? (
          <div className="absolute left-3 top-3 z-30 max-w-[calc(50%-0.75rem)] truncate rounded-full bg-[#ff6b35] px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-lg shadow-orange-950/25">
            {platform}
          </div>
        ) : null}

      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        {/* Like control intentionally removed — engagement features are disabled site-wide. */}
        <div className="flex items-center justify-end">
          <div className="truncate rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-semibold text-[#4b5563] dark:bg-[#1e1e2e] dark:text-[#9ca3af]">
            {categoryLabel}
          </div>
        </div>

        <h3 className="mt-2 min-w-0 break-words text-base font-bold leading-snug text-[#111118] sm:text-xl dark:text-white">
          <Link href={promptUrl} className="break-words focus:outline-none focus:ring-2 focus:ring-[#ff6b35]">
            <span className="transition group-hover:text-[#c2410c]">{title}</span>
          </Link>
        </h3>

        <div className="mt-auto grid gap-2 pt-4">
          <Link
            href={promptUrl}
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#ff6b35] px-5 text-sm font-bold text-[#111118] shadow-lg shadow-orange-950/20 transition hover:bg-[#e85d28] dark:shadow-orange-950/25"
          >
            {actionLabel} <span aria-hidden="true" className="ml-1">&rarr;</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
