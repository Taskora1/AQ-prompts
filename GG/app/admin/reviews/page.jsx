import { redirect } from 'next/navigation';

import ReviewsManager from '@/components/admin/ReviewsManager';
import { getCurrentAdminUser } from '@/lib/admin-session';
import { getAdminSiteReviewData } from '@/lib/site-reviews-db';

export const dynamic = 'force-dynamic';

export default async function AdminReviewsPage() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');

  const data = await getAdminSiteReviewData();
  return (
    <main className="min-h-screen bg-[#f0f0f1] p-4 text-[#1d2327] sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Feedback</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Reviews</h1>
          </div>
        </header>
        <ReviewsManager initialData={data} />
      </div>
    </main>
  );
}
