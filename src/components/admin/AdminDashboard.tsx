import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CalendarDays,
  Layers,
  Users,
  Settings,
  Shield,
  ShieldAlert,
  Plus,
  Edit2,
  Trash2,
  KeyRound,
  Check,
  CheckCircle2,
  X,
  MapPin,
  Clock,
  Compass,
  FileText,
  AlertCircle,
  Building,
  RefreshCw,
  Sparkles,
  Save,
  Star,
  StarOff,
  ChevronDown,
  Menu,
} from 'lucide-react';
import {
  AcademicSession,
  MonthlyWorkingDay,
  Trade,
  TrainingOfficer,
  SystemSettings,
  AuditLog,
} from '../../types.ts';
import {
  fetchSessions,
  createSession,
  updateSession,
  deleteSession,
  setDefaultSession,
  fetchMonthlyWorkingDays,
  saveMonthlyWorkingDay,
  saveBulkMonthlyWorkingDays,
  deleteMonthlyWorkingDay,
  fetchTrades,
  createTrade,
  updateTrade,
  deleteTrade,
  fetchOfficers,
  createOfficer,
  updateOfficer,
  resetOfficerPassword,
  deleteOfficer,
  updateSettings,
  fetchAuditLogs,
  resetDatabase,
} from '../../api.ts';

interface AdminDashboardProps {
  settings: SystemSettings;
  onSettingsUpdate: (newSettings: SystemSettings) => void;
}

type AdminTab = 'overview' | 'sessions' | 'working_days' | 'trades' | 'officers' | 'rules' | 'audit';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ settings, onSettingsUpdate }) => {
  // Persistent active tab across page refreshes
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    try {
      const saved = localStorage.getItem('iti_admin_active_tab');
      if (saved && ['overview', 'sessions', 'working_days', 'trades', 'officers', 'rules', 'audit'].includes(saved)) {
        return saved as AdminTab;
      }
    } catch (e) {}
    return 'overview';
  });

  useEffect(() => {
    try {
      localStorage.setItem('iti_admin_active_tab', activeTab);
    } catch (e) {}
  }, [activeTab]);

  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setTimeout(() => {
      const el = document.getElementById('admin-content-viewport');
      if (el) {
        const headerOffset = 115;
        const elementPosition = el.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - headerOffset;
        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth',
        });
      }
    }, 60);
  };

  // Data states
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [monthlyDays, setMonthlyDays] = useState<MonthlyWorkingDay[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [officers, setOfficers] = useState<TrainingOfficer[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Modals
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<AcademicSession | null>(null);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [officerModalOpen, setOfficerModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<TrainingOfficer | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordOfficer, setPasswordOfficer] = useState<TrainingOfficer | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const [calibratingGps, setCalibratingGps] = useState(false);

  // Selected session for monthly working days
  const [selectedSessionId, setSelectedSessionId] = useState(settings.currentSessionId || '');
  const [editableMonthlyDays, setEditableMonthlyDays] = useState<MonthlyWorkingDay[]>([]);
  const [savingWorkingDays, setSavingWorkingDays] = useState(false);
  const [showAddMonthRow, setShowAddMonthRow] = useState(false);
  const [newMonthForm, setNewMonthForm] = useState({
    month: '',
    workingDays: 22,
    holidays: 8,
    totalDays: 30,
    remarks: '',
  });

  // Form states
  const [sessionForm, setSessionForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    totalWorkingDays: 240,
    status: 'active' as 'active' | 'upcoming' | 'completed',
    setAsDefault: false,
  });

  const [tradeForm, setTradeForm] = useState({
    name: '',
    code: '',
    durationYears: 2,
    sanctionedUnits: 2,
    totalIntake: 40,
    workshopLocation: '',
    description: '',
    status: 'active' as 'active' | 'inactive',
  });

  const [officerForm, setOfficerForm] = useState({
    name: '',
    email: '',
    mobile: '',
    employeeId: '',
    assignedTradeIds: [] as string[],
    designation: 'Training Officer',
    qualification: 'Diploma/B.Tech, CITS Certified',
    status: 'active' as 'active' | 'inactive',
    password: 'officer123',
  });

  // Settings form
  const [settingsForm, setSettingsForm] = useState(settings);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(''), 4000);
  };

  const handleCaptureAdminLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser or device.');
      return;
    }
    setCalibratingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCalibratingGps(false);
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy);
        setSettingsForm((prev) => ({
          ...prev,
          campusLocation: {
            ...prev.campusLocation,
            lat,
            lng,
          },
        }));
        showToast(`Captured precise GPS position: ${lat}°N, ${lng}°E (±${acc}m accuracy)`);
      },
      (err) => {
        setCalibratingGps(false);
        alert(`Could not acquire GPS position: ${err.message}. Please allow Location access in browser.`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const reloadData = async () => {
    setLoading(true);
    try {
      const [sList, tList, oList, aList] = await Promise.all([
        fetchSessions(),
        fetchTrades(),
        fetchOfficers(),
        fetchAuditLogs(),
      ]);
      setSessions(sList);
      setTrades(tList);
      setOfficers(oList);
      setAuditLogs(aList);
      if (sList.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sList[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadData();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      fetchMonthlyWorkingDays(selectedSessionId).then((days) => {
        setMonthlyDays(days);
        setEditableMonthlyDays(days);
      });
    } else {
      setMonthlyDays([]);
      setEditableMonthlyDays([]);
    }
  }, [selectedSessionId]);

  // Helper to generate 12 monthly slots based on session dates
  const generateMonthsForSession = (session: AcademicSession): MonthlyWorkingDay[] => {
    let monthsList: string[] = [];

    if (session.startDate && session.endDate) {
      const start = new Date(session.startDate);
      const end = new Date(session.endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        let current = new Date(start.getFullYear(), start.getMonth(), 1);
        const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
        while (current <= endMonth) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          monthsList.push(`${y}-${m}`);
          current.setMonth(current.getMonth() + 1);
        }
      }
    }

    if (monthsList.length === 0) {
      const match = session.name.match(/(\d{4})/);
      const startYear = match ? parseInt(match[1]) : new Date().getFullYear();
      for (let i = 8; i <= 12; i++) {
        monthsList.push(`${startYear}-${String(i).padStart(2, '0')}`);
      }
      for (let i = 1; i <= 7; i++) {
        monthsList.push(`${startYear + 1}-${String(i).padStart(2, '0')}`);
      }
    }

    const defaultRemarks: Record<string, string> = {
      '01': 'Republic Day, Cherchera Festival',
      '02': 'Maha Shivratri, Mid-term Evaluation',
      '03': 'Holi Festival Break',
      '04': 'Ambedkar Jayanti, Ram Navami',
      '05': 'Trade Practical Assessments & Training',
      '06': 'Workshop Practice Sessions',
      '07': 'AITT Annual Exam Preparation',
      '08': 'Independence Day, Session Commencement',
      '09': 'Vishwakarma Puja, Ganesh Chaturthi',
      '10': 'Gandhi Jayanti, Dussehra, Diwali Break',
      '11': 'CG State Foundation Day, Guru Nanak Jayanti',
      '12': 'Guru Ghasidas Jayanti, Winter Break',
    };

    return monthsList.map((mStr, index) => {
      const [yearStr, monthStr] = mStr.split('-');
      const y = parseInt(yearStr);
      const m = parseInt(monthStr);
      const totalDays = new Date(y, m, 0).getDate();
      const holidays = m === 10 ? 10 : m === 8 ? 8 : m === 1 ? 8 : 7;
      const workingDays = totalDays - holidays;

      return {
        id: `temp_${Date.now()}_${index}`,
        sessionId: session.id,
        month: mStr,
        totalDays,
        workingDays,
        holidays,
        remarks: defaultRemarks[monthStr] || 'Regular trade training and workshop practicals',
      };
    });
  };

  // Session Handlers
  const handleOpenSessionModal = (session?: AcademicSession) => {
    if (session) {
      setEditingSession(session);
      setSessionForm({
        name: session.name,
        startDate: session.startDate,
        endDate: session.endDate,
        totalWorkingDays: session.totalWorkingDays,
        status: session.status,
        setAsDefault: session.id === settings.currentSessionId,
      });
    } else {
      setEditingSession(null);
      // Cleared default fields for new session
      setSessionForm({
        name: '',
        startDate: '',
        endDate: '',
        totalWorkingDays: 240,
        status: 'active',
        setAsDefault: false,
      });
    }
    setSessionModalOpen(true);
  };

  const handleSetDefaultSession = async (sessionId: string) => {
    try {
      await setDefaultSession(sessionId);
      const updatedSettings = { ...settings, currentSessionId: sessionId };
      onSettingsUpdate(updatedSettings);
      setSettingsForm(updatedSettings);
      showToast(sessionId ? 'Default active session updated successfully' : 'Default active session cleared');
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleClearDefaultSession = async () => {
    try {
      await setDefaultSession('');
      const updatedSettings = { ...settings, currentSessionId: '' };
      onSettingsUpdate(updatedSettings);
      setSettingsForm(updatedSettings);
      showToast('Default active session cleared successfully');
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let savedSessionId = '';
      if (editingSession) {
        await updateSession(editingSession.id, {
          name: sessionForm.name,
          startDate: sessionForm.startDate,
          endDate: sessionForm.endDate,
          totalWorkingDays: Number(sessionForm.totalWorkingDays) || 240,
          status: sessionForm.status,
        });
        savedSessionId = editingSession.id;
        showToast('Academic Session updated successfully');
      } else {
        const res = await createSession({
          name: sessionForm.name,
          startDate: sessionForm.startDate,
          endDate: sessionForm.endDate,
          totalWorkingDays: Number(sessionForm.totalWorkingDays) || 240,
          status: sessionForm.status,
        });
        savedSessionId = res.session?.id || '';
        showToast('New Academic Session created successfully');
      }

      if (sessionForm.setAsDefault && savedSessionId) {
        await setDefaultSession(savedSessionId);
        const updated = { ...settings, currentSessionId: savedSessionId };
        onSettingsUpdate(updated);
        setSettingsForm(updated);
        setSelectedSessionId(savedSessionId);
      } else if (!sessionForm.setAsDefault && editingSession && editingSession.id === settings.currentSessionId) {
        await setDefaultSession('');
        const updated = { ...settings, currentSessionId: '' };
        onSettingsUpdate(updated);
        setSettingsForm(updated);
      }

      setSessionModalOpen(false);
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      await deleteSession(id);
      showToast('Session deleted successfully');
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Trade Handlers
  const handleOpenTradeModal = (trade?: Trade) => {
    if (trade) {
      setEditingTrade(trade);
      setTradeForm({
        name: trade.name,
        code: trade.code,
        durationYears: trade.durationYears,
        sanctionedUnits: trade.sanctionedUnits,
        totalIntake: trade.totalIntake,
        workshopLocation: trade.workshopLocation,
        description: trade.description,
        status: trade.status,
      });
    } else {
      setEditingTrade(null);
      setTradeForm({
        name: '',
        code: '',
        durationYears: 2,
        sanctionedUnits: 2,
        totalIntake: 40,
        workshopLocation: 'Workshop Bay 1',
        description: '',
        status: 'active',
      });
    }
    setTradeModalOpen(true);
  };

  const handleSaveTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTrade) {
        await updateTrade(editingTrade.id, tradeForm);
        showToast(`Trade ${tradeForm.name} updated successfully`);
      } else {
        await createTrade(tradeForm);
        showToast(`Trade ${tradeForm.name} added successfully`);
      }
      setTradeModalOpen(false);
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteTrade = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trade?')) return;
    try {
      await deleteTrade(id);
      showToast('Trade deleted successfully');
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Officer Handlers
  const handleOpenOfficerModal = (officer?: TrainingOfficer) => {
    if (officer) {
      setEditingOfficer(officer);
      setOfficerForm({
        name: officer.name,
        email: officer.email,
        mobile: officer.mobile,
        employeeId: officer.employeeId,
        assignedTradeIds: Array.isArray(officer.assignedTradeIds) ? officer.assignedTradeIds : [],
        designation: officer.designation,
        qualification: officer.qualification,
        status: officer.status,
        password: 'officer123',
      });
    } else {
      setEditingOfficer(null);
      setOfficerForm({
        name: '',
        email: '',
        mobile: '',
        employeeId: `CG-ITI-TO-${Math.floor(1000 + Math.random() * 9000)}`,
        assignedTradeIds: trades.length > 0 ? [trades[0].id] : [],
        designation: 'Training Officer',
        qualification: 'Diploma/B.Tech (Engg), CITS Certified',
        status: 'active',
        password: 'officer123',
      });
    }
    setOfficerModalOpen(true);
  };

  const handleSaveOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...officerForm,
        assignedTradeIds: Array.isArray(officerForm.assignedTradeIds) ? officerForm.assignedTradeIds : [],
      };
      if (editingOfficer) {
        await updateOfficer(editingOfficer.id, payload);
        showToast(`Officer ${officerForm.name} updated successfully (${payload.assignedTradeIds.length} trade(s) assigned)`);
      } else {
        await createOfficer(payload);
        showToast(`Officer account created for ${officerForm.name}`);
      }
      setOfficerModalOpen(false);
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleOfficerStatus = async (officer: TrainingOfficer) => {
    const nextStatus = officer.status === 'active' ? 'inactive' : 'active';
    try {
      await updateOfficer(officer.id, { status: nextStatus });
      showToast(`Officer ${officer.name} marked ${nextStatus}`);
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenPasswordModal = (officer: TrainingOfficer) => {
    setPasswordOfficer(officer);
    setNewPassword('officer123');
    setPasswordModalOpen(true);
  };

  const handleSavePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordOfficer) return;
    try {
      await resetOfficerPassword(passwordOfficer.id, newPassword);
      showToast(`Password reset for ${passwordOfficer.name}`);
      setPasswordModalOpen(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteOfficer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this officer account?')) return;
    try {
      await deleteOfficer(id);
      showToast('Officer account deleted successfully');
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Working Days Handlers
  const handleGenerateMonths = () => {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session) {
      alert('Please select a valid academic session.');
      return;
    }
    const generated = generateMonthsForSession(session);
    setEditableMonthlyDays(generated);
    showToast(`Generated 12 monthly slots for ${session.name}. Review below and click "Save Monthly Working Days"!`);
  };

  const handleSaveBulkMonthlyDays = async () => {
    if (!selectedSessionId) {
      alert('Please select an Academic Session first.');
      return;
    }
    if (editableMonthlyDays.length === 0) {
      alert('No monthly records to save. Click "Auto-Generate 12 Months" or "+ Add Month".');
      return;
    }
    setSavingWorkingDays(true);
    try {
      await saveBulkMonthlyWorkingDays(selectedSessionId, editableMonthlyDays);
      const session = sessions.find((s) => s.id === selectedSessionId);
      showToast(`Saved ${editableMonthlyDays.length} months for ${session?.name || 'session'} successfully!`);
      const updated = await fetchMonthlyWorkingDays(selectedSessionId);
      setMonthlyDays(updated);
      setEditableMonthlyDays(updated);
      reloadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save monthly working days');
    } finally {
      setSavingWorkingDays(false);
    }
  };

  const handleAddCustomMonth = () => {
    if (!newMonthForm.month) {
      alert('Please select a valid Month (YYYY-MM).');
      return;
    }
    if (editableMonthlyDays.some((m) => m.month === newMonthForm.month)) {
      alert(`Month ${newMonthForm.month} is already in the list for this session.`);
      return;
    }
    const [yStr, mStr] = newMonthForm.month.split('-');
    const totalDays = new Date(parseInt(yStr), parseInt(mStr), 0).getDate();
    const newEntry: MonthlyWorkingDay = {
      id: `temp_${Date.now()}`,
      sessionId: selectedSessionId,
      month: newMonthForm.month,
      totalDays,
      workingDays: Number(newMonthForm.workingDays) || 22,
      holidays: Number(newMonthForm.holidays) || 8,
      remarks: newMonthForm.remarks || '',
    };

    const updated = [...editableMonthlyDays, newEntry].sort((a, b) => a.month.localeCompare(b.month));
    setEditableMonthlyDays(updated);
    setShowAddMonthRow(false);
    setNewMonthForm({ month: '', workingDays: 22, holidays: 8, totalDays: 30, remarks: '' });
    showToast(`Added ${newEntry.month}. Click "Save Monthly Working Days" to persist.`);
  };

  const handleDeleteMonthEntry = async (item: MonthlyWorkingDay, idx: number) => {
    const updated = editableMonthlyDays.filter((_, i) => i !== idx);
    setEditableMonthlyDays(updated);
    if (item.id && !item.id.startsWith('temp_')) {
      try {
        await deleteMonthlyWorkingDay(item.id);
        showToast(`Deleted ${item.month} from database`);
        const latest = await fetchMonthlyWorkingDays(selectedSessionId);
        setMonthlyDays(latest);
      } catch (err: any) {
        console.error(err);
      }
    }
  };

  const handleUpdateMonthField = (index: number, field: keyof MonthlyWorkingDay, val: any) => {
    setEditableMonthlyDays((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleSaveMonthDay = async (month: string, days: number, holidays: number, remarks: string) => {
    try {
      await saveMonthlyWorkingDay({
        sessionId: selectedSessionId,
        month,
        workingDays: days,
        holidays,
        remarks,
      });
      showToast(`Updated working days for ${month}`);
      const updated = await fetchMonthlyWorkingDays(selectedSessionId);
      setMonthlyDays(updated);
      setEditableMonthlyDays(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await updateSettings(settingsForm);
      onSettingsUpdate(res.settings);
      showToast('System configuration & campus geofence updated successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetData = async () => {
    if (!confirm('Reset entire database to original Govt ITI Raigarh default seed state? This is useful for clean demonstrations.')) return;
    try {
      await resetDatabase();
      showToast('Database reset to defaults successfully');
      reloadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-700 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Profile & Summary Strip */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-md">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Principal &amp; Administrator Console
              </h2>
              <p className="text-xs text-slate-500">
                Government ITI Raigarh (C.G.) · Institutional Administration
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reloadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
          <button
            onClick={handleResetData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors font-medium"
          >
            <span>Reset Demo Data</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Header & Collapsible Submenu (< lg) */}
      <div className="lg:hidden space-y-2">
        {/* Mobile Nav Top Bar */}
        <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl shadow-md shrink-0">
              {activeTab === 'overview' && <Building className="w-4 h-4" />}
              {activeTab === 'sessions' && <Calendar className="w-4 h-4" />}
              {activeTab === 'working_days' && <CalendarDays className="w-4 h-4" />}
              {activeTab === 'trades' && <Layers className="w-4 h-4" />}
              {activeTab === 'officers' && <Users className="w-4 h-4" />}
              {activeTab === 'rules' && <Settings className="w-4 h-4" />}
              {activeTab === 'audit' && <ShieldAlert className="w-4 h-4" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold">
                  Active Section
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-[10px] text-slate-400 truncate">Admin Portal</span>
              </div>
              <h3 className="font-extrabold text-sm text-white truncate">
                {activeTab === 'overview' && 'System Overview'}
                {activeTab === 'sessions' && 'Academic Sessions'}
                {activeTab === 'working_days' && 'Monthly Working Days'}
                {activeTab === 'trades' && 'Trade Management'}
                {activeTab === 'officers' && 'Officers & Accounts'}
                {activeTab === 'rules' && 'Campus Geofence & Rules'}
                {activeTab === 'audit' && 'Audit Trail Logs'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              mobileMenuOpen
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 ring-2 ring-blue-400/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            <Menu className="w-4 h-4 text-blue-400" />
            <span>{mobileMenuOpen ? 'Close / बंद' : 'Menu / मेनू'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                mobileMenuOpen ? 'rotate-180 text-white' : 'text-slate-400'
              }`}
            />
          </button>
        </div>

        {/* Collapsible Mobile Submenu Panel - Slides smoothly down BELOW the menu bar */}
        {mobileMenuOpen && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-3.5 space-y-4 max-h-[65vh] overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-800 text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Select Section / अनुभाग चुनें</span>
              <span className="text-[10px] text-blue-400 font-mono">Govt ITI Raigarh</span>
            </div>

            {/* Section 1: Academic Core */}
            <div className="space-y-1">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-2 mb-1 flex items-center justify-between">
                <span>Academic Core</span>
                <span className="text-slate-500 font-normal">कैलेंडर व सत्र</span>
              </div>
              {[
                { id: 'overview', label: 'System Overview', hindi: 'सिस्टम विवरण', icon: Building },
                { id: 'sessions', label: 'Academic Sessions', hindi: 'शैक्षणिक सत्र', icon: Calendar, badge: sessions.length },
                { id: 'working_days', label: 'Monthly Working Days', hindi: 'मासिक कार्य दिवस', icon: CalendarDays, badge: monthlyDays.length > 0 ? `${monthlyDays.length}` : undefined },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id as AdminTab)}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-950/50 ring-1 ring-blue-400'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-blue-400'}`} />
                      <div className="flex flex-col text-left truncate">
                        <span className="text-xs leading-tight font-extrabold truncate">{item.label}</span>
                        <span className={`text-[10px] leading-tight font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {item.hindi}
                        </span>
                      </div>
                    </div>
                    {item.badge !== undefined && (
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Section 2: Faculty & Trades */}
            <div className="space-y-1 pt-2 border-t border-slate-800">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-2 mb-1 flex items-center justify-between">
                <span>Faculty &amp; Trades</span>
                <span className="text-slate-500 font-normal">स्टाफ व ट्रेड</span>
              </div>
              {[
                { id: 'trades', label: 'Trade Management', hindi: 'ट्रेड प्रबंधन', icon: Layers, badge: trades.length },
                { id: 'officers', label: 'Officers & Accounts', hindi: 'प्रशिक्षण अधिकारी व खाते', icon: Users, badge: officers.length },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id as AdminTab)}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-950/50 ring-1 ring-blue-400'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-indigo-400'}`} />
                      <div className="flex flex-col text-left truncate">
                        <span className="text-xs leading-tight font-extrabold truncate">{item.label}</span>
                        <span className={`text-[10px] leading-tight font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {item.hindi}
                        </span>
                      </div>
                    </div>
                    {item.badge !== undefined && (
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Section 3: Governance */}
            <div className="space-y-1 pt-2 border-t border-slate-800">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-2 mb-1 flex items-center justify-between">
                <span>Governance</span>
                <span className="text-slate-500 font-normal">नियम व सुरक्षा</span>
              </div>
              {[
                { id: 'rules', label: 'Campus Geofence & Rules', hindi: 'जियोफेंस एवं नियम', icon: Settings },
                { id: 'audit', label: 'Audit Trail Logs', hindi: 'ऑडिट ट्रेल', icon: ShieldAlert, badge: auditLogs.length > 0 ? auditLogs.length : undefined },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id as AdminTab)}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-950/50 ring-1 ring-blue-400'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-cyan-400'}`} />
                      <div className="flex flex-col text-left truncate">
                        <span className="text-xs leading-tight font-extrabold truncate">{item.label}</span>
                        <span className={`text-[10px] leading-tight font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {item.hindi}
                        </span>
                      </div>
                    </div>
                    {item.badge !== undefined && (
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Government Portal Layout: Vertical Side Panel Navigation + Main Content Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Vertical Side Panel Navigation (Desktop Only) */}
        <aside className="hidden lg:block lg:col-span-3 bg-slate-900 rounded-2xl shadow-xl border border-slate-800 p-4 space-y-5 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto scrollbar-thin">
          {/* Header Strip in Sidebar */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800 px-1">
            <span className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl shadow-md ring-1 ring-blue-400/30">
              <Shield className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h4 className="font-extrabold text-sm text-white tracking-tight truncate">
                Admin Control Panel
              </h4>
              <p className="text-[10px] text-blue-300 font-medium">
                शासकीय प्रशासन · ITI Raigarh
              </p>
            </div>
          </div>

          {/* Active Session Status Widget */}
          <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                Active Session
              </span>
              <span className="font-bold text-white text-[11px] truncate">
                {sessions.find((s) => s.status === 'active')?.name || '2025-2026'}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              Online
            </span>
          </div>

          <div className="space-y-4 text-xs">
            {/* Section 1: Academic Calendar & Overview */}
            <div className="space-y-1">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-2 mb-1.5 flex items-center justify-between">
                <span>Academic Core</span>
                <span className="text-slate-500 font-normal">कैलेंडर व सत्र</span>
              </div>
              {[
                { id: 'overview', label: 'System Overview', hindi: 'सिस्टम विवरण', icon: Building },
                {
                  id: 'sessions',
                  label: 'Academic Sessions',
                  hindi: 'शैक्षणिक सत्र',
                  icon: Calendar,
                  badge: sessions.length,
                },
                {
                  id: 'working_days',
                  label: 'Monthly Working Days',
                  hindi: 'मासिक कार्य दिवस',
                  icon: CalendarDays,
                  badge: monthlyDays.length > 0 ? `${monthlyDays.length}` : undefined,
                },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id as AdminTab)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-950/50 ring-1 ring-blue-400'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-blue-400'}`} />
                      <div className="flex flex-col text-left truncate">
                        <span className="text-xs leading-tight font-extrabold truncate">{item.label}</span>
                        <span className={`text-[10px] leading-tight font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {item.hindi}
                        </span>
                      </div>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Section 2: Faculty & Trades */}
            <div className="space-y-1 pt-2 border-t border-slate-800">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-2 mb-1.5 flex items-center justify-between">
                <span>Faculty &amp; Trades</span>
                <span className="text-slate-500 font-normal">स्टाफ व ट्रेड</span>
              </div>
              {[
                {
                  id: 'trades',
                  label: 'Trade Management',
                  hindi: 'ट्रेड प्रबंधन',
                  icon: Layers,
                  badge: trades.length,
                },
                {
                  id: 'officers',
                  label: 'Officers & Accounts',
                  hindi: 'प्रशिक्षण अधिकारी व खाते',
                  icon: Users,
                  badge: officers.length,
                },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id as AdminTab)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-950/50 ring-1 ring-blue-400'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-indigo-400'}`} />
                      <div className="flex flex-col text-left truncate">
                        <span className="text-xs leading-tight font-extrabold truncate">{item.label}</span>
                        <span className={`text-[10px] leading-tight font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {item.hindi}
                        </span>
                      </div>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Section 3: Governance & Security */}
            <div className="space-y-1 pt-2 border-t border-slate-800">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 px-2 mb-1.5 flex items-center justify-between">
                <span>Governance</span>
                <span className="text-slate-500 font-normal">नियम व सुरक्षा</span>
              </div>
              {[
                { id: 'rules', label: 'Campus Geofence & Rules', hindi: 'जियोफेंस एवं नियम', icon: Settings },
                {
                  id: 'audit',
                  label: 'Audit Trail Logs',
                  hindi: 'ऑडिट ट्रेल',
                  icon: ShieldAlert,
                  badge: auditLogs.length > 0 ? auditLogs.length : undefined,
                },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id as AdminTab)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-950/50 ring-1 ring-blue-400'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-cyan-400'}`} />
                      <div className="flex flex-col text-left truncate">
                        <span className="text-xs leading-tight font-extrabold truncate">{item.label}</span>
                        <span className={`text-[10px] leading-tight font-normal truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {item.hindi}
                        </span>
                      </div>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Info & System Status Card at bottom of sidebar */}
          <div className="pt-3 border-t border-slate-800/80 space-y-2">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[10px] uppercase tracking-wider">
                <span>Campus Geofence</span>
                <span className="text-emerald-400 font-mono">Enforced</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Radius: <strong className="text-slate-300 font-mono">{settings.campusLocation?.radiusMeters || 1500}m</strong> perimeter around ITI Raigarh.
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main id="admin-content-viewport" className="lg:col-span-9 space-y-6 scroll-mt-28 sm:scroll-mt-32">

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-medium">Active Academic Session</span>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {sessions.find((s) => s.status === 'active')?.name || '2025-2026'}
              </div>
              <span className="text-[11px] text-emerald-600 font-medium">Session in progress</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-medium">Configured Trades</span>
              <div className="text-lg font-bold text-slate-900 mt-1 font-mono">{trades.length}</div>
              <span className="text-[11px] text-slate-500">
                {trades.reduce((acc, t) => acc + t.totalIntake, 0)} Total Sanctioned Seats
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-medium">Training Officers</span>
              <div className="text-lg font-bold text-slate-900 mt-1 font-mono">{officers.length}</div>
              <span className="text-[11px] text-slate-500">
                {officers.filter((o) => o.status === 'active').length} Active Accounts
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-medium">Attendance Window</span>
              <div className="text-lg font-bold text-blue-700 mt-1 font-mono">07:00 – 10:00 AM</div>
              <span className="text-[11px] text-slate-500">GPS Geofence Perimeter: 400m</span>
            </div>
          </div>

          {/* Institutional Blueprint */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Building className="w-4 h-4 text-blue-600" />
                <span>Government ITI Raigarh — Institution Master Profile</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-slate-500">Institute Name &amp; Code</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{settings.instituteName}</div>
                  <div className="text-slate-500 font-mono text-[11px]">NCVT Code: {settings.instituteCode}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-slate-500">Department &amp; State</div>
                  <div className="font-semibold text-slate-800 mt-0.5">{settings.department}</div>
                  <div className="text-slate-500 text-[11px]">District: {settings.district}, {settings.state}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-slate-500">Campus GPS Geotag Center</div>
                  <div className="font-semibold text-slate-800 mt-0.5 font-mono">
                    {settings.campusLocation.lat}° N, {settings.campusLocation.lng}° E
                  </div>
                  <div className="text-slate-500 text-[11px]">{settings.campusLocation.address}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="text-slate-500">NCVT Training Standards</div>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    Minimum Attendance Requirement: {settings.minimumAttendancePercent}%
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Automatic warning notice issued when trainee drops below threshold
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Recent Administrative Activity</span>
              </h3>
              <div className="space-y-2 text-xs">
                {auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/60">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">{log.action}</span>
                      <span className="font-mono">{log.timestamp}</span>
                    </div>
                    <p className="text-slate-600 text-[11px] mt-1 line-clamp-2">{log.details}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACADEMIC SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Academic Sessions</h3>
              <p className="text-xs text-slate-500">
                Configure academic batches, session duration, and minimum scheduled working days.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {settings.currentSessionId && (
                <button
                  type="button"
                  onClick={handleClearDefaultSession}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                  title="Clear the current default session"
                >
                  <StarOff className="w-3.5 h-3.5" />
                  <span>Clear Default Session</span>
                </button>
              )}
              <button
                onClick={() => handleOpenSessionModal()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Session</span>
              </button>
            </div>
          </div>

          {/* Active Default Session Status Strip */}
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-medium">Institute Active Default Session:</span>
              {settings.currentSessionId ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300">
                  <Star className="w-3.5 h-3.5 fill-emerald-500 text-emerald-600" />
                  {sessions.find((s) => s.id === settings.currentSessionId)?.name || settings.currentSessionId} (Active Default)
                </span>
              ) : (
                <span className="text-slate-500 italic bg-slate-200/80 px-2 py-0.5 rounded text-[11px]">
                  None (Default Cleared)
                </span>
              )}
            </div>
            {settings.currentSessionId && (
              <button
                onClick={handleClearDefaultSession}
                className="text-slate-500 hover:text-rose-600 text-[11px] underline font-medium"
              >
                Clear Default
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Session Name</th>
                  <th className="py-3 px-4 font-semibold">Start Date</th>
                  <th className="py-3 px-4 font-semibold">End Date</th>
                  <th className="py-3 px-4 font-semibold text-right">Scheduled Working Days</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-center">Default Active</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((sess) => {
                  const isDefault = sess.id === settings.currentSessionId;
                  return (
                    <tr key={sess.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {sess.name}
                        {isDefault && (
                          <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-medium">
                            DEFAULT
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{sess.startDate || '—'}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{sess.endDate || '—'}</td>
                      <td className="py-3 px-4 font-mono text-right font-medium text-slate-800">
                        {sess.totalWorkingDays} Days
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${
                            sess.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : sess.status === 'upcoming'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {sess.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isDefault ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-600" />
                              ACTIVE DEFAULT
                            </span>
                            <button
                              type="button"
                              onClick={handleClearDefaultSession}
                              className="text-[10px] text-slate-400 hover:text-rose-600 underline"
                              title="Clear default session"
                            >
                              Clear
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultSession(sess.id)}
                            className="text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded font-medium inline-flex items-center gap-1"
                          >
                            <Star className="w-3 h-3 text-blue-500" />
                            <span>Set as Default</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setSelectedSessionId(sess.id);
                              setActiveTab('working_days');
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1 text-[11px] font-medium"
                            title="Configure Monthly Working Days"
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Days</span>
                          </button>
                          <button
                            onClick={() => handleOpenSessionModal(sess)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit Session"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSession(sess.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Delete Session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MONTHLY WORKING DAYS */}
      {activeTab === 'working_days' && (() => {
        const currentSession = sessions.find((s) => s.id === selectedSessionId);
        const totalWorkingDaysSum = editableMonthlyDays.reduce(
          (sum, m) => sum + (Number(m.workingDays) || 0),
          0
        );
        const totalHolidaysSum = editableMonthlyDays.reduce(
          (sum, m) => sum + (Number(m.holidays) || 0),
          0
        );

        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
            {/* Header with Session Selector & Main Actions */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Monthly Working Days Configuration</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define exact scheduled working days, holidays, and practical sessions per calendar month for trainee attendance calculations.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                  <span className="text-slate-700 font-semibold">Academic Session:</span>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded font-medium text-slate-800 bg-white"
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleSaveBulkMonthlyDays}
                  disabled={savingWorkingDays || editableMonthlyDays.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
                >
                  <Save className={`w-3.5 h-3.5 ${savingWorkingDays ? 'animate-spin' : ''}`} />
                  <span>{savingWorkingDays ? 'Saving...' : 'Save Monthly Working Days'}</span>
                </button>
              </div>
            </div>

            {/* Session Summary & Target Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 font-medium block">Configured Months</span>
                <div className="text-base font-bold text-slate-800 mt-0.5 font-mono">
                  {editableMonthlyDays.length} / 12 Months
                </div>
                <span className="text-[11px] text-slate-500">
                  {currentSession?.name || 'Selected Session'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 font-medium block">Total Working Days</span>
                <div className="text-base font-bold text-blue-700 mt-0.5 font-mono">
                  {totalWorkingDaysSum} Days
                </div>
                <span className="text-[11px] text-slate-500">
                  Sum of all monthly working days
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 font-medium block">Session Goal / Target</span>
                <div className="text-base font-bold text-slate-800 mt-0.5 font-mono">
                  {currentSession?.totalWorkingDays || 240} Days
                </div>
                <span
                  className={`text-[11px] font-medium ${
                    totalWorkingDaysSum === (currentSession?.totalWorkingDays || 240)
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {totalWorkingDaysSum === (currentSession?.totalWorkingDays || 240)
                    ? 'Target exactly matched'
                    : `Diff: ${totalWorkingDaysSum - (currentSession?.totalWorkingDays || 240)} Days`}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 font-medium block">Total Holidays &amp; Breaks</span>
                <div className="text-base font-bold text-rose-600 mt-0.5 font-mono">
                  {totalHolidaysSum} Days
                </div>
                <span className="text-[11px] text-slate-500">Sundays, Festivals, State holidays</span>
              </div>
            </div>

            {/* Toolbar Buttons: Auto-Generate 12 Months & Add Month */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateMonths}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {editableMonthlyDays.length === 0
                      ? `Auto-Generate 12 Months for ${currentSession?.name || 'Session'}`
                      : 'Re-Generate Standard 12 Months'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddMonthRow(!showAddMonthRow)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddMonthRow ? 'Close Add Form' : 'Add Single Month'}</span>
                </button>
              </div>

              {editableMonthlyDays.length > 0 && (
                <div className="text-xs text-slate-500">
                  Editable fields update live. Click <strong className="text-emerald-700">"Save Monthly Working Days"</strong> to persist.
                </div>
              )}
            </div>

            {/* INLINE ADD MONTH FORM */}
            {showAddMonthRow && (
              <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-3 text-xs">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>Add New Month to {currentSession?.name || 'Selected Session'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-1 font-medium">Select Month (YYYY-MM)</label>
                    <input
                      type="month"
                      value={newMonthForm.month}
                      onChange={(e) => {
                        const mVal = e.target.value;
                        let daysInM = 30;
                        if (mVal) {
                          const [y, m] = mVal.split('-');
                          daysInM = new Date(parseInt(y), parseInt(m), 0).getDate();
                        }
                        setNewMonthForm({
                          ...newMonthForm,
                          month: mVal,
                          totalDays: daysInM,
                          workingDays: daysInM - newMonthForm.holidays,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-1 font-medium">Working Days</label>
                    <input
                      type="number"
                      min="0"
                      max={newMonthForm.totalDays || 31}
                      value={newMonthForm.workingDays}
                      onChange={(e) => setNewMonthForm({ ...newMonthForm, workingDays: parseInt(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-1 font-medium">Holidays</label>
                    <input
                      type="number"
                      min="0"
                      max={newMonthForm.totalDays || 31}
                      value={newMonthForm.holidays}
                      onChange={(e) => setNewMonthForm({ ...newMonthForm, holidays: parseInt(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-1 font-medium">Remarks / Festivals</label>
                    <input
                      type="text"
                      placeholder="e.g. State Foundation Day"
                      value={newMonthForm.remarks}
                      onChange={(e) => setNewMonthForm({ ...newMonthForm, remarks: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddMonthRow(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomMonth}
                    className="px-4 py-1.5 bg-blue-700 text-white font-medium rounded hover:bg-blue-800"
                  >
                    Add Month
                  </button>
                </div>
              </div>
            )}

            {/* EMPTY STATE: WHEN NO MONTHS CONFIGURED */}
            {editableMonthlyDays.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-4">
                <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center mx-auto">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h4 className="font-bold text-sm text-slate-900">
                    No Monthly Working Days Configured for {currentSession?.name || 'Selected Session'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    To compute trainee monthly attendance percentages and enforce 80% NCVT threshold warnings, please enter the monthly calendar for this session.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleGenerateMonths}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Auto-Generate 12 Months for {currentSession?.name || 'Session'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddMonthRow(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium rounded-lg text-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Enter Month Manually</span>
                  </button>
                </div>
              </div>
            ) : (
              /* INTERACTIVE MONTHS GRID */
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                  {editableMonthlyDays.map((m, idx) => {
                    const isExceeding =
                      (Number(m.workingDays) || 0) + (Number(m.holidays) || 0) > m.totalDays;

                    // Formatted month name e.g. "August 2025"
                    let monthTitle = m.month;
                    if (m.month && m.month.includes('-')) {
                      const [y, mn] = m.month.split('-');
                      const dateObj = new Date(parseInt(y), parseInt(mn) - 1, 1);
                      if (!isNaN(dateObj.getTime())) {
                        monthTitle = dateObj.toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        });
                      }
                    }

                    return (
                      <div
                        key={m.id || idx}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isExceeding
                            ? 'border-amber-300 bg-amber-50/40'
                            : 'border-slate-200 bg-slate-50 hover:bg-white hover:shadow-xs'
                        } space-y-2.5`}
                      >
                        <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{monthTitle}</span>
                            <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                              {m.month}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                              {m.totalDays} Total Days
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteMonthEntry(m, idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title="Delete this month"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] text-slate-600 font-semibold block mb-0.5">
                              Working Days
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={m.totalDays}
                              value={m.workingDays}
                              onChange={(e) =>
                                handleUpdateMonthField(idx, 'workingDays', Number(e.target.value))
                              }
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-semibold text-slate-900 focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-600 font-semibold block mb-0.5">
                              Holidays / Sundays
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={m.totalDays}
                              value={m.holidays}
                              onChange={(e) =>
                                handleUpdateMonthField(idx, 'holidays', Number(e.target.value))
                              }
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-semibold text-slate-900 focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>

                        {isExceeding && (
                          <div className="text-[10px] text-amber-700 bg-amber-100/70 p-1.5 rounded border border-amber-300 font-medium">
                            Warning: Working ({m.workingDays}) + Holidays ({m.holidays}) exceeds calendar days ({m.totalDays}).
                          </div>
                        )}

                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">
                            Remarks / Holidays / Practical Tests
                          </label>
                          <input
                            type="text"
                            value={m.remarks || ''}
                            onChange={(e) => handleUpdateMonthField(idx, 'remarks', e.target.value)}
                            placeholder="e.g. Independence Day, State Day, Diwali"
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-[11px] text-slate-700"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Sticky / Bottom Save Banner */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>
                      {editableMonthlyDays.length} months configured ({totalWorkingDaysSum} total working days). Remember to save changes!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveBulkMonthlyDays}
                    disabled={savingWorkingDays}
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
                  >
                    <Save className={`w-3.5 h-3.5 ${savingWorkingDays ? 'animate-spin' : ''}`} />
                    <span>{savingWorkingDays ? 'Saving Configuration...' : 'Save All Monthly Working Days'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB 4: TRADES MANAGEMENT */}
      {activeTab === 'trades' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Trade Management</h3>
              <p className="text-xs text-slate-500">
                Add, alter, or delete technical trades, workshop locations, and intake capacities.
              </p>
            </div>
            <button
              onClick={() => handleOpenTradeModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Trade</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Trade Name &amp; Code</th>
                  <th className="py-3 px-4 font-semibold">Duration</th>
                  <th className="py-3 px-4 font-semibold text-center">Sanctioned Units</th>
                  <th className="py-3 px-4 font-semibold text-center">Intake Capacity</th>
                  <th className="py-3 px-4 font-semibold">Workshop Location</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trades.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{tr.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{tr.code}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{tr.durationYears} Year(s)</td>
                    <td className="py-3 px-4 text-center font-mono font-medium text-slate-800">
                      {tr.sanctionedUnits} Units
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-medium text-slate-800">
                      {tr.totalIntake} Seats
                    </td>
                    <td className="py-3 px-4 text-slate-600">{tr.workshopLocation}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${
                          tr.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {tr.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenTradeModal(tr)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit Trade"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTrade(tr.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="Delete Trade"
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

      {/* TAB 5: TRAINING OFFICERS */}
      {activeTab === 'officers' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Training Officer Accounts</h3>
              <p className="text-xs text-slate-500">
                Manage officer profiles, assign trades, reset login passwords, and toggle active status.
              </p>
            </div>
            <button
              onClick={() => handleOpenOfficerModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Officer Account</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Officer Name &amp; Emp ID</th>
                  <th className="py-3 px-4 font-semibold">Assigned Trade(s)</th>
                  <th className="py-3 px-4 font-semibold">Contact (Mobile &amp; Email)</th>
                  <th className="py-3 px-4 font-semibold">Qualification</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Account Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {officers.map((off) => {
                  const assignedTradeNames = (off.assignedTradeIds || [])
                    .map((tid) => trades.find((t) => t.id === tid)?.name || tid)
                    .join(', ');

                  return (
                    <tr key={off.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{off.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{off.employeeId}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                          {assignedTradeNames || 'No Trade Assigned'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-800">{off.mobile}</div>
                        <div className="text-[11px] text-slate-500">{off.email}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{off.qualification}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleOfficerStatus(off)}
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded cursor-pointer transition-colors ${
                            off.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200'
                          }`}
                          title="Click to toggle Active / Inactive"
                        >
                          {off.status.toUpperCase()}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenPasswordModal(off)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                            title="Reset Officer Password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenOfficerModal(off)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Alter Profile / Trades"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteOfficer(off.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Delete Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: CAMPUS GEOFENCE & RULES */}
      {activeTab === 'rules' && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6 text-xs">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Attendance Rules &amp; Campus Geofence Configuration</h3>
            <p className="text-slate-500 mt-0.5">
              Administer physical GPS perimeter verification, daily attendance window limits, and leave quotas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Campus Geofence */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Compass className="w-4 h-4 text-blue-600" />
                  <span>Campus Location &amp; Geofence Coordinates</span>
                </div>
                <button
                  type="button"
                  onClick={handleCaptureAdminLocation}
                  disabled={calibratingGps}
                  className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md flex items-center gap-1 cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                  title="Click to automatically capture your current GPS location as the campus center"
                >
                  <MapPin className={`w-3.5 h-3.5 text-blue-600 ${calibratingGps ? 'animate-bounce' : ''}`} />
                  <span>{calibratingGps ? 'Acquiring GPS...' : '📍 Capture Current GPS'}</span>
                </button>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Campus Center Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={settingsForm.campusLocation.lat}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      campusLocation: {
                        ...settingsForm.campusLocation,
                        lat: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Campus Center Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={settingsForm.campusLocation.lng}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      campusLocation: {
                        ...settingsForm.campusLocation,
                        lng: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-slate-600">Geofence Allowed Radius (Meters)</label>
                  <div className="flex items-center gap-1">
                    {[500, 1000, 1500, 2000, 3000].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() =>
                          setSettingsForm({
                            ...settingsForm,
                            campusLocation: {
                              ...settingsForm.campusLocation,
                              radiusMeters: r,
                            },
                          })
                        }
                        className={`px-1.5 py-0.5 text-[10px] rounded border font-mono ${
                          settingsForm.campusLocation.radiusMeters === r
                            ? 'bg-blue-600 text-white border-blue-600 font-bold'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {r}m
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  value={settingsForm.campusLocation.radiusMeters}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      campusLocation: {
                        ...settingsForm.campusLocation,
                        radiusMeters: parseInt(e.target.value) || 1500,
                      },
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Trainees must be within this perimeter (currently {settingsForm.campusLocation.radiusMeters}m) to self-mark attendance. Covers all workshop bays, classrooms, and grounds.
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <label className="block text-slate-700 font-semibold mb-1">Institute Active Default Session</label>
                <div className="flex items-center gap-2">
                  <select
                    value={settingsForm.currentSessionId || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, currentSessionId: e.target.value })}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded font-medium text-slate-800"
                  >
                    <option value="">-- No Default Session (Cleared) --</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                  {settingsForm.currentSessionId && (
                    <button
                      type="button"
                      onClick={() => setSettingsForm({ ...settingsForm, currentSessionId: '' })}
                      className="px-2.5 py-2 text-rose-700 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded text-xs font-semibold whitespace-nowrap"
                    >
                      Clear Default
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Select the institution-wide default active session or leave cleared.
                </span>
              </div>
            </div>

            {/* Attendance Window & Leave Rules */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Attendance Window &amp; Minimum Threshold</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Start Time (Hour 24h)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={settingsForm.attendanceWindow.startHour}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        attendanceWindow: {
                          ...settingsForm.attendanceWindow,
                          startHour: parseInt(e.target.value) || 7,
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono"
                  />
                  <span className="text-[10px] text-slate-500">7 = 07:00 AM</span>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1">Cutoff Time (Hour 24h)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={settingsForm.attendanceWindow.endHour}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        attendanceWindow: {
                          ...settingsForm.attendanceWindow,
                          endHour: parseInt(e.target.value) || 10,
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono"
                  />
                  <span className="text-[10px] text-slate-500">10 = 10:00 AM</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">
                  Minimum NCVT Attendance Requirement (%)
                </label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={settingsForm.minimumAttendancePercent}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      minimumAttendancePercent: parseInt(e.target.value) || 80,
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Trainees below this threshold will be flagged for Training Officer warning notices.
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                <div>
                  <label className="text-[10px] text-slate-500 block">Annual CL Limit</label>
                  <input
                    type="number"
                    value={settingsForm.leaveLimits.clAnnual}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        leaveLimits: {
                          ...settingsForm.leaveLimits,
                          clAnnual: parseInt(e.target.value) || 12,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block">Annual ML Limit</label>
                  <input
                    type="number"
                    value={settingsForm.leaveLimits.medicalAnnual}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        leaveLimits: {
                          ...settingsForm.leaveLimits,
                          medicalAnnual: parseInt(e.target.value) || 15,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block">Half-Day/Month</label>
                  <input
                    type="number"
                    value={settingsForm.leaveLimits.halfDayMonthlyLimit}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        leaveLimits: {
                          ...settingsForm.leaveLimits,
                          halfDayMonthlyLimit: parseInt(e.target.value) || 4,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Administrator Security & Credentials */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4 md:col-span-2">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-800 border-b border-slate-200 pb-2">
                <Shield className="w-4 h-4 text-blue-700" />
                <span>Administrator Account Credentials</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1">Admin / Principal Name</label>
                  <input
                    type="text"
                    value={settingsForm.adminAccount?.name || 'Shri S. K. Patel (Principal / Admin)'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        adminAccount: {
                          email: settingsForm.adminAccount?.email || 'admin.iti.raigarh@cg.gov.in',
                          password: settingsForm.adminAccount?.password || 'admin123',
                          name: e.target.value,
                          mobile: settingsForm.adminAccount?.mobile || '+91 98261 45210',
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Official Login Email ID</label>
                  <input
                    type="email"
                    value={settingsForm.adminAccount?.email || 'admin.iti.raigarh@cg.gov.in'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        adminAccount: {
                          name: settingsForm.adminAccount?.name || 'Shri S. K. Patel (Principal / Admin)',
                          password: settingsForm.adminAccount?.password || 'admin123',
                          email: e.target.value,
                          mobile: settingsForm.adminAccount?.mobile || '+91 98261 45210',
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono text-slate-800"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Used for Administrator portal login and secure password recovery tokens.
                  </p>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Admin Portal Password</label>
                  <input
                    type="text"
                    value={settingsForm.adminAccount?.password || 'admin123'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        adminAccount: {
                          name: settingsForm.adminAccount?.name || 'Shri S. K. Patel (Principal / Admin)',
                          email: settingsForm.adminAccount?.email || 'admin.iti.raigarh@cg.gov.in',
                          password: e.target.value,
                          mobile: settingsForm.adminAccount?.mobile || '+91 98261 45210',
                        },
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono text-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="py-2 px-5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg transition-colors text-xs shadow-xs"
            >
              Save Configuration Changes
            </button>
          </div>
        </form>
      )}

      {/* TAB 7: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h3 className="font-bold text-sm text-slate-900">System Audit Trail</h3>
            <p className="text-xs text-slate-500">
              Complete chronological record of all administrative, officer, and trainee operations.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800 font-sans">{log.userName}</td>
                    <td className="py-2.5 px-4">
                      <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {log.userRole}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-blue-700 font-semibold">{log.action}</td>
                    <td className="py-2.5 px-4 text-slate-600 font-sans text-xs">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </main>
      </div>

      {/* MODAL: CREATE / EDIT SESSION */}
      {sessionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-4">
              {editingSession ? 'Alter Academic Session' : 'Create Academic Session'}
            </h3>
            <form onSubmit={handleSaveSession} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Session Name</label>
                <input
                  type="text"
                  value={sessionForm.name}
                  onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                  placeholder="e.g. Session 2026-2027"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Start Date</label>
                  <input
                    type="date"
                    value={sessionForm.startDate}
                    onChange={(e) => setSessionForm({ ...sessionForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">End Date</label>
                  <input
                    type="date"
                    value={sessionForm.endDate}
                    onChange={(e) => setSessionForm({ ...sessionForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Total Working Days</label>
                  <input
                    type="number"
                    value={sessionForm.totalWorkingDays}
                    onChange={(e) => setSessionForm({ ...sessionForm, totalWorkingDays: parseInt(e.target.value) || 240 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Status</label>
                  <select
                    value={sessionForm.status}
                    onChange={(e) => setSessionForm({ ...sessionForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-start gap-2 cursor-pointer p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={sessionForm.setAsDefault}
                    onChange={(e) => setSessionForm({ ...sessionForm, setAsDefault: e.target.checked })}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-[11px] leading-tight">
                    <span className="font-semibold text-slate-800 block">Set as Institute Active Default Session</span>
                    <span className="text-slate-500">
                      Trainees and Training Officers will use this academic session by default upon logging in.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSessionForm({
                      name: '',
                      startDate: '',
                      endDate: '',
                      totalWorkingDays: 240,
                      status: 'active',
                      setAsDefault: false,
                    })
                  }
                  className="px-3 py-2 border border-slate-300 rounded hover:bg-slate-100 text-slate-600"
                  title="Clear all fields"
                >
                  Clear Form
                </button>
                <button
                  type="button"
                  onClick={() => setSessionModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-blue-700 text-white font-medium rounded hover:bg-blue-800"
                >
                  Save Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT TRADE */}
      {tradeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-4">
              {editingTrade ? 'Alter Trade Details' : 'Add New Trade'}
            </h3>
            <form onSubmit={handleSaveTrade} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Trade Name</label>
                <input
                  type="text"
                  value={tradeForm.name}
                  onChange={(e) => setTradeForm({ ...tradeForm, name: e.target.value })}
                  placeholder="e.g. Wireman / Machinist"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Trade Code</label>
                  <input
                    type="text"
                    value={tradeForm.code}
                    onChange={(e) => setTradeForm({ ...tradeForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. WIR-07"
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Duration (Years)</label>
                  <select
                    value={tradeForm.durationYears}
                    onChange={(e) => setTradeForm({ ...tradeForm, durationYears: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  >
                    <option value="1">1 Year</option>
                    <option value="2">2 Years</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Sanctioned Units</label>
                  <input
                    type="number"
                    value={tradeForm.sanctionedUnits}
                    onChange={(e) => setTradeForm({ ...tradeForm, sanctionedUnits: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Intake Capacity</label>
                  <input
                    type="number"
                    value={tradeForm.totalIntake}
                    onChange={(e) => setTradeForm({ ...tradeForm, totalIntake: parseInt(e.target.value) || 20 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Workshop Location / Room</label>
                <input
                  type="text"
                  value={tradeForm.workshopLocation}
                  onChange={(e) => setTradeForm({ ...tradeForm, workshopLocation: e.target.value })}
                  placeholder="e.g. Workshop Block A - Bay 104"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTradeModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-blue-700 text-white rounded hover:bg-blue-800"
                >
                  Save Trade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT OFFICER */}
      {officerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-4">
              {editingOfficer ? 'Alter Training Officer Account' : 'Create Training Officer Account'}
            </h3>
            <form onSubmit={handleSaveOfficer} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Officer Full Name</label>
                <input
                  type="text"
                  value={officerForm.name}
                  onChange={(e) => setOfficerForm({ ...officerForm, name: e.target.value })}
                  placeholder="e.g. Er. Ramesh Chandrakar"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Official Email</label>
                  <input
                    type="email"
                    value={officerForm.email}
                    onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })}
                    placeholder="officer@iti.cg.gov.in"
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Mobile Number</label>
                  <input
                    type="text"
                    value={officerForm.mobile}
                    onChange={(e) => setOfficerForm({ ...officerForm, mobile: e.target.value })}
                    placeholder="+91 98260 00000"
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Employee ID</label>
                  <input
                    type="text"
                    value={officerForm.employeeId}
                    onChange={(e) => setOfficerForm({ ...officerForm, employeeId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Designation</label>
                  <input
                    type="text"
                    value={officerForm.designation}
                    onChange={(e) => setOfficerForm({ ...officerForm, designation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Assigned Trade(s)</label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto p-2 border border-slate-300 rounded bg-slate-50">
                  {trades.map((t) => {
                    const isSelected = (officerForm.assignedTradeIds || []).includes(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setOfficerForm({
                                ...officerForm,
                                assignedTradeIds: [...officerForm.assignedTradeIds, t.id],
                              });
                            } else {
                              setOfficerForm({
                                ...officerForm,
                                assignedTradeIds: officerForm.assignedTradeIds.filter((id) => id !== t.id),
                              });
                            }
                          }}
                        />
                        <span className="text-slate-800 font-medium">
                          {t.name} ({t.code})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {!editingOfficer && (
                <div>
                  <label className="block font-medium mb-1">Initial Password</label>
                  <input
                    type="text"
                    value={officerForm.password}
                    onChange={(e) => setOfficerForm({ ...officerForm, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
              )}

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOfficerModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-blue-700 text-white rounded hover:bg-blue-800"
                >
                  Save Officer Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {passwordModalOpen && passwordOfficer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Reset Officer Password
            </h3>
            <p className="text-slate-500 mb-4">
              Officer: {passwordOfficer.name} ({passwordOfficer.employeeId})
            </p>
            <form onSubmit={handleSavePasswordReset} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">New Password</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  required
                />
              </div>
              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-amber-600 text-white rounded hover:bg-amber-700"
                >
                  Confirm Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
