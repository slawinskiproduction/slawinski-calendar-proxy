// Vercel Edge Function – jednoduchý proxy na Apps Script
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  const TARGET_BASE_URL = process.env.TARGET_BASE_URL; // tvůj Apps Script /exec
  const APPSCRIPT_KEY   = process.env.APPSCRIPT_KEY;   // klíč k Apps Scriptu
  const PROXY_KEY       = process.env.PROXY_KEY;       // klíč pro tuto proxy (zadá ChatGPT)

  if (!TARGET_BASE_URL || !APPSCRIPT_KEY || !PROXY_KEY) {
    return new Response(JSON.stringify({ ok:false, error:'missing env vars' }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }

  const incomingKey = searchParams.get('key') || req.headers.get('x-api-key');
  if (incomingKey !== PROXY_KEY) {
    return new Response(JSON.stringify({ ok:false, error:'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' }
    });
  }

  const target = new URL(TARGET_BASE_URL);
  for (const [k, v] of searchParams) {
    if (k === 'key') continue;
    target.searchParams.append(k, v);
  }
  target.searchParams.set('key', APPSCRIPT_KEY);

  const init = { method: req.method, headers: { 'content-type': 'application/json' } };
  if (req.method === 'POST') {
    init.body = await req.text();
  }

  const resp = await fetch(target.toString(), init);
  const text = await resp.text();

  return new Response(text, {
    status: resp.status,
    headers: { 'content-type': resp.headers.get('content-type') || 'application/json' }
  });
}