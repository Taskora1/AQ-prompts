'use client';

import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useCopyGate } from '@/components/CopyGate';
import { withAspectRatio } from '@/lib/prompt-ratio';

const ratios = [
  { value: '4:5', label: 'Instagram Feed' },
  { value: '1:1', label: 'Square' },
  { value: '9:16', label: 'Reels' },
  { value: '16:9', label: 'Landscape' },
];

export default function PromptCopyControls({ prompt, promptId, tags = [] }) {
  const [selectedRatio, setSelectedRatio] = useState('4:5');
  const [tagsCopied, setTagsCopied] = useState(false);
  const { copied, copyGate, requestCopy } = useCopyGate({ promptId });

  const displayPrompt = useMemo(
    () => withAspectRatio(prompt, selectedRatio),
    [prompt, selectedRatio]
  );

  async function copyPrompt() {
    await requestCopy(displayPrompt);
  }

  async function copyTags() {
    const tagText = tags.map((tag) => `#${tag.replace(/\s+/g, '')}`).join(' ');
    await navigator.clipboard.writeText(tagText);
    setTagsCopied(true);
    window.setTimeout(() => setTagsCopied(false), 1800);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">Aspect ratio</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ratios.map((ratio) => (
            <button
              key={ratio.value}
              type="button"
              onClick={() => setSelectedRatio(ratio.value)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                selectedRatio === ratio.value
                  ? 'border-[#ff6b35] bg-[#ff6b35] text-white'
                  : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[#ff6b35]'
              }`}
            >
              {ratio.value}
              <span className="ml-2 text-xs opacity-80">{ratio.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-xs font-semibold uppercase text-[var(--text-muted)]">Prompt</span>
          <button type="button" onClick={copyPrompt} className="inline-flex items-center gap-2 text-sm font-semibold text-[#c2410c]">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="whitespace-pre-wrap p-5 font-mono text-sm leading-7 text-[var(--text-primary)]">{displayPrompt}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={copyPrompt}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-5 font-semibold text-white transition-colors hover:bg-[#ff6b35]/90"
        >
          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          {copied ? 'Prompt copied' : 'Copy full prompt'}
        </button>
        {tags.length > 0 && (
          <button
            type="button"
            onClick={copyTags}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 font-semibold text-[var(--text-primary)] transition-colors hover:border-[#ff6b35]"
          >
            {tagsCopied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            {tagsCopied ? 'Tags copied' : 'Copy Instagram tags'}
          </button>
        )}
      </div>
      {copyGate}
    </div>
  );
}