'use client';

import { OPEN_CONSENT_SETTINGS_EVENT } from '@/lib/consent';

export default function CookieSettingsButton({ className = '' }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_SETTINGS_EVENT))}
      className={className}
    >
      Cookie Settings
    </button>
  );
}
