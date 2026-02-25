const CACHE_NAME = 'resquenet-v3';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    // UI Assets are cached dynamically on fetch
];

// INSTALL: Cache critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Pre-caching Core Assets');
            return cache.addAll(URLS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// ACTIVATE: Cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('SW: Clearing Legacy Cache', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// FETCH: Network-First for API, Cache-First for UI
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // API requests: Try network first
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(async () => {
                const cachedResponse = await caches.match(request);

                if (cachedResponse) return cachedResponse;

                // For POST/PATCH requests, return a specific "Offline" marker
                return new Response(JSON.stringify({
                    status: 'error',
                    message: 'Offline: Request Queued'
                }), {
                    status: 503,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-ResqueNet-Offline': 'true'
                    }
                });
            })
        );
    } else {
        // UI Assets: Stale-While-Revalidate (Fast UI, but updates on next load)
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const fetchPromise = fetch(request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    });
                });
                return cachedResponse || fetchPromise;
            })
        );
    }
});

// SYNC: Background Data Synchronization
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') { // Keeping the tag same for compatibility
        console.log('SW: Sync Triggered - Dispatching Pending Actions');
        event.waitUntil(syncActions());
    }
});

async function syncActions() {
    return new Promise((resolve, reject) => {
        const dbRequest = indexedDB.open('ResqueNetDB', 2); // Use version 2

        dbRequest.onerror = (err) => reject(err);

        dbRequest.onsuccess = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pendingActions')) return resolve();

            const transaction = db.transaction('pendingActions', 'readwrite');
            const store = transaction.objectStore('pendingActions');
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = async () => {
                const actions = getAllRequest.result;
                if (actions.length === 0) return resolve();

                console.log(`SW: Found ${actions.length} pending actions. Syncing...`);

                const backendUrl = '';

                for (const action of actions) {
                    try {
                        let response;
                        const { type, payload } = action;

                        if (type === 'CREATE') {
                            const endpoint = payload.isPublic ? '/api/incidents/public-sos' : '/api/incidents';
                            response = await fetch(`${backendUrl}${endpoint}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                                credentials: 'include'
                            });
                        } else if (type === 'DELETE') {
                            response = await fetch(`${backendUrl}/api/incidents/${payload.id}`, {
                                method: 'DELETE',
                                credentials: 'include'
                            });
                        } else if (type === 'UPDATE') {
                            response = await fetch(`${backendUrl}/api/incidents/${payload.id}/status`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: payload.status }),
                                credentials: 'include'
                            });
                        }

                        if (response && (response.ok || response.status === 404)) {
                            // 404 is treated as success for sync (item already gone)
                            console.log(`SW: Action ${action.id} (${type}) synced.`);
                            const delTx = db.transaction('pendingActions', 'readwrite');
                            delTx.objectStore('pendingActions').delete(action.id);
                        }
                    } catch (err) {
                        console.error(`SW: Sync failed for action ${action.id}`, err);
                    }
                }
                resolve();
            };
        };
    });
}
