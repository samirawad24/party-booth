// The layer over the print on the review screen where stickers are placed.
// Drag a sticker to move it, pinch it or pull its corner handle to resize
// and turn it, tap the x to remove it. Positions are stored as fractions of
// the print so they bake onto the full-size print in the same spot.

import { STICKERS, stickerCanvas } from './stickers.js';

export function createStickerLayer(layer) {
  let items = [];
  let selected = null;
  let next = 0;

  const size = () => ({ W: layer.clientWidth || 1, H: layer.clientHeight || 1 });

  function render(it) {
    const { W, H } = size();
    it.el.style.left = `${it.x * W}px`;
    it.el.style.top = `${it.y * H}px`;
    it.el.style.width = `${it.s * W}px`;
    it.el.style.height = `${(it.s * W) / STICKERS[it.kind].aspect}px`;
    it.el.style.transform = `translate(-50%, -50%) rotate(${it.r}rad)`;
  }

  function select(it) {
    selected = it;
    for (const x of items) x.el.classList.toggle('on', x === it);
  }

  function remove(it) {
    items = items.filter((x) => x !== it);
    it.el.remove();
    if (selected === it) selected = null;
  }

  function add(kind, s) {
    const el = document.createElement('div');
    el.className = 'sticker';
    const c = stickerCanvas(kind, 240);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sticker-del';
    del.setAttribute('aria-label', 'Remove sticker');
    del.textContent = '×';
    const handle = document.createElement('span');
    handle.className = 'sticker-handle';
    el.append(c, del, handle);
    // New stickers land near the top middle, nudged so they do not stack.
    const k = next++ % 5;
    const it = { kind, x: 0.5 + (k - 2) * 0.06, y: 0.28 + k * 0.04, s, r: 0, el };
    items.push(it);
    layer.append(el);
    render(it);
    select(it);
    wire(it, del, handle);
  }

  function wire(it, del, handle) {
    const pts = new Map();
    let start = null;

    del.addEventListener('pointerdown', (e) => e.stopPropagation());
    del.addEventListener('click', (e) => { e.stopPropagation(); remove(it); });

    function snapshot() {
      const p = [...pts.values()];
      start = { x: it.x, y: it.y, s: it.s, r: it.r, p: p.map((q) => ({ ...q })) };
      if (p.length === 2) {
        start.d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) || 1;
        start.a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
      }
    }

    it.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      select(it);
      layer.append(it.el);
      it.el.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      snapshot();
    });
    it.el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const { W, H } = size();
      const p = [...pts.values()];
      if (p.length === 1 && start.p.length === 1) {
        it.x = clamp(start.x + (p[0].x - start.p[0].x) / W, 0, 1);
        it.y = clamp(start.y + (p[0].y - start.p[0].y) / H, 0, 1);
      } else if (p.length === 2 && start.d) {
        const d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
        const a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
        it.s = clamp(start.s * (d / start.d), 0.04, 1.2);
        it.r = start.r + (a - start.a);
      }
      render(it);
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      snapshot();
    };
    it.el.addEventListener('pointerup', end);
    it.el.addEventListener('pointercancel', end);

    // Corner handle: distance from the center sets the size, the angle turns it.
    let h0 = null;
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      handle.setPointerCapture?.(e.pointerId);
      const box = layer.getBoundingClientRect();
      const { W, H } = size();
      const cx = box.left + it.x * W, cy = box.top + it.y * H;
      h0 = { cx, cy, d: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, a: Math.atan2(e.clientY - cy, e.clientX - cx), s: it.s, r: it.r };
    });
    handle.addEventListener('pointermove', (e) => {
      if (!h0) return;
      const d = Math.hypot(e.clientX - h0.cx, e.clientY - h0.cy);
      const a = Math.atan2(e.clientY - h0.cy, e.clientX - h0.cx);
      it.s = clamp(h0.s * (d / h0.d), 0.04, 1.2);
      it.r = h0.r + (a - h0.a);
      render(it);
    });
    const hEnd = () => { h0 = null; };
    handle.addEventListener('pointerup', hEnd);
    handle.addEventListener('pointercancel', hEnd);
  }

  layer.addEventListener('pointerdown', () => select(null));

  return {
    add,
    // Lines the layer up exactly over the print image or animation.
    // Layout offsets, not screen boxes, so the print's entrance animation
    // does not shift the layer. The wrap is the offset parent.
    place(target) {
      layer.style.left = `${target.offsetLeft}px`;
      layer.style.top = `${target.offsetTop}px`;
      layer.style.width = `${target.offsetWidth}px`;
      layer.style.height = `${target.offsetHeight}px`;
      items.forEach(render);
    },
    clear() {
      items.forEach((it) => it.el.remove());
      items = [];
      selected = null;
      next = 0;
    },
    deselect() { select(null); },
    list: () => items.map(({ kind, x, y, s, r }) => ({ kind, x, y, s, r })),
    get count() { return items.length; },
  };
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
