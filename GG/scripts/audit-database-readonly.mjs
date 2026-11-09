import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import pg from 'pg';

const { Pool } = pg;

const DATABASE_VARIABLES = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL'];
const RELEVANT_TABLES = [
  'prompts',
  'categories',
  'prompt_categories',
  'users',
  'auth_login_tokens',
  'activity_log',
  'customers',
  'subscriptions',
  'transactions',
  'newsletter_subscribers',
  'newsletter_subscriptions',
];
const PROMPT_COMPARE_FIELDS = [
  ['title', 'title'],
  ['prompt', 'prompt'],
  ['image', 'image'],
  ['images', 'images'],
  ['category', 'category'],
  ['categories', 'categories'],
  ['use_case', 'useCase'],
  ['tags', 'tags'],
  ['created_at', 'createdAt'],
  ['intro', 'intro'],
  ['unique_feature', 'uniqueFeature'],
  ['best_use_case', 'bestUseCase'],
  ['faqs', 'faqs'],
  ['status', 'status'],
  ['primary_category_id', 'primaryCategoryId'],
  ['meta_title', 'metaTitle'],
  ['meta_description', 'metaDescription'],
  ['og_image', 'ogImage'],
  ['related_prompt_ids', 'relatedPromptIds'],
];

function argument(name, fallback = '') {
  const prefix = `${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function fingerprint(value) {
  if (value === null || value === undefined || value === '') return null;
  return `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
}

function databaseEnvironment() {
  for (const name of DATABASE_VARIABLES) {
    if (process.env[name]) return { name, value: process.env[name] };
  }
  throw new Error(`One of ${DATABASE_VARIABLES.join(', ')} must be supplied explicitly.`);
}

function providerFor(hostname) {
  const host = hostname.toLowerCase();
  if (host.endsWith('.neon.tech')) return 'neon';
  if (host.endsWith('.supabase.co') || host.endsWith('.supabase.com')) return 'supabase';
  if (host.includes('amazonaws.com')) return 'aws';
  return 'other';
}

function endpointSuffix(hostname, port) {
  const labels = hostname.split('.').filter(Boolean);
  const suffix = labels.length >= 2 ? labels.slice(-2).join('.') : hostname;
  return `*.${suffix}${port ? `:${port}` : ''}`;
}

function normalizeScalar(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeJson(value) {
  return JSON.stringify(value ?? null);
}

async function tableExists(db, table) {
  const result = await db.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${table}`]);
  return result.rows[0].present;
}

async function tableCounts(db) {
  const counts = {};
  for (const table of RELEVANT_TABLES) {
    if (!(await tableExists(db, table))) {
      counts[table] = { exists: false, rows: null };
      continue;
    }
    const result = await db.query(`SELECT COUNT(*)::int AS count FROM public."${table}"`);
    counts[table] = { exists: true, rows: result.rows[0].count };
  }
  return counts;
}

async function tableTimestampSummaries(db) {
  const summaries = {};
  for (const table of RELEVANT_TABLES) {
    if (!(await tableExists(db, table))) continue;
    const columns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND data_type IN ('timestamp with time zone', 'timestamp without time zone', 'date')
      ORDER BY ordinal_position
    `, [table]);
    if (columns.rowCount === 0) continue;
    const projections = columns.rows.flatMap(({ column_name: column }) => {
      const safeColumn = column.replaceAll('"', '""');
      return [
        `MIN("${safeColumn}")::text AS "${safeColumn}_min"`,
        `MAX("${safeColumn}")::text AS "${safeColumn}_max"`,
      ];
    });
    const result = await db.query(`SELECT ${projections.join(', ')} FROM public."${table}"`);
    summaries[table] = result.rows[0];
  }
  return summaries;
}

async function comparePrompts(db) {
  const file = path.join(process.cwd(), 'public', 'data', 'prompts-index.json');
  const source = JSON.parse(await fs.readFile(file, 'utf8')).prompts || [];
  const result = await db.query(`
    SELECT
      slug, title, prompt, image, images, category, categories, use_case,
      tags, created_at::text, intro, unique_feature, best_use_case, faqs,
      status, primary_category_id, meta_title, meta_description, og_image,
      related_prompt_ids
    FROM public.prompts
    ORDER BY slug
  `);
  const sourceBySlug = new Map(source.map((row) => [String(row.slug || ''), row]));
  const databaseBySlug = new Map(result.rows.map((row) => [String(row.slug || ''), row]));
  const differences = Object.fromEntries(PROMPT_COMPARE_FIELDS.map(([column]) => [column, 0]));

  for (const [slug, databaseRow] of databaseBySlug) {
    const sourceRow = sourceBySlug.get(slug);
    if (!sourceRow) continue;
    for (const [column, sourceKey] of PROMPT_COMPARE_FIELDS) {
      const databaseValue = databaseRow[column];
      const sourceValue = sourceRow[sourceKey];
      const isJson = ['images', 'categories', 'tags', 'faqs', 'related_prompt_ids'].includes(column);
      const left = isJson ? normalizeJson(databaseValue) : normalizeScalar(databaseValue);
      const right = isJson ? normalizeJson(Array.isArray(sourceValue) ? sourceValue : []) : normalizeScalar(sourceValue);
      if (left !== right) differences[column] += 1;
    }
  }

  return {
    bundledRows: source.length,
    databaseRows: result.rowCount,
    missingFromDatabase: [...sourceBySlug.keys()].filter((slug) => !databaseBySlug.has(slug)).length,
    extraInDatabase: [...databaseBySlug.keys()].filter((slug) => !sourceBySlug.has(slug)).length,
    differingRowsByField: differences,
  };
}

async function main() {
  const label = argument('--label', 'database');
  const selected = databaseEnvironment();
  const parsed = new URL(selected.value);
  const pool = new Pool({
    connectionString: selected.value,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    max: 1,
  });
  const db = await pool.connect();

  try {
    await db.query('BEGIN TRANSACTION READ ONLY');
    const readOnly = await db.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'on') {
      throw new Error('Database session is not read-only; refusing to audit.');
    }

    const identity = await db.query(`
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        inet_server_addr()::text AS server_address,
        current_schema() AS current_schema,
        current_setting('server_version') AS server_version,
        version() AS server_build
    `);
    const schemas = await db.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT LIKE 'pg_%'
        AND schema_name <> 'information_schema'
      ORDER BY schema_name
    `);
    const tables = await db.query(`
      SELECT
        schemaname AS schema_name,
        tablename AS table_name,
        tableowner AS table_owner
      FROM pg_catalog.pg_tables
      WHERE schemaname NOT LIKE 'pg_%'
        AND schemaname <> 'information_schema'
      ORDER BY schemaname, tablename
    `);
    const migrationTables = tables.rows
      .filter((row) => /migration|schema|version/i.test(row.table_name))
      .map((row) => `${row.schema_name}.${row.table_name}`);
    const columns = await db.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('prompts', 'categories', 'prompt_categories')
      ORDER BY table_name, ordinal_position
    `);
    const indexes = await db.query(`
      SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
      FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('prompts', 'categories', 'prompt_categories')
      ORDER BY tablename, indexname
    `);
    const constraints = await db.query(`
      SELECT
        rel.relname AS table_name,
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public'
        AND rel.relname IN ('prompts', 'categories', 'prompt_categories')
      ORDER BY rel.relname, con.conname
    `);
    const promptSummary = await db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
        MIN(id)::text AS min_id,
        MAX(id)::text AS max_id,
        MIN(updated_at)::text AS earliest_updated_at,
        MAX(updated_at)::text AS latest_updated_at,
        COUNT(DISTINCT updated_at)::int AS distinct_updated_timestamps
      FROM public.prompts
    `);
    const promptTimestampGroups = await db.query(`
      SELECT updated_at::text AS updated_at, COUNT(*)::int AS rows
      FROM public.prompts
      GROUP BY updated_at
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    const categorySummary = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM public.categories) AS categories,
        (SELECT COUNT(*)::int FROM public.prompt_categories) AS assignments,
        (SELECT COUNT(*)::int FROM public.prompts WHERE primary_category_id IS NOT NULL) AS primary_assignments
    `);
    const relationStats = await db.query(`
      SELECT
        relname AS table_name,
        n_live_tup::bigint AS estimated_live_rows,
        n_tup_ins::bigint AS inserts_since_stats_reset,
        n_tup_upd::bigint AS updates_since_stats_reset,
        n_tup_del::bigint AS deletes_since_stats_reset,
        last_analyze::text,
        last_autoanalyze::text
      FROM pg_catalog.pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY relname
    `);
    const role = await db.query(`
      SELECT rolsuper, rolcreaterole, rolcreatedb, rolcanlogin
      FROM pg_catalog.pg_roles
      WHERE rolname = current_user
    `);
    const privileges = await db.query(`
      SELECT table_name, grantee, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, grantee, privilege_type
    `, [RELEVANT_TABLES]);

    const report = {
      generatedAt: new Date().toISOString(),
      label,
      enforcedReadOnly: true,
      selectedVariable: selected.name,
      connectionFingerprint: fingerprint(selected.value),
      hostnameFingerprint: fingerprint(parsed.hostname.toLowerCase()),
      databaseNameFingerprint: fingerprint(decodeURIComponent(parsed.pathname.replace(/^\//, ''))),
      usernameFingerprint: fingerprint(decodeURIComponent(parsed.username)),
      provider: providerFor(parsed.hostname),
      endpointSuffix: endpointSuffix(parsed.hostname, parsed.port || '5432'),
      server: {
        databaseNameFingerprint: fingerprint(identity.rows[0].database_name),
        usernameFingerprint: fingerprint(identity.rows[0].database_user),
        addressFingerprint: fingerprint(identity.rows[0].server_address),
        currentSchema: identity.rows[0].current_schema,
        version: identity.rows[0].server_version,
        buildFamily: String(identity.rows[0].server_build).split(' on ')[0],
      },
      currentRoleCapabilities: role.rows[0] || null,
      schemas: schemas.rows.map((row) => row.schema_name),
      tables: tables.rows.map((row) => ({
        schema: row.schema_name,
        name: row.table_name,
        ownerFingerprint: fingerprint(row.table_owner),
      })),
      migrationHistoryTables: migrationTables,
      tableCounts: await tableCounts(db),
      tableTimestampSummaries: await tableTimestampSummaries(db),
      tablePrivileges: privileges.rows.map((row) => ({
        table: row.table_name,
        granteeFingerprint: fingerprint(row.grantee),
        privilege: row.privilege_type,
      })),
      promptSummary: promptSummary.rows[0],
      promptTimestampGroups: promptTimestampGroups.rows,
      categorySummary: categorySummary.rows[0],
      promptSeedComparison: await comparePrompts(db),
      affectedTableColumns: columns.rows,
      affectedTableIndexes: indexes.rows,
      affectedTableConstraints: constraints.rows,
      relationStatistics: relationStats.rows,
      ddlModificationTimestampsAvailable: false,
      historicalRowSnapshotsAvailable: false,
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.query('ROLLBACK').catch(() => {});
    db.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[database-readonly-audit] ${error.code || 'ERROR'}: ${error.message}`);
  process.exitCode = 1;
});
