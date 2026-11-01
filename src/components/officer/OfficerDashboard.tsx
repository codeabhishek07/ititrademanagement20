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
  Mail,
  RefreshCw,
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
  fetchOfficer,
  fetchTrades,
  fetchTrainees,
  createTrainee,
  updateTrainee,
  deleteTrainee,
  updateOfficer,
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
import { OfficerRegisters, RegisterType } from './OfficerRegisters.tsx';

interface OfficerDashboardProps {
  officer: {
    id: string;
    name: string;
    email: string;
    employeeId?: string;
    assignedTradeIds: string[];
    mobile?: string;
  };
  trades: Trade[];
  sessions: AcademicSession[];
  settings: SystemSettings;
  onOfficerUpdate?: (updated: { name?: string; email?: string; mobile?: string; assignedTradeIds?: string[] }) => void;
}

type OfficerTab = 'attendance' | 'trainees' | 'leaves' | 'warnings' | 'inventory' | 'indents' | 'reports';

export const OfficerDashboard: React.FC<OfficerDashboardProps> = ({
  officer,
  trades,
  sessions,
  settings,
  onOfficerUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<OfficerTab>('attendance');
  const [selectedRegister, setSelectedRegister] = useState<RegisterType>('monthly_attendance');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [syncingAssignments, setSyncingAssignments] = useState(false);

  // Reactive state for the current officer's profile and trade assignments
  const [currentOfficer, setCurrentOfficer] = useState<{
    id: string;
    name: string;
    email: string;
    employeeId?: string;
    assignedTradeIds: string[];
    mobile?: string;
  }>({
    ...officer,
    assignedTradeIds: Array.isArray(officer.assignedTradeIds) ? officer.assignedTradeIds : [],
  });

  // Reactive available trades list
  const [availableTrades, setAvailableTrades] = useState<Trade[]>(trades || []);

  // Sync with prop updates from parent
  useEffect(() => {
    setCurrentOfficer({
      ...officer,
      assignedTradeIds: Array.isArray(officer.assignedTradeIds) ? officer.assignedTradeIds : [],
    });
  }, [officer.id, JSON.stringify(officer.assignedTradeIds), officer.email, officer.name]);

  useEffect(() => {
    if (trades && trades.length > 0) {
      setAvailableTrades(trades);
    }
  }, [trades]);

  // Compute active assigned trades for this officer
  const activeTradePool = availableTrades.length > 0 ? availableTrades : trades;
  const officerTrades = activeTradePool.filter((t) =>
    (currentOfficer.assignedTradeIds || []).includes(t.id)
  );

  const [selectedTradeId, setSelectedTradeId] = useState<string>(() => {
    if (officerTrades.length > 0) return officerTrades[0].id;
    if (activeTradePool.length > 0) return activeTradePool[0].id;
    return '';
  });

  // Re-sync with backend to get latest trade assignments made by admin
  const refreshOfficerAndTrades = async (silent = false) => {
    try {
      if (!silent) setSyncingAssignments(true);
      const [freshOfficer, freshTrades] = await Promise.all([
        fetchOfficer(currentOfficer.id).catch(() => null),
        fetchTrades().catch(() => null),
      ]);

      if (freshOfficer) {
        const cleanAssigned = Array.isArray(freshOfficer.assignedTradeIds)
          ? freshOfficer.assignedTradeIds
          : [];
        setCurrentOfficer({
          id: freshOfficer.id,
          name: freshOfficer.name,
          email: freshOfficer.email,
          employeeId: freshOfficer.employeeId,
          assignedTradeIds: cleanAssigned,
          mobile: freshOfficer.mobile,
        });

        onOfficerUpdate?.({
          name: freshOfficer.name,
          email: freshOfficer.email,
          mobile: freshOfficer.mobile,
          assignedTradeIds: cleanAssigned,
        });
      }

      if (freshTrades && Array.isArray(freshTrades) && freshTrades.length > 0) {
        setAvailableTrades(freshTrades);
      }

      if (!silent) {
        showToast('Trade assignments synchronized with administration records');
      }
    } catch (err) {
      console.error('Failed to sync officer trade data:', err);
    } finally {
      if (!silent) setSyncingAssignments(false);
    }
  };

  useEffect(() => {
    refreshOfficerAndTrades(true);
  }, [officer.id]);

  // Reactive selection guard: When assigned trades change, auto-switch to a valid assigned trade
  useEffect(() => {
    if (officerTrades.length > 0) {
      const isCurrentValid = officerTrades.some((t) => t.id === selectedTradeId);
      if (!isCurrentValid) {
        setSelectedTradeId(officerTrades[0].id);
      }
    } else if (activeTradePool.length > 0 && !selectedTradeId) {
      setSelectedTradeId(activeTradePool[0].id);
    }
  }, [currentOfficer.assignedTradeIds, officerTrades, selectedTradeId, activeTradePool]);

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
  const [warningSubjectHindi, setWarningSubjectHindi] = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const [warningMessageHindi, setWarningMessageHindi] = useState('');
  const [warningNoticeLanguage, setWarningNoticeLanguage] = useState<'bilingual' | 'hindi' | 'english'>('bilingual');
  const [warningToPrint, setWarningToPrint] = useState<WarningNotice | null>(null);

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

  // Officer Profile & Email edit state
  const [officerProfileModalOpen, setOfficerProfileModalOpen] = useState(false);
  const [officerProfileForm, setOfficerProfileForm] = useState({
    name: officer.name,
    email: officer.email,
    mobile: officer.mobile || '+91 98260 11223',
  });
  const [savingOfficerProfile, setSavingOfficerProfile] = useState(false);

  const handleSaveOfficerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officerProfileForm.email.trim()) {
      alert('Email cannot be empty');
      return;
    }
    try {
      setSavingOfficerProfile(true);
      await updateOfficer(officer.id, {
        name: officerProfileForm.name,
        email: officerProfileForm.email.trim(),
        mobile: officerProfileForm.mobile.trim(),
      });
      officer.name = officerProfileForm.name;
      officer.email = officerProfileForm.email.trim();
      officer.mobile = officerProfileForm.mobile.trim();
      onOfficerUpdate?.({
        name: officerProfileForm.name,
        email: officerProfileForm.email.trim(),
        mobile: officerProfileForm.mobile.trim(),
      });
      showToast('Officer email and profile updated successfully');
      setOfficerProfileModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setSavingOfficerProfile(false);
    }
  };

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

  const currentTrade = activeTradePool.find((t) => t.id === selectedTradeId) || activeTradePool[0];

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

  // Warning Notice Handlers with Official Hindi & English Support
  const handleOpenWarningModal = (tStat: { id: string; name: string; rollNo: string; percent: number }) => {
    setWarningTrainee(tStat);
    setWarningSubject(`NCVT Official Warning: Attendance Deficit (${tStat.percent}%)`);
    setWarningSubjectHindi(`कार्यालयीन चेतावनी सूचना: न्यून उपस्थिति (${tStat.percent}%) - DGT / NCVT मानक (80%) से कम`);
    setWarningMessage(
      `Your recorded attendance has fallen to ${tStat.percent}%, which is strictly below the required 80% threshold for the semester trade test. You are hereby directed to attend all forthcoming workshop practicals and submit written explanation.`
    );
    setWarningMessageHindi(
      `आपको सूचित किया जाता है कि वर्तमान सत्र में आपकी कुल उपस्थिति ${tStat.percent}% दर्ज हुई है, जो DGT / NCVT के न्यूनतम अनिवार्य मानक 80% से कम है। यदि आपकी उपस्थिति में तत्काल सुधार नहीं हुआ, तो आपको आगामी अखिल भारतीय व्यावसायिक परीक्षा (AITT) में सम्मिलित होने से वंचित (Debar) कर दिया जाएगा। अतः निर्देशित किया जाता है कि आगामी सभी कार्यदिवसों व प्रायोगिक कक्षाओं में अनिवार्यतः उपस्थित रहें तथा 3 दिवस के भीतर अपने प्रशिक्षण अधिकारी को लिखित स्पष्टीकरण प्रस्तुत करें।`
    );
    setWarningModalOpen(true);
  };

  const handleApplyWarningTemplate = (templateType: 'standard' | 'final') => {
    if (!warningTrainee) return;
    const pct = warningTrainee.percent;
    if (templateType === 'standard') {
      setWarningSubject(`NCVT Official Warning: Attendance Deficit (${pct}%)`);
      setWarningSubjectHindi(`कार्यालयीन चेतावनी सूचना: न्यून उपस्थिति (${pct}%) - DGT / NCVT मानक (80%) से कम`);
      setWarningMessage(
        `Your recorded attendance has fallen to ${pct}%, which is strictly below the required 80% threshold for the semester trade test. You are hereby directed to attend all forthcoming workshop practicals and submit written explanation.`
      );
      setWarningMessageHindi(
        `आपको सूचित किया जाता है कि वर्तमान सत्र में आपकी कुल उपस्थिति ${pct}% दर्ज हुई है, जो DGT / NCVT के न्यूनतम अनिवार्य मानक 80% से कम है। यदि आपकी उपस्थिति में तत्काल सुधार नहीं हुआ, तो आपको आगामी अखिल भारतीय व्यावसायिक परीक्षा (AITT) में सम्मिलित होने से वंचित (Debar) कर दिया जाएगा। अतः निर्देशित किया जाता है कि आगामी सभी कार्यदिवसों व प्रायोगिक कक्षाओं में अनिवार्यतः उपस्थित रहें तथा 3 दिवस के भीतर अपने प्रशिक्षण अधिकारी को लिखित स्पष्टीकरण प्रस्तुत करें।`
      );
    } else {
      setWarningSubject(`FINAL NOTICE: Severe Attendance Shortage (${pct}%) - Debarment from AITT`);
      setWarningSubjectHindi(`अंतिम चेतावनी आदेश: गंभीर उपस्थिति न्यूनता (${pct}%) - AITT परीक्षा से निष्कासन/वंचित संबंधी`);
      setWarningMessage(
        `FINAL NOTICE: Despite prior verbal and written reminders, your attendance remains severely critical at ${pct}%. In accordance with DGT/NCVT statutory guidelines, candidates having less than 80% overall attendance cannot be issued AITT examination hall tickets. Treat this as your final notice to rectify attendance immediately or face institutional debarment.`
      );
      setWarningMessageHindi(
        `अंतिम चेतावनी आदेश: पूर्व में दिए गए निर्देशों के उपरांत भी आपकी उपस्थिति अत्यंत चिंताजनक स्तर ${pct}% पर है। DGT/NCVT के नियमानुसार 80% से कम उपस्थिति वाले प्रशिक्षुओं को मुख्य परीक्षा (AITT) में प्रवेश पत्र जारी नहीं किया जा सकता। इसे अंतिम चेतावनी मानते हुए तत्काल वर्कशॉप उपस्थिति सुनिश्चित करें अन्यथा आपका नाम परीक्षा सूची से विलोपित कर दिया जाएगा।`
      );
    }
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
        subjectHindi: warningSubjectHindi,
        message: warningMessage,
        messageHindi: warningMessageHindi,
      });
      showToast(`Bilingual warning notice issued to ${warningTrainee.name}`);
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
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {currentOfficer.name}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setOfficerProfileForm({
                        name: currentOfficer.name,
                        email: currentOfficer.email,
                        mobile: currentOfficer.mobile || '+91 98260 11223',
                      });
                      setOfficerProfileModalOpen(true);
                    }}
                    className="px-2 py-0.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                    title="Edit officer email and phone"
                  >
                    <Edit2 className="w-3 h-3 text-emerald-700" />
                    <span>Edit Email / Profile (ईमेल बदलें)</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500 flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                  <span className="font-medium text-slate-700">Training Officer</span>
                  <span>·</span>
                  <span>Emp ID: <span className="font-mono font-medium text-slate-800">{currentOfficer.employeeId || 'CG-ITI-TO-1042'}</span></span>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-slate-700 font-mono">
                    <Mail className="w-3 h-3 text-slate-400" />
                    {currentOfficer.email}
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <Check className="w-3 h-3 text-emerald-600" />
                    {officerTrades.length} Assigned Trade(s)
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions & Session Selector */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Sync Trade Assignments Button */}
            <button
              type="button"
              onClick={() => refreshOfficerAndTrades(false)}
              disabled={syncingAssignments}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              title="Sync latest assigned trades from administration"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${syncingAssignments ? 'animate-spin' : ''}`} />
              <span>{syncingAssignments ? 'Syncing...' : 'Sync Assignments'}</span>
            </button>

            {/* Academic Session Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium">Session:</span>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="bg-transparent font-medium text-slate-800 focus:outline-hidden cursor-pointer"
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

        {/* Assigned Trade Selector Strip */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-700">Assigned Trade(s):</span>
            {officerTrades.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {officerTrades.map((t) => {
                  const isSelected = t.id === selectedTradeId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTradeId(t.id)}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs border ${
                        isSelected
                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-emerald-700/20 ring-2 ring-emerald-500/30'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span>{t.name}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {t.code}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-200" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="italic text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  No trade assigned yet by Admin
                </span>
                <select
                  value={selectedTradeId}
                  onChange={(e) => setSelectedTradeId(e.target.value)}
                  className="bg-white border border-slate-300 rounded px-2 py-1 font-medium text-slate-800 cursor-pointer"
                >
                  {activeTradePool.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <span>Active Workshop:</span>
            <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {currentTrade?.workshopLocation || 'Main Campus Workshop'}
            </span>
          </div>
        </div>
      </div>

      {/* Officer Navigation Tabs - High-Contrast Bold Modern Menu Bar */}
      <div className="bg-slate-950 p-2 rounded-2xl shadow-lg border border-slate-800 ring-1 ring-slate-800/80 flex items-center gap-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'attendance', label: 'Daily Attendance', hindi: 'दैनिक उपस्थिति', icon: CalendarCheck2 },
          { id: 'trainees', label: 'Trainees Roster', hindi: 'प्रशिक्षु सूची', icon: Users },
          {
            id: 'leaves',
            label: 'Leave Approvals',
            hindi: 'अवकाश अनुमोदन',
            icon: FileCheck2,
            badge: leaves.filter((l) => l.status === 'pending').length,
            badgeType: 'warning',
          },
          { id: 'reports', label: 'Official Registers & Reports', hindi: 'सरकारी पंजी', icon: BookOpen },
          {
            id: 'warnings',
            label: 'Warnings & Alerts',
            hindi: 'चेतावनी नोटिस',
            icon: AlertTriangle,
            badge: warnings.length,
            badgeType: 'danger',
          },
          { id: 'inventory', label: 'Workshop Inventory', hindi: 'सामग्री स्टॉक', icon: Wrench },
          { id: 'indents', label: 'Indent Register', hindi: 'टूल निर्गमन', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as OfficerTab)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold shadow-md shadow-emerald-950/40 ring-2 ring-emerald-300/30 border border-emerald-400'
                  : 'bg-slate-900/90 hover:bg-slate-850 text-slate-200 hover:text-white border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <div className="flex flex-col text-left">
                <span className="tracking-tight text-xs leading-tight font-extrabold">{tab.label}</span>
                <span className={`text-[10px] leading-tight font-normal ${isActive ? 'text-emerald-100 opacity-90' : 'text-slate-400'}`}>
                  {tab.hindi}
                </span>
              </div>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`ml-1 text-[11px] font-black px-2 py-0.5 rounded-full shadow-xs ${
                    isActive
                      ? 'bg-white text-emerald-950'
                      : tab.badgeType === 'danger'
                      ? 'bg-rose-500 text-white'
                      : 'bg-amber-400 text-slate-950'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
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
              <button
                onClick={() => {
                  setSelectedRegister('daily_attendance');
                  setActiveTab('reports');
                }}
                className="px-2.5 py-1.5 bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-xs"
                title="Open Official Form IV Daily Attendance Register"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                <span>Form IV Register</span>
              </button>
              <button
                onClick={() => {
                  setSelectedRegister('monthly_attendance');
                  setActiveTab('reports');
                }}
                className="px-2.5 py-1.5 bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-xs"
                title="Open Official Form V Monthly 1-31 Matrix"
              >
                <CalendarCheck2 className="w-3.5 h-3.5 text-slate-700" />
                <span>Monthly 1-31 Matrix</span>
              </button>

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
              <button
                onClick={() => {
                  setSelectedRegister('trainee_roster');
                  setActiveTab('reports');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors shadow-xs"
                title="View Official Master Trainee Admission Roster"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                <span>Form I Roster Register</span>
              </button>
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
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Leave Applications &amp; Sanctions</h3>
              <p className="text-xs text-slate-500">
                Review Casual Leave (CL), Medical Leave (ML), and Half-Day applications submitted by trainees.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedRegister('leave_register');
                setActiveTab('reports');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors shadow-xs"
              title="Open Official Form VII Leave Sanction Register"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-800" />
              <span>Form VII Leave Register</span>
            </button>
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

      {/* TAB 4: OFFICIAL REGISTERS & REPORTS */}
      {activeTab === 'reports' && (
        <OfficerRegisters
          officer={currentOfficer}
          currentTrade={currentTrade}
          selectedSessionId={selectedSessionId}
          sessions={sessions}
          trainees={trainees}
          allAttendance={allAttendance}
          leaves={leaves}
          inventory={inventory}
          indents={indents}
          settings={settings}
          initialRegister={selectedRegister}
        />
      )}

      {/* TAB 5: WARNINGS & ALERTS - BILINGUAL HINDI & ENGLISH */}
      {activeTab === 'warnings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-rose-100 text-rose-800 rounded-lg">
                  <ShieldAlert className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Official Attendance Warning Directives · शासकीय चेतावनी पत्रक (&lt;80% Deficit)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Issue statutory bilingual warning notices to candidates with sub-80% attendance records.
                  </p>
                </div>
              </div>
            </div>

            {/* Language filter for notices */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <span className="text-[11px] text-slate-500 px-2 font-medium">प्रदर्शन भाषा:</span>
              {(['bilingual', 'hindi', 'english'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setWarningNoticeLanguage(lang)}
                  className={`px-2.5 py-1 rounded-md transition-all text-xs cursor-pointer ${
                    warningNoticeLanguage === lang
                      ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'bilingual' ? 'द्विभाषी (Bilingual)' : lang === 'hindi' ? 'हिन्दी (Hindi)' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {warnings.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
                <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No active warning notices issued for this trade.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">All trainees meet the 80% attendance requirement or warnings have not been generated.</p>
              </div>
            ) : (
              warnings.map((w) => (
                <div key={w.id} className="p-4 rounded-xl border-2 border-rose-200 bg-rose-50/30 space-y-3 text-xs shadow-xs">
                  {/* Notice Header Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200/80 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono font-bold text-[11px] shadow-xs">
                        {w.refNumber}
                      </span>
                      <span className="text-slate-400">|</span>
                      <span className="font-bold text-slate-900 text-xs">
                        प्रशिक्षु (To): {w.traineeName} ({w.rollNo})
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-[11px] text-slate-600">
                        ट्रेड: <span className="font-semibold text-slate-800">{w.tradeName || currentTrade?.name}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-rose-100">
                        दिनांक: {w.issuedDate}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          w.status === 'acknowledged'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                        }`}
                      >
                        {w.status === 'acknowledged' ? 'पावती प्राप्त (ACKNOWLEDGED)' : 'निर्गमित (ISSUED - UNACKNOWLEDGED)'}
                      </span>
                    </div>
                  </div>

                  {/* Hindi Notice Content */}
                  {(warningNoticeLanguage === 'hindi' || warningNoticeLanguage === 'bilingual') && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                          कार्यालयीन हिन्दी प्रारूप
                        </span>
                        <h4 className="font-bold text-slate-900 text-xs">
                          {w.subjectHindi || 'कार्यालयीन चेतावनी सूचना: न्यून उपस्थिति (80% से कम)'}
                        </h4>
                      </div>
                      <p className="text-slate-800 text-[11px] leading-relaxed whitespace-pre-line font-medium">
                        {w.messageHindi || w.message}
                      </p>
                    </div>
                  )}

                  {/* English Notice Content */}
                  {(warningNoticeLanguage === 'english' || warningNoticeLanguage === 'bilingual') && (
                    <div className="bg-white border border-rose-100 rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          English Directive
                        </span>
                        <h4 className="font-semibold text-slate-900 text-xs">{w.subject}</h4>
                      </div>
                      <p className="text-slate-700 text-[11px] leading-relaxed whitespace-pre-line">
                        {w.message}
                      </p>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 pt-2 border-t border-rose-200/60">
                    <div className="flex items-center gap-3">
                      <span>
                        जारीकर्ता: <strong className="text-slate-700">{w.officerName}</strong> (प्रशिक्षण अधिकारी)
                      </span>
                      <span>·</span>
                      <span className="font-mono text-rose-700 font-bold bg-rose-100/70 px-2 py-0.5 rounded">
                        दर्ज उपस्थिति: {w.attendancePercent}% (न्यूनतम आवश्यक: 80%)
                      </span>
                    </div>

                    <button
                      onClick={() => setWarningToPrint(w)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                      title="Print official signed government order notice"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                      <span>शासकीय आदेश प्रपत्र प्रिंट करें (Print Order)</span>
                    </button>
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setSelectedRegister('workshop_inventory');
                  setActiveTab('reports');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors shadow-xs"
                title="View Official Form VIII Workshop Inventory & Stock Register"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                <span>Form VIII Stock Register</span>
              </button>
              <button
                onClick={() => {
                  setSelectedRegister('tools_equipments');
                  setActiveTab('reports');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors shadow-xs"
                title="View Official Form IX DGT Tools & Machinery Compliance Register"
              >
                <Wrench className="w-3.5 h-3.5 text-slate-700" />
                <span>Form IX DGT Tools Register</span>
              </button>
              <button
                onClick={() => handleOpenInventoryModal()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Equipment / Tool</span>
              </button>
            </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setSelectedRegister('indent_register');
                  setActiveTab('reports');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors shadow-xs"
                title="View Official Form X Workshop Tool Indent & Issue-Return Register"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                <span>Form X Indent Register</span>
              </button>
              <button
                onClick={handleOpenIndentModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Issue New Tool Indent</span>
              </button>
            </div>
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

              <div>
                <label className="block font-medium mb-1">
                  Student / Official Email (ईमेल पता)
                </label>
                <input
                  type="email"
                  value={traineeForm.email}
                  onChange={(e) => setTraineeForm({ ...traineeForm, email: e.target.value })}
                  placeholder="e.g. trainee@student.iti.cg.in"
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Used for Trainee portal sign-in and receiving password recovery tokens.
                </p>
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

      {/* MODAL: ISSUE WARNING - BILINGUAL HINDI & ENGLISH */}
      {warningModalOpen && warningTrainee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 text-xs text-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Issue Official Warning Notice · शासकीय चेतावनी आदेश जारी करें
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़ (छ.ग.) · NCVT उपस्थिति अनुपालन
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWarningModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Trainee Target Info Card */}
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-rose-700">लक्ष्य प्रशिक्षु (Candidate):</span>
                <div className="font-extrabold text-slate-900 text-xs mt-0.5">
                  {warningTrainee.name} ({warningTrainee.rollNo})
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-rose-700">दर्ज उपस्थिति (Attendance):</span>
                <div className="text-base font-extrabold font-mono text-rose-700">
                  {warningTrainee.percent}% <span className="text-[10px] font-sans text-rose-600 font-semibold">(मानक &lt; 80%)</span>
                </div>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="mb-4">
              <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">
                त्वरित शासकीय प्रारूप चुनें (Select Official Preset):
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyWarningTemplate('standard')}
                  className="p-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-left font-semibold text-[11px] transition-colors"
                >
                  <div className="font-bold">1. मानक चेतावनी (Standard Warning)</div>
                  <div className="text-[10px] text-amber-700 font-normal">80% मानक से कम उपस्थिति हेतु प्रथम शासकीय सूचना</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyWarningTemplate('final')}
                  className="p-2 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-900 text-left font-semibold text-[11px] transition-colors"
                >
                  <div className="font-bold">2. अंतिम चेतावनी (Final Debarment Notice)</div>
                  <div className="text-[10px] text-rose-700 font-normal">परीक्षा से निष्कासन/वंचित करने संबंधी अंतिम सूचना</div>
                </button>
              </div>
            </div>

            <form onSubmit={handleIssueWarning} className="space-y-4">
              {/* Hindi Notice Section */}
              <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <span>🇮🇳</span>
                    <span>कार्यालयीन हिन्दी प्रारूप (Official Hindi Notice)</span>
                  </span>
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                    अनिवार्य शासकीय भाषा
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1 text-[11px]">
                    विषय (Hindi Subject):
                  </label>
                  <input
                    type="text"
                    value={warningSubjectHindi}
                    onChange={(e) => setWarningSubjectHindi(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-300 bg-white rounded-lg text-xs font-medium focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1 text-[11px]">
                    आदेश / निर्देश पत्रक (Hindi Directive Notice Body):
                  </label>
                  <textarea
                    rows={4}
                    value={warningMessageHindi}
                    onChange={(e) => setWarningMessageHindi(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-300 bg-white rounded-lg text-xs leading-relaxed focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              {/* English Notice Section */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    English Version Directive (DGT Record)
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                    Warning Subject:
                  </label>
                  <input
                    type="text"
                    value={warningSubject}
                    onChange={(e) => setWarningSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                    Official Directive Body:
                  </label>
                  <textarea
                    rows={3}
                    value={warningMessage}
                    onChange={(e) => setWarningMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs leading-relaxed"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setWarningModalOpen(false)}
                  className="flex-1 py-2.5 px-3 border border-slate-300 rounded-xl hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 px-4 bg-rose-700 hover:bg-rose-800 text-white font-extrabold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>द्विभाषी आदेश जारी करें (Issue Notice)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRINT OFFICIAL GOVERNMENT NOTICE ORDER */}
      {warningToPrint && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-2xl w-full p-6 sm:p-8 text-xs text-slate-900 max-h-[92vh] overflow-y-auto">
            {/* Action Bar */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5 print:hidden">
              <span className="text-xs font-bold text-slate-700">
                शासकीय आदेश प्रपत्र (Official Government Notice Preview)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-4 h-4 text-amber-400" />
                  <span>प्रिंट करें (Print)</span>
                </button>
                <button
                  onClick={() => setWarningToPrint(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Signed Letterhead */}
            <div className="p-6 border-2 border-slate-300 bg-white rounded-xl space-y-4">
              {/* Header Strip */}
              <div className="text-center border-b-2 border-slate-900 pb-3">
                <div className="w-12 h-12 mx-auto mb-1">
                  <img
                    src="/assets/aistudio/iti-logo_b32addc6.png"
                    alt="Govt ITI Emblem"
                    className="w-full h-full object-contain mx-auto"
                  />
                </div>
                <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                  शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़ (छत्तीसगढ़)
                </h2>
                <h3 className="text-xs font-bold text-slate-700 leading-tight">
                  GOVERNMENT INDUSTRIAL TRAINING INSTITUTE, RAIGARH (C.G.)
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  रोजगार एवं प्रशिक्षण संचालनालय, छत्तीसगढ़ शासन · संबद्धता: DGT / NCVT (Code: ITI-RAI-CG-04)
                </p>
                <p className="text-[10px] text-slate-500">
                  चक्रधर नगर, औद्योगिक क्षेत्र, बोईरदादर, रायगढ़ (छ.ग.)
                </p>
              </div>

              {/* Dispatch Info */}
              <div className="flex justify-between items-center text-[11px] font-mono border-b border-slate-200 pb-2">
                <div>
                  <strong>क्रमांक:</strong> {warningToPrint.refNumber}
                </div>
                <div>
                  <strong>दिनांक:</strong> {warningToPrint.issuedDate}
                </div>
              </div>

              {/* Addressee */}
              <div className="text-[11px] space-y-0.5">
                <div><strong>प्रति (To),</strong></div>
                <div className="pl-4">
                  <div><strong>प्रशिक्षु का नाम:</strong> {warningToPrint.traineeName}</div>
                  <div><strong>रोल नंबर (Roll No):</strong> {warningToPrint.rollNo}</div>
                  <div><strong>ट्रेड (Trade):</strong> {warningToPrint.tradeName || currentTrade?.name}</div>
                  <div><strong>संस्था:</strong> शासकीय आईटीआई रायगढ़ (छ.ग.)</div>
                </div>
              </div>

              {/* Subject */}
              <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-[11px] font-bold">
                <div>विषय: {warningToPrint.subjectHindi || warningToPrint.subject}</div>
                <div className="text-[10px] text-slate-600 font-normal mt-0.5">
                  Sub: {warningToPrint.subject}
                </div>
              </div>

              {/* Body */}
              <div className="text-xs leading-relaxed space-y-2 text-justify">
                <p className="font-medium text-slate-900">
                  उपरोक्त विषयान्तर्गत लेख है कि सत्र 2025-2026 के अंतर्गत आपकी अब तक की कुल उपस्थिति{' '}
                  <strong className="text-rose-700 font-mono underline">{warningToPrint.attendancePercent}%</strong> दर्ज की गई है, जो कि DGT / NCVT के न्यूनतम अनिवार्य मानक <strong className="underline">80%</strong> से अत्यंत कम है।
                </p>

                <p className="text-slate-800 bg-slate-50 p-3 rounded border border-slate-200">
                  {warningToPrint.messageHindi || warningToPrint.message}
                </p>

                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[11px] text-slate-600 italic">
                  <strong>English Directive:</strong> {warningToPrint.message}
                </div>
              </div>

              {/* Signatory Block */}
              <div className="pt-6 flex justify-between items-end text-[11px]">
                <div className="text-left space-y-1">
                  <div className="text-[10px] text-slate-500 font-mono">
                    पावती स्थिति: <strong>{warningToPrint.status.toUpperCase()}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    डिजिटल सत्यापन कोड: <span className="font-mono">ITI-RAI-CG-ATT-VERIFIED</span>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <div className="h-10 flex items-center justify-center font-serif italic text-slate-400 text-xs">
                    (हस्ताक्षरित)
                  </div>
                  <div className="font-extrabold text-slate-900">{warningToPrint.officerName}</div>
                  <div className="text-slate-600 font-medium">प्रशिक्षण अधिकारी (Training Officer)</div>
                  <div className="text-[10px] text-slate-500">शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़</div>
                </div>
              </div>

              {/* Endorsement */}
              <div className="pt-3 border-t border-slate-200 text-[10px] text-slate-500 space-y-0.5">
                <div><strong>प्रतिलिपि सूचनार्थ एवं आवश्यक कार्यवाही हेतु:</strong></div>
                <div className="pl-3">
                  <div>1. प्राचार्य, शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़ (छ.ग.)।</div>
                  <div>2. अभिभावक / पालक, संबंधित छात्र/छात्रा।</div>
                  <div>3. कार्यालयीन नोटिस बोर्ड / छात्र संचिका।</div>
                </div>
              </div>
            </div>
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
      {/* MODAL: OFFICER PROFILE & EMAIL EDIT */}
      {officerProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Mail className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Edit Officer Profile &amp; Email
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    प्रशिक्षण अधिकारी प्रोफ़ाइल व ईमेल पता
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOfficerProfileModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOfficerProfile} className="space-y-3.5">
              <div>
                <label className="block font-semibold mb-1 text-slate-700">Officer Name</label>
                <input
                  type="text"
                  value={officerProfileForm.name}
                  onChange={(e) => setOfficerProfileForm({ ...officerProfileForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Official Email ID (ईमेल पता)</label>
                <input
                  type="email"
                  value={officerProfileForm.email}
                  onChange={(e) => setOfficerProfileForm({ ...officerProfileForm, email: e.target.value })}
                  placeholder="officer@iti.cg.gov.in"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-emerald-500"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  This email is used for officer portal authentication and password recovery security tokens.
                </p>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Mobile Number (मोबाइल नंबर)</label>
                <input
                  type="text"
                  value={officerProfileForm.mobile}
                  onChange={(e) => setOfficerProfileForm({ ...officerProfileForm, mobile: e.target.value })}
                  placeholder="+91 98260 00000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs"
                  required
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOfficerProfileModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOfficerProfile}
                  className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {savingOfficerProfile ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Changes</span>
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

