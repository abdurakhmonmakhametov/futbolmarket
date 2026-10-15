/* =====================================================================
   /api/products (Vercel) — sayt, Telegram Mini App va bot uchun yagona ro'yxat
     GET             — hamma uchun (Redis'dagi ro'yxat, bo'lmasa products.json)
     POST / PUT ?id / DELETE ?id — admin panel (x-admin-key va Redis kerak)
   ===================================================================== */
const { readJson, store, getProducts, isAdminRequest } = require("./_lib");

const MAX_IMG = 700000; // Redis so'rov chegarasi uchun: rasm ~500 KB gacha

function cleanProduct(x, old = {}) {
  const p = { ...old };
  if (x.name !== undefined) p.name = String(x.name).trim().slice(0, 80);
  if (x.cat !== undefined) p.cat = String(x.cat).trim().slice(0, 30);
  if (x.price !== undefined) p.price = Math.max(0, Math.round(Number(x.price) || 0));
  if (x.sizes !== undefined) p.sizes = (Array.isArray(x.sizes) ? x.sizes : String(x.sizes).split(",")).map(s => String(s).trim()).filter(Boolean).slice(0, 20);
  if (x.custom !== undefined) p.custom = !!x.custom;
  if (x.img !== undefined) p.img = String(x.img);
  return p;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(await getProducts());
  }

  if (!store.enabled) return res.status(501).json({ error: "Baza ulanmagan: products.json ni tahrirlang yoki Upstash Redis qo‘shing." });
  if (!isAdminRequest(req)) return res.status(401).json({ error: "Admin paroli kerak" });

  const id = String((req.query && req.query.id) || new URL(req.url, "http://x").searchParams.get("id") || "");
  const list = (await getProducts()).slice();

  if (req.method === "DELETE") {
    await store.saveProducts(list.filter(p => String(p.id) !== id));
    return res.status(200).json({ ok: true });
  }

  let body;
  try { body = await readJson(req); } catch (e) { return res.status(400).json({ error: "JSON xato" }); }
  if (String(body.img || "").length > MAX_IMG) return res.status(413).json({ error: "Rasm juda katta (500 KB gacha bo‘lsin)" });

  if (req.method === "POST") {
    const p = cleanProduct(body, { id: Number(body.id) || Date.now(), img: "./card.png", sizes: [], custom: false });
    if (!p.name || !p.price || !p.sizes.length) return res.status(400).json({ error: "Nomi, narx va o‘lchamlar kerak" });
    list.push(p);
    await store.saveProducts(list);
    return res.status(201).json(p);
  }
  if (req.method === "PUT") {
    const i = list.findIndex(p => String(p.id) === id);
    if (i < 0) return res.status(404).json({ error: "Topilmadi" });
    list[i] = cleanProduct(body, list[i]);
    await store.saveProducts(list);
    return res.status(200).json(list[i]);
  }
  res.status(405).json({ error: "Method not allowed" });
};
