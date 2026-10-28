import { LAYOUTS, LAYOUT_ORDER, THEME_ORDER, THEME_NAMES, FILTERS, FILTER_ORDER, PROMPTS,
  COUNTDOWN, MAX_TITLE, MAX_SUB, DEFAULTS, BURST_FRAMES, BURST_MS, BOOM_FRAME_MS, GIF_SCALE, FLIP_MS, API_URL } from './config.js';
import { createRenderer, cropFor } from './filters.js';
import { cells, compose, fontsReady } from './compose.js';
import { settings, update, shareLink, titleText, subText } from './settings.js';
import { STICKER_ORDER, drawStickers, stickerCanvas } from './stickers.js';
import { createStickerLayer } from './sticker-layer.js';
import { makeGif } from './gif.js';
import * as sound from './sound.js';

const VERSION = 'v2';
// Prints match the mirrored preview, which is what people expect to see.
const MIRROR = true;
// Boomerang preview size on the review screen, as a share of print size.
const ANIM_SCALE = 0.5;

const $ = (id) => document.getElementById(id);
const screens = ['welcome', 'custom', 'layout', 'camera', 'review', 'share'];
const video = $('video');
const view = $('view');
const frame = $('frame');

const preview = createRenderer(view);
const output = createRenderer(document.createElement('canvas'));
const thumbs = createRenderer(document.createElement('canvas'));
const stickers = createStickerLayer($('sticker-layer'));

const state = {
  screen: 'welcome',
  layout: 'strip',
  filter: 'natural',
  theme: settings.theme,
  shots: [],
  shooting: false,
  // Bumped to cancel a running photo session (Back button, app hidden).
  session: 0,
  rendered: {},
  printBlob: null,
  printUrl: null,
  // Boomerang preview frames for the current style and filter.
  animFrames: [],
  // Share screen: the finished photo, an optional GIF, and which one shows.
  out: { print: null, gif: null, showing: 'print' },
  // Where the Customize screen goes back to.
  customFrom: 'welcome',
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const moving = () => !!LAYOUTS[state.layout].moving;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Screens

function show(name) {
  for (const s of screens) $(s).hidden = s !== name;
  state.screen = name;
  if (name === 'camera') startPreview();
  else stopPreview();
  if (name !== 'review') stopAnim();
}

// Keep the screen on while the booth runs.

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}

// Camera

let stream = null;

function cameraLive() {
  const t = stream?.getVideoTracks()[0];
  return !!t && t.readyState === 'live';
}

async function startCamera() {
  if (cameraLive() && video.videoWidth) return;
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } },
  });
  video.srcObject = stream;
  await video.play().catch(() => {});
  const until = Date.now() + 5000;
  while ((!video.videoWidth || video.readyState < 2) && Date.now() < until) await wait(50);
  if (!video.videoWidth) throw new Error('No camera frames');
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

function cameraMessage(err) {
  if (!window.isSecureContext) return 'The camera only works over https. Open the booth from its web address.';
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser cannot open the camera. Try Safari on iPhone or Chrome on Android.';
  if (err?.name === 'NotAllowedError') return 'Camera access is turned off. Allow the camera for this site in your browser settings, then reload.';
  if (err?.name === 'NotReadableError') return 'Another app is using the camera. Close it and tap again.';
  return 'The camera did not start. Tap again, or reload the page.';
}

// Live viewfinder

let raf = 0;
let lastThumbs = 0;
const thumbSource = canvas(1, 1);

function sizeView() {
  const L = LAYOUTS[state.layout];
  const stage = $('stage');
  const hint = $('hint');
  const maxW = stage.clientWidth;
  const maxH = stage.clientHeight - hint.offsetHeight - 14;
  let w = maxW, h = maxW / L.aspect;
  if (h > maxH) { h = maxH; w = h * L.aspect; }
  w = Math.floor(w);
  h = Math.floor(h);
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.dataset.w = Math.round(w * dpr);
  view.dataset.h = Math.round(h * dpr);
}

function drawPreview(t) {
  raf = requestAnimationFrame(drawPreview);
  if (video.readyState < 2 || !video.videoWidth) return;
  const L = LAYOUTS[state.layout];
  const vw = video.videoWidth, vh = video.videoHeight;
  try {
    preview.draw(video, vw, vh, {
      w: +view.dataset.w, h: +view.dataset.h,
      filter: FILTERS[state.filter],
      crop: cropFor(vw, vh, L.aspect),
      mirror: true,
      seed: (t * 0.06) % 997,
    });
  } catch {}
  if (!state.shooting && t - lastThumbs > 900) {
    lastThumbs = t;
    drawFilterThumbs($('filters'), video, vw, vh, cropFor(vw, vh, L.aspect), true);
  }
}

function startPreview() {
  cancelAnimationFrame(raf);
  sizeView();
  lastThumbs = 0;
  raf = requestAnimationFrame(drawPreview);
}

function stopPreview() {
  cancelAnimationFrame(raf);
  raf = 0;
}

window.addEventListener('resize', () => {
  if (state.screen === 'camera') sizeView();
  if (state.screen === 'review') fitPrint();
});

// Filter pickers. Both pickers share this: each button shows the current
// picture through its own filter.

function buildFilterButtons(container, onPick) {
  container.innerHTML = '';
  for (const id of FILTER_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', id === state.filter);
    const c = document.createElement('canvas');
    const s = document.createElement('span');
    s.textContent = FILTERS[id].name;
    b.append(c, s);
    b.addEventListener('click', () => { sound.tap(); onPick(id); });
    container.append(b);
  }
}

function markFilter(container) {
  for (const b of container.children) b.setAttribute('aria-pressed', b.dataset.id === state.filter);
}

function drawFilterThumbs(container, source, sw, sh, crop, mirror) {
  const aspect = LAYOUTS[state.layout].aspect;
  const tw = 220;
  const th = Math.round(tw / aspect);
  // Shrink once, then filter the small copy eight times.
  thumbSource.width = tw;
  thumbSource.height = th;
  const tctx = thumbSource.getContext('2d');
  tctx.drawImage(source, crop[0] * sw, crop[1] * sh, crop[2] * sw, crop[3] * sh, 0, 0, tw, th);
  for (const b of container.children) {
    const c = b.querySelector('canvas');
    if (c.width !== tw) { c.width = tw; c.height = th; }
    try {
      thumbs.draw(thumbSource, tw, th, { w: tw, h: th, filter: FILTERS[b.dataset.id], mirror, seed: 3 });
      c.getContext('2d').drawImage(thumbs.canvas, 0, 0);
    } catch {}
  }
}

// Shooting

function grab() {
  const { cw, ch } = cells(state.layout);
  const vw = video.videoWidth, vh = video.videoHeight;
  const [cx, cy, cwr, chr] = cropFor(vw, vh, LAYOUTS[state.layout].aspect);
  const c = canvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, cx * vw, cy * vh, cwr * vw, chr * vh, 0, 0, cw, ch);
  return c;
}

function buildTray(n) {
  const tray = $('tray');
  tray.innerHTML = '';
  tray.classList.toggle('strip', state.layout === 'strip');
  const aspect = LAYOUTS[state.layout].aspect;
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'slot';
    d.style.aspectRatio = `${aspect}`;
    tray.append(d);
  }
}

function fillSlot(i, raw) {
  const slots = $('tray').children;
  [...slots].forEach((s, j) => s.classList.toggle('next', j === i + 1));
  const slot = slots[i];
  if (!slot) return;
  const c = canvas(raw.width, raw.height);
  output.draw(raw, raw.width, raw.height, { w: raw.width, h: raw.height, filter: FILTERS[state.filter], mirror: MIRROR, seed: 7 });
  c.getContext('2d').drawImage(output.canvas, 0, 0);
  slot.innerHTML = '';
  slot.append(c);
}

// kind: '' for countdown numbers, 'word' for short cues, 'prompt' for pose ideas.
function setCount(text, kind = '') {
  const el = $('count');
  el.classList.remove('tick', 'word', 'prompt');
  void el.offsetWidth;
  el.textContent = '';
  if (kind === 'prompt') el.append(Object.assign(document.createElement('span'), { textContent: text }));
  else el.textContent = text;
  if (text && kind !== 'prompt') el.classList.add('tick');
  if (kind) el.classList.add(kind);
}

async function countdown(alive) {
  for (let k = COUNTDOWN; k > 0; k--) {
    if (!alive()) return;
    setCount(String(k));
    sound.beep();
    await wait(1000);
  }
  setCount('');
}

async function capture() {
  const flash = $('flash');
  flash.classList.add('on');
  // Give the white screen a moment to light faces before taking the frame.
  await wait(230);
  const raw = grab();
  sound.shutter();
  navigator.vibrate?.(20);
  await wait(60);
  flash.classList.remove('on');
  return raw;
}

// Boomerang: a quick burst of frames while everyone moves.
async function burst(alive) {
  const frames = [];
  setCount('Move!', 'word');
  $('frame').classList.add('rec');
  sound.shutter();
  for (let i = 0; i < BURST_FRAMES; i++) {
    if (!alive()) break;
    const t = performance.now();
    frames.push(grab());
    await wait(Math.max(0, BURST_MS - (performance.now() - t)));
  }
  $('frame').classList.remove('rec');
  setCount('');
  return frames;
}

function setShootingUI(on) {
  state.shooting = on;
  $('filters').hidden = on;
  $('filters-label').textContent = on ? 'Your photos' : 'Choose a filter';
  $('tray').hidden = !on;
  $('start').disabled = on;
  $('start').style.visibility = on ? 'hidden' : '';
}

async function shootSession() {
  if (state.shooting) return;
  try {
    await startCamera();
  } catch (err) {
    showWelcomeError(err);
    return;
  }
  const n = cells(state.layout).cells.length;
  const token = ++state.session;
  const alive = () => token === state.session && state.screen === 'camera';
  const ideas = settings.prompts ? shuffle(PROMPTS).slice(0, n) : null;
  state.shots = [];
  state.rendered = {};
  stickers.clear();
  buildTray(n);
  $('tray').children[0]?.classList.add('next');
  setShootingUI(true);

  for (let i = 0; i < n; i++) {
    $('progress').textContent = moving() ? 'Boomerang' : `Photo ${i + 1} of ${n}`;
    if (ideas) {
      setCount(ideas[i], 'prompt');
      sound.tap();
      await wait(2200);
    } else if (i === 0) {
      setCount(moving() ? 'Get moving' : 'Get ready', 'word');
      await wait(1300);
    }
    if (!alive()) return;
    await countdown(alive);
    if (!alive()) return;
    if (moving()) {
      const frames = await burst(alive);
      if (!alive()) return;
      // One seed for every frame keeps film grain still between frames.
      state.shots = frames.map((raw) => ({ raw, seed: 11 }));
      fillSlot(0, frames[0]);
      break;
    }
    const raw = await capture();
    if (!alive()) return;
    state.shots.push({ raw, seed: Math.random() * 500 });
    fillSlot(i, raw);
    if (i < n - 1) {
      if (ideas) await wait(700);
      else {
        setCount(n - i - 1 === 1 ? 'Last one' : 'Next pose', 'word');
        await wait(1500);
      }
    }
  }

  if (!alive()) return;
  setCount('');
  setShootingUI(false);
  $('progress').textContent = '';
  if (!state.shots.length || (!moving() && state.shots.length < n)) {
    state.shots = [];
    return;
  }
  await openReview();
}

$('start').addEventListener('click', () => {
  sound.unlock();
  sound.tap();
  shootSession();
});

$('cam-back').addEventListener('click', () => {
  sound.tap();
  state.session++;
  setCount('');
  setShootingUI(false);
  openLayouts();
});

// Review

function renderCells(filterId) {
  if (state.rendered[filterId]) return state.rendered[filterId];
  const out = state.shots.map(({ raw, seed }) => {
    const c = canvas(raw.width, raw.height);
    output.draw(raw, raw.width, raw.height, { w: raw.width, h: raw.height, filter: FILTERS[filterId], mirror: MIRROR, seed });
    c.getContext('2d').drawImage(output.canvas, 0, 0);
    return c;
  });
  state.rendered[filterId] = out;
  return out;
}

const toBlob = (c, q = 0.92) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));

// Boomerang frames played forward then back, without repeating the ends.
function pingPong(list) {
  return list.length < 3 ? list : [...list, ...list.slice(1, -1).reverse()];
}

let animRaf = 0;
function stopAnim() {
  cancelAnimationFrame(animRaf);
  animRaf = 0;
}

function playAnim() {
  stopAnim();
  const c = $('anim');
  const seq = pingPong(state.animFrames);
  if (!seq.length) return;
  c.width = seq[0].width;
  c.height = seq[0].height;
  const ctx = c.getContext('2d');
  let last = -1;
  const step = (t) => {
    animRaf = requestAnimationFrame(step);
    const i = Math.floor(t / BOOM_FRAME_MS) % seq.length;
    if (i === last) return;
    last = i;
    ctx.drawImage(seq[i], 0, 0);
  };
  animRaf = requestAnimationFrame(step);
}

let renderToken = 0;
async function renderPrint() {
  const token = ++renderToken;
  const cellsDone = renderCells(state.filter);
  if (moving()) {
    state.animFrames = cellsDone.map((f) => compose(state.layout, state.theme, [f], undefined, ANIM_SCALE));
    playAnim();
    fitPrint();
    return;
  }
  const print = compose(state.layout, state.theme, cellsDone);
  const blob = await toBlob(print);
  if (token !== renderToken || !blob) return;
  state.printBlob = blob;
  if (state.printUrl) URL.revokeObjectURL(state.printUrl);
  state.printUrl = URL.createObjectURL(blob);
  $('print').src = state.printUrl;
  fitPrint();
}

function printTarget() {
  return moving() ? $('anim') : $('print');
}

function fitPrint() {
  const wrap = $('print-wrap');
  const L = LAYOUTS[state.layout];
  const el = printTarget();
  const maxW = wrap.clientWidth, maxH = wrap.clientHeight;
  let h = maxH, w = h * (L.W / L.H);
  if (w > maxW) { w = maxW; h = w * (L.H / L.W); }
  el.style.width = `${Math.floor(w)}px`;
  el.style.height = `${Math.floor(h)}px`;
  stickers.place(el);
}

// Style pickers: the review screen and the Customize screen both use this.
function buildThemes(box, current, onPick) {
  box.innerHTML = '';
  for (const id of THEME_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', id === current);
    const c = document.createElement('canvas');
    const s = document.createElement('span');
    s.textContent = THEME_NAMES[id];
    b.append(c, s);
    b.addEventListener('click', () => {
      sound.tap();
      for (const x of box.children) x.setAttribute('aria-pressed', x.dataset.id === id);
      onPick(id);
    });
    box.append(b);
  }
}

function drawThemeThumbs(box, layout, photos) {
  const scale = 300 / LAYOUTS[layout].H;
  for (const b of box.children) compose(layout, b.dataset.id, photos, b.querySelector('canvas'), scale);
}

function drawReviewFilterThumbs() {
  const raw = state.shots[0]?.raw;
  if (!raw) return;
  drawFilterThumbs($('review-filters'), raw, raw.width, raw.height, [0, 0, 1, 1], MIRROR);
}

function pickReviewTheme(id) {
  if (state.theme === id) return;
  state.theme = id;
  renderPrint();
}

function showTab(name) {
  for (const b of $('tabs').children) b.setAttribute('aria-selected', b.dataset.tab === name);
  for (const body of document.querySelectorAll('.tab-body')) body.hidden = body.dataset.tab !== name;
  if (name !== 'stickers') stickers.deselect();
}

for (const b of $('tabs').children) {
  b.addEventListener('click', () => { sound.tap(); showTab(b.dataset.tab); });
}

function buildStickerTray() {
  const tray = $('sticker-tray');
  tray.innerHTML = '';
  for (const kind of STICKER_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sticker-pick';
    b.setAttribute('aria-label', `Add ${kind} sticker`);
    b.append(stickerCanvas(kind, 56));
    b.addEventListener('click', () => {
      sound.tap();
      // A good starting size: about 40% of one photo's width.
      const L = LAYOUTS[state.layout];
      stickers.add(kind, (0.4 * cells(state.layout).cw) / L.W);
    });
    tray.append(b);
  }
}

async function openReview() {
  const isMoving = moving();
  $('print').hidden = isMoving;
  $('anim').hidden = !isMoving;
  buildThemes($('themes'), state.theme, pickReviewTheme);
  buildFilterButtons($('review-filters'), (id) => {
    state.filter = id;
    markFilter($('review-filters'));
    drawThemeThumbs($('themes'), state.layout, renderCells(state.filter));
    renderPrint();
  });
  showTab('style');
  show('review');
  drawReviewFilterThumbs();
  drawThemeThumbs($('themes'), state.layout, renderCells(state.filter));
  await renderPrint();
}

// Back from Customize to an open review: redraw with the new words.
function refreshReview() {
  for (const b of $('themes').children) b.setAttribute('aria-pressed', b.dataset.id === state.theme);
  drawThemeThumbs($('themes'), state.layout, renderCells(state.filter));
  renderPrint();
}

$('retake').addEventListener('click', () => {
  sound.tap();
  state.shots = [];
  state.rendered = {};
  stickers.clear();
  openCamera();
});

$('edit-words').addEventListener('click', () => { sound.tap(); openCustom('review'); });

// Finished pieces

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-photo-booth-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// The full-size photo with stickers baked in.
async function bakePrint(frameIndex = 0) {
  const L = LAYOUTS[state.layout];
  const cellsDone = renderCells(state.filter);
  const photos = moving() ? [cellsDone[frameIndex]] : cellsDone;
  const c = compose(state.layout, state.theme, photos);
  drawStickers(c.getContext('2d'), L.W, L.H, stickers.list());
  return toBlob(c);
}

async function boomGif(onProgress) {
  const list = stickers.list();
  const frames = renderCells(state.filter).map((f) => {
    const c = compose(state.layout, state.theme, [f], undefined, GIF_SCALE);
    drawStickers(c.getContext('2d'), c.width, c.height, list);
    return c;
  });
  return makeGif(pingPong(frames), BOOM_FRAME_MS, onProgress);
}

// Photo GIF of a still layout: each photo in turn, in the boomerang frame.
async function flipGif(onProgress) {
  const g = cells('boom');
  const aspect = g.cw / g.ch;
  const frames = renderCells(state.filter).map((f) => {
    // Crop each photo to the frame's shape before laying it in.
    const [cx, cy, cw, ch] = cropFor(f.width, f.height, aspect);
    const cell = canvas(g.cw, g.ch);
    cell.getContext('2d').drawImage(f, cx * f.width, cy * f.height, cw * f.width, ch * f.height, 0, 0, g.cw, g.ch);
    return compose('boom', state.theme, [cell], undefined, GIF_SCALE);
  });
  return makeGif(frames, FLIP_MS, onProgress);
}

function busy(btn, text) {
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  return (label = was) => {
    btn.disabled = false;
    btn.textContent = label;
  };
}

$('done').addEventListener('click', async () => {
  sound.tap();
  stickers.deselect();
  const done = busy($('done'), moving() ? 'Making GIF' : 'Saving');
  try {
    const print = new File([await bakePrint()], `${stamp()}.jpg`, { type: 'image/jpeg' });
    let gif = null;
    if (moving()) {
      const blob = await boomGif((p) => { $('done').textContent = `Making GIF ${Math.round(p * 100)}%`; });
      gif = new File([blob], `${stamp()}.gif`, { type: 'image/gif' });
    }
    sound.chime();
    openShare(print, gif);
  } finally {
    done();
  }
});

// Share screen

let urls = [];
let upload = null;

function setOutput(print, gif) {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  const url = (f) => {
    if (!f) return null;
    const u = URL.createObjectURL(f);
    urls.push(u);
    return u;
  };
  state.out = { print: { file: print, url: url(print) }, gif: gif ? { file: gif, url: url(gif) } : null, showing: gif ? 'gif' : 'print' };
  // A new photo or GIF needs a new QR link.
  upload = null;
}

function current() {
  return state.out[state.out.showing] || state.out.print;
}

function renderShare() {
  const cur = current();
  $('share-img').src = cur.url;
  const dl = $('download-print');
  dl.href = cur.url;
  dl.download = cur.file.name;
  const both = !!state.out.gif && !moving();
  $('switch').hidden = !both;
  for (const b of $('switch').children) b.setAttribute('aria-pressed', b.dataset.show === state.out.showing);
  $('make-gif').hidden = moving() || !!state.out.gif;
  $('show-qr').hidden = !API_URL;
  $('share-sub').textContent = state.out.showing === 'gif'
    ? 'Save the GIF to your photos or send it to the group chat.'
    : 'Save it to your photos or send it to the group chat.';
}

function openShare(print, gif) {
  setOutput(print, gif);
  $('share-note').textContent = '';
  renderShare();
  show('share');
}

for (const b of $('switch').children) {
  b.addEventListener('click', () => {
    sound.tap();
    state.out.showing = b.dataset.show;
    renderShare();
  });
}

function canShareFile(file) {
  try { return !!navigator.canShare?.({ files: [file] }); } catch { return false; }
}

$('save-print').addEventListener('click', async () => {
  sound.tap();
  const note = $('share-note');
  const { file } = current();
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file] });
      note.textContent = 'Saved. Take another one?';
    } catch (err) {
      if (err?.name !== 'AbortError') note.textContent = 'Sharing did not open. Press and hold the picture to save it.';
    }
    return;
  }
  $('download-print').click();
  note.textContent = 'Downloading.';
});

$('make-gif').addEventListener('click', async () => {
  sound.tap();
  const done = busy($('make-gif'), 'Making GIF');
  try {
    const blob = await flipGif((p) => { $('make-gif').textContent = `Making ${Math.round(p * 100)}%`; });
    const print = state.out.print.file;
    setOutput(print, new File([blob], print.name.replace(/\.jpg$/, '.gif'), { type: 'image/gif' }));
    sound.chime();
    renderShare();
  } catch {
    $('share-note').textContent = 'The GIF did not work on this device.';
  } finally {
    done();
  }
});

$('again').addEventListener('click', () => {
  sound.tap();
  state.shots = [];
  state.rendered = {};
  state.animFrames = [];
  state.printBlob = null;
  stickers.clear();
  openLayouts();
});

// QR code: uploads the photo (and GIF) on request, then shows a code that
// opens a page where the phone can save them. Links expire after 14 days.

function drawQr(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  const c = $('qr');
  const size = c.clientWidth || 260;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.floor((size * dpr) / (n + quiet * 2));
  c.width = c.height = px * (n + quiet * 2);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1B1512';
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col)) ctx.fillRect((col + quiet) * px, (r + quiet) * px, px, px);
    }
  }
  c.classList.add('ready');
}

async function sendOnline() {
  const form = new FormData();
  form.append('photo', state.out.print.file);
  if (state.out.gif) form.append('gif', state.out.gif.file);
  form.append('title', titleText());
  form.append('sub', subText());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${API_URL}/api/print`, { method: 'POST', body: form, signal: ctrl.signal });
    if (res.status === 429) throw new Error('Too many uploads in a row. Wait a minute and try again.');
    if (!res.ok) throw new Error('The upload did not go through. Try again.');
    const data = await res.json();
    return `${API_URL}/p/${data.id}`;
  } finally {
    clearTimeout(timer);
  }
}

async function openQr() {
  const modal = $('qr-modal');
  const c = $('qr');
  const status = $('qr-status');
  modal.hidden = false;
  $('qr-retry').hidden = true;
  c.classList.remove('ready');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
  status.textContent = state.out.gif ? 'Uploading your photo and GIF...' : 'Uploading your photo...';
  try {
    if (!upload) upload = sendOnline();
    const link = await upload;
    if (modal.hidden) return;
    drawQr(link);
    status.textContent = 'Point a phone camera at the code. The link works for 2 weeks.';
  } catch (err) {
    upload = null;
    status.textContent = !navigator.onLine
      ? 'No internet right now. Connect and try again.'
      : (err.name === 'AbortError' ? 'The connection is slow. Try again.' : err.message);
    $('qr-retry').hidden = false;
  }
}

$('show-qr').addEventListener('click', () => { sound.tap(); openQr(); });
$('qr-retry').addEventListener('click', () => { sound.tap(); openQr(); });
$('qr-close').addEventListener('click', () => { sound.tap(); $('qr-modal').hidden = true; });

// Layout choice

function buildLayouts() {
  const box = $('layouts');
  box.innerHTML = '';
  for (const id of LAYOUT_ORDER) {
    const L = LAYOUTS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'layout-card';
    const c = document.createElement('canvas');
    compose(id, state.theme, [], c, 0.32);
    const text = document.createElement('div');
    text.className = 'text';
    text.innerHTML = `<span class="name"></span><span class="detail"></span>`;
    text.querySelector('.name').textContent = L.label;
    text.querySelector('.detail').textContent = L.detail;
    b.append(c, text);
    b.addEventListener('click', () => {
      sound.tap();
      state.layout = id;
      state.filter = 'natural';
      openCamera();
    });
    box.append(b);
  }
}

function openLayouts() {
  buildLayouts();
  show('layout');
}

function openCamera() {
  markFilter($('filters'));
  setShootingUI(false);
  $('progress').textContent = '';
  $('hint').textContent = moving() ? 'Keep moving when it says go' : 'Look at the camera';
  setCount('');
  show('camera');
}

$('layout-back').addEventListener('click', () => { sound.tap(); showWelcome(); });

// Customize

const customLayout = 'strip';

function drawCustomPreview() {
  compose(customLayout, settings.theme, [], $('custom-canvas'), 0.3);
}

function openCustom(from) {
  state.customFrom = from;
  $('f-title').value = settings.title;
  $('f-sub').value = settings.sub;
  $('f-sub').placeholder = `Empty shows today's date`;
  $('f-prompts').checked = settings.prompts;
  $('custom-note').textContent = '';
  buildThemes($('custom-themes'), settings.theme, (id) => {
    update({ theme: id });
    state.theme = id;
    drawCustomPreview();
  });
  show('custom');
  drawThemeThumbs($('custom-themes'), customLayout, []);
  drawCustomPreview();
}

function closeCustom() {
  const from = state.customFrom;
  if (from === 'review') {
    show('review');
    refreshReview();
  } else showWelcome();
}

let wordsTimer = 0;
function wordsChanged() {
  update({ title: $('f-title').value, sub: $('f-sub').value });
  // Redrawing eight thumbnails on every key is wasted work; wait for a pause.
  drawCustomPreview();
  clearTimeout(wordsTimer);
  wordsTimer = setTimeout(() => drawThemeThumbs($('custom-themes'), customLayout, []), 250);
}

$('f-title').maxLength = MAX_TITLE;
$('f-sub').maxLength = MAX_SUB;
$('f-title').placeholder = DEFAULTS.title;
$('f-title').addEventListener('input', wordsChanged);
$('f-sub').addEventListener('input', wordsChanged);
$('f-prompts').addEventListener('change', () => update({ prompts: $('f-prompts').checked }));
$('custom-form').addEventListener('submit', (e) => { e.preventDefault(); sound.tap(); closeCustom(); });
$('custom-back').addEventListener('click', () => { sound.tap(); closeCustom(); });
$('open-custom').addEventListener('click', (e) => { e.stopPropagation(); sound.tap(); openCustom('welcome'); });

async function sendBooth(noteEl) {
  const url = shareLink();
  try {
    if (navigator.share) {
      await navigator.share({ title: titleText(), text: 'Photo booth, open it on your phone:', url });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    noteEl.textContent = 'Link copied. Paste it to your friends.';
  } catch {
    noteEl.textContent = url;
  }
}

$('custom-send').addEventListener('click', () => { sound.tap(); sendBooth($('custom-note')); });
$('share-booth').addEventListener('click', (e) => { e.stopPropagation(); sound.tap(); sendBooth($('welcome-note')); });

// Welcome

function showWelcome() {
  $('welcome-title').textContent = titleText();
  $('welcome-sub').textContent = subText();
  document.title = titleText();
  $('welcome-note').textContent = '';
  show('welcome');
}

function showWelcomeError(err) {
  const el = $('cam-error');
  el.textContent = cameraMessage(err);
  el.hidden = false;
  showWelcome();
}

let starting = false;
async function begin() {
  if (starting) return;
  starting = true;
  sound.unlock();
  sound.tap();
  keepAwake();
  $('cam-error').hidden = true;
  try {
    await startCamera();
    openLayouts();
  } catch (err) {
    showWelcomeError(err);
  } finally {
    starting = false;
  }
}

$('begin').addEventListener('click', begin);

// Phones hand the camera back when the booth returns to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.shooting) {
      state.session++;
      setCount('');
      setShootingUI(false);
      $('progress').textContent = '';
    }
    stopPreview();
    return;
  }
  keepAwake();
  if (['layout', 'camera', 'review'].includes(state.screen)) {
    startCamera().then(() => { if (state.screen === 'camera') startPreview(); }).catch(showWelcomeError);
  }
});

// No pinch zoom or double-tap zoom while taking photos.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => {
  if (!['print', 'share-img'].includes(e.target.id) && e.target.tagName !== 'INPUT') e.preventDefault();
});

// Start

async function boot() {
  $('version').textContent = VERSION;
  showWelcome();
  await fontsReady();
  buildFilterButtons($('filters'), (id) => { state.filter = id; markFilter($('filters')); });
  buildStickerTray();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
