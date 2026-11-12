import { Inter } from 'next/font/google';
import Script from 'next/script';
import SiteLoader from './components/SiteLoader';
import ChunkReloadGuard from '@/components/ChunkReloadGuard';
import CookieConsentManager from '@/components/CookieConsentManager';
import DeferredSiteLoaders from '@/components/DeferredSiteLoaders';
import DomErrorSuppressor from '@/components/DomErrorSuppressor';
import FloatingWhatsAppChannel from '@/components/FloatingWhatsAppChannel';
import { isPreviewDeployment } from '@/lib/deployment-env';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  fallback: ['Arial', 'Helvetica', 'sans-serif'],
  adjustFontFallback: true,
});

const siteUrl = process.env.SITE_URL || 'https://www.aqprompts.com';
const siteName = process.env.SITE_NAME || 'AQPrompts';
const previewDeployment = isPreviewDeployment();
const vercelDeployment = process.env.VERCEL === '1';
const gaId = previewDeployment ? undefined : process.env.NEXT_PUBLIC_GA_ID;
const clarityId = previewDeployment ? undefined : process.env.NEXT_PUBLIC_CLARITY_ID;
const gscVerify = process.env.NEXT_PUBLIC_GSC_VERIFY;
const bingVerify = process.env.NEXT_PUBLIC_BING_VERIFY;
const pinterestVerify = process.env.NEXT_PUBLIC_PINTEREST_VERIFY;
const defaultDescription =
  'Free copy-paste AI image prompts for Instagram creators, portraits, fashion, and cinematic visuals. Midjourney, ChatGPT, Leonardo AI, Gemini, and more.';
// Loader styles, inlined into <head> so the splash screen renders before
// the external stylesheet loads. This is the whole of the old
// app/components/site-loader.css (minified, 2.0 KB) — the separate file was
// removed so the loader costs zero render-blocking requests (PageSpeed:
// the 4.2 KB loader stylesheet was one of the two render-blocking CSS
// files, ~160ms). If the loader design changes, update this string and
// keep it in sync with the class names in app/components/SiteLoader.jsx.
// The Inter @font-face rules that used to share that file still come from
// next/font and are unaffected.
const LOADER_INLINE_CSS =
  '.aq-loader{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#161616 0,#000000 70%);transition:opacity .55s ease,transform .55s ease}.aq-loader--hidden{opacity:0;pointer-events:none;transform:scale(1.03)}.aq-loader__column{display:flex;flex-direction:column;align-items:center}.aq-loader__wrap{position:relative;width:168px;height:168px;display:flex;align-items:center;justify-content:center;animation:aq-enter .7s cubic-bezier(.22,1,.36,1) both}.aq-loader__glow{position:absolute;width:250px;height:250px;border-radius:50%;background:radial-gradient(circle,rgba(255,92,10,.22),transparent 65%);filter:blur(12px);animation:aq-glow 2.2s ease-in-out infinite}.aq-loader__logo{width:128px;height:128px;border-radius:50%;box-shadow:0 0 42px rgba(255,92,10,.28);animation:aq-breathe 2.2s ease-in-out infinite}.aq-loader__ring{position:absolute;inset:0;width:168px;height:168px;transform:rotate(-90deg);animation:aq-spin 1.2s cubic-bezier(.65,.05,.36,1) infinite}.aq-loader__bar{width:168px;height:3px;margin-top:30px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}.aq-loader__bar-fill{display:block;height:100%;width:42%;border-radius:99px;background:linear-gradient(90deg,#ff5c0a,#ffb347);animation:aq-slide 1.4s ease-in-out infinite}.aq-loader__text{margin-top:18px;color:rgba(255,255,255,.65);font-size:11px;font-weight:500;letter-spacing:.4em;text-transform:uppercase;text-align:center}.aq-loader__dot{animation:aq-dot 1.4s ease-in-out infinite}.aq-loader__dot:nth-child(2){animation-delay:.2s}.aq-loader__dot:nth-child(3){animation-delay:.4s}@keyframes aq-spin{to{transform:rotate(270deg)}}@keyframes aq-enter{0%{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}@keyframes aq-breathe{0%,to{transform:scale(1)}50%{transform:scale(1.03)}}@keyframes aq-glow{0%,to{opacity:.7}50%{opacity:1}}@keyframes aq-slide{0%{transform:translateX(-110%)}to{transform:translateX(420%)}}@keyframes aq-dot{0%,to{opacity:.25}50%{opacity:1}}';
export const metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: 'AQPrompts - Free AI Image Prompts for Instagram Creators',
    template: `%s | ${siteName}`,
  },
  description: defaultDescription,
  keywords: [
    'AI image prompts',
    'Instagram prompts',
    'creator growth',
    'social media growth',
    'Midjourney prompts',
    'Leonardo AI prompts',
  ],
  authors: [{ name: 'Abdul Qudoos', url: '/author/abdul-qudoos' }],
  creator: siteName,
  publisher: siteName,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName,
    title: 'AQPrompts - Free AI Image Prompts for Instagram Creators',
    description: defaultDescription,
    images: [
      {
        url: '/og-cover.webp',
        width: 1200,
        height: 630,
        alt: 'AQPrompts',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AQPrompts - Free AI Image Prompts for Instagram Creators',
    description: defaultDescription,
    images: ['/og-cover.webp'],
    site: '@AQPrompts',
    creator: '@AQPrompts',
  },
  icons: {
    icon: [{ url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' }],
    shortcut: '/favicon-32x32.png',
    apple: '/aqprompts-logo-icon.png',
  },
  verification: {
    ...(gscVerify ? { google: gscVerify } : {}),
    other: {
      'impact-site-verification': 'f438f7f3-2d82-4585-9226-7a6c422e6863',
      'yandex-verification': 'f412f79a8f2d1f4b',
    },
  },
  referrer: 'strict-origin-when-cross-origin',
  robots: {
    index: !previewDeployment,
    follow: !previewDeployment,
    ...(previewDeployment ? { noarchive: true, nocache: true } : {}),
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={inter.variable}
      suppressHydrationWarning
      translate="no"
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: LOADER_INLINE_CSS }} />
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        {/* Ad bootstrap is lazyOnload, not afterInteractive: it only preloads
            ad scripts for consented users, and those high-priority preloads
            competed with the LCP image and CSS on slow connections.
            lazyOnload runs it after window load, so ads still work for
            consented users (they are below the fold) without touching the
            critical path. */}
        <Script src="/scripts/ad-preload-bootstrap.js" strategy="lazyOnload" />
        {gscVerify ? <meta name="google-site-verification" content={gscVerify} /> : null}
        {bingVerify ? <meta name="msvalidate.01" content={bingVerify} /> : null}
        {pinterestVerify ? <meta name="p:domain_verify" content={pinterestVerify} /> : null}
        <link rel="alternate" type="application/rss+xml" title="AQPrompts New Blog Posts" href="/feed.xml" />
        <link rel="alternate" type="application/rss+xml" title="AQPrompts Pinterest Blog Feed" href="/pinterest-feed.xml" />
        <Script src="/scripts/theme-init.js" strategy="beforeInteractive" />
        <Script src="/scripts/consent-mode-defaults.js" strategy="beforeInteractive" />
      </head>
      <body className="xl:pb-0" suppressHydrationWarning>
        <SiteLoader />
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <DomErrorSuppressor />
        <ChunkReloadGuard />
        {children}
        <FloatingWhatsAppChannel />
        <CookieConsentManager gaId={gaId || ''} clarityId={clarityId || ''} />
        <DeferredSiteLoaders enableVercelAnalytics={vercelDeployment} />
      </body>
    </html>
  );
}
