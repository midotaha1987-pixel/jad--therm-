/* Service worker for 'عالم كارما الجميلة وأخواتها' — offline-first. */
var CACHE = 'karma-game-v6';
var CORE = [
  './',
  'index.html',
  'sw.js',
  'assets/three.min.js',
  'assets/guide-chest.mp3',
  'assets/guide-draw.mp3',
  'assets/guide-films.mp3',
  'assets/guide-games.mp3',
  'assets/guide-hello.mp3',
  'assets/guide-prayer.mp3',
  'assets/guide-quran.mp3',
  'assets/guide-stories.mp3',
  'assets/guide-tales.mp3',
  'assets/quran-asr.mp3',
  'assets/quran-falaq.mp3',
  'assets/quran-ikhlas.mp3',
  'assets/quran-kawthar.mp3',
  'assets/quran-masad.mp3',
  'assets/quran-nas.mp3',
  'assets/quran-nasr.mp3',
  'assets/quran-quraysh.mp3',
  'assets/salah-1.mp3',
  'assets/salah-2.mp3',
  'assets/salah-3.mp3',
  'assets/salah-4.mp3',
  'assets/salah-5.mp3',
  'assets/salah-6.mp3',
  'assets/salah-7.mp3',
  'assets/salah-8.mp3',
  'assets/snd-bravo.mp3',
  'assets/snd-correct.mp3',
  'assets/snd-finish.mp3',
  'assets/snd-tryagain.mp3',
  'assets/wudu-1.mp3',
  'assets/wudu-2.mp3',
  'assets/wudu-3.mp3',
  'assets/wudu-4.mp3',
  'assets/wudu-5.mp3',
  'assets/wudu-6.mp3',
  'assets/wudu-7.mp3',
  'assets/wudu-8.mp3'
];
self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(CORE); }).then(function() { return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }).then(function() { return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e) {
  e.respondWith(caches.match(e.request).then(function(r) { return r || fetch(e.request); }));
});
