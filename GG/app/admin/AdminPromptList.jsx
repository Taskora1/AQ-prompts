'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { getPromptThumbnailPath } from '@/lib/prompt-images';

function displayDate(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '—';

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export default function AdminPromptList({
  rows = [],
  total = 0,
  page = 1,
  pageSize = 30,
  totalPages = 1,
  search = '',
  status = 'all',
  category = '',
  categories = [],
  sort = 'updated_desc',
  successMessage = '',
  errorMessage = '',
  canManageRestrictedActions = false,
}) {
  const router = useRouter();
  const [promptRows, setPromptRows] = useState(rows);
  const [searchTerm, setSearchTerm] = useState(search);
  const [statusFilter, setStatusFilter] = useState(status);
  const [categoryFilter, setCategoryFilter] = useState(category);
  const [sortOrder, setSortOrder] = useState(sort);
  const [pageInput, setPageInput] = useState(String(page));
  const [deletingId, setDeletingId] = useState(null);
  const [notice, setNotice] = useState(successMessage);
  const [error, setError] = useState(errorMessage);
  const normalizedSearch = searchTerm.trim();

  useEffect(() => {
    setPromptRows(rows);
    setSearchTerm(search);
    setStatusFilter(status);
    setCategoryFilter(category);
    setSortOrder(sort);
    setPageInput(String(page));
  }, [rows, search, status, category, sort, page]);

  function navigateTo(
    nextPage,
    nextSearch = normalizedSearch,
    nextStatus = statusFilter,
    nextCategory = categoryFilter,
    nextSort = sortOrder,
  ) {
    const query = new URLSearchParams();
    if (nextPage > 1) query.set('page', String(nextPage));
    if (nextSearch) query.set('search', nextSearch);
    if (nextStatus !== 'all') query.set('status', nextStatus);
    if (nextCategory) query.set('category', nextCategory);
    if (nextSort !== 'updated_desc') query.set('sort', nextSort);
    router.push(`/admin${query.toString() ? `?${query.toString()}` : ''}`);
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    navigateTo(1);
  }

  async function deletePrompt(prompt) {
    if (!window.confirm(`Delete "${prompt.title}"? This cannot be undone.`)) return;

    setDeletingId(prompt.id);
    setNotice('');
    setError('');

    try {
      const response = await fetch(`/admin/api/prompts/${prompt.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The prompt could not be deleted.');

      setPromptRows((current) => current.filter((row) => row.id !== prompt.id));
      setNotice('Prompt deleted successfully.');
      router.refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'The prompt could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className="mx-auto max-w-[1600px] p-5 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Prompt library</h1>
            <p className="mt-1 text-sm text-slate-500">
              {total.toLocaleString()} prompts · Manage and publish your AI image prompts
            </p>
          </div>
          <Link
            href="/admin/prompts/new"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add prompt
          </Link>
        </div>
        {notice ? (
          <div role="status" className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:p-6">
            <p className="text-sm font-medium text-slate-500">
              {search || status !== 'all' || category
                ? `${total} matching prompt${total === 1 ? '' : 's'}`
                : `All ${total} prompts`}
            </p>

            <form
              onSubmit={handleSearchSubmit}
              className="flex w-full flex-wrap items-center gap-3"
            >
              <label className="relative block w-full min-w-[220px] flex-[1_1_320px] xl:max-w-[440px]">
                <span className="sr-only">Search prompts by title</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by title"
                  className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </label>
              <label>
                <span className="sr-only">Filter prompts by status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    const nextStatus = event.target.value;
                    setStatusFilter(nextStatus);
                    navigateTo(1, normalizedSearch, nextStatus);
                  }}
                  className="h-11 w-full min-w-0 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:w-[160px]"
                >
                  <option value="all">All statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Filter prompts by category</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => {
                    const nextCategory = event.target.value;
                    setCategoryFilter(nextCategory);
                    navigateTo(1, normalizedSearch, statusFilter, nextCategory);
                  }}
                  className="h-11 w-full min-w-0 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:w-[200px]"
                >
                  <option value="">All categories</option>
                  {categories.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Sort prompts</span>
                <select
                  value={sortOrder}
                  onChange={(event) => {
                    const nextSort = event.target.value;
                    setSortOrder(nextSort);
                    navigateTo(1, normalizedSearch, statusFilter, categoryFilter, nextSort);
                  }}
                  className="h-11 w-full min-w-0 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:w-[190px]"
                >
                  <option value="updated_desc">Newest updated</option>
                  <option value="updated_asc">Oldest updated</option>
                  <option value="title_asc">Title A–Z</option>
                  <option value="title_desc">Title Z–A</option>
                </select>
              </label>
              <button type="submit" className="h-11 shrink-0 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2">
                Search
              </button>
            </form>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-20 border-b border-slate-200 px-4 py-3">Image</th>
                  <th scope="col" className="border-b border-slate-200 px-4 py-3">Title</th>
                  <th scope="col" className="w-56 border-b border-slate-200 px-4 py-3">Category</th>
                  <th scope="col" className="w-40 border-b border-slate-200 px-4 py-3">Date</th>
                  <th scope="col" className="w-48 border-b border-slate-200 px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promptRows.map((prompt) => {
                  const thumbnail = getPromptThumbnailPath(prompt.image);

                  return (
                    <tr key={prompt.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-blue-50/50">
                      <td className="px-4 py-3">
                        <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          {thumbnail ? (
                            <Image
                              src={thumbnail}
                              alt=""
                              fill
                              sizes="56px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-xl px-4 py-3 align-middle">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold leading-6 text-slate-800">{prompt.title}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              prompt.status === 'published'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {prompt.status === 'published' ? 'Published' : 'Draft'}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">/{prompt.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {prompt.category || 'Uncategorized'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {displayDate(prompt.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <Link
                            href={`/admin/prompts/${prompt.id}/edit`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                          </Link>
                          {canManageRestrictedActions ? (
                            <button
                              type="button"
                              onClick={() => deletePrompt(prompt)}
                              disabled={deletingId === prompt.id}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-55"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {deletingId === prompt.id ? 'Deleting…' : 'Delete'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {promptRows.length > 0 ? (
            <div className="space-y-3 p-3 md:hidden">
              {promptRows.map((prompt) => {
                const thumbnail = getPromptThumbnailPath(prompt.image);

                return (
                  <article key={prompt.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {thumbnail ? (
                          <Image src={thumbnail} alt="" fill sizes="56px" className="object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold leading-5 text-slate-800">{prompt.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            prompt.status === 'published'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {prompt.status === 'published' ? 'Published' : 'Draft'}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">/{prompt.slug}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                      <span>{prompt.category || 'Uncategorized'}</span>
                      <span>Updated {displayDate(prompt.updatedAt)}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/admin/prompts/${prompt.id}/edit`}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </Link>
                      {canManageRestrictedActions ? (
                        <button
                          type="button"
                          onClick={() => deletePrompt(prompt)}
                          disabled={deletingId === prompt.id}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-700 disabled:opacity-55"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {deletingId === prompt.id ? 'Deleting…' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {promptRows.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="font-semibold text-[#1d2327]">No prompts found</p>
              <p className="mt-1 text-sm text-[#646970]">Try a different title search.</p>
            </div>
          ) : null}

          {totalPages > 1 ? (
            <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-[#c3c4c7] px-4 py-3" aria-label="Prompt pages">
              <p className="text-sm text-[#646970]">
                Page {page} of {totalPages} ({pageSize} per page)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigateTo(page - 1)}
                  disabled={page <= 1}
                  className="rounded border border-[#8c8f94] px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded border border-[#8c8f94] px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const requestedPage = Number(pageInput);
                    if (!Number.isInteger(requestedPage)) return;
                    navigateTo(Math.min(Math.max(requestedPage, 1), totalPages));
                  }}
                >
                  <label htmlFor="prompt-page-number" className="sr-only">Go to page</label>
                  <input
                    id="prompt-page-number"
                    type="number"
                    min="1"
                    max={totalPages}
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                    className="h-9 w-20 rounded border border-[#8c8f94] px-2 text-sm"
                  />
                  <button type="submit" className="rounded border border-[#8c8f94] px-3 py-1.5 text-sm font-semibold">
                    Go
                  </button>
                </form>
              </div>
            </nav>
          ) : null}
        </div>
      </section>
    </>
  );
}