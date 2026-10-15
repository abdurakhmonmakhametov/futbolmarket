/* =====================================================================
   FUTBOL MARKET — kompyuterdagi sayt serveri (http://localhost:3000)
   Mahsulotlar va buyurtmalar data.json da. Admin panel (admin.html) shu yerdan o'qiydi.
   Buyurtmani tekshirish Vercel bilan bir xil: api/_lib.js -> buildOrder
   ===================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildOrder, OrderError, isAdminRequest } = require('./api/_lib');

const ROOT = __dirname, DATA = path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT) || 3000;

function load() {
    if (!fs.existsSync(DATA)) {
        const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
        fs.writeFileSync(DATA, JSON.stringify({ products, orders: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
}
function save(d) { fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); }

function send(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}
function body(req) {
    return new Promise((resolve, reject) => {
        let b = '';
        req.on('data', c => { b += c; if (b.length > 5e6) req.destroy(); });
        req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    });
}

// Admin amallari: shu kompyuterning o'zidan (localhost) yoki ADMIN_KEY paroli bilan.
// Tunnel (cloudflared) orqali kelgan so'rovda cf-connecting-ip bo'ladi — u "tashqi" hisoblanadi.
function adminOk(req) {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
        !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'];
    return local || isAdminRequest(req);
}

async function api(req, res, p) {
    const d = load();
    const isPublic = (req.method === 'GET' && p === '/api/products') || (req.method === 'POST' && p === '/api/orders');
    if (!isPublic && !adminOk(req)) return send(res, 401, { error: 'Admin paroli kerak' });

    if (req.method === 'GET' && p === '/api/products') return send(res, 200, d.products);
    if (req.method === 'POST' && p === '/api/products') {
        const x = await body(req);
        x.id = x.id || Date.now();
        d.products.push(x); save(d);
        return send(res, 201, x);
    }

    if (req.method === 'GET' && p === '/api/orders') return send(res, 200, d.orders);
    if (req.method === 'POST' && p === '/api/orders') {
        // sayt va Telegram Mini App buyurtmasi. Bot (index.js) yangi yozuvni ko'rib adminga yuboradi.
        try {
            const { order, lines } = buildOrder(await body(req), d.products);
            d.orders.push(...lines); save(d);
            return send(res, 201, { ok: true, id: order.id, total: order.total });
        } catch (e) {
            if (e instanceof OrderError) return send(res, e.status, { error: e.message });
            throw e;
        }
    }

    const m = p.match(/^\/api\/(orders|products)\/(.+)$/);
    if (m) {
        const type = m[1], id = decodeURIComponent(m[2]), arr = d[type];
        if (req.method === 'PUT') {
            const x = await body(req), i = arr.findIndex(a => String(a.id) === id);
            if (i < 0) return send(res, 404, { error: 'not found' });
            arr[i] = { ...arr[i], ...x, id: arr[i].id }; save(d);
            return send(res, 200, arr[i]);
        }
        if (req.method === 'DELETE') {
            d[type] = arr.filter(a => String(a.id) !== id); save(d);
            return send(res, 200, { ok: true });
        }
    }
    return send(res, 404, { error: 'not found' });
}

// Internetga (tunnel orqali) ochilganda maxfiy fayllar ko'rinmasligi kerak
const BLOCKED = new Set(['data.json', 'bot-state.json', 'server.js', 'index.js', 'setup-bot.js', 'telegram-local.js',
    'package.json', 'START.bat', 'README.txt', 'THEME_LANG_README.txt', 'bot-setup.html', 'vercel.json']);
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary'
};

function serveFile(res, p) {
    let rel = decodeURIComponent(p === '/' ? '/index.html' : p);
    if (rel.endsWith('/')) rel += 'index.html';
    const fp = path.normalize(path.join(ROOT, rel));
    const parts = path.relative(ROOT, fp).split(path.sep);
    if (!fp.startsWith(ROOT + path.sep) || parts.some(s => s.startsWith('.')) || parts[0] === 'api' || parts[0] === 'FUTBOL_MARKET_FIXED' ||
        (parts.length === 1 && BLOCKED.has(parts[0]))) {
        res.writeHead(404); return res.end('Not found');
    }
    fs.stat(fp, (e, st) => {
        if (!e && st.isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
        fs.readFile(fp, (err, b) => {
            if (err) { res.writeHead(404); return res.end('Not found'); }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
            res.end(b);
        });
    });
}

const server = http.createServer(async (req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' });
        return res.end();
    }
    if (p.startsWith('/api/')) {
        try { return await api(req, res, p); } catch (e) { return send(res, 500, { error: e.message }); }
    }
    serveFile(res, p);
});
server.listen(PORT, '0.0.0.0', () => console.log(`Futbol Market: http://localhost:${PORT}`));
