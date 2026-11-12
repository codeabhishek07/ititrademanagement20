import {
  saveSystemBackup,
  getLatestSystemBackup,
  getAllSystemBackups,
  clearAllSystemBackupsAndDemoCache,
  type SystemBackupRecord,
} from '../offline/indexedDb.ts';

export {
  saveSystemBackup,
  getLatestSystemBackup,
  getAllSystemBackups,
  clearAllSystemBackupsAndDemoCache,
  type SystemBackupRecord,
};

export interface BackupStatus {
  lastBackupDate: string | null;
  lastBackupTimestamp: number | null;
  traineesCount: number;
  assessmentsCount: number;
  autoRestoreEnabled: boolean;
}

/**
 * Triggers an automatic backup by fetching current server data and
 * storing a permanent snapshot inside browser's IndexedDB.
 */
export async function triggerAutoBackup(
  source: 'auto_sync' | 'manual_export' | 'before_logout' | 'marks_entry' = 'auto_sync',
  userRole: string = 'system'
): Promise<SystemBackupRecord | null> {
  try {
    const res = await fetch('/api/system/export-backup');
    if (!res.ok) {
      console.warn('Failed to fetch backup dump from server:', res.statusText);
      return null;
    }
    const backupJson = await res.json();
    const data = backupJson.data || backupJson;
    const summary = backupJson.meta?.summary || {
      traineesCount: data.trainees?.length || 0,
      assessmentsCount: data.assessments?.length || 0,
      attendanceCount: data.attendance?.length || 0,
      tradesCount: data.trades?.length || 0,
      sessionsCount: data.sessions?.length || 0,
    };

    const record: SystemBackupRecord = {
      id: `backup_${Date.now()}`,
      timestamp: Date.now(),
      formattedDate: new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      source,
      userRole,
      summary,
      payload: data,
    };

    await saveSystemBackup(record);
    return record;
  } catch (err) {
    console.warn('Auto-backup to IndexedDB error:', err);
    return null;
  }
}

/**
 * Downloads a complete JSON backup file to the user's computer
 */
export async function downloadBackupFile(): Promise<void> {
  const res = await fetch('/api/system/export-backup');
  if (!res.ok) throw new Error('Failed to generate export backup');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().split('T')[0];
  a.download = `Govt_ITI_Raigarh_Full_Backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Restores the server database from a backup payload (from file upload or IndexedDB)
 */
export async function restoreBackupPayload(
  backupData: any,
  source: string = 'manual_restore'
): Promise<{ success: boolean; message: string; summary?: any }> {
  const res = await fetch('/api/system/restore-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backupData, source }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to restore backup');
  }

  const result = await res.json();

  // Immediately mirror restored state back into IndexedDB as latest_backup
  try {
    const rawData = backupData.data || backupData.payload || backupData;
    await saveSystemBackup({
      id: 'latest_backup',
      timestamp: Date.now(),
      formattedDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      source: 'manual_export',
      userRole: 'admin',
      summary: result.summary,
      payload: rawData,
    });
  } catch (e) {}

  return result;
}

/**
 * Checks whether the user has a manually created, valid non-demo backup
 */
export async function checkForRestorableBackup(): Promise<{
  hasRestorableBackup: boolean;
  backup: SystemBackupRecord | null;
  reason?: string;
}> {
  // Automatic restorable backup popup is disabled to ensure clean production operation
  return { hasRestorableBackup: false, backup: null };
}

/**
 * Disables automatic restore on boot to prevent demo data reincarnation
 */
export async function autoRestoreIfServerWashedOut(): Promise<boolean> {
  return false;
}

