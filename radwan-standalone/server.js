/**
 * معرض الرضوان — Al-Radwan Showroom — Standalone App
 * Node.js + Express + SQLite (node:sqlite, built-in)
 * Arabic RTL. Roles: super (روني) / admin (محمد) / user (حسام، الشيخ خالد)
 *
 * Mirrors the Muse artifact (m-rd-lrdwn): 4 users, 3 warehouses, 3 brands,
 * 4 categories, 341-item catalog, 4 prices per product, invoices, purchases,
 * debts, Khaled's private ledger, emergency vault, expenses, bundles,
 * plumber commissions, loyalty points, reminders, daily reports.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "radwan.db");
const CATALOG_PATH = path.join(__dirname, "data", "catalog.json");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
  password_hash TEXT NOT NULL, salt TEXT NOT NULL,
  phone TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS brands (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, group_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, size TEXT DEFAULT '', unit TEXT DEFAULT 'piece',
  section TEXT NOT NULL, brand_id INTEGER, barcode TEXT UNIQUE,
  list_price REAL NOT NULL, last_purchase_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(brand_id) REFERENCES brands(id)
);
CREATE TABLE IF NOT EXISTS product_stock (
  product_id INTEGER NOT NULL, warehouse_id INTEGER NOT NULL, qty REAL DEFAULT 0,
  PRIMARY KEY(product_id, warehouse_id),
  FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);
CREATE TABLE IF NOT EXISTS price_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
  field TEXT NOT NULL, old_price REAL, new_price REAL,
  changed_by INTEGER, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(changed_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
  phone TEXT DEFAULT '', address TEXT DEFAULT '',
  balance REAL DEFAULT 0, points REAL DEFAULT 0, demo INTEGER DEFAULT 0,
  last_activity TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL,
  customer_type TEXT NOT NULL, warehouse_id INTEGER NOT NULL,
  plumber_id INTEGER, subtotal REAL NOT NULL, qty_discount REAL DEFAULT 0,
  loyalty_redeemed REAL DEFAULT 0, total REAL NOT NULL, paid REAL DEFAULT 0,
  loyalty_earned REAL DEFAULT 0, created_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(customer_id) REFERENCES parties(id), FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY(plumber_id) REFERENCES parties(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
  product_id INTEGER, bundle_id INTEGER, name TEXT NOT NULL,
  qty REAL NOT NULL, unit_price REAL NOT NULL, line_total REAL NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES invoices(id),
  FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(bundle_id) REFERENCES bundles(id)
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL, total REAL NOT NULL, paid REAL DEFAULT 0,
  created_by INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(supplier_id) REFERENCES parties(id), FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL, qty REAL NOT NULL, unit_price REAL NOT NULL, line_total REAL NOT NULL,
  FOREIGN KEY(purchase_id) REFERENCES purchases(id), FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS debt_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, party_id INTEGER NOT NULL, kind TEXT NOT NULL,
  amount REAL NOT NULL, note TEXT DEFAULT '', created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(party_id) REFERENCES parties(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS khaled_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
  amount REAL NOT NULL, from_party TEXT DEFAULT '', to_party TEXT DEFAULT '',
  note TEXT DEFAULT '', created_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS vault_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
  amount REAL NOT NULL, note TEXT DEFAULT '', created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS expense_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, amount REAL NOT NULL,
  note TEXT DEFAULT '', created_by INTEGER, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(category_id) REFERENCES expense_categories(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bundle_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, bundle_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
  qty REAL NOT NULL, FOREIGN KEY(bundle_id) REFERENCES bundles(id), FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, plumber_id INTEGER NOT NULL, invoice_id INTEGER,
  amount REAL NOT NULL, status TEXT DEFAULT 'due',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(plumber_id) REFERENCES parties(id), FOREIGN KEY(invoice_id) REFERENCES invoices(id)
);
CREATE TABLE IF NOT EXISTS loyalty_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, party_id INTEGER NOT NULL, points REAL NOT NULL,
  reason TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(party_id) REFERENCES parties(id)
);
CREATE TABLE IF NOT EXISTS reminders_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, party_id INTEGER NOT NULL, kind TEXT NOT NULL,
  note TEXT DEFAULT '', created_by INTEGER, reminded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(party_id) REFERENCES parties(id), FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS components (
  key TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER DEFAULT 1
);
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString("hex"); }
function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function publicUser(u) {
  if (!u) return null;
  const { password_hash, salt, ...rest } = u;
  return rest;
}
function getSettings() {
  const out = {};
  for (const r of db.prepare("SELECT key, value FROM settings").all()) out[r.key] = r.value;
  return out;
}
function setDefault(key, value) {
  if (!db.prepare("SELECT 1 FROM settings WHERE key=?").get(key))
    db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(key, String(value));
}
// أسعار الشراء (الخصم على اللستة لكل مجموعة) وأسعار البيع — من الإعدادات
function purchaseDiscount(section, s) {
  const map = { ppr: +s.pricing_ppr, white: +s.pricing_white, gasket: +s.pricing_gasket, other: +s.pricing_other };
  return (map[section] ?? 0) / 100;
}
function tradePrice(p, s) { return round2(p.last_purchase_price); }
function premiumPrice(p, s) { return round2(p.list_price * (1 - (+s.pricing_premium || 18) / 100)); }
function retailPrice(p, s) { return round2(p.list_price * (1 - (+s.pricing_retail || 12) / 100)); }
function priceFor(p, type, s) {
  if (type === "premium") return premiumPrice(p, s);
  if (type === "retail") return retailPrice(p, s);
  return tradePrice(p, s); // trade (تجاري) = آخر سعر شراء
}
function withPrices(p, s) {
  const trade = tradePrice(p, s), premium = premiumPrice(p, s), retail = retailPrice(p, s);
  return {
    ...p,
    tradePrice: trade, premiumPrice: premium, retailPrice: retail,
    margin: round2(retail - p.last_purchase_price),
    marginPct: p.last_purchase_price ? round2(((retail - p.last_purchase_price) / p.last_purchase_price) * 100) : 0,
  };
}
function stockOf(productId, warehouseId) {
  const r = db.prepare("SELECT qty FROM product_stock WHERE product_id=? AND warehouse_id=?").get(productId, warehouseId);
  return r ? r.qty : 0;
}
function setStock(productId, warehouseId, qty) {
  db.prepare(`INSERT INTO product_stock (product_id, warehouse_id, qty) VALUES (?,?,?)
    ON CONFLICT(product_id, warehouse_id) DO UPDATE SET qty=excluded.qty`).run(productId, warehouseId, qty);
}
function addStock(productId, warehouseId, delta) { setStock(productId, warehouseId, round2(stockOf(productId, warehouseId) + delta)); }
function withTx(fn) {
  // node:sqlite has no db.transaction() (that's better-sqlite3) — do it manually
  db.exec("BEGIN IMMEDIATE");
  try { const out = fn(); db.exec("COMMIT"); return out; }
  catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; }
}
function vaultBalance() {
  const r = db.prepare("SELECT COALESCE(SUM(CASE WHEN kind IN ('deposit','auto') THEN amount ELSE -amount END),0) bal FROM vault_transactions").get();
  return round2(r.bal);
}
function logPrice(productId, field, oldP, newP, userId) {
  if (round2(oldP) === round2(newP)) return;
  db.prepare("INSERT INTO price_log (product_id, field, old_price, new_price, changed_by) VALUES (?,?,?,?,?)")
    .run(productId, field, round2(oldP), round2(newP), userId || null);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
const COMPONENTS = [
  ["products", "المنتجات والأسعار"], ["invoices", "الفواتير"], ["purchases", "المشتريات"],
  ["debts", "المديونيات"], ["parties", "الزباين والأطراف"], ["plumbers", "دليل السباكين"],
  ["suppliers", "الموردون"], ["khaled_ledger", "دفتر الشيخ خالد"], ["vault", "الخزنة"],
  ["expenses", "المصاريف"], ["bundles", "الباقات والعروض"], ["commissions", "عمولات السباكين"],
  ["loyalty", "نقاط الولاء"], ["reminders", "التذكيرات"], ["reports", "التقارير"],
  ["settings", "الإعدادات"], ["barcode", "الباركود والمسح"], ["voice", "البحث والأوامر الصوتية"],
  ["whatsapp", "مشاركة واتساب"], ["low_stock", "تنبيه النواقص"],
];
function seed() {
  if (db.prepare("SELECT COUNT(*) c FROM users").get().c === 0) {
    const mk = (username, name, role, password) => {
      const salt = crypto.randomBytes(16).toString("hex");
      db.prepare("INSERT INTO users (username,name,role,password_hash,salt) VALUES (?,?,?,?,?)")
        .run(username, name, role, hashPassword(password, salt), salt);
    };
    mk("rony", "روني", "super", "123456");
    mk("mohamed", "محمد عبد الرحيم", "admin", "123456");
    mk("hossam", "حسام أغا", "user", "123456");
    mk("khaled", "الشيخ خالد البسيوني", "user", "123456");
  }
  if (db.prepare("SELECT COUNT(*) c FROM warehouses").get().c === 0) {
    const ins = db.prepare("INSERT INTO warehouses (name) VALUES (?)");
    ins.run("مخزن المعرض"); ins.run("المخزن الرئيسي"); ins.run("مخزن عام");
  }
  if (db.prepare("SELECT COUNT(*) c FROM brands").get().c === 0) {
    const ins = db.prepare("INSERT INTO brands (name) VALUES (?)");
    ins.run("منتجات شركة جاد"); ins.run("منتجات شركة روكسي"); ins.run("نواكل");
  }
  if (db.prepare("SELECT COUNT(*) c FROM categories").get().c === 0) {
    const ins = db.prepare("INSERT INTO categories (name, group_key) VALUES (?,?)");
    ins.run("البولي (لحام)", "ppr");
    ins.run("الصرف الصحي الأبيض", "white");
    ins.run("الجوان ولوازمه", "gasket");
    ins.run("لوازم عامة", "other");
  }
  if (db.prepare("SELECT COUNT(*) c FROM components").get().c === 0) {
    const ins = db.prepare("INSERT INTO components (key,name,enabled) VALUES (?,?,1)");
    for (const [k, n] of COMPONENTS) ins.run(k, n);
  }
  if (db.prepare("SELECT COUNT(*) c FROM expense_categories").get().c === 0) {
    const ins = db.prepare("INSERT INTO expense_categories (name) VALUES (?)");
    for (const n of ["إيجار", "كهرباء ومياه", "مواصلات", "أكل وشرب", "صيانة", "متنوعة"]) ins.run(n);
  }
  // إعدادات التسعير — مطابقة للنسخة الحية (التحقق 2026-11-18)
  setDefault("pricing_ppr", 20); setDefault("pricing_white", 18);
  setDefault("pricing_gasket", 0); setDefault("pricing_other", 0);
  setDefault("pricing_premium", 18); setDefault("pricing_retail", 12);
  // الخزنة والمصاريف والمبيعات والتذكيرات — أرقامها تُحدد من الإعدادات (روني لم يذكر أرقاماً بعد)
  setDefault("vault_mode", "fixed"); setDefault("vault_fixed_amount", 0); setDefault("vault_percent", 0);
  setDefault("vault_min_balance", 0);
  setDefault("expense_daily_budget", 0);
  setDefault("qty_discount_threshold", 10); setDefault("qty_discount_pct", 5);
  setDefault("commission_rate", 5); setDefault("loyalty_point_value", 1);
  setDefault("reminder_days", 30); setDefault("reminder_repeat_days", 7);
  setDefault("low_stock_threshold", 5);
  setDefault("whatsapp_group", ""); // رقم/رابط جروب المعرض للمشاركة
  // الكتالوج: 341 صنف من لستة جاد ثيرم
  if (db.prepare("SELECT COUNT(*) c FROM products").get().c === 0) {
    const s = getSettings();
    const items = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
    const ins = db.prepare(`INSERT INTO products
      (id, name, size, unit, section, brand_id, barcode, list_price, last_purchase_price)
      VALUES (?,?,?,?,?,?,?, ?,?)`);
    for (const it of items) {
      const disc = purchaseDiscount(it.section, s);
      const lastPurchase = round2(it.price * (1 - disc));
      const barcode = "RAD-" + String(it.id).padStart(4, "0");
      ins.run(it.id, it.name, it.size || "", it.unit || "piece", it.section, 1, barcode, it.price, lastPurchase);
    }
  }
  // 3 سباكين تجريبيين — معلّمين للحذف بانتظار شيت الإكسل من روني
  if (db.prepare("SELECT COUNT(*) c FROM parties WHERE type='plumber'").get().c === 0) {
    const ins = db.prepare("INSERT INTO parties (name,type,demo) VALUES (?,'plumber',1)");
    ins.run("سباك تجريبي 1"); ins.run("سباك تجريبي 2"); ins.run("سباك تجريبي 3");
  }
}
seed();

// ---------------------------------------------------------------------------
// App + auth
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ ok: false, error: "سجّل الدخول أولاً" });
  const sess = db.prepare("SELECT * FROM sessions WHERE token=? AND expires_at > datetime('now')").get(token);
  if (!sess) return res.status(401).json({ ok: false, error: "الجلسة منتهية — سجّل الدخول مجدداً" });
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(sess.user_id);
  if (!u) return res.status(401).json({ ok: false, error: "المستخدم غير موجود" });
  req.user = publicUser(u);
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية لهذا الإجراء" });
    next();
  };
}
// دفتر الشيخ خالد: هو فقط + روني (سوبر أدمن)
function khaledOnly(req, res, next) {
  if (req.user.username === "khaled" || req.user.role === "super") return next();
  return res.status(403).json({ ok: false, error: "دفتر الشيخ خالد خاص — لا يراه إلا هو وروني" });
}
function componentEnabled(key) {
  const r = db.prepare("SELECT enabled FROM components WHERE key=?").get(key);
  return r ? r.enabled === 1 : true;
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
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
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
app.put("/api/profile/phone", auth, (req, res) => {
  const { userId, phone } = req.body || {};
  const target = userId ? Number(userId) : req.user.id;
  // أي مستخدم يعدّل رقمه؛ تعديل رقم غيره للأدمن والسوبر فقط
  if (target !== req.user.id && !["admin", "super"].includes(req.user.role))
    return res.status(403).json({ ok: false, error: "لا تملك صلاحية تعديل رقم غيرك" });
  db.prepare("UPDATE users SET phone=? WHERE id=?").run(String(phone || ""), target);
  res.json({ ok: true, user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(target)) });
});
app.get("/api/users", auth, requireRole("super", "admin"), (req, res) => {
  const rows = db.prepare("SELECT id,username,name,role,phone,created_at FROM users ORDER BY id").all();
  res.json({ ok: true, users: rows });
});

// ---------------------------------------------------------------------------
// API: lookups (warehouses / brands / categories / components / settings)
// ---------------------------------------------------------------------------
app.get("/api/warehouses", auth, (req, res) => res.json({ ok: true, warehouses: db.prepare("SELECT * FROM warehouses ORDER BY id").all() }));
app.get("/api/brands", auth, (req, res) => res.json({ ok: true, brands: db.prepare("SELECT * FROM brands ORDER BY id").all() }));
app.post("/api/brands", auth, requireRole("super", "admin"), (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "اكتب اسم الماركة" });
  const r = db.prepare("INSERT INTO brands (name) VALUES (?)").run(String(name));
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.get("/api/categories", auth, (req, res) => res.json({ ok: true, categories: db.prepare("SELECT * FROM categories ORDER BY id").all() }));
app.post("/api/categories", auth, requireRole("super", "admin"), (req, res) => {
  const { name, group_key } = req.body || {};
  if (!name || !group_key) return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  const r = db.prepare("INSERT INTO categories (name, group_key) VALUES (?,?)").run(String(name), String(group_key));
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.get("/api/components", auth, (req, res) => res.json({ ok: true, components: db.prepare("SELECT * FROM components ORDER BY rowid").all() }));
app.put("/api/components/:key", auth, requireRole("super"), (req, res) => {
  const { enabled } = req.body || {};
  const r = db.prepare("UPDATE components SET enabled=? WHERE key=?").run(enabled ? 1 : 0, req.params.key);
  if (!r.changes) return res.status(404).json({ ok: false, error: "المكوّن غير موجود" });
  res.json({ ok: true });
});
app.get("/api/settings", auth, (req, res) => res.json({ ok: true, settings: getSettings() }));
app.put("/api/settings", auth, requireRole("super", "admin"), (req, res) => {
  const body = req.body || {};
  const up = db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  for (const [k, v] of Object.entries(body)) up.run(k, String(v));
  res.json({ ok: true, settings: getSettings() });
});

// ---------------------------------------------------------------------------
// API: products (+ barcode, stock, price log)
// ---------------------------------------------------------------------------
app.get("/api/products", auth, (req, res) => {
  const { q, section, brandId, warehouseId } = req.query;
  const s = getSettings();
  let rows = db.prepare("SELECT * FROM products ORDER BY section, name, size").all();
  if (section) rows = rows.filter(p => p.section === section);
  if (brandId) rows = rows.filter(p => String(p.brand_id) === String(brandId));
  if (q) {
    const needle = String(q).trim();
    rows = rows.filter(p => (p.name + " " + p.size + " " + (p.barcode || "")).includes(needle));
  }
  let out = rows.map(p => withPrices(p, s));
  if (warehouseId) out = out.map(p => ({ ...p, stock: stockOf(p.id, Number(warehouseId)) }));
  res.json({ ok: true, products: out, count: out.length });
});
app.get("/api/products/barcode/:code", auth, (req, res) => {
  const s = getSettings();
  const p = db.prepare("SELECT * FROM products WHERE barcode=?").get(req.params.code);
  if (!p) return res.status(404).json({ ok: false, error: "لا يوجد منتج بهذا الباركود" });
  res.json({ ok: true, product: withPrices(p, s) });
});
app.get("/api/products/:id", auth, (req, res) => {
  const s = getSettings();
  const p = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: "المنتج غير موجود" });
  const stock = db.prepare(`SELECT w.id warehouse_id, w.name warehouse, COALESCE(ps.qty,0) qty
    FROM warehouses w LEFT JOIN product_stock ps ON ps.warehouse_id=w.id AND ps.product_id=? ORDER BY w.id`).all(p.id);
  res.json({ ok: true, product: withPrices(p, s), stock });
});
app.post("/api/products", auth, requireRole("super", "admin"), (req, res) => {
  const { name, size, unit, section, brand_id, barcode, list_price } = req.body || {};
  if (!name || !section || list_price == null) return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  const s = getSettings();
  const lastPurchase = round2(Number(list_price) * (1 - purchaseDiscount(section, s)));
  try {
    const r = db.prepare(`INSERT INTO products (name,size,unit,section,brand_id,barcode,list_price,last_purchase_price)
      VALUES (?,?,?,?,?,?,?,?)`).run(name, size || "", unit || "piece", section, brand_id || 1,
      barcode || ("RAD-" + Date.now()), Number(list_price), lastPurchase);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ ok: false, error: "الباركود مستخدم من قبل" }); }
});
app.put("/api/products/:id", auth, requireRole("super", "admin"), (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: "المنتج غير موجود" });
  const b = req.body || {};
  const next = {
    name: b.name ?? p.name, size: b.size ?? p.size, unit: b.unit ?? p.unit,
    section: b.section ?? p.section, brand_id: b.brand_id ?? p.brand_id,
    barcode: b.barcode ?? p.barcode,
    list_price: b.list_price != null ? Number(b.list_price) : p.list_price,
    last_purchase_price: b.last_purchase_price != null ? Number(b.last_purchase_price) : p.last_purchase_price,
  };
  logPrice(p.id, "list_price", p.list_price, next.list_price, req.user.id);
  logPrice(p.id, "last_purchase_price", p.last_purchase_price, next.last_purchase_price, req.user.id);
  db.prepare(`UPDATE products SET name=?,size=?,unit=?,section=?,brand_id=?,barcode=?,list_price=?,last_purchase_price=? WHERE id=?`)
    .run(next.name, next.size, next.unit, next.section, next.brand_id, next.barcode, next.list_price, next.last_purchase_price, p.id);
  res.json({ ok: true });
});
app.delete("/api/products/:id", auth, requireRole("super", "admin"), (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.get("/api/price-log", auth, (req, res) => {
  const rows = db.prepare(`SELECT pl.*, p.name product_name, u.name changed_by_name
    FROM price_log pl LEFT JOIN products p ON p.id=pl.product_id LEFT JOIN users u ON u.id=pl.changed_by
    ORDER BY pl.id DESC LIMIT 200`).all();
  res.json({ ok: true, log: rows });
});

// ---------------------------------------------------------------------------
// API: parties (customers / suppliers / plumbers) + bulk import
// ---------------------------------------------------------------------------
app.get("/api/parties", auth, (req, res) => {
  const { type } = req.query;
  let rows = db.prepare("SELECT * FROM parties ORDER BY name").all();
  if (type) rows = rows.filter(p => p.type === type);
  res.json({ ok: true, parties: rows });
});
app.post("/api/parties", auth, (req, res) => {
  const { name, type, phone, address } = req.body || {};
  if (!name || !type) return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  const r = db.prepare("INSERT INTO parties (name,type,phone,address) VALUES (?,?,?,?)")
    .run(name, type, phone || "", address || "");
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.put("/api/parties/:id", auth, (req, res) => {
  const b = req.body || {};
  const p = db.prepare("SELECT * FROM parties WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: "غير موجود" });
  db.prepare("UPDATE parties SET name=?, type=?, phone=?, address=? WHERE id=?")
    .run(b.name ?? p.name, b.type ?? p.type, b.phone ?? p.phone, b.address ?? p.address, p.id);
  res.json({ ok: true });
});
app.delete("/api/parties/:id", auth, (req, res) => {
  const p = db.prepare("SELECT * FROM parties WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: "غير موجود" });
  if (Math.abs(p.balance) > 0.009) return res.status(400).json({ ok: false, error: "لا يمكن حذف طرف عليه مديونية" });
  db.prepare("DELETE FROM parties WHERE id=?").run(p.id);
  res.json({ ok: true });
});
// استيراد جماعي: سطور "الاسم، التليفون، العنوان" أو "الاسم - التليفون"
app.post("/api/parties/import", auth, (req, res) => {
  const { type, lines } = req.body || {};
  if (!type || !lines) return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  const ins = db.prepare("INSERT INTO parties (name,type,phone,address) VALUES (?,?,?,?)");
  let added = 0;
  for (const raw of String(lines).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,،\-–]/).map(x => x.trim());
    ins.run(parts[0], type, parts[1] || "", parts[2] || "");
    added++;
  }
  res.json({ ok: true, added });
});

// ---------------------------------------------------------------------------
// API: invoices
// ---------------------------------------------------------------------------
function invoiceText(inv, items, customer) {
  const lines = items.map(i => `• ${i.name} × ${i.qty} = ${fmt2(i.line_total)} ج`).join("\n");
  return `فاتورة معرض الرضوان #${inv.id}\nالعميل: ${customer ? customer.name : ""}\n${lines}\nالإجمالي: ${fmt2(inv.total)} جنيه\nالمدفوع: ${fmt2(inv.paid)} جنيه\nالمتبقي: ${fmt2(inv.total - inv.paid)} جنيه`;
}
function fmt2(n) { return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }); }

app.get("/api/invoices", auth, (req, res) => {
  const rows = db.prepare(`SELECT i.*, p.name customer_name FROM invoices i
    LEFT JOIN parties p ON p.id=i.customer_id ORDER BY i.id DESC LIMIT 200`).all();
  res.json({ ok: true, invoices: rows });
});
app.get("/api/invoices/:id", auth, (req, res) => {
  const inv = db.prepare("SELECT * FROM invoices WHERE id=?").get(req.params.id);
  if (!inv) return res.status(404).json({ ok: false, error: "الفاتورة غير موجودة" });
  const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id=?").all(inv.id);
  const customer = db.prepare("SELECT * FROM parties WHERE id=?").get(inv.customer_id);
  res.json({ ok: true, invoice: inv, items, customer, text: invoiceText(inv, items, customer) });
});
app.post("/api/invoices", auth, (req, res) => {
  const { customerId, customerType, warehouseId, items, paid, useLoyalty, plumberId } = req.body || {};
  const type = ["trade", "premium", "retail"].includes(customerType) ? customerType : "trade";
  const wh = Number(warehouseId) || 1;
  const customer = db.prepare("SELECT * FROM parties WHERE id=?").get(Number(customerId));
  if (!customer) return res.status(400).json({ ok: false, error: "اختر العميل" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ ok: false, error: "الفاتورة فارغة" });
  const s = getSettings();
  const qtyThreshold = +s.qty_discount_threshold || 0;
  const qtyPct = +s.qty_discount_pct || 0;
  const pointValue = +s.loyalty_point_value || 1;

  // تجهيز البنود + التحقق من المخزون أولاً (بدون خصم)
  let subtotal = 0, totalQty = 0;
  const lines = [];
  for (const it of items) {
    if (it.bundleId) {
      const b = db.prepare("SELECT * FROM bundles WHERE id=?").get(Number(it.bundleId));
      if (!b) return res.status(400).json({ ok: false, error: "باقة غير موجودة" });
      const q = Number(it.qty) || 1;
      const comps = db.prepare("SELECT * FROM bundle_items WHERE bundle_id=?").all(b.id);
      for (const c of comps) {
        if (stockOf(c.product_id, wh) < c.qty * q)
          return res.status(400).json({ ok: false, error: `المخزون لا يكفي لباقة ${b.name}` });
      }
      lines.push({ productId: null, bundleId: b.id, name: `باقة: ${b.name}`, qty: q, unitPrice: b.price, comps });
      subtotal += round2(b.price * q); totalQty += q;
    } else {
      const p = db.prepare("SELECT * FROM products WHERE id=?").get(Number(it.productId));
      if (!p) return res.status(400).json({ ok: false, error: "منتج غير موجود" });
      const q = Number(it.qty) || 0;
      if (q <= 0) return res.status(400).json({ ok: false, error: "الكمية غير صحيحة" });
      if (stockOf(p.id, wh) < q)
        return res.status(400).json({ ok: false, error: `المخزون لا يكفي: ${p.name} ${p.size} (المتاح ${stockOf(p.id, wh)})` });
      const unit = priceFor(p, type, s);
      lines.push({ productId: p.id, bundleId: null, name: `${p.name} ${p.size}`.trim(), qty: q, unitPrice: unit });
      subtotal += round2(unit * q); totalQty += q;
    }
  }
  subtotal = round2(subtotal);
  const qtyDiscount = (qtyThreshold > 0 && totalQty >= qtyThreshold) ? round2(subtotal * qtyPct / 100) : 0;
  let afterQty = round2(subtotal - qtyDiscount);
  let loyaltyRedeemed = 0;
  if (useLoyalty && customer.points > 0) {
    loyaltyRedeemed = round2(Math.min(customer.points * pointValue, afterQty));
    afterQty = round2(afterQty - loyaltyRedeemed);
  }
  const total = afterQty;
  const paidAmt = round2(Math.min(Number(paid) || 0, total));
  const remaining = round2(total - paidAmt);
  const earned = Math.floor(total); // نقطة لكل جنيه

  const tx = () => withTx(() => {
    const r = db.prepare(`INSERT INTO invoices
      (customer_id, customer_type, warehouse_id, plumber_id, subtotal, qty_discount, loyalty_redeemed, total, paid, loyalty_earned, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(customer.id, type, wh, plumberId || null, subtotal, qtyDiscount,
      loyaltyRedeemed, total, paidAmt, earned, req.user.id);
    const invId = r.lastInsertRowid;
    const insItem = db.prepare("INSERT INTO invoice_items (invoice_id, product_id, bundle_id, name, qty, unit_price, line_total) VALUES (?,?,?,?,?,?,?)");
    for (const l of lines) {
      insItem.run(invId, l.productId, l.bundleId, l.name, l.qty, l.unitPrice, round2(l.unitPrice * l.qty));
      if (l.productId) addStock(l.productId, wh, -l.qty);
      if (l.comps) for (const c of l.comps) addStock(c.product_id, wh, -(c.qty * l.qty));
    }
    db.prepare("UPDATE parties SET balance=balance+?, points=points-?+?, last_activity=datetime('now') WHERE id=?")
      .run(remaining, loyaltyRedeemed / pointValue, earned, customer.id);
    if (loyaltyRedeemed > 0)
      db.prepare("INSERT INTO loyalty_log (party_id, points, reason) VALUES (?,?,'استبدال في فاتورة')").run(customer.id, -(loyaltyRedeemed / pointValue));
    if (earned > 0)
      db.prepare("INSERT INTO loyalty_log (party_id, points, reason) VALUES (?,?,'نقاط فاتورة')").run(customer.id, earned);
    if (remaining > 0)
      db.prepare("INSERT INTO debt_entries (party_id, kind, amount, note, created_by) VALUES (?, 'sale', ?, ?, ?)")
        .run(customer.id, remaining, `فاتورة #${invId}`, req.user.id);
    if (paidAmt > 0) {
      // تحويل تلقائي للخزنة من نقدية اليوم (ثابت أو نسبة — من الإعدادات)
      const mode = s.vault_mode || "fixed";
      const dep = mode === "percent" ? round2(paidAmt * (+s.vault_percent || 0) / 100) : round2(+s.vault_fixed_amount || 0);
      if (dep > 0)
        db.prepare("INSERT INTO vault_transactions (kind, amount, note, created_by) VALUES ('auto', ?, ?, ?)")
          .run(dep, `تحويل تلقائي من فاتورة #${invId}`, req.user.id);
    }
    if (plumberId) {
      const rate = +s.commission_rate || 0;
      const amt = round2(total * rate / 100);
      if (amt > 0)
        db.prepare("INSERT INTO commissions (plumber_id, invoice_id, amount) VALUES (?,?,?)").run(plumberId, invId, amt);
    }
    return invId;
  });
  const invId = tx();
  const inv = db.prepare("SELECT * FROM invoices WHERE id=?").get(invId);
  const invItems = db.prepare("SELECT * FROM invoice_items WHERE invoice_id=?").all(invId);
  res.json({ ok: true, invoice: inv, items: invItems, text: invoiceText(inv, invItems, customer) });
});

// ---------------------------------------------------------------------------
// API: purchases
// ---------------------------------------------------------------------------
app.get("/api/purchases", auth, (req, res) => {
  const rows = db.prepare(`SELECT pu.*, p.name supplier_name FROM purchases pu
    LEFT JOIN parties p ON p.id=pu.supplier_id ORDER BY pu.id DESC LIMIT 200`).all();
  res.json({ ok: true, purchases: rows });
});
app.post("/api/purchases", auth, (req, res) => {
  const { supplierId, warehouseId, items, paid } = req.body || {};
  const wh = Number(warehouseId) || 1;
  const supplier = db.prepare("SELECT * FROM parties WHERE id=?").get(Number(supplierId));
  if (!supplier) return res.status(400).json({ ok: false, error: "اختر المورد" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ ok: false, error: "المشتريات فارغة" });
  let total = 0;
  const lines = [];
  for (const it of items) {
    const p = db.prepare("SELECT * FROM products WHERE id=?").get(Number(it.productId));
    if (!p) return res.status(400).json({ ok: false, error: "منتج غير موجود" });
    const q = Number(it.qty) || 0, price = Number(it.unitPrice);
    if (q <= 0 || !(price >= 0)) return res.status(400).json({ ok: false, error: "بيانات بند غير صحيحة" });
    lines.push({ p, q, price });
    total += round2(price * q);
  }
  total = round2(total);
  const paidAmt = round2(Math.min(Number(paid) || 0, total));
  const remaining = round2(total - paidAmt); // مديونية على المعرض للمورد
  const tx = () => withTx(() => {
    const r = db.prepare("INSERT INTO purchases (supplier_id, warehouse_id, total, paid, created_by) VALUES (?,?,?,?,?)")
      .run(supplier.id, wh, total, paidAmt, req.user.id);
    const pid = r.lastInsertRowid;
    const ins = db.prepare("INSERT INTO purchase_items (purchase_id, product_id, qty, unit_price, line_total) VALUES (?,?,?,?,?)");
    for (const l of lines) {
      ins.run(pid, l.p.id, l.q, l.price, round2(l.price * l.q));
      addStock(l.p.id, wh, l.q);
      // آخر سعر شراء يتحدث من المشتريات + سجل تغيير السعر
      logPrice(l.p.id, "last_purchase_price", l.p.last_purchase_price, l.price, req.user.id);
      db.prepare("UPDATE products SET last_purchase_price=? WHERE id=?").run(l.price, l.p.id);
    }
    db.prepare("UPDATE parties SET balance=balance+?, last_activity=datetime('now') WHERE id=?").run(remaining, supplier.id);
    if (remaining > 0)
      db.prepare("INSERT INTO debt_entries (party_id, kind, amount, note, created_by) VALUES (?, 'purchase', ?, ?, ?)")
        .run(supplier.id, remaining, `مشتريات #${pid}`, req.user.id);
    return pid;
  });
  res.json({ ok: true, id: tx() });
});

// ---------------------------------------------------------------------------
// API: debts
// ---------------------------------------------------------------------------
app.get("/api/debts", auth, (req, res) => {
  const rows = db.prepare(`SELECT d.*, p.name party_name, p.type party_type, u.name created_by_name
    FROM debt_entries d LEFT JOIN parties p ON p.id=d.party_id LEFT JOIN users u ON u.id=d.created_by
    ORDER BY d.id DESC LIMIT 300`).all();
  res.json({ ok: true, debts: rows });
});
app.get("/api/debts/summary", auth, (req, res) => {
  const parties = db.prepare("SELECT * FROM parties WHERE balance != 0 ORDER BY balance DESC").all();
  const customersOwe = round2(parties.filter(p => p.type !== "supplier" && p.balance > 0).reduce((a, p) => a + p.balance, 0));
  const weOwe = round2(parties.filter(p => p.type === "supplier" && p.balance > 0).reduce((a, p) => a + p.balance, 0));
  res.json({ ok: true, parties, customersOwe, weOwe });
});
app.post("/api/debts", auth, (req, res) => {
  const { partyId, amount, kind, note } = req.body || {};
  const party = db.prepare("SELECT * FROM parties WHERE id=?").get(Number(partyId));
  if (!party) return res.status(400).json({ ok: false, error: "اختر الطرف" });
  const amt = Number(amount);
  if (!(amt > 0)) return res.status(400).json({ ok: false, error: "اكتب مبلغاً صحيحاً" });
  const k = kind || "payment";
  // payment: الطرف دفع لنا → مديونيته تنقص. charge: زيادة مديونية
  const delta = k === "payment" ? -amt : amt;
  db.prepare("UPDATE parties SET balance=balance+?, last_activity=datetime('now') WHERE id=?").run(delta, party.id);
  const r = db.prepare("INSERT INTO debt_entries (party_id, kind, amount, note, created_by) VALUES (?,?,?,?,?)")
    .run(party.id, k, delta, note || "", req.user.id);
  res.json({ ok: true, id: r.lastInsertRowid, balance: round2(party.balance + delta) });
});

// ---------------------------------------------------------------------------
// API: Khaled ledger — الشيخ خالد + روني فقط (يُفرض على السيرفر)
// ---------------------------------------------------------------------------
app.get("/api/khaled-ledger", auth, khaledOnly, (req, res) => {
  const rows = db.prepare(`SELECT k.*, u.name created_by_name FROM khaled_ledger k
    LEFT JOIN users u ON u.id=k.created_by ORDER BY k.id DESC LIMIT 300`).all();
  const inn = round2(rows.filter(r => r.kind === "in").reduce((a, r) => a + r.amount, 0));
  const out = round2(rows.filter(r => r.kind === "out").reduce((a, r) => a + r.amount, 0));
  res.json({ ok: true, entries: rows, totalIn: inn, totalOut: out, balance: round2(inn - out) });
});
app.post("/api/khaled-ledger", auth, khaledOnly, (req, res) => {
  const { kind, amount, from_party, to_party, note } = req.body || {};
  if (!["in", "out"].includes(kind) || !(Number(amount) > 0))
    return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  const r = db.prepare("INSERT INTO khaled_ledger (kind, amount, from_party, to_party, note, created_by) VALUES (?,?,?,?,?,?)")
    .run(kind, Number(amount), from_party || "", to_party || "", note || "", req.user.id);
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.delete("/api/khaled-ledger/:id", auth, khaledOnly, (req, res) => {
  const e = db.prepare("SELECT * FROM khaled_ledger WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ ok: false, error: "القيد غير موجود" });
  db.prepare("DELETE FROM khaled_ledger WHERE id=?").run(e.id);
  // سجل تدقيق بسيط في سجلات السيرفر (لا يوجد جدول سجلات عام في التطبيق)
  console.log(`[khaled-ledger delete] id=${e.id} kind=${e.kind} amount=${e.amount} from=${e.from_party} to=${e.to_party} note=${e.note} created_at=${e.created_at} deleted_by=${req.user.username} (${req.user.name}) at ${new Date().toISOString()}`);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API: vault (خزنة الطوارئ) + expenses (المصاريف)
// ---------------------------------------------------------------------------
app.get("/api/vault", auth, (req, res) => {
  const rows = db.prepare(`SELECT v.*, u.name created_by_name FROM vault_transactions v
    LEFT JOIN users u ON u.id=v.created_by ORDER BY v.id DESC LIMIT 200`).all();
  res.json({ ok: true, balance: vaultBalance(), transactions: rows });
});
app.post("/api/vault/deposit", auth, (req, res) => {
  const { amount, note } = req.body || {};
  if (!(Number(amount) > 0)) return res.status(400).json({ ok: false, error: "اكتب مبلغاً صحيحاً" });
  const r = db.prepare("INSERT INTO vault_transactions (kind, amount, note, created_by) VALUES ('deposit',?,?,?)")
    .run(Number(amount), note || "", req.user.id);
  res.json({ ok: true, id: r.lastInsertRowid, balance: vaultBalance() });
});
app.post("/api/vault/withdraw", auth, requireRole("super"), (req, res) => {
  const { amount, note } = req.body || {};
  if (!(Number(amount) > 0)) return res.status(400).json({ ok: false, error: "اكتب مبلغاً صحيحاً" });
  if (Number(amount) > vaultBalance()) return res.status(400).json({ ok: false, error: "رصيد الخزنة لا يكفي" });
  const r = db.prepare("INSERT INTO vault_transactions (kind, amount, note, created_by) VALUES ('withdraw',?,?,?)")
    .run(Number(amount), note || "", req.user.id);
  res.json({ ok: true, id: r.lastInsertRowid, balance: vaultBalance() });
});
app.get("/api/expense-categories", auth, (req, res) =>
  res.json({ ok: true, categories: db.prepare("SELECT * FROM expense_categories ORDER BY id").all() }));
app.post("/api/expense-categories", auth, requireRole("super", "admin"), (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "اكتب اسم التصنيف" });
  const r = db.prepare("INSERT INTO expense_categories (name) VALUES (?)").run(String(name));
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.get("/api/expenses", auth, (req, res) => {
  const rows = db.prepare(`SELECT e.*, c.name category_name, u.name created_by_name FROM expenses e
    LEFT JOIN expense_categories c ON c.id=e.category_id LEFT JOIN users u ON u.id=e.created_by
    ORDER BY e.id DESC LIMIT 300`).all();
  res.json({ ok: true, expenses: rows });
});
app.post("/api/expenses", auth, (req, res) => {
  const { categoryId, amount, note } = req.body || {};
  if (!(Number(amount) > 0)) return res.status(400).json({ ok: false, error: "اكتب مبلغاً صحيحاً" });
  const cat = db.prepare("SELECT * FROM expense_categories WHERE id=?").get(Number(categoryId));
  if (!cat) return res.status(400).json({ ok: false, error: "اختر التصنيف" });
  const r = db.prepare("INSERT INTO expenses (category_id, amount, note, created_by) VALUES (?,?,?,?)")
    .run(cat.id, Number(amount), note || "", req.user.id);
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.get("/api/expenses/report", auth, (req, res) => {
  const { from, to } = req.query;
  const f = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const t = to || new Date().toISOString().slice(0, 10);
  const byCat = db.prepare(`SELECT c.name category, COALESCE(SUM(e.amount),0) total
    FROM expense_categories c LEFT JOIN expenses e ON e.category_id=c.id AND date(e.created_at) BETWEEN ? AND ?
    GROUP BY c.id ORDER BY total DESC`).all(f, t);
  const byDay = db.prepare(`SELECT date(created_at) day, SUM(amount) total FROM expenses
    WHERE date(created_at) BETWEEN ? AND ? GROUP BY day ORDER BY day`).all(f, t);
  const total = round2(byCat.reduce((a, r) => a + r.total, 0));
  res.json({ ok: true, from: f, to: t, total, byCategory: byCat, byDay });
});

// ---------------------------------------------------------------------------
// API: bundles / commissions / loyalty
// ---------------------------------------------------------------------------
app.get("/api/bundles", auth, (req, res) => {
  const bundles = db.prepare("SELECT * FROM bundles ORDER BY id").all();
  for (const b of bundles)
    b.items = db.prepare(`SELECT bi.*, p.name, p.size FROM bundle_items bi
      LEFT JOIN products p ON p.id=bi.product_id WHERE bi.bundle_id=?`).all(b.id);
  res.json({ ok: true, bundles });
});
app.post("/api/bundles", auth, requireRole("super", "admin"), (req, res) => {
  const { name, price, items } = req.body || {};
  if (!name || !(Number(price) >= 0) || !Array.isArray(items) || !items.length)
    return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  const r = db.prepare("INSERT INTO bundles (name, price) VALUES (?,?)").run(name, Number(price));
  const ins = db.prepare("INSERT INTO bundle_items (bundle_id, product_id, qty) VALUES (?,?,?)");
  for (const it of items) ins.run(r.lastInsertRowid, Number(it.productId), Number(it.qty) || 1);
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.delete("/api/bundles/:id", auth, requireRole("super", "admin"), (req, res) => {
  db.prepare("DELETE FROM bundle_items WHERE bundle_id=?").run(req.params.id);
  db.prepare("DELETE FROM bundles WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.get("/api/commissions", auth, (req, res) => {
  const { status } = req.query;
  let rows = db.prepare(`SELECT c.*, p.name plumber_name FROM commissions c
    LEFT JOIN parties p ON p.id=c.plumber_id ORDER BY c.id DESC`).all();
  if (status) rows = rows.filter(r => r.status === status);
  const due = round2(rows.filter(r => r.status === "due").reduce((a, r) => a + r.amount, 0));
  const paid = round2(rows.filter(r => r.status === "paid").reduce((a, r) => a + r.amount, 0));
  res.json({ ok: true, commissions: rows, totalDue: due, totalPaid: paid });
});
app.post("/api/commissions/:id/pay", auth, requireRole("super", "admin"), (req, res) => {
  const r = db.prepare("UPDATE commissions SET status='paid' WHERE id=?").run(req.params.id);
  if (!r.changes) return res.status(404).json({ ok: false, error: "غير موجودة" });
  res.json({ ok: true });
});
app.get("/api/loyalty/:partyId", auth, (req, res) => {
  const party = db.prepare("SELECT * FROM parties WHERE id=?").get(req.params.partyId);
  if (!party) return res.status(404).json({ ok: false, error: "غير موجود" });
  const log = db.prepare("SELECT * FROM loyalty_log WHERE party_id=? ORDER BY id DESC LIMIT 100").all(party.id);
  res.json({ ok: true, party: { id: party.id, name: party.name, points: party.points }, log });
});

// ---------------------------------------------------------------------------
// API: reminders (عملاء غائبون + مديونيات قديمة)
// ---------------------------------------------------------------------------
app.get("/api/reminders", auth, (req, res) => {
  const s = getSettings();
  const days = +s.reminder_days || 30;
  const inactive = db.prepare(`SELECT *, julianday('now') - julianday(COALESCE(last_activity, created_at)) idle_days
    FROM parties WHERE type='customer' AND (last_activity IS NULL OR last_activity < datetime('now', ?))
    ORDER BY idle_days DESC`).all(`-${days} days`);
  const overdue = db.prepare(`SELECT *, julianday('now') - julianday(COALESCE(last_activity, created_at)) idle_days
    FROM parties WHERE balance > 0 AND (last_activity IS NULL OR last_activity < datetime('now', ?))
    ORDER BY balance DESC`).all(`-${days} days`);
  const log = db.prepare(`SELECT r.*, p.name party_name FROM reminders_log r
    LEFT JOIN parties p ON p.id=r.party_id ORDER BY r.id DESC LIMIT 100`).all();
  res.json({ ok: true, days, inactive, overdue, log });
});
app.post("/api/reminders/mark", auth, (req, res) => {
  const { partyId, kind, note } = req.body || {};
  const party = db.prepare("SELECT * FROM parties WHERE id=?").get(Number(partyId));
  if (!party) return res.status(400).json({ ok: false, error: "اختر الطرف" });
  const r = db.prepare("INSERT INTO reminders_log (party_id, kind, note, created_by) VALUES (?,?,?,?)")
    .run(party.id, kind || "whatsapp", note || "", req.user.id);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// API: reports
// ---------------------------------------------------------------------------
app.get("/api/reports/shortages", auth, (req, res) => {
  const s = getSettings();
  const threshold = +s.low_stock_threshold || 5;
  const wh = req.query.warehouseId ? Number(req.query.warehouseId) : null;
  const whs = wh ? [{ id: wh }] : db.prepare("SELECT id FROM warehouses").all();
  const out = [];
  for (const w of whs) {
    const rows = db.prepare(`SELECT p.*, COALESCE(ps.qty,0) qty FROM products p
      LEFT JOIN product_stock ps ON ps.product_id=p.id AND ps.warehouse_id=?
      WHERE COALESCE(ps.qty,0) <= ? ORDER BY qty, p.name`).all(w.id, threshold);
    const wname = db.prepare("SELECT name FROM warehouses WHERE id=?").get(w.id);
    for (const p of rows) {
      const pr = withPrices(p, s);
      const suggested = Math.max(0, threshold * 2 - p.qty);
      out.push({ ...pr, warehouse_id: w.id, warehouse: wname ? wname.name : "", qty: p.qty,
        suggestedQty: suggested, suggestedCost: round2(suggested * p.last_purchase_price) });
    }
  }
  res.json({ ok: true, threshold, shortages: out });
});
app.get("/api/reports/daily-debts", auth, (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const entries = db.prepare(`SELECT d.*, p.name party_name FROM debt_entries d
    LEFT JOIN parties p ON p.id=d.party_id WHERE date(d.created_at)=? ORDER BY d.id DESC`).all(date);
  const parties = db.prepare("SELECT * FROM parties WHERE balance != 0 ORDER BY balance DESC").all();
  res.json({ ok: true, date, entries, parties });
});
app.get("/api/reports/daily-cash", auth, (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const inv = db.prepare("SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid),0) paid, COUNT(*) n FROM invoices WHERE date(created_at)=?").get(date);
  const pur = db.prepare("SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid),0) paid, COUNT(*) n FROM purchases WHERE date(created_at)=?").get(date);
  const exp = db.prepare("SELECT COALESCE(SUM(amount),0) total, COUNT(*) n FROM expenses WHERE date(created_at)=?").get(date);
  const vaultAuto = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM vault_transactions WHERE kind='auto' AND date(created_at)=?").get(date);
  res.json({ ok: true, date, invoices: inv, purchases: pur, expenses: exp, vaultAuto: vaultAuto.total, vaultBalance: vaultBalance() });
});

// ---------------------------------------------------------------------------
// Health + SPA fallback
// ---------------------------------------------------------------------------
app.get("/api/health", (req, res) => res.json({ ok: true, app: "al-radwan", version: "1.0.0" }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, HOST, () => {
  console.log(`Al-Radwan running at http://${HOST}:${PORT}`);
});
