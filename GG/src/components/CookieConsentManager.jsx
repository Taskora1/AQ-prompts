'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Cookie, Settings2, X } from 'lucide-react';

import {
  CONSENT_AUTHORITY_CUSTOM,
  CONSENT_AUTHORITY_GOOGLE,
  CONSENT_AUTHORITY_PENDING,
  DEFAULT_CONSENT,
  OPEN_CONSENT_SETTINGS_EVENT,
  readConsent,
  saveConsent,
  setConsentAuthority,
} from '@/lib/consent';
import { hasGoogleCmpBootstrap, readGoogleCmpConsent } from '@/lib/google-cmp';

const ANALYTICS_IDLE_TIMEOUT_MS = 8000;
let analyticsLoadScheduled = false;

function updateGoogleConsent(consent) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('consent', 'update', {
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: consent.advertising ? 'granted' : 'denied',
    ad_user_data: consent.advertising ? 'granted' : 'denied',
    ad_personalization: consent.advertising ? 'granted' : 'denied',
  });
}

function loadGoogleAnalytics(gaId) {
  if (!gaId || document.getElementById('aqprompts-ga-script')) return;

  window.gtag('js', new Date());
  window.gtag('config', gaId, { anonymize_ip: true });

  const script = document.createElement('script');
  script.id = 'aqprompts-ga-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(script);
}

function loadMicrosoftClarity(clarityId) {
  if (!clarityId || document.getElementById('aqprompts-clarity-script')) return;

  window.clarity = window.clarity || function clarity() {
    (window.clarity.q = window.clarity.q || []).push(arguments);
  };

  const script = document.createElement('script');
  script.id = 'aqprompts-clarity-script';
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`;
  document.head.appendChild(script);
}

function scheduleAnalyticsLoad(gaId, clarityId) {
  if (analyticsLoadScheduled) return;

  analyticsLoadScheduled = true;
  const load = () => {
    analyticsLoadScheduled = false;
    loadGoogleAnalytics(gaId);
    loadMicrosoftClarity(clarityId);
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(load, { timeout: ANALYTICS_IDLE_TIMEOUT_MS });
  } else {
    window.setTimeout(load, ANALYTICS_IDLE_TIMEOUT_MS);
  }
}

function applyConsent(consent, gaId, clarityId) {
  updateGoogleConsent(consent);

  if (consent.analytics) {
    scheduleAnalyticsLoad(gaId, clarityId);
  }
}

const categories = [
  {
    key: 'necessary',
    title: 'Necessary',
    description: 'Required for security, sign-in, consent storage, and features you explicitly use.',
  },
  {
    key: 'analytics',
    title: 'Analytics',
    description: 'Allows Google Analytics and Microsoft Clarity to measure site usage and improve pages.',
  },
  {
    key: 'advertising',
    title: 'Advertising',
    description: 'Allows Adsterra native banners on the homepage, selected blog articles, and prompt detail pages, plus Adsterra display banners in the prompt library and below prompt detail images. The provider may process technical and usage data to deliver and measure ads.',
  },
  {
    key: 'preferences',
    title: 'Preferences',
    description: 'Remembers optional choices such as theme, saved prompts, and recent prompt history.',
  },
];

export default function CookieConsentManager({ gaId = '', clarityId = '' }) {
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [choices, setChoices] = useState(DEFAULT_CONSENT);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const authorityRef = useRef(CONSENT_AUTHORITY_PENDING);
  const googleAnalyticsConsentRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let fallbackTimer;
    let tcfListenerId;

    function activateCustomConsent() {
      if (disposed || authorityRef.current === CONSENT_AUTHORITY_GOOGLE) return;

      authorityRef.current = CONSENT_AUTHORITY_CUSTOM;
      const stored = readConsent();
      const initial = stored || DEFAULT_CONSENT;
      setConsentAuthority(CONSENT_AUTHORITY_CUSTOM, initial);
      setChoices(initial);
      applyConsent(initial, gaId, clarityId);
      setShowPreferences(false);
      setShowBanner(!stored);
    }

    function activateGoogleCmp() {
      if (disposed || authorityRef.current === CONSENT_AUTHORITY_GOOGLE) return;

      authorityRef.current = CONSENT_AUTHORITY_GOOGLE;
      setConsentAuthority(CONSENT_AUTHORITY_GOOGLE, DEFAULT_CONSENT);
      setShowBanner(false);
      setShowPreferences(false);
    }

    function syncGoogleCmpConsent() {
      if (disposed || authorityRef.current !== CONSENT_AUTHORITY_GOOGLE) return;

      const consent = readGoogleCmpConsent();
      if (!consent) return;

      const previouslyGranted = googleAnalyticsConsentRef.current;
      googleAnalyticsConsentRef.current = consent.analytics;
      setConsentAuthority(CONSENT_AUTHORITY_GOOGLE, consent);

      // Google's CMP owns and updates Consent Mode in covered regions. AQPrompts
      // only gates its analytics tags from the CMP's published status values.
      if (consent.analytics) {
        scheduleAnalyticsLoad(gaId, clarityId);
      } else if (previouslyGranted) {
        window.location.reload();
      }
    }

    function listenForTcfState() {
      if (typeof window.__tcfapi !== 'function') return;

      // Version 0 asks the CMP to use its latest supported TCF API version.
      window.__tcfapi('addEventListener', 0, (tcData, success) => {
        if (!success || !tcData || typeof tcData.gdprApplies !== 'boolean') return;
        if (tcData.listenerId !== undefined) tcfListenerId = tcData.listenerId;

        if (tcData.gdprApplies) {
          activateGoogleCmp();
          syncGoogleCmpConsent();
        } else {
          activateCustomConsent();
        }
      });
    }

    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push(
      { CONSENT_API_READY: listenForTcfState },
      { CONSENT_MODE_DATA_READY: syncGoogleCmpConsent },
    );

    if (hasGoogleCmpBootstrap()) {
      // Fail closed while a tagged Google CMP resolves its geographic scope.
      // If the tag is blocked or unavailable, restore the existing local UI.
      fallbackTimer = window.setTimeout(activateCustomConsent, 8000);
    } else {
      activateCustomConsent();
    }

    function openSettings() {
      previousFocusRef.current = document.activeElement;

      if (authorityRef.current === CONSENT_AUTHORITY_GOOGLE) {
        window.googlefc?.showRevocationMessage?.();
        return;
      }

      if (authorityRef.current === CONSENT_AUTHORITY_PENDING) {
        return;
      }

      setChoices(readConsent() || DEFAULT_CONSENT);
      setShowPreferences(true);
      setShowBanner(false);
    }

    window.addEventListener(OPEN_CONSENT_SETTINGS_EVENT, openSettings);
    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
      if (tcfListenerId !== undefined && typeof window.__tcfapi === 'function') {
        window.__tcfapi('removeEventListener', 0, () => {}, tcfListenerId);
      }
      window.removeEventListener(OPEN_CONSENT_SETTINGS_EVENT, openSettings);
    };
  }, [clarityId, gaId]);

  useEffect(() => {
    if (!showPreferences) return undefined;
    dialogRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setShowPreferences(false);
        previousFocusRef.current?.focus?.();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showPreferences]);

  function commit(nextChoices) {
    if (authorityRef.current !== CONSENT_AUTHORITY_CUSTOM) return;

    const previous = readConsent();
    const consent = saveConsent(nextChoices);
    applyConsent(consent, gaId, clarityId);
    setChoices(consent);
    setShowBanner(false);
    setShowPreferences(false);
    previousFocusRef.current?.focus?.();

    if (
      (previous?.analytics && !consent.analytics)
      || (previous?.advertising && !consent.advertising)
    ) {
      window.location.reload();
    }
  }

  function openPreferences() {
    previousFocusRef.current = document.activeElement;
    setShowPreferences(true);
    setShowBanner(false);
  }

  return (
    <>
      {showBanner ? (
        <section
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[120] mx-auto max-h-[calc(100dvh-1.5rem)] max-w-3xl overflow-y-auto rounded-2xl border border-white/70 bg-white/75 p-3 text-slate-950 shadow-[0_20px_65px_rgba(15,23,42,0.2)] backdrop-blur-2xl sm:bottom-5 sm:p-3.5 dark:border-white/15 dark:bg-[#111118]/75 dark:text-white"
          aria-labelledby="cookie-consent-title"
          aria-live="polite"
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ff6b35]/10 text-[#c2410c] dark:text-[#ff9a73]">
              <Cookie className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <h2 id="cookie-consent-title" className="text-sm font-black sm:text-base">Privacy choices</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300 sm:mt-0 sm:justify-end sm:text-xs">
                {/* prefetch={false}: the banner sits in the viewport on
                    first load, so these links prefetched the cookie-policy
                    (~9 KB) and privacy RSC payloads on every page,
                    competing with the LCP image. They load on click. */}
                <Link href="/cookie-policy" prefetch={false} className="text-[#c2410c] underline-offset-4 hover:underline dark:text-[#ff9a73]">
                  Cookie Policy
                </Link>
                <span aria-hidden="true">·</span>
                <a href="https://adsterra.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-[#c2410c] underline-offset-4 hover:underline dark:text-[#ff9a73]">
                  Adsterra Privacy
                </a>
              </div>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => commit({ necessary: true, analytics: true, advertising: true, preferences: true })}
              className="min-h-10 rounded-full border border-[#ff6b35] bg-[#ff6b35] px-2.5 text-[11px] font-black text-[#111118] transition hover:bg-[#e85d28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-2 sm:text-sm"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => commit(DEFAULT_CONSENT)}
              className="min-h-10 rounded-full border border-[#ff6b35] bg-white/45 px-2.5 text-[11px] font-black text-[#c2410c] transition hover:bg-[#fff4ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-2 dark:bg-white/[0.04] dark:text-[#ff9a73] sm:text-sm"
            >
              Reject optional
            </button>
            <button
              type="button"
              onClick={openPreferences}
              className="col-span-2 min-h-10 w-full rounded-full border border-slate-300/80 bg-white/35 px-2.5 text-center text-[11px] font-bold text-slate-800 transition hover:border-[#ff6b35] hover:text-[#c2410c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c] focus-visible:ring-offset-2 dark:border-white/25 dark:bg-white/[0.04] dark:text-white dark:hover:text-[#ff9a73] sm:col-span-1 sm:text-sm"
            >
              Manage preferences
            </button>
          </div>
        </section>
      ) : null}

      {showPreferences ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-6">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            tabIndex={-1}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl outline-none sm:p-6 dark:border-white/15 dark:bg-[#111118] dark:text-white"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff6b35]/10 text-[#c2410c]">
                  <Settings2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 id="cookie-settings-title" className="mt-3 text-2xl font-black">Cookie settings</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Optional categories are off unless you enable them. You can change these choices at any time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPreferences(false);
                  if (!readConsent()) setShowBanner(true);
                  previousFocusRef.current?.focus?.();
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-[#ff6b35] hover:text-[#c2410c] dark:border-white/15 dark:text-slate-300"
                aria-label="Close cookie settings"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {categories.map((category) => (
                <label
                  key={category.key}
                  className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-white/15"
                >
                  <span>
                    <span className="block text-sm font-black">{category.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-slate-600 dark:text-slate-300">{category.description}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={category.key === 'necessary' ? true : choices[category.key] === true}
                    disabled={category.key === 'necessary'}
                    onChange={(event) => setChoices((current) => ({ ...current, [category.key]: event.target.checked }))}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#ff6b35]"
                    aria-label={`${category.title} cookies`}
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => commit(choices)}
                className="min-h-11 rounded-full border-2 border-[#ff6b35] bg-[#ff6b35] px-4 text-sm font-black text-[#111118] hover:bg-[#e85d28]"
              >
                Save preferences
              </button>
              <button
                type="button"
                onClick={() => commit(DEFAULT_CONSENT)}
                className="min-h-11 rounded-full border-2 border-[#ff6b35] bg-white px-4 text-sm font-black text-[#c2410c] hover:bg-[#fff4ef] dark:bg-transparent dark:text-[#ff9a73]"
              >
                Reject optional
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
              See our <Link href="/privacy" prefetch={false} className="font-bold text-[#c2410c] hover:underline">Privacy Policy</Link> and{' '}
              <Link href="/cookie-policy" prefetch={false} className="font-bold text-[#c2410c] hover:underline">Cookie Policy</Link>.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}
