'use client';

import { useState } from 'react';

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function CategoryManager({ initialCategories = [] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [newCategory, setNewCategory] = useState({ name: '', slug: '' });
  const [newSlugEdited, setNewSlugEdited] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ name: '', slug: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  function updateNewName(event) {
    const name = event.target.value;
    setNewCategory((current) => ({
      ...current,
      name,
      slug: newSlugEdited ? current.slug : slugify(name),
    }));
  }

  function beginEdit(category) {
    setEditingId(category.id);
    setEditValues({ name: category.name, slug: category.slug });
    setMessage('');
    setError('');
  }

  async function createCategory(event) {
    event.preventDefault();
    setBusyId('create');
    setMessage('');
    setError('');

    try {
      const response = await fetch('/admin/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategory),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The category could not be created.');

      setCategories((current) => [...current, result.category].sort((a, b) =>
        a.name.localeCompare(b.name)
      ));
      setNewCategory({ name: '', slug: '' });
      setNewSlugEdited(false);
      setMessage(`Created “${result.category.name}”.`);
    } catch (createError) {
      setError(createError.message || 'The category could not be created.');
    } finally {
      setBusyId(null);
    }
  }

  async function saveCategory(category) {
    const publicSlugChanged =
      category.hasPublicPage && editValues.slug !== category.slug;
    if (
      publicSlugChanged
      && !window.confirm(
        `This category is linked to /tools/ai-image-prompts/${category.publicRouteSlug}. Changing its admin slug will not change that hardcoded public URL. Continue?`,
      )
    ) {
      return;
    }

    setBusyId(category.id);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`/admin/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The category could not be updated.');

      setCategories((current) => current.map((item) =>
        item.id === category.id ? result.category : item
      ));
      setEditingId(null);
      setMessage(`Updated “${result.category.name}”.`);
    } catch (updateError) {
      setError(updateError.message || 'The category could not be updated.');
    } finally {
      setBusyId(null);
    }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Delete “${category.name}”?`)) return;

    setBusyId(category.id);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`/admin/api/categories/${category.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The category could not be deleted.');

      setCategories((current) => current.filter((item) => item.id !== category.id));
      setMessage(`Deleted “${category.name}”.`);
    } catch (deleteError) {
      setError(deleteError.message || 'The category could not be deleted.');
    } finally {
      setBusyId(null);
    }
  }

  const inputClass =
    'h-10 w-full rounded border border-[#8c8f94] bg-white px-3 text-sm text-[#1d2327] outline-none focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]';

  return (
    <>
      <form
        onSubmit={createCategory}
        className="rounded border border-[#c3c4c7] bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold">Add New Category</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="category-name" className="block text-sm font-semibold">Name</label>
            <input
              id="category-name"
              value={newCategory.name}
              onChange={updateNewName}
              required
              maxLength={120}
              className={`mt-2 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="category-slug" className="block text-sm font-semibold">Slug</label>
            <input
              id="category-slug"
              value={newCategory.slug}
              onChange={(event) => {
                setNewSlugEdited(true);
                setNewCategory((current) => ({ ...current, slug: event.target.value }));
              }}
              required
              maxLength={120}
              className={`mt-2 font-mono ${inputClass}`}
            />
          </div>
          <button
            type="submit"
            disabled={busyId === 'create'}
            className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busyId === 'create' ? 'Adding…' : 'Add Category'}
          </button>
        </div>
      </form>

      {message ? (
        <div role="status" className="mt-5 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-5 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mt-6 overflow-hidden rounded border border-[#c3c4c7] bg-white shadow-sm">
        <div className="border-b border-[#c3c4c7] px-5 py-4">
          <h2 className="font-semibold">All Categories ({categories.length})</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead className="bg-[#f6f7f7] text-sm">
              <tr>
                <th className="border-b border-[#c3c4c7] px-4 py-3">Name</th>
                <th className="border-b border-[#c3c4c7] px-4 py-3">Slug</th>
                <th className="w-32 border-b border-[#c3c4c7] px-4 py-3">Prompts</th>
                <th className="w-44 border-b border-[#c3c4c7] px-4 py-3">Public page</th>
                <th className="w-48 border-b border-[#c3c4c7] px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const isEditing = editingId === category.id;
                const publicSlugChanged =
                  isEditing && category.hasPublicPage && editValues.slug !== category.slug;

                return (
                  <tr key={category.id} className="border-b border-[#dcdcde] last:border-0">
                    <td className="px-4 py-3 align-top">
                      {isEditing ? (
                        <input
                          value={editValues.name}
                          onChange={(event) => setEditValues((current) => ({
                            ...current,
                            name: event.target.value,
                          }))}
                          className={inputClass}
                        />
                      ) : (
                        <span className="font-semibold text-[#1d2327]">{category.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {isEditing ? (
                        <>
                          <input
                            value={editValues.slug}
                            onChange={(event) => setEditValues((current) => ({
                              ...current,
                              slug: event.target.value,
                            }))}
                            className={`font-mono ${inputClass}`}
                          />
                          {publicSlugChanged ? (
                            <p className="mt-1 max-w-sm text-xs text-amber-700">
                              Warning: the public route remains /tools/ai-image-prompts/{category.publicRouteSlug}.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <code className="text-xs text-[#50575e]">{category.slug}</code>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#50575e]">{category.promptCount}</td>
                    <td className="px-4 py-3 text-sm">
                      {category.hasPublicPage ? (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                          /{category.publicRouteSlug}
                        </span>
                      ) : (
                        <span className="text-[#8c8f94]">No public page</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {isEditing ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveCategory(category)}
                            disabled={busyId === category.id}
                            className="rounded bg-[#2271b1] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded border border-[#8c8f94] px-3 py-2 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => beginEdit(category)}
                            className="rounded border border-[#8c8f94] px-3 py-2 text-xs font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCategory(category)}
                            disabled={busyId === category.id}
                            title={
                              category.hasPublicPage
                                ? 'This category has a public page and cannot be deleted here.'
                                : category.promptCount > 0
                                  ? `${category.promptCount} prompts use this category — reassign them first.`
                                  : 'Delete category'
                            }
                            className="rounded border border-[#d63638] px-3 py-2 text-xs font-semibold text-[#b32d2e] disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {categories.map((category) => {
            const isEditing = editingId === category.id;
            const publicSlugChanged =
              isEditing && category.hasPublicPage && editValues.slug !== category.slug;

            return (
              <article key={category.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor={`mobile-category-name-${category.id}`} className="block text-xs font-semibold text-slate-500">Category name</label>
                      <input
                        id={`mobile-category-name-${category.id}`}
                        value={editValues.name}
                        onChange={(event) => setEditValues((current) => ({ ...current, name: event.target.value }))}
                        className={`mt-1 ${inputClass}`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`mobile-category-slug-${category.id}`} className="block text-xs font-semibold text-slate-500">Slug</label>
                      <input
                        id={`mobile-category-slug-${category.id}`}
                        value={editValues.slug}
                        onChange={(event) => setEditValues((current) => ({ ...current, slug: event.target.value }))}
                        className={`mt-1 font-mono ${inputClass}`}
                      />
                      {publicSlugChanged ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Public URL remains /tools/ai-image-prompts/{category.publicRouteSlug}.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900">{category.name}</h3>
                        <code className="mt-1 block break-all text-xs text-slate-500">{category.slug}</code>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {category.promptCount} prompts
                      </span>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
                      <span className="text-slate-500">Public page: </span>
                      {category.hasPublicPage ? (
                        <span className="font-medium text-green-700">/{category.publicRouteSlug}</span>
                      ) : (
                        <span className="text-slate-500">No public page</span>
                      )}
                    </div>
                  </>
                )}
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveCategory(category)}
                        disabled={busyId === category.id}
                        className="h-10 flex-1 rounded-lg bg-blue-600 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busyId === category.id ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => beginEdit(category)}
                        className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCategory(category)}
                        disabled={busyId === category.id}
                        title={
                          category.hasPublicPage
                            ? 'This category has a public page and cannot be deleted here.'
                            : category.promptCount > 0
                              ? `${category.promptCount} prompts use this category — reassign them first.`
                              : 'Delete category'
                        }
                        className="h-10 flex-1 rounded-lg border border-red-200 text-sm font-semibold text-red-700 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
