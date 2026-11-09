'use client';

import { useState } from 'react';

import ReviewProfileEditor from './ReviewProfileEditor';

function formatReviewDate(value) {
  return new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ReviewsManager({ initialData }) {
  const [data, setData] = useState(initialData);
  const [busyReviewId, setBusyReviewId] = useState(null);
  const [error, setError] = useState('');

  function updateReview(updatedReview) {
    setData((current) => ({
      ...current,
      reviews: current.reviews.map((review) => (
        review.id === updatedReview.id ? { ...review, ...updatedReview } : review
      )),
    }));
  }

  async function moderate(reviewId, status) {
    setBusyReviewId(reviewId);
    setError('');
    try {
      const response = await fetch(`/admin/api/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Review could not be updated.');

      setData((current) => ({
        ...current,
        counts: {
          ...current.counts,
          pending: Math.max(0, current.counts.pending - 1),
          [status]: current.counts[status] + 1,
        },
        averageRating: status === 'approved'
          ? ((current.averageRating * current.counts.approved) + result.review.rating) / (current.counts.approved + 1)
          : current.averageRating,
        reviews: current.reviews.filter((review) => review.id !== reviewId),
      }));
    } catch (moderationError) {
      setError(moderationError.message || 'Review could not be updated.');
    } finally {
      setBusyReviewId(null);
    }
  }

  async function deleteReview(review) {
    if (!window.confirm(`Delete the review from ${review.name || 'this reviewer'}? This cannot be undone.`)) {
      return;
    }

    setBusyReviewId(review.id);
    setError('');
    try {
      const response = await fetch(`/admin/api/reviews/${review.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Review could not be deleted.');

      setData((current) => {
        const status = result.review.status;
        const updatedCounts = {
          ...current.counts,
          [status]: Math.max(0, current.counts[status] - 1),
        };
        return {
          ...current,
          counts: updatedCounts,
          averageRating: status === 'approved' && updatedCounts.approved > 0
            ? ((current.averageRating * current.counts.approved) - review.rating) / updatedCounts.approved
            : status === 'approved' ? 0 : current.averageRating,
          reviews: current.reviews.filter((item) => item.id !== review.id),
        };
      });
    } catch (deleteError) {
      setError(deleteError.message || 'Review could not be deleted.');
    } finally {
      setBusyReviewId(null);
    }
  }

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ['Pending', data.counts.pending],
          ['Approved', data.counts.approved],
          ['Rejected', data.counts.rejected],
          ['Approved average', `${data.averageRating.toFixed(1)} / 5`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-black">Reviews</h2>
        {error ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
        {data.reviews.length ? (
          <ul className="mt-4 space-y-4">
            {data.reviews.map((review) => (
              <li key={review.id} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold">{review.name || 'Anonymous'}</span>
                    <span className="ml-3 text-amber-600" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      review.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : review.status === 'rejected'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-amber-100 text-amber-800'
                    }`}>
                      {review.status[0].toUpperCase() + review.status.slice(1)}
                    </span>
                    {review.source === 'copy-gate' ? (
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">Copy gate</span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap leading-7">{review.text}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {formatReviewDate(review.createdAt)}
                  {review.promptId ? ` · Prompt ID ${review.promptId}` : ''}
                </p>
                {review.userAgent ? (
                  <details className="mt-2 text-xs text-slate-500">
                    <summary className="w-fit cursor-pointer font-medium hover:text-slate-700">
                      Browser details
                    </summary>
                    <p className="mt-1 break-all">{review.userAgent}</p>
                  </details>
                ) : null}
                <ReviewProfileEditor review={review} onSaved={updateReview} />
                <div className="mt-4 flex gap-2">
                  {review.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        disabled={busyReviewId === review.id}
                        onClick={() => moderate(review.id, 'approved')}
                        className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyReviewId === review.id}
                        onClick={() => moderate(review.id, 'rejected')}
                        className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyReviewId === review.id}
                    onClick={() => deleteReview(review)}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                  >
                    {busyReviewId === review.id ? 'Working...' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl bg-white p-5 text-slate-600">There are no reviews yet.</p>
        )}
        {data.counts.pending + data.counts.approved + data.counts.rejected > data.reviews.length ? (
          <p className="mt-3 text-sm text-slate-500">Showing {data.reviews.length} of {data.counts.pending + data.counts.approved + data.counts.rejected} reviews. Pending reviews appear first.</p>
        ) : null}
      </section>
    </>
  );
}
