// Shared by the Vercel functions (files starting with "_" are not public routes).
const webpush = require("web-push");

const SUPABASE_URL = "https://syslsrbadozvjpfhhaog.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5c2xzcmJhZG96dmpwZmhoYW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NzIyMDEsImV4cCI6MjEwNzU0ODIwMX0.HrNoUsH5hCffg6HT5ZMbtbFeavXLOMYKt0phtLiR5zA";
const VAPID_PUBLIC_KEY = "BGRVzTYXrmST2JcU8zjTNSWvmoT3kx_ymTETnqiUOU8YS-Lb029x_uQr_33jFNSenYvjEex5RoJ4zs2p3fqA77c";

const db = (path, init = {}) => fetch(SUPABASE_URL + "/rest/v1/" + path, {
  ...init, headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", ...(init.headers || {}) }
});
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

function addMessage(by, names){
  const who = by || "Alguém";
  if (names.length === 1) return who + " adicionou " + names[0] + " na lista";
  const shown = names.slice(0, 6).join(", ");
  return who + " adicionou na lista: " + shown + (names.length > 6 ? " e mais " + (names.length - 6) : "");
}
function finishMessage(by, bought, missing){
  const who = by || "Alguém";
  let msg = who + " finalizou a compra: " + bought + (bought === 1 ? " item comprado" : " itens comprados");
  if (missing.length) msg += ". Em falta: " + missing.slice(0, 4).join(", ") + (missing.length > 4 ? " e mais " + (missing.length - 4) : "");
  return msg;
}

// Sends one notification to every registered phone that `keep` accepts.
async function sendPush(keep, body){
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) throw Object.assign(new Error("VAPID_PRIVATE_KEY is not set in Vercel"), { status: 500 });
  webpush.setVapidDetails("https://lista.app", VAPID_PUBLIC_KEY, priv.trim());
  const r = await db("push_subs?select=endpoint,device,name,sub");
  if (!r.ok) throw Object.assign(new Error("Could not read push_subs (" + r.status + ")"), { status: 500 });
  const subs = (await r.json()).filter(keep);
  const payload = JSON.stringify({ title: "Lista", body });
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try { await webpush.sendNotification(s.sub, payload, { TTL: 60 * 60 * 12, urgency: "normal" }); sent++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db("push_subs?endpoint=eq." + encodeURIComponent(s.endpoint), { method: "DELETE" });
      else console.warn("push failed", e.statusCode, e.body);
    }
  }));
  return { sent, of: subs.length };
}

function readBody(req){
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

module.exports = { db, clip, addMessage, finishMessage, sendPush, readBody };
