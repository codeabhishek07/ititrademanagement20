import React, { useState } from 'react';
import {
  Shield,
  UserCheck,
  GraduationCap,
  ArrowRight,
  MapPin,
  Clock,
  Wrench,
  FileSpreadsheet,
  AlertTriangle,
  Compass,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { UserRole, Trade, AcademicSession } from '../types.ts';

interface LandingPageProps {
  onSelectRole: (role: UserRole, extra?: { officerId?: string; traineeId?: string }) => void;
  onCustomLogin: (params: { role: UserRole; email: string; password?: string }) => void;
  trades: Trade[];
  sessions: AcademicSession[];
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSelectRole,
  onCustomLogin,
  trades,
  sessions,
}) => {
  const [showLoginModal, setShowLoginModal] = useState<UserRole | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const activeSession = sessions.find((s) => s.status === 'active') || sessions[0];

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showLoginModal) return;
    try {
      onCustomLogin({
        role: showLoginModal,
        email: emailInput.trim(),
        password: passwordInput,
      });
      setShowLoginModal(null);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    }
  };

  const openModal = (role: UserRole) => {
    setShowLoginModal(role);
    setLoginError('');
    if (role === 'admin') {
      setEmailInput('admin.iti.raigarh@cg.gov.in');
      setPasswordInput('admin123');
    } else if (role === 'officer') {
      setEmailInput('rajesh.dewangan@iti.cg.gov.in');
      setPasswordInput('officer123');
    } else {
      setEmailInput('ITI/RAI/2025/ELE-014');
      setPasswordInput('trainee123');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden border-b border-slate-700">
        <div className="absolute inset-0 opacity-15">
          <img
            src="/src/assets/images/iti_workshop_hero_1793370435124.jpg"
            alt="Govt ITI Raigarh Technical Workshop"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Column: Institute Header & Intro */}
            <div className="lg:col-span-8 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-400/30 rounded-md text-amber-300 text-xs font-semibold tracking-wide">
                <span>शासकीय औद्योगिक प्रशिक्षण संस्थान, रायगढ़ (छ.ग.)</span>
                <span>·</span>
                <span>NCVT MIS Code: ITI-RAI-CG-04</span>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white p-2 shadow-xl shrink-0 border-2 border-amber-400 flex items-center justify-center">
                  <img
                    src="/assets/aistudio/iti-logo_b32addc6.png"
                    alt="Official ITI Emblem"
                    className="w-full h-full object-contain drop-shadow-sm"
                  />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                    ITI Trade Management Portal
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300 font-medium mt-1">
                    Government Industrial Training Institute Raigarh, Chhattisgarh
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Directorate of Employment & Training, Government of Chhattisgarh. Dedicated portal for trade-level vocational training, GPS geofenced attendance verification (7 AM - 10 AM), trainee leaves, equipment indent registers, and official NCVT academic reporting.
                  </p>
                </div>
              </div>

              {/* Quick Feature Pills */}
              <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  Campus Geofence (400m Radius)
                </span>
                <span className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Attendance Cutoff: 07:00 AM – 10:00 AM
                </span>
                <span className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Automated &lt;80% Warning Notices
                </span>
                <span className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
                  <Wrench className="w-3.5 h-3.5 text-blue-400" />
                  Workshop Indent & Tools Stock
                </span>
              </div>
            </div>

            {/* Right Column: Live Session Card */}
            <div className="lg:col-span-4 bg-slate-800/90 backdrop-blur-xs p-5 rounded-xl border border-slate-700 shadow-xl text-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                <span className="font-semibold text-slate-200">Current Academic Session</span>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-700/50 px-2 py-0.5 rounded">
                  {activeSession?.name || '2025-2026'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div className="bg-slate-900/60 p-2.5 rounded border border-slate-700/60">
                  <div className="text-slate-400 text-[10px]">Active Trades</div>
                  <div className="text-base font-bold text-white mt-0.5 font-mono">{trades.length} Trades</div>
                  <div className="text-[10px] text-slate-500 truncate">Electrician, Fitter, COPA...</div>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded border border-slate-700/60">
                  <div className="text-slate-400 text-[10px]">Working Days</div>
                  <div className="text-base font-bold text-amber-400 mt-0.5 font-mono">
                    {activeSession?.totalWorkingDays || 240} Days
                  </div>
                  <div className="text-[10px] text-slate-500">Scheduled / Configured</div>
                </div>
              </div>

              <div className="bg-slate-900/70 p-2.5 rounded border border-slate-700 text-slate-300">
                <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Campus Geofence Verified:</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Chakradhar Nagar Industrial Area Boirdadadr Raigarh(C.G.)
                </div>
                <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                  Lat: 21.8974° N, Long: 83.3956° E · Radius: 400m
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Role-Based Login Panels Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex-1">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Select Your Role-Based Login Portal
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Access authorized dashboards with dedicated permissions for Administration, Trade Instructors, and Trainees.
          </p>
        </div>

        {/* 3 Role Panels Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Panel 1: Administrator */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 mb-4">
                <Shield className="w-6 h-6" />
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Administrator</h3>
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Principal / Head
                </span>
              </div>

              <p className="text-xs text-slate-600 mt-2">
                Complete institutional oversight for sessions, trades, officers, and governance rules.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>Create academic sessions &amp; monthly working days</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>Add, alter, delete trades &amp; sanction unit capacities</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>Manage Training Officers: credentials, assigned trades, password reset</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>Configure campus geofence, 7-10 AM rules, leave quotas &amp; audit logs</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
              <button
                onClick={() => onSelectRole('admin')}
                className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <span>Enter Admin Dashboard (1-Click Demo)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openModal('admin')}
                className="w-full py-1.5 px-3 text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded transition-colors text-center"
              >
                Sign in with Principal Credentials
              </button>
            </div>
          </div>

          {/* Panel 2: Training Officer */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 mb-4">
                <UserCheck className="w-6 h-6" />
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Training Officer</h3>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Trade Instructor
                </span>
              </div>

              <p className="text-xs text-slate-600 mt-2">
                Manage assigned trade training activities, daily attendance, tool indents, and warnings.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Add, edit &amp; manage trainees within assigned trades</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Mark &amp; correct daily attendance (P, A, CL, ML, Half-Day)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Review &amp; approve/reject leave applications with remarks</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Auto-detect &lt;80% deficit &amp; issue formal warning notices</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Tools &amp; equipment inventory + trainee indent issue/return register</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Generate downloadable Excel/CSV reports &amp; printable PDF records</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
              <button
                onClick={() => onSelectRole('officer')}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <span>Enter Officer Dashboard (Electrician Demo)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openModal('officer')}
                className="w-full py-1.5 px-3 text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded transition-colors text-center"
              >
                Sign in with Officer Credentials
              </button>
            </div>
          </div>

          {/* Panel 3: Trainee */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mb-4">
                <GraduationCap className="w-6 h-6" />
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Trainee Portal</h3>
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Student
                </span>
              </div>

              <p className="text-xs text-slate-600 mt-2">
                Mobile-friendly portal for daily campus GPS attendance, leave tracking, and notices.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>Mark attendance between 7:00 AM – 10:00 AM with GPS geotag</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>Live campus perimeter distance readout &amp; boundary validation</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>Automatic absent recording past cutoff time (with TO correction)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>Apply for CL, Medical Leave, Half-Day &amp; monitor approval status</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>Attendance history, graphical percentage gauge &amp; issued warning receipts</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
              <button
                onClick={() => onSelectRole('trainee')}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <span>Enter Trainee Portal (Rohan Sahu Demo)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openModal('trainee')}
                className="w-full py-1.5 px-3 text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded transition-colors text-center"
              >
                Sign in with Roll No / Credentials
              </button>
            </div>
          </div>
        </div>

        {/* Institutional Information & Regulatory Compliance Bar */}
        <div className="mt-10 p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white p-1 border border-slate-300 flex items-center justify-center shrink-0">
                <img
                  src="/assets/aistudio/iti-logo_b32addc6.png"
                  alt="Official ITI Emblem"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="font-semibold text-slate-800">
                  Government Industrial Training Institute Raigarh (Chhattisgarh)
                </div>
                <div className="text-[11px] text-slate-500">
                  Affiliated to NCVT / DGT (Directorate General of Training), Ministry of Skill Development and Entrepreneurship, Govt. of India
                </div>
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-500 font-mono">
              <div>Secure Role-Based Access Control</div>
              <div>Geo-Location Hash Validation Active</div>
            </div>
          </div>
        </div>
      </div>

      {/* Login Credentials Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-700" />
                <h3 className="font-bold text-sm text-slate-900 capitalize">
                  {showLoginModal} Authentication
                </h3>
              </div>
              <button
                onClick={() => setShowLoginModal(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {loginError && (
              <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs">
                {loginError}
              </div>
            )}

            <form onSubmit={handleModalSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {showLoginModal === 'trainee' ? 'Roll Number / Email' : 'Official Email ID'}
                </label>
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Default Demo Passwords: <span className="font-mono text-slate-700 font-semibold">{showLoginModal}123</span>
                </p>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(null)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-md transition-colors"
                >
                  Log In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
