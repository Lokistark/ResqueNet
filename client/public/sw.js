const CACHE_NAME = 'resquenet-v15';
const URLS_TO_CACHE = [
    '/',
    '/login',
    '/dashboard',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    '/icon.jpg'
];

// 1. INSTALL: Build the fortress shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Pre-caching v15 (Offline Refresh Fix)');
            // Add individual files to ensure they are all in the cache
            return cache.addAll(URLS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. ACTIVATE: Purge and Claim
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

// 3. FETCH: The Bulletproof Routing Engine
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Filter to only handle GET requests for our origin to avoid cross-origin cache pollution
    if (request.method !== 'GET' || !url.origin.includes(location.origin)) return;

    // --- STRATEGY: NAVIGATION (Refreshes and URL entry) ---
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                console.log(`SW: Offline navigation to ${url.pathname}, serving shell`);
                // ALWAYS return index.html for navigation requests offline
                const shell = await caches.match('/index.html') || await caches.match('/login') || await caches.match('/');
                return shell || new Response('App Offline. Please connect once to activate.', { status: 503 });
            })
        );
        return;
    }

    // --- STRATEGY: API CALLS ---
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match(request);
                return cached || new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503, headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // --- STRATEGY: ASSETS (JS, CSS, Images) ---
    event.respondWith(
        caches.match(request).then(async (cached) => {
            if (cached) return cached;

            try {
                const networkResponse = await fetch(request);
                if (networkResponse && networkResponse.status === 200) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            } catch (err) {
                // Return a valid error response if both fail
                return new Response('Asset Unavailable Offline', { status: 404 });
            }
        })
    );
});

// 4. SYNC: Background sync for reports
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') event.waitUntil(syncActions());
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
