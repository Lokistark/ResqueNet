const CACHE_NAME = 'resquenet-v2'; // Bump version for update
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
        // UI Assets: Try cache first, then network
        event.respondWith(
            caches.match(request).then((response) => {
                return response || fetch(request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
    }
});

// SYNC: Background Data Synchronization
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') {
        console.log('SW: Sync Triggered - Dispatching Pending Reports');
        event.waitUntil(syncReports());
    }
});

async function syncReports() {
    return new Promise((resolve, reject) => {
        const dbRequest = indexedDB.open('ResqueNetDB', 1);

        dbRequest.onerror = (err) => reject(err);

        dbRequest.onsuccess = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pendingReports')) return resolve();

            const transaction = db.transaction('pendingReports', 'readwrite');
            const store = transaction.objectStore('pendingReports');
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = async () => {
                const reports = getAllRequest.result;
                if (reports.length === 0) return resolve();

                console.log(`SW: Found ${reports.length} pending reports. Syncing...`);

                const backendUrl = ''; // Use relative paths for proxy support

                for (const report of reports) {
                    try {
                        // Determine endpoint: /incidents (standard) or /incidents/public-sos (anonymous)
                        const endpoint = report.isPublic ? '/api/incidents/public-sos' : '/api/incidents';

                        const response = await fetch(`${backendUrl}${endpoint}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: report.title,
                                type: report.type,
                                location: report.location,
                                description: report.description
                            }),
                            credentials: 'include'
                        });

                        if (response.ok) {
                            console.log(`SW: ${report.isPublic ? 'Public' : 'Standard'} Report ${report.id} synced.`);
                            const delTx = db.transaction('pendingReports', 'readwrite');
                            delTx.objectStore('pendingReports').delete(report.id);
                        }
                    } catch (err) {
                        console.error(`SW: Sync failed for report ${report.id}`, err);
                    }
                }
                resolve();
            };
        };
    });
}
