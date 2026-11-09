'use client';

import { useMemo } from 'react';
import AdsterraNativeBanner from '@/components/AdsterraNativeBanner';
import {
  AI_EDITED_DISCLOSURE,
  AI_GENERATED_DISCLOSURE,
  VERIFIED_MEDIA_PLACEHOLDER,
  VERIFIED_MEDIA_PLACEHOLDER_ALT,
} from '@/lib/media-safety';
import { getStaticResponsiveImage } from '@/lib/static-responsive-images';
import { optimizeCloudinaryUrl } from '@/lib/cloudinary-optimize';

const IMG_TAG_RE = /<img\b([^>]*)>/gi;

function getAttr(attrs, name) {
  const match = String(attrs || '').match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
  return match?.[1]?.trim() || '';
}

function getImageDisclosure(part) {
  if (getAttr(part.attrs, 'src') === VERIFIED_MEDIA_PLACEHOLDER) {
    return 'The original example is withheld because it requires additional safety or rights review.';
  }

  return getAttr(part.attrs, 'data-media-disclosure') === 'ai_edited'
    ? AI_EDITED_DISCLOSURE
    : AI_GENERATED_DISCLOSURE;
}

export function splitArticleHtml(html = '') {
  const parts = [];
  let lastIndex = 0;
  let imageIndex = 0;
  let match;
  const source = String(html || '');
  const re = new RegExp(IMG_TAG_RE.source, IMG_TAG_RE.flags);

  while ((match = re.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'html',
        key: `html-${lastIndex}`,
        content: source.slice(lastIndex, match.index),
      });
    }

    parts.push({
      type: 'image',
      key: `img-${imageIndex}`,
      attrs: match[1],
    });
    imageIndex += 1;
    lastIndex = re.lastIndex;
  }

  if (lastIndex < source.length) {
    parts.push({
      type: 'html',
      key: `html-${lastIndex}`,
      content: source.slice(lastIndex),
    });
  }

  return parts;
}

function getHeadingText(headingHtml) {
  return String(headingHtml || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitNextPromptHeading(content) {
  const headingPattern = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
  let match;

  while ((match = headingPattern.exec(content)) !== null) {
    if (!/^\d{1,2}[.)]\s/.test(getHeadingText(match[0]))) continue;

    let headingEnd = headingPattern.lastIndex;
    const followingParagraph = content.slice(headingEnd).match(/^(\s*<p\b[^>]*>[\s\S]*?<\/p>)/i);
    if (followingParagraph && getHeadingText(followingParagraph[1])) {
      headingEnd += followingParagraph[1].length;
    }

    return {
      content: `${content.slice(0, match.index)}${content.slice(headingEnd)}`,
      heading: content.slice(match.index, headingEnd),
    };
  }

  return { content, heading: '' };
}

function splitGalleryPostamble(content) {
  const promptEnd = content.search(/<\/div>\s*(?=<h1\b)/i);
  if (promptEnd < 0) return { prompt: content, postamble: '' };

  const closingTagEnd = content.indexOf('</div>', promptEnd);
  const postambleStart = content.slice(closingTagEnd + 6).search(/<h1\b/i);
  if (closingTagEnd < 0 || postambleStart < 0) return { prompt: content, postamble: '' };

  const headingStart = closingTagEnd + 6 + postambleStart;
  return {
    prompt: content.slice(0, headingStart),
    postamble: content.slice(headingStart),
  };
}

function preparePromptGalleryParts(parts) {
  const prepared = [];
  let imageCount = 0;
  let promptCount = 0;

  parts.forEach((part, index) => {
    if (part.type === 'image') {
      imageCount += 1;
      prepared.push({ ...part, galleryImage: true });
      return;
    }

    if (!part.content.trim()) return;

    const containsPrompt = /class=["'][^"']*\bprompt-block\b/i.test(part.content);
    if (!containsPrompt) {
      prepared.push({ ...part, galleryIntro: imageCount === 0 });
      return;
    }

    const isFinalPrompt = !parts.slice(index + 1).some((nextPart) => nextPart.type === 'image');
    const { content, heading } = isFinalPrompt
      ? { content: part.content, heading: '' }
      : splitNextPromptHeading(part.content);
    const { prompt, postamble } = isFinalPrompt
      ? splitGalleryPostamble(content)
      : { prompt: content, postamble: '' };

    if (prompt.trim()) {
      prepared.push({
        ...part,
        content: prompt,
        promptCard: true,
      });
      promptCount += 1;
      if (promptCount === 3) {
        prepared.push({ type: 'article-ad', key: `${part.key}-adsterra-slot` });
      }
    }

    if (heading) {
      prepared.push({
        type: 'prompt-heading',
        key: `${part.key}-next-heading`,
        content: heading,
      });
    }

    if (postamble.trim()) {
      prepared.push({
        type: 'html',
        key: `${part.key}-postamble`,
        content: postamble,
        postamble: true,
      });
    }
  });

  return prepared;
}

function prepareArticleParts(parts) {
  const prepared = [];
  let headingCount = 0;
  let adInserted = false;

  parts.forEach((part) => {
    if (part.type !== 'html' || adInserted) {
      prepared.push(part);
      return;
    }

    const headings = [...part.content.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)];
    const targetHeadingIndex = 3 - headingCount;
    const targetHeading = headings[targetHeadingIndex];

    if (targetHeading) {
      const beforeHeading = part.content.slice(0, targetHeading.index);
      const fromHeading = part.content.slice(targetHeading.index);
      if (beforeHeading.trim()) {
        prepared.push({
          ...part,
          key: `${part.key}-before-ad`,
          content: beforeHeading,
          articleSegment: true,
        });
      }
      prepared.push({ type: 'article-ad', key: `${part.key}-adsterra-slot` });
      prepared.push({
        ...part,
        key: `${part.key}-after-ad`,
        content: fromHeading,
        articleSegment: true,
      });
      adInserted = true;
      return;
    }

    headingCount += headings.length;
    prepared.push(part);
  });

  return prepared;
}

function ArticleInlineImage({ src, alt, title, disclosure, showDisclosure = true, className = '' }) {
  if (!src) return null;

  const evidencePlaceholder = src === VERIFIED_MEDIA_PLACEHOLDER;
  const responsiveImage = getStaticResponsiveImage(src);
  const imageAlt = evidencePlaceholder ? VERIFIED_MEDIA_PLACEHOLDER_ALT : alt || '';

  return (
    <figure className={`my-6 ${className}`}>
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
        {responsiveImage ? (
          <img
            src={src}
            srcSet={responsiveImage.srcSet}
            sizes="(min-width: 768px) 768px, 100vw"
            alt={imageAlt}
            width={1200}
            height={675}
            title={title || undefined}
            className="block h-auto w-full object-contain"
            decoding="async"
            loading="lazy"
          />
        ) : (
          <img
            src={optimizeCloudinaryUrl(src)}
            alt={imageAlt}
            width={1200}
            height={675}
            title={title || undefined}
            sizes="(min-width: 768px) 768px, 100vw"
            className="block h-auto w-full object-contain"
            loading="lazy"
          />
        )}
      </div>
      {showDisclosure && (
        <figcaption className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {evidencePlaceholder
            ? 'The original example is withheld because it requires additional safety or rights review.'
            : disclosure === 'ai_edited'
              ? AI_EDITED_DISCLOSURE
              : AI_GENERATED_DISCLOSURE}
        </figcaption>
      )}
    </figure>
  );
}

export default function ArticleBody({ html, className = '', promptGallery = false }) {
  const parts = useMemo(() => splitArticleHtml(html), [html]);
  const renderedParts = useMemo(
    () => (promptGallery ? preparePromptGalleryParts(parts) : prepareArticleParts(parts)),
    [parts, promptGallery],
  );
  const galleryDisclosures = useMemo(
    () => promptGallery
      ? [...new Set(parts.filter((part) => part.type === 'image').map(getImageDisclosure))]
      : [],
    [parts, promptGallery],
  );

  if (!html) return null;

  const hasImages = parts.some((part) => part.type === 'image');
  const hasArticleAd = renderedParts.some((part) => part.type === 'article-ad');

  if (!hasImages && !hasArticleAd) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <div className={className}>
      {renderedParts.map((part) => {
        if (part.type === 'article-ad') {
          return <AdsterraNativeBanner key={part.key} />;
        }

        if (part.type === 'prompt-heading') {
          return (
            <div key={part.key} className="article-gallery-heading">
              <div dangerouslySetInnerHTML={{ __html: part.content }} />
            </div>
          );
        }

        if (part.type === 'html') {
          if (!part.content.trim()) return null;
          const classNames = [
            part.promptCard ? 'article-gallery-prompt-card' : '',
            part.galleryIntro ? 'article-gallery-intro' : '',
            part.postamble ? 'article-gallery-postamble' : '',
            part.articleSegment ? 'article-html-segment' : '',
          ].filter(Boolean).join(' ');
          return (
            <div key={part.key} className={classNames}>
              <div dangerouslySetInnerHTML={{ __html: part.content }} />
              {part.galleryIntro && galleryDisclosures.length > 0 && (
                <div className="article-gallery-disclosures" aria-label="Image disclosures">
                  {galleryDisclosures.map((disclosure) => (
                    <p key={disclosure}>{disclosure}</p>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <ArticleInlineImage
            key={part.key}
            src={getAttr(part.attrs, 'src')}
            alt={getAttr(part.attrs, 'alt')}
            title={getAttr(part.attrs, 'title')}
            disclosure={promptGallery ? '' : getAttr(part.attrs, 'data-media-disclosure')}
            showDisclosure={!promptGallery}
            className={part.galleryImage ? 'article-gallery-image' : ''}
          />
        );
      })}
    </div>
  );
}
