'use client';

import React, { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Mail, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hasConsent } from '@/lib/consent';

const SUBSCRIBED_KEY = 'aq_subscribed';

function hasSubscribedAccess() {
  try {
    return window.localStorage.getItem(SUBSCRIBED_KEY) === 'true';
  } catch {
    return false;
  }
}

function setSubscribedAccess() {
  try {
    window.localStorage.setItem(SUBSCRIBED_KEY, 'true');
  } catch {
    // The subscription still succeeds even if localStorage is unavailable.
  }
}

function trackNewsletterEvent(name, detail = {}) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(`aq:${name}`, { detail }));

  if (hasConsent('analytics') && Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: `aq_${name}`, ...detail });
  }
}

const NewsletterSignup = ({ variant = 'inline' }) => {
  const { toast } = useToast();
  const emailInputId = useId();
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [justSubscribed, setJustSubscribed] = useState(false);

  useEffect(() => {
    setIsSubscribed(hasSubscribedAccess());
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setEmailError('Enter your email address.');
      toast({
        title: 'Email Required',
        description: 'Please enter your email address.',
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setEmailError('');
    trackNewsletterEvent('newsletter_submit', { source: `newsletter_${variant}` });

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          source: `newsletter_${variant}`,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Could not subscribe right now.');
      }

      setSubscribedAccess();
      setIsSubscribed(true);
      setJustSubscribed(true);
      trackNewsletterEvent('newsletter_subscribed', { source: `newsletter_${variant}` });
      toast({
        title: 'You are subscribed',
        description: 'Fresh AI prompts will land in your inbox soon.',
      });
      setEmail('');
    } catch (error) {
      trackNewsletterEvent('newsletter_error', { source: `newsletter_${variant}` });
      const message = error instanceof Error ? error.message : 'Please try again in a moment.';
      setEmailError(message);
      toast({
        title: 'Signup Failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  if (isSubscribed && variant === 'inline') {
    return (
      <section id="newsletter" className="bg-white py-12 sm:py-16 dark:bg-[#0a0a0f]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl rounded-[1.5rem] border border-emerald-500/20 bg-emerald-50 px-5 py-8 text-center shadow-[0_24px_80px_rgba(16,185,129,0.12)] sm:px-8 sm:py-10 dark:border-emerald-400/20 dark:bg-emerald-950/20">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-black tracking-normal text-[var(--text-primary)] sm:text-3xl">
              {justSubscribed ? "You're in. Your next prompts are on the way." : 'You are already on the list'}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)]">
              {justSubscribed
                ? 'Fresh copy-paste prompts delivered to your inbox.'
                : 'Copy prompts instantly and watch your inbox for fresh weekly AI prompt drops.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (variant === 'inline') {
    return (
      <section id="newsletter" className="bg-white py-12 sm:py-16 dark:bg-[#0a0a0f]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl rounded-[1.5rem] border border-[#ff6b35]/20 bg-[#fff7f3] px-5 py-8 text-center shadow-[0_24px_80px_rgba(255,107,53,0.14)] sm:px-8 sm:py-10 dark:border-[#ff6b35]/30 dark:bg-[#15100e]">
            <div className="mb-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#ff6b3520] text-[#c2410c]">
                <Mail className="h-8 w-8" />
              </div>
              <h2 className="mb-4 text-2xl font-black tracking-normal text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                Get 5 Free AI Prompts Every Week {String.fromCodePoint(0x1f3a8)}
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-[var(--text-secondary)]">
                Get weekly prompts for portraits, fashion edits, and scroll-stopping visuals.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mx-auto max-w-md">
              <label htmlFor={emailInputId} className="mb-2 block text-left text-sm font-bold text-[var(--text-primary)]">
                Email address
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id={emailInputId}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? `${emailInputId}-error` : undefined}
                  className="h-12 flex-1 text-[var(--text-primary)] focus-visible:ring-[#ff6b35]"
                />
                <Button
                  type="submit"
                  size="lg"
                  className="h-12 whitespace-nowrap rounded-full bg-[#ff6b35] px-8 font-semibold text-[#111118] hover:bg-[#e85d28] disabled:opacity-50"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Join Free
                </Button>
              </div>
              {emailError ? (
                <p id={`${emailInputId}-error`} className="mt-2 text-left text-sm font-semibold text-red-700" role="alert">
                  {emailError}
                </p>
              ) : null}
            </form>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-6 dark:border-white/10 dark:bg-[#111118]">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#ff6b3520] text-[#c2410c]">
          <Mail className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
          {isSubscribed ? 'You are already subscribed' : `Get 5 Free AI Prompts Every Week ${String.fromCodePoint(0x1f3a8)}`}
        </h3>
      </div>

      {isSubscribed ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Fresh AI prompts are headed to your inbox. Copy prompts instantly anytime.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            Get weekly prompts. No spam, just new prompts.
          </p>

          <form onSubmit={handleSubmit}>
            <label htmlFor={emailInputId} className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">
              Email address
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={emailInputId}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                }}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? `${emailInputId}-error` : undefined}
                className="h-10 flex-1 text-sm text-[var(--text-primary)] focus-visible:ring-[#ff6b35]"
              />
              <Button
                type="submit"
                size="sm"
                className="h-10 whitespace-nowrap rounded-full bg-[#ff6b35] px-4 text-sm font-semibold text-[#111118] hover:bg-[#e85d28] disabled:opacity-50"
              >
                Get Free Prompts
              </Button>
            </div>
            {emailError ? (
              <p id={`${emailInputId}-error`} className="mt-2 text-sm font-semibold text-red-700" role="alert">
                {emailError}
              </p>
            ) : null}
          </form>
        </>
      )}
    </div>
  );
};

export default NewsletterSignup;
