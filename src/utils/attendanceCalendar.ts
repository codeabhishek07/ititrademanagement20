import type { AttendanceRecord, AttendanceWindow, HolidayRecord } from '../types.ts';

export type WeeklyHolidayKind = 'sunday' | 'second_saturday' | 'third_saturday';

export interface WeeklyHolidayInfo {
  isWeeklyHoliday: boolean;
  kind: WeeklyHolidayKind | null;
  label: string | null;
  shortTag: string | null;
}

export interface DateHolidayStatus {
  dateStr: string;
  dayOfWeek: number; // 0 (Sun) - 6 (Sat), -1 if invalid
  isSunday: boolean;
  isSecondSaturday: boolean;
  isThirdSaturday: boolean;
  isWeeklyHoliday: boolean;
  weeklyKind: WeeklyHolidayKind | null;
  weeklyLabel: string | null;
  weeklyShortTag: string | null;
  adminHoliday: HolidayRecord | null;
  isAdminHoliday: boolean;
  isHoliday: boolean;
  isWorkingDay: boolean;
  isOverlap: boolean; // True when Admin holiday falls on an already designated Weekly Holiday
  title: string;
  categoryLabel: string;
  lockReason: string | null;
}

export interface MonthWorkingDayBreakdown {
  year: number;
  month: number; // 1-12
  monthKey: string; // YYYY-MM
  totalCalendarDays: number;
  sundaysCount: number;
  secondThirdSaturdaysCount: number;
  weeklyHolidays: number; // Sundays + 2nd Saturdays + 3rd Saturdays
  totalAdminHolidaysInMonth: number;
  overlappingAdminHolidays: number; // Admin holidays falling on Sunday / 2nd Sat / 3rd Sat (excluded from extra deduction)
  adminDesignatedHolidays: number; // Unique Admin holidays on non-weekly-off days
  totalHolidays: number; // weeklyHolidays + adminDesignatedHolidays (deduplicated union)
  totalWorkingDays: number; // totalCalendarDays - weeklyHolidays - adminDesignatedHolidays
  days: Array<{ dayNumber: number } & DateHolidayStatus>;
}

export interface DateRangeWorkingDayBreakdown {
  startDate: string;
  endDate: string;
  totalCalendarDays: number;
  weeklyHolidays: number;
  adminDesignatedHolidays: number; // Unique non-overlapping Admin holidays
  overlappingAdminHolidays: number;
  totalHolidays: number;
  totalWorkingDays: number;
  workingDates: string[];
}

export interface TraineeAttendanceMetrics {
  totalWorkingDays: number;
  totalMarkedWorkingDays: number;
  presentDays: number;
  absentDays: number;
  recordedAbsentDays: number;
  missingWorkingDaysAbsent: number;
  clDays: number;
  mlDays: number;
  halfDays: number;
  leaveDays: number;
  excludedHolidayRecords: number;
  attendancePercent: number;
  isBelowThreshold: boolean;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
}

/**
 * Parses a YYYY-MM-DD string safely into calendar integers without timezone shift.
 */
export function parseDateParts(
  dateStr: string
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getDaysInMonthUTC(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * India Standard Time (Asia/Kolkata) is permanently UTC+05:30 with no Daylight Saving Time.
 * Using exact fixed-offset epoch arithmetic guarantees identical results across all OS/browser timezones
 * (UTC container, PST, mobile WebViews, minimal ICU builds) and handles 00:00–05:29 IST midnight transitions accurately.
 */
export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330; // +05:30
export const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000; // 19,800,000 ms

let serverTimeOffsetMs = 0;

/**
 * Synchronizes client clock offset against authoritative backend server epoch time.
 */
export function updateServerTimeOffset(serverTimeMs: number): number {
  if (!Number.isFinite(serverTimeMs) || serverTimeMs <= 0) return serverTimeOffsetMs;
  const nextOffset = serverTimeMs - Date.now();
  // Smooth micro-jitter (< 1.5s) while snapping immediately on larger clock skew
  if (Math.abs(nextOffset - serverTimeOffsetMs) > 1500 || serverTimeOffsetMs === 0) {
    serverTimeOffsetMs = nextOffset;
  }
  return serverTimeOffsetMs;
}

export function getServerTimeOffsetMs(): number {
  return serverTimeOffsetMs;
}

/**
 * Returns the current Date synchronized with the backend server clock.
 */
export function getSynchronizedNow(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

/**
 * Returns YYYY-MM-DD for India Standard Time (Asia/Kolkata, UTC+05:30).
 */
export function getIstDateStr(now: Date = getSynchronizedNow()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return formatDateParts(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate());
}

/**
 * Returns YYYY-MM for India Standard Time (Asia/Kolkata, UTC+05:30).
 */
export function getIstYearMonth(now: Date = getSynchronizedNow()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Returns calendar year in India Standard Time (Asia/Kolkata, UTC+05:30).
 */
export function getIstYear(now: Date = getSynchronizedNow()): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.getUTCFullYear();
}

/**
 * Steps a YYYY-MM month key safely by deltaMonths using UTC math (immune to timezone shifts).
 */
export function stepMonthKey(monthKey: string, deltaMonths: number): string {
  const mMatch = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  const baseYear = mMatch ? Number(mMatch[1]) : getIstYear();
  const baseMonth = mMatch ? Number(mMatch[2]) : Number(getIstYearMonth().slice(5, 7));
  const dt = new Date(Date.UTC(baseYear, baseMonth - 1 + deltaMonths, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Formats an instant into localized IST timestamp string (e.g. "17/11/2026, 09:30:12 pm").
 */
export function formatIstDateTime(now: Date = getSynchronizedNow()): string {
  try {
    return now.toLocaleString('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    const p = getIstClockParts(now);
    return `${p.dateStr} ${formatClock12(p.hours, p.minutes)} IST`;
  }
}

/**
 * Returns exact IST year, month, day, dayOfWeek, hour, minute, second, and YYYY-MM-DD date string
 * reliably on any server or browser timezone using fixed UTC+05:30 arithmetic.
 */
export function getIstClockParts(now: Date = getSynchronizedNow()): {
  dateStr: string;
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth() + 1;
  const day = ist.getUTCDate();
  const dayOfWeek = ist.getUTCDay();
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const seconds = ist.getUTCSeconds();

  return {
    dateStr: formatDateParts(year, month, day),
    year,
    month,
    day,
    dayOfWeek,
    hours,
    minutes,
    seconds,
  };
}

export function addDaysToDateStr(dateStr: string, deltaDays: number): string | null {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays));
  return formatDateParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Returns day of week in UTC (0 = Sunday, 1 = Monday, ..., 6 = Saturday) for YYYY-MM-DD.
 */
export function getDayOfWeekUTC(dateStr: string): number {
  const parts = parseDateParts(dateStr);
  if (!parts) return -1;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/**
 * Returns occurrence index of weekday within its calendar month (1st, 2nd, 3rd, 4th, 5th).
 */
export function getNthWeekdayInMonth(dayOfMonth: number): number {
  return Math.ceil(dayOfMonth / 7);
}

/**
 * Evaluates government default weekly holidays:
 * - Every Sunday
 * - 2nd Saturday of every month
 * - 3rd Saturday of every month
 */
export function getWeeklyHolidayInfo(dateStr: string): WeeklyHolidayInfo {
  const parts = parseDateParts(dateStr);
  if (!parts) {
    return { isWeeklyHoliday: false, kind: null, label: null, shortTag: null };
  }
  const dow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  if (dow === 0) {
    return {
      isWeeklyHoliday: true,
      kind: 'sunday',
      label: 'Sunday (Weekly Off)',
      shortTag: 'Sunday',
    };
  }
  if (dow === 6) {
    const nth = getNthWeekdayInMonth(parts.day);
    if (nth === 2) {
      return {
        isWeeklyHoliday: true,
        kind: 'second_saturday',
        label: '2nd Saturday (Govt. Weekly Holiday)',
        shortTag: '2nd Sat',
      };
    }
    if (nth === 3) {
      return {
        isWeeklyHoliday: true,
        kind: 'third_saturday',
        label: '3rd Saturday (Govt. Weekly Holiday)',
        shortTag: '3rd Sat',
      };
    }
  }
  return { isWeeklyHoliday: false, kind: null, label: null, shortTag: null };
}

export function isSundayDate(dateStr: string): boolean {
  return getDayOfWeekUTC(dateStr) === 0;
}

export function isSecondOrThirdSaturdayDate(dateStr: string): boolean {
  const wk = getWeeklyHolidayInfo(dateStr);
  return wk.kind === 'second_saturday' || wk.kind === 'third_saturday';
}

export function findAdminHolidayForDate(
  holidays: HolidayRecord[] = [],
  dateStr: string,
  sessionId?: string
): HolidayRecord | null {
  if (!dateStr || !Array.isArray(holidays)) return null;
  const found = holidays.find((h) => {
    if (h.date !== dateStr) return false;
    if (!h.sessionId || h.sessionId === 'all') return true;
    if (!sessionId) return true;
    return h.sessionId === sessionId;
  });
  return found || null;
}

/**
 * Unified calendar status for any single YYYY-MM-DD date.
 */
export function getDateHolidayStatus(
  dateStr: string,
  holidays: HolidayRecord[] = [],
  sessionId?: string
): DateHolidayStatus {
  const dow = getDayOfWeekUTC(dateStr);
  const weekly = getWeeklyHolidayInfo(dateStr);
  const adminHoliday = findAdminHolidayForDate(holidays, dateStr, sessionId);
  const isWeeklyHoliday = weekly.isWeeklyHoliday;
  const isAdminHoliday = Boolean(adminHoliday);
  const isHoliday = isWeeklyHoliday || isAdminHoliday;
  const isOverlap = isWeeklyHoliday && isAdminHoliday;

  let title = 'Working Day';
  let categoryLabel = 'Working Day';
  let lockReason: string | null = null;

  if (isAdminHoliday && isWeeklyHoliday && adminHoliday && weekly.label) {
    title = `${adminHoliday.title} (${weekly.shortTag})`;
    categoryLabel = `${adminHoliday.category} · ${weekly.shortTag}`;
    lockReason = `${dateStr} is ${weekly.label} and Admin-designated Holiday ("${adminHoliday.title}"). Attendance is locked.`;
  } else if (isAdminHoliday && adminHoliday) {
    title = adminHoliday.title;
    categoryLabel = adminHoliday.category || 'Admin Holiday';
    lockReason = `${dateStr} is an Admin-designated Holiday ("${adminHoliday.title}"). Attendance is locked.`;
  } else if (isWeeklyHoliday && weekly.label) {
    title = weekly.label;
    categoryLabel =
      weekly.kind === 'sunday' ? 'Sunday Weekly Holiday' : 'Govt. Designated Saturday Holiday';
    lockReason = `${dateStr} is a ${weekly.label}. Attendance is automatically locked.`;
  }

  return {
    dateStr,
    dayOfWeek: dow,
    isSunday: weekly.kind === 'sunday',
    isSecondSaturday: weekly.kind === 'second_saturday',
    isThirdSaturday: weekly.kind === 'third_saturday',
    isWeeklyHoliday,
    weeklyKind: weekly.kind,
    weeklyLabel: weekly.label,
    weeklyShortTag: weekly.shortTag,
    adminHoliday,
    isAdminHoliday,
    isHoliday,
    isWorkingDay: !isHoliday,
    isOverlap,
    title,
    categoryLabel,
    lockReason,
  };
}

/**
 * Computes monthly calendar & working days strictly with:
 * Total Working Days = Total Calendar Days - Weekly Holidays - Admin-Designated Holidays
 * (With zero double-deduction when an Admin holiday falls on Sunday / 2nd Sat / 3rd Sat.)
 */
export function calculateMonthWorkingDayBreakdown(
  year: number,
  month: number,
  holidays: HolidayRecord[] = [],
  sessionId?: string
): MonthWorkingDayBreakdown {
  const totalCalendarDays = getDaysInMonthUTC(year, month);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  let sundaysCount = 0;
  let secondThirdSaturdaysCount = 0;
  let totalAdminHolidaysInMonth = 0;
  let overlappingAdminHolidays = 0;
  let adminDesignatedHolidays = 0;
  const days: Array<{ dayNumber: number } & DateHolidayStatus> = [];

  for (let d = 1; d <= totalCalendarDays; d++) {
    const dateStr = formatDateParts(year, month, d);
    const status = getDateHolidayStatus(dateStr, holidays, sessionId);

    if (status.isSunday) sundaysCount++;
    if (status.isSecondSaturday || status.isThirdSaturday) secondThirdSaturdaysCount++;
    if (status.isAdminHoliday) {
      totalAdminHolidaysInMonth++;
      if (status.isOverlap) {
        overlappingAdminHolidays++;
      } else {
        adminDesignatedHolidays++;
      }
    }

    days.push({
      dayNumber: d,
      ...status,
    });
  }

  const weeklyHolidays = sundaysCount + secondThirdSaturdaysCount;
  const totalHolidays = weeklyHolidays + adminDesignatedHolidays;
  const totalWorkingDays = Math.max(
    0,
    totalCalendarDays - weeklyHolidays - adminDesignatedHolidays
  );

  return {
    year,
    month,
    monthKey,
    totalCalendarDays,
    sundaysCount,
    secondThirdSaturdaysCount,
    weeklyHolidays,
    totalAdminHolidaysInMonth,
    overlappingAdminHolidays,
    adminDesignatedHolidays,
    totalHolidays,
    totalWorkingDays,
    days,
  };
}

/**
 * Computes Total Working Days over an arbitrary inclusive [startDate, endDate] span:
 * Total Working Days = Total Calendar Days - Weekly Holidays - Admin-Designated Holidays (no double deduction).
 */
export function calculateDateRangeWorkingDays(
  startDateStr: string,
  endDateStr: string,
  holidays: HolidayRecord[] = [],
  sessionId?: string
): DateRangeWorkingDayBreakdown {
  const empty: DateRangeWorkingDayBreakdown = {
    startDate: startDateStr,
    endDate: endDateStr,
    totalCalendarDays: 0,
    weeklyHolidays: 0,
    adminDesignatedHolidays: 0,
    overlappingAdminHolidays: 0,
    totalHolidays: 0,
    totalWorkingDays: 0,
    workingDates: [],
  };
  if (!startDateStr || !endDateStr || startDateStr > endDateStr) return empty;
  const startParts = parseDateParts(startDateStr);
  const endParts = parseDateParts(endDateStr);
  if (!startParts || !endParts) return empty;

  const curr = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const end = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));

  let totalCalendarDays = 0;
  let weeklyHolidays = 0;
  let overlappingAdminHolidays = 0;
  let adminDesignatedHolidays = 0;
  const workingDates: string[] = [];

  const maxGuard = 800;
  while (curr <= end && totalCalendarDays < maxGuard) {
    totalCalendarDays++;
    const dateStr = formatDateParts(
      curr.getUTCFullYear(),
      curr.getUTCMonth() + 1,
      curr.getUTCDate()
    );
    const st = getDateHolidayStatus(dateStr, holidays, sessionId);
    if (st.isWeeklyHoliday) {
      weeklyHolidays++;
      if (st.isAdminHoliday) overlappingAdminHolidays++;
    } else if (st.isAdminHoliday) {
      adminDesignatedHolidays++;
    } else {
      workingDates.push(dateStr);
    }
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  const totalHolidays = weeklyHolidays + adminDesignatedHolidays;
  const totalWorkingDays = Math.max(
    0,
    totalCalendarDays - weeklyHolidays - adminDesignatedHolidays
  );

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    totalCalendarDays,
    weeklyHolidays,
    adminDesignatedHolidays,
    overlappingAdminHolidays,
    totalHolidays,
    totalWorkingDays,
    workingDates,
  };
}

/**
 * Returns only valid working dates between fromDate and toDate (excluding Sundays, 2nd/3rd Saturdays, and Admin holidays).
 */
export function expandLeaveWorkingDates(
  fromDate: string,
  toDate: string,
  holidays: HolidayRecord[] = [],
  sessionId?: string,
  maxDays: number = 90
): string[] {
  const start = parseDateParts(fromDate);
  const end = parseDateParts(toDate);
  if (!start || !end || fromDate > toDate) return [];

  const curr = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const endDt = new Date(Date.UTC(end.year, end.month - 1, end.day));
  const validDates: string[] = [];
  let steps = 0;

  while (curr <= endDt && steps < maxDays) {
    steps++;
    const dateStr = formatDateParts(
      curr.getUTCFullYear(),
      curr.getUTCMonth() + 1,
      curr.getUTCDate()
    );
    const status = getDateHolidayStatus(dateStr, holidays, sessionId);
    if (status.isWorkingDay) {
      validDates.push(dateStr);
    }
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return validDates;
}

/**
 * Calculates accurate trainee attendance metrics:
 * - Excludes all Sundays, 2nd Saturdays, 3rd Saturdays, and Admin Holidays (never Present, Absent, or Leave)
 * - Counts missing attendance ONLY on actual working days
 * - Computes Total Working Days = Total Calendar Days - Weekly Holidays - Unique Admin Holidays
 * - Computes Attendance Percentage = (Present Days / Total Working Days) * 100
 */
export function calculateTraineeAttendanceMetrics(params: {
  records: AttendanceRecord[];
  holidays: HolidayRecord[];
  sessionId?: string;
  admissionDate?: string;
  sessionStartDate?: string;
  referenceDate?: string; // Defaults to today's IST date
  explicitPeriod?: { startDate: string; endDate: string };
  cutoffPassedToday?: boolean;
  minimumAttendancePercent?: number;
}): TraineeAttendanceMetrics {
  const {
    records,
    holidays,
    sessionId,
    admissionDate,
    sessionStartDate,
    referenceDate = getIstDateStr(),
    explicitPeriod,
    cutoffPassedToday = false,
    minimumAttendancePercent = 80,
  } = params;

  const validRecordByDate = new Map<string, AttendanceRecord>();
  let excludedHolidayRecords = 0;

  for (const r of records) {
    if (!r?.date) continue;
    if (explicitPeriod && (r.date < explicitPeriod.startDate || r.date > explicitPeriod.endDate)) {
      continue;
    }
    const dayStatus = getDateHolidayStatus(r.date, holidays, sessionId);
    if (!dayStatus.isWorkingDay) {
      excludedHolidayRecords++;
      continue;
    }
    validRecordByDate.set(r.date, r);
  }

  let presentDays = 0;
  let recordedAbsentDays = 0;
  let clDays = 0;
  let mlDays = 0;
  let halfDays = 0;

  for (const rec of validRecordByDate.values()) {
    if (rec.status === 'Present') presentDays++;
    else if (rec.status === 'Absent') recordedAbsentDays++;
    else if (rec.status === 'CL') clDays++;
    else if (rec.status === 'Medical Leave') mlDays++;
    else if (rec.status === 'Half-Day Leave') halfDays++;
  }

  const sortedValidDates = Array.from(validRecordByDate.keys()).sort();
  const earliestValidRecordDate = sortedValidDates[0] || null;
  const cleanAdmission = parseDateParts(admissionDate || '') ? admissionDate! : null;
  const cleanSessionStart = parseDateParts(sessionStartDate || '') ? sessionStartDate! : null;

  let effectiveStartDate: string | null = null;
  let effectiveEndDate: string | null = null;
  let totalWorkingDays = 0;
  let missingWorkingDaysAbsent = 0;

  if (explicitPeriod) {
    effectiveStartDate = explicitPeriod.startDate;
    effectiveEndDate = explicitPeriod.endDate;
    const range = calculateDateRangeWorkingDays(
      explicitPeriod.startDate,
      explicitPeriod.endDate,
      holidays,
      sessionId
    );
    totalWorkingDays = range.totalWorkingDays;

    // Only treat past missing working days inside this month as Absent starting from when trainee was active in records/admission
    const activityStartCandidates = [earliestValidRecordDate, cleanAdmission].filter(
      Boolean
    ) as string[];
    const activityStart =
      activityStartCandidates.length > 0
        ? activityStartCandidates.sort()[0]
        : null;

    if (activityStart) {
      const yesterdayStr = addDaysToDateStr(referenceDate, -1) || referenceDate;
      const missingCapDate = cutoffPassedToday ? referenceDate : yesterdayStr;
      for (const wd of range.workingDates) {
        if (wd >= activityStart && wd <= missingCapDate && !validRecordByDate.has(wd)) {
          missingWorkingDaysAbsent++;
        }
      }
    }
  } else {
    // Cumulative operational span from earliest attendance record (or admission date, whichever is earlier within session)
    const startCandidates = [earliestValidRecordDate, cleanAdmission].filter(Boolean) as string[];
    let spanStart = startCandidates.length > 0 ? startCandidates.sort()[0] : referenceDate;
    if (cleanSessionStart && spanStart < cleanSessionStart && !earliestValidRecordDate) {
      spanStart = cleanSessionStart;
    }

    const yesterdayStr = addDaysToDateStr(referenceDate, -1) || referenceDate;
    const hasTodayValidRecord = validRecordByDate.has(referenceDate);
    const spanEnd = hasTodayValidRecord || cutoffPassedToday ? referenceDate : yesterdayStr;

    effectiveStartDate = spanStart;
    effectiveEndDate = spanEnd;

    if (spanStart <= spanEnd) {
      const range = calculateDateRangeWorkingDays(spanStart, spanEnd, holidays, sessionId);
      totalWorkingDays = range.totalWorkingDays;

      const missingCapDate = cutoffPassedToday ? referenceDate : yesterdayStr;
      for (const wd of range.workingDates) {
        if (wd <= missingCapDate && !validRecordByDate.has(wd)) {
          missingWorkingDaysAbsent++;
        }
      }
    }
  }

  const absentDays = recordedAbsentDays + missingWorkingDaysAbsent;
  const leaveDays = clDays + mlDays + halfDays;
  const attendancePercent =
    totalWorkingDays > 0
      ? Math.min(100, Math.round((presentDays / totalWorkingDays) * 1000) / 10)
      : 0;

  return {
    totalWorkingDays,
    totalMarkedWorkingDays: validRecordByDate.size,
    presentDays,
    absentDays,
    recordedAbsentDays,
    missingWorkingDaysAbsent,
    clDays,
    mlDays,
    halfDays,
    leaveDays,
    excludedHolidayRecords,
    attendancePercent,
    isBelowThreshold: totalWorkingDays > 0 && attendancePercent < minimumAttendancePercent,
    effectiveStartDate,
    effectiveEndDate,
  };
}

export interface NormalizedAttendanceWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  autoAbsentHour: number;
  autoAbsentMinute: number;
}

export function normalizeAttendanceWindow(
  win?: Partial<AttendanceWindow> | null
): NormalizedAttendanceWindow {
  const clamp = (val: unknown, min: number, max: number, fallback: number): number => {
    const n = Number(val);
    if (val === undefined || val === null || val === '' || Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  };

  return {
    startHour: clamp(win?.startHour, 0, 23, 7),
    startMinute: clamp(win?.startMinute, 0, 59, 0),
    endHour: clamp(win?.endHour, 0, 23, 15),
    endMinute: clamp(win?.endMinute, 0, 59, 0),
    autoAbsentHour: clamp(win?.autoAbsentHour, 0, 23, 17),
    autoAbsentMinute: clamp(win?.autoAbsentMinute, 0, 59, 0),
  };
}

export function formatClock24(hour: number, minute: number = 0): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  const m = Math.min(59, Math.max(0, Math.trunc(minute || 0)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatClock12(hour: number, minute: number = 0): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  const m = Math.min(59, Math.max(0, Math.trunc(minute || 0)));
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatClockDisplay(hour: number, minute: number = 0): string {
  return `${formatClock12(hour, minute)} (${formatClock24(hour, minute)})`;
}

export interface AttendanceWindowEvaluation {
  isWithinWindow: boolean;
  istDateStr: string;
  istHours: number;
  istMinutes: number;
  nowTotalMinutes: number;
  startTotalMinutes: number;
  endTotalMinutes: number;
  isOvernightWindow: boolean;
  window: NormalizedAttendanceWindow;
  start12: string;
  start24: string;
  end12: string;
  end24: string;
  autoAbsent12: string;
  autoAbsent24: string;
}

/**
 * Evaluates whether the current IST time falls within the Admin-configured attendance window.
 * Supports both same-day windows (e.g. 07:00 - 15:00) and cross-midnight windows (e.g. 22:00 - 15:00).
 */
export function evaluateAttendanceWindow(
  rawWin?: Partial<AttendanceWindow> | null,
  now: Date = getSynchronizedNow()
): AttendanceWindowEvaluation {
  const win = normalizeAttendanceWindow(rawWin);
  const { dateStr: istDateStr, hours: istHours, minutes: istMinutes } = getIstClockParts(now);

  const nowTotalMinutes = istHours * 60 + istMinutes;
  const startTotalMinutes = win.startHour * 60 + win.startMinute;
  const endTotalMinutes = win.endHour * 60 + win.endMinute;
  const isOvernightWindow = startTotalMinutes > endTotalMinutes;

  const isWithinWindow = isOvernightWindow
    ? nowTotalMinutes >= startTotalMinutes || nowTotalMinutes <= endTotalMinutes
    : nowTotalMinutes >= startTotalMinutes && nowTotalMinutes <= endTotalMinutes;

  return {
    isWithinWindow,
    istDateStr,
    istHours,
    istMinutes,
    nowTotalMinutes,
    startTotalMinutes,
    endTotalMinutes,
    isOvernightWindow,
    window: win,
    start12: formatClock12(win.startHour, win.startMinute),
    start24: formatClock24(win.startHour, win.startMinute),
    end12: formatClock12(win.endHour, win.endMinute),
    end24: formatClock24(win.endHour, win.endMinute),
    autoAbsent12: formatClock12(win.autoAbsentHour, win.autoAbsentMinute),
    autoAbsent24: formatClock24(win.autoAbsentHour, win.autoAbsentMinute),
  };
}

