import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import {
  AgentMessageValidationError,
  createAgentMessage,
  ensureAgentMessagesTable,
  isChatModerator,
  isMessageType,
  isModeratorOnlyType,
  listAgentMessages,
} from '@/lib/agent-messages-db';
// The leaderboard thread is moderator-only: it feeds the leaderboard
// panel, and a lane could otherwise spoof scores by posting to it.
const LEADERBOARD_THREAD = 'leaderboard';

// Ensure table exists on first request (same pattern as ensureBlogTable in
// the blog API route — a module-level flag keeps this to one DDL run per
// Worker isolate).
let tableEnsured = false;

async function ensureTable() {
  if (!tableEnsured) {
    await ensureAgentMessagesTable();
    tableEnsured = true;
  }
}

export async function GET(request) {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') || 1);
    const pageSize = Number(searchParams.get('pageSize') || 50);
    const beforeId = searchParams.get('before');
    // Lightweight poll: `since` is the newest message id the panel has
    // already shown. With nothing newer the list answers with one indexed
    // id lookup and no COUNT, no prune and no read-receipt writes — that
    // is what keeps the board from hammering the Worker. The drafts list
    // used to be fetched here on every poll too; the panel no longer shows
    // it, so it is gone entirely.
    const sinceParam = searchParams.get('since');
    const sinceId = sinceParam == null ? null : Number(sinceParam);

    const result = await listAgentMessages({
      page,
      pageSize,
      viewerAdminId: adminUser.id,
      beforeId: beforeId == null ? null : Number(beforeId),
      sinceId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AgentMessageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to load messages.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const adminUser = await getCurrentAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    const body = await request.json();
    const type = String(body?.type ?? 'chat').trim().toLowerCase();
    if (!isMessageType(type)) {
      return NextResponse.json(
        { error: `Unknown message type: ${type}.` },
        { status: 400 },
      );
    }
    const thread = String(body?.thread ?? '').trim();
    const moderator = isChatModerator(adminUser);
    if ((!moderator && isModeratorOnlyType(type)) || (!moderator && thread === LEADERBOARD_THREAD)) {
      return NextResponse.json(
        { error: 'Only the supervisor or the owner can post this type of message.' },
        { status: 403 },
      );
    }

    // The sender always comes from the authenticated identity, never from
    // the request body — an agent can never post as someone else.
    const message = await createAgentMessage({
      senderAdminId: adminUser.id,
      body: body?.body ?? body?.message ?? '',
      thread,
      type,
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    if (error instanceof AgentMessageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to send message.' }, { status: 500 });
  }
}
