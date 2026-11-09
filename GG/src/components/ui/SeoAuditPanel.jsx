'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  Hash,
  ImageIcon,
  Link as LinkIcon,
  Search,
  XCircle,
} from 'lucide-react';

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_DESC_MIN = 120;
const META_DESC_MAX = 160;
const MIN_WORDS = 300;

function AuditItem({ status, label, detail, suggestion }) {
  const icons = {
    pass: <CheckCircle size={14} className="text-green-600" />,
    warn: <AlertTriangle size={14} className="text-amber-500" />,
    fail: <XCircle size={14} className="text-red-600" />,
  };

  const bg = {
    pass: 'border-green-200 bg-green-50',
    warn: 'border-amber-200 bg-amber-50',
    fail: 'border-red-200 bg-red-50',
  };

  return (
    <div className={`flex items-start gap-2.5 rounded border px-3 py-2.5 ${bg[status]}`}>
      <div className="mt-0.5 shrink-0">{icons[status]}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1d2327]">{label}</p>
        {detail && (
          <p className="mt-0.5 text-xs text-[#50575e]">{detail}</p>
        )}
        {suggestion && (
          <p className="mt-0.5 text-xs italic text-[#646970]">💡 {suggestion}</p>
        )}
      </div>
    </div>
  );
}

function ScoreGauge({ score }) {
  const color =
    score >= 80 ? 'text-green-600' : score >= 50 ? 'text-amber-500' : 'text-red-600';
  const bg =
    score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${score} 100`}
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${color}`}>{score}</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#1d2327]">
          {score >= 80 ? 'Great' : score >= 50 ? 'Needs work' : 'Critical issues'}
        </p>
        <p className="text-xs text-[#646970]">SEO score</p>
      </div>
    </div>
  );
}

export default function SeoAuditPanel({ prompt = {}, allPrompts = [] }) {
  const [expanded, setExpanded] = useState(true);

  const audit = useMemo(() => {
    const items = [];
    let score = 100;

    // Title checks
    const titleLen = (prompt.title || '').length;
    if (!prompt.title) {
      items.push({ status: 'fail', label: 'Missing title', detail: 'Every prompt needs a title.', suggestion: 'Add a descriptive title between 30-60 characters.' });
      score -= 20;
    } else if (titleLen < TITLE_MIN) {
      items.push({ status: 'warn', label: `Title too short (${titleLen} chars)`, detail: `Recommended: ${TITLE_MIN}–${TITLE_MAX} characters.`, suggestion: 'Include relevant keywords like "AI prompt", "portrait", or the category name.' });
      score -= 5;
    } else if (titleLen > TITLE_MAX) {
      items.push({ status: 'warn', label: `Title too long (${titleLen} chars)`, detail: `Recommended: ${TITLE_MIN}–${TITLE_MAX} characters. Google may truncate it.`, suggestion: 'Shorten to under 60 characters for best display in search results.' });
      score -= 5;
    } else {
      items.push({ status: 'pass', label: `Title length OK (${titleLen} chars)`, detail: `Within the ${TITLE_MIN}–${TITLE_MAX} character range.` });
    }

    // Meta description checks
    const metaDesc = prompt.metaDescription || prompt.seoDescription || '';
    const metaDescLen = metaDesc.length;
    if (!metaDesc) {
      items.push({ status: 'warn', label: 'No meta description', detail: 'Search engines will auto-generate one from your content.', suggestion: 'Write a 150-160 character description with your main keywords.' });
      score -= 10;
    } else if (metaDescLen < META_DESC_MIN) {
      items.push({ status: 'warn', label: `Meta description too short (${metaDescLen} chars)`, detail: `Recommended: ${META_DESC_MIN}–${META_DESC_MAX} characters.`, suggestion: 'Expand your description to use more of the available snippet space.' });
      score -= 5;
    } else if (metaDescLen > META_DESC_MAX) {
      items.push({ status: 'warn', label: `Meta description too long (${metaDescLen} chars)`, detail: `Recommended: ${META_DESC_MIN}–${META_DESC_MAX} characters.`, suggestion: 'Trim to 158 characters max — search engines truncate beyond that.' });
      score -= 5;
    } else {
      items.push({ status: 'pass', label: `Meta description OK (${metaDescLen} chars)`, detail: `Within the ${META_DESC_MIN}–${META_DESC_MAX} character range.` });
    }

    // Meta title check
    const metaTitleLen = (prompt.metaTitle || '').length;
    if (metaTitleLen > 0 && metaTitleLen < 30) {
      items.push({ status: 'warn', label: `SEO title too short (${metaTitleLen} chars)`, detail: 'Custom SEO titles should be 30-60 characters.' });
      score -= 3;
    } else if (metaTitleLen > 60) {
      items.push({ status: 'warn', label: `SEO title too long (${metaTitleLen} chars)`, detail: 'Custom SEO titles should be 30-60 characters.' });
      score -= 3;
    } else if (metaTitleLen > 0) {
      items.push({ status: 'pass', label: `SEO title OK (${metaTitleLen} chars)` });
    }

    // Content/word count
    const content = (prompt.prompt || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_WORDS) {
      items.push({ status: 'warn', label: `Prompt text is short (${wordCount} words)`, detail: `Recommended minimum: ${MIN_WORDS} words for good indexing.`, suggestion: 'Longer, more detailed prompts tend to rank better and provide more value.' });
      score -= 5;
    } else {
      items.push({ status: 'pass', label: `Good word count (${wordCount} words)` });
    }

    // Image checks
    const images = Array.isArray(prompt.images) ? prompt.images : [];
    const imageCount = images.length;
    if (imageCount === 0 && !prompt.image) {
      items.push({ status: 'fail', label: 'No images', detail: 'Prompts without images get significantly less engagement.' });
      score -= 15;
    } else {
      if (imageCount > 0) {
        items.push({ status: 'pass', label: `${imageCount} image${imageCount > 1 ? 's' : ''} attached` });
      }

      // Check alt text on images
      const imagesWithAlt = images.filter((img) => img && typeof img === 'object' && img.alt);
      if (imageCount > 0 && imagesWithAlt.length === 0) {
        items.push({ status: 'warn', label: 'Images missing alt text', detail: `${imageCount} image${imageCount > 1 ? 's have' : ' has'} no alt text.`, suggestion: 'Add descriptive alt text for accessibility and image SEO.' });
        score -= 5;
      } else if (imagesWithAlt.length > 0) {
        items.push({ status: 'pass', label: `${imagesWithAlt.length} image(s) have alt text` });
      }
    }

    // Category check
    if (!prompt.category && !prompt.primaryCategoryId) {
      items.push({ status: 'warn', label: 'No category assigned', detail: 'Categories help search engines understand content structure.' });
      score -= 5;
    } else {
      items.push({ status: 'pass', label: `Category: ${prompt.category || 'Assigned'}` });
    }

    // Tags check
    const tags = Array.isArray(prompt.tags) ? prompt.tags : [];
    if (tags.length === 0) {
      items.push({ status: 'warn', label: 'No tags', detail: 'Tags help internal search and content discovery.' });
      score -= 3;
    } else {
      items.push({ status: 'pass', label: `${tags.length} tag${tags.length > 1 ? 's' : ''} assigned` });
    }

    // Slug check
    if (!prompt.slug) {
      items.push({ status: 'fail', label: 'Missing slug', detail: 'Every prompt needs a URL-friendly slug.' });
      score -= 10;
    } else if (prompt.slug.length > 80) {
      items.push({ status: 'warn', label: `Slug is long (${prompt.slug.length} chars)`, detail: 'Keep slugs under 60 characters for cleaner URLs.' });
      score -= 3;
    } else {
      items.push({ status: 'pass', label: `Slug: /${prompt.slug}` });
    }

    // Editorial content checks
    const intro = (prompt.intro || '').replace(/\s+/g, ' ').trim();
    const introWordCount = intro ? intro.split(/\s+/).filter(Boolean).length : 0;
    if (introWordCount === 0) {
      items.push({ status: 'warn', label: 'No intro text', detail: 'Intros provide context for both users and search engines.' });
      score -= 3;
    } else if (introWordCount < 150) {
      items.push({
        status: 'warn',
        label: `Intro is short (${introWordCount} words)`,
        detail: 'The requested editorial target is 150–300 words.',
        suggestion: 'Add prompt-specific context, practical tips, useful variations, and a grounded tool recommendation.',
      });
      score -= 5;
    } else if (introWordCount > 300) {
      items.push({
        status: 'warn',
        label: `Intro is long (${introWordCount} words)`,
        detail: 'The requested editorial target is 150–300 words.',
        suggestion: 'Edit the intro down while keeping the useful prompt-specific details.',
      });
      score -= 3;
    } else {
      items.push({ status: 'pass', label: `Intro length OK (${introWordCount} words)` });
    }

    const howToUse = Array.isArray(prompt.howToUse) ? prompt.howToUse : [];
    if (howToUse.length < 3 || howToUse.length > 4) {
      items.push({
        status: 'warn',
        label: `How-to steps: ${howToUse.length}`,
        detail: 'The requested range is 3–4 clear steps.',
      });
      score -= 2;
    } else {
      items.push({ status: 'pass', label: `${howToUse.length} how-to steps` });
    }

    // FAQ check
    const faqs = Array.isArray(prompt.faqs) ? prompt.faqs : [];
    if (faqs.length < 2 || faqs.length > 4) {
      items.push({
        status: 'warn',
        label: `FAQs: ${faqs.length}`,
        detail: 'The requested range is 2–4 relevant questions with answers.',
      });
      score -= 2;
    } else {
      items.push({ status: 'pass', label: `${faqs.length} FAQs present` });
    }

    // Related prompts
    const related = Array.isArray(prompt.relatedPromptIds) ? prompt.relatedPromptIds : [];
    if (related.length < 6 || related.length > 8) {
      items.push({
        status: 'warn',
        label: `${related.length} manually selected related prompts`,
        detail: 'The target is 6–8 eligible prompts from the same category; fewer may be available.',
      });
      score -= 3;
    } else {
      items.push({ status: 'pass', label: `${related.length} related prompts selected` });
    }

    // OG Image check
    if (!prompt.ogImage) {
      items.push({ status: 'warn', label: 'No custom OG image', detail: 'Social shares will fall back to the primary image.' });
      score -= 2;
    } else {
      items.push({ status: 'pass', label: 'Custom OG image set' });
    }

    return { items: items.sort((a, b) => {
      const order = { fail: 0, warn: 1, pass: 2 };
      return order[a.status] - order[b.status];
    }), score: Math.max(0, Math.min(100, score)) };
  }, [prompt]);

  const passCount = audit.items.filter((i) => i.status === 'pass').length;
  const warnCount = audit.items.filter((i) => i.status === 'warn').length;
  const failCount = audit.items.filter((i) => i.status === 'fail').length;

  return (
    <div className="rounded border border-[#dcdcde] bg-[#f6f7f7]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Search size={18} className="text-[#2271b1]" />
          <h2 className="text-base font-semibold text-[#1d2327]">SEO Audit</h2>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            audit.score >= 80 ? 'bg-green-100 text-green-800' :
            audit.score >= 50 ? 'bg-amber-100 text-amber-800' :
            'bg-red-100 text-red-800'
          }`}>
            {audit.score}/100
          </span>
        </div>
        <span className="text-xs text-[#646970]">
          {expanded ? '▲ Collapse' : '▼ Expand'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[#dcdcde] px-4 pb-4">
          <div className="flex flex-wrap items-center gap-6 py-4">
            <ScoreGauge score={audit.score} />
            <div className="flex gap-4 text-sm">
              <span className="text-green-700">{passCount} passed</span>
              <span className="text-amber-700">{warnCount} warnings</span>
              {failCount > 0 && <span className="text-red-700">{failCount} failed</span>}
            </div>
          </div>

          <div className="space-y-2">
            {audit.items.map((item, index) => (
              <AuditItem key={index} {...item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}