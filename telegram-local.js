/* =====================================================================
   FUTBOL MARKET — sayt + bot + Telegram Mini App'ni KOMPYUTERDA ishga tushirish
     node telegram-local.js        (yoki START.bat)

   1) cloudflared (bepul https tunnel) ni .tools/ ga yuklab oladi (faqat birinchi marta)
   2) http://localhost:3000 uchun https://....trycloudflare.com manzil ochadi
   3) sayt + bot (index.js) ni ishga tushiradi
   4) botdagi «🛒 Do'kon» tugmasini shu manzildagi /telegram-app/ ga ulaydi
   Buyurtmalar data.json ga yoziladi -> admin panel (admin.html) da ko'rinadi.
   Kompyuter o'chsa bot ham to'xtaydi. Doimiy ishlashi uchun: README dagi Vercel bo'limi.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const TOOLS = path.join(__dirname, '.tools');
const EXE = path.join(TOOLS, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const DOWNLOAD = {
    win32: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
    linux: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'
}[process.platform];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureCloudflared() {
    if (fs.existsSync(EXE)) return;
    if (!DOWNLOAD) throw new Error('cloudflared ni o‘zingiz o‘rnating: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    console.log('[tunnel] cloudflared yuklab olinmoqda (bir marta, ~60 MB)...');
    fs.mkdirSync(TOOLS, { recursive: true });
    const r = await fetch(DOWNLOAD);
    if (!r.ok) throw new Error('cloudflared yuklab bo‘lmadi: HTTP ' + r.status);
    fs.writeFileSync(EXE + '.part', Buffer.from(await r.arrayBuffer()));
    fs.renameSync(EXE + '.part', EXE);
    if (process.platform !== 'win32') fs.chmodSync(EXE, 0o755);
}

function openTunnel() {
    return new Promise((resolve, reject) => {
        const child = spawn(EXE, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], { windowsHide: true });
        const timer = setTimeout(() => reject(new Error('tunnel manzili 60 soniyada kelmadi')), 60000);
        const onData = buf => {
            const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (m) { clearTimeout(timer); resolve({ url: m[0], child }); }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', code => { clearTimeout(timer); reject(new Error('cloudflared to‘xtadi, kod ' + code)); });
        process.on('exit', () => child.kill());
    });
}

(async () => {
    let tunnel;
    try {
        await ensureCloudflared();
        tunnel = await openTunnel();
    } catch (e) {
        console.error('[tunnel] ' + e.message);
        console.error('[tunnel] Tunnel ochilmadi — sayt va bot tunnelsiz ishga tushadi (Mini App tugmasi bo‘lmaydi).');
        require('./index.js');
        return;
    }

    const site = tunnel.url;
    process.env.PUBLIC_URL = site;
    process.env.WEBAPP_URL = site + '/telegram-app/';
    console.log('[tunnel] Sayt internetda:', site);

    require('./index.js'); // sayt + bot (.env ni o'zi o'qiydi)

    const TOKEN = (process.env.BOT_TOKEN || '').trim();
    if (!TOKEN) return;
    const tg = async (method, params = {}) => {
        const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params)
        });
        const j = await r.json();
        if (!j.ok) throw new Error(`${method}: ${j.description}`);
        return j.result;
    };

    // yangi trycloudflare manzili DNS'da paydo bo'lishini kutamiz
    for (let i = 0; i < 30; i++) {
        try { if ((await fetch(site + '/telegram-app/')).ok) break; } catch (e) { }
        await sleep(2000);
    }

    try {
        const hook = await tg('getWebhookInfo');
        if (hook.url) {
            console.log(`[tunnel] Bot Vercel'da ishlayapti (${hook.url}) — menyu tugmasi o'zgartirilmadi.`);
            return;
        }
        await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: '🛒 Do‘kon', web_app: { url: process.env.WEBAPP_URL } } });
        console.log('[tunnel] Botdagi «🛒 Do‘kon» tugmasi ->', process.env.WEBAPP_URL);
        console.log('[tunnel] Admin panel: http://localhost:' + PORT + '/admin.html');
    } catch (e) {
        console.error('[tunnel] Menyu tugmasini o‘rnatib bo‘lmadi:', e.message);
    }

    // oyna yopilganda eskirgan manzil qolmasin
    const reset = async () => {
        try { await tg('setChatMenuButton', { menu_button: { type: 'default' } }); } catch (e) { }
        process.exit(0);
    };
    process.on('SIGINT', reset);
    process.on('SIGTERM', reset);
})();
