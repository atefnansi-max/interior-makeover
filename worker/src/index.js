// Makeover proxy: lets visitors generate without their own Gemini key.
// The key lives only in the GEMINI_KEY secret on Cloudflare; daily limits protect the bill.

const ALLOWED_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'X-Free-Left',
    'Vary': 'Origin'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

// Counts one use for the whole site and one for this visitor today; returns what is left
async function takeQuota(env, ip) {
  const day = new Date().toISOString().slice(0, 10);
  const siteKey = 'site:' + day;
  const ipKey = 'ip:' + day + ':' + ip;
  const [siteUsed, ipUsed] = await Promise.all([env.USAGE.get(siteKey), env.USAGE.get(ipKey)]);
  const site = Number(siteUsed || 0);
  const mine = Number(ipUsed || 0);
  const siteLimit = Number(env.DAILY_LIMIT_SITE || 60);
  const ipLimit = Number(env.DAILY_LIMIT_PER_VISITOR || 15);
  if (site >= siteLimit || mine >= ipLimit) return { ok: false, left: Math.max(0, Math.min(siteLimit - site, ipLimit - mine)) };
  // Expire the counters after two days so storage stays small
  await Promise.all([
    env.USAGE.put(siteKey, String(site + 1), { expirationTtl: 172800 }),
    env.USAGE.put(ipKey, String(mine + 1), { expirationTtl: 172800 })
  ]);
  return { ok: true, left: Math.min(siteLimit - site - 1, ipLimit - mine - 1) };
}

// ---------- Saved designs (D1 for details, KV for full images) ----------
// A library id is a private random 32-character code kept in each browser; whoever has it can see that library.
const LIBRARY_RE = /^[a-f0-9]{32}$/;
const ID_RE = /^[a-z0-9-]{6,64}$/;
const MAX_DESIGNS = 300;
const MAX_IMAGE_CHARS = 14 * 1024 * 1024;
const MAX_THUMB_CHARS = 400 * 1024;
const LIST_COLUMNS = 'id, name, note, style, room, cost, thumb, created_at, updated_at';

function clean(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

async function designsApi(request, env, url, headers) {
  const method = request.method;
  const parts = url.pathname.split('/').filter(Boolean); // ['designs', id?, 'image'?]
  const id = parts[1];
  const lib = url.searchParams.get('lib') || '';
  if (!LIBRARY_RE.test(lib)) return json({ error: { message: 'Missing or invalid library code.' } }, 400, headers);
  if (id && !ID_RE.test(id)) return json({ error: { message: 'Invalid design id.' } }, 400, headers);

  // Read: list a library
  if (method === 'GET' && !id) {
    const { results } = await env.DB.prepare('SELECT ' + LIST_COLUMNS + ' FROM designs WHERE library = ? ORDER BY created_at DESC').bind(lib).all();
    return json({ designs: results }, 200, headers);
  }
  // Read: one full image, as a picture file
  if (method === 'GET' && id && parts[2] === 'image') {
    const row = await env.DB.prepare('SELECT id FROM designs WHERE id = ? AND library = ?').bind(id, lib).first();
    if (!row) return json({ error: { message: 'Design not found.' } }, 404, headers);
    const dataUrl = await env.DESIGN_IMAGES.get(lib + ':' + id);
    if (!dataUrl) return json({ error: { message: 'Image not found.' } }, 404, headers);
    const m = /^data:([\w/+.-]+);base64,(.*)$/.exec(dataUrl);
    if (!m) return json({ error: { message: 'Stored image is unreadable.' } }, 500, headers);
    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    return new Response(bytes, { status: 200, headers: { ...headers, 'Content-Type': m[1], 'Cache-Control': 'private, max-age=3600' } });
  }
  // Create
  if (method === 'POST' && !id) {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: { message: 'Invalid request.' } }, 400, headers); }
    const d = body && body.design || {};
    if (!ID_RE.test(String(d.id || ''))) return json({ error: { message: 'Invalid design id.' } }, 400, headers);
    if (typeof body.image !== 'string' || !body.image.startsWith('data:image/') || body.image.length > MAX_IMAGE_CHARS) {
      return json({ error: { message: 'The image is missing or too large.' } }, 413, headers);
    }
    const thumb = typeof d.thumb === 'string' && d.thumb.startsWith('data:image/') && d.thumb.length <= MAX_THUMB_CHARS ? d.thumb : null;
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM designs WHERE library = ?').bind(lib).first();
    if (count && count.n >= MAX_DESIGNS) return json({ error: { message: 'This library is full. Delete some designs first.' } }, 409, headers);
    const now = new Date().toISOString();
    await env.DESIGN_IMAGES.put(lib + ':' + d.id, body.image);
    await env.DB.prepare('INSERT OR REPLACE INTO designs (id, library, name, note, style, room, cost, thumb, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(d.id, lib, clean(d.name, 120) || 'Untitled design', clean(d.note, 600), clean(d.style, 40), clean(d.room, 40),
        Number.isInteger(d.cost) ? d.cost : null, thumb, clean(d.created_at, 40) || now, now)
      .run();
    return json({ ok: true, id: d.id }, 201, headers);
  }
  // Update: name and note
  if (method === 'PATCH' && id) {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: { message: 'Invalid request.' } }, 400, headers); }
    const res = await env.DB.prepare('UPDATE designs SET name = ?, note = ?, updated_at = ? WHERE id = ? AND library = ?')
      .bind(clean(body.name, 120) || 'Untitled design', clean(body.note, 600), new Date().toISOString(), id, lib).run();
    if (!res.meta.changes) return json({ error: { message: 'Design not found.' } }, 404, headers);
    return json({ ok: true }, 200, headers);
  }
  // Delete
  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM designs WHERE id = ? AND library = ?').bind(id, lib).run();
    await env.DESIGN_IMAGES.delete(lib + ':' + id);
    return json({ ok: true }, 200, headers);
  }
  return json({ error: { message: 'Not found.' } }, 404, headers);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, hasKey: !!env.GEMINI_KEY }, 200, headers);
    }
    if (url.pathname === '/designs' || url.pathname.startsWith('/designs/')) {
      // Only our site may use the designs API from a browser
      const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
      if (!allowed.includes(origin)) return json({ error: { message: 'Not allowed.' } }, 403, headers);
      try {
        return await designsApi(request, env, url, headers);
      } catch (e) {
        return json({ error: { message: 'The designs database had a problem. Please try again.' } }, 500, headers);
      }
    }
    if (request.method !== 'POST' || url.pathname !== '/generate') {
      return json({ error: { message: 'Not found.' } }, 404, headers);
    }
    if (!env.GEMINI_KEY) return json({ error: { message: 'The server has no Gemini key yet.' } }, 503, headers);

    const size = Number(request.headers.get('Content-Length') || 0);
    if (size > MAX_BODY_BYTES) return json({ error: { message: 'The photo is too large.' } }, 413, headers);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: { message: 'Invalid request.' } }, 400, headers); }
    const model = body && body.model;
    if (!ALLOWED_MODELS.includes(model) || !body.payload) {
      return json({ error: { message: 'This model is not allowed.' } }, 400, headers);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const quota = await takeQuota(env, ip);
    if (!quota.ok) {
      return json({ error: { message: 'Today\'s free designs are used up. Try again tomorrow, or add your own Gemini key in the studio.' }, quotaExhausted: true }, 429, headers);
    }

    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify(body.payload)
    });
    const out = new Response(res.body, { status: res.status, headers: { ...headers, 'Content-Type': 'application/json', 'X-Free-Left': String(quota.left) } });
    return out;
  }
};
