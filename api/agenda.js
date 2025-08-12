// /api/agenda.js
// Vrátí sjednocené eventy z PLANNER/BOOKING/ROUTINES pro zadaný den.
// Použití:
//   /api/agenda           -> dnešek (Europe/Prague)
//   /api/agenda?when=thursday  -> nejbližší čtvrtek
//   /api/agenda?date=2025-08-14 -> konkrétní den (YYYY-MM-DD)

const TZ = 'Europe/Prague';

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const when = (url.searchParams.get('when') || '').toLowerCase();
    const dateStr = url.searchParams.get('date'); // YYYY-MM-DD

    // 1) Zjisti cílové datum
    const target = resolveTargetDate({ when, dateStr });

    // 2) Vytvoř timeMin/timeMax pro celý daný den v CZ čase
    const { timeMin, timeMax, label } = dayBoundsISO(target, TZ);

    // 3) Získej access_token z refresh tokenu
    const accessToken = await getAccessToken();

    // 4) Stáhni eventy ze tří kalendářů paralelně
    const ids = [
      process.env.CAL_PLANNER_ID,
      process.env.CAL_BOOKING_ID,
      process.env.CAL_ROUTINES_ID
    ].filter(Boolean);

    if (ids.length !== 3) {
      return res.status(400).json({ ok: false, error: 'Missing CAL_* envs' });
    }

    const qs = new URLSearchParams({
      timeMin, timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250'
    }).toString();

    const headers = { Authorization: `Bearer ${accessToken}` };
    const fetchOne = async (id) => {
      const api = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${qs}`;
      const r = await fetch(api, { headers });
      if (!r.ok) throw new Error(`Google API ${r.status}: ${await r.text()}`);
      const j = await r.json();
      return (j.items || []).map(ev => ({ ...ev, _calendarId: id }));
    };

    const all = (await Promise.all(ids.map(fetchOne))).flat();

    // 5) Zjednoduš výstup a seřaď
    const simplified = all.map(simplifyEvent).sort((a, b) => (a.startTs || 0) - (b.startTs || 0));

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      ok: true,
      range: { label, timeMin, timeMax, tz: TZ },
      items: simplified
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
};

// --- Helpers ---

function resolveTargetDate({ when, dateStr }) {
  const now = new Date();
  // normalized "today"
  if (!when && !dateStr) return now;

  if (dateStr) {
    // YYYY-MM-DD to local date at midnight
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, (m - 1), d);
  }

  if (when === 'today') return now;
  if (when === 'tomorrow') return addDays(startOfDay(now), 1);

  if (when === 'thursday') {
    // nejbližší čtvrtek (včetně dneška, pokud je čtvrtek)
    const d = startOfDay(now);
    const day = d.getDay(); // 0=Sun..6=Sat
    const targetDow = 4; // Thursday
    const diff = (targetDow - day + 7) % 7;
    return addDays(d, diff);
  }

  return now;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayBoundsISO(dateLocal, tz) {
  // vytvoř 00:00 a 23:59:59.999 v zadané TZ a převeď na ISO (UTC Z)
  const start = new Date(dateLocal.getFullYear(), dateLocal.getMonth(), dateLocal.getDate(), 0, 0, 0, 0);
  const end = new Date(dateLocal.getFullYear(), dateLocal.getMonth(), dateLocal.getDate(), 23, 59, 59, 999);

  const timeMin = toZonedISO(start, tz);
  const timeMax = toZonedISO(end, tz);
  const label = start.toISOString().slice(0,10); // YYYY-MM-DD
  return { timeMin, timeMax, label };
}

function toZonedISO(dateLocal, tz) {
  // Vytvoří ISO v UTC odpovídající času 'dateLocal' v zóně 'tz'
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = fmt.formatToParts(dateLocal).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  const ss = Number(parts.second);
  // vytvoř UTC čas odpovídající lokálnímu času v zóně tz
  const zoned = new Date(Date.UTC(y, m - 1, d, hh, mm, ss, dateLocal.getMilliseconds()));
  return zoned.toISOString();
}

function simplifyEvent(ev) {
  const start = ev.start?.dateTime || ev.start?.date || null;
  const end = ev.end?.dateTime || ev.end?.date || null;
  const startTs = start ? Date.parse(start) : null;
  const endTs = end ? Date.parse(end) : null;
  return {
    id: ev.id,
    title: ev.summary || '',
    location: ev.location || '',
    description: ev.description || '',
    start,
    end,
    startTs,
    endTs,
    allDay: Boolean(ev.start?.date && !ev.start?.dateTime),
    sourceCalendarId: ev._calendarId
  };
}

async function getAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  if (!resp.ok) {
    throw new Error(`Failed to refresh access token: ${resp.status} ${await resp.text()}`);
  }
  const j = await resp.json();
  return j.access_token;
}
