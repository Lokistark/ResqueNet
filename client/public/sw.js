const CACHE_NAME = 'resq-v18';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/login',
    '/dashboard',
    '/manifest.json',
    '/sw.js',
    '/icon.jpg'
];

// 1. INSTALL: Build the fortress shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Pre-caching v16 fortress');
            return cache.addAll(URLS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. ACTIVATE: Claim all pages instantly
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

    if (request.method !== 'GET') return;

    // --- STRATEGY A: API ROUTES (Always Network First, cached secondary) ---
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

    // --- STRATEGY B: THE "MOBILE REFRESH" FIX (Cache-First for Engine) ---
    // This is the CRITICAL fix for the "You're offline" screen.
    // We check the cache FIRST for the app shell.
    if (request.mode === 'navigate') {
        event.respondWith(
            caches.match('/index.html').then((cachedShell) => {
                // If we have it in memory, give it to the browser INSTANTLY
                if (cachedShell && !navigator.onLine) {
                    return cachedShell;
                }
                // Otherwise try network but fallback to shell on failure
                return fetch(request).catch(async () => {
                    return cachedShell || caches.match('/login') || caches.match('/');
                });
            })
        );
        return;
    }

    // --- STRATEGY C: ASSETS (CSS, JS, Images) ---
    event.respondWith(
        caches.match(request).then(async (cached) => {
            if (cached) return cached;
            try {
                const res = await fetch(request);
                if (res && res.status === 200) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, res.clone());
                }
                return res;
            } catch (err) {
                return new Response('Offline resource missing', { status: 404 });
            }
        })
    );
});

// 4. SYNC: Sync queued actions when internet returns
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
