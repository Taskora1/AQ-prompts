import assert from 'node:assert/strict';
import test from 'node:test';

import { formatSitemapLastModified } from '../src/lib/sitemap-date.js';

test('sitemap lastmod keeps the date from PostgreSQL timestamps', () => {
  assert.equal(
    formatSitemapLastModified('2026-10-20 17:15:44.967863+00'),
    '2026-10-20',
  );
  assert.equal(formatSitemapLastModified('2026-10-20'), '2026-10-20');
});

test('sitemap lastmod omits missing and invalid dates instead of fabricating one', () => {
  assert.equal(formatSitemapLastModified(''), undefined);
  assert.equal(formatSitemapLastModified('2026-02-30'), undefined);
  assert.equal(formatSitemapLastModified('not-a-date'), undefined);
});
