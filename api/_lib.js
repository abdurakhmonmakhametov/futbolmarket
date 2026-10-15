/* =====================================================================
   FUTBOL MARKET — umumiy kod: Vercel funksiyalari (api/*.js) va
   kompyuterdagi server (server.js) shu faylni ishlatadi.
   "_" bilan boshlangan fayl Vercel'da API manzili bo'lmaydi.

   Vercel Environment Variables:
     BOT_TOKEN      — @BotFather tokeni
     ADMIN_CHAT_ID  — buyurtmalar keladigan chat ID (bir nechta: 123,456)
     ADMIN_KEY      — admin panel paroli (Vercel'dagi admin.html uchun)
     KV_REST_API_URL / KV_REST_API_TOKEN — Upstash Redis (Vercel → Storage → Upstash).
       Shu bo'lsa buyurtmalar va mahsulotlar saqlanadi va admin panelda ko'rinadi.
   ===================================================================== */

const crypto = require("crypto");
const productsFile = require("../products.json");

const TOKEN = (process.env.BOT_TOKEN || "").trim();
const ADMINS = (process.env.ADMIN_CHAT_ID || "").split(",").map(s => s.trim()).filter(Boolean);
const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

const DELIVERY_FEE = 10000;
const PRINT_FEE = 50000;

// Admin paneldagi va index.js dagi holat nomlari bilan bir xil
const STATUS = { t: "Tayyorlanmoqda", y: "Yetkazilmoqda", d: "Yetkazildi", c: "Bekor" };
const STATUS_ICON = { "Yangi": "🆕", "Tayyorlanmoqda": "📦", "Yetkazilmoqda": "🚚", "Yetkazildi": "✅", "Bekor": "❌" };
const STATUS_NOTE = {
  "Tayyorlanmoqda": "Buyurtmangiz tayyorlanmoqda 📦",
  "Yetkazilmoqda": "Buyurtmangiz yo‘lda! Kuryer tez orada yetib boradi 🚚",
  "Yetkazildi": "Buyurtmangiz yetkazildi. Xaridingiz uchun rahmat! ✅",
  "Bekor": "Buyurtmangiz bekor qilindi. Savollar bo‘lsa shu yerga yozing ❌"
};

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = n => Number(n || 0).toLocaleString("en-US").replace(/,/g, " ") + " so‘m";
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const MAP_RE = /^https:\/\/(www\.google\.com\/maps\?q=|maps\.google\.com\/\?q=)(-?[\d.]+),(-?[\d.]+)$/;

// Webhook so'rovi rostdan Telegramdan kelganini tekshirish uchun (tokendan hosil qilinadi)
const webhookSecret = () => crypto.createHash("sha256").update("fm-webhook:" + TOKEN).digest("hex").slice(0, 48);

async function tg(method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

function siteUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `https://${host}`;
}

/* ---------------- Saqlash: Upstash Redis (REST, paket kerak emas) ---------------- */

const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

async function kv(...cmd) {
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error("Redis: " + j.error);
  return j.result;
}

const store = {
  enabled: !!(KV_URL && KV_TOKEN),
  async orders() {
    const flat = (await kv("HGETALL", "fm:orders")) || [];
    const list = [];
    for (let i = 1; i < flat.length; i += 2) list.push(JSON.parse(flat[i]));
    return list.sort((a, b) => Number(a.id) - Number(b.id));
  },
  async addOrders(lines) {
    if (lines.length) await kv("HSET", "fm:orders", ...lines.flatMap(o => [String(o.id), JSON.stringify(o)]));
  },
  async updateOrder(id, patch) {
    const raw = await kv("HGET", "fm:orders", String(id));
    if (!raw) return null;
    const old = JSON.parse(raw);
    const next = { ...old, ...patch, id: old.id };
    await kv("HSET", "fm:orders", String(id), JSON.stringify(next));
    return next;
  },
  async deleteOrder(id) { await kv("HDEL", "fm:orders", String(id)); },
  async setStatusByOrderId(orderId, status) {
    const lines = (await this.orders()).filter(o => o.orderId === orderId);
    for (const o of lines) await this.updateOrder(o.id, { status });
    return lines.length;
  },
  async products() {
    const raw = await kv("GET", "fm:products");
    return raw ? JSON.parse(raw) : null;
  },
  async saveProducts(list) { await kv("SET", "fm:products", JSON.stringify(list)); }
};

async function getProducts() {
  if (store.enabled) {
    try { const list = await store.products(); if (Array.isArray(list) && list.length) return list; }
    catch (e) { console.error(e.message); }
  }
  return productsFile;
}

/* Admin panel so'rovi (Vercel'da ADMIN_KEY bilan himoyalangan) */
function isAdminRequest(req) {
  const key = String(req.headers["x-admin-key"] || "");
  return !!ADMIN_KEY && key.length === ADMIN_KEY.length &&
    crypto.timingSafeEqual(Buffer.from(key), Buffer.from(ADMIN_KEY));
}

/* Telegram Mini App initData imzosini tekshirish (https://core.telegram.org/bots/webapps) */
function verifyInitData(initData) {
  if (!initData || !TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const calc = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(params.get("auth_date") || 0) > 86400) return null;
  try { return JSON.parse(params.get("user") || "null"); } catch (e) { return null; }
}

/* ---------------- Buyurtma: tekshirish va yozuvlarga aylantirish ---------------- */

class OrderError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function normPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  return d.length >= 9 && d.length <= 15 ? "+" + d : null;
}

function buildItem(line, products) {
  const p = products.find(x => String(x.id) === String(line.productId))
    || products.find(x => x.name === (line.product || line.name));
  if (!p) throw new OrderError(400, "Mahsulot topilmadi: " + clip(line.product || line.name || line.productId, 40));

  const size = String(line.size || "");
  if (!(p.sizes || []).map(String).includes(size)) throw new OrderError(400, `${p.name}: o‘lcham noto‘g‘ri`);

  const qty = Number(line.quantity ?? line.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new OrderError(400, `${p.name}: miqdor noto‘g‘ri`);

  const custom = !!(line.custom && p.custom);
  const shirtName = custom ? clip(line.shirtName, 12).toUpperCase() : "";
  const shirtNumber = custom ? String(parseInt(line.shirtNumber, 10) || "") : "";
  if (custom && (!shirtName || !(+shirtNumber >= 1 && +shirtNumber <= 99))) throw new OrderError(400, `${p.name}: ism va raqam kerak`);

  // narxni serverda qayta hisoblaymiz — brauzerdan kelgan narxga ishonmaymiz
  return { productId: p.id, name: p.name, cat: p.cat, size, qty, custom, shirtName, shirtNumber, unitPrice: Number(p.price) + (custom ? PRINT_FEE : 0) };
}

/* body: { orders:[...], initData?, note? } | [...] | bitta yozuv (eski sayt formati).
   Qaytaradi: order (xabar uchun umumiy ko'rinish) va lines (admin panel / data.json yozuvlari). */
function buildOrder(body, products) {
  const raw = Array.isArray(body) ? body : Array.isArray(body.orders) ? body.orders : [body];
  if (!raw.length || raw.length > 30) throw new OrderError(400, "Savat bo‘sh yoki juda katta");
  const items = raw.map(l => buildItem(l, products));

  const f = raw[0];
  const tgUser = verifyInitData(body.initData);
  if (body.initData && TOKEN && !tgUser) throw new OrderError(401, "Telegram ma’lumoti tasdiqlanmadi. Mini App'ni qayta oching.");

  const phone = normPhone(f.phone);
  const address = clip(f.address, 300);
  const location = MAP_RE.test(f.location || "") ? f.location : "";
  if (!phone) throw new OrderError(400, "Telefon raqam noto‘g‘ri");
  if (address.length < 5 && !location) throw new OrderError(400, "Manzil kerak");

  const now = Date.now();
  const subtotal = items.reduce((n, x) => n + x.unitPrice * x.qty, 0);
  const order = {
    id: "FM-" + now.toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase(),
    source: tgUser ? "tg" : "web",
    tgUserId: tgUser ? tgUser.id : null,
    name: clip(f.userName || f.name || (tgUser && tgUser.first_name) || "Mijoz", 60),
    contact: tgUser ? (tgUser.username ? "@" + tgUser.username : "tg id " + tgUser.id) : clip(f.email, 80),
    phone, address, location,
    payment: f.payment === "Karta" ? "Karta" : clip(f.payment || "Naqd pul", 40),
    cardLast4: /^\d{4}$/.test(f.cardLast4 || "") ? f.cardLast4 : "",
    note: clip(body.note || f.note, 200),
    items, delivery: DELIVERY_FEE, total: subtotal + DELIVERY_FEE
  };

  // admin.html / data.json formati: har bir mahsulot alohida yozuv, orderId bilan bog'langan
  const date = new Date(now).toISOString();
  const lines = items.map((x, i) => ({
    id: now + i, orderId: order.id, source: order.source, tgUserId: order.tgUserId,
    userId: f.userId ?? null, userName: order.name, email: order.contact,
    productId: x.productId, product: x.name, category: x.cat, size: x.size, quantity: x.qty,
    custom: x.custom, shirtName: x.shirtName, shirtNumber: x.shirtNumber, unitPrice: x.unitPrice,
    delivery: i === 0 ? DELIVERY_FEE : 0, total: x.unitPrice * x.qty + (i === 0 ? DELIVERY_FEE : 0),
    phone, address, location, payment: order.payment, cardLast4: order.cardLast4, note: order.note,
    status: "Yangi", date
  }));
  return { order, lines, tgUser };
}

/* Buyurtma xabari (admin uchun). Holat xabarning oxirgi qatorida turadi. */
function orderText(o, status) {
  const items = o.items.map((x, i) => {
    const extra = x.custom ? ` • yozuv: ${esc(x.shirtName)} #${esc(x.shirtNumber)}` : "";
    return `${i + 1}. <b>${esc(x.name)}</b>\n    O‘lcham: ${esc(x.size)} × ${x.qty}${extra}\n    ${money(x.unitPrice * x.qty)}`;
  }).join("\n");
  const pay = o.payment === "Karta"
    ? `💳 Karta${o.cardLast4 ? " •••• " + esc(o.cardLast4) : ""}`
    : `💵 ${esc(o.payment || "Naqd pul")}`;

  return [
    `🛒 <b>Buyurtma</b> <code>#${esc(o.id)}</code> · ${o.source === "tg" ? "📱 Telegram" : "🌐 Sayt"}`,
    "",
    `👤 ${esc(o.name)}${o.contact ? " (" + esc(o.contact) + ")" : ""}`,
    `📞 ${esc(o.phone)}`,
    o.address ? `📍 ${esc(o.address)}` : null,
    o.location ? `🗺 <a href="${esc(o.location)}">Xaritada ochish</a>` : null,
    pay,
    o.note ? `📝 ${esc(o.note)}` : null,
    "",
    items,
    "",
    `🚚 Yetkazib berish: ${money(o.delivery)}`,
    `💰 <b>Jami: ${money(o.total)}</b>`,
    `${STATUS_ICON[status] || "📌"} Holat: <b>${esc(status)}</b>`
  ].filter(x => x !== null).join("\n");
}

function customerConfirmText(o) {
  const list = o.items.map(x => `• ${esc(x.name)} — ${esc(x.size)} × ${x.qty}`).join("\n");
  return `✅ <b>Buyurtmangiz qabul qilindi</b> <code>#${esc(o.id)}</code>\n\n${list}\n\n💰 Jami: <b>${money(o.total)}</b>\n\nAdmin tez orada ${esc(o.phone)} raqamiga qo‘ng‘iroq qiladi. Holat o‘zgarsa shu yerga xabar keladi.`;
}

// callback_data: s:<holat kodi>:<mijoz telegram id yoki 0>  (64 baytgacha)
function statusKeyboard(customerId) {
  const c = customerId || 0;
  return {
    inline_keyboard: [
      [{ text: "📦 Tayyorlanmoqda", callback_data: `s:t:${c}` }, { text: "🚚 Yetkazilmoqda", callback_data: `s:y:${c}` }],
      [{ text: "✅ Yetkazildi", callback_data: `s:d:${c}` }, { text: "❌ Bekor", callback_data: `s:c:${c}` }]
    ]
  };
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

module.exports = {
  TOKEN, ADMINS, ADMIN_KEY, DELIVERY_FEE, PRINT_FEE, STATUS, STATUS_ICON, STATUS_NOTE, MAP_RE,
  esc, money, tg, siteUrl, verifyInitData, orderText, customerConfirmText, statusKeyboard, webhookSecret, readJson,
  store, getProducts, isAdminRequest, buildOrder, OrderError
};
