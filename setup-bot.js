/* =====================================================================
   FUTBOL MARKET — botni Vercel'dagi sayt bilan bog'lash (BIR MARTA ishlatiladi)

   Ishlatish:
     node setup-bot.js https://futbol-market.vercel.app

   Nima qiladi:
     - Telegram xabarlarini Vercel'dagi /api/telegram ga yo'naltiradi (webhook)
     - "Menu" tugmasini "🛒 Do'kon" ga aylantiradi (/telegram-app/ Mini App)
     - bot tavsifi va buyruqlarini (/start, /shop, /help) yozadi
     - manzilni .env ga PUBLIC_URL= va WEBAPP_URL= qilib saqlaydi
   Shundan keyin bot kompyuter o'chiq bo'lsa ham ishlaydi.
   Eslatma: webhook yoqilgach "node index.js" botni ishga tushirmaydi (faqat saytni).
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_FILE = path.join(__dirname, '.env');
const env = {};
if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

const TOKEN = (process.env.BOT_TOKEN || env.BOT_TOKEN || '').trim();
const SITE = (process.argv[2] || process.env.PUBLIC_URL || env.PUBLIC_URL || '').trim().replace(/\/+$/, '');

if (!TOKEN) {
    console.error('BOT_TOKEN topilmadi. .env fayliga BOT_TOKEN= ni yozing.');
    process.exit(1);
}
if (!/^https:\/\/[^\s/]+$/i.test(SITE)) {
    console.error('Sayt manzilini bering (https:// bilan, oxirida papkasiz):');
    console.error('  node setup-bot.js https://futbol-market.vercel.app');
    process.exit(1);
}
const WEBAPP_URL = SITE + '/telegram-app/';
// api/_lib.js dagi webhookSecret() bilan bir xil bo'lishi shart
const SECRET = crypto.createHash('sha256').update('fm-webhook:' + TOKEN).digest('hex').slice(0, 48);

async function tg(method, params = {}) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`${method}: ${j.description}`);
    return j.result;
}

function saveEnv(key, value) {
    let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${key}=${value}`);
    else text += `${text && !text.endsWith('\n') ? '\n' : ''}${key}=${value}\n`;
    fs.writeFileSync(ENV_FILE, text);
}

(async () => {
    try {
        const me = await tg('getMe');
        console.log(`Bot: @${me.username}`);

        // sayt rostdan ishlayaptimi?
        const check = await fetch(SITE + '/api/telegram').then(r => r.text()).catch(e => 'xato: ' + e.message);
        if (!/ishlayapti/.test(check)) throw new Error(`${SITE}/api/telegram javob bermadi (${String(check).slice(0, 80)}). Avval Vercel'ga deploy qiling.`);

        await tg('setWebhook', {
            url: SITE + '/api/telegram',
            secret_token: SECRET,
            allowed_updates: ['message', 'callback_query']
        });
        console.log('✓ Webhook:', SITE + '/api/telegram');

        await tg('setChatMenuButton', {
            menu_button: { type: 'web_app', text: '🛒 Do‘kon', web_app: { url: WEBAPP_URL } }
        });
        console.log('✓ Menu tugmasi: 🛒 Do‘kon ->', WEBAPP_URL);

        await tg('setMyCommands', {
            commands: [
                { command: 'start', description: 'Boshlash' },
                { command: 'shop', description: 'Do‘konni ochish' },
                { command: 'help', description: 'Yordam' }
            ]
        });
        await tg('setMyDescription', {
            description:
                '⚽ Futbol Market — original formalar, butsalar, to‘plar va kuboklar.\n\n' +
                '«🛒 Do‘kon» tugmasini bosing: mahsulotni tanlang, savatga qo‘shing va buyurtma bering. ' +
                'Forma orqasiga ism va raqam yozib beramiz.\n\nSayt: ' + SITE
        });
        await tg('setMyShortDescription', {
            short_description: '⚽ Formalar, butsalar, to‘plar, kuboklar. Sayt: ' + SITE.replace(/^https:\/\//, '')
        });
        console.log('✓ Buyruqlar va tavsif yozildi');

        saveEnv('PUBLIC_URL', SITE);
        saveEnv('WEBAPP_URL', WEBAPP_URL);
        console.log('✓ .env ga PUBLIC_URL va WEBAPP_URL saqlandi');

        console.log('\nTayyor! Telegramda @' + me.username + ' ga /start yuboring.');
        console.log('Tavsiya: @BotFather -> /mybots -> @' + me.username +
            ' -> Bot Settings -> Configure Mini App -> Enable Mini App -> ' + WEBAPP_URL);
    } catch (e) {
        console.error('Xato:', e.message);
        process.exit(1);
    }
})();
