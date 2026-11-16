'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 5_000;
const MAX_BODY_LENGTH = 5000;

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

export default function MessagesPanel({ initialMessages = [], currentUserEmail, currentUserId }) {
  // The API returns newest first; the board reads oldest at the top.
  const [messages, setMessages] = useState(() => [...initialMessages].reverse());
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom();
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
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/admin/api/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Failed to send message.');
        return;
      }
      setBody('');
      stickToBottomRef.current = true;
      if (payload.message) {
        setMessages((previous) => [...previous, payload.message]);
      } else {
        await refresh();
      }
    } catch {
      setError('Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded border border-[#c3c4c7] bg-white shadow-sm">
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="h-[480px] space-y-4 overflow-y-auto px-5 py-5"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-[#646970]">
            No messages yet. The supervisor posts the day&apos;s assignments here,
            and each lane replies when it starts work.
          </p>
        )}
        {messages.map((message) => {
          const isOwn = message.senderAdminId === currentUserId
            || message.senderEmail === currentUserEmail;
          return (
            <div
              key={message.id}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg border px-4 py-3 ${
                  isOwn
                    ? 'border-[#2271b1] bg-[#2271b1] text-white'
                    : 'border-[#dcdcde] bg-[#f6f7f7] text-[#1d2327]'
                }`}
              >
                <p className={`text-xs font-semibold ${isOwn ? 'text-[#bfe0f5]' : 'text-[#646970]'}`}>
                  {message.senderName || 'Deleted admin'}
                  {message.readAt ? ' · seen' : ''}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p>
                <p className={`mt-1 text-right text-[11px] ${isOwn ? 'text-[#bfe0f5]' : 'text-[#8c8f94]'}`}>
                  {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[#dcdcde] bg-white px-5 py-4">
        {error && (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <label htmlFor="agent-message-body" className="sr-only">
          Write a message
        </label>
        <textarea
          id="agent-message-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_BODY_LENGTH}
          rows={3}
          placeholder="Write a message to the agents…"
          className="w-full resize-y rounded border border-[#8c8f94] px-3 py-2 text-sm text-[#1d2327] outline-none focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/30"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-[#646970]">
            {body.length}/{MAX_BODY_LENGTH} · Refreshes every 5 seconds.
          </p>
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="inline-flex h-10 items-center justify-center rounded bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
