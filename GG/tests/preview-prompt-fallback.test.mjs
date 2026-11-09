import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const root = process.cwd();
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const target = path.resolve(root, 'src', specifier.slice(2));
      return nextResolve(pathToFileURL(`${target}.js`).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const originalEnv = { ...process.env };
const fixtureDatabaseUrl = 'postgresql://fixture@localhost/aq_preview_fixture';
const fixturePool = {
  ended: false,
  __dbConnectionString: fixtureDatabaseUrl,
  __dbPoolMax: 5,
  async query() {
    return { rows: [] };
  },
};
globalThis.__dbPgPool = fixturePool;

function setTestEnvironment(vercelEnv) {
  for (const name of Object.keys(process.env)) {
    if (!['DATABASE_URL', 'VERCEL_ENV'].includes(name)) delete process.env[name];
  }
  process.env.DATABASE_URL = fixtureDatabaseUrl;
  process.env.VERCEL_ENV = vercelEnv;
}

const promptsDb = await import('../src/lib/prompts-db.js');

test.after(() => {
  for (const name of Object.keys(process.env)) {
    if (!(name in originalEnv)) delete process.env[name];
  }
  Object.assign(process.env, originalEnv);
  delete globalThis.__dbPgPool;
});

test('empty Preview prompt queries expose the synthetic fixture across prompt surfaces', async () => {
  setTestEnvironment('preview');
  promptsDb.clearPromptsCache();
  promptsDb.clearPromptSlugsCache();

  const homepage = await promptsDb.getHomepagePromptData();
  assert.equal(homepage.prompts.length, 1);
  assert.equal(homepage.prompts[0].slug, 'synthetic-preview-photo-prompt');
  assert.equal(homepage.prompts[0].image, '/images/verified/media-evidence-placeholder.svg');
  assert.equal(homepage.categoryCards.find((item) => item.slug === 'lifestyle').count, 1);

  const listing = await promptsDb.getSlimPromptsPayload();
  assert.equal(listing.prompts.length, 1);
  assert.equal(listing.prompts[0].slug, 'synthetic-preview-photo-prompt');

  const newsletterPrompts = await promptsDb.getNewsletterWelcomePrompts();
  assert.equal(newsletterPrompts.length, 1);
  assert.equal(newsletterPrompts[0].title, listing.prompts[0].title);
  assert.equal(newsletterPrompts[0].prompt, listing.prompts[0].prompt);

  const categoryPage = await promptsDb.getSlimPromptsPage({
    categorySlugs: ['lifestyle'],
  });
  assert.equal(categoryPage.totalCount, 1);
  assert.equal((await promptsDb.getSlimPromptsPage({
    categorySlugs: ['men'],
  })).totalCount, 0);
  assert.equal((await promptsDb.getSlimPromptsPage({
    search: 'no matching fixture text',
  })).totalCount, 0);
  assert.equal((await promptsDb.getSlimPromptsPage({
    offset: 12,
  })).totalCount, 0);

  const slugs = await promptsDb.getAllPromptSlugs();
  assert(slugs.some((item) => item.slug === 'synthetic-preview-photo-prompt'));
  const detail = await promptsDb.getPromptBySlug('synthetic-preview-photo-prompt');
  assert.equal(detail?.slug, 'synthetic-preview-photo-prompt');
});

test('empty production queries do not expose the Preview fixture', async () => {
  setTestEnvironment('production');
  promptsDb.clearPromptsCache();
  promptsDb.clearPromptSlugsCache();

  const homepage = await promptsDb.getHomepagePromptData();
  assert.equal(homepage.prompts.length, 0);
  assert.equal((await promptsDb.getSlimPromptsPayload()).prompts.length, 0);
  assert.deepEqual(await promptsDb.getNewsletterWelcomePrompts(), []);
});
