import React, { useState, useMemo } from 'react';
import {
  CalendarCheck2,
  Calendar,
  FileCheck2,
  BarChart3,
  Wrench,
  BookOpen,
  Users,
  Printer,
  Download,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building2,
  Layers,
  Hammer,
  RotateCcw,
  BadgeAlert,
} from 'lucide-react';
import {
  Trade,
  Trainee,
  AttendanceRecord,
  LeaveRequest,
  InventoryItem,
  IndentRecord,
  SystemSettings,
  AcademicSession,
  AttendanceStatus,
} from '../../types.ts';

export type RegisterType =
  | 'daily_attendance'
  | 'monthly_attendance'
  | 'leave_register'
  | 'workshop_inventory'
  | 'tools_equipments'
  | 'indent_register'
  | 'trainee_roster';

interface OfficerRegistersProps {
  officer: {
    id: string;
    name: string;
    email: string;
    employeeId?: string;
  };
  currentTrade?: Trade;
  selectedSessionId: string;
  sessions: AcademicSession[];
  trainees: Trainee[];
  allAttendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  inventory: InventoryItem[];
  indents: IndentRecord[];
  settings: SystemSettings;
  initialRegister?: RegisterType;
}

export const OfficerRegisters: React.FC<OfficerRegistersProps> = ({
  officer,
  currentTrade,
  selectedSessionId,
  sessions,
  trainees,
  allAttendance,
  leaves,
  inventory,
  indents,
  settings,
  initialRegister = 'monthly_attendance',
}) => {
  const [activeRegister, setActiveRegister] = useState<RegisterType>(initialRegister);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<string>('all');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('all');
  const [indentStatusFilter, setIndentStatusFilter] = useState<string>('all');
  const [rosterCategoryFilter, setRosterCategoryFilter] = useState<string>('all');

  // Print Preview Modal State
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const activeSessionObj = sessions.find((s) => s.id === selectedSessionId) || sessions[0];

  // Helper for Month Days
  const monthDaysInfo = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-12
    const totalDays = new Date(year, month, 0).getDate();

    const days = [];
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
      const dayDate = new Date(year, month - 1, d);
      const dayOfWeek = dayDate.getDay(); // 0 is Sunday
      days.push({
        dayNumber: d,
        dateStr,
        isSunday: dayOfWeek === 0,
        dayName: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dayOfWeek],
      });
    }
    return { year, month, totalDays, days };
  }, [selectedMonth]);

  // Navigate months
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    setSelectedMonth(
      `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    );
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    setSelectedMonth(
      `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
    );
  };

  // Trainee stats for all attendance
  const traineeStatsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        present: number;
        cl: number;
        ml: number;
        halfDay: number;
        absent: number;
        percent: number;
        isBelow: boolean;
      }
    >();

    trainees.forEach((tr) => {
      const records = allAttendance.filter((a) => a.traineeId === tr.id);
      const total = records.length;
      const present = records.filter((a) => a.status === 'Present').length;
      const cl = records.filter((a) => a.status === 'CL').length;
      const ml = records.filter((a) => a.status === 'Medical Leave').length;
      const halfDay = records.filter((a) => a.status === 'Half-Day Leave').length;
      const absent = records.filter((a) => a.status === 'Absent').length;

      const effective = present + cl + ml + halfDay * 0.5;
      const pct = total > 0 ? (effective / total) * 100 : 100;
      map.set(tr.id, {
        total,
        present,
        cl,
        ml,
        halfDay,
        absent,
        percent: Math.round(pct * 10) / 10,
        isBelow: pct < settings.minimumAttendancePercent,
      });
    });

    return map;
  }, [trainees, allAttendance, settings.minimumAttendancePercent]);

  // 1. Daily Attendance Data
  const dailyAttendanceData = useMemo(() => {
    return trainees
      .map((tr) => {
        const record = allAttendance.find(
          (a) => a.traineeId === tr.id && a.date === dailyDate
        );
        return {
          trainee: tr,
          record: record || null,
          status: record ? record.status : ('Unmarked' as const),
        };
      })
      .filter((item) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          item.trainee.name.toLowerCase().includes(q) ||
          item.trainee.rollNo.toLowerCase().includes(q)
        );
      });
  }, [trainees, allAttendance, dailyDate, searchQuery]);

  // 2. Monthly Attendance Matrix Data
  const monthlyMatrixData = useMemo(() => {
    return trainees
      .map((tr) => {
        let presentCount = 0;
        let leaveCount = 0;
        let absentCount = 0;
        let markedDays = 0;

        const dailyStatuses: Record<number, string> = {};

        monthDaysInfo.days.forEach(({ dayNumber, dateStr, isSunday }) => {
          if (isSunday) {
            dailyStatuses[dayNumber] = 'H';
            return;
          }
          const rec = allAttendance.find(
            (a) => a.traineeId === tr.id && a.date === dateStr
          );
          if (rec) {
            markedDays++;
            if (rec.status === 'Present') {
              dailyStatuses[dayNumber] = 'P';
              presentCount++;
            } else if (rec.status === 'CL') {
              dailyStatuses[dayNumber] = 'CL';
              leaveCount++;
            } else if (rec.status === 'Medical Leave') {
              dailyStatuses[dayNumber] = 'ML';
              leaveCount++;
            } else if (rec.status === 'Half-Day Leave') {
              dailyStatuses[dayNumber] = 'HD';
              leaveCount += 0.5;
              presentCount += 0.5;
            } else {
              dailyStatuses[dayNumber] = 'A';
              absentCount++;
            }
          } else {
            dailyStatuses[dayNumber] = '-';
          }
        });

        const effective = presentCount + leaveCount;
        const monthPct =
          markedDays > 0 ? Math.round((effective / markedDays) * 1000) / 10 : 100;

        return {
          trainee: tr,
          dailyStatuses,
          markedDays,
          presentCount,
          leaveCount,
          absentCount,
          monthPct,
          isDeficit: monthPct < settings.minimumAttendancePercent,
        };
      })
      .filter((item) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          item.trainee.name.toLowerCase().includes(q) ||
          item.trainee.rollNo.toLowerCase().includes(q)
        );
      });
  }, [trainees, allAttendance, monthDaysInfo, searchQuery, settings.minimumAttendancePercent]);

  // 3. Leave Register Data
  const filteredLeaves = useMemo(() => {
    return leaves
      .filter((l) => {
        if (leaveStatusFilter !== 'all' && l.status !== leaveStatusFilter) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            l.traineeName.toLowerCase().includes(q) ||
            l.rollNo.toLowerCase().includes(q) ||
            l.leaveType.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
  }, [leaves, leaveStatusFilter, searchQuery]);

  // 4. Workshop Inventory Data
  const filteredInventory = useMemo(() => {
    return inventory
      .filter((item) => {
        if (
          inventoryCategoryFilter !== 'all' &&
          item.category !== inventoryCategoryFilter
        )
          return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            item.name.toLowerCase().includes(q) ||
            item.toolCode.toLowerCase().includes(q) ||
            item.specification.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.toolCode.localeCompare(b.toolCode));
  }, [inventory, inventoryCategoryFilter, searchQuery]);

  // 5. Tools & Equipments Register Data (DGT Standard)
  const filteredToolsAndEquipments = useMemo(() => {
    return inventory
      .filter((item) => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            item.name.toLowerCase().includes(q) ||
            item.toolCode.toLowerCase().includes(q) ||
            item.specification.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((item) => {
        // Compute DGT equipment compliance rating
        const isDamaged = item.damagedCount > 0;
        const condition = isDamaged ? 'Requires Attention' : 'Serviceable / Good';
        return {
          ...item,
          condition,
          custodian: officer.name,
          standardRatio: '1 per Trainee',
        };
      });
  }, [inventory, searchQuery, officer.name]);

  // 6. Indent Register Data
  const filteredIndents = useMemo(() => {
    return indents
      .filter((ind) => {
        if (indentStatusFilter !== 'all' && ind.status !== indentStatusFilter) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            ind.indentNo.toLowerCase().includes(q) ||
            ind.traineeName.toLowerCase().includes(q) ||
            ind.rollNo.toLowerCase().includes(q) ||
            ind.itemName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
  }, [indents, indentStatusFilter, searchQuery]);

  // 7. Trainee Roster Data
  const filteredRoster = useMemo(() => {
    return trainees
      .filter((tr) => {
        if (rosterCategoryFilter !== 'all' && tr.category !== rosterCategoryFilter)
          return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            tr.name.toLowerCase().includes(q) ||
            tr.rollNo.toLowerCase().includes(q) ||
            (tr.fatherName && tr.fatherName.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => a.rollNo.localeCompare(b.rollNo));
  }, [trainees, rosterCategoryFilter, searchQuery]);

  // CSV Export Handler
  const handleExportRegisterCSV = () => {
    let filename = '';
    let csvContent = '\uFEFF'; // UTF-8 BOM

    // Standard Header for all exports
    const govHeader = [
      `"GOVERNMENT INDUSTRIAL TRAINING INSTITUTE, RAIGARH (CHHATTISGARH)"`,
      `"DIRECTORATE OF EMPLOYMENT & TRAINING, GOVT. OF CHHATTISGARH"`,
      `"Trade: ${currentTrade?.name || 'Trade'} (${currentTrade?.code || 'TRD'}) | Session: ${activeSessionObj?.name || '2025-2026'}"`,
      `"Training Officer: ${officer.name} (${officer.employeeId || 'CG-ITI-TO-1042'})"`,
      `"Generated On: ${new Date().toLocaleString()}"`,
      `""`,
    ].join('\n');

    if (activeRegister === 'daily_attendance') {
      filename = `ITI_Raigarh_${currentTrade?.code}_Daily_Attendance_Register_${dailyDate}.csv`;
      const header = [
        'S.No.',
        'Roll No',
        'Trainee Name',
        'Father Name',
        'Gender',
        'Category',
        'Status',
        'Marked Time',
        'Marked Method',
        'GPS Distance (m)',
        'GPS Verified',
      ];
      const rows = dailyAttendanceData.map((d, idx) => [
        idx + 1,
        d.trainee.rollNo,
        d.trainee.name,
        d.trainee.fatherName || '-',
        d.trainee.gender,
        d.trainee.category,
        d.status,
        d.record?.timestamp || '-',
        d.record?.markedBy || '-',
        d.record?.geotag?.distanceFromCampusMeters ?? '-',
        d.record?.geotag?.isWithinCampus ? 'YES' : 'NO',
      ]);
      csvContent +=
        govHeader +
        `"FORM IV - DAILY MUSTER ROLL & GPS ATTENDANCE REGISTER - Date: ${dailyDate}"\n` +
        [header.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    } else if (activeRegister === 'monthly_attendance') {
      filename = `ITI_Raigarh_${currentTrade?.code}_Monthly_Attendance_Register_${selectedMonth}.csv`;
      const dayHeaders = monthDaysInfo.days.map((d) => `Day ${d.dayNumber} (${d.dayName})`);
      const header = [
        'S.No.',
        'Roll No',
        'Trainee Name',
        ...dayHeaders,
        'Present (P)',
        'Leaves (L)',
        'Absent (A)',
        'Total Marked',
        'Attendance %',
        'NCVT Status',
      ];
      const rows = monthlyMatrixData.map((m, idx) => [
        idx + 1,
        m.trainee.rollNo,
        m.trainee.name,
        ...monthDaysInfo.days.map((d) => m.dailyStatuses[d.dayNumber] || '-'),
        m.presentCount,
        m.leaveCount,
        m.absentCount,
        m.markedDays,
        `${m.monthPct}%`,
        m.isDeficit ? 'DEFICIT (<80%)' : 'REGULAR',
      ]);
      csvContent +=
        govHeader +
        `"FORM V - MONTHLY TRAINEE ATTENDANCE REGISTER (1-31 MATRIX) - Month: ${selectedMonth}"\n` +
        [header.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    } else if (activeRegister === 'leave_register') {
      filename = `ITI_Raigarh_${currentTrade?.code}_Leave_Register_${new Date().toISOString().split('T')[0]}.csv`;
      const header = [
        'S.No.',
        'Application ID',
        'Roll No',
        'Trainee Name',
        'Leave Type',
        'From Date',
        'To Date',
        'Days',
        'Reason',
        'Status',
        'Applied Date',
        'Reviewer Remarks',
      ];
      const rows = filteredLeaves.map((l, idx) => [
        idx + 1,
        l.id,
        l.rollNo,
        l.traineeName,
        l.leaveType,
        l.fromDate,
        l.toDate,
        l.days,
        l.reason,
        l.status.toUpperCase(),
        l.appliedAt,
        l.reviewerRemarks || '-',
      ]);
      csvContent +=
        govHeader +
        `"FORM VII - TRAINEE LEAVE SANCTION & REGISTRATION REGISTER"\n` +
        [header.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    } else if (activeRegister === 'workshop_inventory') {
      filename = `ITI_Raigarh_${currentTrade?.code}_Workshop_Inventory_Stock_Register.csv`;
      const header = [
        'S.No.',
        'Tool Code',
        'Item Name',
        'Category',
        'Specification',
        'Total Stock',
        'Issued Count',
        'Damaged Count',
        'Available Stock',
        'Bin / Rack Location',
        'Last Physical Inspection',
      ];
      const rows = filteredInventory.map((item, idx) => [
        idx + 1,
        item.toolCode,
        item.name,
        item.category,
        item.specification,
        item.totalStock,
        item.issuedCount,
        item.damagedCount,
        item.availableStock,
        item.binLocation,
        item.lastInspected,
      ]);
      csvContent +=
        govHeader +
        `"FORM VIII - WORKSHOP INVENTORY & CONSUMABLE STOCK REGISTER"\n` +
        [header.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    } else if (activeRegister === 'tools_equipments') {
      filename = `ITI_Raigarh_${currentTrade?.code}_DGT_Tools_Equipments_Register.csv`;
      const header = [
        'S.No.',
        'Equipment Code',
        'Equipment Name',
        'Category',
        'Specification',
        'Total Qty',
        'Available in Workshop',
        'Operational Condition',
        'Custodian Officer',
        'Bin / Station Location',
      ];
      const rows = filteredToolsAndEquipments.map((item, idx) => [
        idx + 1,
        item.toolCode,
        item.name,
        item.category,
        item.specification,
        item.totalStock,
        item.availableStock,
        item.condition,
        item.custodian,
        item.binLocation,
      ]);
      csvContent +=
        govHeader +
        `"FORM IX - DGT TOOLS, MACHINERY & TESTING EQUIPMENT COMPLIANCE REGISTER"\n` +
        [header.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    } else if (activeRegister === 'indent_register') {
      filename = `ITI_Raigarh_${currentTrade?.code}_Workshop_Indent_Issue_Return_Register.csv`;
      const header = [
        'S.No.',
        'Indent No',
        'Roll No',
        'Trainee Name',
        'Issued Item / Tool',
        'Quantity',
        'Issue Date',
        'Expected Return Date',
        'Actual Return Date',
        'Return Condition',
        'Status',
        'Workshop Exercise Purpose',
      ];
      const rows = filteredIndents.map((ind, idx) => [
        idx + 1,
        ind.indentNo,
        ind.rollNo,
        ind.traineeName,
        ind.itemName,
        ind.quantity,
        ind.issueDate,
        ind.expectedReturnDate,
        ind.actualReturnDate || '-',
        ind.returnCondition || '-',
        ind.status.toUpperCase(),
        ind.remarks || '-',
      ]);
      csvContent +=
        govHeader +
        `"FORM X - WORKSHOP TOOL INDENT & ISSUE-RETURN REGISTER"\n` +
        [header.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    } else if (activeRegister === 'trainee_roster') {
      filename = `ITI_Raigarh_${currentTrade?.code}_Master_Trainee_Admission_Roster.csv`;
      const header = [
        'S.No.',
        'Roll No',
        'Registration No',
        'Trainee Full Name',
        'Father Name',
        'DOB',
        'Gender',
        'Social Category',
        'Mobile Number',
        'Email Address',
        'Admission Date',
        'Status',
        'Attendance %',
        'Eligibility',
      ];
      const rows = filteredRoster.map((tr, idx) => {
        const stat = traineeStatsMap.get(tr.id);
        return [
          idx + 1,
          tr.rollNo,
          tr.registrationNo,
          tr.name,
          tr.fatherName || '-',
          tr.dob,
          tr.gender,
          tr.category,
          tr.mobile,
          tr.email,
          tr.admissionDate,
          tr.status.toUpperCase(),
          `${stat?.percent ?? 100}%`,
          stat?.isBelow ? 'DEFICIT (<80%)' : 'ELIGIBLE',
        ];
      });
      csvContent +=
        govHeader +
        `"FORM I - MASTER TRAINEE ADMISSION ROSTER & RECORD REGISTER"\n` +
        [header.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const registerTabs: { id: RegisterType; name: string; hindiName: string; formNo: string; icon: any }[] = [
    {
      id: 'daily_attendance',
      name: 'Daily Attendance Register',
      hindiName: 'दैनिक उपस्थिति पंजी',
      formNo: 'Form IV',
      icon: CalendarCheck2,
    },
    {
      id: 'monthly_attendance',
      name: 'Monthly Attendance Register',
      hindiName: 'मासिक उपस्थिति पत्रक (1-31 दिन)',
      formNo: 'Form V',
      icon: Calendar,
    },
    {
      id: 'leave_register',
      name: 'Leave Register',
      hindiName: 'प्रशिक्षु अवकाश पंजी',
      formNo: 'Form VII',
      icon: FileCheck2,
    },
    {
      id: 'workshop_inventory',
      name: 'Workshop Inventory Register',
      hindiName: 'सामग्री स्टॉक पंजी',
      formNo: 'Form VIII',
      icon: Layers,
    },
    {
      id: 'tools_equipments',
      name: 'Tools & Equipments Register',
      hindiName: 'औजार एवं उपकरण रजिस्टर (DGT)',
      formNo: 'Form IX',
      icon: Wrench,
    },
    {
      id: 'indent_register',
      name: 'Indent Register (Issue & Return)',
      hindiName: 'टूल निर्गमन-वापसी पंजी',
      formNo: 'Form X',
      icon: BookOpen,
    },
    {
      id: 'trainee_roster',
      name: 'Trainee Master Roster',
      hindiName: 'प्रशिक्षु मास्टर पंजी',
      formNo: 'Form I',
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Registers Control Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-100 text-amber-800 rounded-md">
                <BookOpen className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Official NCVT / DGT Registers &amp; Reports
                </h2>
                <p className="text-xs text-slate-500">
                  Government Industrial Training Institute Raigarh · Trade: {currentTrade?.name} ({currentTrade?.code})
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons: Export & Print */}
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <button
              onClick={handleExportRegisterCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
              title="Download clean CSV / Excel formatted spreadsheet for active register"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel / CSV</span>
            </button>
            <button
              onClick={() => setPrintModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
              title="Print formal signed government format register PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Official Register</span>
            </button>
          </div>
        </div>

        {/* 7-Segment Register Switcher Bar - Bold High-Contrast Menu */}
        <div className="pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
          {registerTabs.map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeRegister === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveRegister(tab.id);
                  setSearchQuery('');
                }}
                className={`flex flex-col text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-slate-950 text-white border-amber-400 shadow-md ring-2 ring-amber-400/20'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-400 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded font-mono ${
                      isCurrent
                        ? 'bg-amber-400 text-slate-950 shadow-xs'
                        : 'bg-slate-100 text-slate-800 border border-slate-300'
                    }`}
                  >
                    {tab.formNo}
                  </span>
                  <Icon
                    className={`w-4 h-4 ${
                      isCurrent ? 'text-amber-400' : 'text-slate-500'
                    }`}
                  />
                </div>
                <span
                  className={`text-xs leading-snug line-clamp-1 ${
                    isCurrent ? 'text-white font-extrabold' : 'text-slate-900 font-bold'
                  }`}
                >
                  {tab.name}
                </span>
                <span
                  className={`text-[10px] line-clamp-1 mt-0.5 font-medium ${
                    isCurrent ? 'text-amber-300' : 'text-slate-500'
                  }`}
                >
                  {tab.hindiName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Register Workspace */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
        {/* Register Institutional Header Card */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 via-amber-50/30 to-slate-50 border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-white p-1 border border-amber-300/80 shadow-xs flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/iti-logo_b32addc6.png"
                alt="Govt ITI Raigarh Official Emblem"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-800">
                शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़ (छ.ग.)
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 uppercase tracking-tight">
                Government Industrial Training Institute, Raigarh (C.G.)
              </h3>
              <p className="text-[11px] text-slate-600">
                Directorate of Employment &amp; Training, Chhattisgarh · NCVT Code: ITI-RAI-CG-04
              </p>
            </div>
          </div>

          <div className="flex flex-col md:items-end text-xs text-slate-600 border-t md:border-t-0 pt-2 md:pt-0 border-slate-200">
            <div className="font-semibold text-slate-900">
              Trade: <span className="text-emerald-800">{currentTrade?.name} ({currentTrade?.code})</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Session: <span className="font-mono text-slate-700">{activeSessionObj?.name}</span> · Training Officer: <span className="font-semibold text-slate-800">{officer.name}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Ref: ITI-RAI/{currentTrade?.code}/{activeRegister.toUpperCase()}/{new Date().getFullYear()}
            </div>
          </div>
        </div>

        {/* ---------------- REGISTER 1: DAILY ATTENDANCE REGISTER ---------------- */}
        {activeRegister === 'daily_attendance' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>FORM IV: Daily Muster Roll &amp; GPS Attendance Register</span>
                  <span className="text-xs font-normal text-slate-500">(दैनिक उपस्थिति पंजी)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Daily muster roll recording physical GPS check-ins, manual officer verification, and leave credits.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-500 font-medium">Select Date:</span>
                  <input
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="bg-transparent font-mono font-semibold text-slate-900 focus:outline-hidden"
                  />
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search trainee name or roll no..."
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48 sm:w-60 focus:outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Daily Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px]">Enrolled Strength</span>
                <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                  {trainees.length} Trainees
                </div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-emerald-800 text-[11px]">Present Today (P)</span>
                <div className="text-lg font-bold text-emerald-700 font-mono mt-0.5">
                  {dailyAttendanceData.filter((d) => d.status === 'Present').length}
                </div>
              </div>
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                <span className="text-rose-800 text-[11px]">Absent Today (A)</span>
                <div className="text-lg font-bold text-rose-700 font-mono mt-0.5">
                  {dailyAttendanceData.filter((d) => d.status === 'Absent').length}
                </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-amber-800 text-[11px]">Sanctioned Leaves (CL/ML)</span>
                <div className="text-lg font-bold text-amber-700 font-mono mt-0.5">
                  {
                    dailyAttendanceData.filter(
                      (d) =>
                        d.status === 'CL' ||
                        d.status === 'Medical Leave' ||
                        d.status === 'Half-Day Leave'
                    ).length
                  }
                </div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-800 text-[11px]">Day Turnout Ratio</span>
                <div className="text-lg font-bold text-blue-700 font-mono mt-0.5">
                  {trainees.length > 0
                    ? Math.round(
                        (dailyAttendanceData.filter(
                          (d) =>
                            d.status === 'Present' ||
                            d.status === 'CL' ||
                            d.status === 'Medical Leave'
                        ).length /
                          trainees.length) *
                          100
                      )
                    : 0}
                  %
                </div>
              </div>
            </div>

            {/* Daily Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-3 font-semibold text-center w-12">S.No.</th>
                    <th className="py-2.5 px-3 font-semibold">Roll No</th>
                    <th className="py-2.5 px-3 font-semibold">Trainee Name &amp; Father Name</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Category</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Marked In-Time</th>
                    <th className="py-2.5 px-3 font-semibold">Marking Mode</th>
                    <th className="py-2.5 px-3 font-semibold">GPS Distance &amp; Geo-Check</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyAttendanceData.map((d, idx) => (
                    <tr key={d.trainee.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {d.trainee.rollNo}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{d.trainee.name}</div>
                        <div className="text-[11px] text-slate-500">
                          S/O: {d.trainee.fatherName || 'Shri Lalit Kumar'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[10px]">
                          {d.trainee.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded ${
                            d.status === 'Present'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : d.status === 'Absent'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : d.status === 'CL'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : d.status === 'Medical Leave'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {d.status === 'Medical Leave' ? 'ML' : d.status === 'Half-Day Leave' ? 'HD' : d.status === 'Present' ? 'P' : d.status === 'Absent' ? 'A' : d.status === 'CL' ? 'CL' : 'UNMARKED'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800">
                        {d.record?.timestamp || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[11px] font-medium text-slate-700">
                          {d.record?.markedBy === 'trainee_gps'
                            ? 'GPS Geofence App'
                            : d.record?.markedBy === 'officer_manual'
                            ? 'Officer Manual Override'
                            : d.record?.markedBy === 'system_auto_absent'
                            ? '10 AM Auto Absent'
                            : 'Not Recorded'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {d.record?.geotag ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{d.record.geotag.distanceFromCampusMeters}m from ITI center</span>
                            <span className="text-emerald-700 font-bold">✓ Verified</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[11px] text-slate-500 font-mono">
                        {d.record?.remarks || 'NCVT Roll Call Validated'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- REGISTER 2: MONTHLY ATTENDANCE REGISTER (1-31 MATRIX) ---------------- */}
        {activeRegister === 'monthly_attendance' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>FORM V: Monthly Comprehensive Trainee Attendance Register</span>
                  <span className="text-xs font-normal text-slate-500">(मासिक उपस्थिति पत्रक 1-31 दिन)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Official NCVT full-month matrix with day-by-day attendance codes (P=Present, A=Absent, CL=Casual Leave, ML=Medical Leave, H=Holiday).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Month Navigator */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1 hover:bg-white rounded transition-colors text-slate-700 cursor-pointer"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent font-semibold font-mono text-slate-900 px-1 focus:outline-hidden"
                  />
                  <button
                    onClick={handleNextMonth}
                    className="p-1 hover:bg-white rounded transition-colors text-slate-700 cursor-pointer"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search roll no or trainee..."
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48 sm:w-60 focus:outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Legend & Stats */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-slate-700">Attendance Codes:</span>
                <span className="flex items-center gap-1 font-mono font-semibold text-emerald-800">
                  <span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300 flex items-center justify-center text-[10px]">P</span>
                  <span>Present</span>
                </span>
                <span className="flex items-center gap-1 font-mono font-semibold text-rose-800">
                  <span className="w-4 h-4 rounded bg-rose-100 border border-rose-300 flex items-center justify-center text-[10px]">A</span>
                  <span>Absent</span>
                </span>
                <span className="flex items-center gap-1 font-mono font-semibold text-amber-800">
                  <span className="w-4 h-4 rounded bg-amber-100 border border-amber-300 flex items-center justify-center text-[10px]">CL</span>
                  <span>Casual Leave</span>
                </span>
                <span className="flex items-center gap-1 font-mono font-semibold text-blue-800">
                  <span className="w-4 h-4 rounded bg-blue-100 border border-blue-300 flex items-center justify-center text-[10px]">ML</span>
                  <span>Medical Leave</span>
                </span>
                <span className="flex items-center gap-1 font-mono font-semibold text-slate-600">
                  <span className="w-4 h-4 rounded bg-slate-200 border border-slate-300 flex items-center justify-center text-[10px]">H</span>
                  <span>Sunday / Holiday</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                Mandatory NCVT Exam Eligibility: <span className="font-bold text-amber-900">80.0% Minimum</span>
              </div>
            </div>

            {/* Matrix Table (Wide Scrollable) */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="py-2 px-2.5 font-semibold text-center sticky left-0 bg-slate-100 z-10 w-10">
                      #
                    </th>
                    <th className="py-2 px-2.5 font-semibold sticky left-10 bg-slate-100 z-10 min-w-[140px]">
                      Trainee Roll No &amp; Name
                    </th>
                    {monthDaysInfo.days.map((d) => (
                      <th
                        key={d.dayNumber}
                        className={`py-1.5 px-1 text-center font-mono text-[10px] w-6.5 border-l border-slate-200 ${
                          d.isSunday ? 'bg-amber-100/60 text-amber-900 font-bold' : 'text-slate-600'
                        }`}
                        title={`${d.dateStr} (${d.dayName})`}
                      >
                        <div>{d.dayNumber}</div>
                        <div className="text-[8px] text-slate-400">{d.dayName}</div>
                      </th>
                    ))}
                    <th className="py-2 px-2 text-center font-semibold bg-emerald-50 text-emerald-900 border-l border-slate-200">
                      P
                    </th>
                    <th className="py-2 px-2 text-center font-semibold bg-amber-50 text-amber-900 border-l border-slate-200">
                      L
                    </th>
                    <th className="py-2 px-2 text-center font-semibold bg-rose-50 text-rose-900 border-l border-slate-200">
                      A
                    </th>
                    <th className="py-2 px-2.5 text-center font-semibold bg-slate-100 border-l border-slate-200">
                      %
                    </th>
                    <th className="py-2 px-2.5 text-center font-semibold bg-slate-100 border-l border-slate-200">
                      Eligibility
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {monthlyMatrixData.map((m, idx) => (
                    <tr key={m.trainee.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-2 text-center font-mono text-slate-500 sticky left-0 bg-white z-10">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5 sticky left-10 bg-white z-10 shadow-xs">
                        <div className="font-semibold text-slate-900 truncate max-w-[130px]">
                          {m.trainee.name}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500 truncate max-w-[130px]">
                          {m.trainee.rollNo}
                        </div>
                      </td>
                      {monthDaysInfo.days.map((d) => {
                        const val = m.dailyStatuses[d.dayNumber] || '-';
                        return (
                          <td
                            key={d.dayNumber}
                            className={`py-1.5 px-0.5 text-center font-mono text-[10px] font-semibold border-l border-slate-100 ${
                              d.isSunday
                                ? 'bg-amber-50/50 text-slate-400'
                                : val === 'P'
                                ? 'text-emerald-700 bg-emerald-50/30'
                                : val === 'A'
                                ? 'text-rose-700 bg-rose-50/40 font-bold'
                                : val === 'CL' || val === 'ML'
                                ? 'text-amber-700 bg-amber-50/30'
                                : 'text-slate-300'
                            }`}
                          >
                            {val}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40 border-l border-slate-200">
                        {m.presentCount}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-amber-800 bg-amber-50/40 border-l border-slate-200">
                        {m.leaveCount}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-rose-800 bg-rose-50/40 border-l border-slate-200">
                        {m.absentCount}
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono font-bold border-l border-slate-200">
                        <span className={m.isDeficit ? 'text-rose-700' : 'text-emerald-700'}>
                          {m.monthPct}%
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center border-l border-slate-200">
                        {m.isDeficit ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            DEFICIT
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ELIGIBLE
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Official Certification Signature Block */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">Training Officer Certification:</div>
                <p className="text-[11px] text-slate-500 max-w-xl">
                  "Certified that the daily attendance entries recorded in this Form V register have been verified with biometric/GPS muster roll records and approved leave applications under NCVT rules."
                </p>
              </div>
              <div className="text-center shrink-0">
                <div className="font-mono text-slate-900 font-bold">{officer.name}</div>
                <div className="text-[10px] text-slate-500">Training Officer (Trade In-Charge)</div>
                <div className="text-[9px] text-slate-400">Govt. ITI Raigarh (C.G.)</div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- REGISTER 3: LEAVE REGISTER ---------------- */}
        {activeRegister === 'leave_register' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>FORM VII: Trainee Leave Sanction &amp; Registration Register</span>
                  <span className="text-xs font-normal text-slate-500">(प्रशिक्षु अवकाश पंजी)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Comprehensive register of all Casual Leave (CL), Medical Leave (ML), and Half-Day applications with sanction orders.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-500 font-medium">Status:</span>
                  <select
                    value={leaveStatusFilter}
                    onChange={(e) => setLeaveStatusFilter(e.target.value)}
                    className="bg-transparent font-semibold text-slate-800 focus:outline-hidden"
                  >
                    <option value="all">All Applications</option>
                    <option value="approved">Approved / Sanctioned</option>
                    <option value="pending">Pending Officer Review</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search roll no, trainee..."
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48 sm:w-60 focus:outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Leave Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px]">Total Applications</span>
                <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                  {leaves.length} Applications
                </div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-emerald-800 text-[11px]">Sanctioned (Approved)</span>
                <div className="text-lg font-bold text-emerald-700 font-mono mt-0.5">
                  {leaves.filter((l) => l.status === 'approved').length}
                </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-amber-800 text-[11px]">Pending Review</span>
                <div className="text-lg font-bold text-amber-700 font-mono mt-0.5">
                  {leaves.filter((l) => l.status === 'pending').length}
                </div>
              </div>
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                <span className="text-rose-800 text-[11px]">Rejected</span>
                <div className="text-lg font-bold text-rose-700 font-mono mt-0.5">
                  {leaves.filter((l) => l.status === 'rejected').length}
                </div>
              </div>
            </div>

            {/* Leave Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-3 font-semibold text-center w-12">S.No.</th>
                    <th className="py-2.5 px-3 font-semibold">Trainee Name &amp; Roll No</th>
                    <th className="py-2.5 px-3 font-semibold">Leave Type</th>
                    <th className="py-2.5 px-3 font-semibold">Period (From – To)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Days</th>
                    <th className="py-2.5 px-3 font-semibold">Reason for Absence</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Sanction Status</th>
                    <th className="py-2.5 px-3 font-semibold">Sanction Remarks</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Applied Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeaves.map((l, idx) => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{l.traineeName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{l.rollNo}</div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{l.leaveType}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800">
                        {l.fromDate} to {l.toDate}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                        {l.days} {l.days === 1 ? 'day' : 'days'}
                      </td>
                      <td className="py-2.5 px-3 max-w-xs text-slate-700 truncate" title={l.reason}>
                        {l.reason}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            l.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : l.status === 'rejected'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {l.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600">
                        {l.reviewerRemarks || 'Under verification'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500">
                        {l.appliedAt.split('T')[0] || l.appliedAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- REGISTER 4: WORKSHOP INVENTORY REGISTER ---------------- */}
        {activeRegister === 'workshop_inventory' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>FORM VIII: Workshop Inventory &amp; Consumable Stock Register</span>
                  <span className="text-xs font-normal text-slate-500">(कार्यशाला सामग्री स्टॉक पंजी)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Physical stock reconciliation: total holdings, items issued to floor, damaged stock, and shelf availability.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-500 font-medium">Category:</span>
                  <select
                    value={inventoryCategoryFilter}
                    onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                    className="bg-transparent font-semibold text-slate-800 focus:outline-hidden"
                  >
                    <option value="all">All Categories</option>
                    <option value="Hand Tools">Hand Tools</option>
                    <option value="Power Machinery">Power Machinery</option>
                    <option value="Testing & Measuring">Testing & Measuring</option>
                    <option value="Consumables & Raw Materials">Consumables & Raw Materials</option>
                  </select>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tool code or item..."
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48 sm:w-60 focus:outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Inventory KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px]">Total Tool Master Items</span>
                <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                  {inventory.length} Stock SKUs
                </div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-800 text-[11px]">Total Physical Stock Units</span>
                <div className="text-lg font-bold text-blue-700 font-mono mt-0.5">
                  {inventory.reduce((sum, i) => sum + i.totalStock, 0)} Units
                </div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-emerald-800 text-[11px]">Available on Shelf</span>
                <div className="text-lg font-bold text-emerald-700 font-mono mt-0.5">
                  {inventory.reduce((sum, i) => sum + i.availableStock, 0)} Units
                </div>
              </div>
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                <span className="text-rose-800 text-[11px]">Damaged / Under Repair</span>
                <div className="text-lg font-bold text-rose-700 font-mono mt-0.5">
                  {inventory.reduce((sum, i) => sum + i.damagedCount, 0)} Units
                </div>
              </div>
            </div>

            {/* Inventory Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-3 font-semibold text-center w-12">S.No.</th>
                    <th className="py-2.5 px-3 font-semibold">Tool Code</th>
                    <th className="py-2.5 px-3 font-semibold">Equipment / Tool Name &amp; Spec</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Total Stock</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Issued Out</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Damaged</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Available</th>
                    <th className="py-2.5 px-3 font-semibold">Rack / Cupboard Location</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Last Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInventory.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.toolCode}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="text-[10px] text-slate-500 max-w-sm">{item.specification}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-900">
                        {item.totalStock}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-amber-700">
                        {item.issuedCount}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-rose-700">
                        {item.damagedCount}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">
                        {item.availableStock}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">{item.binLocation}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500">
                        {item.lastInspected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- REGISTER 5: TOOLS & EQUIPMENTS REGISTER (DGT COMPLIANCE) ---------------- */}
        {activeRegister === 'tools_equipments' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>FORM IX: DGT Tools, Machinery &amp; Testing Equipment Compliance Register</span>
                  <span className="text-xs font-normal text-slate-500">(औजार एवं उपकरण रजिस्टर)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Mandatory workshop standard equipment register conforming to DGT syllabus norms, condition, and maintenance tracking.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search equipment name or specification..."
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-60 focus:outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Tools Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-3 font-semibold text-center w-12">S.No.</th>
                    <th className="py-2.5 px-3 font-semibold">Equipment Code</th>
                    <th className="py-2.5 px-3 font-semibold">Equipment / Instrument Name</th>
                    <th className="py-2.5 px-3 font-semibold">DGT Category</th>
                    <th className="py-2.5 px-3 font-semibold">Standard Specifications</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Sanctioned Qty</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Operational Qty</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Operating Condition</th>
                    <th className="py-2.5 px-3 font-semibold">Designated Custodian</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Last Calibration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredToolsAndEquipments.map((t, idx) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{t.toolCode}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{t.name}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-medium">
                          {t.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600 max-w-xs">{t.specification}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                        {t.totalStock}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">
                        {t.availableStock}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.condition === 'Requires Attention'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {t.condition}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-medium">{t.custodian}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500">
                        {t.lastInspected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- REGISTER 6: INDENT REGISTER (ISSUE & RETURN) ---------------- */}
        {activeRegister === 'indent_register' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>FORM X: Workshop Tool Indent &amp; Issue-Return Register</span>
                  <span className="text-xs font-normal text-slate-500">(टूल निर्गमन-वापसी पंजी)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Permanent accountability log of tools issued to trainees during practical training shifts, with return condition verification.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-500 font-medium">Status:</span>
                  <select
                    value={indentStatusFilter}
                    onChange={(e) => setIndentStatusFilter(e.target.value)}
                    className="bg-transparent font-semibold text-slate-800 focus:outline-hidden"
                  >
                    <option value="all">All Indent Records</option>
                    <option value="issued">Currently Issued (On Loan)</option>
                    <option value="returned">Returned &amp; Checked</option>
                    <option value="damaged">Reported Damaged</option>
                  </select>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search indent no, trainee, tool..."
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48 sm:w-60 focus:outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Indent Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-3 font-semibold text-center w-12">S.No.</th>
                    <th className="py-2.5 px-3 font-semibold">Indent Voucher No</th>
                    <th className="py-2.5 px-3 font-semibold">Trainee Name &amp; Roll No</th>
                    <th className="py-2.5 px-3 font-semibold">Issued Equipment / Tool</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Qty</th>
                    <th className="py-2.5 px-3 font-semibold">Issue Date</th>
                    <th className="py-2.5 px-3 font-semibold">Due Return Date</th>
                    <th className="py-2.5 px-3 font-semibold">Actual Return Date</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Return Condition</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Practical Experiment Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIndents.map((ind, idx) => (
                    <tr key={ind.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{ind.indentNo}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{ind.traineeName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{ind.rollNo}</div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{ind.itemName}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                        {ind.quantity}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{ind.issueDate}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{ind.expectedReturnDate}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {ind.actualReturnDate || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ind.status === 'returned'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : ind.status === 'damaged'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {ind.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[11px] font-medium text-slate-700">
                          {ind.returnCondition || (ind.status === 'issued' ? 'Under Shift Use' : 'Good')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[11px] text-slate-600 truncate max-w-xs">
                        {ind.remarks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- REGISTER 7: TRAINEE ROSTER / ADMISSION REGISTER ---------------- */}
        {activeRegister === 'trainee_roster' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>FORM I: Master Trainee Admission Roster &amp; Record Register</span>
                  <span className="text-xs font-normal text-slate-500">(प्रशिक्षु मास्टर प्रवेश पंजी)</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Official batch nominal roll: DGT registration, social category, demographic records, and active training standing.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-500 font-medium">Category:</span>
                  <select
                    value={rosterCategoryFilter}
                    onChange={(e) => setRosterCategoryFilter(e.target.value)}
                    className="bg-transparent font-semibold text-slate-800 focus:outline-hidden"
                  >
                    <option value="all">All Social Categories</option>
                    <option value="GEN">General</option>
                    <option value="OBC">OBC</option>
                    <option value="SC">SC</option>
                    <option value="ST">ST</option>
                    <option value="EWS">EWS</option>
                  </select>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, roll no, father..."
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48 sm:w-60 focus:outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Roster Demographics Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px]">Enrolled Batch Size</span>
                <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                  {trainees.length} / {currentTrade?.totalIntake || 40}
                </div>
                <span className="text-[10px] text-slate-400">Sanctioned Seats</span>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-800 text-[11px]">OBC Trainees</span>
                <div className="text-lg font-bold text-blue-700 font-mono mt-0.5">
                  {trainees.filter((t) => t.category === 'OBC').length}
                </div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-emerald-800 text-[11px]">ST / SC Trainees</span>
                <div className="text-lg font-bold text-emerald-700 font-mono mt-0.5">
                  {trainees.filter((t) => t.category === 'ST' || t.category === 'SC').length}
                </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-amber-800 text-[11px]">Gen / EWS Trainees</span>
                <div className="text-lg font-bold text-amber-700 font-mono mt-0.5">
                  {trainees.filter((t) => t.category === 'GEN' || t.category === 'EWS').length}
                </div>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <span className="text-indigo-800 text-[11px]">Trade Unit</span>
                <div className="text-lg font-bold text-indigo-700 font-mono mt-0.5">
                  Unit 1 &amp; 2
                </div>
                <span className="text-[10px] text-indigo-600">Shift 1 (7 AM - 1:30 PM)</span>
              </div>
            </div>

            {/* Roster Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-3 font-semibold text-center w-12">S.No.</th>
                    <th className="py-2.5 px-3 font-semibold">Roll No &amp; DGT Reg No</th>
                    <th className="py-2.5 px-3 font-semibold">Trainee Full Name</th>
                    <th className="py-2.5 px-3 font-semibold">Father's Name</th>
                    <th className="py-2.5 px-3 font-semibold text-center">DOB &amp; Gender</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Mobile &amp; Email Contact</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Admission Date</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Current Attendance</th>
                    <th className="py-2.5 px-3 font-semibold text-right">NCVT Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoster.map((tr, idx) => {
                    const stat = traineeStatsMap.get(tr.id);
                    return (
                      <tr key={tr.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-bold text-slate-900">{tr.rollNo}</div>
                          <div className="font-mono text-[10px] text-slate-500">{tr.registrationNo}</div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{tr.name}</td>
                        <td className="py-2.5 px-3 text-slate-700">{tr.fatherName || '—'}</td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="font-mono text-slate-800">{tr.dob}</div>
                          <div className="text-[10px] text-slate-500">{tr.gender}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-mono text-[10px] font-semibold">
                            {tr.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-slate-800">{tr.mobile}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{tr.email}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                          {tr.admissionDate}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">
                          <span className={stat?.isBelow ? 'text-rose-700' : 'text-emerald-700'}>
                            {stat?.percent ?? 100}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {stat?.isBelow ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              DEFICIT
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              ELIGIBLE
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- FORMAL GOVERNMENT PRINT PREVIEW MODAL ---------------- */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-5xl w-full p-8 text-slate-900 space-y-6 my-8 print:p-0 print:m-0 print:border-none print:shadow-none">
            {/* Print Dialog Action Header */}
            <div className="flex items-center justify-between border-b border-slate-300 pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-700" />
                <h3 className="font-bold text-base text-slate-900">
                  Official Register Print Preview &amp; PDF Generation
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Document / Save as PDF</span>
                </button>
                <button
                  onClick={() => setPrintModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>

            {/* Printable Area with Official Govt ITI Raigarh Letterhead */}
            <div className="space-y-6 border border-slate-400 p-6 rounded-lg bg-white">
              {/* Header */}
              <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
                <div className="flex items-center justify-center gap-3">
                  <img
                    src="/assets/aistudio/iti-logo_b32addc6.png"
                    alt="Emblem"
                    className="w-14 h-14 object-contain"
                  />
                  <div>
                    <h2 className="text-sm font-bold text-amber-900">
                      शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़ (छ.ग.)
                    </h2>
                    <h1 className="text-lg font-black tracking-wide text-slate-900 uppercase">
                      GOVERNMENT INDUSTRIAL TRAINING INSTITUTE, RAIGARH (C.G.)
                    </h1>
                    <p className="text-[11px] font-medium text-slate-700">
                      Directorate of Employment &amp; Training, Chhattisgarh · NCVT Code: ITI-RAI-CG-04
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded font-bold uppercase text-xs tracking-wider text-slate-900 font-mono">
                    {activeRegister === 'daily_attendance' && `FORM IV: DAILY ATTENDANCE MUSTER ROLL (${dailyDate})`}
                    {activeRegister === 'monthly_attendance' && `FORM V: MONTHLY ATTENDANCE REGISTER MATRIX (${selectedMonth})`}
                    {activeRegister === 'leave_register' && 'FORM VII: TRAINEE LEAVE SANCTION & RECORD REGISTER'}
                    {activeRegister === 'workshop_inventory' && 'FORM VIII: WORKSHOP INVENTORY & CONSUMABLE STOCK REGISTER'}
                    {activeRegister === 'tools_equipments' && 'FORM IX: DGT TOOLS, MACHINERY & EQUIPMENT REGISTER'}
                    {activeRegister === 'indent_register' && 'FORM X: WORKSHOP TOOL INDENT & ISSUE-RETURN REGISTER'}
                    {activeRegister === 'trainee_roster' && 'FORM I: MASTER TRAINEE ADMISSION ROSTER'}
                  </div>
                </div>

                <div className="grid grid-cols-3 text-xs text-slate-700 pt-2 font-mono">
                  <div className="text-left">
                    <span className="font-semibold">Trade:</span> {currentTrade?.name} ({currentTrade?.code})
                  </div>
                  <div className="text-center">
                    <span className="font-semibold">Session:</span> {activeSessionObj?.name}
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">Date of Report:</span> {new Date().toLocaleDateString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Printable Table Content Preview */}
              <div className="text-xs">
                {activeRegister === 'daily_attendance' && (
                  <table className="w-full border-collapse border border-slate-400 text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-400">
                        <th className="p-1.5 border border-slate-400 text-center w-10">S.No</th>
                        <th className="p-1.5 border border-slate-400">Roll No</th>
                        <th className="p-1.5 border border-slate-400">Trainee Name</th>
                        <th className="p-1.5 border border-slate-400 text-center">Category</th>
                        <th className="p-1.5 border border-slate-400 text-center">Status</th>
                        <th className="p-1.5 border border-slate-400">Marked Time</th>
                        <th className="p-1.5 border border-slate-400">GPS Verification</th>
                        <th className="p-1.5 border border-slate-400 text-right">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyAttendanceData.map((d, i) => (
                        <tr key={d.trainee.id}>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{i + 1}</td>
                          <td className="p-1.5 border border-slate-400 font-mono font-semibold">{d.trainee.rollNo}</td>
                          <td className="p-1.5 border border-slate-400">{d.trainee.name}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{d.trainee.category}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-bold font-mono">{d.status}</td>
                          <td className="p-1.5 border border-slate-400 font-mono">{d.record?.timestamp || '—'}</td>
                          <td className="p-1.5 border border-slate-400">{d.record?.geotag ? 'GPS Verified' : 'Manual'}</td>
                          <td className="p-1.5 border border-slate-400 text-right text-[10px]">{d.record?.remarks || 'NCVT Compliant'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeRegister === 'monthly_attendance' && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-400 text-left text-[10px]">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-400">
                          <th className="p-1 border border-slate-400 text-center">#</th>
                          <th className="p-1 border border-slate-400">Roll No</th>
                          <th className="p-1 border border-slate-400">Name</th>
                          {monthDaysInfo.days.map((d) => (
                            <th key={d.dayNumber} className="p-0.5 border border-slate-400 text-center font-mono">
                              {d.dayNumber}
                            </th>
                          ))}
                          <th className="p-1 border border-slate-400 text-center">P</th>
                          <th className="p-1 border border-slate-400 text-center">L</th>
                          <th className="p-1 border border-slate-400 text-center">A</th>
                          <th className="p-1 border border-slate-400 text-center">%</th>
                          <th className="p-1 border border-slate-400 text-center">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyMatrixData.map((m, i) => (
                          <tr key={m.trainee.id}>
                            <td className="p-1 border border-slate-400 text-center font-mono">{i + 1}</td>
                            <td className="p-1 border border-slate-400 font-mono">{m.trainee.rollNo}</td>
                            <td className="p-1 border border-slate-400 font-semibold truncate max-w-[110px]">{m.trainee.name}</td>
                            {monthDaysInfo.days.map((d) => (
                              <td key={d.dayNumber} className="p-0.5 border border-slate-400 text-center font-mono">
                                {m.dailyStatuses[d.dayNumber] || '-'}
                              </td>
                            ))}
                            <td className="p-1 border border-slate-400 text-center font-bold">{m.presentCount}</td>
                            <td className="p-1 border border-slate-400 text-center">{m.leaveCount}</td>
                            <td className="p-1 border border-slate-400 text-center font-bold">{m.absentCount}</td>
                            <td className="p-1 border border-slate-400 text-center font-bold">{m.monthPct}%</td>
                            <td className="p-1 border border-slate-400 text-center">{m.isDeficit ? 'DEFICIT' : 'ELIGIBLE'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeRegister === 'leave_register' && (
                  <table className="w-full border-collapse border border-slate-400 text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-400">
                        <th className="p-1.5 border border-slate-400 text-center w-10">S.No</th>
                        <th className="p-1.5 border border-slate-400">Roll No</th>
                        <th className="p-1.5 border border-slate-400">Trainee Name</th>
                        <th className="p-1.5 border border-slate-400">Type</th>
                        <th className="p-1.5 border border-slate-400">Period</th>
                        <th className="p-1.5 border border-slate-400 text-center">Days</th>
                        <th className="p-1.5 border border-slate-400">Reason</th>
                        <th className="p-1.5 border border-slate-400 text-center">Status</th>
                        <th className="p-1.5 border border-slate-400">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeaves.map((l, i) => (
                        <tr key={l.id}>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{i + 1}</td>
                          <td className="p-1.5 border border-slate-400 font-mono">{l.rollNo}</td>
                          <td className="p-1.5 border border-slate-400 font-semibold">{l.traineeName}</td>
                          <td className="p-1.5 border border-slate-400">{l.leaveType}</td>
                          <td className="p-1.5 border border-slate-400 font-mono text-[11px]">{l.fromDate} to {l.toDate}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-bold">{l.days}</td>
                          <td className="p-1.5 border border-slate-400">{l.reason}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-bold">{l.status.toUpperCase()}</td>
                          <td className="p-1.5 border border-slate-400 text-[11px]">{l.reviewerRemarks || 'Sanctioned'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeRegister === 'workshop_inventory' && (
                  <table className="w-full border-collapse border border-slate-400 text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-400">
                        <th className="p-1.5 border border-slate-400 text-center w-10">S.No</th>
                        <th className="p-1.5 border border-slate-400">Code</th>
                        <th className="p-1.5 border border-slate-400">Item Name &amp; Specification</th>
                        <th className="p-1.5 border border-slate-400">Category</th>
                        <th className="p-1.5 border border-slate-400 text-center">Total</th>
                        <th className="p-1.5 border border-slate-400 text-center">Issued</th>
                        <th className="p-1.5 border border-slate-400 text-center">Damaged</th>
                        <th className="p-1.5 border border-slate-400 text-center">Available</th>
                        <th className="p-1.5 border border-slate-400">Rack Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((item, i) => (
                        <tr key={item.id}>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{i + 1}</td>
                          <td className="p-1.5 border border-slate-400 font-mono font-bold">{item.toolCode}</td>
                          <td className="p-1.5 border border-slate-400 font-semibold">{item.name} ({item.specification})</td>
                          <td className="p-1.5 border border-slate-400">{item.category}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{item.totalStock}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{item.issuedCount}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{item.damagedCount}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-mono font-bold">{item.availableStock}</td>
                          <td className="p-1.5 border border-slate-400">{item.binLocation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeRegister === 'tools_equipments' && (
                  <table className="w-full border-collapse border border-slate-400 text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-400">
                        <th className="p-1.5 border border-slate-400 text-center w-10">S.No</th>
                        <th className="p-1.5 border border-slate-400">Tool Code</th>
                        <th className="p-1.5 border border-slate-400">Equipment Description</th>
                        <th className="p-1.5 border border-slate-400">Category</th>
                        <th className="p-1.5 border border-slate-400 text-center">Stock Qty</th>
                        <th className="p-1.5 border border-slate-400 text-center">Operational Condition</th>
                        <th className="p-1.5 border border-slate-400">Custodian</th>
                        <th className="p-1.5 border border-slate-400 text-right">Inspection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredToolsAndEquipments.map((t, i) => (
                        <tr key={t.id}>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{i + 1}</td>
                          <td className="p-1.5 border border-slate-400 font-mono font-bold">{t.toolCode}</td>
                          <td className="p-1.5 border border-slate-400 font-semibold">{t.name}</td>
                          <td className="p-1.5 border border-slate-400">{t.category}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{t.totalStock}</td>
                          <td className="p-1.5 border border-slate-400 text-center">{t.condition}</td>
                          <td className="p-1.5 border border-slate-400">{t.custodian}</td>
                          <td className="p-1.5 border border-slate-400 text-right font-mono">{t.lastInspected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeRegister === 'indent_register' && (
                  <table className="w-full border-collapse border border-slate-400 text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-400">
                        <th className="p-1.5 border border-slate-400 text-center w-10">S.No</th>
                        <th className="p-1.5 border border-slate-400">Indent No</th>
                        <th className="p-1.5 border border-slate-400">Roll No &amp; Trainee</th>
                        <th className="p-1.5 border border-slate-400">Tool / Item</th>
                        <th className="p-1.5 border border-slate-400 text-center">Qty</th>
                        <th className="p-1.5 border border-slate-400">Issue Date</th>
                        <th className="p-1.5 border border-slate-400">Due Date</th>
                        <th className="p-1.5 border border-slate-400 text-center">Status</th>
                        <th className="p-1.5 border border-slate-400">Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIndents.map((ind, i) => (
                        <tr key={ind.id}>
                          <td className="p-1.5 border border-slate-400 text-center font-mono">{i + 1}</td>
                          <td className="p-1.5 border border-slate-400 font-mono font-bold">{ind.indentNo}</td>
                          <td className="p-1.5 border border-slate-400">{ind.traineeName} ({ind.rollNo})</td>
                          <td className="p-1.5 border border-slate-400 font-semibold">{ind.itemName}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-mono font-bold">{ind.quantity}</td>
                          <td className="p-1.5 border border-slate-400 font-mono">{ind.issueDate}</td>
                          <td className="p-1.5 border border-slate-400 font-mono">{ind.expectedReturnDate}</td>
                          <td className="p-1.5 border border-slate-400 text-center font-bold">{ind.status.toUpperCase()}</td>
                          <td className="p-1.5 border border-slate-400">{ind.returnCondition || 'Good'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeRegister === 'trainee_roster' && (
                  <table className="w-full border-collapse border border-slate-400 text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-400">
                        <th className="p-1.5 border border-slate-400 text-center w-10">S.No</th>
                        <th className="p-1.5 border border-slate-400">Roll No</th>
                        <th className="p-1.5 border border-slate-400">Registration No</th>
                        <th className="p-1.5 border border-slate-400">Trainee Name</th>
                        <th className="p-1.5 border border-slate-400">Father Name</th>
                        <th className="p-1.5 border border-slate-400 text-center">Cat</th>
                        <th className="p-1.5 border border-slate-400">Mobile</th>
                        <th className="p-1.5 border border-slate-400 text-center">Adm Date</th>
                        <th className="p-1.5 border border-slate-400 text-center">Att %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRoster.map((tr, i) => {
                        const stat = traineeStatsMap.get(tr.id);
                        return (
                          <tr key={tr.id}>
                            <td className="p-1.5 border border-slate-400 text-center font-mono">{i + 1}</td>
                            <td className="p-1.5 border border-slate-400 font-mono font-bold">{tr.rollNo}</td>
                            <td className="p-1.5 border border-slate-400 font-mono text-[10px]">{tr.registrationNo}</td>
                            <td className="p-1.5 border border-slate-400 font-semibold">{tr.name}</td>
                            <td className="p-1.5 border border-slate-400">{tr.fatherName || '—'}</td>
                            <td className="p-1.5 border border-slate-400 text-center font-mono">{tr.category}</td>
                            <td className="p-1.5 border border-slate-400 font-mono">{tr.mobile}</td>
                            <td className="p-1.5 border border-slate-400 text-center font-mono">{tr.admissionDate}</td>
                            <td className="p-1.5 border border-slate-400 text-center font-mono font-bold">
                              {stat?.percent ?? 100}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Official 3-Tier Signatory Block for ITI Raigarh */}
              <div className="grid grid-cols-3 pt-12 pb-4 text-center text-xs font-serif border-t border-slate-300">
                <div className="space-y-1">
                  <div className="h-10 border-b border-dashed border-slate-400 w-48 mx-auto" />
                  <div className="font-bold text-slate-900">{officer.name}</div>
                  <div className="text-[11px] text-slate-600">हस्ताक्षर प्रशिक्षण अधिकारी / Training Officer</div>
                  <div className="text-[10px] text-slate-400 font-sans">Govt. ITI Raigarh (C.G.)</div>
                </div>

                <div className="space-y-1">
                  <div className="h-10 border-b border-dashed border-slate-400 w-48 mx-auto" />
                  <div className="font-bold text-slate-900">कार्यशाला अधीक्षक / Group Instructor</div>
                  <div className="text-[11px] text-slate-600">Workshop Superintendent</div>
                  <div className="text-[10px] text-slate-400 font-sans">Govt. ITI Raigarh (C.G.)</div>
                </div>

                <div className="space-y-1">
                  <div className="h-10 border-b border-dashed border-slate-400 w-48 mx-auto" />
                  <div className="font-bold text-slate-900">प्राचार्य / Principal</div>
                  <div className="text-[11px] text-slate-600">Seal &amp; Signature of Head of Institute</div>
                  <div className="text-[10px] text-slate-400 font-sans">Govt. ITI Raigarh (C.G.)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
