/**
 * Verification Script: Compare MDX compilation output vs existing generated data.
 *
 * This script reads every content/blog/*.mdx file, compiles it using the shared
 * blog-mdx-compiler, and compares the resulting HTML against the contentHtml
 * stored in the existing generated JSON files (public/data/posts/*.json).
 *
 * Usage:
 *   node scripts/verify-blog-migration-html.mjs
 *
 * Purpose: Verify that migration HTML will match the production build HTML.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import yaml from 'js-yaml';

import { compileMdxContent } from '../src/lib/blog-mdx-compiler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const contentDir = path.join(root, 'content', 'blog');
const postsDataDir = path.join(root, 'public', 'data', 'posts');

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

function normalizeHtml(html = '') {
  return String(html || '')
    // Normalize whitespace between tags
    .replace(/>\s+</g, '><')
    // Normalize self-closing tags
    .replace(/\s*\/?>/g, '>')
    // Normalize attribute quoting
    .replace(/="([^"]*)"/g, '="$1"')
    .trim();
}

function hashContent(content = '') {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatterBlock = match[1];
  const body = match[2].trim();
  let frontmatter;
  try {
    frontmatter = yaml.load(frontmatterBlock) || {};
  } catch {
    frontmatter = {};
  }
  return { frontmatter, body };
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Blog Migration HTML Verification ===\n');

  // Read all MDX files
  const files = await fs.readdir(contentDir);
  const mdxFiles = files.filter((f) => f.endsWith('.mdx') && !f.startsWith('_'));
  console.log(`[MDX] Found ${mdxFiles.length} MDX files\n`);

  // Check if generated data exists
  let generatedDataExists = false;
  try {
    await fs.access(path.join(root, 'public', 'data', 'posts.json'));
    generatedDataExists = true;
  } catch {
    // Generated data doesn't exist
  }

  // Load generated posts if available
  let generatedPosts = {};
  if (generatedDataExists) {
    try {
      const postsJson = JSON.parse(
        await fs.readFile(path.join(root, 'public', 'data', 'posts.json'), 'utf-8')
      );
      for (const post of postsJson.posts || []) {
        if (post.slug) {
          generatedPosts[post.slug] = post;
        }
      }
      console.log(`[GENERATED] Loaded ${Object.keys(generatedPosts).length} posts from generated data\n`);
    } catch (error) {
      console.warn(`[GENERATED] Could not load generated data: ${error.message}\n`);
    }
  } else {
    console.log('[GENERATED] No generated data found — will only verify compilation succeeds\n');
  }

  // Process each MDX file
  const results = [];
  let matchCount = 0;
  let differentCount = 0;
  let noGeneratedCount = 0;
  let compileErrorCount = 0;

  for (const file of mdxFiles) {
    const raw = await fs.readFile(path.join(contentDir, file), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const slug = frontmatter.slug || slugify(frontmatter.title || file.replace(/\.mdx$/, ''));

    // Compile MDX using shared compiler
    let newHtml = '';
    let newHeadings = [];
    let error = null;

    try {
      const result = await compileMdxContent(body);
      newHtml = result.html;
      newHeadings = result.headings;
    } catch (compileError) {
      error = compileError.message;
      compileErrorCount++;
    }

    // Get generated HTML
    const generated = generatedPosts[slug];
    const oldHtml = generated?.contentHtml || '';

    // Compare
    const newHash = hashContent(newHtml);
    const oldHash = hashContent(oldHtml);

    let status;
    let reason = '';

    if (error) {
      status = 'COMPILE ERROR';
      reason = error;
      compileErrorCount++;
    } else if (!oldHtml) {
      status = 'NO GENERATED DATA';
      reason = 'Post not found in generated JSON';
      noGeneratedCount++;
    } else if (newHash === oldHash) {
      status = 'EXACT MATCH';
      matchCount++;
    } else if (normalizeHtml(newHtml) === normalizeHtml(oldHtml)) {
      status = 'MATCH (normalized)';
      matchCount++;
    } else {
      status = 'DIFFERENT';
      differentCount++;

      // Analyze differences
      const oldLen = oldHtml.length;
      const newLen = newHtml.length;
      const lenDiff = Math.abs(newLen - oldLen);
      const pctDiff = oldLen > 0 ? ((lenDiff / oldLen) * 100).toFixed(1) : 'N/A';

      reason = `Length: old=${oldLen} new=${newLen} diff=${lenDiff} (${pctDiff}%)`;
    }

    results.push({
      file,
      slug,
      status,
      reason,
      oldHash,
      newHash,
      oldLen: oldHtml.length,
      newLen: newHtml.length,
      headings: newHeadings.length,
    });

    // Show individual result
    const icon = status.includes('MATCH') ? '✓' : status.includes('DIFFERENT') ? '≠' : '✗';
    console.log(`  ${icon} ${slug}: ${status}${reason ? ` — ${reason}` : ''}`);
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  Total MDX files:    ${mdxFiles.length}`);
  console.log(`  Exact matches:      ${matchCount}`);
  console.log(`  Different:          ${differentCount}`);
  console.log(`  No generated data:  ${noGeneratedCount}`);
  console.log(`  Compile errors:     ${compileErrorCount}`);

  if (differentCount > 0) {
    console.log('\n=== Different Posts (require investigation) ===');
    for (const r of results.filter((r) => r.status === 'DIFFERENT')) {
      console.log(`\n  ${r.slug}:`);
      console.log(`    Old hash: ${r.oldHash} (${r.oldLen} bytes)`);
      console.log(`    New hash: ${r.newHash} (${r.newLen} bytes)`);
      console.log(`    ${r.reason}`);
    }
  }

  if (compileErrorCount > 0) {
    console.log('\n=== Compile Errors ===');
    for (const r of results.filter((r) => r.status === 'COMPILE ERROR')) {
      console.log(`  ${r.slug}: ${r.reason}`);
    }
  }

  console.log('\n=== Verification Complete ===');

  if (differentCount === 0 && compileErrorCount === 0) {
    console.log('  ✅ All posts match or have no generated data to compare against.');
  } else if (differentCount > 0) {
    console.log(`  ⚠️  ${differentCount} posts have HTML differences. Review above.`);
  }
}

main().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exit(1);
});
