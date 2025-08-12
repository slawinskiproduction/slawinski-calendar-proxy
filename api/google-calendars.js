module.exports = async (req, res) => {
  try {
    // 1) Vyměň refresh token za access token
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
      return res.status(tokenRes.status).send(await tokenRes.text());
    }

    const { access_token } = await tokenRes.json();

    // 2) Vypiš seznam kalendářů
    const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!calRes.ok) {
      return res.status(calRes.status).send(await calRes.text());
    }

    const json = await calRes.json();
    // Kratší výstup: jen name + id
    const simplified = (json.items || []).map(c => ({ name: c.summary, id: c.id }));
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(simplified));
  } catch (e) {
    res.status(500).send(String(e));
  }
};
