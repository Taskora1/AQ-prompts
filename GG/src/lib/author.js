import { SOCIAL_LINKS } from '@/lib/site-social';

export const ABDUL_QUDOOS = Object.freeze({
  slug: 'abdul-qudoos',
  name: 'Abdul Qudoos',
  role: 'Founder and Editor, AQPrompts',
  image: '/images/founder-aqprompts.webp',
  url: '/author/abdul-qudoos',
  bio: 'Abdul Qudoos creates and reviews AQPrompts guides and prompt-library content for creators using AI image tools.',
  responsibilities: [
    'Selecting and organizing prompt topics for the public library',
    'Reviewing prompt wording, intended use, and identity-related cautions',
    'Editing creator guides for clarity, practical customization, and troubleshooting',
    'Reviewing corrections and reports submitted by readers',
  ],
  socialLinks: [
    { name: 'Instagram', href: SOCIAL_LINKS.instagram, logo: '/instagram-logo.svg' },
    { name: 'TikTok', href: SOCIAL_LINKS.tiktok, logo: '/tiktok-logo.svg' },
    { name: 'Facebook', href: SOCIAL_LINKS.facebook, logo: '/facebook-logo.svg' },
  ],
});
