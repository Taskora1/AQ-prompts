'use client';

import HomePromptCopyButton from '@/components/home/HomePromptCopyButton';

export default function PromptCardCopy({ promptText, promptId }) {
  if (!promptText) return null;

  return (
    <div className="mt-3">
      <HomePromptCopyButton prompt={promptText} promptId={promptId} />
    </div>
  );
}
