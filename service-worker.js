// AUTO-VERSIONED — no manual bumping needed
const APP_VERSION = 'v-1776765773';
const CACHE_NAME = 'shoot-tracker-' + APP_VERSION;
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
  './js/reports.js',
  './js/requests.js',
  './js/requester-view.js',
  './js/sheets-sync.js',
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

  // Skip non-GET, non-http(s), and Supabase API calls
  if (e.request.method !== 'GET' || !url.protocol.startsWith('http') || url.hostname.includes('supabase')) return;

  // Network-first with HTTP cache bypass
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || '📸 Shoot Tracker', {
      body: data.body || '',
      icon: './icons/pwa-192.png',
      badge: './icons/pwa-192.png',
      tag: data.tag || 'shoot-notification',
      data: { url: './' }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.openWindow(e.notification.data?.url || './')
  );
});
