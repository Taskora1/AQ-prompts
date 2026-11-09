'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Grid3X3,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  Upload,
  X,
} from 'lucide-react';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function MediaGrid({ images, selected, onSelect, onInsert, loading }) {
  if (loading && images.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircle className="h-6 w-6 animate-spin text-[#2271b1]" />
        <span className="ml-2 text-sm text-[#646970]">Loading media…</span>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageIcon className="h-10 w-10 text-[#c3c4c7]" />
        <p className="mt-3 text-sm font-semibold text-[#646970]">No images found</p>
        <p className="mt-1 text-xs text-[#a0a4a8]">Upload an image or try a different search.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {images.map((image) => {
        const isSelected = selected.includes(image.url);
        return (
          <button
            key={image.id}
            type="button"
            onClick={() => onSelect(image)}
            onDoubleClick={() => onInsert(image)}
            className={`group relative aspect-square overflow-hidden rounded border-2 transition ${
              isSelected
                ? 'border-[#2271b1] ring-2 ring-[#2271b1]/30'
                : 'border-transparent hover:border-[#8c8f94]'
            }`}
          >
            <img
              src={image.thumbnail || image.url}
              alt={image.filename}
              width={image.width || 800}
              height={image.height || 600}
              className="h-full w-full object-cover"
              loading="lazy"
            />

            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
              {isSelected && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2271b1] text-white">
                  <Check className="h-4 w-4" />
                </span>
              )}
            </div>

            {/* Filename tooltip */}
            <div className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
              {image.filename}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function MediaLibrary({ open, onClose, onSelect, multiple = false, insertMode = 'url' }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const fetchImages = useCallback(async (cursor = null, searchTerm = '') => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (searchTerm) params.set('search', searchTerm);

      const response = await fetch(`/admin/api/media?${params.toString()}`);
      if (response.redirected && response.url.includes('/admin/login')) {
        throw new Error('Your admin session may have expired. Please refresh the page and sign in again.');
      }

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(response.status === 401
          ? 'Your admin session may have expired. Please refresh the page and sign in again.'
          : `Failed to load media (${response.status}). The server returned an unexpected response.`);
      }

      if (!response.ok) throw new Error(result?.error || 'Failed to load media.');

      setImages((prev) => {
        if (cursor) {
          return [...prev, ...result.images];
        }
        return result.images;
      });
      setNextCursor(result.nextCursor || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (open) {
      setSelected([]);
      setImages([]);
      setNextCursor(null);
      setCursorStack([]);
      setSearch('');
      fetchImages();
    }
  }, [open, fetchImages]);

  // Search with debounce
  useEffect(() => {
    if (!open) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      setImages([]);
      setNextCursor(null);
      setCursorStack([]);
      fetchImages(null, search);
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search, open, fetchImages]);

  function handleSelect(image) {
    if (multiple) {
      setSelected((prev) =>
        prev.includes(image.url)
          ? prev.filter((u) => u !== image.url)
          : [...prev, image.url]
      );
    } else {
      setSelected([image.url]);
    }
  }

  function handleInsert(image) {
    const urls = multiple
      ? (selected.length > 0 ? selected : [image.url])
      : [image.url];
    onSelect(urls);
    onClose();
  }

  function handleInsertSelected() {
    if (selected.length > 0) {
      onSelect(selected);
      onClose();
    }
  }

  function loadMore() {
    if (nextCursor && !loading) {
      setCursorStack((prev) => [...prev, nextCursor]);
      fetchImages(nextCursor, search);
    }
  }

  function goBack() {
    if (cursorStack.length > 0) {
      const newStack = [...cursorStack];
      const prevCursor = newStack.pop();
      setCursorStack(newStack);
      setImages([]);
      fetchImages(prevCursor, search);
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setUploadProgress(`Skipping ${file.name} — not a supported image type (JPEG, PNG, WebP, or SVG).`);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setUploadProgress(`Skipping ${file.name} — too large (max 4 MB).`);
        continue;
      }

      setUploadProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}…`);

      try {
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

        if (!response.ok) throw new Error(result?.error || 'Upload failed');

        // Add the new image to the top of the list
        setImages((prev) => [{
          id: result.publicId || file.name,
          url: result.url || result.secureUrl,
          thumbnail: result.url || result.secureUrl,
          width: result.width || 0,
          height: result.height || 0,
          format: result.format || file.type.split('/')[1],
          bytes: file.size,
          createdAt: new Date().toISOString(),
          filename: file.name,
        }, ...prev]);
      } catch (err) {
        setUploadProgress(`Error uploading ${file.name}: ${err.message}`);
      }
    }

    setUploadProgress('');
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function copyUrl(url) {
    navigator.clipboard.writeText(url);
  }

  if (!open) return null;

  const selectedImage = images.find((img) => img.url === selected[selected.length - 1]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-library-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 mx-4 flex h-[85vh] w-full max-w-6xl flex-col rounded-lg border border-[#dcdcde] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#dcdcde] px-5 py-3">
          <h2 id="media-library-title" className="text-base font-semibold text-[#1d2327]">
            Media Library
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#646970]">
              {images.length} image{images.length !== 1 ? 's' : ''}
              {selected.length > 0 && ` · ${selected.length} selected`}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[#646970] transition hover:bg-[#f0f0f1] hover:text-[#1d2327]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-[#dcdcde] px-5 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#646970]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search images…"
              className="h-9 w-full rounded border border-[#8c8f94] bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#2271b1] focus:ring-1 focus:ring-[#2271b1]"
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-9 items-center gap-1.5 rounded border border-[#2271b1] bg-white px-3 text-xs font-semibold text-[#2271b1] transition hover:bg-[#f0f6fc] disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Uploading…' : 'Upload'}
          </button>

          {cursorStack.length > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex h-9 items-center gap-1 rounded border border-[#8c8f94] bg-white px-2 text-xs font-semibold text-[#646970] transition hover:border-[#2271b1] hover:text-[#2271b1]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Upload progress */}
        {uploadProgress && (
          <div className="border-b border-[#dcdcde] bg-[#f0f6fc] px-5 py-2 text-xs text-[#2271b1]">
            <LoaderCircle className="mr-1.5 inline h-3 w-3 animate-spin" />
            {uploadProgress}
          </div>
        )}

        {/* Content area */}
        <div className="flex min-h-0 flex-1">
          {/* Image grid */}
          <div className="flex-1 overflow-auto p-4">
            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <MediaGrid
              images={images}
              selected={selected}
              onSelect={handleSelect}
              onInsert={handleInsert}
              loading={loading}
            />

            {/* Load more */}
            {nextCursor && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-1.5 rounded border border-[#8c8f94] bg-white px-4 text-xs font-semibold text-[#646970] transition hover:border-[#2271b1] hover:text-[#2271b1] disabled:opacity-50"
                >
                  {loading ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Grid3X3 className="h-3.5 w-3.5" />
                  )}
                  Load more images
                </button>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedImage && (
            <div className="hidden w-72 shrink-0 overflow-auto border-l border-[#dcdcde] bg-[#f6f7f7] p-4 sm:block">
              <p className="text-xs font-semibold uppercase text-[#646970]">Selected image</p>
              <div className="mt-3 overflow-hidden rounded border border-[#dcdcde] bg-white">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.filename}
                  width={selectedImage.width || 800}
                  height={selectedImage.height || 600}
                  className="w-full object-contain"
                  style={{ maxHeight: '200px' }}
                />
              </div>
              <div className="mt-3 space-y-2 text-xs text-[#50575e]">
                <p className="truncate font-semibold text-[#1d2327]">{selectedImage.filename}</p>
                {selectedImage.width > 0 && (
                  <p>{selectedImage.width} × {selectedImage.height}px</p>
                )}
                {selectedImage.bytes > 0 && (
                  <p>{formatBytes(selectedImage.bytes)}</p>
                )}
                {selectedImage.format && (
                  <p className="uppercase">{selectedImage.format}</p>
                )}
              </div>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => copyUrl(selectedImage.url)}
                  className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded border border-[#8c8f94] bg-white px-3 text-xs font-semibold text-[#2c3338] transition hover:border-[#2271b1] hover:text-[#2271b1]"
                >
                  <Copy className="h-3 w-3" />
                  Copy URL
                </button>
                <button
                  type="button"
                  onClick={() => handleInsert(selectedImage)}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded bg-[#2271b1] px-4 text-xs font-semibold text-white transition hover:bg-[#135e96]"
                >
                  Insert into post
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#dcdcde] px-5 py-3">
          <p className="text-xs text-[#646970]">
            Double-click to insert · Click to select
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded border border-[#8c8f94] bg-white px-4 text-sm font-semibold text-[#2c3338] transition hover:bg-[#f0f0f1]"
            >
              Cancel
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={handleInsertSelected}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded bg-[#2271b1] px-4 text-sm font-semibold text-white transition hover:bg-[#135e96]"
              >
                Insert {multiple && selected.length > 1 ? `${selected.length} images` : 'image'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
