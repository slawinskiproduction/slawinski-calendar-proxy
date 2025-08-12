// Vercel Edge Function – proxy na Google Apps Script
export const config = { runtime: 'edge' };

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-api-key,key',
  };
}

export default async function handler(req) {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const { searchParams } = url;

    // ====== ENV proměnné (nastav ve Vercel Project → Settings → Environment Variables) ======
    const TARGET_BASE_URL = process.env.TARGET_BASE_URL; // Apps Script /exec
    const APPSCRIPT_KEY   = process.env.APPSCRIPT_KEY;   // klíč k Apps Scriptu
    const PROXY_KEY       = process.env.PROXY_KEY;       // klíč pro tuto proxy (použije GPT)
    if (!TARGET_BASE_URL || !APPSCRIPT_KEY || !PROXY_KEY) {
      return json({ ok: false, error: 'missing env vars' }, 500);
    }

    // ====== Autorizace na proxy ======
    // 1) query ?key=...
    // 2) headers: x-api-key / key
    // 3) Authorization: Bearer <token>
    let incomingKey =
      searchParams.get('key') ||
      req.headers.get('x-api-key') ||
      req.headers.get('key');

    const authz = req.headers.get('authorization');
    if (!incomingKey && authz) {
      const m = authz.match(/^Bearer\s+(.+)$/i);
      if (m) incomingKey = m[1];
    }

    if (incomingKey !== PROXY_KEY) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    // ====== Připrav cílovou URL na Apps Script ======
    const target = new URL(TARGET_BASE_URL);

    // přenes všechny query paramy kromě "key" (proxy key nechceme posílat dál)
    for (const [k, v] of searchParams) {
      if (k === 'key') continue;
      target.searchParams.append(k, v);
    }
    // připoj skutečný klíč pro Apps Script
    target.searchParams.set('key', APPSCRIPT_KEY);

    // Forward hlaviček a těla
    const headers = new Headers();
    const contentType = req.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);

    const init = { method: req.method, headers };
    if (req.method === 'POST') {
      init.body = await req.text(); // pass-through JSON tělo
    }

    // ====== Zavolej Apps Script ======
    const resp = await fetch(target.toString(), init);

    // Přenes odpověď včetně content-type
    const respText = await resp.text();
    const outHeaders = new Headers(corsHeaders());
    const respCT = resp.headers.get('content-type') || 'application/json';
    outHeaders.set('content-type', respCT);

    return new Response(respText, { status: resp.status, headers: outHeaders });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
}

// Pomocná utilita pro JSON odpovědi s CORS
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      'content-type': 'application/json',
    },
  });
}
