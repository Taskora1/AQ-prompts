'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import StarRatingInput from '@/components/StarRatingInput';

// Keep in sync with MAX_FEEDBACK_COMMENT_LENGTH in prompt-engagement-db.js.
const MAX_COMMENT_LENGTH = 500;

// Per-prompt feedback: star rating (required) + short comment (optional),
// anonymous, no login. The average + count load live from
// /api/prompts/[id]/feedback; submitted reviews go into the pending-review
// moderation queue and only appear on the community /feedback page after
// an admin approves them.
export default function PromptFeedbackSection({ promptId }) {
  const [summary, setSummary] = useState(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!promptId || !Number.isSafeInteger(Number(promptId))) return undefined;
    let cancelled = false;
    fetch(`/api/prompts/${promptId}/feedback`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Feedback failed to load.');
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setSummary({
            averageRating: Number(data.averageRating) || 0,
            reviewCount: Number(data.reviewCount) || 0,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setSummaryFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage('');
    setError('');
    setSubmitting(true);
    const formData = new FormData(form);
    try {
      const response = await fetch(`/api/prompts/${promptId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: formData.get('rating'),
          comment: formData.get('comment'),
          website: formData.get('website'),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Feedback could not be submitted.');
      setSummary({
        averageRating: Number(result.averageRating) || 0,
        reviewCount: Number(result.reviewCount) || 0,
      });
      // Remount the form so the star input resets along with the fields.
      setFormKey((key) => key + 1);
      setMessage('Thank you! Your review is awaiting moderation and will appear on the community feedback page once approved.');
    } catch (submitError) {
      setError(submitError.message || 'Feedback could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const averageRating = summary?.averageRating || 0;
  const reviewCount = summary?.reviewCount || 0;

  return (
    <section className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8" aria-label="Prompt reviews">
      <div className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.07)] dark:border-white/[0.08] dark:bg-[#111118] sm:p-8">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">Reviews</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">What creators think</h2>
        {summary ? (
          reviewCount > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="text-lg tracking-[0.12em] text-amber-500" aria-label={`${averageRating.toFixed(1)} out of 5 stars`}>
                {'★'.repeat(Math.round(averageRating))}{'☆'.repeat(5 - Math.round(averageRating))}
              </span>
              <span>
                <strong className="text-slate-950 dark:text-white">{averageRating.toFixed(1)} out of 5</strong>
                {' · '}{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No reviews yet — be the first to rate this prompt.</p>
          )
        ) : summaryFailed ? (
          <p className="mt-2 text-sm text-slate-500">Reviews could not be loaded right now.</p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Loading reviews…</p>
        )}
        <form key={formKey} onSubmit={handleSubmit} className="mt-5 max-w-xl space-y-4">
          <StarRatingInput legend="Your rating" />
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Comment <span className="font-normal text-slate-500">(optional)</span>
            <textarea
              name="comment"
              maxLength={MAX_COMMENT_LENGTH}
              rows={3}
              placeholder="What did you create with this prompt?"
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 dark:border-white/15 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"
            />
          </label>
          <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            Leave this field empty
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <button
            disabled={submitting}
            type="submit"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ff6b35] px-6 font-black text-[#111118] shadow-lg shadow-orange-500/15 transition hover:-translate-y-0.5 hover:bg-[#e85d28] disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit review'}
          </button>
          {message ? (
            <p className="text-sm font-semibold text-green-700" role="status">
              {message} <Link href="/feedback" className="underline underline-offset-2">See all reviews</Link>
            </p>
          ) : null}
          {error ? <p className="text-sm font-semibold text-red-600" role="alert">{error}</p> : null}
        </form>
      </div>
    </section>
  );
}
