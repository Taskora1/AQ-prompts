'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, Mail } from 'lucide-react';

export default function AccountSignInForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Could not send your sign-in link.');
      }

      setStatus('sent');
    } catch (error) {
      setMessage(error.message || 'Could not send your sign-in link.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
          <div>
            <h2 className="font-black text-emerald-950 dark:text-emerald-100">Check your email</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-100/80">
              We sent a one-time sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 text-left">
      <label htmlFor="account-email" className="text-sm font-black text-slate-800 dark:text-slate-100">
        Checkout email address
      </label>
      <div className="relative mt-2">
        <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id="account-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="h-12 w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-base font-semibold text-slate-950 outline-none transition focus:border-[#ff6b35] focus:ring-4 focus:ring-[#ff6b35]/10 dark:border-white/10 dark:bg-[#0a0a0f] dark:text-white"
        />
      </div>
      {message ? <p className="mt-3 text-sm font-bold text-red-600 dark:text-red-300">{message}</p> : null}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="btn-premium mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#ff6b35] px-6 text-sm font-black text-white transition hover:bg-[#e85d28] disabled:cursor-wait disabled:opacity-70"
      >
        {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        {status === 'loading' ? 'Sending secure link…' : 'Email me a sign-in link'}
      </button>
    </form>
  );
}
