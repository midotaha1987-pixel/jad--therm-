/**
 * جاد ثيرم — GAD THERM — Standalone App
 * Node.js + Express + SQLite (node:sqlite, built-in)
 * Arabic RTL, roles: admin / distributor / merchant / technician / salesrep
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const { convertArabic } = require("arabic-reshaper");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "jadtherm.db");
const CATALOG_PATH = path.join(__dirname, "data", "catalog.json");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// ---------------------------------------------------------------------------
// Business constants (from Rony / Jad price list 2026)
// ---------------------------------------------------------------------------
const LABOR = {
  pipe_25: 16, pipe_32: 30, pipe_50: 50,       // EGP per meter
  fit_weld_25: 1.5, fit_weld_32: 2.25, fit_weld_50: 2.7, fit_weld_63: 15,
  fit_thread: 9.5, valve_concealed: 55, crank: 1.5,
};
const PERCENT_RULE = { discount: 0.18, rate: 0.05 }; // white/gasket: price x0.82 x0.05
const INSULATED_FALLBACK = 1.10;                    // +10% when no list ratio
const POINTS = { normal: 0.25, pipe: 0.015 };       // 25% / pipes 1.5%
// كتالوج الهدايا — قيم النقاط النهائية المعتمدة من روني (2026-11-18)؛
// الهدية تُعرض مقابل عدد نقاطها فقط، بدون أي عمود أجرة.
const GIFTS = [
  { key: "scissors_small", name: "المقص البولي الصغير", points: 50, icon: "scissors" },
  { key: "scissors_big", name: "المقص البولي الكبير", points: 100, icon: "scissors" },
  { key: "tool_bag", name: "شنطة العدة", points: 150, icon: "bag" },
  { key: "welder_medium", name: "ماكينة لحام متوسطة", points: 300, icon: "welder" },
  { key: "welder_big", name: "ماكينة لحام كبيرة", points: 475, icon: "welder" },
  { key: "hilti", name: "هيلتي", points: 1625, icon: "drill" },
  { key: "umrah", name: "رحلة العمرة", points: 9500, icon: "mosque" },
  { key: "motorcycle", name: "موتوسيكل فيجوري VLR 200 CBF موديل 2026", points: 12500, icon: "motorcycle" },
];
// زيادة التأخير عند صرف الكوبون — متدرجة حسب المدة من الإصدار لحد الصرف (Rony 2026-11-17)
// قيمة الكوبون: شهر +5%، 3 شهور +10%، 6 شهور +15%، 9 شهور +20%، 12 شهر +25% (حد أقصى)
// النقاط: شهر +3%، 3 شهور +6%، 6 شهور +9%، 9 شهور +12%، 12 شهر +15% (حد أقصى)
const DELAY_BONUS = {
  value: [[365, 25], [270, 20], [180, 15], [90, 10], [30, 5]],   // [days, %]
  points: [[365, 15], [270, 12], [180, 9], [90, 6], [30, 3]],   // [days, %]
};
function delayBonus(issuedAt, now = new Date()) {
  const days = Math.max(0, Math.floor((now - new Date(issuedAt)) / 86400000));
  const pct = (table) => { for (const [d, p] of table) if (days >= d) return p; return 0; };
  return { days, valuePct: pct(DELAY_BONUS.value), pointsPct: pct(DELAY_BONUS.points) };
}
const PRICE_DISCOUNT = { ppr: 0.20, white: 0.18, gasket: 0, other: 0 };
const PIPE_LENGTH_M = { ppr: 4, white: 6, gasket: 3 }; // meters per pipe
const COMPANY = {
  name: "جاد ثيرم",
  tagline: "جاد ثيرم لأنظمة المياة والصرف الصحى",
  phone: "01559558978",
  address: "المحلة الكبرى — منشية البكري",
  factoryAddress: "15 شارع حسن عيسى — المحلة الكبرى — محافظة الغربية",
  website: "www.gadtherm.net",
  warranty: "ضمان 50 سنة",
  slogan: "قمة التكنولوجيا الألمانية",
};
const CERTIFICATES = [
  { title: "شهادة ISO 9001:2015", issuer: "EQUALITAS", no: "EG57300826.4",
    details: "تسجيل 30 أغسطس 2026 — إعادة تصديق 29 أغسطس 2029 — النطاق: مواسير ووصلات PPR وUPVC وPPH" },
  { title: "تقرير اختبار — المركز القومي لبحوث الإسكان والبناء", issuer: "معهد بحوث الهندسة الصحية والبيئية",
    no: "كود العينة PP 2250", details: "مواسير بولي بروبلين قطر 20مم PN20 — DIN 8077/8078 — استلام 2026/6/24 — اختبار 2026/7/20" },
  { title: "خطاب المركز القومي لبحوث الإسكان والبناء", issuer: "معهد بحوث الهندسة الصحية والبيئية",
    no: "قسيمة 758887", details: "عينة بولي بروبلين قطر 25مم PN20 — رسوم 3,640 جنيه — بتاريخ 1/7/2026 — صلاحية 6 شهور" },
  { title: "تقارير الهيئة المصرية العامة للمواصفات والجودة (EOS)", issuer: "EOS",
    no: "", details: "النتيجة: مطابقة" },
];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
  password_hash TEXT NOT NULL, salt TEXT NOT NULL,
  company TEXT DEFAULT '', address TEXT DEFAULT '', phone TEXT DEFAULT '',
  points REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY, section TEXT, name TEXT, size TEXT, unit TEXT,
  price REAL, insulated INTEGER DEFAULT 0, kind TEXT, labor_key TEXT, green_price REAL
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL,
  value REAL NOT NULL, product TEXT DEFAULT '', owner_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL, status TEXT DEFAULT 'available',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(owner_id) REFERENCES users(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT,
  amount REAL DEFAULT 0, note TEXT DEFAULT '', related_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS points_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, points REAL,
  reason TEXT DEFAULT '', job_id INTEGER, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS plumber_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, technician_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL, items_json TEXT NOT NULL, labor_total REAL NOT NULL,
  points REAL NOT NULL, coupon_code TEXT, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(technician_id) REFERENCES users(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS coupon_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL,
  technician_id INTEGER NOT NULL, requested_by INTEGER NOT NULL,
  labor_total REAL NOT NULL, value REAL NOT NULL, items_json TEXT NOT NULL,
  status TEXT DEFAULT 'pending', note TEXT DEFAULT '',
  coupon_id INTEGER, decided_by INTEGER, decided_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(job_id) REFERENCES plumber_jobs(id),
  FOREIGN KEY(technician_id) REFERENCES users(id), FOREIGN KEY(requested_by) REFERENCES users(id),
  FOREIGN KEY(coupon_id) REFERENCES coupons(id), FOREIGN KEY(decided_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS gift_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  gift_key TEXT NOT NULL, gift_name TEXT NOT NULL, points_cost REAL NOT NULL,
  status TEXT DEFAULT 'pending', note TEXT DEFAULT '',
  decided_by INTEGER, decided_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(decided_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  title TEXT NOT NULL, body TEXT DEFAULT '', type TEXT DEFAULT 'info',
  related_id INTEGER, is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, area TEXT DEFAULT '',
  address TEXT DEFAULT '', phone TEXT DEFAULT '', created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, merchant_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL, lines_json TEXT NOT NULL,
  total_before REAL NOT NULL, total_after REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(merchant_id) REFERENCES merchants(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS route_weeks (
  week_key TEXT PRIMARY KEY, plan_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, week_key TEXT NOT NULL, merchant_id INTEGER NOT NULL,
  day TEXT NOT NULL, done INTEGER DEFAULT 0, note TEXT DEFAULT '',
  checked_in_at TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
  kind TEXT DEFAULT 'photo', filename TEXT NOT NULL, mime TEXT DEFAULT '',
  size INTEGER DEFAULT 0, created_by INTEGER, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS warranty_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, filename TEXT NOT NULL,
  mime TEXT DEFAULT '', size INTEGER DEFAULT 0, uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(uploaded_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, apartment TEXT NOT NULL, address TEXT DEFAULT '',
  location TEXT DEFAULT '', lat REAL, lng REAL, notes TEXT DEFAULT '',
  created_by INTEGER NOT NULL, technician_id INTEGER,
  warranty_file_id INTEGER, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id), FOREIGN KEY(technician_id) REFERENCES users(id),
  FOREIGN KEY(warranty_file_id) REFERENCES warranty_files(id)
);
CREATE TABLE IF NOT EXISTS inspection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, inspection_id INTEGER NOT NULL,
  catalog_id INTEGER, name TEXT NOT NULL, size TEXT DEFAULT '', qty REAL NOT NULL DEFAULT 1,
  photo_filename TEXT DEFAULT '', note TEXT DEFAULT '',
  created_by INTEGER, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(inspection_id) REFERENCES inspections(id),
  FOREIGN KEY(catalog_id) REFERENCES catalog(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
`);

// ترحيل: أعمدة قيمة الصرف الفعلية على جدول الكوبونات (للنسخ القديمة من قاعدة البيانات)
for (const col of ["redeemed_value REAL", "redeemed_at TEXT", "remaining_value REAL"]) {
  const name = col.split(" ")[0];
  if (!db.prepare("SELECT 1 FROM pragma_table_info('coupons') WHERE name=?").get(name))
    db.exec(`ALTER TABLE coupons ADD COLUMN ${col}`);
}
// المتبقي الافتراضي: الكوبونات المستبدلة بالكامل متبقيها 0، والباقي قيمتها كاملة
db.exec("UPDATE coupons SET remaining_value = CASE WHEN status='redeemed' THEN 0 ELSE value END WHERE remaining_value IS NULL");
db.exec("UPDATE coupons SET status='partial' WHERE status='available' AND remaining_value IS NOT NULL AND remaining_value > 0 AND remaining_value < value");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hashPassword(pw, salt) {
  return crypto.scryptSync(pw, salt, 64).toString("hex");
}
function newUser(username, name, role, password, extra = {}) {
  const salt = crypto.randomBytes(16).toString("hex");
  const stmt = db.prepare(`INSERT INTO users (username,name,role,password_hash,salt,company,address,phone)
    VALUES (?,?,?,?,?,?,?,?)`);
  try {
    const r = stmt.run(username, name, role, hashPassword(password, salt), salt,
      extra.company || "", extra.address || "", extra.phone || "");
    return r.lastInsertRowid;
  } catch { return null; }
}
function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function publicUser(u) {
  if (!u) return null;
  const { password_hash, salt, ...rest } = u;
  return rest;
}
function weekKey(d = new Date()) {
  // ISO week key YYYY-Www (week starts Saturday for Egypt work week; use ISO Monday-based)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
function seed() {
  const n = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (n === 0) {
    db.prepare("INSERT INTO users (username,name,role,password_hash,salt,company,address,phone) VALUES ('admin','روني — الأدمن','admin',?,?,'جاد ثيرم','المحلة الكبرى — منشية البكري','01559558978')")
      .run(hashPassword("admin123", "admin-salt-1"), "admin-salt-1");
    newUser("alredwan", "الشيخ خالد البسيوني", "distributor", "123456",
      { company: "الرضوان للأدوات الصحية", address: "المحلة الكبرى، الشعبية، شارع حطين" });
    newUser("elsaeed_merchant", "السعيد العفيفي", "merchant", "123456",
      { company: "السعيد العفيفي", address: "العلو بالمحلة الكبرى" });
    newUser("elsaeed_tech", "السعيد العفيفي", "technician", "123456");
    newUser("reda_ramadan", "رضا رمضان", "technician", "123456");
    newUser("ahmed_elsayed", "أحمد السيد", "technician", "123456");
    newUser("25253", "عبد العظيم أحمد", "salesrep", "Gad sales2026");
    newUser("mohamed_abdel_rahim", "Mohamed Abdel Rahim", "admin", "123456");
    newUser("mohamed_gad", "Mohamed Gad", "admin", "123456");
    // seed merchants for the route (from real network)
    const m = db.prepare("INSERT INTO merchants (name,area,address,phone) VALUES (?,?,?,?)");
    m.run("الرضوان للأدوات الصحية", "المحلة الكبرى — الشعبية", "شارع حطين", "");
    m.run("السعيد العفيفي", "المحلة الكبرى — العلو", "العلو بالمحلة الكبرى", "");
    console.log("Seeded users + merchants");
  }
  const cn = db.prepare("SELECT COUNT(*) c FROM catalog").get().c;
  if (cn === 0 && fs.existsSync(CATALOG_PATH)) {
    const items = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
    const ins = db.prepare(`INSERT INTO catalog (id,section,name,size,unit,price,insulated,kind,labor_key,green_price)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    db.exec("BEGIN");
    try { for (const it of items) ins.run(it.id, it.section, it.name, it.size, it.unit, it.price, it.insulated ? 1 : 0, it.kind, it.laborKey, it.greenPrice ?? null); db.exec("COMMIT"); }
    catch (e) { db.exec("ROLLBACK"); throw e; }
    console.log(`Seeded catalog: ${items.length} items`);
  }
}
seed();

// حسابات تجربة (روني — للتجربة): تُنشأ تلقائيًا عند كل تشغيل إن لم تكن موجودة،
// حتى على قاعدة بيانات قديمة — الـ seed أعلاه يعمل فقط على قاعدة فارغة.
// اسم المستخدم UNIQUE، فإعادة التشغيل لا تكرّر الحساب.
newUser("تجربه", "تجربه", "technician", "123456");
newUser("للتجربة", "للتجربة", "merchant", "123456");

// ---------------------------------------------------------------------------
// Labor / points / pricing engine
// ---------------------------------------------------------------------------
function laborForItem(item, qty) {
  // qty: meters for pipes, pieces for fittings
  let base = 0;
  const k = item.labor_key;
  if (LABOR[k] !== undefined) base = LABOR[k] * qty;
  else if (k === "percent") base = item.price * (1 - PERCENT_RULE.discount) * PERCENT_RULE.rate * qty;
  else base = 0;
  let mult = 1, multNote = "";
  if (item.insulated) {
    if (item.green_price && item.green_price > 0) {
      mult = item.price / item.green_price;
      multNote = `نسبة المعزول/الأخضر ${mult.toFixed(2)}`;
    } else {
      mult = INSULATED_FALLBACK;
      multNote = "زيادة 10% (معزول)";
    }
  }
  return { labor: round2(base * mult), unitLabor: round2(base * mult / (qty || 1)), multNote };
}
function pointsForLines(lines) {
  // lines: [{item, qty, labor}] — pipes 1.5%, others 25%
  let pts = 0;
  for (const l of lines) {
    pts += l.item.kind === "pipe" ? l.labor * POINTS.pipe : l.labor * POINTS.normal;
  }
  return round2(pts);
}
function materialPrice(item, qty) {
  // qty: meters for pipes, pieces otherwise; discount by section
  const disc = PRICE_DISCOUNT[item.section] ?? 0;
  const before = item.price * qty;
  return { before: round2(before), discount: disc, after: round2(before * (1 - disc)) };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "غير مسجل الدخول" });
  const s = db.prepare("SELECT * FROM sessions WHERE token=? AND expires_at > datetime('now')").get(token);
  if (!s) return res.status(401).json({ ok: false, error: "الجلسة منتهية" });
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(s.user_id);
  if (!u) return res.status(401).json({ ok: false, error: "مستخدم غير موجود" });
  req.user = publicUser(u);
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية لهذا الإجراء" });
    next();
  };
}
function logTx(userId, type, amount, note, relatedId = null) {
  db.prepare("INSERT INTO transactions (user_id,type,amount,note,related_id) VALUES (?,?,?,?,?)")
    .run(userId, type, amount, note, relatedId);
}
function notify(userId, title, body, type = "info", relatedId = null) {
  db.prepare("INSERT INTO notifications (user_id,title,body,type,related_id) VALUES (?,?,?,?,?)")
    .run(userId, title, body, type, relatedId);
}

// ---------------------------------------------------------------------------
// Helpers: WhatsApp + Arabic PDF shaping + admin reports
// ---------------------------------------------------------------------------
const UPLOADS_DIR = path.join(__dirname, "data", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const AR_FONT = path.join(__dirname, "assets", "NotoSansArabic-Regular.ttf");
const AR_FONT_BOLD = path.join(__dirname, "assets", "NotoSansArabic-Bold.ttf");

// رقم واتساب: 01xxxxxxxxx -> 20xxxxxxxxx
function waPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "20" + d.slice(1);
  return d;
}
// تشكيل العربي + ترتيب بصري RTL لعرضه في PDFKit (لا يدعم التشكيل تلقائيًا)
// كل كلمة عربية: تُشكَّل ثم تُعكَس حروفها، ويُعكَس ترتيب الكلمات؛ الأرقام واللاتيني كما هي
function ar(s) {
  const str = String(s ?? "").replace(/—/g, "-").replace(/–/g, "-");
  const tokens = str.split(/(\s+)/);
  return tokens.map(t => {
    if (/[\u0600-\u06FF]/.test(t)) return [...convertArabic(t)].reverse().join("");
    return t;
  }).reverse().join("");
}
function buildReportData() {
  const totals = {
    users: db.prepare("SELECT COUNT(*) c FROM users").get().c,
    coupons: db.prepare("SELECT COUNT(*) c FROM coupons").get().c,
    couponsAvailable: db.prepare("SELECT COUNT(*) c FROM coupons WHERE status IN ('available','partial')").get().c,
    couponsRedeemed: db.prepare("SELECT COUNT(*) c FROM coupons WHERE status='redeemed'").get().c,
    jobs: db.prepare("SELECT COUNT(*) c FROM plumber_jobs").get().c,
    invoices: db.prepare("SELECT COUNT(*) c FROM invoices").get().c,
    invoicesTotal: db.prepare("SELECT COALESCE(SUM(total_after),0) s FROM invoices").get().s,
    pointsTotal: db.prepare("SELECT COALESCE(SUM(points),0) s FROM users").get().s,
  };
  // نشاط المندوب: شغل سباك + فواتير + طلبات كوبونات
  const reps = db.prepare(`SELECT u.id, u.name, u.username,
    (SELECT COUNT(*) FROM plumber_jobs j WHERE j.created_by=u.id) jobs,
    (SELECT COALESCE(SUM(j.labor_total),0) FROM plumber_jobs j WHERE j.created_by=u.id) labor,
    (SELECT COUNT(*) FROM invoices i WHERE i.created_by=u.id) invoices,
    (SELECT COALESCE(SUM(i.total_after),0) FROM invoices i WHERE i.created_by=u.id) invoicesTotal,
    (SELECT COUNT(*) FROM coupon_requests r WHERE r.requested_by=u.id) couponRequests
    FROM users u WHERE u.role IN ('salesrep','admin') ORDER BY u.id`).all();
  // ملخص التجار: فواتير ومسحوبات
  const merchants = db.prepare(`SELECT m.id, m.name, m.area, m.address, m.phone,
    COUNT(i.id) invoices, COALESCE(SUM(i.total_after),0) total
    FROM merchants m LEFT JOIN invoices i ON i.merchant_id=m.id GROUP BY m.id ORDER BY total DESC`).all();
  // الأصناف: من بنود شغل السباك + بنود الفواتير
  const itemQty = new Map(); // key: catalogId -> {name,size,section,qty}
  for (const j of db.prepare("SELECT items_json FROM plumber_jobs").all()) {
    try { for (const l of JSON.parse(j.items_json)) {
      const k = l.catalogId;
      const e = itemQty.get(k) || { catalogId: k, name: l.name, size: l.size, section: l.section, qty: 0, jobs: 0 };
      e.qty += Number(l.qty || 0); e.jobs += 1; itemQty.set(k, e);
    } } catch {}
  }
  for (const inv of db.prepare("SELECT lines_json FROM invoices").all()) {
    try { for (const l of JSON.parse(inv.lines_json)) {
      if (!l.item) continue;
      const k = l.item.id;
      const e = itemQty.get(k) || { catalogId: k, name: l.item.name, size: l.item.size, section: l.item.section, qty: 0, jobs: 0 };
      e.qty += Number(l.effQty ?? l.qty ?? 0); itemQty.set(k, e);
    } } catch {}
  }
  const used = [...itemQty.values()].sort((a, b) => b.qty - a.qty);
  const topItems = used.slice(0, 20);
  const usedIds = new Set(used.map(x => x.catalogId));
  const stagnant = db.prepare("SELECT id, name, size, section, price FROM catalog ORDER BY section, name")
    .all().filter(c => !usedIds.has(c.id));
  return { generatedAt: new Date().toISOString(), totals, reps, merchants, topItems, stagnant };
}

// ---------------------------------------------------------------------------
// API: auth / account
// ---------------------------------------------------------------------------
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE username=?").get(String(username || "").trim());
  if (!u || hashPassword(String(password || ""), u.salt) !== u.password_hash)
    return res.status(401).json({ ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,datetime('now','+30 days'))").run(token, u.id);
  res.json({ ok: true, token, user: publicUser(u) });
});
app.post("/api/auth/logout", auth, (req, res) => {
  const token = (req.headers.authorization || "").slice(7);
  db.prepare("DELETE FROM sessions WHERE token=?").run(token);
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) => res.json({ ok: true, user: req.user }));
app.post("/api/me/password", auth, (req, res) => {
  const { current, next: nextPw } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!nextPw || String(nextPw).length < 6) return res.status(400).json({ ok: false, error: "كلمة المرور الجديدة 6 أحرف على الأقل" });
  if (hashPassword(String(current || ""), u.salt) !== u.password_hash)
    return res.status(400).json({ ok: false, error: "كلمة المرور الحالية غير صحيحة" });
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("UPDATE users SET password_hash=?, salt=? WHERE id=?").run(hashPassword(nextPw, salt), salt, u.id);
  res.json({ ok: true });
});
app.post("/api/me/address", auth, (req, res) => {
  const { address } = req.body || {};
  db.prepare("UPDATE users SET address=? WHERE id=?").run(String(address || ""), req.user.id);
  res.json({ ok: true });
});
// بيانات التواصل: العنوان + رقم التليفون (لأي مستخدم من صفحة "حسابي")
app.post("/api/me/contact", auth, (req, res) => {
  const { address, phone } = req.body || {};
  db.prepare("UPDATE users SET address=?, phone=? WHERE id=?")
    .run(String(address ?? ""), String(phone ?? ""), req.user.id);
  res.json({ ok: true, user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id)) });
});

// Admin: users
app.get("/api/users", auth, requireRole("admin"), (req, res) => {
  const rows = db.prepare("SELECT id,username,name,role,company,address,phone,points,created_at FROM users ORDER BY id").all();
  res.json({ ok: true, users: rows });
});
app.post("/api/users", auth, requireRole("admin"), (req, res) => {
  const { username, name, role, password, company, address, phone } = req.body || {};
  if (!username || !name || !role || !password) return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  const id = newUser(username, name, role, password, { company, address, phone });
  if (!id) return res.status(400).json({ ok: false, error: "اسم المستخدم موجود بالفعل" });
  res.json({ ok: true, id });
});
// تعديل بيانات مستخدم (الاسم / الشركة / العنوان / التليفون) — أدمن فقط
app.put("/api/users/:id", auth, requireRole("admin"), (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ ok: false, error: "المستخدم غير موجود" });
  const { name, company, address, phone } = req.body || {};
  db.prepare("UPDATE users SET name=COALESCE(?,name), company=COALESCE(?,company), address=COALESCE(?,address), phone=COALESCE(?,phone) WHERE id=?")
    .run(name ?? null, company ?? null, address ?? null, phone ?? null, u.id);
  res.json({ ok: true, user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(u.id)) });
});

// ---------------------------------------------------------------------------
// API: catalog / prices / company
// ---------------------------------------------------------------------------
app.get("/api/catalog", auth, (req, res) => {
  const q = (req.query.q || "").trim();
  const section = req.query.section || "";
  // token-based search: every word must match name or size (ماسورة/مواسير synonyms)
  const SYN = { "ماسورة": ["ماسورة", "مواسير"], "مواسير": ["ماسورة", "مواسير"] };
  const tokens = q.split(/\s+/).filter(Boolean);
  const conds = [], params = [];
  if (section) { conds.push("section=?"); params.push(section); }
  for (const t of tokens) {
    const alts = SYN[t] || [t];
    conds.push("(" + alts.map(() => "(name LIKE ? OR size LIKE ?)").join(" OR ") + ")");
    for (const a of alts) params.push(`%${a}%`, `%${a}%`);
  }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const rows = db.prepare(`SELECT * FROM catalog ${where} ORDER BY section, name, size LIMIT 300`).all(...params);
  res.json({ ok: true, items: rows, count: rows.length });
});
// إضافة/تعديل صنف في الكتالوج (أدمن فقط) — لتثبيت تصحيحات لستة الأسعار على
// قاعدة البيانات الحية (الـ seed من catalog.json يعمل فقط على قاعدة فارغة).
// يحدَّث الصنف بالـ id إن أُعطي، وإلا بالمفتاح الطبيعي (section,name,size,insulated).
app.post("/api/catalog/upsert", auth, requireRole("admin"), (req, res) => {
  const b = req.body || {};
  const section = String(b.section || "").trim();
  const name = String(b.name || "").trim();
  const size = String(b.size ?? "").trim();
  const price = Number(b.price);
  if (!["ppr", "white", "gasket", "other"].includes(section))
    return res.status(400).json({ ok: false, error: "قسم غير صحيح" });
  if (!name) return res.status(400).json({ ok: false, error: "اسم الصنف مطلوب" });
  if (!Number.isFinite(price) || price < 0)
    return res.status(400).json({ ok: false, error: "سعر غير صحيح" });
  const unit = String(b.unit || "piece").trim();
  const kind = String(b.kind || "fitting").trim();
  const laborKey = String(b.laborKey || b.labor_key || "percent").trim();
  const insulated = b.insulated ? 1 : 0;
  const greenPrice = (b.greenPrice ?? b.green_price ?? null);
  let row = null;
  if (b.id !== undefined && b.id !== null && b.id !== "") {
    row = db.prepare("SELECT * FROM catalog WHERE id=?").get(Number(b.id));
  }
  if (!row) {
    row = db.prepare("SELECT * FROM catalog WHERE section=? AND name=? AND size=? AND insulated=?")
      .get(section, name, size, insulated);
  }
  if (row) {
    db.prepare(`UPDATE catalog SET section=?,name=?,size=?,unit=?,price=?,insulated=?,kind=?,labor_key=?,green_price=? WHERE id=?`)
      .run(section, name, size, unit, price, insulated, kind, laborKey, greenPrice, row.id);
    console.log(`catalog upsert: updated id=${row.id} ${name} ${size} -> ${price} by ${req.user.username}`);
    row = db.prepare("SELECT * FROM catalog WHERE id=?").get(row.id);
    return res.json({ ok: true, updated: true, item: row });
  }
  const newId = (b.id !== undefined && b.id !== null && b.id !== "")
    ? Number(b.id)
    : (db.prepare("SELECT COALESCE(MAX(id),0) m FROM catalog").get().m + 1);
  db.prepare(`INSERT INTO catalog (id,section,name,size,unit,price,insulated,kind,labor_key,green_price)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(newId, section, name, size, unit, price, insulated, kind, laborKey, greenPrice);
  console.log(`catalog upsert: inserted id=${newId} ${name} ${size} = ${price} by ${req.user.username}`);
  row = db.prepare("SELECT * FROM catalog WHERE id=?").get(newId);
  res.json({ ok: true, updated: false, item: row });
});
app.get("/api/company", (req, res) => res.json({ ok: true, company: COMPANY, certificates: CERTIFICATES }));

// ---------------------------------------------------------------------------
// API: dashboard
// ---------------------------------------------------------------------------
app.get("/api/dashboard", auth, (req, res) => {
  const u = req.user;
  const coupons = db.prepare("SELECT COUNT(*) c FROM coupons WHERE owner_id=? AND status='available'").get(u.id).c;
  const myJobs = db.prepare("SELECT COUNT(*) c FROM plumber_jobs WHERE technician_id=?").get(u.id).c;
  const txs = db.prepare("SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 15").all(u.id);
  const out = { ok: true, user: u, couponsAvailable: coupons, myJobs, points: u.points, transactions: txs };
  if (u.role === "admin") {
    out.totals = {
      users: db.prepare("SELECT COUNT(*) c FROM users").get().c,
      coupons: db.prepare("SELECT COUNT(*) c FROM coupons").get().c,
      jobs: db.prepare("SELECT COUNT(*) c FROM plumber_jobs").get().c,
      invoices: db.prepare("SELECT COUNT(*) c FROM invoices").get().c,
      pendingCouponRequests: db.prepare("SELECT COUNT(*) c FROM coupon_requests WHERE status='pending'").get().c,
    };
    out.weekKey = weekKey();
  }
  res.json(out);
});

// ---------------------------------------------------------------------------
// API: coupons
// ---------------------------------------------------------------------------
function couponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "JT-" + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("") +
      "-" + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (db.prepare("SELECT 1 FROM coupons WHERE code=?").get(code));
  return code;
}
app.get("/api/coupons", auth, (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === "admin") rows = db.prepare("SELECT * FROM coupons ORDER BY id DESC LIMIT 100").all();
  else rows = db.prepare("SELECT * FROM coupons WHERE owner_id=? OR created_by=? ORDER BY id DESC LIMIT 100").all(u.id, u.id);
  // زيادة التأخير الحالية لكل كوبون — لعرض المتبقي بعد التحويل بالنسبة مباشرة على الكارت
  res.json({ ok: true, coupons: rows.map(c => ({ ...c, bonus: delayBonus(c.created_at) })) });
});
// QR لكل كوبون: يفتح رابط استبدال الكوبون (يملأ الكود تلقائيًا عند المسح)
app.get("/api/coupons/:id/qr", auth, (req, res) => {
  const c = db.prepare("SELECT * FROM coupons WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "الكوبون غير موجود" });
  const u = req.user;
  if (u.role !== "admin" && c.owner_id !== u.id && c.created_by !== u.id)
    return res.status(403).json({ ok: false, error: "الكوبون ليس ملكك" });
  const base = `${req.protocol}://${req.get("host")}`;
  const url = `${base}/?coupon=${encodeURIComponent(c.code)}`;
  QRCode.toDataURL(url, { width: 240, margin: 1 }).then(dataUrl => {
    res.json({ ok: true, code: c.code, url, qr: dataUrl });
  }).catch(() => res.status(500).json({ ok: false, error: "تعذر إنشاء QR" }));
});
// جلب كوبون بالكود (لصفحة الاستبدال من مسح QR)
app.get("/api/coupons/by-code/:code", auth, (req, res) => {
  const c = db.prepare("SELECT * FROM coupons WHERE code=?").get(req.params.code);
  if (!c) return res.status(404).json({ ok: false, error: "الكوبون غير موجود" });
  const u = req.user;
  if (u.role !== "admin" && c.owner_id !== u.id && c.created_by !== u.id)
    return res.status(403).json({ ok: false, error: "الكوبون ليس ملكك" });
  const bonus = delayBonus(c.created_at);
  res.json({ ok: true, coupon: c, remaining: c.remaining_value != null ? Number(c.remaining_value) : Number(c.value), bonus });
});
app.post("/api/coupons", auth, requireRole("admin"), (req, res) => {
  const { value, product } = req.body || {};
  const v = Number(value);
  if (!v || v <= 0) return res.status(400).json({ ok: false, error: "قيمة الكوبون غير صحيحة" });
  const code = couponCode();
  const r = db.prepare("INSERT INTO coupons (code,value,remaining_value,product,owner_id,created_by) VALUES (?,?,?,?,?,?)")
    .run(code, v, v, String(product || ""), req.user.id, req.user.id);
  logTx(req.user.id, "coupon_create", v, `إنشاء كوبون ${code} بقيمة ${v} ج`, r.lastInsertRowid);
  res.json({ ok: true, coupon: { id: r.lastInsertRowid, code, value: v, product: product || "", owner_id: req.user.id, status: "available" } });
});
app.post("/api/coupons/:id/send", auth, (req, res) => {
  const c = db.prepare("SELECT * FROM coupons WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "الكوبون غير موجود" });
  if (c.owner_id !== req.user.id && req.user.role !== "admin") return res.status(403).json({ ok: false, error: "الكوبون ليس ملكك" });
  if (c.status !== "available") return res.status(400).json({ ok: false, error: "الكوبون غير متاح" });
  const to = db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.body.toUserId));
  if (!to) return res.status(400).json({ ok: false, error: "المستلم غير موجود" });
  db.prepare("UPDATE coupons SET owner_id=? WHERE id=?").run(to.id, c.id);
  logTx(req.user.id, "coupon_send", c.value, `إرسال كوبون ${c.code} إلى ${to.name}`, c.id);
  logTx(to.id, "coupon_receive", c.value, `استلام كوبون ${c.code} من ${req.user.name}`, c.id);
  res.json({ ok: true });
});
app.post("/api/coupons/:id/redeem", auth, (req, res) => {
  const c = db.prepare("SELECT * FROM coupons WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "الكوبون غير موجود" });
  if (c.owner_id !== req.user.id && req.user.role !== "admin") return res.status(403).json({ ok: false, error: "الكوبون ليس ملكك" });
  if (c.status === "redeemed") return res.status(400).json({ ok: false, error: "الكوبون مستبدل بالكامل" });
  // الصرف الجزئي: مبلغ يدخله صاحب الكوبون، أقل من أو يساوي المتبقي (بدون مبلغ = المتبقي كله)
  const remaining = c.remaining_value != null ? Number(c.remaining_value) : Number(c.value);
  let amount = req.body && req.body.amount != null && req.body.amount !== "" ? Number(req.body.amount) : remaining;
  if (!amount || amount <= 0) return res.status(400).json({ ok: false, error: "أدخل مبلغًا صحيحًا للصرف" });
  if (amount > remaining + 0.005) return res.status(400).json({ ok: false, error: `المبلغ أكبر من المتبقي (${remaining} ج)` });
  amount = Math.min(amount, remaining);
  // زيادة التأخير: من تاريخ إصدار الكوبون لحد يوم الصرف (بنفس الجدول المتدرج)
  const bonus = delayBonus(c.created_at);
  const payout = round2(amount * (1 + bonus.valuePct / 100));
  // زيادة النقاط: بنسبة الجزء المصروف من نقاط شغل السباك المرتبط بالكوبون
  const req2 = db.prepare("SELECT job_id FROM coupon_requests WHERE coupon_id=?").get(c.id);
  const job = req2 ? db.prepare("SELECT * FROM plumber_jobs WHERE id=?").get(req2.job_id)
    : db.prepare("SELECT * FROM plumber_jobs WHERE coupon_code=?").get(c.code);
  const jobPoints = job ? Number(job.points || 0) : 0;
  const fraction = Number(c.value) > 0 ? amount / Number(c.value) : 0;
  const extraPoints = job && bonus.pointsPct > 0 ? round2(jobPoints * fraction * bonus.pointsPct / 100) : 0;
  const newRemaining = round2(remaining - amount);
  const fully = newRemaining <= 0.005;
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE coupons SET status=?, remaining_value=?, redeemed_value=COALESCE(redeemed_value,0)+?, redeemed_at=datetime('now') WHERE id=?")
      .run(fully ? "redeemed" : "partial", fully ? 0 : newRemaining, payout, c.id);
    if (extraPoints > 0) {
      db.prepare("UPDATE users SET points = points + ? WHERE id=?").run(extraPoints, req.user.id);
      db.prepare("INSERT INTO points_ledger (user_id,points,reason,job_id) VALUES (?,?,?,?)")
        .run(req.user.id, extraPoints, `زيادة تأخير صرف جزئي كوبون ${c.code} (+${bonus.pointsPct}% من ${jobPoints} نقطة × ${Math.round(fraction * 100)}%)`, job ? job.id : null);
      logTx(req.user.id, "points_bonus", extraPoints,
        `زيادة نقاط تأخير صرف جزئي كوبون ${c.code} (+${bonus.pointsPct}% × ${Math.round(fraction * 100)}% من ${jobPoints} نقطة = ${extraPoints} نقطة)`, c.id);
    }
    const detail = `صرف ${fully ? "كامل" : "جزئي"} كوبون ${c.code} — المبلغ المصروف ${amount} ج${bonus.valuePct > 0 ? ` + زيادة تأخير ${bonus.valuePct}% (بعد ${bonus.days} يوم)` : ""} = ${payout} ج — المتبقي بعد الصرف: ${fully ? 0 : newRemaining} ج`;
    const pointsDetail = extraPoints > 0 ? ` + زيادة نقاط ${extraPoints} نقطة (+${bonus.pointsPct}% من الجزء المصروف)` : "";
    logTx(req.user.id, "coupon_redeem", payout, detail + pointsDetail, c.id);
    notify(req.user.id, fully ? "تم صرف الكوبون بالكامل ✅" : "تم صرف جزء من الكوبون 💰", detail + pointsDetail, "coupon", c.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ ok: true, redeemed: { code: c.code, originalValue: c.value, amount, days: bonus.days,
    valuePct: bonus.valuePct, payout, pointsPct: bonus.pointsPct, extraPoints, jobPoints,
    remaining: fully ? 0 : newRemaining, fully } });
});
// حذف كوبون (الأدمن فقط): أي كوبون مهما كانت حالته — متاح، متبقٍ جزئي، أو مستبدل.
// الحذف يُسجَّل في سجل الحركات بكود الكوبون وقيمته وحالته والمتبقي قبل الحذف،
// فيفضل أثر للمراجعة. المبالغ التي صُرفت بالفعل قبل الحذف تبقى في رصيد صاحبها
// (الحذف يمسح الكوبون، لا يلغي الصرف) — هذا ما طلبه روني: «الادمن بس اللى يعرف
// يعمل او يحذف اى شيء»، وبنفس القاعدة في نسخة Muse.
app.delete("/api/coupons/:id", auth, requireRole("admin"), (req, res) => {
  const c = db.prepare("SELECT * FROM coupons WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "الكوبون غير موجود" });
  const remaining = c.remaining_value != null ? Number(c.remaining_value) : Number(c.value);
  db.prepare("UPDATE coupon_requests SET coupon_id=NULL WHERE coupon_id=?").run(c.id);
  db.prepare("DELETE FROM coupons WHERE id=?").run(c.id);
  logTx(req.user.id, "coupon_delete", c.value, `حذف كوبون ${c.code} بقيمة ${c.value} ج — الحالة قبل الحذف: ${c.status}، المتبقي: ${remaining} ج`, null);
  res.json({ ok: true, deleted: c.code });
});

// ---------------------------------------------------------------------------
// API: plumber calculator (salesrep + admin only)
// ---------------------------------------------------------------------------
app.post("/api/plumber-jobs", auth, requireRole("salesrep", "admin"), (req, res) => {
  const { technicianId, items } = req.body || {};
  const tech = db.prepare("SELECT * FROM users WHERE id=? AND role='technician'").get(Number(technicianId));
  if (!tech) return res.status(400).json({ ok: false, error: "اختر فني صحيح" });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ ok: false, error: "أضف بنود الحساب" });
  const lines = [];
  let laborTotal = 0;
  for (const it of items) {
    const cat = db.prepare("SELECT * FROM catalog WHERE id=?").get(Number(it.catalogId));
    if (!cat) return res.status(400).json({ ok: false, error: `بند غير موجود: ${it.catalogId}` });
    const qty = Number(it.qty);
    if (!qty || qty <= 0) return res.status(400).json({ ok: false, error: "كمية غير صحيحة" });
    const calc = laborForItem(cat, qty);
    lines.push({ catalogId: cat.id, name: cat.name, size: cat.size, section: cat.section, kind: cat.kind,
      unit: cat.unit, price: cat.price, qty, labor: calc.labor, multNote: calc.multNote, insulated: !!cat.insulated });
    laborTotal = round2(laborTotal + calc.labor);
  }
  const pts = pointsForLines(lines.map(l => ({ item: { kind: l.kind }, labor: l.labor })));
  const r = db.prepare(`INSERT INTO plumber_jobs (technician_id,created_by,items_json,labor_total,points)
    VALUES (?,?,?,?,?)`).run(tech.id, req.user.id, JSON.stringify(lines), laborTotal, pts);
  db.prepare("UPDATE users SET points = points + ? WHERE id=?").run(pts, tech.id);
  db.prepare("INSERT INTO points_ledger (user_id,points,reason,job_id) VALUES (?,?,?,?)")
    .run(tech.id, pts, `نقاط عرض سباك #${r.lastInsertRowid}`, r.lastInsertRowid);
  logTx(tech.id, "plumber", laborTotal, `عرض سباك #${r.lastInsertRowid} — أجرة ${laborTotal} ج + ${pts} نقطة`, r.lastInsertRowid);
  logTx(req.user.id, "plumber", laborTotal, `حساب سباك للفني ${tech.name} — ${laborTotal} ج`, r.lastInsertRowid);
  // سير عمل الكوبونات: حفظ الشغل ينشئ تلقائيًا "طلب كوبون" معلّق للأدمن —
  // قيمة الكوبون = أجرة السباك الكاملة المحسوبة بنفس معادلة الحاسبة، بدون إدخال يدوي.
  // لا يصدر أي كوبون هنا؛ الأدمن هو من يعتمد الطلب فينشأ الكوبون.
  const rq = db.prepare(`INSERT INTO coupon_requests (job_id,technician_id,requested_by,labor_total,value,items_json)
    VALUES (?,?,?,?,?,?)`).run(r.lastInsertRowid, tech.id, req.user.id, laborTotal, laborTotal, JSON.stringify(lines));
  logTx(req.user.id, "coupon_request", laborTotal, `طلب كوبون #${rq.lastInsertRowid} لعرض سباك #${r.lastInsertRowid} — قيمة ${laborTotal} ج`, rq.lastInsertRowid);
  for (const a of db.prepare("SELECT id FROM users WHERE role='admin'").all())
    notify(a.id, "طلب كوبون جديد", `طلب كوبون #${rq.lastInsertRowid} للفني ${tech.name} — عرض سباك #${r.lastInsertRowid} — قيمة ${laborTotal} ج`, "coupon_request", rq.lastInsertRowid);
  res.json({ ok: true, job: { id: r.lastInsertRowid, laborTotal, points: pts, lines }, couponRequest: { id: rq.lastInsertRowid, value: laborTotal, status: "pending" } });
});
app.get("/api/plumber-jobs", auth, (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === "admin" || u.role === "salesrep")
    rows = db.prepare("SELECT * FROM plumber_jobs ORDER BY id DESC LIMIT 100").all();
  else
    rows = db.prepare("SELECT * FROM plumber_jobs WHERE technician_id=? ORDER BY id DESC LIMIT 100").all(u.id);
  for (const r of rows) r.items = JSON.parse(r.items_json);
  res.json({ ok: true, jobs: rows });
});
app.post("/api/plumber-jobs/preview", auth, requireRole("salesrep", "admin"), (req, res) => {
  const { items } = req.body || {};
  const lines = [];
  let laborTotal = 0;
  for (const it of items || []) {
    const cat = db.prepare("SELECT * FROM catalog WHERE id=?").get(Number(it.catalogId));
    if (!cat) continue;
    const qty = Number(it.qty) || 0;
    const calc = laborForItem(cat, qty);
    lines.push({ catalogId: cat.id, name: cat.name, size: cat.size, section: cat.section, kind: cat.kind,
      unit: cat.unit, price: cat.price, qty, labor: calc.labor, multNote: calc.multNote, insulated: !!cat.insulated });
    laborTotal = round2(laborTotal + calc.labor);
  }
  res.json({ ok: true, lines, laborTotal, points: pointsForLines(lines.map(l => ({ item: { kind: l.kind }, labor: l.labor }))) });
});

// ---------------------------------------------------------------------------
// API: coupon requests (طلبات الكوبونات) — سير عمل الكوبون من شغل السباك
// ---------------------------------------------------------------------------
function requestRow(r) {
  const tech = db.prepare("SELECT id,name,username FROM users WHERE id=?").get(r.technician_id);
  const by = db.prepare("SELECT id,name,username FROM users WHERE id=?").get(r.requested_by);
  const cp = r.coupon_id ? db.prepare("SELECT code,value FROM coupons WHERE id=?").get(r.coupon_id) : null;
  return { ...r, items: JSON.parse(r.items_json), technician: tech || null, requestedBy: by || null,
    coupon: cp || null, value: r.value, laborTotal: r.labor_total };
}
app.get("/api/coupon-requests", auth, (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === "admin")
    rows = db.prepare("SELECT * FROM coupon_requests ORDER BY id DESC LIMIT 100").all();
  else if (u.role === "salesrep")
    rows = db.prepare("SELECT * FROM coupon_requests WHERE requested_by=? ORDER BY id DESC LIMIT 100").all(u.id);
  else
    rows = db.prepare("SELECT * FROM coupon_requests WHERE technician_id=? ORDER BY id DESC LIMIT 100").all(u.id);
  res.json({ ok: true, requests: rows.map(requestRow) });
});
app.post("/api/coupon-requests/:id/approve", auth, requireRole("admin"), (req, res) => {
  const rq = db.prepare("SELECT * FROM coupon_requests WHERE id=?").get(req.params.id);
  if (!rq) return res.status(404).json({ ok: false, error: "الطلب غير موجود" });
  if (rq.status !== "pending") return res.status(400).json({ ok: false, error: "الطلب تم البت فيه بالفعل" });
  const job = db.prepare("SELECT * FROM plumber_jobs WHERE id=?").get(rq.job_id);
  if (!job) return res.status(400).json({ ok: false, error: "شغل السباك المرتبط غير موجود" });
  // قيمة الكوبون = أجرة السباك الكاملة المحسوبة من الشغل بنفس معادلة الحاسبة
  // (القيمة محفوظة في الطلب من وقت حفظ الشغل — لا إدخال يدوي هنا).
  const value = rq.value;
  const code = couponCode();
  const cr = db.prepare("INSERT INTO coupons (code,value,remaining_value,product,owner_id,created_by) VALUES (?,?,?,?,?,?)")
    .run(code, value, value, "عرض سباك", rq.technician_id, req.user.id);
  db.prepare("UPDATE coupon_requests SET status='approved', coupon_id=?, decided_by=?, decided_at=datetime('now') WHERE id=?")
    .run(cr.lastInsertRowid, req.user.id, rq.id);
  db.prepare("UPDATE plumber_jobs SET coupon_code=? WHERE id=?").run(code, rq.job_id);
  const tech = db.prepare("SELECT * FROM users WHERE id=?").get(rq.technician_id);
  const rep = db.prepare("SELECT * FROM users WHERE id=?").get(rq.requested_by);
  logTx(tech.id, "coupon_receive", value, `كوبون عرض سباك ${code} بقيمة ${value} ج (طلب #${rq.id})`, cr.lastInsertRowid);
  logTx(req.user.id, "coupon_create", value, `اعتماد طلب كوبون #${rq.id} — كوبون ${code} للفني ${tech.name}`, cr.lastInsertRowid);
  notify(tech.id, "كوبون جديد 🎟️", `تم اعتماد طلب الكوبون وإصدار كوبون ${code} بقيمة ${value} ج من عرض سباك #${rq.job_id}`, "coupon", cr.lastInsertRowid);
  if (rep && rep.id !== tech.id)
    notify(rep.id, "تم اعتماد طلب الكوبون ✅", `الأدمن اعتمد طلب الكوبون #${rq.id} وأصدر كوبون ${code} بقيمة ${value} ج للفني ${tech.name}`, "coupon", cr.lastInsertRowid);
  res.json({ ok: true, coupon: { id: cr.lastInsertRowid, code, value, owner_id: tech.id, status: "available" } });
});
app.post("/api/coupon-requests/:id/reject", auth, requireRole("admin"), (req, res) => {
  const rq = db.prepare("SELECT * FROM coupon_requests WHERE id=?").get(req.params.id);
  if (!rq) return res.status(404).json({ ok: false, error: "الطلب غير موجود" });
  if (rq.status !== "pending") return res.status(400).json({ ok: false, error: "الطلب تم البت فيه بالفعل" });
  const note = String((req.body || {}).note || "");
  db.prepare("UPDATE coupon_requests SET status='rejected', note=?, decided_by=?, decided_at=datetime('now') WHERE id=?")
    .run(note, req.user.id, rq.id);
  const tech = db.prepare("SELECT * FROM users WHERE id=?").get(rq.technician_id);
  const rep = db.prepare("SELECT * FROM users WHERE id=?").get(rq.requested_by);
  if (rep) notify(rep.id, "تم رفض طلب الكوبون", `الأدمن رفض طلب الكوبون #${rq.id} للفني ${tech ? tech.name : ""}${note ? " — " + note : ""}`, "coupon_request", rq.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API: كتالوج الهدايا (هدايا بالنقاط — 1 نقطة = 1 ج، النقاط 25% من أجرة السباك)
// النقاط لا تُخصم عند الطلب، بل عند اعتماد الأدمن فقط — والخصم يُعاد فحصه وقتها.
// ---------------------------------------------------------------------------
app.get("/api/gifts", auth, (req, res) => {
  const u = req.user;
  const me = db.prepare("SELECT points FROM users WHERE id=?").get(u.id);
  const myRequests = db.prepare("SELECT * FROM gift_requests WHERE user_id=? ORDER BY id DESC LIMIT 50").all(u.id);
  const out = { ok: true, gifts: GIFTS, myPoints: me ? Number(me.points || 0) : 0, myRequests };
  if (u.role === "admin") {
    out.allRequests = db.prepare(`SELECT g.*, u.name AS user_name, u.username AS user_username,
      d.name AS decided_name FROM gift_requests g
      LEFT JOIN users u ON u.id=g.user_id LEFT JOIN users d ON d.id=g.decided_by
      ORDER BY g.id DESC LIMIT 100`).all();
  }
  res.json(out);
});
app.post("/api/gifts/request", auth, requireRole("technician"), (req, res) => {
  const { giftKey } = req.body || {};
  const gift = GIFTS.find(g => g.key === giftKey);
  if (!gift) return res.status(400).json({ ok: false, error: "الهدية غير موجودة" });
  const me = db.prepare("SELECT points FROM users WHERE id=?").get(req.user.id);
  const have = Number(me.points || 0);
  if (have < gift.points)
    return res.status(400).json({ ok: false, error: `نقاطك غير كافية — تحتاج ${gift.points} نقطة ولديك ${have} نقطة` });
  const dup = db.prepare("SELECT id FROM gift_requests WHERE user_id=? AND gift_key=? AND status='pending'")
    .get(req.user.id, gift.key);
  if (dup) return res.status(400).json({ ok: false, error: "لديك طلب معلق لنفس الهدية بالفعل" });
  const r = db.prepare("INSERT INTO gift_requests (user_id,gift_key,gift_name,points_cost) VALUES (?,?,?,?)")
    .run(req.user.id, gift.key, gift.name, gift.points);
  logTx(req.user.id, "gift_request", gift.points,
    `طلب هدية #${r.lastInsertRowid} — ${gift.name} مقابل ${gift.points} نقطة`, r.lastInsertRowid);
  for (const a of db.prepare("SELECT id FROM users WHERE role='admin'").all())
    notify(a.id, "طلب هدية جديد 🎁", `الفني ${req.user.name} طلب هدية «${gift.name}» مقابل ${gift.points} نقطة`, "gift", r.lastInsertRowid);
  res.json({ ok: true, request: { id: r.lastInsertRowid, gift_key: gift.key, gift_name: gift.name, points_cost: gift.points, status: "pending" } });
});
app.post("/api/gifts/:id/approve", auth, requireRole("admin"), (req, res) => {
  const rq = db.prepare("SELECT * FROM gift_requests WHERE id=?").get(req.params.id);
  if (!rq) return res.status(404).json({ ok: false, error: "الطلب غير موجود" });
  if (rq.status !== "pending") return res.status(400).json({ ok: false, error: "الطلب تم البت فيه بالفعل" });
  const tech = db.prepare("SELECT * FROM users WHERE id=?").get(rq.user_id);
  if (!tech) return res.status(400).json({ ok: false, error: "الفني غير موجود" });
  const have = Number(tech.points || 0);
  if (have < rq.points_cost)
    return res.status(400).json({ ok: false, error: `نقاط الفني غير كافية — لديه ${have} نقطة والهدية تحتاج ${rq.points_cost} نقطة` });
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE users SET points = points - ? WHERE id=?").run(rq.points_cost, tech.id);
    db.prepare("INSERT INTO points_ledger (user_id,points,reason,job_id) VALUES (?,?,?,?)")
      .run(tech.id, -rq.points_cost, `استبدال هدية «${rq.gift_name}» (طلب #${rq.id})`, null);
    db.prepare("UPDATE gift_requests SET status='approved', decided_by=?, decided_at=datetime('now') WHERE id=?")
      .run(req.user.id, rq.id);
    logTx(tech.id, "gift_redeem", -rq.points_cost,
      `استبدال هدية «${rq.gift_name}» — خصم ${rq.points_cost} نقطة (طلب #${rq.id})`, rq.id);
    logTx(req.user.id, "gift_approve", rq.points_cost,
      `اعتماد طلب هدية #${rq.id} — «${rq.gift_name}» للفني ${tech.name} — خصم ${rq.points_cost} نقطة`, rq.id);
    notify(tech.id, "تم اعتماد هديتك 🎁",
      `الأدمن اعتمد طلب هدية «${rq.gift_name}» وتم خصم ${rq.points_cost} نقطة من رصيدك — مبروك!`, "gift", rq.id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ ok: true });
});
app.post("/api/gifts/:id/reject", auth, requireRole("admin"), (req, res) => {
  const rq = db.prepare("SELECT * FROM gift_requests WHERE id=?").get(req.params.id);
  if (!rq) return res.status(404).json({ ok: false, error: "الطلب غير موجود" });
  if (rq.status !== "pending") return res.status(400).json({ ok: false, error: "الطلب تم البت فيه بالفعل" });
  const note = String((req.body || {}).note || "");
  db.prepare("UPDATE gift_requests SET status='rejected', note=?, decided_by=?, decided_at=datetime('now') WHERE id=?")
    .run(note, req.user.id, rq.id);
  const tech = db.prepare("SELECT * FROM users WHERE id=?").get(rq.user_id);
  logTx(req.user.id, "gift_reject", rq.points_cost,
    `رفض طلب هدية #${rq.id} — «${rq.gift_name}» للفني ${tech ? tech.name : ""}${note ? " — " + note : ""}`, rq.id);
  if (tech) {
    logTx(tech.id, "gift_reject", 0,
      `تم رفض طلب هدية #${rq.id} — «${rq.gift_name}»${note ? " — " + note : ""} — لم يتم خصم أي نقاط`, rq.id);
    notify(tech.id, "تم رفض طلب الهدية",
      `الأدمن رفض طلب هدية «${rq.gift_name}»${note ? " — " + note : ""} — لم يتم خصم أي نقاط`, "gift", rq.id);
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API: notifications (الإشعارات)
// ---------------------------------------------------------------------------
app.get("/api/notifications", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.user.id);
  const unread = db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0").get(req.user.id).c;
  res.json({ ok: true, notifications: rows, unread });
});
app.post("/api/notifications/read", auth, (req, res) => {
  const { id } = req.body || {};
  if (id) db.prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").run(Number(id), req.user.id);
  else db.prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").run(req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API: invoice text parsing + invoices (salesrep + admin)
// ---------------------------------------------------------------------------
const AR_DIGITS = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
function normDigits(s) { return String(s).replace(/[٠-٩]/g, d => AR_DIGITS[d]); }
function sizeToMm(sizeToken, section) {
  // "4/3" -> 25 (ppr) ; "1" -> 32 ; "1.5" -> 50 ; "2" -> 63 ; "3" -> 75/90 ; "4" -> 110 ; "6" -> 160
  const t = String(sizeToken).trim();
  if (section === "ppr") {
    if (t === "4/3" || t === "3/4") return "25";
    if (t === "1") return "32";
    if (t === "1.5" || t === "1,5") return "50";
    if (t === "2") return "63";
    if (t === "2.5") return "75";
    if (t === "3") return "75";
    if (t === "4") return "110";
    if (t === "6") return "160";
    return t;
  }
  return t; // white/gasket keep inch label as-is
}
function parseInvoiceLines(text) {
  const lines = String(text || "").split("\n").map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const raw of lines) {
    const line = normDigits(raw);
    const m = line.match(/^(\d+(?:\.\d+)?)\s*(م|متر|مواسير|ماسورة|قطعة|قطع|كوع|جلبة)?\s*(.*)$/);
    if (!m) { out.push({ raw, error: "تعذر فهم السطر" }); continue; }
    const qty = parseFloat(m[1]);
    let unitWord = m[2] || "";
    let rest = (m[3] || "").trim();
    // size token: e.g. "2 بوصة" / "4" / "4/3" / "25"
    let sizeTok = "";
    const sm = rest.match(/(4\/3|3\/4|\d+(?:\.\d+)?)\s*(بوصة|مم)?/);
    if (sm) { sizeTok = sm[1]; rest = rest.replace(sm[0], "").trim(); }
    // section hint
    let section = null;
    if (/جوان|جوانات|PPH/i.test(rest)) section = "gasket";
    else if (/أبيض|ابيض|uPVC|يو\s*بي\s*في/i.test(rest)) section = "white";
    else if (/بولي|أخضر|اخضر|معزول|PPR|لحام|بسن/i.test(rest)) section = "ppr";
    // item keyword
    const kw = [
      ["ماسورة", "ماسورة"], ["مواسير", "ماسورة"], ["كوع", "كوع"], ["جلبة", "جلبة"],
      ["تي", "تي"], ["مشترك", "مشترك"], ["بلاعة", "بلاعة"], ["محبس", "محبس"],
      ["كرنك", "كرنك"], ["أفيز", "أفيز"], ["طبة", "طبة"], ["هواية", "هواية"],
      ["سيفون", "سيفون"], ["نقاص", "نقاص"], ["صليبة", "صليبة"], ["غراء", "غراء"],
      ["عازل", "عازل"], ["شحم", "شحم"],
    ];
    let nameKw = null;
    for (const [pat, k] of kw) if (rest.includes(pat) || line.includes(pat)) { nameKw = k; break; }
    const isPipe = nameKw === "ماسورة";
    // candidate sizes across systems: inch token, PPR mm mapping, gasket-pipe mm mapping
    const sizeLabels = new Set();
    if (sizeTok) {
      sizeLabels.add(sizeTok);
      sizeLabels.add(sizeToMm(sizeTok, "ppr"));
      if (isPipe) { if (sizeTok === "3") sizeLabels.add("75"); if (sizeTok === "4") sizeLabels.add("110"); if (sizeTok === "6") sizeLabels.add("160"); }
    }
    // find catalog candidates (ماسورة/مواسير synonyms)
    const nameAlts = nameKw === "ماسورة" ? ["ماسورة", "مواسير"] : [nameKw || ""];
    let cands = db.prepare(`SELECT * FROM catalog WHERE (${nameAlts.map(() => "name LIKE ?").join(" OR ")})`)
      .all(...nameAlts.map(a => `%${a}%`));
    if (section) cands = cands.filter(c => c.section === section);
    if (sizeTok) {
      const sized = cands.filter(c => sizeLabels.has(c.size) || [...sizeLabels].some(s => c.size.startsWith(s + " ")));
      if (sized.length) cands = sized;
    }
    if (isPipe) {
      const pipes = cands.filter(c => c.kind === "pipe");
      if (pipes.length) cands = pipes;
    }
    // إذا كان اسم صنف كامل مذكورًا في السطر (مثل "سيفون 110")، فضّل أطول اسم
    // مطابق — وإلا كان "سيفون 110" سيطابق "سيفون" الأبيض بالخطأ.
    const lineNorm = line.replace(/\s+/g, "");
    let bestLen = 0;
    for (const c of cands) {
      const n = String(c.name).replace(/\s+/g, "");
      if (n && lineNorm.includes(n)) bestLen = Math.max(bestLen, n.length);
    }
    if (bestLen > 0) {
      cands = cands.filter(c => {
        const n = String(c.name).replace(/\s+/g, "");
        return n.length === bestLen && lineNorm.includes(n);
      });
    }
    // preference when system not specified: white, then gasket, then ppr
    if (!section) {
      const prio = { white: 0, gasket: 1, ppr: 2, other: 3 };
      cands.sort((a, b) => (prio[a.section] ?? 9) - (prio[b.section] ?? 9));
    }
    const item = cands[0] || null;
    if (!item) { out.push({ raw, error: "لم يوجد الصنف في اللستة", qty, rest }); continue; }
    // quantity -> meters for pipes
    let meters = null, pieces = qty;
    if (item.kind === "pipe") {
      const perPipe = PIPE_LENGTH_M[item.section] ?? 4;
      if (unitWord === "م" || unitWord === "متر") { meters = qty; pieces = null; }
      else { meters = round2(qty * perPipe); } // counted per pipe -> convert
    }
    const effQty = item.kind === "pipe" ? meters : qty;
    const mat = materialPrice(item, effQty);
    out.push({ raw, qty, unitWord, item: { id: item.id, name: item.name, size: item.size, section: item.section, unit: item.unit, price: item.price },
      effQty, meters, priceBefore: mat.before, discount: mat.discount, priceAfter: mat.after,
      note: item.kind === "pipe" && unitWord !== "م" && unitWord !== "متر"
        ? `الماسورة = ${PIPE_LENGTH_M[item.section]}م — ${qty} ماسورة = ${meters}م` : "" });
  }
  return out;
}
app.post("/api/invoices/parse", auth, requireRole("salesrep", "admin"), (req, res) => {
  const parsed = parseInvoiceLines(req.body.text || "");
  const totalBefore = round2(parsed.reduce((s, l) => s + (l.priceBefore || 0), 0));
  const totalAfter = round2(parsed.reduce((s, l) => s + (l.priceAfter || 0), 0));
  res.json({ ok: true, lines: parsed, totalBefore, totalAfter });
});
app.post("/api/invoices", auth, requireRole("salesrep", "admin"), (req, res) => {
  const { merchantId, text } = req.body || {};
  const merch = db.prepare("SELECT * FROM merchants WHERE id=?").get(Number(merchantId));
  if (!merch) return res.status(400).json({ ok: false, error: "اختر تاجر صحيح" });
  const parsed = parseInvoiceLines(text || "");
  if (parsed.some(l => l.error)) return res.status(400).json({ ok: false, error: "بعض البنود غير مفهومة", lines: parsed });
  const totalBefore = round2(parsed.reduce((s, l) => s + l.priceBefore, 0));
  const totalAfter = round2(parsed.reduce((s, l) => s + l.priceAfter, 0));
  const r = db.prepare(`INSERT INTO invoices (merchant_id,created_by,lines_json,total_before,total_after)
    VALUES (?,?,?,?,?)`).run(merch.id, req.user.id, JSON.stringify(parsed), totalBefore, totalAfter);
  logTx(req.user.id, "invoice", totalAfter, `فاتورة #${r.lastInsertRowid} للتاجر ${merch.name} — ${totalAfter} ج`, r.lastInsertRowid);
  res.json({ ok: true, invoice: { id: r.lastInsertRowid, merchant: merch.name, lines: parsed, totalBefore, totalAfter } });
});
app.get("/api/invoices", auth, (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === "admin" || u.role === "salesrep")
    rows = db.prepare(`SELECT i.*, m.name merchant_name, m.phone merchant_phone FROM invoices i JOIN merchants m ON m.id=i.merchant_id ORDER BY i.id DESC LIMIT 100`).all();
  else {
    // merchant users see invoices of merchants matching their name
    rows = db.prepare(`SELECT i.*, m.name merchant_name, m.phone merchant_phone FROM invoices i JOIN merchants m ON m.id=i.merchant_id
      WHERE m.name LIKE ? ORDER BY i.id DESC LIMIT 100`).all(`%${u.name}%`);
  }
  for (const r of rows) r.lines = JSON.parse(r.lines_json);
  res.json({ ok: true, invoices: rows });
});

// ---------------------------------------------------------------------------
// API: merchants
// ---------------------------------------------------------------------------
app.get("/api/merchants", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM merchants ORDER BY name").all();
  for (const m of rows) {
    m.withdrawals = db.prepare("SELECT COUNT(*) c FROM invoices WHERE merchant_id=?").get(m.id).c;
    m.totalWithdrawn = db.prepare("SELECT COALESCE(SUM(total_after),0) s FROM invoices WHERE merchant_id=?").get(m.id).s;
  }
  res.json({ ok: true, merchants: rows });
});
app.post("/api/merchants", auth, requireRole("admin", "salesrep"), (req, res) => {
  const { name, area, address, phone } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "اسم التاجر مطلوب" });
  const r = db.prepare("INSERT INTO merchants (name,area,address,phone,created_by) VALUES (?,?,?,?,?)")
    .run(name, area || "", address || "", phone || "", req.user.id);
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.get("/api/merchants/:id", auth, (req, res) => {
  const m = db.prepare("SELECT * FROM merchants WHERE id=?").get(req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: "التاجر غير موجود" });
  const inv = db.prepare("SELECT * FROM invoices WHERE merchant_id=? ORDER BY id DESC").all(m.id);
  for (const r of inv) r.lines = JSON.parse(r.lines_json);
  res.json({ ok: true, merchant: m, invoices: inv });
});

// ---------------------------------------------------------------------------
// API: smart weekly route
// ---------------------------------------------------------------------------
const WEEK_DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
function buildWeekPlan(wk) {
  const merchants = db.prepare("SELECT * FROM merchants ORDER BY area, name").all();
  // unvisited merchants from last week go first
  const prev = db.prepare("SELECT week_key FROM route_weeks ORDER BY week_key DESC LIMIT 1").get();
  const unvisited = new Set();
  if (prev && prev.week_key !== wk) {
    const vis = db.prepare("SELECT merchant_id, done FROM visits WHERE week_key=?").all(prev.week_key);
    const doneIds = new Set(vis.filter(v => v.done).map(v => v.merchant_id));
    const allIds = new Set(vis.map(v => v.merchant_id));
    for (const id of allIds) if (!doneIds.has(id)) unvisited.add(id);
    // merchants never scheduled at all are also "new"
    for (const m of merchants) if (!allIds.has(m.id)) unvisited.add(m.id);
  }
  const sorted = [...merchants].sort((a, b) => (unvisited.has(b.id) - unvisited.has(a.id)) || (a.area || "").localeCompare(b.area || "") || a.name.localeCompare(b.name));
  const plan = {};
  WEEK_DAYS.forEach(d => plan[d] = []);
  sorted.forEach((m, i) => plan[WEEK_DAYS[i % WEEK_DAYS.length]].push({ merchantId: m.id, name: m.name, area: m.area, address: m.address, priority: unvisited.has(m.id) ? "لم يُزر الأسبوع الماضي" : "" }));
  return plan;
}
app.get("/api/route", auth, requireRole("salesrep", "admin"), (req, res) => {
  const wk = req.query.week || weekKey();
  let row = db.prepare("SELECT * FROM route_weeks WHERE week_key=?").get(wk);
  if (!row) {
    const plan = buildWeekPlan(wk);
    db.prepare("INSERT INTO route_weeks (week_key,plan_json) VALUES (?,?)").run(wk, JSON.stringify(plan));
    row = { week_key: wk, plan_json: JSON.stringify(plan) };
  }
  const plan = JSON.parse(row.plan_json);
  const visits = db.prepare("SELECT * FROM visits WHERE week_key=?").all(wk);
  const vmap = {};
  for (const v of visits) vmap[`${v.day}:${v.merchant_id}`] = v;
  res.json({ ok: true, week: wk, days: WEEK_DAYS, plan, visits: vmap });
});
app.post("/api/route/visit", auth, requireRole("salesrep", "admin"), (req, res) => {
  const { week, merchantId, day, done, note, checkin } = req.body || {};
  const wk = week || weekKey();
  const ex = db.prepare("SELECT * FROM visits WHERE week_key=? AND merchant_id=? AND day=?").get(wk, merchantId, day);
  if (ex) {
    db.prepare("UPDATE visits SET done=?, note=?, checked_in_at=? WHERE id=?")
      .run(done ? 1 : 0, note || ex.note, checkin ? new Date().toISOString() : ex.checked_in_at, ex.id);
    res.json({ ok: true, id: ex.id });
  } else {
    const r = db.prepare("INSERT INTO visits (week_key,merchant_id,day,done,note,checked_in_at) VALUES (?,?,?,?,?,?)")
      .run(wk, merchantId, day, done ? 1 : 0, note || "", checkin ? new Date().toISOString() : null);
    res.json({ ok: true, id: r.lastInsertRowid });
  }
});
app.get("/api/route/report", auth, requireRole("admin", "salesrep"), (req, res) => {
  const wk = req.query.week || weekKey();
  const visits = db.prepare(`SELECT v.*, m.name merchant_name, m.area FROM visits v JOIN merchants m ON m.id=v.merchant_id WHERE v.week_key=? ORDER BY v.day`).all(wk);
  const total = db.prepare("SELECT COUNT(*) c FROM merchants").get().c;
  const done = visits.filter(v => v.done).length;
  const missed = visits.filter(v => !v.done).map(v => ({ merchant: v.merchant_name, day: v.day, note: v.note }));
  const inv = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total_after),0) s FROM invoices WHERE date(created_at) >= date('now','-7 days')").get();
  res.json({ ok: true, week: wk, merchantsTotal: total, visited: done, missed, invoicesWeek: inv.c, invoicesTotal: inv.s });
});

// ---------------------------------------------------------------------------
// API: voice search (role-scoped) + backup
// ---------------------------------------------------------------------------
app.post("/api/search", auth, (req, res) => {
  const q = String((req.body || {}).q || "").trim();
  const u = req.user;
  const cards = [];
  const has = (...ws) => ws.some(w => q.includes(w));
  if (has("نقط", "رصيد", "نقاط")) {
    cards.push({ title: "رصيد نقاطك", value: `${u.points} نقطة`, sub: "النقطة = 1 جنيه", icon: "⭐" });
    const led = db.prepare("SELECT * FROM points_ledger WHERE user_id=? ORDER BY id DESC LIMIT 5").all(u.id);
    cards.push({ title: "آخر النقاط", value: led.length ? led.map(l => `${l.points} نقطة — ${l.reason}`).join("\n") : "لا توجد نقاط بعد", icon: "📋" });
  }
  if (has("كوبون", "كوبونات")) {
    const cs = db.prepare("SELECT * FROM coupons WHERE owner_id=? AND status='available' ORDER BY id DESC LIMIT 10").all(u.id);
    cards.push({ title: "كوبوناتك المتاحة", value: cs.length ? cs.map(c => `${c.code} — ${c.value} ج`).join("\n") : "لا توجد كوبونات متاحة", icon: "🎟️" });
  }
  if (has("عرض", "عروض", "سباك", "أجرة", "فلوس")) {
    const jobs = db.prepare("SELECT * FROM plumber_jobs WHERE technician_id=? ORDER BY id DESC LIMIT 5").all(u.id);
    cards.push({ title: "عروض السباك", value: jobs.length ? jobs.map(j => `عرض #${j.id} — ${j.labor_total} ج — ${j.points} نقطة`).join("\n") : "لا توجد عروض", icon: "🧮" });
  }
  if ((u.role === "salesrep" || u.role === "admin") && has("خط", "سير", "زيارة", "زيارات", "مكان", "أماكن")) {
    const wk = weekKey();
    const visits = db.prepare("SELECT COUNT(*) c FROM visits WHERE week_key=? AND done=1").get(wk).c;
    const total = db.prepare("SELECT COUNT(*) c FROM merchants").get().c;
    cards.push({ title: "خط سير الأسبوع", value: `زيارات تمت: ${visits} من ${total} تاجر`, sub: `أسبوع ${wk}`, icon: "🗺️" });
  }
  if (has("فاتورة", "فواتير", "مسحوبات", "سحب")) {
    const inv = u.role === "merchant"
      ? db.prepare(`SELECT i.* FROM invoices i JOIN merchants m ON m.id=i.merchant_id WHERE m.name LIKE ? ORDER BY i.id DESC LIMIT 5`).all(`%${u.name}%`)
      : db.prepare("SELECT * FROM invoices ORDER BY id DESC LIMIT 5").all();
    cards.push({ title: "الفواتير", value: inv.length ? inv.map(v => `فاتورة #${v.id} — ${v.total_after} ج`).join("\n") : "لا توجد فواتير", icon: "🧾" });
  }
  if (has("سعر", "أسعار", "لستة", "منتج")) {
    const term = q.replace(/سعر|أسعار|لستة|منتج|كام|ايه|إيه/g, "").trim();
    if (term) {
      const items = db.prepare("SELECT * FROM catalog WHERE name LIKE ? OR size LIKE ? LIMIT 8").all(`%${term}%`, `%${term}%`);
      cards.push({ title: `أسعار: ${term}`, value: items.length ? items.map(i2 => `${i2.name} ${i2.size} — ${i2.price} ج${i2.unit === "meter" ? "/متر" : ""}`).join("\n") : "غير موجود في اللستة", icon: "🏷️" });
    }
  }
  if ((u.role === "admin" || u.role === "salesrep") && has("تاجر", "تجار")) {
    const ms = db.prepare("SELECT name, area FROM merchants ORDER BY name LIMIT 10").all();
    cards.push({ title: "التجار", value: ms.map(m2 => `${m2.name} — ${m2.area}`).join("\n") || "لا يوجد تجار", icon: "🏪" });
  }
  if (cards.length === 0) cards.push({ title: "لم أفهم", value: "جرّب: عدد النقاط، كوبوناتي، عروضي، خط السير، الفواتير، سعر كوع 4/3", icon: "🎤" });
  res.json({ ok: true, query: q, cards });
});

app.get("/api/backup", auth, requireRole("admin"), (req, res) => {
  const dump = {};
  for (const t of ["users", "coupons", "transactions", "points_ledger", "plumber_jobs", "coupon_requests", "gift_requests", "notifications", "merchants", "invoices", "route_weeks", "visits", "catalog", "attachments", "warranty_files", "inspections"]) {
    dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  // strip password hashes from export
  dump.users = dump.users.map(u => { const { password_hash, salt, ...rest } = u; return rest; });
  res.json({ ok: true, backup: dump, exportedAt: new Date().toISOString() });
});
app.post("/api/backup", auth, requireRole("admin"), (req, res) => {
  const dump = (req.body || {}).backup;
  if (!dump) return res.status(400).json({ ok: false, error: "لا توجد بيانات" });
  // restore non-user tables only (users keep current passwords)
  db.exec("BEGIN");
  try {
    for (const t of ["coupons", "transactions", "points_ledger", "plumber_jobs", "coupon_requests", "gift_requests", "notifications", "merchants", "invoices", "route_weeks", "visits", "attachments", "warranty_files", "inspections"]) {
      if (Array.isArray(dump[t])) {
        db.prepare(`DELETE FROM ${t}`).run();
        for (const row of dump[t]) {
          const keys = Object.keys(row);
          const vals = keys.map(k => row[k]);
          db.prepare(`INSERT OR REPLACE INTO ${t} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...vals);
        }
      }
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API: admin reports (تقارير الأدمن) + PDF / Excel export
// ---------------------------------------------------------------------------
app.get("/api/admin/reports", auth, requireRole("admin"), (req, res) => {
  res.json({ ok: true, report: buildReportData() });
});
const SECTION_AR_PDF = { gasket: "الجوان", ppr: "البولي", white: "الأبيض", other: "أخرى" };
function pdfTable(doc, title, cols, rows) {
  doc.font("ar-bold").fontSize(13).fillColor("#013078").text(ar(title), { align: "right" });
  doc.moveDown(0.3);
  const startX = doc.page.width - doc.page.margins.right;
  let y = doc.y;
  const rowH = 20;
  const drawRow = (cells, bold) => {
    if (y + rowH > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top; }
    let x = startX;
    for (const c of cells) {
      const txt = String(c.text ?? "");
      if (/[\u0600-\u06FF]/.test(txt)) {
        doc.font(bold ? "ar-bold" : "ar").fontSize(10.5).fillColor(bold ? "#013078" : "#111111");
        doc.text(ar(txt.replace(/\//g, "-")), x - c.w, y, { width: c.w - 6, align: "right" });
      } else {
        // خلايا لاتينية/أرقام فقط (أسماء إنجليزية) — خط Helvetica لأن الخط العربي لا يحويها
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10.5).fillColor(bold ? "#013078" : "#111111");
        doc.text(txt, x - c.w, y, { width: c.w - 6, align: "right" });
      }
      x -= c.w;
    }
    doc.moveTo(doc.page.margins.left, y + rowH - 4).lineTo(startX, y + rowH - 4).strokeColor("#cccccc").lineWidth(0.5).stroke();
    y += rowH;
  };
  drawRow(cols.map(c => ({ text: c.label, w: c.w })), true);
  for (const r of rows) drawRow(cols.map(c => ({ text: r[c.key], w: c.w })), false);
  doc.y = y + 10;
}
function buildPdfReport(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: "تقرير جاد ثيرم", Author: "جاد ثيرم" } });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("ar", AR_FONT);
    doc.registerFont("ar-bold", AR_FONT_BOLD);
    doc.font("ar-bold").fontSize(18).fillColor("#013078").text(ar("تقرير جاد ثيرم"), { align: "center" });
    doc.font("ar").fontSize(11).fillColor("#333333").text(ar("جاد ثيرم لأنظمة المياة والصرف الصحى — ضمان 50 سنة"), { align: "center" });
    doc.font("ar").fontSize(10).fillColor("#666666").text(ar("تاريخ التقرير: " + new Date(data.generatedAt).toLocaleString("ar-EG")), { align: "center" });
    doc.moveDown(1);
    const t = data.totals;
    pdfTable(doc, "الملخص العام", [
      { key: "k", label: "البيان", w: 260 }, { key: "v", label: "القيمة", w: 255 },
    ], [
      { k: "عدد المستخدمين", v: String(t.users) },
      { k: "عدد الكوبونات", v: String(t.coupons) },
      { k: "كوبونات متاحة", v: String(t.couponsAvailable) },
      { k: "كوبونات مستبدلة", v: String(t.couponsRedeemed) },
      { k: "حسابات سباك", v: String(t.jobs) },
      { k: "عدد الفواتير", v: String(t.invoices) },
      { k: "إجمالي الفواتير", v: `${t.invoicesTotal} ج` },
      { k: "إجمالي النقاط", v: String(t.pointsTotal) },
    ]);
    pdfTable(doc, "نشاط المندوب", [
      { key: "name", label: "المندوب", w: 170 }, { key: "jobs", label: "عروض سباك", w: 85 },
      { key: "labor", label: "أجرة السباك", w: 85 }, { key: "invoices", label: "فواتير", w: 85 }, { key: "invoicesTotal", label: "مسحوبات", w: 90 },
    ], data.reps.map(r => ({ name: r.name, jobs: String(r.jobs), labor: `${r.labor} ج`, invoices: String(r.invoices), invoicesTotal: `${r.invoicesTotal} ج` })));
    pdfTable(doc, "ملخص التجار", [
      { key: "name", label: "التاجر", w: 180 }, { key: "area", label: "المنطقة", w: 120 },
      { key: "invoices", label: "فواتير", w: 80 }, { key: "total", label: "إجمالي المسحوبات", w: 135 },
    ], data.merchants.map(m => ({ name: m.name, area: m.area || "—", invoices: String(m.invoices), total: `${m.total} ج` })));
    pdfTable(doc, "الأصناف الأكثر طلبًا", [
      { key: "name", label: "الصنف", w: 230 }, { key: "size", label: "المقاس", w: 90 },
      { key: "section", label: "القسم", w: 90 }, { key: "qty", label: "الكمية", w: 105 },
    ], data.topItems.map(i => ({ name: i.name, size: i.size || "—", section: SECTION_AR_PDF[i.section] || i.section, qty: String(i.qty) })));
    pdfTable(doc, "الأصناف الراكدة (بدون طلب)", [
      { key: "name", label: "الصنف", w: 230 }, { key: "size", label: "المقاس", w: 90 },
      { key: "section", label: "القسم", w: 90 }, { key: "price", label: "السعر", w: 105 },
    ], data.stagnant.slice(0, 60).map(i => ({ name: i.name, size: i.size || "—", section: SECTION_AR_PDF[i.section] || i.section, price: `${i.price} ج` })));
    doc.end();
  });
}
async function buildXlsxReport(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "جاد ثيرم";
  const addSheet = (name, headers, rows) => {
    const ws = wb.addWorksheet(name);
    ws.views = [{ rightToLeft: true }];
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true, size: 12 };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF013078" } };
    ws.getRow(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    for (const r of rows) ws.addRow(r);
    ws.columns.forEach(c => { c.width = 24; });
    return ws;
  };
  const t = data.totals;
  addSheet("الملخص", ["البيان", "القيمة"], [
    ["عدد المستخدمين", t.users], ["عدد الكوبونات", t.coupons],
    ["كوبونات متاحة", t.couponsAvailable], ["كوبونات مستبدلة", t.couponsRedeemed],
    ["حسابات سباك", t.jobs], ["فواتير", t.invoices], ["إجمالي الفواتير (ج)", t.invoicesTotal],
    ["إجمالي النقاط", t.pointsTotal],
  ]);
  addSheet("نشاط المندوب", ["المندوب", "عروض سباك", "أجرة السباك (ج)", "فواتير", "مسحوبات (ج)", "طلبات كوبونات"],
    data.reps.map(r => [r.name, r.jobs, r.labor, r.invoices, r.invoicesTotal, r.couponRequests]));
  addSheet("التجار", ["التاجر", "المنطقة", "العنوان", "التليفون", "فواتير", "إجمالي المسحوبات (ج)"],
    data.merchants.map(m => [m.name, m.area || "", m.address || "", m.phone || "", m.invoices, m.total]));
  addSheet("الأكثر طلبا", ["الصنف", "المقاس", "القسم", "الكمية"],
    data.topItems.map(i => [i.name, i.size || "", i.section, i.qty]));
  addSheet("الراكدة", ["الصنف", "المقاس", "القسم", "السعر (ج)"],
    data.stagnant.map(i => [i.name, i.size || "", i.section, i.price]));
  return wb.xlsx.writeBuffer();
}
app.get("/api/admin/reports.pdf", auth, requireRole("admin"), async (req, res) => {
  try {
    const buf = await buildPdfReport(buildReportData());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="jad-therm-report-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ ok: false, error: "تعذر إنشاء PDF: " + e.message }); }
});
app.get("/api/admin/reports.xlsx", auth, requireRole("admin"), async (req, res) => {
  try {
    const buf = await buildXlsxReport(buildReportData());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="jad-therm-report-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ ok: false, error: "تعذر إنشاء Excel: " + e.message }); }
});

// ---------------------------------------------------------------------------
// API: attachments (صور الكاميرا) + warranty files (شهادات الضمان) + inspections
// ---------------------------------------------------------------------------
const jsonUpload = express.json({ limit: "10mb" });
function saveUploadFile(filename, base64) {
  const buf = Buffer.from(String(base64 || ""), "base64");
  if (!buf.length) throw new Error("ملف فارغ");
  if (buf.length > 8 * 1024 * 1024) throw new Error("الملف كبير — أقصى 8 ميجا");
  const ext = (String(filename || "file").split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "bin";
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buf);
  return { name, size: buf.length };
}
app.post("/api/attachments", auth, jsonUpload, (req, res) => {
  const { entityType, entityId, kind, filename, mime, data } = req.body || {};
  if (!entityType || !entityId || !data) return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  if (!["job", "visit", "invoice", "inspection"].includes(entityType))
    return res.status(400).json({ ok: false, error: "نوع مرفق غير صحيح" });
  try {
    const f = saveUploadFile(filename || "photo.jpg", data);
    const r = db.prepare("INSERT INTO attachments (entity_type,entity_id,kind,filename,mime,size,created_by) VALUES (?,?,?,?,?,?,?)")
      .run(entityType, Number(entityId), kind || "photo", f.name, String(mime || ""), f.size, req.user.id);
    res.json({ ok: true, id: r.lastInsertRowid, url: `/api/uploads/${f.name}` });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.get("/api/attachments", auth, (req, res) => {
  const { entityType, entityId } = req.query;
  if (!entityType || !entityId) return res.status(400).json({ ok: false, error: "حدد المرفق" });
  const rows = db.prepare("SELECT * FROM attachments WHERE entity_type=? AND entity_id=? ORDER BY id").all(entityType, Number(entityId));
  res.json({ ok: true, attachments: rows.map(a => ({ ...a, url: `/api/uploads/${a.filename}` })) });
});
app.get("/api/uploads/:name", (req, res, next) => {
  // الملفات الداخلية: يقبل توكن في الهيدر أو ?token= (لعرض الصور والملفات في تبويب جديد)
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : (req.query.token || "");
  const s = token ? db.prepare("SELECT * FROM sessions WHERE token=? AND expires_at > datetime('now')").get(token) : null;
  if (!s) return res.status(401).json({ ok: false, error: "غير مسجل الدخول" });
  next();
}, (req, res) => {
  const name = path.basename(req.params.name || "");
  const fp = path.join(UPLOADS_DIR, name);
  if (!name || !fs.existsSync(fp)) return res.status(404).json({ ok: false, error: "الملف غير موجود" });
  res.sendFile(fp);
});

// شهادات الضمان — مكتبة رفع وعرض وحفظ
const WARRANTY_TEXT = `ضمان جاد ثيرم 50 سنة: جميع منتجات جاد ثيرم من مواسير ووصلات البولي بروبلين (PPR) والصرف الأبيض (uPVC) والصرف بجوان (PPH) مضمونة لمدة 50 سنة من تاريخ التركيب ضد عيوب الصناعة والخامات. يشمل الضمان استبدال أي قطعة يثبت بها عيب صناعي خلال فترة الضمان، بشرط التركيب الصحيح وفق تعليمات الشركة واستخدام المنتجات الأصلية. الضمان لا يشمل التلف الناتج عن سوء الاستخدام أو التركيب الخاطئ أو التعرض لمواد كيميائية غير مناسبة. للاستفادة من الضمان احتفظ بشهادة الضمان الخاصة بالشقة مع صور المعاينة.`;
app.get("/api/warranty", auth, (req, res) => {
  const files = db.prepare("SELECT * FROM warranty_files ORDER BY id DESC").all()
    .map(f => ({ ...f, url: `/api/uploads/${f.filename}` }));
  res.json({ ok: true, company: COMPANY, warranty: "ضمان 50 سنة", warrantyText: WARRANTY_TEXT,
    certificates: CERTIFICATES, files });
});
app.get("/api/warranty-files", auth, (req, res) => {
  const files = db.prepare("SELECT * FROM warranty_files ORDER BY id DESC").all();
  for (const f of files) {
    f.url = `/api/uploads/${f.filename}`;
    f.inspections = db.prepare("SELECT id, apartment, address, location, created_at FROM inspections WHERE warranty_file_id=? ORDER BY id DESC").all(f.id);
  }
  res.json({ ok: true, files });
});
app.post("/api/warranty-files", auth, requireRole("admin"), jsonUpload, (req, res) => {
  const { title, filename, mime, data } = req.body || {};
  if (!title || !data) return res.status(400).json({ ok: false, error: "العنوان والملف مطلوبان" });
  try {
    const f = saveUploadFile(filename || "certificate.pdf", data);
    const r = db.prepare("INSERT INTO warranty_files (title,filename,mime,size,uploaded_by) VALUES (?,?,?,?,?)")
      .run(String(title), f.name, String(mime || ""), f.size, req.user.id);
    res.json({ ok: true, id: r.lastInsertRowid, url: `/api/uploads/${f.name}` });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.delete("/api/warranty-files/:id", auth, requireRole("admin"), (req, res) => {
  const f = db.prepare("SELECT * FROM warranty_files WHERE id=?").get(req.params.id);
  if (!f) return res.status(404).json({ ok: false, error: "الشهادة غير موجودة" });
  const fp = path.join(UPLOADS_DIR, path.basename(f.filename));
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare("UPDATE inspections SET warranty_file_id=NULL WHERE warranty_file_id=?").run(f.id);
  db.prepare("DELETE FROM warranty_files WHERE id=?").run(f.id);
  res.json({ ok: true });
});

// معاينة الشقة — سجل لكل شقة: صور + عنوان وموقع + ملاحظات + شهادة ضمان مرتبطة
app.post("/api/inspections", auth, requireRole("salesrep", "technician", "admin"), (req, res) => {
  const { apartment, address, location, lat, lng, notes, technicianId, warrantyFileId } = req.body || {};
  if (!apartment) return res.status(400).json({ ok: false, error: "اسم الشقة مطلوب" });
  let wf = null;
  if (warrantyFileId) {
    wf = db.prepare("SELECT * FROM warranty_files WHERE id=?").get(Number(warrantyFileId));
    if (!wf) return res.status(400).json({ ok: false, error: "شهادة الضمان غير موجودة" });
  }
  const r = db.prepare(`INSERT INTO inspections (apartment,address,location,lat,lng,notes,created_by,technician_id,warranty_file_id)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(String(apartment), String(address || ""), String(location || ""),
    lat != null ? Number(lat) : null, lng != null ? Number(lng) : null, String(notes || ""),
    req.user.id, technicianId ? Number(technicianId) : null, wf ? wf.id : null);
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.get("/api/inspections", auth, (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === "admin" || u.role === "salesrep")
    rows = db.prepare("SELECT * FROM inspections ORDER BY id DESC LIMIT 100").all();
  else
    rows = db.prepare("SELECT * FROM inspections WHERE created_by=? OR technician_id=? ORDER BY id DESC LIMIT 100").all(u.id, u.id);
  for (const r of rows) {
    r.photos = db.prepare("SELECT COUNT(*) c FROM attachments WHERE entity_type='inspection' AND entity_id=?").get(r.id).c;
    r.itemsCount = db.prepare("SELECT COUNT(*) c FROM inspection_items WHERE inspection_id=?").get(r.id).c;
    const by = db.prepare("SELECT name FROM users WHERE id=?").get(r.created_by);
    r.createdByName = by ? by.name : "";
    const wf = r.warranty_file_id ? db.prepare("SELECT id,title FROM warranty_files WHERE id=?").get(r.warranty_file_id) : null;
    r.warranty = wf || null;
  }
  res.json({ ok: true, inspections: rows });
});
app.get("/api/inspections/:id", auth, (req, res) => {
  const r = db.prepare("SELECT * FROM inspections WHERE id=?").get(req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: "المعاينة غير موجودة" });
  const u = req.user;
  if (u.role !== "admin" && u.role !== "salesrep" && r.created_by !== u.id && r.technician_id !== u.id)
    return res.status(403).json({ ok: false, error: "لا تملك صلاحية عرض هذه المعاينة" });
  r.photos = db.prepare("SELECT * FROM attachments WHERE entity_type='inspection' AND entity_id=? ORDER BY id").all(r.id)
    .map(a => ({ ...a, url: `/api/uploads/${a.filename}` }));
  r.items = db.prepare("SELECT * FROM inspection_items WHERE inspection_id=? ORDER BY id").all(r.id)
    .map(i => ({ ...i, url: i.photo_filename ? `/api/uploads/${i.photo_filename}` : "" }));
  r.warranty = r.warranty_file_id ? db.prepare("SELECT * FROM warranty_files WHERE id=?").get(r.warranty_file_id) : null;
  if (r.warranty) r.warranty.url = `/api/uploads/${r.warranty.filename}`;
  const by = db.prepare("SELECT name FROM users WHERE id=?").get(r.created_by);
  r.createdByName = by ? by.name : "";
  const tech = r.technician_id ? db.prepare("SELECT name FROM users WHERE id=?").get(r.technician_id) : null;
  r.technicianName = tech ? tech.name : "";
  res.json({ ok: true, inspection: r });
});
// إضافة قطعة مصوَّرة لمَعاينة: الصورة تُرفَق، والقطعة تُختار من اللستة وتُسجَّل هنا،
// ويمكن بعدها إضافتها لحساب أجرة السباك من واجهة المعاينة.
app.post("/api/inspections/:id/items", auth, jsonUpload, requireRole("salesrep", "technician", "admin"), (req, res) => {
  const insp = db.prepare("SELECT * FROM inspections WHERE id=?").get(req.params.id);
  if (!insp) return res.status(404).json({ ok: false, error: "المعاينة غير موجودة" });
  const { catalogId, qty, photo, filename, mime, note } = req.body || {};
  const cat = db.prepare("SELECT * FROM catalog WHERE id=?").get(Number(catalogId));
  if (!cat) return res.status(400).json({ ok: false, error: "اختر قطعة من اللستة" });
  const q = Number(qty);
  if (!q || q <= 0) return res.status(400).json({ ok: false, error: "كمية غير صحيحة" });
  let photoName = "";
  try {
    if (photo) {
      const b64 = String(photo).includes(",") ? String(photo).split(",").pop() : String(photo);
      const f = saveUploadFile(filename || "part.jpg", b64);
      db.prepare("INSERT INTO attachments (entity_type,entity_id,kind,filename,mime,size,created_by) VALUES (?,?,?,?,?,?,?)")
        .run("inspection", insp.id, "photo", f.name, String(mime || "image/jpeg"), f.size, req.user.id);
      photoName = f.name;
    }
  } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
  const r = db.prepare(`INSERT INTO inspection_items (inspection_id,catalog_id,name,size,qty,photo_filename,note,created_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(insp.id, cat.id, cat.name, cat.size, q, photoName, String(note || ""), req.user.id);
  const item = db.prepare("SELECT * FROM inspection_items WHERE id=?").get(r.lastInsertRowid);
  res.json({ ok: true, item: { ...item, url: photoName ? `/api/uploads/${photoName}` : "" } });
});
app.put("/api/inspections/:id", auth, requireRole("salesrep", "technician", "admin"), (req, res) => {
  const r = db.prepare("SELECT * FROM inspections WHERE id=?").get(req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: "المعاينة غير موجودة" });
  const { address, location, notes, warrantyFileId } = req.body || {};
  if (warrantyFileId != null && warrantyFileId !== "") {
    const wf = db.prepare("SELECT * FROM warranty_files WHERE id=?").get(Number(warrantyFileId));
    if (!wf) return res.status(400).json({ ok: false, error: "شهادة الضمان غير موجودة" });
  }
  db.prepare(`UPDATE inspections SET address=COALESCE(?,address), location=COALESCE(?,location),
    notes=COALESCE(?,notes), warranty_file_id=COALESCE(?,warranty_file_id) WHERE id=?`)
    .run(address ?? null, location ?? null, notes ?? null,
      warrantyFileId === "" ? null : (warrantyFileId != null ? Number(warrantyFileId) : null), r.id);
  res.json({ ok: true });
});

// Health + SPA fallback
app.get("/api/health", (req, res) => res.json({ ok: true, app: "jad-therm", version: "1.0.0" }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, HOST, () => {
  console.log(`GAD THERM running at http://${HOST}:${PORT}`);
});
