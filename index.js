/* =====================================================================
   FUTBOL MARKET — sayt + Telegram bot (bitta jarayonda)
   Ishga tushirish:  node index.js
   Sozlash: .env fayli (namuna: .env.example)
   Qo'shimcha paket kerak emas (Node.js 18 yoki yangiroq).
   ===================================================================== */

const fs = require('fs');
const path = require('path');

/* ---------- .env ni o'qish ---------- */
(function loadEnv() {
    const file = path.join(__dirname, '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (line.trim().startsWith('#')) continue;
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
})();

const TOKEN = (process.env.BOT_TOKEN || '').trim();
const ADMINS = (process.env.ADMIN_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const TG_API = process.env.TELEGRAM_API || 'https://api.telegram.org';
const SITE = 'http://127.0.0.1:3000';
const STATE_FILE = path.join(__dirname, 'bot-state.json');
const POLL_ORDERS_MS = 5000;

/* ---------- 1) Saytni ishga tushirish ---------- */
require('./server.js');

if (typeof fetch !== 'function') {
    console.log('[bot] Node.js 18 yoki yangiroq kerak. Bot o‘chirilgan, sayt ishlayapti.');
    return;
}
if (!TOKEN) {
    console.log('[bot] BOT_TOKEN topilmadi — Telegram bot o‘chirilgan, sayt ishlayapti.');
    console.log('[bot] Yoqish uchun .env.example faylini .env deb nusxalab, BOT_TOKEN ni yozing.');
    return;
}

/* ---------- Yordamchilar ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = n => Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ') + ' so‘m';

// Admin paneldagi holat nomlari bilan bir xil bo'lishi shart
const STATUS = { t: 'Tayyorlanmoqda', y: 'Yetkazilmoqda', d: 'Yetkazildi', c: 'Bekor' };
const STATUS_ICON = { 'Yangi': '🆕', 'Tayyorlanmoqda': '📦', 'Yetkazilmoqda': '🚚', 'Yetkazildi': '✅', 'Bekor': '❌' };

/* ---------- Holat (qaysi buyurtmalar yuborilgan) ---------- */
let state = { seen: [], groups: {}, offset: 0 };
const firstRun = !fs.existsSync(STATE_FILE);
if (!firstRun) {
    try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch (e) { }
}
function saveState() {
    state.seen = state.seen.slice(-2000);
    const keys = Object.keys(state.groups);
    if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete state.groups[k]);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

/* ---------- Telegram API ---------- */
async function tg(method, params = {}, timeoutMs = 20000) {
    const r = await fetch(`${TG_API}/bot${TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeoutMs)
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`${method}: ${j.description}`);
    return j.result;
}

/* ---------- Sayt API ---------- */
async function getOrders() {
    const r = await fetch(SITE + '/api/orders');
    return r.json();
}
async function setStatus(id, status) {
    await fetch(`${SITE}/api/orders/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
}

/* ---------- Xabar matni ---------- */
function groupStatus(list) {
    const set = [...new Set(list.map(o => o.status || 'Yangi'))];
    return set.length === 1 ? set[0] : set.join(', ');
}

function orderText(list, title) {
    const f = list[0];
    const total = list.reduce((n, o) => n + Number(o.total || 0), 0);
    const delivery = list.reduce((n, o) => n + Number(o.delivery || 0), 0);
    const status = groupStatus(list);
    const mapOk = String(f.location || '').startsWith('https://www.google.com/maps?q=');

    const items = list.map((o, i) => {
        const extra = o.custom ? ` • yozuv: ${esc(o.shirtName)} #${esc(o.shirtNumber)}` : '';
        return `${i + 1}. <b>${esc(o.product)}</b>\n    O‘lcham: ${esc(o.size)} × ${o.quantity}${extra}\n    ${money(Number(o.unitPrice) * Number(o.quantity))}`;
    }).join('\n');

    const pay = f.payment === 'Karta'
        ? `💳 Karta${f.cardLast4 ? ' •••• ' + esc(f.cardLast4) : ''}`
        : `💵 ${esc(f.payment || 'Naqd pul')}`;

    return [
        `${title} <code>#${String(f.id).slice(-6)}</code>`,
        '',
        `👤 ${esc(f.userName)}${f.email ? ' (' + esc(f.email) + ')' : ''}`,
        f.phone ? `📞 ${esc(f.phone)}` : null,
        f.address ? `📍 ${esc(f.address)}` : null,
        mapOk ? `🗺 <a href="${esc(f.location)}">Xaritada ochish</a>` : null,
        pay,
        '',
        items,
        '',
        delivery ? `🚚 Yetkazib berish: ${money(delivery)}` : null,
        `💰 <b>Jami: ${money(total)}</b>`,
        `${STATUS_ICON[status] || '📌'} Holat: <b>${esc(status)}</b>`
    ].filter(x => x !== null).join('\n');
}

function keyboard(gid) {
    return {
        inline_keyboard: [
            [
                { text: '📦 Tayyorlanmoqda', callback_data: `s:t:${gid}` },
                { text: '🚚 Yetkazilmoqda', callback_data: `s:y:${gid}` }
            ],
            [
                { text: '✅ Yetkazildi', callback_data: `s:d:${gid}` },
                { text: '❌ Bekor', callback_data: `s:c:${gid}` }
            ]
        ]
    };
}

/* ---------- Yangi buyurtmalarni yuborish ---------- */
function groupOrders(orders) {
    // bitta savatdan chiqqan buyurtmalar: bir xil email+telefon, vaqti bir-biriga yaqin
    const sorted = [...orders].sort((a, b) => Number(a.id) - Number(b.id));
    const groups = [];
    for (const o of sorted) {
        const g = groups[groups.length - 1];
        const same = g
            && (g[0].email || '') === (o.email || '')
            && (g[0].phone || '') === (o.phone || '')
            && Math.abs(new Date(o.date) - new Date(g[g.length - 1].date)) < 30000;
        if (same) g.push(o); else groups.push([o]);
    }
    return groups;
}

async function notifyAdmins(list) {
    const gid = String(list[0].id);
    state.groups[gid] = list.map(o => o.id);

    for (const chat of ADMINS) {
        try {
            await tg('sendMessage', {
                chat_id: chat,
                text: orderText(list, '🆕 <b>Yangi buyurtma</b>'),
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: keyboard(gid)
            });

            const m = String(list[0].location || '').match(/maps\?q=(-?[\d.]+),(-?[\d.]+)/);
            if (m) await tg('sendLocation', { chat_id: chat, latitude: +m[1], longitude: +m[2] });
        } catch (e) {
            console.error('[bot] xabar yuborilmadi:', e.message);
        }
    }
}

let checking = false;
async function checkOrders() {
    if (checking) return;
    checking = true;
    try {
        const orders = await getOrders();

        if (firstRun && state.seen.length === 0 && !state.initialized) {
            // birinchi ishga tushirishda eski buyurtmalar uchun xabar yubormaymiz
            state.seen = orders.map(o => o.id);
            state.initialized = true;
            saveState();
            return;
        }

        const seen = new Set(state.seen);
        const fresh = orders.filter(o => !seen.has(o.id));
        if (!fresh.length) return;

        if (!ADMINS.length) {
            console.log('[bot] Yangi buyurtma bor, lekin ADMIN_CHAT_ID yozilmagan. Botga /start yuboring.');
            return;
        }

        for (const list of groupOrders(fresh)) {
            await notifyAdmins(list);
            list.forEach(o => state.seen.push(o.id));
            saveState();
        }
    } catch (e) {
        if (!/fetch failed/.test(e.message)) console.error('[bot] buyurtmalarni tekshirishda xato:', e.message);
    } finally {
        checking = false;
    }
}

/* ---------- Buyruqlar va tugmalar ---------- */
const isAdmin = id => ADMINS.includes(String(id));

const HELP = [
    '⚽ <b>Futbol Market bot — admin</b>',
    '',
    '/orders — oxirgi 10 ta buyurtma',
    '/new — hali yetkazilmagan buyurtmalar',
    '/stats — umumiy hisobot',
    '/start — mijozga ko‘rinadigan salomlashuvni sinash',
    '',
    'Yangi buyurtma va mijoz xabarlari shu yerga keladi. Mijoz xabariga <b>reply</b> qilsangiz, javob unga boradi.'
].join('\n');

// pastdagi doimiy tugmalar (admin uchun)
const MENU = {
    keyboard: [
        [{ text: '📋 Buyurtmalar' }, { text: '🆕 Yangi' }],
        [{ text: '📊 Hisobot' }]
    ],
    resize_keyboard: true
};

async function reply(chat, text, markup) {
    const params = { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (markup) params.reply_markup = markup;
    return tg('sendMessage', params);
}

function line(o) {
    const st = o.status || 'Yangi';
    return `${STATUS_ICON[st] || '📌'} <code>#${String(o.id).slice(-6)}</code> ${esc(o.product)} × ${o.quantity} — ${money(o.total)}\n      ${esc(o.userName)}${o.phone ? ', ' + esc(o.phone) : ''}`;
}

/* ---------- Mijoz bilan muloqot ---------- */
const PUBLIC_URL = (process.env.PUBLIC_URL || '').trim();
const WEBAPP_URL = (process.env.WEBAPP_URL || '').trim();

const CUSTOMER_MENU = {
    keyboard: [
        ...(/^https:\/\//i.test(WEBAPP_URL) ? [[{ text: '🛒 Do‘konni ochish', web_app: { url: WEBAPP_URL } }]] : []),
        [{ text: 'Menga FORMA kerak edi' }],
        [{ text: 'Menga BUTSA kerak edi' }],
        [{ text: 'Menga KUBOK kerak edi' }],
        [{ text: 'Menga TO‘P kerak edi' }],
        [{ text: 'Menga BOSHQA narsa kerak edi' }]
    ],
    resize_keyboard: true
};

const CATS = {
    forma: { title: 'FORMA', icon: '👕', cat: 'forma' },
    butsa: { title: 'BUTSA', icon: '👟', cat: 'butsa' },
    kubok: { title: 'KUBOK', icon: '🏆', cat: 'kubok' },
    top: { title: 'TO‘P', icon: '⚽', cat: 'top' },
    boshqa: { title: 'BOSHQA', icon: '🛍', cat: null }
};
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const CAT_RE = /menga\s+(forma|butsa|kubok|to.?p|boshqa)/i;

function who(msg) {
    const u = msg.from || {};
    return u.username ? '@' + u.username : (u.first_name || 'Mijoz');
}

function siteButton() {
    if (/^https:\/\//i.test(WEBAPP_URL)) {
        return { inline_keyboard: [[{ text: '🛒 Do‘konni ochish', web_app: { url: WEBAPP_URL } }]] };
    }
    return /^https:\/\//i.test(PUBLIC_URL)
        ? { inline_keyboard: [[{ text: '🛒 Saytga o‘tish', url: PUBLIC_URL }]] }
        : null;
}

async function greet(msg) {
    const text = `ASSALOMU ALAYKUM ${esc(who(msg))}! 👋\n\nSiz <b>Futbol Market</b> saytiga qo‘shildingiz.\nSizga futbol buyumlari bo‘yicha nima kerak?`;
    return reply(msg.chat.id, text, CUSTOMER_MENU);
}

async function tellAdmins(html) {
    for (const chat of ADMINS) {
        try { await reply(chat, html); } catch (e) { console.error('[bot] adminga yuborilmadi:', e.message); }
    }
}

async function onCategory(msg, key) {
    const chat = msg.chat.id;
    const c = CATS[key];

    // adminga xabar (reply qilib javob berish mumkin)
    await tellAdmins(
        `🛍 <b>Mijoz so‘rovi</b>\n👤 ${esc(who(msg))}\nID: <code>${chat}</code>\n\nMijoz: <b>Menga ${esc(c.title)} kerak edi</b>\n\n↩️ Javob berish uchun shu xabarga <b>reply</b> qiling.`
    );

    if (!c.cat) {
        return reply(chat, 'Yaxshi! 🙂 Nima kerakligini yozib yuboring ✍️\nAdmin tez orada javob beradi.', CUSTOMER_MENU);
    }

    let list = [];
    try {
        const r = await fetch(SITE + '/api/products');
        list = (await r.json()).filter(p => norm(p.cat) === c.cat);
    } catch (e) { }

    const body = list.length
        ? `${c.icon} <b>${esc(c.title)}</b> bo‘yicha mahsulotlarimiz:\n\n` +
          list.map((p, i) => `${i + 1}. <b>${esc(p.name)}</b> — ${money(p.price)}`).join('\n') +
          '\n\nSotib olish uchun saytimizga kiring. Savollaringiz bo‘lsa shu yerga yozing, admin javob beradi.'
        : `${c.icon} Hozircha bu bo‘limda mahsulot ko‘rinmayapti. Admin siz bilan bog‘lanadi.`;

    const markup = siteButton();
    return markup
        ? tg('sendMessage', { chat_id: chat, text: body, parse_mode: 'HTML', reply_markup: markup })
        : reply(chat, body, CUSTOMER_MENU);
}

async function onMessage(msg) {
    if (msg.chat.type && msg.chat.type !== 'private') return;
    const chat = msg.chat.id;
    const text = String(msg.text || '').trim();
    const word = text.split(/[\s@]/)[0].toLowerCase();
    const low = text.toLowerCase();
    const admin = isAdmin(chat);

    // Admin hali sozlanmagan: har qanday xabarga chat ID ni aytamiz
    if (!ADMINS.length) {
        return reply(chat, `Salom! 👋\nSizning chat ID: <code>${chat}</code>\n\n.env faylida <code>ADMIN_CHAT_ID=${chat}</code> deb yozing va <code>node index.js</code> ni qayta ishga tushiring.`);
    }

    // Admin mijoz xabariga reply qildi -> mijozga yuboramiz
    if (admin && msg.reply_to_message && text) {
        const m = String(msg.reply_to_message.text || '').match(/ID:\s*(\d+)/);
        if (m) {
            try {
                await reply(m[1], `👨‍💼 <b>Admin:</b> ${esc(text)}`, CUSTOMER_MENU);
                return reply(chat, 'Mijozga yuborildi ✅');
            } catch (e) {
                return reply(chat, 'Yuborib bo‘lmadi: ' + esc(e.message));
            }
        }
    }

    if (word === '/start') return greet(msg);

    const cm = text.match(CAT_RE);
    if (cm) return onCategory(msg, norm(cm[1]));

    /* ----- ADMIN ----- */
    if (admin) {
        let cmd = word;
        if (!cmd.startsWith('/')) {
            if (/buyurtma|orders/.test(low)) cmd = '/orders';
            else if (/yangi|\bnew\b/.test(low)) cmd = '/new';
            else if (/hisobot|stats|statistika/.test(low)) cmd = '/stats';
            else cmd = '/admin';
        }

        if (cmd === '/orders') {
            const orders = await getOrders();
            const last = orders.slice(-10).reverse();
            return reply(chat, last.length ? '<b>Oxirgi buyurtmalar</b>\n\n' + last.map(line).join('\n') : 'Hozircha buyurtma yo‘q.', MENU);
        }

        if (cmd === '/new') {
            const orders = await getOrders();
            const open = orders.filter(o => ['Yangi', 'Tayyorlanmoqda', 'Yetkazilmoqda'].includes(o.status || 'Yangi')).slice(-15).reverse();
            return reply(chat, open.length ? '<b>Yetkazilishi kerak</b>\n\n' + open.map(line).join('\n') : 'Hammasi yetkazilgan ✅', MENU);
        }

        if (cmd === '/stats') {
            const orders = await getOrders();
            const count = {};
            let revenue = 0;
            for (const o of orders) {
                const st = o.status || 'Yangi';
                count[st] = (count[st] || 0) + 1;
                if (st !== 'Bekor') revenue += Number(o.total || 0);
            }
            const rows = Object.entries(count).map(([k, v]) => `${STATUS_ICON[k] || '📌'} ${esc(k)}: <b>${v}</b>`).join('\n');
            return reply(chat, `<b>Hisobot</b>\n\nJami buyurtmalar: <b>${orders.length}</b>\n${rows}\n\n💰 Tushum (bekorlarsiz): <b>${money(revenue)}</b>`, MENU);
        }

        return reply(chat, HELP, MENU);
    }

    /* ----- MIJOZ ----- */
    if (!text || text.startsWith('/')) return greet(msg);

    await tellAdmins(
        `💬 <b>Mijoz xabari</b>\n👤 ${esc(who(msg))}\nID: <code>${chat}</code>\n\n${esc(text)}\n\n↩️ Javob berish uchun shu xabarga <b>reply</b> qiling.`
    );
    return reply(chat, 'Xabaringiz adminga yuborildi ✅ Tez orada javob beramiz.', CUSTOMER_MENU);
}

async function onCallback(cb) {
    const chat = cb.message.chat.id;
    if (!isAdmin(chat)) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ruxsat yo‘q' });

    const [, code, gid] = String(cb.data).split(':');
    const status = STATUS[code];
    const ids = state.groups[gid];
    if (!status || !ids) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Buyurtma topilmadi' });

    for (const id of ids) await setStatus(id, status);

    const all = await getOrders();
    const list = all.filter(o => ids.includes(o.id));
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Holat: ${status}` });

    if (list.length) {
        try {
            await tg('editMessageText', {
                chat_id: chat,
                message_id: cb.message.message_id,
                text: orderText(list, '📦 <b>Buyurtma</b>'),
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: keyboard(gid)
            });
        } catch (e) {
            if (!/not modified/i.test(e.message)) throw e;
        }
    }
}

async function updatesLoop() {
    while (true) {
        try {
            const updates = await tg('getUpdates', {
                offset: state.offset || 0,
                timeout: 25,
                allowed_updates: ['message', 'callback_query']
            }, 35000);

            for (const u of updates) {
                state.offset = u.update_id + 1;
                try {
                    if (u.message) {
                        console.log(`[bot] xabar keldi: chat ${u.message.chat.id} — "${String(u.message.text || '(matn emas)').slice(0, 40)}"`);
                        await onMessage(u.message);
                    }
                    if (u.callback_query) await onCallback(u.callback_query);
                } catch (e) {
                    console.error('[bot] xato:', e.message);
                }
            }
            if (updates.length) saveState();
        } catch (e) {
            if (/Conflict/i.test(e.message)) {
                console.error('[bot] DIQQAT: bot boshqa joyda ham ishlayapti (boshqa terminal yoki START.bat oynasi).');
                console.error('[bot] Hamma terminal/oynalarni yoping yoki CMD da: taskkill /F /IM node.exe  — keyin bitta marta ishga tushiring.');
                await sleep(8000);
            } else {
                console.error('[bot] Telegramga ulanishda xato:', e.message);
                await sleep(5000);
            }
        }
    }
}

/* ---------- Start ---------- */
(async () => {
    try {
        const me = await tg('getMe');
        // Bot Vercel'da (webhook) ishlayotgan bo'lsa, uni buzmaymiz: bu yerda faqat sayt ishlaydi
        const hook = await tg('getWebhookInfo');
        if (hook.url) {
            console.log(`[bot] @${me.username} Vercel'da ishlayapti (${hook.url}). Bu kompyuterda bot ishga tushirilmadi — faqat sayt.`);
            return;
        }
        console.log(`[bot] Telegram bot ishga tushdi: @${me.username}  (versiya 2.3: mijoz salomlashuvi + kategoriya tugmalari)`);
        if (!ADMINS.length) console.log('[bot] ADMIN_CHAT_ID yozilmagan: botga /start yuboring, u ID ni aytadi.');
    } catch (e) {
        console.error('[bot] Tokenni tekshiring yoki internetni ulang:', e.message);
        console.error('[bot] Sayt ishlashda davom etadi, bot qayta urinadi.');
    }

    setInterval(checkOrders, POLL_ORDERS_MS);
    updatesLoop();
})();
