import React, { useState } from 'react';
import {
  Shield,
  UserCheck,
  GraduationCap,
  MapPin,
  Clock,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Building2,
  FileCheck2,
  CheckCircle,
  KeyRound,
  Mail,
  Copy,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { UserRole, Trade, AcademicSession } from '../types.ts';
import { requestPasswordReset, resetPasswordWithToken } from '../api.ts';

interface LandingPageProps {
  onLogin: (params: { role: UserRole; email: string; password?: string }) => Promise<void>;
  onCustomLogin?: (params: { role: UserRole; email: string; password?: string }) => void;
  onSelectRole?: (role: UserRole) => void;
  trades: Trade[];
  sessions: AcademicSession[];
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLogin,
  onCustomLogin,
  trades,
  sessions,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('trainee');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Password Recovery Flow State
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [recoveryRole, setRecoveryRole] = useState<UserRole>('trainee');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'verify' | 'success'>('request');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [dispatchedInfo, setDispatchedInfo] = useState<{
    email: string;
    maskedEmail: string;
    userName: string;
    role: UserRole;
    token: string;
    expiresMinutes: number;
  } | null>(null);
  const [recoveryToken, setRecoveryToken] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const handleOpenForgotModal = () => {
    setRecoveryRole(selectedRole);
    setRecoveryIdentifier(identifier.trim());
    setRecoveryStep('request');
    setRecoveryError('');
    setDispatchedInfo(null);
    setRecoveryToken('');
    setRecoveryNewPassword('');
    setRecoveryConfirmPassword('');
    setCopiedToken(false);
    setForgotModalOpen(true);
  };

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    if (!recoveryIdentifier.trim()) {
      setRecoveryError('Please enter your registered Email, Roll Number, or Employee ID.');
      return;
    }

    try {
      setRecoveryLoading(true);
      const res = await requestPasswordReset({
        identifier: recoveryIdentifier.trim(),
        role: recoveryRole,
      });
      setDispatchedInfo(res);
      setRecoveryToken(res.token);
      setRecoveryStep('verify');
    } catch (err: any) {
      setRecoveryError(err.message || 'Account not found with provided credentials.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');

    if (!recoveryToken.trim()) {
      setRecoveryError('Please enter the 6-digit security token.');
      return;
    }
    if (recoveryNewPassword.length < 6) {
      setRecoveryError('New password must be at least 6 characters long.');
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryError('Passwords do not match. Please re-enter carefully.');
      return;
    }

    try {
      setRecoveryLoading(true);
      if (!dispatchedInfo) throw new Error('Session details missing. Please restart recovery flow.');
      await resetPasswordWithToken({
        email: dispatchedInfo.email,
        token: recoveryToken.trim(),
        newPassword: recoveryNewPassword,
      });
      setRecoveryStep('success');
      // Pre-fill login form
      setSelectedRole(dispatchedInfo.role);
      setIdentifier(dispatchedInfo.email);
      setPassword(recoveryNewPassword);
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to reset password. Please check your token.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const activeSession = sessions.find((s) => s.status === 'active') || sessions[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!identifier.trim()) {
      setErrorMessage(
        selectedRole === 'admin'
          ? 'Please enter your Administrator Email.'
          : selectedRole === 'officer'
          ? 'Please enter your Official Email or Employee ID.'
          : 'Please enter your Roll Number or Student Email.'
      );
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    try {
      setLoading(true);
      const loginFn = onLogin || onCustomLogin;
      if (loginFn) {
        await loginFn({
          role: selectedRole,
          email: identifier.trim(),
          password,
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid credentials. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-5 h-5" />;
      case 'officer':
        return <UserCheck className="w-5 h-5" />;
      case 'trainee':
        return <GraduationCap className="w-5 h-5" />;
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'Principal / Administration';
      case 'officer':
        return 'Trade Training Officer / Instructor';
      case 'trainee':
        return 'Enrolled Trainee / Student';
    }
  };

  const getIdentifierLabel = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'Official Administrator Email ID';
      case 'officer':
        return 'Official Email Address or Employee ID';
      case 'trainee':
        return 'Trainee Roll Number or Student Email';
    }
  };

  const getIdentifierPlaceholder = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'admin.iti.raigarh@cg.gov.in';
      case 'officer':
        return 'name@iti.cg.gov.in or CG-ITI-TO-1001';
      case 'trainee':
        return 'Enter Roll Number or Student Email';
    }
  };

  return (
    <div className="py-6 sm:py-10 max-w-5xl mx-auto px-4">
      {/* Top Institute Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-slate-50 p-2.5 border border-slate-200 shadow-inner flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/iti-logo_b32addc6.png"
              alt="शासकीय औद्योगिक प्रशिक्षण संस्था रायगढ़ | Government ITI Raigarh Official Emblem"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex-1 space-y-1.5">
            <div className="inline-flex items-center flex-wrap gap-x-2 gap-y-1 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded-full text-amber-900 text-xs font-semibold">
              <span>रोजगार एवं प्रशिक्षण संचालनालय, छत्तीसगढ़</span>
              <span className="text-amber-400">·</span>
              <span className="text-amber-800/90 font-medium">Directorate of Employment &amp; Training</span>
              <span className="text-amber-400">·</span>
              <span>NCVT Code: ITI-RAI-CG-04</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
              <span className="block text-xl sm:text-2xl font-bold text-amber-800 mb-0.5">
                शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़ (छ.ग.)
              </span>
              <span className="block text-slate-900">
                Government Industrial Training Institute, Raigarh (C.G.)
              </span>
            </h1>
            <p className="text-sm font-medium text-slate-600">
              ITI Trade Management, GPS Attendance &amp; Workshop Inventory Portal
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                Chakradhar Nagar Industrial Area Boirdadadr Raigarh(C.G.)
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                GPS Geofence: 7:00 AM – 10:00 AM (Radius 400m)
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                Active Session: {activeSession?.name || '2025-2026'} ({trades.length} Trades)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Authentication Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Official Authentication Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Sign In to Your Account</h2>
            <p className="text-xs text-slate-500 mt-1">
              Select your role and enter your authorized credentials to access your dashboard.
            </p>
          </div>

          {/* Role Selection Tabs - High-Contrast Bold Modern Menu Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                Select Portal Login Mode
              </label>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                NCVT Role-Based Access
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-950 p-2 rounded-2xl shadow-lg border border-slate-800 ring-1 ring-slate-800/80">
              {(['trainee', 'officer', 'admin'] as UserRole[]).map((role) => {
                const isActive = selectedRole === role;
                const label =
                  role === 'admin'
                    ? 'Principal / Admin'
                    : role === 'officer'
                    ? 'Training Officer'
                    : 'Trainee / Student';
                const hindiLabel =
                  role === 'admin'
                    ? 'प्रशासक'
                    : role === 'officer'
                    ? 'प्रशिक्षण अधिकारी'
                    : 'प्रशिक्षु';

                let activeClasses = '';
                let iconColor = '';
                if (isActive) {
                  if (role === 'admin') {
                    activeClasses =
                      'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold shadow-lg shadow-blue-900/40 ring-2 ring-blue-300/40 border border-blue-400';
                    iconColor = 'text-white';
                  } else if (role === 'officer') {
                    activeClasses =
                      'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold shadow-lg shadow-emerald-900/40 ring-2 ring-emerald-300/40 border border-emerald-400';
                    iconColor = 'text-white';
                  } else {
                    activeClasses =
                      'bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold shadow-lg shadow-amber-900/40 ring-2 ring-amber-300/40 border border-amber-300';
                    iconColor = 'text-white';
                  }
                } else {
                  activeClasses =
                    'bg-slate-900/90 text-slate-200 hover:text-white hover:bg-slate-850 border border-slate-800 hover:border-slate-700 font-bold';
                  iconColor = 'text-slate-400';
                }

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(role);
                      setErrorMessage('');
                    }}
                    className={`flex flex-col items-center justify-center gap-1 py-3 px-3.5 rounded-xl text-xs transition-all duration-150 cursor-pointer text-center ${activeClasses}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={iconColor}>
                        {getRoleIcon(role)}
                      </span>
                      <span className="font-extrabold tracking-tight text-sm">
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] opacity-90">
                      <span>{hindiLabel}</span>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role Status Tag */}
          <div className="mb-6 flex items-center justify-between px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
            <span className="text-slate-500">Selected Access Level:</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  selectedRole === 'admin'
                    ? 'bg-blue-600'
                    : selectedRole === 'officer'
                    ? 'bg-emerald-600'
                    : 'bg-amber-600'
                }`}
              />
              {getRoleBadge(selectedRole)}
            </span>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                {getIdentifierLabel(selectedRole)}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={getIdentifierPlaceholder(selectedRole)}
                  required
                  autoComplete="username"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-semibold text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={handleOpenForgotModal}
                  className="text-xs font-semibold text-amber-600 hover:text-amber-800 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>पासवर्ड भूल गए? / Forgot Password?</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  required
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Sign In to {selectedRole === 'admin' ? 'Administration' : selectedRole === 'officer' ? 'Officer Portal' : 'Trainee Portal'}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-600" />
              Secure Encrypted Authentication
            </span>
            <span>Version 2.4.0 (Production)</span>
          </div>
        </div>

        {/* Right Column: Portal Regulations & Guidelines */}
        <div className="lg:col-span-5 space-y-5">
          {/* Statutory Guidelines Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm mb-3">
              <FileCheck2 className="w-4 h-4 text-amber-600" />
              <h3>Portal Access &amp; Compliance</h3>
            </div>
            <ul className="space-y-3 text-xs text-slate-600">
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>GPS Geofenced Attendance:</strong> Trainees must mark daily attendance between 7:00 AM and 10:00 AM while physically inside the 400m campus boundary.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>80% Mandatory Attendance:</strong> NCVT regulations mandate a minimum of 80% attendance for AITT trade test eligibility. Deficits trigger automated formal notices.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Trade Officer Authority:</strong> Instructors review and sanction Casual, Medical, and Half-Day leaves and maintain workshop tool indent registers.
                </span>
              </li>
            </ul>
          </div>

          {/* Institute Contact & Campus Details */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-slate-100">Government ITI Raigarh Campus</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Industrial Area Boirdadadr, Chakradhar Nagar, Raigarh, Chhattisgarh - 496001
            </p>
            <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800">
              <div>GPS Coords: 21.8974° N, 83.3956° E</div>
              <div>NCVT MIS Portal Reference: ITI-RAI-CG-04</div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: SECURE PASSWORD RECOVERY FLOW */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 text-xs text-slate-800 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <KeyRound className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
                    सुरक्षित पासवर्ड रिकवरी · Password Recovery
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Government ITI Raigarh · NCVT Secure Credentials Service
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message */}
            {recoveryError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium">{recoveryError}</span>
              </div>
            )}

            {/* STEP 1: REQUEST TOKEN */}
            {recoveryStep === 'request' && (
              <form onSubmit={handleRequestToken} className="space-y-4">
                <p className="text-slate-600 leading-relaxed">
                  Enter your registered Email ID, Roll Number, or Employee ID. A secure 6-digit verification token will be dispatched to your email address to verify your identity.
                </p>

                {/* Role Selection */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">
                    Select Your Account Portal:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { role: 'trainee' as UserRole, label: 'Trainee', hindi: 'प्रशिक्षु' },
                      { role: 'officer' as UserRole, label: 'Officer', hindi: 'प्रशिक्षण अधिकारी' },
                      { role: 'admin' as UserRole, label: 'Principal', hindi: 'प्राचार्य / प्रशासक' },
                    ].map((item) => (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => setRecoveryRole(item.role)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          recoveryRole === item.role
                            ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold ring-2 ring-amber-400/20'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50 font-medium'
                        }`}
                      >
                        <div className="text-xs">{item.label}</div>
                        <div className="text-[10px] text-slate-500">{item.hindi}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Identifier Input */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {recoveryRole === 'admin'
                      ? 'Administrator Email ID'
                      : recoveryRole === 'officer'
                      ? 'Official Email or Employee ID'
                      : 'Student Email ID or Roll Number'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={recoveryIdentifier}
                      onChange={(e) => setRecoveryIdentifier(e.target.value)}
                      placeholder={
                        recoveryRole === 'admin'
                          ? 'admin.iti.raigarh@cg.gov.in'
                          : recoveryRole === 'officer'
                          ? 'officer email or CG-ITI-TO-1001'
                          : 'Enter Roll Number or Student Email'
                      }
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-xs bg-slate-50/50"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    The token will be routed to the registered email address associated with this record.
                  </p>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(false)}
                    className="flex-1 py-2.5 px-3 border border-slate-300 rounded-xl hover:bg-slate-100 font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={recoveryLoading}
                    className="flex-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {recoveryLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sending Token...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>Send Security Token (सुरक्षा टोकन भेजें)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: VERIFY TOKEN & ENTER NEW PASSWORD */}
            {recoveryStep === 'verify' && dispatchedInfo && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {/* Official Email Dispatch Simulation Preview Banner */}
                <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-2 shadow-inner">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                      <Mail className="w-3.5 h-3.5" />
                      <span>Official Email Dispatch Delivery · शासकीय ईमेल पावती</span>
                    </div>
                    <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full font-mono">
                      DELIVERED
                    </span>
                  </div>

                  <div className="text-[11px] space-y-1 text-slate-300">
                    <div>
                      <span className="text-slate-400">Recipient:</span>{' '}
                      <span className="font-semibold text-slate-100">{dispatchedInfo.userName}</span>{' '}
                      <span className="font-mono text-amber-300">({dispatchedInfo.email})</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Subject:</span> ITI-SEC-OTP: Password Reset Security Token
                    </div>
                  </div>

                  {/* Token Highlight Box */}
                  <div className="mt-2 p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        Your 6-Digit Verification Token:
                      </div>
                      <div className="text-xl font-extrabold font-mono text-amber-400 tracking-widest mt-0.5">
                        {dispatchedInfo.token}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(dispatchedInfo.token);
                        setRecoveryToken(dispatchedInfo.token);
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 3000);
                      }}
                      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {copiedToken ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Token</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>This security token is valid for 15 minutes.</span>
                  </div>
                </div>

                {/* Token Input */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Enter 6-Digit Security Token
                  </label>
                  <input
                    type="text"
                    value={recoveryToken}
                    onChange={(e) => setRecoveryToken(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl font-mono text-center text-base tracking-widest font-extrabold text-slate-900 bg-amber-50/30 focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                {/* New Password Inputs */}
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      New Password (नया पासवर्ड)
                    </label>
                    <div className="relative">
                      <input
                        type={showRecoveryPassword ? 'text' : 'password'}
                        value={recoveryNewPassword}
                        onChange={(e) => setRecoveryNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        minLength={6}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-xs pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showRecoveryPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Confirm New Password (पासवर्ड की पुष्टि करें)
                    </label>
                    <input
                      type={showRecoveryPassword ? 'text' : 'password'}
                      value={recoveryConfirmPassword}
                      onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      minLength={6}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRecoveryStep('request')}
                    className="flex-1 py-2.5 px-3 border border-slate-300 rounded-xl hover:bg-slate-100 font-semibold text-slate-700"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={recoveryLoading}
                    className="flex-2 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {recoveryLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Update Password (पासवर्ड बदलें)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: SUCCESS CONFIRMATION */}
            {recoveryStep === 'success' && (
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-300">
                  <CheckCircle className="w-8 h-8" />
                </div>

                <div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    Password Reset Successfully!
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    आपका पासवर्ड सफलतापूर्वक अपडेट कर दिया गया है।
                  </p>
                </div>

                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  Your credentials have been securely refreshed in the database. The login form on your screen has been pre-filled with your account details.
                </p>

                <button
                  type="button"
                  onClick={() => setForgotModalOpen(false)}
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Proceed to Sign In Now (लॉगिन करें)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
