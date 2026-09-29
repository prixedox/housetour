import { readdir, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { isPanorama, skeletonTour } from './lib/house-files.mjs';

const [sourceDir, houseId, ...rest] = process.argv.slice(2);
if (!sourceDir || !/^[a-z0-9-]+$/.test(houseId ?? '')) {
  console.error('Usage: node scripts/prepare-house.mjs <sourceDir> <houseId> [--map mapping.json]');
  process.exit(1);
}
const mapIndex = rest.indexOf('--map');
const mapping = mapIndex >= 0 ? JSON.parse(await readFile(rest[mapIndex + 1], 'utf8')) : {};

const outDir = path.join('public', 'houses', houseId);
await mkdir(path.join(outDir, 'pano'), { recursive: true });
await mkdir(path.join(outDir, 'exterior'), { recursive: true });

const files = (await readdir(sourceDir)).filter((f) => /\.jpe?g$/i.test(f)).sort();
const rooms = [];
const exterior = [];

for (const file of files) {
  const src = path.join(sourceDir, file);
  const { width, height } = await sharp(src).metadata();
  if (isPanorama(width, height)) {
    const entry = mapping[file] ?? { id: `room${rooms.length + 1}`, name: `Místnost ${rooms.length + 1}` };
    await sharp(src).resize(4096, 2048).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, 'pano', `${entry.id}.jpg`));
    await sharp(src).resize(512, 256).blur(2).jpeg({ quality: 60 }).toFile(path.join(outDir, 'pano', `${entry.id}-preview.jpg`));
    rooms.push(entry);
    console.log(`pano     ${file} -> ${entry.id}`);
  } else {
    const name = `exterior/${String(exterior.length + 1).padStart(2, '0')}.jpg`;
    await sharp(src).rotate().resize({ width: 2560, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, name));
    exterior.push(name);
    console.log(`exterior ${file} -> ${name}`);
  }
}

const tourPath = path.join(outDir, 'tour.json');
const exists = await access(tourPath).then(() => true, () => false);
if (exists) {
  console.log(`${tourPath} exists, not overwritten`);
} else {
  await writeFile(tourPath, JSON.stringify(skeletonTour(houseId, rooms, exterior), null, 2) + '\n');
  console.log(`wrote ${tourPath}`);
}
