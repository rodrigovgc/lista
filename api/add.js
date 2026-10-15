// Vercel function for Siri / Shortcuts: adds items to the list by name.
// POST {"item": "leite e pão", "by": "Rodrigo"}  →  plain text that Siri reads out.
const { db, clip, addMessage, sendPush, readBody } = require("./_shared.js");
const { guessCat, norm } = require("../cats.js");

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const key = s => norm(s).replace(/s$/, "");            // "ovos" matches "Ovo"
const joinPt = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1];

function splitItems(text){
  return String(text || "")
    .replace(/^\s*(adicion(ar|e|a)|coloc(ar|a|e)|bot(ar|a|e)|add)\s+/i, "")
    .replace(/\s+(na|à|a)\s+lista\.?\s*$/i, "")
    .split(/\s*,\s*|\s+e\s+|\s+and\s+|\n+/i)
    .map(s => clip(s.replace(/[.!?]+$/, ""), 80)).filter(Boolean).slice(0, 20).map(cap);
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  if (req.method !== "POST") return res.status(405).send("Use POST.");
  const body = readBody(req);
  const by = clip(body.by, 30);
  const wanted = splitItems(body.item || body.items || body.text);
  if (!wanted.length) return res.status(400).send("Não entendi o que adicionar.");

  const r = await db("items?select=id,name,state");
  if (!r.ok) return res.status(500).send("Não consegui abrir a lista agora.");
  const items = await r.json();

  const added = [], already = [];
  for (const w of wanted){
    const hit = items.find(i => key(i.name) === key(w));
    const now = Date.now();
    if (hit && (hit.state === "list" || hit.state === "cart")) { already.push(hit.name); continue; }
    if (hit){
      const u = await db("items?id=eq." + encodeURIComponent(hit.id), { method: "PATCH", body: JSON.stringify({ state: "list", added_at: now }) });
      if (u.ok) { added.push(hit.name); hit.state = "list"; }
    } else {
      const id = "i" + now.toString(36) + Math.random().toString(36).slice(2, 8);
      const row = { id, name: w, cat: guessCat(w), state: "list", count: 0, last_at: 0, added_at: now, cart_at: 0 };
      const u = await db("items", { method: "POST", body: JSON.stringify(row) });
      if (u.ok) { added.push(w); items.push(row); }
    }
  }

  if (added.length){
    const me = norm(by);
    try { await sendPush(s => !me || norm(s.name) !== me, addMessage(by, added)); } catch (e) { console.warn(e.message); }
  }

  const parts = [];
  if (added.length) parts.push(joinPt(added) + (added.length === 1 ? " adicionado na lista." : " adicionados na lista."));
  if (already.length) parts.push(joinPt(already) + (already.length === 1 ? " já estava na lista." : " já estavam na lista."));
  if (!parts.length) parts.push("Não consegui adicionar agora. Tente de novo.");
  res.status(200).send(parts.join(" "));
};
