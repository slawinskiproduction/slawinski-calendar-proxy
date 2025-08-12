// /api/events.js — Full CRUD for Google Calendar via your Vercel backend
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
// (a volitelně vaše CAL_* proměnné pro default calendar)

module.exports = async (req, res) => {
  try {
    const accessToken = await getAccessToken();

    if (req.method === 'GET') {
      // List events (with optional window)
      const url = new URL(req.url, `http://${req.headers.host}`);
      const calendarId = url.searchParams.get('calendarId') || process.env.CAL_PLANNER_ID;
      const timeMin = url.searchParams.get('timeMin') || new Date(Date.now() - 7*24*3600*1000).toISOString(); // default: last 7 days
      const timeMax = url.searchParams.get('timeMax') || new Date(Date.now() + 30*24*3600*1000).toISOString(); // default: next 30 days
      const pageToken = url.searchParams.get('pageToken') || '';

      if (!calendarId) return res.status(400).json({ ok:false, error:'Missing calendarId' });

      const qs = new URLSearchParams({
        timeMin, timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250'
      });
      if (pageToken) qs.set('pageToken', pageToken);

      const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${qs}`;
      const resp = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!resp.ok) return res.status(resp.status).send(await resp.text());

      const data = await resp.json();
      return res.status(200).json({ ok:true, ...data });
    }

    if (req.method === 'POST') {
      // Create event
      const body = await readJson(req);
      const { calendarId, ...fields } = body;
      if (!calendarId) return res.status(400).json({ ok:false, error:'Missing calendarId' });

      const payload = buildEventPayload(fields);
      const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) return res.status(resp.status).send(await resp.text());
      const data = await resp.json();
      return res.status(200).json({ ok:true, event:data });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      // Update (partial) — prefer PATCH semantics
      const body = await readJson(req);
      const { calendarId, eventId, ...fields } = body;
      if (!calendarId || !eventId) return res.status(400).json({ ok:false, error:'Missing calendarId or eventId' });

      const payload = buildEventPayload(fields, /*partial*/true);
      const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
      const resp = await fetch(apiUrl, {
        method: 'PATCH', // partial updates
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) return res.status(resp.status).send(await resp.text());
      const data = await resp.json();
      return res.status(200).json({ ok:true, event:data });
    }

    if (req.method === 'DELETE') {
      // Delete
      const url = new URL(req.url, `http://${req.headers.host}`);
      const calendarId = url.searchParams.get('calendarId');
      const eventId = url.searchParams.get('eventId');
      if (!calendarId || !eventId) return res.status(400).json({ ok:false, error:'Missing calendarId or eventId' });

      const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
      const resp = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.status === 204) return res.status(200).json({ ok:true, deleted:true });
      if (!resp.ok) return res.status(resp.status).send(await resp.text());
      return res.status(200).json({ ok:true, deleted:true });
    }

    return res.status(405).json({ ok:false, error:'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e) });
  }
};

/* ---------- helpers ---------- */

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
  if (!resp.ok) throw new Error(`Failed to refresh access token: ${resp.status} ${await resp.text()}`);
  const j = await resp.json();
  return j.access_token;
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
  });
}

/**
 * Build Google Calendar event resource.
 * Supports:
 *  - summary, description, location
 *  - start/end as ISO strings (dateTime) or all-day via allDay + date (YYYY-MM-DD)
 *  - attendees: [{email, optional: displayName, optional: responseStatus}]
 *  - reminders: { useDefault: boolean, overrides: [{method: 'email'|'popup', minutes}] }
 *  - colorId, visibility, conferenceData (see notes)
 */
function buildEventPayload(fields, partial=false) {
  const {
    summary, description, location,
    start, end,            // ISO 'YYYY-MM-DDTHH:mm:ss±hh:mm'
    allDay, date,          // if allDay==true, use 'date' (YYYY-MM-DD)
    attendees, reminders,  // arrays/objects matching Google schema
    colorId, visibility,
    conference,            // { type: 'hangoutsMeet' } (optional)
    status                 // 'confirmed'|'tentative'|'cancelled'
  } = fields;

  const payload = {};
  if (summary !== undefined) payload.summary = summary;
  if (description !== undefined) payload.description = description;
  if (location !== undefined) payload.location = location;
  if (status !== undefined) payload.status = status;
  if (colorId !== undefined) payload.colorId = colorId;
  if (visibility !== undefined) payload.visibility = visibility;
  if (attendees !== undefined) payload.attendees = attendees;
  if (reminders !== undefined) payload.reminders = reminders;

  if (allDay && date) {
    payload.start = { date };
    payload.end = { date };
  } else {
    if (start !== undefined) payload.start = { dateTime: start };
    if (end !== undefined) payload.end = { dateTime: end };
  }

  // Simple Meet link (if requested)
  if (conference && conference.type === 'hangoutsMeet') {
    payload.conferenceData = {
      createRequest: { requestId: `req-${Date.now()}` }
    };
  }

  // For PATCH, leave out unset fields (partial)
  return payload;
}
