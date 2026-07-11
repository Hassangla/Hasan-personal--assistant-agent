// One-shot PWA icon generator (no deps): the brand mark — accent square with
// a centered white dot — as raw-encoded PNGs. Run: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const ACCENT = [0xc7, 0x5f, 0x3f];
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c,
    table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const cx = size / 2,
    cy = size / 2,
    r = size * 0.16; // white dot radius
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const inDot = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const [rr, gg, bb] = inDot ? WHITE : ACCENT;
      row[1 + x * 3] = rr;
      row[2 + x * 3] = gg;
      row[3 + x * 3] = bb;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [size, name] of [
  [512, "public/icon-512.png"],
  [192, "public/icon-192.png"],
  [180, "public/apple-touch-icon.png"],
]) {
  writeFileSync(name, png(size));
  console.log("wrote", name);
}
