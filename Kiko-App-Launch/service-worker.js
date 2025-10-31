const CACHE_NAME = 'kiko-cache-v1';

// List of files to cache upon installation (pre-caching)
// IMPORTANT: The Firebase, React, Babel, and Tailwind URLs are loaded from CDNs in index.html, 
// so we cannot cache them here unless they are local copies. We will focus on caching our own assets.
const urlsToCache = [
    '/', // The main index.html file
    '/index.html',
    '/manifest.json',
    '/service-worker.js',
    '/images/kiko-icon-192.png', // The custom icons
    '/images/kiko-icon-512.png',
];

// --- Install Event ---
self.addEventListener('install', (event) => {
    // Perform install steps
    self.skipWaiting(); // Installs immediately without waiting for user to close all old tabs
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Kiko installed! Pre-caching all essential files.');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                console.error('Kiko caching failed during install:', err);
            })
    );
});

// --- Activate Event ---
self.addEventListener('activate', (event) => {
    console.log('Kiko is activating! Cleaning up old caches...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Kiko deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// --- Fetch Event (Offline Magic!) ---
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    // Check if the request is for the Gemini API (which must always be fetched from the network)
    // We cannot cache API calls for dynamic chat responses.
    const url = new URL(event.request.url);
    if (url.pathname.includes('googleapis.com')) {
        return fetch(event.request);
    }
    
    // Serve from cache first, then fall back to the network
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                
                // No match in cache, so fetch from the network
                return fetch(event.request).then((networkResponse) => {
                    // Check if we received a valid response
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }

                    // IMPORTANT: Clone the response. A response is a stream and can only be consumed once.
                    const responseToCache = networkResponse.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            // Only cache the GET requests that are not Firebase SDKs or API calls
                            const isAsset = urlsToCache.some(url => event.request.url.includes(url.replace('/', '')));

                            if (isAsset) {
                                cache.put(event.request, responseToCache);
                            }
                        });

                    return networkResponse;
                }).catch(() => {
                    // This catch handles network failures (e.g., completely offline)
                    // If we are completely offline and the file wasn't in cache, we can return a fallback page if needed,
                    // but for a chat app, just serving the cached index.html is usually sufficient.
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});
