// Adds the Krnalovice house (with the 360° tour) to the mirrored site:
//  - a reference detail page built from the Kopřivnice page layout,
//  - a "Domy s virtuální prohlídkou 360°" block at the top of Galerie domů.
// Run after mirror-site.mjs. Usage: node scripts/site-add-krnalovice.mjs [outDir=site] [base=/housetour/]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT = process.argv[2] || 'site';
const BASE = process.argv[3] || '/housetour/';

const HOUSE = {
  slug: 'rodinny-dum-4kk-krnalovice',
  title: 'Rodinný dům 4+kk, Krnalovice',
  desc: 'Reference stavby jednopodlažního nízkoenergetického rodinného domu typu bungalov od společnosti VIKYMONT s.r.o.',
  typ: 'Nízkoenergetický',
  dispozice: '4+kk',
  tour: 'krakovska', // house id in the tour app
  photo: 'D:/morevto/krak 360/dji_fly_20250701_104336_0281_1751360220676_photo.jpeg',
};
const TEMPLATE = 'reference/vzorovy-rodinny-dum-51-koprivnice/index.html';
const GALLERY = 'galerie-domu/index.html';
const IMG = `${BASE}wp-content/uploads/krnalovice/dji.jpg`;
const PAGE_URL = `${BASE}reference/${HOUSE.slug}/`;
const TOUR_URL = `${BASE}prohlidka/?house=${HOUSE.tour}`;
const PLAN_URL = `${BASE}prohlidka/houses/${HOUSE.tour}/plan.png`;
const LOOP_ITEM = '<div data-elementor-type="loop-item"';

const read = (p) => readFile(join(OUT, p), 'utf8');
const write = async (p, s) => { await mkdir(join(OUT, p, '..'), { recursive: true }); await writeFile(join(OUT, p), s); };

// Start of the top-level section whose class list contains `id` (e.g. elementor-element-60f5bf96).
function sectionStart(html, id) {
  const i = html.indexOf(`elementor-top-section elementor-element elementor-element-${id}`);
  if (i < 0) throw new Error(`section ${id} not found`);
  return html.lastIndexOf('<section', i);
}

// End index of the element that opens at `start` (balanced <div>…</div>).
function elementEnd(html, start) {
  let depth = 0;
  for (const m of html.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '<div' ? 1 : -1;
    if (depth === 0) return start + m.index + m[0].length;
  }
  throw new Error('unbalanced element');
}

await mkdir(join(OUT, 'wp-content/uploads/krnalovice'), { recursive: true });
await sharp(HOUSE.photo).resize(1800).jpeg({ quality: 82 }).toFile(join(OUT, 'wp-content/uploads/krnalovice/dji.jpg'));

// ---- detail page
let p = await read(TEMPLATE);
p = p.replace(/(?:https:\/\/www\.vikymont\.cz|\/housetour)\/wp-content\/uploads\/2022\/11\/vikymont-vzorovy-dum-4(?:-\d+x\d+)?\.jpg/g, IMG)
  .replace(/\s(?:srcset|sizes)="[^"]*"/g, (m) => (m.includes('vzorovy-dum-4') || m.includes('krnalovice') ? '' : m))
  .replaceAll('Vzorový rodinný dům 5+kk, Kopřivnice 1', HOUSE.title)
  .replaceAll('Reference stavby jednopodlažního pasivního rodinného domu typu bungalov společnosti VIKYMONT s.r.o., Kopřivnice.', HOUSE.desc)
  .replaceAll('Typ: Pasivní', `Typ: ${HOUSE.typ}`).replaceAll('Typ stavby: Pasivní', `Typ stavby: ${HOUSE.typ}`)
  .replaceAll('Dispozice: 5+kk', `Dispozice: ${HOUSE.dispozice}`)
  .replace(/<li class="elementor-icon-list-item">\s*(?:<span[^>]*>\s*)?<span class="elementor-icon-list-text">(?:Užitná|Zastavěná) plocha:[^<]*<\/span>\s*<\/li>/g, '')
  .replaceAll('href="#fotogalerie"', 'href="#prohlidka"')
  .replace(/(<span class="elementor-button-text">)Fotogalerie\s*<\/span>/g, '$1Virtuální prohlídka</span>');

// Kopřivnice's floor plan → the tour's plan
const planStart = sectionStart(p, '53e3d5ca');
const galleryStart = sectionStart(p, '60f5bf96');
const plan = p.slice(planStart, galleryStart)
  .replace(/<img[^>]*>/, `<img src="${PLAN_URL}" alt="Půdorys" style="max-width:min(100%,640px);height:auto;display:block;margin:0 auto">`)
  .replace(/href="[^"]*\/wp-content\/uploads\/[^"]*"/g, `href="${PLAN_URL}"`);

const tour = `
<section id="prohlidka" style="max-width:1140px;margin:0 auto;padding:60px 10px;scroll-margin-top:40px">
<h2 class="elementor-heading-title" style="text-align:center;color:#2d231a;margin-bottom:20px">Virtuální prohlídka 360°</h2>
<iframe src="${TOUR_URL}" title="Virtuální prohlídka" style="width:100%;height:75vh;min-height:480px;border:0;display:block" allow="fullscreen; gyroscope; accelerometer" allowfullscreen></iframe>
</section>
`;

// Order: hero, Typ box, tour, plan, specification, rest (Kopřivnice photo gallery dropped).
const specStart = sectionStart(p, '6395fb58');
const restStart = sectionStart(p, '25ed1e5c');
if (!(specStart < planStart && planStart < galleryStart && galleryStart < restStart)) throw new Error('unexpected section order');
const spec = p.slice(specStart, planStart);
p = p.slice(0, specStart) + tour + plan + spec + p.slice(restStart);
await write(`reference/${HOUSE.slug}/index.html`, p);

// ---- gallery: new top block with this house only
let g = await read(GALLERY);
if (!g.includes(PAGE_URL)) {
  const donor = g.indexOf(`${BASE}reference/rodinny-dum-4kk-dobra-3/`);
  const cardStart = g.lastIndexOf(LOOP_ITEM, donor);
  let card = g.slice(cardStart, elementEnd(g, cardStart))
    .replaceAll(`${BASE}reference/rodinny-dum-4kk-dobra-3/`, PAGE_URL)
    .replace(/src="[^"]*dobra-3-01-1024x683\.jpg"/, `src="${IMG}" style="aspect-ratio:3/2;object-fit:cover"`)
    .replace(/\s(?:srcset|sizes)="[^"]*"/g, '')
    .replaceAll('Rodinný dům 4+kk, Dobrá 3', HOUSE.title);
  card = card.replace(`<a href="${PAGE_URL}">`, `<a href="${PAGE_URL}" style="position:relative;display:block">`
    + '<span style="position:absolute;top:14px;left:14px;z-index:2;background:#8ABA29;color:#fff;font:600 15px/1 Roboto,sans-serif;padding:9px 14px;letter-spacing:.02em">360° Virtuální prohlídka</span>');

  // clone the first price block (heading widget + loop grid widget) and keep only our card
  const h = g.indexOf('Rodinné domy za 3,2 až 4 mil. Kč');
  const headStart = g.lastIndexOf('<div class="elementor-element', g.lastIndexOf('elementor-widget-heading', h));
  const gridStart = g.indexOf('<div class="elementor-element', h);
  const gridEnd = elementEnd(g, gridStart);
  let block = g.slice(headStart, gridEnd)
    .replace('Rodinné domy za 3,2 až 4 mil. Kč', 'Domy s virtuální prohlídkou 360°')
    .replace('id="do4"', 'id="prohlidky"');
  const itemsStart = block.indexOf(LOOP_ITEM);
  const lastItem = block.lastIndexOf(LOOP_ITEM);
  block = block.slice(0, itemsStart) + card + block.slice(elementEnd(block, lastItem));
  g = g.slice(0, headStart) + block + g.slice(headStart);
  await write(GALLERY, g);
}
console.log(`Added ${PAGE_URL}`);
