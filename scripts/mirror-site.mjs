// Static mirror of www.vikymont.cz for the GitHub Pages preview.
// Usage: node scripts/mirror-site.mjs [outDir=site] [base=/housetour/]
// Crawls the site's pages and every asset they reference, rewrites all
// vikymont.cz URLs to `base`, strips analytics and the cookie banner,
// marks pages noindex and disables forms (the preview has no backend).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ORIGIN = 'https://www.vikymont.cz';
const OUT = process.argv[2] || 'site';
const BASE = process.argv[3] || '/housetour/';
const BASE_ESC = BASE.replaceAll('/', '\\/');

const ASSET_EXT = /\.(css|js|mjs|json|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|pdf)$/i;
const SKIP = /^\/(wp-admin|wp-json|wp-login|xmlrpc|feed|comments|author|wp-sitemap|.*\/feed\/?$)/;
const HOST_RE = /(?:https?:)?(?:\\?\/){2}(?:www\.)?vikymont\.cz/gi;

const pages = new Set();
const assets = new Set();
const queue = [];

function normalize(raw, from) {
  let u;
  try { u = new URL(raw.replaceAll('\\/', '/').replaceAll('&amp;', '&'), from); } catch { return null; }
  if (!/^(www\.)?vikymont\.cz$/.test(u.hostname)) return null;
  const path = decodeURIComponent(u.pathname);
  if (SKIP.test(path)) return null;
  if (ASSET_EXT.test(path)) return { kind: 'asset', path };
  if (u.search) return null; // query pages (search, ?p=, …) are not part of the static copy
  if (/\/[^/]\/?$/.test(path)) return null; // one-letter paths are minified-JS noise, not pages
  return { kind: 'page', path: path.endsWith('/') ? path : path + '/' };
}

function enqueue(raw, from) {
  const n = normalize(raw, from);
  if (!n) return;
  const set = n.kind === 'page' ? pages : assets;
  if (set.has(n.path)) return;
  set.add(n.path);
  queue.push(n);
}

function collectUrls(text, from) {
  const found = [];
  // absolute vikymont URLs (also JSON-escaped ones inside inline scripts)
  for (const m of text.matchAll(/(?:https?:)?(?:\\?\/){2}(?:www\.)?vikymont\.cz[^"'\s)<>,]*/gi)) found.push(m[0]);
  // root-relative and relative references in attributes
  for (const m of text.matchAll(/(?:href|src|data-src|data-thumbnail|poster)=["']([^"'#][^"']*)["']/gi)) found.push(m[1]);
  for (const m of text.matchAll(/srcset=["']([^"']+)["']/gi)) for (const part of m[1].split(',')) found.push(part.trim().split(/\s+/)[0]);
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) if (!m[1].startsWith('data:')) found.push(m[1]);
  for (const u of found) enqueue(u.split('&quot;')[0], from);
}

function rewrite(text, isHtml) {
  let t = text.replace(HOST_RE, (m) => (m.includes('\\/') ? BASE_ESC.slice(0, -2) : BASE.slice(0, -1)));
  if (isHtml) t = t.replace(/((?:href|src|action|data-src)=["'])\/(?!\/|housetour\/)/gi, `$1${BASE}`);
  else t = t.replace(/url\(\s*(["']?)\/(?!\/|housetour\/)/gi, `url($1${BASE}`);
  return t;
}

const HEAD_ADD = `<meta name="robots" content="noindex,nofollow">
<style>.cky-consent-container,.cky-overlay,.cky-btn-revisit-wrapper,.cky-modal{display:none!important}</style>
<script>document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();alert('Toto je náhled webu, formulář se neodesílá. Kontaktujte nás prosím telefonicky.');},true);</script>`;

function cleanHtml(html) {
  return html
    .replace(/<script[^>]*googletagmanager[^>]*>\s*<\/script>/gi, '')
    .replace(/<script[^>]*cookie-law-info[^>]*>\s*<\/script>/gi, '')
    .replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:gtag\(|fbq\()(?:(?!<\/script>)[\s\S])*?<\/script>/gi, '')
    .replace(/<noscript>(?:(?!<\/noscript>)[\s\S])*?facebook\.com\/tr(?:(?!<\/noscript>)[\s\S])*?<\/noscript>/gi, '')
    .replace(/<head>/i, `<head>${HEAD_ADD}`);
}

function outPath(item) {
  return join(OUT, item.kind === 'page' ? item.path + 'index.html' : item.path);
}

async function fetchItem(item, tries = 3) {
  let res;
  try { res = await fetch(ORIGIN + encodeURI(item.path), { redirect: 'follow' }); }
  catch (e) { if (tries > 1) return fetchItem(item, tries - 1); throw e; }
  if (!res.ok) { console.warn(`  ${res.status} ${item.path}`); return; }
  const type = res.headers.get('content-type') || '';
  const isHtml = type.includes('text/html');
  const isText = isHtml || /css|javascript|json|svg|xml/.test(type);
  let body;
  if (isText) {
    let text = await res.text();
    collectUrls(text, res.url);
    if (isHtml) text = cleanHtml(text);
    body = rewrite(text, isHtml);
  } else {
    body = Buffer.from(await res.arrayBuffer());
  }
  const file = outPath(item);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
}

async function seedFromSitemaps() {
  for (const map of ['wp-sitemap-posts-page-1.xml', 'wp-sitemap-posts-reference-1.xml']) {
    const xml = await (await fetch(`${ORIGIN}/${map}`)).text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) enqueue(m[1], ORIGIN);
  }
}

// Extra URLs found later (e.g. by a browser pass) can be passed in a file, one path per line.
async function seedExtra() {
  try {
    for (const line of (await readFile(join(OUT, '.extra-urls'), 'utf8')).split('\n')) if (line.trim()) enqueue(line.trim(), ORIGIN);
  } catch { /* none */ }
}

enqueue('/', ORIGIN);
await seedFromSitemaps();
await seedExtra();

let done = 0;
async function worker() {
  while (queue.length) {
    const item = queue.shift();
    try { await fetchItem(item); } catch (e) { console.warn(`  failed ${item.path}: ${e.message}`); }
    if (++done % 50 === 0) console.log(`${done} done, ${queue.length} queued`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}
// The host's firewall bans IPs that request too fast (8 parallel requests got this machine
// blocked), so crawl gently: 2 workers with a pause after each request.
const WORKERS = 2;
const DELAY_MS = 400;
// A worker stops when the queue is momentarily empty while others may still add to it,
// so run rounds until a round ends with nothing queued.
do await Promise.all(Array.from({ length: WORKERS }, worker)); while (queue.length);
console.log(`Mirrored ${pages.size} pages and ${assets.size} assets into ${OUT}/`);
