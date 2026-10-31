// Makeover backend (Cloudflare Worker)
// - /generate: AI proxy. Our Gemini key stays in the GEMINI_KEY secret. Each successful image costs 10 tokens.
// - /me, /auth/google, /auth/logout: guest accounts (50 free tokens) and Google sign-in with sessions.
// - /designs: generated and saved designs (D1 for details, KV for full images), owned by a guest or a Google account.

// The text model only reads a room's layout for the 3D view; it returns no image, so it costs no tokens
const TEXT_MODEL = 'gemini-3.8-flash';
const ALLOWED_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image', TEXT_MODEL];
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const TOKENS_PER_IMAGE = 10;
const GUEST_TOKENS = 50;
const SIGN_IN_BONUS = 50; // "5 more free designs" when a guest signs in with Google for the first time
const SESSION_DAYS = 30;

const LIBRARY_RE = /^[a-f0-9]{32}$/;
const SESSION_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[a-z0-9-]{6,64}$/;
const MAX_DESIGNS = 300;
const MAX_IMAGE_CHARS = 14 * 1024 * 1024;
const MAX_THUMB_CHARS = 400 * 1024;
const LIST_COLUMNS = 'id, name, note, style, room, cost, thumb, favorite, kind, created_at, updated_at';

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'X-Free-Left, X-Tokens-Left',
    'Vary': 'Origin'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function clean(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

// Abuse guard per IP and for the whole site (on top of tokens); counters expire after two days
async function takeQuota(env, ip) {
  const day = new Date().toISOString().slice(0, 10);
  const siteKey = 'site:' + day;
  const ipKey = 'ip:' + day + ':' + ip;
  const [siteUsed, ipUsed] = await Promise.all([env.USAGE.get(siteKey), env.USAGE.get(ipKey)]);
  const site = Number(siteUsed || 0);
  const mine = Number(ipUsed || 0);
  const siteLimit = Number(env.DAILY_LIMIT_SITE || 60);
  const ipLimit = Number(env.DAILY_LIMIT_PER_VISITOR || 15);
  if (site >= siteLimit || mine >= ipLimit) return false;
  await Promise.all([
    env.USAGE.put(siteKey, String(site + 1), { expirationTtl: 172800 }),
    env.USAGE.put(ipKey, String(mine + 1), { expirationTtl: 172800 })
  ]);
  return true;
}

// ---------- Accounts ----------
// A guest account's id is its private library code; a Google account's id is "g:" + Google's user id.
async function ensureGuest(env, lib) {
  await env.DB.prepare('INSERT OR IGNORE INTO accounts (id, kind, tokens, created_at) VALUES (?, ?, ?, ?)')
    .bind(lib, 'guest', GUEST_TOKENS, new Date().toISOString()).run();
  return env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(lib).first();
}

// Who is calling: a signed-in user (Bearer session) or a guest (lib code)
async function getOwner(request, env, url) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (SESSION_RE.test(token)) {
    const row = await env.DB.prepare('SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token = ? AND s.expires_at > ?')
      .bind(token, new Date().toISOString()).first();
    if (row) return row;
  }
  const lib = url.searchParams.get('lib') || '';
  if (LIBRARY_RE.test(lib)) return ensureGuest(env, lib);
  return null;
}

function publicMe(a, env) {
  return {
    type: a.kind === 'google' ? 'user' : 'guest',
    name: a.name || '', email: a.email || '', picture: a.picture || '',
    tokens: a.tokens, bonusClaimed: !!a.bonus_claimed,
    tokensPerImage: TOKENS_PER_IMAGE,
    googleClientId: env.GOOGLE_CLIENT_ID || ''
  };
}

// Verify a Google ID token with Google, and check it was issued for our app
async function verifyGoogle(credential, env) {
  const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!res.ok) return null;
  const info = await res.json();
  const okIssuer = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (!okIssuer || info.aud !== env.GOOGLE_CLIENT_ID || Number(info.exp) * 1000 < Date.now() || !info.sub) return null;
  return info;
}

async function authApi(request, env, url, headers) {
  if (request.method === 'GET' && url.pathname === '/me') {
    const owner = await getOwner(request, env, url);
    if (!owner) return json({ error: { message: 'Missing library code.' } }, 400, headers);
    return json(publicMe(owner, env), 200, headers);
  }

  if (request.method === 'POST' && url.pathname === '/auth/google') {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: { message: 'Google sign-in is not set up yet.' } }, 503, headers);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: { message: 'Invalid request.' } }, 400, headers); }
    const info = await verifyGoogle(String(body.credential || ''), env);
    if (!info) return json({ error: { message: 'Google sign-in could not be verified. Please try again.' } }, 401, headers);

    const id = 'g:' + info.sub;
    const now = new Date().toISOString();
    const lib = LIBRARY_RE.test(body.lib || '') ? body.lib : null;
    const guest = lib ? await env.DB.prepare('SELECT * FROM accounts WHERE id = ? AND kind = ?').bind(lib, 'guest').first() : null;
    const existing = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();

    if (!existing) {
      // New account: keep the guest's remaining tokens and add the sign-in bonus once
      const start = (guest && !guest.merged_into ? guest.tokens : GUEST_TOKENS) + SIGN_IN_BONUS;
      await env.DB.prepare('INSERT INTO accounts (id, kind, email, name, picture, tokens, bonus_claimed, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
        .bind(id, 'google', clean(info.email, 200), clean(info.name || info.given_name, 120), clean(info.picture, 500), start, now).run();
    } else {
      await env.DB.prepare('UPDATE accounts SET email = ?, name = ?, picture = ? WHERE id = ?')
        .bind(clean(info.email, 200), clean(info.name || info.given_name, 120), clean(info.picture, 500), id).run();
    }
    // The guest's designs move to the account; its tokens were carried over (first sign-in) or are not added again
    if (guest && !guest.merged_into) {
      // Images saved before image_key existed live under "library:id"; give them their own key so they open on any device
      const { results: legacy } = await env.DB.prepare('SELECT id FROM designs WHERE library = ? AND image_key IS NULL').bind(lib).all();
      for (const row of legacy) {
        const data = await env.DESIGN_IMAGES.get(lib + ':' + row.id);
        if (!data) continue;
        await env.DESIGN_IMAGES.put('img:' + row.id, data);
        await env.DB.prepare('UPDATE designs SET image_key = ? WHERE id = ?').bind('img:' + row.id, row.id).run();
      }
      await env.DB.prepare('UPDATE designs SET library = ? WHERE library = ?').bind(id, lib).run();
      await env.DB.prepare('UPDATE accounts SET tokens = 0, merged_into = ? WHERE id = ?').bind(id, lib).run();
    }
    const session = randomHex(32);
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(session, id, now, expires).run();
    const account = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first();
    return json({ session, me: publicMe(account, env), welcomeBonus: !existing }, 200, headers);
  }

  if (request.method === 'POST' && url.pathname === '/auth/logout') {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (SESSION_RE.test(token)) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return json({ ok: true }, 200, headers);
  }
  return null;
}

// ---------- Designs ----------
async function designsApi(request, env, url, headers) {
  const method = request.method;
  const parts = url.pathname.split('/').filter(Boolean); // ['designs', id?, 'image'?]
  const id = parts[1];
  const owner = await getOwner(request, env, url);
  if (!owner) return json({ error: { message: 'Missing or invalid library code.' } }, 400, headers);
  const ownerId = owner.id;
  if (id && !ID_RE.test(id)) return json({ error: { message: 'Invalid design id.' } }, 400, headers);

  if (method === 'GET' && !id) {
    const { results } = await env.DB.prepare('SELECT ' + LIST_COLUMNS + ' FROM designs WHERE library = ? ORDER BY created_at DESC').bind(ownerId).all();
    return json({ designs: results }, 200, headers);
  }
  if (method === 'GET' && id && parts[2] === 'image') {
    const row = await env.DB.prepare('SELECT id, image_key FROM designs WHERE id = ? AND library = ?').bind(id, ownerId).first();
    if (!row) return json({ error: { message: 'Design not found.' } }, 404, headers);
    // Older designs were stored under "library:id"; newer ones under their image_key
    const lib = url.searchParams.get('lib') || '';
    const dataUrl = (row.image_key && await env.DESIGN_IMAGES.get(row.image_key)) || (lib && await env.DESIGN_IMAGES.get(lib + ':' + id));
    if (!dataUrl) return json({ error: { message: 'Image not found.' } }, 404, headers);
    const m = /^data:([\w/+.-]+);base64,(.*)$/.exec(dataUrl);
    if (!m) return json({ error: { message: 'Stored image is unreadable.' } }, 500, headers);
    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    return new Response(bytes, { status: 200, headers: { ...headers, 'Content-Type': m[1], 'Cache-Control': 'private, max-age=3600' } });
  }
  if (method === 'POST' && !id) {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: { message: 'Invalid request.' } }, 400, headers); }
    const d = body && body.design || {};
    if (!ID_RE.test(String(d.id || ''))) return json({ error: { message: 'Invalid design id.' } }, 400, headers);
    if (typeof body.image !== 'string' || !body.image.startsWith('data:image/') || body.image.length > MAX_IMAGE_CHARS) {
      return json({ error: { message: 'The image is missing or too large.' } }, 413, headers);
    }
    const thumb = typeof d.thumb === 'string' && d.thumb.startsWith('data:image/') && d.thumb.length <= MAX_THUMB_CHARS ? d.thumb : null;
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM designs WHERE library = ?').bind(ownerId).first();
    if (count && count.n >= MAX_DESIGNS) return json({ error: { message: 'Your library is full. Delete some designs first.' } }, 409, headers);
    const now = new Date().toISOString();
    const imageKey = 'img:' + d.id;
    await env.DESIGN_IMAGES.put(imageKey, body.image);
    await env.DB.prepare('INSERT OR REPLACE INTO designs (id, library, name, note, style, room, cost, thumb, favorite, kind, image_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(d.id, ownerId, clean(d.name, 120) || 'Untitled design', clean(d.note, 600), clean(d.style, 40), clean(d.room, 40),
        Number.isInteger(d.cost) ? d.cost : null, thumb, d.favorite ? 1 : 0, d.kind === 'generated' ? 'generated' : 'saved', imageKey, clean(d.created_at, 40) || now, now)
      .run();
    return json({ ok: true, id: d.id }, 201, headers);
  }
  if (method === 'PATCH' && id) {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: { message: 'Invalid request.' } }, 400, headers); }
    const row = await env.DB.prepare('SELECT name, note, favorite FROM designs WHERE id = ? AND library = ?').bind(id, ownerId).first();
    if (!row) return json({ error: { message: 'Design not found.' } }, 404, headers);
    const name = 'name' in body ? clean(body.name, 120) || 'Untitled design' : row.name;
    const note = 'note' in body ? clean(body.note, 600) : row.note;
    const favorite = 'favorite' in body ? (body.favorite ? 1 : 0) : row.favorite;
    await env.DB.prepare('UPDATE designs SET name = ?, note = ?, favorite = ?, updated_at = ? WHERE id = ? AND library = ?')
      .bind(name, note, favorite, new Date().toISOString(), id, ownerId).run();
    return json({ ok: true }, 200, headers);
  }
  if (method === 'DELETE' && id) {
    const row = await env.DB.prepare('SELECT image_key FROM designs WHERE id = ? AND library = ?').bind(id, ownerId).first();
    await env.DB.prepare('DELETE FROM designs WHERE id = ? AND library = ?').bind(id, ownerId).run();
    if (row && row.image_key) await env.DESIGN_IMAGES.delete(row.image_key);
    const lib = url.searchParams.get('lib') || '';
    if (lib) await env.DESIGN_IMAGES.delete(lib + ':' + id);
    return json({ ok: true }, 200, headers);
  }
  return json({ error: { message: 'Not found.' } }, 404, headers);
}

// ---------- AI proxy ----------
async function generateApi(request, env, url, headers) {
  if (!env.GEMINI_KEY) return json({ error: { message: 'The server has no Gemini key yet.' } }, 503, headers);
  const size = Number(request.headers.get('Content-Length') || 0);
  if (size > MAX_BODY_BYTES) return json({ error: { message: 'The photo is too large.' } }, 413, headers);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: { message: 'Invalid request.' } }, 400, headers); }
  const model = body && body.model;
  if (!ALLOWED_MODELS.includes(model) || !body.payload) return json({ error: { message: 'This model is not allowed.' } }, 400, headers);

  const owner = await getOwner(request, env, url);
  if (!owner) return json({ error: { message: 'Missing library code.' } }, 400, headers);
  if (model !== TEXT_MODEL && owner.tokens < TOKENS_PER_IMAGE) {
    return json({ error: { message: 'You have used all your tokens. Each design costs ' + TOKENS_PER_IMAGE + ' tokens.' }, needTokens: true, tokens: owner.tokens }, 402, headers);
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await takeQuota(env, ip))) {
    return json({ error: { message: 'Too many designs from this connection today. Please try again tomorrow, or add your own Gemini key in Settings.' }, quotaExhausted: true }, 429, headers);
  }

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
    body: JSON.stringify(body.payload)
  });
  const text = await res.text();
  // Tokens are only taken after Gemini actually returns an image
  let left = owner.tokens;
  if (res.ok && /"inline_?[dD]ata"/.test(text)) {
    await env.DB.prepare('UPDATE accounts SET tokens = tokens - ? WHERE id = ? AND tokens >= ?').bind(TOKENS_PER_IMAGE, owner.id, TOKENS_PER_IMAGE).run();
    const after = await env.DB.prepare('SELECT tokens FROM accounts WHERE id = ?').bind(owner.id).first();
    left = after ? after.tokens : left - TOKENS_PER_IMAGE;
  }
  return new Response(text, { status: res.status, headers: { ...headers, 'Content-Type': 'application/json', 'X-Tokens-Left': String(left) } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, hasKey: !!env.GEMINI_KEY, google: !!env.GOOGLE_CLIENT_ID }, 200, headers);
    }
    // Everything else may only be used from our own site in a browser
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    if (!allowed.includes(origin)) return json({ error: { message: 'Not allowed.' } }, 403, headers);

    try {
      if (url.pathname === '/me' || url.pathname.startsWith('/auth/')) {
        const res = await authApi(request, env, url, headers);
        if (res) return res;
      }
      if (url.pathname === '/designs' || url.pathname.startsWith('/designs/')) return await designsApi(request, env, url, headers);
      if (request.method === 'POST' && url.pathname === '/generate') return await generateApi(request, env, url, headers);
    } catch (e) {
      return json({ error: { message: 'The server had a problem. Please try again.' } }, 500, headers);
    }
    return json({ error: { message: 'Not found.' } }, 404, headers);
  }
};
