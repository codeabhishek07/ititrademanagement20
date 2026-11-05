// IndexedDB Offline Storage Layer for Government ITI Raigarh
const DB_NAME = 'iti_raigarh_offline_db';
const DB_VERSION = 1;

export interface OfflineSyncItem {
  id?: number;
  url: string;
  method: string;
  body?: any;
  label: string;
  timestamp: number;
  attempts: number;
}

let dbInstance: IDBDatabase | null = null;

export function openOfflineDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. App Cache Store: Key-value for bootstrap, trades, sessions, trainees, officers, etc.
      if (!db.objectStoreNames.contains('app_cache')) {
        db.createObjectStore('app_cache', { keyPath: 'key' });
      }

      // 2. User State Store: Active user credentials and tab states
      if (!db.objectStoreNames.contains('user_state')) {
        db.createObjectStore('user_state', { keyPath: 'key' });
      }

      // 3. Offline Sync Queue: Pending mutations to replay when reconnected
      if (!db.objectStoreNames.contains('pending_sync')) {
        const syncStore = db.createObjectStore('pending_sync', {
          keyPath: 'id',
          autoIncrement: true,
        });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.warn('Failed to open IndexedDB:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// -------------------------------------------------------------
// App Entity Cache (Key-Value)
// -------------------------------------------------------------

export async function setCachedData<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('app_cache', 'readwrite');
      const store = tx.objectStore('app_cache');
      const request = store.put({ key, data, updatedAt: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    // Non-blocking fallback if IndexedDB is disabled (e.g. private browsing storage quota)
    console.warn(`IndexedDB write failed for key "${key}":`, err);
  }
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('app_cache', 'readonly');
      const store = tx.objectStore('app_cache');
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result && request.result.data !== undefined) {
          resolve(request.result.data as T);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn(`IndexedDB read failed for key "${key}":`, err);
    return null;
  }
}

// -------------------------------------------------------------
// Offline Sync Queue (Mutations performed while disconnected)
// -------------------------------------------------------------

export async function enqueueOfflineAction(action: {
  url: string;
  method: string;
  body?: any;
  label: string;
}): Promise<number> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_sync', 'readwrite');
      const store = tx.objectStore('pending_sync');
      const item: OfflineSyncItem = {
        ...action,
        timestamp: Date.now(),
        attempts: 0,
      };
      const request = store.add(item);

      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to enqueue offline action:', err);
    return -1;
  }
}

export async function getPendingActions(): Promise<OfflineSyncItem[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_sync', 'readonly');
      const store = tx.objectStore('pending_sync');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Failed to read pending sync actions:', err);
    return [];
  }
}

export async function removePendingAction(id: number): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_sync', 'readwrite');
      const store = tx.objectStore('pending_sync');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to remove sync action:', err);
  }
}

// Replay queued offline mutations to backend upon reconnection
export async function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const items = await getPendingActions();
  if (items.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (res.ok) {
        if (item.id !== undefined) {
          await removePendingAction(item.id);
        }
        synced++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      // Stop flushing if network failed again
      break;
    }
  }

  return { synced, failed };
}
