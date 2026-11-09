'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteTextPromptButton({ promptId, promptTitle }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function deletePrompt() {
    if (!window.confirm(`Delete “${promptTitle}”? This cannot be undone.`)) return;

    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/admin/api/text-prompts/${promptId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The Text prompt could not be deleted.');
      router.refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'The Text prompt could not be deleted.');
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={deletePrompt}
        disabled={busy}
        className="font-semibold text-red-700 underline disabled:opacity-60"
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {error ? <span role="alert" className="mt-1 text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
