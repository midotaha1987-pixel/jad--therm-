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
  buildTabs(); refreshBell(); showTab("home");
  // فتح رابط QR: ?coupon=CODE يعرض صفحة الاستبدال بعد الدخول
  const code = new URLSearchParams(location.search).get("coupon");
  if (code) setTimeout(() => showCouponLanding(code), 100);
}
function buildTabs() {
  const all = {
    home: ["🏠", "الرئيسية"], coupons: ["🎟️", "الكوبونات"], requests: ["📩", "طلبات الكوبونات"], calc: ["🧮", "حساب السباك"],
    offers: ["⭐", "عروضي ونقاطي"], prices: ["🏷️", "الأسعار"], route: ["🗺️", "خط السير"],
    invoices: ["🧾", "الفواتير"], merchants: ["🏪", "التجار"], users: ["👥", "المستخدمون"],
    reports: ["📊", "التقارير"], warranty: ["🛡️", "الضمان"], inspect: ["🏠", "معاينة الشقة"], account: ["👤", "حسابي"],
  };
  const byRole = {
    admin: ["home", "coupons", "requests", "calc", "prices", "route", "invoices", "merchants", "reports", "warranty", "inspect", "users", "account"],
    distributor: ["home", "coupons", "prices", "warranty", "account"],
    merchant: ["home", "coupons", "prices", "invoices", "warranty", "account"],
    technician: ["home", "coupons", "offers", "prices", "warranty", "inspect", "account"],
    salesrep: ["home", "calc", "requests", "prices", "route", "invoices", "merchants", "warranty", "inspect", "account"],
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
    else if (t === "requests") m.innerHTML = await vRequests();
    else if (t === "calc") m.innerHTML = await vCalc();
    else if (t === "offers") m.innerHTML = await vOffers();
    else if (t === "prices") m.innerHTML = await vPrices();
    else if (t === "route") m.innerHTML = await vRoute();
    else if (t === "invoices") m.innerHTML = await vInvoices();
    else if (t === "merchants") m.innerHTML = await vMerchants();
    else if (t === "users") m.innerHTML = await vUsers();
    else if (t === "reports") m.innerHTML = await vReports();
    else if (t === "warranty") m.innerHTML = await vWarranty();
    else if (t === "inspect") m.innerHTML = await vInspections();
    else if (t === "account") m.innerHTML = await vAccount();
    refreshPhotoBoxes();
    window.scrollTo(0, 0);
  } catch (e) { m.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; }
}

// ---------------- الكاميرا والمرفقات ----------------
function photoInputHTML(entityType, entityId) {
  return `<label class="btn small" style="cursor:pointer">📷 تصوير / إرفاق صورة
    <input type="file" accept="image/*" capture="environment" style="display:none" onchange="uploadPhoto('${entityType}', ${entityId}, this)">
  </label>`;
}
async function uploadPhoto(entityType, entityId, inputEl) {
  const f = inputEl.files && inputEl.files[0];
  if (!f) return;
  if (f.size > 8 * 1024 * 1024) { alert("الصورة كبيرة — أقصى 8 ميجا"); return; }
  try {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    const base64 = String(dataUrl).split(",")[1] || "";
    await api("POST", "/api/attachments", { entityType, entityId, kind: "photo", filename: f.name || "photo.jpg", mime: f.type || "image/jpeg", data: base64 });
    alert("تم حفظ الصورة ✅");
    refreshPhotoBoxes();
  } catch (e) { alert(e.message); }
  inputEl.value = "";
}
async function refreshPhotoBoxes() {
  for (const box of document.querySelectorAll(".photos[data-entity]")) {
    const [type, id] = box.dataset.entity.split(":");
    try {
      const r = await api("GET", `/api/attachments?entityType=${type}&entityId=${id}`);
      box.innerHTML = r.attachments.map(a => `<a href="${a.url}?token=${TOKEN}" target="_blank"><img src="${a.url}?token=${TOKEN}" alt="صورة" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line);margin:2px"></a>`).join("") || `<span class="muted">لا توجد صور بعد</span>`;
    } catch { box.innerHTML = ""; }
  }
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
const COUPON_STATUS_AR = { available: "متاح", partial: "متبقٍ جزئي", redeemed: "مستبدل بالكامل" };
async function vCoupons() {
  const [c, users] = await Promise.all([api("GET", "/api/coupons"), ME.role === "admin" || ME.role === "distributor" ? api("GET", "/api/users").catch(() => ({ users: [] })) : { users: [] }]);
  let h = "";
  if (ME.role === "admin") {
    h += `<div class="card"><h2>إنشاء كوبون (الأدمن فقط)</h2><div class="row">
      <input id="cpVal" type="number" placeholder="قيمة الكوبون بالجنيه">
      <input id="cpProd" placeholder="المنتج (اختياري)">
      <button class="btn" onclick="createCoupon()">إنشاء كوبون</button></div></div>`;
  }
  h += `<div class="card"><h2>الكوبونات</h2>${c.coupons.map(x => {
    const remaining = x.remaining_value != null ? x.remaining_value : x.value;
    const isOwner = x.owner_id === ME.id;
    return `<div class="coupon"><code>${esc(x.code)}</code> — <b>${fmt(x.value)} ج</b> ${x.product ? "— " + esc(x.product) : ""}
    <span class="badge ${x.status === "redeemed" ? "grey" : x.status === "partial" ? "amber" : "green"}">${COUPON_STATUS_AR[x.status] || x.status}</span>
    ${x.status === "partial" ? `<br>المتبقي: <b>${fmt(remaining)} ج</b> من ${fmt(x.value)} ج` : ""}
    ${x.status === "redeemed" && x.redeemed_value ? `<br>تم صرف: <b>${fmt(x.redeemed_value)} ج</b>` : ""}
    <div id="qr-${x.id}" class="mt"></div>
    <div class="row mt">
      <button class="btn small" onclick="showQr(${x.id})">🔳 QR</button>
      ${x.status !== "redeemed" && isOwner ? `<input type="number" id="redeemAmt${x.id}" value="${remaining}" min="1" max="${remaining}" step="1" style="max-width:120px" placeholder="مبلغ الصرف">
      <button class="btn small green" onclick="redeemCoupon(${x.id})">💰 صرف (كلي أو جزئي)</button>` : ""}
      ${x.status !== "redeemed" && (isOwner || ME.role === "admin") ? `<select id="sendTo${x.id}" style="max-width:220px">${users.users.filter(u => u.id !== ME.id).map(u => `<option value="${u.id}">${esc(u.name)} (${ROLE_AR[u.role]})</option>`).join("")}</select>
      <button class="btn small" onclick="sendCoupon(${x.id})">إرسال</button>
      <button class="btn small" onclick="shareCouponWA(${x.id}, '${esc(x.code)}', ${x.value}, ${remaining})">📲 واتساب</button>` : ""}
      ${ME.role === "admin" && x.status === "available" ? `<button class="btn small danger" onclick="deleteCoupon(${x.id}, '${esc(x.code)}')">🗑️ حذف</button>` : ""}
    </div></div>`;
  }).join("") || `<p class="muted">لا توجد كوبونات</p>`}</div>`;
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
async function showQr(id) {
  const box = $("#qr-" + id);
  if (!box) return;
  if (box.dataset.loaded) { box.innerHTML = ""; delete box.dataset.loaded; return; }
  try {
    const r = await api("GET", `/api/coupons/${id}/qr`);
    box.dataset.loaded = "1";
    box.innerHTML = `<img src="${r.qr}" alt="QR" style="width:180px;height:180px;background:#fff;padding:6px;border:1px solid var(--line);border-radius:8px">
    <div class="muted">امسح الكود لفتح صفحة استبدال الكوبون ${esc(r.code)}</div>
    <div class="muted" style="word-break:break-all">${esc(r.url)}</div>`;
  } catch (e) { alert(e.message); }
}
function waLink(phone, text) {
  const d = String(phone || "").replace(/\D/g, "");
  const intl = d ? (d.startsWith("00") ? d.slice(2) : d.startsWith("0") ? "20" + d.slice(1) : d) : "";
  return intl ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
async function shareCouponWA(id, code, value, remaining) {
  const sel = $("#sendTo" + id);
  let phone = "";
  if (sel) {
    try {
      const us = await api("GET", "/api/users");
      const u = (us.users || []).find(x => x.id === +sel.value);
      phone = u ? u.phone || "" : "";
    } catch {}
  }
  const r = await api("GET", `/api/coupons/${id}/qr`).catch(() => null);
  const text = `كوبون جاد ثيرم 🎟️\nالكود: ${code}\nالقيمة: ${value} ج${remaining < value ? `\nالمتبقي: ${remaining} ج` : ""}\nللاستبدال امسح QR أو افتح الرابط: ${r ? r.url : ""}`;
  window.open(waLink(phone, text), "_blank");
}
async function redeemCoupon(id) {
  const amtInput = $("#redeemAmt" + id) || $("#landAmt");
  const amount = amtInput ? +amtInput.value : undefined;
  if (amount != null && (!amount || amount <= 0)) { alert("أدخل مبلغًا صحيحًا للصرف"); return; }
  if (!confirm(amount ? `تأكيد صرف ${amount} ج من الكوبون؟` : "تأكيد استبدال الكوبون بالكامل؟")) return;
  try {
    const r = await api("POST", `/api/coupons/${id}/redeem`, amount != null ? { amount } : {});
    const d = r.redeemed || {};
    alert(`تم الصرف ${d.fully ? "بالكامل ✅" : "جزئيًا 💰"}\nالكوبون: ${d.code}\nالمبلغ المصروف: ${fmt(d.amount)} ج${d.valuePct > 0 ? `\nزيادة التأخير: +${d.valuePct}% (بعد ${d.days} يوم)` : ""}\nالمبلغ المستلم: ${fmt(d.payout)} ج${d.extraPoints > 0 ? `\nزيادة النقاط: +${fmt(d.extraPoints)} نقطة (+${d.pointsPct}%)` : ""}\nالمتبقي في الكوبون: ${fmt(d.remaining)} ج`);
    showTab("coupons");
  } catch (e) { alert(e.message); }
}
async function deleteCoupon(id, code) {
  if (!confirm(`حذف الكوبون ${code} نهائيًا؟ لا يمكن التراجع.`)) return;
  try { await api("DELETE", `/api/coupons/${id}`); showTab("coupons"); }
  catch (e) { alert(e.message); }
}

// ---------------- طلبات الكوبونات ----------------
async function vRequests() {
  const r = await api("GET", "/api/coupon-requests");
  const STATUS_AR = { pending: "⏳ معلّق", approved: "✅ معتمد", rejected: "❌ مرفوض" };
  return `<div class="card"><h2>📩 طلبات الكوبونات</h2>
    <p class="muted">حفظ شغل سباك ينشئ تلقائيًا طلب كوبون للأدمن — وقيمة الكوبون = أجرة السباك كاملة المحسوبة بنفس معادلة الحاسبة.</p>
    ${r.requests.map(x => `<div class="coupon"><b>طلب #${x.id}</b> — عرض سباك #${x.job_id} — الفني: ${esc(x.technician?.name || "")} — المندوب: ${esc(x.requestedBy?.name || "")}
    <span class="badge ${x.status === "pending" ? "amber" : x.status === "approved" ? "green" : "grey"}">${STATUS_AR[x.status] || x.status}</span>
    <br>أجرة السباك: <b>${fmt(x.laborTotal)} ج</b> — قيمة الكوبون: <b>${fmt(x.value)} ج</b>
    ${x.coupon ? `<br>الكوبون: <code>${esc(x.coupon.code)}</code> — ${fmt(x.coupon.value)} ج` : ""}
    ${x.note ? `<br><span class="muted">ملاحظة: ${esc(x.note)}</span>` : ""}
    <pre class="lines">${x.items.map(i => `${i.qty} ${i.unit === "meter" ? "متر" : "قطعة"} ${i.name} ${i.size} — ${fmt(i.labor)} ج`).join("\n")}</pre>
    ${x.status === "pending" && ME.role === "admin" ? `<div class="row mt"><button class="btn small green" onclick="approveRequest(${x.id})">✅ اعتماد وإصدار الكوبون (${fmt(x.value)} ج)</button><button class="btn small danger" onclick="rejectRequest(${x.id})">❌ رفض</button></div>` : ""}
    <div class="muted">${esc(x.created_at.slice(0, 16))}</div></div>`).join("") || `<p class="muted">لا توجد طلبات كوبونات</p>`}</div>`;
}
async function approveRequest(id) {
  if (!confirm("اعتماد الطلب وإصدار الكوبون بقيمة أجرة السباك كاملة؟")) return;
  try { const j = await api("POST", `/api/coupon-requests/${id}/approve`, {}); alert(`تم الاعتماد ✅\nالكوبون: ${j.coupon.code}\nالقيمة: ${j.coupon.value} ج`); showTab("requests"); }
  catch (e) { alert(e.message); }
}
async function rejectRequest(id) {
  const note = prompt("سبب الرفض (اختياري):", "") || "";
  try { await api("POST", `/api/coupon-requests/${id}/reject`, { note }); showTab("requests"); }
  catch (e) { alert(e.message); }
}

// ---------------- الإشعارات ----------------
async function refreshBell() {
  try {
    const r = await api("GET", "/api/notifications");
    const b = $("#bellBadge");
    if (r.unread > 0) { b.textContent = r.unread; b.classList.remove("hidden"); }
    else b.classList.add("hidden");
  } catch {}
}
async function showNotifications() {
  const m = $("#main");
  m.innerHTML = `<div class="card center muted">جاري التحميل...</div>`;
  try {
    const r = await api("GET", "/api/notifications");
    m.innerHTML = `<div class="card"><h2>🔔 الإشعارات</h2>${r.notifications.map(n => `<div class="coupon" style="${n.is_read ? "opacity:.65" : ""}"><b>${esc(n.title)}</b><br>${esc(n.body)}<br><span class="muted">${esc(n.created_at.slice(0, 16))}</span></div>`).join("") || `<p class="muted">لا توجد إشعارات</p>`}</div>`;
    await api("POST", "/api/notifications/read", {});
    refreshBell();
  } catch (e) { m.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; }
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
    </div>
    <p class="muted mt">عند الحفظ يتبعت تلقائيًا "طلب كوبون" للأدمن بقيمة أجرة السباك كاملة — والأدمن يعتمد الطلب فيصدر الكوبون للفني.</p>
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
    const j = await api("POST", "/api/plumber-jobs", { technicianId: +$("#calcTech").value, items: calcLines });
    alert(`تم الحفظ ✅\nأجرة السباك: ${j.job.laborTotal} ج\nالنقاط: ${j.job.points} نقطة\n📩 تم إرسال طلب كوبون #${j.couponRequest.id} للأدمن بقيمة ${j.couponRequest.value} ج — في انتظار الاعتماد`);
    calcLines = []; showTab("calc");
  } catch (e) { alert(e.message); }
}

// ---------------- عروضي ونقاطي (فني) ----------------
async function vOffers() {
  const [jobs, me] = await Promise.all([api("GET", "/api/plumber-jobs"), api("GET", "/api/me")]);
  return `<div class="card"><h2>⭐ عروضي ونقاطي</h2>
    <div class="stat"><b>${fmt(me.user.points)}</b><span>رصيد نقاطك (النقطة = 1 ج)</span></div>
    <h3 class="mt">عروض السباك الخاصة بي</h3>
    ${jobs.jobs.map(j => `<div class="coupon"><b>عرض #${j.id}</b> — أجرة ${fmt(j.labor_total)} ج — نقاط ${fmt(j.points)} ${j.coupon_code ? `— كوبون: <code>${esc(j.coupon_code)}</code>` : ""}<br><span class="muted">${esc(j.created_at.slice(0, 16))}</span><pre class="lines">${j.items.map(i => `${i.qty} ${i.unit === "meter" ? "متر" : "قطعة"} ${i.name} ${i.size} — ${fmt(i.labor)} ج`).join("\n")}</pre>
    <div class="row mt">${photoInputHTML("job", j.id)}</div>
    <div class="photos mt" data-entity="job:${j.id}"></div></div>`).join("") || `<p class="muted">لا توجد عروض بعد</p>`}
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
          ${v.id ? photoInputHTML("visit", v.id) : `<span class="muted">سجّل الوصول أولًا لإرفاق صور</span>`}
        </div>
        ${v.id ? `<div class="photos mt" data-entity="visit:${v.id}"></div>` : ""}</div>`;
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
    <div class="row mt"><button class="btn small" onclick='shareInvoiceWA(${JSON.stringify(v)})'>📲 واتساب</button>${photoInputHTML("invoice", v.id)}</div>
    <div class="photos mt" data-entity="invoice:${v.id}"></div>
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
function shareInvoiceWA(v) {
  const text = `فاتورة جاد ثيرم #${v.id}\n${v.merchant_name}\n` + v.lines.map(l => `${l.qty} ${l.item.name} ${l.item.size} — ${l.priceAfter} ج`).join("\n") + `\nالإجمالي بعد الخصم: ${v.total_after} ج`;
  window.open(waLink(v.merchant_phone || "", text), "_blank");
}
function shareWA(v) { shareInvoiceWA(v); }

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
    <div id="userEditBox" class="mt"></div>
    <table class="mt"><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>العنوان</th><th>التليفون</th><th>النقاط</th><th></th></tr>
    ${r.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${ROLE_AR[u.role] || u.role}</td><td>${esc(u.address || "—")}</td><td>${esc(u.phone || "—")}</td><td>${fmt(u.points)}</td><td><button class="btn small" onclick="editUserForm(${u.id}, ${JSON.stringify(u.name)}, ${JSON.stringify(u.company || "")}, ${JSON.stringify(u.address || "")}, ${JSON.stringify(u.phone || "")})">تعديل</button></td></tr>`).join("")}</table></div>`;
}
async function addUser() {
  try { await api("POST", "/api/users", { username: $("#uUser").value, name: $("#uName").value, password: $("#uPass").value, role: $("#uRole").value }); showTab("users"); }
  catch (e) { alert(e.message); }
}
function editUserForm(id, name, company, address, phone) {
  $("#userEditBox").innerHTML = `<div class="card" style="background:#F0F6FF"><h3>تعديل بيانات المستخدم</h3>
    <div class="row"><input id="euName" value="${esc(name)}" placeholder="الاسم"><input id="euCompany" value="${esc(company)}" placeholder="الشركة / المحل"></div>
    <div class="row mt"><input id="euAddress" value="${esc(address)}" placeholder="العنوان"><input id="euPhone" value="${esc(phone)}" placeholder="رقم التليفون"></div>
    <div class="row mt"><button class="btn green" onclick="saveUserEdit(${id})">💾 حفظ التعديلات</button></div></div>`;
  window.scrollTo(0, 0);
}
async function saveUserEdit(id) {
  try {
    await api("PUT", `/api/users/${id}`, { name: $("#euName").value, company: $("#euCompany").value, address: $("#euAddress").value, phone: $("#euPhone").value });
    alert("تم حفظ التعديلات ✅"); showTab("users");
  } catch (e) { alert(e.message); }
}

// ---------------- حسابي ----------------
async function vAccount() {
  return `<div class="card"><h2>👤 حسابي</h2>
    <p>الاسم: <b>${esc(ME.name)}</b> — الدور: ${ROLE_AR[ME.role]} — اسم المستخدم: <code>${esc(ME.username)}</code></p>
    <p>العنوان: ${esc(ME.address || "—")} — التليفون: ${esc(ME.phone || "—")}</p>
    <h3>تغيير كلمة المرور</h3>
    <input id="pwCur" type="password" placeholder="كلمة المرور الحالية" class="mb">
    <input id="pwNew" type="password" placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)" class="mb">
    <button class="btn" onclick="changePw()">تغيير كلمة المرور</button>
    <h3 class="mt">تعديل بيانات التواصل (العنوان والتليفون)</h3>
    <input id="myAddr" value="${esc(ME.address || "")}" placeholder="العنوان">
    <input id="myPhone" value="${esc(ME.phone || "")}" placeholder="رقم التليفون" class="mt">
    <button class="btn mt" onclick="saveContact()">حفظ العنوان والتليفون</button>
    <div id="accMsg" class="mt"></div></div>`;
}
async function changePw() {
  try { await api("POST", "/api/me/password", { current: $("#pwCur").value, next: $("#pwNew").value }); $("#accMsg").innerHTML = `<div class="flag" style="background:#dff3e6">تم تغيير كلمة المرور ✅</div>`; }
  catch (e) { alert(e.message); }
}
async function saveAddr() { saveContact(); }
async function saveContact() {
  try {
    const j = await api("POST", "/api/me/contact", { address: $("#myAddr").value, phone: $("#myPhone").value });
    ME.address = j.user.address; ME.phone = j.user.phone;
    alert("تم حفظ العنوان والتليفون ✅");
  } catch (e) { alert(e.message); }
}

// ---------------- التقارير (أدمن) ----------------
async function vReports() {
  const r = await api("GET", "/api/admin/reports");
  const d = r.report, t = d.totals;
  return `<div class="card"><h2>📊 تقارير الأدمن</h2>
    <p class="muted">تاريخ التقرير: ${esc(new Date(d.generatedAt).toLocaleString("ar-EG"))}</p>
    <div class="row">
      <button class="btn" onclick="exportReport('pdf')">📄 تصدير PDF</button>
      <button class="btn green" onclick="exportReport('xlsx')">📊 تصدير Excel</button>
      <button class="btn" onclick="shareReportWA()">📲 مشاركة واتساب</button>
    </div></div>
  <div class="card"><h3>الملخص العام</h3><div class="grid">
    <div class="stat"><b>${t.users}</b><span>مستخدمون</span></div>
    <div class="stat"><b>${t.coupons}</b><span>كوبونات (${t.couponsAvailable} متاح / ${t.couponsRedeemed} مستبدل)</span></div>
    <div class="stat"><b>${t.jobs}</b><span>حسابات سباك</span></div>
    <div class="stat"><b>${t.invoices}</b><span>فواتير — ${fmt(t.invoicesTotal)} ج</span></div>
    <div class="stat"><b>${fmt(t.pointsTotal)}</b><span>إجمالي النقاط</span></div></div></div>
  <div class="card"><h3>نشاط المندوب</h3><table><tr><th>المندوب</th><th>عروض سباك</th><th>أجرة السباك</th><th>فواتير</th><th>مسحوبات</th><th>طلبات كوبونات</th></tr>
    ${d.reps.map(x => `<tr><td>${esc(x.name)}</td><td>${x.jobs}</td><td>${fmt(x.labor)} ج</td><td>${x.invoices}</td><td>${fmt(x.invoicesTotal)} ج</td><td>${x.couponRequests}</td></tr>`).join("")}</table></div>
  <div class="card"><h3>ملخص التجار</h3><table><tr><th>التاجر</th><th>المنطقة</th><th>التليفون</th><th>فواتير</th><th>إجمالي المسحوبات</th></tr>
    ${d.merchants.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.area || "—")}</td><td>${esc(m.phone || "—")}</td><td>${m.invoices}</td><td>${fmt(m.total)} ج</td></tr>`).join("")}</table></div>
  <div class="card"><h3>الأصناف الأكثر طلبًا</h3><table><tr><th>الصنف</th><th>المقاس</th><th>القسم</th><th>الكمية</th></tr>
    ${d.topItems.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.size || "—")}</td><td>${esc(i.section)}</td><td>${i.qty}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">لا توجد بيانات كافية بعد</td></tr>`}</table></div>
  <div class="card"><h3>الأصناف الراكدة (بدون طلب)</h3><table><tr><th>الصنف</th><th>المقاس</th><th>القسم</th><th>السعر</th></tr>
    ${d.stagnant.slice(0, 50).map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.size || "—")}</td><td>${esc(i.section)}</td><td>${fmt(i.price)} ج</td></tr>`).join("")}</table>
    <p class="muted">إجمالي الراكدة: ${d.stagnant.length} صنف</p></div>`;
}
async function exportReport(kind) {
  try {
    const r = await fetch(`/api/admin/reports.${kind}`, { headers: { Authorization: "Bearer " + TOKEN } });
    if (!r.ok) throw new Error("تعذر التصدير");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `jad-therm-report-${new Date().toISOString().slice(0, 10)}.${kind}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { alert(e.message); }
}
async function shareReportWA() {
  try {
    const r = await api("GET", "/api/admin/reports");
    const d = r.report, t = d.totals;
    const text = `تقرير جاد ثيرم 📊\nالمستخدمون: ${t.users} — الكوبونات: ${t.coupons} (${t.couponsAvailable} متاح / ${t.couponsRedeemed} مستبدل)\nحسابات سباك: ${t.jobs} — فواتير: ${t.invoices} بإجمالي ${t.invoicesTotal} ج\nالأكثر طلبًا: ${d.topItems.slice(0, 3).map(i => `${i.name} ${i.size} (${i.qty})`).join("، ") || "لا توجد بيانات"}\nالأصناف الراكدة: ${d.stagnant.length} صنف`;
    window.open(waLink("", text), "_blank");
  } catch (e) { alert(e.message); }
}

// ---------------- الضمان ----------------
async function vWarranty() {
  const w = await api("GET", "/api/warranty");
  return `<div class="card"><h2>🛡️ ضمان جاد ثيرم — ${esc(w.warranty)}</h2>
    <p>${esc(w.warrantyText)}</p>
    <p><span class="badge green">ضمان 50 سنة</span> <span class="badge blue">ISO 9001:2015</span></p>
    <p class="muted">📞 ${esc(w.company.phone)} — 📍 ${esc(w.company.address)} — 🌐 ${esc(w.company.website)}</p></div>
  <div class="card"><h3>الشهادات</h3>
    ${w.certificates.map(x => `<div class="flag"><b>${esc(x.title)}</b> — ${esc(x.issuer)} ${x.no ? `(${esc(x.no)})` : ""}<br>${esc(x.details)}</div>`).join("")}</div>
  <div class="card"><h3>📁 مكتبة شهادات الضمان</h3>
    ${ME.role === "admin" ? `<div class="row"><input id="wfTitle" placeholder="عنوان الشهادة (مثال: شهادة ضمان شقة العميل أحمد)">
      <label class="btn small" style="cursor:pointer">📎 رفع ملف شهادة
        <input type="file" accept=".pdf,image/*" style="display:none" onchange="uploadWarrantyFile(this)"></label></div>` : ""}
    <div id="wfList" class="mt">${w.files.map(f => `<div class="coupon"><b>${esc(f.title)}</b> — <span class="muted">${esc(f.created_at.slice(0, 16))}</span><br>
      <a class="btn small" href="${f.url}?token=${TOKEN}" target="_blank">👁️ عرض الملف</a>
      <a class="btn small" href="${f.url}?token=${TOKEN}" download>⬇️ تحميل</a>
      ${ME.role === "admin" ? `<button class="btn small danger" onclick="deleteWarrantyFile(${f.id})">حذف</button>` : ""}
    </div>`).join("") || `<p class="muted">لا توجد شهادات محفوظة بعد</p>`}</div></div>`;
}
async function uploadWarrantyFile(inputEl) {
  const f = inputEl.files && inputEl.files[0];
  const title = $("#wfTitle").value.trim();
  if (!f) return;
  if (!title) { alert("اكتب عنوان الشهادة أولًا"); return; }
  if (f.size > 8 * 1024 * 1024) { alert("الملف كبير — أقصى 8 ميجا"); return; }
  try {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f);
    });
    await api("POST", "/api/warranty-files", { title, filename: f.name, mime: f.type || "", data: String(dataUrl).split(",")[1] || "" });
    alert("تم حفظ شهادة الضمان ✅"); showTab("warranty");
  } catch (e) { alert(e.message); }
  inputEl.value = "";
}
async function deleteWarrantyFile(id) {
  if (!confirm("حذف شهادة الضمان هذه؟")) return;
  try { await api("DELETE", `/api/warranty-files/${id}`); showTab("warranty"); }
  catch (e) { alert(e.message); }
}

// ---------------- معاينة الشقة ----------------
async function vInspections() {
  const [ins, wf, techs] = await Promise.all([
    api("GET", "/api/inspections"),
    api("GET", "/api/warranty-files").catch(() => ({ files: [] })),
    ME.role === "salesrep" || ME.role === "admin" ? api("GET", "/api/users").catch(() => ({ users: [] })) : { users: [] },
  ]);
  const techList = (techs.users || []).filter(u => u.role === "technician");
  return `<div class="card"><h2>🏠 معاينة الشقة</h2>
    <p class="muted">سجل معاينة لكل شقة: صور بالكاميرا + العنوان والموقع + الملاحظات + ربطها بشهادة الضمان الخاصة بالشقة.</p>
    <div class="row"><input id="inApt" placeholder="اسم الشقة / العميل *"><input id="inAddr" placeholder="العنوان *"></div>
    <div class="row mt"><input id="inLoc" placeholder="الموقع (مثال: المحلة — الشعبية، بجوار...)"><button class="btn small" onclick="getLocation()">📍 تحديد موقعي (GPS)</button></div>
    <div class="row mt"><input id="inNotes" placeholder="ملاحظات المعاينة...">
      ${techList.length ? `<select id="inTech"><option value="">الفني (اختياري)</option>${techList.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select>` : ""}
      <select id="inWf"><option value="">شهادة الضمان (اختياري)</option>${(wf.files || []).map(f => `<option value="${f.id}">${esc(f.title)}</option>`).join("")}</select></div>
    <div class="row mt"><button class="btn green" onclick="saveInspection()">💾 حفظ المعاينة</button></div>
    <div id="inMsg" class="mt"></div></div>
  <div class="card"><h3>المعاينات السابقة</h3>
    ${ins.inspections.map(x => `<div class="coupon"><b>${esc(x.apartment)}</b> — ${esc(x.address)} <span class="muted">${esc(x.created_at.slice(0, 16))} — بواسطة ${esc(x.createdByName)}</span>
    <br>${x.location ? `📍 ${esc(x.location)}<br>` : ""}${x.warranty ? `🛡️ شهادة الضمان: <b>${esc(x.warranty.title)}</b><br>` : ""}
    <span class="muted">الصور: ${x.photos} صورة</span>
    <div class="row mt"><button class="btn small" onclick="showInspection(${x.id})">عرض التفاصيل والصور</button>${photoInputHTML("inspection", x.id)}</div>
    <div class="photos mt" data-entity="inspection:${x.id}"></div>
    <div id="insp-${x.id}" class="mt"></div></div>`).join("") || `<p class="muted">لا توجد معاينات بعد</p>`}</div>`;
}
function getLocation() {
  if (!navigator.geolocation) { alert("المتصفح لا يدعم تحديد الموقع"); return; }
  navigator.geolocation.getCurrentPosition(
    (p) => { $("#inLoc").value = `GPS: ${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`; window._gps = { lat: p.coords.latitude, lng: p.coords.longitude }; },
    () => alert("تعذر تحديد الموقع — اكتب الموقع يدويًا"),
    { timeout: 10000 });
}
async function saveInspection() {
  const apt = $("#inApt").value.trim(), addr = $("#inAddr").value.trim();
  if (!apt || !addr) { alert("اسم الشقة والعنوان مطلوبان"); return; }
  try {
    const j = await api("POST", "/api/inspections", {
      apartment: apt, address: addr, location: $("#inLoc").value.trim(),
      lat: window._gps ? window._gps.lat : undefined, lng: window._gps ? window._gps.lng : undefined,
      notes: $("#inNotes").value.trim(),
      technicianId: $("#inTech") ? +$("#inTech").value || undefined : undefined,
      warrantyFileId: $("#inWf") ? +$("#inWf").value || undefined : undefined,
    });
    window._gps = null;
    $("#inMsg").innerHTML = `<div class="flag" style="background:#dff3e6">تم حفظ المعاينة #${j.id} ✅ — صوّر الشقة بالكاميرا من زر "تصوير / إرفاق صورة" أسفل المعاينة</div>`;
    showTab("inspect");
  } catch (e) { alert(e.message); }
}
async function showInspection(id) {
  try {
    const r = await api("GET", `/api/inspections/${id}`);
    const x = r.inspection;
    $("#insp-" + id).innerHTML = `<div class="card" style="background:#F0F6FF">
      <b>${esc(x.apartment)}</b> — ${esc(x.address)}<br>
      ${x.location ? `📍 الموقع: ${esc(x.location)}<br>` : ""}
      ${x.notes ? `📝 ملاحظات: ${esc(x.notes)}<br>` : ""}
      <span class="muted">التاريخ: ${esc(x.created_at.slice(0, 16))} — بواسطة: ${esc(x.createdByName)}${x.technicianName ? ` — الفني: ${esc(x.technicianName)}` : ""}</span><br>
      ${x.warranty ? `🛡️ شهادة الضمان المرتبطة: <b>${esc(x.warranty.title)}</b> <a class="btn small" href="${x.warranty.url}?token=${TOKEN}" target="_blank">عرض الشهادة</a><br>` : `<span class="muted">بدون شهادة ضمان مرتبطة</span><br>`}
      <div class="mt">${x.photos.map(p => `<a href="${p.url}?token=${TOKEN}" target="_blank"><img src="${p.url}?token=${TOKEN}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;margin:2px"></a>`).join("") || `<span class="muted">لا توجد صور</span>`}</div>
    </div>`;
  } catch (e) { alert(e.message); }
}

// ---------------- صفحة الاستبدال من مسح QR ----------------
async function showCouponLanding(code) {
  const m = $("#main");
  m.innerHTML = `<div class="card center muted">جاري تحميل الكوبون...</div>`;
  try {
    const r = await api("GET", `/api/coupons/by-code/${encodeURIComponent(code)}`);
    const c = r.coupon, b = r.bonus || {};
    m.innerHTML = `<div class="card"><h2>🎟️ استبدال كوبون ${esc(c.code)}</h2>
      <p>القيمة: <b>${fmt(c.value)} ج</b> — المتبقي: <b>${fmt(r.remaining)} ج</b> — الحالة: ${COUPON_STATUS_AR[c.status] || c.status}</p>
      <p class="muted">زيادة التأخير الحالية: +${b.valuePct || 0}% قيمة / +${b.pointsPct || 0}% نقاط (بعد ${b.days || 0} يوم من الإصدار)</p>
      ${c.status !== "redeemed" && c.owner_id === ME.id ? `
      <div class="row"><input type="number" id="landAmt" value="${r.remaining}" min="1" max="${r.remaining}" step="1" style="max-width:150px" placeholder="مبلغ الصرف">
      <button class="btn green" onclick="redeemCoupon(${c.id})">💰 صرف (كلي أو جزئي)</button></div>` : `<p class="muted">${c.status === "redeemed" ? "الكوبون مستبدل بالكامل" : "هذا الكوبون ليس ملكك"}</p>`}
      <div class="row mt"><button class="btn ghost" onclick="showTab('coupons')">عرض كل الكوبونات</button></div>
    </div>`;
  } catch (e) {
    m.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`;
  }
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
