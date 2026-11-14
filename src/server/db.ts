import fs from 'fs';
import path from 'path';
import {
  loadDatabaseFromFirestore,
  seedDatabaseToFirestore,
  syncDiffToFirestore,
  persistItemToFirestore,
  persistBatchToFirestore,
  deleteItemFromFirestore,
  purgeAllDemoDocumentsFromFirestore,
  flushPendingRetryOps,
  isDemoIdOrName,
  type PendingFirestoreOp,
} from './firestoreAdapter.ts';
import type {
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
  LessonPlan,
  DemonstrationPlan,
  WeeklyPlan,
  TraineeAssessment,
  HolidayRecord,
  StoredDocumentRecord,
  UserPreferences,
  AuthSessionRecord,
} from '../types.ts';

export interface DatabaseSchema {
  settings: SystemSettings;
  sessions: AcademicSession[];
  monthlyWorkingDays: MonthlyWorkingDay[];
  holidays: HolidayRecord[];
  trades: Trade[];
  officers: TrainingOfficer[];
  trainees: Trainee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  warnings: WarningNotice[];
  inventory: InventoryItem[];
  indents: IndentRecord[];
  auditLogs: AuditLog[];
  lessonPlans: LessonPlan[];
  demonstrationPlans: DemonstrationPlan[];
  weeklyPlans: WeeklyPlan[];
  assessments: TraineeAssessment[];
  documents: StoredDocumentRecord[];
  userPreferences: UserPreferences[];
  authSessions: AuthSessionRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'iti_db.json');

const DEFAULT_CAMPUS_LAT = 21.8958;
const DEFAULT_CAMPUS_LNG = 83.4133;

function getInitialDatabase(): DatabaseSchema {
  const settings: SystemSettings = {
    instituteName: 'Government Industrial Training Institute, Raigarh',
    instituteCode: 'ITI-RAI-CG-04',
    affiliation: 'NCVT / DGT, Ministry of Skill Development and Entrepreneurship',
    department: 'Directorate of Employment & Training, Government of Chhattisgarh',
    district: 'Raigarh',
    state: 'Chhattisgarh',
    campusLocation: {
      lat: DEFAULT_CAMPUS_LAT,
      lng: DEFAULT_CAMPUS_LNG,
      campusName: 'Government ITI Raigarh Campus',
      address: 'Chakradhar Nagar Industrial Area Boirdadar, Raigarh (C.G.) 496001',
      radiusMeters: 1500,
    },
    attendanceWindow: {
      startHour: 7,
      startMinute: 0,
      endHour: 15,
      endMinute: 0,
      autoAbsentHour: 17,
      autoAbsentMinute: 0,
    },
    minimumAttendancePercent: 80,
    leaveLimits: {
      clAnnual: 12,
      medicalAnnual: 15,
      halfDayMonthlyLimit: 4,
    },
    currentSessionId: 'session_2025_2026',
    adminAccount: {
      email: 'admin.iti.raigarh@cg.gov.in',
      password: 'admin123',
      name: 'Shri S. K. Patel (Principal / Admin)',
      mobile: '+91 98261 45210',
    },
  };

  const sessions: AcademicSession[] = [
    {
      id: 'session_2024_2025',
      name: 'Session 2024-2025',
      startDate: '2024-08-01',
      endDate: '2025-07-31',
      totalWorkingDays: 242,
      status: 'completed',
    },
    {
      id: 'session_2025_2026',
      name: 'Session 2025-2026',
      startDate: '2025-08-01',
      endDate: '2026-07-31',
      totalWorkingDays: 240,
      status: 'active',
    },
    {
      id: 'session_2026_2027',
      name: 'Session 2026-2027',
      startDate: '2026-08-01',
      endDate: '2027-07-31',
      totalWorkingDays: 245,
      status: 'upcoming',
    },
  ];

  const monthlyWorkingDays: MonthlyWorkingDay[] = [
    { id: 'mwd_1', sessionId: 'session_2025_2026', month: '2025-08', totalDays: 31, workingDays: 23, holidays: 8, remarks: 'Independence Day, Raksha Bandhan' },
    { id: 'mwd_2', sessionId: 'session_2025_2026', month: '2025-09', totalDays: 30, workingDays: 24, holidays: 6, remarks: 'Vishwakarma Puja, Ganesh Chaturthi' },
    { id: 'mwd_3', sessionId: 'session_2025_2026', month: '2025-10', totalDays: 31, workingDays: 20, holidays: 11, remarks: 'Gandhi Jayanti, Dussehra, Diwali break' },
    { id: 'mwd_4', sessionId: 'session_2025_2026', month: '2025-11', totalDays: 30, workingDays: 23, holidays: 7, remarks: 'CG State Foundation Day, Guru Nanak Jayanti' },
    { id: 'mwd_5', sessionId: 'session_2025_2026', month: '2025-12', totalDays: 31, workingDays: 24, holidays: 7, remarks: 'Ghasidas Jayanti, Christmas' },
    { id: 'mwd_6', sessionId: 'session_2025_2026', month: '2026-01', totalDays: 31, workingDays: 23, holidays: 8, remarks: 'Cherchera, Republic Day' },
    { id: 'mwd_7', sessionId: 'session_2025_2026', month: '2026-02', totalDays: 28, workingDays: 22, holidays: 6, remarks: 'Maha Shivratri' },
    { id: 'mwd_8', sessionId: 'session_2025_2026', month: '2026-03', totalDays: 31, workingDays: 23, holidays: 8, remarks: 'Holi festival' },
    { id: 'mwd_9', sessionId: 'session_2025_2026', month: '2026-04', totalDays: 30, workingDays: 22, holidays: 8, remarks: 'Ambedkar Jayanti, Ram Navami' },
    { id: 'mwd_10', sessionId: 'session_2025_2026', month: '2026-05', totalDays: 31, workingDays: 25, holidays: 6, remarks: 'Regular trade practical tests' },
  ];

  const trades: Trade[] = [
    {
      id: 'trade_elec',
      name: 'Electrician',
      code: 'ELE-01',
      durationYears: 2,
      sanctionedUnits: 2,
      totalIntake: 40,
      workshopLocation: 'Workshop Block A - Bay 101',
      description: 'Training in wiring, motor winding, power electronics, transformer diagnostics, and solar panel installation.',
      status: 'active',
    },
    {
      id: 'trade_fit',
      name: 'Fitter',
      code: 'FIT-02',
      durationYears: 2,
      sanctionedUnits: 2,
      totalIntake: 40,
      workshopLocation: 'Mechanical Workshop Block B - Bay 201',
      description: 'Precision bench work, filing, fitting, pipe fitting, lathe operation, hydraulics, and assembly.',
      status: 'active',
    },
    {
      id: 'trade_copa',
      name: 'Computer Operator and Programming Assistant (COPA)',
      code: 'COP-03',
      durationYears: 1,
      sanctionedUnits: 2,
      totalIntake: 48,
      workshopLocation: 'IT Computer Wing - Lab C-2',
      description: 'Computer fundamentals, office automation, web authoring, Python/JS programming, and network configuration.',
      status: 'active',
    },
    {
      id: 'trade_weld',
      name: 'Welder (Gas & Electric)',
      code: 'WLD-04',
      durationYears: 1,
      sanctionedUnits: 1,
      totalIntake: 20,
      workshopLocation: 'Fabrication Shed - Booth 1-10',
      description: 'SMAW, GMAW, GTAW welding, gas cutting, oxy-acetylene brazing, and metal joint inspection.',
      status: 'active',
    },
    {
      id: 'trade_turn',
      name: 'Turner',
      code: 'TUR-05',
      durationYears: 2,
      sanctionedUnits: 1,
      totalIntake: 20,
      workshopLocation: 'Machine Shop - Bay 203',
      description: 'Operating centre lathe, capstan lathe, CNC basics, thread cutting, eccentric turning, and precision machining.',
      status: 'active',
    },
  ];

  const officers: TrainingOfficer[] = [
    {
      id: 'off_0',
      name: 'Abhishek Swarnkar',
      email: 'abhishek.swarnkar@iti.cg.gov.in',
      mobile: '+91 94252 55660',
      employeeId: 'CG-ITI-TO-1001',
      assignedTradeIds: ['trade_elec', 'trade_copa'],
      designation: 'Training Officer, ITI Raigarh CG',
      qualification: 'B.E. (CSE/IT), CITS Certified',
      status: 'active',
      password: 'officer123',
    },
    {
      id: 'off_1',
      name: 'Er. Rajesh Kumar Dewangan',
      email: 'rajesh.dewangan@iti.cg.gov.in',
      mobile: '+91 94252 87612',
      employeeId: 'CG-ITI-TO-1042',
      assignedTradeIds: ['trade_elec'],
      designation: 'Senior Training Officer (Electrical)',
      qualification: 'B.Tech (Electrical Engg), CITS Certified',
      status: 'active',
      password: 'officer123',
    },
    {
      id: 'off_2',
      name: 'Er. Manoj Kumar Rathore',
      email: 'manoj.rathore@iti.cg.gov.in',
      mobile: '+91 98271 34910',
      employeeId: 'CG-ITI-TO-1089',
      assignedTradeIds: ['trade_fit', 'trade_turn'],
      designation: 'Training Officer (Mechanical & Fitter)',
      qualification: 'Diploma Mechanical Engg, NTC, CITS',
      status: 'active',
      password: 'officer123',
    },
    {
      id: 'off_3',
      name: 'Smt. Priyanka Sharma',
      email: 'priyanka.sharma@iti.cg.gov.in',
      mobile: '+91 97531 22440',
      employeeId: 'CG-ITI-TO-1120',
      assignedTradeIds: ['trade_copa'],
      designation: 'Training Officer (IT & COPA)',
      qualification: 'MCA, CITS (COPA)',
      status: 'active',
      password: 'officer123',
    },
  ];

  const inventory: InventoryItem[] = [
    {
      id: 'inv_elec_1',
      tradeId: 'trade_elec',
      toolCode: 'ELEC-MM-01',
      name: 'Digital Multimeter (Auto-Ranging 600V)',
      specification: 'CAT III 600V with thermocouple probe, backlit LCD',
      category: 'Testing & Measuring',
      totalStock: 25,
      issuedCount: 0,
      damagedCount: 0,
      availableStock: 25,
      binLocation: 'Rack A-2, Cupboard 1',
      lastInspected: '2026-10-20',
    },
    {
      id: 'inv_elec_2',
      tradeId: 'trade_elec',
      toolCode: 'ELEC-PL-02',
      name: 'Insulated Combination Pliers 8 Inch (1000V)',
      specification: 'Forged chrome vanadium steel, high leverage 1000V tested',
      category: 'Hand Tools',
      totalStock: 40,
      issuedCount: 0,
      damagedCount: 0,
      availableStock: 40,
      binLocation: 'Tool Board Station 1-4',
      lastInspected: '2026-10-18',
    },
    {
      id: 'inv_elec_3',
      tradeId: 'trade_elec',
      toolCode: 'ELEC-MEG-03',
      name: 'Digital Insulation Tester (Megger 500V/1000V)',
      specification: 'Range up to 2000 MΩ with test leads and calibration card',
      category: 'Testing & Measuring',
      totalStock: 6,
      issuedCount: 0,
      damagedCount: 0,
      availableStock: 6,
      binLocation: 'Instrument Safe Room C',
      lastInspected: '2026-10-24',
    },
    {
      id: 'inv_elec_4',
      tradeId: 'trade_elec',
      toolCode: 'ELEC-SOL-04',
      name: 'Temperature Controlled Soldering Station 60W',
      specification: '200-480°C ESD safe with brass sponge cleaner',
      category: 'Power Machinery',
      totalStock: 15,
      issuedCount: 0,
      damagedCount: 0,
      availableStock: 15,
      binLocation: 'PCB Workstation Bay A',
      lastInspected: '2026-10-15',
    },
    {
      id: 'inv_elec_5',
      tradeId: 'trade_elec',
      toolCode: 'ELEC-RAW-05',
      name: 'Copper Enamelled Winding Wire (22 SWG)',
      specification: 'Grade 2 dual coated super enamelled copper wire spool',
      category: 'Consumables & Raw Materials',
      totalStock: 18,
      issuedCount: 0,
      damagedCount: 0,
      availableStock: 18,
      binLocation: 'Consumables Locker 4',
      lastInspected: '2026-10-26',
    },
    {
      id: 'inv_fit_1',
      tradeId: 'trade_fit',
      toolCode: 'FIT-CAL-01',
      name: 'Vernier Caliper 0-150mm (0.02mm LC)',
      specification: 'Stainless steel hardened jaws, metric and imperial dual scale',
      category: 'Testing & Measuring',
      totalStock: 30,
      issuedCount: 0,
      damagedCount: 0,
      availableStock: 30,
      binLocation: 'Cabinet Fit-01',
      lastInspected: '2026-10-19',
    },
    {
      id: 'inv_fit_2',
      tradeId: 'trade_fit',
      toolCode: 'FIT-VIC-02',
      name: 'Swivel Base Bench Vice 6 Inch',
      specification: 'Heavy cast iron body, hardened serrated steel jaws',
      category: 'Power Machinery',
      totalStock: 20,
      issuedCount: 0,
      damagedCount: 0,
      availableStock: 20,
      binLocation: 'Workbench Rows 1-5',
      lastInspected: '2026-10-12',
    },
  ];

  return {
    settings,
    sessions,
    monthlyWorkingDays,
    holidays: [],
    trades,
    officers,
    trainees: [],
    attendance: [],
    leaves: [],
    warnings: [],
    inventory,
    indents: [],
    auditLogs: [],
    lessonPlans: [],
    demonstrationPlans: [],
    weeklyPlans: [],
    assessments: [],
    documents: [],
    userPreferences: [],
    authSessions: [],
  };
}

class Database {
  private data: DatabaseSchema;
  private initPromise: Promise<void> | null = null;
  private isFirestoreInitialized = false;
  private firestoreStatus: 'connecting' | 'connected' | 'degraded' = 'connecting';
  private syncTimer: NodeJS.Timeout | null = null;
  private lastSyncedData: DatabaseSchema | null = null;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const initial = getInitialDatabase();

        const cleanTrainees = (Array.isArray(parsed.trainees) ? parsed.trainees : []).filter((t: any) => !isDemoIdOrName(t));
        const validTraineeIds = new Set(cleanTrainees.map((t: any) => t.id));

        const cleanAttendance = (Array.isArray(parsed.attendance) ? parsed.attendance : []).filter(
          (a: any) => validTraineeIds.has(a.traineeId) && !isDemoIdOrName(a)
        );
        const cleanAssessments = (Array.isArray(parsed.assessments) ? parsed.assessments : []).filter(
          (asm: any) => validTraineeIds.has(asm.traineeId) && !isDemoIdOrName(asm)
        );
        const cleanLeaves = (Array.isArray(parsed.leaves) ? parsed.leaves : []).filter(
          (l: any) => validTraineeIds.has(l.traineeId) && !isDemoIdOrName(l)
        );
        const cleanWarnings = (Array.isArray(parsed.warnings) ? parsed.warnings : []).filter(
          (w: any) => validTraineeIds.has(w.traineeId) && !isDemoIdOrName(w)
        );
        const cleanIndents = (Array.isArray(parsed.indents) ? parsed.indents : []).filter(
          (i: any) => validTraineeIds.has(i.traineeId) && !isDemoIdOrName(i)
        );
        const cleanLessonPlans = (Array.isArray(parsed.lessonPlans) ? parsed.lessonPlans : []).filter((p: any) => !isDemoIdOrName(p));
        const cleanDemoPlans = (Array.isArray(parsed.demonstrationPlans) ? parsed.demonstrationPlans : []).filter((p: any) => !isDemoIdOrName(p));
        const cleanWeeklyPlans = (Array.isArray(parsed.weeklyPlans) ? parsed.weeklyPlans : []).filter((p: any) => !isDemoIdOrName(p));
        const cleanAuditLogs = (Array.isArray(parsed.auditLogs) ? parsed.auditLogs : []).filter((log: any) => !isDemoIdOrName(log));
        const cleanHolidays = (Array.isArray(parsed.holidays) ? parsed.holidays : []).filter((h: any) => !isDemoIdOrName(h));

        const merged: DatabaseSchema = {
          ...initial,
          ...parsed,
          holidays: cleanHolidays,
          trainees: cleanTrainees,
          attendance: cleanAttendance,
          assessments: cleanAssessments,
          leaves: cleanLeaves,
          warnings: cleanWarnings,
          indents: cleanIndents,
          lessonPlans: cleanLessonPlans,
          demonstrationPlans: cleanDemoPlans,
          weeklyPlans: cleanWeeklyPlans,
          auditLogs: cleanAuditLogs,
          documents: Array.isArray(parsed.documents) ? parsed.documents : [],
          userPreferences: Array.isArray(parsed.userPreferences) ? parsed.userPreferences : [],
          authSessions: Array.isArray(parsed.authSessions) ? parsed.authSessions : [],
        };
        this.saveDirect(merged);
        return merged;
      }
    } catch (err) {
      console.error('Error loading local cache file:', err);
    }

    const initial = getInitialDatabase();
    this.saveDirect(initial);
    return initial;
  }

  private saveDirect(dataToSave: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error writing local mirror file:', err);
    }
  }

  public getFirestoreConnectionStatus() {
    return {
      initialized: this.isFirestoreInitialized,
      status: this.firestoreStatus,
    };
  }

  /**
   * Ensures Firestore initialization completes (bounded so startup never hangs indefinitely),
   * preventing requests from reading empty uninitialized memory.
   */
  public async ensureInitialized(): Promise<void> {
    if (this.isFirestoreInitialized) return;
    if (!this.initPromise) {
      this.initPromise = this.initFirestore();
    }
    await Promise.race([
      this.initPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 16000)),
    ]);
  }

  public async initFirestore(): Promise<void> {
    if (this.isFirestoreInitialized) return;
    try {
      console.log('[Firestore] Loading permanent institutional state...');
      const loadResult = await loadDatabaseFromFirestore();

      if (loadResult.status === 'ok') {
        const cloudData = loadResult.data;
        const cloudSettings = cloudData.settings || {};
        const rawWindow = cloudSettings.attendanceWindow || {};
        const mergedWindow = {
          startHour: rawWindow.startHour !== undefined ? rawWindow.startHour : 7,
          startMinute: rawWindow.startMinute !== undefined ? rawWindow.startMinute : 0,
          endHour: rawWindow.endHour !== undefined ? rawWindow.endHour : 15,
          endMinute: rawWindow.endMinute !== undefined ? rawWindow.endMinute : 0,
          autoAbsentHour: rawWindow.autoAbsentHour !== undefined ? rawWindow.autoAbsentHour : 17,
          autoAbsentMinute: rawWindow.autoAbsentMinute !== undefined ? rawWindow.autoAbsentMinute : 0,
        };
        if (mergedWindow.endHour <= 11) {
          mergedWindow.endHour = 15;
          mergedWindow.startHour = 7;
        }
        if (!mergedWindow.autoAbsentHour || mergedWindow.autoAbsentHour < 17) {
          mergedWindow.autoAbsentHour = 17;
          mergedWindow.autoAbsentMinute = 0;
        }

        const cleanTrainees = (Array.isArray(cloudData.trainees) ? cloudData.trainees : []).filter((t: any) => !isDemoIdOrName(t));
        const validTraineeIds = new Set(cleanTrainees.map((t: any) => t.id));

        this.data = {
          ...this.data,
          ...cloudData,
          settings: {
            ...this.data.settings,
            ...cloudSettings,
            attendanceWindow: mergedWindow,
          },
          sessions: Array.isArray(cloudData.sessions) && cloudData.sessions.length > 0 ? cloudData.sessions : this.data.sessions,
          trades: Array.isArray(cloudData.trades) && cloudData.trades.length > 0 ? cloudData.trades : this.data.trades,
          officers: Array.isArray(cloudData.officers) && cloudData.officers.length > 0 ? cloudData.officers : this.data.officers,
          trainees: cleanTrainees,
          attendance: (Array.isArray(cloudData.attendance) ? cloudData.attendance : []).filter(
            (a: any) => validTraineeIds.has(a.traineeId) && !isDemoIdOrName(a)
          ),
          assessments: (Array.isArray(cloudData.assessments) ? cloudData.assessments : []).filter(
            (asm: any) => validTraineeIds.has(asm.traineeId) && !isDemoIdOrName(asm)
          ),
          monthlyWorkingDays: Array.isArray(cloudData.monthlyWorkingDays) ? cloudData.monthlyWorkingDays : this.data.monthlyWorkingDays,
          holidays: Array.isArray(cloudData.holidays) ? cloudData.holidays : this.data.holidays,
          leaves: (Array.isArray(cloudData.leaves) ? cloudData.leaves : []).filter(
            (l: any) => validTraineeIds.has(l.traineeId) && !isDemoIdOrName(l)
          ),
          warnings: (Array.isArray(cloudData.warnings) ? cloudData.warnings : []).filter(
            (w: any) => validTraineeIds.has(w.traineeId) && !isDemoIdOrName(w)
          ),
          inventory: Array.isArray(cloudData.inventory) && cloudData.inventory.length > 0 ? cloudData.inventory : this.data.inventory,
          indents: (Array.isArray(cloudData.indents) ? cloudData.indents : []).filter(
            (i: any) => validTraineeIds.has(i.traineeId) && !isDemoIdOrName(i)
          ),
          auditLogs: (Array.isArray(cloudData.auditLogs) ? cloudData.auditLogs : []).filter((log: any) => !isDemoIdOrName(log)),
          lessonPlans: (Array.isArray(cloudData.lessonPlans) ? cloudData.lessonPlans : []).filter((p: any) => !isDemoIdOrName(p)),
          demonstrationPlans: (Array.isArray(cloudData.demonstrationPlans) ? cloudData.demonstrationPlans : []).filter((p: any) => !isDemoIdOrName(p)),
          weeklyPlans: (Array.isArray(cloudData.weeklyPlans) ? cloudData.weeklyPlans : []).filter((p: any) => !isDemoIdOrName(p)),
          documents: Array.isArray(cloudData.documents) ? cloudData.documents : [],
          userPreferences: Array.isArray(cloudData.userPreferences) ? cloudData.userPreferences : [],
          authSessions: Array.isArray(cloudData.authSessions) ? cloudData.authSessions : [],
        };
        this.lastSyncedData = JSON.parse(JSON.stringify(this.data));
        this.saveDirect(this.data);
        this.firestoreStatus = 'connected';
        purgeAllDemoDocumentsFromFirestore().catch(() => {});
      } else if (loadResult.status === 'empty') {
        console.log('[Firestore] Empty database detected — seeding initial institutional structure...');
        await seedDatabaseToFirestore(this.data);
        this.lastSyncedData = JSON.parse(JSON.stringify(this.data));
        this.firestoreStatus = 'connected';
      } else {
        // Error/timeout loading Firestore: do NOT overwrite Firestore! Retain local mirror and flush retries later
        console.warn('[Firestore] Could not reach Firestore cleanly on boot:', loadResult.error);
        this.firestoreStatus = 'degraded';
      }
      this.isFirestoreInitialized = true;
    } catch (err) {
      console.error('[Firestore] Boot exception:', err);
      this.firestoreStatus = 'degraded';
      this.isFirestoreInitialized = true;
    }
  }

  public scheduleFirestoreSync() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(async () => {
      try {
        await flushPendingRetryOps();
        const snapshot = JSON.parse(JSON.stringify(this.data));
        const ok = await syncDiffToFirestore(this.lastSyncedData, snapshot);
        if (ok) {
          this.lastSyncedData = snapshot;
          this.firestoreStatus = 'connected';
        }
      } catch (err) {
        console.error('[Firestore] Background sync notice:', err);
      }
    }, 1200);
  }

  /**
   * Immediately writes a single document to Firestore and awaits completion before HTTP response returns.
   */
  public async persistItemNow(collName: string, id: string, data: any, typeTag?: string): Promise<boolean> {
    this.saveDirect(this.data);
    if (isDemoIdOrName({ ...data, id })) return true;
    const ok = await persistItemToFirestore(collName, id, data, typeTag);
    if (ok) {
      this.lastSyncedData = JSON.parse(JSON.stringify(this.data));
      this.firestoreStatus = 'connected';
    }
    return ok;
  }

  /**
   * Immediately deletes a single document from Firestore and awaits completion.
   */
  public async deleteItemNow(collName: string, id: string): Promise<boolean> {
    this.saveDirect(this.data);
    const ok = await deleteItemFromFirestore(collName, id);
    if (ok) {
      this.lastSyncedData = JSON.parse(JSON.stringify(this.data));
      this.firestoreStatus = 'connected';
    }
    return ok;
  }

  /**
   * Immediately executes an atomic Firestore batch commit for multiple documents.
   */
  public async persistBatchNow(ops: PendingFirestoreOp[]): Promise<boolean> {
    this.saveDirect(this.data);
    const ok = await persistBatchToFirestore(ops);
    if (ok) {
      this.lastSyncedData = JSON.parse(JSON.stringify(this.data));
      this.firestoreStatus = 'connected';
    }
    return ok;
  }

  public persistItem(collName: string, id: string, data: any, typeTag?: string) {
    if (isDemoIdOrName({ ...data, id })) return;
    persistItemToFirestore(collName, id, data, typeTag).catch((err) => {
      console.warn(`[Firestore] Failed to persist ${collName}/${id}:`, err);
    });
  }

  public deleteItem(collName: string, id: string) {
    deleteItemFromFirestore(collName, id).catch((err) => {
      console.warn(`[Firestore] Failed to delete ${collName}/${id}:`, err);
    });
  }

  public async forceFirestoreSync(): Promise<void> {
    await flushPendingRetryOps();
    const snapshot = JSON.parse(JSON.stringify(this.data));
    const ok = await syncDiffToFirestore(this.lastSyncedData, snapshot);
    if (ok) {
      this.lastSyncedData = snapshot;
      this.firestoreStatus = 'connected';
    }
  }

  public save() {
    this.saveDirect(this.data);
    this.scheduleFirestoreSync();
  }

  public get(): DatabaseSchema {
    if (!Array.isArray(this.data.holidays)) this.data.holidays = [];
    if (!Array.isArray(this.data.assessments)) this.data.assessments = [];
    if (!Array.isArray(this.data.lessonPlans)) this.data.lessonPlans = [];
    if (!Array.isArray(this.data.demonstrationPlans)) this.data.demonstrationPlans = [];
    if (!Array.isArray(this.data.weeklyPlans)) this.data.weeklyPlans = [];
    if (!Array.isArray(this.data.documents)) this.data.documents = [];
    if (!Array.isArray(this.data.userPreferences)) this.data.userPreferences = [];
    if (!Array.isArray(this.data.authSessions)) this.data.authSessions = [];
    return this.data;
  }

  public resetToDefault(): DatabaseSchema {
    this.data = getInitialDatabase();
    this.saveDirect(this.data);
    this.forceFirestoreSync().catch((e) => console.error(e));
    return this.data;
  }

  public restoreFromBackup(backupPayload: any): DatabaseSchema {
    const rawData = backupPayload?.data || backupPayload?.payload || backupPayload;
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('Invalid backup data format. Expected an institutional backup object.');
    }

    const initial = getInitialDatabase();
    const cleanTrainees = (Array.isArray(rawData.trainees) ? rawData.trainees : []).filter((t: any) => !isDemoIdOrName(t));
    const validTraineeIds = new Set(cleanTrainees.map((t: any) => t.id));

    const cleanAttendance = (Array.isArray(rawData.attendance) ? rawData.attendance : []).filter(
      (a: any) => validTraineeIds.has(a.traineeId) && !isDemoIdOrName(a)
    );
    const cleanAssessments = (Array.isArray(rawData.assessments) ? rawData.assessments : []).filter(
      (asm: any) => validTraineeIds.has(asm.traineeId) && !isDemoIdOrName(asm)
    );
    const cleanLeaves = (Array.isArray(rawData.leaves) ? rawData.leaves : []).filter(
      (l: any) => validTraineeIds.has(l.traineeId) && !isDemoIdOrName(l)
    );
    const cleanWarnings = (Array.isArray(rawData.warnings) ? rawData.warnings : []).filter(
      (w: any) => validTraineeIds.has(w.traineeId) && !isDemoIdOrName(w)
    );
    const cleanIndents = (Array.isArray(rawData.indents) ? rawData.indents : []).filter(
      (i: any) => validTraineeIds.has(i.traineeId) && !isDemoIdOrName(i)
    );
    const cleanLessonPlans = (Array.isArray(rawData.lessonPlans) ? rawData.lessonPlans : []).filter((p: any) => !isDemoIdOrName(p));
    const cleanDemoPlans = (Array.isArray(rawData.demonstrationPlans) ? rawData.demonstrationPlans : []).filter((p: any) => !isDemoIdOrName(p));
    const cleanWeeklyPlans = (Array.isArray(rawData.weeklyPlans) ? rawData.weeklyPlans : []).filter((p: any) => !isDemoIdOrName(p));
    const cleanAuditLogs = (Array.isArray(rawData.auditLogs) ? rawData.auditLogs : []).filter((log: any) => !isDemoIdOrName(log));

    const merged: DatabaseSchema = {
      ...initial,
      ...rawData,
      settings: rawData.settings ? { ...initial.settings, ...rawData.settings } : initial.settings,
      sessions: Array.isArray(rawData.sessions) && rawData.sessions.length > 0 ? rawData.sessions : initial.sessions,
      trades: Array.isArray(rawData.trades) && rawData.trades.length > 0 ? rawData.trades : initial.trades,
      officers: Array.isArray(rawData.officers) && rawData.officers.length > 0 ? rawData.officers : initial.officers,
      trainees: cleanTrainees,
      monthlyWorkingDays: Array.isArray(rawData.monthlyWorkingDays) ? rawData.monthlyWorkingDays : initial.monthlyWorkingDays,
      holidays: Array.isArray(rawData.holidays) ? rawData.holidays : initial.holidays,
      attendance: cleanAttendance,
      leaves: cleanLeaves,
      warnings: cleanWarnings,
      inventory: Array.isArray(rawData.inventory) ? rawData.inventory : initial.inventory,
      indents: cleanIndents,
      auditLogs: cleanAuditLogs,
      lessonPlans: cleanLessonPlans,
      demonstrationPlans: cleanDemoPlans,
      weeklyPlans: cleanWeeklyPlans,
      assessments: cleanAssessments,
      documents: Array.isArray(rawData.documents) ? rawData.documents : this.data.documents,
      userPreferences: Array.isArray(rawData.userPreferences) ? rawData.userPreferences : this.data.userPreferences,
      authSessions: this.data.authSessions,
    };

    this.data = merged;
    this.saveDirect(this.data);
    this.forceFirestoreSync().catch((e) => console.error(e));

    this.addAuditLog({
      userId: 'system_backup',
      userName: 'Institutional Backup Engine',
      userRole: 'admin',
      action: 'DATABASE_BACKUP_RESTORED',
      details: `Database restored: ${cleanTrainees.length} Trainees, ${cleanAssessments.length} Assessment records, ${cleanAttendance.length} Attendance entries, ${merged.trades.length} Trades.`,
    });

    return this.data;
  }

  public addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    const entry: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ...log,
    };
    this.data.auditLogs.unshift(entry);
    if (this.data.auditLogs.length > 300) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 300);
    }
    this.saveDirect(this.data);
    this.persistItem('auditLogs', entry.id, entry);
    return entry;
  }
}

export const db = new Database();
