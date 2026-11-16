// Pure-function tests for the admin agent-chat improvements
// (src/lib/agent-chat-commands.js) plus the DB layer's pure validators
// (src/lib/agent-messages-db.js, src/lib/admin-users-db.js). None of
// these tests touch the database: the DB-layer functions tested here
// validate inputs only.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSIGNMENT_MARKER,
  MESSAGE_TYPES,
  MESSAGE_TYPE_META,
  assignmentTemplate,
  avatarColorFor,
  collapsedPreview,
  computeDailyDigest,
  dayLabel,
  formatStatusLine,
  groupMessagesForDisplay,
  initialsFor,
  isAnnouncement,
  isLeaderboardPost,
  parseLeaderboardText,
  parseSlashCommand,
  readReceiptLine,
  shouldCollapseMessage,
  slashCommandSuggestions,
} from '../src/lib/agent-chat-commands.js';
import {
  AgentMessageValidationError,
  isChatModerator,
  isModeratorOnlyType,
  normalizeMessageType,
} from '../src/lib/agent-messages-db.js';
import { normalizeDisplayName } from '../src/lib/admin-users-db.js';

const supervisor = { id: 12, email: 'abdulqudoos1347@gmail.com', role: 'admin' };
const owner = { id: 1, email: 'abdulqudoos.4755@gmail.com', role: 'super_admin' };
const lane1 = { id: 11, email: 'abdulqudoos4473988@gmail.com', role: 'admin' };

// --- Slash commands ---------------------------------------------------------

test('parseSlashCommand recognises known commands with their args', () => {
  assert.deepEqual(parseSlashCommand('/announce Read this first'), {
    name: 'announce',
    args: 'Read this first',
  });
  assert.deepEqual(parseSlashCommand('/assign'), { name: 'assign', args: '' });
  assert.deepEqual(parseSlashCommand('/score Lane 1: 85 points (Rank 1)'), {
    name: 'score',
    args: 'Lane 1: 85 points (Rank 1)',
  });
  assert.deepEqual(parseSlashCommand('/status working on keyword 3'), {
    name: 'status',
    args: 'working on keyword 3',
  });
  assert.deepEqual(parseSlashCommand('/help'), { name: 'help', args: '' });
  assert.deepEqual(parseSlashCommand('/ANNOUNCE hello'), {
    name: 'announce',
    args: 'hello',
  });
});

test('parseSlashCommand returns null for plain messages', () => {
  assert.equal(parseSlashCommand('Hello, starting work.'), null);
  assert.equal(parseSlashCommand(''), null);
  assert.equal(parseSlashCommand('hello /announce'), null);
});

test('parseSlashCommand flags unknown commands without sending', () => {
  assert.deepEqual(parseSlashCommand('/dance now'), {
    name: 'unknown',
    command: 'dance',
    args: 'now',
  });
});

test('slashCommandSuggestions filters by prefix', () => {
  assert.equal(slashCommandSuggestions('').length, 5);
  assert.deepEqual(
    slashCommandSuggestions('/an').map((command) => command.name),
    ['announce'],
  );
  assert.deepEqual(
    slashCommandSuggestions('/s').map((command) => command.name),
    ['score', 'status'],
  );
  assert.deepEqual(slashCommandSuggestions('/xyz'), []);
});

test('assignmentTemplate contains the marker and both lanes', () => {
  const template = assignmentTemplate('16 Nov 2026');
  assert.ok(template.startsWith(ASSIGNMENT_MARKER));
  assert.ok(template.includes('16 Nov 2026'));
  assert.ok(template.includes('LANE 1'));
  assert.ok(template.includes('LANE 2'));
  assert.ok(template.includes('Do not publish anything.'));
});

test('formatStatusLine names the sender and keeps the args', () => {
  assert.equal(
    formatStatusLine('Lane 1', 'draft 3 posted'),
    'Status update — Lane 1: draft 3 posted',
  );
  assert.equal(
    formatStatusLine('', ''),
    'Status update — An admin: online, working on the assigned keyword.',
  );
});

// --- Message types ----------------------------------------------------------

test('normalizeMessageType accepts known types and defaults to chat', () => {
  assert.equal(normalizeMessageType('assignment'), 'assignment');
  assert.equal(normalizeMessageType('REPORT'), 'report');
  assert.equal(normalizeMessageType(''), 'chat');
  assert.equal(normalizeMessageType(undefined), 'chat');
});

test('normalizeMessageType throws for an unknown type', () => {
  assert.throws(
    () => normalizeMessageType('bogus'),
    (error) => error instanceof AgentMessageValidationError
      && /Unknown message type: bogus/.test(error.message),
  );
});

test('MESSAGE_TYPE_META covers every message type', () => {
  assert.deepEqual(
    Object.keys(MESSAGE_TYPE_META).sort(),
    [...MESSAGE_TYPES].sort(),
  );
  for (const type of MESSAGE_TYPES) {
    assert.ok(MESSAGE_TYPE_META[type].label, `label for ${type}`);
    assert.ok(MESSAGE_TYPE_META[type].badgeClass, `badge class for ${type}`);
  }
});

test('isModeratorOnlyType and isChatModerator gate moderator types', () => {
  assert.equal(isModeratorOnlyType('announcement'), true);
  assert.equal(isModeratorOnlyType('assignment'), true);
  assert.equal(isModeratorOnlyType('feedback'), true);
  assert.equal(isModeratorOnlyType('blockage'), true);
  assert.equal(isModeratorOnlyType('rule'), true);
  assert.equal(isModeratorOnlyType('chat'), false);
  assert.equal(isModeratorOnlyType('report'), false);

  assert.equal(isChatModerator(supervisor), true, 'the 1347 account is the supervisor');
  assert.equal(isChatModerator(owner), true, 'any super_admin is the owner');
  assert.equal(isChatModerator(lane1), false, 'a lane is not a moderator');
  assert.equal(isChatModerator(null), false);
});

// --- Display names ----------------------------------------------------------

test('normalizeDisplayName trims, clears empties and caps length', () => {
  assert.equal(normalizeDisplayName('  Lane 1  '), 'Lane 1');
  assert.equal(normalizeDisplayName(''), null);
  assert.equal(normalizeDisplayName('   '), null);
  assert.equal(normalizeDisplayName(null), null);
  assert.equal(normalizeDisplayName('A  B'), 'A B', 'internal whitespace collapses');
  assert.throws(
    () => normalizeDisplayName('x'.repeat(81)),
    /80 characters or fewer/,
  );
  assert.equal(normalizeDisplayName('x'.repeat(80)).length, 80);
});

// --- Leaderboard ------------------------------------------------------------

test('parseLeaderboardText parses the full /score format', () => {
  const parsed = parseLeaderboardText(
    'Leaderboard update: Lane 1: 85 points (Rank 1) | Lane 2: 80 points (Rank 2)',
  );
  assert.deepEqual(parsed.lane1, { points: 85, rank: 1 });
  assert.deepEqual(parsed.lane2, { points: 80, rank: 2 });
});

test('parseLeaderboardText handles a partial score and missing ranks', () => {
  const parsed = parseLeaderboardText('Leaderboard update: Lane 1: 12 points');
  assert.deepEqual(parsed.lane1, { points: 12, rank: null });
  assert.equal(parsed.lane2, null);
});

test('parseLeaderboardText returns null when no scores are present', () => {
  assert.equal(parseLeaderboardText('Leaderboard update: scores coming soon'), null);
  assert.equal(parseLeaderboardText(''), null);
});

test('isLeaderboardPost and isAnnouncement match their markers', () => {
  assert.equal(isLeaderboardPost({ thread: 'leaderboard', type: 'feedback' }), true);
  assert.equal(isLeaderboardPost({ thread: '', type: 'chat' }), false);
  assert.equal(isAnnouncement({ type: 'announcement' }), true);
  assert.equal(isAnnouncement({ type: 'chat' }), false);
});

// --- Daily digest -----------------------------------------------------------

test('computeDailyDigest counts today assignments, recent blockages and draft mentions', () => {
  const now = new Date();
  const today = now.toISOString();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const messages = [
    { id: 1, type: 'assignment', body: 'Your keywords', createdAt: today },
    { id: 2, type: 'assignment', body: 'Old keywords', createdAt: threeDaysAgo },
    { id: 3, type: 'blockage', body: 'API is down', createdAt: threeDaysAgo },
    { id: 4, type: 'blockage', body: 'Old blockage', createdAt: tenDaysAgo },
    { id: 5, type: 'chat', body: 'Draft ready, waiting for owner verification.', createdAt: threeDaysAgo },
    { id: 6, type: 'chat', body: 'Draft ready.', createdAt: threeDaysAgo },
    { id: 7, type: 'chat', body: 'No date at all', createdAt: 'not-a-date' },
  ];

  const digest = computeDailyDigest(messages, now);
  assert.deepEqual(digest.assignmentsToday.map((message) => message.id), [1]);
  assert.deepEqual(digest.blockagesOpen.map((message) => message.id), [3]);
  assert.deepEqual(
    digest.draftsPendingVerification.map((message) => message.id),
    [5],
    'only messages mentioning both a draft and verification count',
  );
});

test('computeDailyDigest handles an empty board', () => {
  assert.deepEqual(computeDailyDigest([]), {
    assignmentsToday: [],
    blockagesOpen: [],
    draftsPendingVerification: [],
  });
});

// --- Avatars, dates, grouping -----------------------------------------------

test('avatarColorFor matches the lane roster and falls back to grey', () => {
  assert.equal(avatarColorFor('abdulqudoos4473988@gmail.com'), 'bg-[#2271b1]');
  assert.equal(avatarColorFor('abdulqudoos5374@gmail.com'), 'bg-[#00847f]');
  assert.equal(avatarColorFor('abdulqudoos1347@gmail.com'), 'bg-[#7e57c2]');
  assert.equal(avatarColorFor('abdulqudoos.4755@gmail.com'), 'bg-[#3c434a]');
  assert.equal(avatarColorFor('someone-else@example.com'), 'bg-[#646970]');
});

test('initialsFor uses the display name, else the email', () => {
  assert.equal(initialsFor('Lane 1', 'lane1@aqprompts.com'), 'L1');
  assert.equal(initialsFor('Abdul Qudoos', 'abdul@aqprompts.com'), 'AQ');
  assert.equal(initialsFor(null, 'lane1@aqprompts.com'), 'LA');
  assert.equal(initialsFor('', 'abdulqudoos1347@gmail.com'), 'AB');
});

test('dayLabel says Today, Yesterday or the date', () => {
  const now = new Date();
  assert.equal(dayLabel(now.toISOString(), now), 'Today');
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  assert.equal(dayLabel(yesterday.toISOString(), now), 'Yesterday');
  const older = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const label = dayLabel(older.toISOString(), now);
  assert.ok(label && label !== 'Today' && label !== 'Yesterday');
});

test('groupMessagesForDisplay groups consecutive same-sender messages and separates days', () => {
  const now = new Date();
  const today = now.toISOString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const messages = [
    { id: 1, senderAdminId: 1, senderEmail: 'a@x.com', createdAt: yesterday, body: 'old' },
    { id: 2, senderAdminId: 1, senderEmail: 'a@x.com', createdAt: today, body: 'first' },
    { id: 3, senderAdminId: 1, senderEmail: 'a@x.com', createdAt: today, body: 'second' },
    { id: 4, senderAdminId: 2, senderEmail: 'b@x.com', createdAt: today, body: 'other lane' },
  ];

  const groups = groupMessagesForDisplay(messages);
  const dates = groups.filter((entry) => entry.kind === 'date');
  const messageGroups = groups.filter((entry) => entry.kind === 'group');
  assert.equal(dates.length, 2, 'one separator per day');
  assert.equal(dates[0].label, 'Yesterday');
  assert.equal(dates[1].label, 'Today');
  assert.equal(messageGroups.length, 3, 'yesterday, lane 1 today, lane 2 today');
  assert.deepEqual(messageGroups[1].messages.map((message) => message.id), [2, 3]);
});

// --- Read receipts ----------------------------------------------------------

test('readReceiptLine shows who has and has not read a message', () => {
  const participants = [
    { adminId: 1, displayName: 'Lane 1', lastReadMessageId: 5 },
    { adminId: 2, displayName: 'Lane 2', lastReadMessageId: 2 },
    { adminId: 3, displayName: 'Supervisor', lastReadMessageId: 5 },
  ];
  const message = { id: 4, senderAdminId: 2 };
  // Viewer is lane 2 (id 2, also the sender here); lane 1 and supervisor read it.
  assert.equal(
    readReceiptLine(message, participants, 2),
    'Seen by Lane 1, Supervisor',
  );

  const unread = { id: 5, senderAdminId: 1 };
  assert.equal(
    readReceiptLine(unread, participants, 3),
    'Not yet seen by Lane 2',
    'the sender (Lane 1) and the viewer (Supervisor) are never listed',
  );

  assert.equal(
    readReceiptLine({ id: 9, senderAdminId: 1 }, participants, 1),
    'Not yet seen by Lane 2, Supervisor',
    'nobody else has read it yet, so only the pending list shows',
  );
});

// --- Collapsing -------------------------------------------------------------

test('shouldCollapseMessage and collapsedPreview handle long messages', () => {
  assert.equal(shouldCollapseMessage('Short.'), false);
  const nineLines = Array.from({ length: 9 }, (_, i) => `keyword ${i + 1}`).join('\n');
  assert.equal(shouldCollapseMessage(nineLines), true);
  const preview = collapsedPreview(nineLines);
  assert.equal(preview.split('\n').length, 9, '8 lines plus the ellipsis line');
  assert.ok(preview.endsWith('…'));
  assert.equal(shouldCollapseMessage('x'.repeat(801)), true);
  assert.equal(shouldCollapseMessage('x'.repeat(800)), false);
});
