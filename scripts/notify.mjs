import webpush from 'web-push';

webpush.setVapidDetails('mailto:notify@myplanner.app', 'BIbb-eWwoyCM4XR-DRZWsp4JNG0BgZ1X5_m7TvKa02cVWzArbsbhMH_K-oDGOuXr7VuiS3dVNVLPI6rVzqslF5I', '6OuUr0dmKeE4Jei9GY1WQYPzbOuPdEojCQxqNzlmK4M');

const pad = n => n < 10 ? '0' + n : '' + n;
const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const inWindow = (now, target, win) => Math.abs(m(now) - m(target)) <= win;
const m = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const offsetHours = parseInt(process.env.TZ_OFFSET || '0');
const apiKey = process.env.JSONBIN_KEY;
const binIds = (process.env.JSONBIN_BINS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!apiKey || binIds.length === 0) { console.log('Missing JSONBIN_KEY or JSONBIN_BINS'); process.exit(1); }

const headers = { 'X-Master-Key': apiKey, 'Content-Type': 'application/json' };

let totalNotes = 0, totalSent = 0, totalErrors = 0, totalSubs = 0;

for (const binId of binIds) {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, { headers });
  if (!res.ok) { console.log(`Bin ${binId}: fetch error ${res.status}`); continue; }
  const json = await res.json();
  const data = json.record || json;
  const tasks = data.tasks || [];
  const subs = data.pushSubscriptions || [];
  const s = data.notifySettings || { overdueTime: '09:00', todayTime: '08:00', tomorrowTime: '20:00', defaultReminderMinutes: 15 };

  if (subs.length === 0) continue;

  const now = new Date();
  const localNow = new Date(now.getTime() + offsetHours * 3600000);
  const nowHHMM = hhmm(localNow);
  const today = localNow.toISOString().slice(0, 10);
  const W = 10;
  const notes = [];

  if (inWindow(nowHHMM, s.overdueTime, W)) {
    const o = tasks.filter(t => !t.solved && !t.deleted && t.date && t.date < today);
    if (o.length) notes.push({ title: '⚠️ Просроченные задачи', body: o.slice(0,3).map(t=>t.title).join(', ') + (o.length>3?'...':'') });
  }
  if (inWindow(nowHHMM, s.todayTime, W)) {
    const td = tasks.filter(t => !t.solved && !t.deleted && t.date === today);
    if (td.length) {
      const ti = td.filter(t=>t.time).map(t=>`${t.title} в ${t.time}`).join(', ');
      notes.push({ title: '📋 Задачи на сегодня', body: ti || td.slice(0,3).map(t=>t.title).join(', ')+(td.length>3?'...':'') });
    }
  }
  const tom = new Date(localNow); tom.setDate(tom.getDate()+1);
  const tomStr = tom.toISOString().slice(0,10);
  if (inWindow(nowHHMM, s.tomorrowTime, W)) {
    const tm = tasks.filter(t => !t.solved && !t.deleted && t.date === tomStr);
    if (tm.length) notes.push({ title: '📅 Задачи на завтра', body: tm.slice(0,3).map(t=>t.title).join(', ')+(tm.length>3?'...':'') });
  }

  const nowMin = m(nowHHMM);
  for (const t of tasks) {
    if (t.solved || t.deleted || !t.date || !t.time || t.date!==today) continue;
    const rm = t.reminderMinutes != null ? t.reminderMinutes : s.defaultReminderMinutes;
    if (!rm || rm<=0) continue;
    const tm = m(t.time)-rm;
    if (tm>=0 && Math.abs(nowMin-tm)<=W) notes.push({ title: '⏰ Напоминание', body: `«${t.title}» через ${rm} мин (в ${t.time})` });
  }

  if (notes.length === 0) continue;

  let sent = 0, errors = 0;
  const badEndpoints = [];
  for (const n of notes) {
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(n), { TTL: 86400 });
        sent++;
      } catch (e) {
        errors++;
      console.log(`Bin ${binId}:`, e.statusCode, (e.message||'').substring(0,60), (sub.endpoint||'').substring(0,50));
      badEndpoints.push(sub.endpoint);
      }
    }
  }

  if (badEndpoints.length > 0) {
    const good = subs.filter(s => !badEndpoints.includes(s.endpoint));
    await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ ...data, pushSubscriptions: good }),
    });
  }

  totalNotes += notes.length;
  totalSent += sent;
  totalErrors += errors;
  totalSubs += subs.length;
  console.log(`Bin ${binId}: Notes=${notes.length} Sent=${sent} Errors=${errors} Subs=${subs.length}`);
}

console.log(`Total: Notes=${totalNotes} Sent=${totalSent} Errors=${totalErrors} Subs=${totalSubs}`);


