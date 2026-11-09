'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SeoAuditPanel from '@/components/ui/SeoAuditPanel';
import InternalLinkSuggestions from '@/components/ui/InternalLinkSuggestions';
import AltTextEditor from '@/components/ui/AltTextEditor';
import BlockEditor from '@/components/ui/BlockEditor';
import { markdownToHtml } from '@/lib/md-conversion';
import { Save, Check, AlertTriangle, X, Calendar, Clock } from 'lucide-react';

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const MAX_IMAGES = 12;
const MAX_RELATED_PROMPTS = 8;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function safeFilename(filename) {
  const dotIndex = filename.lastIndexOf('.');
  const extension = dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';
  const basename = (dotIndex >= 0 ? filename.slice(0, dotIndex) : filename)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100);

  return `${basename || 'prompt-image'}${extension}`;
}

function validateFiles(files) {
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return 'Images must be JPEG, PNG, or WebP files.';
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return 'Each image must be 4 MB or smaller.';
    }
  }
  return '';
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
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      confirmRef.current?.focus();
    } else if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-lg border border-[#dcdcde] bg-white p-6 shadow-xl">
        <h2 id="unsaved-changes-title" className="text-base font-semibold text-[#1d2327]">
          Unsaved changes
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#50575e]">
          {LEAVE_WARNING}
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-5 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]"
          >
            Stay on page
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center rounded bg-[#b32d2e] px-5 text-sm font-semibold text-white transition hover:bg-[#a02828]"
          >
            Leave page
          </button>
        </div>
      </div>
    </div>
  );
}

function UnsavedChangesLink({ href, isDirty, onConfirmNavigate, className, children }) {
  if (!isDirty) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        onConfirmNavigate(href);
      }}
    >
      {children}
    </a>
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

  // Strip HTML tags for preview
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

export default function PromptForm({
  initialPrompt = null,
  availableCategories = [],
  availablePrompts = [],
  canManageCategories = false,
}) {
  const router = useRouter();
  const isEditing = Boolean(initialPrompt?.id);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // Compute auto-save key
  const autoSaveKey = isEditing
    ? `prompt-draft-${initialPrompt.id}`
    : 'prompt-draft-new';

  const [form, setForm] = useState({
    title: initialPrompt?.title || '',
    prompt: initialPrompt?.prompt || '',
    slug: initialPrompt?.slug || '',
    image: initialPrompt?.image || '',
    images: Array.isArray(initialPrompt?.images) ? initialPrompt.images : [],
    status: initialPrompt?.status || 'draft',
    primaryCategoryId: initialPrompt?.primaryCategoryId || '',
    categoryIds: Array.isArray(initialPrompt?.categoryIds)
      ? initialPrompt.categoryIds
      : [],
    tags: Array.isArray(initialPrompt?.tags) ? initialPrompt.tags.join(', ') : '',
    intro: initialPrompt?.intro || '',
    customizationTips: Array.isArray(initialPrompt?.customizationTips)
      ? initialPrompt.customizationTips
      : [],
    variations: Array.isArray(initialPrompt?.variations) ? initialPrompt.variations : [],
    recommendedTool: initialPrompt?.recommendedTool || '',
    toolNote: initialPrompt?.toolNote || '',
    howToUse: Array.isArray(initialPrompt?.howToUse) ? initialPrompt.howToUse : [],
    faqs: Array.isArray(initialPrompt?.faqs) ? initialPrompt.faqs : [],
    tools: Array.isArray(initialPrompt?.tools) ? initialPrompt.tools : [],
    metaDescription: initialPrompt?.metaDescription || '',
    ogImage: initialPrompt?.ogImage || '',
    relatedPromptIds: Array.isArray(initialPrompt?.relatedPromptIds)
      ? initialPrompt.relatedPromptIds
      : [],
    recommendedAspectRatio: initialPrompt?.recommendedAspectRatio || '',
    aspectRatioReason: initialPrompt?.aspectRatioReason || '',
    reviewedAt: initialPrompt?.reviewedAt || '',
    generationTested: Boolean(initialPrompt?.generationTested),
    generationTestedDate: initialPrompt?.generationTestedDate || '',
    generationTestedTool: initialPrompt?.generationTestedTool || '',
    scheduledAt: initialPrompt?.scheduledAt || '',
    imageAltTexts: initialPrompt?.imageAltTexts || {},
  });
  const [introEditorValue, setIntroEditorValue] = useState(initialPrompt?.intro || '');
  const [introEditorReady, setIntroEditorReady] = useState(false);
  const [slugWasEdited, setSlugWasEdited] = useState(isEditing);
  const [categoryOptions, setCategoryOptions] = useState(availableCategories);
  const [newCategory, setNewCategory] = useState({ name: '', slug: '' });
  const [newCategorySlugEdited, setNewCategorySlugEdited] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [primaryFile, setPrimaryFile] = useState(null);
  const [watermarkedPreview, setWatermarkedPreview] = useState('');
  const [isPreviewingPrimary, setIsPreviewingPrimary] = useState(false);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [primaryFileAltText, setPrimaryFileAltText] = useState('');
  const [galleryFileAltTexts, setGalleryFileAltTexts] = useState([]);
  const [ogImageMode, setOgImageMode] = useState(
    initialPrompt?.ogImage ? 'custom' : 'primary',
  );
  const [ogImageFile, setOgImageFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [relatedSearch, setRelatedSearch] = useState('');
  const introWordCount = String(introEditorValue || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;\s]+;/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
  const promptOptionById = useMemo(
    () => new Map(availablePrompts.map((prompt) => [prompt.id, prompt])),
    [availablePrompts],
  );
  const relatedSearchResults = useMemo(() => {
    const query = relatedSearch.trim().toLowerCase();
    if (!query) return [];

    return availablePrompts
      .filter((prompt) =>
        prompt.id !== initialPrompt?.id
        && !form.relatedPromptIds.includes(prompt.id)
        && prompt.title.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [availablePrompts, form.relatedPromptIds, initialPrompt?.id, relatedSearch]);

  useEffect(() => {
    if (!isMounted) return undefined;
    let active = true;
    markdownToHtml(initialPrompt?.intro || '')
      .then((html) => {
        if (!active) return;
        setIntroEditorValue(html);
        setIntroEditorReady(true);
      })
      .catch((error) => {
        if (!active) return;
        console.error('Prompt intro could not be prepared for editing.', error);
        setIntroEditorReady(true);
        setMessage('The intro could not be loaded into the editor. Refresh the page and try again.');
      });

    return () => {
      active = false;
    };
  }, [isMounted, initialPrompt?.intro]);

  // ── Unsaved-changes tracking ──
  const formRef = useRef(null);
  const initialSnapshotRef = useRef('');
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const hasFileChangesRef = useRef(false);

  // ── Navigation guard dialog state ──
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const pendingNavigationRef = useRef(null);

  // ── Auto-save state ──
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [draftFound, setDraftFound] = useState(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const autoSaveIntervalRef = useRef(null);

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

  const requestNavigation = useCallback((navigationFn) => {
    pendingNavigationRef.current = navigationFn;
    setShowLeaveDialog(true);
  }, []);

  function computeDirty(snapshot, fileChanges) {
    if (snapshot !== initialSnapshotRef.current) return true;
    return fileChanges;
  }

  useEffect(() => {
    const snapshot = JSON.stringify(form);
    if (!initialSnapshotRef.current) {
      // First render or async data just loaded — establish baseline
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
        label: formSnapshotRef.current.title || 'Untitled prompt',
      };
      localStorage.setItem(autoSaveKey, JSON.stringify(data));
      setLastSavedAt(data.savedAt);
      setAutoSaveStatus('saved');
      // Reset to idle after 3 seconds
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }, [autoSaveKey]);

  // Auto-save interval (every 30 seconds, only when dirty)
  useEffect(() => {
    autoSaveIntervalRef.current = setInterval(() => {
      if (isDirtyRef.current) {
        setAutoSaveStatus('saving');
        // Small delay to show the saving indicator
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

      // Only show restore if the draft differs from the current form
      const currentSnapshot = JSON.stringify(form);
      if (data.value === currentSnapshot) return;

      // Only show if the draft is recent (within 7 days)
      const savedDate = new Date(data.savedAt);
      const daysSince = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 7) {
        localStorage.removeItem(autoSaveKey);
        return;
      }

      setDraftFound(data);
    } catch {
      // Invalid data — ignore
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptDraft() {
    if (!draftFound) return;
    try {
      const parsed = JSON.parse(draftFound.value);
      const restored = Object.fromEntries(
        Object.keys(form).map((key) => [key, parsed[key] ?? form[key]]),
      );
      const restoredIntro = await markdownToHtml(restored.intro || '');
      setIntroEditorValue(restoredIntro);
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


  // ── Unsaved content warning before submit ──
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  function handleDraftWarningDismiss() {
    setShowUnsavedWarning(false);
  }

  // Browser tab/window close protection
  useEffect(() => {
    function handleBeforeUnload(event) {
      if (isDirtyRef.current) {
        event.preventDefault();
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // In-app navigation protection via document-level click interceptor
  useEffect(() => {
    function handleClick(event) {
      if (!isDirtyRef.current) return;

      const anchor = event.target.closest('a[href]');
      if (!anchor) return;

      // Skip external links
      try {
        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
      } catch {
        return;
      }

      // Skip anchors that are submit buttons or inside our own form
      if (anchor.type === 'submit' || anchor.closest('form') === formRef.current) return;

      event.preventDefault();
      event.stopPropagation();

      requestNavigation(() => {
        window.location.href = anchor.href;
      });
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [requestNavigation]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === 'title' && !slugWasEdited) next.slug = slugify(value);
      return next;
    });
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function updateSlug(event) {
    setSlugWasEdited(true);
    updateField(event);
  }

  function selectPrimaryCategory(event) {
    const id = Number(event.target.value) || '';
    setForm((current) => ({
      ...current,
      primaryCategoryId: id,
      categoryIds: id && !current.categoryIds.includes(id)
        ? [id, ...current.categoryIds]
        : current.categoryIds,
    }));
    setErrors((current) => ({
      ...current,
      primaryCategoryId: undefined,
      categoryIds: undefined,
    }));
  }

  function toggleCategory(categoryId) {
    setForm((current) => {
      const selected = current.categoryIds.includes(categoryId);
      if (selected && current.primaryCategoryId === categoryId) return current;

      return {
        ...current,
        categoryIds: selected
          ? current.categoryIds.filter((id) => id !== categoryId)
          : [...current.categoryIds, categoryId],
      };
    });
    setErrors((current) => ({ ...current, categoryIds: undefined }));
  }

  function updateNewCategoryName(event) {
    const name = event.target.value;
    setNewCategory((current) => ({
      ...current,
      name,
      slug: newCategorySlugEdited ? current.slug : slugify(name),
    }));
    setCategoryMessage('');
  }

  function updateNewCategorySlug(event) {
    setNewCategorySlugEdited(true);
    setNewCategory((current) => ({ ...current, slug: event.target.value }));
    setCategoryMessage('');
  }

  async function createCategoryInline() {
    setCategoryMessage('');
    setIsCreatingCategory(true);

    try {
      const response = await fetch('/admin/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategory),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The category could not be created.');

      const category = result.category;
      setCategoryOptions((current) => [...current, category].sort((a, b) =>
        a.name.localeCompare(b.name)
      ));
      setForm((current) => ({
        ...current,
        primaryCategoryId: current.primaryCategoryId || category.id,
        categoryIds: current.categoryIds.includes(category.id)
          ? current.categoryIds
          : [...current.categoryIds, category.id],
      }));
      setNewCategory({ name: '', slug: '' });
      setNewCategorySlugEdited(false);
      setCategoryMessage(`Created "${category.name}" and selected it.`);
    } catch (error) {
      setCategoryMessage(error.message || 'The category could not be created.');
    } finally {
      setIsCreatingCategory(false);
    }
  }

  function choosePrimaryImage(event) {
    const file = event.target.files?.[0] || null;
    setPrimaryFile(file);
    setWatermarkedPreview('');
    if (!file) setPrimaryFileAltText('');
    if (file) {
      hasFileChangesRef.current = true;
      setIsDirty(computeDirty(JSON.stringify(form), true));
    }
    setErrors((current) => ({ ...current, image: undefined }));
  }

  async function createPrimaryWatermarkedPreview() {
    if (!primaryFile || isPreviewingPrimary || isSaving) return;

    setIsPreviewingPrimary(true);
    setMessage('');
    setUploadStatus('Uploading image for watermarked preview…');
    try {
      const uploaded = await uploadImage(primaryFile, (progress) => {
        setUploadStatus(`Preparing watermarked preview: ${progress}%`);
      });
      setWatermarkedPreview({ file: primaryFile, url: uploaded.url });
    } catch (error) {
      setMessage(error.message || 'The watermarked preview could not be created.');
    } finally {
      setUploadStatus('');
      setIsPreviewingPrimary(false);
    }
  }

  function chooseGalleryImages(event) {
    const files = Array.from(event.target.files || []);
    setGalleryFiles(files);
    setGalleryFileAltTexts(files.map((_, index) => galleryFileAltTexts[index] || ''));
    if (files.length > 0) {
      hasFileChangesRef.current = true;
      setIsDirty(computeDirty(JSON.stringify(form), true));
    }
    setErrors((current) => ({ ...current, images: undefined }));
  }

  function chooseOgImage(event) {
    const file = event.target.files?.[0] || null;
    setOgImageFile(file);
    if (file) {
      hasFileChangesRef.current = true;
      setIsDirty(computeDirty(JSON.stringify(form), true));
    }
    setErrors((current) => ({ ...current, ogImage: undefined }));
  }

  function addRelatedPrompt(prompt) {
    if (prompt.id === initialPrompt?.id) {
      setErrors((current) => ({
        ...current,
        relatedPromptIds: 'A prompt cannot be related to itself.',
      }));
      return;
    }
    if (form.relatedPromptIds.length >= MAX_RELATED_PROMPTS) {
      setErrors((current) => ({
        ...current,
        relatedPromptIds: `Choose no more than ${MAX_RELATED_PROMPTS} related prompts.`,
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      relatedPromptIds: [...current.relatedPromptIds, prompt.id],
    }));
    setRelatedSearch('');
    setErrors((current) => ({ ...current, relatedPromptIds: undefined }));
  }

  function removeRelatedPrompt(promptId) {
    setForm((current) => ({
      ...current,
      relatedPromptIds: current.relatedPromptIds.filter((id) => id !== promptId),
    }));
    setErrors((current) => ({ ...current, relatedPromptIds: undefined }));
  }

  function moveRelatedPrompt(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= form.relatedPromptIds.length) return;

    setForm((current) => {
      const relatedPromptIds = [...current.relatedPromptIds];
      [relatedPromptIds[index], relatedPromptIds[nextIndex]] = [
        relatedPromptIds[nextIndex], relatedPromptIds[index],
      ];
      return { ...current, relatedPromptIds };
    });
  }

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    setMessage('');

    // Check for unsaved file changes as a warning
    if (hasFileChangesRef.current && primaryFile) {
      // Files will be uploaded on submit — this is just a status indicator
    }

    const files = [
      ...(primaryFile ? [primaryFile] : []),
      ...galleryFiles,
      ...(ogImageFile ? [ogImageFile] : []),
    ];
    const fileError = validateFiles(files);
    if (fileError) {
      setErrors({ image: fileError });
      return;
    }
    if (form.status === 'published' && !form.image && !primaryFile) {
      setErrors({ image: 'Upload a primary image.' });
      return;
    }
    if (ogImageMode === 'custom' && !ogImageFile && !form.ogImage) {
      setErrors({ ogImage: 'Upload a custom OG image or use the primary prompt image.' });
      return;
    }
    if (new Set([form.image, ...form.images].filter(Boolean)).size + galleryFiles.length > MAX_IMAGES) {
      setErrors({ images: `Use no more than ${MAX_IMAGES} images.` });
      return;
    }

    setIsSaving(true);

    try {
      let primaryImage = form.image;
      let images = [...form.images];
      const existingAltTexts = { ...(form.imageAltTexts || {}) };
      const uploadedGalleryAltTexts = new Map();
      let ogImage = ogImageMode === 'custom' ? form.ogImage : '';

      if (primaryFile) {
        const previousPrimary = primaryImage;
        const uploaded = watermarkedPreview?.file === primaryFile
          ? { url: watermarkedPreview.url }
          : await uploadImage(primaryFile, (progress) => {
            setUploadStatus(`Uploading primary image: ${progress}%`);
          });
        primaryImage = uploaded.url;
        setWatermarkedPreview({ file: primaryFile, url: uploaded.url });
        images = [
          primaryImage,
          ...images.filter((url) => url !== previousPrimary && url !== primaryImage),
        ];
      }

      for (let index = 0; index < galleryFiles.length; index += 1) {
        const file = galleryFiles[index];
        const uploaded = await uploadImage(file, (progress) => {
          setUploadStatus(
            `Uploading additional image ${index + 1} of ${galleryFiles.length}: ${progress}%`,
          );
        });
        images.push(uploaded.url);
        uploadedGalleryAltTexts.set(uploaded.url, galleryFileAltTexts[index] || '');
      }

      if (ogImageMode === 'custom' && ogImageFile) {
        setUploadStatus('Uploading custom OG image…');
        const uploaded = await uploadImage(ogImageFile, (progress) => {
          setUploadStatus(`Uploading custom OG image: ${progress}%`);
        });
        ogImage = uploaded.url;
      }

      images = [...new Set([primaryImage, ...images].filter(Boolean))];
      const altTextsByUrl = new Map(
        form.images.map((url, index) => [
          url,
          existingAltTexts[String(index)] || existingAltTexts[index] || '',
        ]),
      );
      const nextImageAltTexts = {};
      images.forEach((url, index) => {
        const altText = url === primaryImage && primaryFile
          ? primaryFileAltText
          : altTextsByUrl.get(url)
            || uploadedGalleryAltTexts.get(url)
            || '';
        nextImageAltTexts[index] = altText || '';
      });
      setUploadStatus('Saving prompt…');

      const response = await fetch(
        isEditing ? `/admin/api/prompts/${initialPrompt.id}` : '/admin/api/prompts',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            image: primaryImage,
            images,
            imageAltTexts: nextImageAltTexts,
            ogImage,
          }),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        setErrors(result.fields || {});
        throw new Error(result.error || 'The prompt could not be saved.');
      }

      // Clear draft from localStorage on successful save
      try {
        localStorage.removeItem(autoSaveKey);
      } catch (error) {
        // Ignore localStorage cleanup failures; the save itself already succeeded.
        void error;
      }

      markClean();
      router.push(`/admin?success=${isEditing ? 'updated' : 'created'}`);
      router.refresh();
    } catch (error) {
      setMessage(error.message || 'The prompt could not be saved.');
      setUploadStatus('');
      setIsSaving(false);
    }
  }

  function removePromptImage(imageUrl) {
    setForm((current) => {
      const currentImages = [...new Set([
        current.image,
        ...(Array.isArray(current.images) ? current.images : []),
      ].filter(Boolean))];
      const altTextByUrl = new Map(
        currentImages.map((url, index) => [
          url,
          current.imageAltTexts?.[String(index)] || current.imageAltTexts?.[index] || '',
        ]),
      );
      const remainingImages = currentImages.filter((url) => url !== imageUrl);
      const image = current.image === imageUrl
        ? remainingImages[0] || ''
        : current.image;
      const images = [...new Set([image, ...remainingImages].filter(Boolean))];
      const imageAltTexts = Object.fromEntries(
        images.map((url, index) => [String(index), altTextByUrl.get(url) || '']),
      );

      return {
        ...current,
        image,
        images,
        imageAltTexts,
        ogImage: current.ogImage === imageUrl ? '' : current.ogImage,
      };
    });

    if (form.ogImage === imageUrl) {
      setOgImageMode('primary');
      setOgImageFile(null);
    }
  }

  const inputClass =
    'mt-2 w-full rounded border border-[#8c8f94] bg-white px-3 text-sm text-[#1d2327] outline-none transition focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]';
  const currentImages = [...new Set([form.image, ...form.images].filter(Boolean))];

  function FieldError({ name }) {
    return errors[name]
      ? <p className="mt-1 text-xs text-red-700">{errors[name]}</p>
      : null;
  }

  if (!isMounted) {
    return (
      <form ref={formRef} className="space-y-6" noValidate>
        <div className="space-y-3 animate-pulse">
          <div className="h-10 w-full rounded bg-[#e5e7eb]" />
          <div className="h-10 w-3/4 rounded bg-[#e5e7eb]" />
          <div className="flex gap-2">
            <div className="h-8 w-8 rounded bg-[#e5e7eb]" />
            <div className="h-8 w-8 rounded bg-[#e5e7eb]" />
            <div className="h-8 w-8 rounded bg-[#e5e7eb]" />
          </div>
          <div className="h-32 w-full rounded border border-[#dcdcde] bg-[#f6f7f7]" />
        </div>
      </form>
    );
  }

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

      <div>
        <label htmlFor="prompt-title" className="block text-sm font-semibold">Title</label>
        <input
          id="prompt-title"
          name="title"
          value={form.title}
          onChange={updateField}
          required
          maxLength={200}
          className={`${inputClass} h-11`}
        />
        <FieldError name="title" />
      </div>

      <div>
        <label htmlFor="prompt-slug" className="block text-sm font-semibold">Slug</label>
        <input
          id="prompt-slug"
          name="slug"
          value={form.slug}
          onChange={updateSlug}
          required
          maxLength={220}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          className={`${inputClass} h-11 font-mono`}
        />
        <p className="mt-1 text-xs text-[#646970]">
          Generated from the title until you edit it.
        </p>
        <FieldError name="slug" />
      </div>

      <div>
        <label htmlFor="prompt-status" className="block text-sm font-semibold">Status</label>
        <select
          id="prompt-status"
          name="status"
          value={form.status}
          onChange={updateField}
          className={`${inputClass} h-11`}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <p className="mt-1 text-xs text-[#646970]">
          Draft prompts are visible in admin only.
        </p>
        <FieldError name="status" />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="block text-sm font-semibold">Prompt text</span>
          <span className={`text-xs ${form.prompt.length > 18000 ? 'font-semibold text-red-600' : form.prompt.length > 15000 ? 'text-amber-600' : 'text-[#646970]'}`}>
            {form.prompt.length.toLocaleString()} / 20,000 characters
          </span>
        </div>
        <textarea
          id="prompt-text"
          value={form.prompt}
          onChange={(e) => setForm((c) => ({ ...c, prompt: e.target.value }))}
          rows={12}
          maxLength={20_000}
          placeholder="Enter the full AI prompt here..."
          className={`${inputClass} min-h-[120px] resize-y py-3 leading-6 font-mono text-[13px]`}
        />
        {errors.prompt && <p className="mt-1 text-xs text-red-700">{errors.prompt}</p>}
      </div>

      <section className="space-y-5 rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div>
          <h2 className="text-base font-semibold text-[#1d2327]">Prompt Detail Content</h2>
          <p className="mt-1 text-xs text-[#646970]">
            Add unique supporting content for the public prompt detail page. Intro target: 150–300 words.
          </p>
        </div>

        <div role="group" aria-labelledby="prompt-intro-label">
          <div id="prompt-intro-label" className="mb-2 text-sm font-semibold">Unique intro</div>
          {introEditorReady ? (
            <BlockEditor
              value={introEditorValue}
              onChange={(value) => {
                setIntroEditorValue(value);
                setForm((current) => ({ ...current, intro: value }));
                setErrors((current) => ({ ...current, intro: undefined }));
              }}
              rows={8}
              placeholder="Write a unique, useful introduction for this prompt."
            />
          ) : (
            <div className="h-48 animate-pulse rounded border border-[#dcdcde] bg-white" />
          )}
          <p className="mt-1 text-xs text-[#646970]">
            {introWordCount} words · {form.intro.length.toLocaleString()} / 5,000 characters · aim for 150–300.
          </p>
          <FieldError name="intro" />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold">Practical tips</label>
            {form.customizationTips.length < 3 ? (
              <button
                type="button"
                onClick={() => setForm((current) => ({
                  ...current,
                  customizationTips: [...current.customizationTips, ''],
                }))}
                className="text-xs font-semibold text-[#2271b1]"
              >
                Add tip
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-2">
            {form.customizationTips.map((tip, index) => (
              <div key={`tip-${index}`} className="flex gap-2">
                <textarea
                  aria-label={`Practical tip ${index + 1}`}
                  value={tip}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    customizationTips: current.customizationTips.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item
                    ),
                  }))}
                  maxLength={500}
                  rows={2}
                  className={`${inputClass} mt-0 py-2`}
                />
                <button
                  type="button"
                  onClick={() => setForm((current) => ({
                    ...current,
                    customizationTips: current.customizationTips.filter((_, itemIndex) => itemIndex !== index),
                  }))}
                  aria-label={`Remove practical tip ${index + 1}`}
                  className="shrink-0 px-2 text-sm text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-[#646970]">Add three practical tips.</p>
          <FieldError name="customizationTips" />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold">Prompt variations</label>
            {form.variations.length < 3 ? (
              <button
                type="button"
                onClick={() => setForm((current) => ({
                  ...current,
                  variations: [...current.variations, { label: '', text: '' }],
                }))}
                className="text-xs font-semibold text-[#2271b1]"
              >
                Add variation
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-3">
            {form.variations.map((variation, index) => (
              <div key={`variation-${index}`} className="grid gap-2 rounded border border-[#c3c4c7] bg-white p-3 sm:grid-cols-[1fr_2fr_auto]">
                <input
                  aria-label={`Variation ${index + 1} label`}
                  value={variation.label}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    variations: current.variations.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, label: event.target.value } : item
                    ),
                  }))}
                  maxLength={120}
                  placeholder="Label"
                  className={`${inputClass} mt-0 h-10`}
                />
                <textarea
                  aria-label={`Variation ${index + 1} text`}
                  value={variation.text}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    variations: current.variations.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: event.target.value } : item
                    ),
                  }))}
                  maxLength={5_000}
                  rows={3}
                  placeholder="Prompt variation"
                  className={`${inputClass} mt-0 py-2`}
                />
                <button
                  type="button"
                  onClick={() => setForm((current) => ({
                    ...current,
                    variations: current.variations.filter((_, itemIndex) => itemIndex !== index),
                  }))}
                  aria-label={`Remove variation ${index + 1}`}
                  className="text-sm text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-[#646970]">Add up to three labeled alternatives.</p>
          <FieldError name="variations" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="recommended-tool" className="block text-sm font-semibold">Recommended tool</label>
            <input
              id="recommended-tool"
              value={form.recommendedTool}
              onChange={updateField}
              name="recommendedTool"
              maxLength={100}
              placeholder="e.g. ChatGPT"
              className={`${inputClass} h-11`}
            />
            <FieldError name="recommendedTool" />
          </div>
          <div>
            <label htmlFor="tool-note" className="block text-sm font-semibold">Why this tool?</label>
            <textarea
              id="tool-note"
              value={form.toolNote}
              onChange={updateField}
              name="toolNote"
              maxLength={500}
              rows={2}
              placeholder="Briefly explain why it suits this prompt."
              className={`${inputClass} py-2`}
            />
            <FieldError name="toolNote" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold">How to use</label>
            {form.howToUse.length < 4 ? (
              <button
                type="button"
                onClick={() => setForm((current) => ({
                  ...current,
                  howToUse: [...current.howToUse, ''],
                }))}
                className="text-xs font-semibold text-[#2271b1]"
              >
                Add step
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-2">
            {form.howToUse.map((step, index) => (
              <div key={`step-${index}`} className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-sm font-semibold">{index + 1}.</span>
                <input
                  aria-label={`How-to step ${index + 1}`}
                  value={step}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    howToUse: current.howToUse.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item
                    ),
                  }))}
                  maxLength={500}
                  className={`${inputClass} mt-0 h-10`}
                />
                <button
                  type="button"
                  onClick={() => setForm((current) => ({
                    ...current,
                    howToUse: current.howToUse.filter((_, itemIndex) => itemIndex !== index),
                  }))}
                  aria-label={`Remove how-to step ${index + 1}`}
                  className="shrink-0 text-sm text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-[#646970]">Add three or four steps.</p>
          <FieldError name="howToUse" />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold">FAQs</label>
            {form.faqs.length < 4 ? (
              <button
                type="button"
                onClick={() => setForm((current) => ({
                  ...current,
                  faqs: [...current.faqs, { question: '', answer: '' }],
                }))}
                className="text-xs font-semibold text-[#2271b1]"
              >
                Add FAQ
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-3">
            {form.faqs.map((faq, index) => (
              <div key={`faq-${index}`} className="grid gap-2 rounded border border-[#c3c4c7] bg-white p-3 sm:grid-cols-2">
                <input
                  aria-label={`FAQ ${index + 1} question`}
                  value={faq.question}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    faqs: current.faqs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, question: event.target.value } : item
                    ),
                  }))}
                  maxLength={300}
                  placeholder="Question"
                  className={`${inputClass} mt-0 h-10`}
                />
                <textarea
                  aria-label={`FAQ ${index + 1} answer`}
                  value={faq.answer}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    faqs: current.faqs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, answer: event.target.value } : item
                    ),
                  }))}
                  maxLength={5_000}
                  rows={2}
                  placeholder="Answer"
                  className={`${inputClass} mt-0 py-2`}
                />
                <button
                  type="button"
                  onClick={() => setForm((current) => ({
                    ...current,
                    faqs: current.faqs.filter((_, itemIndex) => itemIndex !== index),
                  }))}
                  aria-label={`Remove FAQ ${index + 1}`}
                  className="text-left text-sm text-red-700 sm:col-span-2"
                >
                  Remove FAQ
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-[#646970]">Add two to four question-and-answer pairs.</p>
          <FieldError name="faqs" />
        </div>

        <div>
          <label htmlFor="compatible-tools" className="block text-sm font-semibold">Compatible tools</label>
          <input
            id="compatible-tools"
            value={form.tools.join(', ')}
            onChange={(event) => setForm((current) => ({
              ...current,
              tools: event.target.value.split(',').map((tool) => tool.trim()).filter(Boolean),
            }))}
            maxLength={1_000}
            placeholder="ChatGPT, Gemini, Midjourney"
            className={`${inputClass} h-11`}
          />
          <p className="mt-1 text-xs text-[#646970]">Comma-separated badges shown on the detail page.</p>
          <FieldError name="tools" />
        </div>

        <div>
          <label htmlFor="meta-description" className="block text-sm font-semibold">Meta description</label>
          <textarea
            id="meta-description"
            value={form.metaDescription}
            onChange={updateField}
            name="metaDescription"
            maxLength={320}
            rows={3}
            placeholder="Search result description for this prompt."
            className={`${inputClass} py-2`}
          />
          <FieldError name="metaDescription" />
        </div>

        <p className="text-xs text-[#646970]">
          Image alt text is managed with each image below; no separate duplicate field is needed.
        </p>
      </section>

      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1d2327]">Categories</h2>
            <p className="mt-1 text-xs text-[#646970]">
              Choose one primary category and any additional categories.
            </p>
          </div>
          {canManageCategories ? (
            <UnsavedChangesLink
              href="/admin/categories"
              isDirty={isDirty}
              onConfirmNavigate={(href) => requestNavigation(() => { window.location.href = href; })}
              className="text-sm font-semibold text-[#2271b1] hover:underline"
            >
              Manage categories
            </UnsavedChangesLink>
          ) : null}
        </div>

        <div className="mt-4">
          <label htmlFor="prompt-primary-category" className="block text-sm font-semibold">
            Primary category
          </label>
          <select
            id="prompt-primary-category"
            value={form.primaryCategoryId}
            onChange={selectPrimaryCategory}
            required
            className={`${inputClass} h-11`}
          >
            <option value="">Choose a category</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <FieldError name="primaryCategoryId" />
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">All assigned categories</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categoryOptions.map((category) => {
              const isPrimary = form.primaryCategoryId === category.id;
              return (
                <label
                  key={category.id}
                  className="flex items-center gap-2 rounded border border-[#c3c4c7] bg-white px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.categoryIds.includes(category.id)}
                    onChange={() => toggleCategory(category.id)}
                    disabled={isPrimary}
                    className="h-4 w-4 rounded border-[#8c8f94] text-[#2271b1]"
                  />
                  <span>{category.name}</span>
                  {isPrimary ? (
                    <span className="ml-auto text-[10px] font-semibold uppercase text-[#2271b1]">
                      Primary
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <FieldError name="categoryIds" />
        </fieldset>

        {canManageCategories ? (
          <div className="mt-5 rounded border border-dashed border-[#8c8f94] bg-white p-4">
            <p className="text-sm font-semibold text-[#1d2327]">Create a new category</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label htmlFor="new-category-name" className="block text-xs font-semibold">Name</label>
                <input
                  id="new-category-name"
                  value={newCategory.name}
                  onChange={updateNewCategoryName}
                  maxLength={120}
                  className={`${inputClass} h-10`}
                />
              </div>
              <div>
                <label htmlFor="new-category-slug" className="block text-xs font-semibold">Slug</label>
                <input
                  id="new-category-slug"
                  value={newCategory.slug}
                  onChange={updateNewCategorySlug}
                  maxLength={120}
                  className={`${inputClass} h-10 font-mono`}
                />
              </div>
              <button
                type="button"
                onClick={createCategoryInline}
                disabled={isCreatingCategory || !newCategory.name.trim()}
                className="inline-flex h-10 items-center justify-center rounded border border-[#2271b1] px-4 text-sm font-semibold text-[#2271b1] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingCategory ? 'Creating…' : 'Create'}
              </button>
            </div>
            {categoryMessage ? (
              <p className="mt-2 text-xs text-[#50575e]">{categoryMessage}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="prompt-tags" className="block text-sm font-semibold">Tags</label>
        <input
          id="prompt-tags"
          name="tags"
          value={form.tags}
          onChange={updateField}
          placeholder="portrait, neon, fashion"
          className={`${inputClass} h-11`}
        />
        <p className="mt-1 text-xs text-[#646970]">Separate entries with commas.</p>
        <FieldError name="tags" />
      </div>

      {/* ── Editorial metadata ── */}
      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div>
          <h2 className="text-base font-semibold text-[#1d2327]">Editorial Metadata</h2>
          <p className="mt-1 text-xs text-[#646970]">
            Review dates, generation testing, and aspect-ratio guidance.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="reviewed-at" className="block text-sm font-semibold">
              Reviewed date
            </label>
            <input
              id="reviewed-at"
              type="date"
              value={form.reviewedAt}
              onChange={updateField}
              name="reviewedAt"
              className={`${inputClass} h-11`}
            />
          </div>
          <div>
            <label htmlFor="generation-tested" className="block text-sm font-semibold">
              Generation tested
            </label>
            <label className="mt-2 flex items-center gap-2">
              <input
                id="generation-tested"
                type="checkbox"
                checked={form.generationTested}
                onChange={(event) => {
                  setForm((current) => ({ ...current, generationTested: event.target.checked }));
                }}
                className="h-4 w-4 rounded border-[#8c8f94]"
              />
              <span className="text-sm">Yes, this prompt has been tested</span>
            </label>
          </div>
          <div>
            <label htmlFor="generation-tested-date" className="block text-sm font-semibold">
              Generation tested date
            </label>
            <input
              id="generation-tested-date"
              type="date"
              value={form.generationTestedDate}
              onChange={updateField}
              name="generationTestedDate"
              disabled={!form.generationTested}
              className={`${inputClass} h-11 disabled:bg-[#f0f0f1]`}
            />
          </div>
          <div>
            <label htmlFor="generation-tested-tool" className="block text-sm font-semibold">
              Generation tested tool
            </label>
            <input
              id="generation-tested-tool"
              type="text"
              value={form.generationTestedTool}
              onChange={updateField}
              name="generationTestedTool"
              placeholder="e.g. ChatGPT, Midjourney, Leonardo AI"
              disabled={!form.generationTested}
              className={`${inputClass} h-11 disabled:bg-[#f0f0f1]`}
            />
          </div>
        </div>
      </div>

      {/* ── Aspect ratio recommendation ── */}
      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div>
          <h2 className="text-base font-semibold text-[#1d2327]">Aspect Ratio Recommendation</h2>
          <p className="mt-1 text-xs text-[#646970]">
            Suggest the best aspect ratio and explain why.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="recommended-aspect-ratio" className="block text-sm font-semibold">
              Recommended ratio
            </label>
            <select
              id="recommended-aspect-ratio"
              value={form.recommendedAspectRatio}
              onChange={updateField}
              name="recommendedAspectRatio"
              className={`${inputClass} h-11`}
            >
              <option value="">None selected</option>
              <option value="4:5">4:5 — Instagram portrait</option>
              <option value="1:1">1:1 — Square</option>
              <option value="9:16">9:16 — Reels / Stories</option>
              <option value="16:9">16:9 — Landscape / YouTube</option>
            </select>
          </div>
          <div>
            <label htmlFor="aspect-ratio-reason" className="block text-sm font-semibold">
              Reason
            </label>
            <input
              id="aspect-ratio-reason"
              value={form.aspectRatioReason}
              onChange={updateField}
              name="aspectRatioReason"
              maxLength={500}
              placeholder="e.g. Vertical crop keeps the subject centered in the frame"
              className={`${inputClass} h-11`}
            />
            <FieldError name="aspectRatioReason" />
          </div>
        </div>
      </div>

      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div>
          <h2 className="text-base font-semibold text-[#1d2327]">Related Prompts</h2>
          <p className="mt-1 text-xs text-[#646970]">
            Choose up to three prompts in display order. Leave empty to use automatic recommendations.
          </p>
        </div>

        {form.relatedPromptIds.length ? (
          <ol className="mt-4 space-y-2">
            {form.relatedPromptIds.map((promptId, index) => {
              const prompt = promptOptionById.get(promptId);
              return (
                <li
                  key={promptId}
                  className="flex flex-wrap items-center gap-3 rounded border border-[#c3c4c7] bg-white px-3 py-3"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0f0f1] text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {prompt?.title || `Unavailable prompt #${promptId}`}
                    </p>
                    {prompt ? (
                      <p className="mt-0.5 text-xs capitalize text-[#646970]">
                        {prompt.status}
                      </p>
                    ) : null}
                  </div>
                  <div className="inline-flex gap-2">
                    <button
                      type="button"
                      onClick={() => moveRelatedPrompt(index, -1)}
                      disabled={index === 0}
                      className="rounded border border-[#8c8f94] px-2 py-1 text-xs font-semibold disabled:opacity-40"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRelatedPrompt(index, 1)}
                      disabled={index === form.relatedPromptIds.length - 1}
                      className="rounded border border-[#8c8f94] px-2 py-1 text-xs font-semibold disabled:opacity-40"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRelatedPrompt(promptId)}
                      className="rounded border border-[#d63638] px-2 py-1 text-xs font-semibold text-[#b32d2e]"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-4 rounded border border-dashed border-[#c3c4c7] bg-white px-4 py-4 text-center text-sm text-[#646970]">
            No manual selections. Automatic related prompts will be used.
          </p>
        )}

        <div className="relative mt-4">
          <label htmlFor="related-prompt-search" className="block text-sm font-semibold">
            Search prompts by title
          </label>
          <input
            id="related-prompt-search"
            type="search"
            value={relatedSearch}
            onChange={(event) => {
              setRelatedSearch(event.target.value);
              setErrors((current) => ({ ...current, relatedPromptIds: undefined }));
            }}
            disabled={form.relatedPromptIds.length >= MAX_RELATED_PROMPTS}
            placeholder={
              form.relatedPromptIds.length >= MAX_RELATED_PROMPTS
                ? 'Maximum of three selected'
                : 'Start typing a prompt title'
            }
            autoComplete="off"
            className={`${inputClass} h-11 disabled:cursor-not-allowed disabled:bg-[#f0f0f1]`}
          />

          {relatedSearch.trim() && form.relatedPromptIds.length < MAX_RELATED_PROMPTS ? (
            <div className="mt-2 overflow-hidden rounded border border-[#c3c4c7] bg-white shadow-sm">
              {relatedSearchResults.length ? (
                relatedSearchResults.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => addRelatedPrompt(prompt)}
                    className="flex w-full items-center justify-between gap-3 border-b border-[#dcdcde] px-3 py-2 text-left last:border-b-0 hover:bg-[#f0f6fc]"
                  >
                    <span className="truncate text-sm font-semibold">{prompt.title}</span>
                    <span className="shrink-0 text-xs capitalize text-[#646970]">
                      {prompt.status}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-3 text-sm text-[#646970]">
                  No other prompts match that title.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <FieldError name="relatedPromptIds" />
      </div>

      <details
        open
        className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4"
      >
        <summary className="cursor-pointer text-base font-semibold text-[#1d2327]">
          SEO
        </summary>
        <p className="mt-2 text-xs text-[#646970]">
          OG image is still kept for social previews. Custom SEO title/description fields are no longer generated for new prompts.
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">OG Image</legend>
          <div className="mt-2 space-y-2">
            <label className="flex items-start gap-3 rounded border border-[#c3c4c7] bg-white p-3 text-sm">
              <input
                type="radio"
                name="og-image-mode"
                value="primary"
                checked={ogImageMode === 'primary'}
                onChange={() => {
                  setOgImageMode('primary');
                  setErrors((current) => ({ ...current, ogImage: undefined }));
                }}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-semibold">Use primary prompt image</span>
                <span className="mt-0.5 block text-xs text-[#646970]">
                  Keeps the existing automatic fallback behavior.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded border border-[#c3c4c7] bg-white p-3 text-sm">
              <input
                type="radio"
                name="og-image-mode"
                value="custom"
                checked={ogImageMode === 'custom'}
                onChange={() => setOgImageMode('custom')}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-semibold">Upload a separate OG image</span>
                <span className="mt-0.5 block text-xs text-[#646970]">
                  Uploads directly to the configured Cloudinary media library.
                </span>
              </span>
            </label>
          </div>

          {ogImageMode === 'custom' ? (
            <div className="mt-3 rounded border border-[#c3c4c7] bg-white p-3">
              <input
                id="prompt-og-image"
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                onChange={chooseOgImage}
                className={`${inputClass} h-11 cursor-pointer py-2 file:mr-3 file:rounded file:border-0 file:bg-[#f0f0f1] file:px-3 file:py-1 file:text-xs file:font-semibold`}
              />
              <p className="mt-1 text-xs text-[#646970]">
                JPEG, PNG, or WebP; maximum 4 MB.
              </p>
              {form.ogImage && !ogImageFile ? (
                <div className="mt-3">
                  <div className="relative h-28 w-48 overflow-hidden rounded border border-[#dcdcde] bg-[#f0f0f1]">
                    <Image
                      src={form.ogImage}
                      alt="Current custom OG image"
                      fill
                      sizes="192px"
                      className="object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePromptImage(form.ogImage)}
                    className="mt-2 rounded border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Remove from OG image
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <FieldError name="ogImage" />
        </fieldset>
      </details>

      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div>
          <label htmlFor="prompt-primary-image" className="block text-sm font-semibold">
            Primary image{' '}
            {isEditing
              ? <span className="font-normal text-[#646970]">(optional replacement)</span>
              : form.status === 'published'
                ? <span className="font-normal text-[#646970]">(required to publish)</span>
                : <span className="font-normal text-[#646970]">(optional for drafts)</span>}
          </label>
          <input
            id="prompt-primary-image"
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            onChange={choosePrimaryImage}
            disabled={isSaving || isPreviewingPrimary}
            required={!isEditing && form.status === 'published'}
            className={`${inputClass} h-11 cursor-pointer py-2 file:mr-3 file:rounded file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold`}
          />
          <p className="mt-1 text-xs text-[#646970]">
            JPEG, PNG, or WebP; maximum 4 MB. Drafts may be saved without an image; publishing requires a primary image.
          </p>
          {primaryFile ? (
            <div className="mt-3">
              {!watermarkedPreview ? (
                <button
                  type="button"
                  onClick={createPrimaryWatermarkedPreview}
                  disabled={isSaving || isPreviewingPrimary}
                  className="mb-3 rounded border border-[#2271b1] px-3 py-2 text-xs font-semibold text-[#135e96] hover:bg-[#f0f6fc] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPreviewingPrimary ? 'Preparing preview…' : 'Preview watermarked image'}
                </button>
              ) : null}
              {watermarkedPreview ? (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-semibold">Watermarked preview</p>
                  <div className="relative h-40 w-64 overflow-hidden rounded border border-[#c3c4c7] bg-white">
                    <Image
                      src={watermarkedPreview.url}
                      alt="Preview of the uploaded image with the AQPrompts watermark"
                      fill
                      sizes="256px"
                      className="object-contain"
                    />
                  </div>
                </div>
              ) : null}
              <label htmlFor="primary-image-alt" className="block text-xs font-semibold">
                ALT text for selected primary image
              </label>
              <input
                id="primary-image-alt"
                value={primaryFileAltText}
                onChange={(event) => setPrimaryFileAltText(event.target.value)}
                maxLength={200}
                placeholder="Describe the primary image"
                className={`${inputClass} h-10`}
              />
            </div>
          ) : null}
          <FieldError name="image" />
        </div>

        <div className="mt-5">
          <label htmlFor="prompt-gallery-images" className="block text-sm font-semibold">
            Additional images
          </label>
          <input
            id="prompt-gallery-images"
            type="file"
            multiple
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            onChange={chooseGalleryImages}
            className={`${inputClass} min-h-11 cursor-pointer py-2 file:mr-3 file:rounded file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold`}
          />
          <p className="mt-1 text-xs text-[#646970]">Up to {MAX_IMAGES} images total.</p>
          {galleryFiles.length ? (
            <div className="mt-3 space-y-2">
              {galleryFiles.map((file, index) => (
                <div key={`${file.name}-${file.lastModified}`} className="rounded border border-[#dcdcde] bg-white p-3">
                  <label htmlFor={`gallery-image-alt-${index}`} className="block text-xs font-semibold">
                    ALT text for {file.name}
                  </label>
                  <input
                    id={`gallery-image-alt-${index}`}
                    value={galleryFileAltTexts[index] || ''}
                    onChange={(event) => setGalleryFileAltTexts((current) => {
                      const next = [...current];
                      next[index] = event.target.value;
                      return next;
                    })}
                    maxLength={200}
                    placeholder="Describe this image"
                    className={`${inputClass} h-10`}
                  />
                </div>
              ))}
            </div>
          ) : null}
          <FieldError name="images" />
        </div>

        {currentImages.length ? (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#646970]">Current images</p>
            <p className="mt-1 text-xs text-[#646970]">
              Removing an image only unlinks it from this prompt; the stored media file remains available.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {currentImages.map((url, index) => (
                <div key={url} className="relative h-24 w-24 overflow-hidden rounded border border-[#c3c4c7] bg-white">
                  <Image
                    src={url}
                    alt={form.imageAltTexts?.[String(index)] || form.imageAltTexts?.[index] || `Current prompt image ${index + 1}`}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePromptImage(url)}
                    aria-label={`Remove prompt image ${index + 1}`}
                    title="Remove this image from the prompt; stored file will remain"
                    className="absolute bottom-1 right-1 rounded bg-red-700 px-1.5 py-1 text-[10px] font-semibold text-white shadow hover:bg-red-800"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── SEO Audit Panel ── */}
      <SeoAuditPanel prompt={form} allPrompts={availablePrompts} />

      {/* ── Internal Link Suggestions ── */}
      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <h2 className="text-base font-semibold text-[#1d2327]">Related Prompts Suggestions</h2>
        <p className="mt-1 text-xs text-[#646970]">
          Auto-detected suggestions based on category, tags, and content similarity.
        </p>
        <div className="mt-4">
          <InternalLinkSuggestions
            currentPrompt={form}
            allPrompts={availablePrompts}
            selectedIds={form.relatedPromptIds}
            onSelect={(id) => {
              if (form.relatedPromptIds.length < MAX_RELATED_PROMPTS) {
                setForm((c) => ({ ...c, relatedPromptIds: [...c.relatedPromptIds, id] }));
              }
            }}
            onRemove={(id) => {
              setForm((c) => ({ ...c, relatedPromptIds: c.relatedPromptIds.filter((i) => i !== id) }));
            }}
          />
        </div>
      </div>

      {/* ── Alt Text for Images ── */}
      {currentImages.length > 0 && (
        <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1d2327]">Image Alt Text <span className="text-red-600">*</span></h2>
          </div>
          <p className="mt-1 text-xs text-[#646970]">
            Add descriptive alt text to each image for accessibility and SEO. Required for publishing.
          </p>
          <div className="mt-4">
            <AltTextEditor
              images={currentImages}
              altTexts={form.imageAltTexts || {}}
              onChange={(altTexts) => setForm((c) => ({ ...c, imageAltTexts: altTexts }))}
            />
          </div>
          <FieldError name="imageAltTexts" />
        </div>
      )}

      {/* ── Scheduled Publishing ── */}
      <div className="rounded border border-[#dcdcde] bg-[#f6f7f7] p-4">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-[#2271b1]" />
          <h2 className="text-base font-semibold text-[#1d2327]">Scheduled Publishing</h2>
        </div>
        <p className="mt-1 text-xs text-[#646970]">
          Set a future date to auto-publish this prompt. Leave empty to publish immediately.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="prompt-scheduled-at" className="block text-sm font-semibold">
              Schedule publish date
            </label>
            <input
              id="prompt-scheduled-at"
              type="datetime-local"
              value={form.scheduledAt || ''}
              onChange={(e) => setForm((c) => ({ ...c, scheduledAt: e.target.value }))}
              min={new Date().toISOString().slice(0, 16)}
              className={`${inputClass} h-11`}
            />
            <p className="mt-1 text-xs text-[#646970]">
              {form.scheduledAt
                ? `Will auto-publish on ${new Date(form.scheduledAt).toLocaleString()}`
                : 'Leave empty to publish when you click Save'}
            </p>
          </div>
          {form.scheduledAt && (
            <div className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2">
              <Clock size={14} className="text-blue-600" />
              <span className="text-xs text-blue-800">
                This prompt will remain a draft until the scheduled date.
              </span>
            </div>
          )}
        </div>
      </div>

      {(isSaving || isPreviewingPrimary) && uploadStatus ? (
        <p role="status" className="text-sm font-medium text-[#50575e]">{uploadStatus}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[#dcdcde] pt-5">
        <button
          type="submit"
          disabled={isSaving || isPreviewingPrimary}
          className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96] disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : isEditing ? 'Update Prompt' : 'Save Prompt'}
        </button>
        <UnsavedChangesLink
          href="/admin"
          isDirty={isDirty}
          onConfirmNavigate={(href) => requestNavigation(() => { window.location.href = href; })}
          className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-5 text-sm font-semibold text-[#2c3338]"
        >
          Cancel
        </UnsavedChangesLink>

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