// The site owner explicitly approved publishing these archived AI demonstration
// assets on 2026-08-18 after reviewing the prior provenance/AdSense warning.
const OWNER_APPROVED_MEDIA_FILENAMES = new Set([
  'aesthetic-white-shirt-teen-portrait.webp',
  'black-shalwar-kameez-twilight-moon-portrait.webp',
  'boy-rooftop-golden-hour-brown-outfit.webp',
  'brown-blazer-casual-formal-outdoor-portrait.webp',
  'disney-pixar-inspired-scrapbook-collage-portrait-1.webp',
  'emerald-green-south-asian-portrait.webp',
  'green-kurta-imran-khan-eid-ul-adha-poster.webp',
  'imran-khan-supporter-patriotic-eid-adha-poster.webp',
  'miniature-clones-multitasking-cozy-living-room.webp',
  'monochrome-low-angle-wire-rim-sunglasses.webp',
  'neon-red-circular-ring-vector-profile.webp',
  'paris-cafe-girl-portrait.webp',
  'pixar-style-3d-chibi-portrait-1.webp',
  'pixar-style-3d-chibi-portrait-2.webp',
  'pixar-style-bright-blue-gradient-male-cartoon.webp',
  'pixar-style-mirror-reflections-creator-bedroom.webp',
  'pixar-style-sunset-cafe-terrace-couple-illustration-1.webp',
  'pixar-style-white-heart-tee-denim-character.webp',
  'plaid-shirt-urban-south-asian-teen.webp',
  'playful-studio-candid-girl.webp',
  'pti-imran-khan-eid-ul-adha-poster.webp',
  'red-carpet-celebrity-yellow-lamborghini.webp',
  'south-asian-boy-autumn-portrait.webp',
  'south-asian-boy-birthday-teal.webp',
  'south-asian-boy-pink-checkered-shirt-park.webp',
  'south-asian-girl-pink-kurta-river.webp',
  'south-asian-girl-royal-blue-sharara-wedding.webp',
  'south-asian-man-black-suit-golden-hour.webp',
  'staircase-life-journey-age-progression-timeline.webp',
  'studio-fashion-girl-portrait.webp',
  'stylish-teen-boy-grey-black-outfit.webp',
  'urban-street-style-all-black-boy.webp',
  'v-panel-blockbuster-birthday-poster.webp',
]);

export function hasOwnerApprovedMediaRisk(value = '') {
  const source = String(value || '').trim();
  if (!source) return false;

  try {
    const pathname = source.startsWith('http') ? new URL(source).pathname : source;
    const filename = decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) || '');
    return OWNER_APPROVED_MEDIA_FILENAMES.has(filename);
  } catch {
    return false;
  }
}
