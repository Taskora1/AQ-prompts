// Pure helpers for the admin agent chat panel (slash commands, message
// types, leaderboard parsing, daily digest, avatars, grouping, read
// receipts).
//
// No imports and no Node or browser APIs: this module is imported by the
// client-side MessagesPanel and by node:test unit tests alike, so it must
// stay dependency-free. Anything that touches the database lives in
// agent-messages-db.js; anything that touches the session lives in the
// API routes.

// --- Message types ----------------------------------------------------------

// The coloured badge shown on each message. 'chat' is the default.
// Lanes send chat/report only; assignment/rule/feedback/blockage/
// announcement are supervisor/owner only (enforced server-side in the
// admin API route and in sendAgentMessage — never trust the client).
export const MESSAGE_TYPES = [
  'assignment',
  'rule',
  'feedback',
  'blockage',
  'report',
  'announcement',
  'chat',
];

export const DEFAULT_MESSAGE_TYPE = 'chat';

// Types a lane may send. Everything else is moderator-only.
export const LANE_MESSAGE_TYPES = ['chat', 'report'];

export const MESSAGE_TYPE_META = {
  assignment: { label: 'Assignment', badgeClass: 'border-blue-200 bg-blue-100 text-blue-800' },
  rule: { label: 'Rule', badgeClass: 'border-yellow-200 bg-yellow-100 text-yellow-800' },
  feedback: { label: 'Score', badgeClass: 'border-green-200 bg-green-100 text-green-800' },
  blockage: { label: 'Blockage', badgeClass: 'border-red-200 bg-red-100 text-red-700' },
  report: { label: 'Report', badgeClass: 'border-teal-200 bg-teal-100 text-teal-800' },
  announcement: { label: 'Announcement', badgeClass: 'border-purple-200 bg-purple-100 text-purple-800' },
  chat: { label: 'Chat', badgeClass: 'border-gray-200 bg-gray-100 text-gray-600' },
};

export function isMessageType(value) {
  return MESSAGE_TYPES.includes(String(value ?? '').trim().toLowerCase());
}

// Returns the valid type, or the fallback when the value is missing.
// Invalid non-empty values return null so callers can reject them.
export function normalizeMessageType(value, fallback = DEFAULT_MESSAGE_TYPE) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return fallback;
  if (MESSAGE_TYPES.includes(text)) return text;
  return null;
}

// --- Slash commands ---------------------------------------------------------

export const SLASH_COMMANDS = [
  {
    name: 'announce',
    usage: '/announce <text>',
    description: 'Post a pinned announcement (Supervisor / owner only).',
    supervisorOnly: true,
  },
  {
    name: 'assign',
    usage: '/assign',
    description: 'Open the keyword assignment format to fill in.',
    supervisorOnly: true,
  },
  {
    name: 'score',
    usage: '/score Lane 1: <points> (Rank <n>) | Lane 2: <points> (Rank <n>)',
    description: 'Post the latest leaderboard scores (Supervisor / owner only).',
    supervisorOnly: true,
  },
  {
    name: 'status',
    usage: '/status <text>',
    description: 'Post a heartbeat / status line.',
    supervisorOnly: false,
  },
  {
    name: 'help',
    usage: '/help',
    description: 'List all slash commands.',
    supervisorOnly: false,
  },
];

// Parse a chat input that starts with '/'. Returns null when the text is
// not a slash command, { name, args } for a known command, or
// { name: 'unknown', command, args } for an unknown one.
export function parseSlashCommand(text) {
  const input = String(text ?? '').trimStart();
  if (!input.startsWith('/')) return null;
  const match = input.match(/^\/([A-Za-z]+)(?:\s+([\s\S]*))?$/);
  if (!match) return { name: 'unknown', command: '', args: '' };
  const name = match[1].toLowerCase();
  const args = (match[2] || '').trim();
  const known = SLASH_COMMANDS.find((command) => command.name === name);
  if (!known) return { name: 'unknown', command: name, args };
  return { name, args };
}

export function slashCommandSuggestions(prefix) {
  const needle = String(prefix ?? '').trimStart().replace(/^\//, '').toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(needle));
}

// The assignment format /assign drops into the composer. The panel sends
// it as type 'assignment' when the body starts with this marker line, so
// keep ASSIGNMENT_MARKER in sync with the template below.
export const ASSIGNMENT_MARKER = 'Supervisor assignment';

export function assignmentTemplate(dateLabel) {
  const date = dateLabel || new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    `${ASSIGNMENT_MARKER} — YOUR KEYWORDS (${date}):\n`
    + 'LANE 1 (Muse AI) — your keywords, 1 per day:\n'
    + '1. <keyword> — <impressions> imp, pos <position>\n'
    + '\n'
    + 'LANE 2 (Muse) — your keywords, 1 per day:\n'
    + '1. <keyword> — <impressions> imp, pos <position>\n'
    + '\n'
    + 'Rules: Work on YOUR keywords only, 1 per day. Do not start a draft on the other lane\'s keyword. Post each draft here and wait for the score. Do not publish anything.'
  );
}

export function formatStatusLine(name, args) {
  const who = String(name || '').trim() || 'An admin';
  const what = String(args || '').trim();
  return `Status update — ${who}: ${what || 'online, working on the assigned keyword.'}`;
}

// --- Leaderboard ------------------------------------------------------------

// A /score post is a message with thread 'leaderboard' whose body starts
// with 'Leaderboard update:'. The panel parses the latest one for the
// leaderboard display. Expected format (also in the lanes' rules):
//   Lane 1: 85 points (Rank 1) | Lane 2: 80 points (Rank 2)
// Returns null when no lane scores can be parsed (panel then shows the
// raw text instead of inventing numbers).
export const LEADERBOARD_PREFIX = 'Leaderboard update:';

export function parseLeaderboardText(body) {
  const text = String(body ?? '');
  const parseLane = (laneNumber) => {
    const pointsMatch = text.match(new RegExp(`lane\\s*${laneNumber}\\s*:\\s*(\\d+)`, 'i'));
    if (!pointsMatch) return null;
    const rankMatch = text.match(new RegExp(`lane\\s*${laneNumber}[^|\\n]*?rank\\s*(\\d+)`, 'i'));
    return {
      points: Number(pointsMatch[1]),
      rank: rankMatch ? Number(rankMatch[1]) : null,
    };
  };
  const lane1 = parseLane(1);
  const lane2 = parseLane(2);
  if (!lane1 && !lane2) return null;
  return { lane1, lane2, raw: text };
}

export function isLeaderboardPost(message) {
  return message?.thread === 'leaderboard';
}

export function isAnnouncement(message) {
  return message?.type === 'announcement';
}

// --- Daily digest -----------------------------------------------------------

function messageTime(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// Client-side summary computed from the loaded messages only — no new
// tables, no new endpoint. Assignments are today's type='assignment'
// messages; blockages are type='blockage' from the last 7 days; drafts
// pending verification are messages from the last 7 days that mention
// both a draft and verification (a chat mention, not a tracked state).
export function computeDailyDigest(messages, now = new Date()) {
  const list = Array.isArray(messages) ? messages : [];
  const reference = now instanceof Date ? now : new Date(now);
  const weekAgo = reference.getTime() - 7 * 24 * 60 * 60 * 1000;
  const assignmentsToday = [];
  const blockagesOpen = [];
  const draftsPendingVerification = [];

  for (const message of list) {
    const created = messageTime(message?.createdAt);
    if (created == null) continue;
    const createdDate = new Date(created);
    if (message?.type === 'assignment' && isSameDay(createdDate, reference)) {
      assignmentsToday.push(message);
    }
    if (created < weekAgo) continue;
    if (message?.type === 'blockage') blockagesOpen.push(message);
    const body = String(message?.body || '');
    if (/draft/i.test(body) && /verif/i.test(body)) {
      draftsPendingVerification.push(message);
    }
  }

  return { assignmentsToday, blockagesOpen, draftsPendingVerification };
}

// --- Avatars ----------------------------------------------------------------

// Lane colours by admin email (the owner's standing roster). Unknown
// admins fall back to neutral grey — never guess a lane from a name.
export const AVATAR_COLORS = {
  'abdulqudoos4473988@gmail.com': 'bg-[#2271b1]',
  'abdulqudoos5374@gmail.com': 'bg-[#00847f]',
  'abdulqudoos1347@gmail.com': 'bg-[#7e57c2]',
  'abdulqudoos.4755@gmail.com': 'bg-[#3c434a]',
};

export function avatarColorFor(email) {
  return AVATAR_COLORS[String(email || '').toLowerCase()] || 'bg-[#646970]';
}

// Initials from the display name when set, else from the email address:
// "Lane 1" -> "L1", "Abdul Qudoos" -> "AQ", "lane1@…" -> "L".
export function initialsFor(displayName, email) {
  const source = String(displayName || '').trim() || String(email || '').trim();
  if (!source) return '?';
  const localPart = source.includes('@') && !String(displayName || '').trim()
    ? source.split('@')[0]
    : source;
  const words = localPart.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return localPart.slice(0, 2).toUpperCase();
}

// --- Dates and grouping -----------------------------------------------------

export function dayLabel(dateValue, now = new Date()) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const reference = now instanceof Date ? now : new Date(now);
  const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const dayDiff = Math.round((startOfDay(reference) - startOfDay(date)) / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Group consecutive messages from the same sender on the same day so the
// name and avatar show once per group. Returns an ordered list of
// { kind: 'date', label } and { kind: 'group', senderKey, messages }.
export function groupMessagesForDisplay(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const groups = [];
  let currentDay = '';
  let currentGroup = null;

  for (const message of list) {
    const label = dayLabel(message?.createdAt);
    if (label !== currentDay) {
      currentDay = label;
      groups.push({ kind: 'date', key: `date-${label}-${message?.id ?? groups.length}`, label });
      currentGroup = null;
    }
    const senderKey = message?.senderAdminId ?? message?.senderEmail ?? 'deleted';
    if (!currentGroup || currentGroup.senderKey !== senderKey) {
      currentGroup = { kind: 'group', key: `group-${message?.id ?? groups.length}`, senderKey, messages: [] };
      groups.push(currentGroup);
    }
    currentGroup.messages.push(message);
  }

  return groups;
}

// --- Read receipts ----------------------------------------------------------

// participants: [{ adminId, displayName, lastReadMessageId }] — the union
// of everyone who has posted or opened the chat (from the list response).
// Returns '' when nobody else has read the message yet.
export function readReceiptLine(message, participants, currentUserId) {
  if (!message) return '';
  const senderId = message.senderAdminId;
  const readers = (Array.isArray(participants) ? participants : [])
    .filter((person) => Number(person.adminId) !== Number(senderId)
      && Number(person.adminId) !== Number(currentUserId)
      && Number(person.lastReadMessageId || 0) >= Number(message.id))
    .map((person) => person.displayName || 'An admin');
  const pending = (Array.isArray(participants) ? participants : [])
    .filter((person) => Number(person.adminId) !== Number(senderId)
      && Number(person.adminId) !== Number(currentUserId)
      && Number(person.lastReadMessageId || 0) < Number(message.id))
    .map((person) => person.displayName || 'An admin');

  const parts = [];
  if (readers.length > 0) parts.push(`Seen by ${readers.join(', ')}`);
  if (pending.length > 0) parts.push(`Not yet seen by ${pending.join(', ')}`);
  return parts.join(' · ');
}

// --- Collapsing -------------------------------------------------------------

export const MESSAGE_COLLAPSE_LINES = 8;
export const MESSAGE_COLLAPSE_CHARS = 800;

export function shouldCollapseMessage(body) {
  const text = String(body ?? '');
  if (!text) return false;
  return text.split('\n').length > MESSAGE_COLLAPSE_LINES || text.length > MESSAGE_COLLAPSE_CHARS;
}

export function collapsedPreview(body) {
  const text = String(body ?? '');
  const lines = text.split('\n');
  if (lines.length > MESSAGE_COLLAPSE_LINES) {
    return `${lines.slice(0, MESSAGE_COLLAPSE_LINES).join('\n')}\n…`;
  }
  return `${text.slice(0, MESSAGE_COLLAPSE_CHARS)}…`;
}
