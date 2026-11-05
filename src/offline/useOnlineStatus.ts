import { useEffect, useState } from 'react';
import { flushSyncQueue, getPendingActions } from './indexedDb.ts';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [justReconnected, setJustReconnected] = useState<boolean>(false);

  const checkPendingQueue = async () => {
    try {
      const items = await getPendingActions();
      setPendingSyncCount(items.length);
    } catch {
      setPendingSyncCount(0);
    }
  };

  useEffect(() => {
    checkPendingQueue();

    const handleOnline = async () => {
      setIsOnline(true);
      setJustReconnected(true);
      setSyncing(true);

      try {
        const result = await flushSyncQueue();
        if (result.synced > 0) {
          console.log(`Synced ${result.synced} offline action(s) with backend.`);
        }
      } catch (err) {
        console.warn('Sync flush error:', err);
      } finally {
        setSyncing(false);
        await checkPendingQueue();
        setTimeout(() => setJustReconnected(false), 5000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
      checkPendingQueue();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check for pending queue
    const queueInterval = setInterval(checkPendingQueue, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(queueInterval);
    };
  }, []);

  return {
    isOnline,
    pendingSyncCount,
    syncing,
    justReconnected,
    manualSync: async () => {
      setSyncing(true);
      await flushSyncQueue();
      await checkPendingQueue();
      setSyncing(false);
    },
  };
}
