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
BOTDA BUYURTMA (Mini App) — KOMPYUTERDA: START.bat
=====================================================
START.bat endi «node telegram-local.js» ni ishga tushiradi:
  1) cloudflared (bepul https tunnel) birinchi marta .tools/ ga yuklanadi
  2) sayt internetda https://....trycloudflare.com manzilida ochiladi
  3) bot ishga tushadi va mijozlar chatidagi «🛒 Do'kon» tugmasi shu manzilga ulanadi
Mijoz botda «🛒 Do'kon» ni bosadi -> mahsulot, o'lcham, savat -> «Buyurtma berish».
Buyurtma data.json ga yoziladi va:
  - admin panelda ko'rinadi: http://localhost:3000/admin.html
  - admin chatiga bot xabari keladi (holat tugmalari bilan); tugma bosilsa admin
    paneldagi holat ham o'zgaradi va mijozga Telegram'da xabar boradi
  - admin panelda holatni o'zgartirsangiz ham bot buni ko'radi
Admin panelda qo'shilgan yangi mahsulot darhol botdagi do'konda ham chiqadi.

Eslatma:
- Tunnel manzili har ishga tushirishda yangi bo'ladi — bot buni o'zi yangilaydi.
- Kompyuter yoki oyna yopilsa bot to'xtaydi. Doimiy ishlashi uchun pastdagi Vercel bo'limi.
- Internetdan /api/orders ro'yxatini ko'rib bo'lmaydi (faqat shu kompyuterdan yoki
  ADMIN_KEY paroli bilan). .env, data.json kabi fayllar internetga berilmaydi.


=====================================================
SAYT + TELEGRAM BOT + MINI APP — VERCEL'DA (kompyuter o'chiq bo'lsa ham ishlaydi)
=====================================================
Bitta Vercel loyiha (bepul) hammasini ishlatadi:
  https://<sayt>.vercel.app/               — sayt (index, login, shop, admin)
  https://<sayt>.vercel.app/telegram-app/  — Telegram Mini App (botdagi «🛒 Do'kon»)
  /api/products  — sayt, Mini App va bot uchun yagona mahsulotlar ro'yxati
  /api/orders    — saytdan va Mini App'dan buyurtma -> bot orqali adminga + admin panelga
  /api/telegram  — bot (Telegram webhook): /start, kategoriyalar, mijoz bilan yozishma

DEPLOY (bir marta):
1) https://vercel.com/new -> GitHub'dagi futbolmarket reponi Import qiling
   (yoki: npx vercel login va npx vercel deploy --prod)
2) Vercel -> Project -> Storage -> Upstash (Redis) -> Create/Connect
   (bepul; buyurtmalar va mahsulotlar shu yerda saqlanadi -> admin panelda ko'rinadi)
3) Vercel -> Project -> Settings -> Environment Variables:
     BOT_TOKEN      = @BotFather tokeni
     ADMIN_CHAT_ID  = buyurtmalar keladigan chat ID
     ADMIN_KEY      = admin panel paroli (o'zingiz o'ylab toping)
   so'ng Deployments -> Redeploy
4) node setup-bot.js https://<sayt>.vercel.app
   (yoki bot-setup.html ni brauzerda ochib, token va manzilni yozing)
5) Tavsiya: @BotFather -> /mybots -> bot -> Bot Settings -> Configure Mini App ->
   Enable Mini App -> https://<sayt>.vercel.app/telegram-app/

Admin panel: https://<sayt>.vercel.app/admin.html — birinchi marta ADMIN_KEY so'raladi.
Upstash ulanmasa: buyurtmalar faqat Telegram admin chatiga boradi, mahsulotlar products.json dan.

ESLATMA:
- Webhook yoqilgach START.bat botni kompyuterda ishga tushirmaydi (faqat saytni) —
  ikki joyda bir vaqtda ishlab, bir-birini buzmasligi uchun.
- .env, bot-setup.html, .tools Vercel'ga yuklanmaydi (.vercelignore).
