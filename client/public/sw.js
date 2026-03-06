const CACHE_NAME = 'resquenet-v9';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    '/vite.svg'
];

// 1. INSTALL: Build the core shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Pre-caching v9 Assets');
            return cache.addAll(URLS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. ACTIVATE: Purge old logic
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim();
});

// 3. FETCH: The Offline Engine
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests for caching
    if (request.method !== 'GET') return;

    // --- STRATEGY A: API ROUTES (Network-First) ---
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match(request);
                return cached || new Response(JSON.stringify({ error: 'offline', status: 503 }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // --- STRATEGY B: NAVIGATION (Refresh / Sub-routes) ---
    // If the user is at /dashboard and refreshes while offline, 
    // we MUST serve the content of index.html.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                // Return cached index.html for ANY navigation request while offline
                const fallback = await caches.match('/index.html') || await caches.match('/');
                if (fallback) return fallback;

                // Absolute last resort (should never happen if pre-cache worked)
                return new Response('Fatal Offline Error: App Shell Missing', { status: 503 });
            })
        );
        return;
    }

    // --- STRATEGY C: ASSETS (CSS/JS/Images) ---
    // Use Cache-First to ensure the page renders instantly without white screen
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            return fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const cacheCopy = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, cacheCopy));
                }
                return networkResponse;
            }).catch(() => {
                // Prevent 'Failed to convert value to Response' crash
                return new Response('Resource Offline', { status: 404 });
            });
        })
    );
});

// 4. SYNC: Sync queued actions when internet returns
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') {
        event.waitUntil(syncActions());
    }
});

async function syncActions() {
    const dbName = 'ResqueNetDB';
    const storeName = 'pendingActions';

    return new Promise((resolve) => {
        const idb = indexedDB.open(dbName, 2);
        idb.onsuccess = async (e) => {
            const db = e.target.result;
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
                    const headers = { 'Content-Type': 'application/json' };
                    if (type === 'CREATE') {
                        res = await fetch(payload.isPublic ? '/api/incidents/public-sos' : '/api/incidents', {
                            method: 'POST', headers, body: JSON.stringify(payload), credentials: 'include'
                        });
                    } else if (type === 'DELETE') {
                        res = await fetch(`/api/incidents/${payload.id}`, { method: 'DELETE', credentials: 'include' });
                    } else if (type === 'UPDATE') {
                        res = await fetch(`/api/incidents/${payload.id}/status`, {
                            method: 'PATCH', headers, body: JSON.stringify({ status: payload.status }), credentials: 'include'
                        });
                    }

                    if (res && (res.ok || res.status === 404)) {
                        const delTx = db.transaction(storeName, 'readwrite');
                        delTx.objectStore(storeName).delete(action.id);
                    }
                } catch (err) { console.error('Sync failed:', err); }
            }
            resolve();
        };
        idb.onerror = () => resolve();
    });
}
