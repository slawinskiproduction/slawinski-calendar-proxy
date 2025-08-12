// /api/search.js
// Použití: /api/search?q=Lexum&daysBack=30&daysForward=365
// Projde PLANNER/BOOKING/ROUTINES a vrátí nejbližší event odpovídající dotazu.

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const daysBack = Number(url.searchParams.get('daysBack') || 30);
    const daysForward = Number(url.searchParams.get('daysForward') || 365);

    if (!q) return res.status(400).json({ ok:false, error:'Missing q' });

    const accessToken = await getAccessToken();

    const now = new Date();
    const timeMin = new Date(now.getTime() - daysBack*24*3600*1000).toISOString();
    const timeMax = new Date(now.getTime() + daysForward*24*3600*1000).toISOString();

    const ids = [
      process.env.CAL_PLANNER_ID,
      process.env.CAL_BOOKING_ID,
      process.env.CAL_ROUTINES_ID
    ].filter(Boolean);

    if (ids.length !== 3) {
      return res.status(400).json({ ok:false, error:'Missing CAL_* envs' });
    }

    const qs = new URLSearchParams({
      timeMin, timeMax, singleEvents:'true', orderBy:'startTime', maxResults:'250'
    }).toString();

    const headers = { Authorization: `Bearer ${accessToken}` };

    const fetchOne = async (id) => {
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${qs}`, { headers });
      if (!r.ok) throw new Error(`Google API ${r.status}: ${await r.text()}`);
      const j = await r.json();
      return (j.items || []).map(ev => ({ ...ev, _calendarId:id }));
    };

    const all = (await Promise.all(ids.map(fetchOne))).flat();

    const matches = all.filter(ev => {
      const txt = [
        ev.summary || '',
        ev.description || '',
        ev.location || ''
      ].join(' ').toLowerCase();
      return txt.includes(q);
    }).map(simplifyEvent)
      .sort((a,b)=> (a.startTs||0)-(b.startTs||0));

    // nejbližší budoucí (nebo poslední minule, když žádná budoucí není)
    const nowTs = Date.now();
    const future = matches.find(m => (m.startTs||0) >= nowTs);
    const closest = future || matches[matches.length-1] || null;

    return res.status(200).json({
      ok:true,
      query:q,
      range:{ timeMin, timeMax },
      count: matches.length,
      next: closest
    });

  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e) });
  }
};

function simplifyEvent(ev){
  const start = ev.start?.dateTime || ev.start?.date || null;
  const end = ev.end?.dateTime || ev.end?.date || null;
  const startTs = start ? Date.parse(start) : null;
  const endTs = end ? Date.parse(end) : null;
  return {
    id: ev.id,
    title: ev.summary || '',
    location: ev.location || '',
    description: ev.description || '',
    start, end, startTs, endTs,
    allDay: Boolean(ev.start?.date && !ev.start?.dateTime),
    sourceCalendarId: ev._calendarId
  };
}

async function getAccessToken(){
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:'refresh_token'
    })
  });
  if(!resp.ok) throw new Error(`Token refresh failed: ${resp.status} ${await resp.text()}`);
  const j = await resp.json();
  return j.access_token;
}
