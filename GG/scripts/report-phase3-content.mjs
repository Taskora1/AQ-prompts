import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

import { shouldNoIndexPrompt } from '../src/lib/prompt-constants.js';

const root = process.cwd();
const blogDirectory = path.join(root, 'content', 'blog');

function parseMdx(source) {
  const input = source.replace(/^\uFEFF/, '');
  const match = input.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return {
    data: match ? yaml.load(match[1]) || {} : {},
    body: match ? input.slice(match[0].length) : input,
  };
}

function editorialText(body) {
  const lines = [];
  let inCode = false;

  for (const line of body.split(/\r?\n/)) {
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode || /^!\[/.test(line.trim())) continue;
    lines.push(line);
  }

  return lines
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`[\]()|:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(value) {
  return (value.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
}

const articleRows = [];
for (const file of fs.readdirSync(blogDirectory).filter((item) => item.endsWith('.mdx') && !item.startsWith('_'))) {
  const { data, body } = parseMdx(fs.readFileSync(path.join(blogDirectory, file), 'utf8'));
  articleRows.push({
    title: data.title,
    slug: data.slug,
    words: countWords(editorialText(body)),
    prompts: (body.match(/^## Prompt /gm) || []).length,
    sections: (body.match(/^## /gm) || []).length,
    troubleshooting: /troubleshoot|common (?:failure|problem)/i.test(body),
    ethical: /ethical|responsible use|permission/i.test(body),
    author: data.author,
    published: data.date,
    updated: data.updatedDate || '',
    images: (body.match(/^!\[/gm) || []).length,
  });
}

console.log('ARTICLE_INVENTORY');
for (const row of articleRows) console.log(JSON.stringify(row));

const promptPayload = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'prompts-index.json'), 'utf8'));
const prompts = Array.isArray(promptPayload) ? promptPayload : promptPayload.prompts || [];
const noIndexPrompts = prompts.filter(shouldNoIndexPrompt);
console.log(`PROMPT_TOTAL=${prompts.length}`);
console.log(`PROMPT_NOINDEX=${noIndexPrompts.length}`);
for (const prompt of noIndexPrompts) console.log(`NOINDEX\t${prompt.slug}\t${prompt.title}`);

const paragraphOwners = new Map();
for (const file of fs.readdirSync(blogDirectory).filter((item) => item.endsWith('.mdx') && !item.startsWith('_'))) {
  const { body } = parseMdx(fs.readFileSync(path.join(blogDirectory, file), 'utf8'));
  for (const paragraph of body.split(/\r?\n\s*\r?\n/)) {
    const normalized = editorialText(paragraph).toLowerCase();
    if (countWords(normalized) < 18) continue;
    const owners = paragraphOwners.get(normalized) || [];
    owners.push(file);
    paragraphOwners.set(normalized, owners);
  }
}

const duplicates = [...paragraphOwners.entries()].filter(([, owners]) => new Set(owners).size > 1);
console.log(`EXACT_DUPLICATE_PARAGRAPHS=${duplicates.length}`);
for (const [text, owners] of duplicates) {
  console.log(`DUPLICATE\t${[...new Set(owners)].join(',')}\t${text.slice(0, 140)}`);
}
