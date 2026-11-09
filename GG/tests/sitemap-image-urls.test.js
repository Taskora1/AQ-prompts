import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildImageSitemapXml } from '../src/lib/image-sitemap-xml.js';
import { VERIFIED_MEDIA_PLACEHOLDER } from '../src/lib/media-safety.js';
import { getSitemapImageUrls } from '../src/lib/sitemap-image-urls.js';

const ORIGIN = 'https://www.aqprompts.com';

test('normalizes and deduplicates absolute and local image URLs', () => {
  assert.deepEqual(
    getSitemapImageUrls([
      '/images/prompts/example.webp',
      'https://res.cloudinary.com/aqprompts/image/upload/example.webp',
      '/images/prompts/example.webp',
    ], ORIGIN),
    [
      'https://www.aqprompts.com/images/prompts/example.webp',
      'https://res.cloudinary.com/aqprompts/image/upload/example.webp',
    ],
  );
});

test('serializes a separate Google image sitemap and escapes XML values', () => {
  const xml = buildImageSitemapXml([
    {
      url: 'https://www.aqprompts.com/blog/a?x=1&y=2',
      images: [
        'https://res.cloudinary.com/aqprompts/image/upload/a&b.webp',
        'https://res.cloudinary.com/aqprompts/image/upload/a&b.webp',
      ],
    },
  ]);

  assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(xml, /<loc>https:\/\/www\.aqprompts\.com\/blog\/a\?x=1&amp;y=2<\/loc>/);
  assert.match(xml, /<image:loc>https:\/\/res\.cloudinary\.com\/aqprompts\/image\/upload\/a&amp;b\.webp<\/image:loc>/);
  assert.equal((xml.match(/<image:image>/g) || []).length, 1);
});

test('excludes withheld media and non-HTTP or credentialed URLs', () => {
  assert.deepEqual(
    getSitemapImageUrls([
      VERIFIED_MEDIA_PLACEHOLDER,
      'data:image/png;base64,abc',
      'javascript:alert(1)',
      'https://user:password@example.com/image.png',
      'http://[',
    ], ORIGIN),
    [],
  );
});
