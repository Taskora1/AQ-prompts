import Link from 'next/link';

import Footer from '@/components/Footer';
import FeedbackSubmissionForm from '@/components/FeedbackSubmissionForm';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import { getApprovedSiteReviewData } from '@/lib/site-reviews-db';
import { SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feedback and Reviews | AQPrompts',
  description: 'Read approved feedback from the AQPrompts community and share your experience.',
  alternates: { canonical: absoluteUrl('/feedback') },
};

function ReviewStars({ rating }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

function ReviewerAvatar({ name, imageUrl }) {
  return imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      width="48"
      height="48"
      className="h-12 w-12 rounded-2xl object-cover ring-1 ring-slate-200 dark:ring-white/10"
    />
  ) : (
    <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-100 to-amber-50 text-lg font-black text-orange-700 dark:from-orange-400/20 dark:to-amber-400/10 dark:text-orange-200">
      {(name || 'A').trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export default async function FeedbackPage({ searchParams }) {
  const params = await searchParams;
  const data = await getApprovedSiteReviewData({ page: params?.page });
  const schema = data.approvedCount > 0
    ? {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: data.averageRating,
        reviewCount: data.approvedCount,
        bestRating: 5,
        worstRating: 1,
      },
      review: data.reviews.map((review) => ({
        '@type': 'Review',
        author: {
          '@type': 'Person',
          name: review.name || 'Anonymous',
          ...(review.profileImageUrl ? { image: review.profileImageUrl } : {}),
          ...(review.socialUrl ? { url: review.socialUrl, sameAs: [review.socialUrl] } : {}),
        },
        datePublished: new Date(review.createdAt).toISOString(),
        reviewBody: review.text,
        reviewRating: {
          '@type': 'Rating',
          ratingValue: review.rating,
          bestRating: 5,
          worstRating: 1,
        },
      })),
    }
    : null;

  return (
    <>
      <JsonLd data={schema} />
      <Header />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="relative isolate overflow-hidden rounded-[2rem] border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-[0_24px_70px_-45px_rgba(194,65,12,0.45)] dark:border-orange-300/10 dark:from-[#211710] dark:via-[#111118] dark:to-[#17130f] sm:p-10 lg:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl dark:bg-orange-500/10" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(270px,0.75fr)] lg:items-center lg:gap-12">
            <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#c2410c] dark:border-orange-300/15 dark:bg-white/[0.04] dark:text-orange-300">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#ff6b35]" />
              Community feedback
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">Made better by your feedback.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
              See how AQPrompts works for creators, and share your experience. We review each submission and complete profile details like a photo and social link before sharing it here.
            </p>
            <Link
              href="#leave-review"
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ff6b35] px-5 text-sm font-black text-[#111118] shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-[#f45f2b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
            >
              Share your feedback
              <span aria-hidden="true">↓</span>
            </Link>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_20px_60px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04] sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Community snapshot</p>
              {data.approvedCount ? (
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-5xl font-black tracking-tight text-slate-950 dark:text-white">{data.averageRating.toFixed(1)}<span className="ml-1 text-lg font-bold text-slate-500">/ 5</span></p>
                    <div className="mt-2 text-lg"><ReviewStars rating={Math.round(data.averageRating)} /></div>
                  </div>
                  <p className="pb-1 text-right text-sm font-semibold leading-5 text-slate-500">
                    Based on<br />
                    <span className="text-slate-950 dark:text-white">{data.approvedCount} {data.approvedCount === 1 ? 'review' : 'reviews'}</span>
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-2xl font-black text-slate-950 dark:text-white">Be the first</p>
                  <p className="mt-1 text-sm text-slate-500">There are no community reviews yet.</p>
                </div>
              )}
              <div className="my-5 h-px bg-slate-200 dark:bg-white/10" />
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M10 1.25 12.13 2.6l2.5-.05.82 2.38 1.94 1.58-.82 2.37.44 2.47-2.19 1.21-1.21 2.19-2.47-.44-2.37.82-1.58-1.94-2.38-.82.05-2.5L1.5 10l1.35-2.13-.05-2.5 2.38-.82 1.58-1.94 2.37.82L10 1.25Zm3.25 6.13a.875.875 0 0 0-1.238-1.238L9 9.16 7.99 8.15a.875.875 0 0 0-1.238 1.238l1.63 1.63a.875.875 0 0 0 1.238 0l3.63-3.63Z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-black text-slate-950 dark:text-white">Verified profiles</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">A verified badge means the reviewer profile includes a photo and social link.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] lg:gap-10">
          <div className="min-w-0">
            <div className="flex items-end justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#c2410c]">Creator stories</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Community reviews</h2>
              </div>
              {data.approvedCount ? <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">{data.approvedCount} {data.approvedCount === 1 ? 'review' : 'reviews'}</span> : null}
            </div>
            {data.reviews.length ? (
              <ul className="mt-5 space-y-4">
                {data.reviews.map((review) => (
                  <li key={review.id} className="group rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)] transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_20px_45px_-32px_rgba(194,65,12,0.3)] dark:border-white/10 dark:bg-[#111118] dark:hover:border-orange-300/20 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <ReviewerAvatar name={review.name} imageUrl={review.profileImageUrl} />
                        <div className="min-w-0">
                          {review.socialUrl ? (
                            <a href={review.socialUrl} target="_blank" rel="noopener noreferrer" className="truncate font-bold text-slate-950 decoration-orange-400 underline-offset-4 hover:underline dark:text-white">
                              {review.name || 'Anonymous'}
                            </a>
                          ) : (
                            <span className="truncate font-bold text-slate-950 dark:text-white">{review.name || 'Anonymous'}</span>
                          )}
                          {review.profileImageUrl && review.socialUrl ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                              <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                                <path fillRule="evenodd" d="M8 1.25 9.7 2.3l2-.04.65 1.9 1.55 1.26-.65 1.9.35 1.97-1.75.97-.97 1.75-1.97-.35-1.9.65-1.26-1.55-1.9-.65.04-2L1.25 8l1.05-1.7-.04-2 1.9-.65L5.42 2.1l1.9.65L8 1.25Zm3.03 5.22a.75.75 0 0 0-1.06-1.06L7.2 8.18 6.03 7.01a.75.75 0 1 0-1.06 1.06l1.7 1.7a.75.75 0 0 0 1.06 0l3.3-3.3Z" clipRule="evenodd" />
                              </svg>
                              Verified
                            </span>
                          ) : (
                            <p className="mt-0.5 text-xs text-slate-500">AQPrompts community member</p>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-base tracking-[0.12em] text-amber-500">
                        <ReviewStars rating={review.rating} />
                      </span>
                    </div>
                    <p className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-slate-700 dark:text-slate-300">{review.text}</p>
                    <time className="mt-5 block border-t border-slate-100 pt-3 text-xs font-medium text-slate-500 dark:border-white/[0.07]" dateTime={review.createdAt}>
                      {new Date(review.createdAt).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-slate-600 dark:border-white/15 dark:bg-white/[0.02] dark:text-slate-300">
                No community reviews yet. Share your experience and be the first to help the community.
              </p>
            )}
            {data.totalPages > 1 ? (
              <nav className="mt-6 flex items-center justify-between" aria-label="Review pages">
                {data.page > 1 ? <Link className="font-semibold text-[#c2410c]" href={`/feedback?page=${data.page - 1}`}>Newer reviews</Link> : <span />}
                <span className="text-sm text-slate-500">Page {data.page} of {data.totalPages}</span>
                {data.page < data.totalPages ? <Link className="font-semibold text-[#c2410c]" href={`/feedback?page=${data.page + 1}`}>Older reviews</Link> : <span />}
              </nav>
            ) : null}
          </div>

          <div id="leave-review" className="scroll-mt-24 lg:sticky lg:top-24">
            <FeedbackSubmissionForm />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
