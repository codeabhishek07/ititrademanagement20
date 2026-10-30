import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  UserCheck,
  GraduationCap,
  LogOut,
  MapPin,
  Bell,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  CheckCheck,
  ShieldAlert,
  ChevronRight,
  X,
} from 'lucide-react';
import { UserRole, AppNotification } from '../types.ts';
import { fetchNotifications } from '../api.ts';

interface HeaderProps {
  currentUser: {
    id: string;
    role: UserRole;
    name: string;
    email: string;
    rollNo?: string;
    tradeName?: string;
    employeeId?: string;
  } | null;
  onLogout: () => void;
  onSwitchRole: (role: UserRole, id?: string) => void;
  onOpenResetConfirm?: () => void;
  onNavigateTraineeTab?: (tab: 'mark_attendance' | 'history' | 'leaves' | 'warnings' | 'tools') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onLogout,
  onSwitchRole,
  onNavigateTraineeTab,
}) => {
  // Real-time notifications state for trainees
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('iti_read_notifications');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'leaves' | 'warnings'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Poll notifications in real-time if logged in as Trainee
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'trainee') {
      setNotifications([]);
      return;
    }

    let isMounted = true;

    const loadNotifications = async () => {
      try {
        const notifs = await fetchNotifications(currentUser.id);
        if (isMounted) {
          setNotifications(notifs);
        }
      } catch (err) {
        console.error('Error fetching real-time notifications:', err);
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 4000); // 4-second real-time poll

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser?.id, currentUser?.role]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(
    (n) => !n.read && !readIds.has(n.id)
  ).length;

  const urgentAlertsCount = notifications.filter(
    (n) =>
      (!n.read && !readIds.has(n.id)) &&
      (n.type === 'attendance_warning' || n.type === 'attendance_deficit')
  ).length;

  const markAllAsRead = () => {
    const allIds = new Set(readIds);
    notifications.forEach((n) => allIds.add(n.id));
    setReadIds(allIds);
    try {
      localStorage.setItem('iti_read_notifications', JSON.stringify(Array.from(allIds)));
    } catch (e) {
      // ignore
    }
  };

  const markSingleAsRead = (id: string) => {
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    try {
      localStorage.setItem('iti_read_notifications', JSON.stringify(Array.from(next)));
    } catch (e) {
      // ignore
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    markSingleAsRead(n.id);
    if (n.linkTab && onNavigateTraineeTab) {
      onNavigateTraineeTab(n.linkTab);
      setDropdownOpen(false);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filterType === 'leaves') {
      return n.type.startsWith('leave_');
    }
    if (filterType === 'warnings') {
      return n.type === 'attendance_warning' || n.type === 'attendance_deficit' || n.type === 'absent_recorded';
    }
    return true;
  });

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Top Government Strip */}
      <div className="bg-slate-900 text-slate-200 text-xs py-1 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-400">छत्तीसगढ़ शासन</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">Directorate of Employment & Training, Govt. of Chhattisgarh</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-amber-400" />
              Govt. ITI Raigarh (NCVT Code: ITI-RAI-CG-04)
            </span>
            <span className="hidden sm:inline text-slate-600">·</span>
            <span className="hidden sm:inline">Affiliated to DGT / MSDE</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Zone 1: Brand & Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-white p-1 border border-amber-300/80 shadow-xs flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/iti-logo_b32addc6.png"
              alt="Official ITI Emblem"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight whitespace-nowrap">
                ITI Trade Management
              </span>
              <span className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 rounded">
                Govt. ITI Raigarh
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              Trade Training, GPS Attendance & Workshop Inventory Portal
            </p>
          </div>
        </div>

        {/* Zone 2: Role Switcher / Demo Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
          <button
            onClick={() => onSwitchRole('admin')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
              currentUser?.role === 'admin'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Admin</span>
          </button>
          <button
            onClick={() => onSwitchRole('officer')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
              currentUser?.role === 'officer'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Training Officer</span>
            <span className="sm:hidden">Officer</span>
          </button>
          <button
            onClick={() => onSwitchRole('trainee')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap ${
              currentUser?.role === 'trainee'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Trainee</span>
            <span className="sm:hidden">Student</span>
          </button>
        </div>

        {/* Zone 3: Real-Time Notifications + User Details & Logout */}
        {currentUser ? (
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Real-time Trainee Notification Bell */}
            {currentUser.role === 'trainee' && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  aria-label="View notifications"
                  className={`relative p-2 rounded-lg border transition-colors flex items-center justify-center ${
                    dropdownOpen
                      ? 'bg-slate-100 border-slate-300 text-slate-900'
                      : urgentAlertsCount > 0
                      ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                      : unreadCount > 0
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title={`${unreadCount} unread notification(s)`}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Flyout / Dropdown Menu */}
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 text-slate-800 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Header */}
                    <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-400" />
                        <div>
                          <h4 className="text-xs font-bold tracking-tight">Trainee Alerts &amp; Updates</h4>
                          <p className="text-[10px] text-slate-300">
                            {unreadCount} unread alert{unreadCount !== 1 ? 's' : ''} · Real-time Sync
                          </p>
                        </div>
                      </div>

                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-white transition-colors"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Mark Read</span>
                        </button>
                      )}
                    </div>

                    {/* Filter Segmented Buttons */}
                    <div className="p-1.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1 text-[11px]">
                      <button
                        onClick={() => setFilterType('all')}
                        className={`flex-1 py-1 rounded font-medium transition-colors ${
                          filterType === 'all'
                            ? 'bg-white shadow-xs text-slate-900 font-semibold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        All ({notifications.length})
                      </button>
                      <button
                        onClick={() => setFilterType('leaves')}
                        className={`flex-1 py-1 rounded font-medium transition-colors ${
                          filterType === 'leaves'
                            ? 'bg-white shadow-xs text-emerald-800 font-semibold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Leaves ({notifications.filter((n) => n.type.startsWith('leave_')).length})
                      </button>
                      <button
                        onClick={() => setFilterType('warnings')}
                        className={`flex-1 py-1 rounded font-medium transition-colors ${
                          filterType === 'warnings'
                            ? 'bg-white shadow-xs text-rose-800 font-semibold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Warnings ({notifications.filter((n) => n.type === 'attendance_warning' || n.type === 'attendance_deficit' || n.type === 'absent_recorded').length})
                      </button>
                    </div>

                    {/* Notifications Scroll List */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {filteredNotifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                          <p className="font-medium text-slate-700">All caught up!</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            No active {filterType === 'all' ? '' : filterType} alerts right now.
                          </p>
                        </div>
                      ) : (
                        filteredNotifications.map((n) => {
                          const isUnread = !n.read && !readIds.has(n.id);
                          const isLeave = n.type.startsWith('leave_');
                          const isWarning =
                            n.type === 'attendance_warning' ||
                            n.type === 'attendance_deficit';

                          return (
                            <div
                              key={n.id}
                              onClick={() => handleNotificationClick(n)}
                              className={`p-3 transition-colors cursor-pointer text-xs relative ${
                                isUnread
                                  ? isWarning
                                    ? 'bg-rose-50/70 hover:bg-rose-100/60'
                                    : 'bg-amber-50/60 hover:bg-amber-100/50'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                {/* Icon */}
                                <div className="mt-0.5 shrink-0">
                                  {n.type === 'leave_approved' && (
                                    <span className="p-1 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  {n.type === 'leave_rejected' && (
                                    <span className="p-1 rounded-md bg-rose-100 text-rose-700 flex items-center justify-center">
                                      <XCircle className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  {n.type === 'leave_pending' && (
                                    <span className="p-1 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                                      <Clock className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  {isWarning && (
                                    <span className="p-1 rounded-md bg-rose-200 text-rose-800 flex items-center justify-center">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  {n.type === 'absent_recorded' && (
                                    <span className="p-1 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                                      <Clock className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </div>

                                {/* Body */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <div
                                      className={`font-semibold truncate text-[11px] ${
                                        isWarning
                                          ? 'text-rose-900'
                                          : n.type === 'leave_approved'
                                          ? 'text-emerald-900'
                                          : 'text-slate-900'
                                      }`}
                                    >
                                      {n.title}
                                    </div>
                                    {isUnread && (
                                      <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
                                    )}
                                  </div>

                                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                                    {n.message}
                                  </p>

                                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                                    <span className="font-mono">{n.timestamp}</span>
                                    {n.linkTab && (
                                      <span className="text-blue-600 hover:underline flex items-center gap-0.5 font-medium">
                                        <span>View {n.linkTab === 'leaves' ? 'Leaves' : n.linkTab === 'warnings' ? 'Notice' : 'Details'}</span>
                                        <ChevronRight className="w-3 h-3" />
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-2 bg-slate-50 border-t border-slate-200 text-center">
                      <span className="text-[10px] text-slate-400">
                        NCVT Trainee Compliance &amp; Regulatory Alert Service
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profile Info */}
            <div className="text-right hidden lg:block">
              <div className="text-xs font-semibold text-slate-900 truncate max-w-[180px]">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {currentUser.role === 'admin' && 'Principal / Administrator'}
                {currentUser.role === 'officer' && (currentUser.employeeId || 'Training Officer')}
                {currentUser.role === 'trainee' && (currentUser.rollNo || 'Electrician')}
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={onLogout}
              title="Logout from session"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-500">Demo Portal</div>
        )}
      </div>
    </header>
  );
};
