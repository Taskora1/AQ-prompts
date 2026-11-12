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
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <Script src="/scripts/ad-preload-bootstrap.js" strategy="afterInteractive" />
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
