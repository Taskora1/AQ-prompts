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

// History posted before typed sends existed is all stored as 'chat' —
// including the supervisor's 16 Nov assignment ("Supervisor assignment -
// YOUR KEYWORDS…"), the two rules ("Supervisor rule - …") and the GSC
// order ("Supervisor order - START NOW…"). Those supervisor prefixes are
// deterministic, so the DISPLAY type (badge + digest counting) is derived
// from them. The stored type is never rewritten — this is display-only,
// and a lane quoting a rule mid-message is not reclassified because only
// the start of the body is checked.
export const RULE_MARKER = 'Supervisor rule';
export const ORDER_MARKER = 'Supervisor order';

export function displayTypeFor(message) {
  const stored = String(message?.type || 'chat').trim().toLowerCase();
  if (stored !== 'chat') {
    return MESSAGE_TYPES.includes(stored) ? stored : 'chat';
  }
  const lower = String(message?.body || '').toLowerCase();
  if (lower.startsWith(ASSIGNMENT_MARKER.toLowerCase())) return 'assignment';
  if (lower.startsWith(RULE_MARKER.toLowerCase())) return 'rule';
  if (lower.startsWith(ORDER_MARKER.toLowerCase())) return 'assignment';
  return 'chat';
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
    name: 'rule',
    usage: '/rule <text>',
    description: 'Post a rule for the lanes (Supervisor / owner only).',
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

// Client-side summary computed from the loaded messages plus the real
// pending drafts from the API. Assignments are today's messages whose
// display type is 'assignment' (stored type, or the supervisor's
// assignment/order prefix — see displayTypeFor); blockages are
// type='blockage' from the last 7 days. Drafts pending verification are
// the REAL blog drafts (blog_posts status='draft') passed in as
// options.pendingDrafts — never a word match over chat text. The old
// word-match count said 13 when no draft existed at all, so the count
// here is a list of drafts, not a number: the panel shows each draft's
// title with a link to it in the admin panel. When the caller passes no
// drafts (old callers, MCP list), the field is an empty list.
export function computeDailyDigest(messages, now = new Date(), { pendingDrafts = [] } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const reference = now instanceof Date ? now : new Date(now);
  const weekAgo = reference.getTime() - 7 * 24 * 60 * 60 * 1000;
  const assignmentsToday = [];
  const blockagesOpen = [];

  for (const message of list) {
    const created = messageTime(message?.createdAt);
    if (created == null) continue;
    const createdDate = new Date(created);
    if (displayTypeFor(message) === 'assignment' && isSameDay(createdDate, reference)) {
      assignmentsToday.push(message);
    }
    if (created < weekAgo) continue;
    if (displayTypeFor(message) === 'blockage') blockagesOpen.push(message);
  }

  return {
    assignmentsToday,
    blockagesOpen,
    pendingDrafts: Array.isArray(pendingDrafts) ? pendingDrafts : [],
  };
}

// The pinned banner shows the latest announcement; the leaderboard shows
// the latest /score post. Both are pure selections over the loaded list
// so the panel and the tests share the logic.
export function latestAnnouncementFrom(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return [...list].reverse().find(isAnnouncement) ?? null;
}

export function latestLeaderboardPostFrom(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return [...list].reverse().find(isLeaderboardPost) ?? null;
}

// How many messages arrived after the last id the user had seen — the
// new-messages button count. Pure so the panel effect and the tests share
// it; the panel's max-seen watermark is the only state.
export function countNewMessages(messages, lastSeenId) {
  const seen = Number(lastSeenId) || 0;
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => Number(message.id) > seen).length;
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

// Roster labels for the known admin emails. A lane that has not set a
// display name shows its label ("Lane 1" / "Lane 2") instead of a raw
// email address — display-only, identity stays the email.
export const ROSTER_LABELS = {
  'abdulqudoos4473988@gmail.com': 'Lane 1',
  'abdulqudoos5374@gmail.com': 'Lane 2',
  'abdulqudoos1347@gmail.com': 'Supervisor',
  'abdulqudoos.4755@gmail.com': 'Owner',
};

export const ROSTER_INITIALS = {
  'abdulqudoos4473988@gmail.com': 'L1',
  'abdulqudoos5374@gmail.com': 'L2',
  'abdulqudoos1347@gmail.com': 'SU',
  'abdulqudoos.4755@gmail.com': 'OW',
};

export function rosterLabelFor(email) {
  return ROSTER_LABELS[String(email || '').toLowerCase()] || null;
}

// Display name with the roster fallback: a set display name wins, then
// the known roster label, then the email. Use everywhere a sender is
// shown (message header, read receipts, pinned announcement).
export function displayNameFor({ displayName, email } = {}) {
  const name = String(displayName || '').trim();
  if (name) return name;
  return rosterLabelFor(email) || String(email || '').trim() || 'Deleted admin';
}

// Initials from the display name when set, else from the email address:
// "Lane 1" -> "L1", "Abdul Qudoos" -> "AQ". A roster email without a
// display name gets its roster initials ("L1"/"L2") — the old code took
// the first two letters of the email, which gave "AB" for BOTH lanes
// because both emails start with "abdulqudoos".
export function initialsFor(displayName, email) {
  const name = String(displayName || '').trim();
  if (name) {
    const words = name.split(/[\s._-]+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const rosterInitials = ROSTER_INITIALS[String(email || '').toLowerCase()];
  if (rosterInitials) return rosterInitials;
  const source = String(email || '').trim();
  if (!source) return '?';
  const localPart = source.includes('@') ? source.split('@')[0] : source;
  const words = localPart.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return localPart.slice(0, 2).toUpperCase();
}

// Per-sender bubble tints so the lanes are distinct at a glance. Own
// messages stay the blue bubble in the panel; these tints are for other
// senders' bubbles (Lane 1 light blue, Lane 2 light teal).
export const SENDER_BUBBLE_CLASSES = {
  'abdulqudoos4473988@gmail.com': 'border-[#b3d4ea] bg-[#e5f1fa] text-[#1d2327]',
  'abdulqudoos5374@gmail.com': 'border-[#b2d8d5] bg-[#e6f4f3] text-[#1d2327]',
  'abdulqudoos1347@gmail.com': 'border-[#d5c6ec] bg-[#f1eaf9] text-[#1d2327]',
  'abdulqudoos.4755@gmail.com': 'border-[#dcdcde] bg-[#f6f7f7] text-[#1d2327]',
};

export function bubbleClassFor(email) {
  return SENDER_BUBBLE_CLASSES[String(email || '').toLowerCase()]
    || 'border-[#dcdcde] bg-[#f6f7f7] text-[#1d2327]';
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
