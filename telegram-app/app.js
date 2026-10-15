/* =====================================================================
   FUTBOL MARKET — Telegram Mini App (server kerak emas)
   Buyurtma /api/orders (Vercel) orqali botga, bot esa adminga yuboradi.
   API yo'q bo'lsa (oddiy statik hosting) — mijozning o'z Telegrami orqali adminga boradi.
   Savat, profil va buyurtmalar tarixi Telegram CloudStorage'da saqlanadi.
   ===================================================================== */

const S = window.SHOP;
const tg = window.Telegram && window.Telegram.WebApp;
const IN_TG = !!(tg && tg.initData);
const can = v => IN_TG && tg.isVersionAtLeast && tg.isVersionAtLeast(v);
const $ = id => document.getElementById(id);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => Number(n || 0).toLocaleString("en-US").replace(/,/g, " ") + " " + S.currency;
const tgUser = (IN_TG && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;

/* ---------------- Saqlash (localStorage + Telegram CloudStorage) ---------------- */

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem("fm_tg_" + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("fm_tg_" + key, JSON.stringify(value)); } catch (e) { }
    if (!can("6.9")) return;
    let json = JSON.stringify(value);
    // CloudStorage: bitta kalit uchun 4096 belgigacha
    if (Array.isArray(value)) {
      let list = value.slice();
      while (json.length > 4000 && list.length) { list = list.slice(1); json = JSON.stringify(list); }
    }
    if (json.length <= 4096) tg.CloudStorage.setItem(key, json, () => { });
  }
};

function loadCloud() {
  return new Promise(resolve => {
    if (!can("6.9")) return resolve();
    tg.CloudStorage.getItems(["cart", "profile", "orders"], (err, values) => {
      if (!err && values) {
        for (const k of ["cart", "profile", "orders"]) {
          if (!values[k]) continue;
          const local = store.get(k, null);
          const empty = !local || (Array.isArray(local) && !local.length) || (!Array.isArray(local) && !Object.keys(local).length);
          if (empty) { try { localStorage.setItem("fm_tg_" + k, values[k]); } catch (e) { } }
        }
      }
      resolve();
    });
  });
}

/* ---------------- Sayt API (mahsulotlar va buyurtmalar) ---------------- */

// Mini App saytning /telegram-app/ papkasida turadi, API esa /api da
const API = S.orderApi ? S.orderApi.replace(/\/+$/, "") + "/api" : "../api";
const WEBP = ["butsa", "card", "kubog", "logo", "ota", "real", "top"];

function miniImg(src) {
  const file = String(src || "").replace(/^\.?\//, "");
  const base = file.replace(/\.[a-z0-9]+$/i, "");
  if (!file || /^(https?:|data:)/i.test(file)) return file || "img/ball.webp";
  return WEBP.includes(base) ? `img/${base}.webp` : "../" + file;
}

async function loadProducts() {
  try {
    const r = await fetch(API + "/products", { cache: "no-store" });
    if (!r.ok) return;
    const list = await r.json();
    if (Array.isArray(list) && list.length) S.products = list.map(p => ({ ...p, img: miniImg(p.img) }));
  } catch (e) { /* config.js dagi ro'yxat qoladi */ }
}

/* ---------------- Holat ---------------- */

let cart = store.get("cart", []);
let category = "Barchasi";
let stack = ["shop"];
let sheetOpen = false;
let pick = null;           // ochiq mahsulot oynasi holati
let payMethod = null;
let geo = "";
let lastOrder = null;

const total = () => cart.reduce((n, x) => n + x.qty * x.unitPrice, 0);
const count = () => cart.reduce((n, x) => n + x.qty, 0);

function saveCart() {
  store.set("cart", cart);
  renderBadge();
  refreshPrimary();
}

/* ---------------- Asosiy tugma (Telegram MainButton yoki pastki tugma) ---------------- */

let primaryHandler = null;

function setPrimary(text, handler) {
  primaryHandler = handler;
  if (IN_TG) {
    tg.MainButton.setParams({ text, color: "#d9ff00", text_color: "#101400", is_visible: true, is_active: true });
  } else {
    $("barBtn").textContent = text;
    $("bar").classList.remove("hidden");
  }
}

function hidePrimary() {
  primaryHandler = null;
  if (IN_TG) tg.MainButton.hide();
  else $("bar").classList.add("hidden");
}

function runPrimary() { if (primaryHandler) primaryHandler(); }

function refreshPrimary() {
  const view = stack[stack.length - 1];
  if (sheetOpen) return setPrimary("Savatga qo‘shish · " + money(pickPrice() * pick.qty), addToCart);
  if (view === "shop") return cart.length ? setPrimary(`Savat · ${count()} ta · ${money(total())}`, () => go("cart")) : hidePrimary();
  if (view === "cart") return cart.length ? setPrimary("Rasmiylashtirish · " + money(total() + S.deliveryFee), () => go("checkout")) : hidePrimary();
  if (view === "checkout") return setPrimary("Buyurtma berish · " + money(total() + S.deliveryFee), submitOrder);
  hidePrimary();
}

/* ---------------- Navigatsiya ---------------- */

function show(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("hidden", v.id !== "view-" + view));
  window.scrollTo(0, 0);
  if (view === "cart") renderCart();
  if (view === "checkout") openCheckout();
  if (view === "orders") renderOrders();
  syncBack();
  refreshPrimary();
}

function go(view) { stack.push(view); show(view); }

function back() {
  if (sheetOpen) return closeSheet();
  if (stack.length > 1) stack.pop();
  show(stack[stack.length - 1]);
}

function home() { stack = ["shop"]; show("shop"); renderGrid(); }

function syncBack() {
  if (!IN_TG) return;
  if (sheetOpen || stack.length > 1) tg.BackButton.show(); else tg.BackButton.hide();
}

function haptic(kind) {
  if (!can("6.1")) return;
  if (kind === "success" || kind === "error") tg.HapticFeedback.notificationOccurred(kind);
  else tg.HapticFeedback.impactOccurred(kind || "light");
}

/* ---------------- Katalog ---------------- */

function renderChips() {
  const cats = ["Barchasi", ...new Set(S.products.map(p => p.cat))];
  $("chips").innerHTML = cats.map(c =>
    `<button class="chip ${c === category ? "active" : ""}" type="button" data-cat="${esc(c)}">${esc(c)}</button>`
  ).join("");
}

function renderGrid() {
  const list = S.products.filter(p => category === "Barchasi" || p.cat === category);
  $("grid").innerHTML = list.map(p => `
    <button class="card" type="button" data-id="${esc(p.id)}">
      <div class="card-img"><img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.src='img/ball.webp'"></div>
      <div class="card-body">
        <small>${esc(p.cat)}</small>
        <h3>${esc(p.name)}</h3>
        <div class="card-foot"><strong>${money(p.price)}</strong><span class="plus" aria-hidden="true">+</span></div>
      </div>
    </button>`).join("");
}

$("chips").addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (!b) return;
  category = b.dataset.cat;
  haptic("light");
  renderChips();
  renderGrid();
});

$("grid").addEventListener("click", e => {
  const card = e.target.closest(".card");
  if (card) openSheet(card.dataset.id);
});

function renderBadge() {
  const n = count();
  $("cartCount").textContent = n;
  $("cartCount").classList.toggle("hidden", n === 0);
}

/* ---------------- Mahsulot oynasi ---------------- */

function pickPrice() { return Number(pick.product.price) + (pick.print ? S.printFee : 0); }

function openSheet(id) {
  const p = S.products.find(x => String(x.id) === String(id));
  if (!p) return;
  pick = { product: p, size: p.sizes.length === 1 ? p.sizes[0] : null, qty: 1, print: false };

  $("pImg").src = p.img;
  $("pCat").textContent = p.cat;
  $("pName").textContent = p.name;
  $("pSizes").innerHTML = p.sizes.map(s =>
    `<button type="button" data-size="${esc(s)}" class="${s === pick.size ? "active" : ""}">${esc(s)}</button>`).join("");
  $("qVal").textContent = "1";
  $("printBox").classList.toggle("hidden", !p.custom);
  $("printOn").checked = false;
  $("printFields").classList.add("hidden");
  $("printName").value = "";
  $("printNum").value = "";
  $("printFeeText").textContent = "+" + money(S.printFee);
  $("pError").textContent = "";
  updateSheetPrice();

  $("sheet").classList.remove("hidden");
  $("sheet").querySelector(".sheet").scrollTop = 0;
  sheetOpen = true;
  syncBack();
  refreshPrimary();
}

function closeSheet() {
  $("sheet").classList.add("hidden");
  sheetOpen = false;
  pick = null;
  syncBack();
  refreshPrimary();
}

function updateSheetPrice() {
  $("pPrice").textContent = money(pickPrice() * pick.qty);
  refreshPrimary();
}

$("pSizes").addEventListener("click", e => {
  const b = e.target.closest("button[data-size]");
  if (!b) return;
  pick.size = b.dataset.size;
  $("pSizes").querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
  $("pError").textContent = "";
  haptic("light");
});

$("qMinus").onclick = () => { pick.qty = Math.max(1, pick.qty - 1); $("qVal").textContent = pick.qty; updateSheetPrice(); };
$("qPlus").onclick = () => { pick.qty = Math.min(99, pick.qty + 1); $("qVal").textContent = pick.qty; updateSheetPrice(); };

$("printOn").onchange = () => {
  pick.print = $("printOn").checked;
  $("printFields").classList.toggle("hidden", !pick.print);
  if (pick.print) $("printName").focus();
  updateSheetPrice();
};

$("sheetClose").onclick = closeSheet;
$("sheet").addEventListener("click", e => { if (e.target === $("sheet")) closeSheet(); });

function addToCart() {
  const p = pick.product;
  if (!pick.size) { $("pError").textContent = "Avval o‘lchamni tanlang."; haptic("error"); return; }

  let shirtName = "", shirtNumber = "";
  if (pick.print) {
    shirtName = $("printName").value.trim().toUpperCase();
    shirtNumber = $("printNum").value.trim();
    if (!shirtName || !(+shirtNumber >= 1 && +shirtNumber <= 99)) {
      $("pError").textContent = "Ism va 1–99 oralig‘idagi raqamni yozing.";
      haptic("error");
      return;
    }
  }

  const key = [p.id, pick.size, pick.print ? shirtName + "#" + shirtNumber : ""].join("|");
  const same = cart.find(x => x.key === key);
  if (same) same.qty = Math.min(99, same.qty + pick.qty);
  else cart.push({
    key, productId: p.id, name: p.name, cat: p.cat, img: p.img, size: pick.size,
    qty: pick.qty, unitPrice: pickPrice(), custom: pick.print, shirtName, shirtNumber
  });

  closeSheet();
  saveCart();
  haptic("success");
  toast("Savatga qo‘shildi ✓");
  $("cartBtn").classList.remove("bump");
  void $("cartBtn").offsetWidth;
  $("cartBtn").classList.add("bump");
}

/* ---------------- Savat ---------------- */

function renderCart() {
  $("cartClear").classList.toggle("hidden", !cart.length);
  if (!cart.length) {
    $("cartItems").innerHTML = `<div class="empty"><b>Savat bo‘sh</b>Katalogdan mahsulot tanlang.</div>`;
    $("cartTotals").innerHTML = "";
    return;
  }
  $("cartItems").innerHTML = cart.map(x => `
    <div class="line">
      <div class="line-img"><img src="${esc(x.img)}" alt="" onerror="this.src='img/ball.webp'"></div>
      <div class="line-info">
        <b>${esc(x.name)}</b>
        <span>O‘lcham: ${esc(x.size)}${x.custom ? " • " + esc(x.shirtName) + " #" + esc(x.shirtNumber) : ""}</span>
        <div class="line-row">
          <div class="stepper">
            <button type="button" data-act="minus" data-key="${esc(x.key)}" aria-label="Kamaytirish">${x.qty === 1 ? "×" : "−"}</button>
            <span>${x.qty}</span>
            <button type="button" data-act="plus" data-key="${esc(x.key)}" aria-label="Ko‘paytirish">+</button>
          </div>
          <strong>${money(x.qty * x.unitPrice)}</strong>
        </div>
      </div>
    </div>`).join("");
  $("cartTotals").innerHTML = `
    <div><span>Mahsulotlar</span><span>${money(total())}</span></div>
    <div><span>Yetkazib berish</span><span>${money(S.deliveryFee)}</span></div>
    <div class="grand"><span>Jami</span><span>${money(total() + S.deliveryFee)}</span></div>`;
}

$("cartItems").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const item = cart.find(x => x.key === b.dataset.key);
  if (!item) return;
  if (b.dataset.act === "plus") item.qty = Math.min(99, item.qty + 1);
  else if (item.qty > 1) item.qty--;
  else cart = cart.filter(x => x !== item);
  haptic("light");
  saveCart();
  renderCart();
});

$("cartClear").onclick = () => {
  const clear = () => { cart = []; saveCart(); renderCart(); };
  if (can("6.2")) tg.showConfirm("Savatdagi hamma narsa o‘chirilsinmi?", ok => ok && clear());
  else if (confirm("Savatdagi hamma narsa o‘chirilsinmi?")) clear();
};

/* ---------------- Rasmiylashtirish ---------------- */

function normPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  return d.length === 12 && d.startsWith("998") ? "+" + d : null;
}

function openCheckout() {
  const prof = store.get("profile", {});
  const tgName = tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") : "";
  $("coName").value = prof.name || tgName;
  $("coPhone").value = prof.phone || "";
  $("coAddress").value = prof.address || "";
  $("coNote").value = "";
  $("coError").textContent = "";
  geo = "";
  $("coLocate").classList.remove("is-done");
  $("coLocText").textContent = "Joylashuvimni aniqlash";
  setPay(prof.payment || null);
  $("sharePhone").classList.toggle("hidden", !can("6.9"));
  document.querySelectorAll(".invalid").forEach(x => x.classList.remove("invalid"));
  $("coSummary").innerHTML =
    `${count()} ta mahsulot • yetkazib berish ${money(S.deliveryFee)}<br>Jami: <b>${money(total() + S.deliveryFee)}</b>`;
}

function setPay(method) {
  payMethod = method;
  $("paySeg").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.pay === method));
}

$("paySeg").addEventListener("click", e => {
  const b = e.target.closest("button[data-pay]");
  if (b) { setPay(b.dataset.pay); haptic("light"); }
});

$("sharePhone").onclick = () => {
  tg.requestContact((ok, res) => {
    const phone = ok && res && res.responseUnsafe && res.responseUnsafe.contact && res.responseUnsafe.contact.phone_number;
    if (phone) { $("coPhone").value = "+" + String(phone).replace(/\D/g, ""); $("coPhone").classList.remove("invalid"); }
    else if (ok) toast("Raqam yuborildi. Uni shu yerga ham yozing.");
  });
};

function locate() {
  return new Promise((resolve, reject) => {
    if (can("8.0") && tg.LocationManager) {
      tg.LocationManager.init(() => {
        if (!tg.LocationManager.isLocationAvailable) return browserLocate().then(resolve, reject);
        tg.LocationManager.getLocation(loc => loc ? resolve(loc) : reject(new Error("denied")));
      });
    } else browserLocate().then(resolve, reject);
  });
}

function browserLocate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      reject,
      { timeout: 12000, enableHighAccuracy: true }
    );
  });
}

$("coLocate").onclick = async () => {
  $("coLocText").textContent = "Aniqlanmoqda...";
  $("coError").textContent = "";
  try {
    const { latitude: lat, longitude: lon } = await locate();
    geo = `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
    $("coLocate").classList.add("is-done");
    $("coLocText").textContent = "Joylashuv qo‘shildi ✓";
    haptic("success");
    if ($("coAddress").value.trim().length < 5) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=uz,ru&lat=${lat}&lon=${lon}`);
        const d = await r.json();
        if (d.display_name) $("coAddress").value = d.display_name;
      } catch (e) { }
    }
  } catch (e) {
    $("coLocText").textContent = "Joylashuvimni aniqlash";
    $("coError").textContent = "Joylashuvga ruxsat berilmadi. Manzilni yozib qoldiring.";
  }
};

function orderId() {
  return "FM-" + Date.now().toString(36).slice(-6).toUpperCase();
}

function orderText(o) {
  const items = o.items.map((x, i) =>
    `${i + 1}. ${x.name}\n   O‘lcham: ${x.size} × ${x.qty}${x.custom ? ` • yozuv: ${x.shirtName} #${x.shirtNumber}` : ""}\n   ${money(x.unitPrice * x.qty)}`
  ).join("\n");
  return [
    `🛒 YANGI BUYURTMA ${o.id}`,
    "",
    `👤 ${o.name}`,
    `📞 ${o.phone}`,
    o.address ? `📍 ${o.address}` : null,
    o.location ? `🗺 ${o.location}` : null,
    `💳 To‘lov: ${o.payment}`,
    o.note ? `📝 Izoh: ${o.note}` : null,
    "",
    items,
    "",
    `🚚 Yetkazib berish: ${money(o.delivery)}`,
    `💰 Jami: ${money(o.total)}`
  ].filter(x => x !== null).join("\n");
}

function sendToAdmin(text) {
  const url = `https://t.me/${S.adminUsername}?text=${encodeURIComponent(text)}`;
  if (IN_TG) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

// Buyurtmani bot orqali adminga yuborish. null = API yo'q (statik hosting), xato matni = rad etildi
async function sendOrder(o) {
  const orders = o.items.map(x => ({
    productId: x.productId, product: x.name, size: x.size, quantity: x.qty,
    custom: x.custom, shirtName: x.shirtName, shirtNumber: x.shirtNumber,
    userName: o.name, phone: o.phone, address: o.address, location: o.location, payment: o.payment
  }));
  let r;
  try {
    r = await fetch(API + "/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: IN_TG ? tg.initData : "", note: o.note, orders })
    });
  } catch (e) { return null; }
  if (r.status === 404 || r.status === 405 || r.status >= 500) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.error || "Buyurtma qabul qilinmadi" };
  return j;
}

let sending = false;
async function submitOrder() {
  if (sending) return;
  const err = (msg, field) => {
    $("coError").textContent = msg;
    if (field) { $(field).classList.add("invalid"); $(field).focus(); }
    haptic("error");
  };
  document.querySelectorAll(".invalid").forEach(x => x.classList.remove("invalid"));

  const name = $("coName").value.trim();
  const phone = normPhone($("coPhone").value);
  const address = $("coAddress").value.trim();

  if (!cart.length) return err("Savat bo‘sh.");
  if (name.length < 2) return err("Ismingizni yozing.", "coName");
  if (!phone) return err("Telefon raqamni to‘liq yozing: +998 90 123 45 67", "coPhone");
  if (address.length < 5 && !geo) return err("Manzilni yozing yoki joylashuvni aniqlang.", "coAddress");
  if (!payMethod) return err("To‘lov usulini tanlang.");

  store.set("profile", { name, phone, address, payment: payMethod });

  const ts = Date.now();
  const o = {
    id: orderId(), ts, name, phone, address, location: geo, payment: payMethod,
    note: $("coNote").value.trim(),
    items: cart.map(x => ({ ...x })),
    delivery: S.deliveryFee,
    total: total() + S.deliveryFee
  };
  if (tgUser) o.tg = tgUser.username ? "@" + tgUser.username : String(tgUser.id);

  sending = true;
  if (IN_TG) tg.MainButton.showProgress(false); else $("barBtn").disabled = true;
  const res = await sendOrder(o);
  sending = false;
  if (IN_TG) tg.MainButton.hideProgress(); else $("barBtn").disabled = false;
  if (res && res.error) return err(res.error);
  if (res && res.id) { o.id = res.id; o.total = res.total; o.sent = true; }

  const orders = store.get("orders", []);
  orders.push(o);
  store.set("orders", orders.slice(-15));

  lastOrder = o;
  cart = [];
  saveCart();

  $("orderText").textContent = orderText(o);
  $("doneTitle").textContent = o.sent ? "Buyurtma qabul qilindi" : "Buyurtma tayyor";
  $("doneText").innerHTML = o.sent
    ? "Admin tez orada qo‘ng‘iroq qiladi. Holat o‘zgarsa bot sizga xabar yuboradi."
    : "Admin chatida <b>Yuborish</b> tugmasini bosing — shunda buyurtma qabul qilinadi.";
  $("resend").classList.toggle("hidden", !!o.sent);
  stack = ["shop", "done"];
  show("done");
  haptic("success");
  if (!o.sent) sendToAdmin(orderText(o));
}

$("resend").onclick = () => lastOrder && sendToAdmin(orderText(lastOrder));

$("copyOrder").onclick = async () => {
  const text = $("orderText").textContent;
  try { await navigator.clipboard.writeText(text); toast("Nusxalandi ✓"); }
  catch (e) {
    const r = document.createRange();
    r.selectNodeContents($("orderText"));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    toast("Matnni belgilab nusxalang");
  }
};

/* ---------------- Buyurtmalarim ---------------- */

function renderOrders() {
  const orders = store.get("orders", []).slice().reverse();
  if (!orders.length) {
    $("ordersList").innerHTML = `<div class="empty"><b>Hali buyurtma yo‘q</b>Birinchi buyurtmangiz shu yerda ko‘rinadi.</div>`;
    return;
  }
  $("ordersList").innerHTML = orders.map(o => `
    <div class="order">
      <div class="order-head"><b>${esc(o.id)}</b><span>${new Date(o.ts).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</span></div>
      <ul>${o.items.map(x => `<li>${esc(x.name)} — ${esc(x.size)} × ${x.qty}</li>`).join("")}</ul>
      <div class="order-foot"><strong>${money(o.total)}</strong>${o.sent ? `<span class="sent">Botga yuborilgan ✓</span>` : `<button type="button" data-resend="${esc(o.id)}">Qayta yuborish</button>`}</div>
    </div>`).join("");
}

$("ordersList").addEventListener("click", e => {
  const b = e.target.closest("button[data-resend]");
  if (!b) return;
  const o = store.get("orders", []).find(x => x.id === b.dataset.resend);
  if (o) sendToAdmin(orderText(o));
});

/* ---------------- Umumiy ---------------- */

let toastTimer;
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
}

$("cartBtn").onclick = () => go("cart");
$("ordersBtn").onclick = () => go("orders");
$("barBtn").onclick = runPrimary;
document.querySelectorAll("[data-back]").forEach(b => b.onclick = back);
document.querySelectorAll("[data-home]").forEach(b => b.onclick = home);
$("siteLink").onclick = e => {
  e.preventDefault();
  const url = new URL("../", location.href).href;
  if (IN_TG) tg.openLink(url); else window.open(url, "_blank");
};
$("contactLink").onclick = e => {
  e.preventDefault();
  const url = "https://t.me/" + S.adminUsername;
  if (IN_TG) tg.openTelegramLink(url); else window.open(url, "_blank");
};

/* ---------------- Ishga tushirish ---------------- */

(async function init() {
  if (IN_TG) {
    document.documentElement.classList.add("in-tg");
    tg.ready();
    tg.expand();
    if (can("6.1")) { tg.setHeaderColor("#070907"); tg.setBackgroundColor("#070907"); }
    if (can("7.10")) tg.setBottomBarColor("#070907");
    if (can("7.7")) tg.disableVerticalSwipes();
    tg.MainButton.onClick(runPrimary);
    tg.BackButton.onClick(back);
    if (tgUser && tgUser.first_name) $("hello").textContent = `Salom, ${tgUser.first_name} 👋`;
    await loadCloud();
    cart = store.get("cart", []);
  }
  renderChips();
  renderGrid();
  renderBadge();
  show("shop");
  await loadProducts();
  renderChips();
  renderGrid();
})();
