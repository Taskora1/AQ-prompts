'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const SUGGESTED_TEXT_CATEGORIES = [
  'Writing & Editing',
  'SEO & Content',
  'Marketing & Social Media',
  'Business & Strategy',
  'Email & Communication',
  'Coding & Development',
  'Education & Learning',
  'Research & Analysis',
  'Productivity & Planning',
];

export default function TextPromptForm({ initialPrompt = null, categories = [] }) {
  const router = useRouter();
  const isEditing = Boolean(initialPrompt?.id);
  const [form, setForm] = useState({
    title: initialPrompt?.title || '',
    prompt: initialPrompt?.prompt || '',
    slug: initialPrompt?.slug || '',
    primaryCategoryId: initialPrompt?.primaryCategoryId || '',
    categoryIds: initialPrompt?.categoryIds || [],
    tags: (initialPrompt?.tags || []).join(', '),
    intro: initialPrompt?.intro || '',
    useCase: initialPrompt?.useCase || '',
    status: initialPrompt?.status || 'draft',
  });
  const [slugEdited, setSlugEdited] = useState(isEditing);
  const [availableCategories, setAvailableCategories] = useState(categories);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryCreatorOpen, setCategoryCreatorOpen] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function toggleCategory(id) {
    setForm((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(id)
        ? current.categoryIds.filter((categoryId) => categoryId !== id)
        : [...current.categoryIds, id],
    }));
  }

  async function createCategory(name = newCategoryName) {
    const categoryName = name.trim();
    if (!categoryName) {
      setCategoryError('Enter a category name.');
      return;
    }

    setCategoryError('');
    setCategoryMessage('');
    setCreatingCategory(true);
    try {
      const response = await fetch('/admin/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryName, libraryType: 'text' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Category could not be created.');

      const created = result.category;
      setAvailableCategories((current) => (
        [...current, created].sort((first, second) => first.name.localeCompare(second.name))
      ));
      setForm((current) => ({
        ...current,
        primaryCategoryId: current.primaryCategoryId || created.id,
        categoryIds: [...new Set([...current.categoryIds.map(Number), Number(created.id)])],
      }));
      setNewCategoryName('');
      setCategoryCreatorOpen(false);
      setCategoryMessage(`“${created.name}” added and selected.`);
    } catch (error) {
      setCategoryError(error.message || 'Category could not be created.');
    } finally {
      setCreatingCategory(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch(
        isEditing ? `/admin/api/text-prompts/${initialPrompt.id}` : '/admin/api/text-prompts',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            categoryIds: [...new Set([Number(form.primaryCategoryId), ...form.categoryIds.map(Number)])],
            tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.fields || {});
        throw new Error(result.error || 'The text prompt could not be saved.');
      }
      router.push('/admin/text-prompts?success=saved');
      router.refresh();
    } catch (error) {
      setMessage(error.message || 'The text prompt could not be saved.');
      setSaving(false);
    }
  }

  const inputClass = 'mt-2 w-full rounded border border-[#8c8f94] bg-white px-3 py-2 text-sm text-[#1d2327]';
  function FieldError({ name }) {
    return errors[name] ? <p className="mt-1 text-xs text-red-700">{errors[name]}</p> : null;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {message ? <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
      <div>
        <label htmlFor="text-prompt-title" className="text-sm font-semibold">Title</label>
        <input
          id="text-prompt-title"
          value={form.title}
          onChange={(event) => {
            const title = event.target.value;
            setForm((current) => ({
              ...current,
              title,
              ...(!slugEdited ? { slug: slugify(title) } : {}),
            }));
          }}
          required
          maxLength={200}
          className={inputClass}
        />
        <FieldError name="title" />
      </div>
      <div>
        <label htmlFor="text-prompt-slug" className="text-sm font-semibold">Slug (admin only)</label>
        <input
          id="text-prompt-slug"
          value={form.slug}
          onChange={(event) => {
            setSlugEdited(true);
            update('slug', event.target.value);
          }}
          required
          maxLength={220}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          className={`${inputClass} font-mono`}
        />
        <FieldError name="slug" />
      </div>
      <div>
        <label htmlFor="text-prompt-body" className="text-sm font-semibold">Prompt text</label>
        <textarea
          id="text-prompt-body"
          value={form.prompt}
          onChange={(event) => update('prompt', event.target.value)}
          required
          maxLength={20_000}
          rows={10}
          className={inputClass}
        />
        <FieldError name="prompt" />
      </div>
      <div>
        <label htmlFor="text-prompt-category" className="text-sm font-semibold">Primary category</label>
        <select
          id="text-prompt-category"
          value={form.primaryCategoryId}
          onChange={(event) => {
            if (event.target.value === '__create__') {
              setCategoryCreatorOpen(true);
              return;
            }
            update('primaryCategoryId', event.target.value);
          }}
          required
          className={inputClass}
        >
          <option value="">Choose a category</option>
          {availableCategories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
          <option value="__create__">Create new category…</option>
        </select>
        <FieldError name="primaryCategoryId" />
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Additional categories</legend>
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => setCategoryCreatorOpen((open) => !open)}
            className="text-sm font-semibold text-[#2271b1] underline"
          >
            Create new category
          </button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {availableCategories.map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.categoryIds.map(Number).includes(Number(category.id))}
                onChange={() => toggleCategory(Number(category.id))}
              />
              {category.name}
            </label>
          ))}
        </div>
        <FieldError name="categoryIds" />
      </fieldset>
      {categoryCreatorOpen ? (
        <section className="rounded border border-[#c3c4c7] bg-[#f6f7f7] p-4" aria-label="Create a text prompt category">
          <label htmlFor="new-text-prompt-category" className="text-sm font-semibold">New category name</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="new-text-prompt-category"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              maxLength={120}
              className="min-h-10 min-w-48 flex-1 rounded border border-[#8c8f94] bg-white px-3 py-2 text-sm text-[#1d2327]"
              placeholder="e.g. Marketing & Social Media"
            />
            <button
              type="button"
              onClick={() => createCategory()}
              disabled={creatingCategory}
              className="rounded bg-[#2271b1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {creatingCategory ? 'Creating…' : 'Create category'}
            </button>
          </div>
          {categoryError ? <p role="alert" className="mt-2 text-xs text-red-700">{categoryError}</p> : null}
          <p className="mt-3 text-xs font-semibold text-[#646970]">Suggested text categories</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_TEXT_CATEGORIES
              .filter((name) => !availableCategories.some((category) => category.name.toLowerCase() === name.toLowerCase()))
              .map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => createCategory(name)}
                  disabled={creatingCategory}
                  className="rounded-full border border-[#8c8f94] bg-white px-3 py-1.5 text-xs font-semibold text-[#1d2327] hover:border-[#2271b1] disabled:opacity-60"
                >
                  + {name}
                </button>
              ))}
          </div>
          <p className="mt-2 text-xs text-[#646970]">Category creation requires Super Admin access.</p>
        </section>
      ) : null}
      {categoryMessage ? <p role="status" className="text-sm text-green-800">{categoryMessage}</p> : null}
      <div>
        <label htmlFor="text-prompt-tags" className="text-sm font-semibold">Tags (comma-separated)</label>
        <input id="text-prompt-tags" value={form.tags} onChange={(event) => update('tags', event.target.value)} className={inputClass} />
        <FieldError name="tags" />
      </div>
      <div>
        <label htmlFor="text-prompt-intro" className="text-sm font-semibold">Description</label>
        <textarea id="text-prompt-intro" value={form.intro} onChange={(event) => update('intro', event.target.value)} maxLength={5_000} rows={3} className={inputClass} />
        <FieldError name="intro" />
      </div>
      <div>
        <label htmlFor="text-prompt-use-case" className="text-sm font-semibold">Use case</label>
        <input id="text-prompt-use-case" value={form.useCase} onChange={(event) => update('useCase', event.target.value)} maxLength={200} className={inputClass} />
        <FieldError name="useCase" />
      </div>
      <div>
        <label htmlFor="text-prompt-status" className="text-sm font-semibold">Status</label>
        <select id="text-prompt-status" value={form.status} onChange={(event) => update('status', event.target.value)} className={inputClass}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <FieldError name="status" />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="rounded bg-[#2271b1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? 'Saving…' : isEditing ? 'Save Text Prompt' : 'Create Text Prompt'}
        </button>
        <Link href="/admin/text-prompts" className="rounded border border-[#8c8f94] px-4 py-2 text-sm font-semibold">Cancel</Link>
      </div>
    </form>
  );
}
