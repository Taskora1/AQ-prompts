'use client';

import { useState } from 'react';
import StarRatingInput from '@/components/StarRatingInput';
import { countReviewWords, MIN_REVIEW_WORDS } from '@/lib/review-validation';

export default function FeedbackSubmissionForm() {
  const [feedbackWordCount, setFeedbackWordCount] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage('');
    setError('');
    setSubmitting(true);

    const formData = new FormData(form);
    const feedback = String(formData.get('text') || '');
    if (countReviewWords(feedback) < MIN_REVIEW_WORDS) {
      setError(`Please write at least ${MIN_REVIEW_WORDS} words in your feedback.`);
      setSubmitting(false);
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
          website: formData.get('website'),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Feedback could not be submitted.');
      form.reset();
      setFeedbackWordCount(0);
      setMessage('Thank you, your review will appear after approval.');
    } catch (submitError) {
      setError(submitError.message || 'Feedback could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#111118] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c2410c]">Your experience</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Leave a review</h2>
        </div>
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-50 text-xl text-[#ea580c] dark:bg-orange-400/10">✦</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Your review goes public only after our team approves it.</p>
      <div className="mt-5 space-y-4">
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
          Name
          <input name="name" maxLength={100} required className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 dark:border-white/15 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]" autoComplete="name" />
        </label>
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
          Social profile link
          <input name="socialUrl" type="url" maxLength={2048} placeholder="https://instagram.com/yourname" required className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 dark:border-white/15 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]" autoComplete="url" />
          <span className="mt-1 block text-xs font-normal text-slate-500">One review per profile. Rejected reviews can be resubmitted.</span>
        </label>
        <StarRatingInput legend="Your rating (required)" />
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
          Feedback <span className="font-normal text-slate-500">(at least {MIN_REVIEW_WORDS} words)</span>
          <textarea name="text" maxLength={2000} required rows={5} placeholder="Tell us what you liked or what we can improve..." onChange={(event) => setFeedbackWordCount(countReviewWords(event.target.value))} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 dark:border-white/15 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]" />
          <span className="mt-1 block text-xs font-normal text-slate-500" aria-live="polite">
            {feedbackWordCount}/{MIN_REVIEW_WORDS} words minimum
          </span>
        </label>
      </div>
      <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        Leave this field empty
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <button disabled={submitting} type="submit" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#ff6b35] px-5 font-black text-[#111118] shadow-lg shadow-orange-500/15 transition hover:-translate-y-0.5 hover:bg-[#e85d28] disabled:cursor-wait disabled:opacity-60">
        {submitting ? 'Submitting...' : 'Submit review'}
      </button>
      {message ? <p className="mt-3 text-sm font-semibold text-green-700" role="status">{message}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{error}</p> : null}
    </form>
  );
}
