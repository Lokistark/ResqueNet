const CACHE_NAME = 'resquenet-v8';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    '/vite.svg'
];

// INSTALL: Force wait until core assets are cached
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
    );
    self.skipWaiting();
});

// ACTIVATE: Aggressive cleanup
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) return caches.delete(cache);
                })
            );
        })
    );
    self.clients.claim();
});

// FETCH: Robust Response Handling
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests for caching logic
    if (request.method !== 'GET') return;

    // 1. API: Network-First
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match(request);
                return cached || new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // 2. NAVIGATION: The "Main Shell" Fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // 3. ASSETS: Cache-First
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const cacheCopy = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, cacheCopy));
                }
                return networkResponse;
            }).catch(() => {
                // Return a generic error response instead of null to prevent TypeError
                return new Response('Network error occurred', { status: 408 });
            });

            return cachedResponse || fetchPromise;
        })
    );
});

// SYNC: Background Data Synchronization
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') {
        event.waitUntil(syncActions());
    }
});

async function syncActions() {
    const dbName = 'ResqueNetDB';
    const storeName = 'pendingActions';

    return new Promise((resolve) => {
        const request = indexedDB.open(dbName, 2);
        request.onsuccess = async (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) return resolve();

            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const actions = await new Promise(r => {
                const req = store.getAll();
                req.onsuccess = () => r(req.result);
            });

            if (!actions || actions.length === 0) return resolve();

            for (const action of actions) {
                try {
                    const { type, payload } = action;
                    let res;
                    if (type === 'CREATE') {
                        res = await fetch(payload.isPublic ? '/api/incidents/public-sos' : '/api/incidents', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                            credentials: 'include'
                        });
                    } else if (type === 'DELETE') {
                        res = await fetch(`/api/incidents/${payload.id}`, { method: 'DELETE', credentials: 'include' });
                    } else if (type === 'UPDATE') {
                        res = await fetch(`/api/incidents/${payload.id}/status`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: payload.status }),
                            credentials: 'include'
                        });
                    }

                    if (res && (res.ok || res.status === 404)) {
                        const delTx = db.transaction(storeName, 'readwrite');
                        delTx.objectStore(storeName).delete(action.id);
                    }
                } catch (err) {
                    console.error('Sync failed:', err);
                }
            }
            resolve();
        };
        request.onerror = () => resolve();
    });
}
