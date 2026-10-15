/* =====================================================================
   POST /api/orders — saytdan yoki Telegram Mini App'dan buyurtma.
   Buyurtma bot orqali ADMIN_CHAT_ID ga yuboriladi (holat tugmalari bilan).
   Baza yo'q: buyurtmalar Telegram chatida turadi.
   ===================================================================== */
const {
  TOKEN, ADMINS, DELIVERY_FEE, PRINT_FEE, products,
  tg, verifyInitData, orderText, statusKeyboard, readJson, money, esc
} = require("./_lib");

const clip = (s, n) => String(s ?? "").trim().slice(0, n);

function normPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  return d.length >= 9 && d.length <= 15 ? "+" + d : null;
}

function buildItem(line) {
  const p = products.find(x => String(x.id) === String(line.productId))
    || products.find(x => x.name === (line.product || line.name));
  if (!p) throw new Error("Mahsulot topilmadi: " + clip(line.product || line.name || line.productId, 40));

  const size = String(line.size || "");
  if (!p.sizes.map(String).includes(size)) throw new Error(`${p.name}: o‘lcham noto‘g‘ri`);

  const qty = Number(line.quantity ?? line.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error(`${p.name}: miqdor noto‘g‘ri`);

  const custom = !!(line.custom && p.custom);
  const shirtName = custom ? clip(line.shirtName, 12).toUpperCase() : "";
  const shirtNumber = custom ? String(parseInt(line.shirtNumber, 10) || "") : "";
  if (custom && (!shirtName || !(+shirtNumber >= 1 && +shirtNumber <= 99))) throw new Error(`${p.name}: ism va raqam kerak`);

  // narxni serverda qayta hisoblaymiz — brauzerdan kelgan narxga ishonmaymiz
  return { productId: p.id, name: p.name, size, qty, custom, shirtName, shirtNumber, unitPrice: Number(p.price) + (custom ? PRINT_FEE : 0) };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Faqat POST. Buyurtmalar Telegram botda." });
  if (!TOKEN || !ADMINS.length) return res.status(503).json({ error: "Bot sozlanmagan (BOT_TOKEN / ADMIN_CHAT_ID)." });

  let body;
  try { body = await readJson(req); } catch (e) { return res.status(400).json({ error: "JSON xato" }); }

  const lines = Array.isArray(body) ? body : Array.isArray(body.orders) ? body.orders : [body];
  if (!lines.length || lines.length > 30) return res.status(400).json({ error: "Savat bo‘sh yoki juda katta" });

  let items;
  try { items = lines.map(buildItem); } catch (e) { return res.status(400).json({ error: e.message }); }

  const f = lines[0];
  const tgUser = verifyInitData(body.initData);
  if (body.initData && !tgUser) return res.status(401).json({ error: "Telegram ma’lumoti tasdiqlanmadi. Mini App'ni qayta oching." });

  const phone = normPhone(f.phone);
  const address = clip(f.address, 300);
  const location = /^https:\/\/(www\.)?(google\.com\/maps\?q=|maps\.google\.com\/\?q=)-?[\d.]+,-?[\d.]+$/.test(f.location || "") ? f.location : "";
  if (!phone) return res.status(400).json({ error: "Telefon raqam noto‘g‘ri" });
  if (address.length < 5 && !location) return res.status(400).json({ error: "Manzil kerak" });

  const subtotal = items.reduce((n, x) => n + x.unitPrice * x.qty, 0);
  const order = {
    id: "FM-" + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase(),
    source: tgUser ? "tg" : "web",
    name: clip(f.userName || f.name || (tgUser && tgUser.first_name) || "Mijoz", 60),
    contact: tgUser ? (tgUser.username ? "@" + tgUser.username : "tg id " + tgUser.id) : clip(f.email, 80),
    phone, address, location,
    payment: f.payment === "Karta" ? "Karta" : clip(f.payment || "Naqd pul", 40),
    cardLast4: /^\d{4}$/.test(f.cardLast4 || "") ? f.cardLast4 : "",
    note: clip(body.note || f.note, 200),
    items, delivery: DELIVERY_FEE, total: subtotal + DELIVERY_FEE
  };

  let delivered = 0;
  for (const chat of ADMINS) {
    try {
      await tg("sendMessage", {
        chat_id: chat, text: orderText(order, "Yangi"), parse_mode: "HTML",
        disable_web_page_preview: true, reply_markup: statusKeyboard(tgUser && tgUser.id)
      });
      delivered++;
      const m = location.match(/q=(-?[\d.]+),(-?[\d.]+)/);
      if (m) await tg("sendLocation", { chat_id: chat, latitude: +m[1], longitude: +m[2] }).catch(() => { });
    } catch (e) {
      console.error("admin ga yuborilmadi:", e.message);
    }
  }
  if (!delivered) return res.status(502).json({ error: "Telegramga yuborib bo‘lmadi. Keyinroq urinib ko‘ring." });

  if (tgUser) {
    const list = items.map(x => `• ${esc(x.name)} — ${esc(x.size)} × ${x.qty}`).join("\n");
    await tg("sendMessage", {
      chat_id: tgUser.id, parse_mode: "HTML",
      text: `✅ <b>Buyurtmangiz qabul qilindi</b> <code>#${order.id}</code>\n\n${list}\n\n💰 Jami: <b>${money(order.total)}</b>\n\nAdmin tez orada ${esc(phone)} raqamiga qo‘ng‘iroq qiladi. Holat o‘zgarsa shu yerga xabar keladi.`
    }).catch(() => { });
  }

  res.status(201).json({ ok: true, id: order.id, total: order.total });
};
