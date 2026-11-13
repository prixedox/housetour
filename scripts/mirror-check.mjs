// Opens every mirrored page in Chromium, serving files from the mirror folder,
// and lists the same-site requests that are missing (assets loaded only at runtime).
// Missing paths go to <outDir>/.extra-urls; rerun mirror-site.mjs to fetch them.
// Usage: node scripts/mirror-check.mjs [outDir=site] [base=/housetour/]
import { chromium } from '@playwright/test';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const OUT = process.argv[2] || 'site';
const BASE = process.argv[3] || '/housetour/';
const HOST = 'http://preview.local';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff' };

const pages = (await readdir(OUT, { recursive: true })).filter((f) => f.endsWith('index.html')).map((f) => f.replaceAll('\\', '/'));
const missing = new Set();
const browser = await chromium.launch();
const page = await browser.newPage();

await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== HOST) return route.abort(); // keep it offline: we only care about our own files
  let path = decodeURIComponent(url.pathname);
  if (!path.startsWith(BASE)) { missing.add(path); return route.fulfill({ status: 404 }); }
  path = path.slice(BASE.length - 1);
  const file = join(OUT, path.endsWith('/') ? path + 'index.html' : path);
  try {
    route.fulfill({ body: await readFile(file), contentType: TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
  } catch {
    missing.add(path);
    route.fulfill({ status: 404 });
  }
});

for (const p of pages) {
  const url = `${HOST}${BASE}${p.replace(/index\.html$/, '')}`;
  await page.goto(url, { waitUntil: 'load' }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(800);
}
await browser.close();

const list = [...missing].sort();
await writeFile(join(OUT, '.extra-urls'), list.join('\n'));
console.log(`${pages.length} pages checked, ${list.length} missing`);
for (const m of list) console.log('  ' + m);
