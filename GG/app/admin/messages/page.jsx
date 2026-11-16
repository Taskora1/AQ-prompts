import { redirect } from 'next/navigation';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { isChatModerator, listAgentMessages } from '@/lib/agent-messages-db';
import { listPendingDraftPosts } from '@/lib/blog-db';
import MessagesPanel from './MessagesPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Messages — Admin',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default async function AdminMessagesPage() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) redirect('/admin/login?reset=1');

  const { messages, total, reads } = await listAgentMessages({
    page: 1,
    pageSize: 50,
    viewerAdminId: adminUser.id,
  });

  // Real drafts for the digest: blog_posts with status='draft'.
  // Best-effort — a failed drafts query must not fail the page.
  let pendingDrafts = [];
  try {
    pendingDrafts = await listPendingDraftPosts();
  } catch (error) {
    console.error('[agent-messages] Failed to list pending drafts:', error?.message || error);
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 lg:px-8">
        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <MessagesPanel
            initialMessages={messages}
            initialReads={reads}
            initialTotal={total}
            initialPendingDrafts={pendingDrafts}
            currentUserEmail={adminUser.email}
            currentUserId={adminUser.id}
            currentDisplayName={adminUser.displayName ?? null}
            canModerate={isChatModerator(adminUser)}
          />
        </div>
      </div>
    </main>
  );
}
