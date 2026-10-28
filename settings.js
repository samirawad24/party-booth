// The booth's words and look. They live in the page link (?t=&s=&st=&p=) so a
// customized booth can be sent to someone, and in localStorage so a phone
// remembers its own booth when the plain link is opened again.

import { DEFAULTS, THEME_ORDER, MAX_TITLE, MAX_SUB } from './config.js';

const KEY = 'party-booth-settings';

function clean(s) {
  const out = { ...DEFAULTS, ...s };
  out.title = String(out.title ?? '').slice(0, MAX_TITLE);
  out.sub = String(out.sub ?? '').slice(0, MAX_SUB);
  if (!THEME_ORDER.includes(out.theme)) out.theme = DEFAULTS.theme;
  out.prompts = !!out.prompts;
  return out;
}

function fromUrl() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].some((k) => ['t', 's', 'st', 'p'].includes(k))) return null;
  const s = {};
  if (q.has('t')) s.title = q.get('t');
  if (q.has('s')) s.sub = q.get('s');
  if (q.has('st')) s.theme = q.get('st');
  if (q.has('p')) s.prompts = q.get('p') !== '0';
  return s;
}

function fromStorage() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export const settings = clean(fromUrl() || fromStorage() || {});

export function update(patch) {
  Object.assign(settings, clean({ ...settings, ...patch }));
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  history.replaceState(null, '', shareLink());
}

export function shareLink() {
  const q = new URLSearchParams();
  if (settings.title !== DEFAULTS.title) q.set('t', settings.title);
  if (settings.sub) q.set('s', settings.sub);
  if (settings.theme !== DEFAULTS.theme) q.set('st', settings.theme);
  if (!settings.prompts) q.set('p', '0');
  const qs = q.toString();
  return location.origin + location.pathname + (qs ? `?${qs}` : '');
}

// What the print and welcome screen actually show.
export function titleText() {
  return settings.title.trim() || DEFAULTS.title;
}

export function subText() {
  const s = settings.sub.trim();
  if (s) return s;
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
