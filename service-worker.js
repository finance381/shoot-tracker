const CACHE_NAME = 'shoot-tracker-v3';
const SHELL_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './js/supabase.js',
  './js/auth.js',
  './js/app.js',
  './js/dashboard.js',
  './js/calendar.js',
  './js/shoots.js',
  './js/team.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and Supabase API calls
  if (e.request.method !== 'GET' || url.hostname.includes('supabase')) return;

  // Network-first: try fresh, fall back to cache (offline support)
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});