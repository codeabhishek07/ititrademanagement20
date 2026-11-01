import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { OfficerDashboard } from './components/officer/OfficerDashboard.tsx';
import { TraineeDashboard } from './components/trainee/TraineeDashboard.tsx';
import {
  UserRole,
  SystemSettings,
  Trade,
  AcademicSession,
} from './types.ts';
import { fetchBootstrap, loginApi, fetchTrades, fetchSessions } from './api.ts';
import { RefreshCw } from 'lucide-react';

interface CurrentUser {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  rollNo?: string;
  mobile?: string;
  tradeId?: string;
  tradeIds?: string[];
  assignedTradeIds?: string[];
  tradeName?: string;
  employeeId?: string;
  sessionId?: string;
  category?: string;
  gender?: string;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const data = await fetchBootstrap();
      setSettings(data.settings);
      setSessions(data.sessions);
      setTrades(data.trades);
    } catch (err) {
      console.error('Failed to bootstrap applet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Handle Real Credentials Login
  const handleLogin = async (params: { role: UserRole; email: string; password?: string }) => {
    try {
      setLoading(true);
      const res = await loginApi(params);
      const user = res.user;
      if (params.role === 'trainee') {
        const trTrade = trades.find((t) => t.id === user.tradeId);
        user.tradeName = trTrade?.name || 'Electrician';
      }
      setCurrentUser(user);
    } catch (err: any) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const [traineeActiveTab, setTraineeActiveTab] = useState<'mark_attendance' | 'history' | 'leaves' | 'warnings' | 'tools'>('mark_attendance');

  const handleLogout = () => {
    setCurrentUser(null);
  };

  if (loading && !settings) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-xl bg-white p-2 border border-amber-300 shadow-md animate-pulse flex items-center justify-center">
            <img
              src="/assets/aistudio/iti-logo_b32addc6.png"
              alt="Govt ITI Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
            <span>Loading ITI Trade Management System...</span>
          </div>
          <p className="text-xs text-slate-500">Government ITI Raigarh, Chhattisgarh</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Universal Top Bar with Real-time Trainee Alerts */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        onNavigateTraineeTab={(tab) => setTraineeActiveTab(tab)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {!currentUser ? (
          <LandingPage
            onLogin={handleLogin}
            trades={trades}
            sessions={sessions}
          />
        ) : (
          <div>
            {currentUser.role === 'admin' && settings && (
              <AdminDashboard
                settings={settings}
                onSettingsUpdate={(newSettings) => setSettings(newSettings)}
              />
            )}

            {currentUser.role === 'officer' && settings && (
              <OfficerDashboard
                officer={{
                  id: currentUser.id,
                  name: currentUser.name,
                  email: currentUser.email,
                  employeeId: currentUser.employeeId,
                  assignedTradeIds: currentUser.assignedTradeIds || [trades[0]?.id || 'trade_elec'],
                  mobile: currentUser.mobile,
                }}
                trades={trades}
                sessions={sessions}
                settings={settings}
                onOfficerUpdate={(updated) => {
                  setCurrentUser((prev) => (prev ? { ...prev, ...updated } : null));
                }}
              />
            )}

            {currentUser.role === 'trainee' && settings && (
              <TraineeDashboard
                trainee={{
                  id: currentUser.id,
                  name: currentUser.name,
                  rollNo: currentUser.rollNo || 'ITI/RAI/2025/ELE-014',
                  tradeId: currentUser.tradeId || trades[0]?.id || 'trade_elec',
                  tradeName: currentUser.tradeName || 'Electrician',
                  email: currentUser.email,
                  mobile: currentUser.mobile || '+91 88789 12345',
                  sessionId: currentUser.sessionId,
                  category: currentUser.category,
                  gender: currentUser.gender,
                }}
                settings={settings}
                selectedTab={traineeActiveTab}
                onTabChange={setTraineeActiveTab}
                onTraineeUpdate={(updated) => {
                  setCurrentUser((prev) => (prev ? { ...prev, ...updated } : null));
                }}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">शासकीय आईटीआई रायगढ़ (Govt. ITI Raigarh)</span>
              <span>·</span>
              <span>रोजगार एवं प्रशिक्षण संचालनालय, छत्तीसगढ़</span>
            </div>
            <span className="hidden sm:inline text-slate-300">|</span>
            <div className="w-[424.364px] max-w-full font-medium bg-amber-50/90 text-amber-900 border border-amber-300/80 px-2.5 py-1 rounded shadow-xs text-xs">
              Designed and develeped by Abhishek Swarnkar , Training Officer, ITI Raigarh CG
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>NCVT / DGT Compliant</span>
            <span>·</span>
            <span>GPS Geofence: 21.8974° N, 83.3956° E</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
