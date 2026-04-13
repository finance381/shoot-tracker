const CACHE_NAME = 'request-status-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!url.protocol.startsWith('http') || url.hostname.includes('supabase')) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => { const c = r.clone(); caches.open(CACHE_NAME).then(cache => cache.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || '📸 Shoot Request', {
      body: data.body || '',
      icon: './icons/pwa-192.png',
      badge: './icons/pwa-192.png',
      tag: data.tag || 'request-status',
      data: { url: './request-status.html' }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || './request-status.html'));
});
