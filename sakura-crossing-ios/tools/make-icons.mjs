/* ------------------------------------------------------------------ *
 * App icon generator.
 *
 * The project has no image assets and this build keeps it that way: the
 * icons are drawn here, in the same spirit as everything in `src/` -- a
 * small software rasteriser, a PNG encoder over `zlib`, and no dependency
 * on a toolchain that has to be installed before the app can be built.
 *
 * The mark is the crossing itself: the two-bar 踏切 saltire with its pair
 * of lamps, on the same dawn gradient the sky dome uses, with blossom
 * falling across it.  It reads at 40 px, which is the only requirement an
 * icon actually has.
 *
 *   node tools/make-icons.mjs
 * ------------------------------------------------------------------ */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

/* --------------------------------- PNG --------------------------------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param rgb  Uint8Array of size*size*3 */
function encodePNG(size, rgb) {
  // one filter byte (0 = none) per scanline
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy
      ? rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3)
      : Buffer.from(rgb.subarray(y * size * 3, (y + 1) * size * 3)).copy(raw, y * (size * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ rasteriser ------------------------------ */
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Distance from a point to a segment, for drawing the bars as capsules. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const PAPER = [246, 240, 235];
const SKY_TOP = [166, 194, 232];
const SKY_LOW = [244, 214, 214];
const INK = [58, 51, 80];
const RED = [207, 92, 98];
const BLOSSOM = [252, 214, 222];

/**
 * One pixel of the icon, in a 0..1 square.
 *
 * Supersampled 3x3 by the caller, so everything below can be a hard edge and
 * still come out with the soft contour a cel-shaded project should have.
 */
function shade(u, v) {
  // dawn gradient, warm at the horizon like the sky dome
  let c = mix(SKY_TOP, SKY_LOW, Math.pow(v, 1.35));

  // the ground the crossing stands on
  if (v > 0.78) c = mix(c, PAPER, Math.min(1, (v - 0.78) / 0.06));

  // falling blossom, behind the mark
  const petals = [
    [0.20, 0.20, 0.035], [0.83, 0.15, 0.028], [0.72, 0.34, 0.022],
    [0.14, 0.52, 0.026], [0.90, 0.62, 0.024], [0.30, 0.86, 0.030],
  ];
  for (const [px, py, r] of petals) {
    const d = Math.hypot(u - px, v - py);
    if (d < r) c = mix(c, BLOSSOM, 0.88);
  }

  // the saltire: two bars crossing at the centre
  const bar = 0.052;
  const arms = [
    [0.22, 0.30, 0.78, 0.70],
    [0.78, 0.30, 0.22, 0.70],
  ];
  for (const [ax, ay, bx, by] of arms) {
    const d = segDist(u, v, ax, ay, bx, by);
    if (d < bar) c = PAPER.slice();
    else if (d < bar + 0.016) c = INK.slice();
  }
  // hazard banding on the bars, the way a real boom is painted
  for (const [ax, ay, bx, by] of arms) {
    if (segDist(u, v, ax, ay, bx, by) >= bar) continue;
    const t = ((u - ax) * (bx - ax) + (v - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
    if (Math.floor(t * 7) % 2 === 0) c = RED.slice();
  }

  // the two lamps, above the crossing
  for (const lx of [0.40, 0.60]) {
    const d = Math.hypot(u - lx, v - 0.17);
    if (d < 0.052) c = INK.slice();
    if (d < 0.038) c = mix(RED, PAPER, lx < 0.5 ? 0.0 : 0.62);
  }
  // the mast the lamps hang from
  if (Math.abs(u - 0.5) < 0.018 && v > 0.14 && v < 0.34) c = INK.slice();

  return c;
}

function render(size) {
  const px = Buffer.alloc(size * size * 3);
  const SS = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 3;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
    }
  }
  return px;
}

mkdirSync(OUT, { recursive: true });
/* 180 is the apple-touch-icon; 192 and 512 are the manifest's; 1024 is what
 * App Store Connect wants, and Xcode generates the rest of the set from it. */
for (const size of [180, 192, 512, 1024]) {
  const file = resolve(OUT, `icon-${size}.png`);
  writeFileSync(file, encodePNG(size, render(size)));
  console.log(`wrote ${file}`);
}
