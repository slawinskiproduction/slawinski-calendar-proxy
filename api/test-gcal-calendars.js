// api/test-gcal-calendars.js
module.exports = async (req, res) => {
  try {
    // marker pro jistotu, ať víš, že jsi na správném endpointu
    const marker = 'test-gcal-v1';

    // 1) token z refresh tokenu
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return res.status(tokenRes.status).json({ marker, step: 'token', ok: false, error: text });
    }

    const { access_token, expires_in } = await tokenRes.json();

    // 2) seznam kalendářů
    const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!calRes.ok) {
      const text = await calRes.text();
      return res.status(calRes.status).json({ marker, step: 'calendarList', ok: false, error: text });
    }

    const json = await calRes.json();
    const simplified = (json.items || []).map(c => ({ name: c.summary, id: c.id }));

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ marker, ok: true, expires_in, calendars: simplified });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
};
