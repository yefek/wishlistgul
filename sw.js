// Service Worker - offline support without trapping users on stale HTML
const CACHE_NAME = 'wishlist-v27';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './manifest-dark.json',
    './favicon.ico?v=3',
    './favicon.svg?v=3',
    './favicon-dark.svg?v=3',
    './favicon-16.png?v=3',
    './favicon-32.png?v=3',
    './favicon-16-dark.png?v=3',
    './favicon-32-dark.png?v=3',
    './icon.svg',
    './icon-dark.svg',
    './icon-192.png',
    './icon-512.png',
    './icon-dark-192.png',
    './icon-dark-512.png',
    './apple-touch-icon.png',
    './apple-touch-icon-dark.png'
];

// Install - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch - HTML/network requests first, static assets cache-first.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);
    const isHtml = event.request.mode === 'navigate' ||
        event.request.headers.get('accept')?.includes('text/html');

    if (isHtml) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    if (requestUrl.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request)
                .then((response) => response || fetch(event.request).then((fresh) => {
                    const copy = fresh.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    return fresh;
                }))
        );
    }
});
