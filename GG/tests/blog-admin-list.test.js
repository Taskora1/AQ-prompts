import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('admin blog page omits unused excerpts while other list callers retain them', async () => {
  const [database, adminPage, blogApi] = await Promise.all([
    readFile(new URL('../src/lib/blog-db.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/blog/page.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/api/blog/route.js', import.meta.url), 'utf8'),
  ]);

  assert.match(database, /includeExcerpt = true/);
  assert.match(database, /const excerptColumn = includeExcerpt \? 'excerpt, ' : ''/);
  assert.match(database, /title ILIKE \$\$\{filters\.length\} OR excerpt ILIKE/);
  assert.match(database, /title, \$\{excerptColumn\}featured_image/);
  assert.match(adminPage, /includeExcerpt: false/);
  assert.match(blogApi, /listBlogPostsForAdmin\(\)/);
});

test('blog writes return only generated database fields while retaining the full post payload', async () => {
  const [database, createRoute, updateRoute] = await Promise.all([
    readFile(new URL('../src/lib/blog-db.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/api/blog/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/api/blog/[slug]/route.js', import.meta.url), 'utf8'),
  ]);
  const writeReturning = database.matchAll(
    /RETURNING\s+id, slug, status,\s+publish_date::text AS publish_date,\s+created_at::text AS created_at,\s+updated_at::text AS updated_at/g,
  );

  assert.equal([...writeReturning].length, 2);
  assert.equal((database.match(/mapPostWriteResult\(result\.rows\[0\], data\)/g) || []).length, 2);
  assert.match(database, /function mapPostWriteResult\(row, data\)/);
  assert.match(database, /content_html: data\.contentHtml \|\| ''/);
  assert.match(database, /faqs: Array\.isArray\(data\.faqs\) \? data\.faqs : \[\]/);
  assert.match(createRoute, /success: true, slug: postSlug, post/);
  assert.match(updateRoute, /post: updatedPost/);
});
