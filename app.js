"use strict";
/* Lista — shared grocery list. Data lives in Supabase; a copy and any unsent changes live on the phone so it works offline. */

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const I_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const I_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>';
const I_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

/* ---------- local storage ---------- */
const LS = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};

const S = {
  items: new Map(LS.get("lista.items", []).map(r => [r.id, r])),
  cards: new Map(LS.get("lista.cards", []).map(r => [r.id, r])),
  settings: new Map(LS.get("lista.settings", []).map(r => [r.id, r])),
  outbox: LS.get("lista.outbox", []),
  collapsed: new Set(LS.get("lista.collapsed", [])),
  tab: LS.get("lista.tab", "lista"),
  q: "", cq: "", sugIdx: -1, openCart: false, shell: null,
  online: navigator.onLine, loadedOnce: LS.get("lista.items", null) !== null
};
function persist(){
  LS.set("lista.items", [...S.items.values()]);
  LS.set("lista.cards", [...S.cards.values()]);
  LS.set("lista.settings", [...S.settings.values()]);
  LS.set("lista.outbox", S.outbox);
}

/* ---------- Supabase + sync ---------- */
const CONFIG = window.LISTA_CONFIG || {};
const configured = CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && !/COLE|PASTE/.test(CONFIG.supabaseUrl + CONFIG.supabaseAnonKey);
const sb = configured && window.supabase ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: false } }) : null;

const tableMap = t => t === "items" ? S.items : t === "cards" ? S.cards : S.settings;
function newId(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function queueWrite(table, id, patch, isNew){
  const m = tableMap(table);
  m.set(id, { ...(m.get(id) || { id }), ...patch });
  const op = S.outbox.find(o => o.table === table && o.id === id && o.type !== "delete" && !o.sending);
  if (op) Object.assign(op.patch, patch);
  else S.outbox.push({ table, id, type: isNew ? "insert" : "update", patch: { ...patch } });
  persist(); render(); flush();
}
function queueDelete(table, id){
  tableMap(table).delete(id);
  S.outbox = S.outbox.filter(o => !(o.table === table && o.id === id && !o.sending));
  S.outbox.push({ table, id, type: "delete" });
  persist(); render(); flush();
}
const isNetErr = e => !e || !e.code || /fetch|network|load failed|timeout/i.test(e.message || "");
let flushing = false;
async function flush(){
  if (!sb || flushing || !navigator.onLine) { setSync(); return; }
  flushing = true; setSync();
  try {
    while (S.outbox.length){
      const op = S.outbox[0]; op.sending = true;
      let r;
      try {
        if (op.type === "insert") r = await sb.from(op.table).upsert({ id: op.id, ...op.patch });
        else if (op.type === "update") r = await sb.from(op.table).update(op.patch).eq("id", op.id);
        else r = await sb.from(op.table).delete().eq("id", op.id);
      } catch(e){ r = { error: { message: String(e) } }; }
      if (r.error){
        if (isNetErr(r.error)) { op.sending = false; break; }
        console.warn("Lista: write rejected", r.error);
        toast("Uma alteração não foi salva no servidor.");
      }
      S.outbox.shift(); persist();
    }
  } finally { flushing = false; setSync(); }
}
function applyOutboxLocally(){
  for (const op of S.outbox){
    const m = tableMap(op.table);
    if (op.type === "delete") m.delete(op.id);
    else m.set(op.id, { ...(m.get(op.id) || { id: op.id }), ...op.patch });
  }
}
let loading = null;
async function load(){
  if (!sb) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const [a, b, c] = await Promise.all([sb.from("items").select("*"), sb.from("cards").select("*"), sb.from("settings").select("*")]);
      if (!a.error) S.items = new Map(a.data.map(r => [r.id, r]));
      if (!b.error) S.cards = new Map(b.data.map(r => [r.id, r]));
      if (!c.error && Array.isArray(c.data)) S.settings = new Map(c.data.map(r => [r.id, r]));
      if (!a.error || !b.error){ applyOutboxLocally(); S.loadedOnce = true; persist(); render(); }
    } catch(e){}
    loading = null;
  })();
  return loading;
}
function onRemote(table, p){
  const id = (p.new && p.new.id) || (p.old && p.old.id);
  if (!id || S.outbox.some(o => o.table === table && o.id === id)) return;
  const m = tableMap(table);
  if (p.eventType === "DELETE") m.delete(id); else m.set(id, p.new);
  persist(); render();
}
function startRealtime(){
  if (!sb) return;
  sb.channel("lista")
    .on("postgres_changes", { event: "*", schema: "public", table: "items" }, p => onRemote("items", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, p => onRemote("cards", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, p => onRemote("settings", p))
    .subscribe(st => { if (st === "SUBSCRIBED") load(); });
}
window.addEventListener("online", () => { S.online = true; flush(); load(); });
window.addEventListener("offline", () => { S.online = false; setSync(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible"){ flush(); load(); } });

function setSync(){
  const el = $("#sync"); if (!el) return;
  const pending = S.outbox.length;
  el.className = "sync";
  if (!sb) { el.textContent = "Não configurado"; el.className = "sync warn"; }
  else if (!navigator.onLine) { el.textContent = pending ? "Sem internet · salvo no celular" : "Sem internet"; el.className = "sync warn"; }
  else if (pending) el.textContent = "Salvando…";
  else el.textContent = "";
}

/* ---------- item helpers ---------- */
const itemsArr = () => [...S.items.values()];
const byState = st => itemsArr().filter(i => i.state === st);
const onList = i => i.state === "list" || i.state === "cart" || i.state === "next";
const emojiOf = i => i.emoji || guessEmoji(i.name, i.cat);
const EMOJI_PICK = "🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🧄 🧅 🥔 🍠 🫚 🍄 🫘 🌿 🎃 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🥛 🧀 🧈 🥚 🍦 🍨 🥩 🍗 🍖 🥓 🌭 🍔 🐟 🍤 🦐 🍚 🍝 🌾 🥫 🍯 🫒 🧂 🥜 ☕ 🍵 🧃 🥤 💧 🍺 🍷 🍫 🍪 🍿 🍬 🍰 🧁 🍕 🍱 🍲 🧊 🧻 🧼 🪥 🧴 🧽 🧺 🗑️ 🧹 🪒 🩹 💊 🐶 🐱 👶 🛒".split(" ");
function firstEmoji(str){
  const t = String(str || "").trim(); if (!t) return "";
  try { const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" }); const g = [...seg.segment(t)][0]; return g ? g.segment : ""; }
  catch(e){ return [...t][0] || ""; }
}

function setItem(id, patch){ if (S.items.has(id)) queueWrite("items", id, patch, false); }
function createItem(name){
  name = name.trim(); if (!name) return;
  const ex = itemsArr().find(i => norm(i.name) === norm(name));
  if (ex) { addExisting(ex); return; }
  const id = newId("i");
  const row = { name, cat: guessCat(name), state: "list", count: 0, last_at: 0, added_at: Date.now(), cart_at: 0 };
  queueWrite("items", id, row, true);
  noteAdded(id);
  toast(`Na lista, em ${row.cat}`, "Mudar", () => openItemSheet(id));
}
function addExisting(it){
  if (!it) return;
  if (it.state === "list") { toast(`${it.name} já está na lista`); return; }
  if (it.state === "cart") { toast(`${it.name} já está no carrinho`); return; }
  const wasNext = it.state === "next";
  setItem(it.id, { state: "list", added_at: Date.now() });
  if (!wasNext) noteAdded(it.id);
  if (wasNext) toast(`${it.name} voltou para esta compra`);
}
function toggleCatalog(it){
  if (!it) return;
  if (it.state === "catalog") { setItem(it.id, { state: "list", added_at: Date.now() }); noteAdded(it.id); }
  else if (it.state === "list") setItem(it.id, { state: "catalog" });
  else if (it.state === "next") { setItem(it.id, { state: "list", added_at: Date.now() }); toast(`${it.name} voltou para esta compra`); }
  else toast(`${it.name} já está no carrinho`);
}
function removeFromList(id){
  const it = S.items.get(id); if (!it) return;
  const prev = it.state;
  setItem(id, { state: "catalog" });
  toast(`${it.name} saiu da lista`, "Desfazer", () => setItem(id, { state: prev }));
}
function deleteItem(id){
  const it = S.items.get(id); if (!it) return;
  const { id: _, ...row } = it;
  queueDelete("items", id);
  toast(`${it.name} apagado do catálogo`, "Desfazer", () => queueWrite("items", id, row, true));
}
function markNext(id){
  const it = S.items.get(id); if (!it) return;
  setItem(id, { state: "next" });
  toast(`${it.name} fica para a próxima`, "Desfazer", () => setItem(id, { state: "list" }));
}

/* ---------- autocomplete ---------- */
function score(it, q){
  const n = norm(it.name);
  let s;
  if (n.startsWith(q)) s = 100;
  else if (n.split(" ").some(w => w.startsWith(q))) s = 70;
  else if (n.includes(q)) s = 40;
  else return -1;
  return s + Math.min(it.count || 0, 20) * 2 + ((it.last_at || 0) > Date.now() - 30 * 864e5 ? 6 : 0);
}
function suggestions(raw){
  const q = norm(raw); if (!q) return [];
  return itemsArr().map(i => [i, score(i, q)]).filter(x => x[1] >= 0)
    .sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name, "pt")).slice(0, 6).map(x => x[0]);
}
function hl(name, raw){
  const q = norm(raw), n = norm(name), i = n.indexOf(q);
  if (!q || i < 0 || n.length !== name.length) return esc(name);
  return esc(name.slice(0, i)) + "<b>" + esc(name.slice(i, i + q.length)) + "</b>" + esc(name.slice(i + q.length));
}
const stateTag = it => it.state === "list" ? '<span class="tag on">na lista</span>'
  : it.state === "cart" ? '<span class="tag">no carrinho</span>'
  : it.state === "next" ? '<span class="tag next">próxima vez</span>' : "";
const exactExists = () => itemsArr().some(i => norm(i.name) === norm(S.q));
function sugMenu(){
  if (!S.q.trim()) return "";
  const sug = suggestions(S.q);
  return `<ul class="suggest" role="listbox">${sug.map((it, k) => `<li><button data-sug="${it.id}" class="${k === S.sugIdx ? "on" : ""}"><span class="em">${emojiOf(it)}</span><span class="nm">${hl(it.name, S.q)}</span>${stateTag(it) || `<span class="tag">${esc(it.cat)}</span>`}</button></li>`).join("")}
    ${exactExists() ? "" : `<li><button data-new="1" class="${S.sugIdx === sug.length ? "on" : ""}"><span class="em">＋</span><span class="nm">Adicionar “<b>${esc(S.q.trim())}</b>” na lista</span></button></li>`}</ul>`;
}

/* ---------- render ---------- */
function render(){
  const list = byState("list"), cart = byState("cart"), next = byState("next");
  $("#tabLista").textContent = list.length ? `Lista (${list.length})` : "Lista";
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === S.tab));
  $("#title").textContent = S.tab === "lista" ? "Lista" : S.tab === "catalogo" ? "Catálogo" : "Cartões";
  if (S.shell !== S.tab){
    $("#fieldHost").innerHTML = S.tab === "lista"
      ? `<div class="search">${I_SEARCH}<input id="addInput" type="text" placeholder="Adicionar na lista…" autocomplete="off" autocorrect="off" autocapitalize="sentences" enterkeyhint="done" aria-label="Adicionar item"><div id="sugHost"></div></div>`
      : S.tab === "catalogo" ? `<div class="search">${I_SEARCH}<input id="catInput" type="search" placeholder="Procurar" autocomplete="off" aria-label="Procurar no catálogo"></div>` : "";
    S.shell = S.tab;
    if ($("#addInput")) $("#addInput").value = S.q;
    if ($("#catInput")) $("#catInput").value = S.cq;
  }
  if ($("#sugHost")) $("#sugHost").innerHTML = sugMenu();
  $("#body").innerHTML = S.tab === "lista" ? viewLista(list, cart, next) : S.tab === "catalogo" ? viewCatalogo() : viewCartoes();
  const fin = $("#finish");
  if (S.tab === "lista" && (cart.length || next.length)){
    fin.hidden = false;
    fin.innerHTML = `Finalizar compra <small>${cart.length} ${cart.length === 1 ? "item" : "itens"}</small>`;
  } else fin.hidden = true;
  setSync();
  $("#bell").classList.toggle("on", !!LS.get("lista.pushOn", false));
}

function rowHTML(it, mode){
  const em = `<span class="em" aria-hidden="true">${emojiOf(it)}</span>`;
  if (mode === "list") return `<li class="row" data-id="${it.id}" data-swipe="remove"><div class="row-bg rm">Remover</div><div class="row-fg">
    <button class="chk" data-act="cart" aria-label="Pegar ${esc(it.name)}">${I_CHECK}</button>
    <div class="line">${em}<button class="name" data-act="sheet">${esc(it.name)}</button><button class="miss" data-act="next">Não tem</button></div></div></li>`;
  if (mode === "cart") return `<li class="row done" data-id="${it.id}"><div class="row-fg">
    <button class="chk on" data-act="uncart" aria-label="Tirar ${esc(it.name)} do carrinho">${I_CHECK}</button>
    <div class="line">${em}<button class="name" data-act="uncart">${esc(it.name)}</button></div></div></li>`;
  if (mode === "next") return `<li class="row" data-id="${it.id}"><div class="row-fg">
    <span class="chk next" aria-hidden="true"></span>
    <div class="line">${em}<button class="name" data-act="sheet">${esc(it.name)}</button><button class="miss" data-act="back">Achei</button></div></div></li>`;
  const on = onList(it);
  return `<li class="row" data-id="${it.id}" data-swipe="del"><div class="row-bg del">Apagar</div><div class="row-fg">
    <button class="chk ${on && it.state !== "next" ? "on" : ""} ${it.state === "next" ? "next" : ""}" data-act="toggle" aria-pressed="${on}" aria-label="${on ? "Tirar da lista" : "Adicionar na lista"}: ${esc(it.name)}">${I_CHECK}</button>
    <div class="line">${em}<button class="name" data-act="sheet">${esc(it.name)}</button>${it.state === "next" || it.state === "cart" ? stateTag(it) : ""}</div></div></li>`;
}
function groupBlock(key, title, count, inner, cls = ""){
  const open = !S.collapsed.has(key);
  return `<section class="grp"><button class="sec ${cls}" data-fold="${esc(key)}" aria-expanded="${open}"><h2>${esc(title)}<span class="n">${count}</span></h2>${I_CHEV}</button>${open ? inner : ""}</section>`;
}
function grouped(items, mode){
  const g = new Map(orderedCats().map(c => [c, []]));
  items.forEach(i => (g.get(i.cat) || g.get("Outros")).push(i));
  let h = "";
  for (const [c, arr] of g){
    if (!arr.length) continue;
    arr.sort(mode === "catalog" ? (a, b) => a.name.localeCompare(b.name, "pt") : (a, b) => (a.added_at || 0) - (b.added_at || 0));
    h += groupBlock(mode + ":" + c, c, arr.length, `<ul class="rows">${arr.map(i => rowHTML(i, mode)).join("")}</ul>`);
  }
  return h;
}
/* ---------- aisle order ---------- */
// One shared order of categories (the way you walk through the store), stored in Supabase.
function orderedCats(){
  const saved = (S.settings.get("cat_order") || {}).value;
  const list = Array.isArray(saved) ? saved.filter(c => CATS.includes(c)) : [];
  return [...list, ...CATS.filter(c => !list.includes(c))];
}
const aisleLink = () => `<button class="aisle-link" id="aisleBtn">Ordem dos corredores</button>`;
function openAisleSheet(){
  let order = orderedCats();
  const counts = {}; itemsArr().forEach(i => { if (i.state === "list") counts[i.cat] = (counts[i.cat] || 0) + 1; });
  const rows = () => order.map((c, k) => `<li class="ord" data-cat="${esc(c)}"><span class="ord-n">${k + 1}</span><span class="em">${CAT_EMOJI[c] || "🛒"}</span><span class="ord-name">${esc(c)}${counts[c] ? `<small>${counts[c]} na lista</small>` : ""}</span><span class="ord-handle" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 9h14M5 15h14"/></svg></span></li>`).join("");
  openSheet(`<h3>Ordem dos corredores</h3>
    <p class="foot-note" style="margin:0 4px;font-size:15px;color:var(--ink2)">Arraste as categorias na ordem em que vocês andam no mercado. A lista segue essa ordem nos dois celulares.</p>
    <ul class="ord-list" id="ordList">${rows()}</ul>
    <div class="acts"><button class="btn primary" id="ordSave">Salvar</button><button class="btn gray" data-close>Cancelar</button></div>
    <div class="group"><button id="ordReset">Voltar para a ordem padrão</button></div>`, el => {
    const ul = $("#ordList", el);
    const sync = () => { order = [...ul.children].map(li => li.dataset.cat); [...ul.children].forEach((li, k) => li.querySelector(".ord-n").textContent = k + 1); };
    let drag = null;
    ul.addEventListener("pointerdown", e => {
      const h = e.target.closest(".ord-handle"); if (!h) return;
      e.preventDefault();
      const li = h.closest(".ord"); const r = li.getBoundingClientRect();
      drag = { li, startY: e.clientY, h: r.height, pid: e.pointerId };
      li.classList.add("dragging"); try { ul.setPointerCapture(e.pointerId); } catch(_){}
    });
    ul.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.pid) return;
      e.preventDefault();
      const dy = e.clientY - drag.startY;
      drag.li.style.transform = `translateY(${dy}px)`;
      const steps = Math.trunc(dy / drag.h);
      if (steps !== 0){
        const sibs = [...ul.children], i = sibs.indexOf(drag.li), j = Math.max(0, Math.min(sibs.length - 1, i + steps));
        if (j !== i){
          ul.insertBefore(drag.li, j > i ? sibs[j].nextSibling : sibs[j]);
          drag.startY += (j - i) * drag.h; drag.li.style.transform = `translateY(${e.clientY - drag.startY}px)`;
          sync();
        }
      }
    });
    const end = () => { if (!drag) return; drag.li.classList.remove("dragging"); drag.li.style.transform = ""; drag = null; sync(); };
    ul.addEventListener("pointerup", end); ul.addEventListener("pointercancel", end);
    $("#ordSave", el).addEventListener("click", () => { queueWrite("settings", "cat_order", { value: order }, true); closeSheet(); toast("Ordem salva"); });
    $("#ordReset", el).addEventListener("click", () => { order = [...CATS]; ul.innerHTML = rows(); });
  });
}

function viewLista(list, cart, next){
  if (!sb) return setupNotice();
  if (!S.loadedOnce) return `<div class="empty"><strong>Carregando…</strong>A lista aparece em instantes.</div>`;
  let h = "";
  if (!list.length && !cart.length) h += `<div class="empty"><strong>Nada na lista</strong>Digite acima ou marque itens no Catálogo.</div>`;
  else if (!list.length) h += `<div class="empty"><strong>Tudo no carrinho</strong>Toque em Finalizar compra ao sair do mercado.</div>`;
  else h += grouped(list, "list");
  if (list.length && !LS.get("lista.hintSeen", false)) h += `<p class="hint">Toque no círculo quando pegar o item. Se o mercado não tem, toque em “Não tem”. Para tirar um item da lista, arraste para a esquerda.</p>`;
  if (next.length) h += groupBlock("x:next", "Próxima vez", next.length, `<ul class="rows">${next.map(i => rowHTML(i, "next")).join("")}</ul><p class="hint">Em falta no mercado. Volta para a lista quando você finalizar a compra.</p>`, "blue");
  if (cart.length){
    const open = S.openCart;
    h += `<section class="grp"><button class="sec" id="foldCart" aria-expanded="${open}"><h2>No carrinho<span class="n">${cart.length}</span></h2>${I_CHEV}</button>${open ? `<ul class="rows">${cart.sort((a, b) => (b.cart_at || 0) - (a.cart_at || 0)).map(i => rowHTML(i, "cart")).join("")}</ul>` : ""}</section>`;
  }
  if (list.length > 1) h += aisleLink();
  return h;
}
function viewCatalogo(){
  if (!sb) return setupNotice();
  if (!S.loadedOnce) return `<div class="empty"><strong>Carregando…</strong></div>`;
  const q = norm(S.cq);
  const items = itemsArr().filter(i => !q || norm(i.name).includes(q) || norm(i.cat).includes(q));
  const top = itemsArr().filter(i => (i.count || 0) >= 2).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt")).slice(0, 12);
  let h = "";
  if (!q && top.length) h += `<section class="grp"><div class="sec" style="cursor:default"><h2>Sempre compramos</h2></div><div class="chips">${top.map(i => `<button class="chip ${onList(i) && i.state !== "next" ? "on" : ""} ${i.state === "next" ? "next" : ""}" data-chip="${i.id}">${emojiOf(i)} ${esc(i.name)}</button>`).join("")}</div></section>`;
  if (!S.items.size) h += `<div class="empty"><strong>Catálogo vazio</strong>Tudo o que vocês adicionarem na lista fica guardado aqui.</div>`;
  else if (!items.length) h += `<div class="empty"><strong>Nada encontrado</strong><button class="btn gray" data-newcat="1">Adicionar “${esc(S.cq.trim())}” na lista</button></div>`;
  else h += grouped(items, "catalog");
  if (items.length && !q) h += aisleLink();
  return h;
}
function viewCartoes(){
  if (!sb) return setupNotice();
  const cards = [...S.cards.values()].sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99) || a.name.localeCompare(b.name));
  if (!cards.length) return `<div class="empty"><strong>Nenhum cartão</strong>Toque em + e tire uma foto do cartão do mercado.</div>`;
  return `<div class="cards">${cards.map(c => `<button class="card" data-card="${c.id}"><span class="face">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : esc(c.name)}</span><span class="lbl">${esc(c.name)}</span></button>`).join("")}</div>
    <p class="hint">Toque num cartão para mostrar o código no caixa.</p>`;
}
function setupNotice(){
  return `<div class="empty"><strong>Falta conectar o Supabase</strong>Abra o arquivo config.js e cole a URL e a chave “anon” do seu projeto Supabase.</div>`;
}

/* ---------- events ---------- */
document.querySelector("nav.tabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-tab]"); if (!b) return;
  if (S.tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  S.tab = b.dataset.tab; S.q = ""; S.sugIdx = -1; LS.set("lista.tab", S.tab);
  render(); window.scrollTo(0, 0);
});
$("#fab").addEventListener("click", () => {
  if (S.tab === "cartoes") { openCardSheet(null); return; }
  if (S.tab === "catalogo") { S.tab = "lista"; LS.set("lista.tab", S.tab); render(); }
  window.scrollTo({ top: 0 }); $("#addInput")?.focus();
});
$("#fieldHost").addEventListener("input", e => {
  if (e.target.id === "addInput") { S.q = e.target.value; S.sugIdx = -1; $("#sugHost").innerHTML = sugMenu(); }
  if (e.target.id === "catInput") { S.cq = e.target.value; render(); }
});
$("#fieldHost").addEventListener("keydown", e => {
  if (e.target.id !== "addInput") return;
  const sug = suggestions(S.q), max = sug.length + (exactExists() ? 0 : 1) - 1;
  if (e.key === "ArrowDown") { e.preventDefault(); S.sugIdx = Math.min(max, S.sugIdx + 1); $("#sugHost").innerHTML = sugMenu(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); S.sugIdx = Math.max(-1, S.sugIdx - 1); $("#sugHost").innerHTML = sugMenu(); }
  else if (e.key === "Escape") { clearAdd(); }
  else if (e.key === "Enter") {
    e.preventDefault(); if (!S.q.trim()) return;
    const exact = sug.find(i => norm(i.name) === norm(S.q));
    const pick = S.sugIdx >= 0 && S.sugIdx < sug.length ? sug[S.sugIdx] : (S.sugIdx < 0 ? exact : null);
    const text = S.q; clearAdd();
    if (pick) addExisting(pick); else createItem(text);
  }
});
function clearAdd(){ S.q = ""; S.sugIdx = -1; const i = $("#addInput"); if (i) i.value = ""; if ($("#sugHost")) $("#sugHost").innerHTML = ""; }
$("#fieldHost").addEventListener("click", e => {
  const s = e.target.closest("[data-sug]");
  if (s) { const it = S.items.get(s.dataset.sug); clearAdd(); addExisting(it); $("#addInput")?.focus(); return; }
  if (e.target.closest("[data-new]")) { const t = S.q; clearAdd(); createItem(t); $("#addInput")?.focus(); }
});
document.addEventListener("pointerdown", e => { if (S.q && !e.target.closest(".search")) { $("#sugHost") && ($("#sugHost").innerHTML = ""); } });

let swiped = false;
$("#body").addEventListener("click", e => {
  if (swiped) { swiped = false; return; }
  const fold = e.target.closest("[data-fold]");
  if (fold) { const k = fold.dataset.fold; S.collapsed.has(k) ? S.collapsed.delete(k) : S.collapsed.add(k); LS.set("lista.collapsed", [...S.collapsed]); render(); return; }
  if (e.target.closest("#foldCart")) { S.openCart = !S.openCart; render(); return; }
  if (e.target.closest("#aisleBtn")) { openAisleSheet(); return; }
  if (e.target.closest("[data-newcat]")) { const v = S.cq; S.cq = ""; $("#catInput").value = ""; createItem(v); return; }
  const card = e.target.closest("[data-card]"); if (card) { openScan(card.dataset.card); return; }
  const chip = e.target.closest("[data-chip]"); if (chip) { toggleCatalog(S.items.get(chip.dataset.chip)); return; }
  const btn = e.target.closest("[data-act]"); if (!btn) return;
  const id = btn.closest("[data-id]").dataset.id, it = S.items.get(id); if (!it) return;
  const act = btn.dataset.act;
  if (act === "cart") { setItem(id, { state: "cart", cart_at: Date.now() }); LS.set("lista.hintSeen", true); }
  else if (act === "uncart") setItem(id, { state: "list" });
  else if (act === "next") markNext(id);
  else if (act === "back") setItem(id, { state: "list", added_at: Date.now() });
  else if (act === "toggle") toggleCatalog(it);
  else if (act === "sheet") openItemSheet(id);
});
$("#finish").addEventListener("click", openFinish);

/* swipe left on a list row = remove from list; in the catalog = delete */
(function(){
  let st = null;
  const body = $("#body");
  body.addEventListener("pointerdown", e => {
    const fg = e.target.closest(".row-fg"), row = fg && fg.closest(".row");
    if (!fg || !row.querySelector(".row-bg")) return;
    st = { fg, id: row.dataset.id, act: row.dataset.swipe, x: e.clientX, y: e.clientY, dx: 0, on: false, pid: e.pointerId };
  });
  body.addEventListener("pointermove", e => {
    if (!st || e.pointerId !== st.pid) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.on){
      if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.3){ st.on = true; st.fg.classList.add("drag"); try { st.fg.setPointerCapture(e.pointerId); } catch(_){} }
      else if (Math.abs(dy) > 10 || dx > 10){ st = null; return; }
      else return;
    }
    st.dx = Math.min(0, dx); st.fg.style.transform = `translateX(${st.dx}px)`;
  });
  const end = () => {
    if (!st) return; const s = st; st = null;
    if (!s.on) return;
    swiped = true; setTimeout(() => swiped = false, 350);
    s.fg.classList.remove("drag");
    if (s.dx < -90){ s.fg.style.transform = "translateX(-110%)"; setTimeout(() => s.act === "del" ? deleteItem(s.id) : removeFromList(s.id), 170); }
    else s.fg.style.transform = "";
  };
  body.addEventListener("pointerup", end); body.addEventListener("pointercancel", end);
})();

/* ---------- sheets ---------- */
let sheetEl = null;
function openSheet(html, onMount){
  closeSheet();
  sheetEl = document.createElement("div"); sheetEl.className = "scrim";
  // The title stays pinned at the top with a close button; the rest scrolls under it.
  const m = html.match(/^\s*<h3>([\s\S]*?)<\/h3>/);
  const title = m ? m[1] : "", rest = m ? html.slice(m[0].length) : html;
  sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-head"><div class="grab"></div><div class="sheet-bar"><h3>${title}</h3><button class="sheet-x" data-close aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg></button></div></div>${rest}</div>`;
  sheetEl.addEventListener("click", e => { if (e.target === sheetEl || e.target.closest("[data-close]")) closeSheet(); });
  document.body.appendChild(sheetEl); onMount && onMount(sheetEl);
}
function closeSheet(){ if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); closeScan(); } });

function openItemSheet(id){
  const it = S.items.get(id); if (!it) return;
  const opts = CATS.map(c => `<option ${c === it.cat ? "selected" : ""}>${esc(c)}</option>`).join("");
  const acts = it.state === "list" ? `<button data-a="next">Não tem, fica para a próxima</button><button data-a="catalog">Tirar da lista</button>`
    : it.state === "next" ? `<button data-a="list">Voltar para esta compra</button><button data-a="catalog">Tirar da lista</button>`
    : it.state === "cart" ? `<button data-a="list">Tirar do carrinho</button>`
    : `<button data-a="list">Adicionar na lista</button>`;
  let emoji = it.emoji || null;
  openSheet(`<h3>${esc(it.name)}</h3>
    <div class="group">${acts}</div>
    <div class="group"><label><span class="k">Nome</span><input type="text" id="eName" value="${esc(it.name)}"></label>
      <label><span class="k">Categoria</span><select id="eCat">${opts}</select></label>
      <button type="button" id="eEmojiBtn" class="emoji-row"><span class="k">Emoji</span><span class="emoji-cur" id="eEmoji">${emojiOf(it)}</span></button></div>
    <div class="emoji-panel" id="ePanel" hidden>
      ${(() => { const used = [...new Set(itemsArr().map(emojiOf))]; const rest = EMOJI_PICK.filter(e => !used.includes(e));
        const btn = e => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`;
        return `<div class="emoji-grid"><p class="emoji-h">Usados no catálogo</p>${used.map(btn).join("")}<p class="emoji-h">Mais</p>${rest.map(btn).join("")}</div>`; })()}
      <div class="group"><label><span class="k">Outro</span><input type="text" id="eEmojiType" placeholder="Toque e use o teclado 😀" autocomplete="off"></label>
        <button type="button" id="eEmojiAuto">Usar automático</button></div>
    </div>
    <div class="acts"><button class="btn primary" data-a="save">Salvar</button><button class="btn gray" data-close>Fechar</button></div>
    <div class="group"><button class="red" data-a="del" id="delBtn">Apagar do catálogo</button></div>`, el => {
    const showEmoji = () => { $("#eEmoji", el).textContent = emoji || guessEmoji($("#eName", el).value || it.name, $("#eCat", el).value); };
    $("#eEmojiBtn", el).addEventListener("click", () => { const p = $("#ePanel", el); p.hidden = !p.hidden; });
    $("#ePanel", el).addEventListener("click", e => {
      const b = e.target.closest("[data-emoji]"); if (!b) return;
      emoji = b.dataset.emoji; showEmoji(); $("#ePanel", el).hidden = true;
    });
    $("#eEmojiType", el).addEventListener("input", e => { const v = firstEmoji(e.target.value); if (v) { emoji = v; e.target.value = v; showEmoji(); } });
    $("#eEmojiAuto", el).addEventListener("click", () => { emoji = null; showEmoji(); $("#ePanel", el).hidden = true; });
    $("#eCat", el).addEventListener("change", showEmoji);
    el.addEventListener("click", e => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      if (a === "save"){
        const name = $("#eName", el).value.trim(), cat = $("#eCat", el).value;
        if (!name) { $("#eName", el).focus(); return; }
        const dup = itemsArr().find(i => i.id !== id && norm(i.name) === norm(name));
        if (dup) { toast(`“${dup.name}” já existe no catálogo`); return; }
        const patch = { name, cat };
        if ((emoji || null) !== (it.emoji || null)) patch.emoji = emoji;
        setItem(id, patch); closeSheet();
      } else if (a === "del"){
        const b = $("#delBtn", el);
        if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "Toque de novo para apagar de vez"; return; }
        closeSheet(); deleteItem(id);
      } else {
        closeSheet();
        if (a === "next") markNext(id); else setItem(id, { state: a, ...(a === "list" ? { added_at: Date.now() } : {}) });
      }
    });
  });
}
function openFinish(){
  const cart = byState("cart"), next = byState("next"), list = byState("list");
  const lines = [`${cart.length} ${cart.length === 1 ? "item comprado volta" : "itens comprados voltam"} para o catálogo.`];
  if (next.length) lines.push(`${next.length} ${next.length === 1 ? "item em falta volta" : "itens em falta voltam"} para a lista.`);
  if (list.length) lines.push(`${list.length} ${list.length === 1 ? "item não marcado continua" : "itens não marcados continuam"} na lista.`);
  openSheet(`<h3>Finalizar compra</h3><p class="foot-note" style="margin:0 4px;font-size:15px;color:var(--ink2)">${lines.join("<br>")}</p>
    <div class="acts"><button class="btn primary" id="doFinish">Finalizar</button><button class="btn gray" data-close>Voltar</button></div>`, el => {
    $("#doFinish", el).addEventListener("click", () => {
      closeSheet(); const now = Date.now();
      cart.forEach(i => queueWrite("items", i.id, { state: "catalog", count: (i.count || 0) + 1, last_at: now }, false));
      next.forEach(i => queueWrite("items", i.id, { state: "list", added_at: now }, false));
      S.openCart = false; render(); toast("Compra finalizada");
      sendFinish(cart.length, next.map(i => i.name));
    });
  });
}

/* ---------- barcodes ---------- */
const JSB = { EAN13: "EAN13", EAN8: "EAN8", UPC: "UPC", CODE128: "CODE128", CODE39: "CODE39", ITF: "ITF" };
function codeSVG(format, code){
  if (!code) return "";
  if (format === "QR"){
    if (typeof qrcode !== "function") return "";
    const q = qrcode(0, "M"); q.addData(code); q.make();
    return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }).replace("<svg", '<svg class="qr" shape-rendering="crispEdges"');
  }
  if (typeof JsBarcode !== "function") return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try { JsBarcode(svg, code, { format: JSB[format] || "CODE128", displayValue: false, margin: 12, height: 110, width: 3, background: "#ffffff", lineColor: "#000000" }); }
  catch(e){ try { JsBarcode(svg, code, { format: "CODE128", displayValue: false, margin: 12, height: 110, width: 2.4 }); } catch(_){ return ""; } }
  svg.setAttribute("shape-rendering", "crispEdges");
  const w = parseFloat(svg.getAttribute("width")), h = parseFloat(svg.getAttribute("height"));
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.removeAttribute("width"); svg.removeAttribute("height"); svg.style.cssText = "";
  return svg.outerHTML;
}
function eanOk(d){ let t = 0; for (let i = 0; i < d.length - 1; i++) t += +d[i] * ((d.length - 1 - i) % 2 ? 3 : 1); return (10 - t % 10) % 10 === +d[d.length - 1]; }
function inferFormat(code, isQr, known){
  if (isQr) return "QR";
  if (known && known !== "QR") return known;
  if (/^\d{13}$/.test(code) && eanOk(code)) return "EAN13";
  if (/^\d{8}$/.test(code) && eanOk(code)) return "EAN8";
  if (/^\d{12}$/.test(code) && eanOk(code)) return "UPC";
  return "CODE128";
}
function groupDigits(s){ return /^\d{13}$/.test(s) ? `${s[0]} ${s.slice(1, 7)} ${s.slice(7)}` : /^\d{12}$/.test(s) ? `${s.slice(0, 6)} ${s.slice(6)}` : s; }

let scanEl = null, wake = null;
async function openScan(id){
  const c = S.cards.get(id); if (!c) return;
  closeScan();
  const num = c.display || (c.format === "QR" ? "" : groupDigits(c.code));
  const codeHTML = codeSVG(c.format, c.code);
  scanEl = document.createElement("div"); scanEl.className = "scan"; scanEl.setAttribute("role", "dialog"); scanEl.setAttribute("aria-label", c.name);
  scanEl.innerHTML = `<div class="bar"><button class="b" data-x>OK</button><button data-edit>Editar</button></div>
    <h2>${esc(c.name)}</h2>
    <div class="code" id="scanCode">${codeHTML || (c.photo ? `<img class="photo" src="${esc(c.photo)}" alt="Foto do cartão">` : "")}</div>
    ${num ? `<div class="num">${esc(num)}</div>` : ""}
    ${c.photo && codeHTML ? `<button class="alt" data-photo>Ver foto do cartão</button>` : ""}`;
  scanEl.addEventListener("click", e => {
    if (e.target.closest("[data-x]")) closeScan();
    else if (e.target.closest("[data-edit]")) { closeScan(); openCardSheet(id); }
    else if (e.target.closest("[data-photo]")){
      const box = $("#scanCode", scanEl), b = e.target.closest("[data-photo]");
      if (b.dataset.on) { box.innerHTML = codeHTML; b.textContent = "Ver foto do cartão"; delete b.dataset.on; }
      else { box.innerHTML = `<img class="photo" src="${esc(c.photo)}" alt="Foto do cartão">`; b.textContent = "Ver código"; b.dataset.on = 1; }
    }
  });
  document.body.appendChild(scanEl);
  try { wake = await navigator.wakeLock?.request("screen"); } catch(e){ wake = null; }
}
function closeScan(){ if (scanEl) { scanEl.remove(); scanEl = null; } try { wake && wake.release(); } catch(e){} wake = null; }

const NATIVE_FMT = { ean_13: "EAN13", ean_8: "EAN8", upc_a: "UPC", code_128: "CODE128", code_39: "CODE39", itf: "ITF", qr_code: "QR" };
const ZX_FMT = { EAN_13: "EAN13", EAN_8: "EAN8", UPC_A: "UPC", CODE_128: "CODE128", CODE_39: "CODE39", ITF: "ITF", QR_CODE: "QR" };
async function decodeImage(img){
  if ("BarcodeDetector" in window){
    try { const d = new BarcodeDetector({ formats: Object.keys(NATIVE_FMT) }); const r = await d.detect(img);
      if (r && r[0]) return { code: r[0].rawValue, format: NATIVE_FMT[r[0].format] || "CODE128" }; } catch(e){}
  }
  if (!window.ZXing) return null;
  const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  const reader = new ZXing.MultiFormatReader(); reader.setHints(hints);
  for (const max of [1400, 900, 2000]) for (const rot of [0, 90]){
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const cv = document.createElement("canvas"); cv.width = rot ? h : w; cv.height = rot ? w : h;
    const cx = cv.getContext("2d");
    if (rot) { cx.translate(h, 0); cx.rotate(Math.PI / 2); }
    cx.drawImage(img, 0, 0, w, h);
    try {
      const lum = new ZXing.HTMLCanvasElementLuminanceSource(cv);
      const r = reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum)));
      return { code: r.getText(), format: ZX_FMT[ZXing.BarcodeFormat[r.getBarcodeFormat()]] || "CODE128" };
    } catch(e){}
  }
  return null;
}
function loadImage(file){ return new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); }
function photoDataUrl(img){
  const s = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.8);
}

function openCardSheet(id){
  const c = id ? S.cards.get(id) : null;
  const draft = { name: c?.name || "", code: c?.code || "", format: c?.format || null, display: c?.display || "", photo: c?.photo || null };
  openSheet(`<h3>${c ? "Editar cartão" : "Novo cartão"}</h3>
    <div class="group"><button id="pickPhoto">${c ? "Trocar a foto" : "Tirar foto ou escolher imagem"}</button></div>
    <p class="foot-note" id="cStatus">${c ? "" : "Fotografe o cartão de frente, com o código bem visível. O app lê o código sozinho."}</p>
    <div class="preview" id="cPrev" hidden></div>
    <div class="group">
      <label><span class="k">Nome</span><input type="text" id="cName" placeholder="Delhaize" value="${esc(draft.name)}"></label>
      <label><span class="k">Código</span><input type="text" id="cCode" placeholder="Números do código" value="${esc(draft.code)}"></label>
      <label class="check"><span class="k">Código quadrado (QR)</span><input type="checkbox" id="cQr" ${draft.format === "QR" ? "checked" : ""}></label>
      <label><span class="k">Número impresso</span><input type="text" id="cDisp" placeholder="Opcional" value="${esc(draft.display)}"></label>
    </div>
    <div class="acts"><button class="btn primary" id="cSave">Salvar</button><button class="btn gray" data-close>Cancelar</button></div>
    ${c ? `<div class="group"><button class="red" id="cDel">Apagar cartão</button></div>` : ""}`, el => {
    const setStatus = (t, cls = "") => { const s = $("#cStatus", el); s.textContent = t; s.className = "foot-note " + cls; };
    const prev = () => {
      draft.code = $("#cCode", el).value.trim();
      draft.format = inferFormat(draft.code, $("#cQr", el).checked, draft.format);
      const p = $("#cPrev", el), svg = codeSVG(draft.format, draft.code);
      p.hidden = !svg; p.innerHTML = svg;
      if (draft.code && !svg) setStatus("Não consegui desenhar esse código. Confira os números.", "warn");
    };
    prev();
    $("#cCode", el).addEventListener("input", () => { draft.format = null; prev(); });
    $("#cQr", el).addEventListener("change", () => { draft.format = null; prev(); });
    $("#pickPhoto", el).addEventListener("click", () => {
      const f = $("#photo"); f.value = "";
      f.onchange = async () => {
        const file = f.files[0]; if (!file) return;
        setStatus("Lendo o código…");
        try {
          const img = await loadImage(file);
          draft.photo = photoDataUrl(img);
          const r = await decodeImage(img);
          if (r){
            $("#cCode", el).value = r.code; $("#cQr", el).checked = r.format === "QR";
            draft.format = r.format; prev();
            setStatus(r.format === "QR" && /^https?:/i.test(r.code) ? "QR lido. Ele guarda um link; está certo assim. Se quiser, digite o número impresso." : "Código lido. Confira o desenho acima.", "ok");
          } else setStatus("Não consegui ler o código. Tire outra foto mais de perto, sem reflexo, ou digite os números.", "warn");
        } catch(e){ setStatus("Não consegui abrir essa imagem. Tente outra foto.", "warn"); }
      };
      f.click();
    });
    $("#cSave", el).addEventListener("click", () => {
      const name = $("#cName", el).value.trim();
      draft.code = $("#cCode", el).value.trim();
      draft.format = inferFormat(draft.code, $("#cQr", el).checked, draft.format);
      draft.display = $("#cDisp", el).value.trim();
      if (!name) { $("#cName", el).focus(); setStatus("Dê um nome ao cartão.", "warn"); return; }
      if (!draft.code) { $("#cCode", el).focus(); setStatus("Falta o código. Tire uma foto ou digite os números.", "warn"); return; }
      const cid = id || newId("c");
      queueWrite("cards", cid, { name, code: draft.code, format: draft.format, display: draft.display, photo: draft.photo, sort: c?.sort ?? (S.cards.size + 1) }, !c);
      closeSheet(); toast(c ? "Cartão atualizado" : "Cartão salvo");
    });
    $("#cDel", el)?.addEventListener("click", e => {
      const b = e.currentTarget;
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "Toque de novo para apagar"; return; }
      closeSheet(); queueDelete("cards", id);
    });
  });
}

/* ---------- toast ---------- */
let toastT = null;
function toast(msg, label, fn){
  document.querySelector(".toast")?.remove(); clearTimeout(toastT);
  const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status");
  t.innerHTML = `<span>${esc(msg)}</span>${label ? `<button>${esc(label)}</button>` : ""}`;
  if (label) t.querySelector("button").onclick = () => { t.remove(); fn(); };
  document.body.appendChild(t); toastT = setTimeout(() => t.remove(), label ? 5000 : 2600);
}

/* ---------- notifications ---------- */
// Each phone gets a random id. When you add items, the other phones are told
// once you pause for a few seconds (or leave the app), in one notification.
const DEVICE = (() => { let d = LS.get("lista.device", null); if (!d) { d = newId("d"); LS.set("lista.device", d); } return d; })();
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
let pendingAdds = LS.get("lista.pendingAdds", []), addTimer = null;

function noteAdded(id){
  if (!pendingAdds.includes(id)) pendingAdds.push(id);
  LS.set("lista.pendingAdds", pendingAdds);
  clearTimeout(addTimer); addTimer = setTimeout(sendAdds, 12000);
}
function sendAdds(){
  clearTimeout(addTimer); addTimer = null;
  if (!pendingAdds.length || !navigator.onLine || location.protocol === "file:") return;
  // Only items that are still on the list (an add that was undone is not news).
  const names = pendingAdds.map(id => S.items.get(id)).filter(i => i && i.state === "list").map(i => i.name);
  pendingAdds = []; LS.set("lista.pendingAdds", pendingAdds);
  if (!names.length) return;
  fetch("api/notify", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: DEVICE, by: LS.get("lista.name", ""), names }) }).catch(() => {});
}
// Finishing a trip tells the other phones right away (or as soon as there is internet again).
function sendFinish(bought, missing){
  if (location.protocol === "file:") return;
  const payload = { device: DEVICE, by: LS.get("lista.name", ""), kind: "finish", bought, missing };
  LS.set("lista.pendingFinish", payload);
  if (!navigator.onLine) return;
  fetch("api/notify", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then(r => { if (r.ok) LS.set("lista.pendingFinish", null); }).catch(() => {});
}
window.addEventListener("online", () => { const p = LS.get("lista.pendingFinish", null); if (p) sendFinish(p.bought, p.missing); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sendAdds(); });
window.addEventListener("pagehide", sendAdds);
window.addEventListener("online", () => { if (pendingAdds.length) sendAdds(); });

function keyBytes(b64){ const p = "=".repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
async function currentSub(){ try { const reg = await navigator.serviceWorker.getRegistration(); return reg ? await reg.pushManager.getSubscription() : null; } catch(e){ return null; } }
async function enablePush(){
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "denied" : "dismissed");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(CONFIG.vapidPublicKey) });
  const json = sub.toJSON();
  const r = await sb.from("push_subs").upsert({ endpoint: json.endpoint, device: DEVICE, name: LS.get("lista.name", ""), sub: json });
  if (r.error) throw new Error("db:" + (r.error.message || ""));
  LS.set("lista.pushOn", true);
  await sendTest();
}
async function disablePush(){
  const sub = await currentSub();
  if (sub){ try { await sb.from("push_subs").delete().eq("endpoint", sub.endpoint); } catch(e){} try { await sub.unsubscribe(); } catch(e){} }
  LS.set("lista.pushOn", false);
}
async function sendTest(){
  const r = await fetch("api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: DEVICE, test: true }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("server:" + (j.error || r.status));
  return j;
}
async function openNotifySheet(){
  const name = LS.get("lista.name", "");
  const sub = pushSupported() ? await currentSub() : null;
  const on = !!sub && Notification.permission === "granted";
  let status;
  if (!pushSupported() || (isIOS && !isStandalone())) status = isIOS
    ? "No iPhone, as notificações só funcionam com a Lista aberta pelo ícone na tela de início. No Safari: Compartilhar → Adicionar à Tela de Início, e abra por lá."
    : "Este navegador não recebe notificações.";
  else if (Notification.permission === "denied") status = "As notificações estão bloqueadas. Ative em Ajustes → Notificações → Lista.";
  const canAct = !status;
  openSheet(`<h3>Notificações</h3>
    <p class="foot-note" style="margin:0 4px;font-size:15px;color:var(--ink2)">Receba um aviso quando alguém adicionar algo na lista ou finalizar uma compra. Você não recebe aviso do que você mesmo fizer.</p>
    <div class="group"><label><span class="k">Seu nome</span><input type="text" id="nName" placeholder="Rodrigo" value="${esc(name)}" autocomplete="off"></label></div>
    <p class="foot-note">Aparece nos avisos do outro celular: “${esc(name || "Seu nome")} adicionou Pão na lista”.</p>
    ${status ? `<p class="foot-note warn" style="font-size:15px">${esc(status)}</p>` : ""}
    <p class="foot-note" id="nStatus">${on ? "Ativadas neste celular." : ""}</p>
    ${canAct ? (on
      ? `<div class="group"><button id="nTest">Enviar aviso de teste</button><button class="red" id="nOff">Desativar neste celular</button></div>`
      : `<button class="btn primary" id="nOn">Ativar notificações</button>`) : ""}
    <button class="btn gray" data-close>Fechar</button>`, el => {
    const setStatus = (t, cls = "") => { const p = $("#nStatus", el); p.textContent = t; p.className = "foot-note " + cls; };
    let nameT = null;
    $("#nName", el).addEventListener("input", e => {
      const v = e.target.value.trim().slice(0, 30); LS.set("lista.name", v);
      // Keep the name on the server too, so Siri adds don't notify the person who spoke.
      clearTimeout(nameT); nameT = setTimeout(() => { if (sb && LS.get("lista.pushOn", false)) sb.from("push_subs").update({ name: v }).eq("device", DEVICE).then(() => {}, () => {}); }, 800);
    });
    const explain = e => {
      const m = String(e && e.message || e);
      if (m === "denied") return "Você recusou as notificações. Para ativar: Ajustes → Notificações → Lista.";
      if (m === "dismissed") return "Toque em Permitir quando o iPhone perguntar.";
      if (m.startsWith("db:")) return "Não deu para salvar no Supabase. Falta rodar o arquivo 4-notifications.sql?";
      if (m.includes("VAPID")) return "Falta configurar a chave VAPID_PRIVATE_KEY no Vercel.";
      return "Não deu para ativar agora. Confira a internet e tente de novo.";
    };
    $("#nOn", el)?.addEventListener("click", async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "Ativando…";
      try { await enablePush(); render(); closeSheet(); toast("Notificações ativadas"); }
      catch(err){ b.disabled = false; b.textContent = "Ativar notificações"; setStatus(explain(err), "warn"); }
    });
    $("#nTest", el)?.addEventListener("click", async () => {
      setStatus("Enviando…");
      try { const j = await sendTest(); setStatus(j.sent ? "Aviso enviado. Ele chega em alguns segundos." : "Este celular não está registrado. Desative e ative de novo.", j.sent ? "ok" : "warn"); }
      catch(err){ setStatus(explain(err), "warn"); }
    });
    $("#nOff", el)?.addEventListener("click", async () => { await disablePush(); render(); closeSheet(); toast("Notificações desativadas"); });
  });
}
$("#bell").addEventListener("click", openNotifySheet);

/* ---------- new version banner ---------- */
// Bump APP_VERSION here and in version.json on every release.
const APP_VERSION = "2026-10-15.3";
let updateShown = false;
async function checkVersion(){
  if (updateShown || document.hidden || location.protocol === "file:") return;
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const { version } = await r.json();
    if (version && version !== APP_VERSION) showUpdate();
  } catch(e){ /* offline: try again later */ }
}
function showUpdate(){
  updateShown = true;
  const b = document.createElement("div"); b.className = "update"; b.setAttribute("role", "status");
  b.innerHTML = `<span>Nova versão disponível</span><button class="update-go">Atualizar</button><button class="update-x" aria-label="Agora não"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  b.querySelector(".update-go").onclick = () => location.reload();
  b.querySelector(".update-x").onclick = () => b.remove();
  document.body.appendChild(b);
}
setInterval(checkVersion, 60 * 1000);
document.addEventListener("visibilitychange", checkVersion);
window.addEventListener("focus", checkVersion);
window.addEventListener("pageshow", checkVersion);
window.addEventListener("online", checkVersion);
checkVersion();

/* ---------- boot ---------- */
S.outbox.forEach(o => o.sending = false);
render();
if (sb) { flush(); load(); startRealtime(); }
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
