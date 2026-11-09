const CATEGORY_SEED = [
  { name: 'Business Portraits', slug: 'business', publicRouteSlug: 'business' },
  { name: 'Celebrations', slug: 'celebrations', publicRouteSlug: 'celebrations' },
  { name: 'Cinematic', slug: 'cinematic', publicRouteSlug: 'cinematic' },
  { name: 'Couples', slug: 'couples', publicRouteSlug: 'couples' },
  { name: 'Female Portraits', slug: 'girls', publicRouteSlug: 'girls' },
  { name: 'Lifestyle Portraits', slug: 'lifestyle', publicRouteSlug: 'lifestyle' },
  { name: 'Male Portraits', slug: 'boys', publicRouteSlug: 'boys' },
  { name: 'Photo Editing Prompts', slug: 'photo-editing', publicRouteSlug: 'photo-editing' },
  { name: 'Birthday Portraits', slug: 'birthday-portraits', publicRouteSlug: null },
  { name: 'Executive Corporate', slug: 'executive-corporate', publicRouteSlug: null },
  { name: 'Female Portrait Prompts', slug: 'female-portrait-prompts', publicRouteSlug: null },
  { name: 'Luxury Fashion Editorial', slug: 'luxury-fashion-editorial', publicRouteSlug: null },
  { name: 'Male Portrait Prompts', slug: 'male-portrait-prompts', publicRouteSlug: null },
  {
    name: 'Minimalist Commercial Portrait',
    slug: 'minimalist-commercial-portrait',
    publicRouteSlug: null,
  },
];

const SOURCE_TO_SLUG = new Map([
  ['business portraits', 'business'],
  ['celebrations', 'celebrations'],
  ['cinematic', 'cinematic'],
  ['couples', 'couples'],
  ['female portraits', 'girls'],
  ['women', 'girls'],
  ['woman', 'girls'],
  ['girls', 'girls'],
  ['lifestyle portraits', 'lifestyle'],
  ['boys', 'boys'],
  ['men', 'boys'],
  ['man', 'boys'],
  ['male portraits', 'boys'],
  ['photo editing prompts', 'photo-editing'],
  ['birthday portraits', 'birthday-portraits'],
  ['executive corporate', 'executive-corporate'],
  ['female portrait prompts', 'female-portrait-prompts'],
  ['luxury fashion editorial', 'luxury-fashion-editorial'],
  ['male portrait prompts', 'male-portrait-prompts'],
  ['minimalist commercial portrait', 'minimalist-commercial-portrait'],
]);

const INFERRED_CATEGORY_RULES = [
  { slug: 'photo-editing', pattern: /\b(edit|editing|edited|restore|restoration|double exposure|color grade|retouch|manipulation|photoshop)\b/i },
  { slug: 'business', pattern: /\b(business|corporate|executive|professional|linkedin|founder|entrepreneur|office|headshot)\b/i },
  { slug: 'cinematic', pattern: /\b(cinematic|film|movie|noir|dramatic lighting|neon|cyberpunk|trailer)\b/i },
  { slug: 'celebrations', pattern: /\b(birthday|celebration|celebrate|graduation|wedding|anniversary|eid|festival|party)\b/i },
  { slug: 'couples', pattern: /\b(couple|couples|romantic|engagement|bride|groom|husband|wife|boyfriend|girlfriend)\b/i },
  { slug: 'lifestyle', pattern: /\b(lifestyle|cafe|café|travel|beach|balcony|street walk|vacation|city walk)\b/i },
  { slug: 'girls', pattern: /\b(woman|women|girl|female|feminine|beauty|makeup|dress|saree|kurta)\b/i },
  { slug: 'boys', pattern: /\b(man|men|boy|male|masculine|menswear|suit|streetwear|beard|gentleman)\b/i },
];

function clean(value) {
  return String(value ?? '').trim();
}

function splitValues(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => clean(item).split(','))
    .map(clean)
    .filter(Boolean);
}

function mappedSlug(value) {
  return SOURCE_TO_SLUG.get(clean(value).toLowerCase()) || null;
}

let getPgPool;

async function ensureSchema(db) {
  await db.query('ALTER TABLE prompts ADD COLUMN IF NOT EXISTS status TEXT');
  await db.query("UPDATE prompts SET status = 'published' WHERE status IS NULL");
  await db.query("ALTER TABLE prompts ALTER COLUMN status SET DEFAULT 'draft'");
  await db.query('ALTER TABLE prompts ALTER COLUMN status SET NOT NULL');

  const statusConstraint = await db.query(`
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prompts_status_check'
      AND conrelid = 'prompts'::regclass
  `);
  if (statusConstraint.rowCount === 0) {
    await db.query(`
      ALTER TABLE prompts
      ADD CONSTRAINT prompts_status_check
      CHECK (status IN ('draft', 'published'))
    `);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      public_route_slug TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'categories'
          AND column_name = 'library_type'
      ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS categories_library_type_name_lower_unique
        ON categories (library_type, LOWER(name));
      ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_unique
        ON categories (LOWER(name));
      END IF;
    END
    $$
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS prompt_categories (
      prompt_id BIGINT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (prompt_id, category_id)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS prompt_categories_category_id_idx
    ON prompt_categories (category_id)
  `);

  await db.query('ALTER TABLE prompts ADD COLUMN IF NOT EXISTS primary_category_id BIGINT');

  const primaryForeignKey = await db.query(`
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prompts_primary_category_id_fkey'
      AND conrelid = 'prompts'::regclass
  `);
  if (primaryForeignKey.rowCount === 0) {
    await db.query(`
      ALTER TABLE prompts
      ADD CONSTRAINT prompts_primary_category_id_fkey
      FOREIGN KEY (primary_category_id)
      REFERENCES categories(id)
      ON DELETE RESTRICT
    `);
  }
}

async function categoryLibraryTypeExists(db) {
  const result = await db.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'categories'
      AND column_name = 'library_type'
  `);
  return result.rowCount > 0;
}

async function seedCategories(db, hasLibraryType) {
  for (const category of CATEGORY_SEED) {
    await db.query(
      hasLibraryType
        ? `
          INSERT INTO categories (name, slug, public_route_slug, library_type)
          VALUES ($1, $2, $3, 'photo')
          ON CONFLICT (library_type, slug) DO NOTHING
        `
        : `
          INSERT INTO categories (name, slug, public_route_slug)
          VALUES ($1, $2, $3)
          ON CONFLICT (slug) DO NOTHING
        `,
      [category.name, category.slug, category.publicRouteSlug],
    );
  }
}

async function migrateAssignments(db, hasLibraryType) {
  const categoryRows = await db.query(
    `SELECT id, slug FROM categories${hasLibraryType ? " WHERE library_type = 'photo'" : ''}`,
  );
  const categoryIdBySlug = new Map(
    categoryRows.rows.map((category) => [category.slug, Number(category.id)]),
  );
  const promptRows = await db.query(`
    SELECT id, category, categories, primary_category_id
    FROM prompts
    ${hasLibraryType ? "WHERE library_type = 'photo'" : ''}
    ORDER BY id
  `);

  for (const prompt of promptRows.rows) {
    const primaryValues = splitValues(prompt.category);
    const allValues = [
      ...primaryValues,
      ...splitValues(prompt.categories),
    ];
    const categoryIds = [];

    for (const value of allValues) {
      const categoryId = categoryIdBySlug.get(mappedSlug(value));
      if (categoryId && !categoryIds.includes(categoryId)) categoryIds.push(categoryId);
    }

    if (categoryIds.length === 0 && prompt.primary_category_id) {
      const primaryCategoryId = Number(prompt.primary_category_id);
      if ([...categoryIdBySlug.values()].includes(primaryCategoryId)) {
        categoryIds.push(primaryCategoryId);
      }
    }

    if (categoryIds.length === 0) {
      const searchableText = [
        prompt.category,
        ...(Array.isArray(prompt.categories) ? prompt.categories : []),
        prompt.title,
        prompt.prompt,
      ].map(clean).join(' ');
      const inferredSlug = INFERRED_CATEGORY_RULES.find((rule) => rule.pattern.test(searchableText))?.slug;
      const inferredCategoryId = categoryIdBySlug.get(inferredSlug);
      if (inferredCategoryId) categoryIds.push(inferredCategoryId);
    }

    for (let position = 0; position < categoryIds.length; position += 1) {
      await db.query(
        `
          INSERT INTO prompt_categories (prompt_id, category_id, position)
          VALUES ($1, $2, $3)
          ON CONFLICT (prompt_id, category_id) DO NOTHING
        `,
        [prompt.id, categoryIds[position], position],
      );
    }

    const primaryCategoryId =
      categoryIdBySlug.get(mappedSlug(primaryValues[0])) || categoryIds[0] || null;
    if (primaryCategoryId) {
      await db.query(
        'UPDATE prompts SET primary_category_id = COALESCE(primary_category_id, $2) WHERE id = $1',
        [prompt.id, primaryCategoryId],
      );
    }
  }

  return true;
}

async function main() {
  const paddleStore = await import('../src/lib/db.js');
  getPgPool = paddleStore.getPgPool;
  const db = getPgPool();

  await db.query('BEGIN');
  try {
    await ensureSchema(db);
    const hasLibraryType = await categoryLibraryTypeExists(db);
    await seedCategories(db, hasLibraryType);
    const assignmentsMigrated = await migrateAssignments(db, hasLibraryType);
    await db.query('COMMIT');

    const verification = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM prompts) AS prompts,
        (SELECT COUNT(*)::int FROM prompts WHERE status = 'published') AS published,
        (SELECT COUNT(*)::int FROM prompts WHERE status = 'draft') AS drafts,
        (SELECT COUNT(*)::int FROM categories) AS categories,
        (SELECT COUNT(*)::int FROM prompt_categories) AS assignments,
        (SELECT COUNT(*)::int FROM prompts WHERE primary_category_id IS NOT NULL) AS primary_assigned
    `);
    const categoryRows = await db.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.public_route_slug AS "publicRouteSlug",
        COUNT(pc.prompt_id)::int AS "promptCount"
      FROM categories c
      LEFT JOIN prompt_categories pc ON pc.category_id = c.id
      GROUP BY c.id
      ORDER BY c.public_route_slug IS NULL, c.name
    `);

    console.log('Status/category migration ready:', {
      ...verification.rows[0],
      assignmentsMigrated,
    });
    console.log(JSON.stringify(categoryRows.rows, null, 2));
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(`Status/category migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration fails before initialization.
    }
  });
