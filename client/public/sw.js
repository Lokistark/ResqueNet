const CACHE_NAME = 'resquenet-v1';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') {
        event.waitUntil(syncReports());
    }
});

async function syncReports() {
    // We'll use idb inside the SW by importing it or using a simple version
    // For simplicity in this demo, we'll use a postMessage to the client 
    // or a shared logic if possible. 
    // Better yet, we use self.indexedDB directly.

    const dbRequest = indexedDB.open('ResqueNetDB', 1);
    dbRequest.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction('pendingReports', 'readonly');
        const store = transaction.objectStore('pendingReports');
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = async () => {
            const reports = getAllRequest.result;
            if (reports.length > 0) {
                console.log(`Syncing ${reports.length} reports...`);
                // We would fetch here, but we need the auth token usually.
                // In a real PWA, we'd store the token in IndexedDB too or use a cookie.
                // Since we use HttpOnly cookies, fetch() will include them by default.

                for (const report of reports) {
                    try {
                        const response = await fetch('http://localhost:5000/api/incidents', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(report),
                            credentials: 'include'
                        });

                        if (response.ok) {
                            const delTx = db.transaction('pendingReports', 'readwrite');
                            delTx.objectStore('pendingReports').delete(report.id);
                        }
                    } catch (err) {
                        console.error('Sync failed for report', err);
                    }
                }
            }
        };
    };
}
