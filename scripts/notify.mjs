import webpush from 'web-push';

webpush.setVapidDetails('mailto:notify@myplanner.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

const pad = n => n < 10 ? '0' + n : '' + n;
const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const inWindow = (now, target, win) => Math.abs(m(now) - m(target)) <= win;
const m = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

const res = await fetch(`https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN}/latest`, {
  headers: { 'X-Master-Key': process.env.JSONBIN_KEY, 'Content-Type': 'application/json' },
});
const json = await res.json();
const data = json.record || json;
const tasks = data.tasks || [];
const subs = data.pushSubscriptions || [];
const s = data.notifySettings || { overdueTime: '09:00', todayTime: '08:00', tomorrowTime: '20:00', defaultReminderMinutes: 15 };

if (subs.length === 0) { console.log('No subscriptions'); process.exit(0); }

const now = new Date();
const nowHHMM = hhmm(now);
const today = now.toISOString().slice(0, 10);
const W = 5;
const notes = [];

if (inWindow(nowHHMM, s.overdueTime, W)) {
  const o = tasks.filter(t => !t.solved && !t.deleted && t.date && t.date < today);
  if (o.length) notes.push({ title: '⚠️ Просроченные задачи', body: o.slice(0,3).map(t=>t.title).join(', ') + (o.length>3 ? '...' : '') });
}
if (inWindow(nowHHMM, s.todayTime, W)) {
  const td = tasks.filter(t => !t.solved && !t.deleted && t.date === today);
  if (td.length) {
    const ti = td.filter(t=>t.time).map(t=>`${t.title} в ${t.time}`).join(', ');
    notes.push({ title: '📋 Задачи на сегодня', body: ti || td.slice(0,3).map(t=>t.title).join(', ') + (td.length>3 ? '...' : '') });
  }
}
const tom = new Date(now); tom.setDate(tom.getDate()+1);
if (inWindow(nowHHMM, s.tomorrowTime, W)) {
  const tm = tasks.filter(t => !t.solved && !t.deleted && t.date === tom.toISOString().slice(0,10));
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

let sent = 0;
for (const n of notes) {
  for (const sub of subs) {
    try { await webpush.sendNotification(sub, JSON.stringify(n), { TTL: 86400 }); sent++; } catch (e) {}
  }
}
console.log(`Notes: ${notes.length}, Sent: ${sent}, Subs: ${subs.length}`);
