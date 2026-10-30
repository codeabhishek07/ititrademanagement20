export type UserRole = 'admin' | 'officer' | 'trainee';

export interface CampusLocation {
  lat: number;
  lng: number;
  campusName: string;
  address: string;
  radiusMeters: number;
}

export interface AttendanceWindow {
  startHour: number;    // e.g. 7
  startMinute: number;  // e.g. 0
  endHour: number;      // e.g. 10
  endMinute: number;    // e.g. 0
}

export interface LeaveLimits {
  clAnnual: number;
  medicalAnnual: number;
  halfDayMonthlyLimit: number;
}

export interface SystemSettings {
  instituteName: string;
  instituteCode: string;
  affiliation: string;
  department: string;
  district: string;
  state: string;
  campusLocation: CampusLocation;
  attendanceWindow: AttendanceWindow;
  minimumAttendancePercent: number; // default 80%
  leaveLimits: LeaveLimits;
  currentSessionId: string;
}

export interface AcademicSession {
  id: string;
  name: string; // e.g. "2025-2026"
  startDate: string; // YYYY-MM-DD
  endDate: string;
  totalWorkingDays: number;
  status: 'active' | 'upcoming' | 'completed';
}

export interface MonthlyWorkingDay {
  id: string;
  sessionId: string;
  month: string; // YYYY-MM
  totalDays: number;
  workingDays: number;
  holidays: number;
  remarks?: string;
}

export interface Trade {
  id: string;
  name: string; // e.g. "Electrician", "Fitter"
  code: string; // e.g. "ELE-01"
  durationYears: number; // 1 or 2
  sanctionedUnits: number;
  totalIntake: number;
  workshopLocation: string;
  description: string;
  status: 'active' | 'inactive';
}

export interface TrainingOfficer {
  id: string;
  name: string;
  email: string;
  mobile: string;
  employeeId: string;
  assignedTradeIds: string[];
  designation: string;
  qualification: string;
  status: 'active' | 'inactive';
  password?: string;
}

export interface Trainee {
  id: string;
  rollNo: string;
  registrationNo: string;
  name: string;
  fatherName: string;
  email: string;
  mobile: string;
  tradeId: string;
  sessionId: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  category: 'GEN' | 'OBC' | 'SC' | 'ST' | 'EWS';
  status: 'active' | 'inactive' | 'passed_out';
  admissionDate: string;
  password?: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'CL' | 'Medical Leave' | 'Half-Day Leave';

export interface GeotagInfo {
  lat: number;
  lng: number;
  accuracyMeters: number;
  distanceFromCampusMeters: number;
  isWithinCampus: boolean;
  verified: boolean;
}

export interface AttendanceRecord {
  id: string;
  traineeId: string;
  traineeName: string;
  rollNo: string;
  tradeId: string;
  sessionId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  timestamp: string; // e.g. "08:24 AM"
  markedBy: 'trainee_gps' | 'officer_manual' | 'system_auto_absent';
  geotag?: GeotagInfo;
  remarks?: string;
  authorizedCorrection?: boolean;
  correctedBy?: string;
}

export type LeaveType = 'Casual Leave (CL)' | 'Medical Leave (ML)' | 'Half-Day Leave';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  traineeId: string;
  traineeName: string;
  rollNo: string;
  tradeId: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  appliedAt: string;
  reviewedBy?: string;
  reviewerRemarks?: string;
  reviewedAt?: string;
}

export interface WarningNotice {
  id: string;
  refNumber: string;
  traineeId: string;
  traineeName: string;
  rollNo: string;
  tradeId: string;
  tradeName: string;
  officerId: string;
  officerName: string;
  attendancePercent: number;
  subject: string;
  message: string;
  issuedDate: string;
  status: 'issued' | 'acknowledged';
  acknowledgedAt?: string;
}

export interface InventoryItem {
  id: string;
  tradeId: string;
  toolCode: string;
  name: string;
  specification: string;
  category: 'Hand Tools' | 'Power Machinery' | 'Testing & Measuring' | 'Consumables & Raw Materials';
  totalStock: number;
  issuedCount: number;
  damagedCount: number;
  availableStock: number;
  binLocation: string;
  lastInspected: string;
}

export interface IndentRecord {
  id: string;
  indentNo: string;
  tradeId: string;
  officerId: string;
  officerName: string;
  traineeId: string;
  traineeName: string;
  rollNo: string;
  itemId: string;
  itemName: string;
  quantity: number;
  issueDate: string;
  expectedReturnDate: string;
  actualReturnDate?: string;
  status: 'issued' | 'returned' | 'consumed' | 'damaged';
  returnCondition?: 'Good' | 'Damaged' | 'Normal Wear';
  remarks?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  ipAddress?: string;
}

export interface AuthSession {
  user: {
    id: string;
    role: UserRole;
    name: string;
    email: string;
    tradeId?: string;
    tradeIds?: string[];
    rollNo?: string;
    employeeId?: string;
  };
}

export interface AppNotification {
  id: string;
  type: 'leave_approved' | 'leave_rejected' | 'leave_pending' | 'attendance_warning' | 'attendance_deficit' | 'absent_recorded';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'high' | 'normal' | 'urgent';
  linkTab?: 'leaves' | 'warnings' | 'history' | 'mark_attendance';
  referenceId?: string;
  metadata?: Record<string, any>;
}

