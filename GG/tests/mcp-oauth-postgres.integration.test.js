import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { getPgPool } from '../src/lib/db.js';
import {
  createDraft,
  getPrompt,
  listPrompts,
  updateDraft,
} from '../src/lib/mcp-prompt-tools.js';
import {
  grantMcpOAuthAuthorization,
  grantMcpPromptDraftAccess,
  lockMcpOAuthAuthorization,
  lockMcpOAuthDraftAuthorization,
  revokeMcpOAuthAuthorization,
  revokeMcpPromptDraftAccess,
} from '../src/lib/mcp-oauth-db.js';
import { applyMcpOAuthAuthorizationMigration } from '../scripts/add-mcp-oauth-authorization.mjs';

const TEST_DATABASE_ENV = 'AQ_MCP_POSTGRES_TEST_URL';
const TEST_DATABASE_PATTERN = /^aq_mcp_oauth_it_[a-z0-9_]+$/;
const RESOURCE = 'https://www.aqprompts.com/api/mcp';
const CLIENT_ID = 'isolated-postgres-test-client';
const userA = { type: 'oauth', subject: 'integration-user-a', clientId: CLIENT_ID };
const userB = { type: 'oauth', subject: 'integration-user-b', clientId: CLIENT_ID };
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousPostgresUrl = process.env.POSTGRES_URL;
const previousPrismaUrl = process.env.POSTGRES_PRISMA_URL;
const previousPool = globalThis.__dbPgPool;

after(async () => {
  if (globalThis.__dbPgPool && globalThis.__dbPgPool !== previousPool) {
    await globalThis.__dbPgPool.end();
  }
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = previousPostgresUrl;
  if (previousPrismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
  else process.env.POSTGRES_PRISMA_URL = previousPrismaUrl;
  if (previousPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = previousPool;
});

test('MCP ownership, assignments, revocation, and draft status work on disposable PostgreSQL', {
  skip: !process.env[TEST_DATABASE_ENV],
}, async () => {
  const databaseUrl = process.env[TEST_DATABASE_ENV];
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`${TEST_DATABASE_ENV} must be a PostgreSQL URL for a disposable local database.`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
    || !['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !TEST_DATABASE_PATTERN.test(databaseName)
  ) {
    throw new Error(`${TEST_DATABASE_ENV} must target a loopback database named aq_mcp_oauth_it_*.`);
  }

  process.env.DATABASE_URL = databaseUrl;
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  globalThis.__dbPgPool = undefined;
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    const existingTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      LIMIT 1
    `);
    if (existingTables.rowCount !== 0) {
      throw new Error('Disposable PostgreSQL database must have an empty public schema.');
    }

    await client.query(`
      CREATE TABLE users (
        id BIGINT PRIMARY KEY,
        email TEXT NOT NULL,
        role TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE categories (
        id BIGINT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE prompts (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        image TEXT,
        images JSONB NOT NULL DEFAULT '[]'::jsonb,
        category TEXT,
        categories JSONB NOT NULL DEFAULT '[]'::jsonb,
        use_case TEXT,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at DATE,
        intro TEXT,
        status TEXT NOT NULL,
        primary_category_id BIGINT,
        library_type TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        should_noindex BOOLEAN NOT NULL DEFAULT false
      )
    `);
    await client.query(`
      CREATE TABLE prompt_categories (
        prompt_id BIGINT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
        category_id BIGINT NOT NULL REFERENCES categories(id),
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (prompt_id, category_id)
      )
    `);
    await client.query(
      "INSERT INTO users (id, email, role) VALUES (1, 'admin@example.test', 'admin')",
    );
    await client.query("INSERT INTO categories (id, name) VALUES (1, 'Writing')");
    await client.query(`
      INSERT INTO prompts (title, prompt, slug, category, categories, tags, status, primary_category_id, library_type)
      VALUES
        ('Synthetic published', 'Published fixture content for integration.', 'synthetic-published',
          'Writing', '["Writing"]'::jsonb, '[]'::jsonb, 'published', 1, 'text'),
        ('Synthetic legacy draft', 'Legacy fixture content for integration.', 'synthetic-legacy-draft',
          'Writing', '["Writing"]'::jsonb, '[]'::jsonb, 'draft', 1, 'text')
    `);
  } finally {
    client.release();
  }

  await applyMcpOAuthAuthorizationMigration(pool);
  const existingPrompts = await pool.query(`
    SELECT id, title, status
    FROM prompts
    ORDER BY id
  `);
  assert.deepEqual(existingPrompts.rows.map(({ title, status }) => ({ title, status })), [
    { title: 'Synthetic published', status: 'published' },
    { title: 'Synthetic legacy draft', status: 'draft' },
  ]);

  await grantMcpOAuthAuthorization(userA.subject, CLIENT_ID, 1, 1);
  await grantMcpOAuthAuthorization(userB.subject, CLIENT_ID, 1, 1);

  const created = await createDraft({
    library: 'text',
    title: 'Owned integration draft',
    prompt: 'A synthetic draft owned by the verified test subject.',
    slug: 'owned-integration-draft',
    primaryCategoryId: 1,
    categoryIds: [1],
    owner: userB.subject,
    subject: userB.subject,
  }, userA);
  const storedOwner = await pool.query(
    'SELECT subject FROM mcp_prompt_owners WHERE prompt_id = $1',
    [created.id],
  );
  assert.equal(storedOwner.rows[0].subject, userA.subject);
  assert.equal(created.status, 'draft');

  const visibleToA = await listPrompts({ library: 'text', status: 'all' }, userA);
  assert.deepEqual(new Set(visibleToA.rows.map(({ slug }) => slug)), new Set([
    'synthetic-published',
    'owned-integration-draft',
  ]));
  assert.equal(visibleToA.total, 2);
  await pool.query("UPDATE users SET role = 'viewer' WHERE id = 1");
  await assert.rejects(listPrompts({ library: 'text' }, userA), /not authorized/);
  await pool.query("UPDATE users SET role = 'admin' WHERE id = 1");
  await assert.rejects(getPrompt({ library: 'text', id: 2 }, userA), /not accessible/);
  await assert.rejects(getPrompt({ library: 'text', id: 999999 }, userA), /not accessible/);
  assert.equal((await getPrompt({ library: 'text', id: 1 }, userA)).status, 'published');
  await assert.rejects(
    updateDraft({ library: 'text', id: 1, title: 'No published edit' }, userA),
    /not editable/,
  );
  await assert.rejects(
    updateDraft({ library: 'text', id: created.id, title: 'Wrong owner edit' }, userB),
    /not editable/,
  );

  await grantMcpPromptDraftAccess(2, 'text', userB.subject, 1);
  const assignedDraft = await getPrompt({ library: 'text', id: 2 }, userB);
  assert.equal(assignedDraft.status, 'draft');
  await updateDraft({ library: 'text', id: 2, title: 'Updated assigned draft' }, userB);
  assert.equal(
    (await pool.query('SELECT title FROM prompts WHERE id = 2')).rows[0].title,
    'Updated assigned draft',
  );

  const lockClient = await pool.connect();
  await lockClient.query('BEGIN');
  await lockMcpOAuthAuthorization(lockClient, userB);
  await lockMcpOAuthDraftAuthorization(lockClient, 2, 'text', userB);
  let revoked = false;
  const revocation = revokeMcpPromptDraftAccess(2, userB.subject).then((value) => {
    revoked = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(revoked, false);
  await lockClient.query('COMMIT');
  lockClient.release();
  assert.ok(await revocation);
  await assert.rejects(getPrompt({ library: 'text', id: 2 }, userB), /not accessible/);
  await assert.ok(!(await listPrompts({ library: 'text' }, userB)).rows.some(({ id }) => id === 2));

  await revokeMcpOAuthAuthorization(userA.subject, CLIENT_ID);
  await assert.rejects(listPrompts({ library: 'text' }, userA), /not authorized/);
});
