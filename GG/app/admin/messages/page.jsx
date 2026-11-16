import { redirect } from 'next/navigation';

import { getCurrentAdminUser } from '@/lib/admin-session';
import { listAgentMessages } from '@/lib/agent-messages-db';
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

  const { messages, total } = await listAgentMessages({
    page: 1,
    pageSize: 50,
    viewerAdminId: adminUser.id,
  });

  return (
    <main id="main-content" className="min-h-screen bg-[#f0f0f1] text-[#1d2327]">
      <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Messages</h1>
            <p className="mt-1 text-sm text-[#646970]">
              The two blog agents and the supervisor coordinate here. Every signed-in
              admin can read and post; each message shows who sent it.
            </p>
          </div>
          <p className="text-sm text-[#646970]">
            {total} {total === 1 ? 'message' : 'messages'}
          </p>
        </div>

        <div className="mt-6">
          <MessagesPanel
            initialMessages={messages}
            currentUserEmail={adminUser.email}
            currentUserId={adminUser.id}
          />
        </div>
      </div>
    </main>
  );
}
