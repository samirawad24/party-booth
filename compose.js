// Lays the finished photos onto a print in one of the booth styles. Every
// style writes the booth's own words (settings.js) in its footer.

import { PALETTE as P, LAYOUTS } from './config.js';
import { titleText, subText } from './settings.js';

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = 'Jost, "Helvetica Neue", Arial, sans-serif';
const GROTESK = '"Bricolage Grotesque", "Arial Black", sans-serif';
const RETRO = 'Shrikhand, "Cooper Black", Georgia, serif';
const SCRIPT = 'Yellowtail, "Brush Script MT", cursive';
const COMIC = 'Bangers, Impact, sans-serif';

// Print scale for the current compose call. Canvas shadows ignore the
// transform, so blur sizes are multiplied by it by hand.
let S = 1;

export function cells(layoutId) {
  const L = LAYOUTS[layoutId];
  const cw = Math.floor((L.W - L.pad * 2 - L.gap * (L.cols - 1)) / L.cols);
  const ch = Math.round(cw / L.aspect);
  const out = [];
  for (let r = 0; r < L.rows; r++) {
    for (let c = 0; c < L.cols; c++) {
      out.push({ x: L.pad + c * (cw + L.gap), y: L.pad + r * (ch + L.gap), w: cw, h: ch });
    }
  }
  const gridBottom = L.pad + L.rows * ch + (L.rows - 1) * L.gap;
  return { cells: out, cw, ch, footer: { x: 0, y: gridBottom, w: L.W, h: L.H - gridBottom } };
}

// Same pieces every time, so confetti does not jump around between redraws.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Text helpers

function spaced(ctx, text, x, y, spacing, draw = 'fillText') {
  // Canvas letterSpacing is not in every Safari, so space letters by hand.
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => { ctx[draw](ch, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = align;
  return total;
}

function spacedWidth(ctx, text, spacing) {
  const chars = [...text];
  return chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
}

function fitFont(ctx, text, family, style, size, maxW) {
  let s = size;
  ctx.font = `${style} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 2;
    ctx.font = `${style} ${s}px ${family}`;
  }
  return s;
}

// Long titles go onto two lines instead of shrinking to nothing.
function titleLines(ctx, text, family, style, size, maxW) {
  ctx.font = `${style} ${size}px ${family}`;
  if (ctx.measureText(text).width <= maxW) return { lines: [text], size };
  const one = fitFont(ctx, text, family, style, size, maxW);
  const words = text.split(/\s+/);
  if (words.length > 1 && one < size * 0.72) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      ctx.font = `${style} ${size}px ${family}`;
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (!best || w < best.w) best = { w, lines: [a, b] };
    }
    const two = Math.min(size * 0.86, size * (maxW / best.w));
    if (two > one) {
      ctx.font = `${style} ${two}px ${family}`;
      return { lines: best.lines, size: two };
    }
  }
  ctx.font = `${style} ${one}px ${family}`;
  return { lines: [text], size: one };
}

// Centers a title (one or two lines) and a smaller line under it in the
// footer. Each style passes how to draw its own text.
function stack(ctx, L, f, { family, style, size, lh = 1, drawTitle, subSize, drawSub, gap = 0.5, maxW = 0.84, shift = 0 }) {
  const inner = f.h - L.pad * 0.6;
  const t = titleLines(ctx, titleText(), family, style, size, f.w * maxW);
  const blockH = t.lines.length * t.size * lh;
  const subH = drawSub ? subSize : 0;
  const groupH = blockH + (drawSub ? t.size * gap + subH : 0);
  const top = f.y + (inner - groupH) / 2 + inner * shift;
  t.lines.forEach((line, i) => {
    ctx.font = `${style} ${t.size}px ${family}`;
    drawTitle(line, f.w / 2, top + t.size * 0.8 + i * t.size * lh, t.size);
  });
  if (drawSub) drawSub(subText(), f.w / 2, top + blockH + t.size * gap + subSize * 0.78, subSize);
}

function titleSize(L, f, k = 0.3) {
  return Math.min((f.h - L.pad) * k, f.w * 0.13);
}

function subSizeFor(L, f) {
  return Math.max(14, Math.min((f.h - L.pad) * 0.075, f.w * 0.034));
}

// Small caps line, shrunk to fit.
function capsLine(ctx, text, x, y, size, maxW, { weight = 500, family = GROTESK, color, track = 0.28 } = {}) {
  const t = text.toUpperCase();
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (spacedWidth(ctx, t, s * track) > maxW && s > 8) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  if (color) ctx.fillStyle = color;
  spaced(ctx, t, x, y, s * track);
}

// Botanical line art, drawn as paths so it stays crisp at print size.

function bez(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}
function bezTan(p0, p1, p2, t) {
  const u = 1 - t;
  return Math.atan2(2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]), 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]));
}

// A sprig growing from (x, y) toward `angle` (radians), bending by `bend`.
// kind 'olive' has long pointed leaves, 'eucalyptus' has round coin leaves.
function sprig(ctx, x, y, len, angle, { kind, color, width, fill, bend = 0.18, leaves = 7, side = 1 }) {
  const p0 = [x, y];
  const p2 = [x + Math.cos(angle) * len, y + Math.sin(angle) * len];
  const mid = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
  const n = angle - (Math.PI / 2) * side;
  const p1 = [mid[0] + Math.cos(n) * len * bend, mid[1] + Math.sin(n) * len * bend];

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
  ctx.stroke();

  for (let i = 0; i < leaves; i++) {
    const t = 0.16 + (i / (leaves - 1)) * 0.8;
    const [lx, ly] = bez(p0, p1, p2, t);
    const tan = bezTan(p0, p1, p2, t);
    const flip = i % 2 === 0 ? 1 : -1;
    const scale = 1 - t * 0.45;
    if (kind === 'eucalyptus') {
      const r = len * 0.085 * scale;
      const a = tan + flip * 1.05;
      const stem = r * 0.55;
      const sx = lx + Math.cos(a) * stem, sy = ly + Math.sin(a) * stem;
      const cx = lx + Math.cos(a) * (stem + r), cy = ly + Math.sin(a) * (stem + r);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.88, a, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.stroke();
      // Center vein
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      const L = len * 0.2 * scale;
      const W = L * 0.24;
      const a = tan + flip * 0.62;
      const tip = [lx + Math.cos(a) * L, ly + Math.sin(a) * L];
      const nx = Math.cos(a + Math.PI / 2) * W, ny = Math.sin(a + Math.PI / 2) * W;
      const m = [lx + Math.cos(a) * L * 0.45, ly + Math.sin(a) * L * 0.45];
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(m[0] + nx * 2, m[1] + ny * 2, tip[0], tip[1]);
      ctx.quadraticCurveTo(m[0] - nx * 2, m[1] - ny * 2, lx, ly);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + Math.cos(a) * L * 0.8, ly + Math.sin(a) * L * 0.8);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // Tip leaf
  if (kind === 'olive') {
    const tan = bezTan(p0, p1, p2, 1);
    const L = len * 0.13;
    const W = L * 0.24;
    const tip = [p2[0] + Math.cos(tan) * L, p2[1] + Math.sin(tan) * L];
    const nx = Math.cos(tan + Math.PI / 2) * W, ny = Math.sin(tan + Math.PI / 2) * W;
    const m = [p2[0] + Math.cos(tan) * L * 0.45, p2[1] + Math.sin(tan) * L * 0.45];
    ctx.beginPath();
    ctx.moveTo(p2[0], p2[1]);
    ctx.quadraticCurveTo(m[0] + nx * 2, m[1] + ny * 2, tip[0], tip[1]);
    ctx.quadraticCurveTo(m[0] - nx * 2, m[1] - ny * 2, p2[0], p2[1]);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.stroke();
  } else {
    const tan = bezTan(p0, p1, p2, 1);
    const r = len * 0.05;
    ctx.beginPath();
    ctx.ellipse(p2[0] + Math.cos(tan) * r, p2[1] + Math.sin(tan) * r, r, r * 0.88, tan, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.stroke();
  }
  ctx.restore();
}

// Two sprigs reaching out from a shared center, like a pressed-flower spray.
export function spray(ctx, cx, cy, span, opts) {
  const len = span * 0.5;
  sprig(ctx, cx - span * 0.008, cy, len, Math.PI + 0.22, { ...opts, side: 1 });
  sprig(ctx, cx + span * 0.008, cy, len, -0.22, { ...opts, side: -1 });
}

// Built once per strength and seeded, so GIF frames share the same grain
// (moving noise would flicker and bloat the file).
const paperTiles = new Map();
function paper(ctx, W, H, strength) {
  let tile = paperTiles.get(strength);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const t = tile.getContext('2d');
    const img = t.createImageData(256, 256);
    const r = rng(Math.round(strength * 1000));
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = r() * 255 * strength;
    }
    t.putImageData(img, 0, 0);
    paperTiles.set(strength, tile);
  }
  ctx.save();
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Themes. Each draws the background, frames each photo and fills the footer.

function photoMat(ctx, cell, color, m) {
  ctx.fillStyle = color;
  ctx.fillRect(cell.x - m, cell.y - m, cell.w + m * 2, cell.h + m * 2);
}

function hairline(ctx, cell, color, offset, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(cell.x - offset, cell.y - offset, cell.w + offset * 2, cell.h + offset * 2);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * S;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function noGlow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

const NEON = { bg: '#140B26', pink: '#FF3EA5', pinkCore: '#FFD6EE', cyan: '#3EF0FF', cyanCore: '#D8FCFF' };
const COMIC_C = { yellow: '#FFD23F', red: '#FF4B2B', ink: '#141414' };
const SEVENTIES = { paper: '#F5E6C4', brown: '#6B2F14', orange: '#E8661C', mustard: '#F2AE2E', rust: '#B5441B' };
const CONFETTI_COLORS = ['#FF4F8B', '#FFC43D', '#2EC4B6', '#7B61FF', '#FF8A3D', '#4D9DE0'];

function confetti(ctx, W, H, count, seed, area) {
  const r = rng(seed);
  const [ax, ay, aw, ah] = area || [0, 0, W, H];
  for (let i = 0; i < count; i++) {
    const x = ax + r() * aw, y = ay + r() * ah;
    const size = W * (0.012 + r() * 0.014);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r() * Math.PI * 2);
    ctx.fillStyle = CONFETTI_COLORS[Math.floor(r() * CONFETTI_COLORS.length)];
    const kind = r();
    if (kind < 0.45) ctx.fillRect(-size / 2, -size * 0.22, size, size * 0.44);
    else if (kind < 0.75) {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Little curl of ribbon
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = size * 0.18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-size * 0.6, 0);
      ctx.bezierCurveTo(-size * 0.2, -size * 0.6, size * 0.2, size * 0.6, size * 0.6, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function halftone(ctx, W, H, color, step) {
  ctx.fillStyle = color;
  for (let y = 0, row = 0; y < H + step; y += step * 0.87, row++) {
    for (let x = (row % 2) * step / 2; x < W + step; x += step) {
      // Dots grow toward the bottom right corner.
      const k = 0.18 + 0.82 * Math.min(1, (x / W + y / H) / 2);
      ctx.beginPath();
      ctx.arc(x, y, step * 0.36 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const THEMES = {
  neon: {
    dark: true,
    before(ctx, L) {
      ctx.fillStyle = NEON.bg;
      ctx.fillRect(0, 0, L.W, L.H);
      // Faint brick wall behind the sign
      const bh = L.W * 0.035, bw = bh * 2.4;
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = Math.max(1, L.W * 0.0015);
      for (let y = 0, row = 0; y < L.H; y += bh, row++) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(L.W, y);
        for (let x = (row % 2) * bw / 2; x < L.W; x += bw) { ctx.moveTo(x, y); ctx.lineTo(x, y + bh); }
        ctx.stroke();
      }
      paper(ctx, L.W, L.H, 0.04);
    },
    after(ctx, L, g) {
      const w = Math.max(2, L.W * 0.005);
      for (const c of g.cells) {
        glow(ctx, NEON.pink, L.W * 0.03);
        hairline(ctx, c, NEON.pink, L.gap * 0.42, w);
        noGlow(ctx);
        hairline(ctx, c, NEON.pinkCore, L.gap * 0.42, w * 0.4);
      }
    },
    footer(ctx, L, f) {
      stack(ctx, L, f, {
        family: SCRIPT, style: '400', size: titleSize(L, f, 0.4), lh: 0.95, gap: 0.42,
        drawTitle(line, x, y, size) {
          ctx.textAlign = 'center';
          glow(ctx, NEON.pink, size * 0.5);
          ctx.fillStyle = NEON.pink;
          ctx.fillText(line, x, y);
          glow(ctx, NEON.pink, size * 0.16);
          ctx.fillText(line, x, y);
          noGlow(ctx);
          ctx.fillStyle = NEON.pinkCore;
          ctx.fillText(line, x, y);
        },
        subSize: subSizeFor(L, f),
        drawSub(text, x, y, size) {
          glow(ctx, NEON.cyan, size * 0.9);
          capsLine(ctx, text, x, y, size, f.w * 0.8, { weight: 600, color: NEON.cyan, track: 0.32 });
          noGlow(ctx);
          capsLine(ctx, text, x, y, size, f.w * 0.8, { weight: 600, color: NEON.cyanCore, track: 0.32 });
        },
      });
    },
  },

  comic: {
    before(ctx, L, g) {
      ctx.fillStyle = COMIC_C.yellow;
      ctx.fillRect(0, 0, L.W, L.H);
      halftone(ctx, L.W, L.H, 'rgba(255,75,43,0.38)', L.W * 0.03);
      const off = L.W * 0.012;
      ctx.fillStyle = COMIC_C.ink;
      for (const c of g.cells) ctx.fillRect(c.x + off, c.y + off, c.w, c.h);
    },
    after(ctx, L, g) {
      for (const c of g.cells) hairline(ctx, c, COMIC_C.ink, 0, Math.max(3, L.W * 0.008));
    },
    footer(ctx, L, f) {
      stack(ctx, L, f, {
        family: COMIC, style: '400', size: titleSize(L, f, 0.38), lh: 0.92, gap: 0.42, shift: -0.03,
        drawTitle(line, x, y, size) {
          ctx.save();
          ctx.translate(x, y - size * 0.3);
          ctx.rotate(-0.045);
          ctx.textAlign = 'center';
          ctx.lineJoin = 'round';
          ctx.lineWidth = size * 0.16;
          ctx.strokeStyle = COMIC_C.ink;
          ctx.fillStyle = COMIC_C.ink;
          ctx.fillText(line, size * 0.06, size * 0.3 + size * 0.06);
          ctx.strokeText(line, size * 0.06, size * 0.3 + size * 0.06);
          ctx.strokeText(line, 0, size * 0.3);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(line, 0, size * 0.3);
          ctx.restore();
        },
        subSize: subSizeFor(L, f) * 1.25,
        drawSub(text, x, y, size) {
          const t = text.toUpperCase();
          let s = size;
          ctx.font = `400 ${s}px ${COMIC}`;
          while (spacedWidth(ctx, t, s * 0.08) > f.w * 0.72 && s > 8) { s -= 1; ctx.font = `400 ${s}px ${COMIC}`; }
          const w = spacedWidth(ctx, t, s * 0.08);
          ctx.save();
          ctx.translate(x, y - s * 0.35);
          ctx.rotate(0.03);
          ctx.fillStyle = COMIC_C.red;
          const px = s * 0.5, py = s * 0.32;
          ctx.fillRect(-w / 2 - px, -s * 0.5 - py, w + px * 2, s + py * 2);
          ctx.strokeStyle = COMIC_C.ink;
          ctx.lineWidth = Math.max(2, s * 0.12);
          ctx.strokeRect(-w / 2 - px, -s * 0.5 - py, w + px * 2, s + py * 2);
          ctx.fillStyle = '#FFFFFF';
          spaced(ctx, t, 0, s * 0.36, s * 0.08);
          ctx.restore();
        },
      });
    },
  },

  retro: {
    before(ctx, L, g) {
      ctx.fillStyle = SEVENTIES.paper;
      ctx.fillRect(0, 0, L.W, L.H);
      paper(ctx, L.W, L.H, 0.05);
      // Racing stripes along the top and bottom edges
      const band = L.pad * 0.16;
      const colors = [SEVENTIES.brown, SEVENTIES.rust, SEVENTIES.orange, SEVENTIES.mustard];
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, i * band * 1.12, L.W, band);
        ctx.fillRect(0, L.H - (i + 1) * band * 1.12, L.W, band);
      });
      for (const c of g.cells) {
        ctx.save();
        roundRect(ctx, c.x - L.W * 0.008, c.y - L.W * 0.008, c.w + L.W * 0.016, c.h + L.W * 0.016, L.W * 0.03);
        ctx.fillStyle = SEVENTIES.brown;
        ctx.fill();
        ctx.restore();
      }
    },
    clip(ctx, L, c) {
      roundRect(ctx, c.x, c.y, c.w, c.h, L.W * 0.024);
      ctx.clip();
    },
    footer(ctx, L, f) {
      // Sunset arcs behind the title
      const inner = f.h - L.pad * 0.6;
      const cx = f.w / 2, cy = f.y + inner * 0.98;
      const R = Math.min(f.w * 0.36, inner * 0.82);
      [SEVENTIES.brown, SEVENTIES.rust, SEVENTIES.orange, SEVENTIES.mustard].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1 - i * 0.2), Math.PI, 0);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      stack(ctx, L, f, {
        family: RETRO, style: '400', size: titleSize(L, f, 0.32), lh: 1.02, gap: 0.5,
        drawTitle(line, x, y, size) {
          ctx.textAlign = 'center';
          ctx.fillStyle = SEVENTIES.orange;
          ctx.fillText(line, x + size * 0.05, y + size * 0.05);
          ctx.fillStyle = SEVENTIES.brown;
          ctx.fillText(line, x, y);
        },
        subSize: subSizeFor(L, f),
        drawSub(text, x, y, size) {
          capsLine(ctx, text, x, y, size, f.w * 0.8, { weight: 700, color: SEVENTIES.rust, track: 0.3 });
        },
      });
    },
  },

  confetti: {
    before(ctx, L, g) {
      ctx.fillStyle = '#FFF0F5';
      ctx.fillRect(0, 0, L.W, L.H);
      confetti(ctx, L.W, L.H, Math.round((L.W * L.H) / 9000), 7);
      for (const c of g.cells) photoMat(ctx, c, '#FFFFFF', Math.round(L.W * 0.009));
    },
    after(ctx, L, g) {
      // A few pieces land on the photo edges.
      g.cells.forEach((c, i) => {
        confetti(ctx, L.W, L.H, 3, 40 + i, [c.x - L.W * 0.02, c.y + c.h * 0.7, L.W * 0.06, c.h * 0.3]);
        confetti(ctx, L.W, L.H, 2, 90 + i, [c.x + c.w - L.W * 0.03, c.y - L.W * 0.02, L.W * 0.06, c.h * 0.25]);
      });
    },
    footer(ctx, L, f) {
      stack(ctx, L, f, {
        family: GROTESK, style: '800', size: titleSize(L, f, 0.28), lh: 1, gap: 0.42,
        drawTitle(line, x, y, size) {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#FFC43D';
          ctx.fillText(line, x + size * 0.045, y + size * 0.045);
          ctx.fillStyle = '#FF2E74';
          ctx.fillText(line, x, y);
        },
        subSize: subSizeFor(L, f),
        drawSub(text, x, y, size) {
          capsLine(ctx, text, x, y, size, f.w * 0.8, { weight: 700, color: '#5B2A86', track: 0.3 });
        },
      });
    },
  },

  film: {
    dark: true,
    before(ctx, L) {
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, L.W, L.H);
      paper(ctx, L.W, L.H, 0.05);
      // Sprocket holes down both edges
      const hw = L.pad * 0.36, hh = L.pad * 0.5, step = L.pad * 0.95;
      ctx.fillStyle = '#F4EFE6';
      for (let y = L.pad * 0.4; y < L.H - hh; y += step) {
        for (const x of [L.pad * 0.5 - hw / 2, L.W - L.pad * 0.5 - hw / 2]) {
          roundRect(ctx, x, y, hw, hh, hw * 0.22);
          ctx.fill();
        }
      }
    },
    after(ctx, L, g) {
      // Frame numbers in the gaps, like the edge print on real film
      ctx.fillStyle = '#F2A33A';
      ctx.textAlign = 'left';
      const size = Math.max(10, L.gap * 0.62);
      ctx.font = `600 ${size}px ${GROTESK}`;
      g.cells.forEach((c, i) => ctx.fillText(`${i + 1}A  ▸`, c.x, c.y + c.h + size * 0.95));
    },
    footer(ctx, L, f) {
      stack(ctx, L, f, {
        family: GROTESK, style: '700', size: titleSize(L, f, 0.26), lh: 1, gap: 0.55, maxW: 0.76,
        drawTitle(line, x, y) {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#F4EFE6';
          ctx.fillText(line, x, y);
        },
        subSize: subSizeFor(L, f) * 0.9,
        drawSub(text, x, y, size) {
          capsLine(ctx, text, x, y, size, f.w * 0.7, { weight: 500, color: '#F2A33A', track: 0.4 });
        },
      });
    },
  },

  classic: {
    before(ctx, L) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, L.W, L.H);
    },
    footer(ctx, L, f) {
      stack(ctx, L, f, {
        family: GROTESK, style: '800', size: titleSize(L, f, 0.26), lh: 1, gap: 0.5,
        drawTitle(line, x, y) {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#141414';
          ctx.fillText(line, x, y);
        },
        subSize: subSizeFor(L, f) * 0.9,
        drawSub(text, x, y, size) {
          capsLine(ctx, text, x, y, size, f.w * 0.8, { weight: 500, color: '#707070', track: 0.34 });
        },
      });
    },
  },

  cream: {
    before(ctx, L) {
      ctx.fillStyle = P.cream;
      ctx.fillRect(0, 0, L.W, L.H);
      paper(ctx, L.W, L.H, 0.045);
      const i1 = L.pad * 0.36, i2 = L.pad * 0.5;
      ctx.strokeStyle = P.gold;
      ctx.lineWidth = Math.max(2, L.W * 0.0018);
      ctx.strokeRect(i1, i1, L.W - i1 * 2, L.H - i1 * 2);
      ctx.lineWidth = Math.max(1, L.W * 0.0009);
      ctx.strokeRect(i2, i2, L.W - i2 * 2, L.H - i2 * 2);
    },
    after(ctx, L, g) {
      for (const c of g.cells) hairline(ctx, c, 'rgba(70,60,40,0.25)', 0, Math.max(1, L.W * 0.001));
    },
    footer(ctx, L, f) {
      stack(ctx, L, f, {
        family: SERIF, style: 'italic 500', size: titleSize(L, f, 0.3), lh: 1, gap: 0.62, shift: 0.04,
        drawTitle(line, x, y) {
          ctx.textAlign = 'center';
          ctx.fillStyle = P.ink;
          ctx.fillText(line, x, y);
        },
        subSize: subSizeFor(L, f) * 0.85,
        drawSub(text, x, y, size) {
          // Gold rule with a small diamond above the line
          const ry = y - size * 1.6;
          const half = f.w * 0.16;
          ctx.strokeStyle = P.gold;
          ctx.lineWidth = Math.max(2, L.W * 0.0016);
          ctx.beginPath();
          ctx.moveTo(x - half, ry); ctx.lineTo(x - size * 0.6, ry);
          ctx.moveTo(x + size * 0.6, ry); ctx.lineTo(x + half, ry);
          ctx.stroke();
          const d = size * 0.28;
          ctx.fillStyle = P.gold;
          ctx.beginPath();
          ctx.moveTo(x, ry - d); ctx.lineTo(x + d, ry); ctx.lineTo(x, ry + d); ctx.lineTo(x - d, ry);
          ctx.closePath();
          ctx.fill();
          capsLine(ctx, text, x, y, size, f.w * 0.8, { weight: 300, family: SANS, color: '#6A5B3E', track: 0.38 });
        },
      });
    },
  },

  sage: {
    before(ctx, L, g) {
      ctx.fillStyle = P.sage;
      ctx.fillRect(0, 0, L.W, L.H);
      paper(ctx, L.W, L.H, 0.035);
      for (const c of g.cells) photoMat(ctx, c, P.cream, Math.round(L.W * 0.006));
    },
    footer(ctx, L, f) {
      const inner = f.h - L.pad * 0.6;
      const span = Math.min(f.w * 0.6, inner * 1.1);
      spray(ctx, f.w / 2, f.y + inner * 0.24, span, {
        kind: 'olive', color: P.green, fill: 'rgba(62,85,65,0.16)', width: Math.max(1.5, span * 0.005), leaves: 7,
      });
      stack(ctx, L, f, {
        family: SERIF, style: 'italic 500', size: titleSize(L, f, 0.28), lh: 1, gap: 0.42, shift: 0.1,
        drawTitle(line, x, y) {
          ctx.textAlign = 'center';
          ctx.fillStyle = P.greenDeep;
          ctx.fillText(line, x, y);
        },
        subSize: subSizeFor(L, f) * 0.85,
        drawSub(text, x, y, size) {
          capsLine(ctx, text, x, y, size, f.w * 0.8, { weight: 300, family: SANS, color: P.green, track: 0.38 });
        },
      });
    },
  },
};

export function isDark(themeId) {
  return !!THEMES[themeId].dark;
}

// photos: canvases already filtered and sized to the cell. Missing ones draw
// as soft placeholders (used for the layout and style previews).
export function compose(layoutId, themeId, photos, out = document.createElement('canvas'), scale = 1) {
  const L = LAYOUTS[layoutId];
  const g = cells(layoutId);
  const T = THEMES[themeId];
  S = scale;
  out.width = Math.round(L.W * scale);
  out.height = Math.round(L.H * scale);
  const ctx = out.getContext('2d');
  ctx.save();
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  T.before(ctx, L, g);
  g.cells.forEach((c, i) => {
    ctx.save();
    T.clip?.(ctx, L, c);
    const p = photos[i];
    if (p) ctx.drawImage(p, c.x, c.y, c.w, c.h);
    else {
      ctx.fillStyle = T.dark ? 'rgba(255,255,255,0.14)' : 'rgba(20,20,20,0.12)';
      ctx.fillRect(c.x, c.y, c.w, c.h);
    }
    ctx.restore();
  });
  T.after?.(ctx, L, g);
  T.footer(ctx, L, g.footer);
  ctx.restore();
  S = 1;
  return out;
}

export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`italic 500 40px ${SERIF}`),
      document.fonts.load(`300 40px ${SANS}`),
      document.fonts.load(`500 40px ${GROTESK}`),
      document.fonts.load(`800 40px ${GROTESK}`),
      document.fonts.load(`400 40px ${RETRO}`),
      document.fonts.load(`400 40px ${SCRIPT}`),
      document.fonts.load(`400 40px ${COMIC}`),
    ]);
  } catch {}
}
