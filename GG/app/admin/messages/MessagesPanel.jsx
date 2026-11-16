'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ASSIGNMENT_MARKER,
  LEADERBOARD_PREFIX,
  MESSAGE_TYPE_META,
  assignmentTemplate,
  avatarColorFor,
  bubbleClassFor,
  collapsedPreview,
  computeDailyDigest,
  countNewMessages,
  displayNameFor,
  displayTypeFor,
  formatStatusLine,
  groupMessagesForDisplay,
  initialsFor,
  latestAnnouncementFrom,
  latestLeaderboardPostFrom,
  parseLeaderboardText,
  parseSlashCommand,
  readReceiptLine,
  shouldCollapseMessage,
  slashCommandSuggestions,
} from '@/lib/agent-chat-commands';

const POLL_INTERVAL_MS = 5_000;
const MAX_BODY_LENGTH = 5000;
const MAX_DISPLAY_NAME_LENGTH = 80;

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Avatar({ displayName, email }) {
  return (
    <span
      aria-hidden="true"
      title={displayName || email || 'Deleted admin'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColorFor(email)}`}
    >
      {initialsFor(displayName, email)}
    </span>
  );
}

export default function MessagesPanel({
  initialMessages = [],
  initialReads = [],
  initialTotal = 0,
  initialPendingDrafts = [],
  currentUserEmail,
  currentUserId,
  currentDisplayName = null,
  canModerate = false,
}) {
  // The API returns newest first; the board reads oldest at the top.
  const [messages, setMessages] = useState(() => [...initialMessages].reverse());
  const [reads, setReads] = useState(() => [...initialReads]);
  // The header count and the list share one source of truth: this total
  // state. The old server-rendered count went stale after a send (23
  // shown, then back to 22) because it never updated — now every poll
  // sets it from the API total and every send bumps it with the message.
  const [total, setTotal] = useState(initialTotal);
  // Real pending drafts (blog_posts status='draft') from the API, for
  // the digest. Refreshed on every poll, same as the messages.
  const [pendingDrafts, setPendingDrafts] = useState(initialPendingDrafts);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [displayNameInput, setDisplayNameInput] = useState(currentDisplayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const maxSeenIdRef = useRef(
    initialMessages.length > 0 ? Math.max(...initialMessages.map((m) => Number(m.id) || 0)) : 0,
  );

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, []);

  // Auto-scroll only while stuck to the bottom. When the user has scrolled
  // up, new messages count up in the pill instead of yanking the scroll.
  useEffect(() => {
    const maxId = messages.length > 0
      ? Math.max(...messages.map((message) => Number(message.id) || 0))
      : 0;
    if (stickToBottomRef.current) {
      scrollToBottom();
    } else if (maxId > maxSeenIdRef.current) {
      const newCount = countNewMessages(messages, maxSeenIdRef.current);
      if (newCount > 0) setUnreadCount((previous) => previous + newCount);
    }
    maxSeenIdRef.current = Math.max(maxSeenIdRef.current, maxId);
  }, [messages, scrollToBottom]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/admin/api/messages?pageSize=50', {
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (!Array.isArray(payload.messages)) return;
      const next = [...payload.messages].reverse();
      setMessages((previous) => {
        if (
          previous.length === next.length
          && previous.every((message, index) => message.id === next[index]?.id)
        ) {
          return previous;
        }
        return next;
      });
      if (Array.isArray(payload.reads)) setReads(payload.reads);
      // Count and drafts come from the same poll response as the list,
      // so all three update together and can never disagree.
      if (typeof payload.total === 'number') setTotal(payload.total);
      if (Array.isArray(payload.pendingDrafts)) setPendingDrafts(payload.pendingDrafts);
    } catch {
      // Polling is best-effort; a failed refresh leaves the current list.
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (stickToBottomRef.current) setUnreadCount(0);
  };

  const jumpToBottom = () => {
    stickToBottomRef.current = true;
    setUnreadCount(0);
    // Smooth scroll for the button tap (WhatsApp-style); the automatic
    // stick-to-bottom scroll stays instant so polling never animates.
    const list = listRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
      return;
    }
    scrollToBottom();
  };

  // --- Derived views ---------------------------------------------------------

  // Latest announcement pins to the banner; latest /score post feeds the
  // leaderboard panel. Both are computed from the loaded messages only.
  const latestAnnouncement = useMemo(
    () => latestAnnouncementFrom(messages),
    [messages],
  );
  const latestScorePost = useMemo(
    () => latestLeaderboardPostFrom(messages),
    [messages],
  );
  const leaderboardScores = useMemo(
    () => (latestScorePost ? parseLeaderboardText(latestScorePost.body) : null),
    [latestScorePost],
  );
  const digest = useMemo(
    () => computeDailyDigest(messages, undefined, { pendingDrafts }),
    [messages, pendingDrafts],
  );
  const groups = useMemo(() => groupMessagesForDisplay(messages), [messages]);

  // Everyone who has posted or opened the chat, for the "Seen by" lines.
  // Names use the roster fallback (Lane 1 / Lane 2 / Supervisor) so a
  // lane that never set a display name never shows a raw email.
  const participants = useMemo(() => {
    const byId = new Map();
    for (const read of reads) {
      byId.set(Number(read.adminId), {
        adminId: Number(read.adminId),
        displayName: displayNameFor({ displayName: read.displayName, email: read.email }),
        lastReadMessageId: Number(read.lastReadMessageId || 0),
      });
    }
    for (const message of messages) {
      if (message.senderAdminId == null) continue;
      const id = Number(message.senderAdminId);
      if (!byId.has(id)) {
        byId.set(id, {
          adminId: id,
          displayName: displayNameFor({ displayName: message.senderDisplayName, email: message.senderEmail }),
          lastReadMessageId: 0,
        });
      }
    }
    return [...byId.values()];
  }, [reads, messages]);

  // --- Display name ----------------------------------------------------------

  async function handleSaveDisplayName(event) {
    event.preventDefault();
    if (savingName) return;
    setSavingName(true);
    setNameError('');
    setNameSaved(false);
    try {
      const response = await fetch('/admin/api/display-name', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayNameInput }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNameError(payload.error || 'Failed to save display name.');
        return;
      }
      setDisplayName(payload.displayName ?? null);
      setNameSaved(true);
      // The next poll re-fetches sender names; update our own rows now.
      setMessages((previous) => previous.map((message) => (
        message.senderAdminId === currentUserId
          ? { ...message, senderDisplayName: payload.displayName ?? null, senderName: payload.displayName || message.senderEmail || 'Deleted admin' }
          : message
      )));
      setTimeout(() => setNameSaved(false), 2000);
    } catch {
      setNameError('Failed to save display name.');
    } finally {
      setSavingName(false);
    }
  }

  // --- Sending ---------------------------------------------------------------

  async function sendPost({ body: text, type = 'chat', thread = '' }) {
    setSending(true);
    setError('');
    try {
      const response = await fetch('/admin/api/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, type, thread }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Failed to send message.');
        return false;
      }
      setBody('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      stickToBottomRef.current = true;
      setUnreadCount(0);
      if (payload.message) {
        setMessages((previous) => [...previous, payload.message]);
        setTotal((previous) => previous + 1);
      } else {
        await refresh();
      }
      return true;
    } catch {
      setError('Failed to send message.');
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;

    const command = parseSlashCommand(text);
    if (command) {
      if (command.name === 'help') {
        setShowHelp(true);
        setBody('');
        return;
      }
      if (command.name === 'assign') {
        if (!canModerate) {
          setError('Only the supervisor or the owner can use /assign.');
          return;
        }
        setShowHelp(false);
        setBody(assignmentTemplate());
        inputRef.current?.focus();
        return;
      }
      if (command.name === 'announce') {
        if (!canModerate) {
          setError('Only the supervisor or the owner can post announcements.');
          return;
        }
        if (!command.args) {
          setError('Usage: /announce <text>');
          return;
        }
        await sendPost({ body: command.args, type: 'announcement' });
        return;
      }
      if (command.name === 'rule') {
        if (!canModerate) {
          setError('Only the supervisor or the owner can post rules.');
          return;
        }
        if (!command.args) {
          setError('Usage: /rule <text>');
          return;
        }
        await sendPost({ body: command.args, type: 'rule' });
        return;
      }
      if (command.name === 'score') {
        if (!canModerate) {
          setError('Only the supervisor or the owner can post scores.');
          return;
        }
        if (!command.args) {
          setError('Usage: /score Lane 1: <points> (Rank <n>) | Lane 2: <points> (Rank <n>)');
          return;
        }
        await sendPost({
          body: `${LEADERBOARD_PREFIX} ${command.args}`,
          type: 'feedback',
          thread: 'leaderboard',
        });
        return;
      }
      if (command.name === 'status') {
        await sendPost({
          body: formatStatusLine(
            displayNameFor({ displayName, email: currentUserEmail }),
            command.args,
          ),
          type: 'chat',
        });
        return;
      }
      if (command.name === 'unknown') {
        setError(
          command.command
            ? `Unknown command: /${command.command}. Type /help for a list of commands.`
            : 'Unknown command. Type /help for a list of commands.',
        );
        return;
      }
    }

    // A supervisor posting the assignment template sends it as an
    // assignment (the marker line is the signal); everyone else posts
    // plain chat. The server still enforces the type rule.
    const type = canModerate && text.startsWith(ASSIGNMENT_MARKER) ? 'assignment' : 'chat';
    await sendPost({ body: text, type });
  }

  // --- Composer helpers ------------------------------------------------------

  // Slash-command autocomplete: typing "/" at the start of the input
  // (before any space) lists matching commands.
  const slashPrefix = body.startsWith('/') && !body.includes(' ') ? body.slice(1) : null;
  const suggestions = slashPrefix === null ? [] : slashCommandSuggestions(slashPrefix);

  function chooseCommand(command) {
    if (command.supervisorOnly && !canModerate) {
      setError(`Only the supervisor or the owner can use /${command.name}.`);
      return;
    }
    if (command.name === 'help') {
      setShowHelp(true);
      setBody('');
      return;
    }
    if (command.name === 'assign') {
      setBody(assignmentTemplate());
      inputRef.current?.focus();
      return;
    }
    setBody(`/${command.name} `);
    setSuggestionIndex(0);
    inputRef.current?.focus();
  }

  function resizeInput() {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  function handleBodyChange(event) {
    setBody(event.target.value);
    setSuggestionIndex(0);
    resizeInput();
  }

  function handleKeyDown(event) {
    // Ctrl+Enter (or Cmd+Enter) sends; plain Enter adds a newline.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSubmit(event);
      return;
    }
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSuggestionIndex((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        chooseCommand(suggestions[suggestionIndex] ?? suggestions[0]);
        return;
      }
      if (event.key === 'Escape') {
        setSuggestionIndex(0);
        setBody('');
      }
    }
  }

  function toggleExpanded(id) {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyMessage(message) {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedId(message.id);
      setTimeout(() => {
        setCopiedId((current) => (current === message.id ? null : current));
      }, 1500);
    } catch {
      // Clipboard unavailable (old browser / no permission) — ignore.
    }
  }

  // --- Render ----------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      {/* Chat column. The count lives here, driven by the same total
          state as the list, so the two can never disagree. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <p className="pb-3 text-sm text-[#646970]">
          {total} {total === 1 ? 'message' : 'messages'}
        </p>
        {/* The card has a DEFINITE height (not just a max-height cap):
            100dvh minus the admin header + page padding + count line on
            mobile, the same minus less on desktop, capped at 760px.
            Without a definite height here, the list below relied on
            h-full (a percentage) resolving through a flex chain anchored
            only by min-height — when that failed, the list grew to its
            content height, the card's overflow-hidden clipped it, and
            nothing below the fold could be reached at all. */}
        <div className="flex h-[calc(100dvh-11rem)] min-h-0 shrink-0 flex-col overflow-hidden rounded border border-[#c3c4c7] bg-white shadow-sm sm:h-[calc(100dvh-9rem)] sm:max-h-[760px]">
          {/* Display name — each admin sets only their own name; the email
              stays the identity underneath. */}
      <form
        onSubmit={handleSaveDisplayName}
        className="flex flex-wrap items-center gap-2 border-b border-[#dcdcde] px-4 py-3"
      >
        <label htmlFor="display-name" className="text-[13px] font-medium text-[#1d2327]">
          My display name
        </label>
        <input
          id="display-name"
          type="text"
          value={displayNameInput}
          onChange={(event) => setDisplayNameInput(event.target.value)}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          placeholder={currentUserEmail}
          className="min-w-0 flex-1 rounded border border-[#8c8f94] px-2 py-1.5 text-sm text-[#1d2327] outline-none focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/30"
        />
        <button
          type="submit"
          disabled={savingName}
          className="inline-flex h-8 items-center justify-center rounded bg-[#2271b1] px-3 text-[13px] font-semibold text-white transition hover:bg-[#135e96] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingName ? 'Saving…' : 'Save'}
        </button>
        {nameSaved && <span className="text-xs text-green-700">Saved</span>}
        {nameError && (
          <span className="text-xs text-red-700" role="alert">{nameError}</span>
        )}
      </form>

      {/* Pinned announcement — the latest announcement, always visible. */}
      {latestAnnouncement && (
        <div className="border-b border-purple-200 bg-purple-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            Pinned announcement
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-[#1d2327]">
            {latestAnnouncement.body}
          </p>
          <p className="mt-1 text-[11px] text-[#646970]">
            {latestAnnouncement.senderName} · {formatTime(latestAnnouncement.createdAt)}
          </p>
        </div>
      )}

      {/* Message list — the scroll area. The list is absolutely
          positioned to fill its wrapper (no h-full percentage: the old
          percentage height failed to resolve through the min-height
          flex chain, so the list grew to content height and the card
          clipped it). overscroll-contain keeps list scrolling from
          chaining into page scroll, WhatsApp-style. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto overscroll-contain px-4 py-4"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-[#646970]">
              No messages yet. The supervisor posts the day&apos;s assignments here,
              and each lane replies when it starts work.
            </p>
          )}
          <div className="space-y-4">
            {groups.map((entry) => {
              if (entry.kind === 'date') {
                return (
                  <div key={entry.key} className="flex justify-center py-1">
                    <span className="rounded-full bg-[#e5e5e5] px-3 py-1 text-[11px] font-medium text-[#646970]">
                      {entry.label}
                    </span>
                  </div>
                );
              }
              return (
                <div key={entry.key} className="space-y-1.5">
                  {entry.messages.map((message, index) => {
                    const isOwn = message.senderAdminId === currentUserId
                      || message.senderEmail === currentUserEmail;
                    const isFirst = index === 0;
                    const collapsed = shouldCollapseMessage(message.body)
                      && !expandedIds.has(message.id);
                    const meta = MESSAGE_TYPE_META[displayTypeFor(message)] || MESSAGE_TYPE_META.chat;
                    const receipt = readReceiptLine(message, participants, currentUserId);
                    return (
                      <div
                        key={message.id}
                        className={`flex items-start gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isOwn && (isFirst
                          ? <Avatar displayName={message.senderDisplayName} email={message.senderEmail} />
                          : <span className="w-8 shrink-0" aria-hidden="true" />)}
                        <div
                          className={`max-w-[80%] rounded-lg border px-3 py-2 ${
                            isOwn
                              ? 'border-[#2271b1] bg-[#2271b1] text-white'
                              : bubbleClassFor(message.senderEmail)
                          }`}
                        >
                          {isFirst && (
                            <p className={`flex flex-wrap items-center gap-1.5 text-xs font-semibold ${isOwn ? 'text-[#bfe0f5]' : 'text-[#646970]'}`}>
                              <span>{message.senderName || 'Deleted admin'}</span>
                              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${meta.badgeClass}`}>
                                {meta.label}
                              </span>
                            </p>
                          )}
                          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-snug">
                            {collapsed ? collapsedPreview(message.body) : message.body}
                          </p>
                          {shouldCollapseMessage(message.body) && (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(message.id)}
                              className={`mt-1 text-[11px] font-semibold underline ${isOwn ? 'text-[#bfe0f5]' : 'text-[#2271b1]'}`}
                            >
                              {collapsed ? 'Show more' : 'Show less'}
                            </button>
                          )}
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => copyMessage(message)}
                              className={`text-[11px] underline opacity-70 hover:opacity-100 ${isOwn ? 'text-[#bfe0f5]' : 'text-[#646970]'}`}
                            >
                              {copiedId === message.id ? 'Copied ✓' : 'Copy'}
                            </button>
                            <span className={`text-[11px] ${isOwn ? 'text-[#bfe0f5]' : 'text-[#8c8f94]'}`}>
                              {formatTime(message.createdAt)}
                            </span>
                          </div>
                          {receipt && (
                            <p className={`mt-0.5 text-right text-[11px] ${isOwn ? 'text-[#bfe0f5]' : 'text-[#8c8f94]'}`}>
                              {receipt}
                            </p>
                          )}
                        </div>
                        {isOwn && (isFirst
                          ? <Avatar displayName={message.senderDisplayName} email={message.senderEmail} />
                          : <span className="w-8 shrink-0" aria-hidden="true" />)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#2271b1] px-4 py-2 text-[13px] font-semibold text-white shadow-lg transition hover:bg-[#135e96]"
          >
            {unreadCount} new {unreadCount === 1 ? 'message' : 'messages'} ↓
          </button>
        )}
      </div>

      {/* Composer — WhatsApp-style: one rounded pill, the send button
          inside the write box at the bottom-right, always visible at
          the bottom of the card (it is a flex child, not a scroller).
          No footer row: polling runs every 5 seconds without a visible
          note. Ctrl+Enter sends; plain Enter adds a newline. */}
      <form onSubmit={handleSubmit} className="sticky bottom-0 border-t border-[#dcdcde] bg-white px-3 py-2">
        {error && (
          <p className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {showHelp && (
          <div className="mb-2 rounded border border-[#dcdcde] bg-[#f6f7f7] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-[#1d2327]">Slash commands</p>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-xs text-[#646970] underline"
              >
                Close
              </button>
            </div>
            <ul className="mt-1 space-y-1">
              {[
                { usage: '/announce <text>', text: 'Post a pinned announcement (Supervisor / owner only).' },
                { usage: '/assign', text: 'Open the keyword assignment format to fill in.' },
                { usage: '/rule <text>', text: 'Post a rule for the lanes (Supervisor / owner only).' },
                { usage: '/score Lane 1: <points> (Rank <n>) | Lane 2: <points> (Rank <n>)', text: 'Post the latest leaderboard scores (Supervisor / owner only).' },
                { usage: '/status <text>', text: 'Post a heartbeat / status line.' },
                { usage: '/help', text: 'List all slash commands.' },
              ].map((item) => (
                <li key={item.usage} className="text-[13px] text-[#1d2327]">
                  <span className="font-mono text-xs font-semibold">{item.usage}</span>
                  {' — '}
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {suggestions.length > 0 && (
          <ul className="mb-2 overflow-hidden rounded border border-[#dcdcde] bg-white shadow-sm" role="listbox">
            {suggestions.map((command, index) => (
              <li key={command.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === suggestionIndex}
                  onClick={() => chooseCommand(command)}
                  onMouseEnter={() => setSuggestionIndex(index)}
                  className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-[13px] ${
                    index === suggestionIndex ? 'bg-[#e5f1fa] text-[#1d2327]' : 'text-[#1d2327]'
                  }`}
                >
                  <span className="font-mono text-xs font-semibold">/{command.name}</span>
                  <span className="text-[#646970]">{command.description}</span>
                  {command.supervisorOnly && (
                    <span className="ml-auto shrink-0 text-[11px] text-[#646970]">Supervisor only</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* WhatsApp-style: the send button sits INSIDE the write box,
            bottom-right, so the composer is one rounded pill. The
            textarea keeps right padding so text never runs under it. */}
        <div className="relative flex-1">
          <label htmlFor="agent-message-body" className="sr-only">
            Write a message
          </label>
          <textarea
            ref={inputRef}
            id="agent-message-body"
            value={body}
            onChange={handleBodyChange}
            onKeyDown={handleKeyDown}
            maxLength={MAX_BODY_LENGTH}
            rows={1}
            placeholder={canModerate ? 'Write a message… (type / for commands)' : 'Write a message…'}
            className="min-h-[44px] max-h-[120px] w-full resize-none overflow-y-auto rounded-3xl border border-[#8c8f94] py-2.5 pl-4 pr-12 text-sm text-[#1d2327] outline-none focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/30"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            aria-label="Send message"
            className="absolute bottom-[6px] right-[6px] flex h-8 w-8 items-center justify-center rounded-full bg-[#2271b1] text-white transition hover:bg-[#135e96] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 20.5 21 12 3 3.5l-.01 7.05L14 12 2.99 13.45 3 20.5Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </form>
        </div>
      </div>

      {/* Side panel — digest + leaderboard. On mobile it stacks below
          the chat, so the chat keeps its full-height sticky composer. */}
      <aside className="w-full shrink-0 lg:w-72">
        <div className="space-y-4">
          {/* Daily digest — the drafts are the REAL blog drafts
              (blog_posts status='draft') from the API, listed by title
              with a link to each draft in the admin panel. */}
          <div className="rounded border border-[#c3c4c7] bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#646970]">
              Today&apos;s digest
            </p>
            <ul className="mt-1 space-y-0.5 text-[13px] text-[#1d2327]">
              <li>Assignments today: {digest.assignmentsToday.length}</li>
              <li>Open blockages: {digest.blockagesOpen.length}</li>
              <li>Drafts pending owner verification: {pendingDrafts.length}</li>
            </ul>
            {pendingDrafts.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {pendingDrafts.map((draft) => (
                  <li key={draft.id}>
                    <a
                      href={`/admin/blog/${draft.slug}`}
                      className="text-[13px] font-medium text-[#2271b1] hover:underline"
                    >
                      {draft.title || '(Untitled draft)'}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-[#646970]">No drafts pending verification.</p>
            )}
          </div>

          {/* Leaderboard — the latest /score post, parsed; never invented. */}
          <div className="rounded border border-[#c3c4c7] bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#646970]">
              Leaderboard
            </p>
            {leaderboardScores ? (
              <p className="mt-1 text-[13px] text-[#1d2327]">
                {leaderboardScores.lane1 && (
                  <span>
                    Lane 1: {leaderboardScores.lane1.points} points
                    {leaderboardScores.lane1.rank ? ` (Rank ${leaderboardScores.lane1.rank})` : ''}
                  </span>
                )}
                {leaderboardScores.lane1 && leaderboardScores.lane2 && <span className="mx-2 text-[#8c8f94]">|</span>}
                {leaderboardScores.lane2 && (
                  <span>
                    Lane 2: {leaderboardScores.lane2.points} points
                    {leaderboardScores.lane2.rank ? ` (Rank ${leaderboardScores.lane2.rank})` : ''}
                  </span>
                )}
              </p>
            ) : latestScorePost ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-[#1d2327]">
                {latestScorePost.body.replace(LEADERBOARD_PREFIX, '').trim()}
              </p>
            ) : (
              <p className="mt-1 text-[13px] text-[#646970]">No scores posted yet</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
