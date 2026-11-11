import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import { createBlogDraft, getBlogPost, listBlogPosts, publishBlogDraft, updateBlogDraft } from '../src/lib/mcp-blog-tools.js';
import {
  grantMcpBlogPostDraftAccess,
  McpAuthorizationError,
} from '../src/lib/mcp-oauth-db.js';
import { handleMcpProtocolRequest } from '../src/lib/mcp-server.js';

const CLIENT_ID = 'synthetic-blog-client';
const authA = { type: 'oauth', subject: 'synthetic-blog-user-a', clientId: CLIENT_ID };
const authB = { type: 'oauth', subject: 'synthetic-blog-user-b', clientId: CLIENT_ID };
const posts = new Map();
const owners = new Map();
const assignments = new Set();
const authorizations = new Map();
let nextId = 10;
let previousDatabaseUrl;
let previousPool;

const result = (rows = []) => ({ rows, rowCount: rows.length });
const postRow = (post) => ({
  ...post,
  publish_date: post.publish_date || null,
  updated_at: post.updated_at || '2026-10-19T00:00:00.000Z',
});
const authKey = (subject, clientId) => `${subject}:${clientId}`;
const assignmentKey = (postId, subject) => `${postId}:${subject}`;
const testDependencies = { clearCache() {}, revalidate() {} };

function hasDraftAccess(id, subject) {
  return owners.get(id) === subject || assignments.has(assignmentKey(id, subject));
}

const fakeClient = {
  async query(query, values = []) {
    const sql = typeof query === 'string' ? query : query.text;
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(normalized)) return result();

    if (/FROM mcp_oauth_authorizations/.test(normalized) && /FOR SHARE/.test(normalized)) {
      const authorization = authorizations.get(authKey(values[0], values[1]));
      const permitted = normalized.includes('can_publish_blog = TRUE')
        ? authorization?.canPublishBlog
        : Boolean(authorization);
      return permitted ? result([{ subject: values[0] }]) : result();
    }
    if (/INSERT INTO mcp_blog_post_draft_access/.test(normalized)) {
      const post = posts.get(Number(values[0]));
      if (!post || post.status !== 'draft') return result();
      assignments.add(assignmentKey(post.id, values[1]));
      return result([{ post_id: post.id }]);
    }
    if (/FROM blog_posts/.test(normalized) && /FOR UPDATE/.test(normalized)) {
      const post = posts.get(Number(values[0]));
      return post ? result([{ status: post.status }]) : result();
    }
    if (/FROM blog_posts/.test(normalized) && /FOR SHARE/.test(normalized)) {
      const post = posts.get(Number(values[0]));
      return post ? result([{ status: post.status }]) : result();
    }
    if (/UPDATE blog_posts/.test(normalized) && /SET status = 'published'/.test(normalized)) {
      const post = posts.get(Number(values[0]));
      const authorization = authorizations.get(authKey(values[1], values[2]));
      if (!post || post.status !== 'draft' || !authorization?.canPublishBlog || !hasDraftAccess(post.id, values[1])) {
        return result();
      }
      post.status = 'published';
      post.publish_date = new Date().toISOString();
      post.updated_at = new Date().toISOString();
      return result([postRow(post)]);
    }
    if (/UPDATE blog_posts/.test(normalized) && /SET slug = \$2/.test(normalized)) {
      const post = posts.get(Number(values[0]));
      const authorization = authorizations.get(authKey(values[16], values[17]));
      if (!post || post.status !== 'draft' || !authorization || !hasDraftAccess(post.id, values[16])) return result();
      [
        'slug', 'title', 'excerpt', 'content', 'content_html', 'content_text',
        'featured_image', 'featured_image_alt', 'category',
      ].forEach((field, index) => {
        post[field] = values[index + 1];
      });
      post.tags = JSON.parse(values[10]);
      post.seo_title = values[11];
      post.seo_description = values[12];
      post.og_image = values[13];
      post.og_image_alt = values[14];
      post.keywords = values[15];
      post.updated_at = new Date().toISOString();
      return result([postRow(post)]);
    }
    if (/SELECT post_id FROM mcp_blog_post_owners/.test(normalized)) {
      return owners.get(Number(values[0])) === values[1]
        ? result([{ post_id: Number(values[0]) }])
        : result();
    }
    if (/SELECT post_id FROM mcp_blog_post_draft_access WHERE subject = \$1/.test(normalized)) {
      return result(
        [...assignments]
          .filter((key) => key.endsWith(`:${values[0]}`))
          .map((key) => ({ post_id: Number(key.split(':')[0]) })),
      );
    }
    if (/FROM mcp_blog_post_draft_access/.test(normalized) && /WHERE post_id = \$1/.test(normalized)) {
      return assignments.has(assignmentKey(Number(values[0]), values[1]))
        ? result([{ post_id: Number(values[0]) }])
        : result();
    }
    if (/SELECT COUNT\(\*\)::int AS total FROM blog_posts p/.test(normalized)) {
      const statusFilter = normalized.includes('p.status = $2') ? values[1] : 'all';
      const visible = [...posts.values()].filter((post) => (
        (post.status === 'published' || hasDraftAccess(post.id, values[0]))
        && (statusFilter === 'all' || post.status === statusFilter)
      ));
      return result([{ total: visible.length }]);
    }
    if (/FROM blog_posts p/.test(normalized) && /LIMIT \$/.test(normalized)) {
      const statusFilter = normalized.includes('p.status = $2') ? values[1] : 'all';
      const limit = Number(values[values.length - 2]);
      const offset = Number(values[values.length - 1]);
      const rows = [...posts.values()]
        .filter((post) => (
          (post.status === 'published' || hasDraftAccess(post.id, values[0]))
          && (statusFilter === 'all' || post.status === statusFilter)
        ))
        .sort((a, b) => b.id - a.id)
        .slice(offset, offset + limit)
        .map((post) => postRow(post));
      return result(rows);
    }
    if (/SELECT id, slug, title, excerpt, content, featured_image/.test(normalized)) {
      const post = posts.get(Number(values[0]));
      if (!post) return result();
      if (normalized.includes("AND status = 'draft'") && post.status !== 'draft') return result();
      return result([postRow(post)]);
    }
    if (/INSERT INTO blog_posts/.test(normalized)) {
      const id = nextId++;
      const post = {
        id,
        slug: values[0],
        title: values[1],
        excerpt: values[2],
        content: values[3],
        content_html: values[4],
        content_text: values[5],
        featured_image: values[6],
        featured_image_alt: values[7],
        author: 'Abdul Qudoos',
        category: values[8],
        tags: JSON.parse(values[9]),
        status: 'draft',
        featured: false,
        publish_date: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reading_time: 5,
        seo_title: values[10],
        seo_description: values[11],
        canonical_url: '',
        og_image: values[12],
        og_image_alt: values[13],
        faqs: [],
        toc: [],
        meta: {},
        keywords: values[14],
      };
      posts.set(id, post);
      return result([postRow(post)]);
    }
    if (/INSERT INTO mcp_blog_post_owners/.test(normalized)) {
      owners.set(Number(values[0]), values[1]);
      return result();
    }
    throw new Error(`Unexpected fake blog query: ${normalized}`);
  },
  release() {},
};

const fakePool = {
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
  process.env.DATABASE_URL = 'postgres://localhost/mcp_blog_tools_test';
  fakePool.__dbConnectionString = getDatabaseUrl();
  fakePool.__dbPoolMax = Number.parseInt(process.env.PG_POOL_MAX || '', 10) || (isBuildPhase() ? 1 : 5);
  globalThis.__dbPgPool = fakePool;
  authorizations.set(authKey(authA.subject, CLIENT_ID), { canPublishBlog: false });
  authorizations.set(authKey(authB.subject, CLIENT_ID), { canPublishBlog: false });
  posts.set(1, postRow({
    id: 1,
    slug: 'public-guide',
    title: 'Public guide',
    excerpt: 'Published article',
    content: 'Public text',
    content_html: '<p>Public text</p>',
    content_text: 'Public text',
    category: 'Writing',
    tags: [],
    status: 'published',
  }));
  posts.set(2, postRow({
    id: 2,
    slug: 'legacy-draft',
    title: 'Legacy draft',
    excerpt: '',
    content: 'Private legacy text',
    content_html: '<p>Private legacy text</p>',
    content_text: 'Private legacy text',
    category: 'Writing',
    tags: [],
    status: 'draft',
  }));
  posts.set(3, postRow({
    id: 3,
    slug: 'another-user-draft',
    title: 'Other user draft',
    excerpt: '',
    content: 'Secret',
    content_html: '<p>Secret</p>',
    content_text: 'Secret',
    category: 'Writing',
    tags: [],
    status: 'draft',
  }));
  owners.set(3, authB.subject);
});

after(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = previousPool;
});

test('OAuth blog listing exposes published posts and only owned or assigned drafts', async () => {
  const listed = await listBlogPosts({}, authA);
  assert.deepEqual(listed.rows.map(({ id }) => id), [1]);
  assert.equal(listed.total, 1);
  assert.equal((await getBlogPost({ id: 1 }, authA)).status, 'published');
  await assert.rejects(getBlogPost({ id: 2 }, authA), McpAuthorizationError);
  await assert.rejects(getBlogPost({ id: 3 }, authA), McpAuthorizationError);

  await grantMcpBlogPostDraftAccess(2, authA.subject, 1);
  assert.equal((await getBlogPost({ id: 2 }, authA)).id, 2);
  assert.ok((await listBlogPosts({}, authA)).rows.some(({ id }) => id === 2));
});

test('blog draft creation binds ownership to verified OAuth subject and escapes content', async () => {
  const created = await createBlogDraft({
    title: 'A new guide',
    slug: 'a-new-guide',
    content: '<script>alert("x")</script>\n\nSafe paragraph',
    owner: authB.subject,
    subject: authB.subject,
  }, authA, testDependencies);
  assert.equal(created.status, 'draft');
  assert.equal(owners.get(created.id), authA.subject);
  assert.match(posts.get(created.id).content_html, /&lt;script&gt;/);
  assert.doesNotMatch(posts.get(created.id).content_html, /<script>/);
});

test('blog draft updates require ownership or explicit assignment and cannot edit published posts', async () => {
  const owned = await createBlogDraft({
    title: 'Editable blog draft',
    content: 'Initial safe content',
  }, authA, testDependencies);
  const updated = await updateBlogDraft({
    id: owned.id,
    title: 'Updated blog draft',
    content: 'Changed safely',
  }, authA, testDependencies);
  assert.equal(updated.title, 'Updated blog draft');
  assert.ok(updated.updatedAt);
  await assert.rejects(
    updateBlogDraft({ id: 3, title: 'Forged edit' }, authA, testDependencies),
    McpAuthorizationError,
  );
  await assert.rejects(
    updateBlogDraft({ id: 1, title: 'Published edit' }, authA, testDependencies),
    McpAuthorizationError,
  );
});

test('blog publishing requires its own capability and only publishes authorized drafts', async () => {
  const owned = await createBlogDraft({
    title: 'Ready for publication',
    content: 'A complete safe blog article.',
  }, authA, testDependencies);
  await assert.rejects(
    publishBlogDraft({ id: owned.id }, authA, testDependencies),
    /publish blog permission is not authorized/,
  );
  authorizations.get(authKey(authA.subject, CLIENT_ID)).canPublishBlog = true;
  const published = await publishBlogDraft({ id: owned.id }, authA, testDependencies);
  assert.equal(published.status, 'published');
  assert.ok(published.publishDate);
  assert.ok(published.updatedAt);
  await assert.rejects(
    publishBlogDraft({ id: 2 }, { ...authA, clientId: 'unapproved-client' }, testDependencies),
    McpAuthorizationError,
  );
});

test('MCP blog tool schema rejects caller-supplied ownership identity', async () => {
  const response = await handleMcpProtocolRequest(new Request('https://www.aqprompts.com/api/mcp', {
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
        name: 'create_blog_draft',
        arguments: {
          title: 'Forged ownership',
          content: 'This body must not be inserted.',
          subject: authB.subject,
        },
      },
    }),
  }), authA);
  const output = await response.json();
  assert.equal(output.result?.isError, true);
  assert.equal([...posts.values()].some(({ title }) => title === 'Forged ownership'), false);
});
