import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  bootstrapPreviewSyntheticDatabase,
  validatePreviewBootstrapDatabaseUrl,
} from '../scripts/bootstrap-preview-synthetic-db.mjs';
import {
  insertMcpPromptOwner,
  lockMcpOAuthDraftAuthorization,
  McpAuthorizationError,
} from '../src/lib/mcp-oauth-db.js';

const previewDatabaseUrl =
  'postgresql://preview_user:synthetic_test_value@ep-preview-example.us-east-2.aws.neon.tech/preview_db?sslmode=require';
const oauthUser = {
  type: 'oauth',
  subject: 'synthetic-preview-subject',
  clientId: 'synthetic-preview-client',
};

class RecordingDatabase {
  constructor({ relations = 0, customTypes = 0 } = {}) {
    this.relations = relations;
    this.customTypes = customTypes;
    this.calls = [];
    this.verificationRow = {
      table_count: 14,
      constraint_count: 41,
      required_index_count: 9,
      user_count: 1,
      category_count: 2,
      synthetic_prompt_count: 3,
      prompt_category_count: 3,
      blog_post_count: 0,
      authorization_count: 0,
      owner_count: 0,
      draft_access_count: 0,
      blog_owner_count: 0,
      blog_draft_access_count: 0,
      broker_token_count: 0,
      oauth_client_count: 0,
      broker_refresh_token_count: 0,
    };
  }

  async query(query, values = []) {
    const sql = typeof query === 'string' ? query : query.text;
    this.calls.push({ sql, values });

    if (sql.includes('custom_types')) {
      return {
        rowCount: 1,
        rows: [{
          relations: this.relations,
          routines: 0,
          custom_types: this.customTypes,
        }],
      };
    }
    if (sql.includes('table_count')) {
      return {
        rowCount: 1,
        rows: [this.verificationRow],
      };
    }
    if (sql.includes('INSERT INTO categories')) {
      return {
        rowCount: 2,
        rows: [
          { id: 1, library_type: 'photo' },
          { id: 2, library_type: 'text' },
        ],
      };
    }
    if (sql.includes('RETURNING id')) return { rowCount: 1, rows: [{ id: 1 }] };
    if (sql.includes('INSERT INTO prompts')) return { rowCount: 1, rows: [] };
    return { rowCount: 1, rows: [] };
  }
}

test('Preview database URL must be a PostgreSQL URL for a non-Production Neon identity', () => {
  const identity = validatePreviewBootstrapDatabaseUrl(previewDatabaseUrl);
  assert.equal(identity.provider, 'neon');
  assert.match(identity.hostnameFingerprint, /^sha256:[a-f0-9]{16}$/);
  assert.throws(
    () => validatePreviewBootstrapDatabaseUrl('postgresql://user:pass@db.example.test/preview'),
    /restricted to a Neon Preview database/,
  );
  assert.throws(
    () => validatePreviewBootstrapDatabaseUrl('not-a-database-url'),
    /database URL is invalid/,
  );
});

test('non-empty public schema is refused before DDL or seed writes', async () => {
  const db = new RecordingDatabase({ relations: 1 });

  await assert.rejects(
    bootstrapPreviewSyntheticDatabase(db, {
      adminEmail: 'preview-admin@aq-preview.invalid',
      adminPassword: 'synthetic-test-password',
      hashPassword: async () => 'synthetic-hash',
    }),
    /requires an empty public schema/,
  );
  assert.deepEqual(db.calls.map(({ sql }) => sql.trim().split(/\s+/)[0]), [
    'BEGIN',
    'SELECT',
    'SELECT',
    'ROLLBACK',
  ]);
});

test('standalone and relation-backed composite types make the public schema non-empty', async () => {
  const db = new RecordingDatabase({ relations: 1, customTypes: 1 });

  await assert.rejects(
    bootstrapPreviewSyntheticDatabase(db, {
      adminEmail: 'preview-admin@aq-preview.invalid',
      adminPassword: 'synthetic-test-password',
      hashPassword: async () => 'synthetic-hash',
    }),
    /requires an empty public schema/,
  );
  const emptySchemaQuery = db.calls.find(({ sql }) => sql.includes('custom_types')).sql;
  assert.match(emptySchemaQuery, /rel\.relkind IN \([^)]*'c'[^)]*\)/);
  assert.match(emptySchemaQuery, /typ\.typtype IN \([^)]*'c'[^)]*\)/);
  assert.deepEqual(db.calls.map(({ sql }) => sql.trim().split(/\s+/)[0]), [
    'BEGIN',
    'SELECT',
    'SELECT',
    'ROLLBACK',
  ]);
});

test('bootstrap creates required tables and constraints with only synthetic records', async () => {
  const db = new RecordingDatabase();
  const result = await bootstrapPreviewSyntheticDatabase(db, {
    adminEmail: 'preview-admin@aq-preview.invalid',
    adminPassword: 'synthetic-test-password',
    hashPassword: async (password) => {
      assert.equal(password, 'synthetic-test-password');
      return 'synthetic-test-hash';
    },
  });

  assert.deepEqual(result, {
    users: 1,
    categories: 2,
    prompts: 3,
    promptCategories: 3,
    blogPosts: 0,
    oauthAuthorizations: 0,
    promptOwners: 0,
    draftAccessAssignments: 0,
    brokerTokens: 0,
    oauthClients: 0,
    brokerRefreshTokens: 0,
  });

  const createSql = db.calls
    .map(({ sql }) => sql)
    .filter((sql) => sql.includes('CREATE TABLE'))
    .join('\n');
  const statements = db.calls.map(({ sql }) => sql);
  assert.ok(
    statements.findIndex((sql) => sql.includes('CREATE TABLE categories'))
      < statements.findIndex((sql) => sql.includes('categories_library_type_name_lower_unique')),
    'category index must be created after its table',
  );
  assert.ok(
    statements.findIndex((sql) => sql.includes('CREATE TABLE users'))
      < statements.findIndex((sql) => sql.includes('users_email_lower_unique')),
    'user index must be created after its table',
  );
  for (const table of [
    'users',
    'categories',
    'prompts',
    'prompt_categories',
    'blog_posts',
    'mcp_oauth_authorizations',
    'mcp_prompt_owners',
    'mcp_prompt_draft_access',
    'mcp_oauth_broker_tokens',
    'mcp_oauth_clients',
    'mcp_oauth_broker_refresh_tokens',
  ]) {
    assert.match(createSql, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  for (const constraint of [
    'users_role_check',
    'prompts_status_check',
    'prompts_library_type_check',
    'prompts_primary_category_id_fkey',
    'prompt_categories_prompt_id_fkey',
    'prompt_categories_category_id_fkey',
    'mcp_oauth_authorizations_pkey',
    'mcp_oauth_authorizations_admin_user_id_fkey',
    'mcp_oauth_authorizations_permissions_updated_by_fkey',
    'mcp_prompt_owners_pkey',
    'mcp_prompt_owners_prompt_id_fkey',
    'mcp_prompt_draft_access_pkey',
    'mcp_prompt_draft_access_granted_by_fkey',
    'mcp_blog_post_owners_pkey',
    'mcp_blog_post_owners_post_id_fkey',
    'mcp_blog_post_draft_access_pkey',
    'mcp_blog_post_draft_access_post_id_fkey',
    'mcp_blog_post_draft_access_granted_by_fkey',
    'mcp_oauth_broker_tokens_pkey',
    'mcp_oauth_clients_pkey',
    'mcp_oauth_broker_refresh_tokens_pkey',
    'mcp_oauth_broker_refresh_tokens_client_id_fkey',
  ]) {
    assert.ok(createSql.includes(constraint), `missing ${constraint}`);
  }
  assert.match(createSql, /status IN \('draft', 'published'\)/);
  assert.match(createSql, /library_type IN \('photo', 'text'\)/);
  assert.match(createSql, /REFERENCES users\(id\) ON DELETE RESTRICT/);
  assert.ok(statements.some((sql) => sql.includes('mcp_oauth_authorizations_admin_user_idx')));
  assert.ok(statements.some((sql) => sql.includes('mcp_oauth_broker_tokens_expires_at_idx')));
  assert.ok(statements.some((sql) => sql.includes('mcp_oauth_clients_created_at_idx')));
  assert.ok(statements.some((sql) => sql.includes('mcp_oauth_broker_refresh_tokens_expires_at_idx')));
  assert.match(createSql, /REFERENCES prompts\(id\) ON DELETE CASCADE/);
  const draftAccessTable = createSql.match(
    /CREATE TABLE mcp_prompt_draft_access \([\s\S]*?\n {4}\)/,
  )?.[0];
  assert.ok(draftAccessTable);
  assert.equal(
    (draftAccessTable.match(/FOREIGN KEY \(prompt_id\) REFERENCES prompts\(id\) ON DELETE CASCADE/g) || []).length,
    1,
  );
  assert.equal(
    (draftAccessTable.match(/FOREIGN KEY \(granted_by\) REFERENCES users\(id\) ON DELETE RESTRICT/g) || []).length,
    1,
  );

  const promptInserts = db.calls.filter(({ sql }) => sql.includes('INSERT INTO prompts'));
  assert.deepEqual(promptInserts.map(({ values }) => values[2]), [
    'synthetic-preview-photo-prompt',
    'synthetic-preview-text-prompt',
    'synthetic-preview-legacy-draft',
  ]);
  assert.equal(promptInserts.filter(({ values }) => values[8] === 'published').length, 2);
  assert.equal(promptInserts.filter(({ values }) => values[8] === 'draft').length, 1);
  assert.equal(db.calls.some(({ sql }) => /INSERT INTO mcp_(oauth_authorizations|prompt_owners|prompt_draft_access)/.test(sql)), false);

  const source = await readFile(
    new URL('../scripts/bootstrap-preview-synthetic-db.mjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /prompts-index\.json|content[\\/]blog|migrate-prompts-to-db/);
});

test('bootstrap verification failure rolls back every schema and seed change', async () => {
  const db = new RecordingDatabase();
  db.verificationRow.owner_count = 1;

  await assert.rejects(
    bootstrapPreviewSyntheticDatabase(db, {
      adminEmail: 'preview-admin@aq-preview.invalid',
      adminPassword: 'synthetic-test-password',
      hashPassword: async () => 'synthetic-test-hash',
    }),
    /verification failed/,
  );
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(db.calls.some(({ sql }) => sql === 'COMMIT'), false);
});

test('MCP draft ownership is taken from the OAuth subject and assignment is required otherwise', async () => {
  const ownerCalls = [];
  await insertMcpPromptOwner({
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      ownerCalls.push({ sql, values });
      return { rowCount: 1, rows: [] };
    },
  }, 42, oauthUser);

  assert.deepEqual(ownerCalls[1].values, [42, oauthUser.subject]);
  assert.match(ownerCalls[1].sql, /INSERT INTO mcp_prompt_owners/);

  const assignmentClient = {
    async query(query) {
      const sql = typeof query === 'string' ? query : query.text;
      if (sql.includes('FROM prompts')) {
        return { rowCount: 1, rows: [{ status: 'draft' }] };
      }
      if (sql.includes('FROM mcp_prompt_owners')) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('FROM mcp_prompt_draft_access')) {
        return { rowCount: 1, rows: [{ prompt_id: 42 }] };
      }
      throw new Error('Unexpected mock query.');
    },
  };

  await lockMcpOAuthDraftAuthorization(assignmentClient, 42, 'text', oauthUser);
  await assert.rejects(
    lockMcpOAuthDraftAuthorization({
      async query(query) {
        const sql = typeof query === 'string' ? query : query.text;
        if (sql.includes('FROM prompts')) {
          return { rowCount: 1, rows: [{ status: 'draft' }] };
        }
        return { rowCount: 0, rows: [] };
      },
    }, 43, 'text', oauthUser),
    McpAuthorizationError,
  );
});
