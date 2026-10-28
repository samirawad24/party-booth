// Party booth backend: keeps each uploaded photo (and GIF) for 14 days and
// serves the page the booth's QR code opens.
//
// The booth is public, so there is no secret key. Uploads are limited to the
// booth's own web address (ALLOWED_ORIGINS), checked as real JPEG/GIF files,
// size capped, rate limited per visitor, and deleted by KV after 14 days.

const DAY = 86400;
const KEEP_DAYS = 14;
const MAX_JPG = 6 * 1024 * 1024;
const MAX_GIF = 12 * 1024 * 1024;
const ID = /^[a-f0-9]{32}$/;
// Per visitor, per worker instance. Not airtight, but it stops a runaway loop.
const LIMIT = 15;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

function allowedOrigin(req, env) {
  const origin = req.headers.get('Origin') || '';
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : '';
}

const cors = (origin) => (origin ? {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
} : {});

const json = (origin, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

function limited(req) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Words typed on the booth, made safe to store and show.
function words(v, max) {
  return String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function isJpeg(buf) {
  const h = new Uint8Array(buf.slice(0, 3));
  return h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
}

function isGif(buf) {
  const h = new Uint8Array(buf.slice(0, 4));
  return h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x38;
}

async function readFile(form, name, max, check) {
  const f = form.get(name);
  if (!f || typeof f === 'string') return null;
  if (!f.size || f.size > max) throw Object.assign(new Error('bad size'), { status: 413 });
  const buf = await f.arrayBuffer();
  if (!check(buf)) throw Object.assign(new Error('bad file'), { status: 415 });
  return buf;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const origin = allowedOrigin(req, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: origin ? 204 : 403, headers: cors(origin) });

    // The booth uploads a finished photo and maybe a GIF.
    if (path === '/api/print' && req.method === 'POST') {
      if (!origin) return json('', { error: 'forbidden' }, 403);
      if (limited(req)) return json(origin, { error: 'slow down' }, 429);
      let form;
      try { form = await req.formData(); } catch { return json(origin, { error: 'bad form' }, 400); }
      let photo, gif;
      try {
        photo = await readFile(form, 'photo', MAX_JPG, isJpeg);
        gif = await readFile(form, 'gif', MAX_GIF, isGif);
      } catch (err) {
        return json(origin, { error: err.message }, err.status || 400);
      }
      if (!photo) return json(origin, { error: 'no photo' }, 400);
      const id = newId();
      const expiresAt = Math.floor(Date.now() / 1000) + KEEP_DAYS * DAY;
      const meta = { expiresAt, gif: !!gif, title: words(form.get('title'), 40), sub: words(form.get('sub'), 48) };
      if (gif) await env.PHOTOS.put(`g:${id}`, gif, { expiration: expiresAt });
      await env.PHOTOS.put(`p:${id}`, photo, { expiration: expiresAt, metadata: meta });
      return json(origin, { ok: true, id, expiresAt });
    }

    let m = path.match(/^\/i\/([^/.]+)\.(jpg|gif)$/);
    if (m && req.method === 'GET') {
      const [, id, ext] = m;
      if (!ID.test(id)) return new Response('Not found', { status: 404 });
      const body = await env.PHOTOS.get(`${ext === 'gif' ? 'g' : 'p'}:${id}`, 'stream');
      if (!body) return new Response('Not found', { status: 404 });
      const headers = {
        'Content-Type': ext === 'gif' ? 'image/gif' : 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      };
      if (url.searchParams.has('download')) headers['Content-Disposition'] = `attachment; filename="photo-booth-${id.slice(0, 8)}.${ext}"`;
      return new Response(body, { headers });
    }

    m = path.match(/^\/p\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const id = m[1];
      if (!ID.test(id)) return page('Photo Booth', notFound(), 404);
      const photo = await env.PHOTOS.getWithMetadata(`p:${id}`, 'stream');
      if (!photo.value) return page('Photo Booth', notFound(), 404);
      photo.value.cancel?.();
      const meta = photo.metadata || {};
      return page(meta.title || 'Photo Booth', guestPage(id, meta));
    }

    if (path === '/' || path === '/health') return new Response('ok');
    return new Response('Not found', { status: 404 });
  },
};

function page(title, body, status = 200) {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#D9342B">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&display=swap" rel="stylesheet">
<style>
:root{--red:#D9342B;--deep:#A8231C;--paper:#FFF4E4;--ink:#1B1512;--muted:#7D6E60;--yellow:#FFC93C}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:'Bricolage Grotesque',Arial,sans-serif;-webkit-text-size-adjust:100%}
header{background:var(--red);color:var(--paper);text-align:center;padding:calc(26px + env(safe-area-inset-top)) 16px 26px}
.eyebrow{font-weight:700;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--yellow);margin:0 0 8px}
h1{font-weight:800;font-size:clamp(34px,10vw,52px);letter-spacing:-.04em;line-height:.95;margin:0;text-shadow:0 4px 0 var(--deep)}
.sub{font-weight:600;font-size:13px;letter-spacing:.2em;text-transform:uppercase;margin:12px 0 0;opacity:.9}
main{max-width:560px;margin:0 auto;padding:22px 16px 48px;text-align:center}
.warn{background:#fff;border-radius:12px;box-shadow:inset 0 0 0 2px var(--red);color:var(--deep);padding:12px 14px;font-size:15px;line-height:1.45;margin:0 0 20px;text-align:left}
.tabs{display:flex;justify-content:center;gap:22px;margin:0 0 14px}
.tabs button{font:inherit;font-weight:800;font-size:18px;color:var(--muted);background:none;border:0;border-bottom:3px solid transparent;padding:4px 0;cursor:pointer}
.tabs button[aria-pressed=true]{color:var(--ink);border-color:var(--red)}
img{display:block;width:auto;max-width:100%;max-height:62vh;height:auto;margin:0 auto;box-shadow:0 2px 4px rgba(27,21,18,.18),0 14px 34px rgba(27,21,18,.18);-webkit-touch-callout:default}
.btn{display:block;margin:22px 0 10px;background:var(--red);color:var(--paper);text-decoration:none;font-weight:700;font-size:18px;padding:17px;border-radius:14px;box-shadow:0 5px 0 var(--deep)}
.help{font-size:14px;line-height:1.5;color:var(--muted);margin:0}
.again{display:inline-block;margin-top:26px;color:var(--red);font-weight:700;text-decoration:underline;text-underline-offset:4px}
</style></head><body>${body}</body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function header(title, sub) {
  return `<header><p class="eyebrow">Photo booth</p><h1>${esc(title || 'Photo Booth')}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</header>`;
}

function guestPage(id, meta) {
  const left = meta.expiresAt ? Math.max(0, Math.ceil((meta.expiresAt * 1000 - Date.now()) / (DAY * 1000))) : KEEP_DAYS;
  const tabs = meta.gif
    ? `<div class="tabs"><button type="button" data-ext="gif" aria-pressed="true">GIF</button><button type="button" data-ext="jpg" aria-pressed="false">Photo</button></div>`
    : '';
  const first = meta.gif ? 'gif' : 'jpg';
  return `${header(meta.title, meta.sub)}<main>
<p class="warn"><strong>Save it now.</strong> This link stops working ${left <= 1 ? 'tomorrow' : `in ${left} days`}.</p>
${tabs}
<img id="pic" src="/i/${id}.${first}" alt="Your photo booth picture">
<a class="btn" id="save" href="/i/${id}.${first}?download">Save to my phone</a>
<p class="help">Or press and hold the picture, then tap <strong>Save to Photos</strong>.</p>
<a class="again" href="https://samirawad24.github.io/party-booth/">Open the photo booth</a>
</main>
<script>
// Phones: the share sheet saves straight to Photos. Files are fetched ahead
// of time because the share sheet must open right on the tap.
var id='${id}', ext='${first}', files={};
function load(x){
  if(files[x]!==undefined)return;
  files[x]=null;
  fetch('/i/'+id+'.'+x).then(function(r){return r.blob()}).then(function(b){
    var f=new File([b],'photo-booth-'+id.slice(0,8)+'.'+x,{type:x==='gif'?'image/gif':'image/jpeg'});
    try{if(navigator.canShare&&navigator.canShare({files:[f]}))files[x]=f}catch(e){}
  }).catch(function(){});
}
load(ext);
document.querySelectorAll('.tabs button').forEach(function(b){
  b.addEventListener('click',function(){
    ext=b.dataset.ext;
    document.querySelectorAll('.tabs button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});
    document.getElementById('pic').src='/i/'+id+'.'+ext;
    document.getElementById('save').href='/i/'+id+'.'+ext+'?download';
    load(ext);
  });
});
document.getElementById('save').addEventListener('click',function(e){
  var f=files[ext];
  if(!f)return;
  e.preventDefault();
  navigator.share({files:[f]}).catch(function(){});
});
</script>`;
}

function notFound() {
  return `${header('Photo Booth', '')}<main><p class="help" style="font-size:17px">This photo link has expired or does not exist. Photo booth links work for ${KEEP_DAYS} days.</p><a class="again" href="https://samirawad24.github.io/party-booth/">Open the photo booth</a></main>`;
}
