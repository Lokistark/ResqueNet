const CACHE_NAME = 'resquenet-v7';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    '/vite.svg'
];

// INSTALL: Pre-cache core shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(URLS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// ACTIVATE: Cleanup old versions
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// FETCH: THE CORE OF OFFLINE POWER
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. API CALLS: Network-First
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match(request);
                if (cached) return cached;

                return new Response(JSON.stringify({
                    status: 'error',
                    message: 'Offline: Action Queued'
                }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json', 'X-ResqueNet-Offline': 'true' }
                });
            })
        );
        return;
    }

    // 2. NAVIGATION (Pages): Always serve index.html if offline
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // 3. STATIC ASSETS (JS/CSS/IMGS): Cache-First (Fastest & Offline-Ready)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            return fetch(request).then((networkResponse) => {
                // If it's a valid response, cache it for next time
                if (networkResponse && networkResponse.status === 200) {
                    const cacheCopy = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, cacheCopy));
                }
                return networkResponse;
            }).catch(() => {
                // Return nothing if both fail (browser handles this)
                return null;
            });
        })
    );
});

// SYNC: Background Synchronization for offline reports
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
                    let res;
                    const { type, payload } = action;

                    if (type === 'CREATE') {
                        const path = payload.isPublic ? '/api/incidents/public-sos' : '/api/incidents';
                        res = await fetch(path, {
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
                    console.error('SW Sync err:', err);
                }
            }
            resolve();
        };
        request.onerror = () => resolve();
    });
}
