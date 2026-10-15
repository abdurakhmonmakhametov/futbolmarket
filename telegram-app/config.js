/* =====================================================================
   FUTBOL MARKET — Telegram Mini App sozlamalari
   Mahsulot qo'shish / narx o'zgartirish uchun faqat SHU faylni tahrirlang,
   keyin papkani hostingga qayta yuklang. Server kerak emas.
   ===================================================================== */

window.SHOP = {
  name: "Futbol Market",

  // Buyurtmalar shu Telegram akkauntga keladi (@ belgisiz)
  adminUsername: "asadullayevjunior",

  // Bot username (@ belgisiz) — "Do'stga ulashish" havolasi uchun
  botUsername: "futbolmarket_bot",

  currency: "so‘m",
  deliveryFee: 10000,   // bitta buyurtma uchun yetkazib berish
  printFee: 50000,      // forma orqasiga ism + raqam (har bir forma uchun)

  // Bo'sh qoldiring: Mini App saytning /telegram-app/ papkasida turadi va
  // mahsulotlarni /api/products dan oladi, buyurtmani /api/orders orqali botga yuboradi.
  // Mini App boshqa joyda turgan bo'lsa — sayt manzilini yozing ("https://futbol-market.vercel.app").
  // API topilmasa buyurtma mijozning Telegrami orqali adminUsername ga boradi.
  orderApi: "",

  // Zaxira ro'yxat (API ishlamasa). Asosiy ro'yxat — sayt papkasidagi products.json
  products: [
    { id: 1, name: "Real Madrid Uy Formasi",      cat: "Forma", price: 899000, img: "img/real.webp",  sizes: ["XS", "S", "M", "L", "XL", "XXL"], custom: true },
    { id: 2, name: "Real Madrid Mehmon Formasi",  cat: "Forma", price: 899000, img: "img/logo.webp",  sizes: ["XS", "S", "M", "L", "XL", "XXL"], custom: true },
    { id: 3, name: "Professional Futbol Butsasi", cat: "Butsa", price: 749000, img: "img/butsa.webp", sizes: ["39", "40", "41", "42", "43", "44", "45", "46"], custom: false },
    { id: 4, name: "Match Futbol To‘pi",          cat: "To‘p",  price: 299000, img: "img/top.webp",   sizes: ["5-razmer"], custom: false },
    { id: 5, name: "Chempionlar Kubogi",          cat: "Kubok", price: 499000, img: "img/kubog.webp", sizes: ["Standart"], custom: false },
    { id: 6, name: "Futbol Forma Premium",        cat: "Forma", price: 799000, img: "img/ota.webp",   sizes: ["S", "M", "L", "XL"], custom: true }
  ]
};
