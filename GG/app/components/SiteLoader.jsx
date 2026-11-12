'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { LOADER_LOGO_DATA_URI } from '@/lib/brand-logos';
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
  // Server aur client dono hamesha loader dikhate hue render karte hain.
  // sessionStorage ko render ke waqt NAHIN padhte — warna server (loader
  // dikhata hai) aur client (repeat load par loader chhupata hai) ka HTML
  // alag hota hai, hydration mismatch hota hai, React page ko kabhi take
  // over nahi karta, aur loader hamesha ke liye atka rehta hai. Isi liye
  // reload par page atak jata tha. Session ka faisla sirf effect mein hota
  // hai, hydration ke baad.
  const [visible, setVisible] = useState(true);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Session ka faisla yahin hota hai — hydration ke baad, render mein nahi.
    let alreadyShown = false;
    try {
      alreadyShown = window.sessionStorage.getItem('aq-loader-shown') === '1';
      window.sessionStorage.setItem('aq-loader-shown', '1');
    } catch {
      // sessionStorage unavailable — the splash still hides via the timers below.
    }
    // Is session mein splash ek dafa dikh chuka hai — foran hatao, timer ka wait nahi.
    if (alreadyShown) {
      setGone(true);
      return;
    }
    // The splash is branding, NOT a "page fully loaded" gate: it must never
    // wait for the window `load` event. On a slow connection hydration itself
    // is delayed by the JS payload, and `load` waits for every image and
    // third-party script, so the loader used to sit for many seconds. Hide it
    // once the minimum time has elapsed after hydration, whatever the page
    // is still loading.
    let minDone = false;
    let finished = false;

    const finish = () => {
      if (finished || !minDone) return;
      finished = true;
      setVisible(false);
      window.setTimeout(() => setGone(true), 600); // fade-out ke baad DOM se hatao
    };

    const minTimer = window.setTimeout(() => {
      minDone = true;
      finish();
    }, 800);

    // Safety: loader kabhi bhi 2.5 second se zyada na ruke.
    const maxTimer = window.setTimeout(() => {
      minDone = true;
      finish();
    }, 2500);

    return () => {
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
            // 256px logo inlined as a data URI (see src/lib/brand-logos.js):
            // no 33 KB 512px fetch. No `priority` here on purpose — a data
            // URI is already inline, and priority would make ReactDOM.preload
            // hoist a <link> duplicating the whole base64 string.
            src={LOADER_LOGO_DATA_URI}
            alt="AQPrompts"
            width={128}
            height={128}
            className="aq-loader__logo"
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
