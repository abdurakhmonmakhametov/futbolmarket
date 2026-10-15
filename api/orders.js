/* =====================================================================
   /api/orders (Vercel)
     POST            — saytdan yoki Telegram Mini App'dan buyurtma (hamma uchun)
     GET             — admin panel uchun ro'yxat          (x-admin-key kerak)
     PUT    ?id=..   — buyurtmani tahrirlash / holat      (x-admin-key kerak)
     DELETE ?id=..   — buyurtmani o'chirish               (x-admin-key kerak)
   /api/orders/<id> manzili vercel.json orqali ?id=<id> ga yo'naltiriladi.
   Buyurtma bot orqali ADMIN_CHAT_ID ga boradi; Redis ulangan bo'lsa admin panelga ham.
   ===================================================================== */
const {
  TOKEN, ADMINS, STATUS_NOTE, MAP_RE,
  tg, orderText, customerConfirmText, statusKeyboard, readJson, esc,
  store, getProducts, isAdminRequest, buildOrder, OrderError
} = require("./_lib");

async function create(req, res) {
  if (!TOKEN || !ADMINS.length) return res.status(503).json({ error: "Bot sozlanmagan (BOT_TOKEN / ADMIN_CHAT_ID)." });

  let body;
  try { body = await readJson(req); } catch (e) { return res.status(400).json({ error: "JSON xato" }); }

  let built;
  try { built = buildOrder(body, await getProducts()); }
  catch (e) {
    if (e instanceof OrderError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  const { order, lines } = built;

  let saved = false;
  if (store.enabled) {
    try { await store.addOrders(lines); saved = true; } catch (e) { console.error("saqlanmadi:", e.message); }
  }

  let delivered = 0;
  for (const chat of ADMINS) {
    try {
      await tg("sendMessage", {
        chat_id: chat, text: orderText(order, "Yangi"), parse_mode: "HTML",
        disable_web_page_preview: true, reply_markup: statusKeyboard(order.tgUserId)
      });
      delivered++;
      const m = order.location.match(MAP_RE);
      if (m) await tg("sendLocation", { chat_id: chat, latitude: +m[2], longitude: +m[3] }).catch(() => { });
    } catch (e) {
      console.error("admin ga yuborilmadi:", e.message);
    }
  }
  if (!delivered && !saved) return res.status(502).json({ error: "Telegramga yuborib bo‘lmadi. Keyinroq urinib ko‘ring." });

  if (order.tgUserId) {
    await tg("sendMessage", { chat_id: order.tgUserId, parse_mode: "HTML", text: customerConfirmText(order) }).catch(() => { });
  }
  res.status(201).json({ ok: true, id: order.id, total: order.total });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "POST") return create(req, res);

  /* ----- admin panel ----- */
  if (!["GET", "PUT", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });
  if (!store.enabled) return res.status(501).json({ error: "Baza ulanmagan: Vercel → Storage → Upstash Redis qo‘shing." });
  if (!isAdminRequest(req)) return res.status(401).json({ error: "Admin paroli kerak" });

  const id = String((req.query && req.query.id) || new URL(req.url, "http://x").searchParams.get("id") || "");
  if (req.method === "GET") return res.status(200).json(await store.orders());
  if (!id) return res.status(400).json({ error: "id kerak" });

  if (req.method === "DELETE") {
    await store.deleteOrder(id);
    return res.status(200).json({ ok: true });
  }

  let patch;
  try { patch = await readJson(req); } catch (e) { return res.status(400).json({ error: "JSON xato" }); }
  const allowed = ["userName", "quantity", "status", "total", "unitPrice", "price", "phone", "address"];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  const before = (await store.orders()).find(o => String(o.id) === id);
  const next = await store.updateOrder(id, clean);
  if (!next) return res.status(404).json({ error: "Topilmadi" });

  // admin panelda holat o'zgarsa — Telegram orqali buyurtma bergan mijozga xabar
  if (before && clean.status && clean.status !== before.status && next.tgUserId && STATUS_NOTE[clean.status]) {
    await tg("sendMessage", {
      chat_id: next.tgUserId, parse_mode: "HTML",
      text: `<code>#${esc(next.orderId || next.id)}</code> — ${STATUS_NOTE[clean.status]}`
    }).catch(() => { });
  }
  res.status(200).json(next);
};
