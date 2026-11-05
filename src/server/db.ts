import fs from 'fs';
import path from 'path';
import type {
  SystemSettings,
  AcademicSession,
  MonthlyWorkingDay,
  Trade,
  TrainingOfficer,
  Trainee,
  AttendanceRecord,
  AttendanceStatus,
  LeaveRequest,
  WarningNotice,
  InventoryItem,
  IndentRecord,
  AuditLog,
  LessonPlan,
  DemonstrationPlan,
  WeeklyPlan,
  TraineeAssessment,
} from '../types.ts';

export interface DatabaseSchema {
  settings: SystemSettings;
  sessions: AcademicSession[];
  monthlyWorkingDays: MonthlyWorkingDay[];
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
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'iti_db.json');

// Raigarh ITI Campus GPS Coords (Chakradhar Nagar / Boirdadar ITI Campus Raigarh)
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
      endHour: 10,
      endMinute: 0,
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

  const trainees: Trainee[] = [
    {
      id: 'tr_1',
      rollNo: 'ITI/RAI/2025/ELE-014',
      registrationNo: 'NCVT2025ELE0014',
      name: 'Rohan Sahu',
      fatherName: 'Shri Rameshwar Sahu',
      email: 'rohan.sahu@student.iti.cg.in',
      mobile: '+91 88789 12345',
      tradeId: 'trade_elec',
      sessionId: 'session_2025_2026',
      dob: '2005-04-12',
      gender: 'Male',
      category: 'OBC',
      status: 'active',
      admissionDate: '2025-08-05',
      password: 'trainee123',
    },
    {
      id: 'tr_2',
      rollNo: 'ITI/RAI/2025/ELE-015',
      registrationNo: 'NCVT2025ELE0015',
      name: 'Pooja Kashyap',
      fatherName: 'Shri Santosh Kashyap',
      email: 'pooja.kashyap@student.iti.cg.in',
      mobile: '+91 88789 54321',
      tradeId: 'trade_elec',
      sessionId: 'session_2025_2026',
      dob: '2005-09-18',
      gender: 'Female',
      category: 'ST',
      status: 'active',
      admissionDate: '2025-08-05',
      password: 'trainee123',
    },
    {
      id: 'tr_3',
      rollNo: 'ITI/RAI/2025/ELE-016',
      registrationNo: 'NCVT2025ELE0016',
      name: 'Amit Bhagat',
      fatherName: 'Shri Anand Bhagat',
      email: 'amit.bhagat@student.iti.cg.in',
      mobile: '+91 91310 98765',
      tradeId: 'trade_elec',
      sessionId: 'session_2025_2026',
      dob: '2004-11-25',
      gender: 'Male',
      category: 'ST',
      status: 'active',
      admissionDate: '2025-08-06',
      password: 'trainee123',
    },
    {
      id: 'tr_4',
      rollNo: 'ITI/RAI/2025/ELE-017',
      registrationNo: 'NCVT2025ELE0017',
      name: 'Kavita Patel',
      fatherName: 'Shri Dhaniram Patel',
      email: 'kavita.patel@student.iti.cg.in',
      mobile: '+91 98265 67890',
      tradeId: 'trade_elec',
      sessionId: 'session_2025_2026',
      dob: '2005-01-30',
      gender: 'Female',
      category: 'OBC',
      status: 'active',
      admissionDate: '2025-08-06',
      password: 'trainee123',
    },
    {
      id: 'tr_5',
      rollNo: 'ITI/RAI/2025/ELE-018',
      registrationNo: 'NCVT2025ELE0018',
      name: 'Vikas Tande',
      fatherName: 'Shri Mangal Tande',
      email: 'vikas.tande@student.iti.cg.in',
      mobile: '+91 70002 34567',
      tradeId: 'trade_elec',
      sessionId: 'session_2025_2026',
      dob: '2004-07-14',
      gender: 'Male',
      category: 'SC',
      status: 'active',
      admissionDate: '2025-08-07',
      password: 'trainee123',
    },
    {
      id: 'tr_6',
      rollNo: 'ITI/RAI/2025/FIT-001',
      registrationNo: 'NCVT2025FIT0001',
      name: 'Dinesh Yadav',
      fatherName: 'Shri Balram Yadav',
      email: 'dinesh.yadav@student.iti.cg.in',
      mobile: '+91 81203 45678',
      tradeId: 'trade_fit',
      sessionId: 'session_2025_2026',
      dob: '2004-03-22',
      gender: 'Male',
      category: 'OBC',
      status: 'active',
      admissionDate: '2025-08-05',
      password: 'trainee123',
    },
    {
      id: 'tr_7',
      rollNo: 'ITI/RAI/2025/COP-005',
      registrationNo: 'NCVT2025COP0005',
      name: 'Neha Agrawal',
      fatherName: 'Shri Pradeep Agrawal',
      email: 'neha.agrawal@student.iti.cg.in',
      mobile: '+91 99812 34123',
      tradeId: 'trade_copa',
      sessionId: 'session_2025_2026',
      dob: '2006-02-10',
      gender: 'Female',
      category: 'GEN',
      status: 'active',
      admissionDate: '2025-08-05',
      password: 'trainee123',
    },
  ];

  // Helper to construct sample attendance records over past 20 days
  const attendance: AttendanceRecord[] = [];
  const today = new Date();
  
  // Generate dates for the past 22 days (excluding Sundays)
  const pastDates: string[] = [];
  for (let i = 22; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() !== 0) { // skip Sunday
      pastDates.push(d.toISOString().split('T')[0]);
    }
  }

  let attCounter = 1;
  trainees.forEach((tr) => {
    pastDates.forEach((dateStr, idx) => {
      let status: AttendanceStatus = 'Present';
      let markedBy: 'trainee_gps' | 'officer_manual' | 'system_auto_absent' = 'trainee_gps';
      let timestamp = '08:15 AM';

      // Amit Bhagat (tr_3) has lower attendance to illustrate warning threshold (<80%)
      if (tr.id === 'tr_3') {
        if (idx % 3 === 0) {
          status = 'Absent';
          markedBy = 'system_auto_absent';
          timestamp = '10:01 AM (Cutoff)';
        } else if (idx % 5 === 0) {
          status = 'CL';
          markedBy = 'officer_manual';
          timestamp = '08:00 AM';
        }
      } else if (tr.id === 'tr_2') {
        if (idx === 4) status = 'Medical Leave';
        if (idx === 10) status = 'Half-Day Leave';
      } else {
        // Occasional absent or leave
        if (idx === 7 && tr.id === 'tr_1') status = 'CL';
        if (idx === 13 && tr.id === 'tr_4') status = 'Absent';
      }

      const isPresent = status === 'Present';
      attendance.push({
        id: `att_${attCounter++}`,
        traineeId: tr.id,
        traineeName: tr.name,
        rollNo: tr.rollNo,
        tradeId: tr.tradeId,
        sessionId: tr.sessionId,
        date: dateStr,
        status,
        timestamp,
        markedBy,
        geotag: isPresent
          ? {
              lat: DEFAULT_CAMPUS_LAT + (Math.random() - 0.5) * 0.001,
              lng: DEFAULT_CAMPUS_LNG + (Math.random() - 0.5) * 0.001,
              accuracyMeters: Math.floor(8 + Math.random() * 14),
              distanceFromCampusMeters: Math.floor(25 + Math.random() * 90),
              isWithinCampus: true,
              verified: true,
            }
          : undefined,
        remarks: status === 'CL' ? 'Approved Casual Leave' : status === 'Medical Leave' ? 'Doctor prescription attached' : undefined,
      });
    });
  });

  const leaves: LeaveRequest[] = [
    {
      id: 'lv_101',
      traineeId: 'tr_1',
      traineeName: 'Rohan Sahu',
      rollNo: 'ITI/RAI/2025/ELE-014',
      tradeId: 'trade_elec',
      leaveType: 'Casual Leave (CL)',
      fromDate: '2026-11-03',
      toDate: '2026-11-04',
      days: 2,
      reason: 'Urgent family work in native village (Sarangarh).',
      status: 'pending',
      appliedAt: '2026-10-29 04:30 PM',
    },
    {
      id: 'lv_102',
      traineeId: 'tr_2',
      traineeName: 'Pooja Kashyap',
      rollNo: 'ITI/RAI/2025/ELE-015',
      tradeId: 'trade_elec',
      leaveType: 'Medical Leave (ML)',
      fromDate: '2026-10-15',
      toDate: '2026-10-16',
      days: 2,
      reason: 'Viral fever, medical fitness certificate submitted.',
      status: 'approved',
      appliedAt: '2026-10-14 09:00 AM',
      reviewedBy: 'Er. Rajesh Kumar Dewangan',
      reviewerRemarks: 'Medical certificate verified. Approved.',
      reviewedAt: '2026-10-14 11:30 AM',
    },
    {
      id: 'lv_103',
      traineeId: 'tr_3',
      traineeName: 'Amit Bhagat',
      rollNo: 'ITI/RAI/2025/ELE-016',
      tradeId: 'trade_elec',
      leaveType: 'Half-Day Leave',
      fromDate: '2026-10-28',
      toDate: '2026-10-28',
      days: 0.5,
      reason: 'Aadhaar update camp at Tehsildar office Raigarh.',
      status: 'approved',
      appliedAt: '2026-10-27 02:15 PM',
      reviewedBy: 'Er. Rajesh Kumar Dewangan',
      reviewerRemarks: 'Half-day post-lunch granted.',
      reviewedAt: '2026-10-27 04:00 PM',
    },
  ];

  const warnings: WarningNotice[] = [
    {
      id: 'warn_1',
      refNumber: 'ITI-RAI/ELEC/WARN/2025/03',
      traineeId: 'tr_3',
      traineeName: 'Amit Bhagat',
      rollNo: 'ITI/RAI/2025/ELE-016',
      tradeId: 'trade_elec',
      tradeName: 'Electrician',
      officerId: 'off_1',
      officerName: 'Er. Rajesh Kumar Dewangan',
      attendancePercent: 68.4,
      subject: 'Official Warning: Deficit Attendance Below NCVT Minimum Threshold (80%)',
      subjectHindi: 'कार्यालयीन चेतावनी सूचना: न्यून उपस्थिति (80% से कम) - अखिल भारतीय व्यावसायिक परीक्षा (AITT) हेतु अपात्रता संबंधी',
      message:
        'Your recorded attendance for the current quarter has dropped to 68.4%, which is severely below the mandatory 80% NCVT training standard. You are directed to attend regular practical workshops and explain your repeated absenteeism within 3 working days.',
      messageHindi:
        'आपको सूचित किया जाता है कि वर्तमान सत्र में आपकी दर्ज उपस्थिति 68.4% है, जो DGT / NCVT के अनिवार्य 80% मानक से कम है। यदि आपकी उपस्थिति में तत्काल सुधार नहीं हुआ, तो आपको अखिल भारतीय व्यावसायिक परीक्षा (AITT) से वंचित (Debar) कर दिया जाएगा। अतः आगामी सभी वर्कशॉप प्रायोगिक कक्षाओं में अनिवार्यतः उपस्थित रहें तथा 3 दिवस में लिखित स्पष्टीकरण प्रस्तुत करें।',
      issuedDate: '2026-10-25',
      status: 'issued',
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
      issuedCount: 6,
      damagedCount: 1,
      availableStock: 18,
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
      issuedCount: 12,
      damagedCount: 2,
      availableStock: 26,
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
      issuedCount: 2,
      damagedCount: 0,
      availableStock: 4,
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
      issuedCount: 4,
      damagedCount: 0,
      availableStock: 11,
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
      issuedCount: 5,
      damagedCount: 0,
      availableStock: 13,
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
      issuedCount: 8,
      damagedCount: 1,
      availableStock: 21,
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

  const indents: IndentRecord[] = [
    {
      id: 'ind_01',
      indentNo: 'IND/2026/ELEC/089',
      tradeId: 'trade_elec',
      officerId: 'off_1',
      officerName: 'Er. Rajesh Kumar Dewangan',
      traineeId: 'tr_1',
      traineeName: 'Rohan Sahu',
      rollNo: 'ITI/RAI/2025/ELE-014',
      itemId: 'inv_elec_1',
      itemName: 'Digital Multimeter (Auto-Ranging 600V)',
      quantity: 1,
      issueDate: '2026-10-29',
      expectedReturnDate: '2026-10-30',
      status: 'issued',
      remarks: 'Issued for 3-Phase induction motor impedance measurement experiment.',
    },
    {
      id: 'ind_02',
      indentNo: 'IND/2026/ELEC/085',
      tradeId: 'trade_elec',
      officerId: 'off_1',
      officerName: 'Er. Rajesh Kumar Dewangan',
      traineeId: 'tr_2',
      traineeName: 'Pooja Kashyap',
      rollNo: 'ITI/RAI/2025/ELE-015',
      itemId: 'inv_elec_2',
      itemName: 'Insulated Combination Pliers 8 Inch (1000V)',
      quantity: 1,
      issueDate: '2026-10-27',
      expectedReturnDate: '2026-10-27',
      actualReturnDate: '2026-10-27',
      status: 'returned',
      returnCondition: 'Good',
      remarks: 'Returned in clean working condition after staircase wiring practical.',
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'log_1',
      timestamp: '2026-10-25 09:30:15',
      userId: 'usr_admin',
      userName: 'Principal / Admin (Govt ITI Raigarh)',
      userRole: 'admin',
      action: 'ACADEMIC_SESSION_CONFIG',
      details: 'Configured Academic Session 2025-2026 with 240 working days.',
    },
    {
      id: 'log_2',
      timestamp: '2026-10-25 10:15:00',
      userId: 'usr_admin',
      userName: 'Principal / Admin (Govt ITI Raigarh)',
      userRole: 'admin',
      action: 'TRADE_ASSIGNMENT',
      details: 'Assigned trade Electrician (ELE-01) to Er. Rajesh Kumar Dewangan.',
    },
    {
      id: 'log_3',
      timestamp: '2026-10-25 11:20:45',
      userId: 'off_1',
      userName: 'Er. Rajesh Kumar Dewangan',
      userRole: 'officer',
      action: 'ATTENDANCE_WARNING_ISSUED',
      details: 'Issued formal warning notice ITI-RAI/ELEC/WARN/2025/03 to trainee Amit Bhagat for low attendance (68.4%).',
    },
    {
      id: 'log_4',
      timestamp: '2026-10-29 08:14:22',
      userId: 'tr_1',
      userName: 'Rohan Sahu',
      userRole: 'trainee',
      action: 'GPS_ATTENDANCE_MARKED',
      details: 'Marked Present via GPS geofence at ITI campus (Distance: 38m, Accuracy: 12m).',
    },
  ];

  const lessonPlans: LessonPlan[] = [
    {
      id: 'lp_01',
      tradeId: 'trade_elec',
      unitName: 'Module (M1): Safety precautions, Hand & Power Tools, Systems of Measurement',
      syllabusRef: 'NCVT CTS Syllabus 2025 - Unit 1',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
      status: 'Completed',
      objectives: 'प्रशिक्षुार्थी Trade Scope, General Discipline & First Aid के सिद्धांतों एवं मुख्य संकल्पनाओं को पूर्ण रूप से समझ सकें तथा तकनीकी कार्यप्रणाली की व्याख्या कर सकेंगे।',
      teachingAid: 'Whiteboard, Marker, कट-सेक्शन डीजल इंजन मॉडल, प्रिसिजन मापक यंत्र (माइक्रोमीटर, बोर गेज), एनआईएमआई चार्ट्स',
      keyLearningPoints: 'Trade Scope, General Discipline & First Aid की परिभाषा, तकनीकी महत्ता, कार्यविधि एवं वास्तविक अनुप्रयोगों को चरणबद्ध उदाहरण सहित स्पष्ट करें।',
      assignment: 'Trade Scope, General Discipline & First Aid पर आधारित विस्तृत एवं लघु उत्तरीय प्रश्नों के उत्तर अपनी Theory Notebook में लिखकर अगली कक्षा में प्रस्तुत करें।',
      reference: 'DGT CTS Curriculum & Trade Theory Book (NSQF Level 3.5) published by NIMI, Chennai.',
      officerName: 'Abhishek Swarnkar',
    },
    {
      id: 'lp_02',
      tradeId: 'trade_copa',
      unitName: 'Module (M1): Computer Fundamentals & Operating Systems',
      syllabusRef: 'NCVT COPA Syllabus 2025 - Module 1',
      startDate: '2026-08-16',
      endDate: '2026-08-22',
      status: 'Completed',
      objectives: 'Understand basic computer architecture, CPU, memory hierarchy, and Windows/Linux CLI fundamentals.',
      teachingAid: 'Projector, PC Workstation, Motherboard cut-section, NIMI Digital Modules',
      keyLearningPoints: 'Hardware vs Software, Booting Process, BIOS/UEFI configuration, File system structure.',
      assignment: 'Write steps to format hard disk and create partition in lab record book.',
      reference: 'DGT COPA Curriculum (NSQF Level 3.5) published by NIMI, Chennai.',
      officerName: 'Smt. Priyanka Sharma',
    },
  ];

  const demonstrationPlans: DemonstrationPlan[] = [
    {
      id: 'dp_01',
      tradeId: 'trade_elec',
      practicalTitle: 'Demonstration of machinery used in the trade & electrical safety measures',
      toolsRequired: 'Safety Helmet, Goggles, Safety Shoes, Apron, CO2 Extinguisher, Steel Rule, Try Square, Combination Pliers, Insulation Tester',
      allottedHours: 8,
      targetDate: '2026-08-12',
      status: 'Completed',
      objectives: 'प्रशिक्षुार्थी "Demonstration of machinery used in the trade" को निर्धारित DGT मानक व सुरक्षा नियमों के अनुसार सफलतापूर्वक पूरा करना।',
      procedureSteps: [
        'कार्यस्थल (Workshop/Workstation) की सुरक्षा जाँच करें तथा आवश्यक टूल्स/उपकरण तैयार रखें।',
        'अनुदेशक (Training Officer) द्वारा प्रदर्शित मानक प्रक्रिया के अनुसारचरणबद्ध रूप से निष्पादित करें।',
        'परिणाम एवं रीडिंग का सत्यापन तथा रिकॉर्ड्स को नियत प्रारूप में दर्ज करें।',
        'संपूर्ण कार्य को अपनी Trade Practical Record Book में सर्किट डायग्राम/रीडिंग्स सहित दर्ज करें।'
      ],
      hints: 'ऑटोमोबाइल वर्कशाप में सदैव सुरक्षा जूते और सुरक्षा चश्मा पहनें। गर्म इंजन और घूमते हुए पुर्जों से सुरक्षित दूरी बनाए रखें।',
      officerName: 'Abhishek Swarnkar',
    },
  ];

  const weeklyPlans: WeeklyPlan[] = [
    {
      id: 'wp_1',
      tradeId: 'trade_copa',
      weekNumber: 1,
      dateRange: '10-Aug-2026 to 16-Aug-2026',
      dailyBreakdown: [
        { day: 'सोमवार', date: '10-Aug-2026', theoryTopic: 'Introduction to Computers & Safe Working Practices', practicalTopic: 'Visit COPA Lab and locate electrical connections with computer system setup', status: 'Completed' },
        { day: 'मंगलवार', date: '11-Aug-2026', theoryTopic: 'Introduction to Computers & Safe Working Practices', practicalTopic: 'Identifying safety symbols and hazard identification in IT Lab', status: 'Completed' },
        { day: 'बुधवार', date: '12-Aug-2026', theoryTopic: 'Introduction to Computers & Safe Working Practices', practicalTopic: 'Practice safe methods of fire fighting in case of electrical fire', status: 'Completed' },
        { day: 'गुरुवार', date: '13-Aug-2026', theoryTopic: 'Introduction to Computers & Safe Working Practices', practicalTopic: 'Demonstration and Hands-on Use of Fire Extinguishers', status: 'Completed' },
        { day: 'शुक्रवार', date: '14-Aug-2026', theoryTopic: 'Computer Hardware Architecture & Component Functions', practicalTopic: 'Identify computer peripherals and internal components of a desktop computer', status: 'Completed' },
      ],
      summaryTheoryDone: 5,
      summaryTheoryPlanned: 5,
      summaryPracticalDone: 5,
      summaryPracticalPlanned: 5,
      officerName: 'Shoaib Ahmad',
    },
  ];

  const assessments: TraineeAssessment[] = [
    {
      id: 'asm_1',
      traineeId: 'tr_1',
      sessionId: 'session_2025_2026',
      month: '2026-08',
      testMarks: 81,
      attendancePercent: 88,
      parameters: {
        jobCarriedOut: 8,
        recordBook: 8,
        answerSheet: 16,
        vivaVoce: 8,
        progressChart: 9,
        attendancePunctuality: 8,
        assignment: 5,
        projectWork: 4,
        cbtExam: 8,
        practicalExam: 7,
      },
      remarks: 'Good progress and consistent practical attendance.',
    },
  ];

  return {
    settings,
    sessions,
    monthlyWorkingDays,
    trades,
    officers,
    trainees,
    attendance,
    leaves,
    warnings,
    inventory,
    indents,
    auditLogs,
    lessonPlans,
    demonstrationPlans,
    weeklyPlans,
    assessments,
  };
}

class Database {
  private data: DatabaseSchema;

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
        const merged: DatabaseSchema = {
          ...initial,
          ...parsed,
          assessments: Array.isArray(parsed.assessments) && parsed.assessments.length > 0 ? parsed.assessments : (initial.assessments || []),
          lessonPlans: Array.isArray(parsed.lessonPlans) ? parsed.lessonPlans : (initial.lessonPlans || []),
          demonstrationPlans: Array.isArray(parsed.demonstrationPlans) ? parsed.demonstrationPlans : (initial.demonstrationPlans || []),
          weeklyPlans: Array.isArray(parsed.weeklyPlans) ? parsed.weeklyPlans : (initial.weeklyPlans || []),
        };
        this.saveDirect(merged);
        return merged;
      }
    } catch (err) {
      console.error('Error loading database file, initializing defaults:', err);
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
      console.error('Error writing database to disk:', err);
    }
  }

  public save() {
    this.saveDirect(this.data);
  }

  public get(): DatabaseSchema {
    if (!Array.isArray(this.data.assessments)) this.data.assessments = [];
    if (!Array.isArray(this.data.lessonPlans)) this.data.lessonPlans = [];
    if (!Array.isArray(this.data.demonstrationPlans)) this.data.demonstrationPlans = [];
    if (!Array.isArray(this.data.weeklyPlans)) this.data.weeklyPlans = [];
    return this.data;
  }

  public resetToDefault(): DatabaseSchema {
    this.data = getInitialDatabase();
    this.save();
    return this.data;
  }

  public addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    const entry: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ...log,
    };
    this.data.auditLogs.unshift(entry);
    // keep max 300 logs
    if (this.data.auditLogs.length > 300) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 300);
    }
    this.save();
    return entry;
  }
}

export const db = new Database();
