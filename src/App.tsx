import React, { useState, useEffect, useCallback } from 'react';
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
  UserPreferences,
} from './types.ts';
import {
  fetchBootstrap,
  loginApi,
  googleLoginApi,
  fetchAuthSession,
  logoutApi,
  fetchUserPreferences,
  saveUserPreferences,
  getAuthToken,
} from './api.ts';
import {
  signInWithGooglePopup,
  signOutFirebaseClient,
  subscribeFirebaseAuth,
} from './firebase.ts';
import { RefreshCw, Database, CheckCircle2, ArrowUpCircle, X } from 'lucide-react';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import {
  triggerAutoBackup,
  restoreBackupPayload,
  clearAllSystemBackupsAndDemoCache,
} from './services/backupService.ts';

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

const LEGACY_DEMO_IDS = new Set(['tr_1', 'tr_2', 'tr_3', 'tr_4', 'tr_5', 'tr_6', 'tr_7', 'tr_1794498305273']);

function isLegacyDemoSession(parsed: any): boolean {
  const id = String(parsed?.id || '').toLowerCase();
  const name = String(parsed?.name || '').toLowerCase();
  return (
    LEGACY_DEMO_IDS.has(id) ||
    name.includes('rohan sahu') ||
    name.includes('pooja kashyap') ||
    name.includes('amit bhagat') ||
    name.includes('kavita patel') ||
    name.includes('vikas tande') ||
    name.includes('dinesh yadav') ||
    name.includes('neha agrawal')
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [autoRestoreNotice, setAutoRestoreNotice] = useState<string>('');
  const [manualRestoreAvailable, setManualRestoreAvailable] = useState<{
    hasBackup: boolean;
    reason?: string;
    payload?: any;
  } | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    try {
      const saved = localStorage.getItem('iti_session_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (isLegacyDemoSession(parsed)) {
        localStorage.removeItem('iti_session_user');
        return null;
      }
      return parsed;
    } catch (err) {
      console.warn('Failed to parse saved session from localStorage:', err);
      return null;
    }
  });

  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);

  const [traineeActiveTab, setTraineeActiveTab] = useState<
    'mark_attendance' | 'history' | 'leaves' | 'warnings' | 'tools' | 'documents'
  >(() => {
    try {
      const saved = localStorage.getItem('iti_trainee_active_tab');
      if (saved && ['mark_attendance', 'history', 'leaves', 'warnings', 'tools', 'documents'].includes(saved)) {
        return saved as any;
      }
    } catch {
      // ignore
    }
    return 'mark_attendance';
  });

  // Persist lightweight session cache locally while Firestore authSessions remains authoritative
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem('iti_session_user', JSON.stringify(currentUser));
      } else {
        localStorage.removeItem('iti_session_user');
      }
    } catch (err) {
      console.warn('Failed to persist session cache:', err);
    }
  }, [currentUser]);

  const updateUserPreferences = useCallback(
    (partial: Partial<UserPreferences>) => {
      if (!currentUser) return;
      setUserPreferences((prev) => {
        const next: UserPreferences = {
          ...(prev || { userId: currentUser.id, role: currentUser.role, updatedAt: new Date().toISOString() }),
          ...partial,
          userId: currentUser.id,
          role: currentUser.role,
          updatedAt: new Date().toISOString(),
        };
        return next;
      });
      saveUserPreferences(currentUser.id, {
        ...partial,
        role: currentUser.role,
      }).catch(() => {});
    },
    [currentUser?.id, currentUser?.role]
  );

  // Apply loaded preferences when session restores or switches user
  const applyRestoredPreferences = (prefs: UserPreferences | null | undefined, role: UserRole) => {
    if (!prefs) return;
    setUserPreferences(prefs);
    if (
      role === 'trainee' &&
      prefs.activeTab &&
      ['mark_attendance', 'history', 'leaves', 'warnings', 'tools', 'documents'].includes(prefs.activeTab)
    ) {
      setTraineeActiveTab(prefs.activeTab as any);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);

      if (localStorage.getItem('iti_demo_cleared_v3') !== 'true') {
        await clearAllSystemBackupsAndDemoCache().catch(() => {});
        localStorage.setItem('iti_demo_cleared_v3', 'true');
      }

      const [bootstrapData, sessionRes] = await Promise.all([
        fetchBootstrap(),
        fetchAuthSession().catch(() => ({ authenticated: false, user: null, preferences: null })),
      ]);

      setSettings(bootstrapData.settings);
      setSessions(bootstrapData.sessions);
      setTrades(bootstrapData.trades);

      if (sessionRes.authenticated && sessionRes.user) {
        const restoredUser = sessionRes.user as CurrentUser;
        if (restoredUser.role === 'trainee' && restoredUser.tradeId) {
          const matchedTrade = bootstrapData.trades.find((t) => t.id === restoredUser.tradeId);
          if (matchedTrade) restoredUser.tradeName = matchedTrade.name;
        }
        setCurrentUser(restoredUser);
        if (sessionRes.preferences) {
          applyRestoredPreferences(sessionRes.preferences, restoredUser.role);
        } else {
          const loadedPrefs = await fetchUserPreferences(restoredUser.id);
          applyRestoredPreferences(loadedPrefs, restoredUser.role);
        }
      } else {
        // Fallback: if local token is missing or offline, keep non-demo cached user & load saved preferences
        const hasToken = Boolean(getAuthToken());
        if (hasToken) {
          // Server explicitly rejected/expired session token
          setCurrentUser(null);
          setUserPreferences(null);
        } else {
          setCurrentUser((prev) => {
            if (!prev || isLegacyDemoSession(prev)) return null;
            if (prev.role === 'trainee' && prev.tradeId && !prev.tradeName) {
              const matchedTrade = bootstrapData.trades.find((t) => t.id === prev.tradeId);
              if (matchedTrade) return { ...prev, tradeName: matchedTrade.name };
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('Failed to bootstrap applet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    const unsubAuth = subscribeFirebaseAuth(() => {
      // Keeps Firebase Auth state synchronized cleanly
    });

    const interval = setInterval(() => {
      triggerAutoBackup('auto_sync', currentUser?.role || 'active_session').catch(() => {});
    }, 60000);

    return () => {
      unsubAuth();
      clearInterval(interval);
    };
  }, []);

  const handleRestoreFromBanner = async () => {
    if (!manualRestoreAvailable?.payload) return;
    try {
      setLoading(true);
      await restoreBackupPayload(manualRestoreAvailable.payload, 'user_prompt_restore');
      setManualRestoreAvailable(null);
      setAutoRestoreNotice('Database successfully restored from your institutional backup!');
      setTimeout(() => setAutoRestoreNotice(''), 6000);
      await loadInitialData();
    } catch (err: any) {
      console.error('Restore failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (params: { role: UserRole; email: string; password?: string }) => {
    try {
      setLoading(true);
      const res = await loginApi(params);
      const user = res.user as CurrentUser;
      if (params.role === 'trainee') {
        const trTrade = trades.find((t) => t.id === user.tradeId);
        user.tradeName = trTrade?.name || user.tradeName || '';
      }
      setCurrentUser(user);
      if (res.preferences) {
        applyRestoredPreferences(res.preferences, user.role);
      } else {
        const loadedPrefs = await fetchUserPreferences(user.id);
        applyRestoredPreferences(loadedPrefs, user.role);
      }
      triggerAutoBackup('auto_sync', user.role).catch(() => {});
    } catch (err: any) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (preferredRole?: UserRole) => {
    try {
      setLoading(true);
      const { user: fbUser } = await signInWithGooglePopup();
      if (!fbUser.email) {
        throw new Error('Your Google account does not provide a verified email address.');
      }
      const res = await googleLoginApi({
        email: fbUser.email,
        uid: fbUser.uid,
        role: preferredRole,
      });
      const mappedUser = res.user as CurrentUser;
      if (mappedUser.role === 'trainee') {
        const trTrade = trades.find((t) => t.id === mappedUser.tradeId);
        mappedUser.tradeName = trTrade?.name || mappedUser.tradeName || '';
      }
      setCurrentUser(mappedUser);
      if (res.preferences) {
        applyRestoredPreferences(res.preferences, mappedUser.role);
      } else {
        const loadedPrefs = await fetchUserPreferences(mappedUser.id);
        applyRestoredPreferences(loadedPrefs, mappedUser.role);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTraineeTabChange = (
    tab: 'mark_attendance' | 'history' | 'leaves' | 'warnings' | 'tools' | 'documents'
  ) => {
    setTraineeActiveTab(tab);
    try {
      localStorage.setItem('iti_trainee_active_tab', tab);
    } catch {
      // ignore
    }
    updateUserPreferences({ activeTab: tab });
  };

  const handleLogout = async () => {
    try {
      await triggerAutoBackup('before_logout', currentUser?.role || 'user');
    } catch {
      // ignore
    }
    await logoutApi();
    await signOutFirebaseClient();

    setCurrentUser(null);
    setUserPreferences(null);
    try {
      localStorage.removeItem('iti_session_user');
      localStorage.removeItem('iti_session_token');
    } catch {
      // ignore
    }
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
          <p className="text-xs text-slate-500">Connecting to Google Cloud Firestore · Govt. ITI Raigarh</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        userPreferences={userPreferences}
        onUpdatePreferences={updateUserPreferences}
        onNavigateTraineeTab={(tab) => handleTraineeTabChange(tab)}
      />

      {autoRestoreNotice && (
        <div className="bg-emerald-900 text-emerald-100 border-b border-emerald-800 text-xs px-4 py-2.5 flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold">{autoRestoreNotice}</span>
            </div>
            <button
              onClick={() => setAutoRestoreNotice('')}
              className="p-1 hover:bg-emerald-800 rounded text-emerald-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {manualRestoreAvailable && (
        <div className="bg-amber-950 text-amber-100 border-b border-amber-800 text-xs px-4 py-2.5 flex items-center justify-between shadow-xs">
          <div className="max-w-7xl mx-auto w-full flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-white">Saved Institutional Backup Found: </span>
                <span className="text-amber-200">{manualRestoreAvailable.reason || 'Custom marks & trainees available'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreFromBanner}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-lg shadow-xs flex items-center gap-1 cursor-pointer"
              >
                <ArrowUpCircle className="w-3.5 h-3.5" />
                <span>Restore Saved Data Now</span>
              </button>
              <button
                onClick={() => setManualRestoreAvailable(null)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {!currentUser ? (
          <LandingPage
            onLogin={handleLogin}
            onGoogleLogin={handleGoogleLogin}
            trades={trades}
            sessions={sessions}
          />
        ) : (
          <div>
            {currentUser.role === 'admin' && settings && (
              <AdminDashboard
                settings={settings}
                currentUserId={currentUser.id}
                currentUserName={currentUser.name}
                userPreferences={userPreferences}
                onUpdatePreferences={updateUserPreferences}
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
                userPreferences={userPreferences}
                onUpdatePreferences={updateUserPreferences}
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
                  rollNo: currentUser.rollNo || '',
                  tradeId: currentUser.tradeId || trades[0]?.id || '',
                  tradeName: currentUser.tradeName || '',
                  email: currentUser.email,
                  mobile: currentUser.mobile || '',
                  sessionId: currentUser.sessionId,
                  category: currentUser.category,
                  gender: currentUser.gender,
                }}
                settings={settings}
                selectedTab={traineeActiveTab}
                onTabChange={handleTraineeTabChange}
                userPreferences={userPreferences}
                onUpdatePreferences={updateUserPreferences}
                onTraineeUpdate={(updated) => {
                  setCurrentUser((prev) => (prev ? { ...prev, ...updated } : null));
                }}
              />
            )}
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">शासकीय आईटीआई रायगढ़ (Govt. ITI Raigarh)</span>
            <span>·</span>
            <span>रोजगार एवं प्रशिक्षण संचालनालय, छत्तीसगढ़</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>NCVT / DGT Compliant · Cloud Firestore Sync</span>
            <span>·</span>
            <span>
              GPS Geofence: {settings?.campusLocation?.lat || 21.8958}° N, {settings?.campusLocation?.lng || 83.4133}° E (±{settings?.campusLocation?.radiusMeters || 1500}m)
            </span>
          </div>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
}

