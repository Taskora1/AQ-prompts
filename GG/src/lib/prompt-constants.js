import { isHighRiskPublicMedia } from './media-safety.js';
import { isLowValuePromptSlug } from './content-indexing-policy.js';

export const PROMPT_BASE_PATH = '/tools/ai-image-prompts';
export const PROMPT_LIBRARY_TYPES = ['photo', 'text'];

export const PROMPT_CATEGORY_BLOG_LINKS = Object.freeze({
  men: {
    href: '/blog/chatgpt-image-prompts-for-men-for-cinematic-ai-photos',
    label: 'ChatGPT image prompts for men',
  },
  women: {
    href: '/blog/luxury-ai-fashion-photography-prompts-for-women',
    label: 'Luxury AI fashion photography prompts for women',
  },
  couples: {
    href: '/blog/9-couple-ai-photo-editing-prompts-copy-and-paste',
    label: 'Couple AI photo editing prompts',
  },
  celebrations: {
    href: '/blog/birthday-ai-photo-prompts-copy-paste',
    label: 'Birthday AI photo prompts',
  },
  business: {
    href: '/blog/luxury-businessman-ai-portrait-prompts',
    label: 'Luxury business portrait prompts',
  },
  lifestyle: {
    href: '/blog/luxury-travel-ai-portrait-prompts',
    label: 'Luxury travel AI portrait prompts',
  },
  cinematic: {
    href: '/blog/master-level-ai-prompts-luxury-cinematic-portraits',
    label: 'Luxury cinematic portrait prompts',
  },
  'photo-editing': {
    href: '/blog/chatgpt-photo-editing',
    label: 'ChatGPT photo editing prompts',
  },
});

export const PROMPT_CATEGORIES = {
  men: {
    slug: 'men',
    label: 'Men',
    title: 'AI Image Prompts for Men',
    useCase: 'Male Portraits',
    description:
      'Explore corporate headshot AI prompts for men alongside business-casual, streetwear, studio-editorial, and personal-brand portrait concepts. This collection is useful for male Instagram creators, freelancers, and professionals looking for a LinkedIn profile photo AI prompt or a more relaxed streetwear AI portrait prompt for men. Adapt the wardrobe, expression, crop, and lighting to match the intended platform instead of combining competing visual directions. A generated headshot should not be used as identity evidence, and permitted reference images should be treated only as visual guidance.',
    intro:
      'These prompts are made for men’s portraits, including professional headshots, streetwear looks, studio sessions, and personal-brand images. They describe useful details such as clothing, pose, facial expression, camera framing, lighting, and background so you can create a clear visual direction. Use them with ChatGPT, Midjourney, Leonardo AI, or Gemini, then adjust the wording for the tool you choose. You can change the outfit, location, color palette, and aspect ratio to fit a profile photo, social post, portfolio, or campaign. Review the generated face, hands, clothing, and background before publishing, especially when using a permitted reference photo. Start with one clear subject and intended use.',
  },
  women: {
    slug: 'women',
    label: 'Women',
    title: 'AI Image Prompts for Adult Women',
    useCase: 'Female Portraits',
    description:
      'Find LinkedIn profile photo AI prompts for women alongside beauty-editorial, street-style, studio, and personal-brand portrait ideas. Instagram creators, bloggers, and small-business owners can adapt each beauty editorial AI portrait prompt for a portfolio, reel cover, mood board, or feed post AI portrait concept. Keep the pose, wardrobe, background, and lighting coherent while retaining the adult subject’s natural skin tone and proportions when using a permitted reference. Results vary by tool and settings, so inspect facial features, hands, clothing, and generated text before publishing.',
    intro:
      'This category contains portrait prompts for adult women, from polished business headshots to beauty editorials, street-style photos, studio portraits, and personal-brand content. Each prompt gives the image generator direction for wardrobe, pose, makeup, lighting, composition, and setting without requiring complicated technical language. They work with ChatGPT, Midjourney, Leonardo AI, and Gemini, with small adjustments sometimes needed for each tool. Change the clothing, background, crop, or mood to match your intended use. If you use a reference image, make sure you have permission and check the result for accurate features, natural proportions, readable text, and consistent hands before sharing it. Choose one audience and visual mood before generating.',
  },
  couples: {
    slug: 'couples',
    label: 'Couples',
    title: 'Couple AI Image Prompts',
    useCase: 'Couples',
    description:
      'Browse anniversary AI photo prompts for couples, wedding-inspired portrait concepts, cinematic scenes, and travel couple AI portrait prompts. The collection can help couples creators, photographers, and event planners prepare social posts, invitations, or private mood boards. For a cinematic couple AI photoshoot prompt, choose one clear interaction and location so hand placement, eye direction, and body positions remain understandable. Use both people’s photographs only with permission, and never present a generated scene as proof of a real relationship, wedding, event, or destination.',
    intro:
      'These couple prompts are designed for romantic portraits, anniversary scenes, wedding-inspired images, travel moments, and cinematic photos with two people. They help define the setting, interaction, clothing, body language, lighting, and camera style so both subjects remain part of one coherent scene. You can use them with ChatGPT, Midjourney, Leonardo AI, or Gemini, then tailor the instructions to the tool’s image workflow. Replace generic details with a real location, preferred colors, or a specific mood. When using reference photos, get permission from both people and check faces, hands, poses, and generated signs before using the image publicly. Keep the interaction simple so the result stays readable.',
  },
  celebrations: {
    slug: 'celebrations',
    label: 'Celebrations',
    title: 'Celebration AI Image Prompts',
    useCase: 'Celebrations',
    description:
      'Discover birthday AI photo prompts, digital invitation AI prompt designs, graduation or achievement poster ideas, and special-event portraits. Creators can adapt them for Instagram story cover AI prompts, digital invitations, announcement posts, or visual planning for an upcoming celebration. Match the decorations, colors, wardrobe, and wording to the genuine occasion rather than allowing the image generator to invent names, ages, dates, qualifications, or achievements. Generated cakes, signs, hands, candles, and lettering frequently need careful human review.',
    intro:
      'Celebration prompts cover birthdays, graduations, anniversaries, weddings, holidays, invitations, announcement graphics, and festive portraits. They describe decorations, colors, clothing, expressions, props, lighting, and composition for images that can support a real event or social post. Use them with ChatGPT, Midjourney, Leonardo AI, or Gemini, and replace placeholders with the correct names, dates, colors, and occasion details. Image generators often make mistakes in lettering, numbers, hands, cakes, and candles, so review every important element before sharing or printing. Keep the final image aligned with the genuine celebration rather than presenting invented achievements or event details as fact. Confirm every date and name before publishing.',
  },
  business: {
    slug: 'business',
    label: 'Business',
    title: 'Business AI Image Prompts',
    useCase: 'Business Portraits',
    description:
      'Browse free business AI image prompts for adult founders, consultants, LinkedIn profiles, executive portraits, personal-brand websites, and professional creator content.',
    intro:
      'Business prompts focus on professional portraits for founders, consultants, executives, freelancers, teams, LinkedIn profiles, websites, and personal-brand campaigns. They provide direction for wardrobe, office or studio settings, posture, expression, lighting, camera angle, and background so the result looks intentional and credible. Use them with ChatGPT, Midjourney, Leonardo AI, or Gemini, adapting the wording to the tool’s controls and reference-image options. Change the clothing and setting to match your real role and audience. Check faces, hands, logos, signs, and job-related details carefully, and do not use generated imagery as proof of an employer, qualification, award, or client relationship. Keep claims tied to information you can verify.',
  },
  lifestyle: {
    slug: 'lifestyle',
    label: 'Lifestyle',
    title: 'Lifestyle AI Image Prompts',
    useCase: 'Lifestyle Portraits',
    description:
      'Explore café aesthetic AI photo prompts, balcony scenes, travel portraits, city walks, beaches, and other everyday environments. The collection is useful for travel bloggers, lifestyle creators, influencers, and personal brands planning approachable Instagram posts or location-inspired mood boards. A travel blogger AI portrait prompt or city walk AI photo prompt usually works best with one believable activity, while a balcony aesthetic AI photo prompt benefits from simple lighting and an uncluttered background. Treat generated locations as creative settings rather than documentary proof of a visit, and use only permitted reference photographs.',
    intro:
      'Lifestyle prompts create natural-looking scenes in cafés, homes, balconies, streets, beaches, travel locations, and other everyday settings. They are useful for bloggers, creators, influencers, and personal brands that need relaxed portraits or images built around one believable activity. The prompts describe the location, clothing, pose, props, time of day, lighting, and overall mood. They work with ChatGPT, Midjourney, Leonardo AI, and Gemini, although each tool may interpret camera and style terms differently. Adjust the activity, season, colors, and crop for your project, then check the generated setting, hands, text, and landmarks before treating the image as finished. Use one main activity to avoid a cluttered scene.',
  },
  cinematic: {
    slug: 'cinematic',
    label: 'Cinematic',
    title: 'Cinematic AI Image Prompts',
    useCase: 'Cinematic',
    description:
      'This collection focuses on dramatic lighting AI portrait prompts, film-style compositions, atmospheric environments, and images that suggest a larger story. Filmmakers, musicians, and Instagram creators can adapt a movie poster style AI portrait prompt for promotional concepts or use a narrative AI portrait prompt for a reel cover. Camera and film terminology communicates the requested mood, color, and framing, but it does not prove that exact equipment or production techniques were reproduced. Review shadows, anatomy, background continuity, and generated signage before publishing a film-style AI photo.',
    intro:
      'Cinematic prompts are built for dramatic portraits, film-style scenes, atmospheric locations, moody color grades, and images that suggest a story. They use plain direction for lighting, camera framing, wardrobe, environment, movement, and emotional tone so you can develop a consistent visual concept. Try them with ChatGPT, Midjourney, Leonardo AI, or Gemini, and refine the camera or lighting language when a tool needs more specific instructions. You can change the subject, setting, palette, and aspect ratio for a poster, music release, reel cover, or editorial image. Inspect shadows, anatomy, background continuity, and generated lettering before publishing. Keep the lighting direction consistent across a series.',
  },
  photoEditing: {
    slug: 'photo-editing',
    label: 'Photo Editing',
    title: 'Photo Editing AI Prompts',
    useCase: 'Photo Editing Prompts',
    description:
      'Explore old photo restoration AI prompts alongside double-exposure compositions, selective-color editing, watercolor treatments, and poster-style transformations. Photographers, designers, social media creators, and small brands can use a double exposure AI photo prompt or selective color AI photo editing prompt to test alternate treatments for authorized source images. A watercolor effect AI photo prompt can communicate a creative direction, while restoration instructions should identify which damage to address without claiming historical accuracy. AI editing may invent missing details or alter identity, text, objects, and proportions, so compare every result carefully with the original source.',
    intro:
      'Photo editing prompts cover restoration, cleanup, selective color, double exposure, watercolor effects, poster treatments, and other transformations of an existing image. They explain which parts to preserve, remove, recolor, sharpen, or restyle so the edit has a clear goal. Use them with ChatGPT, Midjourney, Leonardo AI, or Gemini when the tool supports image input or image-to-image editing. Replace the generic instructions with the exact damage, object, color, or style you want to change. Work only with authorized photos, compare the result with the original, and check identity, text, proportions, missing details, and unwanted changes before saving or sharing. Save an untouched copy of the source image.',
  },
};

export function shouldNoIndexPrompt(prompt = {}) {
  const source = [
    prompt.slug,
    prompt.title,
    prompt.prompt,
    ...(Array.isArray(prompt.tags) ? prompt.tags : []),
  ].join(' ').toLowerCase();

  const depictsNamedOrProtectedSubject =
    /\b(imran khan|pti|celebrity|disney|pixar|netflix|vogue|forbes|gq|tedx)\b/.test(source);
  const explicitlyIncludesMinor =
    /\b(?:[0-9]|1[0-7])[- ]year[- ]old\b|\b(?:child|minor|teenager|teen boy|teen girl)\b/.test(source);
  const ambiguousMinor =
    /\b(?:boy|girl)\b/.test(source)
    && !/\b(?:adult|woman|women|man|men|businessman|bride|groom)\b/.test(source);

  const mediaContext = [
    prompt.slug,
    prompt.title,
    prompt.prompt,
    prompt.intro,
    ...(Array.isArray(prompt.tags) ? prompt.tags : []),
  ].filter(Boolean).join(' ');
  const hasHighRiskMedia = [prompt.image, ...(prompt.images || []), prompt.ogImage]
    .filter(Boolean)
    .some((media) => isHighRiskPublicMedia(media, mediaContext));

  return isLowValuePromptSlug(prompt.slug)
    || depictsNamedOrProtectedSubject
    || explicitlyIncludesMinor
    || ambiguousMinor
    || hasHighRiskMedia;
}

export function isIndexablePrompt(prompt = {}) {
  return !shouldNoIndexPrompt(prompt);
}

export function filterCategoryListingPrompts(prompts) {
  return prompts.filter((prompt) =>
    prompt.status !== 'draft' && Boolean(prompt.title && prompt.prompt),
  );
}

export function slugifyPrompt(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getPromptUrl(prompt) {
  return `${PROMPT_BASE_PATH}/p/${prompt.slug || slugifyPrompt(prompt.title)}`;
}

export const PROMPT_CATEGORY_ALIASES = {
  men: ['boy', 'boys', 'male', 'man', 'men', 'male portrait', 'male portraits', 'menswear'],
  women: ['girl', 'girls', 'female', 'woman', 'women', 'female portrait', 'female portraits', 'fashion', 'beauty'],
  couples: ['couple', 'couples', 'couple portrait', 'couple portraits', 'romantic couple', 'elegant couple', 'wedding couple', 'anniversary couple', 'just married'],
  celebrations: ['celebration', 'celebrations', 'birthday', 'birthday portrait', 'birthday portraits', 'eid', 'festive', 'festival', 'wedding', 'anniversary'],
  business: ['business', 'business portrait', 'business portraits', 'corporate', 'executive', 'ceo', 'office', 'linkedin', 'professional'],
  lifestyle: ['lifestyle', 'lifestyle portrait', 'lifestyle portraits', 'travel', 'street style', 'casual', 'urban', 'coffee', 'cafe'],
  cinematic: ['cinematic', 'film', 'movie', 'netflix', 'poster', 'dramatic', 'neon', 'rim light'],
  photoEditing: ['photo editing', 'photo editing prompt', 'photo editing prompts', 'edit', 'editing', 'watercolor', 'splash', 'layout', 'poster', 'double exposure'],
};

export function getCategoryMatchValues(category) {
  if (!category) return [];

  return [
    category.useCase,
    category.label,
    category.slug,
    ...(PROMPT_CATEGORY_ALIASES[category.slug] || []),
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

export function getPromptCategory(prompt) {
  const values = [
    prompt?.useCase,
    prompt?.category,
    ...(Array.isArray(prompt?.categories) ? prompt.categories : []),
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const match = Object.values(PROMPT_CATEGORIES).find((category) =>
    getCategoryMatchValues(category).some((matchValue) => values.includes(matchValue))
  );
  return match || null;
}

export function getCategoryDisplayName(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  const displayNames = {
    boys: 'Men',
    boy: 'Men',
    men: 'Men',
    'boys prompts': 'Men',
    'boys ai image prompts': 'Men',
    'male portrait prompt': 'Men',
    'male portrait prompts': 'Men',
    'male portraits': 'Men',
    girls: 'Women',
    girl: 'Women',
    women: 'Women',
    'girls prompts': 'Women',
    'girls ai image prompts': 'Women',
    'female portrait prompt': 'Women',
    'female portrait prompts': 'Women',
    'female portraits': 'Women',
    couple: 'Couples',
    couples: 'Couples',
    'couple portrait': 'Couples',
    'couple portraits': 'Couples',
    'romantic couple': 'Couples',
    'birthday portrait': 'Celebrations',
    'birthday portraits': 'Celebrations',
    birthday: 'Celebrations',
    corporate: 'Business',
    executive: 'Business',
    ceo: 'Business',
    cinematic: 'Cinematic',
    poster: 'Photo Editing',
    watercolor: 'Photo Editing',
  };

  return displayNames[normalized] || String(value || '').trim();
}

export function getPromptCategoryUrl(prompt) {
  const category = getPromptCategory(prompt);
  return category ? `${PROMPT_BASE_PATH}/${category.slug}` : PROMPT_BASE_PATH;
}
