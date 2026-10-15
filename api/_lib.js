/* =====================================================================
   FUTBOL MARKET — Vercel serverless funksiyalari uchun umumiy kod.
   "_" bilan boshlangan fayl Vercel'da API manzili bo'lmaydi.
   Sozlamalar Vercel Environment Variables'da:
     BOT_TOKEN      — @BotFather tokeni
     ADMIN_CHAT_ID  — buyurtmalar keladigan chat ID (bir nechta: 123,456)
   ===================================================================== */

const crypto = require("crypto");
const products = require("../products.json");

const TOKEN = (process.env.BOT_TOKEN || "").trim();
const ADMINS = (process.env.ADMIN_CHAT_ID || "").split(",").map(s => s.trim()).filter(Boolean);

const DELIVERY_FEE = 10000;
const PRINT_FEE = 50000;

// Admin paneldagi va index.js dagi holat nomlari bilan bir xil
const STATUS = { t: "Tayyorlanmoqda", y: "Yetkazilmoqda", d: "Yetkazildi", c: "Bekor" };
const STATUS_ICON = { "Yangi": "🆕", "Tayyorlanmoqda": "📦", "Yetkazilmoqda": "🚚", "Yetkazildi": "✅", "Bekor": "❌" };

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = n => Number(n || 0).toLocaleString("en-US").replace(/,/g, " ") + " so‘m";

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

/* Buyurtma xabari (admin uchun). Holat xabar matnining o'zida saqlanadi — baza kerak emas. */
function orderText(o, status) {
  const items = o.items.map((x, i) => {
    const extra = x.custom ? ` • yozuv: ${esc(x.shirtName)} #${esc(x.shirtNumber)}` : "";
    return `${i + 1}. <b>${esc(x.name)}</b>\n    O‘lcham: ${esc(x.size)} × ${x.qty}${extra}\n    ${money(x.unitPrice * x.qty)}`;
  }).join("\n");
  const geo = /^https:\/\/(www\.)?(google\.com\/maps|maps\.google\.com)/.test(o.location || "");
  const pay = o.payment === "Karta"
    ? `💳 Karta${o.cardLast4 ? " •••• " + esc(o.cardLast4) : ""}`
    : `💵 ${esc(o.payment || "Naqd pul")}`;

  return [
    `🛒 <b>Buyurtma</b> <code>#${esc(o.id)}</code> · ${o.source === "tg" ? "📱 Telegram" : "🌐 Sayt"}`,
    "",
    `👤 ${esc(o.name)}${o.contact ? " (" + esc(o.contact) + ")" : ""}`,
    `📞 ${esc(o.phone)}`,
    o.address ? `📍 ${esc(o.address)}` : null,
    geo ? `🗺 <a href="${esc(o.location)}">Xaritada ochish</a>` : null,
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
  TOKEN, ADMINS, DELIVERY_FEE, PRINT_FEE, STATUS, STATUS_ICON, products,
  esc, money, tg, siteUrl, verifyInitData, orderText, statusKeyboard, webhookSecret, readJson
};
