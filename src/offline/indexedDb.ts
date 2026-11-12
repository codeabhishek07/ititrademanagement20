// IndexedDB Offline Storage Layer for Government ITI Raigarh
const DB_NAME = 'iti_raigarh_offline_db';
const DB_VERSION = 2;

export interface OfflineSyncItem {
  id?: number;
  url: string;
  method: string;
  body?: any;
  label: string;
  timestamp: number;
  attempts: number;
}

export interface SystemBackupRecord {
  id: string; // e.g. "latest_backup" or "backup_<timestamp>"
  timestamp: number;
  formattedDate: string;
  source: 'auto_sync' | 'manual_export' | 'before_logout' | 'marks_entry';
  userRole?: string;
  summary: {
    traineesCount: number;
    assessmentsCount: number;
    attendanceCount: number;
    tradesCount: number;
    sessionsCount: number;
  };
  payload: any;
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

      // 4. Institutional Backups Store: Permanent snapshots to survive Cloud Run scale-down
      if (!db.objectStoreNames.contains('system_backups')) {
        const backupStore = db.createObjectStore('system_backups', { keyPath: 'id' });
        backupStore.createIndex('timestamp', 'timestamp', { unique: false });
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

// -------------------------------------------------------------
// Institutional System Backups Storage (survives scale-down)
// -------------------------------------------------------------

export async function saveSystemBackup(backup: SystemBackupRecord): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('system_backups', 'readwrite');
      const store = tx.objectStore('system_backups');
      // Save primary 'latest_backup' for quick restore check
      store.put({ ...backup, id: 'latest_backup' });
      // Also save timestamped historical backup (keep up to 5)
      store.put({ ...backup, id: `backup_${backup.timestamp}` });

      tx.oncomplete = () => {
        // Also mirror lightweight metadata in localStorage for instant boot check
        try {
          localStorage.setItem(
            'iti_latest_backup_meta',
            JSON.stringify({
              id: 'latest_backup',
              timestamp: backup.timestamp,
              formattedDate: backup.formattedDate,
              source: backup.source,
              userRole: backup.userRole,
              summary: backup.summary,
            })
          );
        } catch (e) {}
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save institutional backup to IndexedDB:', err);
  }
}

export async function getLatestSystemBackup(): Promise<SystemBackupRecord | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('system_backups', 'readonly');
      const store = tx.objectStore('system_backups');
      const request = store.get('latest_backup');

      request.onsuccess = () => {
        if (request.result && request.result.payload) {
          resolve(request.result as SystemBackupRecord);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Failed to read latest backup from IndexedDB:', err);
    return null;
  }
}

export async function getAllSystemBackups(): Promise<SystemBackupRecord[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('system_backups', 'readonly');
      const store = tx.objectStore('system_backups');
      const request = store.getAll();

      request.onsuccess = () => {
        const list = (request.result || []) as SystemBackupRecord[];
        // Filter out the 'latest_backup' duplicate key, return historical list sorted desc
        const historical = list
          .filter((item) => item.id !== 'latest_backup')
          .sort((a, b) => b.timestamp - a.timestamp);
        resolve(historical);
      };

      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Failed to read all backups:', err);
    return [];
  }
}

export async function deleteSystemBackup(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('system_backups', 'readwrite');
      const store = tx.objectStore('system_backups');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to delete backup:', err);
  }
}

export async function clearAllSystemBackupsAndDemoCache(): Promise<void> {
  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(['system_backups', 'app_cache'], 'readwrite');
      tx.objectStore('system_backups').clear();
      tx.objectStore('app_cache').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    // Also remove any demo local storage flags
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('iti_cache_trainees');
      localStorage.removeItem('iti_cache_attendance');
      localStorage.removeItem('iti_cache_assessments');
      localStorage.removeItem('iti_cache_indents');
      localStorage.removeItem('iti_cache_warnings');
      localStorage.removeItem('iti_cache_leaves');
    }
  } catch (err) {
    console.warn('Failed to clear system backups and app cache:', err);
  }
}

