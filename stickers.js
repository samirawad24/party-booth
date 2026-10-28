// Props people drag onto their print. Each one is drawn with canvas paths so
// it stays sharp at print size. draw(ctx, w, h) fills a w x h box.

const COMIC = 'Bangers, Impact, sans-serif';
const INK = '#141414';

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function heartPath(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.42);
  ctx.bezierCurveTo(cx - s * 0.62, cy, cx - s * 0.5, cy - s * 0.5, cx, cy - s * 0.2);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.5, cx + s * 0.62, cy, cx, cy + s * 0.42);
  ctx.closePath();
}

function starPath(ctx, cx, cy, R, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 ? r : R;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

function bubble(text, fill, color) {
  return {
    aspect: 1.5,
    draw(ctx, w, h) {
      const lw = w * 0.035;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.43, w / 2 - lw, h * 0.38, 0, 0, Math.PI * 2);
      ctx.moveTo(w * 0.3, h * 0.72);
      ctx.lineTo(w * 0.2, h * 0.97);
      ctx.lineTo(w * 0.47, h * 0.78);
      ctx.fillStyle = fill;
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.fill();
      // Cover the seam between the tail and the oval
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.43, w / 2 - lw * 1.6, h * 0.38 - lw * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      let size = h * 0.36;
      ctx.font = `400 ${size}px ${COMIC}`;
      while (ctx.measureText(text).width > w * 0.72 && size > 4) {
        size -= 1;
        ctx.font = `400 ${size}px ${COMIC}`;
      }
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h * 0.45);
    },
  };
}

export const STICKERS = {
  shades: {
    aspect: 3,
    draw(ctx, w, h) {
      ctx.fillStyle = INK;
      ctx.fillRect(w * 0.02, h * 0.08, w * 0.96, h * 0.14);
      for (const x of [0.05, 0.53]) {
        ctx.beginPath();
        ctx.moveTo(w * x, h * 0.12);
        ctx.lineTo(w * (x + 0.42), h * 0.12);
        ctx.quadraticCurveTo(w * (x + 0.41), h * 0.92, w * (x + 0.22), h * 0.92);
        ctx.quadraticCurveTo(w * (x + 0.01), h * 0.92, w * x, h * 0.12);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = h * 0.07;
      ctx.lineCap = 'round';
      for (const x of [0.12, 0.6]) {
        ctx.beginPath();
        ctx.moveTo(w * x, h * 0.32);
        ctx.lineTo(w * (x + 0.08), h * 0.32);
        ctx.stroke();
      }
    },
  },
  hearts: {
    aspect: 2.6,
    draw(ctx, w, h) {
      ctx.strokeStyle = '#B5135B';
      ctx.lineWidth = h * 0.08;
      ctx.beginPath();
      ctx.moveTo(w * 0.42, h * 0.38);
      ctx.quadraticCurveTo(w * 0.5, h * 0.24, w * 0.58, h * 0.38);
      ctx.stroke();
      for (const cx of [0.24, 0.76]) {
        heartPath(ctx, w * cx, h * 0.52, h * 1.0);
        ctx.fillStyle = '#FF3E8A';
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (const cx of [0.17, 0.69]) {
        ctx.beginPath();
        ctx.ellipse(w * cx, h * 0.42, h * 0.07, h * 0.12, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  hat: {
    aspect: 0.75,
    draw(ctx, w, h) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.12);
      ctx.lineTo(w * 0.94, h * 0.94);
      ctx.quadraticCurveTo(w * 0.5, h * 1.02, w * 0.06, h * 0.94);
      ctx.closePath();
      ctx.fillStyle = '#7B61FF';
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#FFC93C';
      for (let i = -2; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, h * (0.1 + i * 0.16));
        ctx.lineTo(w, h * (0.3 + i * 0.16));
        ctx.lineTo(w, h * (0.37 + i * 0.16));
        ctx.lineTo(0, h * (0.17 + i * 0.16));
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#FF4F8B';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.11, w * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF4E4';
      round(ctx, w * 0.03, h * 0.88, w * 0.94, h * 0.1, h * 0.05);
      ctx.fill();
    },
  },
  crown: {
    aspect: 1.5,
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.92);
      ctx.lineTo(w * 0.02, h * 0.2);
      ctx.lineTo(w * 0.28, h * 0.52);
      ctx.lineTo(w * 0.5, h * 0.06);
      ctx.lineTo(w * 0.72, h * 0.52);
      ctx.lineTo(w * 0.98, h * 0.2);
      ctx.lineTo(w * 0.94, h * 0.92);
      ctx.closePath();
      ctx.fillStyle = '#F5B82E';
      ctx.fill();
      ctx.strokeStyle = '#B37A12';
      ctx.lineWidth = h * 0.04;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = '#B37A12';
      ctx.fillRect(w * 0.06, h * 0.74, w * 0.88, h * 0.05);
      const gems = [['#E8322B', 0.5], ['#2EA0E8', 0.26], ['#2EC46E', 0.74]];
      for (const [c, x] of gems) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(w * x, h * 0.62, h * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const x of [0.02, 0.5, 0.98]) {
        ctx.fillStyle = '#FFF4E4';
        ctx.beginPath();
        ctx.arc(w * x, h * (x === 0.5 ? 0.07 : 0.2), h * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  stache: {
    aspect: 3.2,
    draw(ctx, w, h) {
      ctx.fillStyle = '#2A1A10';
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(w / 2, h * 0.3);
        ctx.scale(side, 1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(w * 0.12, -h * 0.2, w * 0.3, h * 0.05, w * 0.36, h * 0.3);
        ctx.bezierCurveTo(w * 0.4, h * 0.45, w * 0.47, h * 0.4, w * 0.48, h * 0.1);
        ctx.bezierCurveTo(w * 0.52, h * 0.6, w * 0.4, h * 0.85, w * 0.28, h * 0.6);
        ctx.bezierCurveTo(w * 0.2, h * 0.45, w * 0.1, h * 0.55, 0, h * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
  },
  lips: {
    aspect: 1.9,
    draw(ctx, w, h) {
      ctx.fillStyle = '#E3173E';
      ctx.beginPath();
      ctx.moveTo(w * 0.03, h * 0.5);
      ctx.bezierCurveTo(w * 0.2, h * 0.1, w * 0.38, h * 0.02, w * 0.5, h * 0.25);
      ctx.bezierCurveTo(w * 0.62, h * 0.02, w * 0.8, h * 0.1, w * 0.97, h * 0.5);
      ctx.bezierCurveTo(w * 0.8, h * 1.0, w * 0.2, h * 1.0, w * 0.03, h * 0.5);
      ctx.fill();
      ctx.strokeStyle = '#8E0B26';
      ctx.lineWidth = h * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.5);
      ctx.quadraticCurveTo(w * 0.5, h * 0.66, w * 0.92, h * 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(w * 0.62, h * 0.75, w * 0.1, h * 0.05, -0.1, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  bow: {
    aspect: 2,
    draw(ctx, w, h) {
      ctx.fillStyle = '#E8322B';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(w / 2, h / 2);
        ctx.lineTo(w / 2 + side * w * 0.47, h * 0.08);
        ctx.quadraticCurveTo(w / 2 + side * w * 0.52, h / 2, w / 2 + side * w * 0.47, h * 0.92);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#FFF4E4';
      for (const [x, y] of [[0.2, 0.35], [0.3, 0.62], [0.13, 0.62], [0.8, 0.35], [0.7, 0.62], [0.87, 0.62], [0.36, 0.42], [0.64, 0.42]]) {
        ctx.beginPath();
        ctx.arc(w * x, h * y, h * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#A8231C';
      round(ctx, w * 0.42, h * 0.3, w * 0.16, h * 0.4, h * 0.08);
      ctx.fill();
    },
  },
  ears: {
    aspect: 2.4,
    draw(ctx, w, h) {
      for (const side of [-1, 1]) {
        const cx = w / 2 + side * w * 0.33;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.15, h);
        ctx.lineTo(cx + side * w * 0.03, h * 0.04);
        ctx.lineTo(cx + w * 0.15, h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FF8DB5';
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.08, h * 0.92);
        ctx.lineTo(cx + side * w * 0.02, h * 0.3);
        ctx.lineTo(cx + w * 0.08, h * 0.92);
        ctx.closePath();
        ctx.fill();
      }
    },
  },
  heart: {
    aspect: 1.1,
    draw(ctx, w, h) {
      heartPath(ctx, w / 2, h * 0.56, w * 0.98);
      ctx.fillStyle = '#FF2E63';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(w * 0.3, h * 0.38, w * 0.07, h * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  star: {
    aspect: 1,
    draw(ctx, w, h) {
      starPath(ctx, w / 2, h * 0.53, w * 0.48, w * 0.21);
      ctx.fillStyle = '#FFC93C';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = w * 0.035;
      ctx.lineJoin = 'round';
      ctx.stroke();
    },
  },
  bolt: {
    aspect: 0.6,
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(w * 0.62, 0);
      ctx.lineTo(w * 0.04, h * 0.58);
      ctx.lineTo(w * 0.46, h * 0.58);
      ctx.lineTo(w * 0.3, h);
      ctx.lineTo(w * 0.96, h * 0.38);
      ctx.lineTo(w * 0.54, h * 0.38);
      ctx.closePath();
      ctx.fillStyle = '#FFE14D';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = w * 0.05;
      ctx.lineJoin = 'round';
      ctx.stroke();
    },
  },
  omg: bubble('OMG!', '#FFFFFF', '#E8322B'),
  lol: bubble('LOL', '#FFE14D', INK),
  besties: bubble('BESTIES', '#FF8DB5', INK),
  cheers: bubble('CHEERS!', '#7FE0D6', INK),
};

export const STICKER_ORDER = ['shades', 'hearts', 'hat', 'crown', 'stache', 'lips', 'bow', 'ears', 'heart', 'star', 'bolt', 'omg', 'lol', 'besties', 'cheers'];

// Draws placed stickers onto a print. Positions are fractions of the print:
// x, y = center, s = width as a share of the print width, r = rotation.
export function drawStickers(ctx, W, H, list) {
  for (const it of list) {
    const def = STICKERS[it.kind];
    const w = it.s * W;
    const h = w / def.aspect;
    ctx.save();
    ctx.translate(it.x * W, it.y * H);
    ctx.rotate(it.r);
    ctx.translate(-w / 2, -h / 2);
    def.draw(ctx, w, h);
    ctx.restore();
  }
}

// A sticker drawn by itself on a canvas, for the tray and the drag layer.
export function stickerCanvas(kind, width, c = document.createElement('canvas')) {
  const def = STICKERS[kind];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(width * dpr), h = Math.round((width / def.aspect) * dpr);
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  def.draw(ctx, w, h);
  return c;
}
