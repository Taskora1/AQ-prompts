import Link from 'next/link';
import { redirect } from 'next/navigation';

import DeleteTextPromptButton from '@/components/admin/DeleteTextPromptButton';
import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import { listTextPromptRows } from '@/lib/text-prompts-admin-db';

export const dynamic = 'force-dynamic';

export default async function TextPromptsAdminPage({ searchParams }) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');
  const params = await searchParams;
  const result = await listTextPromptRows({
    page: params?.page,
    search: params?.search,
    status: params?.status,
    category: params?.category,
    sort: params?.sort,
  });
  const query = new URLSearchParams();
  if (result.search) query.set('search', result.search);
  if (result.status !== 'all') query.set('status', result.status);
  if (result.category) query.set('category', result.category);
  if (result.sort !== 'updated_desc') query.set('sort', result.sort);

  function pageUrl(page) {
    const pageQuery = new URLSearchParams(query);
    if (page > 1) pageQuery.set('page', String(page));
    return `/admin/text-prompts${pageQuery.size ? `?${pageQuery}` : ''}`;
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <header className="flex min-h-12 items-center justify-between bg-[#1d2327] px-5 text-white lg:px-8">
        <Link href="/admin" className="text-sm font-semibold">AQPrompts Admin</Link>
        <Link href="/admin/prompts" className="text-sm underline">Photo prompts</Link>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Text Prompts</h1>
            <p className="mt-1 text-sm text-[#646970]">{result.total} Text prompts</p>
          </div>
          <Link href="/admin/text-prompts/new" className="rounded border border-[#2271b1] px-4 py-2 text-sm font-semibold text-[#2271b1]">Add Text Prompt</Link>
        </div>
        {params?.success === 'saved' ? <p role="status" className="mt-4 rounded bg-green-50 p-3 text-sm text-green-800">Text prompt saved.</p> : null}
        <form className="mt-5 flex flex-wrap gap-2" action="/admin/text-prompts">
          <input name="search" type="search" defaultValue={result.search} placeholder="Search titles" className="h-10 rounded border border-[#8c8f94] px-3 text-sm" />
          <select name="status" defaultValue={result.status} className="h-10 rounded border border-[#8c8f94] px-3 text-sm">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <select name="category" defaultValue={result.category} className="h-10 rounded border border-[#8c8f94] px-3 text-sm">
            <option value="">All categories</option>
            {result.categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select name="sort" defaultValue={result.sort} className="h-10 rounded border border-[#8c8f94] px-3 text-sm">
            <option value="updated_desc">Newest updated</option>
            <option value="updated_asc">Oldest updated</option>
            <option value="title_asc">Title A–Z</option>
            <option value="title_desc">Title Z–A</option>
          </select>
          <button className="h-10 rounded border border-[#2271b1] px-3 text-sm font-semibold text-[#2271b1]">Filter</button>
        </form>
        <div className="mt-5 hidden overflow-x-auto rounded border border-[#c3c4c7] bg-white md:block">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-[#f6f7f7]">
              <tr><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3">Action</th></tr>
            </thead>
            <tbody>
              {result.rows.map((prompt) => (
                <tr key={prompt.id} className="border-t border-[#dcdcde]">
                  <td className="p-3 font-medium">{prompt.title}<div className="text-xs text-[#646970]">{prompt.slug}</div></td>
                  <td className="p-3">{prompt.category || 'Uncategorized'}</td>
                  <td className="p-3">{prompt.status}</td>
                  <td className="p-3">{String(prompt.updatedAt || '').slice(0, 10) || '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/text-prompts/${prompt.id}/edit`} className="font-semibold text-[#2271b1] underline">Edit</Link>
                      {isSuperAdmin(adminUser) ? (
                        <DeleteTextPromptButton promptId={prompt.id} promptTitle={prompt.title} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {result.rows.length === 0 ? <tr><td colSpan="5" className="p-6 text-center text-[#646970]">No Text prompts found.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="mt-5 space-y-3 md:hidden">
          {result.rows.map((prompt) => (
            <article key={prompt.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold leading-5 text-slate-900">{prompt.title}</h2>
                  <p className="mt-1 truncate font-mono text-xs text-slate-500">{prompt.slug}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                  prompt.status === 'published'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {prompt.status}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                <div>
                  <dt className="text-slate-500">Category</dt>
                  <dd className="mt-1 font-medium text-slate-700">{prompt.category || 'Uncategorized'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Updated</dt>
                  <dd className="mt-1 font-medium text-slate-700">{String(prompt.updatedAt || '').slice(0, 10) || '—'}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center gap-2">
                <Link
                  href={`/admin/text-prompts/${prompt.id}/edit`}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
                >
                  Edit
                </Link>
                {isSuperAdmin(adminUser) ? (
                  <div className="flex flex-1 justify-center">
                    <DeleteTextPromptButton promptId={prompt.id} promptTitle={prompt.title} />
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {result.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No Text prompts found.
            </p>
          ) : null}
        </div>
        <nav aria-label="Text prompt pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          {result.page > 1 ? <Link href={pageUrl(result.page - 1)} className="underline">Previous</Link> : <span />}
          <span>Page {result.page} of {result.totalPages}</span>
          {result.page < result.totalPages ? <Link href={pageUrl(result.page + 1)} className="underline">Next</Link> : <span />}
          <form action="/admin/text-prompts" className="flex items-center gap-2">
            {query.size ? [...query.entries()].map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />) : null}
            <label htmlFor="text-prompt-page-number">Go to page</label>
            <input
              id="text-prompt-page-number"
              name="page"
              type="number"
              min="1"
              max={result.totalPages}
              defaultValue={result.page}
              className="h-9 w-20 rounded border border-[#8c8f94] px-2"
            />
            <button className="rounded border border-[#8c8f94] px-3 py-1.5 font-semibold">Go</button>
          </form>
        </nav>
      </section>
    </main>
  );
}