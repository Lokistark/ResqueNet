import { openDB } from 'idb';

const DB_NAME = 'ResqueNetDB';
const STORE_NAME = 'pendingActions';

console.log('📡 DB_SERVICE: Initializing IndexedDB Module');

export const initDB = async () => {
    return openDB(DB_NAME, 2, {
        upgrade(db, oldVersion) {
            if (oldVersion < 2) {
                if (db.objectStoreNames.contains('pendingReports')) {
                    db.deleteObjectStore('pendingReports');
                }
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

/**
 * Queue an action (CREATE, UPDATE, DELETE) for background sync
 */
export const queueAction = async (type, payload) => {
    console.log(`📡 DB_SERVICE: Queuing ${type} action`, payload);
    const db = await initDB();
    return db.add(STORE_NAME, {
        type,
        payload,
        createdAt: new Date().toISOString()
    });
};

export const getPendingActions = async () => {
    const db = await initDB();
    return db.getAll(STORE_NAME);
};

export const deletePendingAction = async (id) => {
    const db = await initDB();
    return db.delete(STORE_NAME, id);
};

export const updatePendingAction = async (id, data) => {
    const db = await initDB();
    return db.put(STORE_NAME, data);
};

export const getLocalReports = async () => {
    const actions = await getPendingActions();
    return actions
        .filter(a => a.type === 'CREATE')
        .map(a => ({ ...a.payload, id: a.id }));
};

export const deleteLocalReport = async (id) => {
    return deletePendingAction(id);
};
