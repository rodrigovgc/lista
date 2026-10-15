// Vercel function for Siri / Shortcuts: adds items to the list by name.
// POST {"item": "leite e pão", "by": "Rodrigo"}  →  plain text that Siri reads out.
const { db, clip, addMessage, sendPush, readBody } = require("./_shared.js");
const { guessCat, norm } = require("../cats.js");

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// Compare word by word, ignoring accents, case and a final "s" ("ovos" matches "Ovo").
const words = s => norm(s).split(/[^a-z0-9+]+/).filter(Boolean).map(w => w.length > 3 ? w.replace(/s$/, "") : w);
const key = s => words(s).join(" ");
const joinPt = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1];

function splitItems(text){
  return String(text || "")
    .replace(/^\s*(adicion(ar|e|a)|coloc(ar|a|e)|bot(ar|a|e)|add)\s+/i, "")
    .replace(/\s+(na|à|a)\s+lista\.?\s*$/i, "")
    .split(/\s*,\s*|\s+e\s+|\s+and\s+|\n+/i)
    .map(s => clip(s.replace(/[.!?]+$/, ""), 80)).filter(Boolean).slice(0, 20).map(cap);
}

// Siri usually writes "leite ovos café" with no commas. Split such a phrase:
//  1. the longest run of words that is a catalog item (or the start of a longer one, "coca zero") is one item;
//  2. otherwise a grocery word ("leite", "pão") starts a new item, unless it follows "de/com/sem…"
//     ("pão de queijo", "água com gás" stay whole).
const LINK = new Set(["de", "do", "da", "dos", "das", "com", "sem", "para", "ao", "a", "em", "no", "na"]);
function segment(chunk, catalogKeys, prefixKeys, maxLen){
  const raw = chunk.split(/\s+/).filter(Boolean);
  if (raw.length < 2) return [chunk];
  const w = raw.map(x => key(x));
  const out = []; let buf = [];
  const flush = () => { if (buf.length) { out.push(buf.join(" ")); buf = []; } };
  for (let i = 0; i < raw.length;){
    const afterLink = buf.length && LINK.has(w[i - 1]);
    let hit = 0;
    if (!afterLink) for (let n = Math.min(maxLen, raw.length - i); n >= 1; n--){
      const k = w.slice(i, i + n).join(" ");
      if (catalogKeys.has(k) || (n >= 2 && prefixKeys.has(k))) { hit = n; break; }
    }
    if (hit) { flush(); out.push(raw.slice(i, i + hit).join(" ")); i += hit; continue; }
    const startsItem = !afterLink && !LINK.has(w[i]) && guessCat(raw[i]) !== "Outros";
    if (startsItem) flush();
    buf.push(raw[i]); i++;
  }
  flush();
  return out.map(cap);
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
  const catalogKeys = new Set(items.map(i => key(i.name)));
  const prefixKeys = new Set(items.flatMap(i => { const ws = words(i.name); return ws.slice(2).map((_, k) => ws.slice(0, k + 2).join(" ")); }));
  const maxLen = Math.max(1, ...items.map(i => words(i.name).length));
  const all = [];
  for (const chunk of wanted) for (const part of segment(chunk, catalogKeys, prefixKeys, maxLen)) if (!all.some(a => key(a) === key(part))) all.push(part);

  const added = [], already = [];
  for (const w of all){
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
