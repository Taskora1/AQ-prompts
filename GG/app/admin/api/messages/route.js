import { NextResponse } from 'next/server';

import { getCurrentAdminUser } from '@/lib/admin-session';
import {
  AgentMessageValidationError,
  createAgentMessage,
  ensureAgentMessagesTable,
  listAgentMessages,
} from '@/lib/agent-messages-db';

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

    const result = await listAgentMessages({
      page,
      pageSize,
      viewerAdminId: adminUser.id,
      beforeId: beforeId == null ? null : Number(beforeId),
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
    const message = await createAgentMessage({
      senderAdminId: adminUser.id,
      body: body?.body ?? body?.message ?? '',
      thread: body?.thread ?? '',
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    if (error instanceof AgentMessageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to send message.' }, { status: 500 });
  }
}
