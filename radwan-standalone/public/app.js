/* معرض الرضوان — واجهة التطبيق */
const LOGO_SVG = `<svg width="46" height="46" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<rect width="100" height="100" rx="18" fill="#0E6B34"/>
<rect x="18" y="30" width="64" height="14" rx="4" fill="#fff"/>
<circle cx="34" cy="62" r="12" fill="none" stroke="#fff" stroke-width="7"/>
<circle cx="70" cy="62" r="12" fill="none" stroke="#fff" stroke-width="7"/>
<text x="50" y="92" font-size="11" font-weight="bold" fill="#fff" text-anchor="middle" font-family="Arial">AL-RADWAN</text>
</svg>`;
document.getElementById("logoLogin").innerHTML = LOGO_SVG.replace('width="46" height="46"', 'width="90" height="90"');
document.getElementById("logoHead").innerHTML = LOGO_SVG;

let TOKEN = localStorage.getItem("rw_token") || "";
let ME = null;
let TAB = "home";
let PRODUCTS = [], PARTIES = [], WAREHOUSES = [], BRANDS = [], CATEGORIES = [], SETTINGS = {}, COMPONENTS = [];
let prodSection = "", prodBrand = "", prodQuery = "";
let prodWhId = 0, prodWhName = "";
let partyFilter = "", partyDetailId = 0, partyDetailFields = [];
let INVS = [], invFilter = "", PURS = [], purFilter = "";
let DEBT_SUMMARY = null, DEBT_ENTRIES = [], debtPartyFilter = "", debtEntryFilter = "";
let SHORTAGES = [], shortFilter = "", DEBT_REP = [], debtRepFilter = "";
let KH_ENTRIES = [], khFilter = "";
let EXPENSES = [], exFilter = "";
let cart = []; // فاتورة جديدة: {productId, name, qty, unitPrice}
let purCart = []; // مشتريات: {productId, name, qty, unitPrice}

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

async function api(method, path, body) {
  const r = await fetch(path, {
    method, headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("خطأ " + r.status));
  return j;
}

const ROLE_AR = { super: "سوبر أدمن", admin: "أدمن رئيسي", user: "مستخدم" };
const SECTION_AR = { ppr: "البولي (لحام)", white: "الصرف الصحي الأبيض", gasket: "الجوان ولوازمه", other: "لوازم عامة" };
const TYPE_AR = { customer: "زبون", supplier: "مورد", plumber: "سباك" };
const CUST_AR = { trade: "تجاري", premium: "مميز", retail: "قطاعي" };
const canKhaled = () => ME && (ME.username === "khaled" || ME.role === "super");
const isAdmin = () => ME && (ME.role === "super" || ME.role === "admin");
const compOn = (k) => { const c = COMPONENTS.find(x => x.key === k); return !c || c.enabled === 1; };

async function doLogin() {
  const u = $("#loginUser").value.trim(), p = $("#loginPass").value;
  const err = $("#loginErr");
  try {
    const j = await api("POST", "/api/auth/login", { username: u, password: p });
    TOKEN = j.token; ME = j.user;
    localStorage.setItem("rw_token", TOKEN);
    enter();
  } catch (e) { err.textContent = e.message; err.classList.remove("hidden"); }
}
async function doLogout() {
  try { await api("POST", "/api/auth/logout"); } catch {}
  TOKEN = ""; ME = null;
  localStorage.removeItem("rw_token");
  $("#app").classList.add("hidden"); $("#loginScreen").classList.remove("hidden");
}
async function enter() {
  $("#loginScreen").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#roleLabel").textContent = `${ME.name} — ${ROLE_AR[ME.role] || ME.role}`;
  await loadLookups();
  buildTabs();
  showTab("home");
}
async function loadLookups() {
  try {
    const [w, b, c, s, comp] = await Promise.all([
      api("GET", "/api/warehouses"), api("GET", "/api/brands"), api("GET", "/api/categories"),
      api("GET", "/api/settings"), api("GET", "/api/components"),
    ]);
    WAREHOUSES = w.warehouses; BRANDS = b.brands; CATEGORIES = c.categories;
    SETTINGS = s.settings; COMPONENTS = comp.components;
    PARTIES = (await api("GET", "/api/parties")).parties;
  } catch (e) { console.warn("lookups failed", e); }
}
function buildTabs() {
  const all = {
    home: ["🏠", "الرئيسية"], products: ["🏷️", "المنتجات"], invoices: ["🧾", "فواتير"],
    purchases: ["📦", "مشتريات"], debts: ["💳", "مديونيات"], parties: ["👥", "الأطراف"],
    khaled: ["🔒", "دفتر خالد"], vault: ["🏦", "الخزنة"], bundles: ["🎁", "باقات وعمولات"],
    reports: ["📊", "تقارير"], settings: ["⚙️", "الإعدادات"],
  };
  $("#tabs").innerHTML = Object.entries(all).map(([k, [ic, label]]) =>
    `<button data-tab="${k}" onclick="showTab('${k}')"><span class="ic">${ic}</span>${label}</button>`).join("");
}
async function showTab(t) {
  TAB = t;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  const m = $("#main");
  m.innerHTML = `<p class="muted center">جارٍ التحميل...</p>`;
  try {
    if (t === "home") m.innerHTML = await vHome();
    else if (t === "products") m.innerHTML = await vProducts();
    else if (t === "invoices") m.innerHTML = await vInvoices();
    else if (t === "purchases") m.innerHTML = await vPurchases();
    else if (t === "debts") m.innerHTML = await vDebts();
    else if (t === "parties") m.innerHTML = await vParties();
    else if (t === "khaled") m.innerHTML = await vKhaled();
    else if (t === "vault") m.innerHTML = await vVault();
    else if (t === "bundles") m.innerHTML = await vBundles();
    else if (t === "reports") m.innerHTML = await vReports();
    else if (t === "settings") m.innerHTML = await vSettings();
    if (t === "products") bindProductSearch();
  } catch (e) { m.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------- الرئيسية ----------------
async function vHome() {
  const [debts, cash, short, rem] = await Promise.all([
    api("GET", "/api/debts/summary"), api("GET", "/api/reports/daily-cash"),
    api("GET", "/api/reports/shortages"), api("GET", "/api/reminders"),
  ]);
  const overdue = rem.overdue || [];
  return `
  <img class="brand-banner home" src="/brand-banner.jpg" alt="معرض الرضوان — شعارات الماركات">
  <h2>أهلاً ${esc(ME.name)} 👋</h2>
  <div class="grid">
    <div class="stat"><b>${fmt(cash.invoices.paid)} ج</b><span>مبيعات نقدية اليوم (${cash.invoices.n} فاتورة)</span></div>
    <div class="stat"><b>${fmt(cash.expenses.total)} ج</b><span>مصاريف اليوم</span></div>
    <div class="stat"><b>${fmt(debts.customersOwe)} ج</b><span>الزباين مديونين لنا</span></div>
    <div class="stat"><b>${fmt(cash.vaultBalance)} ج</b><span>رصيد خزنة الطوارئ</span></div>
  </div>
  <div class="card mt"><h3>⚠️ نواقص المخزون (${short.shortages.length})</h3>
    ${short.shortages.length ? short.shortages.slice(0, 5).map(p => `<div class="price-line"><span>${esc(p.name)} ${esc(p.size)} — ${esc(p.warehouse)}</span><b>المتاح ${fmt(p.qty)}</b></div>`).join("") + `<p class="muted">شوف التقرير الكامل من تبويب «تقارير».</p>` : `<p class="muted">لا توجد نواقص — المخزون فوق حد الطلب (${short.threshold}).</p>`}
  </div>
  <div class="card"><h3>🔔 تذكير مديونيات قديمة (${overdue.length})</h3>
    ${overdue.length ? overdue.slice(0, 5).map(p => `
      <div class="price-line"><span>${esc(p.name)} — ${fmt(p.balance)} ج (${Math.floor(p.idle_days)} يوم)</span>
      <button class="btn small wa" onclick="remindParty(${p.id},'${esc(p.name)}','${esc(p.phone || "")}')">واتساب</button></div>`).join("")
      : `<p class="muted">لا توجد مديونيات متأخرة أكثر من ${rem.days} يوم.</p>`}
  </div>`;
}
async function remindParty(id, name, phone) {
  await api("POST", "/api/reminders/mark", { partyId: id, kind: "whatsapp", note: "تذكير مديونية" });
  const p = PARTIES.find(x => x.id === id);
  const msg = `السلام عليكم ${name}، معرض الرضوان بيذكّركم بالمديونية المستحقة ${fmt(p ? p.balance : 0)} جنيه. شكراً لتعاملكم معنا 🌿`;
  window.open("https://wa.me/" + (phone || "") + "?text=" + encodeURIComponent(msg), "_blank");
  showTab("home");
}

// ---------------- المنتجات ----------------
async function vProducts() {
  // المخزون المعروض افتراضياً من المخزن الرئيسي — حيث أرصدة لستة المعرض
  const mainWh = WAREHOUSES.find(w => w.name.includes("الرئيسي")) || WAREHOUSES[0];
  prodWhId = mainWh ? mainWh.id : 1;
  prodWhName = mainWh ? mainWh.name : "";
  const j = await api("GET", "/api/products?warehouseId=" + prodWhId);
  PRODUCTS = j.products;
  return `
  <h2>المنتجات (${j.count})</h2>
  <div class="searchbox">
    <input id="pq" placeholder="ابحث بالاسم أو المقاس أو الباركود..." value="${esc(prodQuery)}">
    <button class="btn" onclick="doProductSearch()">بحث</button>
    <button class="btn gold" onclick="openScan()">📷 مسح</button>
  </div>
  <div class="mt">
    <span class="chip ${prodSection === "" ? "on" : ""}" onclick="setProdSection('')">الكل</span>
    ${Object.entries(SECTION_AR).map(([k, v]) => `<span class="chip ${prodSection === k ? "on" : ""}" onclick="setProdSection('${k}')">${v}</span>`).join("")}
  </div>
  <div class="mt">
    ${BRANDS.map(b => `<span class="chip ${String(prodBrand) === String(b.id) ? "on" : ""}" onclick="setProdBrand(${b.id})">${esc(b.name)}</span>`).join("")}
    <span class="chip ${prodBrand === "" ? "on" : ""}" onclick="setProdBrand('')">كل الماركات</span>
  </div>
  <div id="prodList" class="mt">${renderProducts()}</div>`;
}
function filteredProducts() {
  return PRODUCTS.filter(p =>
    (!prodSection || p.section === prodSection) &&
    (!prodBrand || String(p.brand_id) === String(prodBrand)) &&
    (!prodQuery || (p.name + " " + p.size + " " + (p.barcode || "")).includes(prodQuery)));
}
function renderProducts() {
  const list = filteredProducts().slice(0, 120);
  if (!list.length) return `<p class="muted center">لا توجد نتائج.</p>`;
  return list.map(p => `
  <div class="card">
    <h3>${esc(p.name)} <span class="muted">${esc(p.size)}</span></h3>
    <div class="muted">${esc(SECTION_AR[p.section] || p.section)} • باركود: ${esc(p.barcode || "—")} • المخزون (${esc(prodWhName)}): ${fmt(p.stock ?? 0)}</div>
    <div class="price-line"><span>سعر الشراء</span><b>${fmt(p.last_purchase_price)} ج</b></div>
    <div class="price-line"><span>سعر مميز</span><b>${fmt(p.premiumPrice)} ج</b></div>
    <div class="price-line"><span>سعر تجاري</span><b>${fmt(p.tradePrice)} ج</b></div>
    ${isAdmin() ? `<div class="row mt"><button class="btn small ghost" onclick="editPrice(${p.id})">✏️ تعديل السعر</button></div>` : ""}
  </div>`).join("");
}
function bindProductSearch() {
  const inp = $("#pq");
  if (inp) inp.addEventListener("input", () => { prodQuery = inp.value.trim(); $("#prodList").innerHTML = renderProducts(); });
}
function doProductSearch() { prodQuery = ($("#pq").value || "").trim(); $("#prodList").innerHTML = renderProducts(); }
function setProdSection(s) { prodSection = s; showTab("products"); }
function setProdBrand(b) { prodBrand = b; showTab("products"); }
async function editPrice(id) {
  const p = PRODUCTS.find(x => x.id === id);
  const pur = prompt(`سعر الشراء الحالي: ${fmt(p.last_purchase_price)} ج\nاكتب سعر الشراء الجديد لـ ${p.name}:`, p.last_purchase_price);
  if (pur == null || pur === "") return;
  const prem = prompt(`سعر مميز الحالي: ${fmt(p.premiumPrice)} ج\nاكتب السعر المميز الجديد (اتركه كما هو لو لم يتغير):`, p.premiumPrice);
  if (prem == null) return;
  const tr = prompt(`سعر تجاري الحالي: ${fmt(p.tradePrice)} ج\nاكتب السعر التجاري الجديد (اتركه كما هو لو لم يتغير):`, p.tradePrice);
  if (tr == null) return;
  await api("PUT", "/api/products/" + id, { last_purchase_price: Number(pur), explicit_premium: Number(prem), explicit_trade: Number(tr) });
  alert("تم تحديث الأسعار.");
  showTab("products");
}

// ---------------- الفواتير ----------------
async function vInvoices() {
  INVS = (await api("GET", "/api/invoices")).invoices;
  const customers = PARTIES.filter(p => p.type === "customer");
  const plumbers = PARTIES.filter(p => p.type === "plumber");
  const bundles = (await api("GET", "/api/bundles")).bundles;
  return `
  <h2>فاتورة جديدة</h2>
  <div class="card">
    <div class="row">
      <input id="invCustQ" placeholder="ابحث عن زبون بالاسم..." oninput="filterInvCustomers()" style="flex:1">
    </div>
    <div class="row mt">
      <select id="invCustomer">${customers.map(c => `<option value="${c.id}">${esc(c.name)}${c.balance ? ` (مديونية ${fmt(c.balance)} ج)` : ""}</option>`).join("") || `<option value="">لا يوجد زباين — أضف من تبويب الأطراف</option>`}</select>
      <select id="invType"><option value="trade">تجاري</option><option value="premium">مميز</option><option value="retail">قطاعي</option></select>
      <select id="invWarehouse">${WAREHOUSES.map(w => `<option value="${w.id}" ${w.name.includes("الرئيسي") ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select>
    </div>
    <div class="row mt">
      <select id="invPlumber"><option value="">بدون سباك</option>${plumbers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <input id="invPaid" type="number" placeholder="المدفوع نقداً (جنيه)" value="0">
      <label style="flex:none"><input type="checkbox" id="invLoyalty" style="width:auto"> استبدال نقاط الولاء</label>
    </div>
    <div class="searchbox mt">
      <input id="invProdQ" placeholder="ابحث عن منتج للإضافة...">
      <button class="btn" onclick="invAddProduct()">+ إضافة</button>
    </div>
    <div class="row mt">
      <select id="invBundle"><option value="">— أو اختر باقة —</option>${bundles.map(b => `<option value="${b.id}">${esc(b.name)} — ${fmt(b.price)} ج</option>`).join("")}</select>
      <button class="btn gold" onclick="invAddBundle()">+ إضافة الباقة</button>
    </div>
    <div id="cartBox" class="mt">${renderCart()}</div>
    <div class="row mt"><button class="btn" style="flex:1" onclick="submitInvoice()">💾 حفظ الفاتورة</button>
    <button class="btn ghost" onclick="shareInvoiceWa()">📲 فاتورة واتساب</button></div>
    <div id="invMsg" class="mt"></div>
  </div>
  <h3>آخر الفواتير</h3>
  <div class="searchbox">
    <input id="invFilter" placeholder="فلترة الفواتير بالزبون أو رقم الفاتورة..." value="${esc(invFilter)}" oninput="invFilter=this.value;renderInvList()">
  </div>
  <div id="invListBox" class="mt">${renderInvList()}</div>`;
}
function filterInvCustomers() {
  const q = ($("#invCustQ").value || "").trim();
  const sel = $("#invCustomer");
  const list = PARTIES.filter(p => p.type === "customer" && (!q || p.name.includes(q)));
  sel.innerHTML = list.map(c => `<option value="${c.id}">${esc(c.name)}${c.balance ? ` (مديونية ${fmt(c.balance)} ج)` : ""}</option>`).join("") || `<option value="">لا يوجد زبون بهذا الاسم</option>`;
}
function renderInvList() {
  const list = INVS.filter(i => !invFilter || ((i.customer_name || "") + " #" + i.id).includes(invFilter)).slice(0, 20);
  const box = $("#invListBox");
  const html = list.map(i => `<div class="card"><div class="price-line"><span>فاتورة #${i.id} — ${esc(i.customer_name || "")} (${CUST_AR[i.customer_type] || i.customer_type})</span><b>${fmt(i.total)} ج</b></div>
  <div class="muted">مدفوع ${fmt(i.paid)} ج • متبقي ${fmt(i.total - i.paid)} ج • ${esc((i.created_at || "").slice(0, 16))}</div>
  <button class="btn small wa" onclick="shareInvoiceText(${i.id})">📲 واتساب</button></div>`).join("") || `<p class="muted">لا توجد فواتير مطابقة.</p>`;
  if (box) box.innerHTML = html;
  return html;
}
function renderCart() {
  if (!cart.length) return `<p class="muted">السلة فارغة.</p>`;
  let total = 0;
  const rows = cart.map((c, i) => { total += c.unitPrice * c.qty; return `<div class="price-line"><span>${esc(c.name)} × ${c.qty}</span><b>${fmt(c.unitPrice * c.qty)} ج</b> <button class="btn small danger" onclick="cart.splice(${i},1);document.getElementById('cartBox').innerHTML=renderCart()">✕</button></div>`; }).join("");
  return rows + `<div class="price-line"><span><b>الإجمالي التقديري</b></span><b>${fmt(total)} ج</b></div><p class="muted">الخصم الكمي ونقاط الولاء يُحسبان عند الحفظ (حد الخصم: ${SETTINGS.qty_discount_threshold || 10} قطعة = ${SETTINGS.qty_discount_pct || 5}%).</p>`;
}
async function invAddProduct() {
  const q = ($("#invProdQ").value || "").trim();
  if (!q) return;
  const j = await api("GET", "/api/products?q=" + encodeURIComponent(q));
  if (!j.products.length) { alert("لا يوجد منتج بهذا الاسم."); return; }
  const p = j.products[0];
  const type = $("#invType").value;
  const unit = type === "premium" ? p.premiumPrice : type === "retail" ? p.retailPrice : p.tradePrice;
  const qty = Number(prompt(`الكمية من ${p.name} ${p.size} (سعر ${fmt(unit)} ج):`, "1")) || 1;
  cart.push({ productId: p.id, name: `${p.name} ${p.size}`, qty, unitPrice: unit });
  $("#cartBox").innerHTML = renderCart();
  $("#invProdQ").value = "";
}
async function invAddBundle() {
  const id = $("#invBundle").value;
  if (!id) return;
  const bundles = (await api("GET", "/api/bundles")).bundles;
  const b = bundles.find(x => String(x.id) === String(id));
  if (!b) return;
  const qty = Number(prompt(`عدد باقات ${b.name} (سعر ${fmt(b.price)} ج):`, "1")) || 1;
  cart.push({ bundleId: b.id, name: `باقة: ${b.name}`, qty, unitPrice: b.price });
  $("#cartBox").innerHTML = renderCart();
}
async function submitInvoice() {
  const msg = $("#invMsg");
  try {
    if (!cart.length) throw new Error("السلة فارغة");
    const items = cart.map(c => c.bundleId ? { bundleId: c.bundleId, qty: c.qty } : { productId: c.productId, qty: c.qty });
    const j = await api("POST", "/api/invoices", {
      customerId: Number($("#invCustomer").value), customerType: $("#invType").value,
      warehouseId: Number($("#invWarehouse").value), items,
      paid: Number($("#invPaid").value) || 0, useLoyalty: $("#invLoyalty").checked,
      plumberId: $("#invPlumber").value ? Number($("#invPlumber").value) : null,
    });
    cart = [];
    msg.innerHTML = `<div class="ok">✅ تم حفظ الفاتورة #${j.invoice.id} — الإجمالي ${fmt(j.invoice.total)} ج. كسب العميل ${fmt(j.invoice.loyalty_earned)} نقطة.</div>`;
    await loadLookups();
    setTimeout(() => showTab("invoices"), 1200);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function shareInvoiceText(id) {
  const j = await api("GET", "/api/invoices/" + id);
  window.open("https://wa.me/?text=" + encodeURIComponent(j.text), "_blank");
}
function shareInvoiceWa() { alert("احفظ الفاتورة أولاً، ثم شاركها من قائمة «آخر الفواتير» بزر واتساب."); }

// ---------------- المشتريات ----------------
async function vPurchases() {
  PURS = (await api("GET", "/api/purchases")).purchases;
  const suppliers = PARTIES.filter(p => p.type === "supplier");
  return `
  <h2>مشتريات جديدة</h2>
  <div class="card">
    <div class="row">
      <select id="purSupplier">${suppliers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("") || `<option value="">لا يوجد موردون — أضف من تبويب الأطراف</option>`}</select>
      <select id="purWarehouse">${WAREHOUSES.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("")}</select>
      <input id="purPaid" type="number" placeholder="المدفوع للمورد (جنيه)" value="0">
    </div>
    <div class="searchbox mt">
      <input id="purProdQ" placeholder="ابحث عن منتج...">
      <button class="btn" onclick="purAddProduct()">+ إضافة</button>
    </div>
    <div id="purCartBox" class="mt">${renderPurCart()}</div>
    <div class="row mt"><button class="btn" style="flex:1" onclick="submitPurchase()">💾 حفظ المشتريات</button></div>
    <div id="purMsg" class="mt"></div>
    <p class="muted">حفظ المشتريات يضيف الكمية للمخزون ويحدّث «آخر سعر شراء» للصنف (ويُسجَّل في سجل تغيير الأسعار).</p>
  </div>
  <h3>آخر المشتريات</h3>
  <div class="searchbox">
    <input id="purFilter" placeholder="فلترة المشتريات بالمورد أو رقمها..." value="${esc(purFilter)}" oninput="purFilter=this.value;renderPurList()">
  </div>
  <div id="purListBox" class="mt">${renderPurList()}</div>`;
}
function renderPurList() {
  const list = PURS.filter(p => !purFilter || ((p.supplier_name || "") + " #" + p.id).includes(purFilter)).slice(0, 20);
  const box = $("#purListBox");
  const html = list.map(p => `<div class="card"><div class="price-line"><span>مشتريات #${p.id} — ${esc(p.supplier_name || "")}</span><b>${fmt(p.total)} ج</b></div>
  <div class="muted">مدفوع ${fmt(p.paid)} ج • متبقي للمورد ${fmt(p.total - p.paid)} ج • ${esc((p.created_at || "").slice(0, 16))}</div></div>`).join("") || `<p class="muted">لا توجد مشتريات مطابقة.</p>`;
  if (box) box.innerHTML = html;
  return html;
}
function renderPurCart() {
  if (!purCart.length) return `<p class="muted">السلة فارغة.</p>`;
  let total = 0;
  const rows = purCart.map((c, i) => { total += c.unitPrice * c.qty; return `<div class="price-line"><span>${esc(c.name)} × ${c.qty} @ ${fmt(c.unitPrice)}</span><b>${fmt(c.unitPrice * c.qty)} ج</b> <button class="btn small danger" onclick="purCart.splice(${i},1);document.getElementById('purCartBox').innerHTML=renderPurCart()">✕</button></div>`; }).join("");
  return rows + `<div class="price-line"><span><b>الإجمالي</b></span><b>${fmt(total)} ج</b></div>`;
}
async function purAddProduct() {
  const q = ($("#purProdQ").value || "").trim();
  if (!q) return;
  const j = await api("GET", "/api/products?q=" + encodeURIComponent(q));
  if (!j.products.length) { alert("لا يوجد منتج بهذا الاسم."); return; }
  const p = j.products[0];
  const qty = Number(prompt(`الكمية من ${p.name} ${p.size}:`, "1")) || 1;
  const price = Number(prompt(`سعر الشراء للوحدة (آخر سعر شراء الحالي ${fmt(p.last_purchase_price)} ج):`, p.last_purchase_price)) || p.last_purchase_price;
  purCart.push({ productId: p.id, name: `${p.name} ${p.size}`, qty, unitPrice: price });
  $("#purCartBox").innerHTML = renderPurCart();
  $("#purProdQ").value = "";
}
async function submitPurchase() {
  const msg = $("#purMsg");
  try {
    if (!purCart.length) throw new Error("السلة فارغة");
    const j = await api("POST", "/api/purchases", {
      supplierId: Number($("#purSupplier").value), warehouseId: Number($("#purWarehouse").value),
      items: purCart.map(c => ({ productId: c.productId, qty: c.qty, unitPrice: c.unitPrice })),
      paid: Number($("#purPaid").value) || 0,
    });
    purCart = [];
    msg.innerHTML = `<div class="ok">✅ تم حفظ المشتريات #${j.id} وتحديث المخزون وآخر سعر شراء.</div>`;
    setTimeout(() => showTab("purchases"), 1200);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------- المديونيات ----------------
async function vDebts() {
  DEBT_SUMMARY = await api("GET", "/api/debts/summary");
  DEBT_ENTRIES = (await api("GET", "/api/debts")).debts;
  const s = DEBT_SUMMARY;
  return `
  <h2>المديونيات</h2>
  <div class="grid">
    <div class="stat"><b>${fmt(s.customersOwe)} ج</b><span>الزباين مديونين لنا</span></div>
    <div class="stat"><b>${fmt(s.weOwe)} ج</b><span>علينا للموردين</span></div>
  </div>
  <div class="card mt"><h3>أرصدة الأطراف</h3>
    <div class="searchbox">
      <input id="debtPartyFilter" placeholder="فلترة الأطراف بالاسم أو التليفون..." value="${esc(debtPartyFilter)}" oninput="debtPartyFilter=this.value;renderDebtParties()">
    </div>
    <div id="debtPartiesBox" class="mt">${renderDebtParties()}</div>
  </div>
  <div class="card"><h3>تسجيل دفعة / قيد</h3>
    <div class="row">
      <select id="debtParty">${PARTIES.map(p => `<option value="${p.id}">${esc(p.name)} — رصيد ${fmt(p.balance)} ج</option>`).join("")}</select>
      <input id="debtAmount" type="number" placeholder="المبلغ">
      <select id="debtKind"><option value="payment">تحصيل (ينقص المديونية)</option><option value="charge">زيادة مديونية</option></select>
    </div>
    <div class="row mt"><input id="debtNote" placeholder="ملاحظة (اختياري)"><button class="btn" onclick="submitDebt()">حفظ</button></div>
    <div id="debtMsg" class="mt"></div>
  </div>
  <h3>آخر الحركات</h3>
  <div class="searchbox">
    <input id="debtEntryFilter" placeholder="فلترة الحركات بالاسم أو الملاحظة..." value="${esc(debtEntryFilter)}" oninput="debtEntryFilter=this.value;renderDebtEntries()">
  </div>
  <div id="debtEntriesBox" class="mt">${renderDebtEntries()}</div>`;
}
function renderDebtParties() {
  const s = DEBT_SUMMARY || { parties: [] };
  const list = s.parties.filter(p => !debtPartyFilter || ((p.name || "") + " " + (p.phone || "") + " " + (p.address || "")).includes(debtPartyFilter));
  const box = $("#debtPartiesBox");
  const html = list.map(p => `<div class="price-line"><span>${esc(p.name)} (${TYPE_AR[p.type] || p.type})</span><span><b>${fmt(p.balance)} ج</b> <button class="btn small ghost" onclick="openPartyFromDebts(${p.id})">⚙️ إدارة</button></span></div>`).join("") || `<p class="muted">لا توجد مديونيات مطابقة.</p>`;
  if (box) box.innerHTML = html;
  return html;
}
function renderDebtEntries() {
  const list = DEBT_ENTRIES.filter(d => !debtEntryFilter || ((d.party_name || "") + " " + (d.note || "")).includes(debtEntryFilter)).slice(0, 30);
  const box = $("#debtEntriesBox");
  const html = list.map(d => `<div class="card"><div class="price-line"><span>${esc(d.party_name || "")} — ${d.kind === "payment" ? "تحصيل" : d.kind === "sale" ? "فاتورة" : d.kind === "purchase" ? "مشتريات" : d.kind === "import" ? "رصيد افتتاحي" : d.kind === "adjust" ? "تعديل رصيد" : "قيد"}</span><b>${fmt(d.amount)} ج</b></div><div class="muted">${esc(d.note || "")} • ${esc((d.created_at || "").slice(0, 16))}</div></div>`).join("") || `<p class="muted">لا توجد حركات مطابقة.</p>`;
  if (box) box.innerHTML = html;
  return html;
}
async function openPartyFromDebts(id) {
  await showTab("parties");
  openPartyDetail(id);
}
async function submitDebt() {
  const msg = $("#debtMsg");
  try {
    const j = await api("POST", "/api/debts", {
      partyId: Number($("#debtParty").value), amount: Number($("#debtAmount").value),
      kind: $("#debtKind").value, note: $("#debtNote").value,
    });
    msg.innerHTML = `<div class="ok">✅ تم — الرصيد الجديد ${fmt(j.balance)} ج.</div>`;
    await loadLookups();
    setTimeout(() => showTab("debts"), 900);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------- الأطراف ----------------
async function vParties() {
  const grp = (title, list) => `<div class="card"><h3>${title} (${list.length})</h3>` +
    (list.map(p => `<div class="price-line"><span>${esc(p.name)} ${p.demo ? `<span class="badge gold">تجريبي — قابل للحذف</span>` : ""}<br><span class="muted">${esc(p.phone || "")} ${esc(p.address || "")} • نقاط ${fmt(p.points)}</span></span><span><b>${fmt(p.balance)} ج</b> <button class="btn small ghost" onclick="openPartyDetail(${p.id})">⚙️ إدارة</button></span></div>`).join("") || `<p class="muted">لا يوجد.</p>`) + `</div>`;
  window.__partyGrp = grp;
  return `
  <h2>الزباين والأطراف</h2>
  <div class="searchbox">
    <input id="partyFilter" placeholder="فلترة الأطراف بالاسم أو التليفون أو العنوان..." value="${esc(partyFilter)}" oninput="partyFilter=this.value;renderPartyGroups()">
  </div>
  <div id="partyDetailBox" class="mt">${partyDetailId ? "" : ""}</div>
  <div class="card"><h3>➕ إضافة طرف</h3>
    <div class="row">
      <input id="npName" placeholder="الاسم">
      <select id="npType"><option value="customer">زبون</option><option value="supplier">مورد</option><option value="plumber">سباك</option></select>
      <input id="npPhone" placeholder="التليفون (واتساب)">
      <input id="npAddr" placeholder="العنوان">
    </div>
    <div class="row mt"><button class="btn" onclick="addParty()">حفظ</button></div>
    <div id="npMsg" class="mt"></div>
  </div>
  <div class="card"><h3>📥 استيراد جماعي (لصق سطور)</h3>
    <p class="muted">كل سطر: الاسم، التليفون، العنوان — مثال: السعيد العفيفي، 01000000000، العلو بالمحلة</p>
    <div class="row"><select id="impType"><option value="customer">زباين</option><option value="supplier">موردون</option><option value="plumber">سباكون</option></select></div>
    <textarea id="impLines" rows="4" class="mt" placeholder="الصق السطور هنا..."></textarea>
    <div class="row mt"><button class="btn" onclick="importParties()">استيراد</button></div>
    <div id="impMsg" class="mt"></div>
  </div>
  <div id="partyGroupsBox">${renderPartyGroups()}</div>`;
}
function renderPartyGroups() {
  const grp = window.__partyGrp;
  if (!grp) return "";
  const match = (p) => !partyFilter || ((p.name || "") + " " + (p.phone || "") + " " + (p.address || "")).includes(partyFilter);
  const html = grp("🧑‍🔧 السباكون", PARTIES.filter(p => p.type === "plumber" && match(p)))
    + grp("🏪 الزباين", PARTIES.filter(p => p.type === "customer" && match(p)))
    + grp("🚚 الموردون", PARTIES.filter(p => p.type === "supplier" && match(p)));
  const box = $("#partyGroupsBox");
  if (box) box.innerHTML = html;
  return html;
}
// بطاقة إدارة الطرف: المبلغ والعنوان ورقم الهاتف قابلة للتعديل + خانات مخصصة
async function openPartyDetail(id) {
  partyDetailId = id;
  const j = await api("GET", "/api/parties/" + id);
  const p = j.party;
  partyDetailFields = j.fields || [];
  const box = $("#partyDetailBox");
  if (!box) return;
  box.innerHTML = `
  <div class="card">
    <h3>⚙️ إدارة: ${esc(p.name)} (${TYPE_AR[p.type] || p.type})</h3>
    <div class="row">
      <label style="flex:1">المبلغ (المديونية) <input id="pdBalance" type="number" value="${p.balance}"></label>
      <label style="flex:1">رقم الهاتف <input id="pdPhone" type="tel" value="${esc(p.phone || "")}"></label>
    </div>
    <div class="row mt">
      <label style="flex:1">العنوان <input id="pdAddress" value="${esc(p.address || "")}"></label>
      <label style="flex:1">تليفون 2 <input id="pdPhone2" type="tel" value="${esc(p.phone2 || "")}"></label>
    </div>
    <div class="row mt">
      <label style="flex:1">الفئة <input id="pdCategory" value="${esc(p.category || "")}"></label>
      <label style="flex:1">المدينة <input id="pdCity" value="${esc(p.city || "")}"></label>
    </div>
    <div class="row mt"><label style="flex:1">ملاحظات <input id="pdNotes" value="${esc(p.notes || "")}"></label></div>
    <p class="muted">تعديل المبلغ يُسجَّل كقيد تعديل في سجل المديونية.</p>
    <div class="row mt">
      <button class="btn" onclick="savePartyDetail(${p.id})">💾 حفظ التعديلات</button>
      ${p.phone ? `<a class="btn wa" href="https://wa.me/${esc(p.phone.replace(/[^0-9]/g, ""))}" target="_blank">📲 واتساب</a>` : ""}
      <button class="btn danger" onclick="delParty(${p.id})">🗑️ حذف الطرف</button>
    </div>
    <div id="pdMsg" class="mt"></div>
    <h4 class="mt">📌 خانات إضافية</h4>
    <div id="pdFields">${renderPartyFields()}</div>
    <div class="row mt">
      <input id="pdNewFieldName" placeholder="اسم الخانة (مثال: رقم البطاقة)">
      <input id="pdNewFieldValue" placeholder="القيمة">
      <button class="btn gold" onclick="addPartyField(${p.id})">+ إضافة خانة</button>
    </div>
  </div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}
function renderPartyFields() {
  if (!partyDetailFields.length) return `<p class="muted">لا توجد خانات إضافية — أضف أي خانة تحتاجها (مثال: رقم البطاقة، اسم المحل، منطقة التوصيل).</p>`;
  return partyDetailFields.map(f => `<div class="price-line"><span><b>${esc(f.field_name)}:</b> ${esc(f.field_value)}</span><span><button class="btn small ghost" onclick="editPartyField(${f.id}, ${partyDetailId})">✏️</button> <button class="btn small danger" onclick="delPartyField(${f.id}, ${partyDetailId})">🗑️</button></span></div>`).join("");
}
async function savePartyDetail(id) {
  const msg = $("#pdMsg");
  try {
    await api("PUT", "/api/parties/" + id, {
      balance: Number($("#pdBalance").value),
      phone: $("#pdPhone").value.trim(), address: $("#pdAddress").value.trim(),
      phone2: $("#pdPhone2").value.trim(), category: $("#pdCategory").value.trim(),
      city: $("#pdCity").value.trim(), notes: $("#pdNotes").value.trim(),
    });
    msg.innerHTML = `<div class="ok">✅ تم حفظ التعديلات.</div>`;
    await loadLookups();
    setTimeout(() => showTab("parties"), 900);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function delParty(id) {
  if (!confirm("حذف هذا الطرف نهائياً؟ (لا يمكن حذفه وعليه مديونية)")) return;
  try {
    await api("DELETE", "/api/parties/" + id);
    partyDetailId = 0;
    await loadLookups();
    showTab("parties");
  } catch (e) { alert(e.message); }
}
async function addPartyField(id) {
  const name = ($("#pdNewFieldName").value || "").trim();
  const value = ($("#pdNewFieldValue").value || "").trim();
  if (!name) { alert("اكتب اسم الخانة أولاً."); return; }
  await api("POST", "/api/parties/" + id + "/fields", { name, value });
  openPartyDetail(id);
}
async function editPartyField(fid, pid) {
  const f = partyDetailFields.find(x => x.id === fid);
  if (!f) return;
  const name = prompt("اسم الخانة:", f.field_name);
  if (name == null) return;
  const value = prompt("قيمة الخانة:", f.field_value);
  if (value == null) return;
  await api("PUT", "/api/party-fields/" + fid, { name, value });
  openPartyDetail(pid);
}
async function delPartyField(fid, pid) {
  if (!confirm("حذف هذه الخانة؟")) return;
  await api("DELETE", "/api/party-fields/" + fid);
  openPartyDetail(pid);
}
async function addParty() {
  const msg = $("#npMsg");
  try {
    await api("POST", "/api/parties", { name: $("#npName").value.trim(), type: $("#npType").value, phone: $("#npPhone").value.trim(), address: $("#npAddr").value.trim() });
    msg.innerHTML = `<div class="ok">✅ تمت الإضافة.</div>`;
    await loadLookups(); setTimeout(() => showTab("parties"), 800);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function importParties() {
  const msg = $("#impMsg");
  try {
    const j = await api("POST", "/api/parties/import", { type: $("#impType").value, lines: $("#impLines").value });
    msg.innerHTML = `<div class="ok">✅ تم استيراد ${j.added} طرف.</div>`;
    await loadLookups(); setTimeout(() => showTab("parties"), 800);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------- دفتر الشيخ خالد ----------------
async function vKhaled() {
  if (!canKhaled()) return `<h2>دفتر الشيخ خالد 🔒</h2>
    <div class="locked"><div style="font-size:40px">🔒</div><h3>دفتر خاص</h3>
    <p>هذا الدفتر يراه الشيخ خالد البسيوني وروني فقط.<br>«أخد من مين / رجّع لمين» بالتواريخ — إدخال صوتي بدون كتابة من زر الميكروفون 🎤.</p></div>`;
  const j = await api("GET", "/api/khaled-ledger");
  KH_ENTRIES = j.entries;
  return `
  <h2>دفتر الشيخ خالد 🔒</h2>
  <div class="grid">
    <div class="stat"><b>${fmt(j.totalIn)} ج</b><span>أخد (داخل)</span></div>
    <div class="stat"><b>${fmt(j.totalOut)} ج</b><span>رجّع (خارج)</span></div>
    <div class="stat"><b>${fmt(j.balance)} ج</b><span>الرصيد</span></div>
  </div>
  <div class="card mt"><h3>➕ قيد جديد</h3>
    <div class="row">
      <select id="khKind"><option value="in">أخد من (داخل)</option><option value="out">رجّع لـ (خارج)</option></select>
      <input id="khAmount" type="number" placeholder="المبلغ">
      <input id="khFrom" placeholder="من مين؟">
      <input id="khTo" placeholder="لمين؟">
    </div>
    <div class="row mt"><input id="khNote" placeholder="ملاحظة"><button class="btn" onclick="addKhaled()">حفظ</button>
    <button class="btn gold" onclick="voiceKhaled()">🎤 إدخال صوتي</button></div>
    <div id="khMsg" class="mt"></div>
  </div>
  <div class="searchbox">
    <input id="khFilter" placeholder="فلترة القيود بالاسم أو الملاحظة..." value="${esc(khFilter)}" oninput="khFilter=this.value;renderKhaledEntries()">
  </div>
  <div id="khEntriesBox" class="mt">${renderKhaledEntries()}</div>`;
}
function renderKhaledEntries() {
  const list = KH_ENTRIES.filter(e => !khFilter || ((e.from_party || "") + " " + (e.to_party || "") + " " + (e.note || "")).includes(khFilter));
  const box = $("#khEntriesBox");
  const html = list.map(e => `<div class="card"><div class="price-line"><span>${e.kind === "in" ? "⬇️ أخد" : "⬆️ رجّع"} — من ${esc(e.from_party || "—")} إلى ${esc(e.to_party || "—")}</span><b>${fmt(e.amount)} ج</b></div><div class="muted">${esc(e.note || "")} • ${esc((e.created_at || "").slice(0, 16))} • ${esc(e.created_by_name || "")}</div>${canKhaled() ? `<div class="mt"><button class="btn danger small" onclick="delKhaled(${e.id})">🗑️ حذف القيد</button></div>` : ""}</div>`).join("") || `<p class="muted">لا توجد قيود مطابقة.</p>`;
  if (box) box.innerHTML = html;
  return html;
}
async function delKhaled(id) {
  if (!canKhaled()) return;
  try {
    const j = await api("GET", "/api/khaled-ledger");
    const e = j.entries.find(x => x.id === Number(id));
    if (!e) { alert("القيد غير موجود"); return; }
    const label = `${e.kind === "in" ? "أخد" : "رجّع"} — ${fmt(e.amount)} ج — من ${e.from_party || "—"} إلى ${e.to_party || "—"} — ${(e.created_at || "").slice(0, 16)}`;
    if (!confirm(`🗑️ حذف هذا القيد من دفتر الشيخ خالد؟\n${label}\nلا يمكن التراجع عن الحذف.`)) return;
    await api("DELETE", "/api/khaled-ledger/" + id);
    showTab("khaled");
  } catch (err) { alert(err.message); }
}
async function addKhaled() {
  const msg = $("#khMsg");
  try {
    await api("POST", "/api/khaled-ledger", { kind: $("#khKind").value, amount: Number($("#khAmount").value), from_party: $("#khFrom").value, to_party: $("#khTo").value, note: $("#khNote").value });
    msg.innerHTML = `<div class="ok">✅ تم تسجيل القيد.</div>`;
    setTimeout(() => showTab("khaled"), 800);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
function voiceKhaled() { openVoice("khaled"); }

// ---------------- الخزنة والمصاريف ----------------
async function vVault() {
  const v = await api("GET", "/api/vault");
  const ex = await api("GET", "/api/expenses");
  EXPENSES = ex.expenses;
  const cats = (await api("GET", "/api/expense-categories")).categories;
  const todayExp = ex.expenses.filter(e => (e.created_at || "").slice(0, 10) === today()).reduce((a, e) => a + e.amount, 0);
  const budget = +SETTINGS.expense_daily_budget || 0;
  const minBal = +SETTINGS.vault_min_balance || 0;
  return `
  <h2>الخزنة والمصاريف</h2>
  <div class="grid">
    <div class="stat"><b>${fmt(v.balance)} ج</b><span>رصيد خزنة الطوارئ ${v.balance < minBal && minBal > 0 ? "⚠️ تحت حد الأمان!" : ""}</span></div>
    <div class="stat"><b>${fmt(todayExp)} ج</b><span>مصاريف اليوم ${budget > 0 ? `/ حد ${fmt(budget)} ج` : ""}</span></div>
  </div>
  <div class="card mt"><h3>💰 الخزنة</h3>
    <p class="muted">التحويل التلقائي من نقدية اليوم: ${SETTINGS.vault_mode === "percent" ? (SETTINGS.vault_percent || 0) + "% من نقدية كل فاتورة" : "مبلغ ثابت " + fmt(SETTINGS.vault_fixed_amount || 0) + " ج لكل فاتورة نقدية"} — يُضبط من الإعدادات.</p>
    <div class="row"><input id="vAmount" type="number" placeholder="المبلغ"><input id="vNote" placeholder="ملاحظة"></div>
    <div class="row mt">
      <button class="btn" onclick="vaultOp('deposit')">➕ إيداع يدوي</button>
      ${ME.role === "super" ? `<button class="btn danger" onclick="vaultOp('withdraw')">⬇️ صرف (روني فقط)</button>` : `<span class="muted">الصرف بموافقة روني فقط.</span>`}
    </div>
    <div id="vMsg" class="mt"></div>
    ${v.transactions.slice(0, 10).map(t => `<div class="price-line"><span>${t.kind === "auto" ? "🔄 تلقائي" : t.kind === "deposit" ? "⬇️ إيداع" : "⬆️ صرف"} — ${esc(t.note || "")}</span><b>${t.kind === "withdraw" ? "-" : "+"}${fmt(t.amount)} ج</b></div>`).join("")}
  </div>
  <div class="card"><h3>🧾 مصروف جديد</h3>
    <div class="row">
      <select id="exCat">${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <input id="exAmount" type="number" placeholder="المبلغ">
      <input id="exNote" placeholder="ملاحظة">
    </div>
    <div class="row mt"><button class="btn" onclick="addExpense()">حفظ المصروف</button>
    <button class="btn gold" onclick="openVoice('expense')">🎤 صوت</button></div>
    <div id="exMsg" class="mt"></div>
  </div>
  <h3>آخر المصاريف</h3>
  <div class="searchbox">
    <input id="exFilter" placeholder="فلترة المصاريف بالتصنيف أو الملاحظة..." value="${esc(exFilter)}" oninput="exFilter=this.value;renderExpenses()">
  </div>
  <div id="exListBox" class="mt">${renderExpenses()}</div>`;
}
function renderExpenses() {
  const list = EXPENSES.filter(e => !exFilter || ((e.category_name || "") + " " + (e.note || "")).includes(exFilter)).slice(0, 20);
  const box = $("#exListBox");
  const html = list.map(e => `<div class="card"><div class="price-line"><span>${esc(e.category_name || "")} — ${esc(e.note || "")}</span><b>${fmt(e.amount)} ج</b></div><div class="muted">${esc((e.created_at || "").slice(0, 16))}</div></div>`).join("") || `<p class="muted">لا توجد مصاريف مطابقة.</p>`;
  if (box) box.innerHTML = html;
  return html;
}
async function vaultOp(kind) {
  const msg = $("#vMsg");
  try {
    const amount = Number($("#vAmount").value);
    if (kind === "withdraw" && !confirm(`⚠️ صرف ${fmt(amount)} ج من خزنة الطوارئ؟\nالخزنة للطوارئ فقط — تأكيد روني مطلوب.`)) return;
    const j = await api("POST", "/api/vault/" + kind, { amount, note: $("#vNote").value });
    msg.innerHTML = `<div class="ok">✅ تم — الرصيد الجديد ${fmt(j.balance)} ج.</div>`;
    setTimeout(() => showTab("vault"), 900);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function addExpense() {
  const msg = $("#exMsg");
  try {
    await api("POST", "/api/expenses", { categoryId: Number($("#exCat").value), amount: Number($("#exAmount").value), note: $("#exNote").value });
    msg.innerHTML = `<div class="ok">✅ تم تسجيل المصروف.</div>`;
    setTimeout(() => showTab("vault"), 900);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------- باقات وعمولات ونقاط ----------------
async function vBundles() {
  const bundles = (await api("GET", "/api/bundles")).bundles;
  const comm = await api("GET", "/api/commissions");
  const plumbers = PARTIES.filter(p => p.type === "plumber");
  return `
  <h2>باقات وعمولات ونقاط</h2>
  <div class="card"><h3>🎁 الباقات (سعر موحد كصنف واحد في الفاتورة)</h3>
    ${bundles.map(b => `<div class="price-line"><span>${esc(b.name)} — ${b.items.map(i => `${esc(i.name)} ${esc(i.size)} ×${i.qty}`).join(" + ")}</span><b>${fmt(b.price)} ج</b></div>`).join("") || `<p class="muted">لا توجد باقات بعد.</p>`}
    ${isAdmin() ? `<div class="row mt"><input id="bName" placeholder="اسم الباقة"><input id="bPrice" type="number" placeholder="السعر الموحد"><input id="bItems" placeholder="أصناف: كوع 4/3 ×2، ماسورة... (ابحث وأضف من الفاتورة)"></div>
    <p class="muted">لإنشاء باقة: اكتب الاسم والسعر، ثم أضف الأصناف من زر «إضافة صنف للباقة» أسفل — أو استخدم الفاتورة مباشرة.</p>
    <div class="row"><button class="btn" onclick="addBundle()">حفظ الباقة</button></div><div id="bMsg" class="mt"></div>` : ""}
  </div>
  <div class="card"><h3>🧑‍🔧 عمولات السباكين (نسبة ${SETTINGS.commission_rate || 5}% من الفاتورة)</h3>
    <div class="price-line"><span>مستحق</span><b>${fmt(comm.totalDue)} ج</b></div>
    <div class="price-line"><span>مدفوع</span><b>${fmt(comm.totalPaid)} ج</b></div>
    ${comm.commissions.slice(0, 20).map(c => `<div class="price-line"><span>${esc(c.plumber_name || "")} — فاتورة #${c.invoice_id || "—"}</span><b>${fmt(c.amount)} ج ${c.status === "due" ? `<button class="btn small" onclick="payCommission(${c.id})">دفع</button>` : `<span class="badge">مدفوعة</span>`}</b></div>`).join("") || `<p class="muted">لا توجد عمولات بعد.</p>`}
  </div>
  <div class="card"><h3>⭐ نقاط الولاء (نقطة لكل جنيه)</h3>
    ${PARTIES.filter(p => p.points > 0).map(p => `<div class="price-line"><span>${esc(p.name)}</span><b>${fmt(p.points)} نقطة</b></div>`).join("") || `<p class="muted">لا توجد نقاط متراكمة بعد — النقاط تُكسب من الفواتير وتُستبدل بخصم بقيمة ${SETTINGS.loyalty_point_value || 1} ج للنقطة.</p>`}
  </div>`;
}
async function addBundle() {
  const msg = $("#bMsg");
  try {
    const raw = $("#bItems").value.trim();
    if (!raw) throw new Error("اكتب أصناف الباقة: اسم الصنف ×الكمية، مفصولة بفاصلة");
    const items = [];
    for (const part of raw.split(/[,،]/)) {
      const m = part.trim().match(/^(.*?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?\s*$/);
      if (!m) continue;
      const j = await api("GET", "/api/products?q=" + encodeURIComponent(m[1].trim()));
      if (!j.products.length) throw new Error("لم أجد الصنف: " + m[1]);
      items.push({ productId: j.products[0].id, qty: Number(m[2]) || 1 });
    }
    await api("POST", "/api/bundles", { name: $("#bName").value.trim(), price: Number($("#bPrice").value), items });
    msg.innerHTML = `<div class="ok">✅ تم إنشاء الباقة.</div>`;
    setTimeout(() => showTab("bundles"), 900);
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function payCommission(id) {
  await api("POST", "/api/commissions/" + id + "/pay");
  showTab("bundles");
}

// ---------------- التقارير ----------------
async function vReports() {
  const [short, cash, debts, rem] = await Promise.all([
    api("GET", "/api/reports/shortages"), api("GET", "/api/reports/daily-cash"),
    api("GET", "/api/reports/daily-debts"), api("GET", "/api/reminders"),
  ]);
  const wa = (text, phone) => "https://wa.me/" + (phone || "") + "?text=" + encodeURIComponent(text);
  const shortText = `📦 تقرير نواقص معرض الرضوان — ${today()}\n` + (short.shortages.map(p => `• ${p.name} ${p.size} (${p.warehouse}): المتاح ${fmt(p.qty)} — اقتراح طلب ${fmt(p.suggestedQty)} بتكلفة ${fmt(p.suggestedCost)} ج`).join("\n") || "لا توجد نواقص.");
  const debtText = `💳 تقرير مديونيات معرض الرضوان — ${today()}\n` + (debts.parties.map(p => `• ${p.name}: ${fmt(p.balance)} ج`).join("\n") || "لا توجد مديونيات.");
  const cashText = `💰 ملخص صندوق معرض الرضوان — ${today()}\nفواتير: ${fmt(cash.invoices.total)} ج (${cash.invoices.n})\nنقدية محصلة: ${fmt(cash.invoices.paid)} ج\nمشتريات: ${fmt(cash.purchases.total)} ج\nمصاريف: ${fmt(cash.expenses.total)} ج\nتحويل الخزنة التلقائي: ${fmt(cash.vaultAuto)} ج\nرصيد الخزنة: ${fmt(cash.vaultBalance)} ج`;
  const khaledPhone = (await api("GET", "/api/users").catch(() => ({ users: [] }))).users?.find(u => u.username === "khaled")?.phone || "";
  SHORTAGES = short.shortages;
  DEBT_REP = debts.parties;
  return `
  <h2>التقارير اليومية</h2>
  <div class="card"><h3>📦 تقرير النواقص (${short.shortages.length})</h3>
    <p class="muted">حد الطلب: ${short.threshold} — الكمية المقترحة = ضعف الحد − المتاح.</p>
    <div class="searchbox">
      <input id="shortFilter" placeholder="فلترة النواقص بالاسم أو المخزن..." value="${esc(shortFilter)}" oninput="shortFilter=this.value;renderShortages()">
    </div>
    <div id="shortListBox" class="mt">${renderShortages()}</div>
    <div class="row mt"><a class="btn wa" href="${wa(shortText)}" target="_blank">📲 مشاركة واتساب (جروب المعرض)</a></div>
  </div>
  <div class="card"><h3>💳 تقرير المديونيات اليومي</h3>
    <div class="searchbox">
      <input id="debtRepFilter" placeholder="فلترة المديونيات بالاسم..." value="${esc(debtRepFilter)}" oninput="debtRepFilter=this.value;renderDebtRep()">
    </div>
    <div id="debtRepBox" class="mt">${renderDebtRep()}</div>
    <div class="row mt">
      <a class="btn wa" href="${wa(debtText)}" target="_blank">📲 مشاركة واتساب (جروب المعرض)</a>
      ${khaledPhone ? `<a class="btn wa" href="${wa(debtText, khaledPhone)}" target="_blank">📲 إرسال للشيخ خالد</a>` : `<span class="muted">سجّل رقم واتساب الشيخ خالد من الإعدادات لإرسال التقرير له مباشرة.</span>`}
    </div>
  </div>
  <div class="card"><h3>💰 ملخص الصندوق اليومي</h3>
    <div class="price-line"><span>فواتير اليوم</span><b>${fmt(cash.invoices.total)} ج (${cash.invoices.n})</b></div>
    <div class="price-line"><span>نقدية محصلة</span><b>${fmt(cash.invoices.paid)} ج</b></div>
    <div class="price-line"><span>مشتريات اليوم</span><b>${fmt(cash.purchases.total)} ج</b></div>
    <div class="price-line"><span>مصاريف اليوم</span><b>${fmt(cash.expenses.total)} ج</b></div>
    <div class="price-line"><span>رصيد الخزنة</span><b>${fmt(cash.vaultBalance)} ج</b></div>
    <div class="row mt"><a class="btn wa" href="${wa(cashText)}" target="_blank">📲 مشاركة واتساب</a></div>
  </div>
  <div class="card"><h3>🔔 تذكير المديونيات القديمة</h3>
    <p class="muted">حد التأخير: ${rem.days} يوم — يُذكَّر كل ${SETTINGS.reminder_repeat_days || 7} أيام.</p>
    ${rem.overdue.map(p => `<div class="price-line"><span>${esc(p.name)} — ${fmt(p.balance)} ج (${Math.floor(p.idle_days)} يوم)</span>
      <button class="btn small wa" onclick="remindParty(${p.id},'${esc(p.name)}','${esc(p.phone || "")}')">واتساب</button></div>`).join("") || `<p class="muted">لا توجد مديونيات متأخرة.</p>`}
  </div>
  <div class="card"><h3>📜 سجل تغيير الأسعار</h3>
    <button class="btn ghost" onclick="showPriceLog()">عرض السجل</button>
    <div id="priceLogBox" class="mt"></div>
  </div>`;
}
function renderShortages() {
  const list = SHORTAGES.filter(p => !shortFilter || ((p.name || "") + " " + (p.warehouse || "")).includes(shortFilter)).slice(0, 30);
  const box = $("#shortListBox");
  const html = list.map(p => `<div class="price-line"><span>${esc(p.name)} ${esc(p.size)} — ${esc(p.warehouse)} (متاح ${fmt(p.qty)})</span><b>اطلب ${fmt(p.suggestedQty)} ≈ ${fmt(p.suggestedCost)} ج</b></div>`).join("") || `<p class="muted">لا توجد نواقص مطابقة.</p>`;
  if (box) box.innerHTML = html;
  return html;
}
function renderDebtRep() {
  const list = DEBT_REP.filter(p => !debtRepFilter || (p.name || "").includes(debtRepFilter));
  const box = $("#debtRepBox");
  const html = list.map(p => `<div class="price-line"><span>${esc(p.name)}</span><b>${fmt(p.balance)} ج</b></div>`).join("") || `<p class="muted">لا توجد مديونيات مطابقة.</p>`;
  if (box) box.innerHTML = html;
  return html;
}
async function showPriceLog() {
  const j = await api("GET", "/api/price-log");
  const fieldAr = { list_price: "لستة", last_purchase_price: "شراء", explicit_trade: "تجاري", explicit_premium: "مميز", explicit_retail: "قطاعي" };
  $("#priceLogBox").innerHTML = j.log.slice(0, 30).map(l => `<div class="price-line"><span>${esc(l.product_name || "")} — ${fieldAr[l.field] || "شراء"}: ${fmt(l.old_price)} ← ${fmt(l.new_price)} ج</span><span class="muted">${esc((l.created_at || "").slice(0, 16))} — ${esc(l.changed_by_name || "")}</span></div>`).join("") || `<p class="muted">لا توجد تغييرات مسجلة.</p>`;
}

// ---------------- الإعدادات ----------------
async function vSettings() {
  const users = isAdmin() ? (await api("GET", "/api/users")).users : [];
  const priceRow = (key, label) => `<div class="price-line"><span>${label}</span><span><input type="number" id="set_${key}" value="${SETTINGS[key] ?? ""}" style="width:110px;display:inline-block"> %</span></div>`;
  return `
  <h2>الإعدادات</h2>
  <div class="card"><h3>💰 التسعير</h3>
    <p class="muted">خصم الشراء على اللستة لكل مجموعة — وسعر البيع التجاري ابتدائياً = آخر سعر شراء.</p>
    ${priceRow("pricing_ppr", "البولي (لحام) — خصم شراء")}
    ${priceRow("pricing_white", "الصرف الأبيض — خصم شراء")}
    ${priceRow("pricing_gasket", "الجوان — خصم شراء")}
    ${priceRow("pricing_other", "لوازم عامة — خصم شراء")}
    ${priceRow("pricing_premium", "سعر مميز — خصم من اللستة")}
    ${priceRow("pricing_retail", "سعر قطاعي — خصم من اللستة")}
  </div>
  <div class="card"><h3>🏦 الخزنة والمصاريف</h3>
    <div class="price-line"><span>وضع التحويل التلقائي</span><span><select id="set_vault_mode" style="width:150px"><option value="fixed" ${SETTINGS.vault_mode === "fixed" ? "selected" : ""}>مبلغ ثابت</option><option value="percent" ${SETTINGS.vault_mode === "percent" ? "selected" : ""}>نسبة من النقدية</option></select></span></div>
    <div class="price-line"><span>المبلغ الثابت (ج لكل فاتورة نقدية)</span><span><input type="number" id="set_vault_fixed_amount" value="${SETTINGS.vault_fixed_amount ?? 0}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>النسبة % من نقدية اليوم</span><span><input type="number" id="set_vault_percent" value="${SETTINGS.vault_percent ?? 0}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>حد أمان رصيد الخزنة (ج)</span><span><input type="number" id="set_vault_min_balance" value="${SETTINGS.vault_min_balance ?? 0}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>الحد اليومي للمصاريف (ج)</span><span><input type="number" id="set_expense_daily_budget" value="${SETTINGS.expense_daily_budget ?? 0}" style="width:110px;display:inline-block"></span></div>
  </div>
  <div class="card"><h3>🛒 المبيعات</h3>
    <div class="price-line"><span>حد خصم الكميات (قطعة)</span><span><input type="number" id="set_qty_discount_threshold" value="${SETTINGS.qty_discount_threshold ?? 10}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>نسبة خصم الكميات %</span><span><input type="number" id="set_qty_discount_pct" value="${SETTINGS.qty_discount_pct ?? 5}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>عمولة السباكين %</span><span><input type="number" id="set_commission_rate" value="${SETTINGS.commission_rate ?? 5}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>قيمة نقطة الولاء (ج)</span><span><input type="number" id="set_loyalty_point_value" value="${SETTINGS.loyalty_point_value ?? 1}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>حد تأخير التذكير (يوم)</span><span><input type="number" id="set_reminder_days" value="${SETTINGS.reminder_days ?? 30}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>تكرار التذكير (يوم)</span><span><input type="number" id="set_reminder_repeat_days" value="${SETTINGS.reminder_repeat_days ?? 7}" style="width:110px;display:inline-block"></span></div>
    <div class="price-line"><span>حد طلب النواقص (قطعة)</span><span><input type="number" id="set_low_stock_threshold" value="${SETTINGS.low_stock_threshold ?? 5}" style="width:110px;display:inline-block"></span></div>
  </div>
  ${isAdmin() ? `<div class="row"><button class="btn" style="flex:1" onclick="saveSettings()">💾 حفظ الإعدادات</button></div><div id="setMsg" class="mt"></div>` : `<p class="muted">تعديل الإعدادات للأدمن وروني فقط.</p>`}
  <div class="card mt"><h3>📱 أرقام الواتساب</h3>
    ${users.map(u => `<div class="price-line"><span>${esc(u.name)} (${esc(u.username)})</span><span><input type="tel" id="phone_${u.id}" value="${esc(u.phone || "")}" placeholder="01xxxxxxxxx" style="width:150px;display:inline-block"> <button class="btn small" onclick="savePhone(${u.id})">حفظ</button></span></div>`).join("") || `<p class="muted">أرقام الواتساب تُسجل هنا — وتُستخدم في مشاركة التقارير والتذكيرات.</p>`}
  </div>
  ${ME.role === "super" ? `<div class="card"><h3>🧩 المكونات (سوبر أدمن فقط)</h3>
    ${COMPONENTS.map(c => `<div class="price-line"><span>${esc(c.name)}</span><span><input type="checkbox" ${c.enabled ? "checked" : ""} onchange="toggleComponent('${c.key}', this.checked)" style="width:auto"></span></div>`).join("")}
  </div>` : ""}
  <div class="card"><h3>🔑 تغيير كلمة المرور</h3>
    <div class="row"><input id="pwCur" type="password" placeholder="الحالية"><input id="pwNew" type="password" placeholder="الجديدة (6 أحرف على الأقل)"></div>
    <div class="row mt"><button class="btn ghost" onclick="changePw()">تغيير</button></div>
    <div id="pwMsg" class="mt"></div>
  </div>`;
}
async function saveSettings() {
  const msg = $("#setMsg");
  try {
    const keys = ["pricing_ppr", "pricing_white", "pricing_gasket", "pricing_other", "pricing_premium", "pricing_retail",
      "vault_mode", "vault_fixed_amount", "vault_percent", "vault_min_balance", "expense_daily_budget",
      "qty_discount_threshold", "qty_discount_pct", "commission_rate", "loyalty_point_value",
      "reminder_days", "reminder_repeat_days", "low_stock_threshold"];
    const body = {};
    for (const k of keys) { const el = document.getElementById("set_" + k); if (el) body[k] = el.value; }
    const j = await api("PUT", "/api/settings", body);
    SETTINGS = j.settings;
    msg.innerHTML = `<div class="ok">✅ تم حفظ الإعدادات.</div>`;
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function savePhone(userId) {
  const phone = document.getElementById("phone_" + userId).value.trim();
  await api("PUT", "/api/profile/phone", { userId, phone });
  alert("تم حفظ الرقم.");
}
async function toggleComponent(key, enabled) {
  try { await api("PUT", "/api/components/" + key, { enabled: enabled ? 1 : 0 }); await loadLookups(); }
  catch (e) { alert(e.message); showTab("settings"); }
}
async function changePw() {
  const msg = $("#pwMsg");
  try {
    await api("POST", "/api/me/password", { current: $("#pwCur").value, next: $("#pwNew").value });
    msg.innerHTML = `<div class="ok">✅ تم تغيير كلمة المرور.</div>`;
  } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------- الصوت ----------------
let voiceCtx = null; // 'khaled' | 'expense' | null
function openVoice(ctx) { voiceCtx = ctx || null; $("#voiceModal").classList.remove("hidden"); }
function closeVoice() { $("#voiceModal").classList.add("hidden"); }
async function startListening() {
  const statusEl = $("#micStatus");
  const setStatus = (t) => { statusEl.textContent = t; };
  // 1) داخل تطبيق الأندرويد (APK): البلجن الأصلي للتعرف الصوتي،
  // لأن WebView لا يدعم Web Speech API أصلاً — الكود القديم كان يفشل هنا دائماً.
  const cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
    try {
      setStatus("🎤 أستمع... تكلم الآن");
      const av = await cap.nativePromise("SpeechRecognition", "available", {});
      if (!av || av.available === false) {
        setStatus("التعرف الصوتي غير متاح على هذا الجهاز — اكتب الأمر يدوياً.");
        return;
      }
      let perm = await cap.nativePromise("SpeechRecognition", "checkPermissions", {});
      if (!perm || perm.speechRecognition !== "granted") {
        perm = await cap.nativePromise("SpeechRecognition", "requestPermissions", {});
      }
      if (!perm || perm.speechRecognition !== "granted") {
        setStatus("لازم تسمح للميكروفون عشان البحث الصوتي يشتغل — فعّله من إعدادات الموبايل ← التطبيقات ← معرض الرضوان ← الأذونات ← الميكروفون.");
        return;
      }
      const res = await cap.nativePromise("SpeechRecognition", "start", { language: "ar-EG", maxResults: 1, prompt: "تكلم الآن", popup: true, partialResults: false });
      const text = res && res.matches && res.matches[0];
      if (text) {
        $("#voiceText").value = text;
        setStatus("تم الاستماع — راجع الأمر ثم اضغط «بحث / تنفيذ».");
      } else {
        setStatus("لم أسمع شيئاً — حاول مرة أخرى.");
      }
    } catch (e) {
      const msg = String((e && (e.message || e)) || "");
      if (msg === "0" || /cancel/i.test(msg)) setStatus("تم إلغاء الاستماع — دوس «🎤 تكلم» وحاول مرة أخرى.");
      else if (/MISSING_PERMISSION|permission/i.test(msg)) setStatus("لازم تسمح للميكروفون عشان البحث الصوتي يشتغل — فعّله من إعدادات الموبايل ← التطبيقات ← معرض الرضوان ← الأذونات ← الميكروفون.");
      else setStatus("تعذر الاستماع — اكتب الأمر يدوياً.");
    }
    return;
  }
  // 2) المتصفح (كروم/PWA): Web Speech API — كما كان
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { setStatus("المتصفح لا يدعم التعرف الصوتي — اكتب الأمر يدوياً."); return; }
  const rec = new SR();
  rec.lang = "ar-EG"; rec.interimResults = false; rec.maxAlternatives = 1;
  setStatus("🎤 أستمع... تكلم الآن");
  rec.onresult = (e) => {
    $("#voiceText").value = e.results[0][0].transcript;
    setStatus("تم الاستماع — راجع الأمر ثم اضغط «بحث / تنفيذ».");
  };
  rec.onerror = (e) => { setStatus("تعذر الاستماع: " + e.error); };
  rec.onend = () => { if (!$("#voiceText").value) setStatus(""); };
  rec.start();
}
async function runVoice() {
  const text = ($("#voiceText").value || "").trim();
  const box = $("#voiceResults");
  if (!text) { box.innerHTML = `<p class="muted">اكتب أو قل أمراً أولاً.</p>`; return; }
  // 1) مصروف: «مصروف 50 جنيه إيجار»
  let m = text.match(/مصروف\s+(\d+(?:\.\d+)?)/);
  if (m) {
    const amount = Number(m[1]);
    const catName = text.replace(/مصروف\s*\d+(?:\.\d+)?\s*(جنيه|ج)?\s*/g, "").trim();
    pendingVoice = { type: "expense", amount, note: catName };
    box.innerHTML = `<div class="card"><h3>تأكيد الأمر الصوتي</h3>
      <p>تسجيل مصروف <b>${fmt(amount)} جنيه</b>${catName ? ` — «${esc(catName)}»` : ""}؟</p>
      <div class="row"><button class="btn" onclick="confirmVoiceExpense()">✅ تأكيد وتنفيذ</button>
      <button class="btn ghost" onclick="document.getElementById('voiceResults').innerHTML=''">إلغاء</button></div></div>`;
    return;
  }
  // 2) دفتر خالد: «أخد 500 من السعيد» / «رجع 200 للسعيد»
  m = text.match(/(أخد|اخد|رجّع|رجع)\s+(\d+(?:\.\d+)?)/);
  if (m && canKhaled()) {
    const amount = Number(m[2]);
    const who = text.replace(/.*?(?:من|لـ|لل|الى|إلى)\s*/g, "").trim() || "";
    const kind = /رج/.test(m[1]) ? "out" : "in";
    pendingVoice = { type: "khaled", kind, amount, who };
    box.innerHTML = `<div class="card"><h3>تأكيد الأمر الصوتي</h3>
      <p>تسجيل في دفتر الشيخ خالد: <b>${kind === "in" ? "أخد" : "رجّع"} ${fmt(amount)} جنيه</b>${who ? ` — ${esc(who)}` : ""}؟</p>
      <div class="row"><button class="btn" onclick="confirmVoiceKhaled()">✅ تأكيد وتنفيذ</button>
      <button class="btn ghost" onclick="document.getElementById('voiceResults').innerHTML=''">إلغاء</button></div></div>`;
    return;
  }
  // 3) بحث صوتي عن منتج / مديونية
  const prod = await api("GET", "/api/products?q=" + encodeURIComponent(text)).catch(() => ({ products: [] }));
  const party = PARTIES.find(p => p.name.includes(text.replace(/مديونية|سعر|بحث|عن/g, "").trim())) || null;
  let html = "";
  if (prod.products && prod.products.length) {
    const p = prod.products[0];
    html += `<div class="card"><h3>${esc(p.name)} ${esc(p.size)}</h3>
      <div class="price-line"><span>سعر الشراء</span><b>${fmt(p.last_purchase_price)} ج</b></div>
      <div class="price-line"><span>تجاري</span><b>${fmt(p.tradePrice)} ج</b></div>
      <div class="price-line"><span>مميز</span><b>${fmt(p.premiumPrice)} ج</b></div></div>`;
  }
  if (party) html += `<div class="card"><h3>${esc(party.name)}</h3><div class="price-line"><span>المديونية</span><b>${fmt(party.balance)} ج</b></div><div class="price-line"><span>النقاط</span><b>${fmt(party.points)}</b></div></div>`;
  box.innerHTML = html || `<p class="muted">لم أجد نتيجة لـ «${esc(text)}» — جرّب اسم منتج أو اسم زبون، أو قل «مصروف 50 جنيه».</p>`;
}
let pendingVoice = null;
async function confirmVoiceExpense() {
  const { amount, note } = pendingVoice || {};
  if (!amount) return;
  const cats = (await api("GET", "/api/expense-categories")).categories;
  let cat = cats.find(c => note && note.includes(c.name)) || cats[cats.length - 1];
  await api("POST", "/api/expenses", { categoryId: cat.id, amount, note: "أمر صوتي: " + note });
  $("#voiceResults").innerHTML = `<div class="ok">✅ تم تسجيل المصروف ${fmt(amount)} ج.</div>`;
  pendingVoice = null;
}
async function confirmVoiceKhaled() {
  const { kind, amount, who } = pendingVoice || {};
  if (!amount) return;
  await api("POST", "/api/khaled-ledger", { kind, amount, from_party: kind === "in" ? who : "", to_party: kind === "out" ? who : "", note: "أمر صوتي" });
  $("#voiceResults").innerHTML = `<div class="ok">✅ تم تسجيل القيد في دفتر الشيخ خالد.</div>`;
  pendingVoice = null;
}

// ---------------- مسح الباركود ----------------
let scanStream = null;
function openScan() { $("#scanModal").classList.remove("hidden"); }
function closeScan() { stopScan(); $("#scanModal").classList.add("hidden"); }
async function startScan() {
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const v = $("#scanVideo");
    v.classList.remove("hidden");
    v.srcObject = scanStream;
    await v.play();
    if ("BarcodeDetector" in window) {
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code"] });
      const tick = async () => {
        if (!scanStream) return;
        try {
          const codes = await det.detect(v);
          if (codes.length) { $("#scanCode").value = codes[0].rawValue; stopScan(); lookupScanCode(); return; }
        } catch {}
        setTimeout(tick, 400);
      };
      tick();
    } else {
      $("#scanResult").innerHTML = `<p class="muted">المتصفح لا يدعم المسح التلقائي — اكتب الرقم يدوياً.</p>`;
    }
  } catch (e) { $("#scanResult").innerHTML = `<div class="err">تعذّر فتح الكاميرا: ${esc(e.message)} — اكتب الرقم يدوياً.</div>`; }
}
function stopScan() {
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const v = $("#scanVideo"); if (v) { v.classList.add("hidden"); v.srcObject = null; }
}
async function lookupScanCode() {
  const code = ($("#scanCode").value || "").trim();
  const box = $("#scanResult");
  if (!code) return;
  try {
    const j = await api("GET", "/api/products/barcode/" + encodeURIComponent(code));
    const p = j.product;
    box.innerHTML = `<div class="card"><h3>${esc(p.name)} ${esc(p.size)}</h3>
      <div class="price-line"><span>سعر الشراء</span><b>${fmt(p.last_purchase_price)} ج</b></div>
      <div class="price-line"><span>تجاري</span><b>${fmt(p.tradePrice)} ج</b></div>
      <div class="price-line"><span>مميز</span><b>${fmt(p.premiumPrice)} ج</b></div></div>`;
  } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// دخول تلقائي بجلسة محفوظة
(async () => {
  if (TOKEN) {
    try { const j = await api("GET", "/api/me"); ME = j.user; enter(); }
    catch { TOKEN = ""; localStorage.removeItem("rw_token"); }
  }
})();
