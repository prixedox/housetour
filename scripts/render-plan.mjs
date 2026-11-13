import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { pdf } from 'pdf-to-img';
import { parseCrop, cropRect } from './lib/house-files.mjs';

const USAGE = 'Usage: node scripts/render-plan.mjs <pdf> [<pdf of next floor> …] <houseId> [--rotate 90|180|270] [--crop x,y,w,h …] [--floor <name> …] [--scale 4]';

// Leading *.pdf arguments are the floors, drawn left to right into one plan image.
const args = process.argv.slice(2);
const firstOther = args.findIndex((a) => !/\.pdf$/i.test(a));
const pdfPaths = firstOther > 0 ? args.slice(0, firstOther) : [];
const [houseId, ...rest] = firstOther > 0 ? args.slice(firstOther) : [];
if (pdfPaths.length === 0 || !/^[a-z0-9-]+$/.test(houseId ?? '')) {
  console.error(USAGE);
  process.exit(1);
}
const opts = (name) => rest.flatMap((a, i) => (a === name ? [rest[i + 1]] : []));
// One --crop per floor, in the same order; fractions of the page after --rotate.
const crops = opts('--crop').map(parseCrop);
// One --floor per PDF names the floors; rooms in tour.json refer to these names.
const names = opts('--floor');
const scale = Number(opts('--scale')[0] ?? 4);
const rotate = Number(opts('--rotate')[0] ?? 0);

async function renderFloor(pdfPath, crop) {
  let page;
  for await (const p of await pdf(pdfPath, { scale })) {
    page = p;
    break;
  }
  // Rotate first (plans are often drawn sideways), so the crop is given as the result looks.
  const upright = rotate ? await sharp(page).rotate(rotate).png().toBuffer() : page;
  const { width, height } = await sharp(upright).metadata();
  const image = crop ? sharp(upright).extract(cropRect(crop, width, height)) : sharp(upright);
  return image.flatten({ background: '#fff' }).png().toBuffer({ resolveWithObject: true });
}

const floors = [];
for (const [i, pdfPath] of pdfPaths.entries()) floors.push(await renderFloor(pdfPath, crops[i]));

// The gap keeps the neighbouring floor out of the minimap, which shows one floor at a time.
const gap = Math.round(floors[0].info.width * 0.15);
let left = 0;
const parts = [];
const placed = floors.map(({ data, info }, i) => {
  const at = { input: data, left, top: 0 };
  parts.push({ name: names[i] ?? String(i + 1), x: left, width: info.width });
  console.log(`floor at x=${left}: ${info.width}x${info.height}`);
  left += info.width + gap;
  return at;
});
const size = { width: left - gap, height: Math.max(...floors.map((f) => f.info.height)) };

const outDir = path.join('public', 'houses', houseId);
const { width, height } = await sharp({ create: { ...size, channels: 3, background: '#fff' } })
  .composite(placed)
  .png({ palette: true })
  .toFile(path.join(outDir, 'plan.png'));
console.log(`wrote plan.png ${width}x${height}`);

const tourPath = path.join(outDir, 'tour.json');
if (await access(tourPath).then(() => true, () => false)) {
  const tour = JSON.parse(await readFile(tourPath, 'utf8'));
  tour.plan = { image: 'plan.png', width, height, ...(parts.length > 1 ? { floors: parts } : {}) };
  await writeFile(tourPath, JSON.stringify(tour, null, 2) + '\n');
  console.log('updated tour.json plan');
}
