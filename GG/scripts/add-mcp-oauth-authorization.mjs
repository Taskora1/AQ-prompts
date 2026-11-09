import {
  getPgPool,
  isDatabaseMigrationConnectionAllowed,
} from '../src/lib/db.js';

export async function applyMcpOAuthAuthorizationMigration(db) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  const ownsClient = client !== db;
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_authorizations (
        subject TEXT NOT NULL,
        client_id TEXT NOT NULL,
        admin_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        granted_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        can_publish BOOLEAN NOT NULL DEFAULT FALSE,
        can_upload_images BOOLEAN NOT NULL DEFAULT FALSE,
        can_publish_blog BOOLEAN NOT NULL DEFAULT FALSE,
        permissions_updated_by BIGINT,
        permissions_updated_at TIMESTAMPTZ,
        PRIMARY KEY (subject, client_id),
        CONSTRAINT mcp_oauth_authorizations_permissions_updated_by_fkey
          FOREIGN KEY (permissions_updated_by) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);
    await client.query(`
      ALTER TABLE mcp_oauth_authorizations
        ADD COLUMN IF NOT EXISTS admin_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS can_publish BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS can_upload_images BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS can_publish_blog BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS permissions_updated_by BIGINT REFERENCES users(id) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS permissions_updated_at TIMESTAMPTZ
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_constraint
          WHERE conname = 'mcp_oauth_authorizations_admin_user_id_fkey'
            AND conrelid = 'mcp_oauth_authorizations'::regclass
        ) THEN
          ALTER TABLE mcp_oauth_authorizations
            ADD CONSTRAINT mcp_oauth_authorizations_admin_user_id_fkey
            FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mcp_oauth_authorizations_admin_user_idx
      ON mcp_oauth_authorizations (admin_user_id)
      WHERE revoked_at IS NULL
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_prompt_owners (
        prompt_id BIGINT PRIMARY KEY REFERENCES prompts(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mcp_prompt_owners_subject_idx
      ON mcp_prompt_owners (subject, prompt_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_prompt_draft_access (
        prompt_id BIGINT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        granted_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        PRIMARY KEY (prompt_id, subject)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mcp_prompt_draft_access_subject_idx
      ON mcp_prompt_draft_access (subject, prompt_id)
      WHERE revoked_at IS NULL
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_blog_post_owners (
        post_id BIGINT PRIMARY KEY REFERENCES blog_posts(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mcp_blog_post_owners_subject_idx
      ON mcp_blog_post_owners (subject, post_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_blog_post_draft_access (
        post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        granted_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        PRIMARY KEY (post_id, subject)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mcp_blog_post_draft_access_subject_idx
      ON mcp_blog_post_draft_access (subject, post_id)
      WHERE revoked_at IS NULL
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
        client_id TEXT PRIMARY KEY,
        client_name TEXT,
        redirect_uri TEXT NOT NULL,
        refresh_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE mcp_oauth_clients
        ADD COLUMN IF NOT EXISTS refresh_enabled BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mcp_oauth_clients_created_at_idx
      ON mcp_oauth_clients (created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_broker_tokens (
        token_hash CHAR(64) PRIMARY KEY,
        subject TEXT NOT NULL,
        client_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mcp_oauth_broker_tokens_expires_at_idx
      ON mcp_oauth_broker_tokens (expires_at)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_oauth_broker_refresh_tokens (
        token_hash CHAR(64) PRIMARY KEY,
        subject TEXT NOT NULL,
        client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
        resource TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mcp_oauth_broker_refresh_tokens_expires_at_idx
      ON mcp_oauth_broker_refresh_tokens (expires_at)
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

async function main() {
  await applyMcpOAuthAuthorizationMigration(getPgPool());
  console.log('MCP OAuth authorization schema ready; existing prompt rows were not changed.');
}

if (isDatabaseMigrationConnectionAllowed('run-database-migration.mjs')) {
  main()
    .catch((error) => {
      const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
      console.error(`MCP OAuth authorization schema failed (${errorCode}): ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await getPgPool().end();
      } catch {
        // Pool may not exist if configuration failed before initialization.
      }
    });
}
