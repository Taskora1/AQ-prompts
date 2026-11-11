import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getDatabaseUrl, isBuildPhase, isDatabaseMigrationConnectionAllowed } from '../src/lib/db.js';
import {
  createDraft,
  getPrompt,
  listPrompts,
  publishDraft,
  updateDraft,
  uploadPhotoImage,
} from '../src/lib/mcp-prompt-tools.js';
import { handleMcpProtocolRequest } from '../src/lib/mcp-server.js';
import {
  grantMcpOAuthAuthorization,
  grantMcpPromptDraftAccess,
  hasMcpOAuthAuthorization,
  listMcpOAuthAuthorizations,
  lockMcpOAuthAuthorization,
  lockMcpOAuthDraftAuthorization,
  revokeMcpOAuthAuthorization,
  revokeMcpPromptDraftAccess,
  setMcpOAuthCapabilities,
} from '../src/lib/mcp-oauth-db.js';
import { applyMcpOAuthAuthorizationMigration } from '../scripts/add-mcp-oauth-authorization.mjs';

const RESOURCE = 'https://www.aqprompts.com/api/mcp';
const CLIENT_ID = 'approved-isolated-client';
const authA = { type: 'oauth', subject: 'synthetic-user-a', clientId: CLIENT_ID };
const authB = { type: 'oauth', subject: 'synthetic-user-b', clientId: CLIENT_ID };
const prompts = new Map();
const owners = new Map();
const assignments = new Map();
const authorizations = new Map();
const adminAccounts = new Map([[1, 'admin']]);
const assignmentLocks = new Map();
const calls = [];
let nextPromptId = 100;
let previousDatabaseUrl;
let previousPool;

function authorizationKey(subject, clientId) {
  return `${subject}:${clientId}`;
}

function assignmentKey(promptId, subject) {
  return `${promptId}:${subject}`;
}

function visible(row, subject, library, status, search) {
  if (row.library_type !== library) return false;
  if (status === 'published' && row.status !== 'published') return false;
  if (status === 'draft' && row.status !== 'draft') return false;
  if (
    row.status === 'draft'
    && owners.get(row.id) !== subject
    && !assignments.has(assignmentKey(row.id, subject))
  ) return false;
  if (status === 'all' && !['published', 'draft'].includes(row.status)) return false;
  if (search && !row.title.toLowerCase().includes(search.toLowerCase())) return false;
  return true;
}

function textPromptRow(row) {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    slug: row.slug,
    status: row.status,
    intro: row.intro,
    useCase: row.use_case,
    category: row.category,
    categories: [],
    primaryCategoryId: row.primary_category_id,
    categoryIds: [row.primary_category_id],
    tags: row.tags,
    updatedAt: row.updated_at,
  };
}

function lockFor(key) {
  let lock = assignmentLocks.get(key);
  if (!lock) {
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    lock = { pending, release };
    assignmentLocks.set(key, lock);
  }
  return lock;
}

function releaseAssignmentLocks() {
  for (const [key, lock] of assignmentLocks) {
    lock.release();
    assignmentLocks.delete(key);
  }
}

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

const fakeClient = {
  async query(query, values = []) {
    const sql = typeof query === 'string' ? query : query.text;
    calls.push({ sql, values });
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(normalized)) {
      if (normalized !== 'BEGIN') releaseAssignmentLocks();
      return result();
    }
    if (/FROM mcp_oauth_authorizations/.test(normalized) && /FOR SHARE/.test(normalized)) {
      const authorization = authorizations.get(authorizationKey(values[0], values[1]));
      const linkedToAdmin = ['admin', 'super_admin'].includes(
        adminAccounts.get(authorization?.adminUserId),
      );
      const permitted = linkedToAdmin && (
        normalized.includes('can_publish = TRUE')
          ? authorization.canPublish
          : normalized.includes('can_upload_images = TRUE')
            ? authorization.canUploadImages
            : true
      );
      return permitted
        ? result([{ subject: values[0] }])
        : result();
    }
    if (/FROM mcp_oauth_authorizations/.test(normalized) && /LIMIT 1/.test(normalized)) {
      const authorization = authorizations.get(authorizationKey(values[0], values[1]));
      return ['admin', 'super_admin'].includes(adminAccounts.get(authorization?.adminUserId))
        ? result([{}])
        : result();
    }
    if (/FROM mcp_oauth_authorizations AS authz/.test(normalized) && /ORDER BY authz\.revoked_at/.test(normalized)) {
      return result();
    }
    if (/SELECT p\.status FROM prompts p/.test(normalized)) {
      const row = prompts.get(Number(values[0]));
      return row && row.library_type === values[1] ? result([{ status: row.status }]) : result();
    }
    if (/p\.image,\s*p\.images/.test(normalized) && /p\.library_type = 'photo'/.test(normalized)) {
      const row = prompts.get(Number(values[0]));
      return row && row.library_type === 'photo'
        ? result([{
            id: row.id,
            title: row.title,
            prompt: row.prompt,
            slug: row.slug,
            image: row.image || '',
            images: row.images || [],
            category: row.category,
            categories: [],
            useCase: '',
            tags: row.tags || [],
            faqs: [],
            status: row.status,
            primaryCategoryId: row.primary_category_id,
            categoryIds: [row.primary_category_id],
            imageAltTexts: row.imageAltTexts || {},
          }])
        : result();
    }
    if (/SELECT prompt_id FROM mcp_prompt_owners/.test(normalized)) {
      return owners.get(Number(values[0])) === values[1]
        ? result([{ prompt_id: Number(values[0]) }])
        : result();
    }
    if (/SELECT EXISTS/.test(normalized) && /information_schema\.columns/.test(normalized)) {
      return result([{ supported: true }]);
    }
    if (/SELECT image, images, og_image AS "ogImage"/.test(normalized)) {
      const row = prompts.get(Number(values[0]));
      return row ? result([{
        image: row.image || null,
        images: row.images || [],
        ogImage: row.ogImage || null,
      }]) : result();
    }
    if (/SELECT prompt_id FROM mcp_prompt_draft_access/.test(normalized) && /FOR SHARE/.test(normalized)) {
      if (/WHERE subject = \$1/.test(normalized)) return result();
      const key = assignmentKey(Number(values[0]), values[1]);
      if (!assignments.has(key)) return result();
      lockFor(key);
      return result([{ prompt_id: Number(values[0]) }]);
    }
    if (/SELECT p\.id, p\.title, p\.prompt, p\.slug, p\.status, p\.intro/.test(normalized)) {
      const row = prompts.get(Number(values[0]));
      return row && row.library_type === 'text' ? result([textPromptRow(row)]) : result();
    }
    if (/FROM categories WHERE id = ANY/.test(normalized)) {
      return values[0].includes(1) ? result([{ id: 1, name: 'Writing' }]) : result();
    }
    if (/SELECT COUNT\(\*\)::int AS total FROM prompts p/.test(normalized)) {
      const library = values[0];
      const subject = values[1];
      const isPublishedOnly = normalized.includes("p.status = 'published'")
        && !normalized.includes(' OR (');
      const isDraftOnly = normalized.includes("p.status = 'draft'")
        && !normalized.includes(' OR (');
      const search = normalized.includes('ILIKE') ? values[2].slice(1, -1).toLowerCase() : '';
      const count = [...prompts.values()].filter((row) => visible(
        row,
        subject,
        library,
        isPublishedOnly ? 'published' : isDraftOnly ? 'draft' : 'all',
        search,
      )).length;
      return result([{ total: count }]);
    }
    if (/SELECT p\.id, p\.title, p\.slug, p\.status, p\.updated_at::text AS "updatedAt"/.test(normalized)) {
      const library = values[0];
      const subject = values[1];
      const isPublishedOnly = normalized.includes("p.status = 'published'")
        && !normalized.includes(' OR (');
      const isDraftOnly = normalized.includes("p.status = 'draft'")
        && !normalized.includes(' OR (');
      const hasSearch = normalized.includes('ILIKE');
      const search = hasSearch ? values[2].slice(1, -1).toLowerCase() : '';
      const limit = Number(values[values.length - 2]);
      const offset = Number(values[values.length - 1]);
      const rows = [...prompts.values()]
        .filter((row) => visible(
          row,
          subject,
          library,
          isPublishedOnly ? 'published' : isDraftOnly ? 'draft' : 'all',
          search,
        ))
        .sort((a, b) => b.id - a.id)
        .slice(offset, offset + limit)
        .map((row) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          status: row.status,
          updatedAt: row.updated_at,
          category: row.category,
          image: '',
        }));
      return result(rows);
    }
    if (/INSERT INTO prompts/.test(normalized)) {
      const id = nextPromptId++;
      const isPhotoPrompt = /'photo',\s*\$30,\s*\$31\s*\)\s*RETURNING/i.test(normalized);
      const row = {
        id,
        title: values[0],
        prompt: values[1],
        slug: values[2],
        image: isPhotoPrompt ? values[3] : '',
        category: isPhotoPrompt ? values[5] : values[3],
        tags: JSON.parse(values[isPhotoPrompt ? 8 : 6]),
        intro: values[isPhotoPrompt ? 9 : 7],
        status: values[isPhotoPrompt ? 12 : 8],
        primary_category_id: values[isPhotoPrompt ? 13 : 9],
        use_case: values[isPhotoPrompt ? 7 : 5],
        library_type: isPhotoPrompt ? 'photo' : 'text',
        updated_at: new Date().toISOString(),
      };
      prompts.set(id, row);
      return result([{ id, slug: row.slug, status: row.status }]);
    }
    if (/UPDATE prompts SET should_noindex/.test(normalized)) return result();
    if (/INSERT INTO mcp_prompt_owners/.test(normalized)) {
      owners.set(Number(values[0]), values[1]);
      return result();
    }
    if (/INSERT INTO prompt_categories|DELETE FROM prompt_categories/.test(normalized)) return result();
    if (/UPDATE prompts SET title = \$2/.test(normalized)) {
      const row = prompts.get(Number(values[0]));
      const hasExpectedDraft = values[12] === 'draft';
      const subject = values[13];
      const clientId = values[14];
      if (
        !row
        || row.library_type !== 'text'
        || row.status !== 'draft'
        || !hasExpectedDraft
        || !authorizations.has(authorizationKey(subject, clientId))
        || (owners.get(row.id) !== subject && !assignments.has(assignmentKey(row.id, subject)))
      ) return result();
      row.title = values[1];
      row.prompt = values[2];
      row.slug = values[3];
      row.status = values[9];
      row.updated_at = new Date().toISOString();
      return result([{
        id: row.id,
        slug: row.slug,
        status: row.status,
        updatedAt: row.updated_at,
      }]);
    }
    if (/INSERT INTO mcp_oauth_authorizations/.test(normalized)) {
      if (!['admin', 'super_admin'].includes(adminAccounts.get(values[2]))) return result();
      authorizations.set(authorizationKey(values[0], values[1]), {
        adminUserId: values[2],
        canPublish: false,
        canUploadImages: false,
        canPublishBlog: false,
      });
      return result([{
        subject: values[0],
        clientId: values[1],
        adminUserId: values[2],
        grantedAt: 'now',
      }]);
    }
    if (/UPDATE mcp_oauth_authorizations/.test(normalized) && /permissions_updated_at = NOW\(\)/.test(normalized)) {
      const authorization = authorizations.get(authorizationKey(values[0], values[1]));
      if (
        !authorization
        || !['admin', 'super_admin'].includes(adminAccounts.get(authorization.adminUserId))
      ) return result();
      if (values[2] !== null) authorization.canPublish = values[2];
      if (values[3] !== null) authorization.canUploadImages = values[3];
      if (values[4] !== null) authorization.canPublishBlog = values[4];
      return result([{
        subject: values[0],
        clientId: values[1],
        adminUserId: authorization.adminUserId,
        ...authorization,
        permissionsUpdatedAt: 'now',
      }]);
    }
    if (/UPDATE mcp_oauth_authorizations/.test(normalized)) {
      const key = authorizationKey(values[0], values[1]);
      if (!authorizations.has(key)) return result();
      authorizations.delete(key);
      return result([{ subject: values[0], client_id: values[1], revokedAt: 'now' }]);
    }
    if (/INSERT INTO mcp_prompt_draft_access/.test(normalized)) {
      const row = prompts.get(Number(values[0]));
      if (!row || row.status !== 'draft' || row.library_type !== values[1]) return result();
      assignments.set(assignmentKey(row.id, values[2]), true);
      return result([{ id: row.id, subject: values[2], grantedAt: 'now' }]);
    }
    if (/UPDATE mcp_prompt_draft_access/.test(normalized)) {
      const key = assignmentKey(Number(values[0]), values[1]);
      const lock = assignmentLocks.get(key);
      if (lock) await lock.pending;
      if (!assignments.has(key)) return result();
      assignments.delete(key);
      return result([{ id: Number(values[0]), subject: values[1], revokedAt: 'now' }]);
    }

    throw new Error(`Unexpected mock SQL in OAuth authorization test: ${normalized}`);
  },
  release() {},
};

const fakePool = {
  ended: false,
  __dbPoolMax: 5,
  async connect() {
    return fakeClient;
  },
  query(query, values) {
    return fakeClient.query(query, values);
  },
};

before(async () => {
  previousDatabaseUrl = process.env.DATABASE_URL;
  previousPool = globalThis.__dbPgPool;
  process.env.DATABASE_URL = 'postgres://localhost/mcp_oauth_unit_test';
  fakePool.__dbConnectionString = getDatabaseUrl();
  fakePool.__dbPoolMax = Number.parseInt(process.env.PG_POOL_MAX || '', 10) || (isBuildPhase() ? 1 : 5);
  globalThis.__dbPgPool = fakePool;
  prompts.set(1, {
    id: 1, title: 'Published prompt', prompt: 'Published prompt text content.',
    slug: 'published-prompt', status: 'published', library_type: 'text',
    primary_category_id: 1, category: 'Writing', tags: [], updated_at: '2026-01-01',
  });
  prompts.set(2, {
    id: 2, title: 'Legacy draft', prompt: 'Legacy draft text content.',
    slug: 'legacy-draft', status: 'draft', library_type: 'text',
    primary_category_id: 1, category: 'Writing', tags: [], updated_at: '2026-01-02',
  });
  prompts.set(3, {
    id: 3, title: 'Another user draft', prompt: 'Another user draft text content.',
    slug: 'another-user-draft', status: 'draft', library_type: 'text',
    primary_category_id: 1, category: 'Writing', tags: [], updated_at: '2026-01-03',
  });
  await grantMcpOAuthAuthorization(authA.subject, CLIENT_ID, 1, 1);
  await grantMcpOAuthAuthorization(authB.subject, CLIENT_ID, 1, 1);
  owners.set(3, authB.subject);
});

after(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = previousPool;
});

test('OAuth authorization lookups and listings use unreserved SQL aliases', async () => {
  calls.length = 0;
  assert.equal(await hasMcpOAuthAuthorization(authA), true);
  await listMcpOAuthAuthorizations(CLIENT_ID);

  const queries = calls.map(({ sql }) => sql);
  assert.equal(queries.length, 2);
  for (const sql of queries) {
    assert.match(sql, /mcp_oauth_authorizations AS authz/);
    assert.doesNotMatch(sql, /mcp_oauth_authorizations\s+authorization\b/);
  }
});

test('additive migration creates access and OAuth client tables without backfilling prompts', async () => {
  const beforeRows = [...prompts.values()].map(({ id, title, status }) => ({ id, title, status }));
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(String(sql).replace(/\s+/g, ' ').trim());
      return result();
    },
    release() {},
  };
  await applyMcpOAuthAuthorizationMigration({ connect: async () => client });

  assert.ok(statements.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mcp_oauth_authorizations')));
  assert.ok(statements.some((sql) => sql.startsWith('ALTER TABLE mcp_oauth_authorizations')));
  assert.ok(statements.some((sql) => /ADD COLUMN IF NOT EXISTS admin_user_id BIGINT REFERENCES users\(id\) ON DELETE SET NULL/.test(sql)));
  assert.ok(statements.some((sql) => sql.includes('mcp_oauth_authorizations_admin_user_idx')));
  assert.ok(statements.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mcp_prompt_owners')));
  assert.ok(statements.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mcp_prompt_draft_access')));
  assert.ok(statements.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mcp_blog_post_owners')));
  assert.ok(statements.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mcp_blog_post_draft_access')));
  assert.ok(statements.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mcp_oauth_clients')));
  assert.ok(statements.some((sql) => /ADD COLUMN IF NOT EXISTS refresh_enabled BOOLEAN NOT NULL DEFAULT FALSE/.test(sql)));
  assert.ok(statements.some((sql) => sql.includes('mcp_oauth_clients_created_at_idx')));
  assert.ok(statements.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mcp_oauth_broker_tokens')));
  assert.ok(statements.some((sql) => sql.includes('mcp_oauth_broker_tokens_expires_at_idx')));
  assert.ok(statements.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mcp_oauth_broker_refresh_tokens')));
  assert.ok(statements.some((sql) => sql.includes('mcp_oauth_broker_refresh_tokens_expires_at_idx')));
  assert.ok(statements.some((sql) => sql.startsWith('ALTER TABLE mcp_oauth_authorizations')));
  assert.equal(statements.some((sql) => /\b(UPDATE|DELETE|INSERT INTO)\s+prompts\b/i.test(sql)), false);
  assert.deepEqual(
    [...prompts.values()].map(({ id, title, status }) => ({ id, title, status })),
    beforeRows,
  );

  const migrationPath = fileURLToPath(new URL('../scripts/add-mcp-oauth-authorization.mjs', import.meta.url));
  const source = await fs.readFile(migrationPath, 'utf8');
  assert.equal(/\bALTER TABLE prompts\b|\bUPDATE prompts\b|\bINSERT INTO prompts\b/i.test(source), false);
  assert.equal(/\bUPDATE mcp_oauth_authorizations\b/i.test(source), false);
  assert.equal(isDatabaseMigrationConnectionAllowed('add-mcp-oauth-authorization.mjs'), false);
});

test('MCP OAuth grants must link to an existing Admin or Super Admin account', async () => {
  calls.length = 0;
  const linked = await grantMcpOAuthAuthorization('synthetic-linked-user', CLIENT_ID, 1, 1);
  assert.equal(linked.adminUserId, 1);
  assert.match(calls[0].sql, /admin_user\.role IN \('admin', 'super_admin'\)/);

  const missingAdmin = await grantMcpOAuthAuthorization('synthetic-unlinked-user', CLIENT_ID, 99, 1);
  assert.equal(missingAdmin, null);
});

test('OAuth draft creation derives ownership only from verified authentication and is transactional', async () => {
  calls.length = 0;
  const created = await createDraft({
    library: 'text',
    title: 'Owned draft',
    prompt: 'A sufficiently long synthetic draft prompt.',
    slug: 'owned-draft',
    primaryCategoryId: 1,
    categoryIds: [1],
    subject: authB.subject,
    owner: authB.subject,
    ownerSubject: authB.subject,
  }, authA);

  assert.equal(created.status, 'draft');
  assert.equal(owners.get(created.id), authA.subject);
  assert.equal(prompts.get(created.id).status, 'draft');
  const begin = calls.findIndex(({ sql }) => sql.trim() === 'BEGIN');
  const insert = calls.findIndex(({ sql }) => /INSERT INTO prompts/.test(sql));
  const owner = calls.findIndex(({ sql }) => /INSERT INTO mcp_prompt_owners/.test(sql));
  const commit = calls.findIndex(({ sql }) => sql.trim() === 'COMMIT');
  assert.ok(begin < insert && insert < owner && owner < commit);
  assert.equal(calls[owner].values[1], authA.subject);
});

test('OAuth can create a Photo draft without an image', async () => {
  calls.length = 0;
  const created = await createDraft({
    library: 'photo',
    title: 'Image-less photo draft',
    prompt: 'A sufficiently long synthetic photo prompt.',
    slug: 'image-less-photo-draft',
    primaryCategoryId: 1,
    categoryIds: [1],
  }, authA);

  assert.equal(created.status, 'draft');
  assert.equal(created.library, 'photo');
  assert.equal(prompts.get(created.id).image, '');
  assert.equal(owners.get(created.id), authA.subject);
});

test('MCP tool schemas reject forged owner and subject arguments', async () => {
  const response = await handleMcpProtocolRequest(new Request(RESOURCE, {
    method: 'POST',
    headers: {
      // DNS rebinding protection is on: the transport rejects requests
      // without a Host header, so synthetic requests must carry a real one.
      host: 'www.aqprompts.com',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'create_draft',
        arguments: {
          library: 'text',
          title: 'Forged draft',
          prompt: 'A sufficiently long synthetic draft prompt.',
          primaryCategoryId: 1,
          subject: authB.subject,
          owner: authB.subject,
        },
      },
    }),
  }), authA);
  const output = await response.json();
  assert.equal(output.result?.isError, true);
  assert.equal([...prompts.values()].some(({ slug }) => slug === 'forged-draft'), false);
});

test('OAuth list and count reveal only published prompts and authorized drafts', async () => {
  const resultA = await listPrompts({ library: 'text', status: 'all' }, authA);
  assert.deepEqual(
    resultA.rows.map(({ id }) => id).sort(),
    [1, 100].sort(),
    JSON.stringify(calls.slice(-4).map(({ sql, values }) => ({ sql, values }))),
  );
  assert.equal(resultA.total, 2);
  assert.ok(resultA.rows.every(({ id }) => id !== 2 && id !== 3));

  await assert.rejects(getPrompt({ library: 'text', id: 2 }, authA), /not accessible/);
  await assert.rejects(getPrompt({ library: 'text', id: 3 }, authA), /not accessible/);
  assert.equal((await getPrompt({ library: 'text', id: 1 }, authA)).status, 'published');
  assert.equal((await getPrompt({ library: 'text', id: 100 }, authA)).status, 'draft');
  await assert.rejects(
    listPrompts({ library: 'text' }, { ...authA, clientId: 'unapproved-client' }),
    /not authorized/,
  );
});

test('OAuth access is blocked if the linked admin account is demoted or removed', async () => {
  adminAccounts.set(1, 'viewer');
  try {
    await assert.rejects(
      listPrompts({ library: 'text' }, authA),
      /not authorized/,
    );
  } finally {
    adminAccounts.set(1, 'admin');
  }
  assert.equal((await listPrompts({ library: 'text' }, authA)).total, 2);
});

test('explicit assignments permit legacy draft access and revocation removes reads and counts', async () => {
  assert.ok(await grantMcpPromptDraftAccess(2, 'text', authB.subject, 1));
  assert.equal((await getPrompt({ library: 'text', id: 2 }, authB)).id, 2);
  assert.ok((await listPrompts({ library: 'text' }, authB)).rows.some(({ id }) => id === 2));
  await updateDraft({ library: 'text', id: 2, title: 'Assigned legacy draft' }, authB);
  assert.equal(prompts.get(2).title, 'Assigned legacy draft');

  assert.ok(await revokeMcpPromptDraftAccess(2, authB.subject));
  await assert.rejects(getPrompt({ library: 'text', id: 2 }, authB), /not accessible/);
  assert.ok(!(await listPrompts({ library: 'text' }, authB)).rows.some(({ id }) => id === 2));
  assert.equal(await grantMcpPromptDraftAccess(1, 'text', authB.subject, 1), null);
});

test('OAuth updates enforce ownership, draft status, and lock access before mutation', async () => {
  calls.length = 0;
  await assert.rejects(
    updateDraft({ library: 'text', id: 100, title: 'Attacker update' }, authB),
    /not editable/,
  );
  assert.equal(prompts.get(100).title, 'Owned draft');

  await assert.rejects(
    updateDraft({ library: 'text', id: 1, title: 'Change published prompt' }, authA),
    /not editable/,
  );
  assert.equal(prompts.get(1).title, 'Published prompt');

  calls.length = 0;
  const updated = await updateDraft({
    library: 'text',
    id: 100,
    title: 'Updated owned draft',
    subject: authB.subject,
    owner: authB.subject,
  }, authA);
  assert.equal(prompts.get(100).title, 'Updated owned draft');
  assert.equal(updated.id, 100);
  assert.equal(owners.get(100), authA.subject);

  const promptLock = calls.findIndex(({ sql }) => sql.includes('SELECT p.status') && sql.includes('FOR UPDATE'));
  const ownerCheck = calls.findIndex(({ sql }) => sql.includes('SELECT prompt_id') && sql.includes('mcp_prompt_owners'));
  const update = calls.findIndex(({ sql }) => sql.replace(/\s+/g, ' ').trim().startsWith('UPDATE prompts SET title'));
  assert.ok(promptLock >= 0 && ownerCheck > promptLock && update > ownerCheck);
  assert.match(calls[update].sql, /AND status = \$13/);
  assert.match(calls[update].sql, /mcp_oauth_authorizations/);
  assert.match(calls[update].sql, /mcp_prompt_owners/);
  assert.match(calls[update].sql, /mcp_prompt_draft_access/);
});

test('publishing requires a separate capability and can only publish an authorized draft', async () => {
  await assert.rejects(
    publishDraft({ library: 'text', id: 100 }, authA),
    /publish permission is not authorized/,
  );
  await setMcpOAuthCapabilities(authA.subject, CLIENT_ID, {
    canPublish: true,
    canUploadImages: false,
  }, 1);

  const published = await publishDraft({ library: 'text', id: 100 }, authA);
  assert.equal(published.status, 'published');
  assert.ok(published.updatedAt);
  assert.equal(prompts.get(100).status, 'published');
  await assert.rejects(
    publishDraft({ library: 'text', id: 3 }, authA),
    /not editable|not publishable/,
  );
  await assert.rejects(
    publishDraft({ library: 'text', id: 2 }, { ...authA, clientId: 'unapproved-client' }),
    /not authorized/,
  );
});

test('blog publish capability can be changed independently of prompt publish and image upload', async () => {
  const changed = await setMcpOAuthCapabilities(authB.subject, CLIENT_ID, {
    canPublishBlog: true,
  }, 1);
  assert.equal(changed.canPublishBlog, true);
  assert.equal(changed.canPublish, false);
  assert.equal(changed.canUploadImages, false);
});

test('Photo publishing preserves the existing mandatory image and alt-text checks', async () => {
  prompts.set(101, {
    id: 101, title: 'Image-less photo draft', prompt: 'A sufficiently long photo prompt.',
    slug: 'image-less-photo-draft', image: '', images: [], imageAltTexts: {},
    status: 'draft', library_type: 'photo', primary_category_id: 1,
    category: 'Writing', tags: [], updated_at: '2026-01-04',
  });
  owners.set(101, authA.subject);
  await setMcpOAuthCapabilities(authA.subject, CLIENT_ID, {
    canPublish: true,
    canUploadImages: false,
  }, 1);
  await assert.rejects(
    publishDraft({ library: 'photo', id: 101 }, authA),
    /primary image|image/i,
  );
  assert.equal(prompts.get(101).status, 'draft');
});

test('photo upload requires a separate capability and uploads validated image files', async () => {
  const previousEnvironment = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  const previousFetch = globalThis.fetch;
  process.env.CLOUDINARY_CLOUD_NAME = 'synthetic-cloud';
  process.env.CLOUDINARY_API_KEY = 'synthetic-key';
  process.env.CLOUDINARY_API_SECRET = 'synthetic-secret';
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.cloudinary.com/v1_1/synthetic-cloud/image/upload');
    assert.ok(options.body.get('file') instanceof Blob);
    return Response.json({
      secure_url: 'https://res.cloudinary.com/synthetic-cloud/image/upload/mcp-image.png',
      public_id: 'mcp-image',
      width: 640,
      height: 480,
      format: 'png',
      bytes: 1024,
    });
  };
  const validPng = {
    contentType: 'image/png',
    imageBase64: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x00,
    ]).toString('base64'),
  };
  try {
    await assert.rejects(
      uploadPhotoImage(validPng, authA),
      /upload images permission is not authorized/,
    );
    await setMcpOAuthCapabilities(authA.subject, CLIENT_ID, {
      canPublish: false,
      canUploadImages: true,
    }, 1);

    const uploaded = await uploadPhotoImage(validPng, authA);
    assert.equal(uploaded.format, 'png');
    await assert.rejects(
      uploadPhotoImage({ ...validPng, contentType: 'image/jpeg' }, authA),
      /does not match its declared/,
    );
    await assert.rejects(
      uploadPhotoImage({ ...validPng, imageBase64: 'not-base64' }, authA),
      /valid base64-encoded image/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of Object.entries({
      CLOUDINARY_CLOUD_NAME: previousEnvironment.cloudName,
      CLOUDINARY_API_KEY: previousEnvironment.apiKey,
      CLOUDINARY_API_SECRET: previousEnvironment.apiSecret,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('revoked authorization fails closed and cannot use another client context', async () => {
  assert.ok(await revokeMcpOAuthAuthorization(authA.subject, CLIENT_ID));
  await assert.rejects(listPrompts({ library: 'text' }, authA), /not authorized/);
});

test('concurrent draft revocation waits for an in-flight authorized operation', async () => {
  await grantMcpPromptDraftAccess(2, 'text', authB.subject, 1);
  calls.length = 0;
  await fakeClient.query('BEGIN');
  await lockMcpOAuthAuthorization(fakeClient, authB);
  await lockMcpOAuthDraftAuthorization(fakeClient, 2, 'text', authB);
  let revoked = false;
  const revocation = revokeMcpPromptDraftAccess(2, authB.subject).then((value) => {
    revoked = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(revoked, false);
  await fakeClient.query('COMMIT');
  assert.ok(await revocation);

  const authorizationIndex = calls.findIndex(({ sql }) => /FROM mcp_oauth_authorizations[\s\S]*FOR SHARE/.test(sql));
  const promptIndex = calls.findIndex(({ sql }) => /FROM prompts p[\s\S]*FOR UPDATE/.test(sql));
  const assignmentIndex = calls.findIndex(({ sql }) => /FROM mcp_prompt_draft_access[\s\S]*FOR SHARE/.test(sql));
  const revokeIndex = calls.findIndex(({ sql }) => /UPDATE mcp_prompt_draft_access/.test(sql));
  const commitIndex = calls.findIndex(({ sql }) => sql.trim() === 'COMMIT');
  assert.ok(authorizationIndex >= 0);
  assert.ok(promptIndex > authorizationIndex);
  assert.ok(assignmentIndex > promptIndex);
  assert.ok(revokeIndex > assignmentIndex);
  assert.ok(commitIndex > revokeIndex);
  await assert.rejects(getPrompt({ library: 'text', id: 2 }, authB), /not accessible/);
});
