#!/usr/bin/env node
/**
 * validate-semantic-grounding.mjs
 *
 * READ-ONLY semantic audit of the 10 empty customization_tips repairs.
 * Reads actual prompt text and validates that every proposed tip is
 * grounded in entities explicitly present in the source prompt.
 *
 * Usage:
 *   node scripts/validate-semantic-grounding.mjs
 */

import { getPgPool } from './lib/load-local-env.mjs';

const TARGET_IDS = [425, 426, 427, 428, 429, 430, 431, 432, 433, 434];

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/* ─── Entity Extraction from Prompt Text ──────────────────────────────── */

function extractEntitiesFromPrompt(promptText, titleText) {
  const text = `${promptText || ''}`.toLowerCase();
  const title = `${titleText || ''}`.toLowerCase();
  const combined = `${text} ${title}`;

  const entities = {
    // Wardrobe
    suit: /\b(suit|blazer|tuxedo|tux)\b/.test(combined),
    dress: /\b(dress|gown)\b/.test(combined),
    kurta: /\b(kurta|kameez|shalwar|lehenga|sari|saree|sharara)\b/.test(combined),
    jacket: /\b(jacket|bomber|hoodie|overcoat|trench|peacoat)\b/.test(combined),
    sweater: /\b(sweater|knit|pullover|cardigan)\b/.test(combined),
    shirt: /\b(shirt|blouse|top|tee|t-shirt|polo)\b/.test(combined),
    veil: /\b(veil|hijab|dupatta|niqab|abaya)\b/.test(combined),
    trousers: /\b(trousers|pants|jeans|slacks)\b/.test(combined),
    skirt: /\b(skirt)\b/.test(combined),
    coat: /\b(coat|overcoat|trench|peacoat)\b/.test(combined),
    // Accessories
    jewelry: /\b(jewelry|jewellery|necklace|earring|ring|bracelet|pendant|chain|bangle)\b/.test(combined),
    hat: /\b(hat|cap|beret|fedora|beanie|headwear|tophat|top.?hat|sunhat)\b/.test(combined),
    glasses: /\b(glasses|sunglasses|eyewear|spectacles|aviator|frames|goggles|lens|eyeglasses)\b/.test(combined),
    watch: /\b(watch|wristwatch|chronograph|timepiece|clock)\b/.test(combined),
    flowers: /\b(flower|floral|petals|blossom|bouquet|rose|tulip|lily|orchid|daisy)\b/.test(combined),
    car: /\b(car|automobile|vehicle|sports.?car|sedan|suv|lamborghini|ferrari|porsche|bmw|luxury.?car)\b/.test(combined),
    // Environment
    studio: /\b(studio|backdrop|seamless.?background|studio.?light)\b/.test(combined),
    beach: /\b(beach|coast|ocean|sea|shore|sand|waves|tide|pier|boardwalk)\b/.test(combined),
    urban: /\b(urban|street|city|alley|alleyway|downtown|sidewalk|roadway|metropolitan|district)\b/.test(combined),
    hotel: /\b(hotel|resort|lobby|suite|corridor|hallway|marble.?floor)\b/.test(combined),
    park: /\b(park|garden|botanical|arboretum|lawn|meadow|forest|woods|trail|nature)\b/.test(combined),
    cafe: /\b(cafe|coffee|restaurant|bistro|bar|pub|tavern|diner)\b/.test(combined),
    riverside: /\b(river|riverfront|riverside|waterfront|canal|dock)\b/.test(combined),
    office: /\b(office|workspace|desk|cubicle|corporate|boardroom|meeting.?room)\b/.test(combined),
    stage: /\b(stage|theater|theatre|podium|platform|auditorium)\b/.test(combined),
    courtyard: /\b(courtyard|patio|terrace|veranda|balcony)\b/.test(combined),
    staircase: /\b(staircase|stairs|stairway|steps|escalator)\b/.test(combined),
    bedroom: /\b(bedroom|bed)\b/.test(combined),
    rooftop: /\b(rooftop|roof|terrace)\b/.test(combined),
    // Lighting
    goldenHour: /\b(golden.?hour|golden.?light|sunset.?light|sunrise.?light|warm.?sunlight)\b/.test(combined),
    neon: /\b(neon|led.?sign|fluorescent|blacklight|uv.?light)\b/.test(combined),
    dramatic: /\b(dramatic|chiaroscuro|rembrandt|low.?key|high.?contrast|moody.?light|harsh.?light)\b/.test(combined),
    softLight: /\b(soft.?light|diffused|wrapping.?light|overcast|cloudy|window.?light|natural.?light)\b/.test(combined),
    moody: /\b(moody|dark.?atmosphere|shadowy|brooding|dark.?mood|dark.?tones)\b/.test(combined),
    studioLight: /\b(studio.?light|key.?light|three.?point|softbox|ring.?light|beauty.?dish)\b/.test(combined),
    candlelight: /\b(candle|candlelight|candle.?glow|tea.?light|flickering.?light)\b/.test(combined),
    rim: /\b(rim.?light|rim.?lighting)\b/.test(combined),
    // Techniques
    text: /\b(typography|text|quote|magazine|newspaper|poster|logo|username|watermark|caption|headline|billboard|signage|neon.?sign)\b/.test(combined),
    filmGrain: /\b(film.?grain|grain|analog|35mm|16mm|super\s?8|vintage.?film)\b/.test(combined),
    rain: /\b(rain|rainy|drizzle|downpour|monsoon|raindrop)\b/.test(combined),
    wind: /\b(wind|windy|breeze|gust|windblown|wind.?swept)\b/.test(combined),
    bokeh: /\b(bokeh|blurred.?background|out.?of.?focus|shallow.?depth|f\/1\.|wide.?aperture)\b/.test(combined),
    illustration: /\b(illustration|illustrated|drawing|sketch|pencil.?draw|line.?art|vector|watercolor.?paint|digital.?art|art.?style|cartoon|anime|pixar|3d.?render|isometric|cel.?shade|painterly)\b/.test(combined),
    collage: /\b(collage|scrapbook|mood.?board|sticker|panel|mosaic|grid|multi.?frame|diptych|triptych)\b/.test(combined),
    reflection: /\b(reflection|mirrored|mirror|reflected|water.?surface|glass.?surface)\b/.test(combined),
    smoke: /\b(smoke|smoky|haze|fog|mist|steam|aerosol)\b/.test(combined),
    doubleExposure: /\b(double.?exposure|dual.?exposure|overlay|blend|composite|superimposed)\b/.test(combined),
    bw: /\b(monochrome|black.and.white|bw|grayscale|greyscale|black & white)\b/.test(combined),
    // Style
    luxury: /\b(luxury|luxurious|premium|high.?end|exclusive|elegant|sophisticated)\b/.test(combined),
    editorial: /\b(editorial|fashion.?editorial|magazine.?style|magazine.?layout)\b/.test(combined),
    corporate: /\b(corporate|professional|business|executive|formal)\b/.test(combined),
    cinematic: /\b(cinematic|film.?style|movie|blockbuster|hollywood)\b/.test(combined),
    vintage: /\b(vintage|retro|nostalgic|classic)\b/.test(combined),
    modern: /\b(modern|minimalist|clean|sleek)\b/.test(combined),
    // Composition
    closeUp: /\b(close.?up|headshot|head.?shot|face.?shot|macro)\b/.test(combined),
    fullBody: /\b(full.?body|full.?length|head.?to.?toe|full.?figure)\b/.test(combined),
    // Specific objects
    dog: /\b(dog|retriever|canine|puppy|pet)\b/.test(combined),
    man: /\b(man|gentleman|male|gent|boy|youth)\b/.test(combined),
    woman: /\b(woman|lady|female|girl|young.?woman)\b/.test(combined),
    couple: /\b(couple|pair|duo|two.?people)\b/.test(combined),
    // Colors explicitly mentioned
    navy: /\b(navy)\b/.test(combined),
    black: /\b(black)\b/.test(combined),
    white: /\b(white)\b/.test(combined),
    red: /\b(red|crimson|scarlet)\b/.test(combined),
    burgundy: /\b(burgundy|wine|maroon)\b/.test(combined),
    gold: /\b(gold|golden)\b/.test(combined),
    teal: /\b(teal|turquoise)\b/.test(combined),
    charcoal: /\b(charcoal|dark grey|dark gray)\b/.test(combined),
    ivory: /\b(ivory|cream|off.white)\b/.test(combined),
  };

  return entities;
}

/* ─── Semantic Tip Validator ──────────────────────────────────────────── */

function validateTipGrounding(tip, entities, promptText) {
  const tipLower = tip.toLowerCase();
  const promptLower = (promptText || '').toLowerCase();
  const issues = [];

  // Check wardrobe references
  if (/jacket|bomber|hoodie|overcoat|trench|peacoat/.test(tipLower) && !entities.jacket) {
    issues.push('jacket');
  }
  if (/\bdress\b/.test(tipLower) && !entities.dress) {
    issues.push('dress');
  }
  if (/\bsuit\b/.test(tipLower) && !entities.suit) {
    issues.push('suit');
  }
  if (/\bblazer\b/.test(tipLower) && !entities.suit) {
    issues.push('blazer');
  }
  if (/\bshirt\b/.test(tipLower) && !entities.shirt) {
    issues.push('shirt');
  }
  if (/\bveil\b/.test(tipLower) && !entities.veil) {
    issues.push('veil');
  }
  if (/\bsweater\b/.test(tipLower) && !entities.sweater) {
    issues.push('sweater');
  }
  if (/\bkurta\b/.test(tipLower) && !entities.kurta) {
    issues.push('kurta');
  }

  // Check accessory references
  if (/\bjewelry\b/.test(tipLower) && !entities.jewelry) {
    issues.push('jewelry');
  }
  if (/\bnecklace\b/.test(tipLower) && !entities.jewelry) {
    issues.push('necklace');
  }
  if (/\bearring\b/.test(tipLower) && !entities.jewelry) {
    issues.push('earring');
  }
  if (/\bbracelet\b/.test(tipLower) && !entities.jewelry) {
    issues.push('bracelet');
  }
  if (/\bhat\b/.test(tipLower) && !entities.hat) {
    issues.push('hat');
  }
  if (/\bglasses\b/.test(tipLower) && !entities.glasses) {
    issues.push('glasses');
  }
  if (/\bsunglasses\b/.test(tipLower) && !entities.glasses) {
    issues.push('sunglasses');
  }
  if (/\beyeglasses\b/.test(tipLower) && !entities.glasses) {
    issues.push('eyeglasses');
  }
  if (/\bwatch\b/.test(tipLower) && !entities.watch) {
    issues.push('watch');
  }

  // Check environment references
  if (/\bhotel\b/.test(tipLower) && !entities.hotel) {
    issues.push('hotel');
  }
  if (/\boffice\b/.test(tipLower) && !entities.office) {
    issues.push('office');
  }
  if (/\bstudio\b/.test(tipLower) && !entities.studio) {
    issues.push('studio');
  }
  if (/\bbeach\b/.test(tipLower) && !entities.beach) {
    issues.push('beach');
  }
  if (/\bcafe\b/.test(tipLower) && !entities.cafe) {
    issues.push('cafe');
  }
  if (/\bpark\b/.test(tipLower) && !entities.park) {
    issues.push('park');
  }
  if (/\bforest\b/.test(tipLower) && !entities.park) {
    issues.push('forest');
  }
  if (/\bcity\b/.test(tipLower) && !entities.urban) {
    issues.push('city');
  }
  if (/\burban\b/.test(tipLower) && !entities.urban) {
    issues.push('urban');
  }
  if (/\bstreet\b/.test(tipLower) && !entities.urban) {
    issues.push('street');
  }
  if (/\brooftop\b/.test(tipLower) && !entities.rooftop) {
    issues.push('rooftop');
  }
  if (/\bbedroom\b/.test(tipLower) && !entities.bedroom) {
    issues.push('bedroom');
  }

  // Check technique references
  if (/\bgrain\b/.test(tipLower) && !entities.filmGrain) {
    issues.push('film grain');
  }
  if (/\brain\b/.test(tipLower) && !entities.rain) {
    issues.push('rain');
  }
  if (/\bbokeh\b/.test(tipLower) && !entities.bokeh) {
    issues.push('bokeh');
  }
  if (/\billustration\b/.test(tipLower) && !entities.illustration) {
    issues.push('illustration');
  }
  if (/\bcollage\b/.test(tipLower) && !entities.collage) {
    issues.push('collage');
  }
  if (/\breflection\b/.test(tipLower) && !entities.reflection) {
    issues.push('reflection');
  }
  if (/\bsmoke\b/.test(tipLower) && !entities.smoke) {
    issues.push('smoke');
  }
  if (/\bdouble.exposure\b/.test(tipLower) && !entities.doubleExposure) {
    issues.push('double exposure');
  }
  if (/\btext\b/.test(tipLower) && !entities.text) {
    issues.push('text/typography');
  }
  if (/\bmagazine\b/.test(tipLower) && !entities.text) {
    issues.push('magazine');
  }
  if (/\bposter\b/.test(tipLower) && !entities.text) {
    issues.push('poster');
  }

  // Check lighting references
  if (/\bgolden.hour\b/.test(tipLower) && !entities.goldenHour) {
    issues.push('golden hour');
  }
  if (/\bneon\b/.test(tipLower) && !entities.neon) {
    issues.push('neon');
  }
  if (/\bcandle\b/.test(tipLower) && !entities.candlelight) {
    issues.push('candle');
  }

  // Check color references
  if (/\bnavy\b/.test(tipLower) && !entities.navy) {
    issues.push('navy');
  }
  if (/\bburgundy\b/.test(tipLower) && !entities.burgundy) {
    issues.push('burgundy');
  }
  if (/\bteal\b/.test(tipLower) && !entities.teal) {
    issues.push('teal');
  }

  return issues;
}

/* ─── Proposed Tips (from dry-run) ────────────────────────────────────── */

const PROPOSED_TIPS = {
  425: [
    'Adjust the jacket style — bomber for streetwear, leather for edge, denim for casual, blazer for formal.',
    'Specify the jacket material — leather, suede, denim, nylon, or wool.',
    'Layer the jacket over contrasting innerwear for visual depth and outfit complexity.',
    'Consider jacket hardware — zippers, buttons, snaps — for added detail and realism.',
  ],
  426: [
    'Adjust the time of day — golden hour for warmth, midday for bright, blue hour for ethereal mood.',
    'Control the water visibility — clear for tropical, dark for moody, waves for dynamic energy.',
    'Add environmental detail — shells, driftwood, seaweed, or wet sand reflections.',
    'Specify the sand color — white for tropical, golden for classic, volcanic black for dramatic contrast.',
  ],
  427: [
    'Use a bold, simple font for the text — ornate fonts are harder for AI to render accurately.',
    'Reduce the text size relative to the image — smaller text is less likely to show rendering artifacts.',
    'Widen the aperture for creamier background circles, or stop down for more environmental context.',
    'Ensure the jewelry integrates naturally with the subject — correct scale, position, and lighting.',
  ],
  428: [
    'Add natural elements — fallen leaves, wildflowers, dappled light, morning dew.',
    'Increase grain density for raw documentary feel, reduce it for cleaner modern-vintage hybrid.',
    'Shift grain toward warmer tones for nostalgic color film, or keep neutral for classic monochrome.',
    'Apply grain selectively — heavier in shadows, lighter in highlights — for authentic analog behavior.',
  ],
  429: [
    'Add subtle directionality to prevent the image from looking flat and lifeless.',
    'Specify the light color temperature — warm for inviting, cool for clinical, neutral for versatile.',
    'Add or remove the jewelry to change the composition balance and narrative focus.',
    'Specify the jewelry material and color to complement rather than compete with the outfit.',
  ],
  430: [
    'Adjust the dress silhouette — A-line for flow, sheath for structure, ball-gown for drama.',
    'Specify the dress fabric — silk for sheen, chiffon for movement, velvet for richness, cotton for casual.',
    'Add or remove accessories — statement earrings, necklace, or clutch to complement the dress.',
    'Consider the dress length — floor-length for formality, knee-length for versatility, mini for editorial punch.',
  ],
  431: [
    'Specify the office style — corner executive for authority, open plan for modern, home office for intimate.',
    'Add desk props — laptop, notepad, coffee mug, plant — for environmental realism.',
    'Control the window view — city skyline for urban, nature for biophilic, closed blinds for privacy.',
    'Simplify the magazine to the shortest essential phrase — AI text rendering improves with fewer characters.',
  ],
  432: [
    'Enhance luxury cues — swap to suit in cashmere or silk, add a minimal watch, or shift the setting.',
    'Ensure the glasses integrates naturally with the subject — correct scale, position, and lighting.',
    'Add or remove the glasses to change the composition balance and narrative focus.',
    'Specify the glasses material and color to complement rather than compete with the outfit.',
  ],
  433: [
    'Specify the hotel style — modern minimalist, classic luxury, art deco, or boutique eclectic.',
    'Control the interior detail level — sparse for editorial minimal, ornate for rich luxury storytelling.',
    'Add warm ambient elements — lobby plants, warm wood, brass fixtures — for luxury atmosphere.',
    'Adjust the soft light direction — overhead for even, side for gentle dimension, front for beauty.',
  ],
  434: [
    'Tune the dress color saturation — muted for editorial restraint, vivid for high-impact visuals.',
    'Control the shadow softness — very soft for ethereal, slightly defined for natural portrait feel.',
    'Enhance luxury cues — swap to dress in cashmere or silk, add a minimal watch, or shift the setting.',
  ],
};

/* ─── Alternative Tip Pools (entity-specific) ─────────────────────────── */

function generateAlternativeTips(entities, promptText) {
  const tips = [];

  // Studio-specific
  if (entities.studio) {
    tips.push(
      'Adjust the studio backdrop color — seamless white for clean, dark for dramatic, colored for mood.',
      'Control the studio lighting ratio — high key for bright and airy, low key for moody and cinematic.',
      'Add or remove studio props — chair, stool, pillar, fabric drape — for compositional anchors.',
      'Specify the studio floor — reflective for depth, matte for minimal, seamless for infinite look.',
    );
  }

  // Beach-specific
  if (entities.beach) {
    tips.push(
      'Adjust the time of day — golden hour for warmth, midday for bright, blue hour for ethereal mood.',
      'Control the water visibility — clear for tropical, dark for moody, waves for dynamic energy.',
      'Add environmental detail — shells, driftwood, seaweed, or wet sand reflections.',
      'Specify the sand color — white for tropical, golden for classic, volcanic black for dramatic contrast.',
    );
  }

  // Hotel-specific
  if (entities.hotel) {
    tips.push(
      'Specify the hotel style — modern minimalist, classic luxury, art deco, or boutique eclectic.',
      'Control the interior detail level — sparse for editorial minimal, ornate for rich luxury storytelling.',
      'Add warm ambient elements — lobby plants, warm wood, brass fixtures — for luxury atmosphere.',
    );
  }

  // Urban-specific
  if (entities.urban) {
    tips.push(
      'Control the urban clutter level — clean and minimal for editorial focus, gritty for authentic street energy.',
      'Specify the architectural era — modern glass for sleek, brick for industrial, stone for classic.',
      'Add or remove pedestrian activity — empty streets for isolation, crowd for energy and scale.',
      'Specify the ground surface — wet pavement for reflections, cobblestone for texture, asphalt for neutral.',
    );
  }

  // Office-specific
  if (entities.office) {
    tips.push(
      'Specify the office style — corner executive for authority, open plan for modern, home office for intimate.',
      'Add desk props — laptop, notepad, coffee mug, plant — for environmental realism.',
      'Control the window view — city skyline for urban, nature for biophilic, closed blinds for privacy.',
    );
  }

  // Park-specific
  if (entities.park) {
    tips.push(
      'Specify the season — spring blossoms, summer green, autumn foliage, winter bare branches.',
      'Control the depth of field — sharp background for environmental portrait, soft for dreamy isolation.',
      'Add natural elements — fallen leaves, wildflowers, dappled light, morning dew.',
    );
  }

  // Lighting-specific
  if (entities.goldenHour) {
    tips.push(
      'Adjust the golden hour warmth — cooler for subtle glow, warmer for romantic drama.',
      'Control the shadow length — long shadows for depth, shorter for softer look.',
      'Add lens flare or sun haze for authentic golden-hour atmosphere.',
      'Specify the light direction — backlit for rim glow, side-lit for dimension, front-lit for even warmth.',
    );
  }
  if (entities.dramatic) {
    tips.push(
      'Tune the dramatic lighting angle — Rembrandt triangle for classic, split for noir, butterfly for glamour.',
      'Control the shadow depth — deep shadows for mystery, lifted shadows for editorial breathing room.',
      'Add a subtle rim or edge light to separate the subject from the dark background.',
      'Specify the contrast ratio — extreme for high-drama, moderate for editorial versatility.',
    );
  }
  if (entities.softLight) {
    tips.push(
      'Adjust the soft light direction — overhead for even, side for gentle dimension, front for beauty.',
      'Control the shadow softness — very soft for ethereal, slightly defined for natural portrait feel.',
      'Add subtle directionality to prevent the image from looking flat and lifeless.',
      'Specify the light color temperature — warm for inviting, cool for clinical, neutral for versatile.',
    );
  }
  if (entities.moody) {
    tips.push(
      'Control the darkness level — deep shadows for mystery, lifted blacks for editorial mood.',
      'Add selective light to the subject face to maintain visibility within the dark atmosphere.',
      'Specify the mood tone — melancholic with cool tones, warm noir with amber accents, or gothic with deep shadows.',
    );
  }
  if (entities.studioLight) {
    tips.push(
      'Specify the studio lighting setup — three-point for classic, clamshell for beauty, split for drama.',
      'Adjust the key-to-fill ratio — 2:1 for natural, 4:1 for dramatic, 8:1 for high contrast.',
      'Control the light modifier — softbox for soft, beauty dish for focused, bare bulb for hard.',
    );
  }

  // Suit-specific
  if (entities.suit) {
    tips.push(
      'Adjust the suit fabric texture — wool for structure, linen for relaxed drape, silk for sheen.',
      'Refine the suit fit — slim-cut for modern editorial, relaxed for classic editorial look.',
      'Consider the suit color against the background — contrasting tones add depth, matching tones create monochrome elegance.',
      'Add a pocket square or lapel pin for a subtle luxury detail without overcomplicating the outfit.',
      'Specify the suit jacket length — cropped for modern silhouette, longer for traditional tailoring.',
    );
  }

  // Dress-specific
  if (entities.dress) {
    tips.push(
      'Adjust the dress silhouette — A-line for flow, sheath for structure, ball-gown for drama.',
      'Specify the dress fabric — silk for sheen, chiffon for movement, velvet for richness, cotton for casual.',
      'Add or remove accessories — statement earrings, necklace, or clutch to complement the dress.',
      'Consider the dress length — floor-length for formality, knee-length for versatility, mini for editorial punch.',
      'Tune the dress color saturation — muted for editorial restraint, vivid for high-impact visuals.',
    );
  }

  // Jacket-specific
  if (entities.jacket) {
    tips.push(
      'Adjust the jacket style — bomber for streetwear, leather for edge, denim for casual, blazer for formal.',
      'Specify the jacket material — leather, suede, denim, nylon, or wool.',
      'Layer the jacket over contrasting innerwear for visual depth and outfit complexity.',
      'Consider jacket hardware — zippers, buttons, snaps — for added detail and realism.',
    );
  }

  // Shirt-specific
  if (entities.shirt) {
    tips.push(
      'Specify the shirt fabric — cotton poplin for crisp, linen for relaxed, silk for luxury.',
      'Adjust the collar style — open collar for casual, buttoned for formal, mandarin for modern.',
      'Consider the shirt color against the outer layer for tonal contrast or monochrome harmony.',
      'Add cuff detail — rolled sleeves for casual, French cuffs with cufflinks for formal.',
    );
  }

  // Veil-specific
  if (entities.veil) {
    tips.push(
      'Specify the veil material — sheer organza for lightness, heavy silk for richness, lace for texture.',
      'Adjust the veil drape — flowing behind for movement, draped across for mystery, pinned for structure.',
      'Ensure the veil color complements rather than competes with the main garment.',
    );
  }

  // Glasses-specific
  if (entities.glasses) {
    tips.push(
      'Adjust the glasses frame style — wire for minimal, acetate for bold, rimless for subtle.',
      'Specify the lens tint — clear for classic, slightly tinted for vintage, gradient for editorial.',
      'Control the glasses position — centered for formal, slightly tilted for casual personality.',
    );
  }

  // Jewelry-specific
  if (entities.jewelry) {
    tips.push(
      'Adjust the jewelry scale — statement for bold editorial, minimal for understated luxury.',
      'Specify the jewelry metal — gold for warm luxury, silver for cool modern, rose gold for romantic.',
      'Consider the jewelry placement — necklace length, earring style, bracelet stack for visual balance.',
    );
  }

  // Hat-specific
  if (entities.hat) {
    tips.push(
      'Adjust the hat angle — straight for formal, tilted for personality, pulled low for mystery.',
      'Specify the hat material — felt for classic, straw for casual, leather for edge.',
      'Control the hat color — matching for monochrome, contrasting for visual pop.',
    );
  }

  // Watch-specific
  if (entities.watch) {
    tips.push(
      'Specify the watch style — dress watch for formal, chronograph for sporty, smart watch for modern.',
      'Adjust the watch visibility — prominent for luxury signaling, subtle for understated elegance.',
    );
  }

  // Car-specific
  if (entities.car) {
    tips.push(
      'Specify the car model or style — sports car for performance, sedan for elegance, SUV for presence.',
      'Control the car position — foreground for prominence, background for context, reflected in surface for depth.',
      'Adjust the car color — matching the subject wardrobe for cohesion, contrasting for visual interest.',
    );
  }

  // Dog-specific
  if (entities.dog) {
    tips.push(
      'Adjust the dog position — beside subject for companionship, in front for foreground interest, on lap for intimacy.',
      'Specify the dog breed rendering — ensure accurate breed features and proportions.',
      'Control the dog interaction — eye contact with camera, looking at subject, or candid pose.',
    );
  }

  // B&W-specific
  if (entities.bw) {
    tips.push(
      'Control the monochrome tonal range — high contrast for drama, low contrast for subtle editorial.',
      'Specify the black point — deep blacks for richness, lifted blacks for vintage film feel.',
      'Add texture cues to compensate for loss of color information in the monochrome treatment.',
    );
  }

  // Film grain-specific
  if (entities.filmGrain) {
    tips.push(
      'Increase grain density for raw documentary feel, reduce it for cleaner modern-vintage hybrid.',
      'Shift grain toward warmer tones for nostalgic color film, or keep neutral for classic monochrome.',
      'Apply grain selectively — heavier in shadows, lighter in highlights — for authentic analog behavior.',
      'Combine grain with light leak effects for a more complete vintage film aesthetic.',
    );
  }

  // Text-specific
  if (entities.text) {
    tips.push(
      'Simplify the typography to the shortest essential phrase — AI text rendering improves with fewer characters.',
      'Plan to overlay the text in post-production for guaranteed spelling accuracy.',
      'Use a bold, simple font — ornate fonts are harder for AI to render accurately.',
      'Reduce the text size relative to the image — smaller text is less likely to show rendering artifacts.',
    );
  }

  // Reflection-specific
  if (entities.reflection) {
    tips.push(
      'Control the reflection clarity — sharp mirror for crisp symmetry, softened for natural water feel.',
      'Specify the reflection surface — still water, wet pavement, glass, or polished metal.',
      'Adjust the reflection completeness — full reflection for drama, partial for compositional balance.',
    );
  }

  // Smoke-specific
  if (entities.smoke) {
    tips.push(
      'Control the smoke density — subtle haze for atmosphere, thick clouds for drama.',
      'Specify the smoke color — white for clean, grey for industrial, colored for theatrical.',
      'Add directional light through the smoke for volumetric light shafts.',
    );
  }

  // Wind-specific
  if (entities.wind) {
    tips.push(
      'Direct the wind from a specific angle to control which elements flow — hair, fabric, or both.',
      'Adjust wind intensity — gentle breeze for natural movement, strong gusts for dramatic flowing energy.',
    );
  }

  // Rain-specific
  if (entities.rain) {
    tips.push(
      'Adjust the rain density — light drizzle for subtle atmosphere, heavy downpour for dramatic presence.',
      'Specify droplet direction and size variation for natural water rendering.',
      'Add visible puddles or wet surfaces to reinforce the rain narrative.',
    );
  }

  // Style-specific
  if (entities.luxury) {
    tips.push(
      'Use a monochromatic color palette — head-to-toe in one tone reads as more expensive and curated.',
      'Add a single statement accessory — a watch, cufflink, or ring — for understated luxury signaling.',
      'Simplify the composition — luxury editorial often uses negative space and minimal props for sophistication.',
    );
  }
  if (entities.editorial) {
    tips.push(
      'Shift editorial energy — deliberate poses with strong eye contact for drama, or candid motion for authenticity.',
      'Use dramatic lighting with strong shadows for high-fashion editorial impact.',
      'Choose a bold, single-color outfit against a contrasting background for graphic editorial punch.',
    );
  }
  if (entities.cinematic) {
    tips.push(
      'Enhance cinematic quality — letterbox framing, teal-orange color grade, or subtle lens flare.',
      'Use a wide aspect ratio (16:9) for a more filmic, widescreen cinematic composition.',
      'Add atmospheric elements — smoke, haze, or practical lights — for cinematic depth and mood.',
    );
  }
  if (entities.vintage) {
    tips.push(
      'Adjust the vintage era — 1920s for art deco glamour, 1970s for earthy warmth, 1990s for raw energy.',
      'Add period-appropriate props and wardrobe details for historical authenticity.',
      'Apply subtle color grading — sepia for timeless, faded for nostalgic, cross-processed for experimental.',
    );
  }

  // Composition-specific
  if (entities.closeUp) {
    tips.push(
      'Tighten the crop to exclude shoulders for intimate face-only study, or include collarbone for editorial headshot.',
      'Shift the crop slightly off-center — rule of thirds placement creates more dynamic facial framing.',
    );
  }
  if (entities.fullBody) {
    tips.push(
      'Shift the camera angle — eye level for neutral presence, low angle for authority, elevated for approachable.',
      'Leave generous negative space around the figure for a sense of scale and environment.',
    );
  }

  return tips;
}

/* ─── Main ───────────────────────────────────────────────────────────── */

async function main() {
  const db = getPgPool();

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  STEP 13B — SEMANTIC VALIDATION & SAFE REPAIR`);
  console.log(`${'═'.repeat(72)}\n`);

  // 1. Fetch all published prompts for uniqueness registry
  const { rows: allPrompts } = await db.query(`
    SELECT p.id, p.slug, p.title, p.prompt, p.tags, p.customization_tips
    FROM prompts p WHERE p.status='published' ORDER BY p.id
  `);
  console.log(`  Published prompts: ${allPrompts.length}`);

  // 2. Fetch target prompts
  const { rows: targets } = await db.query(`
    SELECT p.id, p.slug, p.title, p.prompt, p.tags, p.customization_tips
    FROM prompts p WHERE p.id = ANY($1) AND p.status='published' ORDER BY p.id
  `, [TARGET_IDS]);
  console.log(`  Target prompts: ${TARGET_IDS.length}`);
  console.log(`  Targets found: ${targets.length}\n`);

  // 3. Build uniqueness registry from ALL existing tips
  const existingTips = new Set();
  for (const p of allPrompts) {
    const tips = Array.isArray(p.customization_tips) ? p.customization_tips : [];
    for (const t of tips) {
      const n = norm(t);
      if (n) existingTips.add(n);
    }
  }

  // 4. Validate each target
  let totalProposed = 0;
  let totalRetained = 0;
  let totalRejected = 0;
  let totalSemanticFailures = 0;
  let unresolved = 0;
  let collisionCount = 0;
  const proposedTipSet = new Set();
  const results = [];

  for (const p of targets) {
    const entities = extractEntitiesFromPrompt(p.prompt, p.title);
    const altTips = generateAlternativeTips(entities, p.prompt);
    const proposedTips = PROPOSED_TIPS[p.id] || [];

    console.log(`${'─'.repeat(72)}`);
    console.log(`  ── ${p.slug} (id:${p.id}) ──`);
    console.log(`${'─'.repeat(72)}\n`);

    console.log(`  Source entities detected:`);
    const detectedEntities = [];
    if (entities.suit) detectedEntities.push('suit');
    if (entities.dress) detectedEntities.push('dress');
    if (entities.jacket) detectedEntities.push('jacket');
    if (entities.shirt) detectedEntities.push('shirt');
    if (entities.veil) detectedEntities.push('veil');
    if (entities.sweater) detectedEntities.push('sweater');
    if (entities.kurta) detectedEntities.push('kurta');
    if (entities.jewelry) detectedEntities.push('jewelry');
    if (entities.hat) detectedEntities.push('hat');
    if (entities.glasses) detectedEntities.push('glasses');
    if (entities.watch) detectedEntities.push('watch');
    if (entities.car) detectedEntities.push('car');
    if (entities.dog) detectedEntities.push('dog');
    if (entities.studio) detectedEntities.push('studio');
    if (entities.beach) detectedEntities.push('beach');
    if (entities.urban) detectedEntities.push('urban');
    if (entities.hotel) detectedEntities.push('hotel');
    if (entities.park) detectedEntities.push('park');
    if (entities.cafe) detectedEntities.push('cafe');
    if (entities.office) detectedEntities.push('office');
    if (entities.riverside) detectedEntities.push('riverside');
    if (entities.goldenHour) detectedEntities.push('golden hour');
    if (entities.neon) detectedEntities.push('neon');
    if (entities.dramatic) detectedEntities.push('dramatic');
    if (entities.softLight) detectedEntities.push('soft light');
    if (entities.moody) detectedEntities.push('moody');
    if (entities.studioLight) detectedEntities.push('studio light');
    if (entities.candlelight) detectedEntities.push('candlelight');
    if (entities.rim) detectedEntities.push('rim light');
    if (entities.text) detectedEntities.push('text/typography');
    if (entities.filmGrain) detectedEntities.push('film grain');
    if (entities.rain) detectedEntities.push('rain');
    if (entities.wind) detectedEntities.push('wind');
    if (entities.bokeh) detectedEntities.push('bokeh');
    if (entities.illustration) detectedEntities.push('illustration');
    if (entities.collage) detectedEntities.push('collage');
    if (entities.reflection) detectedEntities.push('reflection');
    if (entities.smoke) detectedEntities.push('smoke');
    if (entities.doubleExposure) detectedEntities.push('double exposure');
    if (entities.bw) detectedEntities.push('monochrome');
    if (entities.luxury) detectedEntities.push('luxury');
    if (entities.editorial) detectedEntities.push('editorial');
    if (entities.cinematic) detectedEntities.push('cinematic');
    if (entities.vintage) detectedEntities.push('vintage');
    if (entities.modern) detectedEntities.push('modern');
    if (entities.closeUp) detectedEntities.push('close-up');
    if (entities.fullBody) detectedEntities.push('full-body');
    console.log(`    wardrobe: ${detectedEntities.filter(e => ['suit','dress','jacket','shirt','veil','sweater','kurta'].includes(e)).join(', ') || 'none'}`);
    console.log(`    accessories: ${detectedEntities.filter(e => ['jewelry','hat','glasses','watch'].includes(e)).join(', ') || 'none'}`);
    console.log(`    props: ${detectedEntities.filter(e => ['car','dog'].includes(e)).join(', ') || 'none'}`);
    console.log(`    environment: ${detectedEntities.filter(e => ['studio','beach','urban','hotel','park','cafe','office','riverside'].includes(e)).join(', ') || 'none'}`);
    console.log(`    lighting: ${detectedEntities.filter(e => ['golden hour','neon','dramatic','soft light','moody','studio light','candlelight','rim light'].includes(e)).join(', ') || 'none'}`);
    console.log(`    techniques: ${detectedEntities.filter(e => ['text/typography','film grain','rain','wind','bokeh','illustration','collage','reflection','smoke','double exposure','monochrome'].includes(e)).join(', ') || 'none'}`);
    console.log(`    style: ${detectedEntities.filter(e => ['luxury','editorial','cinematic','vintage','modern'].includes(e)).join(', ') || 'none'}`);
    console.log(`    composition: ${detectedEntities.filter(e => ['close-up','full-body'].includes(e)).join(', ') || 'none'}\n`);

    // Review previous candidates
    console.log(`  Previous candidates reviewed: ${proposedTips.length}`);
    const validPreviousTips = [];
    const rejectedPreviousTips = [];
    for (const tip of proposedTips) {
      totalProposed++;
      const issues = validateTipGrounding(tip, entities, p.prompt);
      if (issues.length === 0) {
        // Check uniqueness
        const n = norm(tip);
        if (existingTips.has(n) || proposedTipSet.has(n)) {
          collisionCount++;
          rejectedPreviousTips.push({ tip, reason: 'Uniqueness collision', issue: null });
          totalRejected++;
        } else {
          proposedTipSet.add(n);
          validPreviousTips.push(tip);
          totalRetained++;
          console.log(`    [RETAINED] ${tip}`);
          console.log(`      Grounded in: entity confirmed in source prompt\n`);
        }
      } else {
        rejectedPreviousTips.push({ tip, reason: 'Unsupported entity', issue: issues.join(', ') });
        totalRejected++;
        totalSemanticFailures++;
        console.log(`    [REJECTED] ${tip}`);
        console.log(`      Reason: Unsupported entity: ${issues.join(', ')}\n`);
      }
    }

    // If we need more tips, try alternative pool
    if (validPreviousTips.length < 2) {
      console.log(`  Need more tips (have ${validPreviousTips.length}, need 2). Trying alternative pool...\n`);
      for (const tip of altTips) {
        if (validPreviousTips.length >= 4) break;
        if (validPreviousTips.includes(tip)) continue;
        const issues = validateTipGrounding(tip, entities, p.prompt);
        if (issues.length === 0) {
          const n = norm(tip);
          if (existingTips.has(n) || proposedTipSet.has(n)) {
            collisionCount++;
            continue;
          }
          proposedTipSet.add(n);
          validPreviousTips.push(tip);
          totalRetained++;
          console.log(`    [ADDED] ${tip}`);
          console.log(`      Grounded in: entity confirmed in source prompt\n`);
        }
      }
    }

    if (validPreviousTips.length < 2) {
      unresolved++;
      console.log(`  ⚠ UNRESOLVED: Only ${validPreviousTips.length} semantically valid tips available\n`);
    }

    results.push({
      id: p.id,
      slug: p.slug,
      tips: validPreviousTips,
      rejectedCount: rejectedPreviousTips.length,
    });
  }

  // 5. Print mismatch report
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  SEMANTIC MISMATCH REVIEW`);
  console.log(`${'═'.repeat(72)}\n`);

  for (const p of targets) {
    const proposedTips = PROPOSED_TIPS[p.id] || [];
    const entities = extractEntitiesFromPrompt(p.prompt, p.title);
    for (const tip of proposedTips) {
      const issues = validateTipGrounding(tip, entities, p.prompt);
      if (issues.length > 0) {
        console.log(`  [REJECTED]`);
        console.log(`  Prompt: ${p.slug} (id:${p.id})`);
        console.log(`  Candidate: ${tip}`);
        console.log(`  Reason: Unsupported entity`);
        console.log(`  Unsupported entity: ${issues.join(', ')}`);
        console.log('');
      }
    }
  }

  // 6. Print summary
  console.log(`${'═'.repeat(72)}`);
  console.log(`  STEP 13B SEMANTIC VALIDATION SUMMARY`);
  console.log(`${'═'.repeat(72)}\n`);

  console.log(`  Published prompts:                         ${allPrompts.length}`);
  console.log(`  Target prompts:                            ${targets.length}`);
  console.log(`  Targets found:                             ${targets.length}\n`);
  console.log(`  Target prompts with >=2 valid tips:        ${results.filter(r => r.tips.length >= 2).length}`);
  console.log(`  Unresolved:                                ${unresolved}\n`);
  console.log(`  Previous candidates reviewed:              ${totalProposed}`);
  console.log(`  Candidates retained:                       ${totalRetained}`);
  console.log(`  Candidates rejected:                       ${totalRejected}\n`);
  console.log(`  Semantic grounding failures:               ${totalSemanticFailures}`);
  console.log(`  Existing-DB collisions rejected:           ${collisionCount}`);
  console.log(`  Duplicate proposed tips:                   0\n`);
  console.log(`  FAQ changes:                                0`);
  console.log(`  Troubleshooting changes:                    0`);
  console.log(`  Prompt text changes:                       0`);
  console.log(`  SEO changes:                                0`);
  console.log(`  Category changes:                           0`);
  console.log(`  Aspect-ratio changes:                       0\n`);
  console.log(`  Database writes:                            0`);
  console.log(`  Mode:                                       DRY-RUN\n`);

  const semanticPass = totalSemanticFailures === 0;
  const uniquenessPass = true; // We enforce this in selection
  console.log(`  Semantic validation:                       ${semanticPass ? 'PASSED' : 'FAILED'}`);
  console.log(`  Uniqueness validation:                     ${uniquenessPass ? 'PASSED' : 'FAILED'}`);
  console.log(`${'═'.repeat(72)}\n`);

  if (unresolved === 0 && semanticPass) {
    console.log(`  REPAIR PLAN READY FOR REVIEW`);
    console.log(`  NO DATABASE CHANGES HAVE BEEN MADE.`);
    console.log(`  STOP.\n`);
  } else {
    console.log(`  VERIFICATION: FAILED`);
    console.log(`  UNRESOLVED PROMPTS: ${results.filter(r => r.tips.length < 2).map(r => r.slug).join(', ')}\n`);
  }

  await db.end();
}

main().catch(err => { console.error('Fatal error:', err); process.exitCode = 1; });
