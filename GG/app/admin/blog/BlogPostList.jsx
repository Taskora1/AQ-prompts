'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Calendar,
  Clock,
  Edit3,
  ExternalLink,
  FileText,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';

export default function BlogPostList({
  posts = [],
  currentUser,
  canManage,
  page = 1,
  pageSize = 30,
  total = 0,
  statusCounts = {},
  statusFilter = 'all',
  search = '',
  categoryFilter = '',
  categories = [],
  sort = 'date_desc',
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(null);

  function navigateToStatus(nextStatus) {
    const query = new URLSearchParams();
    if (nextStatus !== 'all') query.set('status', nextStatus);
    if (search) query.set('search', search);
    if (categoryFilter) query.set('category', categoryFilter);
    if (sort !== 'date_desc') query.set('sort', sort);
    router.push(`/admin/blog${query.size ? `?${query.toString()}` : ''}`);
  }

  const filtered = posts;

  function pageUrl(nextPage) {
    const query = new URLSearchParams();
    if (nextPage > 1) query.set('page', String(nextPage));
    if (statusFilter !== 'all') query.set('status', statusFilter);
    if (search) query.set('search', search);
    if (categoryFilter) query.set('category', categoryFilter);
    if (sort !== 'date_desc') query.set('sort', sort);
    return `/admin/blog${query.size ? `?${query.toString()}` : ''}`;
  }

  async function handleDelete(slug) {
    if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
    setDeleting(slug);
    try {
      const res = await fetch(`/admin/api/blog/${slug}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      router.refresh();
    } catch {
      alert('Failed to delete the post.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {/* Status counts */}
      <div className="flex flex-wrap gap-4 text-sm">
        <button
          type="button"
          onClick={() => navigateToStatus('all')}
          className={`font-semibold transition ${statusFilter === 'all' ? 'text-[#2271b1] underline' : 'text-[#646970] hover:text-[#1d2327]'}`}
        >
          All <span className="ml-1 rounded-full bg-[#f0f0f1] px-2 py-0.5 text-xs font-bold">{statusCounts.all ?? total}</span>
        </button>
        <button
          type="button"
          onClick={() => navigateToStatus('published')}
          className={`font-semibold transition ${statusFilter === 'published' ? 'text-[#2271b1] underline' : 'text-[#646970] hover:text-[#1d2327]'}`}
        >
          Published <span className="ml-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-xs font-bold text-[#16a34a]">{statusCounts.published ?? 0}</span>
        </button>
        <button
          type="button"
          onClick={() => navigateToStatus('draft')}
          className={`font-semibold transition ${statusFilter === 'draft' ? 'text-[#2271b1] underline' : 'text-[#646970] hover:text-[#1d2327]'}`}
        >
          Draft <span className="ml-1 rounded-full bg-[#fef3c7] px-2 py-0.5 text-xs font-bold text-[#d97706]">{statusCounts.draft ?? 0}</span>
        </button>
      </div>

      {/* Filters */}
      <form action="/admin/blog" className="mt-4 flex flex-wrap gap-3">
        {statusFilter !== 'all' ? <input type="hidden" name="status" value={statusFilter} /> : null}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#646970]" />
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Search posts by title, excerpt, or tag…"
            className="h-10 w-full rounded border border-[#8c8f94] bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
          />
        </div>
        <select
          name="category"
          defaultValue={categoryFilter}
          className="h-10 rounded border border-[#8c8f94] bg-white px-3 text-sm outline-none"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={sort}
          className="h-10 rounded border border-[#8c8f94] bg-white px-3 text-sm outline-none"
        >
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="title_asc">Title A–Z</option>
          <option value="title_desc">Title Z–A</option>
        </select>
        <button className="h-10 rounded border border-[#2271b1] px-3 text-sm font-semibold text-[#2271b1]">
          Apply filters
        </button>
      </form>

      <p className="mt-3 text-xs text-[#646970]">
        {total} {total === 1 ? 'post' : 'posts'} found
      </p>

      {/* Post list */}
      {filtered.length === 0 ? (
        <div className="mt-8 rounded border border-dashed border-[#c3c4c7] bg-white p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-[#c3c4c7]" />
          <p className="mt-3 text-sm font-semibold text-[#646970]">No posts found</p>
          <p className="mt-1 text-xs text-[#a0a4a8]">
            {posts.length === 0
              ? statusFilter === 'draft'
                ? 'There are no draft posts.'
                : statusFilter === 'published'
                  ? 'There are no published posts.'
                  : 'Create your first blog post to get started.'
              : 'Try adjusting your search.'}
          </p>
          {posts.length === 0 && (
            <Link
              href="/admin/blog/new"
              className="mt-4 inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96]"
            >
              + New Post
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((post) => (
            <div
              key={post.slug}
              className="flex flex-wrap items-center gap-4 rounded border border-[#dcdcde] bg-white px-4 py-3 transition hover:border-[#2271b1]/40"
            >
              {/* Thumbnail */}
              {post.featuredImage ? (
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded bg-[#f0f0f1]">
                  <img
                    src={post.featuredImage}
                    alt=""
                    width={320}
                    height={180}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-[#f0f0f1]">
                  <FileText className="h-5 w-5 text-[#c3c4c7]" />
                </div>
              )}
              {/* Info */}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/blog/${post.slug}`}
                  className="block truncate text-sm font-semibold text-[#1d2327] hover:text-[#2271b1] hover:underline"
                >
                  {post.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#646970]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {post.date || 'No date'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    ~{post.readingTime || 5} min
                  </span>
                  {post.status === 'draft' ? (
                    <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-semibold text-[#d97706]">
                      Draft
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-semibold text-[#16a34a]">
                      Published
                    </span>
                  )}
                  {post.category && (
                    <span className="rounded-full bg-[#f0f6fc] px-2 py-0.5 text-[10px] font-semibold text-[#2271b1]">
                      {post.category}
                    </span>
                  )}
                  {post.author && (
                    <span className="text-[#a0a4a8]">by {post.author}</span>
                  )}
                </div>
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {post.tags.slice(0, 5).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 rounded bg-[#f0f0f1] px-1.5 py-0.5 text-[10px] text-[#646970]"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {tag}
                      </span>
                    ))}
                    {post.tags.length > 5 && (
                      <span className="text-[10px] text-[#a0a4a8]">+{post.tags.length - 5}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/admin/blog/${post.slug}`}
                  className="inline-flex h-8 items-center gap-1 rounded border border-[#8c8f94] bg-white px-3 text-xs font-semibold text-[#2c3338] transition hover:border-[#2271b1] hover:text-[#2271b1]"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit
                </Link>
                <Link
                  href={`/blog/${post.slug}`}
                  target="_blank"
                  className="inline-flex h-8 items-center gap-1 rounded border border-[#8c8f94] bg-white px-3 text-xs font-semibold text-[#646970] transition hover:border-[#2271b1] hover:text-[#2271b1]"
                >
                  <ExternalLink className="h-3 w-3" />
                  View
                </Link>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDelete(post.slug)}
                    disabled={deleting === post.slug}
                    className="inline-flex h-8 items-center gap-1 rounded border border-[#d63638] bg-white px-3 text-xs font-semibold text-[#b32d2e] transition hover:bg-[#fcf0f1] disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    {deleting === post.slug ? '…' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {total > pageSize ? (
            <nav aria-label="Blog post pages" className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm">
              {page > 1 ? (
                <Link
                  href={pageUrl(page - 1)}
                  className="rounded border border-[#8c8f94] bg-white px-3 py-2 font-semibold text-[#2c3338]"
                >
                  Previous
                </Link>
              ) : <span />}
              <span className="text-[#646970]">Page {page} of {Math.ceil(total / pageSize)}</span>
              <form action="/admin/blog" className="flex items-center gap-2">
                {statusFilter !== 'all' ? <input type="hidden" name="status" value={statusFilter} /> : null}
                {search ? <input type="hidden" name="search" value={search} /> : null}
                {categoryFilter ? <input type="hidden" name="category" value={categoryFilter} /> : null}
                {sort !== 'date_desc' ? <input type="hidden" name="sort" value={sort} /> : null}
                <label htmlFor="blog-page-number">Go to page</label>
                <input
                  id="blog-page-number"
                  name="page"
                  type="number"
                  min="1"
                  max={Math.ceil(total / pageSize)}
                  defaultValue={page}
                  className="h-9 w-20 rounded border border-[#8c8f94] px-2"
                />
                <button className="rounded border border-[#8c8f94] px-3 py-1.5 font-semibold">Go</button>
              </form>
              {page * pageSize < total ? (
                <Link
                  href={pageUrl(page + 1)}
                  className="rounded border border-[#8c8f94] bg-white px-3 py-2 font-semibold text-[#2c3338]"
                >
                  Next
                </Link>
              ) : <span />}
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );
}
