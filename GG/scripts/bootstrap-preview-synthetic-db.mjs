import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fingerprintDatabaseUrl,
  KNOWN_PRODUCTION_IDENTITY,
} from './lib/database-migration-safety.mjs';
import {
  getDatabaseUrl,
  getPgPool,
  isDatabaseMigrationConnectionAllowed,
} from '../src/lib/db.js';
import { hashAdminPassword } from '../src/lib/admin-password.js';
import { PREVIEW_SYNTHETIC_PROMPT } from '../src/lib/preview-prompt-fixture.js';
import { getPromptEligibilityFlags } from '../src/lib/prompts-db.js';
import { isIndexablePrompt } from '../src/lib/prompt-constants.js';

const SYNTHETIC_PROMPTS = [
  {
    ...PREVIEW_SYNTHETIC_PROMPT,
  },
  {
    title: 'Synthetic Preview Text Prompt',
    prompt: 'Draft a concise synthetic example about organizing a small creative project.',
    slug: 'synthetic-preview-text-prompt',
    category: 'Lifestyle',
    libraryType: 'text',
    status: 'published',
  },
  {
    title: 'Synthetic Preview Legacy Draft',
    prompt: 'Keep this synthetic draft inaccessible until an administrator assigns access.',
    slug: 'synthetic-preview-legacy-draft',
    category: 'Lifestyle',
    libraryType: 'text',
    status: 'draft',
  },
];

const REQUIRED_CONSTRAINTS = [
  'users_pkey',
  'users_role_check',
  'categories_pkey',
  'categories_library_type_check',
  'categories_public_route_slug_key',
  'prompts_pkey',
  'prompts_slug_key',
  'prompts_status_check',
  'prompts_library_type_check',
  'prompts_primary_category_id_fkey',
  'prompts_images_array_check',
  'prompts_categories_array_check',
  'prompts_tags_array_check',
  'prompts_faqs_array_check',
  'prompt_categories_pkey',
  'prompt_categories_prompt_id_fkey',
  'prompt_categories_category_id_fkey',
  'blog_posts_pkey',
  'blog_posts_slug_key',
  'blog_posts_status_check',
  'author_profiles_pkey',
  'author_profiles_slug_key',
  'author_profiles_social_links_array_check',
  'mcp_oauth_authorizations_pkey',
  'mcp_oauth_authorizations_admin_user_id_fkey',
  'mcp_oauth_authorizations_granted_by_fkey',
  'mcp_oauth_authorizations_permissions_updated_by_fkey',
  'mcp_blog_post_owners_pkey',
  'mcp_blog_post_owners_post_id_fkey',
  'mcp_blog_post_draft_access_pkey',
  'mcp_blog_post_draft_access_post_id_fkey',
  'mcp_blog_post_draft_access_granted_by_fkey',
  'mcp_oauth_broker_tokens_pkey',
  'mcp_oauth_clients_pkey',
  'mcp_oauth_broker_refresh_tokens_pkey',
  'mcp_oauth_broker_refresh_tokens_client_id_fkey',
  'mcp_prompt_owners_pkey',
  'mcp_prompt_owners_prompt_id_fkey',
  'mcp_prompt_draft_access_pkey',
  'mcp_prompt_draft_access_prompt_id_fkey',
  'mcp_prompt_draft_access_granted_by_fkey',
];
const REQUIRED_INDEXES = [
  'users_email_lower_unique',
  'categories_library_type_slug_unique',
  'categories_library_type_name_lower_unique',
  'idx_blog_posts_slug',
  'author_profiles_slug_key',
  'mcp_oauth_authorizations_admin_user_idx',
  'mcp_oauth_broker_tokens_expires_at_idx',
  'mcp_oauth_clients_created_at_idx',
  'mcp_oauth_broker_refresh_tokens_expires_at_idx',
];

const CREATE_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ,
      CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'admin'))
    )
  `,
  'CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email))',
  `
    CREATE TABLE categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      library_type TEXT NOT NULL DEFAULT 'photo'
        CONSTRAINT categories_library_type_check CHECK (library_type IN ('photo', 'text')),
      public_route_slug TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  'CREATE UNIQUE INDEX categories_library_type_slug_unique ON categories (library_type, slug)',
  'CREATE UNIQUE INDEX categories_library_type_name_lower_unique ON categories (library_type, LOWER(name))',
  `
    CREATE TABLE prompts (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      image TEXT,
      images JSONB NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT prompts_images_array_check CHECK (jsonb_typeof(images) = 'array'),
      category TEXT,
      categories JSONB NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT prompts_categories_array_check CHECK (jsonb_typeof(categories) = 'array'),
      use_case TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT prompts_tags_array_check CHECK (jsonb_typeof(tags) = 'array'),
      created_at DATE,
      intro TEXT,
      unique_feature TEXT,
      best_use_case TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'draft'
        CONSTRAINT prompts_status_check CHECK (status IN ('draft', 'published')),
      primary_category_id BIGINT,
      library_type TEXT NOT NULL DEFAULT 'photo'
        CONSTRAINT prompts_library_type_check CHECK (library_type IN ('photo', 'text')),
      should_noindex BOOLEAN NOT NULL DEFAULT false,
      is_public_eligible BOOLEAN NOT NULL DEFAULT false,
      meta_title TEXT,
      meta_description TEXT,
      og_image TEXT,
      related_prompt_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      faqs JSONB NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT prompts_faqs_array_check CHECK (jsonb_typeof(faqs) = 'array'),
      prompt_breakdown JSONB,
      prompt_specific_troubleshooting JSONB,
      customization_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
      recommended_aspect_ratio TEXT,
      aspect_ratio_reason TEXT,
      reviewed_at DATE,
      generation_tested BOOLEAN NOT NULL DEFAULT false,
      generation_tested_date DATE,
      generation_tested_tool TEXT,
      image_alt_texts JSONB NOT NULL DEFAULT '{}'::jsonb,
      variations JSONB NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT prompts_variations_array_check CHECK (jsonb_typeof(variations) = 'array'),
      recommended_tool TEXT,
      tool_note TEXT,
      how_to_use JSONB NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT prompts_how_to_use_array_check CHECK (jsonb_typeof(how_to_use) = 'array'),
      tools JSONB NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT prompts_tools_array_check CHECK (jsonb_typeof(tools) = 'array'),
      CONSTRAINT prompts_primary_category_id_fkey
        FOREIGN KEY (primary_category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT
    )
  `,
  'CREATE INDEX prompts_category_idx ON prompts (category)',
  'CREATE INDEX prompts_created_at_idx ON prompts (created_at DESC)',
  `
    CREATE OR REPLACE FUNCTION set_prompts_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `,
  `
    CREATE TRIGGER prompts_set_updated_at
    BEFORE UPDATE ON prompts
    FOR EACH ROW
    EXECUTE FUNCTION set_prompts_updated_at()
  `,
  `
    CREATE TABLE prompt_categories (
      prompt_id BIGINT NOT NULL,
      category_id BIGINT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT prompt_categories_pkey PRIMARY KEY (prompt_id, category_id),
      CONSTRAINT prompt_categories_prompt_id_fkey
        FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
      CONSTRAINT prompt_categories_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    )
  `,
  'CREATE INDEX prompt_categories_category_id_idx ON prompt_categories (category_id)',
  `
    CREATE TABLE blog_posts (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(255) UNIQUE NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT DEFAULT '',
      content TEXT DEFAULT '',
      content_html TEXT DEFAULT '',
      content_text TEXT DEFAULT '',
      featured_image TEXT DEFAULT '',
      featured_image_alt TEXT DEFAULT '',
      author TEXT DEFAULT 'Preview Synthetic Author',
      author_meta JSONB DEFAULT NULL,
      category TEXT DEFAULT 'Preview Synthetic',
      tags JSONB DEFAULT '[]'::jsonb,
      status VARCHAR(20) DEFAULT 'draft'
        CONSTRAINT blog_posts_status_check CHECK (status IN ('draft', 'published')),
      featured BOOLEAN DEFAULT false,
      publish_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      reading_time INTEGER DEFAULT 5,
      seo_title TEXT DEFAULT '',
      seo_description TEXT DEFAULT '',
      canonical_url TEXT DEFAULT '',
      og_image TEXT DEFAULT '',
      og_image_alt TEXT DEFAULT '',
      faqs JSONB DEFAULT '[]'::jsonb,
      toc JSONB DEFAULT '[]'::jsonb,
      meta JSONB DEFAULT '{}'::jsonb,
      keywords TEXT DEFAULT ''
    )
  `,
  'CREATE INDEX idx_blog_posts_status ON blog_posts(status)',
  'CREATE INDEX idx_blog_posts_slug ON blog_posts(slug)',
  'CREATE INDEX idx_blog_posts_publish_date ON blog_posts(publish_date)',
  'CREATE INDEX idx_blog_posts_category ON blog_posts(category)',
  `
    CREATE TABLE author_profiles (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role_title TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      social_links JSONB NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT author_profiles_social_links_array_check
        CHECK (jsonb_typeof(social_links) = 'array'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE mcp_oauth_authorizations (
      subject TEXT NOT NULL,
      client_id TEXT NOT NULL,
      admin_user_id BIGINT,
      granted_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      can_publish BOOLEAN NOT NULL DEFAULT FALSE,
      can_upload_images BOOLEAN NOT NULL DEFAULT FALSE,
      permissions_updated_by BIGINT,
      permissions_updated_at TIMESTAMPTZ,
      CONSTRAINT mcp_oauth_authorizations_pkey PRIMARY KEY (subject, client_id),
      CONSTRAINT mcp_oauth_authorizations_admin_user_id_fkey
        FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT mcp_oauth_authorizations_permissions_updated_by_fkey
        FOREIGN KEY (permissions_updated_by) REFERENCES users(id) ON DELETE RESTRICT
    )
  `,
  `CREATE INDEX mcp_oauth_authorizations_admin_user_idx
   ON mcp_oauth_authorizations (admin_user_id)
   WHERE revoked_at IS NULL`,
  `
    CREATE TABLE mcp_prompt_owners (
      prompt_id BIGINT NOT NULL,
      subject TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mcp_prompt_owners_pkey PRIMARY KEY (prompt_id),
      CONSTRAINT mcp_prompt_owners_prompt_id_fkey
        FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
    )
  `,
  'CREATE INDEX mcp_prompt_owners_subject_idx ON mcp_prompt_owners (subject, prompt_id)',
  `
    CREATE TABLE mcp_prompt_draft_access (
      prompt_id BIGINT NOT NULL,
      subject TEXT NOT NULL,
      granted_by BIGINT NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT mcp_prompt_draft_access_pkey PRIMARY KEY (prompt_id, subject),
      CONSTRAINT mcp_prompt_draft_access_prompt_id_fkey
        FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
      CONSTRAINT mcp_prompt_draft_access_granted_by_fkey
        FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE RESTRICT
    )
  `,
  `
    CREATE TABLE mcp_blog_post_owners (
      post_id BIGINT NOT NULL,
      subject TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mcp_blog_post_owners_pkey PRIMARY KEY (post_id),
      CONSTRAINT mcp_blog_post_owners_post_id_fkey
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
    )
  `,
  'CREATE INDEX mcp_blog_post_owners_subject_idx ON mcp_blog_post_owners (subject, post_id)',
  `
    CREATE TABLE mcp_blog_post_draft_access (
      post_id BIGINT NOT NULL,
      subject TEXT NOT NULL,
      granted_by BIGINT NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT mcp_blog_post_draft_access_pkey PRIMARY KEY (post_id, subject),
      CONSTRAINT mcp_blog_post_draft_access_post_id_fkey
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
      CONSTRAINT mcp_blog_post_draft_access_granted_by_fkey
        FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE RESTRICT
    )
  `,
  `
    CREATE INDEX mcp_blog_post_draft_access_subject_idx
    ON mcp_blog_post_draft_access (subject, post_id)
    WHERE revoked_at IS NULL
  `,
  `
    CREATE INDEX mcp_prompt_draft_access_subject_idx
    ON mcp_prompt_draft_access (subject, prompt_id)
    WHERE revoked_at IS NULL
  `,
  `
    CREATE TABLE mcp_oauth_clients (
      client_id TEXT NOT NULL,
      client_name TEXT,
      redirect_uri TEXT NOT NULL,
      refresh_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mcp_oauth_clients_pkey PRIMARY KEY (client_id)
    )
  `,
  'CREATE INDEX mcp_oauth_clients_created_at_idx ON mcp_oauth_clients (created_at DESC)',
  `
    CREATE TABLE mcp_oauth_broker_refresh_tokens (
      token_hash CHAR(64) NOT NULL,
      subject TEXT NOT NULL,
      client_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mcp_oauth_broker_refresh_tokens_pkey PRIMARY KEY (token_hash),
      CONSTRAINT mcp_oauth_broker_refresh_tokens_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE
    )
  `,
  'CREATE INDEX mcp_oauth_broker_refresh_tokens_expires_at_idx ON mcp_oauth_broker_refresh_tokens (expires_at)',
  `
    CREATE TABLE mcp_oauth_broker_tokens (
      token_hash CHAR(64) NOT NULL,
      subject TEXT NOT NULL,
      client_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mcp_oauth_broker_tokens_pkey PRIMARY KEY (token_hash)
    )
  `,
  'CREATE INDEX mcp_oauth_broker_tokens_expires_at_idx ON mcp_oauth_broker_tokens (expires_at)',
];

function validateAdminCredentials(adminEmail, adminPassword) {
  const email = String(adminEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@aq-preview\.invalid$/.test(email)) {
    throw new Error('ADMIN_EMAIL must use the reserved aq-preview.invalid domain.');
  }
  if (typeof adminPassword !== 'string' || adminPassword.length < 16) {
    throw new Error('ADMIN_PASSWORD must contain at least 16 characters.');
  }
  return email;
}

export function validatePreviewBootstrapDatabaseUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Preview database URL is invalid.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !parsed.hostname
    || !parsed.username
    || !parsed.password
    || !decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  ) {
    throw new Error('Preview database URL is missing required PostgreSQL identity components.');
  }

  const identity = fingerprintDatabaseUrl(databaseUrl);
  if (identity.provider !== 'neon') {
    throw new Error('Synthetic bootstrap is restricted to a Neon Preview database.');
  }
  if (
    identity.hostnameFingerprint === KNOWN_PRODUCTION_IDENTITY.hostnameFingerprint
    && identity.databaseNameFingerprint === KNOWN_PRODUCTION_IDENTITY.databaseNameFingerprint
  ) {
    throw new Error('Synthetic bootstrap refuses the registered Production database identity.');
  }
  return identity;
}

async function assertEmptyPublicSchema(client) {
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*)::int
       FROM pg_catalog.pg_class rel
       JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'c')) AS relations,
      (SELECT COUNT(*)::int
       FROM pg_catalog.pg_proc proc
       JOIN pg_catalog.pg_namespace ns ON ns.oid = proc.pronamespace
       WHERE ns.nspname = 'public') AS routines,
      (SELECT COUNT(*)::int
       FROM pg_catalog.pg_type typ
       JOIN pg_catalog.pg_namespace ns ON ns.oid = typ.typnamespace
       WHERE ns.nspname = 'public'
         AND typ.typtype IN ('d', 'e', 'r', 'c')) AS custom_types
  `);
  const row = result.rows[0];
  if (!row || Number(row.relations) !== 0 || Number(row.routines) !== 0 || Number(row.custom_types) !== 0) {
    throw new Error('Preview bootstrap requires an empty public schema; no changes were applied.');
  }
}

async function verifyBootstrap(client) {
  const result = await client.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM pg_catalog.pg_class rel
         JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
         WHERE ns.nspname = 'public' AND rel.relkind = 'r') AS table_count,
        (SELECT COUNT(*)::int FROM pg_catalog.pg_constraint
         WHERE connamespace = 'public'::regnamespace
           AND conname = ANY($1::text[])) AS constraint_count,
        (SELECT COUNT(*)::int FROM pg_catalog.pg_indexes
         WHERE schemaname = 'public'
           AND indexname = ANY($2::text[])) AS required_index_count,
        (SELECT COUNT(*)::int FROM users) AS user_count,
        (SELECT COUNT(*)::int FROM categories) AS category_count,
        (SELECT COUNT(*)::int FROM prompts
         WHERE slug = ANY($3::text[])) AS synthetic_prompt_count,
        (SELECT COUNT(*)::int FROM prompt_categories) AS prompt_category_count,
        (SELECT COUNT(*)::int FROM blog_posts) AS blog_post_count,
        (SELECT COUNT(*)::int FROM mcp_oauth_authorizations) AS authorization_count,
        (SELECT COUNT(*)::int FROM mcp_prompt_owners) AS owner_count,
        (SELECT COUNT(*)::int FROM mcp_prompt_draft_access) AS draft_access_count,
        (SELECT COUNT(*)::int FROM mcp_blog_post_owners) AS blog_owner_count,
        (SELECT COUNT(*)::int FROM mcp_blog_post_draft_access) AS blog_draft_access_count,
        (SELECT COUNT(*)::int FROM mcp_oauth_broker_tokens) AS broker_token_count,
        (SELECT COUNT(*)::int FROM mcp_oauth_clients) AS oauth_client_count,
        (SELECT COUNT(*)::int FROM mcp_oauth_broker_refresh_tokens) AS broker_refresh_token_count
    `,
    [
      REQUIRED_CONSTRAINTS,
      REQUIRED_INDEXES,
      SYNTHETIC_PROMPTS.map(({ slug }) => slug),
    ],
  );
  const row = result.rows[0];
  const expected = {
    table_count: 14,
    constraint_count: REQUIRED_CONSTRAINTS.length,
    required_index_count: REQUIRED_INDEXES.length,
    user_count: 1,
    category_count: 2,
    synthetic_prompt_count: SYNTHETIC_PROMPTS.length,
    prompt_category_count: SYNTHETIC_PROMPTS.length,
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
  if (!row || Object.entries(expected).some(([key, value]) => Number(row[key]) !== value)) {
    throw new Error('Preview bootstrap verification failed; the transaction was rolled back.');
  }
}

export async function bootstrapPreviewSyntheticDatabase(db, {
  adminEmail,
  adminPassword,
  hashPassword = hashAdminPassword,
} = {}) {
  const email = validateAdminCredentials(adminEmail, adminPassword);
  const passwordHash = await hashPassword(adminPassword);
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  const ownsClient = client !== db;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(711305, 260117)');
    await assertEmptyPublicSchema(client);

    for (const statement of CREATE_SCHEMA_STATEMENTS) {
      await client.query(statement);
    }

    const user = await client.query(
      `
        INSERT INTO users (email, password_hash, role)
        VALUES ($1, $2, 'super_admin')
        RETURNING id
      `,
      [email, passwordHash],
    );
    if (user.rowCount !== 1) throw new Error('Synthetic Preview admin creation failed.');

    const categories = await client.query(
      `
        INSERT INTO categories (name, slug, library_type)
        VALUES ('Lifestyle', 'lifestyle', 'photo'), ('Lifestyle', 'lifestyle', 'text')
        RETURNING id, library_type
      `,
    );
    if (categories.rowCount !== 2) throw new Error('Synthetic Preview category creation failed.');

    for (const prompt of SYNTHETIC_PROMPTS) {
      const category = categories.rows.find((item) => item.library_type === prompt.libraryType);
      if (!category) throw new Error(`Synthetic Preview ${prompt.libraryType} category is missing.`);
      const eligibility = prompt.libraryType === 'photo'
        ? getPromptEligibilityFlags(prompt)
        : { isPublicEligible: isIndexablePrompt(prompt) };
      await client.query(
        `
          INSERT INTO prompts (
            title, prompt, slug, category, categories, use_case, tags, created_at, intro,
            status, primary_category_id, library_type, should_noindex, image,
            is_public_eligible
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, CURRENT_DATE, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          prompt.title,
          prompt.prompt,
          prompt.slug,
          prompt.category,
          JSON.stringify([prompt.category]),
          'Synthetic Preview integration testing',
          JSON.stringify(['synthetic', 'preview']),
          'Synthetic-only Preview fixture.',
          prompt.status,
          category.id,
          prompt.libraryType,
          prompt.status !== 'published',
          prompt.image || null,
          eligibility.isPublicEligible,
        ],
      );
      await client.query(
        `
          INSERT INTO prompt_categories (prompt_id, category_id, position)
          SELECT id, $1, 0 FROM prompts WHERE slug = $2
        `,
        [category.id, prompt.slug],
      );
    }

    await verifyBootstrap(client);
    await client.query('COMMIT');
    return {
      users: 1,
      categories: 2,
      prompts: SYNTHETIC_PROMPTS.length,
      promptCategories: SYNTHETIC_PROMPTS.length,
      blogPosts: 0,
      oauthAuthorizations: 0,
      promptOwners: 0,
      draftAccessAssignments: 0,
      brokerTokens: 0,
      oauthClients: 0,
      brokerRefreshTokens: 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

async function main() {
  if (
    process.env.VERCEL_ENV !== 'preview'
    || process.env.PREVIEW_DATABASE_MODE !== 'staging'
  ) {
    throw new Error('Synthetic database bootstrap requires explicit Preview staging mode.');
  }
  validatePreviewBootstrapDatabaseUrl(getDatabaseUrl());

  await bootstrapPreviewSyntheticDatabase(getPgPool(), {
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
  });
  console.log('Synthetic Preview database bootstrap completed; no OAuth user/client was authorized.');
}

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation && !isDatabaseMigrationConnectionAllowed()) {
  console.error('Direct bootstrap execution is blocked; use the guarded Preview migration runner.');
  process.exitCode = 1;
} else if (isDatabaseMigrationConnectionAllowed('run-database-migration.mjs')) {
  main().catch((error) => {
    const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`Synthetic Preview database bootstrap failed (${errorCode}).`);
    process.exitCode = 1;
  }).finally(async () => {
    try {
      await getPgPool().end();
    } catch {
      // No pool exists if configuration failed before initialization.
    }
  });
}
