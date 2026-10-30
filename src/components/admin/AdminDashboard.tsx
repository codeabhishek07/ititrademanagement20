import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Layers,
  Users,
  Settings,
  ShieldAlert,
  Plus,
  Edit2,
  Trash2,
  KeyRound,
  Check,
  X,
  MapPin,
  Clock,
  Compass,
  FileText,
  AlertCircle,
  Building,
  RefreshCw,
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
  fetchMonthlyWorkingDays,
  saveMonthlyWorkingDay,
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
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(false);

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

  // Selected session for monthly working days
  const [selectedSessionId, setSelectedSessionId] = useState(settings.currentSessionId || '');

  // Form states
  const [sessionForm, setSessionForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    totalWorkingDays: 240,
    status: 'upcoming' as 'active' | 'upcoming' | 'completed',
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
      fetchMonthlyWorkingDays(selectedSessionId).then(setMonthlyDays);
    }
  }, [selectedSessionId]);

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
      });
    } else {
      setEditingSession(null);
      setSessionForm({
        name: `Session ${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
        startDate: `${new Date().getFullYear()}-08-01`,
        endDate: `${new Date().getFullYear() + 1}-07-31`,
        totalWorkingDays: 240,
        status: 'upcoming',
      });
    }
    setSessionModalOpen(true);
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSession) {
        await updateSession(editingSession.id, sessionForm);
        showToast('Academic Session updated successfully');
      } else {
        await createSession(sessionForm);
        showToast('New Academic Session created successfully');
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
        assignedTradeIds: officer.assignedTradeIds,
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
      if (editingOfficer) {
        await updateOfficer(editingOfficer.id, officerForm);
        showToast(`Officer ${officerForm.name} updated successfully`);
      } else {
        await createOfficer(officerForm);
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

  // Working Days save
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

      {/* Admin Tab Navigation Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200 text-xs">
        {[
          { id: 'overview', label: 'System Overview', icon: Building },
          { id: 'sessions', label: 'Academic Sessions', icon: Calendar },
          { id: 'working_days', label: 'Monthly Working Days', icon: FileText },
          { id: 'trades', label: 'Trade Management', icon: Layers },
          { id: 'officers', label: 'Training Officers & Accounts', icon: Users },
          { id: 'rules', label: 'Campus Geofence & Rules', icon: Settings },
          { id: 'audit', label: 'Audit Trail', icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`flex items-center gap-2 px-3.5 py-2 font-medium rounded-t-lg transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                isActive
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

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
            <button
              onClick={() => handleOpenSessionModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Session</span>
            </button>
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
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {sess.name}
                      {sess.id === settings.currentSessionId && (
                        <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-medium">
                          DEFAULT ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{sess.startDate}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{sess.endDate}</td>
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
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MONTHLY WORKING DAYS */}
      {activeTab === 'working_days' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Monthly Working Days Configuration</h3>
              <p className="text-xs text-slate-500">
                Define exact working days, holidays, and practical sessions per calendar month.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Academic Session:</span>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-white"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {monthlyDays.map((m) => (
              <div key={m.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>Month: {m.month}</span>
                  <span className="font-mono text-slate-500">{m.totalDays} Total Days</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block">Working Days</label>
                    <input
                      type="number"
                      defaultValue={m.workingDays}
                      onBlur={(e) => handleSaveMonthDay(m.month, Number(e.target.value), m.holidays, m.remarks || '')}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Holidays</label>
                    <input
                      type="number"
                      defaultValue={m.holidays}
                      onBlur={(e) => handleSaveMonthDay(m.month, m.workingDays, Number(e.target.value), m.remarks || '')}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block">Remarks / Festivals</label>
                  <input
                    type="text"
                    defaultValue={m.remarks || ''}
                    onBlur={(e) => handleSaveMonthDay(m.month, m.workingDays, m.holidays, e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px]"
                    placeholder="e.g. Diwali break, State Day"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  const assignedTradeNames = off.assignedTradeIds
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
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Compass className="w-4 h-4 text-blue-600" />
                <span>Campus Location &amp; Geofence Coordinates</span>
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
                <label className="block text-slate-600 mb-1">Geofence Allowed Radius (Meters)</label>
                <input
                  type="number"
                  value={settingsForm.campusLocation.radiusMeters}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      campusLocation: {
                        ...settingsForm.campusLocation,
                        radiusMeters: parseInt(e.target.value) || 400,
                      },
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Trainees must be within this perimeter (currently {settingsForm.campusLocation.radiusMeters}m) to self-mark attendance.
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

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSessionModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-blue-700 text-white rounded hover:bg-blue-800"
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
                    const isSelected = officerForm.assignedTradeIds.includes(t.id);
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
