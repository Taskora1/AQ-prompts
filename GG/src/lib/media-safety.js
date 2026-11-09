import { hasOwnerApprovedMediaRisk } from './owner-approved-media.js';

export const VERIFIED_MEDIA_PLACEHOLDER = '/images/verified/media-evidence-placeholder.svg';

export const VERIFIED_MEDIA_PLACEHOLDER_ALT =
  'Abstract AQPrompts placeholder used where an example image cannot be published safely';

export const AI_GENERATED_DISCLOSURE =
  'AI-generated example image for demonstration purposes.';
export const AI_EDITED_DISCLOSURE =
  'AI-edited example image for demonstration purposes.';

const PUBLIC_FIGURE_OR_CHARACTER_RE =
  /\b(imran[-_\s]?khan|pti|celebrity|disney|pixar|marvel|dc[-_\s]?comics|barbie|harry[-_\s]?potter)\b/i;
const CLEAR_TRADEMARK_MISUSE_RE =
  /\b(nike|bmw|lamborghini|vogue|forbes|gq|netflix|tedx)[-_\s]?(?:logo|campaign|cover|poster|advert|ad|branding)\b/i;
const EXPLICIT_MINOR_RE =
  /\b(?:child|minor|teen(?:ager)?|\d{1,2}[-_\s]?(?:year|yr)[-_\s]?old)\b/i;
const AMBIGUOUS_MINOR_PATH_RE = /(?:^|[-_/])(boy|girl)(?:[-_./]|$)/i;
const ADULT_CONTEXT_RE = /\b(?:adult|woman|women|man|men|businessman|bride|groom)\b/i;
const WATERMARK_RE = /\bwatermark(?:ed)?\b/i;
const REFERENCE_IMAGE_RE =
  /\b(?:reference|source)[-_\s]?(?:image|photo|photograph)|\b(?:uploaded|attached|provided)[-_\s]?(?:image|photo|photograph)|\b(?:same|consistent)[-_\s]?(?:face|person|identity)|\bidentity[-_\s]?(?:guidance|reference|preservation)|\bphoto of (?:me|the user|the subject)\b/i;

export function hasVerifiedPublicMediaEvidence(value = '') {
  return String(value || '').trim() === VERIFIED_MEDIA_PLACEHOLDER;
}

export function isHighRiskPublicMedia(value = '', context = '') {
  const source = String(value || '').trim();
  const combined = `${source} ${String(context || '')}`;
  if (!source || source === VERIFIED_MEDIA_PLACEHOLDER) return false;
  if (hasOwnerApprovedMediaRisk(source)) return false;
  if (PUBLIC_FIGURE_OR_CHARACTER_RE.test(combined)) return true;
  if (CLEAR_TRADEMARK_MISUSE_RE.test(combined)) return true;
  if (EXPLICIT_MINOR_RE.test(combined)) return true;
  if (WATERMARK_RE.test(source)) return true;
  return AMBIGUOUS_MINOR_PATH_RE.test(source) && !ADULT_CONTEXT_RE.test(combined);
}

export function classifyPublicMedia(value = '', context = '') {
  const source = String(value || '').trim();
  const combined = `${source} ${String(context || '')}`;

  if (source === VERIFIED_MEDIA_PLACEHOLDER) return 'decorative_graphic';
  if (/\/images\/founder-aqprompts\.(?:webp|png|jpe?g)$/i.test(source)) return 'real_photograph';
  if (/(?:^|\/)(?:logo|favicon|icon)[^/]*\.(?:svg|png|webp|jpe?g)$/i.test(source)) return 'logo';
  if (/\b(?:screenshot|screen-capture)\b/i.test(source)) return 'screenshot';
  if (/\.(?:svg)$/i.test(source) || /\b(?:graphic|pattern|background|shape|divider)\b/i.test(source)) {
    return 'decorative_graphic';
  }
  if (
    source.startsWith('/uploads/')
    || source.startsWith('/images/prompts/')
    || source.startsWith('/images/prompt-thumbs/')
    || /\b(?:portrait|article|prompt|homepage|demonstration|example)\b/i.test(combined)
  ) {
    return REFERENCE_IMAGE_RE.test(combined) ? 'ai_edited' : 'ai_generated';
  }
  if (/\bog-cover\.(?:webp|png|jpe?g)$/i.test(source)) return 'ai_generated';
  return 'unknown';
}

export function getPublicMediaDisclosure(value = '', context = '') {
  const type = classifyPublicMedia(value, context);
  if (type === 'ai_edited') return AI_EDITED_DISCLOSURE;
  if (type === 'ai_generated') return AI_GENERATED_DISCLOSURE;
  return '';
}

export function getSafePublicMediaSource(value = '', context = '') {
  const source = String(value || '').trim();
  if (!source || isHighRiskPublicMedia(source, context)) return VERIFIED_MEDIA_PLACEHOLDER;
  return source;
}

export function getSafePublicMediaList(values = [], context = '') {
  const sources = Array.isArray(values) ? values : [values];
  const safeSources = [...new Set(
    sources.filter(Boolean).map((source) => getSafePublicMediaSource(source, context)),
  )];
  return safeSources.length > 0 ? safeSources : [VERIFIED_MEDIA_PLACEHOLDER];
}

function setHtmlAttribute(attributes, name, value) {
  const expression = new RegExp(`\\b${name}=["'][^"']*["']`, 'i');
  if (expression.test(attributes)) return attributes.replace(expression, `${name}="${value}"`);
  if (/\/\s*$/.test(attributes)) {
    return attributes.replace(/\/\s*$/, ` ${name}="${value}" /`);
  }
  return `${attributes} ${name}="${value}"`;
}

export function replaceUnverifiedHtmlImages(html = '', context = '') {
  return String(html || '').replace(/<img\b([^>]*)>/gi, (tag, attributes, offset, fullHtml) => {
    const sourceMatch = String(attributes).match(/\bsrc=["']([^"']*)["']/i);
    const originalSource = sourceMatch?.[1] || '';
    // Inline article safety is assessed from the individual asset path. Article-wide
    // cautions about minors or brands must not quarantine every unrelated example.
    const safeSource = getSafePublicMediaSource(originalSource, originalSource);
    const nextImageOffset = fullHtml.indexOf('<img', offset + tag.length);
    const localEnd = nextImageOffset >= 0
      ? Math.min(nextImageOffset, offset + 3_000)
      : Math.min(fullHtml.length, offset + 3_000);
    const localContext = `${originalSource} ${fullHtml.slice(offset, localEnd)}`;
    const type = classifyPublicMedia(originalSource, localContext);
    let nextAttributes = String(attributes);

    nextAttributes = sourceMatch
      ? nextAttributes.replace(sourceMatch[0], `src="${safeSource}"`)
      : ` src="${safeSource}"${nextAttributes}`;

    if (safeSource === VERIFIED_MEDIA_PLACEHOLDER) {
      nextAttributes = setHtmlAttribute(nextAttributes, 'alt', VERIFIED_MEDIA_PLACEHOLDER_ALT);
      nextAttributes = setHtmlAttribute(nextAttributes, 'data-media-disclosure', 'withheld');
    } else if (type === 'ai_generated' || type === 'ai_edited') {
      nextAttributes = setHtmlAttribute(nextAttributes, 'data-media-disclosure', type);
    }

    return `<img${nextAttributes}>`;
  });
}
