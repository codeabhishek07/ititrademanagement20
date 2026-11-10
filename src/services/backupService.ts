import {
  saveSystemBackup,
  getLatestSystemBackup,
  getAllSystemBackups,
  type SystemBackupRecord,
} from '../offline/indexedDb.ts';

export {
  saveSystemBackup,
  getLatestSystemBackup,
  getAllSystemBackups,
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
 * Inspects whether the server appears to have rebooted with fresh/empty demo data,
 * while the browser has a newer, richer backup stored in IndexedDB.
 */
export async function checkForRestorableBackup(): Promise<{
  hasRestorableBackup: boolean;
  backup: SystemBackupRecord | null;
  reason?: string;
}> {
  try {
    const latestBackup = await getLatestSystemBackup();
    if (!latestBackup || !latestBackup.payload) {
      return { hasRestorableBackup: false, backup: null };
    }

    // Check server status
    const bootRes = await fetch('/api/bootstrap');
    if (!bootRes.ok) {
      return { hasRestorableBackup: false, backup: latestBackup };
    }
    const bootData = await bootRes.json();
    const serverTrainees = bootData.stats?.totalTrainees || 0;

    // Check if backup has more trainees, or assessment records that are missing
    const backupAssessments = Array.isArray(latestBackup.payload.assessments)
      ? latestBackup.payload.assessments.length
      : 0;
    const backupTrainees = latestBackup.summary?.traineesCount || 0;

    // If backup has assessments recorded or more trainees, or custom admin settings
    if (backupAssessments > 0 || backupTrainees > serverTrainees) {
      return {
        hasRestorableBackup: true,
        backup: latestBackup,
        reason: `${backupAssessments} formative assessment record(s) and ${backupTrainees} trainee profile(s) found in browser persistent storage.`,
      };
    }

    return { hasRestorableBackup: false, backup: latestBackup };
  } catch (err) {
    console.warn('Error checking restorable backup:', err);
    return { hasRestorableBackup: false, backup: null };
  }
}

/**
 * Auto-restores database if the server was restarted or scaled down to zero.
 * Returns true if auto-restore occurred.
 */
export async function autoRestoreIfServerWashedOut(): Promise<boolean> {
  try {
    // Check user preference (enabled by default)
    const isAutoRestoreDisabled = localStorage.getItem('iti_auto_restore_disabled') === 'true';
    if (isAutoRestoreDisabled) return false;

    const check = await checkForRestorableBackup();
    if (check.hasRestorableBackup && check.backup?.payload) {
      console.log('Detected washed-out container state. Automatically restoring saved backup from IndexedDB...');
      await restoreBackupPayload(check.backup.payload, 'auto_restore_on_boot');
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Auto-restore failed:', err);
    return false;
  }
}
