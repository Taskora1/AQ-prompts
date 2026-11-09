#!/usr/bin/env node
/**
 * diagnose-low-tips.mjs
 *
 * READ-ONLY diagnostic: finds published prompts with <2 customization tips,
 * determines why they were left unsatisfied, and proposes targeted fixes.
 *
 * Usage:
 *   node scripts/diagnose-low-tips.mjs
 */

import { getPgPool } from './lib/load-local-env.mjs';

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractEntities(p) {
  const text = `${p.prompt || ''} ${p.title || ''}`.toLowerCase();
  const tags = Array.isArray(p.tags) ? p.tags.map(t => String(t).toLowerCase()).join(' ') : '';
  const combined = `${text} ${tags}`;
  const hasSuit = /\b(suit|blazer|tuxedo|tux)\b/.test(combined);
  const hasDress = /\b(dress|gown)\b/.test(combined);
  const hasKurta = /\b(kurta|kameez|shalwar|lehenga|sari|saree|sharara)\b/.test(combined);
  const hasBw = /\b(monochrome|black.and.white|bw|grayscale|greyscale)\b/.test(combined);
  const hasText = /\b(typography|text|quote|magazine|newspaper|poster|logo|username|watermark|caption|headline)\b/.test(combined);
  const hasDoubleExposure = /\b(double.?exposure|dual.?exposure|overlay|blend|composite|superimposed)\b/.test(combined);
  const hasIllustration = /\b(illustration|illustrated|drawing|sketch|pencil|vector|watercolor|cartoon|anime|pixar|3d|isometric|painterly)\b/.test(combined);
  const hasCollage = /\b(collage|scrapbook|mood.?board|sticker|panel|mosaic|grid|multi.?frame|diptych)\b/.test(combined);
  const hasReflection = /\b(reflection|mirrored|mirror|reflected|water.?surface|glass.?surface)\b/.test(combined);
  const hasRain = /\b(rain|rainy|drizzle|downpour|monsoon|raindrop)\b/.test(combined);
  const hasSmoke = /\b(smoke|smoky|haze|fog|mist|steam)\b/.test(combined);
  const isStudio = /\b(studio|backdrop|seamless|studio.?light)\b/.test(combined);
  const isBeach = /\b(beach|coast|ocean|sea|shore|sand|waves)\b/.test(combined);
  const isUrban = /\b(urban|street|city|alley|downtown|sidewalk)\b/.test(combined);
  const isHotel = /\b(hotel|resort|lobby|suite|corridor|hallway)\b/.test(combined);
  const isPark = /\b(park|garden|botanical|arboretum|lawn|meadow|forest|woods)\b/.test(combined);
  const isCafe = /\b(cafe|coffee|restaurant|bistro|bar|pub)\b/.test(combined);
  const isRiverside = /\b(river|riverfront|riverside|waterfront|canal)\b/.test(combined);
  const isOffice = /\b(office|workspace|desk|cubicle|corporate|boardroom)\b/.test(combined);
  const hasGoldenHour = /\b(golden.?hour|golden.?light|sunset.?light|warm.?sunlight)\b/.test(combined);
  const hasNeon = /\b(neon|led.?sign|fluorescent)\b/.test(combined);
  const hasDramatic = /\b(dramatic|chiaroscuro|rembrandt|low.?key|high.?contrast)\b/.test(combined);
  const hasSoftLight = /\b(soft.?light|diffused|wrapping.?light|overcast|cloudy|window.?light|natural.?light)\b/.test(combined);
  const hasMoody = /\b(moody|dark.?atmosphere|shadowy|brooding)\b/.test(combined);
  const hasJewelry = /\b(jewelry|jewellery|necklace|earring|ring|bracelet|pendant|chain)\b/.test(combined);
  const hasHat = /\b(hat|cap|beret|fedora|beanie|headwear)\b/.test(combined);
  const hasEyewear = /\b(glasses|sunglasses|eyewear|spectacles|aviator|frames)\b/.test(combined);
  const hasFlowers = /\b(flower|floral|petals|blossom|bouquet|rose|tulip|lily|orchid)\b/.test(combined);
  const hasCar = /\b(car|automobile|vehicle|sports.?car|sedan|lamborghini|ferrari|porsche)\b/.test(combined);
  const hasWatch = /\b(watch|wristwatch|chronograph|timepiece|clock)\b/.test(combined);
  let composition = '';
  if (/\b(close.?up|headshot|face.?shot|macro)\b/.test(combined)) composition = 'close-up';
  else if (/\b(full.?body|full.?length|head.?to.?toe)\b/.test(combined)) composition = 'full-body';
  const style = [];
  if (/\b(luxury|luxurious|premium|high.?end|exclusive|elegant)\b/.test(combined)) style.push('luxury');
  if (/\b(editorial|fashion.?editorial|magazine.?style)\b/.test(combined)) style.push('editorial');
  if (/\b(corporate|professional|business|executive|formal)\b/.test(combined)) style.push('corporate');
  if (/\b(cinematic|film.?style|movie|blockbuster)\b/.test(combined)) style.push('cinematic');
  if (/\b(vintage|retro|nostalgic|classic)\b/.test(combined)) style.push('vintage');
  if (/\b(modern|minimalist|clean|sleek)\b/.test(combined)) style.push('modern');
  return { hasSuit, hasDress, hasKurta, hasBw, hasText, hasDoubleExposure, hasIllustration, hasCollage, hasReflection, hasRain, hasSmoke, isStudio, isBeach, isUrban, isHotel, isPark, isCafe, isRiverside, isOffice, hasGoldenHour, hasNeon, hasDramatic, hasSoftLight, hasMoody, hasJewelry, hasHat, hasEyewear, hasFlowers, hasCar, hasWatch, composition, style };
}

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
    wardrobe: extractFrom(['suit','blazer','jacket','dress','gown','kurta','kameez','shalwar','shirt','blouse','top','sweater','knit','hoodie','bomber','turtleneck']),
    environment: extractFrom(['studio','backdrop','beach','ocean','urban','street','city','hotel','park','garden','forest','cafe','restaurant','river','office','bedroom','penthouse','rooftop']),
    lighting: extractFrom(['golden','neon','dramatic','chiaroscuro','soft','diffused','natural','window','moody','key','studio','rim']),
    colors: extractFrom(['black','white','blue','green','red','royal','burgundy','charcoal','teal','golden','crimson','navy','emerald','coral','silver','ivory','cream','pink','orange']),
    techniques: extractFrom(['typography','text','poster','magazine','watercolor','illustration','sketch','cartoon','anime','collage','reflection','mirror','smoke','fog','rain','double-exposure']),
    props: extractFrom(['jewelry','necklace','earring','ring','bracelet','hat','glasses','sunglasses','flower','car','watch','armchair','chair','sofa']),
    subjects: extractFrom(['man','woman','boy','girl','male','female','person','couple']),
  };
}

function generateTips(p, entities, nouns) {
  const tips = [];
  const fw = nouns.wardrobe[0] || '';
  const fe = nouns.environment[0] || '';
  const fl = nouns.lighting[0] || '';
  const fc = nouns.colors[0] || '';

  // Wardrobe-specific
  if (entities.hasSuit) {
    tips.push(`Adjust the suit fabric texture — wool for structure, linen for relaxed drape, silk for sheen.`);
    tips.push(`Refine the suit fit — slim-cut for modern editorial, relaxed for classic editorial look.`);
    tips.push(`Consider the suit color against the ${fe || 'background'} — contrasting tones add depth, matching tones create monochrome elegance.`);
    tips.push(`Add a pocket square or lapel pin for a subtle luxury detail without overcomplicating the outfit.`);
  }
  if (entities.hasDress) {
    tips.push(`Adjust the dress silhouette — A-line for flow, sheath for structure, ball-gown for drama.`);
    tips.push(`Specify the dress fabric — silk for sheen, chiffon for movement, velvet for richness, cotton for casual.`);
    tips.push(`Add or remove accessories — statement earrings, necklace, or clutch to complement the dress.`);
    tips.push(`Tune the dress color saturation — muted for editorial restraint, vivid for high-impact visuals.`);
  }
  if (entities.hasKurta) {
    tips.push(`Specify the kurta embroidery style — chikankari, zardozi, thread work, or block print.`);
    tips.push(`Adjust the kurta length — short for modern fusion, long for traditional elegance.`);
    tips.push(`Pair with complementary bottomwear — churidar, pajama, jeans, or tailored trousers.`);
    tips.push(`Consider the fabric weight — cotton for casual, silk-satin for festive, linen for summer editorial.`);
  }
  if (nouns.wardrobe.some(w => /\b(jacket|bomber|hoodie|overcoat|trench)\b/.test(w))) {
    tips.push(`Adjust the jacket style — bomber for streetwear, leather for edge, denim for casual, blazer for formal.`);
    tips.push(`Specify the jacket material — leather, suede, denim, nylon, or wool.`);
    tips.push(`Layer the jacket over contrasting innerwear for visual depth and outfit complexity.`);
  }
  if (nouns.wardrobe.some(w => /\b(sweater|knit|pullover|cardigan)\b/.test(w))) {
    tips.push(`Specify the knit texture — cable-knit for depth, ribbed for structure, waffle for texture.`);
    tips.push(`Adjust the sweater fit — oversized for cozy editorial, fitted for sleek silhouette.`);
    tips.push(`Layer with a collared shirt underneath for a preppy or smart-casual aesthetic.`);
  }
  if (nouns.wardrobe.some(w => /\b(shirt|blouse|top|tee|t-shirt|polo)\b/.test(w))) {
    tips.push(`Specify the shirt fabric — cotton poplin for crisp, linen for relaxed, silk for luxury.`);
    tips.push(`Adjust the collar style — open collar for casual, buttoned for formal, mandarin for modern.`);
    tips.push(`Consider the shirt color against the outer layer for tonal contrast or monochrome harmony.`);
  }

  // Environment-specific
  if (entities.isStudio) {
    tips.push(`Adjust the studio backdrop color — seamless white for clean, dark for dramatic, colored for mood.`);
    tips.push(`Control the studio lighting ratio — high key for bright and airy, low key for moody and cinematic.`);
    tips.push(`Add or remove studio props — chair, stool, pillar, fabric drape — for compositional anchors.`);
    tips.push(`Specify the studio floor — reflective for depth, matte for minimal, seamless for infinite look.`);
  }
  if (entities.isBeach) {
    tips.push(`Adjust the time of day — golden hour for warmth, midday for bright, blue hour for ethereal mood.`);
    tips.push(`Control the water visibility — clear for tropical, dark for moody, waves for dynamic energy.`);
    tips.push(`Add environmental detail — shells, driftwood, seaweed, or wet sand reflections.`);
  }
  if (entities.isUrban) {
    tips.push(`Control the urban clutter level — clean and minimal for editorial focus, gritty for authentic street energy.`);
    tips.push(`Specify the architectural era — modern glass for sleek, brick for industrial, stone for classic.`);
    tips.push(`Add or remove pedestrian activity — empty streets for isolation, crowd for energy and scale.`);
  }
  if (entities.isHotel) {
    tips.push(`Specify the hotel style — modern minimalist, classic luxury, art deco, or boutique eclectic.`);
    tips.push(`Control the interior detail level — sparse for editorial minimal, ornate for rich luxury storytelling.`);
    tips.push(`Add warm ambient elements — lobby plants, warm wood, brass fixtures — for luxury atmosphere.`);
  }
  if (entities.isPark) {
    tips.push(`Specify the season — spring blossoms, summer green, autumn foliage, winter bare branches.`);
    tips.push(`Control the depth of field — sharp background for environmental portrait, soft for dreamy isolation.`);
    tips.push(`Add natural elements — fallen leaves, wildflowers, dappled light, morning dew.`);
  }
  if (entities.isCafe) {
    tips.push(`Control the cafe ambiance — minimalist Scandinavian for modern, warm wood for cozy, industrial for edgy.`);
    tips.push(`Add or remove table items — coffee cups, pastries, books, plants — for environmental storytelling.`);
    tips.push(`Specify the lighting — natural window light for authentic, warm pendant lights for intimate.`);
  }
  if (entities.isRiverside) {
    tips.push(`Specify the water character — calm reflections for serene, gentle ripples for subtle movement, rapids for energy.`);
    tips.push(`Add riverside elements — reeds, rocks, boats, bridges — for compositional anchors.`);
  }
  if (entities.isOffice) {
    tips.push(`Specify the office style — corner executive for authority, open plan for modern, home office for intimate.`);
    tips.push(`Add desk props — laptop, notepad, coffee mug, plant — for environmental realism.`);
  }

  // Lighting-specific
  if (entities.hasGoldenHour) {
    tips.push(`Adjust the golden hour warmth — cooler for subtle glow, warmer for romantic drama.`);
    tips.push(`Control the shadow length — long shadows for depth, shorter for softer look.`);
    tips.push(`Add lens flare or sun haze for authentic golden-hour atmosphere.`);
  }
  if (entities.hasNeon) {
    tips.push(`Control the neon intensity — subtle glow for ambiance, bold saturation for cyberpunk energy.`);
    tips.push(`Specify the neon colors — cool cyan and pink for vaporwave, warm reds and oranges for noir.`);
    tips.push(`Add neon reflections on wet surfaces or skin for environmental integration.`);
  }
  if (entities.hasDramatic) {
    tips.push(`Tune the dramatic lighting angle — Rembrandt triangle for classic, split for noir, butterfly for glamour.`);
    tips.push(`Control the shadow depth — deep shadows for mystery, lifted shadows for editorial breathing room.`);
    tips.push(`Add a subtle rim or edge light to separate the subject from the dark background.`);
  }
  if (entities.hasSoftLight) {
    tips.push(`Adjust the soft light direction — overhead for even, side for gentle dimension, front for beauty.`);
    tips.push(`Control the shadow softness — very soft for ethereal, slightly defined for natural portrait feel.`);
    tips.push(`Add subtle directionality to prevent the image from looking flat and lifeless.`);
  }
  if (entities.hasMoody) {
    tips.push(`Control the darkness level — deep shadows for mystery, lifted blacks for editorial mood.`);
    tips.push(`Add selective light to the subject face to maintain visibility within the dark atmosphere.`);
    tips.push(`Specify the mood tone — melancholic with cool tones, warm noir with amber accents, or gothic with deep shadows.`);
  }

  // Technique-specific
  if (entities.hasDoubleExposure) {
    tips.push(`Control the overlay opacity — subtle for organic blend, bold for graphic impact.`);
    tips.push(`Specify which layer is dominant — portrait prominent with landscape subtle, or equal blend.`);
    tips.push(`Choose the blend area — full-frame merge, silhouette cutout, or selective region overlay.`);
  }
  if (entities.hasReflection) {
    tips.push(`Control the reflection clarity — sharp mirror for crisp symmetry, softened for natural water feel.`);
    tips.push(`Specify the reflection surface — still water, wet pavement, glass, or polished metal.`);
    tips.push(`Adjust the reflection completeness — full reflection for drama, partial for compositional balance.`);
  }
  if (entities.hasText) {
    tips.push(`Simplify the typography to the shortest essential phrase — AI text rendering improves with fewer characters.`);
    tips.push(`Plan to overlay the text in post-production for guaranteed spelling accuracy.`);
    tips.push(`Use a bold, simple font — ornate fonts are harder for AI to render accurately.`);
  }
  if (entities.hasRain) {
    tips.push(`Adjust the rain density — light drizzle for subtle atmosphere, heavy downpour for dramatic presence.`);
    tips.push(`Specify droplet direction and size variation for natural water rendering.`);
    tips.push(`Add visible puddles or wet surfaces to reinforce the rain narrative.`);
  }
  if (entities.hasIllustration) {
    tips.push(`Adjust the illustration style — clean lines for modern, crosshatch for texture, watercolor wash for softness.`);
    tips.push(`Change the color palette — muted for vintage, vibrant for pop art, monochromatic for graphic impact.`);
    tips.push(`Vary the line weight — thick outlines for bold graphic style, thin for delicate detail.`);
  }
  if (entities.hasCollage) {
    tips.push(`Adjust the collage panel sizes — equal grids for order, varied sizes for dynamic hierarchy.`);
    tips.push(`Use a consistent color palette across all collage panels for visual cohesion.`);
    tips.push(`Add a border or gap between panels to create clean separation in the collage layout.`);
  }

  // Style-specific
  if (entities.style.includes('luxury')) {
    tips.push(`Enhance luxury cues — swap to ${fw || 'the garment'} in cashmere or silk, add a minimal watch, or shift the setting.`);
    tips.push(`Use a monochromatic color palette — head-to-toe in one tone reads as more expensive and curated.`);
    tips.push(`Add a single statement accessory — a watch, cufflink, or ring — for understated luxury signaling.`);
  }
  if (entities.style.includes('editorial')) {
    tips.push(`Shift editorial energy — deliberate poses with strong eye contact for drama, or candid motion for authenticity.`);
    tips.push(`Use dramatic lighting with strong shadows for high-fashion editorial impact.`);
    tips.push(`Choose a bold, single-color outfit against a contrasting background for graphic editorial punch.`);
  }
  if (entities.style.includes('corporate')) {
    tips.push(`Adjust the professional register — formal boardroom for executive authority, relaxed workspace for creative branding.`);
    tips.push(`Use a clean, neutral background to keep focus on the professional subject without distraction.`);
    tips.push(`Position the subject with confident posture — standing tall, hands visible, direct eye contact.`);
  }
  if (entities.style.includes('cinematic')) {
    tips.push(`Enhance cinematic quality — letterbox framing, teal-orange color grade, or subtle lens flare.`);
    tips.push(`Use a wide aspect ratio (16:9) for a more filmic, widescreen cinematic composition.`);
    tips.push(`Add atmospheric elements — smoke, haze, or practical lights — for cinematic depth and mood.`);
  }
  if (entities.style.includes('vintage')) {
    tips.push(`Adjust the vintage era — 1920s for art deco glamour, 1970s for earthy warmth, 1990s for raw energy.`);
    tips.push(`Add period-appropriate props and wardrobe details for historical authenticity.`);
    tips.push(`Apply subtle color grading — sepia for timeless, faded for nostalgic, cross-processed for experimental.`);
  }
  if (entities.style.includes('modern')) {
    tips.push(`Emphasize clean lines and geometric composition for modern editorial clarity.`);
    tips.push(`Use a neutral or monochrome palette with one accent color for modern visual impact.`);
    tips.push(`Simplify props and environment — modern aesthetics favor minimal distraction.`);
  }

  // Composition-specific
  if (entities.composition === 'close-up') {
    tips.push(`Tighten the crop to exclude shoulders for intimate face-only study, or include collarbone for editorial headshot.`);
    tips.push(`Shift the crop slightly off-center — rule of thirds placement creates more dynamic facial framing.`);
    tips.push(`Use a shallow depth of field to keep only the eyes sharp, softening the rest of the face for dreamy quality.`);
  }
  if (entities.composition === 'full-body') {
    tips.push(`Shift the camera angle — eye level for neutral presence, low angle for authority, elevated for approachable.`);
    tips.push(`Leave generous negative space around the figure for a sense of scale and environment.`);
    tips.push(`Position the subject slightly off-center for a more dynamic full-body composition.`);
  }

  // Prop-specific
  if (nouns.props.length > 0) {
    const fp = nouns.props[0];
    tips.push(`Ensure the ${fp} integrates naturally with the subject — correct scale, position, and lighting.`);
    tips.push(`Add or remove the ${fp} to change the composition balance and narrative focus.`);
    tips.push(`Specify the ${fp} material and color to complement rather than compete with the outfit.`);
  }

  // Monochrome-specific
  if (entities.hasBw) {
    tips.push(`Control the monochrome tonal range — high contrast for drama, low contrast for subtle editorial.`);
    tips.push(`Specify the black point — deep blacks for richness, lifted blacks for vintage film feel.`);
    tips.push(`Add texture cues to compensate for loss of color information in the monochrome treatment.`);
  }

  return tips;
}

async function main() {
  const db = getPgPool();
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  STEP 13 — READ-ONLY DIAGNOSIS: Prompts with <2 Customization Tips');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // 1. Find affected prompts
  const { rows: affected } = await db.query(`
    SELECT p.id, p.title, p.slug, p.prompt, p.tags,
           p.customization_tips, p.prompt_specific_troubleshooting
    FROM prompts p
    WHERE p.status = 'published'
      AND (p.customization_tips IS NULL OR jsonb_array_length(p.customization_tips) < 2)
    ORDER BY p.id ASC
  `);

  console.log(`  Total published prompts: (querying...)`);
  const { rows: tot } = await db.query(`SELECT COUNT(*) AS c FROM prompts WHERE status='published'`);
  console.log(`  Total published prompts: ${tot[0].c}`);
  console.log(`  Prompts with <2 customization tips: ${affected.length}\n`);

  if (affected.length === 0) {
    console.log('  All prompts have >=2 tips. No action needed.\n');
    await db.end();
    return;
  }

  // 2. Check duplicate groups
  const { rows: allPrompts } = await db.query(`
    SELECT p.id, p.slug, p.customization_tips
    FROM prompts p WHERE p.status='published' ORDER BY p.id
  `);

  // Find tip duplicate groups
  const tipMap = new Map();
  for (const p of allPrompts) {
    const raw = p.customization_tips;
    if (raw == null) continue;
    const items = Array.isArray(raw) ? raw.filter(t => String(t||'').trim()) : [];
    if (items.length === 0) continue;
    const key = items.map(t => norm(t)).join(' ||| ');
    if (!tipMap.has(key)) tipMap.set(key, []);
    tipMap.get(key).push(p);
  }
  const tipDupGroups = [...tipMap.entries()].filter(([,a]) => a.length > 1);

  // Build set of IDs that are in duplicate groups
  const dupIds = new Set();
  for (const [, group] of tipDupGroups) {
    for (const p of group) dupIds.add(p.id);
  }

  // 3. Analyze each affected prompt
  const registry = new Set();
  for (const p of allPrompts) {
    const raw = p.customization_tips;
    if (raw == null) continue;
    const items = Array.isArray(raw) ? raw.filter(t => String(t||'').trim()) : [];
    for (const t of items) registry.add(norm(t));
  }

  console.log(`${'─'.repeat(72)}\n  AFFECTED PROMPTS\n${'─'.repeat(72)}\n`);

  for (const p of affected) {
    const tipCount = Array.isArray(p.customization_tips) ? p.customization_tips.filter(t => String(t||'').trim()).length : 0;
    const trblCount = Array.isArray(p.prompt_specific_troubleshooting) ? p.prompt_specific_troubleshooting.filter(e => e && (e.issue || e.fix)).length : 0;

    const inDupGroup = dupIds.has(p.id);
    const isCanonical = inDupGroup && tipDupGroups.some(([, group]) => group[0].id === p.id);

    let cause, explanation;
    if (tipCount === 0) {
      cause = 'A';
      explanation = 'No tips at all — empty customization_tips or all-null array entries';
    } else if (tipCount === 1) {
      if (inDupGroup && !isCanonical) {
        cause = 'C';
        explanation = `In duplicate group (non-canonical) but repair produced only 1 tip`;
      } else if (isCanonical) {
        cause = 'D';
        explanation = `Canonical in duplicate group — tips intentionally preserved as-is`;
      } else {
        cause = 'D';
        explanation = `Has 1 tip, not in any duplicate group — was never selected for repair`;
      }
    } else {
      cause = 'G';
      explanation = `Has ${tipCount} tips — unexpected edge case`;
    }

    const entities = extractEntities(p);
    const nouns = extractNouns(p);

    console.log(`  id:${p.id} — ${p.slug}`);
    console.log(`    Title: ${p.title}`);
    console.log(`    Current tips: ${tipCount}`);
    console.log(`    Current troubleshooting: ${trblCount}`);
    console.log(`    In duplicate group: ${inDupGroup} (canonical: ${isCanonical})`);
    console.log(`    Cause: ${cause} — ${explanation}`);
    console.log(`    Entities: wardrobe=${nouns.wardrobe.join(',')} env=${nouns.environment.join(',')} lighting=${nouns.lighting.join(',')} colors=${nouns.colors.join(',')}`);
    console.log(`    Prompt excerpt: ${(p.prompt || '').slice(0, 120)}...`);

    // Generate proposed tips
    const allTipCandidates = generateTips(p, entities, nouns);
    const proposedTips = [];
    for (const tip of allTipCandidates) {
      const n = norm(tip);
      if (n.length < 15) continue;
      if (registry.has(n)) continue;
      if (proposedTips.some(t => norm(t) === n)) continue;
      proposedTips.push(tip);
      registry.add(n);
      if (proposedTips.length >= 4) break;
    }

    console.log(`\n    Proposed tips (${proposedTips.length}):`);
    for (let i = 0; i < proposedTips.length; i++) {
      console.log(`      [${i+1}] ${proposedTips[i]}`);
    }
    console.log(`    Uniqueness: ${proposedTips.length >= 2 ? 'PASS' : 'FAIL'}`);
    console.log('');
  }

  // 4. Global validation — use a fresh DB-only registry to re-verify uniqueness
  const dbOnlyRegistry = new Set();
  for (const p of allPrompts) {
    const raw = p.customization_tips;
    if (raw == null) continue;
    const items = Array.isArray(raw) ? raw.filter(t => String(t||'').trim()) : [];
    for (const t of items) dbOnlyRegistry.add(norm(t));
  }
  const proposedTipSet = new Set();
  let unresolved = 0;
  for (const p of affected) {
    const entities = extractEntities(p);
    const nouns = extractNouns(p);
    const candidates = generateTips(p, entities, nouns);
    let count = 0;
    for (const tip of candidates) {
      const n = norm(tip);
      if (n.length < 15) continue;
      if (dbOnlyRegistry.has(n)) continue;
      if (proposedTipSet.has(n)) continue;
      proposedTipSet.add(n);
      count++;
      if (count >= 2) break;
    }
    if (count < 2) unresolved++;
  }

  console.log(`${'─'.repeat(72)}\n  GLOBAL VALIDATION\n${'─'.repeat(72)}\n`);
  console.log(`  Affected prompts: ${affected.length}`);
  console.log(`  Prompts with >=2 proposed tips: ${affected.length - unresolved}`);
  console.log(`  Unresolved: ${unresolved}`);
  console.log(`  Final proposed duplicate tips: 0`);
  console.log(`  Uniqueness validation: ${unresolved === 0 ? 'PASSED' : 'FAILED'}\n`);

  console.log(`  Database writes: 0`);
  console.log(`  Read-only queries: YES\n`);

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  STEP 13 COMPLETE — READ-ONLY DIAGNOSIS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  await db.end();
}

main().catch(err => { console.error('Fatal error:', err); process.exitCode = 1; });
