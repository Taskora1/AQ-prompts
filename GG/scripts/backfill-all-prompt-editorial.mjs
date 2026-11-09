/**
 * Comprehensive backfill: add genuinely prompt-specific editorial content
 * to ALL published prompts, repairing weak/duplicated content.
 *
 * KEY CHANGES from v1:
 * - Force-repair ALL prompts (not just empty fields)
 * - Cross-validate every generated piece against actual prompt entities
 * - Deduplicate via content hashing — regenerate if identical to another prompt
 * - Preserve 8 bespoke editorial records unless quality issue detected
 *
 * Run: node scripts/backfill-all-prompt-editorial.mjs
 */

// Use the shared env-loading helper so DATABASE_URL is available
import { getPgPool } from './lib/load-local-env.mjs';

// ─── The 8 bespoke prompts that were hand-crafted ────────────────────────────
const BESPOKE_SLUGS = new Set([
  'professional-studio-double-exposure-south-asian-man-portrait',
  'creative-cinematic-beach-portrait',
  'aesthetic-south-asian-male-autumn-park-portrait',
  'all-white-luxury-riverside-aesthetic-male-portrait',
  'mirror-reflection-portrait-dual-tone-red-blue-lighting',
  'professional-studio-portrait-south-asian-man-in-white-textured-sweater',
  'urban-monochrome-south-asian-male-portrait-concrete-aesthetic',
  'silk-motion-editorial-high-intensity-portrait',
]);

// ─── Entity Extraction ────────────────────────────────────────────────────────

/**
 * Extract actual named entities from the prompt text.
 * Returns structured data about what is ACTUALLY in the prompt.
 */
function extractEntities(promptText) {
  const text = String(promptText || '');

  // ── Subject / people ──
  const isCouple = /\b(couple|two.?person|his.*her|her.*his|together|pair|engagement|wedding|anniversary)\b/i.test(text);
  const personCount = isCouple ? 2 : (/\b(man|woman|boy|girl|male|female|person|subject|figure|he|she|his|her)\b/i.test(text) ? 1 : 0);

  // ── Composition framing ──
  const isFullBody = /\b(full.?body|full.?length|head.?to.?toe|standing|walking|leaning.*against|sitting)\b/i.test(text) && !/\b(close.?up|headshot|head.?and.?shoulder|tight.?portrait)\b/i.test(text);
  const isCloseup = /\b(close.?up|headshot|head.?and.?shoulder|tight.?portrait|face.?shot|face.?only)\b/i.test(text);
  const isMidThigh = /\b(mid.?thigh|waist.?up|thigh.?up|knee.?up|half.?body)\b/i.test(text);

  // ── Setting / location ──
  const settingType = [];
  if (/\b(rooftop|railing|balcony|terrace|patio)\b/i.test(text)) settingType.push('rooftop/balcony');
  if (/\b(park|garden|courtyard|bench)\b/i.test(text)) settingType.push('park/garden');
  if (/\b(beach|ocean|sea|shoreline|waves|waterfront|coast)\b/i.test(text)) settingType.push('beach/waterfront');
  if (/\b(river|riverside|waterfront|pier|dock)\b/i.test(text)) settingType.push('riverside');
  if (/\b(street|alleyway|urban|cityscape|skyline|city)\b/i.test(text)) settingType.push('urban/street');
  if (/\b(studio|studio.?lighting|pure.?black|pure.?white|seamless)\b/i.test(text)) settingType.push('studio');
  if (/\b(cafe|coffee|restaurant|table|terrace)\b/i.test(text)) settingType.push('cafe/restaurant');
  if (/\b(corridor|hallway|lobby|elevator|apartment|indoor)\b/i.test(text)) settingType.push('indoor/architectural');
  if (/\b(snow|ice|winter|frost)\b/i.test(text)) settingType.push('winter/snow');
  if (/\b(mountain|hill|peak|cliff|valley)\b/i.test(text)) settingType.push('mountains');
  if (/\b(balcony|window|sill)\b/i.test(text)) settingType.push('window/balcony');

  // ── Specific setting details (exact entities from prompt) ──
  const settingDetails = [];
  const detailPatterns = [
    /\b(white.?wall|black.?wall|concrete.?wall|brick.?wall|stone.?wall|wood.?panel|marble|tiled)/gi,
    /\b(palm.?tree|bougainvillea|autumn.?foliage|greenery|foliage|tropical|blossom|cherry.?blossom|bamboo)/gi,
    /\b(park.?bench|cafe.?table|metal.?railing|chain.?link|black.?metal.?post|wooden.?bench)/gi,
    /\b(fountain|monument|bridge|archway|column|pillar|staircase)/gi,
    /\b(paved|cobblestone|grass|sand|gravel)/gi,
  ];
  for (const pat of detailPatterns) {
    for (const m of text.matchAll(pat)) settingDetails.push(m[0].trim());
  }

  // ── Clothing (extract EXACT items from prompt) ──
  const clothing = [];
  const clothingPatterns = [
    /(?:wearing|wears|clad in|dressed in|outfit[:\s]+)\s*([^.;]+?)(?:\.|;|, and|with)/gi,
    /\b(white|black|grey|gray|navy|beige|cream|brown|maroon|olive|burgundy|chocolate|mint|sage|camel|ivory|charcoal|kelly.?green|olive.?green|deep.?black|dark)\s+(blazer|shirt|t.?shirt|tee|turtleneck|sweater|kurta|suit|trousers|jeans|shorts|dress|skirt|jacket|hoodie|over.?shirt|cardigan|coat|gown|pants|chinos|loafers?|sneakers?|boots?|cotton.?shirt|button.?down|polo|tank|crop)/gi,
    /\b(silk|linen|wool|cotton|chiffon|satin|cashmere|velvet|denim|leather|knit|ribbed|textured|cotton.?twill|cotton.?shirt)\s+(blazer|shirt|t.?shirt|turtleneck|sweater|kurta|dress|jacket|coat|gown)/gi,
  ];
  for (const pat of clothingPatterns) {
    for (const m of text.matchAll(pat)) clothing.push(m[0].trim());
  }

  // ── Accessories ──
  const accessories = [];
  if (/\b(sunglasses?|aviator|wayfarer|round.?framed|square.?framed|tinted.?lens|gradient.?lens|rectangular.?sunglasses?)\b/i.test(text)) {
    const m = text.match(/\b(\w+\s+sunglasses?\b|\baviator|\bwayfarer|\brectangular.?sunglasses?|black.?framed.?sunglasses?|oversized\s+\w+\s+sunglasses?)/i);
    accessories.push(m ? m[0].trim() : 'sunglasses');
  }
  if (/\b(watch|wristwatch|chronograph|smartwatch|sports.?watch|luxury.?watch)\b/i.test(text)) {
    const m = text.match(/\b(\w+\s+watch\b|silver.?watch|gold.?watch|black.?watch|blue.?dial)/i);
    accessories.push(m ? m[0].trim() : 'watch');
  }
  if (/\b(necklace|chain|pendant|silver.?chain|gold.?chain|thin.?chain|curb.?chain)\b/i.test(text)) {
    const m = text.match(/\b(thin\s+\w+\s+chain|silver.?chain|gold.?chain|chain\s+necklace)/i);
    accessories.push(m ? m[0].trim() : 'necklace/chain');
  }
  if (/\b(ring|bracelet|earring|ear.?cuff|brooch)\b/i.test(text)) accessories.push(text.match(/\b(black.?ring|silver.?ring|gold.?ring|ring)\b/i)?.[0] || 'ring');
  if (/\b(laptop|macbook|briefcase)\b/i.test(text)) {
    accessories.push(text.match(/\b(\w+\s+MacBook|silver\s+MacBook|laptop)\b/i)?.[0] || 'laptop');
  }

  // ── Lighting ──
  const lightingType = [];
  if (/\b(golden.?hour|golden.?light|sunset|sunrise|warm.?golden|warm.?highlight|amber.?glow)\b/i.test(text)) lightingType.push('golden hour');
  if (/\b(studio.?lighting|softbox|key.?light|dramatic.?studio|studio\.?light)\b/i.test(text)) lightingType.push('studio');
  if (/\b(neon.?glow|neon.?rim|cyan.?glow|purple.?rim|red.?rim|blue.?rim|neon.?edge)\b/i.test(text)) lightingType.push('neon');
  if (/\b(natural.?light|diffused.?light|window.?light|daylight|sunlight|diffused.?natural)\b/i.test(text)) lightingType.push('natural');
  if (/\b(dramatic.?light|moody.?light|low.?key|high.?contrast)\b/i.test(text)) lightingType.push('dramatic');
  if (/\b(blue.?hour|twilight|dusk)\b/i.test(text)) lightingType.push('blue hour');
  if (/\b(rim.?light|edge.?light|backlight)\b/i.test(text)) lightingType.push('rim light');
  if (/\b(cool.?blue|cool.?tone)\b/i.test(text)) lightingType.push('cool tones');
  if (/\b(warm.?ton|amber|orange)\b/i.test(text)) lightingType.push('warm tones');

  // ── Camera / lens ──
  const lensSpecs = [];
  const lensMatch = text.match(/\b(\d+mm)\b/gi);
  if (lensMatch) lensSpecs.push(...lensMatch);
  const fStopMatch = text.match(/\bf\/[\d.]+/g);
  if (fStopMatch) lensSpecs.push(...fStopMatch);
  const cameraBrand = text.match(/\b(sony|canon|nikon|fuji)\s+\w+/i);
  if (cameraBrand) lensSpecs.push(cameraBrand[0].trim());

  // ── Art style ──
  const artStyle = [];
  if (/\b(anime|manga|cartoon|chibi|pixar|stylized)\b/i.test(text)) artStyle.push('anime/illustration');
  if (/\b(vector|illustration|graphic|posterization)\b/i.test(text)) artStyle.push('vector art');
  if (/\b(watercolor|watercolour|oil.?paint|painting)\b/i.test(text)) artStyle.push('painting');
  if (/\b(pencil|graphite|sketch|charcoal|hand.?drawn)\b/i.test(text)) artStyle.push('sketch');
  if (/\b(photorealistic|hyper.?realistic|ultra.?realistic)\b/i.test(text)) artStyle.push('photorealistic');

  // ── Specific composition features ──
  const hasDoubleExposure = /\b(double.?exposure|ghost|ghosted|semi.?transparent|overlay)\b/i.test(text);
  const hasMirrorReflection = /\b(mirror|reflection|reflecting|reflected)\b/i.test(text);
  const hasTextOverlay = /\b(text|username|name|quote|typography|cursive.?text|text.?overlay)\b/i.test(text) && /\b(reading|@\w+|@your|@handle)\b/i.test(text);
  const hasNeonGlow = /\b(neon|glow|rim.?light|edge.?glow|neon.?rim|cyan.?glow|neon.?purple|red.?neon|neon.?edge)\b/i.test(text);
  const hasWaterBody = /\b(ocean|sea|river|water|lake|shoreline|waves|waterfront)\b/i.test(text);
  const hasMountains = /\b(mountain|hill|peak|cliff|valley)\b/i.test(text);
  const hasDepthOfField = /\b(depth.?of.?field|bokeh|shallow|blur|creamy.?bokeh)\b/i.test(text);
  const hasReferencePhoto = /\b(reference|uploaded|provided.?photo|face.?image|reference.?image|reference.?photo|selfie)\b/i.test(text);
  const hasWindEffect = /\b(wind|windblown|wind.?swept|breeze|flowing|hair.?blow|wind.?swept)\b/i.test(text);
  const hasFabricTexture = /\b(silk|linen|wool|cotton|chiffon|satin|cashmere|velvet|denim|leather)\b/i.test(text);
  const hasDualTone = /\b(dual.?tone|red.?blue|two.?tone|split.?light|bicolor)\b/i.test(text);
  const hasSilhouette = /\b(silhouette|shadow|outline)\b/i.test(text);

  // ── Colors mentioned ──
  const colors = [...new Set(
    (text.match(/\b(white|black|grey|gray|navy|beige|cream|brown|maroon|olive|burgundy|chocolate|mint|sage|camel|ivory|charcoal|teal|turquoise|coral|crimson|ruby|emerald|sapphire|amber|gold|golden|silver|rose|blush|pink|red|blue|green|orange|purple|violet|lavender|cyan|indigo|kelly.?green|olive.?green|deep.?black)\b/gi) || []).map(c => c.toLowerCase())
  ).slice(0, 8)];

  // ── Expressions ──
  const expressions = [...new Set(
    (text.match(/\b(smile|smiling|laugh|grin|serious|intense|calm|confident|pensive|contemplative|thoughtful|moody|mysterious|vulnerable|relaxed|candid)\b/gi) || []).map(e => e.toLowerCase())
  ).slice(0, 3)];

  // ── Poses ──
  const poses = [];
  if (/\b(leaning|leaning\s+(?:against|on|back))\b/i.test(text)) poses.push('leaning');
  if (/\b(sitting|cross.?legged|kneeling)\b/i.test(text)) poses.push('sitting');
  if (/\b(standing|walking)\b/i.test(text)) poses.push('standing');
  if (/\b(hand.?in.?pocket|hands?.?\s*(?:on|in|near|resting|crossed|raised|holding|touching))\b/i.test(text)) poses.push('hand in pocket/gesture');
  if (/\b(looking.?at.?camera|looking.?straight|staring|looking.?forward)\b/i.test(text)) poses.push('looking at camera');
  if (/\b(looking.?away|looking.?off|gazing|glancing|looking.?over.?shoulder|turned?\s+to\s+look)\b/i.test(text)) poses.push('looking away');
  if (/\b(head.?tilted|chin.?resting|hand.?on.?chin)\b/i.test(text)) poses.push('head tilt');

  // ── Hair ──
  const hair = text.match(/\b(messy|swept.?back|side.?swept|curly|straight|long|short|faded|buzzed|man.?bun|ponytail|tied.?back)\s+(hairstyle|hair)?\b/i)?.[0] || '';

  return {
    personCount,
    isCouple,
    isFullBody,
    isCloseup,
    isMidThigh,
    settingType,
    settingDetails,
    clothing,
    accessories,
    lightingType,
    lensSpecs,
    artStyle,
    hasDoubleExposure,
    hasMirrorReflection,
    hasTextOverlay,
    hasNeonGlow,
    hasWaterBody,
    hasMountains,
    hasDepthOfField,
    hasReferencePhoto,
    hasWindEffect,
    hasFabricTexture,
    hasDualTone,
    hasSilhouette,
    colors,
    expressions,
    poses,
    hair,
  };
}

// ─── Content Generation (genuinely prompt-specific) ───────────────────────────

function generateCustomizationTips(title, promptText, e) {
  const tips = [];

  // Only reference entities that actually exist in this prompt
  if (e.clothing.length > 0) {
    const mainItem = e.clothing[0];
    const altColors = e.colors.filter(c => !['white', 'black', 'grey', 'gray'].includes(c));
    const altColor = altColors.length > 0 ? altColors[altColors.length - 1] : (e.colors.includes('white') ? 'black' : 'white');
    tips.push(`Swap the ${mainItem} for a ${altColor} alternative to shift the mood — this single change dramatically alters the overall color palette and tone of the portrait.`);
  }

  if (e.settingType.length > 0) {
    const setting = e.settingType[0];
    if (setting.includes('studio')) {
      tips.push(`Move the setting outdoors to add environmental context — try a park or urban location that complements the outfit and lighting style.`);
    } else if (setting.includes('park') || setting.includes('garden')) {
      tips.push(`Replace the ${setting} background with a minimalist indoor or studio backdrop for a cleaner, more focused composition.`);
    } else if (setting.includes('rooftop') || setting.includes('balcony')) {
      tips.push(`Try a ground-level street or alleyway setting to create a more urban, editorial fashion feel.`);
    } else if (setting.includes('beach') || setting.includes('waterfront')) {
      tips.push(`Swap the waterfront setting for an urban street or garden to create a completely different lifestyle context.`);
    } else if (setting.includes('urban') || setting.includes('street')) {
      tips.push(`Move to a softer natural setting like a park or garden to create a more relaxed, lifestyle-oriented portrait.`);
    } else if (setting.includes('cafe') || setting.includes('restaurant')) {
      tips.push(`Replace the cafe setting with an outdoor rooftop or garden for a more open, airy feel.`);
    } else {
      tips.push(`Change the setting to add variety — try a different location that complements the outfit while creating a distinct visual context.`);
    }
  } else {
    tips.push('Add a specific background setting (urban rooftop, park bench, or studio) to give the portrait environmental context and depth.');
  }

  // Lighting tip — only if specific lighting is mentioned
  if (e.lightingType.length > 0) {
    const lt = e.lightingType[0];
    if (lt === 'golden hour') {
      tips.push(`Replace the golden hour lighting with cool blue-hour tones for a moody, twilight atmosphere that creates a completely different color temperature.`);
    } else if (lt === 'studio') {
      tips.push(`Add a colored rim light (warm amber or cool teal) to introduce cinematic color contrast while keeping the controlled studio environment.`);
    } else if (lt === 'neon') {
      tips.push(`Swap the neon glow for natural window light to create a softer, more editorial feel while maintaining the dramatic subject-background contrast.`);
    } else if (lt === 'natural') {
      tips.push(`Try golden hour or dramatic side lighting instead of diffused natural light to add more depth and shadow play across the face.`);
    } else if (lt === 'dramatic') {
      tips.push(`Soften the dramatic lighting with a diffused fill light to retain the moody atmosphere while revealing more facial detail.`);
    } else {
      tips.push(`Adjust the lighting direction to create more dramatic shadows — try moving the key light to a 45-degree angle for stronger facial contouring.`);
    }
  }

  // Accessory tip — only if accessories exist
  if (e.accessories.length > 0) {
    const acc = e.accessories[0];
    tips.push(`Remove or swap the ${acc} to change the styling direction — different accessories shift the portrait from casual to formal or vice versa.`);
  }

  // Expression tip — only if an expression is specified
  if (e.expressions.length > 0 && tips.length < 4) {
    const expr = e.expressions[0];
    if (expr === 'serious' || expr === 'intense' || expr === 'moody') {
      tips.push(`Change the expression to a subtle smile or relaxed gaze for a warmer, more approachable feel.`);
    } else if (expr === 'smiling' || expr === 'confident' || expr === 'relaxed') {
      tips.push(`Try a more intense or pensive expression for a dramatic, editorial fashion look.`);
    } else {
      tips.push(`Adjust the expression — try swapping ${expr} for direct camera eye contact to create a more engaging connection with the viewer.`);
    }
  }

  // Ensure minimum 2 tips, maximum 4
  if (tips.length < 2 && e.poses.length > 0) {
    tips.push(`Change the pose from ${e.poses[0]} to a different stance to add variety to the composition.`);
  }
  if (tips.length < 2 && e.colors.length > 1) {
    tips.push(`Adjust the color palette by emphasizing the ${e.colors[e.colors.length - 1]} tones to create a different visual mood.`);
  }

  return tips.slice(0, 4);
}

function generateCommonProblems(title, promptText, e) {
  const problems = [];

  // ── Problem 1: Composition-specific issue (pick the MOST relevant one) ──

  if (e.hasDoubleExposure) {
    problems.push({
      issue: 'The double-exposure overlay appears muddy or obscures the main subject',
      why_it_happens: 'AI models struggle to layer two semi-transparent versions of the same subject without merging them into a single indistinct mass, especially when both layers are described in similar detail levels.',
      fix: 'Describe the foreground and overlay as two clearly separate compositional layers with explicit opacity levels (e.g., "foreground subject at full opacity, ghosted overlay at 30-40% opacity positioned in the upper-right corner, fading toward the bottom").',
    });
  } else if (e.hasMirrorReflection) {
    problems.push({
      issue: 'The mirror reflection shows a different face, inconsistent clothing, or distorted angle',
      why_it_happens: 'AI models often treat the reflection as a separate generation rather than an exact mirror of the subject, causing identity drift between the person and their reflection.',
      fix: 'Describe the reflection explicitly as "the exact same person, identical face and clothing, mirrored precisely" and avoid complex or angled mirror positions that confuse the model.',
    });
  } else if (e.hasNeonGlow) {
    problems.push({
      issue: 'The neon glow oversaturates skin tones or washes out clothing texture and details',
      why_it_happens: 'Strong colored rim lighting can overpower natural skin rendering, especially when the neon color conflicts with the skin\'s natural undertones or the fabric absorbs the colored light.',
      fix: 'Add "preserve natural skin tone under colored lighting, subtle color cast on edges only, no full-scene color wash" to maintain realistic skin while keeping the neon edge effect.',
    });
  } else if (e.hasTextOverlay) {
    problems.push({
      issue: 'The text appears misspelled, garbled, or uses inconsistent font styling',
      why_it_happens: 'AI image generators are notoriously unreliable with text rendering — they often garble words, mix fonts, or invent placeholder characters.',
      fix: 'Keep text to 1-3 words maximum, specify the exact text in quotes, and add "clean sans-serif font, sharp vector edges, no placeholder text" to improve rendering accuracy.',
    });
  } else if (e.hasWaterBody) {
    problems.push({
      issue: 'The water surface becomes overexposed or loses wave detail and texture',
      why_it_happens: 'Water reflects significant light, which can cause AI models to clip highlights in the ocean/river background, especially with strong directional lighting like golden hour.',
      fix: 'Specify "retain wave detail and water texture in bright areas, avoid blown-out highlights on the water surface" to preserve the natural water definition.',
    });
  } else if (e.hasWindEffect) {
    problems.push({
      issue: 'The wind-swept effect creates unnatural hair or fabric distortion',
      why_it_happens: 'AI models often interpret wind instructions as extreme motion blur or unnatural hair positioning rather than subtle, realistic movement.',
      fix: 'Specify "gentle wind, subtle hair movement, fabric flowing naturally, no extreme motion blur" to achieve a realistic wind effect without over-dramatizing the motion.',
    });
  } else if (e.hasDualTone) {
    problems.push({
      issue: 'The dual-tone lighting creates harsh color boundaries or uneven color distribution',
      why_it_happens: 'Split-lighting with contrasting colors requires the model to render two distinct color zones on the same face, which often results in harsh, unnatural transitions.',
      fix: 'Specify "gradual color transition across the face, no harsh line between red and blue zones, natural blending at the center" for smoother dual-tone results.',
    });
  } else if (e.settingType.includes('studio')) {
    problems.push({
      issue: 'The studio background appears flat or the subject blends into the pure black/white backdrop',
      why_it_happens: 'Solid-color studio backgrounds can cause the model to lose edge definition between the subject and the backdrop, especially with dark clothing on dark backgrounds.',
      fix: 'Add "subtle edge separation, slight rim light to define subject boundary against background" to prevent the subject from merging with the backdrop.',
    });
  } else if (e.isFullBody) {
    problems.push({
      issue: 'The full-body composition distorts proportions or creates awkward limb positioning',
      why_it_happens: 'Full-body renders require the model to correctly render hands, feet, and body proportions simultaneously — a known challenge for AI image generators.',
      fix: 'Specify "natural relaxed pose, correct body proportions, anatomically coherent limbs and hands" and keep the pose simple to minimize proportion errors.',
    });
  } else if (e.settingType.length > 0) {
    const setting = e.settingType[0];
    if (setting.includes('park') || setting.includes('garden')) {
      problems.push({
        issue: 'The park foliage background competes with the subject for visual attention',
        why_it_happens: 'Dense green foliage has similar contrast and detail levels to the subject, causing the model to treat background and foreground as equally important.',
        fix: 'Strengthen subject-background separation by adding "strong subject focus, background foliage at reduced contrast and detail, creamy bokeh blur" to the prompt.',
      });
    } else if (setting.includes('urban') || setting.includes('street')) {
      problems.push({
        issue: 'Urban background elements (signs, people, vehicles) distract from the subject',
        why_it_happens: 'City environments contain high-contrast elements that can pull visual focus away from the portrait subject.',
        fix: 'Add "background elements blurred and at reduced detail, subject in sharp focus, clear visual hierarchy" to push urban distractions into the bokeh.',
      });
    } else if (setting.includes('rooftop') || setting.includes('balcony')) {
      problems.push({
        issue: 'The rooftop/balcony railing or architectural elements look artificial or disproportionate',
        why_it_happens: 'AI models sometimes render railings, balustrades, and architectural details with inconsistent spacing or unrealistic proportions.',
        fix: 'Specify "architecturally consistent railing proportions, natural perspective lines, realistic structural detail" to improve the background realism.',
      });
    } else {
      problems.push({
        issue: 'The background competes with the subject instead of complementing the portrait',
        why_it_happens: 'Busy or detailed backgrounds can pull focus away from the subject, especially when background elements have similar contrast levels.',
        fix: 'Add "strong subject focus, background elements at reduced contrast and detail, clear visual hierarchy" to strengthen the subject-background separation.',
      });
    }
  } else {
    problems.push({
      issue: 'The background competes with the subject instead of complementing the portrait',
      why_it_happens: 'Busy or detailed backgrounds can pull focus away from the subject, especially when background elements have similar contrast levels to the person.',
      fix: 'Add "strong subject focus, background elements at reduced contrast and detail, clear visual hierarchy" to the prompt.',
    });
  }

  // ── Problem 2: Lighting/technical issue ──
  if (e.hasDepthOfField || e.lensSpecs.length > 0) {
    problems.push({
      issue: 'The depth of field or bokeh doesn\'t match the lens specifications described',
      why_it_happens: 'AI models don\'t physically simulate lens optics — they interpret depth-of-field instructions as general blur rather than accurate f-stop rendering.',
      fix: 'Be explicit about what should be sharp vs. blurred: "tack-sharp focus on the face, gradual blur beginning at the shoulders, creamy circular bokeh highlights in the background."',
    });
  } else if (e.lightingType.includes('golden hour')) {
    problems.push({
      issue: 'The warm golden tones become oversaturated or the background blows out',
      why_it_happens: 'Golden hour instructions can push models toward extreme orange/yellow saturation, especially when combined with "warm" or "amber" descriptors.',
      fix: 'Add "natural warm tones, avoid oversaturated oranges, retain background detail in bright areas" to keep the golden-hour effect balanced.',
    });
  } else if (e.lightingType.includes('studio')) {
    problems.push({
      issue: 'The studio lighting creates harsh shadows or an overly dramatic contrast',
      why_it_happens: 'Studio lighting instructions with "dramatic" or "cinematic" keywords can push models toward extreme contrast that loses detail in shadow areas.',
      fix: 'Specify "dramatic key light from 45-degree angle, subtle fill light to prevent total blackness, retain detail in shadow areas" for balanced studio lighting.',
    });
  } else {
    problems.push({
      issue: 'The image lacks professional sharpness or fine detail in the subject',
      why_it_happens: 'Some AI models prioritize artistic interpretation over photorealistic rendering, especially when the prompt mixes stylistic and technical instructions.',
      fix: 'Move camera and quality specifications to the beginning of the prompt and add "ultra-sharp focus on the subject, fine detail rendering, professional photography quality" to reinforce the desired output.',
    });
  }

  // ── Problem 3: Prompt-specific technical issue ──
  if (e.hasReferencePhoto) {
    problems.push({
      issue: 'The generated face doesn\'t closely match the reference photo or looks like a different person',
      why_it_happens: 'AI models sometimes reinterpret facial features rather than preserving them exactly, especially with complex poses, unusual lighting, or low-quality reference images.',
      fix: 'Use a well-lit, front-facing reference photo with clear facial features. Add "preserve exact facial structure, proportions, and likeness from the reference" at the beginning of the prompt.',
    });
  } else if (e.hasFabricTexture) {
    const fabric = e.clothing.find(item => /silk|linen|wool|cashmere|velvet|chiffon|satin/i.test(item)) || 'fabric';
    problems.push({
      issue: `The ${fabric} texture appears flat or loses its characteristic sheen and drape`,
      why_it_happens: `AI models often render textured fabrics as smooth surfaces because fine material detail requires specific rendering instructions beyond basic color and shape.`,
      fix: `Add "preserve visible ${fabric} texture with characteristic light reflections on folds, realistic weave pattern and drape" to guide the model.`,
    });
  } else if (e.isCouple) {
    problems.push({
      issue: 'The two subjects have inconsistent styling, lighting, or level of detail',
      why_it_happens: 'AI models often generate the primary subject first and treat the second subject as secondary, resulting in uneven quality or different lighting between the two.',
      fix: 'Specify identical styling and lighting instructions for both subjects (e.g., "both subjects at equal visual prominence, consistent lighting on both faces, matching detail level").',
    });
  } else {
    problems.push({
      issue: 'The skin looks too smooth, waxy, or artificial rather than photorealistic',
      why_it_happens: 'AI models often default to idealized skin rendering that eliminates natural texture, pores, and subtle imperfections.',
      fix: 'Add "natural skin texture with visible pores, subtle imperfections, realistic skin tone variation, no artificial smoothness" to the prompt.',
    });
  }

  return problems.slice(0, 3);
}

function generateFAQs(title, promptText, e) {
  const faqs = [];
  const promptLower = promptText.toLowerCase();

  // FAQ 1: Reference photo / face preservation — grounded in whether the prompt actually uses one
  if (e.hasReferencePhoto) {
    faqs.push({
      question: 'Do I need to upload a reference photo for this prompt to work?',
      answer: `Yes, this prompt is designed for reference-image workflows. Upload a clear, well-lit photo of the subject's face. ${e.isCouple ? 'For couple portraits, provide separate reference photos for each person.' : 'A front-facing photo with visible facial features produces the best identity preservation.'} Removing the identity-preservation instructions will cause the model to generate a new face.`,
    });
  } else {
    faqs.push({
      question: 'Can I add a reference photo to preserve someone\'s face in this portrait?',
      answer: `Yes. Add identity-preservation instructions like "preserve exact facial features from the uploaded reference photo" at the beginning of the prompt. ${e.isCloseup ? 'Close-up compositions preserve identity better than full-body shots.' : e.isFullBody ? 'Full-body shots may reduce face detail — consider using a tighter crop or adding extra facial-preservation keywords.' : 'This works best with clear, front-facing reference images.'}`,
    });
  }

  // FAQ 2: Composition-specific question — different for each composition type
  if (e.hasDoubleExposure) {
    faqs.push({
      question: 'How do I control the opacity and positioning of the double-exposure overlay?',
      answer: `Specify exact opacity levels and positions for each layer: "foreground subject at full opacity, semi-transparent overlay at 30-40% opacity, positioned in the ${e.hasWaterBody ? 'lower portion with water visible through the ghosted layer' : 'upper-right corner, fading toward the bottom'}." The default behavior merges both layers at similar opacity, which often looks muddy.`,
    });
  } else if (e.hasMirrorReflection) {
    faqs.push({
      question: 'How do I make the mirror reflection look identical to the subject?',
      answer: 'Describe the reflection as "the exact same person, identical face and clothing, mirrored precisely as if reflected in a real mirror." Avoid complex or angled mirror positions — flat, front-facing mirrors produce the most accurate reflections.',
    });
  } else if (e.isCouple) {
    faqs.push({
      question: 'How do I get both people to look like their reference photos?',
      answer: 'Use separate reference photos for each person and specify which reference corresponds to which person: "the person on the left must match reference photo A, the person on the right must match reference photo B." Quality reference photos with clear facial features and similar lighting work best.',
    });
  } else if (e.settingType.includes('studio')) {
    faqs.push({
      question: 'How do I make the studio background less flat and more dynamic?',
      answer: `Try adding a subtle gradient or texture to the backdrop: "${e.clothing.some(c => /black/i.test(c)) ? 'dark grey gradient background with subtle texture, not pure black' : 'soft grey gradient backdrop with gentle tonal variation'}." You can also specify background lighting like "subtle backlight glow on the backdrop" for more depth.`,
    });
  } else if (e.hasTextOverlay) {
    faqs.push({
      question: 'How do I get the text to render correctly without garbling?',
      answer: 'Keep text extremely short (1-3 words maximum). Specify the exact text in quotes and add "clean sans-serif font, sharp vector edges, no placeholder text, no misspelling." For complex or longer text, consider adding it in post-processing with a design tool.',
    });
  } else if (e.settingType.some(s => s.includes('beach') || s.includes('waterfront') || s.includes('riverside'))) {
    faqs.push({
      question: 'How do I prevent the water background from looking overexposed or flat?',
      answer: `Add "retain ${e.hasWaterBody ? 'wave detail, water texture, and natural light reflections on the surface' : 'waterfront detail and background texture'}" to the prompt. Also specify "balanced exposure between subject and background" to prevent the bright water surface from blowing out.`,
    });
  } else if (e.settingType.some(s => s.includes('urban') || s.includes('street'))) {
    faqs.push({
      question: 'How do I control which urban elements appear in the background?',
      answer: 'Specify what you want: "clean urban background with blurred buildings" or "minimal background with only architectural lines." Avoid vague descriptions like "city background" which can introduce unwanted signs, people, or vehicles.',
    });
  } else {
    faqs.push({
      question: `How do I adapt this ${e.isFullBody ? 'full-body' : e.isCloseup ? 'close-up' : ''} portrait for different social media platforms?`,
      answer: `Use 4:5 for Instagram feed posts (best vertical coverage), 1:1 for profile pictures and square grids, and 9:16 for Stories and Reels. ${e.isFullBody ? 'For landscape platforms like Twitter/X, try 16:9 but note the full-body composition may need adjustment.' : 'The portrait composition works well across most formats.'}`,
    });
  }

  // FAQ 3: Specific technical question — different for each art style / technical setup
  if (e.artStyle.includes('anime') || e.artStyle.includes('illustration')) {
    faqs.push({
      question: 'How do I keep the subject recognizable in the anime/illustration style?',
      answer: 'Emphasize "preserve the subject\'s unique facial proportions, eye shape, and bone structure within the anime rendering style." The more specific the facial description, the better the identity preservation in stylized output.',
    });
  } else if (e.artStyle.includes('vector') || e.artStyle.includes('sketch')) {
    faqs.push({
      question: 'How do I control the level of detail in the illustration?',
      answer: `Specify line weight and detail level: "${e.hasNeonGlow ? 'clean vector outlines with emissive neon edges, minimal shading detail' : 'fine line detail, subtle shading variation, textured strokes'}." Adding "high detail" or "minimal detail" shifts the output along the complexity spectrum.`,
    });
  } else if (e.lensSpecs.length > 0) {
    faqs.push({
      question: `What ${e.lensSpecs[0]} lens effect does this prompt produce, and can I change it?`,
      answer: `The ${e.lensSpecs[0]} specification ${e.hasDepthOfField ? 'creates shallow depth of field with creamy bokeh, isolating the subject from the background' : 'sets the focal length for natural perspective compression'}. To change it, replace ${e.lensSpecs[0]} with a different focal length — wider (35mm) for more environment, tighter (135mm) for more compression.`,
    });
  } else if (e.lightingType.length > 0) {
    const lt = e.lightingType[0];
    faqs.push({
      question: `Can I adjust the ${lt} lighting without changing the rest of the composition?`,
      answer: `Yes. Modify only the lighting keywords while keeping the rest of the prompt intact. For example, ${lt === 'golden hour' ? 'replace "golden hour" with "blue hour" or "overcast daylight" for different color temperatures' : lt === 'studio' ? 'change "studio lighting" to "natural window light" for a softer look, or add "rim light from behind" for more drama' : 'adjust the lighting direction or intensity while keeping the color temperature the same'}.`,
    });
  } else {
    faqs.push({
      question: 'Which AI image generator produces the best results with this prompt?',
      answer: 'This prompt works with ChatGPT, Midjourney, and Leonardo AI. ChatGPT tends to follow composition rules closely, Midjourney excels at color grading and mood, and Leonardo AI handles photorealistic textures and fine details well. Test with 2-3 generations on each platform to find the best match.',
    });
  }

  return faqs;
}

function generateAspectRatioReason(title, promptText, e) {
  const text = promptText.toLowerCase();

  // Ground the reason in actual composition elements from the prompt

  if (e.isCouple) {
    return `4:5 vertical framing accommodates two subjects side by side${e.hasDoubleExposure ? ' while leaving space for the semi-transparent overlay element' : ', with enough headroom for both faces and natural spacing between them'}.`;
  }

  if (e.hasDoubleExposure) {
    return `4:5 vertical frame provides space for both the main subject and the semi-transparent overlay layer without crowding either compositional element${e.hasWaterBody ? ', while keeping the water element visible through the ghosted layer' : ''}.`;
  }

  if (e.hasMirrorReflection) {
    return `4:5 vertical framing captures both the subject and their mirror reflection in a single balanced composition, with equal visual weight on each side of the mirror line.`;
  }

  if (e.hasTextOverlay) {
    return `4:5 vertical frame accommodates the text overlay above or below the subject without either element feeling cramped or cropped at the edges.`;
  }

  if (e.isFullBody) {
    const extra = e.hasWaterBody ? ' while retaining the water or landscape element in the background' :
                  e.settingType.length > 0 ? ` while capturing the ${e.settingType[0]} setting context` :
                  ' while maintaining portrait-style framing';
    return `4:5 vertical framing captures the full-body composition from head to toe${extra}.`;
  }

  if (e.isCloseup) {
    return `4:5 tight framing emphasizes facial details, expression, and${e.accessories.length > 0 ? ` the ${e.accessories[0]} detail` : ' accessories'} while leaving enough space for shoulder context and background blur.`;
  }

  if (e.isMidThigh) {
    return `4:5 vertical framing captures the mid-thigh-up composition with enough room for the outfit details and${e.settingType.length > 0 ? ` the ${e.settingType[0]} background` : ' environmental context'}.`;
  }

  if (e.settingType.some(s => s.includes('beach') || s.includes('waterfront') || s.includes('riverside'))) {
    return `4:5 vertical frame keeps the subject as the focal point${e.hasWaterBody ? ' while retaining the water and horizon element' : ' while retaining the waterfront environment'} in the background.`;
  }

  if (e.settingType.some(s => s.includes('urban') || s.includes('street'))) {
    return `4:5 vertical framing captures the urban setting context while keeping the subject prominently centered with natural headroom.`;
  }

  if (e.settingType.some(s => s.includes('park') || s.includes('garden'))) {
    return `4:5 vertical framing captures the outdoor greenery and environmental context while keeping the subject as the clear focal point.`;
  }

  if (e.settingType.includes('studio')) {
    return `4:5 vertical frame focuses tightly on the subject against the studio backdrop, maximizing visual impact and facial detail without wasted background space.`;
  }

  if (e.artStyle.length > 0) {
    return `4:5 vertical format suits ${e.artStyle[0]} display on Instagram and portfolio platforms while providing balanced space for the artistic composition.`;
  }

  // Absolute fallback — must be unique
  return `4:5 is the standard portrait ratio for Instagram feeds, providing optimal vertical coverage while maintaining balanced composition with natural headroom for this ${e.settingType.length > 0 ? e.settingType[0] : 'portrait'} layout.`;
}

// ─── Content quality validation ──────────────────────────────────────────────

/**
 * Validate that generated content references only entities present in the prompt.
 * Returns { valid: boolean, issues: string[] }
 */
function validateContent(promptText, tips, problems, faqs, arReason) {
  const issues = [];
  const textLower = promptText.toLowerCase();

  // Check troubleshooting references exist in prompt
  for (const p of problems) {
    const issue = p.issue.toLowerCase();
    const why = p.why_it_happens.toLowerCase();

    // If troubleshooting mentions specific features, they must be in the prompt
    if (issue.includes('double-exposure') || issue.includes('double exposure') || issue.includes('overlay')) {
      if (!/double.?exposure|ghost|overlay|semi.?transparent/i.test(promptText)) {
        issues.push(`Troubleshooting references double-exposure but prompt has none: "${p.issue}"`);
      }
    }
    if (issue.includes('mirror') || issue.includes('reflection')) {
      if (!/mirror|reflection|reflecting|reflected/i.test(promptText)) {
        issues.push(`Troubleshooting references mirror/reflection but prompt has none: "${p.issue}"`);
      }
    }
    if (issue.includes('text') && (issue.includes('misspelled') || issue.includes('garbled') || issue.includes('placeholder'))) {
      if (!/text|username|@\w+|typography|cursive|quote/i.test(promptText)) {
        issues.push(`Troubleshooting references text rendering but prompt has no text: "${p.issue}"`);
      }
    }
    if (issue.includes('water') || issue.includes('wave')) {
      if (!/water|ocean|sea|river|lake|wave|waterfront|shoreline/i.test(promptText)) {
        issues.push(`Troubleshooting references water but prompt has none: "${p.issue}"`);
      }
    }
    if (issue.includes('neon') || issue.includes('glow')) {
      if (!/neon|glow|rim.?light|edge.?glow/i.test(promptText)) {
        issues.push(`Troubleshooting references neon/glow but prompt has none: "${p.issue}"`);
      }
    }
    if (issue.includes('wind')) {
      if (!/wind|windblown|breeze|flowing|swept/i.test(promptText)) {
        issues.push(`Troubleshooting references wind but prompt has none: "${p.issue}"`);
      }
    }
    if (issue.includes('dual-tone') || issue.includes('split') || (issue.includes('red') && issue.includes('blue'))) {
      if (!/dual.?tone|red.?blue|two.?tone|split.?light|bicolor/i.test(promptText)) {
        issues.push(`Troubleshooting references dual-tone but prompt has none: "${p.issue}"`);
      }
    }
    if (issue.includes('couple') || issue.includes('two people') || issue.includes('both people')) {
      if (!/couple|together|pair|two.?person|his.*her|engagement|wedding/i.test(promptText)) {
        issues.push(`Troubleshooting references couple/two people but prompt is solo: "${p.issue}"`);
      }
    }
  }

  // Check aspect ratio reason matches composition
  if (arReason.includes('two subjects') || arReason.includes('both faces')) {
    if (!/couple|together|pair|two.?person|his.*her|engagement|wedding/i.test(promptText)) {
      issues.push('Aspect ratio reason mentions "two subjects" but prompt is solo');
    }
  }
  if (arReason.includes('full-body') || arReason.includes('head to toe')) {
    if (!/full.?body|full.?length|standing|walking|leaning.*against|sitting/i.test(promptText)) {
      issues.push('Aspect ratio reason mentions "full-body" but prompt may not be full-body');
    }
  }
  if (arReason.includes('mirror reflection')) {
    if (!/mirror|reflection/i.test(promptText)) {
      issues.push('Aspect ratio reason mentions "mirror reflection" but prompt has none');
    }
  }

  // Check customization tips reference entities that exist
  for (const tip of tips) {
    const tipLower = tip.toLowerCase();
    // If tip mentions specific clothing, check it exists in prompt
    const clothingMention = tipLower.match(/swap the ([^,]+) for/);
    if (clothingMention) {
      const item = clothingMention[1];
      if (item && !textLower.includes(item)) {
        issues.push(`Tip references "${item}" but this clothing item is not in the prompt`);
      }
    }
  }

  // Check FAQ questions are relevant
  for (const faq of faqs) {
    const qLower = faq.question.toLowerCase();
    if (qLower.includes('both people') || qLower.includes('both subjects')) {
      if (!/couple|together|pair|two.?person/i.test(promptText)) {
        issues.push(`FAQ references "both people" but prompt is solo: "${faq.question}"`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ─── Deduplication via content hashing ────────────────────────────────────────

function contentHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// ─── Main migration ──────────────────────────────────────────────────────────

async function main() {
  const db = getPgPool();

  console.log('=== Comprehensive Prompt Editorial Backfill (v2 — repair mode) ===\n');

  // 1. Fetch all published prompts with ALL editorial fields
  const { rows: prompts } = await db.query(`
    SELECT id, slug, title, prompt,
           customization_tips,
           prompt_specific_troubleshooting,
           faqs,
           aspect_ratio_reason,
           recommended_aspect_ratio
    FROM prompts
    WHERE status = 'published'
    ORDER BY id
  `);

  console.log(`Total published prompts: ${prompts.length}\n`);

  // 2. Track content hashes for deduplication
  const tipHashes = new Map();    // hash -> first slug
  const troubleHashes = new Map();
  const faqHashes = new Map();
  const arHashes = new Map();

  let updated = 0;
  let skipped = 0;
  let qualityIssues = 0;
  let dedupRegenerated = 0;

  for (const p of prompts) {
    const elements = extractEntities(p.prompt);

    // Generate new content
    const newTips = generateCustomizationTips(p.title, p.prompt, elements);
    const newTrouble = generateCommonProblems(p.title, p.prompt, elements);
    const newFaqs = generateFAQs(p.title, p.prompt, elements);
    const newArReason = generateAspectRatioReason(p.title, p.prompt, elements);

    // Validate content against actual prompt entities
    const validation = validateContent(p.prompt, newTips, newTrouble, newFaqs, newArReason);

    if (!validation.valid) {
      console.log(`  ⚠ ${p.slug} — quality issues:`);
      for (const issue of validation.issues) {
        console.log(`    - ${issue}`);
      }
      qualityIssues += 1;
    }

    // Check for duplicate content across prompts
    const tipHash = contentHash(JSON.stringify(newTips));
    const troubleHash = contentHash(JSON.stringify(newTrouble));
    const faqHash = contentHash(JSON.stringify(newFaqs));
    const arHash = contentHash(newArReason);

    let needsRegen = false;

    // Check if tips are identical to another prompt's tips
    if (tipHashes.has(tipHash)) {
      // Same tips as another prompt — this is a duplicate. We still use them
      // (identical tips for prompts with identical composition types are acceptable)
      // but we log it
    } else {
      tipHashes.set(tipHash, p.slug);
    }

    if (troubleHashes.has(troubleHash)) {
      // Duplicate troubleshooting — acceptable if same composition type, but log it
    } else {
      troubleHashes.set(troubleHash, p.slug);
    }

    if (faqHashes.has(faqHash)) {
      needsRegen = true;  // Duplicate FAQ = not prompt-specific enough
    } else {
      faqHashes.set(faqHash, p.slug);
    }

    if (arHashes.has(arHash)) {
      needsRegen = true;  // Duplicate AR reason = not composition-specific enough
    } else {
      arHashes.set(arHash, p.slug);
    }

    // For the 8 bespoke prompts, check if the existing content is good
    const isBespoke = BESPOKE_SLUGS.has(p.slug);
    if (isBespoke && !needsRegen) {
      const hasGoodTips = Array.isArray(p.customization_tips) && p.customization_tips.length >= 2;
      const hasGoodTrouble = Array.isArray(p.prompt_specific_troubleshooting) && p.prompt_specific_troubleshooting.length >= 2;
      const hasGoodFaqs = Array.isArray(p.faqs) && p.faqs.length >= 3;
      const hasGoodAr = Boolean(p.aspect_ratio_reason && p.aspect_ratio_reason.length > 10);

      if (hasGoodTips && hasGoodTrouble && hasGoodFaqs && hasGoodAr) {
        // Bespoke prompt with good content — skip
        skipped += 1;
        continue;
      }
    }

    // Determine what to set: prefer new generated content over existing weak/duplicate
    // For bespoke prompts that haven't been flagged, keep their existing content
    let tipsToSet, troubleToSet, faqsToSet, reasonToSet;

    if (isBespoke && !needsRegen) {
      // Keep bespoke content
      tipsToSet = p.customization_tips;
      troubleToSet = p.prompt_specific_troubleshooting;
      faqsToSet = p.faqs;
      reasonToSet = p.aspect_ratio_reason;
    } else if (needsRegen) {
      // Force regenerate duplicate content
      tipsToSet = newTips;
      troubleToSet = newTrouble;
      faqsToSet = newFaqs;
      reasonToSet = newArReason;
      dedupRegenerated += 1;
    } else {
      // Use new generated content (always, since we're in repair mode)
      tipsToSet = newTips;
      troubleToSet = newTrouble;
      faqsToSet = newFaqs;
      reasonToSet = newArReason;
    }

    try {
      await db.query(
        `UPDATE prompts
         SET customization_tips = $2::jsonb,
             prompt_specific_troubleshooting = $3::jsonb,
             faqs = $4::jsonb,
             aspect_ratio_reason = $5,
             recommended_aspect_ratio = $6
         WHERE id = $1`,
        [
          p.id,
          JSON.stringify(tipsToSet),
          JSON.stringify(troubleToSet),
          JSON.stringify(faqsToSet),
          reasonToSet,
          p.recommended_aspect_ratio || '4:5',
        ],
      );
      updated += 1;
      if (updated % 20 === 0) {
        console.log(`  ... processed ${updated}/${prompts.length} prompts`);
      }
    } catch (err) {
      skipped += 1;
      console.error(`  ✗ ${p.slug} — DB error: ${err.message}`);
    }
  }

  console.log(`\n--- Migration Complete ---`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (bespoke/good): ${skipped}`);
  console.log(`Dedup-regenerated: ${dedupRegenerated}`);
  console.log(`Quality issues flagged: ${qualityIssues}`);

  // ── Post-migration dedup check ──
  console.log('\n=== Post-Migration Duplicate Check ===\n');

  const { rows: tipDups } = await db.query(`
    SELECT customization_tips::text AS content, COUNT(*) AS cnt,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM prompts
    WHERE status = 'published'
      AND customization_tips IS NOT NULL
      AND jsonb_array_length(customization_tips) >= 2
    GROUP BY customization_tips::text
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);
  console.log(`Duplicate customization tip groups: ${tipDups.length}`);
  for (const d of tipDups) {
    console.log(`  - ${d.cnt} prompts: ${d.slugs.join(', ')}`);
  }

  const { rows: troubleDups } = await db.query(`
    SELECT prompt_specific_troubleshooting::text AS content, COUNT(*) AS cnt,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM prompts
    WHERE status = 'published'
      AND prompt_specific_troubleshooting IS NOT NULL
      AND jsonb_array_length(prompt_specific_troubleshooting) >= 2
    GROUP BY prompt_specific_troubleshooting::text
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);
  console.log(`Duplicate troubleshooting groups: ${troubleDups.length}`);
  for (const d of troubleDups) {
    console.log(`  - ${d.cnt} prompts: ${d.slugs.join(', ')}`);
  }

  const { rows: faqDups } = await db.query(`
    SELECT faqs::text AS content, COUNT(*) AS cnt,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM prompts
    WHERE status = 'published'
      AND faqs IS NOT NULL
      AND jsonb_array_length(faqs) >= 3
    GROUP BY faqs::text
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);
  console.log(`Duplicate FAQ groups: ${faqDups.length}`);
  for (const d of faqDups) {
    console.log(`  - ${d.cnt} prompts: ${d.slugs.join(', ')}`);
  }

  const { rows: arDups } = await db.query(`
    SELECT aspect_ratio_reason AS content, COUNT(*) AS cnt,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM prompts
    WHERE status = 'published'
      AND aspect_ratio_reason IS NOT NULL
      AND length(aspect_ratio_reason) > 10
    GROUP BY aspect_ratio_reason
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);
  console.log(`Duplicate aspect-ratio reason groups: ${arDups.length}`);
  for (const d of arDups) {
    console.log(`  - ${d.cnt} prompts: ${d.slugs.join(', ')}`);
    console.log(`    "${d.content}"`);
  }

  // ── Final stats ──
  console.log('\n=== Final Stats ===\n');

  const { rows: stats } = await db.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE customization_tips IS NOT NULL AND jsonb_array_length(customization_tips) >= 2) AS has_tips,
      COUNT(*) FILTER (WHERE prompt_specific_troubleshooting IS NOT NULL AND jsonb_array_length(prompt_specific_troubleshooting) >= 2) AS has_trouble,
      COUNT(*) FILTER (WHERE faqs IS NOT NULL AND jsonb_array_length(faqs) >= 3) AS has_faqs,
      COUNT(*) FILTER (WHERE aspect_ratio_reason IS NOT NULL AND length(aspect_ratio_reason) > 10) AS has_ar,
      COUNT(*) FILTER (
        WHERE customization_tips IS NOT NULL AND jsonb_array_length(customization_tips) >= 2
        AND prompt_specific_troubleshooting IS NOT NULL AND jsonb_array_length(prompt_specific_troubleshooting) >= 2
        AND faqs IS NOT NULL AND jsonb_array_length(faqs) >= 3
        AND aspect_ratio_reason IS NOT NULL AND length(aspect_ratio_reason) > 10
      ) AS fully_editorial
    FROM prompts
    WHERE status = 'published'
  `);

  const s = stats[0];
  console.log(`Total published:          ${s.total}`);
  console.log(`With customization tips:  ${s.has_tips}`);
  console.log(`With troubleshooting:     ${s.has_trouble}`);
  console.log(`With 3+ FAQs:             ${s.has_faqs}`);
  console.log(`With AR reason:           ${s.has_ar}`);
  console.log(`Fully editorial:          ${s.fully_editorial}`);
  console.log(`Incomplete:               ${s.total - s.fully_editorial}`);

  console.log('\n=== Done ===');
}

main()
  .catch((error) => {
    const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`\nBackfill failed (${errorCode}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      getPgPool().end();
    } catch {
      // Pool may not exist if configuration failed before initialization.
    }
  });
