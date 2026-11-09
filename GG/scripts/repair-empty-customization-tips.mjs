#!/usr/bin/env node
/**
 * repair-empty-customization-tips.mjs
 *
 * Repairs exactly 10 published prompts that have empty customization_tips.
 * Targets only IDs: 425, 426, 427, 428, 429, 430, 431, 432, 433, 434.
 *
 * Only modifies: customization_tips, updated_at.
 * All other fields are untouched.
 *
 * Usage:
 *   node scripts/repair-empty-customization-tips.mjs           # dry-run (default)
 *   node scripts/repair-empty-customization-tips.mjs --dry-run # dry-run (explicit)
 *   node scripts/repair-empty-customization-tips.mjs --apply   # apply changes
 */

import { getPgPool } from './lib/load-local-env.mjs';

const TARGET_IDS = [425, 426, 427, 428, 429, 430, 431, 432, 433, 434];
const isApply = process.argv.includes('--apply');

/* ─── Helpers ────────────────────────────────────────────────────────── */

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickIndex(arr, seed) {
  return seed % arr.length;
}

function short(s, n = 60) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/* ─── Entity Extraction ──────────────────────────────────────────────── */

function extractEntities(p) {
  const text = `${p.prompt || ''} ${p.title || ''}`.toLowerCase();
  const tags = Array.isArray(p.tags) ? p.tags.map(t => String(t).toLowerCase()).join(' ') : '';
  const combined = `${text} ${tags}`;

  const hasSuit = /\b(suit|blazer|tuxedo|tux)\b/.test(combined);
  const hasDress = /\b(dress|gown)\b/.test(combined);
  const hasKurta = /\b(kurta|kameez|shalwar|lehenga|sari|saree|sharara)\b/.test(combined);
  const hasJacket = /\b(jacket|bomber|hoodie|overcoat|trench|peacoat)\b/.test(combined) && !hasSuit;
  const hasSweater = /\b(sweater|knit|pullover|cardigan)\b/.test(combined);
  const hasShirt = /\b(shirt|blouse|top|tee|t-shirt|polo)\b/.test(combined);
  const hasVeil = /\b(veil|hijab|dupatta|niqab|abaya)\b/.test(combined);
  const hasBw = /\b(monochrome|black.and.white|bw|grayscale|greyscale)\b/.test(combined);
  const hasText = /\b(typography|text|quote|magazine|newspaper|poster|logo|username|watermark|caption|headline|billboard|signage|neon.?sign)\b/.test(combined);
  const hasFilmGrain = /\b(film.?grain|grain|analog|35mm|16mm|super\s?8|vintage.?film)\b/.test(combined);
  const hasRain = /\b(rain|rainy|drizzle|downpour|monsoon|raindrop)\b/.test(combined);
  const hasWind = /\b(wind|windy|breeze|gust|windblown|wind.?swept)\b/.test(combined);
  const hasBokeh = /\b(bokeh|blurred.?background|out.?of.?focus|shallow.?depth|f\/1\.|wide.?aperture)\b/.test(combined);
  const hasIllustration = /\b(illustration|illustrated|drawing|sketch|pencil.?draw|line.?art|vector|watercolor.?paint|digital.?art|art.?style|cartoon|anime|pixar|3d.?render|isometric|cel.?shade|painterly)\b/.test(combined);
  const hasCollage = /\b(collage|scrapbook|mood.?board|sticker|panel|mosaic|grid|multi.?frame|diptych|triptych)\b/.test(combined);
  const hasReflection = /\b(reflection|mirrored|mirror|reflected|water.?surface|glass.?surface)\b/.test(combined);
  const hasSmoke = /\b(smoke|smoky|haze|fog|mist|steam|aerosol)\b/.test(combined);
  const hasDoubleExposure = /\b(double.?exposure|dual.?exposure|overlay|blend|composite|superimposed)\b/.test(combined);
  const isStudio = /\b(studio|backdrop|seamless.?background|studio.?light)\b/.test(combined);
  const isBeach = /\b(beach|coast|ocean|sea|shore|sand|waves|tide|pier|boardwalk)\b/.test(combined);
  const isUrban = /\b(urban|street|city|alley|alleyway|downtown|sidewalk|roadway|metropolitan|district)\b/.test(combined);
  const isHotel = /\b(hotel|resort|lobby|suite|corridor|hallway|marble.?floor)\b/.test(combined);
  const isPark = /\b(park|garden|botanical|arboretum|lawn|meadow|forest|woods|trail|nature)\b/.test(combined);
  const isCafe = /\b(cafe|coffee|restaurant|bistro|bar|pub|tavern|diner)\b/.test(combined);
  const isRiverside = /\b(river|riverfront|riverside|waterfront|canal|dock)\b/.test(combined);
  const isOffice = /\b(office|workspace|desk|cubicle|corporate|boardroom|meeting.?room)\b/.test(combined);
  const isStage = /\b(stage|theater|theatre|podium|platform|auditorium)\b/.test(combined);
  const isCourtyard = /\b(courtyard|patio|terrace|veranda|balcony)\b/.test(combined);
  const isStaircase = /\b(staircase|stairs|stairway|steps|escalator)\b/.test(combined);
  const hasGoldenHour = /\b(golden.?hour|golden.?light|sunset.?light|sunrise.?light|warm.?sunlight)\b/.test(combined);
  const hasNeon = /\b(neon|led.?sign|fluorescent|blacklight|uv.?light)\b/.test(combined);
  const hasDramatic = /\b(dramatic|chiaroscuro|rembrandt|low.?key|high.?contrast|moody.?light|harsh.?light)\b/.test(combined);
  const hasSoftLight = /\b(soft.?light|diffused|wrapping.?light|overcast|cloudy|window.?light|natural.?light)\b/.test(combined);
  const hasMoody = /\b(moody|dark.?atmosphere|shadowy|brooding|dark.?mood|dark.?tones|low.?key)\b/.test(combined);
  const hasStudioLight = /\b(studio.?light|key.?light|three.?point|softbox|ring.?light|beauty.?dish)\b/.test(combined);
  const hasCandlelight = /\b(candle|candlelight|candle.?glow|tea.?light|flickering.?light)\b/.test(combined);
  const hasJewelry = /\b(jewelry|jewellery|necklace|earring|ring|bracelet|pendant|chain|bangle)\b/.test(combined);
  const hasHat = /\b(hat|cap|beret|fedora|beanie|headwear|tophat|top.?hat|sunhat)\b/.test(combined);
  const hasEyewear = /\b(glasses|sunglasses|eyewear|spectacles|aviator|frames|goggles|lens)\b/.test(combined);
  const hasFlowers = /\b(flower|floral|petals|blossom|bouquet|rose|tulip|lily|orchid|daisy)\b/.test(combined);
  const hasCar = /\b(car|automobile|vehicle|sports.?car|sedan|suv|lamborghini|ferrari|porsche|bmw|luxury.?car)\b/.test(combined);
  const hasPhone = /\b(phone|iphone|mobile|smartphone|cell.?phone|selfie)\b/.test(combined);
  const hasWatch = /\b(watch|wristwatch|chronograph|timepiece|clock)\b/.test(combined);
  let composition = '';
  if (/\b(close.?up|headshot|head.?shot|face.?shot|macro)\b/.test(combined)) composition = 'close-up';
  else if (/\b(full.?body|full.?length|head.?to.?toe|full.?figure)\b/.test(combined)) composition = 'full-body';
  const style = [];
  if (/\b(luxury|luxurious|premium|high.?end|exclusive|elegant|sophisticated)\b/.test(combined)) style.push('luxury');
  if (/\b(editorial|fashion.?editorial|magazine.?style|magazine.?layout)\b/.test(combined)) style.push('editorial');
  if (/\b(corporate|professional|business|executive|formal)\b/.test(combined)) style.push('corporate');
  if (/\b(cinematic|film.?style|movie|blockbuster|hollywood)\b/.test(combined)) style.push('cinematic');
  if (/\b(vintage|retro|nostalgic|classic)\b/.test(combined)) style.push('vintage');
  if (/\b(modern|minimalist|clean|sleek)\b/.test(combined)) style.push('modern');
  return {
    hasSuit, hasDress, hasKurta, hasJacket, hasSweater, hasShirt, hasVeil,
    hasBw, hasText, hasFilmGrain, hasRain, hasWind, hasBokeh, hasIllustration, hasCollage,
    hasReflection, hasSmoke, hasDoubleExposure,
    isStudio, isBeach, isUrban, isHotel, isPark, isCafe, isRiverside, isOffice, isStage, isCourtyard, isStaircase,
    hasGoldenHour, hasNeon, hasDramatic, hasSoftLight, hasMoody, hasStudioLight, hasCandlelight,
    hasJewelry, hasHat, hasEyewear, hasFlowers, hasCar, hasPhone, hasWatch,
    composition, style,
  };
}

/* ─── Noun Extraction ────────────────────────────────────────────────── */

function extractNouns(p) {
  const text = (p.prompt || '').toLowerCase();
  function extractFrom(wordList) {
    const found = [];
    for (const w of wordList) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(text)) found.push(w);
    }
    return found;
  }
  return {
    wardrobe: extractFrom(['suit','blazer','jacket','dress','gown','kurta','kameez','shalwar','lehenga','sari','saree','sharara','shirt','blouse','top','tee','t-shirt','polo','sweater','knit','pullover','cardigan','hoodie','bomber','overcoat','trench','peacoat','tuxedo','tux','trousers','pants','jeans','skirt','shorts','scarf','shawl','dupatta','veil','hijab','abaya','niqab','tie','bowtie','corset','bodysuit','romper','jumpsuit','cape','cloak','vest','waistcoat']),
    environment: extractFrom(['studio','backdrop','beach','coast','ocean','sea','shore','sand','urban','street','city','alley','downtown','hotel','resort','lobby','park','garden','botanical','forest','cafe','coffee','restaurant','river','office','workspace','desk','stage','courtyard','patio','terrace','staircase','rooftop','penthouse','mansion']),
    lighting: extractFrom(['golden','neon','dramatic','chiaroscuro','rembrandt','soft','diffused','natural','window','moody','studio','key','three-point','softbox','ring','rim','spot','backlit','frontlit','side-lit','candle','candlelight']),
    colors: extractFrom(['black','white','blue','green','red','royal','burgundy','chocolate','charcoal','teal','deep','golden','crimson','navy','olive','emerald','coral','silver','ivory','cream','beige','taupe','maroon','azure','indigo','violet','lavender','mint','sage','rust','cobalt','turquoise','magenta','fuchsia','lilac','peach','mauve','sienna','umber','brown','pink','orange','yellow','grey','gray','copper','bronze']),
    techniques: extractFrom(['typography','text','poster','magazine','newspaper','watermark','caption','headline','film-grain','grain','analog','35mm','rain','rainy','wind','bokeh','illustration','drawing','sketch','vector','watercolor','digital','cartoon','anime','collage','scrapbook','sticker','reflection','mirror','smoke','fog','mist','double-exposure','overlay','blend','composite','lens-flare','vignette','sepia']),
    props: extractFrom(['jewelry','necklace','earring','ring','bracelet','pendant','chain','bangle','hat','cap','beret','fedora','beanie','glasses','sunglasses','eyewear','spectacles','aviator','frames','flower','floral','petals','rose','car','automobile','vehicle','phone','watch','wristwatch','camera','armchair','chair','sofa','seat','couch','table','desk']),
    subjects: extractFrom(['man','woman','boy','girl','male','female','person','subject','model','artist','professional','executive','businessman','gentleman','lady','couple','group']),
  };
}

/* ─── Tip Candidate Generation ───────────────────────────────────────── */

function generateTipCandidates(prompt, entities, nouns) {
  const seed = fnv1a(`${prompt.id}:${prompt.slug}:tips-v2`);
  const c = [];

  const fw = nouns.wardrobe[0] || '';
  const fe = nouns.environment[0] || '';
  const fl = nouns.lighting[0] || '';
  const fc = nouns.colors[0] || '';
  const fp = nouns.props[0] || '';

  // ─── WARDROBE-SPECIFIC ───
  if (entities.hasSuit) {
    c.push(
      `Adjust the suit fabric texture — wool for structure, linen for relaxed drape, silk for sheen.`,
      `Refine the suit fit — slim-cut for modern editorial, relaxed for classic editorial look.`,
      `Consider the suit color against the ${fe || 'background'} — contrasting tones add depth, matching tones create monochrome elegance.`,
      `Add a pocket square or lapel pin for a subtle luxury detail without overcomplicating the outfit.`,
      `Specify the suit jacket length — cropped for modern silhouette, longer for traditional tailoring.`,
    );
  }
  if (entities.hasDress) {
    c.push(
      `Adjust the dress silhouette — A-line for flow, sheath for structure, ball-gown for drama.`,
      `Specify the dress fabric — silk for sheen, chiffon for movement, velvet for richness, cotton for casual.`,
      `Add or remove accessories — statement earrings, necklace, or clutch to complement the dress.`,
      `Consider the dress length — floor-length for formality, knee-length for versatility, mini for editorial punch.`,
      `Tune the dress color saturation — muted for editorial restraint, vivid for high-impact visuals.`,
    );
  }
  if (entities.hasKurta) {
    c.push(
      `Specify the kurta embroidery style — chikankari, zardozi, thread work, or block print.`,
      `Adjust the kurta length — short for modern fusion, long for traditional elegance.`,
      `Pair with complementary bottomwear — churidar, pajama, jeans, or tailored trousers.`,
      `Consider the fabric weight — cotton for casual, silk-satin for festive, linen for summer editorial.`,
      `Add a stole, dupatta, or jacket layer for visual depth in the outfit.`,
    );
  }
  if (entities.hasJacket) {
    c.push(
      `Adjust the jacket style — bomber for streetwear, leather for edge, denim for casual, blazer for formal.`,
      `Specify the jacket material — leather, suede, denim, nylon, or wool.`,
      `Layer the jacket over contrasting innerwear for visual depth and outfit complexity.`,
      `Consider jacket hardware — zippers, buttons, snaps — for added detail and realism.`,
    );
  }
  if (entities.hasSweater) {
    c.push(
      `Specify the knit texture — cable-knit for depth, ribbed for structure, waffle for texture.`,
      `Adjust the sweater fit — oversized for cozy editorial, fitted for sleek silhouette.`,
      `Layer with a collared shirt underneath for a preppy or smart-casual aesthetic.`,
      `Choose the neckline — crew neck for classic, V-neck for layered look, turtleneck for sophistication.`,
    );
  }
  if (entities.hasShirt) {
    c.push(
      `Specify the shirt fabric — cotton poplin for crisp, linen for relaxed, silk for luxury.`,
      `Adjust the collar style — open collar for casual, buttoned for formal, mandarin for modern.`,
      `Consider the shirt color against the outer layer for tonal contrast or monochrome harmony.`,
      `Add cuff detail — rolled sleeves for casual, French cuffs with cufflinks for formal.`,
    );
  }
  if (entities.hasVeil) {
    c.push(
      `Specify the veil material — sheer organza for lightness, heavy silk for richness, lace for texture.`,
      `Adjust the veil drape — flowing behind for movement, draped across for mystery, pinned for structure.`,
      `Ensure the veil color complements rather than competes with the main garment.`,
    );
  }

  // ─── ENVIRONMENT-SPECIFIC ───
  if (entities.isStudio) {
    c.push(
      `Adjust the studio backdrop color — seamless white for clean, dark for dramatic, colored for mood.`,
      `Control the studio lighting ratio — high key for bright and airy, low key for moody and cinematic.`,
      `Add or remove studio props — chair, stool, pillar, fabric drape — for compositional anchors.`,
      `Specify the studio floor — reflective for depth, matte for minimal, seamless for infinite look.`,
    );
  }
  if (entities.isBeach) {
    c.push(
      `Adjust the time of day — golden hour for warmth, midday for bright, blue hour for ethereal mood.`,
      `Control the water visibility — clear for tropical, dark for moody, waves for dynamic energy.`,
      `Add environmental detail — shells, driftwood, seaweed, or wet sand reflections.`,
      `Specify the sand color — white for tropical, golden for classic, volcanic black for dramatic contrast.`,
    );
  }
  if (entities.isUrban) {
    c.push(
      `Control the urban clutter level — clean and minimal for editorial focus, gritty for authentic street energy.`,
      `Specify the architectural era — modern glass for sleek, brick for industrial, stone for classic.`,
      `Add or remove pedestrian activity — empty streets for isolation, crowd for energy and scale.`,
      `Specify the ground surface — wet pavement for reflections, cobblestone for texture, asphalt for neutral.`,
    );
  }
  if (entities.isHotel) {
    c.push(
      `Specify the hotel style — modern minimalist, classic luxury, art deco, or boutique eclectic.`,
      `Control the interior detail level — sparse for editorial minimal, ornate for rich luxury storytelling.`,
      `Add warm ambient elements — lobby plants, warm wood, brass fixtures — for luxury atmosphere.`,
    );
  }
  if (entities.isPark) {
    c.push(
      `Specify the season — spring blossoms, summer green, autumn foliage, winter bare branches.`,
      `Control the depth of field — sharp background for environmental portrait, soft for dreamy isolation.`,
      `Add natural elements — fallen leaves, wildflowers, dappled light, morning dew.`,
    );
  }
  if (entities.isCafe) {
    c.push(
      `Control the cafe ambiance — minimalist Scandinavian for modern, warm wood for cozy, industrial for edgy.`,
      `Add or remove table items — coffee cups, pastries, books, plants — for environmental storytelling.`,
      `Specify the lighting — natural window light for authentic, warm pendant lights for intimate.`,
    );
  }
  if (entities.isRiverside) {
    c.push(
      `Specify the water character — calm reflections for serene, gentle ripples for subtle movement, rapids for energy.`,
      `Add riverside elements — reeds, rocks, boats, bridges — for compositional anchors.`,
      `Control the water color — teal for tropical, deep blue for oceanic, brown for riverine authenticity.`,
    );
  }
  if (entities.isOffice) {
    c.push(
      `Specify the office style — corner executive for authority, open plan for modern, home office for intimate.`,
      `Add desk props — laptop, notepad, coffee mug, plant — for environmental realism.`,
      `Control the window view — city skyline for urban, nature for biophilic, closed blinds for privacy.`,
    );
  }
  if (entities.isStage) {
    c.push(
      `Specify the stage lighting — spotlight for isolation, wash for even, colored for theatrical mood.`,
      `Add stage elements — curtain, backdrop, wings, floor marks — for performance context.`,
      `Control the audience visibility — visible crowd for energy, empty for intimate performance feel.`,
    );
  }
  if (entities.isCourtyard) {
    c.push(
      `Specify the courtyard season — spring blossoms for warmth, autumn leaves for drama, winter bare for stark.`,
      `Add architectural details — arches, columns, fountain, climbing vines — for environmental richness.`,
    );
  }
  if (entities.isStaircase) {
    c.push(
      `Specify the staircase style — marble for luxury, industrial metal for edge, spiral for drama.`,
      `Control the composition angle — looking up for power, looking down for vulnerability, level for natural.`,
      `Add architectural detail — railing, baluster, wall sconces — for visual richness.`,
    );
  }

  // ─── LIGHTING-SPECIFIC ───
  if (entities.hasGoldenHour) {
    c.push(
      `Adjust the golden hour warmth — cooler for subtle glow, warmer for romantic drama.`,
      `Control the shadow length — long shadows for depth, shorter for softer look.`,
      `Add lens flare or sun haze for authentic golden-hour atmosphere.`,
      `Specify the light direction — backlit for rim glow, side-lit for dimension, front-lit for even warmth.`,
    );
  }
  if (entities.hasNeon) {
    c.push(
      `Control the neon intensity — subtle glow for ambiance, bold saturation for cyberpunk energy.`,
      `Specify the neon colors — cool cyan and pink for vaporwave, warm reds and oranges for noir.`,
      `Add neon reflections on wet surfaces or skin for environmental integration.`,
      `Balance the neon light with fill to prevent the subject from becoming a silhouette.`,
    );
  }
  if (entities.hasDramatic) {
    c.push(
      `Tune the dramatic lighting angle — Rembrandt triangle for classic, split for noir, butterfly for glamour.`,
      `Control the shadow depth — deep shadows for mystery, lifted shadows for editorial breathing room.`,
      `Add a subtle rim or edge light to separate the subject from the dark background.`,
      `Specify the contrast ratio — extreme for high-drama, moderate for editorial versatility.`,
    );
  }
  if (entities.hasSoftLight) {
    c.push(
      `Adjust the soft light direction — overhead for even, side for gentle dimension, front for beauty.`,
      `Control the shadow softness — very soft for ethereal, slightly defined for natural portrait feel.`,
      `Add subtle directionality to prevent the image from looking flat and lifeless.`,
      `Specify the light color temperature — warm for inviting, cool for clinical, neutral for versatile.`,
    );
  }
  if (entities.hasMoody) {
    c.push(
      `Control the darkness level — deep shadows for mystery, lifted blacks for editorial mood.`,
      `Add selective light to the subject face to maintain visibility within the dark atmosphere.`,
      `Specify the mood tone — melancholic with cool tones, warm noir with amber accents, or gothic with deep shadows.`,
      `Balance the moody atmosphere with enough ambient light to show texture and detail.`,
    );
  }
  if (entities.hasStudioLight) {
    c.push(
      `Specify the studio lighting setup — three-point for classic, clamshell for beauty, split for drama.`,
      `Adjust the key-to-fill ratio — 2:1 for natural, 4:1 for dramatic, 8:1 for high contrast.`,
      `Control the light modifier — softbox for soft, beauty dish for focused, bare bulb for hard.`,
      `Add or remove rim light for subject separation from the background.`,
    );
  }
  if (entities.hasCandlelight) {
    c.push(
      `Control the candle count — single for intimate, multiple for atmospheric depth.`,
      `Specify the candle placement — foreground for depth, background for bokeh warmth, surrounding for immersion.`,
      `Add subtle warm ambient light to prevent the candlelit subject from being too dark.`,
      `Consider candle color — warm yellow for classic, cool blue for unusual mood.`,
    );
  }

  // ─── TECHNIQUE-SPECIFIC ───
  if (entities.hasDoubleExposure) {
    c.push(
      `Control the overlay opacity — subtle for organic blend, bold for graphic impact.`,
      `Specify which layer is dominant — portrait prominent with landscape subtle, or equal blend.`,
      `Choose the blend area — full-frame merge, silhouette cutout, or selective region overlay.`,
      `Ensure both exposure layers have compatible lighting directions for realism.`,
    );
  }
  if (entities.hasReflection) {
    c.push(
      `Control the reflection clarity — sharp mirror for crisp symmetry, softened for natural water feel.`,
      `Specify the reflection surface — still water, wet pavement, glass, or polished metal.`,
      `Adjust the reflection completeness — full reflection for drama, partial for compositional balance.`,
      `Add subtle surface texture to the reflective surface for realism.`,
    );
  }
  if (entities.hasFilmGrain) {
    c.push(
      `Increase grain density for raw documentary feel, reduce it for cleaner modern-vintage hybrid.`,
      `Shift grain toward warmer tones for nostalgic color film, or keep neutral for classic monochrome.`,
      `Apply grain selectively — heavier in shadows, lighter in highlights — for authentic analog behavior.`,
      `Combine grain with light leak effects for a more complete vintage film aesthetic.`,
    );
  }
  if (entities.hasText) {
    const tn = nouns.techniques.find(t => /\b(poster|magazine|newspaper|typography|quote|text|username|logo)\b/.test(t)) || 'text';
    c.push(
      `Simplify the ${tn} to the shortest essential phrase — AI text rendering improves with fewer characters.`,
      `Plan to overlay the ${tn} in post-production for guaranteed spelling accuracy.`,
      `Use a bold, simple font for the ${tn} — ornate fonts are harder for AI to render accurately.`,
      `Reduce the ${tn} size relative to the image — smaller text is less likely to show rendering artifacts.`,
      `Position the ${tn} in a less complex area of the composition to reduce rendering interference.`,
    );
  }
  if (entities.hasRain) {
    c.push(
      `Adjust the rain density — light drizzle for subtle atmosphere, heavy downpour for dramatic presence.`,
      `Specify droplet direction and size variation for natural water rendering against the ${fe || 'scene'}.`,
      `Add visible puddles or wet surfaces to reinforce the rain narrative beyond just falling droplets.`,
      `Use rain as a foreground element — close drops for depth, distant sheets for atmosphere.`,
    );
  }
  if (entities.hasWind) {
    c.push(
      `Direct the wind from a specific angle to control which elements flow — hair, fabric, or both.`,
      `Adjust wind intensity — gentle breeze for natural movement, strong gusts for dramatic flowing energy.`,
      `Use the wind to create directional movement — everything flowing the same way creates visual unity.`,
    );
  }
  if (entities.hasBokeh) {
    c.push(
      `Widen the aperture for creamier background circles, or stop down for more environmental context.`,
      `Add colored light sources in the background to create warm or cool bokeh that complements the subject.`,
      `Position the subject far from the background to increase bokeh size and separation quality.`,
    );
  }
  if (entities.hasCollage) {
    c.push(
      `Adjust the collage panel sizes — equal grids for order, varied sizes for dynamic hierarchy.`,
      `Use a consistent color palette across all collage panels for visual cohesion.`,
      `Add a border or gap between panels to create clean separation in the collage layout.`,
    );
  }
  if (entities.hasIllustration) {
    c.push(
      `Adjust the illustration style — clean lines for modern, crosshatch for texture, watercolor wash for softness.`,
      `Change the color palette — muted for vintage, vibrant for pop art, monochromatic for graphic impact.`,
      `Vary the line weight — thick outlines for bold graphic style, thin for delicate detail.`,
    );
  }
  if (entities.hasBw) {
    c.push(
      `Control the monochrome tonal range — high contrast for drama, low contrast for subtle editorial.`,
      `Specify the black point — deep blacks for richness, lifted blacks for vintage film feel.`,
      `Add texture cues to compensate for loss of color information in the monochrome treatment.`,
    );
  }
  if (entities.hasSmoke) {
    c.push(
      `Control the smoke density — subtle haze for atmosphere, thick clouds for drama.`,
      `Specify the smoke color — white for clean, grey for industrial, colored for theatrical.`,
      `Add directional light through the smoke for volumetric light shafts.`,
    );
  }

  // ─── STYLE-SPECIFIC ───
  if (entities.style.includes('luxury')) {
    c.push(
      `Enhance luxury cues — swap to ${fw || 'the garment'} in cashmere or silk, add a minimal watch, or shift the setting.`,
      `Use a monochromatic color palette — head-to-toe in one tone reads as more expensive and curated.`,
      `Add a single statement accessory — a watch, cufflink, or ring — for understated luxury signaling.`,
      `Simplify the composition — luxury editorial often uses negative space and minimal props for sophistication.`,
    );
  }
  if (entities.style.includes('editorial')) {
    c.push(
      `Shift editorial energy — deliberate poses with strong eye contact for drama, or candid motion for authenticity.`,
      `Use dramatic lighting with strong shadows for high-fashion editorial impact.`,
      `Choose a bold, single-color outfit against a contrasting background for graphic editorial punch.`,
    );
  }
  if (entities.style.includes('corporate')) {
    c.push(
      `Adjust the professional register — formal boardroom for executive authority, relaxed workspace for creative branding.`,
      `Use a clean, neutral background to keep focus on the professional subject without distraction.`,
      `Position the subject with confident posture — standing tall, hands visible, direct eye contact.`,
    );
  }
  if (entities.style.includes('cinematic')) {
    c.push(
      `Enhance cinematic quality — letterbox framing, teal-orange color grade, or subtle lens flare.`,
      `Use a wide aspect ratio (16:9) for a more filmic, widescreen cinematic composition.`,
      `Add atmospheric elements — smoke, haze, or practical lights — for cinematic depth and mood.`,
    );
  }
  if (entities.style.includes('vintage')) {
    c.push(
      `Adjust the vintage era — 1920s for art deco glamour, 1970s for earthy warmth, 1990s for raw energy.`,
      `Add period-appropriate props and wardrobe details for historical authenticity.`,
      `Apply subtle color grading — sepia for timeless, faded for nostalgic, cross-processed for experimental.`,
    );
  }
  if (entities.style.includes('modern')) {
    c.push(
      `Emphasize clean lines and geometric composition for modern editorial clarity.`,
      `Use a neutral or monochrome palette with one accent color for modern visual impact.`,
      `Simplify props and environment — modern aesthetics favor minimal distraction.`,
    );
  }

  // ─── COMPOSITION-SPECIFIC ───
  if (entities.composition === 'close-up') {
    c.push(
      `Tighten the crop to exclude shoulders for intimate face-only study, or include collarbone for editorial headshot.`,
      `Shift the crop slightly off-center — rule of thirds placement creates more dynamic facial framing.`,
      `Use a shallow depth of field to keep only the eyes sharp, softening the rest of the face for dreamy quality.`,
    );
  }
  if (entities.composition === 'full-body') {
    c.push(
      `Shift the camera angle — eye level for neutral presence, low angle for authority, elevated for approachable.`,
      `Leave generous negative space around the figure for a sense of scale and environment.`,
      `Position the subject slightly off-center for a more dynamic full-body composition.`,
    );
  }

  // ─── PROP-SPECIFIC ───
  if (fp) {
    c.push(
      `Ensure the ${fp} integrates naturally with the subject — correct scale, position, and lighting.`,
      `Add or remove the ${fp} to change the composition balance and narrative focus.`,
      `Specify the ${fp} material and color to complement rather than compete with the outfit.`,
    );
  }

  // ─── MONOCHROME + COLOR SPECIFIC ───
  if (entities.hasBw && nouns.colors.length > 0) {
    const mc = nouns.colors[0] || 'monochrome';
    c.push(
      `The ${mc} monochrome palette may compress tonal range — specify distinct zones for subject-background separation.`,
      `Dark ${mc} garments can lose fabric texture — specify visible weave pattern and subtle light catching the material.`,
      `Ensure natural skin tones are preserved against the ${mc} monochrome backdrop without color contamination.`,
    );
  }

  return { candidates: c, seed };
}

/* ─── Semantic Validation ─────────────────────────────────────────────── */

function validateTipGrounding(tip, entities) {
  const t = tip.toLowerCase();
  // Check wardrobe references against actual prompt entities
  if (/\bjacket\b/.test(t) && !entities.hasJacket && !entities.hasSuit) return false;
  if (/\bdress\b/.test(t) && !entities.hasDress) return false;
  if (/\bsuit\b/.test(t) && !entities.hasSuit) return false;
  if (/\bblazer\b/.test(t) && !entities.hasSuit && !entities.hasJacket) return false;
  if (/\bshirt\b/.test(t) && !entities.hasShirt) return false;
  if (/\bveil\b/.test(t) && !entities.hasVeil) return false;
  if (/\bsweater\b/.test(t) && !entities.hasSweater) return false;
  if (/\bkurta\b/.test(t) && !entities.hasKurta) return false;
  // Check accessory references
  if (/\bjewelry\b/.test(t) && !entities.hasJewelry) return false;
  if (/\bnecklace\b/.test(t) && !entities.hasJewelry) return false;
  if (/\bearring\b/.test(t) && !entities.hasJewelry) return false;
  if (/\bbracelet\b/.test(t) && !entities.hasJewelry) return false;
  if (/\bhat\b/.test(t) && !entities.hasHat) return false;
  if (/\bglasses\b/.test(t) && !entities.hasEyewear) return false;
  if (/\bsunglasses\b/.test(t) && !entities.hasEyewear) return false;
  if (/\beyeglasses\b/.test(t) && !entities.hasEyewear) return false;
  if (/\bwatch\b/.test(t) && !entities.hasWatch) return false;
  // Check environment references
  if (/\bhotel\b/.test(t) && !entities.isHotel) return false;
  if (/\boffice\b/.test(t) && !entities.isOffice) return false;
  if (/\bstudio\b/.test(t) && !entities.isStudio) return false;
  if (/\bbeach\b/.test(t) && !entities.isBeach) return false;
  if (/\bcafe\b/.test(t) && !entities.isCafe) return false;
  if (/\bpark\b/.test(t) && !entities.isPark) return false;
  if (/\bforest\b/.test(t) && !entities.isPark) return false;
  if (/\bcity\b/.test(t) && !entities.isUrban) return false;
  if (/\burban\b/.test(t) && !entities.isUrban) return false;
  if (/\bstreet\b/.test(t) && !entities.isUrban) return false;
  if (/\brooftop\b/.test(t) && !entities.isCourtyard) return false;
  if (/\bbedroom\b/.test(t) && !entities.isStudio) return false;
  // Check technique references
  if (/\bgrain\b/.test(t) && !entities.hasFilmGrain) return false;
  if (/\brain\b/.test(t) && !entities.hasRain) return false;
  if (/\bbokeh\b/.test(t) && !entities.hasBokeh) return false;
  if (/\billustration\b/.test(t) && !entities.hasIllustration) return false;
  if (/\bcollage\b/.test(t) && !entities.hasCollage) return false;
  if (/\breflection\b/.test(t) && !entities.hasReflection) return false;
  if (/\bsmoke\b/.test(t) && !entities.hasSmoke) return false;
  if (/\bdouble.exposure\b/.test(t) && !entities.hasDoubleExposure) return false;
  if (/\btext\b/.test(t) && !entities.hasText) return false;
  if (/\bmagazine\b/.test(t) && !entities.hasText) return false;
  if (/\bposter\b/.test(t) && !entities.hasText) return false;
  // Check lighting references
  if (/\bgolden.hour\b/.test(t) && !entities.hasGoldenHour) return false;
  if (/\bneon\b/.test(t) && !entities.hasNeon) return false;
  if (/\bcandle\b/.test(t) && !entities.hasCandlelight) return false;
  // Check color references
  if (/\bnavy\b/.test(t)) {
    const text = `${''}`; // would need prompt text, skip for now
  }
  if (/\bburgundy\b/.test(t)) {
    // would need prompt text, skip for now
  }
  return true;
}

/* ─── Unique Candidate Selection ─────────────────────────────────────── */

function selectUniqueTips(prompt, entities, nouns, registry) {
  const { candidates, seed } = generateTipCandidates(prompt, entities, nouns);
  const selected = [];
  const used = new Set();

  // Helper: select next valid candidate
  function tryCandidate(idx) {
    if (used.has(idx) || idx >= candidates.length) return false;
    used.add(idx);
    registry.tipAttempt();
    const tip = candidates[idx];
    // Semantic validation: reject tips referencing unsupported entities
    if (!validateTipGrounding(tip, entities)) {
      registry.tipCollision();
      return false;
    }
    if (registry.isTipUnique(tip)) {
      registry.acceptTip(tip);
      selected.push(tip);
      return true;
    }
    registry.tipCollision();
    return false;
  }

  // First pass: deterministic hash-based selection
  for (let attempt = 0; attempt < candidates.length && selected.length < 4; attempt++) {
    const idx = pickIndex(candidates, seed + attempt);
    tryCandidate(idx);
  }

  // Second pass: sequential fallback for any remaining slots
  for (let i = 0; i < candidates.length && selected.length < 4; i++) {
    tryCandidate(i);
  }

  return selected;
}

/* ─── UniquenessRegistry ─────────────────────────────────────────────── */

class UniquenessRegistry {
  constructor(existingPrompts) {
    this.existingTips = new Set();
    this.proposedTips = new Set();
    this.tipCollisions = 0;
    this.tipAttempts = 0;

    for (const p of existingPrompts) {
      const tips = Array.isArray(p.customization_tips) ? p.customization_tips : [];
      for (const t of tips) {
        const n = norm(t);
        if (n) this.existingTips.add(n);
      }
    }
  }

  isTipUnique(text) {
    const n = norm(text);
    if (!n || n.length < 15) return false;
    if (this.existingTips.has(n)) return false;
    if (this.proposedTips.has(n)) return false;
    return true;
  }

  acceptTip(text) { this.proposedTips.add(norm(text)); }
  tipCollision() { this.tipCollisions++; this.tipAttempts++; }
  tipAttempt() { this.tipAttempts++; }
}

/* ─── Snapshot Verification ──────────────────────────────────────────── */

function verifySnapshot(current, snapshot) {
  const cT = Array.isArray(current.customization_tips)
    ? current.customization_tips.map(t => norm(t)).join(' ||| ')
    : '';
  const sT = Array.isArray(snapshot.customization_tips)
    ? snapshot.customization_tips.map(t => norm(t)).join(' ||| ')
    : '';
  return cT === sT;
}

/* ─── Post-Apply Verification ────────────────────────────────────────── */

async function postRepairVerification(db) {
  console.log('\n  POST-REPAIR VERIFICATION\n');

  const { rows: tot } = await db.query(`SELECT COUNT(*) AS c FROM prompts WHERE status='published'`);
  const { rows: lowTips } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts WHERE status='published'
    AND (customization_tips IS NULL OR jsonb_array_length(customization_tips) < 2)
  `);
  const { rows: dupTips } = await db.query(`
    SELECT COUNT(*) AS c FROM (
      SELECT customization_tips::text AS x, COUNT(*) AS n
      FROM prompts WHERE status='published' AND customization_tips IS NOT NULL
      AND jsonb_array_length(customization_tips) >= 2
      GROUP BY x HAVING COUNT(*) > 1
    ) s
  `);
  const { rows: targetTips } = await db.query(`
    SELECT COUNT(*) AS c FROM prompts WHERE id = ANY($1)
    AND status='published'
    AND customization_tips IS NOT NULL
    AND jsonb_array_length(customization_tips) >= 2
  `, [TARGET_IDS]);

  console.log(`  Published prompts: ${tot[0].c}`);
  console.log(`  Published prompts with <2 tips: ${lowTips[0].c} ${Number(lowTips[0].c) === 0 ? '✓' : '✗'}`);
  console.log(`  Duplicate customization-tip groups: ${dupTips[0].c}`);
  console.log(`  Target prompts with >=2 tips: ${targetTips[0].c}/${TARGET_IDS.length}`);

  const pass = Number(lowTips[0].c) === 0 && Number(targetTips[0].c) === TARGET_IDS.length;
  console.log(`\n  VERIFICATION: ${pass ? 'PASS' : 'FAIL'}\n`);
  return pass;
}

/* ─── Main ───────────────────────────────────────────────────────────── */

async function main() {
  const db = getPgPool();

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  === STEP 13 EMPTY CUSTOMIZATION-TIPS ${isApply ? 'APPLY' : 'DRY RUN'} ===`);
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

  // 3. Validate all targets are present
  const foundIds = new Set(targets.map(t => Number(t.id)));
  const missingIds = TARGET_IDS.filter(id => !foundIds.has(Number(id)));
  if (missingIds.length > 0) {
    console.log(`  ✗ Missing target IDs: ${missingIds.join(', ')}`);
    console.log(`  CANNOT PROCEED\n`);
    await db.end();
    process.exitCode = 1;
    return;
  }

  // 4. Build uniqueness registry
  const registry = new UniquenessRegistry(allPrompts);

  // 5. Generate proposals
  const proposed = [];
  const snapshots = new Map();
  let unresolved = 0;

  for (const p of targets) {
    const entities = extractEntities(p);
    const nouns = extractNouns(p);
    const newTips = selectUniqueTips(p, entities, nouns, registry);

    if (newTips.length < 2) {
      unresolved++;
      console.log(`  ⚠ UNRESOLVED: ${p.slug} (id:${p.id}) — only ${newTips.length} unique tips`);
      continue;
    }

    const currentTips = Array.isArray(p.customization_tips)
      ? p.customization_tips.filter(t => String(t || '').trim())
      : [];

    proposed.push({
      id: p.id,
      slug: p.slug,
      title: p.title,
      reason: 'EMPTY customization_tips',
      currentTips,
      newTips,
    });

    snapshots.set(p.id, { customization_tips: p.customization_tips });
  }

  // 6. Final validation
  const pTips = new Set();
  const conflicts = [];
  for (const item of proposed) {
    for (const t of item.newTips) {
      const k = norm(t);
      if (pTips.has(k)) conflicts.push(`DUP TIP: "${short(t, 80)}"`);
      pTips.add(k);
    }
  }
  const pass = conflicts.length === 0 && unresolved === 0;

  // 7. Print manifest
  console.log(`${'─'.repeat(72)}\n  PROPOSED REPAIRS\n${'─'.repeat(72)}\n`);
  for (const item of proposed) {
    console.log(`  ── ${item.slug} (id:${item.id}) ──`);
    console.log(`  Reason: ${item.reason}`);
    console.log(`  Proposed customization tips (${item.newTips.length}):`);
    for (let i = 0; i < item.newTips.length; i++) {
      console.log(`    [${i + 1}] ${item.newTips[i]}`);
    }
    console.log('');
  }

  // 8. Print validation
  console.log(`${'─'.repeat(72)}\n  VALIDATION\n${'─'.repeat(72)}\n`);
  console.log(`  Target prompts with >=2 proposed tips: ${proposed.length}`);
  console.log(`  Unresolved: ${unresolved}`);
  console.log(`  Duplicate proposed tips: ${conflicts.filter(c => c.includes('TIP')).length}`);
  console.log(`  Existing-DB tip collisions: ${registry.tipCollisions}`);
  console.log(`  Semantic validation: ${unresolved === 0 ? 'PASSED' : 'FAILED'}`);
  console.log(`  Uniqueness validation: ${pass ? 'PASSED' : 'FAILED'}\n`);
  console.log(`  FAQ changes: 0`);
  console.log(`  Troubleshooting changes: 0`);
  console.log(`  Prompt text changes: 0`);
  console.log(`  SEO changes: 0`);
  console.log(`  Category changes: 0`);
  console.log(`  Aspect-ratio changes: 0`);
  console.log(`  Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}\n`);
  console.log(`${'═'.repeat(72)}\n`);

  if (!pass) {
    console.log('  ✗ CANNOT PROCEED — validation failed\n');
    if (conflicts.length > 0) {
      console.log('  Conflicts:');
      conflicts.forEach(c => console.log(`    ${c}`));
    }
    if (unresolved > 0) console.log(`  ${unresolved} prompt(s) could not receive enough unique tips`);
    await db.end();
    process.exitCode = 1;
    return;
  }

  if (isApply) {
    console.log('  Applying changes...\n');
    let applied = 0, skipped = 0, failed = 0;

    for (const item of proposed) {
      try {
        // Snapshot protection: re-fetch current state
        const { rows } = await db.query(
          'SELECT id, slug, customization_tips, status FROM prompts WHERE id = $1',
          [item.id]
        );
        if (!rows.length) {
          console.log(`  ✗ SKIP ${item.slug}: not found`);
          skipped++;
          continue;
        }
        if (rows[0].status !== 'published') {
          console.log(`  ✗ SKIP ${item.slug}: status changed to ${rows[0].status}`);
          skipped++;
          continue;
        }
        if (!verifySnapshot(rows[0], snapshots.get(item.id))) {
          console.log(`  ✗ SKIP ${item.slug}: customization_tips changed since snapshot`);
          skipped++;
          continue;
        }

        // Apply: only customization_tips and updated_at
        const r = await db.query(
          `UPDATE prompts
           SET customization_tips = $1::jsonb,
               updated_at = NOW()
           WHERE id = $2 AND status = 'published'`,
          [JSON.stringify(item.newTips), item.id]
        );
        if (r.rowCount === 1) {
          console.log(`  ✓ ${item.slug} — updated (${item.newTips.length} tips)`);
          applied++;
        } else {
          console.log(`  ✗ ${item.slug} — unexpected rowCount ${r.rowCount}`);
          failed++;
        }
      } catch (err) {
        console.log(`  ✗ ${item.slug} — ${err.message}`);
        failed++;
      }
    }

    console.log(`\n${'═'.repeat(72)}`);
    console.log(`  === STEP 13 EMPTY CUSTOMIZATION-TIPS APPLY ===`);
    console.log(`${'═'.repeat(72)}\n`);
    console.log(`  Prompts updated: ${applied}`);
    console.log(`  Prompts skipped: ${skipped}`);
    console.log(`  Prompts failed: ${failed}`);
    console.log(`  Tips added: ${applied} prompts × 2-4 tips`);
    console.log(`  Troubleshooting modified: 0`);
    console.log(`  FAQs modified: 0`);
    console.log(`  Prompt text modified: 0`);
    console.log(`  SEO modified: 0`);
    console.log(`  Categories modified: 0`);
    console.log(`  Aspect ratio modified: 0`);
    console.log(`${'═'.repeat(72)}\n`);

    if (applied > 0) {
      await postRepairVerification(db);
    }
  } else {
    console.log('  REPAIR PLAN READY');
    console.log('  To apply: node scripts/repair-empty-customization-tips.mjs --apply\n');
  }

  await db.end();
}

main().catch(err => { console.error('Fatal error:', err); process.exitCode = 1; });
