'use client';

import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link,
  Unlink,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Quote,
  Code,
  Undo,
  Redo,
  Type,
  ChevronDown,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  ImageIcon,
  Maximize2,
  Minimize2,
  Feather,
  Save,
  Check,
  FileText,
  Clock,
  X,
  Table2,
} from 'lucide-react';

import MediaLibrary from './MediaLibrary';

const HEADING_OPTIONS = [
  { value: 'p', label: 'Paragraph' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
];

function ToolbarButton({ icon: Icon, label, active, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded transition ${
        active
          ? 'bg-[#2271b1] text-white'
          : 'text-[#50575e] hover:bg-[#f0f0f1] hover:text-[#1d2327]'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-6 w-px bg-[#dcdcde]" aria-hidden="true" />;
}

function TableDialog({ open, onClose, onInsert }) {
  const [rows, setRows] = useState('3');
  const [columns, setColumns] = useState('3');
  const [hasHeader, setHasHeader] = useState(true);

  useEffect(() => {
    if (open) {
      setRows('3');
      setColumns('3');
      setHasHeader(true);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    const rowCount = Math.min(20, Math.max(1, Number.parseInt(rows, 10) || 1));
    const columnCount = Math.min(10, Math.max(1, Number.parseInt(columns, 10) || 1));
    onInsert({ rows: rowCount, columns: columnCount, hasHeader });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Insert table">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1d2327]">Insert table</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#646970] hover:bg-[#f0f0f1]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm text-[#1d2327]">
            Rows
            <input type="number" min="1" max="20" value={rows} onChange={(event) => setRows(event.target.value)} className="mt-1 w-full rounded border border-[#8c8f94] px-2 py-1.5" />
          </label>
          <label className="text-sm text-[#1d2327]">
            Columns
            <input type="number" min="1" max="10" value={columns} onChange={(event) => setColumns(event.target.value)} className="mt-1 w-full rounded border border-[#8c8f94] px-2 py-1.5" />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-[#1d2327]">
          <input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} />
          First row is a header
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-[#8c8f94] px-3 py-1.5 text-sm text-[#1d2327]">Cancel</button>
          <button type="submit" className="rounded bg-[#2271b1] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#135e96]">Insert table</button>
        </div>
      </form>
    </div>
  );
}

function LinkDialog({ open, onClose, onInsert, initialUrl = '', initialText = '' }) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [openInNewTab, setOpenInNewTab] = useState(false);
  const urlRef = useRef(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setText(initialText);
      setOpenInNewTab(false);
      setTimeout(() => urlRef.current?.focus(), 100);
    }

  }, [open, initialUrl, initialText]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault?.();
    if (!url.trim()) return;
    onInsert({ url: url.trim(), text: text.trim() || url.trim(), openInNewTab });
    onClose();
  }, [url, text, openInNewTab, onInsert, onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="link-dialog-title" className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-lg border border-[#dcdcde] bg-white p-6 shadow-xl">
        <h2 id="link-dialog-title" className="text-base font-semibold text-[#1d2327]">Insert Link</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="link-url" className="block text-sm font-semibold text-[#1d2327]">
              URL <span className="text-red-600">*</span>
            </label>
            <input
              ref={urlRef}
              id="link-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com or /tools/ai-image-prompts"
              className="mt-1 w-full rounded border border-[#8c8f94] bg-white px-3 py-2 text-sm text-[#1d2327] outline-none transition focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
            />
            <p className="mt-1 text-xs text-[#646970]">
              Use internal paths like <code className="rounded bg-[#f0f0f1] px-1">/blog/my-post</code> or full external URLs.
            </p>
          </div>
          <div>
            <label htmlFor="link-text" className="block text-sm font-semibold text-[#1d2327]">Link text</label>
            <input
              id="link-text"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Text to display"
              className="mt-1 w-full rounded border border-[#8c8f94] bg-white px-3 py-2 text-sm text-[#1d2327] outline-none transition focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={openInNewTab} onChange={(e) => setOpenInNewTab(e.target.checked)} className="h-4 w-4 rounded border-[#8c8f94]" />
            <span className="text-sm text-[#1d2327]">Open in new tab</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-5 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]">Cancel</button>
            <button type="button" onClick={handleSubmit} className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96]">Insert Link</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ html, previewMode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#dcdcde] bg-[#f6f7f7] px-3 py-2">
        <p className="text-xs font-semibold text-[#646970]">Preview</p>
      </div>
      <div className={`flex-1 overflow-auto bg-white p-4 ${previewMode === 'mobile' ? 'mx-auto w-[375px] border-x border-[#e5e7eb]' : ''}`}>
        {html ? (
          <div
            className="prose-preview text-sm leading-6 text-[#1d2327] [&_a]:text-[#2271b1] [&_a]:underline [&_a:hover]:text-[#135e96] [&_blockquote]:border-l-4 [&_blockquote]:border-[#2271b1] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#50575e] [&_code]:rounded [&_code]:bg-[#f0f0f1] [&_code]:px-1 [&_code]:font-mono [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#1d2327] [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-[#1d2327] [&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-base [&_h4]:font-bold [&_h4]:text-[#1d2327] [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm italic text-[#a0a4a8]">Nothing to preview yet…</p>
        )}
      </div>
    </div>
  );
}

const EDITOR_PROSE_CLASSES = "prose-admin min-h-[120px] w-full overflow-auto bg-white px-3 py-3 text-sm leading-6 text-[#1d2327] outline-none empty:before:pointer-events-none empty:before:text-[#a0a4a8] empty:before:content-[attr(data-placeholder)] [&_a]:text-[#2271b1] [&_a]:underline [&_a:hover]:text-[#135e96] [&_blockquote]:border-l-4 [&_blockquote]:border-[#2271b1] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#50575e] [&_code]:rounded [&_code]:bg-[#f0f0f1] [&_code]:px-1 [&_code]:font-mono [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#1d2327] [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-[#1d2327] [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:text-base [&_h4]:font-bold [&_h4]:text-[#1d2327] [&_h4]:mt-2 [&_h4]:mb-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_p]:my-1 [&_.editor-table]:my-4 [&_.editor-table]:w-full [&_.editor-table]:border-collapse [&_.editor-table_td]:border [&_.editor-table_td]:border-[#dcdcde] [&_.editor-table_td]:p-2 [&_.editor-table_th]:border [&_.editor-table_th]:border-[#dcdcde] [&_.editor-table_th]:bg-[#f6f7f7] [&_.editor-table_th]:p-2 [&_.editor-table_th]:text-left";

const AUTOSAVE_INTERVAL_MS = 30_000;

function formatAutoSaveTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDraftTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function DraftRestoreBanner({ draft, onAccept, onDismiss }) {
  if (!draft) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-amber-200 bg-amber-50 shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-800">Draft found</p>
          <p className="mt-0.5 text-xs text-amber-600">
            {draft.label && <span className="font-medium">"{draft.label}"</span>}
            {draft.label && ' '}
            {draft.savedAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                saved {formatDraftTime(draft.savedAt)}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-amber-700/70">
            Restore this draft to continue where you left off, or dismiss to start fresh.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-8 items-center gap-1 rounded border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
          >
            <X className="h-3 w-3" />
            Dismiss
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex h-8 items-center gap-1 rounded bg-amber-500 px-3 text-xs font-semibold text-white shadow transition hover:bg-amber-600"
          >
            <Check className="h-3 w-3" />
            Restore draft
          </button>
        </div>
      </div>
    </div>
  );
}

const RichTextEditor = forwardRef(function RichTextEditor({
  value = '',
  onChange,
  placeholder = '',
  rows = 6,
  maxLength,
  id,
  label,
  required = false,
  error,
  helpText,
  showHtmlToggle = true,
  showPreviewProp = true,
  autoSaveKey = '',
  onDraftRestored,
  className = '',
}, ref) {
  const editorRef = useRef(null);
  const [showHtml, setShowHtml] = useState(false);
  const [htmlValue, setHtmlValue] = useState(value);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [showHeadings, setShowHeadings] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogTitle, setLinkDialogTitle] = useState('');
  const [linkDialogUrl, setLinkDialogUrl] = useState('');
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const savedSelectionRef = useRef(null);
  const valueRef = useRef(value);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const headingsRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const lastSavedValueRef = useRef(value);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // Set innerHTML once on mount (uncontrolled contentEditable)
  useEffect(() => {
    if (editorRef.current && value) {
      editorRef.current.innerHTML = value;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync external `value` changes to the DOM ──
  // During normal typing the parent's value equals the DOM innerHTML
  // (because onChange reads innerHTML), so this effect is a no-op.
  // When the parent intentionally changes the value (draft restore,
  // post switch, form reset), innerHTML differs → we write the DOM
  // and restore the caret to the end of the new content.
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value === prevValueRef.current) return; // no change — skip
    prevValueRef.current = value;
    const editor = editorRef.current;
    if (!editor) return;
    if (value === editor.innerHTML) return; // already in sync (typing)

    // External change — update the DOM
    const sel = window.getSelection();
    const hadFocus = editor.contains(sel?.anchorNode);

    editor.innerHTML = value || '';
    valueRef.current = value || '';

    // Restore caret to end of new content if the editor was focused
    if (hadFocus && editor.childNodes.length > 0) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // Sync htmlValue when toggling to HTML source view
  useEffect(() => {
    if (showHtml && editorRef.current) {
      setHtmlValue(editorRef.current.innerHTML || '');
    } else if (showHtml) {
      setHtmlValue(valueRef.current || '');
    }
  }, [showHtml]);

  // Sync htmlValue back to contentEditable when toggling from HTML view
  useEffect(() => {
    if (!showHtml && editorRef.current) {
      editorRef.current.innerHTML = htmlValue || '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHtml]);

  useEffect(() => {
    if (!showHeadings) return;
    const handleClick = (e) => {
      if (headingsRef.current && !headingsRef.current.contains(e.target)) setShowHeadings(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showHeadings]);

  // Escape exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setIsFullscreen(false); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Lock body scroll in fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isFullscreen]);

  // ── Auto-save to localStorage (runs once, uses refs for latest values) ──
  useEffect(() => {
    if (!autoSaveKey || typeof window === 'undefined') return;

    // Restore draft on mount
    const storageKey = `draft:${autoSaveKey}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.value && parsed.value !== valueRef.current) {
          setDraftData(parsed);
          setHasDraft(true);
          setShowDraftBanner(true);
        }
      }
    } catch {
      // Ignore parse errors
    }

    // Auto-save interval — reads from DOM directly, no value dependency
    autoSaveTimerRef.current = setInterval(() => {
      const currentValue = editorRef.current?.innerHTML || '';
      if (!currentValue || currentValue === lastSavedValueRef.current) return;

      setIsAutoSaving(true);
      try {
        const draft = {
          value: currentValue,
          savedAt: new Date().toISOString(),
          label: label || 'Untitled',
        };
        localStorage.setItem(storageKey, JSON.stringify(draft));
        lastSavedValueRef.current = currentValue;
        setAutoSavedAt(new Date());
      } catch {
        // localStorage full or unavailable
      } finally {
        setTimeout(() => setIsAutoSaving(false), 1000);
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveKey]);

  // Clear draft (exposed via window for external access)
  useEffect(() => {
    if (!autoSaveKey || typeof window === 'undefined') return;
    window.__clearEditorDraft = (key) => {
      if (key === autoSaveKey) {
        localStorage.removeItem(`draft:${autoSaveKey}`);
        setHasDraft(false);
        setDraftData(null);
        setShowDraftBanner(false);
      }
    };
    return () => { delete window.__clearEditorDraft; };
  }, [autoSaveKey]);

  // ── Draft restore handlers ──
  const handleAcceptDraft = useCallback(() => {
    if (draftData?.value) {
      onChange?.(draftData.value);
      onDraftRestored?.(draftData.value);
      if (editorRef.current) {
        editorRef.current.innerHTML = draftData.value;
      }
      valueRef.current = draftData.value;
      lastSavedValueRef.current = draftData.value;
    }
    setShowDraftBanner(false);
  }, [draftData, onChange, onDraftRestored]);

  const handleDismissDraft = useCallback(() => {
    if (autoSaveKey && typeof window !== 'undefined') {
      localStorage.removeItem(`draft:${autoSaveKey}`);
    }
    setDraftData(null);
    setHasDraft(false);
    setShowDraftBanner(false);
  }, [autoSaveKey]);

  // Expose imperative methods via ref
  useImperativeHandle(ref, () => ({
    setContent(html) {
      if (editorRef.current) {
        editorRef.current.innerHTML = html || '';
      }
      valueRef.current = html || '';
    },
    getContent() {
      return editorRef.current?.innerHTML || '';
    },
  }));

  const emitChange = useCallback((html) => {
    if (maxLength && html.length > maxLength) return;
    valueRef.current = html;
    onChange?.(html);
  }, [onChange, maxLength]);

  const handleInput = useCallback(() => {
    if (editorRef.current) emitChange(editorRef.current.innerHTML);
  }, [emitChange]);

  const handleHtmlChange = useCallback((e) => {
    setHtmlValue(e.target.value);
    emitChange(e.target.value);
  }, [emitChange]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    if (savedSelectionRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  }, []);

  const execCmd = useCallback((command, val = null) => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    handleInput();
  }, [restoreSelection, handleInput]);

  const insertTable = useCallback(({ rows, columns, hasHeader }) => {
    restoreSelection();
    editorRef.current?.focus();
    const headerCells = Array.from({ length: columns }, (_, index) => (
      `<th scope="col">Header ${index + 1}</th>`
    )).join('');
    const bodyRows = Array.from({ length: hasHeader ? rows - 1 : rows }, () => (
      `<tr>${Array.from({ length: columns }, () => '<td> </td>').join('')}</tr>`
    )).join('');
    const tableHtml = `<table class="editor-table"><${hasHeader ? 'thead' : 'tbody'}><tr>${hasHeader ? headerCells : Array.from({ length: columns }, () => '<td> </td>').join('')}</tr></${hasHeader ? 'thead' : 'tbody'}>${hasHeader ? `<tbody>${bodyRows}</tbody>` : ''}</table><p><br></p>`;
    document.execCommand('insertHTML', false, tableHtml);
    handleInput();
  }, [restoreSelection, handleInput]);

  const setHeading = useCallback((tag) => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, tag);
    handleInput();
    setShowHeadings(false);
  }, [restoreSelection, handleInput]);

  const openLinkDialog = useCallback(() => {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return;
    saveSelection();
    let node = sel.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.tagName === 'A') {
        setLinkDialogUrl(node.href || '');
        setLinkDialogTitle(node.textContent || '');
        setLinkDialogOpen(true);
        return;
      }
      node = node.parentNode;
    }
    setLinkDialogUrl('');
    setLinkDialogTitle(sel.toString());
    setLinkDialogOpen(true);
  }, [saveSelection]);

  const insertLink = useCallback(({ url, text, openInNewTab }) => {
    restoreSelection();
    editorRef.current?.focus();
    if (savedSelectionRef.current) {
      const container = savedSelectionRef.current.commonAncestorContainer;
      const parent = container.nodeType === 1 ? container : container.parentNode;
      const existingLink = parent?.closest?.('a');
      if (existingLink) {
        const range = document.createRange();
        range.selectNodeContents(existingLink);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    const linkHtml = `<a href="${url}"${openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
    document.execCommand('insertHTML', false, linkHtml);
    handleInput();
  }, [restoreSelection, handleInput]);

  const removeLink = useCallback(() => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand('unlink', false);
    handleInput();
  }, [restoreSelection, handleInput]);

  const insertImages = useCallback((urls) => {
    restoreSelection();
    editorRef.current?.focus();
    const imagesHtml = urls.map((url) => {
      const filename = url.split('/').pop()?.split('?')[0] || 'image';
      return `<figure class="my-4"><img src="${url}" alt="${filename}" width="1200" height="675" class="rounded border border-[#e5e7eb]" /></figure>`;
    }).join('');
    document.execCommand('insertHTML', false, imagesHtml);
    handleInput();
  }, [restoreSelection, handleInput]);

  const currentTag = useMemo(() => {
    if (typeof window === 'undefined') return 'p';
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 'p';
    let node = sel.anchorNode;
    while (node && node !== editorRef.current) {
      if (['H2', 'H3', 'H4'].includes(node.tagName)) return node.tagName.toLowerCase();
      node = node.parentNode;
    }
    return 'p';
  }, [isEditorFocused]);

  const currentLabel = HEADING_OPTIONS.find((o) => o.value === currentTag)?.label || 'Paragraph';
  const minHeight = rows * 24;
  // Memoize style objects to avoid new references every render
  const inlineStyle = useMemo(() => ({ minHeight }), [minHeight]);
  const fullscreenStyle = useMemo(() => ({}), []);
  const wordCount = (value || '').replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;

  const handleEditorFocus = useCallback(() => { setIsEditorFocused(true); }, []);
  const handleEditorBlur = useCallback(() => { setIsEditorFocused(false); }, []);

  // Memoized onBlur for the contentEditable div — avoids creating a new
  // function reference every render which causes React to touch the DOM node.
  const handleEditorBlurWithInput = useCallback(() => {
    saveSelection();
    handleEditorBlur();
    handleInput();
  }, [saveSelection, handleEditorBlur, handleInput]);

  function renderToolbarContent() {
    return (
      <>
        <ToolbarButton icon={Undo} label="Undo" onClick={() => execCmd('undo')} />
        <ToolbarButton icon={Redo} label="Redo" onClick={() => execCmd('redo')} />
        <ToolbarDivider />
        <div className="relative" ref={headingsRef}>
          <button type="button" onClick={() => setShowHeadings(!showHeadings)} className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold text-[#50575e] transition hover:bg-[#f0f0f1] hover:text-[#1d2327]">
            <Type className="h-3.5 w-3.5" />{currentLabel}<ChevronDown className="h-3 w-3" />
          </button>
          {showHeadings && (
            <div className="absolute left-0 z-30 mt-1 w-40 overflow-hidden rounded border border-[#dcdcde] bg-white shadow-lg">
              {HEADING_OPTIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => setHeading(option.value)} className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-[#f0f6fc] ${currentTag === option.value ? 'font-bold text-[#2271b1]' : 'text-[#1d2327]'}`}>
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <ToolbarDivider />
        <ToolbarButton icon={Bold} label="Bold" onClick={() => execCmd('bold')} />
        <ToolbarButton icon={Italic} label="Italic" onClick={() => execCmd('italic')} />
        <ToolbarButton icon={Underline} label="Underline" onClick={() => execCmd('underline')} />
        <ToolbarButton icon={Strikethrough} label="Strikethrough" onClick={() => execCmd('strikeThrough')} />
        <ToolbarDivider />
        <ToolbarButton icon={Link} label="Insert link" onClick={openLinkDialog} />
        <ToolbarButton icon={Unlink} label="Remove link" onClick={removeLink} />
        <ToolbarDivider />
        <ToolbarButton icon={List} label="Bullet list" onClick={() => execCmd('insertUnorderedList')} />
        <ToolbarButton icon={ListOrdered} label="Numbered list" onClick={() => execCmd('insertOrderedList')} />
        <ToolbarDivider />
        <ToolbarButton icon={AlignLeft} label="Align left" onClick={() => execCmd('justifyLeft')} />
        <ToolbarButton icon={AlignCenter} label="Align center" onClick={() => execCmd('justifyCenter')} />
        <ToolbarButton icon={AlignRight} label="Align right" onClick={() => execCmd('justifyRight')} />
        <ToolbarDivider />
        <ToolbarButton icon={ImageIcon} label="Insert image" onClick={() => { saveSelection(); setMediaLibraryOpen(true); }} />
        <ToolbarButton icon={Table2} label="Insert table" onClick={() => { saveSelection(); setTableDialogOpen(true); }} />
        <ToolbarButton icon={Quote} label="Block quote" onClick={() => execCmd('formatBlock', 'blockquote')} />
        <ToolbarButton icon={Code} label="Inline code" onClick={() => {
          const sel = window.getSelection();
          if (sel.rangeCount > 0 && !sel.isCollapsed) {
            restoreSelection();
            editorRef.current?.focus();
            document.execCommand('insertHTML', false, `<code class="rounded bg-[#f0f0f1] px-1">${sel.toString()}</code>`);
            handleInput();
          }
        }} />
        {showHtmlToggle && (
          <>
            <ToolbarDivider />
            <button type="button" onClick={() => setShowHtml(!showHtml)} className={`inline-flex h-8 items-center rounded px-2 text-xs font-semibold transition ${showHtml ? 'bg-[#2271b1] text-white' : 'text-[#50575e] hover:bg-[#f0f0f1] hover:text-[#1d2327]'}`}>
              {'</>'} HTML
            </button>
          </>
        )}
        {showPreviewProp && (
          <>
            <ToolbarDivider />
            <button type="button" onClick={() => setShowPreview(!showPreview)} title={showPreview ? 'Hide preview' : 'Show preview'} className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold transition ${showPreview ? 'bg-green-600 text-white' : 'text-[#50575e] hover:bg-[#f0f0f1] hover:text-[#1d2327]'}`}>
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}Preview
            </button>
          </>
        )}
      </>
    );
  }

  function renderEditorArea(fullscreen = false) {
    const proseClass = fullscreen
      ? "prose-admin h-full overflow-auto bg-white p-4 text-sm leading-6 text-[#1d2327] outline-none empty:before:pointer-events-none empty:before:text-[#a0a4a8] empty:before:content-[attr(data-placeholder)] [&_a]:text-[#2271b1] [&_a]:underline [&_a:hover]:text-[#135e96] [&_blockquote]:border-l-4 [&_blockquote]:border-[#2271b1] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#50575e] [&_code]:rounded [&_code]:bg-[#f0f0f1] [&_code]:px-1 [&_code]:font-mono [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#1d2327] [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-[#1d2327] [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:text-base [&_h4]:font-bold [&_h4]:text-[#1d2327] [&_h4]:mt-2 [&_h4]:mb-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_p]:my-1"
      : EDITOR_PROSE_CLASSES;

    if (showHtml) {
      return (
        <textarea
          value={htmlValue}
          onChange={handleHtmlChange}
          rows={rows}
          placeholder="Edit HTML directly…"
          onFocus={handleEditorFocus}
          onBlur={(e) => { handleEditorBlur(); handleHtmlChange(e); }}
          className={`w-full resize-y border-0 bg-white px-3 py-3 font-mono text-sm leading-6 text-[#1d2327] outline-none ${fullscreen ? 'h-full resize-none p-4' : ''}`}
          style={fullscreen ? fullscreenStyle : inlineStyle}
        />
      );
    }

    return (
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        translate="no"
        notranslate="true"
        onInput={handleInput}
        onFocus={handleEditorFocus}
        onBlur={handleEditorBlurWithInput}
        data-placeholder={placeholder}
        id={fullscreen ? undefined : id}
        role="textbox"
        aria-multiline="true"
        aria-label={label || 'Rich text editor'}
        className={proseClass}
        style={fullscreen ? fullscreenStyle : inlineStyle}
      />
    );
  }

  function renderPreviewSection() {
    if (!showPreview) return null;
    return (
      <div className="w-1/2">
        <div className="flex items-center gap-1 border-b border-[#dcdcde] bg-[#f6f7f7] px-2 py-1">
          <button type="button" onClick={() => setPreviewMode('desktop')} className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold transition ${previewMode === 'desktop' ? 'bg-[#2271b1] text-white' : 'text-[#50575e] hover:bg-[#f0f0f1]'}`}>
            <Monitor className="h-3 w-3" /> Desktop
          </button>
          <button type="button" onClick={() => setPreviewMode('mobile')} className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold transition ${previewMode === 'mobile' ? 'bg-[#2271b1] text-white' : 'text-[#50575e] hover:bg-[#f0f0f1]'}`}>
            <Smartphone className="h-3 w-3" /> Mobile
          </button>
        </div>
        <PreviewPanel html={value} previewMode={previewMode} />
      </div>
    );
  }

  function renderAutoSaveIndicator() {
    if (!autoSaveKey) return null;
    if (!isAutoSaving && !autoSavedAt) return null;
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {isAutoSaving ? (
          <><Save className="h-3 w-3 animate-pulse text-[#2271b1]" /><span className="text-[#2271b1]">Saving draft…</span></>
        ) : (
          <><Check className="h-3 w-3 text-green-500" /><span className="text-green-600">Draft saved {formatAutoSaveTime(autoSavedAt)}</span></>
        )}
      </div>
    );
  }

  function renderFullscreenFooter() {
    return (
      <div className="flex items-center justify-between border-t border-[#dcdcde] bg-white px-5 py-2">
        <div className="flex items-center gap-4 text-xs text-[#646970]">
          <span>{wordCount.toLocaleString()} words</span>
          <span>~{Math.max(1, Math.ceil(wordCount / 200))} min read</span>
          {autoSaveKey && (
            <span className="inline-flex items-center gap-1.5">
              {isAutoSaving ? (
                <><Save className="h-3 w-3 animate-pulse text-[#2271b1]" /><span className="text-[#2271b1]">Saving…</span></>
              ) : autoSavedAt ? (
                <><Check className="h-3 w-3 text-green-500" /><span className="text-green-600">Saved {formatAutoSaveTime(autoSavedAt)}</span></>
              ) : (
                <><Save className="h-3 w-3 text-[#a0a4a8]" /><span>Draft auto-saves every 30s</span></>
              )}
            </span>
          )}
        </div>
        <p className="text-xs text-[#a0a4a8]">Press <kbd className="rounded border border-[#dcdcde] bg-[#f6f7f7] px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd> to exit</p>
      </div>
    );
  }

  // ── Fullscreen mode ──
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[9998] flex flex-col bg-[#f0f0f1]" role="dialog" aria-modal="true" aria-label="Fullscreen editor" suppressHydrationWarning>
        {/* Header */}
        <div className={`flex items-center justify-between border-b border-[#dcdcde] bg-white px-5 py-3 transition-all duration-300 ${isFocusMode && isEditorFocused ? 'pointer-events-none opacity-0 hover:pointer-events-auto hover:opacity-100' : ''}`}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-[#1d2327]">{label || 'Editor'} — Fullscreen</h2>
            {maxLength && <span className="text-xs text-[#646970]">{(value || '').length} / {maxLength}</span>}
            {isFocusMode && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#2271b1]/10 px-2 py-0.5 text-[10px] font-bold text-[#2271b1]">
                <Feather className="h-2.5 w-2.5" /> Focus mode — hover toolbar to access
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsFocusMode(!isFocusMode)} title={isFocusMode ? 'Disable focus mode' : 'Enable focus mode'} className={`inline-flex h-9 items-center gap-1.5 rounded px-3 text-xs font-semibold transition ${isFocusMode ? 'bg-[#2271b1] text-white' : 'border border-[#8c8f94] bg-white text-[#2c3338] hover:border-[#2271b1] hover:text-[#2271b1]'}`}>
              <Feather className="h-3.5 w-3.5" />{isFocusMode ? 'Focus ON' : 'Focus mode'}
            </button>
            <button type="button" onClick={() => setIsFullscreen(false)} className="inline-flex h-9 items-center gap-1.5 rounded border border-[#8c8f94] bg-white px-3 text-xs font-semibold text-[#2c3338] transition hover:border-[#2271b1] hover:text-[#2271b1]">
              <Minimize2 className="h-3.5 w-3.5" />Exit fullscreen
            </button>
          </div>
        </div>

        {/* Draft banner (fullscreen) */}
        {showDraftBanner && draftData && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-amber-800">
                  Draft found — {draftData.label && `"${draftData.label}"`} {draftData.savedAt && `saved ${formatDraftTime(draftData.savedAt)}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={handleDismissDraft} className="inline-flex h-7 items-center rounded border border-amber-300 bg-white px-2.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100">
                  Dismiss
                </button>
                <button type="button" onClick={handleAcceptDraft} className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2.5 text-[11px] font-semibold text-white transition hover:bg-amber-600">
                  <Check className="h-3 w-3" />Restore
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`flex flex-wrap items-center gap-0.5 border-b border-[#dcdcde] bg-white px-3 py-2 transition-all duration-300 ${isFocusMode && isEditorFocused ? 'pointer-events-none opacity-0 hover:pointer-events-auto hover:opacity-100' : ''}`}>
            {renderToolbarContent()}
            <ToolbarDivider />
            <button type="button" onClick={() => setIsFocusMode(!isFocusMode)} title={isFocusMode ? 'Disable focus mode' : 'Enable focus mode'} className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold transition ${isFocusMode ? 'bg-[#2271b1] text-white' : 'text-[#50575e] hover:bg-[#f0f0f1] hover:text-[#1d2327]'}`}>
              <Feather className="h-3.5 w-3.5" />{isFocusMode ? 'Focus ON' : 'Focus'}
            </button>
            <button type="button" onClick={() => setIsFullscreen(false)} title="Exit fullscreen (Esc)" className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold bg-[#1d2327] text-white transition hover:bg-[#333]">
              <Minimize2 className="h-3.5 w-3.5" />Exit
            </button>
          </div>

          <div className={`flex min-h-0 flex-1 ${showPreview ? 'divide-x divide-[#dcdcde]' : ''}`}>
            <div className={`min-h-0 flex-1 bg-white ${showPreview ? 'w-1/2' : 'w-full'}`}>
              {renderEditorArea(true)}
            </div>
            {renderPreviewSection()}
          </div>
        </div>

        {renderFullscreenFooter()}
        <LinkDialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} onInsert={insertLink} initialUrl={linkDialogUrl} initialText={linkDialogTitle} />
        <MediaLibrary open={mediaLibraryOpen} onClose={() => setMediaLibraryOpen(false)} onSelect={insertImages} multiple insertMode="html" />
      </div>
    );
  }

  // ── Not mounted yet — render skeleton to avoid hydration mismatch ──
  if (!isMounted) {
    return (
      <div className={className} suppressHydrationWarning>
        {label && (
          <label htmlFor={id} className="block text-sm font-semibold text-[#1d2327]">
            {label}{required && <span className="ml-1 text-red-600">*</span>}
          </label>
        )}
        <div className="mt-2 space-y-2 animate-pulse">
          <div className="flex gap-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-8 w-8 rounded bg-[#e5e7eb]" />
            ))}
          </div>
          <div className="h-32 w-full rounded border border-[#dcdcde] bg-[#f6f7f7]" />
        </div>
      </div>
    );
  }

  // ── Inline mode ──
  return (
    <div className={className} suppressHydrationWarning>
      {label && (
        <label htmlFor={id} className="block text-sm font-semibold text-[#1d2327]">
          {label}{required && <span className="ml-1 text-red-600">*</span>}
        </label>
      )}

      {/* Draft restore banner */}
      <DraftRestoreBanner
        draft={showDraftBanner ? draftData : null}
        onAccept={handleAcceptDraft}
        onDismiss={handleDismissDraft}
      />
      <TableDialog
        open={tableDialogOpen}
        onClose={() => setTableDialogOpen(false)}
        onInsert={insertTable}
      />

      <div className="mt-2 overflow-hidden rounded border border-[#8c8f94] transition focus-within:border-[#2271b1] focus-within:ring-1 focus-within:ring-[#2271b1]">
        <div className={`flex flex-wrap items-center gap-0.5 border-b border-[#dcdcde] bg-[#f6f7f7] px-2 py-1.5 transition-all duration-300 ${isFocusMode && isEditorFocused ? 'pointer-events-none opacity-0 hover:pointer-events-auto hover:opacity-100' : ''}`}>
          {renderToolbarContent()}
          <ToolbarDivider />
          <button type="button" onClick={() => setIsFocusMode(!isFocusMode)} title={isFocusMode ? 'Disable focus mode' : 'Enable focus mode'} className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold transition ${isFocusMode ? 'bg-[#2271b1] text-white' : 'text-[#50575e] hover:bg-[#f0f0f1] hover:text-[#1d2327]'}`}>
            <Feather className="h-3.5 w-3.5" />{isFocusMode ? 'Focus ON' : 'Focus'}
          </button>
          <button type="button" onClick={() => setIsFullscreen(true)} title="Fullscreen (Esc)" className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold text-[#50575e] transition hover:bg-[#f0f0f1] hover:text-[#1d2327]">
            <Maximize2 className="h-3.5 w-3.5" />Fullscreen
          </button>
        </div>

        <div className={`flex ${showPreview ? 'divide-x divide-[#dcdcde]' : ''}`}>
          <div className={`min-h-[120px] bg-white ${showPreview ? 'w-1/2' : 'w-full'}`}>
            {renderEditorArea()}
          </div>
          {renderPreviewSection()}
        </div>
      </div>

      {renderAutoSaveIndicator()}
      {maxLength && <p className="mt-1 text-xs text-[#646970]">{(value || '').length} / {maxLength} characters</p>}
      {helpText && <p className="mt-1 text-xs text-[#646970]">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}

      <LinkDialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} onInsert={insertLink} initialUrl={linkDialogUrl} initialText={linkDialogTitle} />
      <MediaLibrary open={mediaLibraryOpen} onClose={() => setMediaLibraryOpen(false)} onSelect={insertImages} multiple insertMode="html" />
    </div>
  );
});

export default memo(RichTextEditor);
