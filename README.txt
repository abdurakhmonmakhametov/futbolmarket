FUTBOL MARKET — FIXED 2.0

1) Eng oson: START.bat ni ikki marta bosing.
2) Brauzerda http://localhost:3000 ochiladi.
3) Admin: admin@gmail.com (parol talab qilinmaydi, mavjud loyiha mantig‘i saqlangan).

NIMA TUZATILDI:
- Mahsulotlar do‘konda ko‘rinadi.
- Xarid qilish ishlaydi.
- Miqdor tanlash bor.
- Buyurtma serverdagi data.json ga yoziladi.
- Admin buyurtmalarni ko‘radi va har 5 sekundda yangilanadi.
- Admin jami buyurtma, sotilgan dona va umumiy tushumni ko‘radi.
- Buyurtmani Edit qilish: xaridor ismi, miqdor, status va jami summa.
- Buyurtmani o‘chirish.
- Mahsulotni qo‘shish/o‘chirish/Edit qilish.
- Mahsulotlar ham serverga ulanish uchun API tayyor.

MUHIM:
Bu versiya haqiqiy backend bilan ishlaydi. Faqat index.html ni ikki marta bosib ochmang; START.bat orqali ishga tushiring.
Internetdagi boshqa odamlarning buyurtmasini qabul qilish uchun serverni hosting/VPS ga joylashtirish kerak.


=====================================================
TELEGRAM BOT (index.js)
=====================================================
Bot yangi buyurtma tushganda sizga Telegram'da xabar yuboradi:
mijoz, telefon, manzil, xarita, to'lov usuli, mahsulotlar va jami summa.
Xabar tagidagi tugmalar bilan holatni o'zgartirasiz (Yo'lda / Yetkazildi /
Bekor qilish) va u saytdagi admin panelda ham yangilanadi.

SOZLASH (bir marta):
1) Telegram'da @BotFather ga yozing -> /newbot -> nom bering -> TOKEN oling.
2) ".env.example" faylini ".env" deb nusxalang va BOT_TOKEN= ga tokenni yozing.
3) START.bat ni ishga tushiring (yoki: node index.js).
4) O'zingizning botingizga Telegram'da /start yuboring. Bot sizning chat ID
   raqamingizni yozib beradi. Uni .env dagi ADMIN_CHAT_ID= ga yozing va
   START.bat ni qayta ishga tushiring.

BUYRUQLAR: /orders  /new  /stats

ESLATMA:
- Bot ishlashi uchun kompyuter yoqilgan va START.bat ishlab turishi kerak.
- Node.js 18 yoki yangiroq kerak.
- Bot faqat ADMIN_CHAT_ID dagi odamlarga javob beradi.
- BOT_TOKEN yozilmasa sayt avvalgidek ishlayveradi, faqat bot o'chiq bo'ladi.
- Karta raqamining faqat oxirgi 4 raqami saqlanadi.





=====================================================
SAYT + TELEGRAM BOT + MINI APP — VERCEL'DA (kompyuter o'chiq bo'lsa ham ishlaydi)
=====================================================
Bitta Vercel loyiha (bepul) hammasini ishlatadi, server ishga tushirish shart emas:
  https://<sayt>.vercel.app/               — sayt (index, login, shop, admin)
  https://<sayt>.vercel.app/telegram-app/  — Telegram Mini App (botdagi «🛒 Do'kon»)
  /api/products  — sayt va Mini App uchun yagona mahsulotlar ro'yxati (products.json)
  /api/orders    — saytdan va Mini App'dan buyurtma -> bot orqali adminga
  /api/telegram  — bot (Telegram webhook): /start, kategoriyalar, mijoz bilan yozishma

Buyurtma kelganda admin chatida tugmalar chiqadi: Tayyorlanmoqda / Yetkazilmoqda /
Yetkazildi / Bekor. Bosilsa xabar yangilanadi va Telegram orqali buyurtma bergan
mijozga avtomatik xabar boradi. Mijoz botga yozsa xabar adminga keladi —
unga reply qilsangiz javob mijozga boradi.

DEPLOY (bir marta):
1) npx vercel login
2) npx vercel deploy --prod
3) Vercel -> Project -> Settings -> Environment Variables:
     BOT_TOKEN      = @BotFather tokeni
     ADMIN_CHAT_ID  = buyurtmalar keladigan chat ID
   so'ng yana: npx vercel deploy --prod
4) node setup-bot.js https://<sayt>.vercel.app
   (yoki bot-setup.html ni brauzerda ochib, token va manzilni yozing)
5) Tavsiya: @BotFather -> /mybots -> bot -> Bot Settings -> Configure Mini App ->
   Enable Mini App -> https://<sayt>.vercel.app/telegram-app/

MAHSULOT QO'SHISH/NARX: products.json ni tahrirlang va «npx vercel deploy --prod».
(Vercel'da admin.html dagi mahsulot tahriri faqat shu brauzerda saqlanadi.)

ESLATMA:
- Vercel'da baza yo'q: buyurtmalar Telegram admin chatida turadi.
  admin.html dagi buyurtmalar ro'yxati faqat kompyuterda (node index.js) ishlaydi.
- Webhook yoqilgach «node index.js» botni ishga tushirmaydi, faqat saytni —
  ikki joyda bir vaqtda ishlab, bir-birini buzmasligi uchun.
- .env va bot-setup.html Vercel'ga yuklanmaydi (.vercelignore).
