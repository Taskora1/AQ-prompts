'use client';

import { useState } from 'react';
import { useCopyGate } from '@/components/CopyGate';

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '-9999px';
  document.body.appendChild(field);
  field.focus();
  field.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard copy was rejected.');
  } finally {
    field.remove();
  }
}

export default function TextPromptCopyButton({ prompt, promptId }) {
  const [feedback, setFeedback] = useState('');
  const { copyGate, copied, requestCopy } = useCopyGate({ promptId });

  async function handleCopy() {
    try {
      const copiedNow = await requestCopy(prompt);
      if (copiedNow) setFeedback('Full prompt copied to clipboard.');
    } catch {
      setFeedback('Copy failed. Select the prompt text and copy it manually.');
    }
  }

  return (
    <>
      {copyGate}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#ff6b35] px-5 py-2 text-sm font-bold text-[#111118] transition hover:bg-[#e85d28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-2"
        >
          {copied ? 'Copied!' : 'Copy Prompt'}
        </button>
        <span className="text-sm text-[var(--text-secondary)]" role="status" aria-live="polite">
          {feedback}
        </span>
      </div>
    </>
  );
}
