'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, LockKeyhole, MessageCircle, ShieldCheck, X } from 'lucide-react';

const DEFAULT_COUNTRY_CODE = '92';

const initialState = {
  type: '',
  message: '',
  joinLink: '',
  paymentLink: '',
};

function normalizePhone(value = '', countryCode = DEFAULT_COUNTRY_CODE) {
  let number = String(value || '').replace(/[\s\-()]/g, '').trim();
  const normalizedCountryCode = String(countryCode || DEFAULT_COUNTRY_CODE).replace(/\D/g, '') || DEFAULT_COUNTRY_CODE;

  number = number.replace(/[^\d+]/g, '');
  if (number.startsWith('00')) number = number.slice(2);
  if (number.startsWith('+')) number = number.slice(1);
  if (number.startsWith('0')) number = `${normalizedCountryCode}${number.slice(1)}`;

  return number.replace(/\D/g, '');
}

export default function PromptsheTrialForm({ disabled = false }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [status, setStatus] = useState(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const isModalOpen = Boolean(status.message);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    previousFocusRef.current = document.activeElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setStatus(initialState);
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [isModalOpen]);

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanedName = name.trim().replace(/\s+/g, ' ');
    const cleanedCountryCode = countryCode.replace(/\D/g, '') || DEFAULT_COUNTRY_CODE;
    const normalizedPhone = normalizePhone(phone, cleanedCountryCode);

    setStatus(initialState);

    if (!cleanedName || !normalizedPhone) {
      setStatus({
        type: 'error',
        message: 'Please enter your name and WhatsApp number with country code.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/promptshe/trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: cleanedName,
          phone: normalizedPhone,
          countryCode: cleanedCountryCode,
        }),
      });
      const payload = await response.json();

      setStatus({
        type: payload.success ? 'success' : 'error',
        message: payload.message || 'Unable to verify your trial right now.',
        joinLink: payload.joinLink || '',
        paymentLink: payload.paymentLink || '',
      });

      if (payload.success && payload.joinLink) {
        setName('');
        setPhone('');
      }
    } catch {
      setStatus({
        type: 'error',
        message: 'Unable to connect. Please try again later.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSuccess = status.type === 'success';
  const actionLink = status.joinLink || status.paymentLink;
  const actionLabel = status.joinLink ? 'Join WhatsApp Community' : 'Purchase Membership';

  if (disabled) {
    return (
      <section className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-6 dark:border-white/10 dark:bg-[#111118] dark:shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#6b7280] text-white">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-black text-[#111118] dark:text-white">Community preview unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-[#6b7280] dark:text-[#9ca3af]">
              This feature is unavailable in this environment. No information can be submitted here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-6 dark:border-white/10 dark:bg-[#111118] dark:shadow-[0_24px_70px_rgba(0,0,0,0.32)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#16a34a] text-white">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-black text-[#111118] dark:text-white">Verify your trial</h2>
          <p className="mt-1 text-sm leading-6 text-[#6b7280] dark:text-[#9ca3af]">
            Use the same number you will use on WhatsApp.
          </p>
        </div>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="promptshe-name" className="text-sm font-bold text-[#111118] dark:text-white">
            Name
          </label>
          <input
            id="promptshe-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="mt-2 h-12 w-full rounded-lg border border-[#d1d5db] bg-white px-3 text-base text-[#111118] outline-none transition focus:border-[#16a34a] focus:ring-4 focus:ring-[#16a34a]/15 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white"
            required
          />
        </div>

        <div>
          <label htmlFor="promptshe-phone" className="text-sm font-bold text-[#111118] dark:text-white">
            WhatsApp Number
          </label>
          <div className="mt-2 grid grid-cols-[96px_1fr] gap-2">
            <div>
              <label htmlFor="promptshe-country" className="sr-only">
                Country code
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-[#16a34a]">+</span>
                <input
                  id="promptshe-country"
                  type="tel"
                  inputMode="numeric"
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="92"
                  className="h-12 w-full rounded-lg border border-[#d1d5db] bg-white pl-7 pr-2 text-sm font-bold text-[#111118] outline-none transition focus:border-[#16a34a] focus:ring-4 focus:ring-[#16a34a]/15 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white"
                  required
                />
              </div>
            </div>
            <input
              id="promptshe-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="300 1234567"
              autoComplete="tel"
              className="h-12 w-full min-w-0 rounded-lg border border-[#d1d5db] bg-white px-3 text-base text-[#111118] outline-none transition focus:border-[#16a34a] focus:ring-4 focus:ring-[#16a34a]/15 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white"
              required
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-[#6b7280] dark:text-[#9ca3af]">
            Any country is allowed. Use full format like +923001234567, +14155552671, or choose code and enter local number.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#16a34a] px-4 text-sm font-black text-[#052e1b] transition hover:bg-[#15803d] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          )}
          {isSubmitting ? 'Checking...' : 'Verify & Join'}
        </button>
      </form>

      {status.message ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#020617]/60 px-4 py-6 backdrop-blur-sm"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-live="polite"
            aria-labelledby="promptshe-result-title"
            aria-describedby="promptshe-result-message"
            tabIndex={-1}
            className="relative w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white p-5 text-center shadow-[0_28px_90px_rgba(15,23,42,0.28)] outline-none dark:border-white/10 dark:bg-[#111118]"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setStatus(initialState)}
              className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e7eb] text-[#6b7280] transition hover:border-[#16a34a] hover:text-[#16a34a] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:ring-offset-2 dark:border-white/10 dark:text-[#9ca3af] dark:focus:ring-offset-[#111118]"
              aria-label="Close message"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div
              className={`mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full ${
                isSuccess
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300'
              }`}
            >
              {isSuccess ? <CheckCircle2 className="h-7 w-7" aria-hidden="true" /> : <LockKeyhole className="h-7 w-7" aria-hidden="true" />}
            </div>

            <h3 id="promptshe-result-title" className="mt-4 text-xl font-black text-[#111118] dark:text-white">
              {isSuccess ? 'Verification Successful' : 'Verification Failed'}
            </h3>
            <p id="promptshe-result-message" className="mt-3 text-sm font-semibold leading-6 text-[#4b5563] dark:text-[#d1d5db]">{status.message}</p>

            {actionLink ? (
              <a
                href={actionLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#16a34a] px-4 text-sm font-black text-[#052e1b] transition hover:bg-[#15803d] hover:text-white dark:bg-[#22c55e] dark:text-[#052e1b] dark:hover:bg-[#86efac] dark:hover:text-[#052e1b]"
              >
                {actionLabel}
              </a>
            ) : null}

            <button
              type="button"
              onClick={() => setStatus(initialState)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#e5e7eb] px-4 text-sm font-black text-[#4b5563] transition hover:border-[#16a34a] hover:text-[#16a34a] dark:border-white/10 dark:text-[#9ca3af] dark:hover:text-[#86efac]"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

    </section>
  );
}
