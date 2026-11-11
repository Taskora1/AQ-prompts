'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

const OTP_LENGTH = 6;
const COOLDOWN_SECONDS = 60;

function OtpVerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [resent, setResent] = useState(false);
  const inputRefs = useRef([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleChange = useCallback((index, value) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError('');

    // Auto-advance
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [otp]);

  const handleKeyDown = useCallback((index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [otp]);

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const newOtp = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    setError('');
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/admin/otp-verify/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: code, email }),
      });

      const data = await res.json();

      if (data.success && data.token) {
        router.push(`/admin/reset-password?token=${encodeURIComponent(data.token)}`);
      } else {
        setError(data.error || 'Invalid or expired code. Please try again.');
        setOtp(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [otp, email, router]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0) return;

    setCooldown(COOLDOWN_SECONDS);
    setError('');
    setResent(false);

    try {
      const formData = new FormData();
      formData.set('email', email);
      const res = await fetch('/admin/forgot-password/submit', {
        method: 'POST',
        body: formData,
      });

      // The submit route redirects — just show success
      setResent(true);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch {
      setError('Could not resend code. Please try again.');
    }
  }, [cooldown, email]);

  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 5)) + c)
    : 'your email';

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-12 text-[#111118]"
    >
      <section className="w-full max-w-md rounded-2xl border border-[#dcdcde] bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.12)] sm:p-9">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff6b35] text-sm font-black text-white">
            AQ
          </span>
          <div>
            <p className="text-sm font-semibold text-[#50575e]">AQPrompts</p>
            <h1 className="text-2xl font-bold tracking-tight">Verify code</h1>
          </div>
        </div>

        <p className="mt-6 text-sm leading-6 text-[#646970]">
          Enter the 6-digit verification code we sent to{' '}
          <span className="font-semibold text-[#111827]">{maskedEmail}</span>.
        </p>

        {error ? (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        {resent ? (
          <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            A new verification code has been sent.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* OTP Input */}
          <div>
            <label className="block text-sm font-semibold text-[#1d2327]">
              Verification code
            </label>
            <div className="mt-2 flex justify-between gap-2">
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  autoComplete="one-time-code"
                  value={otp[i]}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  className="h-12 w-full rounded-lg border border-[#8c8f94] bg-white text-center text-lg font-bold outline-none transition focus:border-[#2271b1] focus:ring-2 focus:ring-[#2271b1]/20"
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || otp.join('').length !== OTP_LENGTH}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#2271b1] px-5 text-sm font-semibold text-white transition hover:bg-[#135e96] focus:outline-none focus:ring-2 focus:ring-[#2271b1] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify code'}
          </button>
        </form>

        {/* Resend */}
        <div className="mt-5 text-center">
          {cooldown > 0 ? (
            <p className="text-sm text-[#6b7280]">
              Resend code in {cooldown}s
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="text-sm font-semibold text-[#2271b1] hover:underline"
            >
              Didn&apos;t receive the code? Resend
            </button>
          )}
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/admin/forgot-password"
            className="text-sm font-semibold text-[#2271b1] hover:underline"
          >
            ← Back to forgot password
          </Link>
        </div>
      </section>
    </main>
  );
}

function LoadingFallback() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-12 text-[#111118]"
    >
      <section className="w-full max-w-md rounded-2xl border border-[#dcdcde] bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.12)] sm:p-9">
        <div className="text-center">
          <p className="text-sm text-[#6b7280]">Loading...</p>
        </div>
      </section>
    </main>
  );
}

export default function OtpVerifyPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <OtpVerifyForm />
    </Suspense>
  );
}
