export const SOCIAL_LINKS = {
  tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL || 'https://www.tiktok.com/@portraitprompts',
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/aqprompt_s/',
  pinterest: process.env.NEXT_PUBLIC_PINTEREST_URL || 'https://www.pinterest.com/aqprompts',
  facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL || 'https://www.facebook.com/growthguide.prompts/',
  linkedin: process.env.NEXT_PUBLIC_LINKEDIN_URL || 'https://www.linkedin.com/in/abdulqudoos-dev',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_URL || 'https://whatsapp.com/channel/0029Vb9Urwg4tRrvKfSumC0v',
};

export const SOCIAL_LINK_ITEMS = [
  {
    name: 'TikTok',
    href: SOCIAL_LINKS.tiktok,
    logo: '/tiktok-logo.svg',
  },
  {
    name: 'Instagram',
    href: SOCIAL_LINKS.instagram,
    logo: '/instagram-logo.svg',
  },
  {
    name: 'Pinterest',
    href: SOCIAL_LINKS.pinterest,
  },
  {
    name: 'Facebook',
    href: SOCIAL_LINKS.facebook,
    logo: '/facebook-logo.svg',
  },
  {
    name: 'WhatsApp',
    href: SOCIAL_LINKS.whatsapp,
    logo: '/whatsapp-logo.svg',
  },
];

export const TRUSTED_AI_TOOLS = [
  { name: 'ChatGPT', href: '/tools/ai-image-prompts?platform=chatgpt', logo: '/chatgpt-logo.svg', accent: 'from-emerald-500/20 to-emerald-600/5' },
  { name: 'Midjourney', href: '/tools/ai-image-prompts?platform=midjourney', logo: '/Midjourney-logo.svg', accent: 'from-indigo-500/20 to-indigo-600/5' },
  { name: 'Leonardo AI', href: '/tools/ai-image-prompts?platform=leonardo', logo: '/leonardo_logo.svg', accent: 'from-violet-500/20 to-violet-600/5' },
  { name: 'Gemini', href: '/tools/ai-image-prompts?platform=gemini', logo: '/gemini-logo.webp', accent: 'from-sky-500/20 to-sky-600/5' },
  { name: 'Stable Diffusion', href: '/tools/ai-image-prompts?platform=stable-diffusion', logo: '/stable-diffusion-logo.svg', accent: 'from-rose-500/20 to-rose-600/5' },
];
