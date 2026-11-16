import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { getDatabaseUrl, getPgPool } from '../src/lib/db.js';
import {
  listAgentMessages,
  sendAgentMessage,
  McpChatToolError,
} from '../src/lib/mcp-chat-tools.js';
import { McpAuthorizationError } from '../src/lib/mcp-oauth-db.js';

const lane1Auth = { type: 'oauth', subject: 'mcp-subject-lane1', clientId: 'claude-desktop' };
const lane2Auth = { type: 'oauth', subject: 'mcp-subject-lane2', clientId: 'claude-desktop' };
const unlinkedAuth = { type: 'oauth', subject: 'mcp-subject-unlinked', clientId: 'claude-desktop' };
const revokedAuth = { type: 'oauth', subject: 'mcp-subject-revoked', clientId: 'claude-desktop' };

let users;
let authorizations;
let messages;
let nextMessageId;
let messageSeq;

function seedTables() {
  users = [
    { id: 1, email: 'lane1@aqprompts.com', role: 'admin' },
    { id: 2, email: 'lane2@aqprompts.com', role: 'admin' },
  ];
  authorizations = [
    { subject: 'mcp-subject-lane1', client_id: 'claude-desktop', admin_user_id: 1, revoked_at: null },
    { subject: 'mcp-subject-lane2', client_id: 'claude-desktop', admin_user_id: 2, revoked_at: null },
    { subject: 'mcp-subject-revoked', client_id: 'claude-desktop', admin_user_id: 1, revoked_at: '2026-11-16T00:00:00.000Z' },
  ];
  nextMessageId = 1;
  messageSeq = 0;
  messages = [];
}

function nextTimestamp() {
  const base = Date.UTC(2026, 10, 16, 10, 0, 0);
  return new Date(base + messageSeq++ * 1000).toISOString();
}

function projectMessage(row) {
  const sender = users.find((user) => user.id === row.sender_admin_id);
  return {
    id: row.id,
    senderAdminId: row.sender_admin_id,
    senderEmail: sender ? sender.email : null,
    body: row.body,
    thread: row.thread,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

function insertMessage(senderAdminId, body, createdAt = nextTimestamp()) {
  const row = {
    id: nextMessageId++,
    sender_admin_id: senderAdminId,
    body,
    thread: '',
    created_at: createdAt,
    read_at: null,
  };
  messages.push(row);
  return row;
}

const fakeClient = {
  async query(query, values = []) {
    // Collapse whitespace: the db layer builds multi-line SQL, so
    // `FROM \n  agent_messages` must still match `FROM agent_messages`.
    const sql = String(query || '').trim().replace(/\s+/g, ' ');

    if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('FROM mcp_oauth_authorizations')) {
      const [subject, clientId] = values;
      const authorization = authorizations.find(
        (row) => row.subject === subject && row.client_id === clientId,
      );
      if (!authorization || authorization.revoked_at) return { rows: [], rowCount: 0 };
      const adminUser = users.find(
        (user) => user.id === authorization.admin_user_id
          && (user.role === 'admin' || user.role === 'super_admin'),
      );
      if (!adminUser) return { rows: [], rowCount: 0 };
      return { rows: [{ adminUserId: adminUser.id, email: adminUser.email }], rowCount: 1 };
    }

    if (sql.includes('INSERT INTO agent_messages')) {
      const row = insertMessage(values[0], values[1]);
      row.thread = values[2] ?? '';
      return { rows: [{ id: row.id }], rowCount: 1 };
    }

    if (sql.includes('UPDATE agent_messages')) {
      const viewerAdminId = values[0];
      let rowCount = 0;
      for (const row of messages) {
        if (row.sender_admin_id !== viewerAdminId && row.read_at === null) {
          row.read_at = nextTimestamp();
          rowCount += 1;
        }
      }
      return { rows: [], rowCount };
    }

    // Retention prune: DELETE FROM agent_messages WHERE created_at < $1.
    // Must sit before the generic `FROM agent_messages` select branch
    // below, which would otherwise match this statement too. ISO
    // timestamps compare lexicographically, same as the real query.
    if (sql.startsWith('DELETE FROM agent_messages')) {
      const cutoff = values[0];
      const before = messages.length;
      messages = messages.filter((row) => !(row.created_at < cutoff));
      return { rows: [], rowCount: before - messages.length };
    }

    if (sql.includes('SELECT COUNT(*)::int AS total FROM agent_messages')) {
      const beforeId = values.length > 0 ? values[0] : null;
      const total = messages.filter((row) => beforeId == null || row.id < beforeId).length;
      return { rows: [{ total }], rowCount: 1 };
    }

    if (sql.includes('WHERE m.id = $1')) {
      const row = messages.find((message) => message.id === values[0]);
      if (!row) return { rows: [], rowCount: 0 };
      return { rows: [projectMessage(row)], rowCount: 1 };
    }

    if (sql.includes('FROM agent_messages')) {
      const hasBeforeId = sql.includes('m.id < $');
      const beforeId = hasBeforeId ? values[0] : null;
      const limit = values[values.length - 2];
      const offset = values[values.length - 1];
      const filtered = messages
        .filter((row) => beforeId == null || row.id < beforeId)
        .sort((a, b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : b.id - a.id));
      return { rows: filtered.slice(offset, offset + limit).map(projectMessage), rowCount: filtered.length };
    }

    throw new Error(`Unexpected test query: ${sql.slice(0, 120)}`);
  },
};

const fakePool = {
  __dbConnectionString: '',
  __dbPoolMax: 5,
  async query(...args) {
    return fakeClient.query(...args);
  },
  async connect() {
    return {
      ...fakeClient,
      release() {},
    };
  },
  async end() {},
  on() {
    return fakePool;
  },
};

test.before(() => {
  process.env.DATABASE_URL = `postgres://test:${randomUUID()}@localhost:5432/aqprompts-test`;
  fakePool.__dbConnectionString = getDatabaseUrl();
  globalThis.__dbPgPool = fakePool;
});

test.beforeEach(() => {
  seedTables();
});

test('list_agent_messages prunes messages older than 30 days and keeps recent ones', async () => {
  // Dates are relative to the real clock, so the test stays valid whenever
  // it runs: 45 days old is past retention, 1 day old is inside it.
  const oldAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const recentAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  insertMessage(1, 'Old: keyword claimed 45 days ago.', oldAt);
  insertMessage(2, 'Recent: draft ready yesterday.', recentAt);
  insertMessage(1, 'Recent: noted today.');

  const result = await listAgentMessages({}, lane1Auth);

  assert.equal(result.total, 2, 'the count reflects the post-prune state');
  assert.equal(result.messages.length, 2);
  assert.ok(result.messages.every((message) => message.body.startsWith('Recent:')));
  assert.deepEqual(
    messages.map((row) => row.body).sort(),
    ['Recent: draft ready yesterday.', 'Recent: noted today.'],
    'the expired row is deleted from storage, not just hidden from the list',
  );
});

test('list_agent_messages returns newest first with sender names and total', async () => {
  insertMessage(2, 'Lane 2: starting keyword research.');
  insertMessage(1, 'Lane 1: claimed cinematic prompts.');
  insertMessage(2, 'Lane 2: draft ready for review.');

  const result = await listAgentMessages({}, lane1Auth);

  assert.equal(result.total, 3);
  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0].body, 'Lane 2: draft ready for review.');
  assert.equal(result.messages[0].senderEmail, 'lane2@aqprompts.com');
  assert.equal(result.messages[1].senderEmail, 'lane1@aqprompts.com');
  assert.equal(result.messages[2].body, 'Lane 2: starting keyword research.');
});

test('list_agent_messages marks other senders messages as read', async () => {
  insertMessage(2, 'Lane 2: draft ready.');
  insertMessage(1, 'Lane 1: noted.');

  const first = await listAgentMessages({}, lane1Auth);
  const lane2Message = first.messages.find((message) => message.senderAdminId === 2);
  const lane1Message = first.messages.find((message) => message.senderAdminId === 1);

  assert.ok(lane2Message.readAt, 'the other lane message is marked read');
  assert.equal(lane1Message.readAt, null, 'own messages are not marked read by listing');
});

test('list_agent_messages pages back with beforeId', async () => {
  insertMessage(1, 'First.');
  insertMessage(1, 'Second.');
  insertMessage(1, 'Third.');

  const page1 = await listAgentMessages({ limit: 2 }, lane1Auth);
  assert.equal(page1.messages.length, 2);
  assert.equal(page1.messages[0].body, 'Third.');
  assert.equal(page1.total, 3);

  const page2 = await listAgentMessages({ limit: 2, beforeId: page1.oldestId }, lane1Auth);
  assert.equal(page2.messages.length, 1);
  assert.equal(page2.messages[0].body, 'First.');
});

test('list_agent_messages refuses an unlinked OAuth subject', async () => {
  await assert.rejects(
    () => listAgentMessages({}, unlinkedAuth),
    (error) => error instanceof McpAuthorizationError,
  );
});

test('list_agent_messages refuses a revoked OAuth authorization', async () => {
  await assert.rejects(
    () => listAgentMessages({}, revokedAuth),
    (error) => error instanceof McpAuthorizationError,
  );
});

test('list_agent_messages refuses a non-OAuth caller', async () => {
  await assert.rejects(
    () => listAgentMessages({}, null),
    (error) => error instanceof McpAuthorizationError,
  );
});

test('send_agent_message stores the linked admin as the sender', async () => {
  const result = await sendAgentMessage({ body: 'Lane 1: keyword claimed.' }, lane1Auth);

  assert.equal(result.message.body, 'Lane 1: keyword claimed.');
  assert.equal(result.message.senderAdminId, 1);
  assert.equal(result.message.senderEmail, 'lane1@aqprompts.com');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].sender_admin_id, 1);
});

test('two different admins post and each message shows its own sender', async () => {
  await sendAgentMessage({ body: 'From lane 1.' }, lane1Auth);
  await sendAgentMessage({ body: 'From lane 2.' }, lane2Auth);

  const result = await listAgentMessages({}, lane1Auth);
  assert.equal(result.messages[0].senderEmail, 'lane2@aqprompts.com');
  assert.equal(result.messages[0].body, 'From lane 2.');
  assert.equal(result.messages[1].senderEmail, 'lane1@aqprompts.com');
  assert.equal(result.messages[1].body, 'From lane 1.');
});

test('send_agent_message refuses an unlinked OAuth subject', async () => {
  await assert.rejects(
    () => sendAgentMessage({ body: 'Hello.' }, unlinkedAuth),
    (error) => error instanceof McpAuthorizationError,
  );
  assert.equal(messages.length, 0);
});

test('send_agent_message refuses an empty body', async () => {
  await assert.rejects(
    () => sendAgentMessage({ body: '   ' }, lane1Auth),
    (error) => error instanceof McpChatToolError,
  );
  assert.equal(messages.length, 0);
});

test('send_agent_message refuses a body over 5000 characters', async () => {
  await assert.rejects(
    () => sendAgentMessage({ body: 'x'.repeat(5001) }, lane1Auth),
    (error) => error instanceof McpChatToolError,
  );
  assert.equal(messages.length, 0);
});

test('send_agent_message refuses a non-OAuth caller', async () => {
  await assert.rejects(
    () => sendAgentMessage({ body: 'Hello.' }, null),
    (error) => error instanceof McpAuthorizationError,
  );
});

test.after(() => {
  assert.equal(getPgPool(), fakePool, 'tests must use the injected fake pool');
});
