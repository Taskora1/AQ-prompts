'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';

const COLLECTION_TYPES = [
  { value: 'curated', label: 'Curated Collection' },
  { value: 'seasonal', label: 'Seasonal / Holiday' },
  { value: 'trending', label: 'Trending Now' },
  { value: 'beginner', label: 'Beginner Friendly' },
  { value: 'advanced', label: 'Advanced Techniques' },
];

function CollectionForm({ collection, allPrompts, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: collection?.name || '',
    slug: collection?.slug || '',
    description: collection?.description || '',
    type: collection?.type || 'curated',
    promptIds: Array.isArray(collection?.promptIds) ? collection.promptIds : [],
    published: collection?.published !== false,
  });
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const selectedPrompts = form.promptIds
    .map((id) => allPrompts.find((p) => p.id === id))
    .filter(Boolean);

  const searchResults = search.trim()
    ? allPrompts
        .filter(
          (p) =>
            !form.promptIds.includes(p.id) &&
            p.title.toLowerCase().includes(search.toLowerCase())
        )
        .slice(0, 10)
    : [];

  function slugify(value) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await onSave({
        ...form,
        slug: form.slug || slugify(form.name),
      });
    } catch (error) {
      setSaveError(error.message || 'The collection could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back to collections"
          className="rounded border border-[#8c8f94] p-2 transition hover:bg-[#f0f0f1]"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-lg font-semibold">
          {collection ? 'Edit Collection' : 'New Collection'}
        </h2>
      </div>

      <div className="rounded border border-[#dcdcde] bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((c) => ({
                ...c,
                name: e.target.value,
                slug: c.slug || slugify(e.target.value),
              }))}
              placeholder="e.g. Best Portrait Prompts"
              className="mt-2 w-full rounded border border-[#8c8f94] px-3 py-2.5 text-sm outline-none focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold">Slug</label>
            <input
              value={form.slug}
              onChange={(e) => setForm((c) => ({ ...c, slug: e.target.value }))}
              placeholder="best-portrait-prompts"
              className="mt-2 w-full rounded border border-[#8c8f94] px-3 py-2.5 font-mono text-sm outline-none focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
              rows={2}
              placeholder="Brief description of this collection..."
              className="mt-2 w-full resize-y rounded border border-[#8c8f94] px-3 py-2.5 text-sm outline-none focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((c) => ({ ...c, type: e.target.value }))}
              className="mt-2 w-full rounded border border-[#8c8f94] px-3 py-2.5 text-sm outline-none focus:border-[#2271b1]"
            >
              {COLLECTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm((c) => ({ ...c, published: e.target.checked }))}
                className="h-4 w-4 rounded border-[#8c8f94] text-[#2271b1]"
              />
              <span className="text-sm font-semibold">Published</span>
            </label>
          </div>
        </div>
      </div>

      {/* Prompt selection */}
      <div className="rounded border border-[#dcdcde] bg-white p-5">
        <h3 className="text-sm font-semibold">
          Prompts in collection ({selectedPrompts.length})
        </h3>

        {selectedPrompts.length > 0 && (
          <div className="mt-3 space-y-2">
            {selectedPrompts.map((prompt, index) => (
              <div
                key={prompt.id}
                className="flex items-center gap-3 rounded border border-[#dcdcde] bg-[#f6f7f7] px-3 py-2"
              >
                <GripVertical size={14} className="shrink-0 text-[#c3c4c7]" />
                <span className="w-5 shrink-0 text-xs font-bold text-[#646970]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {prompt.title}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setForm((c) => ({
                      ...c,
                      promptIds: c.promptIds.filter((id) => id !== prompt.id),
                    }))
                  }
                  className="shrink-0 rounded p-1 text-[#b32d2e] transition hover:bg-red-50"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative mt-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts to add..."
            className="w-full rounded border border-[#8c8f94] px-3 py-2.5 text-sm outline-none focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
          />
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded border border-[#c3c4c7] bg-white shadow-lg">
              {searchResults.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => {
                    setForm((c) => ({
                      ...c,
                      promptIds: [...c.promptIds, prompt.id],
                    }));
                    setSearch('');
                  }}
                  className="flex w-full items-center justify-between border-b border-[#dcdcde] px-3 py-2.5 text-left last:border-0 hover:bg-[#f0f6fc]"
                >
                  <span className="truncate text-sm font-semibold">{prompt.title}</span>
                  <Plus size={14} className="shrink-0 text-[#2271b1]" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {saveError ? (
          <p role="alert" className="text-sm font-medium text-[#b32d2e]">
            {saveError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !form.name.trim()}
            className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96] disabled:opacity-50"
          >
            <Save size={14} className="mr-1.5" />
            {isSaving ? 'Saving…' : 'Save Collection'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-5 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CollectionsPage({ initialCollections = [], allPrompts = [] }) {
  const [collections, setCollections] = useState(initialCollections);
  const [editing, setEditing] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [listError, setListError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const handleSave = useCallback(async (data) => {
    const method = editing ? 'PUT' : 'POST';
    const url = editing
      ? `/admin/api/collections/${editing.id}`
      : '/admin/api/collections';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'The collection could not be saved.');
    }

    if (editing) {
      setCollections((c) => c.map((col) => (col.id === editing.id ? result.collection : col)));
    } else {
      setCollections((c) => [...c, result.collection]);
    }
    setListError('');
    setEditing(null);
    setIsCreating(false);
  }, [editing]);

  async function handleDelete(id) {
    if (!window.confirm('Delete this collection?')) return;

    setDeletingId(id);
    setListError('');
    try {
      const response = await fetch(`/admin/api/collections/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'The collection could not be deleted.');
      }

      setCollections((c) => c.filter((col) => col.id !== id));
    } catch (error) {
      setListError(error.message || 'The collection could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  }

  if (isCreating || editing) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8">
        <CollectionForm
          collection={editing}
          allPrompts={allPrompts}
          onSave={handleSave}
          onCancel={() => {
            setEditing(null);
            setIsCreating(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prompt Collections</h1>
          <p className="mt-1 text-sm text-[#646970]">
            Group prompts into curated collections for better organization.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin"
            className="inline-flex h-9 items-center gap-2 rounded border border-[#8c8f94] px-3 text-sm font-semibold text-[#2c3338] transition hover:border-[#2271b1] hover:text-[#2271b1]"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex h-9 items-center gap-2 rounded border border-[#2271b1] px-3 text-sm font-semibold text-[#2271b1] transition hover:bg-[#f0f6fc]"
          >
            <Plus size={14} />
            New Collection
          </button>
        </div>
      </div>

      {listError ? (
        <p role="alert" className="mt-5 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-[#b32d2e]">
          {listError}
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        {collections.length === 0 ? (
          <div className="rounded border border-dashed border-[#c3c4c7] bg-white p-14 text-center">
            <p className="font-semibold text-[#1d2327]">No collections yet</p>
            <p className="mt-1 text-sm text-[#646970]">Create your first collection to group prompts.</p>
          </div>
        ) : (
          collections.map((col) => (
            <div
              key={col.id}
              className="flex flex-col gap-4 rounded border border-[#dcdcde] bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#1d2327]">{col.name}</p>
                  <span className="rounded bg-[#f0f0f1] px-2 py-0.5 text-[10px] font-bold uppercase text-[#646970]">
                    {col.type}
                  </span>
                  {col.published ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                      Live
                    </span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Draft
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#646970]">
                  {(col.promptIds || []).length} prompts · /{col.slug}
                </p>
              </div>
              <div className="inline-flex justify-end gap-2 sm:shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(col)}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-[#8c8f94] px-3 text-xs font-semibold transition hover:border-[#2271b1] hover:text-[#2271b1]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(col.id)}
                  disabled={deletingId === col.id}
                  className="inline-flex h-10 items-center gap-1.5 rounded border border-[#d63638] px-3 text-xs font-semibold text-[#b32d2e] transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <Trash2 size={12} />
                  {deletingId === col.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}