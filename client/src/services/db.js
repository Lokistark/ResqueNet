import { openDB } from 'idb';

const DB_NAME = 'ResqueNetDB';
const STORE_NAME = 'pendingReports';

/**
 * INITIALIZE OFFLINE DATABASE
 * Creates a local IndexedDB instance to store reports when internet is unavailable.
 * This is the backbone of our "Offline-First" strategy.
 */
export const initDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // We use an auto-incrementing key to handle multiple local reports
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

export const saveReportLocally = async (report) => {
    const db = await initDB();
    return db.add(STORE_NAME, report);
};

export const getLocalReports = async () => {
    const db = await initDB();
    return db.getAll(STORE_NAME);
};

export const clearLocalReports = async () => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.objectStore(STORE_NAME).clear();
    return tx.done;
};
