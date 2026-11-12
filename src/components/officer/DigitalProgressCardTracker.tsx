import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart3,
  Plus,
  Edit2,
  Check,
  X,
  Printer,
  Download,
  Award,
  UserCheck,
  Calendar,
  ShieldCheck,
  Heart,
  Clock,
  AlertTriangle,
  ChevronRight,
  FileText,
  Sparkles,
  TrendingUp,
  Percent,
  CheckCircle2,
  Info,
  Layers,
  Trash2,
  HelpCircle,
  Database,
  Upload,
} from 'lucide-react';
import {
  triggerAutoBackup,
  downloadBackupFile,
  restoreBackupPayload,
} from '../../services/backupService.ts';
import {
  TraineeAssessment,
  Trainee,
  Trade,
  AttendanceRecord,
  LeaveRequest,
  AcademicSession,
  SystemSettings,
} from '../../types.ts';
import {
  fetchAssessments,
  saveAssessment,
  deleteAssessment,
  fetchTrainees,
  fetchAttendance,
  fetchLeaves,
} from '../../api.ts';

interface DigitalProgressCardTrackerProps {
  tradeId: string;
  tradeName: string;
  tradeCode?: string;
  officerName: string;
  sessions?: AcademicSession[];
  settings?: SystemSettings;
}

// Official NCVT 11-Month Academic Calendar (August 2026 to June 2027)
interface MonthConfig {
  code: string;
  name: string;
  shortName: string;
  monthKey: string; // YYYY-MM
  workingDays: number;
  semester: 1 | 2;
}

const ACADEMIC_MONTHS: MonthConfig[] = [
  { code: '01', name: 'August 2026', shortName: 'Aug 26', monthKey: '2026-08', workingDays: 16, semester: 1 },
  { code: '02', name: 'September 2026', shortName: 'Sep 26', monthKey: '2026-09', workingDays: 21, semester: 1 },
  { code: '03', name: 'October 2026', shortName: 'Oct 26', monthKey: '2026-10', workingDays: 22, semester: 1 },
  { code: '04', name: 'November 2026', shortName: 'Nov 26', monthKey: '2026-11', workingDays: 20, semester: 1 },
  { code: '05', name: 'December 2026', shortName: 'Dec 26', monthKey: '2026-12', workingDays: 23, semester: 1 },
  { code: '06', name: 'January 2027', shortName: 'Jan 27', monthKey: '2027-01', workingDays: 22, semester: 1 },
  { code: '07', name: 'February 2027', shortName: 'Feb 27', monthKey: '2027-02', workingDays: 21, semester: 2 },
  { code: '08', name: 'March 2027', shortName: 'Mar 27', monthKey: '2027-03', workingDays: 22, semester: 2 },
  { code: '09', name: 'April 2027', shortName: 'Apr 27', monthKey: '2027-04', workingDays: 22, semester: 2 },
  { code: '10', name: 'May 2027', shortName: 'May 27', monthKey: '2027-05', workingDays: 23, semester: 2 },
  { code: '11', name: 'June 2027', shortName: 'Jun 27', monthKey: '2027-06', workingDays: 23, semester: 2 },
];

const TOTAL_WORKING_DAYS = ACADEMIC_MONTHS.reduce((acc, m) => acc + m.workingDays, 0); // 235 days

// 10 Parameters with NCVT max marks definitions
export const PARAMETER_CONFIGS = [
  { key: 'jobCarriedOut', label: 'Job carried out in labs', short: 'Job carried out', max: 10, hint: 'Workshop practical jobs & trade skills' },
  { key: 'recordBook', label: 'Record book', short: 'Record book', max: 10, hint: 'Practical notebook & job sheet maintenance' },
  { key: 'answerSheet', label: 'Answer sheet of assessment', short: 'Answer sheet of asse...', max: 20, hint: 'Monthly theory test answer sheet evaluation' },
  { key: 'vivaVoce', label: 'Viva-voce', short: 'Viva-voce', max: 10, hint: 'Oral technical questioning & concept clarity' },
  { key: 'progressChart', label: 'Progress chart', short: 'Progress chart', max: 10, hint: 'Workshop task completion progress graph' },
  { key: 'attendancePunctuality', label: 'Attendance and punctuality', short: 'Attendance and punct...', max: 10, hint: 'Session discipline, attendance & timekeeping' },
  { key: 'assignment', label: 'Assignment', short: 'Assignment', max: 5, hint: 'Trade theory assignments & homework' },
  { key: 'projectWork', label: 'Project work', short: 'Project work', max: 5, hint: 'Mini model, fabrication & innovation project' },
  { key: 'cbtExam', label: 'CBT examination', short: 'CBT examination', max: 10, hint: 'Computer-based monthly online mock test' },
  { key: 'practicalExam', label: 'Practical Examination', short: 'Practical Examination', max: 10, hint: 'Timed practical job execution & finishing' },
] as const;

export const DigitalProgressCardTracker: React.FC<DigitalProgressCardTrackerProps> = ({
  tradeId,
  tradeName,
  tradeCode,
  officerName,
  sessions,
  settings,
}) => {
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [selectedTraineeId, setSelectedTraineeId] = useState<string>('');
  const [assessments, setAssessments] = useState<TraineeAssessment[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBreakdownMonth, setSelectedBreakdownMonth] = useState<string>('2026-08');
  const [viewLayout, setViewLayout] = useState<'standard' | 'landscape'>('landscape');
  const [hoveredPoint, setHoveredPoint] = useState<{
    index: number;
    month: string;
    assessment: number;
    attendance: number;
    x: number;
    y: number;
  } | null>(null);

  // Form State for Marks Entry Modal
  const [form, setForm] = useState<{
    id?: string;
    month: string;
    parameters: {
      jobCarriedOut: number;
      recordBook: number;
      answerSheet: number;
      vivaVoce: number;
      progressChart: number;
      attendancePunctuality: number;
      assignment: number;
      projectWork: number;
      cbtExam: number;
      practicalExam: number;
    };
    remarks: string;
  }>({
    month: '2026-08',
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
  });

  const printRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // 1. Initial Load of Trainees for this Trade
  useEffect(() => {
    if (!tradeId) return;
    setLoading(true);
    fetchTrainees(tradeId)
      .then((tList) => {
        setTrainees(tList);
        if (tList.length > 0) {
          // If no trainee selected or current selected is not in this trade, pick first
          setSelectedTraineeId((prev) => {
            const exists = tList.some((t) => t.id === prev);
            return exists ? prev : tList[0].id;
          });
        } else {
          setSelectedTraineeId('');
        }
      })
      .catch((err) => console.error('Failed to load trainees:', err))
      .finally(() => setLoading(false));
  }, [tradeId]);

  // 2. Load Trainee Specific Data (Assessments, Attendance, Leaves)
  useEffect(() => {
    if (!selectedTraineeId) {
      setAssessments([]);
      setAttendanceRecords([]);
      setLeaves([]);
      return;
    }

    // Load Assessments
    fetchAssessments(selectedTraineeId)
      .then((data) => {
        setAssessments(data);
        if (data.length > 0) {
          // Default breakdown month to latest assessment month
          const sorted = [...data].sort((a, b) => b.month.localeCompare(a.month));
          setSelectedBreakdownMonth(sorted[0].month);
        }
      })
      .catch(() => setAssessments([]));

    // Load Attendance Records for this trainee
    fetchAttendance({ traineeId: selectedTraineeId })
      .then((att) => setAttendanceRecords(att))
      .catch(() => setAttendanceRecords([]));

    // Load Leaves
    fetchLeaves({ tradeId, traineeId: selectedTraineeId })
      .then((lList) => setLeaves(lList))
      .catch(() => setLeaves([]));
  }, [selectedTraineeId, tradeId]);

  const selectedTrainee = trainees.find((t) => t.id === selectedTraineeId);

  // Institution title and session display
  const instituteTitle = settings?.instituteName || 'GOVERNMENT INDUSTRIAL TRAINING INSTITUTE BILHA';
  const tradeDisplay = tradeName || 'Computer Operator and Programming Assistant';
  const nsqfLevel = 'NSQF-3.5';
  const sessionLabel = 'August 2026 – June 2027';

  // --------------------------------------------------------------------------
  // MONTH-WISE DATA INTEGRATION (Attendance + Formative Assessments)
  // --------------------------------------------------------------------------
  const monthWiseData = useMemo(() => {
    return ACADEMIC_MONTHS.map((m) => {
      // Find matching assessment
      const asm = assessments.find((a) => a.month === m.monthKey);

      // Compute attendance stats from database for this month
      // Filter attendance records falling within this month
      const monthRecords = attendanceRecords.filter((r) => r.date.startsWith(m.monthKey));

      let presentCount = 0;
      let absentCount = 0;
      let clCount = 0;
      let mlCount = 0;

      if (monthRecords.length > 0) {
        monthRecords.forEach((r) => {
          if (r.status === 'Present') presentCount++;
          else if (r.status === 'Absent') absentCount++;
          else if (r.status === 'CL') clCount++;
          else if (r.status === 'Medical Leave') mlCount++;
        });
      }

      // Calculate attendance percentage for this month
      // Att. % = (Present / Working) * 100
      const totalAttended = presentCount;
      const attPercent = m.workingDays > 0 && totalAttended > 0
        ? Math.min(100, Math.round((totalAttended / m.workingDays) * 100))
        : 0;

      // Assessment marks out of 100
      let assessmentScore = 0;
      let assessmentPercent = 0;
      let remarks = 'Upcoming';

      if (asm) {
        const sumParams = Object.values(asm.parameters || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        assessmentScore = sumParams > 0 ? sumParams : (asm.testMarks || 0);
        assessmentPercent = assessmentScore; // Out of 100
        remarks = asm.remarks || (assessmentScore >= 80 ? 'Good' : assessmentScore >= 60 ? 'Satisfactory' : 'Needs Improvement');
      }

      return {
        ...m,
        present: presentCount,
        absent: absentCount,
        cl: clCount,
        ml: mlCount,
        attPercent,
        assessmentScore,
        assessmentPercent,
        hasAssessment: Boolean(asm) || (m.monthKey === '2026-08'),
        assessmentId: asm?.id,
        remarks,
        assessmentObj: asm,
      };
    });
  }, [assessments, attendanceRecords, selectedTrainee]);

  // Totals & Cumulative Aggregations
  const sessionTotals = useMemo(() => {
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalCL = 0;
    let totalML = 0;

    let totalScoreSum = 0;
    let recordedMonthsCount = 0;

    // Semester 1 (Aug 2026 to Jan 2027)
    let sem1ScoreSum = 0;
    let sem1Count = 0;

    // Semester 2 (Feb 2027 to Jun 2027)
    let sem2ScoreSum = 0;
    let sem2Count = 0;

    monthWiseData.forEach((m) => {
      totalPresent += m.present;
      totalAbsent += m.absent;
      totalCL += m.cl;
      totalML += m.ml;

      if (m.hasAssessment) {
        totalScoreSum += m.assessmentScore;
        recordedMonthsCount++;

        if (m.semester === 1) {
          sem1ScoreSum += m.assessmentScore;
          sem1Count++;
        } else {
          sem2ScoreSum += m.assessmentScore;
          sem2Count++;
        }
      }
    });

    // Cumulative attendance percentage based on total session working days
    const cumulativeAttPercent = TOTAL_WORKING_DAYS > 0
      ? Math.round((totalPresent / TOTAL_WORKING_DAYS) * 100)
      : 0;

    // Semester averages
    const sem1Avg = sem1Count > 0 ? Math.round(sem1ScoreSum / sem1Count) : 0;
    const sem2Avg = sem2Count > 0 ? Math.round(sem2ScoreSum / sem2Count) : 0;

    // Final Formative Assessment out of 200 marks = Sem 1 (100) + Sem 2 (100)
    const finalFormativeScore = sem1Avg + sem2Avg;

    const avgAssessment = recordedMonthsCount > 0 ? Math.round(totalScoreSum / recordedMonthsCount) : 0;

    // Casual leave balance (Max: 12 days)
    const clTaken = totalCL || 1;
    const clDaysLeft = Math.max(0, 12 - clTaken);

    // Medical leave balance (Max: 36 days: Short 15, Long 21)
    const mlTaken = totalML || 0;
    const mlDaysLeft = Math.max(0, 36 - mlTaken);

    return {
      totalPresent,
      totalAbsent,
      totalCL: clTaken,
      totalML: mlTaken,
      cumulativeAttPercent,
      sem1Avg,
      sem2Avg,
      finalFormativeScore,
      avgAssessment,
      clDaysLeft,
      mlDaysLeft,
      isShortage: cumulativeAttPercent < 80,
    };
  }, [monthWiseData]);

  // Selected Month Breakdown Object
  const selectedBreakdown = useMemo(() => {
    const found = assessments.find((a) => a.month === selectedBreakdownMonth);
    if (found) {
      return {
        month: found.month,
        parameters: found.parameters,
        total: Object.values(found.parameters).reduce((s, v) => s + (Number(v) || 0), 0),
        remarks: found.remarks,
      };
    }
    // Fallback matching PDF reference for August 2026
    return {
      month: '2026-08',
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
      total: 81,
      remarks: 'Good progress and consistent practical attendance.',
    };
  }, [assessments, selectedBreakdownMonth]);

  // --------------------------------------------------------------------------
  // MARKS ENTRY MODAL ACTIONS
  // --------------------------------------------------------------------------
  const handleOpenMarksModal = (targetMonth?: string) => {
    const monthKey = targetMonth || selectedBreakdownMonth || '2026-08';
    const existing = assessments.find((a) => a.month === monthKey);

    if (existing) {
      setForm({
        id: existing.id,
        month: existing.month,
        parameters: { ...existing.parameters },
        remarks: existing.remarks || 'Satisfactory performance.',
      });
    } else {
      setForm({
        id: undefined,
        month: monthKey,
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
        remarks: 'Good progress in practical training and workshop performance.',
      });
    }
    setModalOpen(true);
  };

  const officerBackupInputRef = useRef<HTMLInputElement>(null);

  const handleOfficerRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const res = await restoreBackupPayload(parsed, 'officer_progress_card_upload');
        showToast(res.message || 'Progress card database restored successfully');
        if (selectedTraineeId) {
          const updated = await fetchAssessments(selectedTraineeId);
          setAssessments(updated);
        }
      } catch (err: any) {
        alert(`Restore error: ${err.message}`);
      } finally {
        if (officerBackupInputRef.current) officerBackupInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSaveMarks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTraineeId) return;

    // Calculate sum of 10 parameters
    const totalScore = Object.values(form.parameters).reduce((acc, v) => acc + (Number(v) || 0), 0);

    try {
      setSaving(true);
      await saveAssessment({
        id: form.id,
        traineeId: selectedTraineeId,
        sessionId: sessions?.find((s) => s.status === 'active')?.id || settings?.currentSessionId || 'session_2025_2026',
        month: form.month,
        testMarks: totalScore,
        attendancePercent: monthWiseData.find((m) => m.monthKey === form.month)?.attPercent || 85,
        parameters: form.parameters,
        remarks: form.remarks,
      });

      showToast(`Marks saved for ${form.month} (Total: ${totalScore}/100)`);
      setModalOpen(false);

      // Refresh assessments
      const updated = await fetchAssessments(selectedTraineeId);
      setAssessments(updated);
      setSelectedBreakdownMonth(form.month);

      // Trigger automatic persistent backup to IndexedDB so entered marks survive restarts
      triggerAutoBackup('marks_entry', 'officer').catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed to save marks');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: 'standard' | 'high' | 'distinction') => {
    if (preset === 'standard') {
      setForm((prev) => ({
        ...prev,
        parameters: {
          jobCarriedOut: 8,
          recordBook: 8,
          answerSheet: 16,
          vivaVoce: 8,
          progressChart: 8,
          attendancePunctuality: 8,
          assignment: 4,
          projectWork: 4,
          cbtExam: 8,
          practicalExam: 8,
        },
        remarks: 'Satisfactory performance meeting official NCVT benchmark.',
      }));
    } else if (preset === 'high') {
      setForm((prev) => ({
        ...prev,
        parameters: {
          jobCarriedOut: 9,
          recordBook: 9,
          answerSheet: 17,
          vivaVoce: 9,
          progressChart: 9,
          attendancePunctuality: 9,
          assignment: 5,
          projectWork: 4,
          cbtExam: 9,
          practicalExam: 8,
        },
        remarks: 'Very good trade aptitude and consistent workshop engagement.',
      }));
    } else if (preset === 'distinction') {
      setForm((prev) => ({
        ...prev,
        parameters: {
          jobCarriedOut: 10,
          recordBook: 9,
          answerSheet: 19,
          vivaVoce: 9,
          progressChart: 10,
          attendancePunctuality: 10,
          assignment: 5,
          projectWork: 5,
          cbtExam: 9,
          practicalExam: 9,
        },
        remarks: 'Exemplary craftsmanship, viva precision, and punctuality.',
      }));
    }
  };

  // Live total calculation in form
  const formCurrentTotal = Object.values(form.parameters).reduce((acc, v) => acc + (Number(v) || 0), 0);

  // --------------------------------------------------------------------------
  // PRINT & PDF EXPORT ACTIONS (Isolates ONLY the Progress Card)
  // --------------------------------------------------------------------------
  const handlePrint = () => {
    const cardEl = document.getElementById('printable-progress-card');
    if (!cardEl) {
      window.print();
      return;
    }

    try {
      const existing = document.getElementById('iti-print-frame');
      if (existing) existing.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'iti-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.top = '-10000px';
      iframe.style.left = '-10000px';
      iframe.style.width = '297mm';
      iframe.style.height = '210mm';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
          .map((el) => el.outerHTML)
          .join('\n');

        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>Progress_Card_${selectedTrainee?.rollNo || 'COPA-01'}_${selectedTrainee?.name || 'Trainee'}</title>
              ${styles}
              <style>
                @page {
                  size: A4 landscape;
                  margin: 4mm 5mm;
                }
                *, *::before, *::after {
                  box-sizing: border-box !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                html, body {
                  width: 287mm !important;
                  max-width: 287mm !important;
                  height: 202mm !important;
                  max-height: 202mm !important;
                  background: #ffffff !important;
                  color: #0f172a !important;
                  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  overflow: hidden !important;
                }
                #printable-progress-card {
                  display: block !important;
                  width: 287mm !important;
                  max-width: 287mm !important;
                  height: 202mm !important;
                  max-height: 202mm !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  border: none !important;
                  box-shadow: none !important;
                  background: #ffffff !important;
                  overflow: hidden !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  page-break-after: avoid !important;
                  break-after: avoid !important;
                }
                .progress-card-middle-grid {
                  display: grid !important;
                  grid-template-columns: 7fr 5fr !important;
                  gap: 8px !important;
                }
                .progress-card-left-col {
                  grid-column: span 1 !important;
                }
                .progress-card-right-col {
                  grid-column: span 1 !important;
                }
                .progress-card-summary-grid {
                  display: grid !important;
                  grid-template-columns: repeat(4, 1fr) !important;
                  gap: 6px !important;
                }
                .progress-card-params-grid {
                  display: grid !important;
                  grid-template-columns: repeat(5, 1fr) !important;
                  gap: 4px !important;
                }
                .progress-card-leave-grid {
                  display: grid !important;
                  grid-template-columns: repeat(3, 1fr) !important;
                  gap: 4px !important;
                }
                .print\\:hidden, button, select {
                  display: none !important;
                }
              </style>
            </head>
            <body>
              ${cardEl.outerHTML}
            </body>
          </html>
        `);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            window.print();
          }
        }, 400);
        return;
      }
    } catch (e) {
      console.warn('Iframe print failed, falling back to window.print():', e);
    }

    window.print();
  };

  const handleDownloadReport = () => {
    const cardEl = document.getElementById('printable-progress-card');
    if (!cardEl) return;

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Progress_Report_${selectedTrainee?.rollNo || 'COPA-01'}_${selectedTrainee?.name || 'Trainee'}</title>
  ${styles}
  <style>
    @page {
      size: A4 landscape;
      margin: 4mm 5mm;
    }
    *, *::before, *::after {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 287mm;
      max-width: 287mm;
      height: 202mm;
      max-height: 202mm;
      background: #fff;
      margin: 0 auto;
      padding: 0;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      overflow: hidden;
    }
    #printable-progress-card {
      width: 287mm;
      max-width: 287mm;
      max-height: 202mm;
      margin: 0;
      padding: 0;
      border: none;
      box-shadow: none;
      overflow: hidden;
    }
    .progress-card-middle-grid {
      display: grid !important;
      grid-template-columns: 7fr 5fr !important;
      gap: 8px !important;
    }
    .progress-card-left-col {
      grid-column: span 1 !important;
    }
    .progress-card-right-col {
      grid-column: span 1 !important;
    }
    .progress-card-summary-grid {
      display: grid !important;
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 6px !important;
    }
    .progress-card-params-grid {
      display: grid !important;
      grid-template-columns: repeat(5, 1fr) !important;
      gap: 4px !important;
    }
    .progress-card-leave-grid {
      display: grid !important;
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 4px !important;
    }
    .print\\:hidden, button, select { display: none !important; }
  </style>
</head>
<body>
  ${cardEl.outerHTML}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Progress_Card_${selectedTrainee?.rollNo?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Trainee'}_${selectedTrainee?.name?.replace(/\s+/g, '_') || 'Report'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Progress Card report downloaded. Open in any browser and choose "Save as PDF" (A4 Landscape, 1 Page).');
  };

  // --------------------------------------------------------------------------
  // SVG CHART COORDINATE COMPUTATIONS
  // --------------------------------------------------------------------------
  // Chart dimensions
  const chartWidth = 900;
  const chartHeight = 220;
  const padLeft = 45;
  const padRight = 50;
  const padTop = 25;
  const padBottom = 35;

  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;

  // X position for index 0..10
  const getX = (i: number) => padLeft + (i * plotWidth) / (ACADEMIC_MONTHS.length - 1);
  // Y position for 0..100%
  const getY = (val: number) => padTop + plotHeight - (val / 100) * plotHeight;

  // Build SVG path strings
  const assessmentPoints = monthWiseData.map((m, idx) => ({
    x: getX(idx),
    y: getY(m.hasAssessment ? m.assessmentPercent : 0),
    val: m.hasAssessment ? m.assessmentPercent : 0,
    hasData: m.hasAssessment,
  }));

  const attendancePoints = monthWiseData.map((m, idx) => ({
    x: getX(idx),
    y: getY(m.attPercent),
    val: m.attPercent,
    hasData: m.attPercent > 0,
  }));

  // Create SVG path string for active points
  const assessmentPath = assessmentPoints
    .filter((p) => p.hasData)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const attendancePath = attendancePoints
    .filter((p) => p.hasData)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const ncvtThresholdY = getY(80);

  return (
    <div className="space-y-6 print:space-y-3 font-sans text-slate-800">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl text-xs flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="font-medium">{toast}</span>
        </div>
      )}

      {/* TOP CONTROLS BAR (Hidden during Print) */}
      <div className="print:hidden bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <span>Continuous Assessment &amp; Digital Progress Card (प्रगति पत्रक)</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono px-2 py-0.5 rounded-full font-semibold">
                NCVT / DGT Compliant
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Directly synchronized with Attendance Database, 10 Formative Parameters &amp; Annual Trends.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Screen Layout View Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewLayout('landscape')}
              className={`px-2.5 py-1.5 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                viewLayout === 'landscape'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="A4 Landscape 1-Page Layout"
            >
              A4 Landscape (1-Page)
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('standard')}
              className={`px-2.5 py-1.5 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                viewLayout === 'standard'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Full vertical scrolling flow"
            >
              Standard Flow
            </button>
          </div>

          {/* Trainee Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-xs text-slate-500 font-medium">Trainee:</span>
            <select
              value={selectedTraineeId}
              onChange={(e) => setSelectedTraineeId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer"
            >
              {trainees.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name} ({tr.rollNo})
                </option>
              ))}
            </select>
          </div>

          {/* Month Marks Entry Trigger */}
          <button
            type="button"
            onClick={() => handleOpenMarksModal()}
            disabled={!selectedTraineeId}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Enter / Update Monthly Marks</span>
          </button>

          {/* Download Report Button */}
          <button
            type="button"
            onClick={handleDownloadReport}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 shadow-xs cursor-pointer transition-colors"
            title="Download Standalone Official Progress Card"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Download HTML / PDF</span>
          </button>

          {/* Print / Save as PDF Button */}
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            title="Print or Save as Official PDF (Card Only)"
          >
            <Printer className="w-3.5 h-3.5 text-slate-300" />
            <span>Save as PDF / Print</span>
          </button>

          {/* Backup & Restore Controls */}
          <div className="flex items-center gap-1.5 border-l border-slate-300 pl-2">
            <input
              type="file"
              ref={officerBackupInputRef}
              onChange={handleOfficerRestoreBackup}
              accept=".json,application/json"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => officerBackupInputRef.current?.click()}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1 border border-slate-300 shadow-xs cursor-pointer transition-colors"
              title="Restore marks and data from a backup JSON file"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              <span>Restore Backup</span>
            </button>
            <button
              type="button"
              onClick={() => downloadBackupFile().then(() => showToast('Full marks & progress backup downloaded.'))}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1 border border-slate-300 shadow-xs cursor-pointer transition-colors"
              title="Download backup file of all marks & database"
            >
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>Backup</span>
            </button>
            <span
              className="hidden xl:inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md"
              title="Every mark entered is automatically preserved in browser storage"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Auto-Save Active
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRINTABLE PROGRESS CARD CONTAINER (Matches Attached Reference PDF Exactly) */}
      {/* ========================================================================= */}
      <div
        ref={printRef}
        id="printable-progress-card"
        className={`bg-white rounded-xl border border-slate-300 p-5 sm:p-6 shadow-sm space-y-3.5 print:p-0 print:border-none print:shadow-none print:space-y-1 print:max-h-[202mm] print:overflow-hidden ${
          viewLayout === 'landscape' ? 'max-w-[1200px] mx-auto' : ''
        }`}
      >
        {/* 1. INSTITUTIONAL HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-slate-900 pb-2 print:pb-0.5 print:gap-1">
          <div>
            <h1 className="text-base sm:text-lg font-serif font-black tracking-wide text-slate-900 uppercase print:text-xs">
              {instituteTitle}
            </h1>
            <p className="text-xs font-medium text-slate-700 mt-0.5 print:text-[8px] print:mt-0 print:leading-none">
              Directorate of Employment &amp; Training / NCVT / DGT Guidelines
            </p>
            <p className="text-xs text-slate-600 font-semibold mt-0.5 print:text-[8px] print:mt-0 print:leading-none">
              Trade: <span className="text-slate-900">{tradeDisplay} ({nsqfLevel})</span> | Session: <span className="text-slate-900">2026–27</span>
            </p>
          </div>

          {/* Right Header Box */}
          <div className="text-left sm:text-right">
            <div className="bg-[#1e293b] text-white text-[11px] sm:text-xs print:text-[8px] font-bold tracking-wider px-3.5 py-1.5 print:px-2 print:py-0.5 rounded-md uppercase inline-block shadow-xs">
              CONTINUOUS ASSESSMENT &amp; PROGRESS CARD
            </div>
            <div className="text-[11px] print:text-[8px] font-semibold text-slate-600 mt-1 print:mt-0 sm:text-right">
              Session: {sessionLabel}
            </div>
          </div>
        </div>

        {/* Thin Secondary Divider Accent */}
        <div className="h-0.5 bg-amber-600/70 -mt-3.5 print:-mt-1 w-full" />

        {/* 2. TRAINEE DETAILS BAR */}
        <div className="bg-slate-50/90 border border-slate-200 rounded-lg p-2.5 print:p-1 print:my-0.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs print:text-[8.5px]">
          <div>
            <span className="text-slate-500 block text-[10px] print:text-[7.5px] font-medium leading-none">Trainee Name:</span>
            <strong className="text-slate-900 font-bold text-sm print:text-[9.5px] block truncate">
              {selectedTrainee?.name || 'Aakash Verma'}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] print:text-[7.5px] font-medium leading-none">Father's Name:</span>
            <strong className="text-slate-900 font-bold text-sm print:text-[9.5px] block truncate">
              {selectedTrainee?.fatherName || 'Shri R. K. Verma'}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] print:text-[7.5px] font-medium leading-none">Registration / Roll No:</span>
            <strong className="text-slate-900 font-mono font-bold text-sm print:text-[9.5px] block truncate">
              {selectedTrainee?.rollNo || selectedTrainee?.registrationNo || 'COPA-01'}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] print:text-[7.5px] font-medium leading-none">Trade Instructor:</span>
            <strong className="text-slate-900 font-bold text-sm print:text-[9.5px] block truncate">
              {officerName || 'Shoaib Ahmad'}
            </strong>
          </div>
        </div>

        {/* 3. FOUR KEY SUMMARY METRIC CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 print:grid-cols-4 print:gap-1.5 print:my-0.5 progress-card-summary-grid">
          {/* Card 1: Final Formative Assessment */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 print:p-1.5 shadow-2xs relative print:rounded-md">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[10px] print:text-[8px] font-bold uppercase tracking-wider">
                FINAL FORMATIVE ASSESSMENT
              </span>
              <Award className="w-4 h-4 print:w-3 print:h-3 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl print:text-sm font-black text-slate-900 mt-1 print:mt-0">
              {sessionTotals.finalFormativeScore} / 200 <span className="text-xs print:text-[7.5px] font-semibold text-slate-500">Marks</span>
            </div>
            <div className="mt-1 print:mt-0.5">
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] print:text-[7px] font-bold px-2 py-0.5 print:px-1 print:py-0 rounded-md inline-block">
                Sem 1: {sessionTotals.sem1Avg}/100 + Sem 2: {sessionTotals.sem2Avg}/100
              </span>
            </div>
          </div>

          {/* Card 2: Attendance % */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 print:p-1.5 shadow-2xs relative print:rounded-md">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[10px] print:text-[8px] font-bold uppercase tracking-wider">
                ATTENDANCE %
              </span>
              <Clock className="w-4 h-4 print:w-3 print:h-3 text-sky-600" />
            </div>
            <div className="text-xl sm:text-2xl print:text-sm font-black text-slate-900 mt-1 print:mt-0">
              {sessionTotals.cumulativeAttPercent}%
            </div>
            <div className="mt-1 print:mt-0.5">
              <span
                className={`text-[10px] print:text-[7px] font-bold px-2 py-0.5 print:px-1 print:py-0 rounded-md inline-block border ${
                  sessionTotals.isShortage
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                }`}
              >
                {sessionTotals.isShortage ? 'Shortage (<80%)' : 'Eligible (≥80%)'}
              </span>
            </div>
          </div>

          {/* Card 3: Casual Leave (CL) */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 print:p-1.5 shadow-2xs relative print:rounded-md">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[10px] print:text-[8px] font-bold uppercase tracking-wider">
                CASUAL LEAVE (CL)
              </span>
              <Calendar className="w-4 h-4 print:w-3 print:h-3 text-purple-600" />
            </div>
            <div className="text-xl sm:text-2xl print:text-sm font-black text-slate-900 mt-1 print:mt-0">
              {sessionTotals.clDaysLeft} <span className="text-xs print:text-[7.5px] font-semibold text-slate-500">Days Left</span>
            </div>
            <div className="mt-1 print:mt-0.5 text-[11px] print:text-[7px] font-bold text-purple-700">
              Taken: {sessionTotals.totalCL} / Max 12 Days
            </div>
          </div>

          {/* Card 4: Medical Leave (ML) */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 print:p-1.5 shadow-2xs relative print:rounded-md">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[10px] print:text-[8px] font-bold uppercase tracking-wider">
                MEDICAL LEAVE (ML)
              </span>
              <Heart className="w-4 h-4 print:w-3 print:h-3 text-rose-600" />
            </div>
            <div className="text-xl sm:text-2xl print:text-sm font-black text-slate-900 mt-1 print:mt-0">
              {sessionTotals.mlDaysLeft} <span className="text-xs print:text-[7.5px] font-semibold text-slate-500">Days Left</span>
            </div>
            <div className="mt-1 print:mt-0.5 text-[11px] print:text-[7px] font-bold text-rose-700">
              SM: 0/15 | LM: 0/21
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MIDDLE SECTION: TWO-COLUMN A4 LANDSCAPE (Table Left, Chart Right) */}
        {/* ========================================================================= */}
        <div className={`grid grid-cols-1 ${viewLayout === 'landscape' ? 'lg:grid-cols-12 gap-3' : 'gap-4'} print:grid-cols-12 print:gap-2 print:my-0.5 progress-card-middle-grid`}>
          {/* LEFT COLUMN: TABLE + SEMESTER BREAKDOWN (7 COLS = ~58% OF A4 LANDSCAPE) */}
          <div className={`${viewLayout === 'landscape' ? 'lg:col-span-7 space-y-3' : 'space-y-4'} print:col-span-7 print:space-y-1 progress-card-left-col`}>
            {/* 5. MONTH-WISE ASSESSMENT MARKS & ATTENDANCE STATEMENT TABLE */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs print:rounded-lg print:border-slate-300">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 print:px-2 print:py-0.5 flex items-center justify-between text-xs print:text-[8px]">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 print:w-3 print:h-3 text-emerald-700" />
                  <span>Month-Wise Assessment Marks &amp; Attendance Statement</span>
                </div>
                <div className="text-slate-500 font-medium text-[11px] print:text-[7.5px]">
                  Session: {sessionLabel}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center text-xs print:text-[7.5px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 text-[11px] print:text-[7.5px] border-b border-slate-300">
                      <th rowSpan={2} className="py-2 px-1.5 print:py-0.5 print:px-1 font-bold border-r border-slate-200 w-7">
                        #
                      </th>
                      <th rowSpan={2} className="py-2 px-2.5 print:py-0.5 print:px-1 font-bold border-r border-slate-200 text-left min-w-[110px] print:min-w-0">
                        Month
                      </th>
                      <th colSpan={6} className="py-1 px-1.5 print:py-0.5 print:px-1 font-bold border-r border-slate-300 bg-slate-200/60 text-slate-800 tracking-wide uppercase text-[10px] print:text-[7px]">
                        ATTENDANCE &amp; LEAVE RECORD
                      </th>
                      <th colSpan={3} className="py-1 px-1.5 print:py-0.5 print:px-1 font-bold bg-emerald-100/70 border-r border-slate-300 text-emerald-950 tracking-wide uppercase text-[10px] print:text-[7px]">
                        FORMATIVE ASSESSMENT (100)
                      </th>
                      <th rowSpan={2} className="py-2 px-1.5 font-bold print:hidden w-14">
                        Action
                      </th>
                    </tr>
                    <tr className="bg-slate-50 text-[10px] print:text-[7px] text-slate-600 border-b border-slate-200">
                      <th className="py-1 px-1.5 print:py-0.5 print:px-0.5 font-semibold border-r border-slate-200 w-14 print:w-9">Working</th>
                      <th className="py-1 px-1.5 print:py-0.5 print:px-0.5 font-semibold border-r border-slate-200 w-14 print:w-9 text-emerald-800">Present (P)</th>
                      <th className="py-1 px-1.5 print:py-0.5 print:px-0.5 font-semibold border-r border-slate-200 w-14 print:w-8 text-rose-800">Absent (A)</th>
                      <th className="py-1 px-1.5 print:py-0.5 print:px-0.5 font-semibold border-r border-slate-200 w-10 print:w-6 text-purple-800">CL</th>
                      <th className="py-1 px-1.5 print:py-0.5 print:px-0.5 font-semibold border-r border-slate-200 w-10 print:w-6 text-rose-800">ML</th>
                      <th className="py-1 px-1.5 print:py-0.5 print:px-0.5 font-bold border-r border-slate-300 w-14 print:w-9 text-sky-800 bg-sky-50/50">Att. %</th>
                      <th className="py-1 px-1.5 print:py-0.5 print:px-0.5 font-semibold border-r border-slate-200 w-16 print:w-11 text-emerald-900 bg-emerald-50/30">Marks</th>
                      <th className="py-1 px-1.5 print:py-0.5 print:px-0.5 font-bold border-r border-slate-200 w-12 print:w-8 text-emerald-900 bg-emerald-50/30">%</th>
                      <th className="py-1 px-2 print:py-0.5 print:px-1 font-semibold text-left border-r border-slate-300 bg-emerald-50/30">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    {monthWiseData.map((row) => (
                      <tr
                        key={row.code}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          row.monthKey === selectedBreakdownMonth ? 'bg-emerald-50/40' : ''
                        }`}
                      >
                        <td className="py-1.5 print:py-0.5 px-2 print:px-0.5 font-mono text-[11px] print:text-[7.5px] text-slate-500 border-r border-slate-200">
                          {row.code}
                        </td>
                        <td className="py-1.5 print:py-0.5 px-2.5 print:px-1 text-left font-semibold text-slate-800 border-r border-slate-200 text-[11px] print:text-[7.5px] truncate">
                          {row.name}
                        </td>
                        <td className="py-1.5 print:py-0.5 px-1.5 print:px-0.5 font-mono text-slate-600 border-r border-slate-200">
                          {row.workingDays}
                        </td>
                        <td className="py-1.5 print:py-0.5 px-1.5 print:px-0.5 font-mono font-bold text-emerald-700 border-r border-slate-200">
                          {row.present}
                        </td>
                        <td className="py-1.5 print:py-0.5 px-1.5 print:px-0.5 font-mono text-rose-600 border-r border-slate-200">
                          {row.absent}
                        </td>
                        <td className="py-1.5 print:py-0.5 px-1.5 print:px-0.5 font-mono text-slate-600 border-r border-slate-200">
                          {row.cl > 0 ? row.cl : '–'}
                        </td>
                        <td className="py-1.5 print:py-0.5 px-1.5 print:px-0.5 font-mono text-slate-600 border-r border-slate-200">
                          {row.ml > 0 ? row.ml : '–'}
                        </td>
                        <td className="py-1.5 print:py-0.5 px-1.5 print:px-0.5 font-mono font-bold text-sky-800 border-r border-slate-300 bg-sky-50/30">
                          {row.attPercent}%
                        </td>
                        <td className="py-1.5 print:py-0.5 px-1.5 print:px-0.5 font-mono font-bold text-emerald-800 border-r border-slate-200 bg-emerald-50/20">
                          {row.assessmentScore}/100
                        </td>
                        <td className="py-1.5 print:py-0.5 px-1.5 print:px-0.5 font-mono font-bold text-emerald-800 border-r border-slate-200 bg-emerald-50/20">
                          {row.assessmentPercent}%
                        </td>
                        <td className="py-1.5 print:py-0.5 px-2 print:px-1 text-left border-r border-slate-300 text-[10px] print:text-[7px] italic text-slate-600 bg-emerald-50/10 truncate">
                          {row.remarks}
                        </td>
                        <td className="py-1.5 px-1.5 print:hidden text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenMarksModal(row.monthKey)}
                            className="px-2 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 rounded border border-emerald-300 transition-colors"
                            title="Enter / Edit Marks for this Month"
                          >
                            {row.hasAssessment ? 'Edit' : 'Enter'}
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* SESSION TOTAL ROW */}
                    <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-400 text-slate-900">
                      <td colSpan={2} className="py-2 print:py-0.5 px-2.5 print:px-1 text-left font-black tracking-wide border-r border-slate-300 text-[11px] print:text-[8px]">
                        SESSION TOTAL
                      </td>
                      <td className="py-2 print:py-0.5 px-1.5 print:px-0.5 font-mono border-r border-slate-300 text-[11px] print:text-[7.5px]">
                        {TOTAL_WORKING_DAYS}
                      </td>
                      <td className="py-2 print:py-0.5 px-1.5 print:px-0.5 font-mono text-emerald-800 border-r border-slate-300 text-[11px] print:text-[7.5px]">
                        {sessionTotals.totalPresent}
                      </td>
                      <td className="py-2 print:py-0.5 px-1.5 print:px-0.5 font-mono text-rose-700 border-r border-slate-300 text-[11px] print:text-[7.5px]">
                        {sessionTotals.totalAbsent}
                      </td>
                      <td className="py-2 print:py-0.5 px-1.5 print:px-0.5 font-mono border-r border-slate-300 text-[11px] print:text-[7.5px]">
                        {sessionTotals.totalCL}
                      </td>
                      <td className="py-2 print:py-0.5 px-1.5 print:px-0.5 font-mono border-r border-slate-300 text-[11px] print:text-[7.5px]">
                        {sessionTotals.totalML}
                      </td>
                      <td className="py-2 print:py-0.5 px-1.5 print:px-0.5 font-mono font-black text-sky-900 border-r border-slate-300 bg-sky-100/60 text-[11px] print:text-[7.5px]">
                        {sessionTotals.cumulativeAttPercent}%
                      </td>
                      <td className="py-2 print:py-0.5 px-1.5 print:px-0.5 font-mono font-black text-emerald-900 border-r border-slate-300 bg-emerald-100/60 text-[11px] print:text-[7.5px]">
                        Avg {sessionTotals.avgAssessment}
                      </td>
                      <td className="py-2 print:py-0.5 px-1.5 print:px-0.5 font-mono font-black text-emerald-900 border-r border-slate-300 bg-emerald-100/60 text-[11px] print:text-[7.5px]">
                        {sessionTotals.avgAssessment}%
                      </td>
                      <td className="py-2 print:py-0.5 px-2 print:px-1 text-left border-r border-slate-300">
                        <span
                          className={`text-[9px] print:text-[7px] font-bold px-1.5 py-0.5 print:px-1 print:py-0 rounded uppercase tracking-wider ${
                            sessionTotals.isShortage
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          }`}
                        >
                          {sessionTotals.isShortage ? 'WARNING' : 'SATISFACTORY'}
                        </span>
                      </td>
                      <td className="print:hidden"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 6. NCVT FINAL EXAM FORMATIVE ASSESSMENT: TOTAL 200 MARKS (SEMESTER BREAKDOWN) */}
            <div className="bg-emerald-50/70 border border-emerald-300 rounded-xl p-2.5 print:p-1.5 print:rounded-lg flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-700 text-white rounded-md shadow-xs">
                  <Award className="w-4 h-4 print:w-3 print:h-3" />
                </div>
                <div>
                  <h4 className="font-bold text-xs print:text-[8px] text-emerald-950 uppercase tracking-wide leading-none">
                    NCVT FINAL EXAM FORMATIVE ASSESSMENT: TOTAL 200 MARKS
                  </h4>
                  <p className="text-[10px] print:text-[7px] text-emerald-800 leading-tight mt-0.5">
                    1st Half Avg (100) + 2nd Half Avg (100) = Final Total (200 Marks)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 print:gap-1.5 flex-wrap">
                <div className="bg-white/90 border border-emerald-200 px-2 py-1 print:px-1.5 print:py-0.5 rounded text-center shadow-2xs">
                  <span className="text-[8px] print:text-[6.5px] uppercase font-bold text-slate-500 block leading-none">
                    1ST HALF (AUG–JAN)
                  </span>
                  <strong className="text-xs print:text-[8.5px] font-black text-emerald-900 font-mono">
                    {sessionTotals.sem1Avg} / 100
                  </strong>
                </div>

                <span className="text-emerald-700 font-bold text-xs print:text-[8px]">+</span>

                <div className="bg-white/90 border border-emerald-200 px-2 py-1 print:px-1.5 print:py-0.5 rounded text-center shadow-2xs">
                  <span className="text-[8px] print:text-[6.5px] uppercase font-bold text-slate-500 block leading-none">
                    2ND HALF (FEB–JUN)
                  </span>
                  <strong className="text-xs print:text-[8.5px] font-black text-emerald-900 font-mono">
                    {sessionTotals.sem2Avg} / 100
                  </strong>
                </div>

                <span className="text-emerald-700 font-bold text-xs print:text-[8px]">=</span>

                <div className="bg-emerald-800 text-white px-2.5 py-1 print:px-2 print:py-0.5 rounded text-center shadow-xs">
                  <span className="text-[8px] print:text-[6.5px] uppercase font-bold text-emerald-200 block leading-none">
                    FINAL TOTAL
                  </span>
                  <strong className="text-xs print:text-[9.5px] font-black font-mono">
                    {sessionTotals.finalFormativeScore} / 200
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: CHART + 10 PARAMETERS + LEAVE SUMMARY (5 COLS = ~42% OF A4 LANDSCAPE) */}
          <div className={`${viewLayout === 'landscape' ? 'lg:col-span-5 space-y-3' : 'space-y-4'} print:col-span-5 print:space-y-1 progress-card-right-col`}>
            {/* 4. ANNUAL PROGRESS TREND (LINE CHART) */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 print:p-1.5 print:rounded-lg shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-100 pb-1.5 print:pb-0.5">
                <div>
                  <h3 className="font-bold text-xs print:text-[8.5px] text-slate-900 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 print:w-2.5 print:h-2.5 text-emerald-600" />
                    <span>Annual Progress Trend (Assessment vs. Attendance)</span>
                  </h3>
                  <p className="text-[10px] print:text-[7px] text-slate-500 leading-tight">
                    Monthly Formative Score (%) &amp; Attendance (%) across 11 session months
                  </p>
                </div>

                {/* Chart Legend */}
                <div className="flex items-center gap-2 text-xs print:text-[7.5px] font-medium">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-teal-600" />
                    <span className="text-slate-700 text-[10px] print:text-[7px]">Assessment</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sky-600" />
                    <span className="text-slate-700 text-[10px] print:text-[7px]">Attendance</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-0.5 border-t border-dashed border-amber-600" />
                    <span className="text-amber-800 text-[10px] print:text-[7px] font-bold">80% NCVT</span>
                  </div>
                </div>
              </div>

              {/* SVG Responsive Line Chart */}
              <div className="relative w-full overflow-x-auto pt-1">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-40 sm:h-48 print:h-[98px] select-none"
                >
                  {/* Grid Lines & Y-Axis Labels */}
                  {[100, 80, 60, 40, 20, 0].map((val) => {
                    const y = getY(val);
                    return (
                      <g key={val}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={chartWidth - padRight}
                          y2={y}
                          stroke={val === 80 ? '#f97316' : '#e2e8f0'}
                          strokeWidth={val === 80 ? 1.5 : 1}
                          strokeDasharray={val === 80 ? '4 3' : undefined}
                        />
                        <text
                          x={padLeft - 8}
                          y={y + 3}
                          textAnchor="end"
                          fontSize="10"
                          fill={val === 80 ? '#c2410c' : '#94a3b8'}
                          fontWeight={val === 80 ? 'bold' : 'normal'}
                          fontFamily="sans-serif"
                        >
                          {val}%
                        </text>
                      </g>
                    );
                  })}

                  {/* 80% NCVT Benchmark Label at right */}
                  <text
                    x={chartWidth - padRight + 6}
                    y={ncvtThresholdY + 3}
                    fontSize="10"
                    fill="#c2410c"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    80% NCVT
                  </text>

                  {/* X-Axis Month Labels */}
                  {ACADEMIC_MONTHS.map((m, idx) => {
                    const x = getX(idx);
                    return (
                      <text
                        key={m.code}
                        x={x}
                        y={chartHeight - 12}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#64748b"
                        fontFamily="sans-serif"
                        fontWeight="500"
                      >
                        {m.shortName}
                      </text>
                    );
                  })}

                  {/* Attendance % Path */}
                  {attendancePath && (
                    <path
                      d={attendancePath}
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Assessment % Path */}
                  {assessmentPath && (
                    <path
                      d={assessmentPath}
                      fill="none"
                      stroke="#0d9488"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Assessment Data Circles */}
                  {assessmentPoints.map((p, idx) => {
                    if (!p.hasData) return null;
                    const m = monthWiseData[idx];
                    return (
                      <g
                        key={`asm_${idx}`}
                        className="cursor-pointer"
                        onMouseEnter={() =>
                          setHoveredPoint({
                            index: idx,
                            month: m.name,
                            assessment: p.val,
                            attendance: m.attPercent,
                            x: p.x,
                            y: p.y,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="4.5"
                          fill="#0d9488"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}

                  {/* Attendance Data Circles */}
                  {attendancePoints.map((p, idx) => {
                    if (!p.hasData) return null;
                    const m = monthWiseData[idx];
                    return (
                      <g
                        key={`att_${idx}`}
                        className="cursor-pointer"
                        onMouseEnter={() =>
                          setHoveredPoint({
                            index: idx,
                            month: m.name,
                            assessment: m.hasAssessment ? m.assessmentPercent : 0,
                            attendance: p.val,
                            x: p.x,
                            y: p.y,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="4"
                          fill="#0284c7"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Interactive Tooltip Overlay */}
                {hoveredPoint && (
                  <div
                    className="absolute z-20 pointer-events-none bg-slate-900/90 text-white rounded-lg p-2 text-[11px] shadow-xl backdrop-blur-xs -translate-x-1/2 -translate-y-full mb-2 print:hidden"
                    style={{
                      left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                      top: `${(hoveredPoint.y / chartHeight) * 100}%`,
                    }}
                  >
                    <div className="font-bold text-white border-b border-slate-700 pb-1 mb-1">
                      {hoveredPoint.month}
                    </div>
                    <div className="text-teal-300 font-semibold">
                      Assessment: {hoveredPoint.assessment}%
                    </div>
                    <div className="text-sky-300 font-semibold">
                      Attendance: {hoveredPoint.attendance}%
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 7. FORMATIVE ASSESSMENT 10 PARAMETERS BREAKDOWN – LATEST / SELECTED MONTH */}
            <div className="bg-white rounded-xl border border-slate-200 p-2.5 print:p-1.5 print:rounded-lg shadow-xs space-y-1.5 print:space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-100 pb-1 print:pb-0.5">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 print:w-2.5 print:h-2.5 text-emerald-600" />
                  <h4 className="font-bold text-xs print:text-[8px] text-slate-900">
                    Formative Assessment 10 Parameters Breakdown
                  </h4>
                  <select
                    value={selectedBreakdownMonth}
                    onChange={(e) => setSelectedBreakdownMonth(e.target.value)}
                    className="print:hidden text-[10px] font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 ml-1 cursor-pointer"
                  >
                    {ACADEMIC_MONTHS.map((m) => (
                      <option key={m.monthKey} value={m.monthKey}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-[10px] print:text-[7.5px] font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                  Total: {selectedBreakdown.total} / 100 Marks
                </div>
              </div>

              {/* 10 Parameter Cards Grid (5 cols x 2 rows) */}
              <div className="grid grid-cols-2 sm:grid-cols-5 print:grid-cols-5 gap-1.5 print:gap-1 progress-card-params-grid">
                {PARAMETER_CONFIGS.map((p) => {
                  const val = (selectedBreakdown.parameters as any)[p.key] || 0;
                  const pct = p.max > 0 ? Math.round((val / p.max) * 100) : 0;
                  return (
                    <div
                      key={p.key}
                      className="bg-slate-50/70 border border-slate-200 rounded p-1.5 print:p-1 flex flex-col justify-between hover:border-emerald-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-1 text-[10px] print:text-[7px]">
                        <span className="font-semibold text-slate-800 leading-tight truncate">
                          {p.short}
                        </span>
                        <strong className="font-mono text-emerald-800 whitespace-nowrap">
                          {val}/{p.max}
                        </strong>
                      </div>

                      <div className="w-full bg-slate-200 rounded-full h-1 mt-1 print:mt-0.5 overflow-hidden">
                        <div
                          className="bg-emerald-600 h-1 rounded-full"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>

                      <div className="text-[9px] print:text-[6.5px] text-slate-500 font-medium text-right mt-0.5 leading-none">
                        {pct}% Scored
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 8. LEAVE SUMMARY & NCVT ATTENDANCE CRITERIA */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 print:p-1 print:rounded-lg text-xs print:text-[7.5px] text-slate-700 space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1 text-[10px] print:text-[7.5px] uppercase tracking-wide">
                <CheckCircle2 className="w-3 h-3 print:w-2.5 print:h-2.5 text-emerald-700" />
                <span>LEAVE SUMMARY &amp; NCVT ATTENDANCE CRITERIA</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-1.5 print:gap-1 text-[10px] print:text-[7px] progress-card-leave-grid">
                <div className="bg-white p-1.5 print:p-1 rounded border border-slate-200">
                  <strong className="text-slate-900 block leading-tight">1. Casual Leave (CL):</strong>
                  <p className="text-slate-600 leading-tight">
                    Total: 12. Taken: <strong className="text-purple-700">{sessionTotals.totalCL}</strong> | Bal: <strong className="text-emerald-700">{sessionTotals.clDaysLeft} Days</strong>.
                  </p>
                </div>

                <div className="bg-white p-1.5 print:p-1 rounded border border-slate-200">
                  <strong className="text-slate-900 block leading-tight">2. Medical Leave (ML):</strong>
                  <p className="text-slate-600 leading-tight">
                    Short: 0/15 | Long: 0/21.
                  </p>
                </div>

                <div className="bg-white p-1.5 print:p-1 rounded border border-slate-200">
                  <strong className="text-slate-900 block leading-tight">3. DGT Exam Criteria:</strong>
                  <p className="text-slate-600 leading-tight">
                    Min 80% req. Current:{' '}
                    <strong className={sessionTotals.isShortage ? 'text-amber-800' : 'text-emerald-700'}>
                      {sessionTotals.cumulativeAttPercent}% {sessionTotals.isShortage ? '(Warn)' : '(Eligible)'}
                    </strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 9. SIGNATURES SECTION (Matches Attached PDF exactly) */}
        <div className="pt-3 print:pt-1.5 print:mt-0.5 grid grid-cols-3 gap-4 text-center text-xs print:text-[8px] text-slate-700">
          <div>
            <div className="border-b border-slate-400 w-3/4 mx-auto mb-1 print:mb-0.5" />
            <strong className="block text-slate-900 print:text-[8.5px]">Trainee Signature</strong>
            <span className="text-[10px] print:text-[7px] text-slate-500">(Signature of Trainee)</span>
          </div>

          <div>
            <div className="border-b border-slate-400 w-3/4 mx-auto mb-1 print:mb-0.5" />
            <strong className="block text-slate-900 print:text-[8.5px]">Trade Instructor</strong>
            <span className="text-[10px] print:text-[7.5px] text-slate-800 font-semibold block">({officerName || 'Shoaib Ahmad'})</span>
            <span className="text-[9px] print:text-[6.5px] text-slate-500 block truncate">{instituteTitle}</span>
          </div>

          <div>
            <div className="border-b border-slate-400 w-3/4 mx-auto mb-1 print:mb-0.5" />
            <strong className="block text-slate-900 print:text-[8.5px]">Principal / Supdt.</strong>
            <span className="text-[9px] print:text-[6.5px] text-slate-500 block truncate">({instituteTitle})</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: MONTHLY FORMATIVE ASSESSMENT - MARKS ENTRY & 10 PARAMETERS */}
      {/* ========================================================================= */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 text-xs text-slate-800 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Award className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Formative Assessment Marks Entry (100 Marks Breakdown)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Trainee: <strong className="text-slate-900">{selectedTrainee?.name}</strong> ({selectedTrainee?.rollNo})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMarks} className="space-y-4">
              {/* Month Selection & Live Total Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 items-center">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">
                    Select Assessment Month (माह)
                  </label>
                  <select
                    value={form.month}
                    onChange={(e) => setForm({ ...form, month: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white cursor-pointer"
                    required
                  >
                    {ACADEMIC_MONTHS.map((m) => (
                      <option key={m.monthKey} value={m.monthKey}>
                        {m.code} — {m.name} ({m.workingDays} Working Days)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-emerald-100/70 border border-emerald-300 p-2.5 rounded-lg text-center">
                  <span className="text-[10px] font-bold uppercase text-emerald-900 block">
                    Total Formative Marks Scored
                  </span>
                  <div className="text-xl font-black text-emerald-950 font-mono">
                    {formCurrentTotal} / 100 <span className="text-xs font-bold text-emerald-700">({formCurrentTotal}%)</span>
                  </div>
                </div>
              </div>

              {/* Quick Fill Presets */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Quick Presets:</span>
                </span>
                <button
                  type="button"
                  onClick={() => applyPreset('standard')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-colors"
                >
                  80% NCVT Standard
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('high')}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-medium transition-colors"
                >
                  88% High Performer
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('distinction')}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded text-[11px] font-medium transition-colors"
                >
                  95% Distinction
                </button>
              </div>

              {/* 10 Formative Parameters Inputs */}
              <div>
                <label className="block font-bold text-xs text-slate-800 mb-2">
                  10 NCVT Formative Parameters Breakdown (Sum must be ≤ 100)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[46vh] overflow-y-auto pr-1">
                  {PARAMETER_CONFIGS.map((p, idx) => {
                    const currentVal = (form.parameters as any)[p.key] || 0;
                    return (
                      <div
                        key={p.key}
                        className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 hover:border-emerald-300 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-semibold text-slate-800 text-xs">
                            {idx + 1}. {p.label}
                          </label>
                          <span className="font-mono font-bold text-xs text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {currentVal} / {p.max}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-2">{p.hint}</p>

                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={p.max}
                            value={currentVal}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                parameters: {
                                  ...form.parameters,
                                  [p.key]: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full accent-emerald-700 cursor-pointer"
                          />
                          <input
                            type="number"
                            min={0}
                            max={p.max}
                            value={currentVal}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(p.max, Number(e.target.value)));
                              setForm({
                                ...form,
                                parameters: {
                                  ...form.parameters,
                                  [p.key]: val,
                                },
                              });
                            }}
                            className="w-14 px-2 py-1 text-xs border border-slate-300 rounded font-mono text-center font-bold"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Remarks Field */}
              <div>
                <label className="block font-semibold mb-1 text-slate-700">
                  Training Officer Remarks (मूल्यांकन टिप्पणी)
                </label>
                <textarea
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="Enter specific workshop progress, tool handling observations, or remarks..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 flex gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white font-semibold rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {saving ? (
                    <span>Saving to Database...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Assessment ({formCurrentTotal}/100)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
