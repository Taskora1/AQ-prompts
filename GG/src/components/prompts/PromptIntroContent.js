import { createElement, Fragment } from 'react';
import parse, { domToReact } from 'html-react-parser';

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

function safeLink(value) {
  const href = String(value || '').trim();
  return /^(?:https?:\/\/|mailto:|\/(?!\/)|#|\.{1,2}\/)/i.test(href)
    ? href
    : undefined;
}

function safeImage(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    if (
      url.hostname.endsWith('.public.blob.vercel-storage.com')
      || url.hostname === 'res.cloudinary.com'
    ) {
      return url.href;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function renderIntroHtml(html) {
  const options = {
    replace(node) {
      if (node.type === 'script' || node.type === 'style') {
        return createElement(Fragment, null);
      }
      if (node.type !== 'tag') return undefined;
      const { name, attribs = {}, children = [] } = node;
      const content = domToReact(children, options);

      if (!ALLOWED_TAGS.has(name)) {
        return createElement(Fragment, null, content);
      }

      if (name === 'img') {
        const src = safeImage(attribs.src);
        return src
          ? createElement('img', {
              src,
              alt: attribs.alt || '',
              loading: 'lazy',
              className: 'my-4 h-auto max-w-full rounded-xl',
            })
          : createElement(Fragment, null);
      }

      if (name === 'a') {
        return createElement('a', {
          href: safeLink(attribs.href),
          title: attribs.title || undefined,
          className: 'text-orange-600 underline dark:text-orange-400',
        }, content);
      }

      const textAlign = name.match(/^(?:p|h[1-6])$/)
        ? attribs.style?.match(/(?:^|;)\s*text-align:\s*(left|center|right|justify)\s*(?:;|$)/i)?.[1]
        : undefined;
      return createElement(name, {
        style: textAlign ? { textAlign: textAlign.toLowerCase() } : undefined,
      }, content);
    },
  };
  return parse(html, options);
}

function renderPlainTextParagraph(paragraph, key) {
  const children = [];
  const markdownLink = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
  let lastIndex = 0;
  let match;
  let linkIndex = 0;

  while ((match = markdownLink.exec(paragraph)) !== null) {
    if (match.index > lastIndex) {
      children.push(paragraph.slice(lastIndex, match.index));
    }

    const href = safeLink(match[2]);
    if (href) {
      children.push(createElement(
        'a',
        {
          key: `${key}-link-${linkIndex}`,
          href,
          title: match[3] || undefined,
          target: /^https?:\/\//i.test(href) ? '_blank' : undefined,
          rel: /^https?:\/\//i.test(href) ? 'noopener noreferrer' : undefined,
          className: 'text-orange-600 underline dark:text-orange-400',
        },
        match[1],
      ));
      linkIndex += 1;
    } else {
      children.push(match[0]);
    }
    lastIndex = markdownLink.lastIndex;
  }

  if (lastIndex < paragraph.length) {
    children.push(paragraph.slice(lastIndex));
  }

  return createElement('p', {
    key,
    className: 'whitespace-pre-line',
  }, children);
}

export default function PromptIntroContent({ intro }) {
  const source = String(intro || '').trim();
  if (!source) return null;

  const content = /<[a-z][\s\S]*>/i.test(source)
    ? renderIntroHtml(source)
    : source
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => renderPlainTextParagraph(
          paragraph,
          `${index}-${paragraph}`,
        ));

  return createElement(
    'div',
    {
      className: [
        'space-y-4 text-base leading-8 text-[#4b5563] dark:text-[#d1d5db]',
        '[&_h1]:my-6 [&_h1]:text-3xl [&_h1]:font-bold',
        '[&_h2]:my-5 [&_h2]:text-2xl [&_h2]:font-bold',
        '[&_h3]:my-4 [&_h3]:text-xl [&_h3]:font-bold',
        '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6',
        '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
        '[&_blockquote]:border-l-4 [&_blockquote]:border-orange-300 [&_blockquote]:pl-4 [&_blockquote]:italic',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-4 dark:[&_pre]:bg-white/10',
        '[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:p-2 [&_td]:p-2',
      ].join(' '),
    },
    content,
  );
}
