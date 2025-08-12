module.exports = async (req, res) => {
  const marker = 'test-gcal-v2';
  try {
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
      return res.status(tokenRes.status).json({ marker, step: 'token', ok: false, error: await tokenRes.text() });
    }

    const { access_token, expires_in } = await tokenRes.json();

    const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!calRes.ok) {
      return res.status(calRes.status).json({ marker, step: 'calendarList', ok: false, error: await calRes.text() });
    }

    const json = await calRes.json();
    const simplified = (json.items || []).map(c => ({ name: c.summary, id: c.id }));

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ marker, ok: true, expires_in, calendars: simplified });
  } catch (e) {
    return res.status(500).json({ marker, ok: false, error: String(e) });
  }
};
