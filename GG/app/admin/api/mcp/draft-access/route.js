import { NextResponse } from 'next/server';

import { getCurrentAdminUser, isSuperAdmin } from '@/lib/admin-session';
import {
  grantMcpPromptDraftAccess,
  grantMcpBlogPostDraftAccess,
  listMcpBlogPostDraftAccess,
  listMcpPromptDraftAccess,
  revokeMcpBlogPostDraftAccess,
  revokeMcpPromptDraftAccess,
} from '@/lib/mcp-oauth-db';

function requireSuperAdmin(user) {
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isSuperAdmin(user)) {
    return NextResponse.json({ error: 'Only a Super Admin can manage MCP draft access.' }, { status: 403 });
  }
  return null;
}

function validSubject(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 255
    && value.trim() === value
    && ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    });
}

function validPromptId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export async function GET() {
  const admin = await getCurrentAdminUser();
  const denied = requireSuperAdmin(admin);
  if (denied) return denied;

  try {
    const [prompts, blogs] = await Promise.all([
      listMcpPromptDraftAccess(),
      listMcpBlogPostDraftAccess(),
    ]);
    return NextResponse.json({ assignments: [...prompts, ...blogs] });
  } catch (error) {
    console.error('Admin MCP draft access listing failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'MCP draft assignments could not be loaded.' }, { status: 503 });
  }
}

export async function POST(request) {
  const admin = await getCurrentAdminUser();
  const denied = requireSuperAdmin(admin);
  if (denied) return denied;

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (
    !input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).some((key) => !['action', 'id', 'library', 'subject'].includes(key))
    || !['assign', 'revoke'].includes(input.action)
    || !validPromptId(input.id)
    || !['photo', 'text', 'blog'].includes(input.library)
    || !validSubject(input.subject)
  ) {
    return NextResponse.json({ error: 'Provide a valid action, draft ID, library, and OAuth subject.' }, { status: 400 });
  }

  try {
    if (input.action === 'assign') {
      const assignment = input.library === 'blog'
        ? await grantMcpBlogPostDraftAccess(input.id, input.subject, admin.id)
        : await grantMcpPromptDraftAccess(input.id, input.library, input.subject, admin.id);
      if (!assignment) {
        return NextResponse.json({ error: 'Draft not found in the selected library.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, assignment }, { status: 201 });
    }

    const assignment = input.library === 'blog'
      ? await revokeMcpBlogPostDraftAccess(input.id, input.subject)
      : await revokeMcpPromptDraftAccess(input.id, input.subject);
    if (!assignment) {
      return NextResponse.json({ error: 'Active draft assignment not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, assignment });
  } catch (error) {
    console.error('Admin MCP draft access update failed:', error?.code || error?.name || 'unknown');
    return NextResponse.json({ error: 'MCP draft assignment could not be updated.' }, { status: 503 });
  }
}
