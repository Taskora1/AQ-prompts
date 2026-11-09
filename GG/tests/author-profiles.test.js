import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAuthorProfilesMigration } from '../scripts/add-author-profiles.mjs';
import { validateAuthorProfileInput } from '../src/lib/author-profiles-db.js';
import { DATABASE_MIGRATION_OPERATIONS } from '../scripts/lib/database-migration-safety.mjs';

test('author profile validation normalizes slugs and preserves valid profile fields', () => {
  const result = validateAuthorProfileInput({
    name: '  Sam Author ',
    slug: 'Sam-Author',
    roleTitle: ' Editor ',
    bio: ' Writes helpful guides. ',
    avatarUrl: '/images/sam.webp',
    socialLinks: [{ name: 'Portfolio', href: 'https://example.com/sam' }],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.data, {
    name: 'Sam Author',
    slug: 'sam-author',
    roleTitle: 'Editor',
    bio: 'Writes helpful guides.',
    avatarUrl: '/images/sam.webp',
    socialLinks: [{ name: 'Portfolio', href: 'https://example.com/sam' }],
  });
});

test('author profile validation rejects unsafe URLs and malformed slugs', () => {
  const result = validateAuthorProfileInput({
    name: 'Unsafe Author',
    slug: '../unsafe',
    bio: 'Profile bio',
    avatarUrl: 'javascript:alert(1)',
    socialLinks: [{ name: 'Portfolio', href: 'http://example.com' }],
  });

  test('author profile validation rejects social links in an invalid shape', () => {
    const result = validateAuthorProfileInput({
      name: 'Author',
      slug: 'author',
      bio: 'Profile bio',
      socialLinks: 'https://example.com',
    });

    assert.equal(result.valid, false);
    assert.match(result.errors.socialLinks, /list/);
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.slug);
  assert.ok(result.errors.avatarUrl);
  assert.ok(result.errors.socialLinks);
});

test('author profile migration is registered with the guarded migration runner', () => {
  assert.ok(DATABASE_MIGRATION_OPERATIONS['add-author-profiles.mjs']);
});

test('author profile migration creates the schema and seeds the founder transactionally', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql: String(sql), values });
      if (String(sql).includes('SHOW transaction_read_only')) {
        return { rows: [{ transaction_read_only: 'off' }] };
      }
      if (String(sql).includes('COUNT(*) FILTER')) {
        return { rows: [{ total: 1, founder_profile: 1 }] };
      }
      return { rows: [] };
    },
  };

  const result = await applyAuthorProfilesMigration(client);

  assert.deepEqual(result, { total: 1, founder_profile: 1 });
  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[2].sql, /CREATE TABLE IF NOT EXISTS public\.author_profiles/);
  assert.match(calls[3].sql, /ON CONFLICT \(slug\) DO NOTHING/);
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.deepEqual(JSON.parse(calls[3].values[0]), [
    { name: 'Instagram', href: 'https://www.instagram.com/aqprompt_s/' },
    { name: 'TikTok', href: 'https://www.tiktok.com/@portraitprompts' },
    { name: 'Facebook', href: 'https://www.facebook.com/growthguide.prompts/' },
  ]);
});
