import {
  SystemSettings,
  AcademicSession,
  MonthlyWorkingDay,
  Trade,
  TrainingOfficer,
  Trainee,
  AttendanceRecord,
  LeaveRequest,
  WarningNotice,
  InventoryItem,
  IndentRecord,
  AuditLog,
  AttendanceStatus,
  LeaveType,
  AppNotification,
  LessonPlan,
  DemonstrationPlan,
  WeeklyPlan,
  TraineeAssessment,
} from './types.ts';
import {
  getCachedData,
  setCachedData,
  enqueueOfflineAction,
} from './offline/indexedDb.ts';

/**
 * Helper to fetch data with network-first strategy, falling back to IndexedDB cache
 * when offline or when connection drops, and saving fresh network responses to IndexedDB.
 */
async function fetchWithOfflineCache<T>(
  cacheKey: string,
  fetcher: () => Promise<Response>,
  defaultFallback?: T
): Promise<T> {
  // 1. If navigator is explicitly offline, return cached value immediately
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = await getCachedData<T>(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
  }

  // 2. Try network fetch
  try {
    const res = await fetcher();
    if (res.ok) {
      const data = (await res.json()) as T;
      // Persist to IndexedDB asynchronously
      setCachedData(cacheKey, data).catch((err) =>
        console.warn(`IndexedDB save failed for ${cacheKey}:`, err)
      );
      return data;
    }

    // Server returned non-ok error: check IndexedDB cache
    const cached = await getCachedData<T>(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
    throw new Error(`Request failed with status ${res.status}`);
  } catch (netErr) {
    // Network failure (offline, connection lost, timeout) -> retrieve from IndexedDB
    const cached = await getCachedData<T>(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
    if (defaultFallback !== undefined) {
      return defaultFallback;
    }
    throw netErr;
  }
}

export async function fetchBootstrap() {
  return fetchWithOfflineCache<{
    settings: SystemSettings;
    sessions: AcademicSession[];
    trades: Trade[];
    stats: {
      totalTrades: number;
      totalOfficers: number;
      totalTrainees: number;
      totalInventoryItems: number;
    };
  }>('iti_cache_bootstrap', () => fetch('/api/bootstrap'));
}

export async function loginApi(params: {
  role: 'admin' | 'officer' | 'trainee';
  email?: string;
  password?: string;
  officerId?: string;
  traineeId?: string;
}) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function fetchSettings(): Promise<SystemSettings> {
  return fetchWithOfflineCache<SystemSettings>('iti_cache_settings', () => fetch('/api/settings'));
}

export async function updateSettings(settings: Partial<SystemSettings>) {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  const updated = await res.json();
  // Sync to IndexedDB cache
  setCachedData('iti_cache_settings', updated).catch(() => {});
  return updated;
}

export async function fetchSessions(): Promise<AcademicSession[]> {
  return fetchWithOfflineCache<AcademicSession[]>('iti_cache_sessions', () => fetch('/api/sessions'), []);
}

export async function createSession(session: Partial<AcademicSession>) {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function updateSession(id: string, session: Partial<AcademicSession>) {
  const res = await fetch(`/api/sessions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  });
  if (!res.ok) throw new Error('Failed to update session');
  return res.json();
}

export async function deleteSession(id: string) {
  const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete session');
  return res.json();
}

export async function setDefaultSession(sessionId: string) {
  const res = await fetch('/api/sessions/set-default', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error('Failed to update default session');
  return res.json();
}

export async function fetchMonthlyWorkingDays(sessionId?: string): Promise<MonthlyWorkingDay[]> {
  const url = sessionId ? `/api/monthly-working-days?sessionId=${sessionId}` : '/api/monthly-working-days';
  return fetchWithOfflineCache<MonthlyWorkingDay[]>(
    `iti_cache_mwd_${sessionId || 'all'}`,
    () => fetch(url),
    []
  );
}

export async function saveMonthlyWorkingDay(payload: Partial<MonthlyWorkingDay>) {
  const res = await fetch('/api/monthly-working-days', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save monthly working days');
  return res.json();
}

export async function saveBulkMonthlyWorkingDays(sessionId: string, days: Partial<MonthlyWorkingDay>[]) {
  const res = await fetch('/api/monthly-working-days/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, days }),
  });
  if (!res.ok) throw new Error('Failed to save bulk monthly working days');
  return res.json();
}

export async function deleteMonthlyWorkingDay(id: string) {
  const res = await fetch(`/api/monthly-working-days/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete monthly working day');
  return res.json();
}

export async function fetchTrades(): Promise<Trade[]> {
  return fetchWithOfflineCache<Trade[]>('iti_cache_trades', () => fetch('/api/trades'), []);
}

export async function createTrade(trade: Partial<Trade>) {
  const res = await fetch('/api/trades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trade),
  });
  if (!res.ok) throw new Error('Failed to create trade');
  return res.json();
}

export async function updateTrade(id: string, trade: Partial<Trade>) {
  const res = await fetch(`/api/trades/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trade),
  });
  if (!res.ok) throw new Error('Failed to update trade');
  return res.json();
}

export async function deleteTrade(id: string) {
  const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete trade');
  return res.json();
}

export async function fetchOfficers(): Promise<TrainingOfficer[]> {
  return fetchWithOfflineCache<TrainingOfficer[]>('iti_cache_officers', () => fetch('/api/officers'), []);
}

export async function fetchOfficer(id: string): Promise<TrainingOfficer> {
  return fetchWithOfflineCache<TrainingOfficer>(`iti_cache_officer_${id}`, () => fetch(`/api/officers/${id}`));
}

export async function createOfficer(officer: Partial<TrainingOfficer>) {
  const res = await fetch('/api/officers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(officer),
  });
  if (!res.ok) throw new Error('Failed to create officer');
  return res.json();
}

export async function updateOfficer(id: string, officer: Partial<TrainingOfficer>) {
  const res = await fetch(`/api/officers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(officer),
  });
  if (!res.ok) throw new Error('Failed to update officer');
  return res.json();
}

export async function resetOfficerPassword(id: string, newPassword?: string) {
  const res = await fetch(`/api/officers/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw new Error('Failed to reset password');
  return res.json();
}

export async function deleteOfficer(id: string) {
  const res = await fetch(`/api/officers/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete officer');
  return res.json();
}

export async function fetchTrainees(tradeId?: string, sessionId?: string): Promise<Trainee[]> {
  const params = new URLSearchParams();
  if (tradeId) params.append('tradeId', tradeId);
  if (sessionId) params.append('sessionId', sessionId);
  const qs = params.toString();
  return fetchWithOfflineCache<Trainee[]>(
    `iti_cache_trainees_${qs || 'all'}`,
    () => fetch(`/api/trainees?${qs}`),
    []
  );
}

export async function createTrainee(trainee: Partial<Trainee> & { officerId?: string; officerName?: string }) {
  const res = await fetch('/api/trainees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trainee),
  });
  if (!res.ok) throw new Error('Failed to create trainee');
  return res.json();
}

export async function updateTrainee(id: string, trainee: Partial<Trainee>) {
  const res = await fetch(`/api/trainees/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trainee),
  });
  if (!res.ok) throw new Error('Failed to update trainee');
  return res.json();
}

export async function deleteTrainee(id: string, officerInfo?: { officerId?: string; officerName?: string }) {
  const params = new URLSearchParams(officerInfo as any);
  const res = await fetch(`/api/trainees/${id}?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete trainee');
  return res.json();
}

export async function fetchAttendance(params?: {
  date?: string;
  tradeId?: string;
  traineeId?: string;
  sessionId?: string;
  month?: string;
}): Promise<AttendanceRecord[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<AttendanceRecord[]>(
    `iti_cache_attendance_${qs || 'all'}`,
    () => fetch(`/api/attendance?${qs}`),
    []
  );
}

export async function markTraineeAttendance(payload: {
  traineeId: string;
  userLat: number;
  userLng: number;
  accuracy?: number;
  forceSimulation?: boolean;
}) {
  // 1. If explicitly offline, enqueue in IndexedDB and return optimistic record
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueOfflineAction({
      url: '/api/attendance/mark-trainee',
      method: 'POST',
      body: payload,
      label: 'Mark Trainee Attendance',
    });
    return {
      success: true,
      offline: true,
      queued: true,
      message: 'Attendance saved offline in IndexedDB. Will automatically sync to server once reconnected.',
      record: {
        id: 'offline_' + Date.now(),
        traineeId: payload.traineeId,
        date: new Date().toISOString().split('T')[0],
        status: 'P' as AttendanceStatus,
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        method: 'geofence',
        verifiedLocation: { lat: payload.userLat, lng: payload.userLng, distanceMeters: 0 },
        remarks: 'Recorded offline in local database (IndexedDB queued)',
      },
    };
  }

  // 2. Try network call
  try {
    const res = await fetch('/api/attendance/mark-trainee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to mark attendance');
    return data;
  } catch (err: any) {
    // If connection dropped during flight, queue offline
    if (typeof navigator !== 'undefined' && (!navigator.onLine || err.message?.includes('Failed to fetch') || err.name === 'TypeError')) {
      await enqueueOfflineAction({
        url: '/api/attendance/mark-trainee',
        method: 'POST',
        body: payload,
        label: 'Mark Trainee Attendance',
      });
      return {
        success: true,
        offline: true,
        queued: true,
        message: 'Connection dropped: Attendance saved offline in IndexedDB and queued for sync.',
        record: {
          id: 'offline_' + Date.now(),
          traineeId: payload.traineeId,
          date: new Date().toISOString().split('T')[0],
          status: 'P' as AttendanceStatus,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          method: 'geofence',
          verifiedLocation: { lat: payload.userLat, lng: payload.userLng, distanceMeters: 0 },
          remarks: 'Recorded offline in local database (IndexedDB queued)',
        },
      };
    }
    throw err;
  }
}

export async function batchSaveAttendance(payload: {
  date: string;
  officerId: string;
  officerName: string;
  records: Array<{ traineeId: string; status: AttendanceStatus; remarks?: string }>;
}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueOfflineAction({
      url: '/api/attendance/batch-officer',
      method: 'POST',
      body: payload,
      label: `Batch Attendance (${payload.records.length} trainees)`,
    });
    return {
      success: true,
      offline: true,
      queued: true,
      message: `${payload.records.length} attendance record(s) queued offline. Will sync when back online.`,
    };
  }

  try {
    const res = await fetch('/api/attendance/batch-officer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update attendance');
    return res.json();
  } catch (err: any) {
    if (typeof navigator !== 'undefined' && (!navigator.onLine || err.message?.includes('Failed to fetch') || err.name === 'TypeError')) {
      await enqueueOfflineAction({
        url: '/api/attendance/batch-officer',
        method: 'POST',
        body: payload,
        label: `Batch Attendance (${payload.records.length} trainees)`,
      });
      return {
        success: true,
        offline: true,
        queued: true,
        message: 'Connection lost: Batch attendance queued offline in IndexedDB.',
      };
    }
    throw err;
  }
}

export async function triggerAutoAbsent(date?: string, tradeId?: string) {
  const res = await fetch('/api/attendance/auto-absent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, tradeId }),
  });
  return res.json();
}

export async function fetchLeaves(params?: { traineeId?: string; tradeId?: string; status?: string }): Promise<LeaveRequest[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<LeaveRequest[]>(
    `iti_cache_leaves_${qs || 'all'}`,
    () => fetch(`/api/leaves?${qs}`),
    []
  );
}

export async function applyLeave(payload: {
  traineeId: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueOfflineAction({
      url: '/api/leaves/apply',
      method: 'POST',
      body: payload,
      label: `Leave Application (${payload.leaveType})`,
    });
    return {
      success: true,
      offline: true,
      queued: true,
      message: 'Offline Mode: Leave application queued in local IndexedDB. Will sync when reconnected.',
      leave: {
        id: 'offline_leave_' + Date.now(),
        traineeId: payload.traineeId,
        leaveType: payload.leaveType,
        fromDate: payload.fromDate,
        toDate: payload.toDate,
        days: payload.days,
        reason: payload.reason,
        status: 'pending',
        appliedAt: new Date().toISOString(),
      },
    };
  }

  try {
    const res = await fetch('/api/leaves/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to submit leave' }));
      throw new Error(err.error || 'Failed to submit leave application');
    }
    return res.json();
  } catch (err: any) {
    if (typeof navigator !== 'undefined' && (!navigator.onLine || err.message?.includes('Failed to fetch') || err.name === 'TypeError')) {
      await enqueueOfflineAction({
        url: '/api/leaves/apply',
        method: 'POST',
        body: payload,
        label: `Leave Application (${payload.leaveType})`,
      });
      return {
        success: true,
        offline: true,
        queued: true,
        message: 'Connection interrupted: Leave application queued in IndexedDB.',
        leave: {
          id: 'offline_leave_' + Date.now(),
          traineeId: payload.traineeId,
          leaveType: payload.leaveType,
          fromDate: payload.fromDate,
          toDate: payload.toDate,
          days: payload.days,
          reason: payload.reason,
          status: 'pending',
          appliedAt: new Date().toISOString(),
        },
      };
    }
    throw err;
  }
}

export async function reviewLeave(id: string, payload: {
  status: 'approved' | 'rejected';
  officerName: string;
  reviewerRemarks?: string;
}) {
  const res = await fetch(`/api/leaves/${id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to review leave application');
  return res.json();
}

export async function fetchWarnings(params?: { traineeId?: string; tradeId?: string }): Promise<WarningNotice[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<WarningNotice[]>(
    `iti_cache_warnings_${qs || 'all'}`,
    () => fetch(`/api/warnings?${qs}`),
    []
  );
}

export async function issueWarning(payload: {
  traineeId: string;
  officerId: string;
  officerName: string;
  attendancePercent: number;
  subject?: string;
  subjectHindi?: string;
  message: string;
  messageHindi?: string;
}) {
  const res = await fetch('/api/warnings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to issue warning');
  return res.json();
}

export async function acknowledgeWarning(id: string) {
  const res = await fetch(`/api/warnings/${id}/acknowledge`, { method: 'PUT' });
  return res.json();
}

export async function fetchInventory(params?: { tradeId?: string; category?: string }): Promise<InventoryItem[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<InventoryItem[]>(
    `iti_cache_inventory_${qs || 'all'}`,
    () => fetch(`/api/inventory?${qs}`),
    []
  );
}

export async function saveInventoryItem(item: Partial<InventoryItem> & { officerId?: string; officerName?: string }) {
  const method = item.id ? 'PUT' : 'POST';
  const url = item.id ? `/api/inventory/${item.id}` : '/api/inventory';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Failed to save inventory item');
  return res.json();
}

export async function deleteInventoryItem(id: string) {
  const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete inventory item');
  return res.json();
}

export async function fetchIndents(params?: { tradeId?: string; traineeId?: string; status?: string }): Promise<IndentRecord[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<IndentRecord[]>(
    `iti_cache_indents_${qs || 'all'}`,
    () => fetch(`/api/indent?${qs}`),
    []
  );
}

export async function issueIndent(payload: {
  tradeId: string;
  officerId: string;
  officerName: string;
  traineeId: string;
  itemId: string;
  quantity: number;
  expectedReturnDate: string;
  remarks?: string;
}) {
  const res = await fetch('/api/indent/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to issue indent');
  return data;
}

export async function returnIndent(id: string, payload: {
  returnCondition: 'Good' | 'Damaged' | 'Normal Wear';
  remarks?: string;
  officerName: string;
}) {
  const res = await fetch(`/api/indent/${id}/return`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to record indent return');
  return res.json();
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  return fetchWithOfflineCache<AuditLog[]>('iti_cache_audit_logs', () => fetch('/api/audit-logs'), []);
}

export async function resetDatabase() {
  const res = await fetch('/api/reset-data', { method: 'POST' });
  return res.json();
}

export async function fetchNotifications(traineeId?: string): Promise<AppNotification[]> {
  const params = traineeId ? `?traineeId=${encodeURIComponent(traineeId)}` : '';
  return fetchWithOfflineCache<AppNotification[]>(
    `iti_cache_notifications_${traineeId || 'all'}`,
    () => fetch(`/api/notifications${params}`),
    []
  );
}

// -------------------------------------------------------------
// Password Recovery Flow APIs
// -------------------------------------------------------------
export async function requestPasswordReset(params: {
  identifier: string;
  role?: 'admin' | 'officer' | 'trainee';
}): Promise<{
  success: boolean;
  message: string;
  email: string;
  maskedEmail: string;
  userName: string;
  role: 'admin' | 'officer' | 'trainee';
  token: string;
  expiresMinutes: number;
}> {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to request password reset token');
  }
  return data;
}

export async function verifyResetToken(params: {
  token: string;
  email?: string;
}): Promise<{
  success: boolean;
  valid: boolean;
  email: string;
  userName: string;
  role: 'admin' | 'officer' | 'trainee';
}> {
  const res = await fetch('/api/auth/verify-reset-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Invalid or expired token');
  }
  return data;
}

export async function resetPasswordWithToken(params: {
  token: string;
  email: string;
  newPassword: string;
}): Promise<{
  success: boolean;
  message: string;
  email: string;
  role: 'admin' | 'officer' | 'trainee';
}> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to reset password');
  }
  return data;
}

// -------------------------------------------------------------
// Training Officer Academic & Administrative Routine APIs
// -------------------------------------------------------------
export async function fetchLessonPlans(tradeId?: string): Promise<LessonPlan[]> {
  const qs = tradeId ? `?tradeId=${encodeURIComponent(tradeId)}` : '';
  return fetchWithOfflineCache<LessonPlan[]>(`iti_cache_lesson_plans_${tradeId || 'all'}`, () => fetch(`/api/lesson-plans${qs}`), []);
}

export async function saveLessonPlan(payload: Partial<LessonPlan>) {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? `/api/lesson-plans/${payload.id}` : '/api/lesson-plans';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save lesson plan');
  return res.json();
}

export async function deleteLessonPlan(id: string) {
  const res = await fetch(`/api/lesson-plans/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete lesson plan');
  return res.json();
}

export async function fetchDemonstrationPlans(tradeId?: string): Promise<DemonstrationPlan[]> {
  const qs = tradeId ? `?tradeId=${encodeURIComponent(tradeId)}` : '';
  return fetchWithOfflineCache<DemonstrationPlan[]>(`iti_cache_demo_plans_${tradeId || 'all'}`, () => fetch(`/api/demonstration-plans${qs}`), []);
}

export async function saveDemonstrationPlan(payload: Partial<DemonstrationPlan>) {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? `/api/demonstration-plans/${payload.id}` : '/api/demonstration-plans';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save demonstration plan');
  return res.json();
}

export async function deleteDemonstrationPlan(id: string) {
  const res = await fetch(`/api/demonstration-plans/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete demonstration plan');
  return res.json();
}

export async function fetchWeeklyPlans(tradeId?: string): Promise<WeeklyPlan[]> {
  const qs = tradeId ? `?tradeId=${encodeURIComponent(tradeId)}` : '';
  return fetchWithOfflineCache<WeeklyPlan[]>(`iti_cache_weekly_plans_${tradeId || 'all'}`, () => fetch(`/api/weekly-plans${qs}`), []);
}

export async function saveWeeklyPlan(payload: Partial<WeeklyPlan>) {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? `/api/weekly-plans/${payload.id}` : '/api/weekly-plans';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save weekly plan');
  return res.json();
}

export async function deleteWeeklyPlan(id: string) {
  const res = await fetch(`/api/weekly-plans/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete weekly plan');
  return res.json();
}

export async function fetchAssessments(traineeId?: string): Promise<TraineeAssessment[]> {
  const qs = traineeId ? `?traineeId=${encodeURIComponent(traineeId)}` : '';
  return fetchWithOfflineCache<TraineeAssessment[]>(`iti_cache_assessments_${traineeId || 'all'}`, () => fetch(`/api/assessments${qs}`), []);
}

export async function saveAssessment(payload: Partial<TraineeAssessment>) {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? `/api/assessments/${payload.id}` : '/api/assessments';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save assessment');
  }
  return res.json();
}

export async function deleteAssessment(id: string) {
  const res = await fetch(`/api/assessments/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete assessment');
  return res.json();
}

export async function bulkImportTrainees(payload: {
  trainees: Partial<Trainee>[];
  tradeId: string;
  sessionId: string;
  officerId: string;
  officerName: string;
}) {
  const res = await fetch('/api/trainees/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to bulk import trainees');
  return data;
}



