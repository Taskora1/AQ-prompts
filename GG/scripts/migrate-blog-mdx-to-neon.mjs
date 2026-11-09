/**
 * Migration Script: MDX Blog → Neon PostgreSQL
 *
 * Reads all content/blog/*.mdx files and imports them into the blog_posts table.
 *
 * Usage:
 *   node scripts/migrate-blog-mdx-to-neon.mjs --dry-run   # Preview only, no writes
 *   node scripts/migrate-blog-mdx-to-neon.mjs              # Execute migration
 *
 * Safety:
 * - Dry-run mode: reads and validates without writing
 * - Idempotent: skips existing slugs, reports conflicts
 * - Preserves exact slugs and metadata
 * - Uses TIMESTAMPTZ for dates
 * - Does NOT delete MDX files (kept as backup)
 *
 * Content model:
 * - `content` = raw Markdown body from MDX file
 * - `content_html` = compiled HTML using unified + remark-gfm + remark-html
 *                    (same pipeline as the production build, minus JSX rendering)
 * - `content_text` = plain text stripped of HTML (for search)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import { getPgPool, getDatabaseUrl } from '../src/lib/db.js';
import { compileMdxContent } from '../src/lib/blog-mdx-compiler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const contentDir = path.join(root, 'content', 'blog');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Helpers ─────────────────────────────────────────────────────────────

function cleanText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function stripTags(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ');
}

function getReadingTime(text, fallback = 5) {
  const words = stripTags(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200)) || fallback;
}

/**
 * Compile Markdown body to HTML using the SAME pipeline as the production build.
 * Uses the shared blog-mdx-compiler module (compileMdxContent).
 * This ensures migration HTML is identical to build-output HTML.
 */
async function compileMarkdownToHtml(body = '') {
  const text = String(body || '').trim();
  if (!text) return '';

  try {
    const { html } = await compileMdxContent(text);
    return html;
  } catch (error) {
    console.warn(`  ⚠ MDX compilation failed: ${error.message}`);
    // Fallback: wrap in <p> tags
    return text
      .split(/\n{2,}/)
      .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
      .join('\n');
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content, error: 'No frontmatter delimiters found' };

  const frontmatterBlock = match[1];
  const body = match[2].trim();

  let frontmatter;
  try {
    frontmatter = yaml.load(frontmatterBlock) || {};
  } catch (yamlError) {
    return { frontmatter: {}, body, error: `YAML parse error: ${yamlError.message}` };
  }

  return { frontmatter, body, error: null };
}

function normalizeStatus(frontmatter) {
  if (frontmatter.status === 'draft') return 'draft';
  if (frontmatter.status === 'published') return 'published';
  if (frontmatter.draft === true) return 'draft';
  if (frontmatter.draft === false) return 'published';
  return 'published'; // Default for posts without explicit status
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return [...new Set(tags.map(cleanText).filter(Boolean))];
  }
  if (typeof tags === 'string') {
    return [...new Set(tags.split(/[,|/]/).map(cleanText).filter(Boolean))];
  }
  return [];
}

function normalizeFaqs(faqs) {
  if (!Array.isArray(faqs)) return [];
  return faqs
    .map((faq) => ({
      question: cleanText(faq?.question),
      answer: cleanText(faq?.answer),
    }))
    .filter((faq) => faq.question && faq.answer);
}

function extractToc(html) {
  const toc = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const level = Number(match[1]);
    const id = match[2];
    const text = stripTags(match[3]).trim();
    if (text) {
      toc.push({ id, type: `heading_${level}`, level, text, slug: id });
    }
  }
  return toc;
}

function isValidDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime());
}

// ── Validation ──────────────────────────────────────────────────────────

function validatePost(post, file) {
  const errors = [];

  if (!post.title) errors.push('Missing title');
  if (!post.slug) errors.push('Missing slug');
  if (!isValidDate(post.publishDate)) errors.push(`Invalid date: ${post.publishDate}`);
  if (!['draft', 'published'].includes(post.status)) errors.push(`Invalid status: ${post.status}`);
  if (!post.content) errors.push('Missing content (body)');

  return errors;
}

// ── Main Migration ──────────────────────────────────────────────────────

async function main() {
  console.log(`=== Blog MDX → Neon Migration ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  // Check database connection
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.error('ERROR: No DATABASE_URL found. Cannot connect to Neon.');
    process.exit(1);
  }
  console.log('[DB] Database URL found ✓');

  const db = getPgPool();

  // Ensure table exists
  if (!DRY_RUN) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        title TEXT NOT NULL,
        excerpt TEXT DEFAULT '',
        content TEXT DEFAULT '',
        content_html TEXT DEFAULT '',
        content_text TEXT DEFAULT '',
        featured_image TEXT DEFAULT '',
        featured_image_alt TEXT DEFAULT '',
        author TEXT DEFAULT 'Abdul Qudoos',
        author_meta JSONB DEFAULT NULL,
        category TEXT DEFAULT 'Creator Growth',
        tags JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
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
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_blog_posts_publish_date ON blog_posts(publish_date)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category)');
    console.log('[DB] blog_posts table ready ✓\n');
  } else {
    console.log('[DB] DRY RUN — skipping table creation\n');
  }

  // Read all MDX files
  const files = await fs.readdir(contentDir);
  const mdxFiles = files.filter((f) => f.endsWith('.mdx') && !f.startsWith('_'));
  console.log(`[MDX] Found ${mdxFiles.length} MDX files\n`);

  // Parse all MDX files
  const posts = [];
  const parseErrors = [];

  for (const file of mdxFiles) {
    try {
      const raw = (await fs.readFile(path.join(contentDir, file), 'utf-8'))
        .replace(/^\uFEFF/, '')   // strip UTF-8 BOM
        .replace(/\r\n/g, '\n');  // normalize Windows CRLF to Unix LF
      const { frontmatter, body, error: parseError } = parseFrontmatter(raw);

      if (parseError) {
        parseErrors.push({ file, error: parseError });
        console.warn(`  ⚠ ${file}: ${parseError}`);
        continue;
      }

      const slug = frontmatter.slug || slugify(frontmatter.title || file.replace(/\.mdx$/, ''));
      const title = cleanText(frontmatter.title || slug);
      const status = normalizeStatus(frontmatter);

      // Compile Markdown body to proper HTML using unified + remark-gfm + remark-html
      // This produces the same output as the production build pipeline
      const contentHtml = await compileMarkdownToHtml(body);

      const contentText = stripTags(body).replace(/\s+/g, ' ').trim();
      const toc = extractToc(contentHtml);
      const readingTime = frontmatter.readingTime || getReadingTime(body);

      posts.push({
        slug,
        title,
        excerpt: cleanText(frontmatter.excerpt || frontmatter.description || ''),
        content: body,
        contentHtml,
        contentText,
        featuredImage: cleanText(frontmatter.coverImage || frontmatter.featuredImage || ''),
        featuredImageAlt: cleanText(frontmatter.coverImageAlt || frontmatter.featuredImageAlt || ''),
        author: cleanText(frontmatter.author || 'abdul-qudoos'),
        authorMeta: {
          slug: cleanText(frontmatter.author || 'abdul-qudoos'),
          name: 'Abdul Qudoos',
          role: 'Founder and Editor, AQPrompts',
          avatar: '/images/founder-aqprompts.webp',
          bio: 'Abdul Qudoos creates and reviews AQPrompts guides and prompt-library content for creators using AI image tools.',
          authorUrl: `/author/${cleanText(frontmatter.author || 'abdul-qudoos')}`,
        },
        category: cleanText(frontmatter.category || 'Creator Growth'),
        tags: normalizeTags(frontmatter.tags),
        status,
        featured: Boolean(frontmatter.featured),
        publishDate: cleanText(frontmatter.date || new Date().toISOString().slice(0, 10)),
        readingTime,
        seoTitle: cleanText(frontmatter.seoTitle || frontmatter.metaTitle || title),
        seoDescription: cleanText(frontmatter.description || frontmatter.seoDescription || frontmatter.excerpt || ''),
        canonicalUrl: cleanText(frontmatter.canonicalUrl || ''),
        ogImage: cleanText(frontmatter.ogImage || frontmatter.coverImage || ''),
        ogImageAlt: cleanText(frontmatter.ogImageAlt || frontmatter.coverImageAlt || ''),
        faqs: normalizeFaqs(frontmatter.faq),
        toc,
        meta: {
          hasFaqs: normalizeFaqs(frontmatter.faq).length > 0,
          hasToc: toc.length > 0,
          hasTags: normalizeTags(frontmatter.tags).length > 0,
          hasVideo: false,
          hasRelatedPosts: false,
          blockCount: toc.length,
        },
        keywords: normalizeTags(frontmatter.tags).join(', '),
        sourceFile: file,
      });
    } catch (error) {
      parseErrors.push({ file, error: error.message });
      console.error(`  ✗ Failed to parse ${file}: ${error.message}`);
    }
  }

  console.log(`[PARSE] Successfully parsed: ${posts.length}`);
  console.log(`[PARSE] Parse errors: ${parseErrors.length}`);

  // Validate posts
  const validationErrors = [];
  for (const post of posts) {
    const errors = validatePost(post, post.sourceFile);
    if (errors.length > 0) {
      validationErrors.push({ slug: post.slug, file: post.sourceFile, errors });
      console.warn(`  ⚠ ${post.sourceFile}: ${errors.join(', ')}`);
    }
  }

  if (validationErrors.length > 0) {
    console.log(`\n[VALIDATE] Posts with validation issues: ${validationErrors.length}`);
  }

  // Check for duplicate slugs
  const slugCounts = {};
  for (const post of posts) {
    slugCounts[post.slug] = (slugCounts[post.slug] || 0) + 1;
  }
  const duplicateSlugs = Object.entries(slugCounts).filter(([, count]) => count > 1);

  if (duplicateSlugs.length > 0) {
    console.error('\n⚠ DUPLICATE SLUGS DETECTED:');
    for (const [slug, count] of duplicateSlugs) {
      console.error(`  - "${slug}" appears ${count} times`);
    }
    if (!DRY_RUN) {
      console.error('\nPlease fix duplicates before migrating. Aborting.');
      process.exit(1);
    }
  } else {
    console.log('[CHECK] No duplicate slugs ✓');
  }

  // Check existing Neon data
  let existingSlugs = new Set();
  if (!DRY_RUN) {
    const existingResult = await db.query('SELECT slug FROM blog_posts');
    existingSlugs = new Set(existingResult.rows.map((r) => r.slug));
  }
  console.log(`[NEON] Existing posts in Neon: ${existingSlugs.size}`);

  // Summary before execution
  const toInsert = posts.filter((p) => !existingSlugs.has(p.slug));
  const toSkip = posts.filter((p) => existingSlugs.has(p.slug));

  console.log(`\n--- Migration Plan ---`);
  console.log(`  Posts to insert: ${toInsert.length}`);
  console.log(`  Posts to skip (already exist): ${toSkip.length}`);
  console.log(`  Parse errors: ${parseErrors.length}`);
  console.log(`  Validation issues: ${validationErrors.length}`);

  // Show a preview of first post's HTML for verification
  if (posts.length > 0 && DRY_RUN) {
    const sample = posts[0];
    console.log(`\n--- Sample HTML Preview (${sample.slug}) ---`);
    console.log(`  First 500 chars of compiled HTML:`);
    console.log(`  ${sample.contentHtml.slice(0, 500)}...`);
    console.log(`  TOC entries: ${sample.toc.length}`);
    console.log(`  Word count: ${sample.contentText.split(/\s+/).length}`);
  }

  if (DRY_RUN) {
    console.log('\n--- DRY RUN COMPLETE ---');
    console.log('  No database writes were performed.');
    console.log('  Run without --dry-run to execute the migration.');
    return;
  }

  // Execute migration
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  console.log('\n--- Executing Migration ---\n');

  for (const post of posts) {
    if (existingSlugs.has(post.slug)) {
      console.log(`  ⊘ Skipped (exists): ${post.slug}`);
      skipped++;
      continue;
    }

    try {
      await db.query(`
        INSERT INTO blog_posts (
          slug, title, excerpt, content, content_html, content_text,
          featured_image, featured_image_alt, author, author_meta,
          category, tags, status, featured,
          publish_date, reading_time, seo_title, seo_description,
          canonical_url, og_image, og_image_alt, faqs, toc, meta, keywords
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25
        )
      `, [
        post.slug,
        post.title,
        post.excerpt,
        post.content,
        post.contentHtml,
        post.contentText,
        post.featuredImage,
        post.featuredImageAlt,
        post.author,
        JSON.stringify(post.authorMeta),
        post.category,
        JSON.stringify(post.tags),
        post.status,
        post.featured,
        post.publishDate,
        post.readingTime,
        post.seoTitle,
        post.seoDescription,
        post.canonicalUrl,
        post.ogImage,
        post.ogImageAlt,
        JSON.stringify(post.faqs),
        JSON.stringify(post.toc),
        JSON.stringify(post.meta),
        post.keywords,
      ]);

      const statusIcon = post.status === 'published' ? '✓' : '📝';
      console.log(`  ${statusIcon} Inserted: ${post.slug} (${post.status})`);
      inserted++;
    } catch (error) {
      console.error(`  ✗ Failed to insert ${post.slug}: ${error.message}`);
      errors++;
    }
  }

  // Final verification
  const verifyResult = await db.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'published')::int AS published,
      COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
    FROM blog_posts
  `);
  const stats = verifyResult.rows[0];

  console.log('\n=== Migration Summary ===');
  console.log(`  MDX files found:      ${mdxFiles.length}`);
  console.log(`  Parsed successfully:  ${posts.length}`);
  console.log(`  Inserted:            ${inserted}`);
  console.log(`  Skipped (exists):    ${skipped}`);
  console.log(`  Errors:              ${errors}`);
  console.log(`  Parse errors:        ${parseErrors.length}`);
  console.log(`  Validation issues:   ${validationErrors.length}`);
  console.log(`\n[VERIFY] Neon blog_posts:`);
  console.log(`  Total:    ${stats.total}`);
  console.log(`  Published: ${stats.published}`);
  console.log(`  Drafts:   ${stats.drafts}`);

  if (errors > 0 || parseErrors.length > 0) {
    console.log('\n⚠ Some records had errors. Check the output above.');
  } else {
    console.log('\n✅ Migration complete.');
  }

  console.log('   MDX files have NOT been deleted (kept as backup).');
}

main().catch((error) => {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
});
