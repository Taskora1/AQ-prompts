'use client';

import { useEffect } from 'react';

import { OPEN_CONSENT_SETTINGS_EVENT } from '@/lib/consent';

// Shown when a user taps Save but the bookmark could not be stored because
// the "Preferences" cookie is not consented to (banner rejected or not yet
// answered). The save is NOT forced through: the notice explains why it did
// not stick and offers a one-tap way to open cookie settings. Styled after
// the CopyGate notice pill so it matches the existing UI.
export default function SaveConsentNotice({ open, onClose, autoDismissMs = 8000 }) {
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => onClose?.(), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [open, onClose, autoDismissMs]);

  if (!open) return null;

  function openCookieSettings() {
    window.dispatchEvent(new Event(OPEN_CONSENT_SETTINGS_EVENT));
    onClose?.();
  }

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[110] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl bg-[#111118] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(0,0,0,0.28)] ring-1 ring-white/10"
      role="status"
      aria-live="polite"
    >
      <p>Saved prompts need Preferences cookies enabled, so this prompt was not saved.</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={openCookieSettings}
          className="rounded-full bg-[#ff6b35] px-3 py-1.5 text-xs font-black text-[#111118]"
        >
          Cookie settings
        </button>
        <button
          type="button"
          onClick={() => onClose?.()}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
