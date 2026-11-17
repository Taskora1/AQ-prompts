import { redirect } from 'next/navigation';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { isChatModerator, listAgentMessages } from '@/lib/agent-messages-db';
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

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <div className="mt-2 flex min-h-0 flex-1 flex-col sm:mt-4">
          <MessagesPanel
            initialMessages={messages}
            initialReads={reads}
            initialTotal={total}
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
