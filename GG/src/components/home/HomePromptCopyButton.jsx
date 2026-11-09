'use client';

import { Copy, Check } from 'lucide-react';
import { useCopyGate } from '@/components/CopyGate';

export default function HomePromptCopyButton({ prompt, promptId }) {
  const { copied, copyGate, requestCopy } = useCopyGate({ promptId });

  async function handleCopy() {
    try {
      await requestCopy(prompt);
    } catch {
      // CopyGate handles visible subscribe/copy errors.
    }
  }

  return (
    <>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Prompt copied to clipboard' : ''}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition sm:w-auto ${
          copied
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-[#ff6b35]/30 bg-[#ff6b3520] text-[#c2410c] hover:border-[#ff6b35]'
        }`}
        aria-label={copied ? 'Prompt copied' : 'Copy prompt'}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied!' : 'Copy Prompt'}
      </button>
      {copyGate}
    </>
  );
}