/**
 * Backfill prompt-specific editorial content for key published prompts.
 *
 * Each entry contains genuinely prompt-specific content derived from the
 * actual prompt text — NOT generic boilerplate.
 */

// Use the shared env-loading helper so DATABASE_URL is available
import { getPgPool } from './lib/load-local-env.mjs';

const EDITORIAL_CONTENT = {
  'professional-studio-double-exposure-south-asian-man-portrait': {
    customizationTips: [
      'Swap the white button-down for a black turtleneck to shift from business-casual to evening-editorial mood.',
      'Replace the wayfarer sunglasses with clear-lens frames if the ghosted face should feel more approachable.',
      'Change the matte grey background to deep navy for a darker, more cinematic double-exposure composite.',
    ],
    commonProblems: [
      {
        issue: 'Ghosted face appears at wrong opacity or position',
        why_it_happens: 'Models struggle to layer two semi-transparent versions of the same face without merging them into one.',
        fix: 'Describe the foreground and ghosted layers as separate compositional elements, specifying opacity and placement for each.',
      },
      {
        issue: 'White shirt loses texture and becomes a flat block',
        why_it_happens: 'High-key lighting on white fabric can clip highlights, especially at f/2.0 in studio simulations.',
        fix: 'Add "preserve visible fabric weave, collar seams, and button detail in the white shirt" to the prompt.',
      },
    ],
    faqs: [
      { question: 'Can I use this prompt without uploading a reference photo?', answer: 'Yes. Remove the identity-preservation instructions and let the model generate a new face. The double-exposure layout and lighting will still apply.' },
      { question: 'Why does the ghosted overlay look muddy instead of semi-transparent?', answer: 'Some models interpret "semi-transparent" as blurred rather than layered. Try "faded ghosted close-up at 40% opacity, soft edge fade toward bottom" for clearer results.' },
      { question: 'What aspect ratio works best for this composition?', answer: '4:5 is recommended because the vertical frame accommodates both the walking foreground figure and the overlapping ghosted face without cropping either element.' },
    ],
    aspectRatioReason: '4:5 vertical frame accommodates both the walking foreground figure and the overlapping ghosted face without cropping either element.',
    recommendedAspectRatio: '4:5',
  },
  'creative-cinematic-beach-portrait': {
    customizationTips: [
      'Replace "beach" with "rooftop terrace" or "balcony" to keep the golden-hour mood in an urban setting.',
      'Swap the beige linen shirt for a dark navy shirt to increase contrast against the sand and sky.',
      'Change "looking thoughtfully off-camera to the right" to "making direct eye contact" for a more engaging portrait.',
    ],
    commonProblems: [
      {
        issue: 'Ocean background becomes overexposed or blown out',
        why_it_happens: 'Golden-hour directional light from the front-left can cause the sky and water to clip highlights.',
        fix: 'Add "keep ocean highlights within safe exposure range, retain wave detail in bright areas" to the prompt.',
      },
      {
        issue: 'Linen shirt texture disappears in the final image',
        why_it_happens: 'Shallow depth of field at f/2.8 can blur fabric details on the torso while keeping the face sharp.',
        fix: 'Specify "preserve visible linen weave texture on the shirt, especially across the chest and shoulders" to maintain fabric detail.',
      },
    ],
    faqs: [
      { question: 'Do I need to upload a face photo for this prompt?', answer: 'The prompt is written for reference-image workflows. Remove the identity-preservation line if you want the model to generate a new face freely.' },
      { question: 'Why are the warm and cool tones clashing instead of complementing?', answer: 'Some models push warm highlights and cool shadows too far apart. Add "warm-cool color harmony, natural skin tone preservation" to keep the palette balanced.' },
      { question: 'Can I adapt this for a female subject?', answer: 'Yes. Replace "young adult male" with "young adult woman" and adjust the clothing description. The lighting, composition, and background instructions remain the same.' },
    ],
    aspectRatioReason: '4:5 keeps the seated figure centered while retaining the ocean horizon and sky gradient in the background.',
    recommendedAspectRatio: '4:5',
  },
  'aesthetic-south-asian-male-autumn-park-portrait': {
    customizationTips: [
      'Swap the maroon shirt for an olive-green or camel-colored sweater to match different autumn palettes.',
      'Replace the park bench with a stone wall or cafe chair to shift from park to urban-lifestyle context.',
      'Change "aviator-style sunglasses" to "round tortoiseshell glasses" for a more intellectual, less casual look.',
    ],
    commonProblems: [
      {
        issue: 'Autumn foliage looks artificial or oversaturated',
        why_it_happens: 'Models often push autumn colors to neon-orange extremes when prompted with "golden-yellow foliage."',
        fix: 'Add "muted natural autumn tones, avoid oversaturated oranges" to keep the background realistic.',
      },
      {
        issue: 'Sunglasses reflect the wrong environment or distort the eyes',
        why_it_happens: 'AI-generated eyewear often pulls reflections from training data rather than the described scene.',
        fix: 'Specify "silver-frame aviator sunglasses with subtle neutral reflections, eyes visible through lenses" for cleaner results.',
      },
    ],
    faqs: [
      { question: 'Is this prompt suitable for adult subjects?', answer: 'The original prompt describes a late-teen subject. For adult subjects, replace "late teens (16-18 years old)" with "young adult man in his twenties" and adjust the wardrobe if needed.' },
      { question: 'Why does the 85mm bokeh look more like a blur than creamy background separation?', answer: 'Some models render "bokeh" as uniform gaussian blur rather than lens-shaped highlights. Add "circular bokeh highlights in background foliage" to guide the rendering.' },
      { question: 'Can I use this for a LinkedIn profile photo?', answer: 'Yes, but remove the sunglasses and change the pose to a more neutral, forward-facing stance. The autumn background and warm lighting still work well for professional profiles.' },
    ],
    aspectRatioReason: '4:5 keeps the seated subject centered while showing enough autumn foliage to establish the seasonal mood.',
    recommendedAspectRatio: '4:5',
  },
  'all-white-luxury-riverside-aesthetic-male-portrait': {
    customizationTips: [
      'Replace the all-white outfit with a cream-and-navy combination for more visual contrast against the palm-tree background.',
      "Swap the riverfront walkway for a hotel lobby or yacht deck to shift from outdoor-casual to indoor-luxury.",
      'Remove the sunglasses and change the pose to direct eye contact for a more personal, less editorial feel.',
    ],
    commonProblems: [
      {
        issue: 'White clothing blends into the bright background and loses definition',
        why_it_happens: 'An all-white outfit against a bright outdoor scene can cause the model to merge clothing edges with the background.',
        fix: 'Add "clear separation between white clothing and background, visible seams, lapels, and button detail" to maintain garment definition.',
      },
      {
        issue: 'Palm trees look generic or tropical-resort cliché',
        why_it_happens: 'The model defaults to stock tropical imagery when it sees "palm trees" in a prompt.',
        fix: 'Specify "mature date palms with natural frond detail, not cartoonish or resort-stock appearance" for more realistic vegetation.',
      },
    ],
    faqs: [
      { question: 'Why does the Rule of Thirds composition not apply in my output?', answer: 'Some models ignore composition directives. Add "subject positioned at right-third intersection, negative space on left" to reinforce the framing.' },
      { question: 'Can I change the outfit colors without breaking the prompt?', answer: 'Yes. Replace "all-white casual ensemble" with your preferred color combination. Keep the clothing items (blazer, shirt, chinos) consistent for a coherent outfit.' },
      { question: 'Does this work with ChatGPT image generation?', answer: 'The prompt is written for reference-image workflows. ChatGPT may interpret the camera and lens instructions differently, but the composition and styling should still apply.' },
    ],
    aspectRatioReason: '4:5 vertical framing captures the full-body lean pose while keeping the palm canopy and river visible in the background.',
    recommendedAspectRatio: '4:5',
  },
  'mirror-reflection-portrait-dual-tone-red-blue-lighting': {
    customizationTips: [
      'Replace the red-blue split with warm-amber and cool-teal for a more cinematic, less neon aesthetic.',
      'Change the mirror surface to a water puddle reflection for a grittier, street-photography feel.',
      'Swap the subject pose from "looking into the mirror" to "looking away from the mirror" for a more contemplative mood.',
    ],
    commonProblems: [
      {
        issue: 'Red and blue lighting bleeds into the skin tones and looks unnatural',
        why_it_happens: 'Dual-tone lighting can overpower natural skin rendering, especially on models that prioritize color accuracy.',
        fix: 'Add "natural skin tone preservation under colored lighting, subtle color cast on clothing only" to keep faces realistic.',
      },
      {
        issue: 'Mirror reflection shows a different face or inconsistent clothing',
        why_it_happens: 'AI models struggle to maintain identity consistency between a subject and their mirror reflection.',
        fix: 'Describe the reflection as "the exact same person, identical face, same clothing, same accessories" and avoid complex reflection angles.',
      },
    ],
    faqs: [
      { question: 'How do I prevent the red and blue lights from looking like a nightclub?', answer: 'Reduce the intensity by adding "subtle colored rim lighting, not full-scene color wash" to keep the effect editorial rather than nightlife.' },
      { question: 'Can I use this without a reference photo?', answer: 'Yes. Remove the identity-preservation instructions. The dual-tone lighting and mirror concept will still generate a striking portrait.' },
      { question: 'Why does the mirror frame look distorted?', answer: 'AI models sometimes warp mirror edges. Add "clean rectangular mirror frame with straight edges, realistic glass surface" to anchor the geometry.' },
    ],
    aspectRatioReason: '4:5 vertical framing captures both the subject and their mirror reflection without cropping the frame edges.',
    recommendedAspectRatio: '4:5',
  },
  'professional-studio-portrait-south-asian-man-in-white-textured-sweater': {
    customizationTips: [
      'Replace the white V-neck sweater with a black crew-neck for a darker, more formal studio look.',
      'Swap the wood-panel background for a solid dark-grey seamless backdrop to increase subject isolation.',
      'Change the silver curb chain necklace to a thin gold chain for a warmer accessory tone.',
    ],
    commonProblems: [
      {
        issue: 'Micro-honeycomb texture on the sweater renders as flat white',
        why_it_happens: 'Fine fabric textures like honeycomb knitting are often smoothed out by AI models that prioritize overall color over surface detail.',
        fix: 'Add "preserve micro-honeycomb knit texture visible across the entire sweater surface, especially on shoulders and chest" to maintain fabric detail.',
      },
      {
        issue: 'Wood-panel background looks artificial or repetitive',
        why_it_happens: 'AI-generated wood textures can appear as uniform plank patterns rather than natural grain variation.',
        fix: 'Specify "natural wood grain variation, uneven panel widths, warm brown tones with subtle knots" for a more realistic backdrop.',
      },
    ],
    faqs: [
      { question: 'Can I use this for a LinkedIn headshot?', answer: 'Yes, but remove the silver chain necklace and change the crossed-arms pose to a more neutral stance. The wood-panel background and softbox lighting work well for professional profiles.' },
      { question: 'Why does the white sweater look overexposed?', answer: 'White fabric under front-lit softbox lighting can clip highlights. Add "preserve visible knit texture and seam detail in white clothing, avoid overexposure" to keep the garment detailed.' },
      { question: 'Does this work with Midjourney?', answer: 'Yes. Midjourney responds well to the camera and lens specifications. You may need to add "--ar 4:5" at the end for the correct aspect ratio.' },
    ],
    aspectRatioReason: '4:5 keeps the centered subject framed from mid-chest up while showing enough wood-panel background to establish the warm studio context.',
    recommendedAspectRatio: '4:5',
  },
  'urban-monochrome-south-asian-male-portrait-concrete-aesthetic': {
    customizationTips: [
      'Replace the concrete staircase with a parking garage or underpass for grittier urban textures.',
      'Swap the black ribbed shirt for a white linen shirt to create stronger contrast against the concrete.',
      'Change "looking off-camera to the right" to "looking down at the sunglasses in hand" for a more candid, less posed feel.',
    ],
    commonProblems: [
      {
        issue: 'All-black outfit merges into a dark blob against shadow areas',
        why_it_happens: 'Models struggle to separate dark clothing from dark shadows, especially in monochrome palettes.',
        fix: 'Add "visible ribbed texture on black shirt, clear separation between black clothing and shadow areas, defined edges" to maintain garment detail.',
      },
      {
        issue: 'Concrete staircase looks too clean or stock-photo-like',
        why_it_happens: 'AI defaults to idealized architectural elements rather than weathered, realistic concrete.',
        fix: 'Specify "weathered concrete with visible aggregate, minor stains, industrial metal railings with patina" for authentic urban texture.' },
    ],
    faqs: [
      { question: 'Why does the 50mm depth of field look different from the 85mm mentioned in the prompt?', answer: 'The prompt mentions both 50mm and 85mm. The model may prioritize one over the other. Specify your preferred focal length clearly at the start of the prompt.' },
      { question: 'Can I adapt this for a female subject?', answer: 'Yes. Replace "young South Asian man" with "young South Asian woman" and adjust the clothing description. The concrete staircase setting and monochrome palette remain the same.' },
      { question: 'Why are the diagonal bokeh lines not appearing?', answer: 'The metal railings need to be described as being in the out-of-focus zone. Add "diagonal bokeh created by blurred metal railings in background" to emphasize the geometric effect.' },
    ],
    aspectRatioReason: '4:5 captures the full staircase composition with the subject positioned slightly left of center, leaving space for the diagonal railing bokeh on the right.',
    recommendedAspectRatio: '4:5',
  },
  'silk-motion-editorial-high-intensity-portrait': {
    customizationTips: [
      'Replace "silk blouse" with "chiffon blouse" for a lighter, more translucent fabric movement effect.',
      'Change the wind direction from general to "wind from the left" to control which way hair and fabric flow.',
      'Swap "minimalist nude makeup" for "bold red lip" to shift from editorial-neutral to high-impact glamour.',
    ],
    commonProblems: [
      {
        issue: 'Hair movement looks stiff or frozen rather than wind-swept',
        why_it_happens: 'AI models often render hair as static strands rather than capturing fluid motion.',
        fix: 'Add "individual hair strands catching wind, natural flowing motion, some strands crossing the face slightly" to encourage dynamic hair rendering.' },
      {
        issue: 'Silk fabric appears flat instead of showing realistic sheen and folds',
        why_it_happens: 'Silk requires specific light-reflection instructions to render its characteristic sheen rather than looking like cotton.',
        fix: 'Specify "silk fabric with visible light reflections on folds, characteristic satin sheen, realistic drape and movement" to guide the fabric rendering.' },
    ],
    faqs: [
      { question: 'Can I use this prompt for a male subject?', answer: 'Yes. Replace "silk blouse" with "silk shirt" and adjust the makeup description. The wind-motion and lighting instructions remain the same.' },
      { question: 'Why does the "high-energy editorial" mood not come through?', answer: 'Mood descriptors alone are not enough. Add specific expression cues: "piercing direct eye contact, slightly parted lips, tension in the jawline" to reinforce the intensity.' },
      { question: 'Does this work with Leonardo AI?', answer: 'Yes. Leonardo AI handles fabric and hair physics well. Use the PhotoReal mode for best results with the photorealistic rendering instructions.' },
    ],
    aspectRatioReason: '4:5 captures the full hair and fabric movement vertically while keeping the subject\'s face as the clear focal point in the upper third.',
    recommendedAspectRatio: '4:5',
  },
};

async function main() {
  const db = getPgPool();

  const slugs = Object.keys(EDITORIAL_CONTENT);
  let updated = 0;
  let notFound = 0;

  for (const slug of slugs) {
    const content = EDITORIAL_CONTENT[slug];

    const result = await db.query(
      `UPDATE prompts
       SET
         customization_tips = $2::jsonb,
         prompt_specific_troubleshooting = $3::jsonb,
         faqs = $4::jsonb,
         aspect_ratio_reason = $5,
         recommended_aspect_ratio = $6
       WHERE slug = $1
       RETURNING id, slug`,
      [
        slug,
        JSON.stringify(content.customizationTips),
        JSON.stringify(content.commonProblems),
        JSON.stringify(content.faqs),
        content.aspectRatioReason,
        content.recommendedAspectRatio,
      ],
    );

    if (result.rowCount > 0) {
      updated += 1;
      console.log(`  ✓ ${slug} (id=${result.rows[0].id})`);
    } else {
      notFound += 1;
      console.log(`  ✗ ${slug} — not found in database`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${notFound} not found`);
}

main()
  .catch((error) => {
    const errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`Backfill failed (${errorCode}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      getPgPool().end();
    } catch {
      // Pool may not exist if configuration failed before initialization.
    }
  });
