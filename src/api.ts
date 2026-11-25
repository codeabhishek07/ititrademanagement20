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
  HolidayRecord,
  StoredDocumentRecord,
  DocumentCategory,
  UserPreferences,
  UserRole,
  TradeEnrollment,
} from './types.ts';
import {
  getCachedData,
  setCachedData,
  enqueueOfflineAction,
} from './offline/indexedDb.ts';
import {
  getIstClockParts,
  formatClock12,
  updateServerTimeOffset,
} from './utils/attendanceCalendar.ts';

const AUTH_TOKEN_KEY = 'iti_session_token';

export function getAuthToken(): string {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage restriction
  }
}

function withAuthHeaders(headers?: HeadersInit): HeadersInit {
  const token = getAuthToken();
  const base: Record<string, string> = {};
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    Object.assign(base, headers);
  }
  if (token) {
    base['x-iti-session'] = token;
  }
  return base;
}

function syncClockFromResponse(res: Response) {
  try {
    const hdr = res.headers.get('X-Server-Time-Ms');
    if (hdr) {
      const ms = Number(hdr);
      if (Number.isFinite(ms) && ms > 0) {
        updateServerTimeOffset(ms);
        return;
      }
    }
    const dateHdr = res.headers.get('Date');
    if (dateHdr) {
      const ms = Date.parse(dateHdr);
      if (Number.isFinite(ms) && ms > 0) {
        updateServerTimeOffset(ms);
      }
    }
  } catch {
    // ignore header inspection errors
  }
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: withAuthHeaders(init.headers),
  });
  syncClockFromResponse(res);
  return res;
}

export async function syncServerTime(): Promise<{ serverTimeMs: number; timeZone: string; utcOffset: string } | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    const res = await fetch('/api/system/time', { cache: 'no-store' });
    syncClockFromResponse(res);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.serverTimeMs === 'number') {
      updateServerTimeOffset(data.serverTimeMs);
    }
    return data;
  } catch {
    return null;
  }
}

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
    syncClockFromResponse(res);
    if (res.ok) {
      const data = (await res.json()) as T;
      if (data && typeof data === 'object' && typeof (data as any).serverTimeMs === 'number') {
        updateServerTimeOffset((data as any).serverTimeMs);
      }
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
    serverTimeMs?: number;
    timeZone?: string;
    isProduction?: boolean;
    settings: SystemSettings;
    sessions: AcademicSession[];
    trades: Trade[];
    tradeEnrollments?: TradeEnrollment[];
    holidays?: HolidayRecord[];
    stats: {
      totalTrades: number;
      totalCommonTrades?: number;
      totalOfficers: number;
      totalTrainees: number;
      totalCommonEnrollments?: number;
      totalInventoryItems: number;
    };
  }>('iti_cache_bootstrap', () => fetch('/api/bootstrap', { cache: 'no-store' }));
}

export async function loginApi(params: {
  role: 'admin' | 'officer' | 'trainee';
  email?: string;
  password?: string;
  officerId?: string;
  traineeId?: string;
}): Promise<{ user: any; sessionToken?: string; preferences?: UserPreferences | null }> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || 'Login failed');
  }
  const data = await res.json();
  if (data.sessionToken) {
    setAuthToken(data.sessionToken);
  }
  return data;
}

export async function googleLoginApi(params: {
  email: string;
  uid: string;
  role?: 'admin' | 'officer' | 'trainee';
}): Promise<{ user: any; sessionToken?: string; preferences?: UserPreferences | null }> {
  const res = await apiFetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Google authentication failed');
  }
  if (data.sessionToken) {
    setAuthToken(data.sessionToken);
  }
  return data;
}

export async function fetchAuthSession(): Promise<{
  authenticated: boolean;
  user: any | null;
  sessionToken?: string;
  preferences?: UserPreferences | null;
}> {
  const res = await apiFetch('/api/auth/session');
  if (!res.ok) return { authenticated: false, user: null };
  return res.json();
}

export async function logoutApi(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore network errors on logout
  } finally {
    setAuthToken(null);
  }
}

export async function fetchSettings(): Promise<SystemSettings> {
  return fetchWithOfflineCache<SystemSettings>(
    'iti_cache_settings',
    () => fetch('/api/settings', { cache: 'no-store' })
  );
}

export async function updateSettings(settings: Partial<SystemSettings>) {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  const updated = await res.json();
  // Sync unwrapped settings to IndexedDB caches
  const cleanSettings = updated?.settings || updated;
  setCachedData('iti_cache_settings', cleanSettings).catch(() => {});
  getCachedData<any>('iti_cache_bootstrap')
    .then((cached) => {
      if (cached && typeof cached === 'object') {
        setCachedData('iti_cache_bootstrap', { ...cached, settings: cleanSettings }).catch(() => {});
      }
    })
    .catch(() => {});
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

export async function fetchHolidays(params?: { sessionId?: string; month?: string; date?: string }): Promise<HolidayRecord[]> {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]).toString() : '';
  const url = qs ? `/api/holidays?${qs}` : '/api/holidays';
  return fetchWithOfflineCache<HolidayRecord[]>(
    `iti_cache_holidays_${qs || 'all'}`,
    () => fetch(url),
    []
  );
}

export async function createHoliday(holiday: Partial<HolidayRecord>) {
  const res = await fetch('/api/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(holiday),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create holiday');
  return data;
}

export async function updateHoliday(id: string, holiday: Partial<HolidayRecord>) {
  const res = await fetch(`/api/holidays/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(holiday),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update holiday');
  return data;
}

export async function deleteHoliday(id: string) {
  const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete holiday');
  return data;
}

export async function fetchTrades(): Promise<Trade[]> {
  return fetchWithOfflineCache<Trade[]>('iti_cache_trades', () => apiFetch('/api/trades'), []);
}

export async function createTrade(trade: Partial<Trade>) {
  const res = await apiFetch('/api/trades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trade),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create trade');
  return data;
}

export async function updateTrade(id: string, trade: Partial<Trade>) {
  const res = await apiFetch(`/api/trades/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trade),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update trade');
  return data;
}

export async function deleteTrade(id: string) {
  const res = await apiFetch(`/api/trades/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete trade');
  return data;
}

export async function fetchTradeEnrollments(params?: {
  tradeId?: string;
  traineeId?: string;
  includeRemoved?: boolean;
}): Promise<TradeEnrollment[]> {
  const sp = new URLSearchParams();
  if (params?.tradeId) sp.append('tradeId', params.tradeId);
  if (params?.traineeId) sp.append('traineeId', params.traineeId);
  if (params?.includeRemoved) sp.append('includeRemoved', 'true');
  const qs = sp.toString();
  const url = qs ? `/api/trade-enrollments?${qs}` : '/api/trade-enrollments';
  return fetchWithOfflineCache<TradeEnrollment[]>(
    `iti_cache_trade_enrollments_${qs || 'all'}`,
    () => apiFetch(url, { cache: 'no-store' }),
    []
  );
}

export async function enrollTraineeInCommonTrade(tradeId: string, traineeId: string) {
  const res = await apiFetch('/api/trade-enrollments/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tradeId, traineeId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to enroll trainee in common trade');
  return data;
}

export async function removeTraineeFromCommonTrade(tradeId: string, traineeId: string) {
  const res = await apiFetch('/api/trade-enrollments/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tradeId, traineeId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to remove trainee from common trade');
  return data;
}

export async function syncCommonTradeEnrollments(tradeId?: string) {
  const res = await apiFetch('/api/trade-enrollments/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tradeId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to sync common trade enrollments');
  return data;
}

export async function fetchOfficers(): Promise<TrainingOfficer[]> {
  return fetchWithOfflineCache<TrainingOfficer[]>('iti_cache_officers', () => apiFetch('/api/officers'), []);
}

export async function fetchOfficer(id: string): Promise<TrainingOfficer> {
  return fetchWithOfflineCache<TrainingOfficer>(`iti_cache_officer_${id}`, () => apiFetch(`/api/officers/${id}`));
}

export async function createOfficer(officer: Partial<TrainingOfficer>) {
  const res = await apiFetch('/api/officers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(officer),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create officer');
  return data;
}

export async function updateOfficer(id: string, officer: Partial<TrainingOfficer>) {
  const res = await apiFetch(`/api/officers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(officer),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update officer');
  return data;
}

export async function resetOfficerPassword(id: string, newPassword?: string) {
  const res = await apiFetch(`/api/officers/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to reset password');
  return data;
}

export async function deleteOfficer(id: string) {
  const res = await apiFetch(`/api/officers/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete officer');
  return data;
}

export async function fetchTrainees(tradeId?: string, sessionId?: string): Promise<Trainee[]> {
  const params = new URLSearchParams();
  if (tradeId) params.append('tradeId', tradeId);
  if (sessionId) params.append('sessionId', sessionId);
  const qs = params.toString();
  return fetchWithOfflineCache<Trainee[]>(
    `iti_cache_trainees_${qs || 'all'}`,
    () => apiFetch(`/api/trainees?${qs}`),
    []
  );
}

export async function createTrainee(trainee: Partial<Trainee> & { officerId?: string; officerName?: string }) {
  const res = await apiFetch('/api/trainees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trainee),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create trainee');
  return data;
}

export async function updateTrainee(id: string, trainee: Partial<Trainee>) {
  const res = await apiFetch(`/api/trainees/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trainee),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update trainee');
  return data;
}

export async function deleteTrainee(id: string, officerInfo?: { officerId?: string; officerName?: string }) {
  const params = new URLSearchParams(officerInfo as any);
  const res = await apiFetch(`/api/trainees/${id}?${params.toString()}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete trainee');
  return data;
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
    () => apiFetch(`/api/attendance?${qs}`),
    []
  );
}

export async function markTraineeAttendance(payload: {
  traineeId: string;
  tradeId?: string;
  userLat: number;
  userLng: number;
  accuracy?: number;
  forceSimulation?: boolean;
}) {
  if (
    !payload.forceSimulation &&
    (!Number.isFinite(payload.userLat) ||
      !Number.isFinite(payload.userLng) ||
      payload.userLat < -90 ||
      payload.userLat > 90 ||
      payload.userLng < -180 ||
      payload.userLng > 180 ||
      (Math.abs(payload.userLat) < 0.0001 && Math.abs(payload.userLng) < 0.0001))
  ) {
    throw new Error('Valid client-side device GPS coordinates are required to mark attendance.');
  }

  // 1. If explicitly offline, enqueue in IndexedDB and return optimistic record
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const istNow = getIstClockParts();
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
        date: istNow.dateStr,
        status: 'P' as AttendanceStatus,
        timestamp: formatClock12(istNow.hours, istNow.minutes),
        method: 'geofence',
        verifiedLocation: { lat: payload.userLat, lng: payload.userLng, distanceMeters: 0 },
        remarks: 'Recorded offline in local database (IndexedDB queued)',
      },
    };
  }

  // 2. Try network call
  try {
    const res = await apiFetch('/api/attendance/mark-trainee', {
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
      const istNow = getIstClockParts();
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
          date: istNow.dateStr,
          status: 'P' as AttendanceStatus,
          timestamp: formatClock12(istNow.hours, istNow.minutes),
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
  tradeId?: string;
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
    const res = await apiFetch('/api/attendance/batch-officer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update attendance');
    return data;
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

export async function triggerAutoAbsent(date?: string, tradeId?: string, primaryTradeId?: string) {
  const res = await apiFetch('/api/attendance/auto-absent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      tradeId,
      ...(primaryTradeId && primaryTradeId !== 'all' ? { primaryTradeId } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to trigger auto-absent');
  return data;
}

export async function fetchLeaves(params?: { traineeId?: string; tradeId?: string; status?: string }): Promise<LeaveRequest[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<LeaveRequest[]>(
    `iti_cache_leaves_${qs || 'all'}`,
    () => apiFetch(`/api/leaves?${qs}`),
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
  attachmentDocId?: string;
  attachmentName?: string;
  attachmentUrl?: string;
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
    const res = await apiFetch('/api/leaves/apply', {
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
  const res = await apiFetch(`/api/leaves/${id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to review leave application');
  return data;
}

export async function fetchWarnings(params?: { traineeId?: string; tradeId?: string }): Promise<WarningNotice[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<WarningNotice[]>(
    `iti_cache_warnings_${qs || 'all'}`,
    () => apiFetch(`/api/warnings?${qs}`),
    []
  );
}

export async function issueWarning(payload: {
  traineeId: string;
  tradeId?: string;
  officerId: string;
  officerName: string;
  attendancePercent: number;
  subject?: string;
  subjectHindi?: string;
  message: string;
  messageHindi?: string;
}) {
  const res = await apiFetch('/api/warnings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to issue warning');
  return data;
}

export async function acknowledgeWarning(id: string) {
  const res = await apiFetch(`/api/warnings/${id}/acknowledge`, { method: 'PUT' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to acknowledge warning');
  return data;
}

export async function fetchInventory(params?: { tradeId?: string; category?: string }): Promise<InventoryItem[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<InventoryItem[]>(
    `iti_cache_inventory_${qs || 'all'}`,
    () => apiFetch(`/api/inventory?${qs}`),
    []
  );
}

export async function saveInventoryItem(item: Partial<InventoryItem> & { officerId?: string; officerName?: string }) {
  const method = item.id ? 'PUT' : 'POST';
  const url = item.id ? `/api/inventory/${item.id}` : '/api/inventory';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to save inventory item');
  return data;
}

export async function deleteInventoryItem(id: string) {
  const res = await apiFetch(`/api/inventory/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete inventory item');
  return data;
}

export async function fetchIndents(params?: { tradeId?: string; traineeId?: string; status?: string }): Promise<IndentRecord[]> {
  const qs = new URLSearchParams(params as any).toString();
  return fetchWithOfflineCache<IndentRecord[]>(
    `iti_cache_indents_${qs || 'all'}`,
    () => apiFetch(`/api/indent?${qs}`),
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
  const res = await apiFetch('/api/indent/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to issue indent');
  return data;
}

export async function returnIndent(id: string, payload: {
  returnCondition: 'Good' | 'Damaged' | 'Normal Wear';
  remarks?: string;
  officerName: string;
}) {
  const res = await apiFetch(`/api/indent/${id}/return`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to record indent return');
  return data;
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  return fetchWithOfflineCache<AuditLog[]>('iti_cache_audit_logs', () => apiFetch('/api/audit-logs'), []);
}

export async function resetDatabase(confirmationText: string) {
  const res = await apiFetch('/api/reset-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmationText }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to reset demo data');
  }
  return data;
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
  return fetchWithOfflineCache<LessonPlan[]>(`iti_cache_lesson_plans_${tradeId || 'all'}`, () => apiFetch(`/api/lesson-plans${qs}`), []);
}

export async function saveLessonPlan(payload: Partial<LessonPlan>) {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? `/api/lesson-plans/${payload.id}` : '/api/lesson-plans';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to save lesson plan');
  return data;
}

export async function deleteLessonPlan(id: string) {
  const res = await apiFetch(`/api/lesson-plans/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete lesson plan');
  return data;
}

export async function fetchDemonstrationPlans(tradeId?: string): Promise<DemonstrationPlan[]> {
  const qs = tradeId ? `?tradeId=${encodeURIComponent(tradeId)}` : '';
  return fetchWithOfflineCache<DemonstrationPlan[]>(`iti_cache_demo_plans_${tradeId || 'all'}`, () => apiFetch(`/api/demonstration-plans${qs}`), []);
}

export async function saveDemonstrationPlan(payload: Partial<DemonstrationPlan>) {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? `/api/demonstration-plans/${payload.id}` : '/api/demonstration-plans';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to save demonstration plan');
  return data;
}

export async function deleteDemonstrationPlan(id: string) {
  const res = await apiFetch(`/api/demonstration-plans/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete demonstration plan');
  return data;
}

export async function fetchWeeklyPlans(tradeId?: string): Promise<WeeklyPlan[]> {
  const qs = tradeId ? `?tradeId=${encodeURIComponent(tradeId)}` : '';
  return fetchWithOfflineCache<WeeklyPlan[]>(`iti_cache_weekly_plans_${tradeId || 'all'}`, () => apiFetch(`/api/weekly-plans${qs}`), []);
}

export async function saveWeeklyPlan(payload: Partial<WeeklyPlan>) {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? `/api/weekly-plans/${payload.id}` : '/api/weekly-plans';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to save weekly plan');
  return data;
}

export async function deleteWeeklyPlan(id: string) {
  const res = await apiFetch(`/api/weekly-plans/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete weekly plan');
  return data;
}

export async function fetchAssessments(traineeId?: string, tradeId?: string): Promise<TraineeAssessment[]> {
  const params = new URLSearchParams();
  if (traineeId) params.append('traineeId', traineeId);
  if (tradeId) params.append('tradeId', tradeId);
  const qs = params.toString();
  const url = qs ? `/api/assessments?${qs}` : '/api/assessments';
  return fetchWithOfflineCache<TraineeAssessment[]>(
    `iti_cache_assessments_${qs || 'all'}`,
    () => apiFetch(url, { cache: 'no-store' }),
    []
  );
}

export async function saveAssessment(payload: Partial<TraineeAssessment>): Promise<{
  success: boolean;
  assessment: TraineeAssessment;
  assessments?: TraineeAssessment[];
}> {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? `/api/assessments/${payload.id}` : '/api/assessments';
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save assessment');
  }
  const data = await res.json();
  if (payload.traineeId && Array.isArray(data?.assessments)) {
    const cacheKey = payload.tradeId
      ? `iti_cache_assessments_traineeId=${encodeURIComponent(payload.traineeId)}&tradeId=${encodeURIComponent(payload.tradeId)}`
      : `iti_cache_assessments_traineeId=${encodeURIComponent(payload.traineeId)}`;
    setCachedData(cacheKey, data.assessments).catch(() => {});
  }
  return data;
}

export async function deleteAssessment(id: string) {
  const res = await apiFetch(`/api/assessments/${id}`, { method: 'DELETE' });
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
  const res = await apiFetch('/api/trainees/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to bulk import trainees');
  return data;
}

// -------------------------------------------------------------
// Persistent User Preferences (Cloud Firestore)
// -------------------------------------------------------------
export async function fetchUserPreferences(userId: string): Promise<UserPreferences | null> {
  if (!userId) return null;
  try {
    const res = await apiFetch(`/api/user-preferences/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveUserPreferences(
  userId: string,
  prefs: Partial<UserPreferences> & { role?: UserRole }
): Promise<UserPreferences | null> {
  if (!userId) return null;
  try {
    const res = await apiFetch(`/api/user-preferences/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.preferences || null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Persistent Document Vault & Cloud Status
// -------------------------------------------------------------
export async function fetchDocuments(params?: {
  category?: string;
  tradeId?: string;
  traineeId?: string;
  uploadedById?: string;
}): Promise<StoredDocumentRecord[]> {
  const qs = params
    ? new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]).toString()
    : '';
  const url = qs ? `/api/documents?${qs}` : '/api/documents';
  return fetchWithOfflineCache<StoredDocumentRecord[]>(
    `iti_cache_documents_${qs || 'all'}`,
    () => apiFetch(url),
    []
  );
}

export async function uploadDocument(payload: {
  title: string;
  fileName: string;
  mimeType: string;
  base64Content?: string;
  category: DocumentCategory;
  uploadedById: string;
  uploadedByName: string;
  uploadedByRole: UserRole;
  tradeId?: string;
  sessionId?: string;
  traineeId?: string;
  relatedId?: string;
  remarks?: string;
  existingDownloadUrl?: string;
  existingStoragePath?: string;
}): Promise<{ success: boolean; document: StoredDocumentRecord }> {
  const res = await apiFetch('/api/documents/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to upload document');
  }
  return data;
}

export async function deleteDocument(id: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to delete document');
  }
  return data;
}

export async function fetchCloudStatus(): Promise<{
  connected: boolean;
  firestoreState: string;
  quotaPaused: boolean;
  pendingWrites: number;
  provider: string;
  databaseId: string;
  project: string;
  storage: {
    bucket: string;
    bucketActive: boolean;
    mode: 'firebase_storage' | 'firestore_storage';
  };
  summary: Record<string, number>;
}> {
  const res = await apiFetch('/api/system/cloud-status');
  if (!res.ok) throw new Error('Failed to fetch cloud persistence status');
  return res.json();
}




