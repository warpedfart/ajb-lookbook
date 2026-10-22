export function hexToGame(hexes) {
  return hexes.map((hex) => (0xff000000 | Number.parseInt(hex.slice(1, 7), 16)) >>> 0);
}

function mixColors(a, b) {
  const r = (((a >>> 16) & 255) + ((b >>> 16) & 255)) / 2;
  const g = (((a >>> 8) & 255) + ((b >>> 8) & 255)) / 2;
  const bl = ((a & 255) + (b & 255)) / 2;
  return (r << 16) | (g << 8) | bl;
}

function setGradient(pal, color, start, count) {
  let r = (color >>> 16) & 255;
  let g = (color >>> 8) & 255;
  let b = color & 255;
  const dr = r / (count + 2);
  const dg = g / (count + 2);
  const db = b / (count + 2);
  let pos = start + count - 1;
  for (let i = 0; i < count; i += 1) {
    const rgb = ((r << 16) | (g << 8) | b) & 0xffffff;
    pal[pos] = (0xff000000 | rgb) >>> 0;
    pal[pos + 25] = (0xc0000000 | rgb) >>> 0;
    pal[pos + 50] = (0x80000000 | rgb) >>> 0;
    pal[pos + 75] = (0x40000000 | rgb) >>> 0;
    r -= dr;
    g -= dg;
    b -= db;
    pos -= 1;
  }
}

export function buildPalette(game, indexes) {
  const [c0, c1, c2, c3] = indexes.map((i) => game[i] ?? 0);
  const pal = new Array(100).fill(0);
  setGradient(pal, c0, 1, 3);
  setGradient(pal, c1, 4, 3);
  setGradient(pal, c2, 7, 3);
  setGradient(pal, c3, 10, 3);
  setGradient(pal, mixColors(c0, c1), 13, 2);
  setGradient(pal, mixColors(c1, c2), 15, 2);
  setGradient(pal, mixColors(c0, c2), 17, 2);
  setGradient(pal, mixColors(c0, c3), 19, 2);
  setGradient(pal, mixColors(c1, c3), 21, 2);
  setGradient(pal, mixColors(c2, c3), 23, 2);
  return pal;
}

function forEachPixel(bytes, x0, y0, x1, cb) {
  const w = x1 - x0;
  let pos = 0;
  let x = x0;
  let y = y0;
  while (pos < bytes.length) {
    let v = bytes[pos++];
    let run = 1;
    if (v & 128) {
      v &= 127;
      run = bytes[pos++] + 1;
    }
    if (v === 0) {
      x += run;
      if (x >= x1) {
        run = x - x1;
        x = x0 + (run % w);
        y += Math.floor(run / w) + 1;
      }
    } else {
      while (run-- > 0) {
        cb(v, x, y);
        x += 1;
        if (x === x1) {
          x = x0;
          y += 1;
        }
      }
    }
  }
}

function colorPass(px, W, H, f, pal, minX, minY) {
  const x0 = f.x - minX;
  const y0 = f.y - minY;
  forEachPixel(f.b.data, x0, y0, x0 + f.w, (v, x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const c = pal[v] >>> 0;
    const o = (y * W + x) * 4;
    const sa = c >>> 24;
    const sr = (c >>> 16) & 255;
    const sg = (c >>> 8) & 255;
    const sb = c & 255;
    if (c >= 0xff000000) {
      px[o] = sr; px[o + 1] = sg; px[o + 2] = sb; px[o + 3] = 255;
      return;
    }
    const dr = px[o], dg = px[o + 1], db = px[o + 2], da = px[o + 3];
    if ((dr | dg | db | da) === 0) {
      px[o] = sr; px[o + 1] = sg; px[o + 2] = sb; px[o + 3] = sa;
      return;
    }
    let r, g, b;
    if (sa === 192) {
      r = (3 * sr + dr) >> 2; g = (3 * sg + dg) >> 2; b = (3 * sb + db) >> 2;
    } else if (sa === 128) {
      r = (sr + dr) >> 1; g = (sg + dg) >> 1; b = (sb + db) >> 1;
    } else {
      r = (sr + 3 * dr) >> 2; g = (sg + 3 * dg) >> 2; b = (sb + 3 * db) >> 2;
    }
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.max(da, sa);
  });
}

function shadowPass(px, W, H, f, minX, minY) {
  const x0 = f.x - minX;
  const y0 = f.y - minY;
  forEachPixel(f.s.data, x0, y0, x0 + f.w, (v, x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    if ((px[o] | px[o + 1] | px[o + 2] | px[o + 3]) === 0) return;
    const t = (v << f.sm) + 24;
    const k = t > 255 ? 1 : t / 255;
    px[o] = Math.floor(px[o] * k);
    px[o + 1] = Math.floor(px[o + 1] * k);
    px[o + 2] = Math.floor(px[o + 2] * k);
    if (px[o + 3] === 0) px[o + 3] = 255;
  });
}

export function renderSprite(canvas, layers, game, frame = 0) {
  let minX = 1000, minY = 1000, maxX = 0, maxY = 0, any = false;
  for (const layer of layers) {
    for (const f of layer?.data?.f ?? []) {
      if (!f) continue;
      any = true;
      minX = Math.min(minX, f.x);
      minY = Math.min(minY, f.y);
      maxX = Math.max(maxX, f.x + f.w);
      maxY = Math.max(maxY, f.y + f.h);
    }
  }
  if (!any) return false;
  const W = 1 + maxX - minX;
  const H = 1 + maxY - minY;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (const layer of layers) {
    const f = layer?.data?.f?.[frame];
    if (!f) continue;
    colorPass(img.data, W, H, f, buildPalette(game, layer.indexes), minX, minY);
    if (f.s) shadowPass(img.data, W, H, f, minX, minY);
  }
  ctx.putImageData(img, 0, 0);
  return true;
}