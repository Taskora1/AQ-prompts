'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { hasConsent } from '@/lib/consent';
import StarRatingInput from '@/components/StarRatingInput';
import { FREE_COPIES_BEFORE_FEEDBACK, hasReachedFeedbackCopyLimit } from '@/lib/copy-gate-policy';
import { countReviewWords, MIN_REVIEW_WORDS } from '@/lib/review-validation';

const SUCCESS_MESSAGE = 'Copied — paste it into your AI tool.';

function trackCopyEvent(name) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(`aq:${name}`));

  if (hasConsent('analytics') && Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: `aq_${name}` });
  }
}

async function copyWithFallback(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Try the selection-based fallback when browser clipboard permissions deny access.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy command was rejected.');
    }
  } finally {
    textarea.remove();
  }
}

const FEEDBACK_GATE_LOCAL_KEY = 'aq-feedback-gate-complete';
const FEEDBACK_GATE_COOKIE = 'aq_feedback_gate';
const FEEDBACK_GATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const FREE_COPY_LOCAL_KEY = 'aq-feedback-gate-free-copy-count';
const FREE_COPY_COOKIE = 'aq_feedback_free_copy';

function hasCompletedFeedbackGate() {
  try {
    return window.localStorage.getItem(FEEDBACK_GATE_LOCAL_KEY) === '1'
      && document.cookie.split('; ').some((cookie) => cookie === `${FEEDBACK_GATE_COOKIE}=1`);
  } catch {
    return false;
  }
}

function getFreeCopyCount() {
  try {
    const localCount = Number.parseInt(window.localStorage.getItem(FREE_COPY_LOCAL_KEY) || '0', 10) || 0;
    const cookieValue = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${FREE_COPY_COOKIE}=`));
    const cookieCount = Number.parseInt(cookieValue?.slice(FREE_COPY_COOKIE.length + 1) || '0', 10) || 0;
    const legacyLocalMarker = window.localStorage.getItem('aq-feedback-gate-free-copy-used') === '1' ? 1 : 0;
    return Math.max(localCount, cookieCount, legacyLocalMarker);
  } catch {
    return 0;
  }
}

function markFreeCopyUsed(copyCount) {
  try {
    window.localStorage.setItem(FREE_COPY_LOCAL_KEY, String(copyCount));
  } catch (error) {
    console.warn('The browser could not save the free-copy count in local storage.', error);
  }
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${FREE_COPY_COOKIE}=${copyCount}; Max-Age=${FEEDBACK_GATE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  } catch (error) {
    console.warn('The browser could not save the free-copy count cookie.', error);
  }
}

export function useCopyGate({ onCopied, successDuration = 2200, promptId } = {}) {
  const noticeTimeoutRef = useRef(null);
  const copiedTimeoutRef = useRef(null);
  const pendingCopyRef = useRef('');
  const feedbackGateCompletedRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [isCopyGateOpen, setIsCopyGateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackWordCount, setFeedbackWordCount] = useState(0);

  useEffect(() => () => {
    if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
  }, []);

  const markCopied = useCallback(() => {
    setCopied(true);
    setNotice(SUCCESS_MESSAGE);
    trackCopyEvent('prompt_copied');
    onCopied?.();

    if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);

    noticeTimeoutRef.current = window.setTimeout(() => setNotice(''), successDuration);
    copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), successDuration);
  }, [onCopied, successDuration]);

  const requestCopy = useCallback(async (text) => {
    const promptText = String(text || '').trim();
    if (!promptText) return false;

    trackCopyEvent('copy_clicked');
    const freeCopyCount = getFreeCopyCount();
    if (
      promptId
      && !feedbackGateCompletedRef.current
      && !hasCompletedFeedbackGate()
      && hasReachedFeedbackCopyLimit(freeCopyCount)
    ) {
      pendingCopyRef.current = promptText;
      setFeedbackError('');
      setIsCopyGateOpen(true);
      return false;
    }
    await copyWithFallback(promptText);
    if (promptId && !feedbackGateCompletedRef.current && !hasCompletedFeedbackGate()) {
      markFreeCopyUsed(freeCopyCount + 1);
    }
    markCopied();
    return true;
  }, [markCopied, promptId]);

  const submitFeedback = useCallback(async (event) => {
    event.preventDefault();
    setFeedbackError('');
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const feedback = String(formData.get('text') || '');
    if (countReviewWords(feedback) < MIN_REVIEW_WORDS) {
      setFeedbackError(`Please write at least ${MIN_REVIEW_WORDS} words in your feedback.`);
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          socialUrl: formData.get('socialUrl'),
          rating: formData.get('rating'),
          text: feedback,
          source: 'copy-gate',
          promptId,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Feedback could not be submitted.');

      const pendingText = pendingCopyRef.current;
      pendingCopyRef.current = '';
      feedbackGateCompletedRef.current = true;
      setIsCopyGateOpen(false);
      setFeedbackWordCount(0);

      try {
        window.localStorage.setItem(FEEDBACK_GATE_LOCAL_KEY, '1');
      } catch (error) {
        console.warn('Feedback was submitted, but this browser could not save the local copy-gate flag.', error);
      }
      try {
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${FEEDBACK_GATE_COOKIE}=1; Max-Age=${FEEDBACK_GATE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
      } catch (error) {
        console.warn('Feedback was submitted, but this browser could not save the copy-gate cookie.', error);
      }

      try {
        await copyWithFallback(pendingText);
        markCopied();
      } catch {
        setNotice('Feedback submitted, but copying failed. Click Copy again to retry.');
      }
    } catch (error) {
      setFeedbackError(error.message || 'Feedback could not be submitted. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [markCopied, promptId]);

  const copyGate = (
    <>
      {notice ? (
        <div
          className="fixed bottom-4 left-1/2 z-[110] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-full bg-[#111118] px-4 py-3 text-center text-sm font-black text-white shadow-[0_18px_50px_rgba(0,0,0,0.28)] ring-1 ring-white/10"
          role="status"
          aria-live="polite"
        >
          {notice}
        </div>
      ) : null}
      {isCopyGateOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-feedback-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-[#111118] dark:text-white"
          >
            <h2 id="copy-feedback-title" className="text-xl font-black">Share your feedback to unlock your next copy (one time only)</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Your prompt will copy as soon as you submit. Your feedback may appear publicly after approval.</p>
            <form onSubmit={submitFeedback}>
              <label className="mt-4 block text-sm font-semibold">
                Name
                <input name="name" maxLength={100} required autoComplete="name" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-white/20" />
              </label>
              <label className="mt-4 block text-sm font-semibold">
                Social profile link
                <input name="socialUrl" type="url" maxLength={2048} placeholder="https://..." required className="mt-1.5 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-white/20" />
                <span className="mt-1 block text-xs font-normal text-slate-500">One review per profile. Rejected reviews can be resubmitted.</span>
              </label>
              <StarRatingInput legend="Rating (required)" />
              <label className="mt-4 block text-sm font-semibold">
                Feedback <span className="font-normal text-slate-500">(at least {MIN_REVIEW_WORDS} words)</span>
                <textarea name="text" maxLength={2000} required rows={3} onChange={(event) => setFeedbackWordCount(countReviewWords(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-white/20" />
                <span className="mt-1 block text-xs font-normal text-slate-500" aria-live="polite">
                  {feedbackWordCount}/{MIN_REVIEW_WORDS} words minimum
                </span>
              </label>
              {feedbackError ? <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{feedbackError}</p> : null}
              <button disabled={isSubmitting} type="submit" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#ff6b35] px-5 font-black text-[#111118] disabled:opacity-60">
                {isSubmitting ? 'Submitting...' : 'Submit and Copy'}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );

  return {
    copied,
    copyGate,
    isCopyGateOpen,
    isSubmitting,
    requestCopy,
  };
}

export default function CopyGate({ children, onCopied, prompt, promptId, successDuration }) {
  const gate = useCopyGate({ onCopied, promptId, successDuration });

  return (
    <>
      {typeof children === 'function'
        ? children({ ...gate, copyPrompt: () => gate.requestCopy(prompt) })
        : children}
      {gate.copyGate}
    </>
  );
}
