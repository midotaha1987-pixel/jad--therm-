// Service worker لمعرض الرضوان — تخزين مؤقت للملفات الثابتة فقط،
// وطلبات الـ API تمر للشبكة مباشرة (لا تُخزَّن).
// ملاحظة مهمة: عند أي تحديث لملفات التطبيق (app.js أو غيره) ارفع رقم النسخة هنا،
// حتى يتحدّث التطبيق المثبّت عند المستخدمين — الكاش القديم لا يتحدّث من نفسه.
// (نفس الدرس من جاد ثيرم: الكاش الثابت باسم قديم يخفي التحديثات عن الموبايل)
const CACHE = 'radwan-v1';
const CORE = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // طلبات API: شبكة فقط
  if (url.pathname.startsWith('/api') || e.request.method !== 'GET') return;
  // ملفات ثابتة: الكاش أولًا ثم الشبكة
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});
