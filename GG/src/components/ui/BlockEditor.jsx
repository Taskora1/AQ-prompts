'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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
  AlignJustify,
  Quote,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Undo2,
  Redo2,
  ImageIcon,
  Type,
  ChevronDown,
  Highlighter,
  RemoveFormatting,
  Table2,
  Maximize2,
  Minimize2,
} from 'lucide-react';

import { createExtensions } from './editor-extensions';
import MediaLibrary from './MediaLibrary';
import './editor-styles.css';

/* ────────────────────────────────────────────
   Tiny helpers
   ──────────────────────────────────────────── */

function ToolbarButton({ icon: Icon, label, active, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
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

/* ────────────────────────────────────────────
   Link dialog
   ──────────────────────────────────────────── */

function LinkDialog({ open, onClose, onInsert, initialUrl = '' }) {
  const [url, setUrl] = useState(initialUrl);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialUrl]);

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      // Pass the URL (empty string if blank) so setLink can handle both
      // insert and removal, then always close the dialog.
      onInsert(url.trim());
      onClose();
    },
    [url, onInsert, onClose],
  );

  const handleInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-lg border border-[#dcdcde] bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-[#1d2327]">Insert Link</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="block-editor-link-url" className="block text-sm font-semibold text-[#1d2327]">
              URL <span className="text-red-600">*</span>
            </label>
            <input
              ref={inputRef}
              id="block-editor-link-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="https://example.com or /blog/my-post"
              className="mt-1 w-full rounded border border-[#8c8f94] bg-white px-3 py-2 text-sm text-[#1d2327] outline-none transition focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-5 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96]">
              Insert Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageAltDialog({ open, onClose, onInsert, imageCount = 1 }) {
  const [altText, setAltText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setAltText('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    onInsert(altText.trim());
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="image-alt-dialog-title" className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-lg border border-[#dcdcde] bg-white p-6 shadow-xl">
        <h2 id="image-alt-dialog-title" className="text-base font-semibold text-[#1d2327]">Add image alt text</h2>
        <p className="mt-2 text-sm text-[#646970]">
          Describe what the image shows for visitors using screen readers.
          {imageCount > 1 ? ' This text will be applied to all selected images.' : ''}
        </p>
        <label htmlFor="block-editor-image-alt" className="mt-4 block text-sm font-semibold text-[#1d2327]">
          Alt text <span className="font-normal text-[#646970]">(optional for decorative images)</span>
        </label>
        <input
          ref={inputRef}
          id="block-editor-image-alt"
          type="text"
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleSubmit();
            }
          }}
          maxLength={300}
          placeholder="Describe what is shown in this image..."
          className="mt-1 w-full rounded border border-[#8c8f94] bg-white px-3 py-2 text-sm text-[#1d2327] outline-none transition focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
        />
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center justify-center rounded border border-[#8c8f94] bg-white px-5 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96]">
            Insert image
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   Heading dropdown
   ──────────────────────────────────────────── */

const HEADING_OPTIONS = [
  { value: 'p', label: 'Paragraph', icon: Type },
  { value: 'h1', label: 'Heading 1', icon: Heading1 },
  { value: 'h2', label: 'Heading 2', icon: Heading2 },
  { value: 'h3', label: 'Heading 3', icon: Heading3 },
  { value: 'h4', label: 'Heading 4', icon: Heading4 },
  { value: 'h5', label: 'Heading 5', icon: Heading5 },
  { value: 'h6', label: 'Heading 6', icon: Heading6 },
];

function HeadingDropdown({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const savedSelectionRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!editor) return null;

  const current = HEADING_OPTIONS.find((opt) => {
    if (opt.value === 'p') return editor.isActive('paragraph') && !editor.isActive('heading');
    return editor.isActive('heading', { level: parseInt(opt.value.slice(1)) });
  }) || HEADING_OPTIONS[0];

  const Icon = current.icon;

  const applyHeading = (opt) => {
    const selection = savedSelectionRef.current || editor.state.selection;
    savedSelectionRef.current = null;
    editor.chain().focus().setTextSelection(selection).run();

    if (opt.value === 'p') {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().setHeading({ level: parseInt(opt.value.slice(1), 10) }).run();
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          if (!open) {
            savedSelectionRef.current = editor.state.selection;
          }
        }}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold text-[#50575e] transition hover:bg-[#f0f0f1] hover:text-[#1d2327]"
      >
        <Icon className="h-3.5 w-3.5" />
        {current.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-44 overflow-hidden rounded border border-[#dcdcde] bg-white shadow-lg">
          {HEADING_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const isActive = opt === current;
            return (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyHeading(opt)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-[#f0f6fc] ${
                  isActive ? 'font-bold text-[#2271b1]' : 'text-[#1d2327]'
                }`}
              >
                <OptIcon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────
   Main BlockEditor component
   ──────────────────────────────────────────── */

const BlockEditor = forwardRef(function BlockEditor(
  {
    value = '',
    onChange,
    placeholder = 'Write your blog post…',
    rows = 20,
    className = '',
  },
  ref,
) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [imageAltDialogOpen, setImageAltDialogOpen] = useState(false);
  const [pendingImageUrls, setPendingImageUrls] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const savedSelectionRef = useRef(null);

  const extensions = useMemo(
    () => createExtensions({ placeholder }),
    [placeholder],
  );

  /* ── Editor instance ── */
  const editor = useEditor({
    extensions,
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap-editor-content outline-none min-h-[200px]',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
  });

  /* ── Sync external value changes ── */
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;
    // Only update if the editor content genuinely differs
    if (value === editor.getHTML()) return;
    editor.commands.setContent(value || '', false);
  }, [value, editor]);

  /* ── Imperative handle ── */
  useImperativeHandle(ref, () => ({
    getContent: () => editor?.getHTML() || '',
    setContent: (html) => {
      editor?.commands.setContent(html || '', false);
      prevValueRef.current = html || '';
    },
  }));

  /* ── Link helpers ── */
  const setLink = useCallback(
    (url) => {
      if (!editor) return;

      // Restore the selection that was saved before the dialog opened
      if (savedSelectionRef.current) {
        const { from, to } = savedSelectionRef.current;
        savedSelectionRef.current = null;
        editor.chain().focus().setTextSelection({ from, to }).run();
      }

      // Empty URL → remove the link
      if (!url) {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }

      // Apply link — extendMarkRange ensures the full link mark is updated
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: url })
        .run();
    },
    [editor],
  );

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    // Save the current selection before the dialog steals focus
    savedSelectionRef.current = editor.view.state.selection;
    const attrs = editor.getAttributes('link');
    setLinkUrl(attrs.href || '');
    setLinkDialogOpen(true);
  }, [editor]);

  const closeLinkDialog = useCallback(() => {
    savedSelectionRef.current = null;
    setLinkDialogOpen(false);
    // Return focus to the editor
    editor?.chain().focus().run();
  }, [editor]);

  /* ── Image from MediaLibrary ── */
  const handleMediaSelect = useCallback(
    (images) => {
      if (!editor || !images?.length) return;
      const urls = Array.isArray(images) ? images : [images];
      const validUrls = urls
        .map((img) => (typeof img === 'string' ? img : img.url))
        .filter(Boolean);
      if (!validUrls.length) return;
      setPendingImageUrls(validUrls);
      setMediaOpen(false);
      setImageAltDialogOpen(true);
    },
    [editor],
  );

  const insertImagesWithAlt = useCallback(
    (alt) => {
      if (!editor || !pendingImageUrls.length) return;
      const chain = editor.chain().focus();
      pendingImageUrls.forEach((url) => {
        chain.insertContent([
          { type: 'image', attrs: { src: url, alt } },
          { type: 'paragraph' },
        ]);
      });
      chain.run();
      setPendingImageUrls([]);
    },
    [editor, pendingImageUrls],
  );

  const closeImageAltDialog = useCallback(() => {
    setImageAltDialogOpen(false);
    setPendingImageUrls([]);
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    if (!editor) return;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openLinkDialog();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editor, openLinkDialog]);

  if (!editor) return null;

  /* ──────────────────────
     Toolbar
     ────────────────────── */
  const renderToolbar = () => (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[#dcdcde] bg-[#f6f7f7] px-2 py-1.5">
      {/* Undo / Redo */}
      <ToolbarButton icon={Undo2} label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} />
      <ToolbarButton icon={Redo2} label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} />
      <ToolbarDivider />

      {/* Headings */}
      <HeadingDropdown editor={editor} />
      <ToolbarDivider />

      {/* Inline formatting */}
      <ToolbarButton icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton icon={Underline} label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarButton icon={Strikethrough} label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolbarButton icon={Highlighter} label="Highlight" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} />
      <ToolbarButton icon={Code} label="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
      <ToolbarButton
        icon={Code}
        label="Prompt block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarDivider />

      {/* Links */}
      <ToolbarButton icon={Link} label="Insert link" active={editor.isActive('link')} onClick={openLinkDialog} />
      <ToolbarButton icon={Unlink} label="Remove link" onClick={() => { savedSelectionRef.current = null; editor.chain().focus().unsetLink().run(); }} disabled={!editor.isActive('link')} />
      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton icon={List} label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton icon={ListOrdered} label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarDivider />

      {/* Blockquote */}
      <ToolbarButton icon={Quote} label="Block quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton icon={AlignLeft} label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
      <ToolbarButton icon={AlignCenter} label="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
      <ToolbarButton icon={AlignRight} label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
      <ToolbarButton icon={AlignJustify} label="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} />
      <ToolbarDivider />

      {/* Image */}
      <ToolbarButton icon={ImageIcon} label="Insert image" onClick={() => setMediaOpen(true)} />
      <ToolbarButton
        icon={Table2}
        label="Insert table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />
      <ToolbarButton icon={RemoveFormatting} label="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} />

      {/* Fullscreen */}
      <div className="ml-auto">
        <ToolbarButton
          icon={isFullscreen ? Minimize2 : Maximize2}
          label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={() => setIsFullscreen(!isFullscreen)}
        />
      </div>
    </div>
  );

  /* ──────────────────────
     Editor area
     ────────────────────── */
  const editorContent = (
    <div
      ref={containerRef}
      className="min-h-[200px] w-full overflow-auto bg-white px-4 py-3 text-sm leading-6 text-[#1d2327]"
      style={rows ? { minHeight: rows * 24 } : undefined}
    >
      <EditorContent editor={editor} className="tiptap-editor" />
    </div>
  );

  /* ──────────────────────
     Fullscreen wrapper
     ────────────────────── */
  if (isFullscreen) {
    return (
      <>
        <div className="fixed inset-0 z-[9998] flex flex-col bg-[#f0f0f1]">
          <div className="flex items-center justify-between border-b border-[#dcdcde] bg-white px-5 py-3">
            <h2 className="text-sm font-semibold text-[#1d2327]">Block Editor — Fullscreen</h2>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-[#8c8f94] bg-white px-3 text-xs font-semibold text-[#2c3338] transition hover:border-[#2271b1] hover:text-[#2271b1]"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit fullscreen
            </button>
          </div>
          {renderToolbar()}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-white">
            <div className="mx-auto w-full max-w-3xl flex-1 p-4">
              {editorContent}
            </div>
          </div>
        </div>
        <LinkDialog
          open={linkDialogOpen}
          onClose={closeLinkDialog}
          onInsert={setLink}
          initialUrl={linkUrl}
        />
        <ImageAltDialog
          open={imageAltDialogOpen}
          onClose={closeImageAltDialog}
          onInsert={insertImagesWithAlt}
          imageCount={pendingImageUrls.length}
        />
        <MediaLibrary
          open={mediaOpen}
          onClose={() => setMediaOpen(false)}
          onSelect={handleMediaSelect}
          multiple
          insertMode="html"
        />
      </>
    );
  }

  /* ──────────────────────
     Inline (normal) mode
     ────────────────────── */
  return (
    <div className={`overflow-hidden rounded border border-[#8c8f94] transition focus-within:border-[#2271b1] focus-within:ring-1 focus-within:ring-[#2271b1] ${className}`}>
      {renderToolbar()}
      {editorContent}
      <LinkDialog
        open={linkDialogOpen}
        onClose={closeLinkDialog}
        onInsert={setLink}
        initialUrl={linkUrl}
      />
      <ImageAltDialog
        open={imageAltDialogOpen}
        onClose={closeImageAltDialog}
        onInsert={insertImagesWithAlt}
        imageCount={pendingImageUrls.length}
      />
      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={handleMediaSelect}
        multiple
        insertMode="html"
      />
    </div>
  );
});

export default BlockEditor;
