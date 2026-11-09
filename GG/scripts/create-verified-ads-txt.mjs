import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argument = process.argv.find((item) => item.startsWith('--publisher-id='));
const publisherId = argument?.slice('--publisher-id='.length).trim() || '';
const force = process.argv.includes('--force');

if (!/^pub-\d{16}$/.test(publisherId) || /^pub-(\d)\1{15}$/.test(publisherId)) {
  console.error('A real publisher ID in the exact format pub- followed by 16 digits is required.');
  process.exit(1);
}

const outputPath = path.join(process.cwd(), 'public', 'ads.txt');
if (fs.existsSync(outputPath) && !force) {
  console.error('public/ads.txt already exists. Review it manually or rerun with --force.');
  process.exit(1);
}

const line = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`;
fs.writeFileSync(outputPath, line, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
console.log('Created public/ads.txt using the supplied validated publisher ID.');
