export default function manifest() {
  return {
    name: 'AQPrompts',
    short_name: 'AQPrompts',
    description: 'AI image prompt library and practical creator guides.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ff6b35',
    icons: [
      {
        src: '/aqprompts-logo.webp',
        sizes: '512x512',
        type: 'image/webp',
        purpose: 'any',
      },
    ],
  };
}
