import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { getDatabaseUrl } from '../src/lib/db.js';
import {
  ensurePromptEngagementSchema,
  incrementPromptViewCount,
  incrementPromptLikeCount,
  submitPromptFeedback,
  getPromptFeedbackSummary,
  validatePromptFeedbackInput,
  normalizePromptEngagementId,
  PromptEngagementValidationError,
  MAX_FEEDBACK_COMMENT_LENGTH,
  PROMPT_FEEDBACK_RATE_LIMIT,
} from '../src/lib/prompt-engagement-db.js';
import { formatCompactCount, toPromptCardItem } from '../src/lib/prompt-card.js';
import { normalizePrompt, normalizePromptSlim } from '../src/lib/prompts-db.js';

// In-memory fake database behind the injected pool mock (same hook the
// MCP tests use: globalThis.__dbPgPool with a matching connection string).
let prompts;
let reviews;
let nextReviewId;
let alterStatements;

function seedTables() {
  prompts = new Map([
    [1, { id: 1, status: 'published', view_count: 0, like_count: 0 }],
    [2, { id: 2, status: 'published', view_count: 41, like_count: 7 }],
    [3, { id: 3, status: 'draft', view_count: 0, like_count: 0 }],
  ]);
  reviews = [];
  nextReviewId = 1;
  alterStatements = [];
}

function normalizeArgs(query, values = []) {
  if (query && typeof query === 'object') {
    return { text: query.text, values: Array.isArray(query.values) ? query.values : [] };
  }
  return { text: query, values: Array.isArray(values) ? values : [] };
}

const fakePool = {
  async query(query, values = []) {
    const { text, values: bound } = normalizeArgs(query, values);
    const sql = String(text || '').trim().replace(/\s+/g, ' ');

    if (sql.startsWith('ALTER TABLE')) {
      alterStatements.push(sql);
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith('UPDATE prompts SET view_count')) {
      const prompt = prompts.get(Number(bound[0]));
      if (!prompt || prompt.status !== 'published') return { rows: [], rowCount: 0 };
      prompt.view_count += 1;
      return { rows: [{ viewCount: prompt.view_count }], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE prompts SET like_count')) {
      const prompt = prompts.get(Number(bound[0]));
      if (!prompt || prompt.status !== 'published') return { rows: [], rowCount: 0 };
      prompt.like_count += 1;
      return { rows: [{ likeCount: prompt.like_count }], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO public.site_reviews')) {
      const [name, socialUrl, rating, reviewText, promptId, ipHash, userAgent, limit] = bound;
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const recent = reviews.filter(
        (row) => row.ip_hash === ipHash && Date.parse(row.created_at) > oneHourAgo,
      ).length;
      if (recent >= limit) return { rows: [], rowCount: 0 };
      const row = {
        id: nextReviewId++,
        name,
        social_url: socialUrl,
        rating,
        review_text: reviewText,
        status: 'pending',
        source: 'prompt',
        prompt_id: promptId,
        ip_hash: ipHash,
        user_agent: userAgent,
        created_at: new Date().toISOString(),
      };
      reviews.push(row);
      return { rows: [{ ...row, created_at: row.created_at }], rowCount: 1 };
    }

    if (sql.includes('FROM public.site_reviews') && sql.includes('AVG(rating)')) {
      const promptId = Number(bound[0]);
      const matching = reviews.filter(
        (row) => row.prompt_id === promptId && row.status === 'approved' && row.source === 'prompt',
      );
      const average = matching.length === 0
        ? 0
        : matching.reduce((sum, row) => sum + row.rating, 0) / matching.length;
      return {
        rows: [{ reviewCount: matching.length, averageRating: average.toFixed(2) }],
        rowCount: 1,
      };
    }

    throw new Error(`Unexpected query in prompt-engagement test: ${sql.slice(0, 120)}`);
  },
  async connect() {
    return { query: (...args) => fakePool.query(...args), release() {} };
  },
  async end() {},
  on() {
    return fakePool;
  },
};

test.beforeEach(() => {
  seedTables();
  fakePool.__dbConnectionString = getDatabaseUrl();
  globalThis.__dbPgPool = fakePool;
});

test.afterEach(() => {
  delete globalThis.__dbPgPool;
});

test('formatCompactCount abbreviates thousands and millions', () => {
  assert.equal(formatCompactCount(0), '0');
  assert.equal(formatCompactCount(999), '999');
  assert.equal(formatCompactCount(1000), '1k');
  assert.equal(formatCompactCount(1200), '1.2k');
  assert.equal(formatCompactCount(1500), '1.5k');
  assert.equal(formatCompactCount(1000000), '1M');
  assert.equal(formatCompactCount(-5), '0');
});

test('toPromptCardItem carries view and like counts, defaulting to zero', () => {
  assert.equal(toPromptCardItem({ viewCount: 12, likeCount: 3 }).viewCount, 12);
  assert.equal(toPromptCardItem({ viewCount: 12, likeCount: 3 }).likeCount, 3);
  assert.equal(toPromptCardItem({}).viewCount, 0);
  assert.equal(toPromptCardItem({}).likeCount, 0);
  assert.equal(toPromptCardItem({ view_count: 5, like_count: 2 }).viewCount, 5);
});

test('normalizePrompt and normalizePromptSlim carry view and like counts', () => {
  const full = normalizePrompt({ title: 'T', slug: 't', prompt: 'P', viewCount: 9, likeCount: 4 });
  assert.equal(full.viewCount, 9);
  assert.equal(full.likeCount, 4);
  const slim = normalizePromptSlim({ title: 'T', slug: 't', prompt: 'P' });
  assert.equal(slim.viewCount, 0);
  assert.equal(slim.likeCount, 0);
});

test('normalizePromptEngagementId accepts numeric ids and rejects the rest', () => {
  assert.equal(normalizePromptEngagementId('42'), 42);
  assert.equal(normalizePromptEngagementId(7), 7);
  for (const bad of [0, -1, 1.5, 'abc', null, undefined, Number.NaN]) {
    assert.throws(
      () => normalizePromptEngagementId(bad),
      PromptEngagementValidationError,
    );
  }
});

test('validatePromptFeedbackInput requires 1-5 stars and caps the optional comment', () => {
  assert.deepEqual(
    validatePromptFeedbackInput({ rating: 5 }),
    { rating: 5, comment: '' },
  );
  assert.deepEqual(
    validatePromptFeedbackInput({ rating: '4', comment: '  Lovely prompt  ' }),
    { rating: 4, comment: 'Lovely prompt' },
  );
  for (const bad of [0, 6, 2.5, 'great', null, undefined]) {
    assert.throws(
      () => validatePromptFeedbackInput({ rating: bad }),
      PromptEngagementValidationError,
    );
  }
  assert.throws(
    () => validatePromptFeedbackInput({ rating: 5, comment: 'x'.repeat(501) }),
    PromptEngagementValidationError,
  );
  assert.equal(MAX_FEEDBACK_COMMENT_LENGTH, 500);
});

test('ensurePromptEngagementSchema adds both counter columns once', async () => {
  await ensurePromptEngagementSchema();
  await ensurePromptEngagementSchema();
  assert.equal(alterStatements.length, 2);
  assert.ok(alterStatements[0].includes('ADD COLUMN'));
  assert.ok(alterStatements[0].includes('view_count'));
  assert.ok(alterStatements[1].includes('like_count'));
});

test('incrementPromptViewCount counts every call and returns the new total', async () => {
  assert.equal(await incrementPromptViewCount(1), 1);
  assert.equal(await incrementPromptViewCount(1), 2);
  assert.equal(await incrementPromptViewCount(2), 42);
  // Drafts and unknown prompts do not count.
  assert.equal(await incrementPromptViewCount(3), null);
  assert.equal(await incrementPromptViewCount(999), null);
});

test('incrementPromptLikeCount counts and returns the new total', async () => {
  assert.equal(await incrementPromptLikeCount(2), 8);
  assert.equal(await incrementPromptLikeCount(3), null);
});

test('submitPromptFeedback stores a pending anonymous prompt review', async () => {
  const result = await submitPromptFeedback({
    promptId: 1,
    rating: 5,
    comment: 'Worked beautifully.',
    ipHash: 'ip-hash-1',
    userAgent: 'test-agent',
  });
  assert.equal(result.limited, false);
  assert.equal(result.review.status, 'pending');
  assert.equal(result.review.source, 'prompt');
  assert.equal(result.review.name, 'Anonymous');
  assert.equal(result.review.prompt_id, 1);
  assert.equal(result.review.rating, 5);

  // The same IP can submit up to the hourly limit, then is limited.
  for (let index = 0; index < PROMPT_FEEDBACK_RATE_LIMIT - 1; index += 1) {
    const next = await submitPromptFeedback({
      promptId: 1,
      rating: 4,
      comment: '',
      ipHash: 'ip-hash-1',
      userAgent: 'test-agent',
    });
    assert.equal(next.limited, false);
  }
  const limited = await submitPromptFeedback({
    promptId: 1,
    rating: 4,
    comment: '',
    ipHash: 'ip-hash-1',
    userAgent: 'test-agent',
  });
  assert.equal(limited.limited, true);
  assert.equal(limited.review, null);

  // A different IP is unaffected by the first IP's limit.
  const other = await submitPromptFeedback({
    promptId: 1,
    rating: 3,
    comment: '',
    ipHash: 'ip-hash-2',
    userAgent: 'test-agent',
  });
  assert.equal(other.limited, false);
});

test('getPromptFeedbackSummary averages only approved prompt feedback', async () => {
  // Seed rows directly: one prompt review, one copy-gate review for the
  // same prompt (excluded), one pending prompt review (excluded).
  reviews.push(
    { id: 1, prompt_id: 1, rating: 5, status: 'approved', source: 'prompt', ip_hash: 'a', created_at: new Date().toISOString() },
    { id: 2, prompt_id: 1, rating: 1, status: 'approved', source: 'copy-gate', ip_hash: 'b', created_at: new Date().toISOString() },
    { id: 3, prompt_id: 1, rating: 1, status: 'pending', source: 'prompt', ip_hash: 'c', created_at: new Date().toISOString() },
    { id: 4, prompt_id: 2, rating: 4, status: 'approved', source: 'prompt', ip_hash: 'd', created_at: new Date().toISOString() },
  );
  nextReviewId = 5;

  assert.deepEqual(await getPromptFeedbackSummary(1), { reviewCount: 1, averageRating: 5 });
  assert.deepEqual(await getPromptFeedbackSummary(2), { reviewCount: 1, averageRating: 4 });
  assert.deepEqual(await getPromptFeedbackSummary(999), { reviewCount: 0, averageRating: 0 });

  // A freshly submitted review is pending, so it does not change the
  // approved-only summary until an admin approves it.
  await submitPromptFeedback({
    promptId: 1,
    rating: 3,
    comment: '',
    ipHash: 'ip-hash-9',
    userAgent: 'test-agent',
  });
  assert.deepEqual(await getPromptFeedbackSummary(1), { reviewCount: 1, averageRating: 5 });
});

test('feedback comment limit matches the detail-page form', async () => {
  const section = await readFile(
    new URL('../src/components/prompts/PromptFeedbackSection.jsx', import.meta.url),
    'utf8',
  );
  assert.match(section, /MAX_COMMENT_LENGTH = 500/);
});
