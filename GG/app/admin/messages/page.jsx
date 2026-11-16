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
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-8 lg:px-8">
        <p className="text-sm text-[#646970]">
          {total} {total === 1 ? 'message' : 'messages'}
        </p>

        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <MessagesPanel
            initialMessages={messages}
            initialReads={reads}
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
