// Vercel function: sends a push notification to the other phones when items are put on the list.
// Needs one environment variable in Vercel: VAPID_PRIVATE_KEY.
const webpush = require("web-push");

const SUPABASE_URL = "https://syslsrbadozvjpfhhaog.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5c2xzcmJhZG96dmpwZmhoYW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NzIyMDEsImV4cCI6MjEwNzU0ODIwMX0.HrNoUsH5hCffg6HT5ZMbtbFeavXLOMYKt0phtLiR5zA";
const VAPID_PUBLIC_KEY = "BGRVzTYXrmST2JcU8zjTNSWvmoT3kx_ymTETnqiUOU8YS-Lb029x_uQr_33jFNSenYvjEex5RoJ4zs2p3fqA77c";

const db = (path, init = {}) => fetch(SUPABASE_URL + "/rest/v1/" + path, {
  ...init, headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, ...(init.headers || {}) }
});
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

function message(by, names){
  const who = by || "Alguém";
  if (names.length === 1) return who + " botou " + names[0] + " na lista";
  const shown = names.slice(0, 6).join(", ");
  return who + " botou na lista: " + shown + (names.length > 6 ? " e mais " + (names.length - 6) : "");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) return res.status(500).json({ error: "VAPID_PRIVATE_KEY is not set in Vercel" });
  webpush.setVapidDetails("https://lista.app", VAPID_PUBLIC_KEY, priv.trim());

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const device = clip(body.device, 64);
  if (!device) return res.status(400).json({ error: "device missing" });
  const test = body.test === true;
  const names = Array.isArray(body.names) ? body.names.map(n => clip(n, 80)).filter(Boolean).slice(0, 40) : [];
  if (!test && !names.length) return res.status(200).json({ sent: 0 });

  const r = await db("push_subs?select=endpoint,device,sub");
  if (!r.ok) return res.status(500).json({ error: "Could not read push_subs (" + r.status + ")" });
  const subs = (await r.json()).filter(s => test ? s.device === device : s.device !== device);

  const payload = JSON.stringify(test
    ? { title: "Lista", body: "Notificações ativadas. Você vai saber quando alguém botar algo na lista." }
    : { title: "Lista", body: message(clip(body.by, 30), names) });

  let sent = 0;
  await Promise.all(subs.map(async s => {
    try { await webpush.sendNotification(s.sub, payload, { TTL: 60 * 60 * 12, urgency: "normal" }); sent++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db("push_subs?endpoint=eq." + encodeURIComponent(s.endpoint), { method: "DELETE" });
      else console.warn("push failed", e.statusCode, e.body);
    }
  }));
  res.status(200).json({ sent, of: subs.length });
};
