import React, { useState, useEffect } from 'react';
import {
  Users,
  CalendarCheck2,
  FileCheck2,
  BarChart3,
  AlertTriangle,
  Wrench,
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Search,
  Filter,
  Download,
  Printer,
  Compass,
  Clock,
  Send,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  Trade,
  Trainee,
  AttendanceRecord,
  LeaveRequest,
  WarningNotice,
  InventoryItem,
  IndentRecord,
  AttendanceStatus,
  SystemSettings,
  AcademicSession,
} from '../../types.ts';
import {
  fetchTrainees,
  createTrainee,
  updateTrainee,
  deleteTrainee,
  fetchAttendance,
  batchSaveAttendance,
  triggerAutoAbsent,
  fetchLeaves,
  reviewLeave,
  fetchWarnings,
  issueWarning,
  fetchInventory,
  saveInventoryItem,
  deleteInventoryItem,
  fetchIndents,
  issueIndent,
  returnIndent,
} from '../../api.ts';

interface OfficerDashboardProps {
  officer: {
    id: string;
    name: string;
    email: string;
    employeeId?: string;
    assignedTradeIds: string[];
  };
  trades: Trade[];
  sessions: AcademicSession[];
  settings: SystemSettings;
}

type OfficerTab = 'attendance' | 'trainees' | 'leaves' | 'warnings' | 'inventory' | 'indents' | 'reports';

export const OfficerDashboard: React.FC<OfficerDashboardProps> = ({
  officer,
  trades,
  sessions,
  settings,
}) => {
  const [activeTab, setActiveTab] = useState<OfficerTab>('attendance');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  // Available trades for this officer
  const officerTrades = trades.filter((t) => officer.assignedTradeIds.includes(t.id));
  const [selectedTradeId, setSelectedTradeId] = useState(
    officerTrades.length > 0 ? officerTrades[0].id : trades[0]?.id || ''
  );
  const [selectedSessionId, setSelectedSessionId] = useState(settings.currentSessionId || sessions[0]?.id || '');

  // Main entity states
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dayAttendance, setDayAttendance] = useState<AttendanceRecord[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [warnings, setWarnings] = useState<WarningNotice[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [indents, setIndents] = useState<IndentRecord[]>([]);

  // Local pending attendance changes for batch saving
  const [attendanceEdits, setAttendanceEdits] = useState<Record<string, AttendanceStatus>>({});

  // Modals
  const [traineeModalOpen, setTraineeModalOpen] = useState(false);
  const [editingTrainee, setEditingTrainee] = useState<Trainee | null>(null);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningTrainee, setWarningTrainee] = useState<{ id: string; name: string; rollNo: string; percent: number } | null>(null);
  const [warningSubject, setWarningSubject] = useState('');
  const [warningMessage, setWarningMessage] = useState('');

  // Review Leave Modal state
  const [reviewLeaveModalOpen, setReviewLeaveModalOpen] = useState(false);
  const [leaveToReview, setLeaveToReview] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Return Indent Modal state
  const [returnIndentModalOpen, setReturnIndentModalOpen] = useState(false);
  const [indentToReturn, setIndentToReturn] = useState<IndentRecord | null>(null);
  const [returnCondition, setReturnCondition] = useState<'Good' | 'Damaged' | 'Normal Wear'>('Good');
  const [returnRemarks, setReturnRemarks] = useState('Inspected and verified in workshop');

  // Deletion state
  const [traineeToDelete, setTraineeToDelete] = useState<Trainee | null>(null);
  const [inventoryToDelete, setInventoryToDelete] = useState<InventoryItem | null>(null);

  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [editingInventory, setEditingInventory] = useState<InventoryItem | null>(null);
  const [indentModalOpen, setIndentModalOpen] = useState(false);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [printReportOpen, setPrintReportOpen] = useState(false);

  // Form states
  const [traineeForm, setTraineeForm] = useState({
    name: '',
    rollNo: '',
    fatherName: '',
    email: '',
    mobile: '',
    category: 'OBC' as any,
    gender: 'Male' as any,
    dob: '2005-01-01',
    status: 'active' as any,
  });

  const [inventoryForm, setInventoryForm] = useState({
    toolCode: '',
    name: '',
    specification: '',
    category: 'Hand Tools' as any,
    totalStock: 10,
    issuedCount: 0,
    damagedCount: 0,
    binLocation: 'Rack A-1',
  });

  const [indentForm, setIndentForm] = useState({
    traineeId: '',
    itemId: '',
    quantity: 1,
    expectedReturnDate: new Date().toISOString().split('T')[0],
    remarks: '',
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const loadData = async () => {
    if (!selectedTradeId) return;
    setLoading(true);
    try {
      const [tList, attDayList, attAllList, lList, wList, invList, indList] = await Promise.all([
        fetchTrainees(selectedTradeId, selectedSessionId),
        fetchAttendance({ date: attendanceDate, tradeId: selectedTradeId }),
        fetchAttendance({ tradeId: selectedTradeId, sessionId: selectedSessionId }),
        fetchLeaves({ tradeId: selectedTradeId }),
        fetchWarnings({ tradeId: selectedTradeId }),
        fetchInventory({ tradeId: selectedTradeId }),
        fetchIndents({ tradeId: selectedTradeId }),
      ]);

      setTrainees(tList);
      setDayAttendance(attDayList);
      setAllAttendance(attAllList);
      setLeaves(lList);
      setWarnings(wList);
      setInventory(invList);
      setIndents(indList);

      // Initialize local edits with existing records
      const initialMap: Record<string, AttendanceStatus> = {};
      tList.forEach((tr) => {
        const found = attDayList.find((a) => a.traineeId === tr.id);
        if (found) {
          initialMap[tr.id] = found.status;
        } else {
          initialMap[tr.id] = 'Present'; // default suggestion
        }
      });
      setAttendanceEdits(initialMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedTradeId, selectedSessionId, attendanceDate]);

  const currentTrade = trades.find((t) => t.id === selectedTradeId);

  // Compute attendance stats per trainee
  const traineeStats = trainees.map((tr) => {
    const records = allAttendance.filter((a) => a.traineeId === tr.id);
    const totalMarked = records.length;
    const presentCount = records.filter((a) => a.status === 'Present').length;
    const clCount = records.filter((a) => a.status === 'CL').length;
    const mlCount = records.filter((a) => a.status === 'Medical Leave').length;
    const halfDayCount = records.filter((a) => a.status === 'Half-Day Leave').length;
    const absentCount = records.filter((a) => a.status === 'Absent').length;

    // Present + CL + Medical + (0.5 * halfday) counts toward official NCVT attendance credit
    const effectiveAttended = presentCount + clCount + mlCount + halfDayCount * 0.5;
    const percent = totalMarked > 0 ? (effectiveAttended / totalMarked) * 100 : 100;

    return {
      trainee: tr,
      totalMarked,
      presentCount,
      clCount,
      mlCount,
      halfDayCount,
      absentCount,
      percent: Math.round(percent * 10) / 10,
      isBelowThreshold: percent < settings.minimumAttendancePercent,
    };
  });

  // Batch Save Attendance
  const handleSaveAttendance = async () => {
    try {
      const recordsToSave = Object.entries(attendanceEdits).map(([traineeId, status]) => ({
        traineeId,
        status,
        remarks: `Marked/Authorized by ${officer.name}`,
      }));

      await batchSaveAttendance({
        date: attendanceDate,
        officerId: officer.id,
        officerName: officer.name,
        records: recordsToSave,
      });

      showToast(`Daily attendance saved for ${recordsToSave.length} trainees`);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Run 10:00 AM Auto-Absent for unmarked trainees
  const handleTriggerAutoAbsent = async () => {
    if (!confirm('Run automatic absent recording for any trainees who have not recorded attendance by 10:00 AM?')) return;
    try {
      const res = await triggerAutoAbsent(attendanceDate, selectedTradeId);
      showToast(`Auto-absent executed. ${res.markedCount} unmarked trainees flagged as Absent.`);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Trainee CRUD Handlers
  const handleOpenTraineeModal = (tr?: Trainee) => {
    if (tr) {
      setEditingTrainee(tr);
      setTraineeForm({
        name: tr.name,
        rollNo: tr.rollNo,
        fatherName: tr.fatherName,
        email: tr.email,
        mobile: tr.mobile,
        category: tr.category,
        gender: tr.gender,
        dob: tr.dob,
        status: tr.status,
      });
    } else {
      setEditingTrainee(null);
      const nextRollNum = trainees.length + 1;
      setTraineeForm({
        name: '',
        rollNo: `ITI/RAI/2025/${currentTrade?.code || 'TRD'}-${nextRollNum < 10 ? '0' + nextRollNum : nextRollNum}`,
        fatherName: '',
        email: '',
        mobile: '+91 9',
        category: 'OBC',
        gender: 'Male',
        dob: '2005-01-01',
        status: 'active',
      });
    }
    setTraineeModalOpen(true);
  };

  const handleSaveTrainee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTrainee) {
        await updateTrainee(editingTrainee.id, traineeForm);
        showToast(`Trainee ${traineeForm.name} updated successfully`);
      } else {
        await createTrainee({
          ...traineeForm,
          tradeId: selectedTradeId,
          sessionId: selectedSessionId,
          officId: officer.id,
          officerName: officer.name,
        } as any);
        showToast(`Trainee ${traineeForm.name} added to trade`);
      }
      setTraineeModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteTrainee = async (id: string) => {
    try {
      await deleteTrainee(id, { officerId: officer.id, officerName: officer.name });
      showToast('Trainee removed');
      setTraineeToDelete(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Error deleting trainee');
    }
  };

  // 1-Click Direct Approval (Immediate approval without prompts!)
  const handleQuickApprove = async (leave: LeaveRequest) => {
    try {
      await reviewLeave(leave.id, {
        status: 'approved',
        officerName: officer.name,
        reviewerRemarks: 'Leave sanctioned and attendance credited.',
      });
      showToast(`Leave sanctioned for ${leave.traineeName}`);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to approve leave');
    }
  };

  // Open Detailed Review Modal (for custom remarks or rejection)
  const handleOpenReviewModal = (leave: LeaveRequest, action: 'approved' | 'rejected' = 'approved') => {
    setLeaveToReview(leave);
    setReviewAction(action);
    setReviewRemarks(
      action === 'approved'
        ? 'Medical/document verification completed. Leave sanctioned.'
        : 'Cannot sanction due to scheduled trade practical workshop.'
    );
    setReviewLeaveModalOpen(true);
  };

  // Submit Detailed Review from Modal
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveToReview) return;
    setReviewSubmitting(true);
    try {
      await reviewLeave(leaveToReview.id, {
        status: reviewAction,
        officerName: officer.name,
        reviewerRemarks: reviewRemarks.trim() || (reviewAction === 'approved' ? 'Leave sanctioned.' : 'Leave rejected.'),
      });
      showToast(`Leave application marked ${reviewAction} for ${leaveToReview.traineeName}`);
      setReviewLeaveModalOpen(false);
      setLeaveToReview(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to process leave');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Warning Notice Handlers
  const handleOpenWarningModal = (tStat: { id: string; name: string; rollNo: string; percent: number }) => {
    setWarningTrainee(tStat);
    setWarningSubject(`NCVT Official Warning: Attendance Deficit (${tStat.percent}%)`);
    setWarningMessage(
      `Your recorded attendance has fallen to ${tStat.percent}%, which is strictly below the required 80% threshold for the semester trade test. You are hereby directed to attend all forthcoming workshop practicals and submit written explanation.`
    );
    setWarningModalOpen(true);
  };

  const handleIssueWarning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warningTrainee) return;
    try {
      await issueWarning({
        traineeId: warningTrainee.id,
        officerId: officer.id,
        officerName: officer.name,
        attendancePercent: warningTrainee.percent,
        subject: warningSubject,
        message: warningMessage,
      });
      showToast(`Warning notice issued to ${warningTrainee.name}`);
      setWarningModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Inventory CRUD
  const handleOpenInventoryModal = (item?: InventoryItem) => {
    if (item) {
      setEditingInventory(item);
      setInventoryForm({
        toolCode: item.toolCode,
        name: item.name,
        specification: item.specification,
        category: item.category,
        totalStock: item.totalStock,
        issuedCount: item.issuedCount,
        damagedCount: item.damagedCount,
        binLocation: item.binLocation,
      });
    } else {
      setEditingInventory(null);
      setInventoryForm({
        toolCode: `${currentTrade?.code || 'TRD'}-TOOL-${Math.floor(10 + Math.random() * 90)}`,
        name: '',
        specification: '',
        category: 'Hand Tools',
        totalStock: 10,
        issuedCount: 0,
        damagedCount: 0,
        binLocation: 'Cabinet 1',
      });
    }
    setInventoryModalOpen(true);
  };

  const handleSaveInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveInventoryItem({
        id: editingInventory?.id,
        tradeId: selectedTradeId,
        ...inventoryForm,
        officerId: officer.id,
        officerName: officer.name,
      });
      showToast(editingInventory ? 'Tool updated' : 'Tool added to inventory');
      setInventoryModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteInventory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tool from inventory?')) return;
    try {
      await deleteInventoryItem(id);
      showToast('Item deleted');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Indent Handlers
  const handleOpenIndentModal = () => {
    setIndentForm({
      traineeId: trainees[0]?.id || '',
      itemId: inventory.find((i) => i.availableStock > 0)?.id || '',
      quantity: 1,
      expectedReturnDate: new Date().toISOString().split('T')[0],
      remarks: 'Issued for workshop practical exercise',
    });
    setIndentModalOpen(true);
  };

  const handleIssueIndent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await issueIndent({
        tradeId: selectedTradeId,
        officerId: officer.id,
        officerName: officer.name,
        traineeId: indentForm.traineeId,
        itemId: indentForm.itemId,
        quantity: indentForm.quantity,
        expectedReturnDate: indentForm.expectedReturnDate,
        remarks: indentForm.remarks,
      });
      showToast('Tool issued successfully under indent');
      setIndentModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenReturnModal = (indent: IndentRecord) => {
    setIndentToReturn(indent);
    setReturnCondition('Good');
    setReturnRemarks('Inspected and verified in workshop');
    setReturnIndentModalOpen(true);
  };

  const handleConfirmReturnIndent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indentToReturn) return;
    try {
      await returnIndent(indentToReturn.id, {
        returnCondition,
        officerName: officer.name,
        remarks: returnRemarks,
      });
      showToast(`Indent ${indentToReturn.indentNo} marked returned`);
      setReturnIndentModalOpen(false);
      setIndentToReturn(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to return indent');
    }
  };

  // CSV Report Export
  const handleExportCSV = () => {
    const header = ['Roll No', 'Trainee Name', 'Category', 'Gender', 'Present Days', 'CL Days', 'Medical Leave', 'Half Days', 'Absent Days', 'Total Recorded', 'Attendance %', 'Status'];
    const rows = traineeStats.map((st) => [
      st.trainee.rollNo,
      st.trainee.name,
      st.trainee.category,
      st.trainee.gender,
      st.presentCount,
      st.clCount,
      st.mlCount,
      st.halfDayCount,
      st.absentCount,
      st.totalMarked,
      `${st.percent}%`,
      st.isBelowThreshold ? 'DEFICIT (<80%)' : 'REGULAR',
    ]);

    const csvContent = '\uFEFF' + [header.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ITI_Raigarh_${currentTrade?.name || 'Trade'}_Attendance_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Attendance CSV downloaded successfully');
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-700 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Officer Header & Trade Selector Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md">
              <Users className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {officer.name}
              </h2>
              <p className="text-xs text-slate-500">
                Training Officer · Emp ID: <span className="font-mono">{officer.employeeId || 'CG-ITI-TO-1042'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Trade Switcher (if assigned multiple trades) & Academic Session */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 font-medium">Assigned Trade:</span>
            <select
              value={selectedTradeId}
              onChange={(e) => setSelectedTradeId(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-hidden"
            >
              {officerTrades.length > 0 ? (
                officerTrades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))
              ) : (
                <option value={trades[0]?.id}>{trades[0]?.name || 'Electrician'}</option>
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 font-medium">Session:</span>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-hidden"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Officer Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200 text-xs">
        {[
          { id: 'attendance', label: 'Daily Attendance', icon: CalendarCheck2 },
          { id: 'trainees', label: 'Trainees Roster', icon: Users },
          { id: 'leaves', label: `Leave Approvals (${leaves.filter((l) => l.status === 'pending').length})`, icon: FileCheck2 },
          { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
          { id: 'warnings', label: `Warnings & Alerts (${warnings.length})`, icon: AlertTriangle },
          { id: 'inventory', label: 'Workshop Inventory', icon: Wrench },
          { id: 'indents', label: 'Indent Register', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as OfficerTab)}
              className={`flex items-center gap-2 px-3.5 py-2 font-medium rounded-t-lg transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                isActive
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: DAILY ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Daily Attendance Register — {currentTrade?.name}
              </h3>
              <p className="text-xs text-slate-500">
                Record or adjust attendance: Present (P), Absent (A), Casual Leave (CL), Medical Leave (ML), or Half-Day (HD).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-white font-mono"
              />
              <button
                onClick={handleTriggerAutoAbsent}
                className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg font-medium transition-colors"
                title="Marks all unmarked trainees past 10:00 AM as Absent automatically"
              >
                Run 10 AM Auto-Absent
              </button>
              <button
                onClick={handleSaveAttendance}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg shadow-xs transition-colors"
              >
                Save Attendance Changes
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Roll No &amp; Trainee Name</th>
                  <th className="py-3 px-4 font-semibold text-center">Status Toggle</th>
                  <th className="py-3 px-4 font-semibold">Recorded Time &amp; Method</th>
                  <th className="py-3 px-4 font-semibold">GPS Geotag Verification</th>
                  <th className="py-3 px-4 font-semibold">Remarks / Authorized Overrides</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trainees.map((tr) => {
                  const currentStatus = attendanceEdits[tr.id] || 'Present';
                  const record = dayAttendance.find((a) => a.traineeId === tr.id);

                  return (
                    <tr key={tr.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{tr.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{tr.rollNo}</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                          {(['Present', 'Absent', 'CL', 'Medical Leave', 'Half-Day Leave'] as AttendanceStatus[]).map((st) => {
                            const isSelected = currentStatus === st;
                            const label = st === 'Medical Leave' ? 'ML' : st === 'Half-Day Leave' ? 'HD' : st === 'Present' ? 'P' : st === 'Absent' ? 'A' : 'CL';

                            return (
                              <button
                                key={st}
                                onClick={() => setAttendanceEdits({ ...attendanceEdits, [tr.id]: st })}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                                  isSelected
                                    ? st === 'Present'
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : st === 'Absent'
                                      ? 'bg-rose-600 text-white shadow-xs'
                                      : 'bg-amber-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title={st}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {record ? (
                          <div>
                            <span className="font-mono text-slate-800">{record.timestamp}</span>
                            <div className="text-[10px] text-slate-500">
                              {record.markedBy === 'trainee_gps' && 'Student GPS Self-Checkin'}
                              {record.markedBy === 'officer_manual' && 'Officer Manual Entry'}
                              {record.markedBy === 'system_auto_absent' && 'Cutoff Auto-Absent'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not yet recorded</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {record?.geotag ? (
                          <div className="space-y-0.5 text-[11px]">
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <Compass className="w-3 h-3" />
                              <span>Campus Verified ({record.geotag.distanceFromCampusMeters}m)</span>
                            </span>
                            <div className="font-mono text-[10px] text-slate-400">
                              Accuracy: ±{record.geotag.accuracyMeters}m
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No GPS geotag</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-600 text-[11px]">
                        {record?.remarks || 'Regular workshop scheduled'}
                        {record?.authorizedCorrection && (
                          <span className="block text-[10px] text-amber-700 font-medium">
                            Authorized correction by: {record.correctedBy}
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

      {/* TAB 2: TRAINEES ROSTER */}
      {activeTab === 'trainees' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Trainees Roster — {currentTrade?.name} ({trainees.length} Enrolled)
              </h3>
              <p className="text-xs text-slate-500">
                Manage trainee admissions, roll numbers, and personal details within your trade.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name or roll no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-48 sm:w-60"
                />
              </div>
              <button
                onClick={() => handleOpenTraineeModal()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Trainee</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Roll No &amp; Reg No</th>
                  <th className="py-3 px-4 font-semibold">Trainee Name &amp; Father's Name</th>
                  <th className="py-3 px-4 font-semibold">Contact Details</th>
                  <th className="py-3 px-4 font-semibold text-center">Category / Gender</th>
                  <th className="py-3 px-4 font-semibold text-center">Attendance %</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {traineeStats
                  .filter(
                    (st) =>
                      st.trainee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      st.trainee.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((st) => (
                    <tr key={st.trainee.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-900">{st.trainee.rollNo}</div>
                        <div className="font-mono text-[10px] text-slate-500">{st.trainee.registrationNo}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{st.trainee.name}</div>
                        <div className="text-[11px] text-slate-500">S/o: {st.trainee.fatherName}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-800">{st.trainee.mobile}</div>
                        <div className="text-[11px] text-slate-500">{st.trainee.email}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium">
                          {st.trainee.category} · {st.trainee.gender}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-mono font-semibold px-2 py-0.5 rounded text-[11px] ${
                            st.isBelowThreshold
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {st.percent}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {st.isBelowThreshold && (
                            <button
                              onClick={() =>
                                handleOpenWarningModal({
                                  id: st.trainee.id,
                                  name: st.trainee.name,
                                  rollNo: st.trainee.rollNo,
                                  percent: st.percent,
                                })
                              }
                              className="px-2 py-1 text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded"
                              title="Issue Low Attendance Warning"
                            >
                              Issue Warning
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenTraineeModal(st.trainee)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Edit Trainee Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTrainee(st.trainee.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Delete Trainee"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LEAVE APPROVALS */}
      {activeTab === 'leaves' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h3 className="font-bold text-sm text-slate-900">Leave Applications &amp; Sanctions</h3>
            <p className="text-xs text-slate-500">
              Review Casual Leave (CL), Medical Leave (ML), and Half-Day applications submitted by trainees.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Trainee Name &amp; Roll No</th>
                  <th className="py-3 px-4 font-semibold">Leave Type</th>
                  <th className="py-3 px-4 font-semibold">Dates &amp; Duration</th>
                  <th className="py-3 px-4 font-semibold">Stated Reason</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Approval Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((lv) => (
                  <tr key={lv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{lv.traineeName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{lv.rollNo}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800">{lv.leaveType}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-800">
                        {lv.fromDate} to {lv.toDate}
                      </div>
                      <div className="text-[10px] text-slate-500">{lv.days} day(s)</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs">{lv.reason}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${
                          lv.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : lv.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {lv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {lv.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleQuickApprove(lv)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-[11px] shadow-xs flex items-center gap-1 transition-colors cursor-pointer"
                            title="1-Click Sanction & Attendance Credit"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleOpenReviewModal(lv, 'approved')}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded font-medium text-[11px] transition-colors cursor-pointer"
                            title="Add custom remarks before approving"
                          >
                            Remarks
                          </button>
                          <button
                            onClick={() => handleOpenReviewModal(lv, 'rejected')}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-medium text-[11px] transition-colors cursor-pointer"
                            title="Reject application with remarks"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          Reviewed: <span className="text-slate-700 font-medium">{lv.reviewerRemarks || 'Completed'}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: REPORTS & ANALYTICS */}
      {activeTab === 'reports' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Official NCVT Attendance &amp; Performance Reports
              </h3>
              <p className="text-xs text-slate-500">
                Generate monthly registers, aggregate percentages, and export signed reports.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel / CSV</span>
              </button>
              <button
                onClick={() => setPrintReportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg text-xs transition-colors shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Official PDF Register</span>
              </button>
            </div>
          </div>

          {/* Aggregate Attendance Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500">Average Trade Attendance</span>
              <div className="text-xl font-bold text-emerald-700 mt-1 font-mono">
                {traineeStats.length > 0
                  ? Math.round(
                      (traineeStats.reduce((acc, s) => acc + s.percent, 0) / traineeStats.length) * 10
                    ) / 10
                  : 0}
                %
              </div>
              <span className="text-[10px] text-slate-500">NCVT Standard: 80%</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500">Trainees in Warning Zone (&lt;80%)</span>
              <div className="text-xl font-bold text-rose-700 mt-1 font-mono">
                {traineeStats.filter((s) => s.isBelowThreshold).length} Trainees
              </div>
              <span className="text-[10px] text-rose-600">Immediate action required</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500">Total Sanctioned Casual Leaves</span>
              <div className="text-xl font-bold text-amber-700 mt-1 font-mono">
                {traineeStats.reduce((acc, s) => acc + s.clCount, 0)} Days
              </div>
              <span className="text-[10px] text-slate-500">Across current academic quarter</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500">Enrolled Candidates</span>
              <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
                {trainees.length} / {currentTrade?.totalIntake || 40}
              </div>
              <span className="text-[10px] text-slate-500">Sanctioned Seats</span>
            </div>
          </div>

          {/* Roster Table with Detailed Attendance Breakdown */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">Roll No</th>
                  <th className="py-2.5 px-3 font-semibold">Trainee Name</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Present</th>
                  <th className="py-2.5 px-3 font-semibold text-center">CL</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Medical</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Half-Day</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Absent</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Attendance %</th>
                  <th className="py-2.5 px-3 font-semibold text-right">NCVT Eligibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {traineeStats.map((st) => (
                  <tr key={st.trainee.id} className="hover:bg-slate-50/80 transition-colors font-sans">
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{st.trainee.rollNo}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{st.trainee.name}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-medium text-emerald-700">{st.presentCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-amber-700">{st.clCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-blue-700">{st.mlCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-indigo-700">{st.halfDayCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-rose-700 font-bold">{st.absentCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">
                      <span className={st.isBelowThreshold ? 'text-rose-700' : 'text-emerald-700'}>
                        {st.percent}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {st.isBelowThreshold ? (
                        <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                          DEFICIT NOTICE
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          ELIGIBLE
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: WARNINGS & ALERTS */}
      {activeTab === 'warnings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Official Attendance Warnings (&lt;80% Deficit)
              </h3>
              <p className="text-xs text-slate-500">
                Issue regulatory warning directives to candidates with sub-80% attendance records.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {warnings.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No active warning notices issued for this trade.
              </div>
            ) : (
              warnings.map((w) => (
                <div key={w.id} className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span className="font-bold text-rose-900 font-mono">{w.refNumber}</span>
                      <span className="text-rose-500">·</span>
                      <span className="font-semibold text-slate-800">
                        To: {w.traineeName} ({w.rollNo})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-slate-500">Issued: {w.issuedDate}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          w.status === 'acknowledged'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {w.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="font-semibold text-slate-900">{w.subject}</div>
                  <p className="text-slate-700 leading-relaxed text-[11px] bg-white p-3 rounded border border-rose-100">
                    {w.message}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Issued By: {w.officerName}</span>
                    <span className="font-mono text-rose-700 font-bold">
                      Deficit Level: {w.attendancePercent}% (Threshold: 80%)
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 6: WORKSHOP INVENTORY */}
      {activeTab === 'inventory' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Tools &amp; Equipment Inventory — {currentTrade?.name} Workshop
              </h3>
              <p className="text-xs text-slate-500">
                Maintain inventory registers: Total Stock, Issued items, Damaged items, and Available stock.
              </p>
            </div>
            <button
              onClick={() => handleOpenInventoryModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Equipment / Tool</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Tool Code &amp; Item Name</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold text-center">Total Stock</th>
                  <th className="py-3 px-4 font-semibold text-center">Issued Out</th>
                  <th className="py-3 px-4 font-semibold text-center">Damaged / Defect</th>
                  <th className="py-3 px-4 font-semibold text-center">Available Stock</th>
                  <th className="py-3 px-4 font-semibold">Bin Location</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{item.toolCode}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-xs">{item.specification}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                      {item.totalStock}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-medium text-amber-700">
                      {item.issuedCount}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-medium text-rose-700">
                      {item.damagedCount}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">
                      {item.availableStock}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{item.binLocation}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenInventoryModal(item)}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Edit Tool Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteInventory(item.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="Delete Tool"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: INDENT REGISTERS */}
      {activeTab === 'indents' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Indent Issue &amp; Return Register
              </h3>
              <p className="text-xs text-slate-500">
                Issue precision tools and materials to trainees for workshop practical sessions and track returns.
              </p>
            </div>
            <button
              onClick={handleOpenIndentModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Issue New Tool Indent</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Indent No</th>
                  <th className="py-3 px-4 font-semibold">Trainee Name &amp; Roll No</th>
                  <th className="py-3 px-4 font-semibold">Issued Tool / Equipment</th>
                  <th className="py-3 px-4 font-semibold text-center">Qty</th>
                  <th className="py-3 px-4 font-semibold">Issue &amp; Return Dates</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {indents.map((ind) => (
                  <tr key={ind.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">{ind.indentNo}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{ind.traineeName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{ind.rollNo}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{ind.itemName}</div>
                      <div className="text-[10px] text-slate-500">{ind.remarks}</div>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                      {ind.quantity}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-800">Issued: {ind.issueDate}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        Due: {ind.expectedReturnDate}
                        {ind.actualReturnDate && ` · Returned: ${ind.actualReturnDate}`}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${
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
                    <td className="py-3 px-4 text-right">
                      {ind.status === 'issued' ? (
                        <button
                          onClick={() => handleOpenReturnModal(ind)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-[11px] shadow-xs cursor-pointer"
                        >
                          Mark Returned
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Condition: {ind.returnCondition || 'Good'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT TRAINEE */}
      {traineeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-4">
              {editingTrainee ? 'Edit Trainee Profile' : `Add Trainee — ${currentTrade?.name}`}
            </h3>
            <form onSubmit={handleSaveTrainee} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Trainee Full Name</label>
                <input
                  type="text"
                  value={traineeForm.name}
                  onChange={(e) => setTraineeForm({ ...traineeForm, name: e.target.value })}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Roll Number</label>
                  <input
                    type="text"
                    value={traineeForm.rollNo}
                    onChange={(e) => setTraineeForm({ ...traineeForm, rollNo: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Father's Name</label>
                  <input
                    type="text"
                    value={traineeForm.fatherName}
                    onChange={(e) => setTraineeForm({ ...traineeForm, fatherName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Mobile</label>
                  <input
                    type="text"
                    value={traineeForm.mobile}
                    onChange={(e) => setTraineeForm({ ...traineeForm, mobile: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Category</label>
                  <select
                    value={traineeForm.category}
                    onChange={(e) => setTraineeForm({ ...traineeForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  >
                    <option value="GEN">GEN</option>
                    <option value="OBC">OBC</option>
                    <option value="SC">SC</option>
                    <option value="ST">ST</option>
                    <option value="EWS">EWS</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Gender</label>
                  <select
                    value={traineeForm.gender}
                    onChange={(e) => setTraineeForm({ ...traineeForm, gender: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={traineeForm.dob}
                    onChange={(e) => setTraineeForm({ ...traineeForm, dob: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTraineeModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-emerald-700 text-white rounded hover:bg-emerald-800"
                >
                  Save Trainee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE WARNING */}
      {warningModalOpen && warningTrainee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-1 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Issue Official Attendance Warning Notice</span>
            </h3>
            <p className="text-slate-500 mb-4">
              Candidate: <span className="font-semibold text-slate-800">{warningTrainee.name}</span> ({warningTrainee.rollNo}) · Current Attendance: <span className="font-bold text-rose-700 font-mono">{warningTrainee.percent}%</span> (Deficit &lt; 80%)
            </p>
            <form onSubmit={handleIssueWarning} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Warning Subject</label>
                <input
                  type="text"
                  value={warningSubject}
                  onChange={(e) => setWarningSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Official Notice Directive</label>
                <textarea
                  rows={4}
                  value={warningMessage}
                  onChange={(e) => setWarningMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setWarningModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-rose-700 text-white rounded hover:bg-rose-800"
                >
                  Issue Notice &amp; Notify Trainee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT INVENTORY */}
      {inventoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-4">
              {editingInventory ? 'Edit Equipment Stock' : 'Add Workshop Tool / Equipment'}
            </h3>
            <form onSubmit={handleSaveInventory} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Item / Tool Name</label>
                <input
                  type="text"
                  value={inventoryForm.name}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                  placeholder="e.g. Digital Multimeter 600V"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Tool Code</label>
                  <input
                    type="text"
                    value={inventoryForm.toolCode}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, toolCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Category</label>
                  <select
                    value={inventoryForm.category}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  >
                    <option value="Hand Tools">Hand Tools</option>
                    <option value="Power Machinery">Power Machinery</option>
                    <option value="Testing & Measuring">Testing &amp; Measuring</option>
                    <option value="Consumables & Raw Materials">Consumables &amp; Raw Materials</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium mb-1">Total Stock</label>
                  <input
                    type="number"
                    value={inventoryForm.totalStock}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, totalStock: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Issued Out</label>
                  <input
                    type="number"
                    value={inventoryForm.issuedCount}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, issuedCount: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Damaged</label>
                  <input
                    type="number"
                    value={inventoryForm.damagedCount}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, damagedCount: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Bin / Cupboard Location</label>
                <input
                  type="text"
                  value={inventoryForm.binLocation}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, binLocation: e.target.value })}
                  placeholder="e.g. Rack A-2, Cupboard 1"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setInventoryModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-emerald-700 text-white rounded hover:bg-emerald-800"
                >
                  Save Tool Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE INDENT */}
      {indentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-4">
              Issue Tool Indent to Trainee
            </h3>
            <form onSubmit={handleIssueIndent} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Select Trainee</label>
                <select
                  value={indentForm.traineeId}
                  onChange={(e) => setIndentForm({ ...indentForm, traineeId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                >
                  {trainees.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.name} ({tr.rollNo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">Select Tool / Equipment</label>
                <select
                  value={indentForm.itemId}
                  onChange={(e) => setIndentForm({ ...indentForm, itemId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                >
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id} disabled={item.availableStock <= 0}>
                      {item.name} ({item.toolCode}) — Available: {item.availableStock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={indentForm.quantity}
                    onChange={(e) => setIndentForm({ ...indentForm, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Expected Return Date</label>
                  <input
                    type="date"
                    value={indentForm.expectedReturnDate}
                    onChange={(e) => setIndentForm({ ...indentForm, expectedReturnDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Practical Purpose / Experiment</label>
                <input
                  type="text"
                  value={indentForm.remarks}
                  onChange={(e) => setIndentForm({ ...indentForm, remarks: e.target.value })}
                  placeholder="e.g. 3-phase induction motor test"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIndentModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-emerald-700 text-white rounded hover:bg-emerald-800"
                >
                  Issue Indent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT REPORT MODAL */}
      {printReportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-4xl w-full p-8 text-slate-900 space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-300 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-white p-1 border border-slate-300 flex items-center justify-center shrink-0">
                  <img
                    src="/assets/aistudio/iti-logo_b32addc6.png"
                    alt="Official ITI Emblem"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h2 className="text-base font-bold uppercase text-slate-900 tracking-wide">
                    Government Industrial Training Institute, Raigarh (C.G.)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Department of Technical Education, Government of Chhattisgarh · NCVT Code: ITI-RAI-CG-04
                  </p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5">
                    Monthly Trainee Attendance &amp; Performance Sheet — Trade: {currentTrade?.name} ({currentTrade?.code})
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800"
                >
                  Print / Save PDF
                </button>
                <button
                  onClick={() => setPrintReportOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse border border-slate-400">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-400">
                    <th className="p-2 border border-slate-400">Roll No</th>
                    <th className="p-2 border border-slate-400">Trainee Name</th>
                    <th className="p-2 border border-slate-400 text-center">Category</th>
                    <th className="p-2 border border-slate-400 text-center">Present</th>
                    <th className="p-2 border border-slate-400 text-center">Leaves</th>
                    <th className="p-2 border border-slate-400 text-center">Absent</th>
                    <th className="p-2 border border-slate-400 text-center">Attendance %</th>
                    <th className="p-2 border border-slate-400 text-center">NCVT Status</th>
                  </tr>
                </thead>
                <tbody>
                  {traineeStats.map((st) => (
                    <tr key={st.trainee.id} className="border-b border-slate-300">
                      <td className="p-2 font-mono border border-slate-300">{st.trainee.rollNo}</td>
                      <td className="p-2 font-medium border border-slate-300">{st.trainee.name}</td>
                      <td className="p-2 text-center border border-slate-300">{st.trainee.category}</td>
                      <td className="p-2 text-center font-mono border border-slate-300">{st.presentCount}</td>
                      <td className="p-2 text-center font-mono border border-slate-300">
                        {st.clCount + st.mlCount + st.halfDayCount}
                      </td>
                      <td className="p-2 text-center font-mono border border-slate-300 font-bold text-rose-700">
                        {st.absentCount}
                      </td>
                      <td className="p-2 text-center font-mono font-bold border border-slate-300">
                        {st.percent}%
                      </td>
                      <td className="p-2 text-center border border-slate-300">
                        {st.isBelowThreshold ? 'Deficit Notice Issued' : 'Eligible for Examination'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Official Signatures */}
            <div className="pt-10 grid grid-cols-2 text-xs border-t border-slate-200 text-center">
              <div>
                <div className="font-semibold text-slate-800">{officer.name}</div>
                <div className="text-slate-500">Training Officer ({currentTrade?.name})</div>
                <div className="text-[10px] text-slate-400 mt-1">Govt. ITI Raigarh</div>
              </div>
              <div>
                <div className="font-semibold text-slate-800">Principal / Vice-Principal</div>
                <div className="text-slate-500">Government ITI Raigarh (C.G.)</div>
                <div className="text-[10px] text-slate-400 mt-1">Institutional Seal &amp; Signature</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW LEAVE MODAL */}
      {reviewLeaveModalOpen && leaveToReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs text-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Review Leave Application
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewLeaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Applicant Details Summary Card */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900 text-sm">{leaveToReview.traineeName}</span>
                <span className="font-mono text-slate-500">{leaveToReview.rollNo}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400 block">Leave Category:</span>
                  <span className="font-semibold text-slate-800">{leaveToReview.leaveType}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Requested Period:</span>
                  <span className="font-mono text-slate-800">
                    {leaveToReview.fromDate} to {leaveToReview.toDate} ({leaveToReview.days} day(s))
                  </span>
                </div>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Stated Reason:</span>
                <p className="p-2 bg-white rounded border border-slate-200/80 text-slate-700 italic">
                  "{leaveToReview.reason}"
                </p>
              </div>
            </div>

            {/* Review Decision Form */}
            <form onSubmit={handleSubmitReview} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Official Decision
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewAction('approved');
                      setReviewRemarks('Leave sanctioned and authorized by Training Officer.');
                    }}
                    className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      reviewAction === 'approved'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Sanction / Approve</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewAction('rejected');
                      setReviewRemarks('Cannot sanction due to scheduled trade practical test.');
                    }}
                    className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      reviewAction === 'rejected'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <X className="w-4 h-4 text-rose-600" />
                    <span>Reject Application</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-semibold text-slate-700">
                    Training Officer Remarks
                  </label>
                  <span className="text-[10px] text-slate-400">Recorded on attendance sheet</span>
                </div>
                <textarea
                  rows={3}
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  placeholder="Enter remarks for the applicant..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-xs"
                  required
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setReviewRemarks('Medical certificate and fitness verified. Sanctioned.')}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200"
                >
                  + Medical verified
                </button>
                <button
                  type="button"
                  onClick={() => setReviewRemarks('Sanctioned for urgent family work.')}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200"
                >
                  + Urgent family work
                </button>
                <button
                  type="button"
                  onClick={() => setReviewRemarks('Half-day post-lunch granted.')}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200"
                >
                  + Half-day granted
                </button>
              </div>

              <div className="pt-3 flex gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReviewLeaveModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className={`flex-1 py-2 px-3 rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
                    reviewAction === 'approved'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {reviewAction === 'approved' ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm Sanction</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4" />
                      <span>Confirm Rejection</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RETURN INDENT MODAL */}
      {returnIndentModalOpen && indentToReturn && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Record Workshop Tool Return
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReturnIndentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-700 space-y-1">
              <div>
                <span className="text-slate-400 text-[10px]">Indent Reference:</span>
                <span className="font-mono font-bold text-slate-900 ml-1.5">{indentToReturn.indentNo}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px]">Trainee:</span>
                <span className="font-semibold text-slate-800 ml-1.5">{indentToReturn.traineeName} ({indentToReturn.rollNo})</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px]">Item / Tool:</span>
                <span className="font-semibold text-slate-800 ml-1.5">{indentToReturn.itemName} (Qty: {indentToReturn.quantity})</span>
              </div>
            </div>

            <form onSubmit={handleConfirmReturnIndent} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Return Condition</label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="Good">Good (Working &amp; Undamaged)</option>
                  <option value="Normal Wear">Normal Wear &amp; Tear</option>
                  <option value="Damaged">Damaged / Defect Recorded</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Inspection Remarks</label>
                <input
                  type="text"
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setReturnIndentModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded-lg hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs"
                >
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

