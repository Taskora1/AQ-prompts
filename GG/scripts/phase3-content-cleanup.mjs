import fs from 'node:fs';
import path from 'node:path';

const blogDirectory = path.join(process.cwd(), 'content', 'blog');
const files = fs.readdirSync(blogDirectory).filter((file) => file.endsWith('.mdx') && !file.startsWith('_'));

function protectMarkdownUrls(line) {
  const urls = [];
  const protectedLine = line.replace(/\]\(([^)]+)\)/g, (match) => {
    const token = `__AQ_URL_${urls.length}__`;
    urls.push(match);
    return token;
  });
  return {
    value: protectedLine,
    restore(value) {
      return value.replace(/__AQ_URL_(\d+)__/g, (match, index) => urls[Number(index)] || match);
    },
  };
}

function cleanLine(line) {
  if (/^(slug|coverImage|ogImage|canonicalUrl):/.test(line.trim())) return line;

  const protectedUrls = protectMarkdownUrls(line);
  const cleaned = protectedUrls.value
    .replace(/\bwomen\s*(?:&|and)\s*girls\b/gi, 'adult women')
    .replace(/\bgirls\s*(?:&|and)\s*women\b/gi, 'adult women')
    .replace(/\bgirls\b/gi, 'adult women')
    .replace(/\bgirl\b/gi, 'adult woman')
    .replace(/\byoung woman\b/gi, 'adult woman')
    .replace(/\bBMW M4\b/gi, 'unbranded silver sports sedan')
    .replace(/\bNike sneakers\b/gi, 'unbranded sneakers')
    .replace(/\bVogue(?:-style| style)?\b/gi, 'fashion editorial')
    .replace(/\bHarper's Bazaar\b/gi, 'fashion editorial')
    .replace(/\bForbes\b/gi, 'business editorial')
    .replace(/\bGQ\b/gi, 'menswear editorial')
    .replace(/\bTier 1 (?:markets|audiences)\b/gi, 'international audiences')
    .replace(/\b8K(?: quality| resolution)?\b/gi, 'high-resolution')
    .replace(/\bmasterpiece\b/gi, 'carefully composed image')
    .replace(/\bprofessional-grade\b/gi, 'polished')
    .replace(/\bprofessional-quality\b/gi, 'polished')
    .replace(/\bflawless\b/gi, 'natural-looking')
    .replace(/\bperfect anatomy\b/gi, 'coherent anatomy')
    .replace(/\bperfect hands\b/gi, 'coherent hands')
    .replace(/\bmaximum facial consistency\b/gi, 'stronger facial continuity')
    .replace(/\bmaximum identity consistency\b/gi, 'stronger identity continuity')
    .replace(/\bwith maximum accuracy\b/gi, 'as closely as the selected tool supports')
    .replace(/\bexact facial identity\b/gi, 'facial identity guidance')
    .replace(/\bexact face and features\b/gi, 'recognizable facial characteristics')
    .replace(/\bmaintain my exact face\b/gi, 'use my permitted reference image as identity guidance')
    .replace(/\bkeep my exact face\b/gi, 'use my permitted reference image as identity guidance')
    .replace(/\bmaintain the exact face, hairstyle, age, ethnicity, and natural slim physique from the reference image\b/gi, 'Use a permitted reference image as guidance for recognizable facial characteristics, hairstyle, apparent adult age, and natural proportions')
    .replace(/\bmaintain exact face, hairstyle, age, ethnicity, and natural slim physique\b/gi, 'Use a permitted reference image as guidance for recognizable facial characteristics, hairstyle, apparent adult age, and natural proportions')
    .replace(/\bpreserve the exact same face identity\b/gi, 'Use the permitted reference as identity guidance')
    .replace(/\bmaintain 100% facial consistency with the uploaded face\b/gi, 'Prioritize recognizable facial characteristics from the permitted reference, then review the output for identity drift')
    .replace(/\bmaintain 100% face identity consistency\b/gi, 'Prioritize recognizable facial characteristics from the permitted reference, then review the output for identity drift')
    .replace(/\bkeep the exact same outfit and accessories\b/gi, 'Keep the requested outfit and accessories visually consistent where the tool supports it')
    .replace(/\bonly change the pose, not the identity\b/gi, 'Change the pose while using the permitted reference as identity guidance')
    .replace(/\bonly change the body pose\b/gi, 'Change the body pose while retaining recognizable, non-sensitive characteristics where supported')
    .replace(/\bonly change the pose and body movement\b/gi, 'Change the pose and body movement while retaining recognizable, non-sensitive characteristics where supported')
    .replace(/\bonly change the pose and viewing direction\b/gi, 'Change the pose and viewing direction while retaining recognizable, non-sensitive characteristics where supported')
    .replace(/\bonly change the pose\b/gi, 'Change the pose while retaining recognizable, non-sensitive characteristics where supported')
    .replace(/\bzero AI beautification\b/gi, 'avoid automatic beauty retouching')
    .replace(/\boverall body structure identical to the reference image\b/gi, 'the subject’s general proportions close to the permitted reference where supported')
    .replace(/\bperfect for:/gi, 'Potential uses:')
    .replace(/\bbest for:/gi, 'Potential uses:')
    .replace(/\bideal for:/gi, 'Potential uses:')
    .replace(/\bperforms strongly\b/gi, 'is commonly used as a visual setting')
    .replace(/\bperform well\b/gi, 'provide a recognizable visual setting')
    .replace(/\bproduce professional results\b/gi, 'produce a usable starting point')
    .replace(/\bgetting professional results\b/gi, 'getting a more coherent starting point')
    .replace(/\bdelivers excellent results\b/gi, 'can interpret this type of prompt')
    .replace(/\bproduce excellent results\b/gi, 'can interpret this type of prompt');

  return protectedUrls.restore(cleaned);
}

for (const file of files) {
  const filePath = path.join(blogDirectory, file);
  const source = fs.readFileSync(filePath, 'utf8');
  const cleaned = source.split(/\r?\n/).map(cleanLine).join('\n');
  fs.writeFileSync(filePath, cleaned);
}

console.log(`[phase3-content-cleanup] reviewed ${files.length} blog source files`);
