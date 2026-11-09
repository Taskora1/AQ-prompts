#!/usr/bin/env node
/* Remove duplicate sitemap.xml route file to resolve Next.js duplicate route warning */

const fs = require('fs');
const path = require('path');

const routePath = path.join(__dirname, '..', 'app', 'sitemap.xml', 'route.js');
const dirPath = path.join(__dirname, '..', 'app', 'sitemap.xml');
const nextDir = path.join(__dirname, '..', '.next');

// 1. Remove the duplicate route file
if (fs.existsSync(routePath)) {
  fs.unlinkSync(routePath);
  console.log('[sitemap-cleanup] Removed: app/sitemap.xml/route.js');
} else {
  console.log('[sitemap-cleanup] Already removed: app/sitemap.xml/route.js');
}

// 2. Remove the sitemap.xml directory if empty
try {
  if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
    fs.rmdirSync(dirPath);
    console.log('[sitemap-cleanup] Removed empty directory: app/sitemap.xml/');
  }
} catch {
  // directory may have other files — skip
}

// 3. Remove .next cache
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log('[sitemap-cleanup] Removed: .next/');
} else {
  console.log('[sitemap-cleanup] .next/ already clean');
}

console.log('[sitemap-cleanup] Done. Run: npm run build && npm run dev');
