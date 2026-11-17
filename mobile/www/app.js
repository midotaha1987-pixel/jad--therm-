/* جاد ثيرم — واجهة التطبيق */
const LOGO_SVG = `<svg width="46" height="46" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<rect width="100" height="100" rx="18" fill="#013078"/>
<path d="M50 14 C60 26 66 34 66 46 a16 16 0 1 1 -32 0 c0-7 4-11 7-16 2 4 4 6 4 10 3-3 5-8 5-14z" fill="#E8110F"/>
<path d="M50 30 C55 37 59 41 59 48 a9 9 0 1 1 -18 0 c0-4 2-6 4-9 1 2 2 3 2 5 2-2 3-4 3-8z" fill="#F96D00"/>
<circle cx="70" cy="70" r="11" fill="#6BC5FF"/><circle cx="70" cy="70" r="6" fill="#fff" opacity=".65"/>
<text x="50" y="94" font-size="11" font-weight="bold" fill="#fff" text-anchor="middle" font-family="Arial">GAD THERM</text>
</svg>`;
document.getElementById("logoLogin").innerHTML = LOGO_SVG.replace('width="46" height="46"', 'width="90" height="90"');
document.getElementById("logoHead").innerHTML = LOGO_SVG;

let TOKEN = localStorage.getItem("jt_token") || "";
let ME = null;
let TAB = "home";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

async function api(method, path, body) {
  const r = await fetch(path, {
    method, headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("خطأ " + r.status));
  return j;
}

const ROLE_AR = { admin: "الأدمن", distributor: "موزع", merchant: "تاجر", technician: "فني (سباك)", salesrep: "مندوب" };
const SECTION_AR = { gasket: "الجوان PPH", ppr: "البولي PPR", white: "الأبيض uPVC", other: "منتجات أخرى" };

async function doLogin() {
  const u = $("#loginUser").value.trim(), p = $("#loginPass").value;
  const err = $("#loginErr");
  try {
    const j = await api("POST", "/api/auth/login", { username: u, password: p });
    TOKEN = j.token; localStorage.setItem("jt_token", TOKEN); ME = j.user;
    enter();
  } catch (e) { err.textContent = e.message; err.classList.remove("hidden"); }
}
async function doLogout() {
  try { await api("POST", "/api/auth/logout"); } catch {}
  TOKEN = ""; ME = null; localStorage.removeItem("jt_token");
  $("#app").classList.add("hidden"); $("#loginScreen").classList.remove("hidden");
}
function enter() {
  $("#loginScreen").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#roleLabel").textContent = `${ME.name} — ${ROLE_AR[ME.role] || ME.role}`;
  buildTabs(); showTab("home");
}
function buildTabs() {
  const all = {
    home: ["🏠", "الرئيسية"], coupons: ["🎟️", "الكوبونات"], calc: ["🧮", "حساب السباك"],
    offers: ["⭐", "عروضي ونقاطي"], prices: ["🏷️", "الأسعار"], route: ["🗺️", "خط السير"],
    invoices: ["🧾", "الفواتير"], merchants: ["🏪", "التجار"], users: ["👥", "المستخدمون"], account: ["👤", "حسابي"],
  };
  const byRole = {
    admin: ["home", "coupons", "calc", "prices", "route", "invoices", "merchants", "users", "account"],
    distributor: ["home", "coupons", "prices", "account"],
    merchant: ["home", "coupons", "prices", "invoices", "account"],
    technician: ["home", "coupons", "offers", "prices", "account"],
    salesrep: ["home", "calc", "prices", "route", "invoices", "merchants", "account"],
  };
  const tabs = byRole[ME.role] || ["home", "account"];
  $("#tabs").innerHTML = tabs.map(t => `<button data-tab="${t}" onclick="showTab('${t}')"><span class="ic">${all[t][0]}</span>${all[t][1]}</button>`).join("");
}
async function showTab(t) {
  TAB = t;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  const m = $("#main");
  m.innerHTML = `<div class="card center muted">جاري التحميل...</div>`;
  try {
    if (t === "home") m.innerHTML = await vHome();
    else if (t === "coupons") m.innerHTML = await vCoupons();
    else if (t === "calc") m.innerHTML = await vCalc();
    else if (t === "offers") m.innerHTML = await vOffers();
    else if (t === "prices") m.innerHTML = await vPrices();
    else if (t === "route") m.innerHTML = await vRoute();
    else if (t === "invoices") m.innerHTML = await vInvoices();
    else if (t === "merchants") m.innerHTML = await vMerchants();
    else if (t === "users") m.innerHTML = await vUsers();
    else if (t === "account") m.innerHTML = await vAccount();
    window.scrollTo(0, 0);
  } catch (e) { m.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; }
}

// ---------------- الرئيسية ----------------
async function vHome() {
  const d = await api("GET", "/api/dashboard");
  const u = d.user;
  let h = `<div class="card"><h2>أهلاً ${esc(u.name)} 👋</h2>
    <div class="grid">
      <div class="stat"><b>${fmt(u.points)}</b><span>رصيد النقاط (النقطة = 1 ج)</span></div>
      <div class="stat"><b>${d.couponsAvailable}</b><span>كوبونات متاحة</span></div>
      <div class="stat"><b>${d.myJobs}</b><span>عروض سباك</span></div>
    </div></div>`;
  if (d.totals) h += `<div class="card"><h2>نظرة عامة (أدمن)</h2><div class="grid">
    <div class="stat"><b>${d.totals.users}</b><span>مستخدمون</span></div>
    <div class="stat"><b>${d.totals.coupons}</b><span>كوبونات</span></div>
    <div class="stat"><b>${d.totals.jobs}</b><span>حسابات سباك</span></div>
    <div class="stat"><b>${d.totals.invoices}</b><span>فواتير</span></div></div></div>`;
  h += `<div class="card"><h2>آخر الحركات</h2>${d.transactions.length ? `<table>${d.transactions.map(t => `<tr><td>${esc(t.note)}</td><td>${fmt(t.amount)} ج</td><td class="muted">${esc(t.created_at.slice(0, 16))}</td></tr>`).join("")}</table>` : `<p class="muted">لا توجد حركات بعد</p>`}</div>`;
  return h;
}

// ---------------- الكوبونات ----------------
async function vCoupons() {
  const [c, users] = await Promise.all([api("GET", "/api/coupons"), ME.role === "admin" || ME.role === "distributor" ? api("GET", "/api/users").catch(() => ({ users: [] })) : { users: [] }]);
  let h = "";
  if (ME.role === "admin" || ME.role === "distributor") {
    h += `<div class="card"><h2>إنشاء كوبون</h2><div class="row">
      <input id="cpVal" type="number" placeholder="قيمة الكوبون بالجنيه">
      <input id="cpProd" placeholder="المنتج (اختياري)">
      <button class="btn" onclick="createCoupon()">إنشاء كوبون</button></div></div>`;
  }
  h += `<div class="card"><h2>الكوبونات</h2>${c.coupons.map(x => `
    <div class="coupon"><code>${esc(x.code)}</code> — <b>${fmt(x.value)} ج</b> ${x.product ? "— " + esc(x.product) : ""}
    <span class="badge ${x.status === "available" ? "green" : "grey"}">${x.status === "available" ? "متاح" : "مستبدل"}</span>
    <div class="row mt">
      ${x.status === "available" && x.owner_id === ME.id ? `<button class="btn small green" onclick="redeemCoupon(${x.id})">استبدال</button>` : ""}
      ${x.status === "available" && (x.owner_id === ME.id || ME.role === "admin") ? `<select id="sendTo${x.id}" style="max-width:220px">${users.users.filter(u => u.id !== ME.id).map(u => `<option value="${u.id}">${esc(u.name)} (${ROLE_AR[u.role]})</option>`).join("")}</select>
      <button class="btn small" onclick="sendCoupon(${x.id})">إرسال</button>` : ""}
    </div></div>`).join("") || `<p class="muted">لا توجد كوبونات</p>`}</div>`;
  return h;
}
async function createCoupon() {
  try { await api("POST", "/api/coupons", { value: +$("#cpVal").value, product: $("#cpProd").value }); showTab("coupons"); }
  catch (e) { alert(e.message); }
}
async function sendCoupon(id) {
  try { await api("POST", `/api/coupons/${id}/send`, { toUserId: +$("#sendTo" + id).value }); showTab("coupons"); }
  catch (e) { alert(e.message); }
}
async function redeemCoupon(id) {
  if (!confirm("تأكيد استبدال الكوبون؟")) return;
  try { await api("POST", `/api/coupons/${id}/redeem`, {}); showTab("coupons"); }
  catch (e) { alert(e.message); }
}

// ---------------- حاسبة السباك ----------------
let calcLines = [];
async function vCalc() {
  const techs = await api("GET", "/api/users").catch(() => ({ users: [] }));
  const techList = (techs.users || []).filter(u => u.role === "technician");
  return `<div class="card"><h2>🧮 حساب السباك (للمندوب فقط)</h2>
    <p class="muted">المواسير بالمتر — القطع بالقطعة — الأبيض والجوان 5% بعد خصم 18% — المعزول بنسبة اللستة أو +10% — الكرنك = قطعة لحام 4/3 (1.5 ج)</p>
    <div class="searchbox"><input id="calcSearch" placeholder="ابحث في اللستة: كوع 4/3، ماسورة 25..."><button class="btn" onclick="calcSearch()">بحث</button></div>
    <div id="calcResults" class="mt"></div>
    <h3>بنود الحساب</h3>
    <div id="calcLines"><p class="muted">لا توجد بنود بعد</p></div>
    <div class="row mt">
      <select id="calcTech">${techList.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select>
      <label><input type="checkbox" id="calcCoupon" checked style="width:auto"> عمل كوبون بقيمة الحساب للفني</label>
    </div>
    <div id="calcTotal" class="mt"></div>
    <button class="btn green mt" onclick="saveJob()">💾 حفظ الحساب وإضافة النقاط</button>
  </div>
  <div class="card"><h3>جدول المصنعية المعتمد</h3><table>
    <tr><th>البند</th><th>الأجرة</th></tr>
    <tr><td>ماسورة 4/3 (25مم)</td><td>16 ج / متر</td></tr>
    <tr><td>ماسورة لحام بوصة (32مم)</td><td>30 ج / متر</td></tr>
    <tr><td>ماسورة لحام 1.5 (50مم)</td><td>50 ج / متر</td></tr>
    <tr><td>قطعة لحام 4/3</td><td>1.5 ج</td></tr>
    <tr><td>قطعة بسن</td><td>9.5 ج</td></tr>
    <tr><td>قطعة لحام البوصة</td><td>2.25 ج</td></tr>
    <tr><td>قطعة لحام 1.5</td><td>2.70 ج</td></tr>
    <tr><td>أي قطعة لحام 2 بوصة (63مم)</td><td>15 ج</td></tr>
    <tr><td>محبس دفن</td><td>55 ج</td></tr>
    <tr><td>كرنك قصير / طويل 4/3</td><td>1.5 ج (كقطعة لحام 4/3)</td></tr>
    <tr><td>أبيض / جوان</td><td>سعر اللستة × 0.82 × 5%</td></tr>
    <tr><td>معزول</td><td>نسبة المعزول/الأخضر من اللستة أو +10%</td></tr>
    <tr><td>النقاط</td><td>25% من الأجرة — المواسير 1.5% فقط — النقطة = 1 ج</td></tr>
  </table></div>`;
}
async function calcSearch() {
  const q = $("#calcSearch").value.trim();
  const r = await api("GET", `/api/catalog?q=${encodeURIComponent(q)}`);
  $("#calcResults").innerHTML = r.items.slice(0, 20).map(i => `
    <div class="row" style="border-bottom:1px solid var(--line);padding:8px 0">
      <div><b>${esc(i.name)}</b> ${esc(i.size)} ${i.insulated ? '<span class="badge amber">معزول</span>' : ""}<br>
      <span class="muted">${SECTION_AR[i.section]} — ${fmt(i.price)} ج${i.unit === "meter" ? "/متر" : ""}</span></div>
      <input type="number" id="qty${i.id}" value="1" min="0.5" step="0.5" style="max-width:90px" placeholder="${i.unit === "meter" ? "متر" : "قطعة"}">
      <button class="btn small" onclick="calcAdd(${i.id})">+ إضافة</button>
    </div>`).join("") || `<p class="muted">لا نتائج</p>`;
}
function calcAdd(id) {
  const qty = +($("#qty" + id).value || 1);
  const ex = calcLines.find(l => l.catalogId === id);
  if (ex) ex.qty += qty; else calcLines.push({ catalogId: id, qty });
  refreshCalc();
}
async function refreshCalc() {
  if (!calcLines.length) { $("#calcLines").innerHTML = `<p class="muted">لا توجد بنود بعد</p>`; $("#calcTotal").innerHTML = ""; return; }
  const r = await api("POST", "/api/plumber-jobs/preview", { items: calcLines });
  $("#calcLines").innerHTML = `<table><tr><th>البند</th><th>الكمية</th><th>الأجرة</th><th></th></tr>${r.lines.map((l, i) => `<tr><td>${esc(l.name)} ${esc(l.size)} ${l.insulated ? "🔶" : ""}<br><span class="muted">${l.multNote || ""}</span></td><td>${l.qty} ${l.unit === "meter" ? "متر" : "قطعة"}</td><td>${fmt(l.labor)} ج</td><td><button class="btn small danger" onclick="calcRemove(${i})">✕</button></td></tr>`).join("")}</table>`;
  $("#calcTotal").innerHTML = `<div class="stat"><b>${fmt(r.laborTotal)} ج</b><span>إجمالي أجرة السباك — النقاط: ${fmt(r.points)} نقطة</span></div>`;
}
function calcRemove(i) { calcLines.splice(i, 1); refreshCalc(); }
async function saveJob() {
  try {
    const j = await api("POST", "/api/plumber-jobs", { technicianId: +$("#calcTech").value, items: calcLines, makeCoupon: $("#calcCoupon").checked });
    alert(`تم الحفظ ✅\nأجرة السباك: ${j.job.laborTotal} ج\nالنقاط: ${j.job.points} نقطة${j.coupon ? `\nكوبون: ${j.coupon.code} بقيمة ${j.coupon.value} ج` : ""}`);
    calcLines = []; showTab("calc");
  } catch (e) { alert(e.message); }
}

// ---------------- عروضي ونقاطي (فني) ----------------
async function vOffers() {
  const [jobs, me] = await Promise.all([api("GET", "/api/plumber-jobs"), api("GET", "/api/me")]);
  return `<div class="card"><h2>⭐ عروضي ونقاطي</h2>
    <div class="stat"><b>${fmt(me.user.points)}</b><span>رصيد نقاطك (النقطة = 1 ج)</span></div>
    <h3 class="mt">عروض السباك الخاصة بي</h3>
    ${jobs.jobs.map(j => `<div class="coupon"><b>عرض #${j.id}</b> — أجرة ${fmt(j.labor_total)} ج — نقاط ${fmt(j.points)} ${j.coupon_code ? `— كوبون: <code>${esc(j.coupon_code)}</code>` : ""}<br><span class="muted">${esc(j.created_at.slice(0, 16))}</span><pre class="lines">${j.items.map(i => `${i.qty} ${i.unit === "meter" ? "متر" : "قطعة"} ${i.name} ${i.size} — ${fmt(i.labor)} ج`).join("\n")}</pre></div>`).join("") || `<p class="muted">لا توجد عروض بعد</p>`}
  </div>`;
}

// ---------------- الأسعار ----------------
async function vPrices() {
  const c = await api("GET", "/api/company");
  return `<div class="card"><h2>🏷️ لستة الأسعار</h2>
    <div class="searchbox"><input id="priceQ" placeholder="ابحث: كوع، ماسورة 25، بلاعة..."><button class="btn" onclick="priceSearch()">بحث</button></div>
    <div class="row mt"><select id="priceSec" onchange="priceSearch()">
      <option value="">كل الأقسام</option>
      <option value="gasket">الجوان PPH</option><option value="ppr">البولي PPR</option>
      <option value="white">الأبيض uPVC</option><option value="other">منتجات أخرى</option></select></div>
    <div id="priceResults" class="mt"><p class="muted">اكتب كلمة للبحث أو اختر قسمًا</p></div></div>
  <div class="card"><h2>🏢 بيانات الشركة</h2>
    <p><b>${esc(c.company.name)}</b> — ${esc(c.company.tagline)}</p>
    <p>📞 ${esc(c.company.phone)} &nbsp; 📍 ${esc(c.company.address)}<br>🌐 ${esc(c.company.website)} &nbsp; 🛡️ ${esc(c.company.warranty)} — ${esc(c.company.slogan)}</p>
    <h3>الشهادات</h3>
    ${c.certificates.map(x => `<div class="flag"><b>${esc(x.title)}</b> — ${esc(x.issuer)} ${x.no ? `(${esc(x.no)})` : ""}<br>${esc(x.details)}</div>`).join("")}
    <p><span class="badge green">ISO Certified</span> <span class="badge blue">ضمان 50 سنة</span></p></div>`;
}
async function priceSearch() {
  const q = $("#priceQ").value.trim(), s = $("#priceSec").value;
  const r = await api("GET", `/api/catalog?q=${encodeURIComponent(q)}&section=${s}`);
  $("#priceResults").innerHTML = `<p class="muted">${r.count} بند</p><table><tr><th>الصنف</th><th>المقاس</th><th>السعر</th></tr>${r.items.map(i => `<tr><td>${esc(i.name)} ${i.insulated ? '<span class="badge amber">معزول</span>' : ""}<br><span class="muted">${SECTION_AR[i.section]}</span></td><td>${esc(i.size)}</td><td>${fmt(i.price)} ج${i.unit === "meter" ? "/متر" : ""}</td></tr>`).join("")}</table>`;
}

// ---------------- خط السير ----------------
async function vRoute() {
  const r = await api("GET", "/api/route");
  const report = ME.role === "admin" ? await api("GET", "/api/route/report").catch(() => null) : null;
  let h = `<div class="card"><h2>🗺️ خط سير المندوب — أسبوع ${esc(r.week)}</h2>
    <p class="muted">يتحدث تلقائيًا كل أسبوع — الأماكن غير المزارة تظهر مميزة وتتقدم الأسبوع التالي</p>`;
  if (report) h += `<div class="grid"><div class="stat"><b>${report.visited}/${report.merchantsTotal}</b><span>زيارات تمت هذا الأسبوع</span></div>
    <div class="stat"><b>${report.invoicesWeek}</b><span>فواتير هذا الأسبوع</span></div>
    <div class="stat"><b>${fmt(report.invoicesTotal)} ج</b><span>مسحوبات الأسبوع</span></div></div>`;
  for (const day of r.days) {
    h += `<h3>${day}</h3>`;
    const list = r.plan[day] || [];
    h += list.map(p => {
      const v = r.visits[`${day}:${p.merchantId}`] || {};
      return `<div class="card" style="margin-bottom:8px;${p.priority ? "border:2px solid var(--amber);background:#FFFBEB" : ""}">
        <b>${esc(p.name)}</b> — <span class="muted">${esc(p.area)} — ${esc(p.address)}</span>
        ${p.priority ? `<span class="badge amber">⚠️ ${esc(p.priority)}</span>` : ""}
        ${v.done ? `<span class="badge green">✅ تمت الزيارة</span>` : `<span class="badge red">لم تُزر بعد</span>`}
        <div class="row mt">
          <button class="btn small green" onclick="markVisit('${r.week}',${p.merchantId},'${day}',true)">✅ تسجيل وصول</button>
          <input id="note-${day}-${p.merchantId}" placeholder="ملاحظة الزيارة..." value="${esc(v.note || "")}">
          <button class="btn small" onclick="saveNote('${r.week}',${p.merchantId},'${day}')">حفظ الملاحظة</button>
        </div></div>`;
    }).join("") || `<p class="muted">لا توجد أماكن هذا اليوم</p>`;
  }
  return h + `</div>`;
}
async function markVisit(week, merchantId, day, done) {
  try { await api("POST", "/api/route/visit", { week, merchantId, day, done, checkin: true }); showTab("route"); }
  catch (e) { alert(e.message); }
}
async function saveNote(week, merchantId, day) {
  try { await api("POST", "/api/route/visit", { week, merchantId, day, done: false, note: $("#note-" + day + "-" + merchantId).value }); alert("تم حفظ الملاحظة"); }
  catch (e) { alert(e.message); }
}

// ---------------- الفواتير ----------------
async function vInvoices() {
  const isRep = ME.role === "salesrep" || ME.role === "admin";
  const [inv, merch] = await Promise.all([api("GET", "/api/invoices"), isRep ? api("GET", "/api/merchants") : { merchants: [] }]);
  let h = "";
  if (isRep) h += `<div class="card"><h2>🧾 فاتورة جديدة للتاجر</h2>
    <select id="invMerchant">${merch.merchants.map(m => `<option value="${m.id}">${esc(m.name)} — ${esc(m.area)}</option>`).join("")}</select>
    <textarea id="invText" rows="5" class="mt" placeholder="اكتب كل بند في سطر، مثال:&#10;5 كوع 2 بوصة&#10;20 م ماسورة 4 جوان&#10;3 ماسورة 1 بوصة أبيض"></textarea>
    <p class="muted">النظام يعرف أطوال المواسير: الأخضر والمعزول 4م، الأبيض 6م، الجوان 3م — اكتب بالماسورة أو بالمتر وهيتحسب أوتوماتيك مع خصم القسم (بولي 20%، أبيض 18%)</p>
    <div class="row"><button class="btn" onclick="parseInvoice()">حساب الفاتورة</button></div>
    <div id="invPreview" class="mt"></div></div>`;
  h += `<div class="card"><h2>الفواتير</h2>${inv.invoices.map(v => `
    <div class="coupon"><b>فاتورة #${v.id}</b> — ${esc(v.merchant_name)} — قبل الخصم ${fmt(v.total_before)} ج — <b>بعد الخصم ${fmt(v.total_after)} ج</b>
    <span class="muted">${esc(v.created_at.slice(0, 16))}</span>
    <button class="btn small" onclick='shareWA(${JSON.stringify(v)})'>📲 واتساب</button>
    <pre class="lines">${v.lines.map(l => `${l.qty} ${l.item.name} ${l.item.size} — ${fmt(l.priceAfter)} ج${l.note ? " (" + l.note + ")" : ""}`).join("\n")}</pre></div>`).join("") || `<p class="muted">لا توجد فواتير</p>`}</div>`;
  return h;
}
let lastInvoice = null;
async function parseInvoice() {
  try {
    const r = await api("POST", "/api/invoices/parse", { text: $("#invText").value });
    lastInvoice = r;
    $("#invPreview").innerHTML = `<table><tr><th>البند</th><th>الكمية</th><th>قبل الخصم</th><th>بعد الخصم</th></tr>
      ${r.lines.map(l => `<tr><td>${l.error ? `<span style="color:red">${esc(l.raw)} — ${esc(l.error)}</span>` : `${esc(l.item.name)} ${esc(l.item.size)}`}${l.note ? `<br><span class="muted">${esc(l.note)}</span>` : ""}</td><td>${l.effQty ?? l.qty}</td><td>${fmt(l.priceBefore || 0)}</td><td>${fmt(l.priceAfter || 0)}</td></tr>`).join("")}</table>
      <div class="stat mt"><b>${fmt(r.totalAfter)} ج</b><span>الإجمالي بعد الخصم (قبل الخصم ${fmt(r.totalBefore)} ج)</span></div>
      <button class="btn green mt" onclick="saveInvoice()">💾 حفظ الفاتورة في مسحوبات التاجر</button>`;
  } catch (e) { alert(e.message); }
}
async function saveInvoice() {
  try {
    const j = await api("POST", "/api/invoices", { merchantId: +$("#invMerchant").value, text: $("#invText").value });
    alert(`تم حفظ الفاتورة #${j.invoice.id} — ${fmt(j.invoice.totalAfter)} ج`);
    showTab("invoices");
  } catch (e) { alert(e.message); }
}
function shareWA(v) {
  const text = `فاتورة جاد ثيرم #${v.id}\n${v.merchant_name}\n` + v.lines.map(l => `${l.qty} ${l.item.name} ${l.item.size} — ${l.priceAfter} ج`).join("\n") + `\nالإجمالي بعد الخصم: ${v.total_after} ج`;
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

// ---------------- التجار ----------------
async function vMerchants() {
  const r = await api("GET", "/api/merchants");
  return `<div class="card"><h2>🏪 التجار</h2>
    <div class="row"><input id="mName" placeholder="اسم التاجر"><input id="mArea" placeholder="المنطقة"><input id="mAddr" placeholder="العنوان"><button class="btn" onclick="addMerchant()">+ إضافة تاجر</button></div>
    ${r.merchants.map(m => `<div class="coupon"><b>${esc(m.name)}</b> — ${esc(m.area)} — ${esc(m.address)}
    <br><span class="muted">مسحوبات: ${m.withdrawals} فاتورة — إجمالي ${fmt(m.totalWithdrawn)} ج</span>
    <button class="btn small" onclick="merchantDetail(${m.id})">عرض المسحوبات</button></div>`).join("")}
    <div id="mDetail"></div></div>`;
}
async function addMerchant() {
  try { await api("POST", "/api/merchants", { name: $("#mName").value, area: $("#mArea").value, address: $("#mAddr").value }); showTab("merchants"); }
  catch (e) { alert(e.message); }
}
async function merchantDetail(id) {
  const r = await api("GET", `/api/merchants/${id}`);
  $("#mDetail").innerHTML = `<h3>مسحوبات ${esc(r.merchant.name)}</h3>${r.invoices.map(v => `<div>فاتورة #${v.id} — ${fmt(v.total_after)} ج — ${esc(v.created_at.slice(0, 10))}</div>`).join("") || `<p class="muted">لا توجد مسحوبات</p>`}`;
}

// ---------------- المستخدمون (أدمن) ----------------
async function vUsers() {
  const r = await api("GET", "/api/users");
  return `<div class="card"><h2>👥 المستخدمون</h2>
    <div class="row"><input id="uUser" placeholder="اسم المستخدم"><input id="uName" placeholder="الاسم"><input id="uPass" placeholder="كلمة المرور">
    <select id="uRole"><option value="distributor">موزع</option><option value="merchant">تاجر</option><option value="technician">فني</option><option value="salesrep">مندوب</option><option value="admin">أدمن</option></select>
    <button class="btn" onclick="addUser()">+ إضافة مستخدم</button></div>
    <table class="mt"><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>النقاط</th></tr>
    ${r.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${ROLE_AR[u.role] || u.role}</td><td>${fmt(u.points)}</td></tr>`).join("")}</table></div>`;
}
async function addUser() {
  try { await api("POST", "/api/users", { username: $("#uUser").value, name: $("#uName").value, password: $("#uPass").value, role: $("#uRole").value }); showTab("users"); }
  catch (e) { alert(e.message); }
}

// ---------------- حسابي ----------------
async function vAccount() {
  return `<div class="card"><h2>👤 حسابي</h2>
    <p>الاسم: <b>${esc(ME.name)}</b> — الدور: ${ROLE_AR[ME.role]} — اسم المستخدم: <code>${esc(ME.username)}</code></p>
    <p>العنوان: ${esc(ME.address || "—")}</p>
    <h3>تغيير كلمة المرور</h3>
    <input id="pwCur" type="password" placeholder="كلمة المرور الحالية" class="mb">
    <input id="pwNew" type="password" placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)" class="mb">
    <button class="btn" onclick="changePw()">تغيير كلمة المرور</button>
    <h3 class="mt">تعديل العنوان</h3>
    <input id="myAddr" value="${esc(ME.address || "")}" placeholder="العنوان">
    <button class="btn mt" onclick="saveAddr()">حفظ العنوان</button>
    <div id="accMsg" class="mt"></div></div>`;
}
async function changePw() {
  try { await api("POST", "/api/me/password", { current: $("#pwCur").value, next: $("#pwNew").value }); $("#accMsg").innerHTML = `<div class="flag" style="background:#dff3e6">تم تغيير كلمة المرور ✅</div>`; }
  catch (e) { alert(e.message); }
}
async function saveAddr() {
  try { await api("POST", "/api/me/address", { address: $("#myAddr").value }); ME.address = $("#myAddr").value; alert("تم حفظ العنوان"); }
  catch (e) { alert(e.message); }
}

// ---------------- بحث صوتي ----------------
let recog = null;
function toggleMic() { $("#micModal").classList.remove("hidden"); }
function closeMic() { $("#micModal").classList.add("hidden"); if (recog) { try { recog.stop(); } catch {} } $("#micBtn").classList.remove("rec"); }
function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const st = $("#micStatus");
  if (!SR) { st.textContent = "المتصفح لا يدعم البحث الصوتي — اكتب سؤالك في الخانة."; return; }
  recog = new SR(); recog.lang = "ar-EG"; recog.interimResults = false; recog.maxAlternatives = 1;
  $("#micBtn").classList.add("rec");
  st.innerHTML = `<span class="mic-live">🎙️ بتسمع... تكلم دلوقتي</span>`;
  recog.onresult = (e) => { $("#voiceText").value = e.results[0][0].transcript; runVoiceSearch(); };
  recog.onerror = (e) => { st.textContent = "تعذر الاستماع: " + e.error; $("#micBtn").classList.remove("rec"); };
  recog.onend = () => $("#micBtn").classList.remove("rec");
  recog.start();
}
async function runVoiceSearch() {
  const q = $("#voiceText").value.trim();
  if (!q) return;
  try {
    const r = await api("POST", "/api/search", { q });
    $("#voiceResults").innerHTML = r.cards.map(c => `<div class="card" style="margin-bottom:8px"><b>${c.icon || ""} ${esc(c.title)}</b><pre class="lines">${esc(c.value)}</pre>${c.sub ? `<div class="muted">${esc(c.sub)}</div>` : ""}</div>`).join("");
  } catch (e) { $("#voiceResults").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// boot
(async () => {
  if (!TOKEN) return;
  try { const j = await api("GET", "/api/me"); ME = j.user; enter(); } catch { localStorage.removeItem("jt_token"); TOKEN = ""; }
})();
$("#loginPass")?.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
