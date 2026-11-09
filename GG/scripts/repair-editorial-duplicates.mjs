#!/usr/bin/env node
/**
 * repair-editorial-duplicates.mjs
 *
 * Detects and repairs editorial content duplicates across published prompts.
 * Only modifies: customization_tips, prompt_specific_troubleshooting, updated_at.
 * All other fields are untouched.
 *
 * Usage:
 *   node scripts/repair-editorial-duplicates.mjs --dry-run
 *   node scripts/repair-editorial-duplicates.mjs --apply
 */

import { getPgPool } from './lib/load-local-env.mjs';

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

  // Wardrobe
  const hasSuit = /\b(suit|blazer|tuxedo|tux)\b/.test(combined);
  const hasDress = /\b(dress|gown)\b/.test(combined);
  const hasKurta = /\b(kurta|kameez|shalwar|lehenga|sari|saree|sharara)\b/.test(combined);
  const hasJacket = /\b(jacket|bomber|hoodie|overcoat|trench|peacoat|blazer)\b/.test(combined) && !hasSuit;
  const hasSweater = /\b(sweater|knit|pullover|cardigan)\b/.test(combined);
  const hasShirt = /\b(shirt|blouse|top|tee|t-shirt|polo)\b/.test(combined);
  const hasVeil = /\b(veil|hijab|dupatta|niqab|abaya)\b/.test(combined);

  // Monochrome / B&W
  const hasBw = /\b(monochrome|black.and.white|bw|grayscale|greyscale|black & white)\b/.test(combined);

  // Techniques
  const hasText = /\b(typography|text|quote|magazine|newspaper|poster|logo|username|watermark|caption|headline|billboard|signage|neon.?sign)\b/.test(combined);
  const hasFilmGrain = /\b(film.?grain|grain|analog|35mm|16mm|super\s?8|vintage.?film)\b/.test(combined);
  const hasRain = /\b(rain|rainy|drizzle|downpour|monsoon|raindrop)\b/.test(combined);
  const hasWind = /\b(wind|windy|breeze|gust|windblown|wind.?swept|windy)\b/.test(combined);
  const hasBokeh = /\b(bokeh|blurred.?background|out.?of.?focus|shallow.?depth|f\/1\.|wide.?aperture)\b/.test(combined);
  const hasIllustration = /\b(illustration|illustrated|drawing|sketch|pencil.?draw|line.?art|vector|watercolor.?paint|digital.?art|art.?style|cartoon|anime|pixar|3d.?render|isometric|cel.?shade|painterly)\b/.test(combined);
  const hasCollage = /\b(collage|scrapbook|mood.?board|sticker|panel|mosaic|grid|multi.?frame|diptych|triptych)\b/.test(combined);
  const hasReflection = /\b(reflection|mirrored|mirror|reflected|water.?surface|glass.?surface)\b/.test(combined);
  const hasSmoke = /\b(smoke|smoky|haze|fog|mist|steam|aerosol)\b/.test(combined);
  const hasDoubleExposure = /\b(double.?exposure|dual.?exposure|overlay|blend|composite|superimposed)\b/.test(combined);

  // Environments
  const isStudio = /\b(studio|backdrop|seamless.?background|studio.?light)\b/.test(combined);
  const isBeach = /\b(beach|coast|ocean|sea|shore|sand|waves|tide|pier|boardwalk)\b/.test(combined);
  const isUrban = /\b(urban|street|city|alley|alleyway|downtown|sidewalk|roadway|metropolitan|district|neighborhood|neighborhood)\b/.test(combined);
  const isHotel = /\b(hotel|resort|lobby|suite|corridor|hallway|marble.?floor)\b/.test(combined);
  const isPark = /\b(park|garden|botanical|arboretum|lawn|meadow|forest|woods|trail|nature)\b/.test(combined);
  const isCafe = /\b(cafe|coffee|restaurant|bistro|bar|pub|tavern|diner)\b/.test(combined);
  const isRiverside = /\b(river|riverfront|riverside|waterfront|canal|dock|pier)\b/.test(combined);
  const isOffice = /\b(office|workspace|desk|cubicle|corporate|boardroom|meeting.?room)\b/.test(combined);
  const isStage = /\b(stage|theater|theatre|podium|platform|auditorium)\b/.test(combined);
  const isCourtyard = /\b(courtyard|patio|terrace|veranda|balcony)\b/.test(combined);
  const isStaircase = /\b(staircase|stairs|stairway|steps|escalator)\b/.test(combined);

  // Lighting
  const hasGoldenHour = /\b(golden.?hour|golden.?light|sunset.?light|sunrise.?light|warm.?sunlight)\b/.test(combined);
  const hasNeon = /\b(neon|led.?sign|fluorescent|blacklight|uv.?light)\b/.test(combined);
  const hasDramatic = /\b(dramatic|chiaroscuro|rembrandt|low.?key|high.?contrast|moody.?light|harsh.?light)\b/.test(combined);
  const hasSoftLight = /\b(soft.?light|diffused|wrapping.?light|overcast|cloudy|window.?light|natural.?light)\b/.test(combined);
  const hasMoody = /\b(moody|dark.?atmosphere|shadowy|brooding|dark.?mood|dark.?tones|low.?key)\b/.test(combined);
  const hasStudioLight = /\b(studio.?light|key.?light|three.?point|softbox|ring.?light|beauty.?dish)\b/.test(combined);
  const hasCandlelight = /\b(candle|candlelight|candle.?glow|tea.?light|flickering.?light)\b/.test(combined);

  // Props
  const hasJewelry = /\b(jewelry|jewellery|necklace|earring|ring|bracelet|pendant|chain|bangle)\b/.test(combined);
  const hasHat = /\b(hat|cap|beret|fedora|beanie|headwear|tophat|top.?hat|sunhat)\b/.test(combined);
  const hasEyewear = /\b(glasses|sunglasses|eyewear|spectacles|aviator|frames|goggles|lens)\b/.test(combined);
  const hasFlowers = /\b(flower|floral|petals|blossom|bouquet|rose|tulip|lily|orchid|daisy)\b/.test(combined);
  const hasCar = /\b(car|automobile|vehicle|sports.?car|sedan|suv|lamborghini|ferrari|porsche|bmw|luxury.?car)\b/.test(combined);
  const hasPhone = /\b(phone|iphone|mobile|smartphone|cell.?phone|selfie)\b/.test(combined);
  const hasWatch = /\b(watch|wristwatch|chronograph|timepiece|clock)\b/.test(combined);

  // Composition
  let composition = '';
  if (/\b(close.?up|headshot|head.?shot|face.?shot|macro)\b/.test(combined)) composition = 'close-up';
  else if (/\b(full.?body|full.?length|head.?to.?toe|full.?figure)\b/.test(combined)) composition = 'full-body';

  // Style
  const style = [];
  if (/\b(luxury|luxurious|premium|high.?end|exclusive|elegant|sophisticated)\b/.test(combined)) style.push('luxury');
  if (/\b(editorial|fashion.?editorial|magazine.?style|magazine.?layout)\b/.test(combined)) style.push('editorial');
  if (/\b(corporate|professional|business|executive|formal)\b/.test(combined)) style.push('corporate');
  if (/\b(cinematic|film.?style|movie|blockbuster|hollywood)\b/.test(combined)) style.push('cinematic');
  if (/\b(vintage|retro|nostalgic|classic)\b/.test(combined)) style.push('vintage');
  if (/\b(modern|minimalist|clean|sleek)\b/.test(combined)) style.push('modern');

  return {
    hasSuit, hasDress, hasKurta, hasJacket, hasSweater, hasShirt, hasVeil,
    hasBw,
    hasText, hasFilmGrain, hasRain, hasWind, hasBokeh, hasIllustration, hasCollage,
    hasReflection, hasSmoke, hasDoubleExposure,
    isStudio, isBeach, isUrban, isHotel, isPark, isCafe, isRiverside, isOffice, isStage, isCourtyard, isStaircase,
    hasGoldenHour, hasNeon, hasDramatic, hasSoftLight, hasMoody, hasStudioLight, hasCandlelight,
    hasJewelry, hasHat, hasEyewear, hasFlowers, hasCar, hasPhone, hasWatch,
    composition,
    style,
  };
}

/* ─── Noun Extraction ────────────────────────────────────────────────── */

function extractNouns(p) {
  const text = p.prompt || '';

  const colorWords = ['black','white','blue','green','red','royal','burgundy','chocolate','charcoal','teal','deep','golden','crimson','navy','olive','emerald','coral','silver','ivory','cream','beige','taupe','maroon','azure','indigo','violet','lavender','mint','sage','rust','cobalt','turquoise','magenta','fuchsia','lilac','peach','mauve','sienna','umber','brown','pink','orange','yellow','grey','gray','copper','bronze','ochre','monochrome','matte','glossy','pastel','neon','dark','light','bright','pastel','wine','rose','blush','copper','bronze','gold'];

  const wardrobeWords = ['suit','blazer','jacket','dress','gown','kurta','kameez','shalwar','lehenga','sari','saree','sharara','shirt','blouse','top','tee','t-shirt','polo','sweater','knit','pullover','cardigan','hoodie','bomber','overcoat','trench','peacoat','tuxedo','tux','trousers','pants','jeans','skirt','shorts','scarf','shawl','dupatta','veil','hijab','abaya','niqab','tie','bowtie','corset','bodysuit','romper','jumpsuit','cape','cloak','vest','waistcoat','stockings','tights','socks','shoes','boots','heels','sneakers','loafers','sandals','slippers','flats','pumps','stilettos','oxfords'];

  const environmentWords = ['studio','backdrop','beach','coast','ocean','sea','shore','sand','waves','tide','pier','boardwalk','urban','street','city','alley','alleyway','downtown','sidewalk','roadway','metropolitan','district','hotel','resort','lobby','suite','corridor','hallway','park','garden','botanical','arboretum','lawn','meadow','forest','woods','trail','nature','cafe','coffee','restaurant','bistro','bar','pub','tavern','diner','river','riverfront','riverside','waterfront','canal','dock','office','workspace','desk','cubicle','corporate','boardroom','stage','theater','theatre','podium','platform','courtyard','patio','terrace','veranda','balcony','staircase','stairs','stairway','steps','rooftop','skyline','alley','warehouse','loft','apartment','bedroom','living','kitchen','bathroom','penthouse','mansion','castle','palace','temple','church','mosque','barn','greenhouse','conservatory','atrium','museum','gallery','library','bookstore','shop','boutique','gym','pool','rooftop'];

  const lightingWords = ['golden','golden-hour','neon','dramatic','chiaroscuro','rembrandt','low-key','high-contrast','soft','diffused','natural','window','overcast','cloudy','moody','studio','key','three-point','softbox','ring','beauty-dish','candle','candlelight','rim','spot','backlit','frontlit','side-lit','volumetric','ambient','practical','motivated','directional','harsh','warm','cool','cold','harsh','fill','accent','key light','fill light','rim light','backlight','spotlight','floodlight','ambient light','natural light','window light','golden hour','neon light','candle light'];

  const techniqueWords = ['typography','text','quote','magazine','newspaper','poster','logo','watermark','caption','headline','film-grain','grain','analog','35mm','16mm','rain','rainy','drizzle','wind','breeze','bokeh','illustration','drawing','sketch','vector','watercolor','digital','cartoon','anime','pixar','3d','isometric','collage','scrapbook','mood-board','sticker','reflection','mirror','smoke','smoky','haze','fog','mist','steam','double-exposure','dual-exposure','overlay','blend','composite','lens-flare','light-leak','chromatic','vignette','sepia','cyanotype','daguerreotype','tintype','cross-process',' bleach-bypass','infrared','long-exposure','motion-blur','panning','tilt-shift','fish-eye','macro','telephoto'];

  const propWords = ['jewelry','necklace','earring','ring','bracelet','pendant','chain','bangle','hat','cap','beret','fedora','beanie','headwear','glasses','sunglasses','eyewear','spectacles','aviator','frames','flower','floral','petals','blossom','bouquet','rose','tulip','lily','orchid','daisy','car','automobile','vehicle','sports-car','phone','iphone','mobile','smartphone','selfie','watch','wristwatch','chronograph','timepiece','clock','camera','bag','purse','handbag','clutch','wallet','cane','umbrella','fan','mask','gloves','belt','armchair','chair','sofa','seat','couch','table','desk','stool','bench','podium'];

  const subjectWords = ['man','woman','boy','girl','male','female','person','subject','model','artist','creator','professional','executive','businessman','businesswoman','gentleman','lady','gent','youth','teen','elderly','senior','child','kid','baby','infant','toddler','couple','group','family','friend','colleague'];

  function extractFromText(wordList) {
    const found = [];
    const lower = text.toLowerCase();
    for (const w of wordList) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(lower)) found.push(w);
    }
    return found;
  }

  return {
    wardrobe: extractFromText(wardrobeWords),
    environment: extractFromText(environmentWords),
    lighting: extractFromText(lightingWords),
    colors: extractFromText(colorWords),
    techniques: extractFromText(techniqueWords),
    props: extractFromText(propWords),
    subjects: extractFromText(subjectWords),
  };
}

/* ─── Customization Tip Candidates ───────────────────────────────────── */

function generateTipCandidates(prompt, entities, nouns) {
  const seed = fnv1a(`${prompt.id}:${prompt.slug}:tips`);
  const c = [];

  const fw = nouns.wardrobe[0] || '';
  const fe = nouns.environment[0] || '';
  const fl = nouns.lighting[0] || '';
  const fc = nouns.colors[0] || '';
  const ft = nouns.techniques[0] || '';
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

  // ─── PROP-SPECIFIC ───
  if (fp) {
    c.push(
      `Ensure the ${fp} integrates naturally with the subject — correct scale, position, and lighting.`,
      `Add or remove the ${fp} to change the composition balance and narrative focus.`,
      `Specify the ${fp} material and color to complement rather than compete with the outfit.`,
    );
  }

  return { candidates: c, seed };
}

/* ─── Troubleshooting Candidates ─────────────────────────────────────── */

function generateTrblCandidates(prompt, entities, nouns) {
  const seed = fnv1a(`${prompt.id}:${prompt.slug}:trbl`);
  const c = [];

  const fw = nouns.wardrobe[0] || '';
  const fw2 = nouns.wardrobe[1] || '';
  const feRaw = nouns.environment[0] || '';
  const fe2 = nouns.environment[1] || '';
  // If fe is 'backdrop', use 'studio' as fallback to avoid 'backdrop backdrop'
  const fe = /\bbackdrop\b/i.test(feRaw) ? 'studio' : feRaw;
  const flRaw = nouns.lighting[0] || '';
  const fl2 = nouns.lighting[1] || '';
  // Strip trailing 'light'/'lighting'/'diffused' from fl to avoid doubled words
  const fl = flRaw.replace(/\s+(light|lighting|diffused)$/i, '').trim() || flRaw;
  const fc = nouns.colors[0] || '';
  const fc2 = nouns.colors[1] || '';
  const ft = nouns.techniques[0] || '';
  const ft2 = nouns.techniques[1] || '';
  const fp = nouns.props[0] || '';
  const fs = nouns.subjects[0] || 'subject';

  // Filter title words to only use meaningful visual nouns (not colors, adjectives, brand names)
  const BLOCKED_TITLE = new Set(['black','white','blue','green','red','royal','burgundy','chocolate','charcoal','teal','deep','golden','crimson','navy','olive','emerald','coral','silver','ivory','cream','beige','taupe','maroon','azure','indigo','violet','lavender','mint','sage','rust','cobalt','turquoise','magenta','fuchsia','lilac','peach','mauve','sienna','umber','brown','pink','orange','yellow','grey','gray','copper','bronze','ochre','luxury','elegant','professional','creative','minimalist','monochrome','vibrant','aspirational','ultra','limitless','dual','double','triple','semi','fantasy','identity','anniversary','wedding','bollywood','blockbuster','cinematic','editorial','fashion','journal','businessman','whatsapp','facebook','netflix','instagram','lighter','chiaroscuro','silhouette','candid','angle','hour','golden','royal','british','paris','stylish','stylized','teal','marble','watercolor','misty','bold','fresh','soft','dark','bright','quiet','modern','classic','vintage','retro','futuristic','realistic','authentic','premium','billionaire','exclusive','iconic','legendary','timeless','effortless','refined','sophisticated','polished','look','embroidered','film','turtleneck','suit','shalwar','breakout','locked','halo','shorthair','studio','exposure','celebration','mirror','reflection','poster','composition','rembrandt','wire','laughing','cropped','district','wall','influencer','flame','shhh','skyline','animation','background','anime','executive','knit','monochromatic','mens','pencil','face','brush','splash','forest','korean','office','chair','movie','diamond','fire','portrait','street','city','sunset','sunrise','neon','bokeh','rain','smoke','fog','haze','mirror','double','frame','panel','collage','sticker','vector','cartoon','pixar','disney','chibi','anime','comic','3d','isometric','sketch','pencil','oil','canvas','brush','illustration','vector','photo','camera','lens','filter','grain','blur','focus','depth','angle','crop','pan','zoom','tilt','roll','yaw','pitch','key','fill','rim','spot','flood','beam','glow','shine','sparkle','glitter','flare','leak','chromatic','aberration','distortion','vignette','mask','matte','key','frame','clip','sequence','timeline','edit','cut','splice','merge','blend','composite','overlay','screen','multiply','soft','hard','dodge','burn']);
  const titleWords = (prompt.title || '').split(/[-_\s]+/).filter(w => w.length > 3 && !BLOCKED_TITLE.has(w.toLowerCase()));
  const tWord1 = titleWords[0] || '';
  const tWord2 = titleWords[1] || '';

  // ─── WARDROBE + ENVIRONMENT COMBOS ───
  if (entities.hasSuit || entities.hasDress || entities.hasKurta || entities.hasJacket || entities.hasSweater || entities.hasShirt || entities.hasVeil) {
    if (entities.isStudio) {
      c.push(
        { issue: `The ${fw || 'garment'} fabric loses detail against the ${fe || 'studio'} backdrop due to similar tonal range`, why_it_happens: `When the subject wears ${fw || 'garment'} against a ${fe || 'studio'} backdrop of similar brightness, AI generators merge edges and lose fabric texture.`, fix: `Add distinct ${fw || 'garment'} texture against contrasting ${fe || 'studio'} backdrop or change the backdrop tone to create separation.` },
        { issue: `The ${fe || 'studio'} background shows unintended texture artifacts around the ${fw || 'garment'} silhouette`, why_it_happens: `AI generators sometimes add noise or texture to ${fe || 'studio'} backdrops near high-contrast garment edges.`, fix: `Specify clean ${fe || 'studio'} backdrop with smooth edge transition around the ${fw || 'garment'} for artifact-free results.` },
        { issue: `The ${fw || 'garment'} lapels or structural details render asymmetrically in the ${fe || 'studio'} setting`, why_it_happens: `Structured garments require bilateral symmetry that AI generators approximate unevenly, especially in ${fe || 'studio'} lighting.`, fix: `Add perfectly symmetrical ${fw || 'garment'} construction with clean lines and regenerate to select the most balanced frame.` },
      );
    }
    if (entities.isBeach) {
      c.push(
        { issue: `The ${fw || 'garment'} fabric appears stiff rather than flowing in the ${fe || 'coastal'} breeze`, why_it_happens: `AI models often render ${fw || 'garment'} with rigid, geometric folds instead of natural wind-blown movement in ${fe || 'outdoor'} settings.`, fix: `Add naturally flowing ${fw || 'garment'} with wind-caught fabric movement and specify wind direction.` },
        { issue: `The ${fe || 'ocean'} background washes out behind the ${fw || 'garment'}, creating an overexposed halo`, why_it_happens: `Coastal scenes have high ambient reflectance from ${fe || 'water and sand'}, causing the AI to overexpose the background behind the ${fw || 'subject'}.`, fix: `Add balanced exposure with ${fw || 'subject'} slightly brighter than the ${fe || 'coastal'} background.` },
      );
    }
    if (entities.isUrban) {
      c.push(
        { issue: `Random ${fe || 'urban'} elements clutter around the ${fw || 'garment'} silhouette`, why_it_happens: `AI generators populate ${fe || 'street'} scenes with environmental detritus that fits the ${fe || 'urban'} category near the ${fw || 'subject'}.`, fix: `Specify clean uncluttered ${fe || 'urban'} backdrop with clear ${fw || 'garment'} silhouette.` },
        { issue: `The ${fw || 'garment'} color clashes with the ${fe || 'urban'} environment palette`, why_it_happens: `AI generators may not harmonize the ${fw || 'garment'} color with existing ${fe || 'urban'} background elements.`, fix: `Adjust the ${fw || 'garment'} color to complement the ${fe || 'urban'} palette, or add color-harmonized tones.` },
      );
    }
    if (entities.isHotel) {
      c.push(
        { issue: `The ${fw || 'garment'} blends with the ${fe || 'hotel'} interior decor, losing visual separation`, why_it_happens: `Luxury ${fe || 'hotel'} interiors often share the same refined color palette as the ${fw || 'garment'}, causing the subject to merge with the background.`, fix: `Specify clear ${fw || 'garment'} to ${fe || 'hotel'} background separation with distinct edge definition.` },
      );
    }
    if (entities.isPark) {
      c.push(
        { issue: `The ${fw || 'garment'} appears artificially placed against the ${fe || 'natural'} background`, why_it_happens: `AI generators sometimes render ${fw || 'garment'} lighting inconsistently with the ${fe || 'outdoor'} ambient light, creating a cutout effect.`, fix: `Add natural ${fe || 'outdoor'} light wrapping the ${fw || 'garment'} with consistent shadow direction.` },
      );
    }
    if (entities.isCafe) {
      c.push(
        { issue: `The ${fe || 'cafe'} interior becomes overly cluttered around the ${fw || 'garment'} subject`, why_it_happens: `AI generators over-populate ${fe || 'restaurant'} scenes with tables, cups, patrons that distract from the ${fw || 'garment'}.`, fix: `Specify shallow depth of field with blurred ${fe || 'cafe'} interior and sharp ${fw || 'garment'} focus.` },
      );
    }
    if (entities.isRiverside) {
      c.push(
        { issue: `The ${fe || 'water'} surface appears artificially smooth behind the ${fw || 'garment'} subject`, why_it_happens: `AI models may render ${fe || 'water'} as a flat mirror rather than the dynamic, textured surface that naturally accompanies the scene.`, fix: `Add gentle ${fe || 'water'} ripples with natural surface texture behind the ${fw || 'garment'} subject.` },
      );
    }
    if (entities.isOffice) {
      c.push(
        { issue: `The ${fw || 'garment'} looks out of place against the ${fe || 'office'} furniture arrangement`, why_it_happens: `AI models may place ${fw || 'garment'}-wearing subjects without respecting the ${fe || 'office'} spatial context.`, fix: `Specify the subject's position relative to ${fe || 'office'} furniture and ensure the ${fw || 'garment'} reads as appropriate for the setting.` },
      );
    }
    if (entities.isStage) {
      c.push(
        { issue: `The ${fe || 'stage'} lighting creates hotspots on the ${fw || 'garment'} that blow out fabric detail`, why_it_happens: `Theatrical ${fe || 'stage'} lighting is often high-intensity, which AI generators may render as overexposed areas on the ${fw || 'garment'}.`, fix: `Add balanced ${fe || 'stage'} lighting with no ${fw || 'garment'} hotspots or use a softened spotlight on ${fw || 'subject'}.` },
      );
    }
    if (entities.isStaircase) {
      c.push(
        { issue: `The ${fw || 'garment'} drapes incorrectly on the ${fe || 'staircase'} steps`, why_it_happens: `AI generators may not correctly render how fabric falls across the ${fe || 'staircase'} geometry, especially at step edges.`, fix: `Specify natural ${fw || 'garment'} drape with correct fabric behavior on ${fe || 'staircase'} geometry.` },
      );
    }

    // Wardrobe-Lighting combos
    if (entities.hasGoldenHour) {
      c.push(
        { issue: `The ${fw || 'garment'} color shifts unpredictably under the ${fl || 'golden-hour'} light`, why_it_happens: `The warm ${fl || 'golden-hour'} temperature can alter the perceived color of the ${fw || 'garment'}, especially for mid-tone fabrics.`, fix: `Specify the intended ${fw || 'garment'} color and add accurate ${fw || 'garment'} color rendering under ${fl || 'golden'} light.` },
        { issue: `The ${fl || 'golden-hour'} light creates harsh directional shadows across the ${fw || 'garment'} details`, why_it_happens: `Low-angle ${fl || 'golden'} sunlight produces strong side-lighting that creates deep shadows across ${fw || 'garment'} construction details.`, fix: `Add soft fill light on ${fw || 'garment'} shadow side or reposition the subject for more even illumination on the ${fw || 'garment'}.` },
      );
    }
    if (entities.hasNeon) {
      c.push(
        { issue: `The ${fl || 'neon'} light casts an unnatural color wash across the ${fw || 'garment'} and skin`, why_it_happens: `Strong ${fl || 'neon'} sources can create unrealistic color overlays that override the ${fw || 'garment'}'s actual color and natural skin rendering.`, fix: `Add natural skin tones and accurate ${fw || 'garment'} color preserved despite the ${fl || 'neon'} color cast.` },
        { issue: `The ${fl || 'neon'} glow bleeds into the ${fw || 'garment'} edges, creating an unnatural outline`, why_it_happens: `AI generators sometimes render ${fl || 'neon'} as a colored haze that wraps around the ${fw || 'garment'} silhouette.`, fix: `Specify ${fl || 'neon'} light with defined direction and no edge bleed on the ${fw || 'garment'}.` },
      );
    }
    if (entities.hasDramatic) {
      c.push(
        { issue: `The ${fl || 'dramatic'} lighting crushes ${fw || 'garment'} texture detail into pure black shadows`, why_it_happens: `The AI interprets dramatic as maximum contrast, eliminating subtlety in the ${fw || 'garment'} shadow regions.`, fix: `Specify ${fl || 'dramatic'} lighting with visible ${fw || 'garment'} texture detail retained in shadow areas.` },
        { issue: `The ${fw || 'garment'} highlights are blown out by the ${fl || 'dramatic'} key light intensity`, why_it_happens: `Strong ${fl || 'dramatic'} key lights can create specular highlights on ${fw || 'garment'} fabric that exceed the AI dynamic range.`, fix: `Reduce the ${fl || 'key'} light intensity or add balanced ${fw || 'garment'} exposure with no blown highlights.` },
      );
    }
    if (entities.hasSoftLight) {
      c.push(
        { issue: `The ${fl || 'soft'} light renders the ${fw || 'garment'} flat and lacking in material depth`, why_it_happens: `Excessively ${fl || 'soft'} or diffused lighting removes all shadow definition on the ${fw || 'garment'}, making it look two-dimensional.`, fix: `Add a subtle directional element to the ${fl || 'soft'} light — wrapping soft light with gentle shadow falloff on the ${fw || 'garment'}.` },
      );
    }
    if (entities.hasMoody) {
      c.push(
        { issue: `The ${fw || 'garment'} loses all fabric detail in the ${fl || 'moody'} darkness`, why_it_happens: `AI generators may push moody to extreme darkness, obscuring the ${fw || 'garment'} entirely.`, fix: `Add ${fl || 'moody'} atmosphere with ${fw || 'garment'} fabric detail clearly visible and properly exposed.` },
      );
    }
    if (entities.hasStudioLight) {
      c.push(
        { issue: `The ${fl || 'studio'} lighting creates visible hotspots on the ${fw || 'garment'} fabric surface`, why_it_happens: `Direct ${fl || 'studio'} lights can create specular highlights on ${fw || 'garment'} fabric that AI generators may exaggerate.`, fix: `Add diffused ${fl || 'studio'} lighting with no ${fw || 'garment'} hotspots or use a larger light modifier.` },
      );
    }
  }

  // ─── TECHNIQUE COMBOS ───
  if (entities.hasDoubleExposure) {
    c.push(
      { issue: `The double-exposure blend makes the ${fw || fs || 'primary'} subject unrecognizable against the overlay`, why_it_happens: `AI models may merge both layers at equal opacity rather than maintaining a clear primary subject.`, fix: `Specify primary ${fw || fs || 'subject'} clearly dominant with secondary layer subtle or reduce overlay complexity.` },
      { issue: `The overlay element appears as a solid object rather than a transparent blend`, why_it_happens: `AI generators sometimes render the overlay as an opaque shape instead of a translucent double-exposure effect.`, fix: `Add semi-transparent overlay with visible ${fw || fs || 'subject'} through the blend and specify blend opacity.` },
      { issue: `The two exposure layers show inconsistent lighting directions`, why_it_happens: `AI models may apply different light sources to each layer, creating a physically impossible combination.`, fix: `Specify consistent lighting direction across both exposure layers for coherent double-exposure.` },
      { issue: `The double-exposure edges appear jagged or pixelated at the blend boundary`, why_it_happens: `AI generators may struggle with smooth alpha-blending at the boundary between the subject and overlay.`, fix: `Add smooth natural double-exposure blend with soft feathered edges for cleaner transitions.` },
      { issue: `The overlay color palette clashes with the subject outfit colors`, why_it_happens: `AI generators may not harmonize the overlay color palette with the existing subject color scheme.`, fix: `Specify color-harmonized double-exposure blend or adjust the overlay to complement the subject palette.` },
    );
  }
  if (entities.hasReflection) {
    const reflectObj = nouns.techniques.find(t => /\b(mirror|reflection|reflected|water|glass)\b/.test(t)) || 'reflective surface';
    c.push(
      { issue: `The ${reflectObj} shows distorted features or inconsistent clothing`, why_it_happens: `Mirror reflections require pixel-perfect symmetry that AI generators approximate imperfectly.`, fix: `Add perfectly symmetrical reflection of the ${fw || fs || 'subject'} or generate the reflection separately and composite in post.` },
      { issue: `The ${reflectObj} is too crisp, appearing as a copy rather than a natural mirrored surface`, why_it_happens: `AI generators sometimes render reflections as exact copies rather than the slightly softened quality of real reflections.`, fix: `Add natural ${reflectObj} with slight softening and surface texture for realistic mirror behavior.` },
      { issue: `The ${reflectObj} shows an impossible angle or reversed text elements`, why_it_happens: `AI models may not correctly calculate the physics of reflection angles, especially with text elements.`, fix: `Specify physically accurate ${reflectObj} angle or remove text from the reflected area.` },
      { issue: `The ${reflectObj} appears disconnected from the subject, floating at an unnatural position`, why_it_happens: `AI generators may place reflective elements without respecting the physical relationship to the subject.`, fix: `Specify naturally positioned ${reflectObj} directly adjacent to the ${fw || fs || 'subject'} with correct spatial geometry.` },
    );
  }
  if (entities.hasBw) {
    c.push(
      { issue: `The monochrome conversion shows subtle color tints in the skin tones`, why_it_happens: `Some AI generators apply slight color grading even when black-and-white is specified.`, fix: `Add pure grayscale with no color tint and apply desaturation in post for guaranteed neutrality.` },
      { issue: `The black-and-white conversion loses important tonal separation between outfit and background`, why_it_happens: `Without color contrast, elements that differ only in hue may merge in monochrome.`, fix: `Ensure the prompt includes tonal contrast descriptors such as bright subject against dark background.` },
      { issue: `The monochrome range produces a flat, lifeless image lacking depth and dimension`, why_it_happens: `AI generators may compress the tonal range when converting to monochrome, removing the natural depth that color provides.`, fix: `Specify rich tonal depth with distinct zones — deep blacks, luminous midtones, and bright highlights for dimensional monochrome.` },
      { issue: `The monochrome texture of dark fabric becomes a featureless black mass`, why_it_happens: `Dark suits and garments lose all fabric texture and construction detail when the AI renders them as pure black.`, fix: `Specify visible fabric texture within the dark tones — weave pattern, seam lines, and subtle light catching the material surface.` },
      { issue: `The monochrome skin rendering appears too smooth, losing pores and natural texture`, why_it_happens: `AI generators may over-smooth skin in monochrome, producing a plastic or airbrushed look rather than natural skin.`, fix: `Add natural skin texture detail — pores, subtle imperfections, and tonal variation — for realistic monochrome portraiture.` },
      { issue: `The monochrome background and subject merge into an undifferentiated tonal plane`, why_it_happens: `Without color separation, the subject and background may share similar grayscale values, reducing compositional clarity.`, fix: `Specify distinct tonal zones between subject and background — bright subject against dark backdrop or vice versa for clear separation.` },
      { issue: `The monochrome highlights on dark fabric appear as blown-out white patches`, why_it_happens: `AI generators may overexpose specular highlights on dark monochromatic garments, creating distracting bright spots.`, fix: `Control highlight intensity with soft directional lighting and specify retained detail in the brightest areas of the fabric.` },
      { issue: `The monochrome gradient across the background appears banded or posterized rather than smooth`, why_it_happens: `AI generators may produce visible tonal banding in monochrome gradients, especially in large flat areas like backdrops.`, fix: `Specify smooth continuous tonal gradation with no banding artifacts in the monochrome background.` },
      { issue: `The monochrome eye detail loses the iris pattern and natural catch-light reflection`, why_it_happens: `In monochrome portraits, AI generators may flatten eye detail into dark circles without the characteristic iris texture and catch-light.`, fix: `Specify visible iris detail with natural catch-light reflection for expressive, lifelike monochrome eyes.` },
      { issue: `The monochrome hair loses individual strand definition and appears as a solid dark mass`, why_it_happens: `AI generators may render dark hair in monochrome as a uniform dark shape rather than showing individual strand texture and flow.`, fix: `Add individual hair strand visibility with natural light catching the hair surface for dimensional monochrome hair rendering.` },
      { issue: `The monochrome suit lapel edges blend into the background without clear definition`, why_it_happens: `Dark monochromatic suits against dark backgrounds lose edge definition in the AI rendering, making the garment boundary unclear.`, fix: `Specify crisp lapel edge definition with subtle tonal separation between the suit and the background.` },
      { issue: `The monochrome nose shadow creates an unnatural dark triangle on the face`, why_it_happens: `AI generators may render nose shadows as harsh geometric shapes in monochrome, rather than the soft natural gradient of real lighting.`, fix: `Specify soft natural nose shadow with gradual falloff instead of hard-edged geometric shadow shapes.` },
    );
  }
  if (entities.hasText) {
    const tn = nouns.techniques.find(t => /\b(poster|magazine|newspaper|typography|quote|text|username|logo)\b/.test(t)) || 'text element';
    c.push(
      { issue: `The ${tn} renders with misspelled words or invented characters`, why_it_happens: `Most AI generators treat text as visual patterns rather than semantic content, producing scrambled letters.`, fix: `Shorten the ${tn} to the minimum phrase, or overlay text in post-production for guaranteed accuracy.` },
      { issue: `The ${tn} appears warped or curved when it should be flat`, why_it_happens: `AI generators sometimes apply perspective distortion to text that should be flat on the surface.`, fix: `Specify flat straight ${tn} with no warping or reduce the text size to minimize distortion.` },
      { issue: `The ${tn} color does not match the specified palette against the background`, why_it_happens: `AI models may not accurately render text in specific colors, especially over complex backgrounds.`, fix: `Use high-contrast text colors like white on dark or black on light for more reliable rendering.` },
    );
  }
  if (entities.hasFilmGrain) {
    c.push(
      { issue: `The film grain appears as digital noise rather than organic analog grain`, why_it_happens: `AI generators may render grain as uniform pixel noise rather than the irregular clumping of real film grain.`, fix: `Specify organic film grain with natural clumping pattern or add grain in post-production instead.` },
    );
  }
  if (entities.hasRain) {
    c.push(
      { issue: `Rain drops appear as uniform parallel streaks rather than natural varied droplets`, why_it_happens: `AI models interpret rain as parallel lines rather than organic droplets with varied size and angle.`, fix: `Specify natural rain with varied droplet sizes and organic distribution patterns.` },
      { issue: `The rain appears only in the foreground or background, not consistently throughout the scene`, why_it_happens: `AI generators sometimes render rain at a single depth plane rather than throughout the 3D scene.`, fix: `Add rain visible at multiple distances — close droplets, mid-range sheets, distant haze.` },
    );
  }
  if (entities.hasWind) {
    c.push(
      { issue: `Wind-blown elements show inconsistent direction — hair flowing one way, fabric another`, why_it_happens: `AI models may not maintain a consistent wind direction across different moving elements.`, fix: `Specify all elements flowing in the same wind direction for consistent atmospheric behavior.` },
    );
  }
  if (entities.hasBokeh) {
    c.push(
      { issue: `The bokeh circles appear as hexagons or polygons instead of smooth circles`, why_it_happens: `AI generators sometimes render bokeh with visible aperture blade shapes rather than smooth circles.`, fix: `Specify smooth circular bokeh or use a lens description that implies wide-open aperture.` },
    );
  }
  if (entities.hasIllustration) {
    c.push(
      { issue: `The illustration style is inconsistent across different areas of the image`, why_it_happens: `AI generators may apply different levels of detail or line weight across the composition.`, fix: `Specify a consistent illustration style like clean vector lines or uniform watercolor wash throughout.` },
    );
  }
  if (entities.hasCollage) {
    c.push(
      { issue: `The collage panels show inconsistent visual quality or resolution across the composition`, why_it_happens: `AI generators may render different collage panels at varying quality levels, creating uneven visual weight.`, fix: `Specify consistent high-quality rendering across all collage panels with uniform detail level.` },
    );
  }
  if (entities.hasSmoke) {
    c.push(
      { issue: `The smoke appears as a flat opaque mass rather than a translucent atmospheric element`, why_it_happens: `AI generators sometimes render smoke as solid colored clouds instead of semi-transparent atmospheric elements.`, fix: `Add semi-transparent smoke with visible subject through the haze and specify opacity level.` },
    );
  }

  // ─── ENVIRONMENT-SPECIFIC ───
  if (entities.isStudio) {
    c.push(
      { issue: `The studio backdrop blends with the subject, losing edge separation`, why_it_happens: `When subject and studio backdrop share similar tones, AI generators may merge edges without explicit separation cues.`, fix: `Add clear subject-to-studio background separation or specify a contrasting backdrop tone.` },
      { issue: `The studio background shows visible seams, wrinkles, or texture artifacts`, why_it_happens: `AI generators sometimes add unintended texture to seamless backdrops, breaking the clean studio look.`, fix: `Specify smooth seamless studio backdrop with no visible texture or imperfections.` },
      { issue: `The studio floor reflects the subject inconsistently or adds unwanted light spill`, why_it_happens: `Studio floor reflections can be difficult to render consistently, creating distracting light patterns.`, fix: `Specify matte studio floor with minimal reflection or reflective floor with clean symmetrical reflection.` },
      { issue: `The studio lighting creates visible hotspots on the subject skin`, why_it_happens: `Direct studio lights can create specular highlights on skin that AI generators may exaggerate.`, fix: `Add diffused studio lighting with no skin hotspots or use soft key light with large modifier.` },
    );
  }
  if (entities.isBeach) {
    c.push(
      { issue: `The sand and water create an overexposed background behind the subject`, why_it_happens: `Coastal scenes have high ambient reflectance from sand and water, causing the AI to overexpose the background.`, fix: `Add balanced exposure with subject slightly brighter than the coastal background.` },
      { issue: `The ocean horizon appears tilted or distorted behind the subject`, why_it_happens: `AI generators sometimes render horizon lines at slight angles, breaking the natural landscape composition.`, fix: `Specify perfectly level ocean horizon or ensure the horizon is not visible behind the subject.` },
      { issue: `The sand appears unnaturally smooth or shows repetitive texture patterns`, why_it_happens: `AI models may generate uniform sand textures rather than the organic, varied surface found at actual beaches.`, fix: `Add natural sand texture with organic variation or include foreground elements like shells or footprints.` },
    );
  }
  if (entities.isUrban) {
    c.push(
      { issue: `Random urban elements — signs, poles, litter — clutter the composition`, why_it_happens: `AI generators populate street scenes with environmental detritus that was not specified but fits urban.`, fix: `Specify clean uncluttered urban backdrop or name the specific element you want visible.` },
      { issue: `The building facades appear to lean inward or show impossible architecture`, why_it_happens: `AI models sometimes generate buildings with distorted perspectives, especially in wide-angle compositions.`, fix: `Add straight architectural lines or use a narrower field of view to reduce perspective distortion.` },
      { issue: `The street surface appears unnaturally smooth or shows liquid-like reflections`, why_it_happens: `AI generators may render pavement as reflective or water-like rather than the actual road surface material.`, fix: `Specify dry textured asphalt or wet pavement with realistic puddle reflections depending on intent.` },
    );
  }
  if (entities.isHotel) {
    c.push(
      { issue: `The hotel interior shows inconsistent decor styles or anachronistic furniture`, why_it_happens: `AI generators may blend different hotel aesthetics, creating an incoherent interior design.`, fix: `Specify a consistent style like modern minimalist, classic luxury, or art deco for the entire interior.` },
      { issue: `The hotel room shows impossible room proportions or floating furniture`, why_it_happens: `AI models sometimes generate spatial anomalies in interior scenes, especially with complex room layouts.`, fix: `Simplify the room layout and specify the camera position to anchor the spatial composition.` },
    );
  }
  if (entities.isPark) {
    c.push(
      { issue: `The park foliage appears uniformly green instead of showing natural seasonal variation`, why_it_happens: `AI generators often default to a generic green palette for vegetation rather than realistic seasonal colors.`, fix: `Specify the season — autumn foliage, spring blossoms, or winter bare branches — for accurate plant colors.` },
      { issue: `The trees or plants show unnatural symmetry or repeated branch patterns`, why_it_happens: `AI models sometimes generate trees with mirror-symmetric branches rather than organic growth patterns.`, fix: `Add organic natural tree structure with asymmetric branches to guide more realistic vegetation rendering.` },
    );
  }
  if (entities.isCafe) {
    c.push(
      { issue: `The cafe interior becomes overly cluttered with tables, cups, and background figures`, why_it_happens: `AI generators over-populate restaurant scenes with environmental details that distract from the subject.`, fix: `Specify shallow depth of field with blurred cafe interior or minimal background elements.` },
      { issue: `The cafe signage or menu boards show garbled text and invented characters`, why_it_happens: `Background text in cafe scenes is rendered with the same AI text limitations as foreground typography.`, fix: `Use a shallow depth of field to blur background text, or position the subject away from readable signs.` },
    );
  }
  if (entities.isRiverside) {
    c.push(
      { issue: `The water surface appears glassy-smooth instead of showing natural ripples`, why_it_happens: `AI models may render water as a flat mirror rather than the dynamic, textured surface of a real river.`, fix: `Add gentle water ripples with natural surface texture to avoid the artificially smooth appearance.` },
    );
  }
  if (entities.isCourtyard) {
    c.push(
      { issue: `The courtyard plants or architectural details appear duplicated or mirrored unnaturally`, why_it_happens: `AI generators sometimes repeat architectural elements symmetrically rather than with natural variation.`, fix: `Specify organic natural variation in courtyard plants and architectural details.` },
    );
  }
  if (entities.isOffice) {
    c.push(
      { issue: `The office furniture appears at impossible angles or overlaps with the subject`, why_it_happens: `AI models may place furniture without respecting physical space, creating overlapping objects.`, fix: `Specify the subject position relative to furniture and ensure adequate spacing in the composition.` },
    );
  }
  if (entities.isStage) {
    c.push(
      { issue: `The stage lighting creates hotspots or blown-out areas on the subject face`, why_it_happens: `Theatrical stage lighting is often high-intensity, which AI generators may render as overexposed facial areas.`, fix: `Add balanced stage lighting with no facial hotspots or softened spotlight on subject.` },
    );
  }

  // ─── COMPOSITION + PROPS ───
  if (entities.composition === 'close-up') {
    c.push(
      { issue: `The tight crop cuts off the forehead or chin at an awkward point`, why_it_happens: `AI generators miscalculate headroom in close-up compositions, especially with headwear or hair.`, fix: `Specify centered face with balanced space above head and below chin.` },
      { issue: `The close-up reveals skin texture artifacts or unnatural pore detail`, why_it_happens: `High-detail close-ups can expose AI rendering artifacts in skin texture not visible at wider crops.`, fix: `Add smooth natural skin texture or flattering skin rendering for close-up portraits.` },
    );
  }
  if (entities.composition === 'full-body') {
    c.push(
      { issue: `The full-body framing cramps the subject near the frame edges`, why_it_happens: `AI models may place the subject too close to frame boundaries in full-body compositions.`, fix: `Add full-body with generous negative space on all sides and specify camera distance.` },
      { issue: `The feet or lower legs appear disproportionate or are cut off`, why_it_happens: `AI generators sometimes miscalculate body proportions, especially at the extremities.`, fix: `Specify full figure visible from head to toe and verify proportion accuracy across generations.` },
    );
  }
  if (entities.hasJewelry) {
    const j = nouns.props.find(p => /\b(jewelry|necklace|earring|ring|bracelet)\b/.test(p)) || 'jewelry';
    c.push(
      { issue: `The ${j} renders with extra stones, incorrect links, or merged edges against skin`, why_it_happens: `Fine accessories require sub-pixel detail that AI generators approximate inaccurately at portrait scale.`, fix: `Simplify the ${j} description or add delicate, cleanly rendered accessories.` },
      { issue: `The ${j} appears to float or sit at an impossible angle on the body`, why_it_happens: `AI models may not correctly position accessories relative to body geometry.`, fix: `Specify the exact position and add naturally resting on body part for correct placement.` },
    );
  }
  if (entities.hasHat) {
    c.push(
      { issue: `The hat sits at an unnatural angle or appears to float above the head`, why_it_happens: `AI generators sometimes misjudge headwear placement, especially with tilted or angled styles.`, fix: `Specify hat sitting naturally on the head with correct shadow for realistic placement.` },
    );
  }
  if (entities.hasEyewear) {
    c.push(
      { issue: `The glasses frames appear at different sizes or positions on each side of the face`, why_it_happens: `AI generators often render eyewear asymmetrically, with one lens larger or higher than the other.`, fix: `Add perfectly symmetrical eyewear with matching frame sizes or remove glasses for a cleaner result.` },
    );
  }
  if (entities.hasFlowers) {
    c.push(
      { issue: `The flowers appear as a uniform mass rather than showing individual bloom detail`, why_it_happens: `AI generators may merge floral arrangements into a single colored blob rather than distinct petals.`, fix: `Specify individual flowers with visible petals and stems for more detailed floral rendering.` },
    );
  }
  if (entities.hasCar) {
    c.push(
      { issue: `The car proportions appear incorrect relative to the subject — too large or too small`, why_it_happens: `AI models may not correctly scale the car relative to the subject, especially in complex compositions.`, fix: `Specify the car position and size relative to the subject for correct proportions.` },
      { issue: `The car surface shows distorted reflections or impossible body lines`, why_it_happens: `AI generators sometimes render car body panels with warped surfaces or physically impossible reflections.`, fix: `Add physically accurate car body lines and surface reflections for realistic vehicle rendering.` },
    );
  }
  if (entities.hasPhone) {
    c.push(
      { issue: `The phone screen shows garbled content or blank display instead of the intended interface`, why_it_happens: `AI generators may not accurately render phone screen content, especially when the subject is interacting with it.`, fix: `Specify clear phone screen with readable interface or plan to replace the screen content in post-production.` },
    );
  }

  // ─── COLOR + MOOD ───
  if (nouns.colors.length > 0) {
    c.push(
      { issue: `The dominant color appears oversaturated or unnatural on the outfit`, why_it_happens: `AI generators may push the dominant color to maximum saturation, clipping the brightest channels and losing fabric detail.`, fix: `Specify balanced color saturation with visible detail in the outfit or reduce color intensity in the prompt.` },
      { issue: `The color palette shifts between generations, producing inconsistent results`, why_it_happens: `AI generators may interpret the color description with slight variations each time, especially combined with lighting.`, fix: `Specify exact color values and verify consistency across 3-5 generations.` },
    );
  }

  // ─── MONOCHROME + COLOR SPECIFIC (targeted for unresolved prompts) ───
  if (entities.hasBw && nouns.colors.length > 0) {
    const mc = nouns.colors[0] || 'monochrome';
    c.push(
      { issue: `The ${mc} monochrome palette renders the suit and background as nearly identical shades, losing subject-background separation`, why_it_happens: `When the entire scene shares a ${mc} color family, AI generators may compress the tonal range until subject and background merge into one undifferentiated mass.`, fix: `Specify distinct tonal zones — the suit should be noticeably darker or lighter than the ${mc} background for clear compositional separation.` },
      { issue: `The ${mc} color on the suit fabric loses material texture and appears as a flat painted surface`, why_it_happens: `Monochromatic rendering can strip the natural light-catching properties of suit fabric, making it look like a solid color fill rather than woven material.`, fix: `Specify visible fabric weave texture and subtle tonal variation across the ${mc} suit panels to convey material depth.` },
      { issue: `The monochrome ${mc} grading creates an unnatural color cast on the subject skin tones`, why_it_happens: `A dominant ${mc} environment may cause the AI to tint skin with the same hue, producing an artificial or sickly appearance rather than natural skin.`, fix: `Specify natural warm skin tones preserved against the ${mc} monochrome backdrop without color contamination from the environment.` },
    );
  }

  // ─── CHAIR / FURNITURE SPECIFIC ───
  if (entities.hasCar === false && nouns.props.some(p => /\b(chair|armchair|sofa|seat|couch)\b/.test(p))) {
    const chairNoun = nouns.props.find(p => /\b(chair|armchair|sofa|seat|couch)\b/.test(p)) || 'chair';
    c.push(
      { issue: `The ${chairNoun} proportions appear distorted or disproportionate relative to the seated subject`, why_it_happens: `AI generators may miscalculate furniture scale, producing a ${chairNoun} that is too large, too small, or has impossible geometry relative to the person sitting in it.`, fix: `Specify realistic ${chairNoun} proportions with the subject seated naturally and anatomically correct within the furniture.` },
      { issue: `The subject hands or fingers on the ${chairNoun} armrests render with anatomical errors`, why_it_happens: `AI generators frequently produce extra fingers, merged digits, or impossible hand positions where the subject interacts with furniture.`, fix: `Add anatomically correct hand positioning with proper finger count resting naturally on the ${chairNoun} armrests.` },
      { issue: `The ${chairNoun} fabric texture appears unnaturally smooth or plastic-like rather than showing upholstery weave`, why_it_happens: `AI generators may render furniture as a solid colored shape without the textile surface detail of real upholstery material.`, fix: `Specify visible upholstery texture — fabric weave, stitching lines, and natural material creasing on the ${chairNoun}.` },
    );
  }

  // ─── SUIT + SHIRT LAYERING SPECIFIC ───
  if (entities.hasSuit && nouns.wardrobe.some(w => /\b(shirt|tee|t-shirt|blouse)\b/.test(w))) {
    c.push(
      { issue: `The shirt collar visibility under the suit jacket creates an awkward neckline transition`, why_it_happens: `AI generators may struggle with the precise overlap between shirt collar and suit lapels, producing unnatural merging or gaps at the neckline.`, fix: `Specify clear shirt collar visible above the suit jacket lapels with natural fabric transition at the neckline.` },
      { issue: `The contrast between a light shirt and dark suit creates blown-out highlights on the shirt`, why_it_happens: `High contrast between a light inner shirt and dark suit may cause the AI to overexpose the shirt, losing fabric detail in bright areas.`, fix: `Balance the exposure to retain shirt fabric detail alongside the darker suit without losing texture in either garment.` },
    );
  }

  // ─── SEATED POSE SPECIFIC ───
  if (nouns.props.some(p => /\b(chair|armchair|sofa|seat|couch)\b/.test(p)) && /\b(sit|seated|sitting)\b/i.test(`${prompt.prompt || ''} ${prompt.title || ''}`)) {
    c.push(
      { issue: `The seated pose renders with unnatural leg positioning or crossed legs that appear physically impossible`, why_it_happens: `AI generators may produce anatomically incorrect leg crossing, where legs pass through each other or the chair.`, fix: `Specify the exact leg crossing position — which leg over which knee — and ensure anatomically correct rendering.` },
      { issue: `The subject body appears to float above or sink into the seat rather than resting naturally`, why_it_happens: `AI generators may not correctly render the weight distribution of a seated person, producing a pose that looks suspended or compressed.`, fix: `Add natural weight distribution with the subject body pressing into the seat cushion and back resting against the chair back.` },
    );
  }

  // ─── WATCH / WRIST ACCESSORY SPECIFIC ───
  if (entities.hasWatch) {
    c.push(
      { issue: `The wristwatch renders with an incorrect number of hands, markers, or distorted dial face`, why_it_happens: `AI generators may produce watches with impossible time-display elements, merged markers, or warped dial geometry.`, fix: `Simplify the watch face to a clean dial with correct hand count and positions, or specify minimal watch detail.` },
      { issue: `The watch strap appears to merge with the wrist skin or float above it`, why_it_happens: `AI generators may fail to render the watch strap as a separate physical object sitting on the wrist surface.`, fix: `Specify the watch as a clearly defined object sitting on the wrist with visible strap edges and natural skin contact.` },
    );
  }

  // ─── TITLE-WORD GROUNDED ───
  if (tWord1) {
    c.push(
      { issue: `The ${tWord1} visual element renders with inconsistent detail or quality across the composition`, why_it_happens: `AI generators may interpret the ${tWord1} concept with varying fidelity, producing inconsistent visual quality.`, fix: `Specify the exact ${tWord1} visual style and regenerate 3-5 times to select the most consistent result.` },
      { issue: `The ${tWord1} element competes with the subject for visual attention in the composition`, why_it_happens: `AI generators may over-emphasize the ${tWord1} element, drawing focus away from the primary subject.`, fix: `Reduce the ${tWord1} element visual prominence or add clear visual hierarchy with subject as focal point.` },
      { issue: `The ${tWord1} element appears visually disconnected from the overall scene`, why_it_happens: `AI generators may render the ${tWord1} element without proper integration into the scene lighting and perspective.`, fix: `Ensure the ${tWord1} element shares the same lighting direction and color temperature as the rest of the scene.` },
    );
  }
  if (tWord2) {
    c.push(
      { issue: `The ${tWord2} aspect of the image appears over-processed or unnatural in the final output`, why_it_happens: `AI generators may apply excessive processing to the ${tWord2} element, creating an over-processed look.`, fix: `Add natural ${tWord2} rendering with organic quality to reduce artificial processing artifacts.` },
      { issue: `The ${tWord2} element appears visually disconnected from the overall composition`, why_it_happens: `AI generators may render the ${tWord2} element without proper spatial integration into the scene.`, fix: `Ensure the ${tWord2} element is properly anchored in the composition with correct perspective and scale.` },
    );
  }

  // ─── WARDROBE-SPECIFIC ───
  if (entities.hasSuit) {
    c.push(
      { issue: `The suit lapels render asymmetrically, breaking the formal symmetry of the portrait`, why_it_happens: `Structured garments like a suit require precise bilateral symmetry that AI generators often approximate unevenly.`, fix: `Add perfectly symmetrical tailored suit details and regenerate to select the cleanest frame.` },
      { issue: `The suit fabric loses texture detail and appears as a flat single tone`, why_it_happens: `Dark or monochromatic suits can merge into featureless areas when the AI underexposes the garment region.`, fix: `Specify the suit fabric type explicitly — textured wool or linen weave — and ensure adequate key light.` },
      { issue: `The suit buttons or pocket square appear in inconsistent positions across the chest`, why_it_happens: `AI models sometimes place small garment details without respecting the actual construction.`, fix: `Simplify the outfit by removing small accessories, or add accurately placed buttons and pocket square.` },
      { issue: `The suit collar sits awkwardly or merges with the shirt collar`, why_it_happens: `Multiple overlapping fabric layers at the neckline confuse the AI edge detection between suit and shirt.`, fix: `Specify distinct suit collar over shirt collar with visible separation or simplify to a single collar type.` },
      { issue: `The suit shoulders appear uneven or padded differently on each side`, why_it_happens: `AI generators sometimes render shoulder structure asymmetrically, especially with structured suit jackets.`, fix: `Add perfectly even suit shoulder structure or generate multiple times and select the frame with balanced shoulders.` },
    );
  }
  if (entities.hasDress) {
    c.push(
      { issue: `The dress folds and drapes look stiff rather than flowing naturally`, why_it_happens: `AI models often render fabric with rigid, geometric folds instead of organic draping, especially with complex construction.`, fix: `Add naturally flowing dress fabric with soft organic folds and specify the material weight.` },
      { issue: `The dress hemline appears uneven or truncated at different lengths`, why_it_happens: `AI generators sometimes miscalculate garment length, especially with flowing or asymmetrical hemlines.`, fix: `Specify the exact dress hemline style and length, or use a simpler garment silhouette.` },
      { issue: `The dress neckline sits lower or higher than the intended style`, why_it_happens: `Complex neckline constructions can be misinterpreted by AI generators, resulting in unintended exposure or coverage.`, fix: `Describe the neckline precisely — off-shoulder, high collar, or V-neck — and verify across multiple generations.` },
    );
  }
  if (entities.hasKurta) {
    c.push(
      { issue: `The kurta embroidery or pattern details blur into indistinct patches`, why_it_happens: `Intricate textile patterns require fine detail rendering that AI generators often simplify at portrait distance.`, fix: `Specify the pattern type explicitly — block print, chikankari, or zardozi — and generate at higher resolution.` },
      { issue: `The kurta fabric appears too stiff or too thin, not matching the intended material`, why_it_happens: `AI models may not accurately render specific fabric weights, defaulting to a generic smooth texture.`, fix: `Add fabric descriptors — heavy cotton, flowing silk, or textured linen — to guide the material rendering.` },
    );
  }
  if (entities.hasVeil) {
    c.push(
      { issue: `The veil renders as opaque fabric instead of showing the face through sheer material`, why_it_happens: `AI models frequently interpret veil as solid cloth rather than transparent mesh, especially over the face.`, fix: `Specify semi-transparent sheer veil with clearly visible face through delicate mesh.` },
      { issue: `The veil edges appear jagged or unnaturally stiff instead of flowing`, why_it_happens: `Sheer fabric edges are difficult for AI to render with natural softness and movement.`, fix: `Add soft flowing veil edges with natural drape and ensure adequate motion direction in the prompt.` },
    );
  }
  if (entities.hasSweater) {
    c.push(
      { issue: `The knit texture appears smooth instead of showing woven pattern`, why_it_happens: `AI generators often simplify knit textures into smooth surfaces, losing the tactile quality of the fabric.`, fix: `Specify the exact knit type — cable-knit, ribbed, or waffle-weave — and add visible knit texture detail.` },
      { issue: `The sweater appears too tight or too loose, not matching the intended fit`, why_it_happens: `AI models may not accurately render garment fit, especially with oversized or form-fitting knitwear.`, fix: `Add fit descriptors — relaxed oversized fit or fitted silhouette — and verify the garment drapes correctly.` },
    );
  }
  if (entities.hasJacket) {
    c.push(
      { issue: `The jacket collar or lapel sits unevenly or folds unnaturally`, why_it_happens: `Structured jacket collars require precise construction that AI generators often approximate with asymmetric folds.`, fix: `Add perfectly structured jacket collar with clean lapel lines or simplify the jacket style.` },
      { issue: `The jacket zipper, buttons, or closures appear duplicated or misaligned`, why_it_happens: `Small hardware details like zippers and buttons are rendered at sub-pixel accuracy, leading to visual errors.`, fix: `Specify the closure type clearly or remove visible hardware from the prompt for a cleaner result.` },
    );
  }

  // ─── LIGHTING-SPECIFIC ───
  if (entities.hasNeon) {
    c.push(
      { issue: `The neon light casts an unnatural color wash across the subject skin`, why_it_happens: `Strong neon sources can create unrealistic color overlays that override natural skin rendering.`, fix: `Add natural skin tones preserved despite the neon color cast, or use a negative prompt for color cast.` },
      { issue: `The neon tubes or signs appear to glow without emitting visible light on the subject`, why_it_happens: `AI generators sometimes render neon as colored objects without the associated light emission on nearby surfaces.`, fix: `Add neon light casting visible colored illumination on the subject and surroundings.` },
      { issue: `The neon colors appear oversaturated, losing detail in the brightest areas`, why_it_happens: `AI models may push neon colors to maximum saturation, clipping the brightest channels.`, fix: `Specify balanced neon exposure with visible detail in brightest areas or reduce neon intensity.` },
    );
  }
  if (entities.hasGoldenHour) {
    c.push(
      { issue: `The golden-hour angle creates harsh directional shadows under the eyes and chin`, why_it_happens: `Low-angle sunlight produces strong side-lighting that can create deep unflattering shadows.`, fix: `Add soft fill light on shadow side or position the subject facing the sun for even illumination.` },
      { issue: `The golden light appears as a flat orange overlay rather than directional illumination`, why_it_happens: `AI generators may render golden hour as a color filter rather than directional light with proper shadows.`, fix: `Specify directional golden sunlight with defined shadows and highlights for accurate lighting behavior.` },
      { issue: `The sky background is blown out or shows an unrealistic gradient`, why_it_happens: `Golden hour scenes have high dynamic range that AI generators may not balance between subject and sky.`, fix: `Add balanced exposure between subject and golden sky or use a graduated filter approach in the prompt.` },
    );
  }
  if (entities.hasDramatic) {
    c.push(
      { issue: `The dramatic lighting crushes shadow detail into pure black`, why_it_happens: `The AI interprets dramatic as maximum contrast, eliminating subtlety in shadow regions.`, fix: `Specify dramatic but with visible shadow detail or high contrast retaining texture in dark areas.` },
      { issue: `The dramatic effect creates uneven lighting across the face`, why_it_happens: `Strong directional light can create one side of the face well-lit while the other loses all detail.`, fix: `Add dramatic lighting with subtle fill to retain facial detail on both sides.` },
      { issue: `The rim light appears as a harsh white outline rather than a subtle edge separation`, why_it_happens: `AI generators sometimes render rim light as an unnatural bright outline instead of a natural edge highlight.`, fix: `Specify subtle natural rim light or soft edge highlight instead of strong rim light.` },
      { issue: `The chiaroscuro shadow-to-highlight ratio is too extreme, losing midtone transitions on the face`, why_it_happens: `AI generators may push chiaroscuro contrast beyond photorealistic range, creating an unnatural split between lit and shadow regions.`, fix: `Soften the shadow-to-highlight transition with a graduated fill or specify chiaroscuro with retained midtone detail.` },
      { issue: `The dark background merges with the shadow side of the subject, erasing the silhouette edge`, why_it_happens: `In high-contrast dark scenes, the AI may lose the boundary between subject shadows and the background darkness.`, fix: `Add a subtle edge light or rim highlight to separate the subject silhouette from the dark background.` },
      { issue: `Reflections in the sunglasses show incorrect scene elements or missing detail`, why_it_happens: `AI generators may render sunglass reflections with random or physically impossible scene content rather than a plausible reflected environment.`, fix: `Specify a consistent reflected environment across both lenses or simplify the reflection to a clean gradient.` },
      { issue: `The sunglasses lenses appear at different sizes or angles, breaking facial symmetry`, why_it_happens: `AI generators may render each sunglass lens with slightly different proportions, especially in close-up portraits.`, fix: `Add perfectly symmetrical sunglass frames with matching lens sizes and angles on both sides of the face.` },
    );
  }
  if (entities.hasSoftLight) {
    c.push(
      { issue: `The soft light appears flat and lacking in dimensional quality`, why_it_happens: `Excessively soft or diffused lighting can remove all shadow definition, making the image look two-dimensional.`, fix: `Add a subtle directional element to the soft light — wrapping light with gentle shadow falloff.` },
      { issue: `The window light creates an uneven exposure with bright window and dark interior`, why_it_happens: `High dynamic range between window and interior can cause the AI to expose for one or the other.`, fix: `Specify balanced exposure with window light and interior fill or position the subject closer to the window.` },
    );
  }
  if (entities.hasCandlelight) {
    c.push(
      { issue: `The candlelight renders as an unnatural orange wash or flickering artifacts appear`, why_it_happens: `AI models may exaggerate the warm temperature of candlelight, creating inconsistent color patterns.`, fix: `Add warm candlelight with natural skin tones and specify a single steady light direction.` },
      { issue: `Multiple candle flames appear at different sizes or positions than specified`, why_it_happens: `AI generators sometimes add or move candle elements, creating inconsistent light sources.`, fix: `Specify the exact number and position of candles, or use single candle for simplicity.` },
    );
  }
  if (entities.hasMoody) {
    c.push(
      { issue: `The moody lighting is too dark, losing the subject facial features in shadow`, why_it_happens: `AI generators may push moody to extreme darkness, obscuring the primary subject.`, fix: `Add moody atmosphere with subject face clearly visible and properly exposed.` },
      { issue: `The shadows create harsh divisions across the face instead of smooth gradients`, why_it_happens: `AI models may render shadow transitions as hard edges rather than natural smooth gradients.`, fix: `Specify smooth shadow transitions or gradual shadow falloff for more natural moody lighting.` },
    );
  }
  if (entities.hasStudioLight) {
    c.push(
      { issue: `The studio lighting creates visible hotspots or reflections on the subject skin`, why_it_happens: `Direct studio lights can create specular highlights on skin that AI generators may exaggerate.`, fix: `Add diffused studio lighting with no skin hotspots or soft key light with large modifier.` },
      { issue: `The three-point lighting setup creates an unnatural, overly-lit appearance`, why_it_happens: `AI generators may apply all lights at equal intensity, eliminating the natural shadow hierarchy.`, fix: `Specify the light hierarchy — dominant key light, subtle fill, accent rim — for natural studio depth.` },
    );
  }

  // ─── WARDROBE-SPECIFIC (additional) ───
  if (entities.hasDress) {
    c.push(
      { issue: `The dress fabric loses sheen or texture detail under the current lighting`, why_it_happens: `AI generators may not correctly render how different dress fabrics catch and reflect light.`, fix: `Specify the fabric type explicitly — silk, chiffon, velvet, or satin — and ensure adequate directional light.` },
    );
  }

  // ─── TITLE-WORD GROUNDED (additional) ───
  if (tWord1) {
    c.push(
      { issue: `The ${tWord1} element appears visually disconnected from the overall scene`, why_it_happens: `AI generators may render the ${tWord1} element without proper integration into the scene lighting and perspective.`, fix: `Ensure the ${tWord1} element shares the same lighting direction and color temperature as the rest of the scene.` },
    );
  }

  // ─── MULTI-NOUN COMBINATION CANDIDATES (last-resort, high-specificity) ───
  // Generate candidates from combinations of ALL extracted nouns to create
  // unique text that differentiates prompts with common entity profiles.
  // Uses fw2 (second wardrobe), fc2 (second color), fp (first prop), etc.
  if (nouns.wardrobe.length >= 2 && nouns.colors.length >= 1) {
    const fw2 = nouns.wardrobe[1] || '';
    if (fw2) {
      c.push(
        { issue: `The ${fw} and ${fw2} render with identical texture density in the monochrome palette, making the layered garments indistinguishable`, why_it_happens: `When two garments share similar tonal values in monochrome, AI generators may collapse them into a single undifferentiated mass rather than showing distinct fabric layers.`, fix: `Specify different fabric textures for the ${fw} and ${fw2} — matte versus sheen, smooth versus textured — to maintain visual separation in monochrome.` },
        { issue: `The ${fw2} collar or neckline details merge with the ${fw} lapels, creating an undefined neckline area`, why_it_happens: `AI generators struggle with layered garment boundaries where two different fabrics meet at the neckline, especially when both are dark in monochrome.`, fix: `Specify clear ${fw2} collar visible above the ${fw} with distinct edge separation and fabric contrast at the neckline.` },
      );
    }
  }
  if (nouns.colors.length >= 2 && nouns.wardrobe.length >= 1) {
    c.push(
      { issue: `The color contrast between the ${nouns.colors[0]} garment and ${nouns.colors[1] || 'neutral'} element flattens when converted to monochrome`, why_it_happens: `Colors that appear distinctly different in color mode may produce nearly identical grayscale values, removing the intended visual hierarchy.`, fix: `Specify luminance contrast between the ${nouns.colors[0]} and ${nouns.colors[1] || 'neutral'} elements to ensure distinct tonal separation in the monochrome output.` },
    );
  }
  if (nouns.props.length >= 1 && nouns.wardrobe.length >= 1) {
    const fp = nouns.props[0] || '';
    c.push(
      { issue: `The ${fp} creates an unintended color accent that disrupts the otherwise unified monochrome palette`, why_it_happens: `A ${fp} rendered in its natural color can clash with the monochromatic treatment of the rest of the scene, creating an inconsistent visual tone.`, fix: `Specify the ${fp} in a tone that harmonizes with the monochrome palette or adjust its saturation to match the overall treatment.` },
      { issue: `The ${fw} fabric appears physically disconnected from the ${fp}, as if composited rather than naturally interacting`, why_it_happens: `AI generators may render the subject and furniture as separate visual layers without proper shadow interaction and weight distribution at contact points.`, fix: `Specify natural shadow contact between the ${fw} and ${fp} with consistent lighting across both surfaces.` },
    );
  }
  if (nouns.wardrobe.length >= 2 && nouns.props.length >= 1) {
    const fw2 = nouns.wardrobe[1] || '';
    const fp = nouns.props[0] || '';
    c.push(
      { issue: `The ${fw2} visible under the ${fw} creates an awkward layering effect at the chest area`, why_it_happens: `AI generators may render the inner ${fw2} as a separate floating element rather than naturally layered beneath the outer ${fw}.`, fix: `Specify natural garment layering with the ${fw2} visible only at the collar and cuffs beneath the ${fw}.` },
    );
  }
  if (nouns.wardrobe.length >= 1 && nouns.props.length >= 1) {
    const fw = nouns.wardrobe[0] || '';
    const fp = nouns.props[0] || '';
    c.push(
      { issue: `The seated subject body casts an unrealistic shadow pattern across the ${fp} surface`, why_it_happens: `AI generators may produce physically impossible shadow directions where the ${fw}-clad subject meets the ${fp}.`, fix: `Specify consistent directional lighting with natural shadow cast from the subject onto the ${fp} surface.` },
    );
  }
  // ─── END MULTI-NOUN COMBINATION CANDIDATES ───

  // ─── UNIVERSAL FALLBACKS ───
  c.push(
    { issue: `The generated composition shifts between frames, making the result inconsistent`, why_it_happens: `AI models interpret prompts probabilistically — framing, pose, and mood vary between generations.`, fix: `Add explicit composition instructions and regenerate 3-5 times to select the best result.` },
    { issue: `The subject facial features change slightly between generations`, why_it_happens: `Without a reference image, the AI generates a slightly different face each time.`, fix: `Use a reference-image-capable tool and provide a consistent face reference for identity stability.` },
    { issue: `The overall color palette appears warmer or cooler than the intended mood`, why_it_happens: `AI generators may shift the color temperature based on internal model tendencies.`, fix: `Specify the exact color temperature — warm golden tones or cool blue-grey — and verify across generations.` },
    { issue: `The image resolution or detail level appears lower than expected`, why_it_happens: `AI generators sometimes produce soft or low-detail results due to prompt complexity or model limitations.`, fix: `Simplify the prompt to focus detail on the primary subject, or use upscaling in post-production.` },
    { issue: `The subject appears slightly off-center or poorly positioned within the frame`, why_it_happens: `AI generators may place the subject with unexpected framing that shifts between generations.`, fix: `Add explicit framing instructions — centered, rule of thirds, or specific crop — and regenerate to match.` },
    { issue: `The background elements distract from the primary subject of the image`, why_it_happens: `AI generators may add unintentional detail or bright spots in the background that pull visual attention.`, fix: `Reduce background complexity or add shallow depth of field to keep the subject as the clear focal point.` },
    { issue: `The skin tones appear unnatural or inconsistent across different areas of the face`, why_it_happens: `AI generators may render skin with uneven color patches or an artificial plastic quality in certain regions.`, fix: `Specify natural even skin tones with subtle variation and regenerate to find the most flattering result.` },
    { issue: `The overall contrast ratio feels too harsh or too flat for the intended mood`, why_it_happens: `AI generators may interpret contrast instructions inconsistently, producing either blown highlights or muddy shadows.`, fix: `Fine-tune the contrast with explicit tonal range descriptors — retain highlights, preserve shadow detail, smooth midtone transitions.` },
    { issue: `Hair strands appear clumped together rather than showing individual detail`, why_it_happens: `AI generators often merge hair into solid masses instead of rendering fine individual strands and natural movement.`, fix: `Add visible individual hair strands with natural flow direction and specify hair texture detail in the prompt.` },
  );

  return { candidates: c, seed };
}

/* ─── Unique candidate selection ─────────────────────────────────────── */

function selectUniqueTips(prompt, entities, nouns, registry) {
  const { candidates, seed } = generateTipCandidates(prompt, entities, nouns);
  const selected = [];
  const used = new Set();

  for (let attempt = 0; attempt < candidates.length && selected.length < 3; attempt++) {
    const idx = pickIndex(candidates, seed + attempt);
    if (used.has(idx)) continue;
    used.add(idx);
    registry.tipAttempt();
    if (registry.isTipUnique(candidates[idx])) {
      registry.acceptTip(candidates[idx]);
      selected.push(candidates[idx]);
    } else {
      registry.tipCollision();
    }
  }

  for (let i = 0; i < candidates.length && selected.length < 3; i++) {
    if (used.has(i)) continue;
    used.add(i);
    registry.tipAttempt();
    if (registry.isTipUnique(candidates[i])) {
      registry.acceptTip(candidates[i]);
      selected.push(candidates[i]);
    } else {
      registry.tipCollision();
    }
  }

  return selected;
}

function selectUniqueTroubleshooting(prompt, entities, nouns, registry) {
  const { candidates, seed } = generateTrblCandidates(prompt, entities, nouns);
  const selected = [];
  const used = new Set();

  for (let attempt = 0; attempt < candidates.length && selected.length < 2; attempt++) {
    const idx = pickIndex(candidates, seed + attempt);
    if (used.has(idx)) continue;
    used.add(idx);
    registry.issueAttempt();
    const cand = candidates[idx];
    if (registry.isIssueUnique(cand.issue) && registry.isFixUnique(cand.fix)) {
      registry.acceptEntry(cand);
      selected.push(cand);
    } else {
      registry.issueCollision();
    }
  }

  for (let i = 0; i < candidates.length && selected.length < 2; i++) {
    if (used.has(i)) continue;
    used.add(i);
    registry.issueAttempt();
    const cand = candidates[i];
    if (registry.isIssueUnique(cand.issue) && registry.isFixUnique(cand.fix)) {
      registry.acceptEntry(cand);
      selected.push(cand);
    } else {
      registry.issueCollision();
    }
  }

  return selected;
}

/* ─── UniquenessRegistry ─────────────────────────────────────────────── */

class UniquenessRegistry {
  constructor(existingPrompts) {
    this.existingTips = new Set();
    this.existingIssues = new Set();
    this.existingFixes = new Set();
    for (const p of existingPrompts) {
      const tips = Array.isArray(p.customization_tips) ? p.customization_tips : [];
      for (const t of tips) this.existingTips.add(norm(t));
      const trbl = Array.isArray(p.prompt_specific_troubleshooting) ? p.prompt_specific_troubleshooting : [];
      for (const e of trbl) {
        if (e.issue) this.existingIssues.add(norm(e.issue));
        if (e.fix) this.existingFixes.add(norm(e.fix));
      }
    }
    this.proposedTips = new Set();
    this.proposedIssues = new Set();
    this.proposedFixes = new Set();
    this.tipCollisions = 0;
    this.issueCollisions = 0;
    this.tipAttempts = 0;
    this.issueAttempts = 0;
  }

  isTipUnique(text) {
    const n = norm(text);
    if (!n || n.length < 15) return false;
    if (this.existingTips.has(n)) return false;
    if (this.proposedTips.has(n)) return false;
    return true;
  }

  isIssueUnique(text) {
    const n = norm(text);
    if (!n || n.length < 15) return false;
    if (this.existingIssues.has(n)) return false;
    if (this.proposedIssues.has(n)) return false;
    return true;
  }

  isFixUnique(text) {
    const n = norm(text);
    if (!n || n.length < 15) return false;
    if (this.existingFixes.has(n)) return false;
    if (this.proposedFixes.has(n)) return false;
    return true;
  }

  acceptTip(text) { this.proposedTips.add(norm(text)); }
  acceptEntry(entry) {
    if (entry.issue) this.proposedIssues.add(norm(entry.issue));
    if (entry.fix) this.proposedFixes.add(norm(entry.fix));
  }
  tipCollision() { this.tipCollisions++; this.tipAttempts++; }
  tipAttempt() { this.tipAttempts++; }
  issueCollision() { this.issueCollisions++; this.issueAttempts++; }
  issueAttempt() { this.issueAttempts++; }
}

/* ─── Detect duplicate groups ────────────────────────────────────────── */

function findDuplicateTipGroups(prompts) {
  const map = new Map();
  for (const p of prompts) {
    const raw = p.customization_tips;
    if (raw == null) continue;
    const items = Array.isArray(raw) ? raw.filter(t => String(t||'').trim()) : [];
    if (items.length === 0) continue;
    const key = items.map(t => norm(t)).join(' ||| ');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()].filter(([,a]) => a.length > 1).sort((a,b) => b[1].length - a[1].length);
}

function findDuplicateTroubleshootingGroups(prompts) {
  const map = new Map();
  for (const p of prompts) {
    const raw = p.prompt_specific_troubleshooting;
    if (raw == null) continue;
    const items = Array.isArray(raw) ? raw.filter(e => e && (e.issue || e.fix)) : [];
    if (items.length === 0) continue;
    const key = items.map(e => `${norm(e.issue)}|||${norm(e.why_it_happens)}|||${norm(e.fix)}`).join(' ### ');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()].filter(([,a]) => a.length > 1).sort((a,b) => b[1].length - a[1].length);
}

/* ─── Snapshot verification ──────────────────────────────────────────── */

function verifySnapshot(current, snapshot) {
  const cT = Array.isArray(current.customization_tips) ? current.customization_tips.map(t=>norm(t)).join(' ||| ') : '';
  const sT = Array.isArray(snapshot.customization_tips) ? snapshot.customization_tips.map(t=>norm(t)).join(' ||| ') : '';
  const cTr = Array.isArray(current.prompt_specific_troubleshooting) ? JSON.stringify(current.prompt_specific_troubleshooting.map(e=>({i:norm(e.issue),w:norm(e.why_it_happens),f:norm(e.fix)}))) : '';
  const sTr = Array.isArray(snapshot.prompt_specific_troubleshooting) ? JSON.stringify(snapshot.prompt_specific_troubleshooting.map(e=>({i:norm(e.issue),w:norm(e.why_it_happens),f:norm(e.fix)}))) : '';
  return cT===sT && cTr===sTr;
}

/* ─── Post-repair verification ───────────────────────────────────────── */

async function postRepairVerification(db) {
  console.log('\n  POST-REPAIR VERIFICATION\n');
  const {rows:a}=await db.query(`SELECT COUNT(*) AS c FROM prompts WHERE status='published' AND (customization_tips IS NULL OR jsonb_array_length(customization_tips)<2)`);
  const {rows:b}=await db.query(`SELECT COUNT(*) AS c FROM prompts WHERE status='published' AND (prompt_specific_troubleshooting IS NULL OR jsonb_array_length(prompt_specific_troubleshooting)<2)`);
  const {rows:c2}=await db.query(`SELECT COUNT(*) AS c FROM (SELECT customization_tips::text AS x,COUNT(*) AS n FROM prompts WHERE status='published' AND customization_tips IS NOT NULL AND jsonb_array_length(customization_tips)>=2 GROUP BY x HAVING COUNT(*)>1) s`);
  const {rows:d}=await db.query(`SELECT COUNT(*) AS c FROM (SELECT prompt_specific_troubleshooting::text AS x,COUNT(*) AS n FROM prompts WHERE status='published' AND prompt_specific_troubleshooting IS NOT NULL AND jsonb_array_length(prompt_specific_troubleshooting)>=2 GROUP BY x HAVING COUNT(*)>1) s`);
  const {rows:tot}=await db.query(`SELECT COUNT(*) AS c FROM prompts WHERE status='published'`);
  console.log(`  < 2 tips: ${a[0].c} ${Number(a[0].c)===0?'✓':'✗'}`);
  console.log(`  < 2 troubleshooting: ${b[0].c} ${Number(b[0].c)===0?'✓':'✗'}`);
  console.log(`  Duplicate tip groups: ${c2[0].c}`);
  console.log(`  Duplicate troubleshooting groups: ${d[0].c}`);
  console.log(`  Total published: ${tot[0].c}`);
  const pass=Number(a[0].c)===0&&Number(b[0].c)===0;
  console.log(`\n  VERIFICATION: ${pass?'PASS':'FAIL'}\n`);
  return pass;
}

/* ─── Main ───────────────────────────────────────────────────────────── */

async function main() {
  const db = getPgPool();
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  === STEP 8 ${isApply?'APPLY':'DRY RUN'} (v4 — prompt-text-derived candidates) ===`);
  console.log(`${'═'.repeat(72)}\n`);

  const {rows:prompts}=await db.query(`SELECT p.id,p.title,p.slug,p.prompt,p.intro,p.tags,p.customization_tips,p.prompt_specific_troubleshooting,p.faqs,p.best_use_case AS "bestUseCase" FROM prompts p WHERE p.status='published' ORDER BY p.id`);
  console.log(`  Published prompts: ${prompts.length}\n`);

  const registry = new UniquenessRegistry(prompts);

  const tipDupGroups = findDuplicateTipGroups(prompts);
  const trblDupGroups = findDuplicateTroubleshootingGroups(prompts);
  console.log(`  Existing duplicate customization groups: ${tipDupGroups.length}`);
  console.log(`  Existing duplicate troubleshooting groups: ${trblDupGroups.length}\n`);

  const proposed = [];
  const canonicalSlugs = new Set();
  let unresolved = 0;

  // Tip duplicates
  for (const [key, group] of tipDupGroups) {
    const canonical = group[0];
    canonicalSlugs.add(canonical.slug);
    for (let i = 1; i < group.length; i++) {
      const p = group[i];
      if (proposed.find(r => r.id === p.id)) continue;
      const entities = extractEntities(p);
      const nouns = extractNouns(p);
      const newTips = selectUniqueTips(p, entities, nouns, registry);
      const currentTips = Array.isArray(p.customization_tips) ? p.customization_tips.filter(t=>String(t||'').trim()) : [];
      if (newTips.length < 2) { unresolved++; console.log(`  ⚠ UNRESOLVED: ${p.slug} (id:${p.id}) — tips`); continue; }
      proposed.push({ id:p.id, slug:p.slug, title:p.title, reason:'EXACT DUPLICATE customization_tips', currentTips, currentTrbl:Array.isArray(p.prompt_specific_troubleshooting)?p.prompt_specific_troubleshooting:[], newTips, newTrbl:[], changeTips:true, changeTrbl:false });
    }
  }

  // Troubleshooting duplicates
  for (const [key, group] of trblDupGroups) {
    const canonical = group[0];
    canonicalSlugs.add(canonical.slug);
    for (let i = 1; i < group.length; i++) {
      const p = group[i];
      const existing = proposed.find(r => r.id === p.id);
      const entities = extractEntities(p);
      const nouns = extractNouns(p);
      const newTrbl = selectUniqueTroubleshooting(p, entities, nouns, registry);
      if (newTrbl.length < 2) { unresolved++; console.log(`  ⚠ UNRESOLVED: ${p.slug} (id:${p.id}) — troubleshooting`); continue; }
      if (existing) {
        if (!existing.changeTrbl) { existing.newTrbl = newTrbl; existing.changeTrbl = true; }
      } else {
        proposed.push({ id:p.id, slug:p.slug, title:p.title, reason:'EXACT DUPLICATE prompt_specific_troubleshooting', currentTips:Array.isArray(p.customization_tips)?p.customization_tips.filter(t=>String(t||'').trim()):[], currentTrbl:Array.isArray(p.prompt_specific_troubleshooting)?p.prompt_specific_troubleshooting.filter(e=>e&&(e.issue||e.fix)):[], newTips:[], newTrbl, changeTips:false, changeTrbl:true });
      }
    }
  }

  // Final validation
  const pTips = new Set(); const pIssues = new Set(); const conflicts = [];
  for (const item of proposed) {
    for (const t of item.newTips) { const k=norm(t); if(pTips.has(k)) conflicts.push(`DUP TIP: "${short(t,80)}"`); pTips.add(k); }
    for (const e of item.newTrbl) { const k=norm(e.issue); if(pIssues.has(k)) conflicts.push(`DUP ISSUE: "${short(e.issue,80)}"`); pIssues.add(k); }
  }
  const pass = conflicts.length === 0 && unresolved === 0;

  console.log(`\n${'─'.repeat(72)}\n  Canonical prompts preserved:\n${'─'.repeat(72)}`);
  for (const s of [...canonicalSlugs].sort()) console.log(`    - ${s}`);

  console.log(`\n${'─'.repeat(72)}\n  Prompts to repair:\n${'─'.repeat(72)}`);
  let tc=0, trc=0;
  for (const item of proposed) {
    console.log(`\n  ── ${item.slug} (id:${item.id}) ──`);
    console.log(`  Reason: ${item.reason}`);
    if (item.changeTips) { tc++; console.log(`  Proposed tips (${item.newTips.length}):`); item.newTips.forEach((t,i)=>console.log(`    [${i+1}] ${t}`)); }
    if (item.changeTrbl) { trc++; console.log(`  Proposed troubleshooting (${item.newTrbl.length}):`); item.newTrbl.forEach((e,i)=>{ console.log(`    [${i+1}] Issue: ${e.issue}`); console.log(`        Why:   ${e.why_it_happens}`); console.log(`        Fix:   ${e.fix}`); }); }
  }

  console.log(`\n${'═'.repeat(72)}\n  SUMMARY\n${'═'.repeat(72)}`);
  console.log(`  Published prompts:                          ${prompts.length}`);
  console.log(`  Existing duplicate customization groups:     ${tipDupGroups.length}`);
  console.log(`  Existing duplicate troubleshooting groups:   ${trblDupGroups.length}`);
  console.log(`  Proposed repairs:                           ${proposed.length}`);
  console.log(`  Prompts selected for tip repair:            ${tc}`);
  console.log(`  Prompts selected for troubleshooting repair: ${trc}`);
  console.log(`  Canonical prompts preserved:                ${canonicalSlugs.size}`);
  console.log(`  Unresolved (could not generate unique):     ${unresolved}`);
  console.log(`  Candidate generation attempts:              ${registry.tipAttempts + registry.issueAttempts}`);
  console.log(`  Candidate collisions rejected:              ${registry.tipCollisions + registry.issueCollisions}`);
  console.log(`  Final proposed duplicate tips:              ${conflicts.filter(c=>c.includes('TIP')).length}`);
  console.log(`  Final proposed duplicate troubleshooting issues: ${conflicts.filter(c=>c.includes('ISSUE')).length}`);
  console.log(`  FAQ changes:                                0`);
  console.log(`  Aspect-ratio changes:                       0`);
  console.log(`  Prompt text changes:                        0`);
  console.log(`  SEO changes:                                0`);
  console.log(`  Category changes:                           0`);
  console.log(`  Uniqueness validation:                      ${pass?'PASSED':'FAILED'}`);
  console.log(`  Mode:                                       ${isApply?'APPLY':'DRY-RUN'}`);
  console.log(`${'═'.repeat(72)}\n`);

  if (!pass) {
    console.log('  ✗ CANNOT PROCEED — uniqueness validation failed\n');
    if (conflicts.length > 0) { console.log('  Conflicts:'); conflicts.forEach(c=>console.log(`    ${c}`)); }
    if (unresolved > 0) console.log(`  ${unresolved} prompt(s) could not receive unique content`);
    await db.end(); process.exitCode = 1; return;
  }

  if (isApply) {
    console.log('  Applying changes...\n');
    let applied=0, skipped=0, failed=0;
    for (const item of proposed) {
      try {
        const {rows}=await db.query('SELECT id,slug,customization_tips,prompt_specific_troubleshooting FROM prompts WHERE id=$1 AND status=$2',[item.id,'published']);
        if(!rows.length){console.log(`  ✗ SKIP ${item.slug}: not found`);skipped++;continue;}
        if(!verifySnapshot(rows[0],{customization_tips:item.currentTips,prompt_specific_troubleshooting:item.currentTrbl})){console.log(`  ✗ SKIP ${item.slug}: changed`);skipped++;continue;}
        const sets=[],vals=[];let pi=1;
        if(item.changeTips){sets.push(`customization_tips=$${pi}::jsonb`);vals.push(JSON.stringify(item.newTips));pi++;}
        if(item.changeTrbl){sets.push(`prompt_specific_troubleshooting=$${pi}::jsonb`);vals.push(JSON.stringify(item.newTrbl));pi++;}
        sets.push('updated_at=NOW()');vals.push(item.id);
        const r=await db.query(`UPDATE prompts SET ${sets.join(',')} WHERE id=$${pi} AND status='published'`,vals);
        if(r.rowCount===1){console.log(`  ✓ ${item.slug} — updated`);applied++;}
        else{console.log(`  ✗ ${item.slug} — unexpected rowCount`);failed++;}
      }catch(err){console.log(`  ✗ ${item.slug} — ${err.message}`);failed++;}
    }
    console.log(`\n${'═'.repeat(72)}\n  === STEP 8 APPLY RESULT ===\n${'═'.repeat(72)}`);
    console.log(`  Prompts updated: ${applied}`);console.log(`  Prompts skipped: ${skipped}`);console.log(`  Prompts failed: ${failed}`);
    console.log(`  Tips repaired: ${tc}`);console.log(`  Troubleshooting repaired: ${trc}`);
    console.log(`  FAQs/text/SEO/categories modified: 0`);
    console.log(`${'═'.repeat(72)}\n`);
    if(applied>0) await postRepairVerification(db);
  } else {
    console.log('  REPAIR PLAN READY');
    console.log('  To apply: node scripts/repair-editorial-duplicates.mjs --apply\n');
  }

  await db.end();
}

main().catch(err => { console.error('Fatal error:', err); process.exitCode = 1; });
