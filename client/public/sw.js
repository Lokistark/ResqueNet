const CACHE_NAME = 'resquenet-v12';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    '/icon.jpg'
];

// 1. INSTALL: Burn the shell into memory
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
    );
    self.skipWaiting();
});

// 2. ACTIVATE: Take control immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
    self.clients.claim();
});

// 3. FETCH: The Bulletproof Engine
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    // A. API: Always try Network, but never crash on failure
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

    // B. NAVIGATION: Absolute Priority. Show index.html no matter what.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                return (await caches.match('/index.html')) || (await caches.match('/'));
            })
        );
        return;
    }

    // C. ASSETS: Cache-First (The key to zero-latency offline loading)
    event.respondWith(
        caches.match(request).then(async (cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            try {
                const networkResponse = await fetch(request);
                if (networkResponse && networkResponse.status === 200) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            } catch (err) {
                // Return a valid empty response to prevent "Failed to convert to Response"
                return new Response('Offline resource missing', { status: 404 });
            }
        })
    );
});

// 4. SYNC: Send queued data when signal returns
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
                } catch (err) { console.error('Sync error:', err); }
            }
            resolve();
        };
        idb.onerror = () => resolve();
    });
}
