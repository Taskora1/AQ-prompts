'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import './site-loader.css';

/**
 * SiteLoader — AQPrompts website loading animation (modern look).
 *
 * Kaale radial-gradient background par AQPrompts logo (transparent PNG)
 * beech mein, uske gird ek patli gradient arc ghoomti hai (orange se
 * amber tak), logo ke peeche halki orange glow, neeche ek slim gradient
 * progress bar aur "Loading" text. Page load hote hi loader smooth
 * fade ho kar gayab ho jata hai.
 *
 * Setup:
 *  1. Use the AQPrompts logo in the repo's public/ folder.
 *  2. Copy this file to app/components/SiteLoader.jsx
 *     and site-loader.css to app/components/site-loader.css
 *  3. In app/layout.tsx, inside <body>, render <SiteLoader /> before {children}.
 */
export default function SiteLoader() {
  // Show the full-screen splash only on the very first load of a browser
  // session. Client-side navigations (and any remount) skip it entirely.
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.sessionStorage.getItem('aq-loader-shown') !== '1';
    } catch {
      return true;
    }
  });
  const [gone, setGone] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem('aq-loader-shown') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Remember that the splash has shown, so it never appears again this session.
    try {
      window.sessionStorage.setItem('aq-loader-shown', '1');
    } catch {
      // sessionStorage unavailable — the splash still hides via the timers below.
    }
    let loaded = document.readyState === 'complete';
    let minDone = false;
    let finished = false;

    const finish = () => {
      if (finished || !loaded || !minDone) return;
      finished = true;
      setVisible(false);
      window.setTimeout(() => setGone(true), 600); // fade-out ke baad DOM se hatao
    };

    const onLoad = () => {
      loaded = true;
      finish();
    };

    const minTimer = window.setTimeout(() => {
      minDone = true;
      finish();
    }, 1200);

    // Safety: loader kabhi bhi 4 second se zyada na ruke.
    const maxTimer = window.setTimeout(() => {
      loaded = true;
      minDone = true;
      finish();
    }, 4000);

    window.addEventListener('load', onLoad);
    return () => {
      window.removeEventListener('load', onLoad);
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className={`aq-loader${visible ? '' : ' aq-loader--hidden'}`}
      aria-hidden="true"
    >
      <div className="aq-loader__column">
        <div className="aq-loader__wrap">
          <span className="aq-loader__glow" />
          <svg className="aq-loader__ring" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="aq-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff5c0a" />
                <stop offset="100%" stopColor="#ffb347" />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1.5"
            />
            <circle
              className="aq-loader__arc"
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="url(#aq-ring-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="90 212"
            />
          </svg>
          <Image
            src="/aqprompts-logo.webp"
            alt="AQPrompts"
            width={128}
            height={128}
            className="aq-loader__logo"
            priority
          />
        </div>
        <div className="aq-loader__bar">
          <span className="aq-loader__bar-fill" />
        </div>
        <p className="aq-loader__text">
          Loading
          <span className="aq-loader__dot">.</span>
          <span className="aq-loader__dot">.</span>
          <span className="aq-loader__dot">.</span>
        </p>
      </div>
    </div>
  );
}
