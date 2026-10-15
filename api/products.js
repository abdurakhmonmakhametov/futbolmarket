/* GET /api/products — sayt va Telegram Mini App uchun yagona mahsulotlar ro'yxati (products.json) */
const { products } = require("./_lib");

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
  if (req.method !== "GET") return res.status(405).json({ error: "Faqat GET. Mahsulotlarni products.json da tahrirlang." });
  res.status(200).json(products);
};
