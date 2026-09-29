import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { pdf } from 'pdf-to-img';
import { parseCrop, cropRect } from './lib/house-files.mjs';

const [pdfPath, houseId, ...rest] = process.argv.slice(2);
if (!pdfPath || !/^[a-z0-9-]+$/.test(houseId ?? '')) {
  console.error('Usage: node scripts/render-plan.mjs <pdf> <houseId> [--crop x,y,w,h] [--scale 4]');
  process.exit(1);
}
const opt = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const crop = opt('--crop') ? parseCrop(opt('--crop')) : null;
const scale = Number(opt('--scale') ?? 4);

const document = await pdf(pdfPath, { scale });
let pageBuffer;
for await (const page of document) {
  pageBuffer = page;
  break;
}

let image = sharp(pageBuffer);
if (crop) {
  const { width, height } = await image.metadata();
  image = sharp(pageBuffer).extract(cropRect(crop, width, height));
}
const outDir = path.join('public', 'houses', houseId);
const { width, height } = await image.png().toFile(path.join(outDir, 'plan.png'));
console.log(`wrote plan.png ${width}x${height}`);

const tourPath = path.join(outDir, 'tour.json');
if (await access(tourPath).then(() => true, () => false)) {
  const tour = JSON.parse(await readFile(tourPath, 'utf8'));
  tour.plan = { image: 'plan.png', width, height };
  await writeFile(tourPath, JSON.stringify(tour, null, 2) + '\n');
  console.log('updated tour.json plan');
}
