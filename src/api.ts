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
} from './types.ts';

export async function fetchBootstrap() {
  const res = await fetch('/api/bootstrap');
  if (!res.ok) throw new Error('Failed to load bootstrap data');
  return res.json() as Promise<{
    settings: SystemSettings;
    sessions: AcademicSession[];
    trades: Trade[];
    stats: {
      totalTrades: number;
      totalOfficers: number;
      totalTrainees: number;
      totalInventoryItems: number;
    };
  }>;
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
  const res = await fetch('/api/settings');
  return res.json();
}

export async function updateSettings(settings: Partial<SystemSettings>) {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

export async function fetchSessions(): Promise<AcademicSession[]> {
  const res = await fetch('/api/sessions');
  return res.json();
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

export async function fetchMonthlyWorkingDays(sessionId?: string): Promise<MonthlyWorkingDay[]> {
  const url = sessionId ? `/api/monthly-working-days?sessionId=${sessionId}` : '/api/monthly-working-days';
  const res = await fetch(url);
  return res.json();
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

export async function fetchTrades(): Promise<Trade[]> {
  const res = await fetch('/api/trades');
  return res.json();
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
  const res = await fetch('/api/officers');
  return res.json();
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
  const res = await fetch(`/api/trainees?${params.toString()}`);
  return res.json();
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
  const res = await fetch(`/api/attendance?${qs}`);
  return res.json();
}

export async function markTraineeAttendance(payload: {
  traineeId: string;
  userLat: number;
  userLng: number;
  accuracy?: number;
  forceSimulation?: boolean;
}) {
  const res = await fetch('/api/attendance/mark-trainee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to mark attendance');
  return data;
}

export async function batchSaveAttendance(payload: {
  date: string;
  officerId: string;
  officerName: string;
  records: Array<{ traineeId: string; status: AttendanceStatus; remarks?: string }>;
}) {
  const res = await fetch('/api/attendance/batch-officer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update attendance');
  return res.json();
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
  const res = await fetch(`/api/leaves?${qs}`);
  return res.json();
}

export async function applyLeave(payload: {
  traineeId: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
}) {
  const res = await fetch('/api/leaves/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to submit leave application');
  return res.json();
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
  const res = await fetch(`/api/warnings?${qs}`);
  return res.json();
}

export async function issueWarning(payload: {
  traineeId: string;
  officerId: string;
  officerName: string;
  attendancePercent: number;
  subject?: string;
  message: string;
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
  const res = await fetch(`/api/inventory?${qs}`);
  return res.json();
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
  const res = await fetch(`/api/indent?${qs}`);
  return res.json();
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
  const res = await fetch('/api/audit-logs');
  return res.json();
}

export async function resetDatabase() {
  const res = await fetch('/api/reset-data', { method: 'POST' });
  return res.json();
}

export async function fetchNotifications(traineeId?: string): Promise<AppNotification[]> {
  const params = traineeId ? `?traineeId=${encodeURIComponent(traineeId)}` : '';
  const res = await fetch(`/api/notifications${params}`);
  if (!res.ok) return [];
  return res.json();
}

