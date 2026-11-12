'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Eye,
  FileText,
  Image as ImageIcon,
  Save,
  Tag,
  X,
} from 'lucide-react';

import RichTextEditor from '@/components/ui/RichTextEditor';
import BlockEditor from '@/components/ui/BlockEditor';
import AltTextEditor from '@/components/ui/AltTextEditor';
import { markdownToHtml, htmlToMarkdown, isHtmlContent } from '@/lib/md-conversion';
import { sanitizeBlogBlocks } from '@/lib/blog-content';

// ── Feature flag ──
// Set to `false` to instantly restore the old RichTextEditor.
const USE_BLOCK_EDITOR = true;

const BLOG_CATEGORIES = [
  'Instagram Growth',
  'YouTube Growth',
  'TikTok Growth',
  'Facebook Growth',
  'LinkedIn Growth',
  'X Growth',
  'Creator Growth',
  'AI Tips',
  'Prompt Guides',
  'Photography',
  'Portrait Prompts',
  'Fashion',
  'Lifestyle',
  'Business',
  'Cinematic',
  'Photo Editing',
];

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function uploadImage(file, onProgress) {
  onProgress(5);
  const formData = new FormData();
  formData.set('file', file);

  const response = await fetch('/admin/api/upload', {
    method: 'POST',
    body: formData,
  });

  const contentType = response.headers.get('content-type') || '';
  let result = null;
  if (contentType.includes('application/json')) {
    result = await response.json();
  } else {
    await response.text().catch(() => {});
    result = { error: response.status === 401
      ? 'Your session may have expired. Please refresh the page.'
      : `Upload failed (${response.status})` };
  }

  if (!response.ok) {
    throw new Error(result?.error || 'The image could not be uploaded.');
  }

  onProgress(100);
  return { url: result.url || result.secureUrl };
}

const LEAVE_WARNING = 'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.';

function UnsavedChangesDialog({ open, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-lg border border-[#dcdcde] bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-[#1d2327]">Unsaved changes</h2>
        <p className="mt-2 text-sm leading-6 text-[#50575e]">{LEAVE_WARNING}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-5 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]">
            Stay on page
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className="inline-flex h-10 items-center justify-center rounded bg-[#b32d2e] px-5 text-sm font-semibold text-white transition hover:bg-[#a02828]">
            Leave page
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Draft Restore Banner ── */
function DraftRestoreBanner({ draft, onAccept, onDismiss }) {
  if (!draft) return null;

  const savedDate = draft.savedAt ? new Date(draft.savedAt) : null;
  const timeStr = savedDate
    ? savedDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'an unknown time';

  const preview = (draft.value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <AlertTriangle size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900">
            Draft recovered
            <span className="ml-2 font-normal text-blue-700">
              Saved {timeStr}
            </span>
          </p>
          {preview ? (
            <p className="mt-1 text-xs leading-relaxed text-blue-700/80 line-clamp-2">
              {preview}…
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex h-8 items-center justify-center rounded bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Accept draft
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-8 items-center justify-center rounded border border-blue-300 bg-white px-4 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-blue-400 transition hover:text-blue-600"
          aria-label="Dismiss draft"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Auto-Save Status Indicator ── */
function AutoSaveStatus({ status, lastSavedAt }) {
  const timeStr = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-[#646970]">
      {status === 'saving' && (
        <>
          <Save size={12} className="animate-pulse text-[#2271b1]" />
          <span className="text-[#2271b1]">Saving draft…</span>
        </>
      )}
      {status === 'saved' && timeStr && (
        <>
          <Check size={12} className="text-green-600" />
          <span className="text-green-700">Draft saved {timeStr}</span>
        </>
      )}
      {status === 'idle' && (
        <>
          <Save size={12} />
          <span>Auto-saves every 30s</span>
        </>
      )}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 w-full rounded bg-[#e5e7eb]" />
      <div className="h-10 w-3/4 rounded bg-[#e5e7eb]" />
      <div className="flex gap-2">
        <div className="h-8 w-8 rounded bg-[#e5e7eb]" />
        <div className="h-8 w-8 rounded bg-[#e5e7eb]" />
        <div className="h-8 w-8 rounded bg-[#e5e7eb]" />
        <div className="h-8 w-8 rounded bg-[#e5e7eb]" />
      </div>
      <div className="h-40 w-full rounded bg-[#e5e7eb]" />
    </div>
  );
}

export default function BlogForm({ initialPost = null }) {
  const router = useRouter();
  const isEditing = Boolean(initialPost?.slug);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const autoSaveKey = isEditing
    ? `blog-draft-${initialPost.slug}`
    : 'blog-draft-new';

  const [form, setForm] = useState({
    title: initialPost?.title || '',
    slug: initialPost?.slug || '',
    description: initialPost?.description || initialPost?.seoDescription || '',
    excerpt: initialPost?.excerpt || '',
    category: initialPost?.category || 'Creator Growth',
    author: initialPost?.author || 'Abdul Qudoos',
    authorSlug: initialPost?.authorMeta?.slug || '',
    date: initialPost?.date || '',
    readingTime: initialPost?.readingTime || 5,
    featuredImage: initialPost?.featuredImage || '',
    featuredImageAltText: initialPost?.featuredImageAltText || '',
    tags: Array.isArray(initialPost?.tags) ? initialPost.tags.join(', ') : '',
    content: initialPost?.content || '',
    status: initialPost?.status || 'draft',
  });
  const [authorProfiles, setAuthorProfiles] = useState([]);
  const [authorProfilesError, setAuthorProfilesError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/admin/api/authors')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Author profiles could not be loaded.');
        return result.authors || [];
      })
      .then((authors) => {
        if (!active) return;
        setAuthorProfiles(authors);
        const matchingAuthor = authors.find((author) =>
          (initialPost?.authorMeta?.slug && author.slug === initialPost.authorMeta.slug)
          || author.name.toLowerCase() === String(initialPost?.author || 'Abdul Qudoos').toLowerCase()
        );
        if (matchingAuthor) {
          setForm((current) => ({
            ...current,
            author: matchingAuthor.name,
            authorSlug: matchingAuthor.slug,
          }));
        } else if (initialPost?.authorMeta?.slug) {
          setForm((current) => ({ ...current, authorSlug: '' }));
        }
      })
      .catch((error) => {
        if (active) setAuthorProfilesError(error.message || 'Author profiles could not be loaded.');
      });
    return () => { active = false; };
  }, [initialPost?.author, initialPost?.authorMeta?.slug]);

  // Set default date client-side only to avoid hydration mismatch
  useEffect(() => {
    if (!form.date) {
      setForm((c) => ({ ...c, date: new Date().toISOString().slice(0, 10) }));
    }
  }, []);

  // ── Markdown → HTML conversion for block editor ──
  // MDX files store raw Markdown; TipTap expects HTML.
  // Convert on mount so TipTap renders headings/bold/etc. correctly.
  const [contentReady, setContentReady] = useState(!USE_BLOCK_EDITOR);
  useEffect(() => {
    if (!USE_BLOCK_EDITOR || !isMounted) return;
    const raw = form.content;
    if (!raw || isHtmlContent(raw)) {
      setContentReady(true);
      return;
    }
    // Import conversion lib lazily (client-side only)
    import('@/lib/md-conversion').then(({ markdownToHtml }) => {
      markdownToHtml(raw).then((html) => {
        setForm((c) => (c.content === raw ? { ...c, content: html } : c));
        setContentReady(true);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  const [slugWasEdited, setSlugWasEdited] = useState(isEditing);
  const [featuredImageFile, setFeaturedImageFile] = useState(null);
  const [watermarkedFeaturedPreview, setWatermarkedFeaturedPreview] = useState('');
  const [isPreviewingFeaturedImage, setIsPreviewingFeaturedImage] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showSeo, setShowSeo] = useState(false);
  const [showMetadata, setShowMetadata] = useState(true);

  // Unsaved changes tracking
  const formRef = useRef(null);
  const initialSnapshotRef = useRef('');
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const hasFileChangesRef = useRef(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const pendingNavigationRef = useRef(null);

  // ── Auto-save state ──
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [draftFound, setDraftFound] = useState(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const autoSaveIntervalRef = useRef(null);

  // Stable onChange for RichTextEditor (prevents re-creation on every render)
  const handleContentChange = useCallback((html) => {
    setForm((c) => ({ ...c, content: html }));
  }, []);

  const cancelNavigation = useCallback(() => {
    pendingNavigationRef.current = null;
    setShowLeaveDialog(false);
  }, []);

  const confirmNavigation = useCallback(() => {
    const nav = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setShowLeaveDialog(false);
    if (nav) nav();
  }, []);

  const requestNavigation = useCallback((fn) => {
    pendingNavigationRef.current = fn;
    setShowLeaveDialog(true);
  }, []);

  function computeDirty(snapshot, fileChanges) {
    if (snapshot !== initialSnapshotRef.current) return true;
    return fileChanges;
  }

  useEffect(() => {
    const snapshot = JSON.stringify(form);
    if (!initialSnapshotRef.current) {
      initialSnapshotRef.current = snapshot;
      setIsDirty(false);
    } else {
      setIsDirty(computeDirty(snapshot, hasFileChangesRef.current));
    }
  }, [form]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const markClean = useCallback(() => {
    initialSnapshotRef.current = JSON.stringify(form);
    hasFileChangesRef.current = false;
    setIsDirty(false);
  }, [form]);

  // ── Auto-save to localStorage (ref-based, interval created once) ──
  const formSnapshotRef = useRef(form);
  useEffect(() => { formSnapshotRef.current = form; }, [form]);

  const saveToStorage = useCallback(() => {
    try {
      const snapshot = JSON.stringify(formSnapshotRef.current);
      const data = {
        value: snapshot,
        savedAt: new Date().toISOString(),
        label: formSnapshotRef.current.title || 'Untitled post',
      };
      localStorage.setItem(autoSaveKey, JSON.stringify(data));
      setLastSavedAt(data.savedAt);
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    } catch {
      // localStorage full or unavailable
    }
  }, [autoSaveKey]);

  // Auto-save interval (every 30 seconds, only when dirty)
  useEffect(() => {
    autoSaveIntervalRef.current = setInterval(() => {
      if (isDirtyRef.current) {
        setAutoSaveStatus('saving');
        setTimeout(saveToStorage, 300);
      }
    }, 30_000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [saveToStorage]);

  // ── Check for existing draft on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(autoSaveKey);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (!data || !data.value) return;

      const currentSnapshot = JSON.stringify(form);
      if (data.value === currentSnapshot) return;

      const savedDate = new Date(data.savedAt);
      const daysSince = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 7) {
        localStorage.removeItem(autoSaveKey);
        return;
      }

      setDraftFound(data);
    } catch {
      // Invalid data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptDraft() {
    if (!draftFound) return;
    try {
      const parsed = JSON.parse(draftFound.value);
      const restored = { ...form, ...parsed };
      if (restored.content && !isHtmlContent(restored.content)) {
        restored.content = await markdownToHtml(restored.content);
      }
      setForm(restored);
      setDraftFound(null);
      setDraftDismissed(true);
      setMessage('');
      setErrors({});
    } catch {
      setDraftFound(null);
    }
  }

  function dismissDraft() {
    localStorage.removeItem(autoSaveKey);
    setDraftFound(null);
    setDraftDismissed(true);
  }

  // Browser close protection
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (isDirtyRef.current) e.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // In-app navigation protection
  useEffect(() => {
    function handleClick(e) {
      if (!isDirtyRef.current) return;
      const anchor = e.target.closest('a[href]');
      if (!anchor) return;
      try {
        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
      } catch { return; }
      if (anchor.type === 'submit' || anchor.closest('form') === formRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      requestNavigation(() => { window.location.href = anchor.href; });
    }
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [requestNavigation]);

  function updateField(e) {
    const { name, value } = e.target;
    setForm((c) => {
      const next = { ...c, [name]: value };
      if (name === 'title' && !slugWasEdited) next.slug = slugify(value);
      return next;
    });
    setErrors((c) => ({ ...c, [name]: undefined }));
  }

  function updateSlug(e) {
    setSlugWasEdited(true);
    updateField(e);
  }

  function chooseFeaturedImage(e) {
    const file = e.target.files?.[0] || null;
    setFeaturedImageFile(file);
    setWatermarkedFeaturedPreview('');
    if (file) {
      hasFileChangesRef.current = true;
      setIsDirty(computeDirty(JSON.stringify(form), true));
    }
    setErrors((c) => ({ ...c, featuredImage: undefined }));
  }

  async function createFeaturedWatermarkedPreview() {
    if (!featuredImageFile || isPreviewingFeaturedImage || isSaving) return;

    setIsPreviewingFeaturedImage(true);
    setMessage('');
    setUploadStatus('Uploading image for watermarked preview…');
    try {
      const uploaded = await uploadImage(featuredImageFile, (progress) => {
        setUploadStatus(`Preparing watermarked preview: ${progress}%`);
      });
      setWatermarkedFeaturedPreview({ file: featuredImageFile, url: uploaded.url });
    } catch (error) {
      setMessage(error.message || 'The watermarked preview could not be created.');
    } finally {
      setUploadStatus('');
      setIsPreviewingFeaturedImage(false);
    }
  }

  function addTag(tag) {
    const currentTags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (!currentTags.includes(tag)) {
      setForm((c) => ({ ...c, tags: [...currentTags, tag].join(', ') }));
    }
  }

  function removeTag(tag) {
    const currentTags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    setForm((c) => ({ ...c, tags: currentTags.filter((t) => t !== tag).join(', ') }));
  }

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setMessage('');

    if (!form.title?.trim()) {
      setErrors({ title: 'Title is required.' });
      return;
    }
    if (!form.content?.trim()) {
      setErrors({ content: 'Content is required.' });
      return;
    }

    // Drop empty prompt blocks before saving — they render as copy boxes
    // that copy nothing (the Birthday-post bug). Same for empty FAQ blocks
    // and extra FAQ sections (one FAQ per post). The server strips them
    // too; doing it here keeps the editor and the saved post in step.
    const { html: cleanContent, removedEmptyPrompts, removedEmptyFaqs, removedExtraFaqs } = sanitizeBlogBlocks(form.content);
    if (removedEmptyPrompts > 0 || removedEmptyFaqs > 0 || removedExtraFaqs > 0) {
      setForm((c) => ({ ...c, content: cleanContent }));
    }

    // Alt text validation — mandatory when publishing
    if (form.status === 'published') {
      const hasFeatured = !!(featuredImageFile || form.featuredImage);
      const missingAltImages = [];
      if (hasFeatured && !form.featuredImageAltText?.trim()) {
        missingAltImages.push('Featured image');
      }
      if (missingAltImages.length > 0) {
        setErrors({ featuredImageAltText: `Please add alt text to ${missingAltImages.join(', ')} before publishing.` });
        setMessage('');
        setIsSaving(false);
        return;
      }
    }

    setIsSaving(true);

    try {
      let featuredImage = form.featuredImage;

      if (featuredImageFile) {
        const uploaded = watermarkedFeaturedPreview?.file === featuredImageFile
          ? { url: watermarkedFeaturedPreview.url }
          : await uploadImage(featuredImageFile, (progress) => {
            setUploadStatus(`Uploading featured image: ${progress}%`);
          });
        featuredImage = uploaded.url;
        setWatermarkedFeaturedPreview({ file: featuredImageFile, url: uploaded.url });
      }

      setUploadStatus('Saving post…');

      // Neon stores HTML directly — no need to convert to Markdown
      const payload = {
        ...form,
        content: cleanContent,
        contentHtml: cleanContent,
        contentText: cleanContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        featuredImage,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        readingTime: Number(form.readingTime) || 5,
      };

      const url = isEditing
        ? `/admin/api/blog/${initialPost.slug}`
        : '/admin/api/blog';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('content-type') || '';
      let result = null;
      if (contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const errorText = await response.text().catch(() => '');
        console.error(`API Error (${response.status}):`, errorText);
        throw new Error(`Server returned ${response.status}: Check network tab for details.`);
      }

      if (!response.ok) {
        setErrors(result.fields || {});
        throw new Error(result.error || 'The post could not be saved.');
      }

      // Clear draft on successful save
      try {
        localStorage.removeItem(autoSaveKey);
      } catch {
        // A storage cleanup failure must not turn a successful save into an error.
      }

      markClean();
      router.push('/admin/blog');
      router.refresh();
    } catch (error) {
      setMessage(error.message || 'The post could not be saved.');
      setUploadStatus('');
      setIsSaving(false);
    }
  }

  const inputClass = 'mt-2 w-full rounded border border-[#8c8f94] bg-white px-3 text-sm text-[#1d2327] outline-none transition focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]';

  function FieldError({ name }) {
    return errors[name] ? <p className="mt-1 text-xs text-red-700">{errors[name]}</p> : null;
  }

  const currentTags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
  const wordCount = form.content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
  const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-6" noValidate suppressHydrationWarning>
      {/* ── Draft Restore Banner ── */}
      {draftFound && !draftDismissed && (
        <DraftRestoreBanner
          draft={draftFound}
          onAccept={acceptDraft}
          onDismiss={dismissDraft}
        />
      )}

      {/* ── Unsaved Content Warning Banner ── */}
      {isDirty && !showLeaveDialog && (
        <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span className="flex-1">
            You have unsaved changes. Changes are auto-saved as drafts every 30 seconds.
          </span>
          <span className="text-xs text-amber-600">
            {hasFileChangesRef.current ? '⚠ Image changes need manual save' : ''}
          </span>
        </div>
      )}

      {message ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      ) : null}

      {/* ── Title & Slug ── */}
      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="blog-title" className="block text-sm font-semibold">Title</label>
            <input
              id="blog-title"
              name="title"
              value={form.title}
              onChange={updateField}
              required
              maxLength={200}
              placeholder="Enter your blog post title"
              className={`${inputClass} h-11 text-lg font-semibold`}
            />
            <FieldError name="title" />
          </div>
          <div className="sm:w-64">
            <label htmlFor="blog-slug" className="block text-sm font-semibold">Slug</label>
            <input
              id="blog-slug"
              name="slug"
              value={form.slug}
              onChange={updateSlug}
              required
              maxLength={220}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              className={`${inputClass} h-11 font-mono`}
            />
            <p className="mt-1 text-xs text-[#646970]">URL-friendly identifier</p>
            <FieldError name="slug" />
          </div>
        </div>
      </div>

      {/* ── Status & Meta ── */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="blog-status" className="block text-sm font-semibold">Status</label>
          <select
            id="blog-status"
            name="status"
            value={form.status}
            onChange={updateField}
            className={`${inputClass} h-11`}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div>
          <label htmlFor="blog-category" className="block text-sm font-semibold">Category</label>
          <select
            id="blog-category"
            name="category"
            value={form.category}
            onChange={updateField}
            className={`${inputClass} h-11`}
          >
            {BLOG_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="blog-author" className="block text-sm font-semibold">Author</label>
          <select
            id="blog-author"
            value={form.authorSlug}
            onChange={(event) => {
              const selected = authorProfiles.find((author) => author.slug === event.target.value);
              setForm((current) => ({
                ...current,
                authorSlug: selected?.slug || '',
                author: selected?.name || current.author,
              }));
            }}
            className={`${inputClass} h-11`}
          >
            {!authorProfiles.some((author) => author.slug === form.authorSlug) ? (
              <option value="">{form.author || 'Select an author profile'}</option>
            ) : null}
            {authorProfiles.map((author) => (
              <option key={author.id} value={author.slug}>{author.name}</option>
            ))}
          </select>
          {authorProfilesError ? <p role="alert" className="mt-1 text-xs text-red-700">{authorProfilesError}</p> : null}
          {!authorProfilesError && authorProfiles.length === 0 ? (
            <p className="mt-1 text-xs text-[#646970]">No author profiles available.</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="blog-date" className="block text-sm font-semibold">Publish date</label>
          <input
            id="blog-date"
            type="date"
            name="date"
            value={form.date}
            onChange={updateField}
            className={`${inputClass} h-11`}
          />
        </div>
      </div>

      {/* ── Reading Time ── */}
      <div className="flex items-center gap-4 text-sm text-[#646970]">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          {wordCount.toLocaleString()} words
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          ~{estimatedReadTime} min read
        </span>
        <div>
          <label htmlFor="blog-reading-time" className="font-semibold text-[#1d2327]">Override reading time:</label>
          <input
            id="blog-reading-time"
            type="number"
            name="readingTime"
            value={form.readingTime}
            onChange={updateField}
            min={1}
            max={60}
            className="ml-2 w-16 rounded border border-[#8c8f94] px-2 py-1 text-sm"
          />
          <span className="ml-1 text-xs">min</span>
        </div>
      </div>

      {/* ── Excerpt ── */}
      <div>
        <label htmlFor="blog-excerpt" className="block text-sm font-semibold">Excerpt</label>
        <textarea
          id="blog-excerpt"
          name="excerpt"
          value={form.excerpt}
          onChange={updateField}
          rows={2}
          maxLength={500}
          placeholder="Short summary for cards and previews"
          className={`${inputClass} resize-y py-3 leading-6`}
        />
        <p className="mt-1 text-xs text-[#646970]">{(form.excerpt || '').length} / 500 characters</p>
        <FieldError name="excerpt" />
      </div>

      {/* ── Main Content ── */}
      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1d2327]">Content</h2>
          <span className="text-xs text-[#646970]">
            Use the Prompt block toolbar button for prompts that readers should be able to copy.
          </span>
        </div>
        <div className="mt-4">
          {USE_BLOCK_EDITOR ? (
            contentReady ? (
              <BlockEditor
                value={form.content}
                onChange={handleContentChange}
                rows={20}
                placeholder="Write your blog post content here…"
              />
            ) : (
              <EditorSkeleton />
            )
          ) : (
            <RichTextEditor
              id="blog-content"
              value={form.content}
              onChange={handleContentChange}
              rows={20}
              placeholder="Write your blog post content here… Use the toolbar for formatting, links, and headings."
              showPreviewProp
              autoSaveKey={isEditing ? `blog-${initialPost.slug}` : `blog-new-${form.slug || 'untitled'}`}
            />
          )}
          <FieldError name="content" />
        </div>
      </div>

      {/* ── Featured Image ── */}
      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-[#2271b1]" />
          <h2 className="text-base font-semibold text-[#1d2327]">Featured Image</h2>
        </div>

        <div className="mt-4">
          <label htmlFor="blog-featured-image" className="block text-sm font-semibold">
            Upload image {isEditing ? <span className="font-normal text-[#646970]">(optional replacement)</span> : null}
          </label>
          <input
            id="blog-featured-image"
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            onChange={chooseFeaturedImage}
            disabled={isSaving || isPreviewingFeaturedImage}
            className={`${inputClass} h-11 cursor-pointer py-2 file:mr-3 file:rounded file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold`}
          />
          <p className="mt-1 text-xs text-[#646970]">JPEG, PNG, or WebP; maximum 4 MB.</p>
          <FieldError name="featuredImage" />
        </div>

        {form.featuredImage && !featuredImageFile ? (
          <div className="relative mt-3 h-40 w-64 overflow-hidden rounded border border-[#dcdcde] bg-[#f0f0f1]">
            <Image
              src={form.featuredImage}
              alt="Current featured image"
              fill
              sizes="256px"
              className="object-cover"
            />
          </div>
        ) : null}

        {watermarkedFeaturedPreview ? (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold">Watermarked preview</p>
            <div className="relative h-40 w-64 overflow-hidden rounded border border-[#c3c4c7] bg-white">
              <Image
                src={watermarkedFeaturedPreview.url}
                alt="Preview of the uploaded image with the AQPrompts watermark"
                fill
                sizes="256px"
                className="object-contain"
              />
            </div>
          </div>
        ) : null}
        {featuredImageFile && !watermarkedFeaturedPreview ? (
          <button
            type="button"
            onClick={createFeaturedWatermarkedPreview}
            disabled={isSaving || isPreviewingFeaturedImage}
            className="mt-3 rounded border border-[#2271b1] px-3 py-2 text-xs font-semibold text-[#135e96] hover:bg-[#f0f6fc] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPreviewingFeaturedImage ? 'Preparing preview…' : 'Preview watermarked image'}
          </button>
        ) : null}

        {(form.featuredImage || featuredImageFile) && (
          <div className="mt-4">
            <label htmlFor="blog-featured-image-alt" className="block text-sm font-semibold">
              Alt Text <span className="text-red-600">*</span>
            </label>
            <input
              id="blog-featured-image-alt"
              name="featuredImageAltText"
              value={form.featuredImageAltText}
              onChange={updateField}
              placeholder="Describe what is shown in this image..."
              maxLength={300}
              className={`${inputClass} h-11`}
            />
            <p className="mt-1 text-xs text-[#646970]">
              {form.featuredImageAltText?.trim()
                ? '✓ Alt text added'
                : '⚠ Alt text required for publishing'}
            </p>
            <FieldError name="featuredImageAltText" />
          </div>
        )}
      </div>

      {/* ── Tags ── */}
      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-[#2271b1]" />
          <h2 className="text-base font-semibold text-[#1d2327]">Tags</h2>
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {currentTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-[#c3c4c7] bg-white px-3 py-1 text-xs font-semibold text-[#1d2327]"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 rounded-full p-0.5 text-[#646970] hover:bg-[#f0f0f1] hover:text-[#b32d2e]"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="blog-tags-input" className="block text-sm font-semibold">Add tags</label>
          <input
            id="blog-tags-input"
            type="text"
            placeholder="Type a tag and press Enter"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const tag = e.target.value.trim();
                if (tag) {
                  addTag(tag);
                  e.target.value = '';
                }
              }
            }}
            className={`${inputClass} h-10`}
          />
          <p className="mt-1 text-xs text-[#646970]">Separate with commas or press Enter</p>
        </div>

        <div className="mt-3">
          <label htmlFor="blog-tags-comma" className="block text-sm font-semibold">Or enter comma-separated tags</label>
          <input
            id="blog-tags-comma"
            name="tags"
            value={form.tags}
            onChange={updateField}
            placeholder="portrait, AI, fashion, Instagram"
            className={`${inputClass} h-10`}
          />
        </div>
      </div>

      {/* ── SEO ── */}
      <details
        open={showSeo}
        onToggle={(e) => setShowSeo(e.target.open)}
        className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4"
      >
        <summary className="cursor-pointer text-base font-semibold text-[#1d2327]">
          SEO Settings
        </summary>
        <p className="mt-2 text-xs text-[#646970]">
          Optional metadata for search engine optimization.
        </p>

        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="blog-description" className="block text-sm font-semibold">Meta Description</label>
            <span className="text-xs text-[#646970]">
              {(form.description || '').length} characters · ideal 150–160
            </span>
          </div>
          <textarea
            id="blog-description"
            name="description"
            value={form.description}
            onChange={updateField}
            rows={3}
            maxLength={300}
            placeholder="Leave empty to use the excerpt"
            className={`${inputClass} resize-y py-3 leading-6`}
          />
          <FieldError name="description" />
        </div>
      </details>

      {/* ── Preview Info ── */}
      <details
        open={showMetadata}
        onToggle={(e) => setShowMetadata(e.target.open)}
        className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4"
      >
        <summary className="cursor-pointer text-base font-semibold text-[#1d2327]">
          Post Preview
        </summary>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center gap-2 text-[#646970]">
            <Eye className="h-4 w-4" />
            <span>Slug: <code className="rounded bg-white px-1 font-mono">{form.slug || '—'}</code></span>
          </div>
          <div className="flex items-center gap-2 text-[#646970]">
            <Calendar className="h-4 w-4" />
            <span>Published: {form.date || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-[#646970]">
            <Clock className="h-4 w-4" />
            <span>Reading time: ~{form.readingTime || estimatedReadTime} min</span>
          </div>
          <div className="flex items-center gap-2 text-[#646970]">
            <FileText className="h-4 w-4" />
            <span>Words: {wordCount.toLocaleString()}</span>
          </div>
        </div>
      </details>

      {/* ── Submit ── */}
      {(isSaving || isPreviewingFeaturedImage) && uploadStatus ? (
        <p role="status" className="text-sm font-medium text-[#50575e]">{uploadStatus}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[#dcdcde] pt-5">
        <button
          type="submit"
          disabled={isSaving || isPreviewingFeaturedImage}
          className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-6 text-sm font-semibold text-white transition hover:bg-[#135e96] disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : isEditing ? 'Update Post' : 'Publish Post'}
        </button>
        <Link
          href="/admin/blog"
          className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-6 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]"
        >
          Cancel
        </Link>
        {isEditing && (
          <Link
            href={`/blog/${form.slug}`}
            target="_blank"
            className="inline-flex h-10 items-center justify-center rounded border border-[#2271b1] px-6 text-sm font-semibold text-[#2271b1] transition hover:bg-[#f0f6fc]"
          >
            View live →
          </Link>
        )}

        {/* Auto-save status indicator */}
        <div className="ml-auto">
          <AutoSaveStatus status={autoSaveStatus} lastSavedAt={lastSavedAt} />
        </div>
      </div>

      <UnsavedChangesDialog
        open={showLeaveDialog}
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />
    </form>
  );
}