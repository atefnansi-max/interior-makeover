// Makeover proxy: lets visitors generate without their own Gemini key.
// The key lives only in the GEMINI_KEY secret on Cloudflare; daily limits protect the bill.

const ALLOWED_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, hasKey: !!env.GEMINI_KEY }, 200, headers);
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
