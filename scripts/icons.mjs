// Renders the app's raster icons from app/icon.svg: the favicon for browsers that don't take an SVG one, the apple-touch icon, and the
// manifest's icons for a home screen. Deterministic: run `node scripts/icons.mjs` after changing app/icon.svg, and commit the result.
// Phones round the corners themselves, so the apple-touch and maskable icons are the same drawing, full-bleed: the book sits inside the
// maskable safe zone (the middle 80 %) as it is.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rounded = readFileSync(join(root, "app/icon.svg"));
const fullBleed = Buffer.from(rounded.toString().replace(' rx="14"', ""));

const png = (svg, size) =>
  sharp(svg, { density: (72 * size) / 64 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

// An .ico of PNG images (allowed since Windows Vista, read by every browser): a header, one directory entry per image, then the images.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size % 256, e);
    header.writeUInt8(size % 256, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const out = {
  "app/favicon.ico": ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(rounded, size) })))),
  "app/apple-icon.png": await png(fullBleed, 180),
  "public/icon-192.png": await png(rounded, 192),
  "public/icon-512.png": await png(rounded, 512),
  "public/icon-maskable-512.png": await png(fullBleed, 512),
};
for (const [path, data] of Object.entries(out)) writeFileSync(join(root, path), data);
