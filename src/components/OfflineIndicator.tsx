import React from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '../offline/useOnlineStatus.ts';

export const OfflineIndicator: React.FC = () => {
  const { isOnline, pendingSyncCount, syncing, justReconnected, manualSync } = useOnlineStatus();

  // If online, no pending queue, and not just reconnected, stay hidden
  if (isOnline && pendingSyncCount === 0 && !justReconnected && !syncing) {
    return null;
  }

  // 1. Connection just restored and syncing
  if (isOnline && (syncing || justReconnected || pendingSyncCount > 0)) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 bg-emerald-950/95 text-emerald-100 border border-emerald-600/60 shadow-xl backdrop-blur-md px-3.5 py-2 rounded-xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-200">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="flex flex-col">
          <span className="font-bold text-emerald-200">
            {syncing ? 'Back Online · Syncing Changes...' : 'Connection Restored'}
          </span>
          <span className="text-[10px] text-emerald-300 font-normal">
            {pendingSyncCount > 0
              ? `${pendingSyncCount} queued action(s) being uploaded to server.`
              : 'All cached changes synchronized successfully.'}
          </span>
        </div>
        {syncing && <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400 ml-1 shrink-0" />}
      </div>
    );
  }

  // 2. Offline Mode Active
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 bg-slate-950/95 text-slate-100 border border-amber-500/80 shadow-2xl backdrop-blur-md px-4 py-2.5 rounded-xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="p-1 bg-amber-500/20 text-amber-400 rounded-lg shrink-0">
        <WifiOff className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-extrabold text-amber-300">Offline Mode Active</span>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <span className="text-[10px] text-slate-300 font-normal leading-tight mt-0.5">
          {pendingSyncCount > 0
            ? `${pendingSyncCount} action(s) stored in local IndexedDB. Will sync automatically.`
            : 'Using cached assets & database records. You can still navigate safely.'}
        </span>
      </div>
      <button
        type="button"
        onClick={manualSync}
        className="ml-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-mono border border-slate-700 transition-colors cursor-pointer shrink-0"
        title="Check connection and retry sync"
      >
        Retry
      </button>
    </div>
  );
};
