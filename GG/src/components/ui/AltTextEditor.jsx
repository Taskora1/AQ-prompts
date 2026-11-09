'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ImageIcon, Pencil, X } from 'lucide-react';

export default function AltTextEditor({ images = [], altTexts = {}, onChange }) {
  const [editingIndex, setEditingIndex] = useState(null);

  function updateAlt(index, alt) {
    const next = { ...altTexts, [index]: alt };
    onChange(next);
  }

  if (!images.length) {
    return (
      <div className="rounded border border-dashed border-[#c3c4c7] bg-white p-4 text-center">
        <ImageIcon size={20} className="mx-auto mb-2 text-[#8c8f94]" />
        <p className="text-sm text-[#646970]">No images to edit alt text for.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#646970]">
        Alt text helps search engines understand your images and improves accessibility.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {images.map((image, index) => {
          const url = typeof image === 'string' ? image : image?.url || '';
          const alt = altTexts[index] || altTexts[String(index)] || '';
          const isEditing = editingIndex === index;

          if (!url) return null;

          return (
            <div
              key={index}
              className="flex items-start gap-3 rounded border border-[#dcdcde] bg-white p-3"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-[#c3c4c7] bg-[#f0f0f1]">
                <Image
                  src={url}
                  alt={alt || ''}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-[#8c8f94]">
                    Image {index + 1} {alt.trim() ? (
                      <span className="ml-1 text-green-600">✓</span>
                    ) : (
                      <span className="ml-1 text-[#b32d2e]">⚠ Required</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(isEditing ? null : index)}
                    className="shrink-0 rounded p-1 text-[#646970] transition hover:text-[#2271b1]"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
                {isEditing ? (
                  <input
                    value={alt}
                    onChange={(e) => updateAlt(index, e.target.value)}
                    placeholder="Describe this image..."
                    maxLength={200}
                    className="mt-1 w-full rounded border border-[#8c8f94] px-2 py-1 text-xs outline-none focus:border-[#2271b1]"
                    autoFocus
                  />
                ) : (
                  <p className="mt-1 truncate text-xs text-[#1d2327]">
                    {alt || <span className="italic text-[#b32d2e]">No alt text</span>}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}