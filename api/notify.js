// Vercel function: tells the other phones when items are added or a trip is finished.
// Needs one environment variable in Vercel: VAPID_PRIVATE_KEY.
const { clip, addMessage, finishMessage, sendPush, readBody } = require("./_shared.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = readBody(req);
  const device = clip(body.device, 64);
  if (!device) return res.status(400).json({ error: "device missing" });
  const by = clip(body.by, 30);
  const test = body.test === true;
  const finish = body.kind === "finish";
  const names = Array.isArray(body.names) ? body.names.map(n => clip(n, 80)).filter(Boolean).slice(0, 40) : [];
  const bought = Math.max(0, Math.min(999, parseInt(body.bought, 10) || 0));
  const missing = Array.isArray(body.missing) ? body.missing.map(n => clip(n, 80)).filter(Boolean).slice(0, 40) : [];

  let text;
  if (test) text = "Notificações ativadas. Você vai saber quando alguém adicionar algo na lista.";
  else if (finish) { if (!bought && !missing.length) return res.status(200).json({ sent: 0 }); text = finishMessage(by, bought, missing); }
  else { if (!names.length) return res.status(200).json({ sent: 0 }); text = addMessage(by, names); }

  try {
    const out = await sendPush(s => test ? s.device === device : s.device !== device, text);
    res.status(200).json(out);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
