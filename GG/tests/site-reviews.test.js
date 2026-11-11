import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import { applySiteReviewsMigration } from '../scripts/add-site-reviews.mjs';
import { applySiteReviewProfilesMigration } from '../scripts/add-site-review-profiles.mjs';
import { DATABASE_MIGRATION_OPERATIONS } from '../scripts/lib/database-migration-safety.mjs';
import {
  getApprovedSiteReviewData,
  getAdminSiteReviewData,
  hashReviewIp,
  normalizeReviewSocialUrl,
  deleteSiteReview,
  submitSiteReview,
} from '../src/lib/site-reviews-db.js';
import { countReviewWords, MIN_REVIEW_WORDS } from '../src/lib/review-validation.js';
import { FREE_COPIES_BEFORE_FEEDBACK, hasReachedFeedbackCopyLimit } from '../src/lib/copy-gate-policy.js';
import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';

let originalDatabaseUrl;
let originalAuthSecret;
let originalPool;

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalAuthSecret = process.env.AUTH_SECRET;
  originalPool = globalThis.__dbPgPool;
  process.env.DATABASE_URL = 'postgres://localhost/site_review_test';
  process.env.AUTH_SECRET = 'a-test-secret-value';
});

after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
});

test('site review migration is guarded and creates the moderated schema transactionally', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      const query = String(sql);
      calls.push(query);
      if (query.includes('SHOW transaction_read_only')) {
        return { rows: [{ transaction_read_only: 'off' }] };
      }
      if (query.includes('to_regclass')) {
        return { rows: [{ table_exists: true, required_columns_present: true, pending: 0 }] };
      }
      return { rows: [] };
    },
  };

  assert.ok(DATABASE_MIGRATION_OPERATIONS['add-site-reviews.mjs']);
  assert.deepEqual(await applySiteReviewsMigration(client), {
    table_exists: true,
    required_columns_present: true,
    pending: 0,
  });
  assert.equal(calls[0], 'BEGIN');
  assert.match(calls[2], /CREATE TABLE IF NOT EXISTS public\.site_reviews/);
  assert.match(calls[2], /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(calls[2], /email TEXT NOT NULL DEFAULT ''/);
  assert.ok(calls.some((query) => /ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''/.test(query)));
  assert.match(calls[2], /prompt_id BIGINT REFERENCES public\.prompts\(id\)/);
  assert.ok(calls.some((query) => /site_reviews_ip_created_idx/.test(query)));
  assert.equal(calls.at(-1), 'COMMIT');
});

test('site review migration rolls back when post-creation verification fails', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      const query = String(sql);
      calls.push(query);
      if (query.includes('SHOW transaction_read_only')) {
        return { rows: [{ transaction_read_only: 'off' }] };
      }
      if (query.includes('to_regclass')) {
        return { rows: [{ table_exists: false, required_columns_present: false, pending: 0 }] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(applySiteReviewsMigration(client), /verification failed/);
  assert.equal(calls.at(-1), 'ROLLBACK');
});

test('site review profile migration adds photo and social link fields transactionally', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      const query = String(sql);
      calls.push(query);
      if (query.includes('SHOW transaction_read_only')) {
        return { rows: [{ transaction_read_only: 'off' }] };
      }
      if (query.includes('information_schema.columns')) {
        return { rows: [{ profile_columns_present: true }] };
      }
      return { rows: [] };
    },
  };

  assert.ok(DATABASE_MIGRATION_OPERATIONS['add-site-review-profiles.mjs']);
  assert.deepEqual(await applySiteReviewProfilesMigration(client), { profile_columns_present: true });
  assert.match(calls[2], /ADD COLUMN IF NOT EXISTS profile_image_url TEXT NOT NULL DEFAULT ''/);
  assert.match(calls[2], /ADD COLUMN IF NOT EXISTS social_url TEXT NOT NULL DEFAULT ''/);
  assert.equal(calls.at(-1), 'COMMIT');
});

test('site review profile migration rolls back if either new column is missing', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      const query = String(sql);
      calls.push(query);
      if (query.includes('SHOW transaction_read_only')) {
        return { rows: [{ transaction_read_only: 'off' }] };
      }
      if (query.includes('information_schema.columns')) {
        return { rows: [{ profile_columns_present: false }] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(applySiteReviewProfilesMigration(client), /verification failed/);
  assert.equal(calls.at(-1), 'ROLLBACK');
});

test('review IP fingerprints are keyed and submission writes pending reviews under an hourly lock', async () => {
  const queryCalls = [];
  let attemptCount = 0;
  const handleQuery = async (sql, values = []) => {
    const query = String(sql);
    queryCalls.push({ query, values });
    if (query.includes('INSERT INTO public.site_reviews')) {
      // The insert is conditional: the rate-limit check inside it rejects
      // the write once the hourly limit is reached, so no row is returned.
      if (attemptCount >= 5) return { rows: [] };
      return {
        rows: [{
          id: '4',
          name: 'Sam',
          social_url: 'https://social.example/sam',
          rating: 5,
          review_text: 'Useful prompt library',
          status: 'pending',
          source: 'copy-gate',
          prompt_id: 17,
          created_at: '2026-10-23T10:00:00.000Z',
          user_agent: 'test-agent',
        }],
      };
    }
    return { rows: [] };
  };
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async end() {},
    async query(sql, values = []) {
      return handleQuery(sql, values);
    },
    async connect() {
      return {
        async query(sql, values = []) {
          return handleQuery(sql, values);
        },
        release() {},
      };
    },
  };

  const fingerprint = hashReviewIp('203.0.113.8');
  assert.equal(fingerprint, hashReviewIp('203.0.113.8'));
  assert.notEqual(fingerprint, hashReviewIp('203.0.113.9'));

  const result = await submitSiteReview({
    name: 'Sam',
    socialUrl: 'https://social.example/sam',
    rating: 5,
    text: 'Useful prompt library',
    source: 'copy-gate',
    promptId: 17,
    ipHash: fingerprint,
    userAgent: 'test-agent',
  });
  assert.deepEqual(result, {
    limited: false,
    review: {
      id: 4,
      name: 'Sam',
      profileImageUrl: '',
      socialUrl: 'https://social.example/sam',
      rating: 5,
      text: 'Useful prompt library',
      status: 'pending',
      source: 'copy-gate',
      promptId: 17,
      createdAt: '2026-10-23T10:00:00.000Z',
    },
  });
  // The duplicate and rate-limit checks live inside the single atomic
  // INSERT ... SELECT, not in a transaction with advisory locks.
  assert.ok(queryCalls.some(({ query }) => query.includes('INSERT INTO public.site_reviews') && query.includes('NOT EXISTS')));
  assert.ok(queryCalls.some(({ query }) => query.includes("INTERVAL '1 hours'")));
  assert.ok(queryCalls.some(({ query }) => query.includes("'pending'")));
  assert.ok(queryCalls.some(({ query, values }) => query.includes('social_url') && values.includes('https://social.example/sam')));

  attemptCount = 5;
  const limited = await submitSiteReview({
    rating: 4,
    text: 'Too many attempts',
    ipHash: fingerprint,
  });
  assert.deepEqual(limited, { limited: true, review: null });
  // The limited call still issues the conditional INSERT (it inserts zero
  // rows), so two INSERT statements were sent in total.
  assert.equal(queryCalls.filter(({ query }) => query.includes('INSERT INTO public.site_reviews')).length, 2);
});

test('social profile URLs are canonicalized and active profiles cannot submit a second review', async () => {
  assert.equal(
    normalizeReviewSocialUrl('https://www.social.example/sam/?source=share#profile'),
    'https://social.example/sam',
  );

  const queries = [];
  const handleQuery = async (sql, values = []) => {
    const query = String(sql);
    queries.push({ query, values });
    if (query.includes('INSERT INTO public.site_reviews')) {
      // The conditional insert rejects the write: a duplicate profile
      // already has a pending or approved review, so no row is returned.
      return { rows: [] };
    }
    if (query.includes('FROM public.site_reviews') && query.includes("status IN ('pending', 'approved')")) {
      return { rows: [{ '?column?': 1 }] };
    }
    return { rows: [] };
  };
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async end() {},
    async query(sql, values = []) {
      return handleQuery(sql, values);
    },
    async connect() {
      return {
        async query(sql, values = []) {
          return handleQuery(sql, values);
        },
        release() {},
      };
    },
  };

  const result = await submitSiteReview({
    name: 'Sam',
    socialUrl: normalizeReviewSocialUrl('https://social.example/sam'),
    rating: 5,
    text: 'Already left my review',
    ipHash: hashReviewIp('203.0.113.8'),
  });

  assert.deepEqual(result, { duplicate: true, limited: false, review: null });
  // The duplicate check lives inside the single atomic INSERT ... SELECT,
  // which is issued once and inserts zero rows.
  assert.ok(queries.some(({ query }) => query.includes('INSERT INTO public.site_reviews') && query.includes('NOT EXISTS')));
  assert.equal(queries.filter(({ query }) => query.includes('INSERT INTO public.site_reviews')).length, 1);
});

test('review feedback requires at least four whitespace-separated words', () => {
  assert.equal(MIN_REVIEW_WORDS, 4);
  assert.equal(countReviewWords('  Four words are enough.  '), 4);
  assert.equal(countReviewWords('one two three'), 3);
  assert.equal(countReviewWords(' \n\t '), 0);
});

test('copy gate allows three copies before requiring feedback', () => {
  assert.equal(FREE_COPIES_BEFORE_FEEDBACK, 3);
  assert.equal(hasReachedFeedbackCopyLimit(0), false);
  assert.equal(hasReachedFeedbackCopyLimit(1), false);
  assert.equal(hasReachedFeedbackCopyLimit(2), false);
  assert.equal(hasReachedFeedbackCopyLimit(3), true);
  assert.equal(hasReachedFeedbackCopyLimit(4), true);
});

test('public review data includes approved website and copy-gate feedback with a bounded page', async () => {
  const queries = [];
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async end() {},
    async query(sql, values = []) {
      const query = String(sql);
      queries.push({ query, values });
      if (query.includes('COUNT(*)::int AS "approvedCount"')) {
        return { rows: [{ approvedCount: 21, averageRating: '4.76' }] };
      }
      return {
        rows: [{
          id: '8',
          name: '',
          rating: 5,
          review_text: 'Great prompts to use',
          status: 'approved',
          source: 'copy-gate',
          prompt_id: null,
          created_at: '2026-10-23T10:00:00.000Z',
          user_agent: '',
        }],
      };
    },
  };

  const result = await getApprovedSiteReviewData({ page: '2' });
  assert.equal(result.approvedCount, 21);
  assert.equal(result.averageRating, 4.76);
  assert.equal(result.totalPages, 2);
  assert.equal(result.page, 2);
  assert.equal(result.reviews[0].text, 'Great prompts to use');
  assert.match(queries[0].query, /WHERE status = 'approved'\s+AND source IN \('website', 'copy-gate'\)/);
  assert.match(queries[1].query, /WHERE status = 'approved'\s+AND source IN \('website', 'copy-gate'\)/);
  assert.doesNotMatch(queries[1].query, /SELECT[^]*\bemail\b/i);
  assert.deepEqual(queries[1].values, [20, 20]);
});

test('admin review data includes editable reviewer profiles and excludes email', async () => {
  const queries = [];
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async end() {},
    async query(sql) {
      const query = String(sql);
      queries.push(query);
      if (query.includes('COUNT(*) FILTER')) {
        return { rows: [{ pending: 1, approved: 0, rejected: 0, averageRating: '0.00' }] };
      }
      return {
        rows: [{
          id: '9',
          name: 'A reviewer',
          rating: 5,
          review_text: 'Very helpful feedback',
          status: 'pending',
          source: 'website',
          prompt_id: null,
          profile_image_url: 'https://images.example/reviewer.webp',
          social_url: 'https://social.example/reviewer',
          created_at: '2026-10-23T10:00:00.000Z',
          user_agent: 'test-agent',
        }],
      };
    },
  };

  const result = await getAdminSiteReviewData();
  assert.equal(result.reviews[0].profileImageUrl, 'https://images.example/reviewer.webp');
  assert.equal(result.reviews[0].socialUrl, 'https://social.example/reviewer');
  assert.equal(result.reviews[0].userAgent, 'test-agent');
  assert.match(queries[1], /status IN \('pending', 'approved', 'rejected'\)/);
  assert.doesNotMatch(queries[1], /email/i);
});

test('admin can permanently delete a review and receives null when it is missing', async () => {
  const queries = [];
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async end() {},
    async query(sql, values = []) {
      queries.push({ query: String(sql), values });
      return { rows: [{ id: '9', status: 'pending' }] };
    },
  };

  assert.deepEqual(await deleteSiteReview(9), { id: 9, status: 'pending' });
  assert.match(queries[0].query, /DELETE FROM public\.site_reviews/);
  assert.deepEqual(queries[0].values, [9]);

  globalThis.__dbPgPool.query = async () => ({ rows: [] });
  assert.equal(await deleteSiteReview(99), null);
});

test('admin review cards expose a profile editor with photo, social link, and save action', async () => {
  const editor = await readFile(
    new URL('../src/components/admin/ReviewProfileEditor.jsx', import.meta.url),
    'utf8',
  );
  assert.match(editor, /Edit profile details/);
  assert.match(editor, /aria-expanded=\{isEditing\}/);
  assert.match(editor, /Display name/);
  assert.match(editor, /Social profile URL/);
  assert.match(editor, /Profile photo/);
  assert.match(editor, /Save reviewer profile/);
  assert.match(editor, /onSaved\(result\.review\)/);
});

test('feedback route and copy gate enforce pending feedback and both persistent completion markers', async () => {
  const [route, adminRoute, reviewsManager, gate, form, stars, detail, textButton, homeCopy, cardCopy, listingCopy, sitemap, navigation, footer] = await Promise.all([
    readFile(new URL('../app/api/reviews/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/api/reviews/[id]/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/ReviewsManager.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CopyGate.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/FeedbackSubmissionForm.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/StarRatingInput.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/prompts/PromptDetailExperience.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/prompts/TextPromptCopyButton.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/home/HomePromptCopyButton.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/PromptCardCopy.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/prompts/PromptCopyControls.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/sitemap.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Footer.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(route, /rejectPublicWriteWhenAdminOnly/);
  assert.match(route, /countReviewWords\(text\) < MIN_REVIEW_WORDS/);
  assert.match(route, /socialUrl/);
  assert.match(route, /result\.duplicate/);
  assert.match(route, /normalizeReviewSocialUrl\(socialUrl\)/);
  assert.match(route, /if \(!socialUrl\)/);
  assert.match(adminRoute, /export async function DELETE/);
  assert.match(adminRoute, /deleteSiteReview\(id\)/);
  assert.match(adminRoute, /getCurrentAdminUser\(\)/);
  assert.match(reviewsManager, /method: 'DELETE'/);
  assert.match(reviewsManager, /window\.confirm/);
  assert.match(reviewsManager, /data\.reviews\.map/);
  assert.match(adminRoute, /updateSiteReviewProfile/);
  assert.match(adminRoute, /protocol === 'https:'/);
  assert.match(gate, /socialUrl: formData\.get\('socialUrl'\)/);
  assert.match(form, /socialUrl: formData\.get\('socialUrl'\)/);
  assert.doesNotMatch(form, /name="email"/);
  assert.doesNotMatch(gate, /name="email"/);
  assert.match(form, /input name="name"[^>]*required/);
  assert.match(gate, /input name="name"[^>]*required/);
  assert.match(form, /Social profile link\s*<input name="socialUrl"[^>]*required/);
  assert.match(gate, /Social profile link\s*<input name="socialUrl"[^>]*required/);
  assert.match(form, /countReviewWords\(feedback\) < MIN_REVIEW_WORDS/);
  assert.match(gate, /countReviewWords\(feedback\) < MIN_REVIEW_WORDS/);
  assert.match(stars, /type="radio"/);
  assert.match(stars, /className="sr-only"/);
  assert.match(stars, /value <= displayedRating/);
  assert.match(route, /source,\s*promptId:/);
  assert.match(gate, /localStorage\.getItem\(FEEDBACK_GATE_LOCAL_KEY\).*document\.cookie/s);
  assert.match(gate, /Max-Age=\$\{FEEDBACK_GATE_COOKIE_MAX_AGE\}/);
  assert.match(gate, /feedbackGateCompletedRef\.current = true/);
  assert.match(gate, /!feedbackGateCompletedRef\.current && !hasCompletedFeedbackGate\(\)/);
  assert.match(gate, /await copyWithFallback\(pendingText\)/);
  assert.match(gate, /setIsCopyGateOpen\(false\)/);
  assert.match(gate, /MIN_REVIEW_WORDS\} words\)/);
  assert.match(gate, /source: 'copy-gate'/);
  assert.match(gate, /Share your feedback to unlock your next copy \(one time only\)/);
  assert.match(gate, /function getFreeCopyCount\(\)/);
  assert.match(gate, /FREE_COPY_LOCAL_KEY/);
  assert.match(gate, /markFreeCopyUsed\(freeCopyCount \+ 1\)/);
  assert.match(gate, /hasReachedFeedbackCopyLimit\(freeCopyCount\)/);
  assert.match(gate, /feedback may appear publicly after approval/);
  assert.match(detail, /promptId: reviewPromptId/);
  assert.match(textButton, /useCopyGate\(\{ promptId \}\)/);
  assert.match(homeCopy, /useCopyGate\(\{ promptId \}\)/);
  assert.match(cardCopy, /promptId=\{promptId\}/);
  assert.match(listingCopy, /useCopyGate\(\{ promptId \}\)/);
  assert.match(sitemap, /route: '\/feedback'/);
  assert.match(navigation, /label: 'Feedback', href: '\/feedback'/);
  assert.match(footer, /label: 'Feedback', href: '\/feedback'/);
});
