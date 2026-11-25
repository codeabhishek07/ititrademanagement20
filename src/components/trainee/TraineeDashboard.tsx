import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  FileText,
  MapPin,
  Check,
  Send,
  Wrench,
  AlertCircle,
  HelpCircle,
  BarChart2,
  RefreshCw,
  Building,
  Printer,
  X,
  Mail,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  Ban,
  FolderOpen,
  Paperclip,
  Download,
} from 'lucide-react';
import {
  AttendanceRecord,
  LeaveRequest,
  WarningNotice,
  IndentRecord,
  SystemSettings,
  LeaveType,
  HolidayRecord,
  UserPreferences,
  Trade,
  TradeEnrollment,
} from '../../types.ts';
import {
  fetchAttendance,
  markTraineeAttendance,
  fetchLeaves,
  applyLeave,
  fetchWarnings,
  acknowledgeWarning,
  fetchIndents,
  fetchHolidays,
  uploadDocument,
  fetchSettings,
  syncServerTime,
  fetchTrades,
  fetchTradeEnrollments,
} from '../../api.ts';
import { DocumentVaultPanel } from '../DocumentVaultPanel.tsx';
import {
  getDateHolidayStatus,
  calculateMonthWorkingDayBreakdown,
  calculateTraineeAttendanceMetrics,
  getIstDateStr,
  getIstYearMonth,
  stepMonthKey,
  getSynchronizedNow,
  evaluateAttendanceWindow,
  formatClock12,
  formatClock24,
} from '../../utils/attendanceCalendar.ts';
import {
  acquireExactDeviceGps,
  computeHaversineMeters,
  classifyGpsAccuracy,
  getGeolocationPermissionState,
  DeviceGpsFix,
} from '../../utils/deviceGps.ts';

interface TraineeDashboardProps {
  trainee: {
    id: string;
    name: string;
    rollNo: string;
    tradeId: string;
    tradeName?: string;
    email: string;
    mobile: string;
    sessionId?: string;
    category?: string;
    gender?: string;
  };
  settings: SystemSettings;
  selectedTab?: TraineeTab;
  onTabChange?: (tab: TraineeTab) => void;
  userPreferences?: UserPreferences | null;
  onUpdatePreferences?: (partial: Partial<UserPreferences>) => void;
  onTraineeUpdate?: (updated: { email?: string; mobile?: string }) => void;
  onSettingsChange?: (settings: SystemSettings) => void;
}

type TraineeTab = 'mark_attendance' | 'history' | 'leaves' | 'warnings' | 'tools' | 'documents';

export const TraineeDashboard: React.FC<TraineeDashboardProps> = ({
  trainee,
  settings,
  selectedTab,
  onTabChange,
  userPreferences,
  onUpdatePreferences,
  onTraineeUpdate,
  onSettingsChange,
}) => {
  const [activeTab, setActiveTab] = useState<TraineeTab>(selectedTab || 'mark_attendance');

  useEffect(() => {
    if (selectedTab) {
      setActiveTab(selectedTab);
    }
  }, [selectedTab]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTabClick = (tab: TraineeTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    onTabChange?.(tab);
    setTimeout(() => {
      const el = document.getElementById('trainee-content-viewport');
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

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [liveSettings, setLiveSettings] = useState<SystemSettings>(settings);
  const [liveNow, setLiveNow] = useState<Date>(() => getSynchronizedNow());

  useEffect(() => {
    setLiveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveNow(getSynchronizedNow());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Device GPS State (strictly client-side navigator.geolocation, zero server/IP estimation)
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [gpsStatusText, setGpsStatusText] = useState('');
  const [gpsPermission, setGpsPermission] = useState<'granted' | 'prompt' | 'denied' | 'unsupported'>('prompt');
  const [attendanceError, setAttendanceError] = useState('');
  const [currentCoords, setCurrentCoords] = useState<DeviceGpsFix | null>(null);
  const [simulateOnCampus, setSimulateOnCampus] = useState(false);
  const gpsAbortRef = useRef<AbortController | null>(null);

  // Entities
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [leavesList, setLeavesList] = useState<LeaveRequest[]>([]);
  const [warningsList, setWarningsList] = useState<WarningNotice[]>([]);
  const [indentsList, setIndentsList] = useState<IndentRecord[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [enrollments, setEnrollments] = useState<TradeEnrollment[]>([]);
  const [selectedAttendanceTradeId, setSelectedAttendanceTradeId] = useState<string>(trainee.tradeId);
  const [historyMonth, setHistoryMonth] = useState<string>(() => {
    if (userPreferences?.historyMonth) return userPreferences.historyMonth;
    return getIstYearMonth();
  });
  const [noticeLanguage, setNoticeLanguage] = useState<'hindi' | 'bilingual' | 'english'>(
    (userPreferences?.noticeLanguage as 'hindi' | 'bilingual' | 'english') || 'bilingual'
  );

  // Sync restored userPreferences from Firestore
  useEffect(() => {
    if (!userPreferences) return;
    if (userPreferences.historyMonth) {
      setHistoryMonth(userPreferences.historyMonth);
    }
    if (userPreferences.noticeLanguage) {
      setNoticeLanguage(userPreferences.noticeLanguage);
    }
  }, [userPreferences?.userId, userPreferences?.historyMonth, userPreferences?.noticeLanguage]);

  const [viewOrderNotice, setViewOrderNotice] = useState<WarningNotice | null>(null);

  // Apply Leave Modal
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'Casual Leave (CL)' as LeaveType,
    fromDate: getIstDateStr(),
    toDate: getIstDateStr(),
    days: 1,
    reason: '',
  });
  const [leaveAttachmentFile, setLeaveAttachmentFile] = useState<File | null>(null);
  const [leaveSubmitError, setLeaveSubmitError] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  // Build trainee's enrolled subjects (Primary Trade + any enrolled Common Subjects)
  const enrolledSubjects = useMemo(() => {
    const primaryTradeObj = trades.find((t) => t.id === trainee.tradeId);
    const list: Array<{ id: string; name: string; code: string; isCommonTrade: boolean }> = [
      {
        id: trainee.tradeId,
        name: primaryTradeObj?.name || trainee.tradeName || 'Primary Trade',
        code: primaryTradeObj?.code || '',
        isCommonTrade: false,
      },
    ];
    enrollments.forEach((enr) => {
      if (enr.status !== 'enrolled' || enr.tradeId === trainee.tradeId) return;
      const tObj = trades.find((t) => t.id === enr.tradeId);
      if (tObj && !list.some((item) => item.id === tObj.id)) {
        list.push({
          id: tObj.id,
          name: tObj.name,
          code: tObj.code,
          isCommonTrade: Boolean(tObj.isCommonTrade),
        });
      }
    });
    return list;
  }, [trades, enrollments, trainee.tradeId, trainee.tradeName]);

  useEffect(() => {
    if (!enrolledSubjects.some((s) => s.id === selectedAttendanceTradeId)) {
      setSelectedAttendanceTradeId(trainee.tradeId);
    }
  }, [enrolledSubjects, selectedAttendanceTradeId, trainee.tradeId]);

  const selectedSubject =
    enrolledSubjects.find((s) => s.id === selectedAttendanceTradeId) || enrolledSubjects[0];

  // Unified synchronized IST evaluation (updates dynamically across midnight and server window changes)
  const windowEval = evaluateAttendanceWindow(liveSettings.attendanceWindow, liveNow);
  const isTimeWithinWindow = windowEval.isWithinWindow;
  const currentIstFormatted = `${formatClock12(windowEval.istHours, windowEval.istMinutes)} (${formatClock24(windowEval.istHours, windowEval.istMinutes)} IST)`;
  const todayStr = windowEval.istDateStr;
  const todayDayLock = getDateHolidayStatus(todayStr, holidays, trainee.sessionId);
  const isTodayHolidayLocked = todayDayLock.isHoliday;
  const todayHoliday = todayDayLock.adminHoliday;
  const todayRecord = isTodayHolidayLocked
    ? undefined
    : attendanceList.find(
        (a) => a.date === todayStr && (a.tradeId || trainee.tradeId) === selectedAttendanceTradeId
      );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const loadTraineeData = async () => {
    setLoading(true);
    try {
      const [att, lvs, wrns, inds, hols, freshSettings, tradesRes, enrollmentsRes] = await Promise.all([
        fetchAttendance({ traineeId: trainee.id }),
        fetchLeaves({ traineeId: trainee.id }),
        fetchWarnings({ traineeId: trainee.id }),
        fetchIndents({ traineeId: trainee.id }),
        fetchHolidays(),
        fetchSettings().catch(() => null),
        fetchTrades().catch(() => []),
        fetchTradeEnrollments({ traineeId: trainee.id }).catch(() => []),
      ]);
      setAttendanceList(att);
      setLeavesList(lvs);
      setWarningsList(wrns);
      setIndentsList(inds);
      setHolidays(hols);
      setTrades(tradesRes);
      setEnrollments(enrollmentsRes);
      if (freshSettings && freshSettings.attendanceWindow) {
        setLiveSettings(freshSettings);
        onSettingsChange?.(freshSettings);
      }
      setLiveNow(getSynchronizedNow());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Progressive Client-Side Device GPS Acquisition (watchPosition satellite lock)
  const requestLocation = useCallback(async (): Promise<DeviceGpsFix | null> => {
    if (gpsAbortRef.current) {
      gpsAbortRef.current.abort();
      gpsAbortRef.current = null;
    }

    setGpsLoading(true);
    setGpsError('');
    setAttendanceError('');

    if (simulateOnCampus) {
      const simLat = parseFloat((liveSettings.campusLocation.lat + 0.0002).toFixed(6));
      const simLng = parseFloat((liveSettings.campusLocation.lng + 0.0001).toFixed(6));
      const simFix: DeviceGpsFix = {
        lat: simLat,
        lng: simLng,
        accuracy: 8,
        altitude: null,
        heading: null,
        speed: null,
        capturedAtMs: Date.now(),
        sampleCount: 1,
        providerQuality: 'device_gps',
      };
      setCurrentCoords(simFix);
      setGpsStatusText('Simulated On-Campus Coordinates (±8m)');
      setGpsLoading(false);
      return simFix;
    }

    const perm = await getGeolocationPermissionState();
    setGpsPermission(perm);

    const controller = new AbortController();
    gpsAbortRef.current = controller;
    setGpsStatusText('Requesting exact GPS coordinates from your device...');

    try {
      const fix = await acquireExactDeviceGps({
        targetAccuracyMeters: 30,
        minListenMs: 1000,
        maxListenMs: 8500,
        signal: controller.signal,
        onProgress: (interimFix, statusText) => {
          setCurrentCoords(interimFix);
          setGpsStatusText(statusText);
        },
      });
      setCurrentCoords(fix);
      setGpsPermission('granted');
      setGpsStatusText(
        fix.providerQuality === 'device_gps'
          ? `Exact device GPS locked (±${fix.accuracy}m)`
          : fix.providerQuality === 'wifi_assisted'
          ? `Device location locked (±${fix.accuracy}m)`
          : `Coarse network estimate received (±${fix.accuracy}m) — device GPS chip did not lock`
      );
      return fix;
    } catch (err: any) {
      if (controller.signal.aborted) {
        return null;
      }
      const message = err?.message || 'Unable to obtain GPS location from your device.';
      if (message.toLowerCase().includes('denied')) {
        setGpsPermission('denied');
      }
      setGpsError(`GPS Status: ${message}`);
      setGpsStatusText('');
      return null;
    } finally {
      if (gpsAbortRef.current === controller) {
        gpsAbortRef.current = null;
        setGpsLoading(false);
      }
    }
  }, [simulateOnCampus, liveSettings.campusLocation.lat, liveSettings.campusLocation.lng]);

  useEffect(() => {
    syncServerTime()
      .then(() => setLiveNow(getSynchronizedNow()))
      .catch(() => {});
    loadTraineeData();
    const settingsPoll = setInterval(() => {
      Promise.all([syncServerTime().catch(() => null), fetchSettings().catch(() => null)])
        .then(([, fresh]) => {
          setLiveNow(getSynchronizedNow());
          if (fresh && fresh.attendanceWindow) {
            setLiveSettings(fresh);
            onSettingsChange?.(fresh);
          }
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(settingsPoll);
  }, [trainee.id]);

  useEffect(() => {
    requestLocation();
    return () => {
      if (gpsAbortRef.current) {
        gpsAbortRef.current.abort();
        gpsAbortRef.current = null;
      }
    };
  }, [trainee.id, simulateOnCampus]);

  // Mark Attendance via exact Client-Side Device GPS
  const handleMarkAttendance = async () => {
    setAttendanceError('');
    if (isTodayHolidayLocked) {
      setAttendanceError(todayDayLock.lockReason || `Attendance is disabled today (${todayStr}): ${todayDayLock.title}.`);
      return;
    }

    try {
      setGpsLoading(true);
      let fixToSubmit = currentCoords;

      if (!simulateOnCampus) {
        const isStale = !fixToSubmit || Date.now() - fixToSubmit.capturedAtMs > 60000;
        const isCoarse = !fixToSubmit || fixToSubmit.providerQuality === 'coarse_network';
        if (isStale || isCoarse) {
          fixToSubmit = await requestLocation();
        }
        if (!fixToSubmit) {
          setAttendanceError(
            'Could not read exact GPS coordinates from your device. Enable Device Location/GPS and tap "Refresh GPS".'
          );
          return;
        }
      }

      const submitLat = simulateOnCampus
        ? parseFloat((liveSettings.campusLocation.lat + 0.0002).toFixed(6))
        : fixToSubmit!.lat;
      const submitLng = simulateOnCampus
        ? parseFloat((liveSettings.campusLocation.lng + 0.0001).toFixed(6))
        : fixToSubmit!.lng;
      const submitAccuracy = simulateOnCampus ? 8 : fixToSubmit!.accuracy;

      const res = await markTraineeAttendance({
        traineeId: trainee.id,
        tradeId: selectedAttendanceTradeId,
        userLat: submitLat,
        userLng: submitLng,
        accuracy: submitAccuracy,
        forceSimulation: simulateOnCampus,
      });

      showToast(res.message || `Attendance recorded for ${selectedSubject?.name || 'Primary Trade'}!`);
      loadTraineeData();
    } catch (err: any) {
      setAttendanceError(err.message || 'Failed to record attendance.');
    } finally {
      setGpsLoading(false);
    }
  };

  // Apply Leave Handler (with optional supporting medical/document cloud upload)
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveSubmitError('');
    setLeaveSubmitting(true);
    try {
      let attachmentDocId: string | undefined;
      let attachmentName: string | undefined;
      let attachmentUrl: string | undefined;

      if (leaveAttachmentFile) {
        if (leaveAttachmentFile.size > 8 * 1024 * 1024) {
          throw new Error('Supporting document must be 8 MB or smaller.');
        }
        const base64Content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = () => reject(new Error('Failed to read supporting document file.'));
          reader.readAsDataURL(leaveAttachmentFile);
        });
        const res = await uploadDocument({
          title: `Leave Supporting Doc (${leaveForm.fromDate}) — ${trainee.name}`,
          fileName: leaveAttachmentFile.name,
          mimeType: leaveAttachmentFile.type || 'application/octet-stream',
          base64Content,
          category: 'Leave Medical Certificate',
          uploadedById: trainee.id,
          uploadedByName: trainee.name,
          uploadedByRole: 'trainee',
          tradeId: trainee.tradeId,
          sessionId: trainee.sessionId,
          traineeId: trainee.id,
          remarks: leaveForm.reason,
        });
        attachmentDocId = res.document.id;
        attachmentName = res.document.fileName;
        attachmentUrl = res.document.downloadUrl;
      }

      await applyLeave({
        traineeId: trainee.id,
        leaveType: leaveForm.leaveType,
        fromDate: leaveForm.fromDate,
        toDate: leaveForm.toDate,
        days: leaveForm.days,
        reason: leaveForm.reason,
        attachmentDocId,
        attachmentName,
        attachmentUrl,
      });
      showToast('Leave application & supporting document saved to Cloud Firestore');
      setLeaveModalOpen(false);
      setLeaveAttachmentFile(null);
      setLeaveForm({
        leaveType: 'Casual Leave (CL)',
        fromDate: getIstDateStr(),
        toDate: getIstDateStr(),
        days: 1,
        reason: '',
      });
      loadTraineeData();
    } catch (err: any) {
      setLeaveSubmitError(err.message || 'Failed to submit leave application.');
    } finally {
      setLeaveSubmitting(false);
    }
  };

  // Acknowledge Warning Handler
  const handleAcknowledgeWarning = async (warningId: string) => {
    try {
      await acknowledgeWarning(warningId);
      showToast('Notice acknowledged');
      loadTraineeData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Primary Trade Attendance Stats (Profile Strip & Leave Quotas remain anchored to Primary Trade)
  const primaryAttendanceList = useMemo(
    () => attendanceList.filter((a) => (a.tradeId || trainee.tradeId) === trainee.tradeId),
    [attendanceList, trainee.tradeId]
  );

  const personalMetrics = calculateTraineeAttendanceMetrics({
    records: primaryAttendanceList,
    holidays,
    sessionId: trainee.sessionId,
    referenceDate: todayStr,
    minimumAttendancePercent: liveSettings.minimumAttendancePercent,
  });
  const clCount = personalMetrics.clDays;
  const mlCount = personalMetrics.mlDays;
  const halfDayCount = personalMetrics.halfDays;
  const attendancePercent = personalMetrics.attendancePercent;
  const isBelowThreshold = personalMetrics.isBelowThreshold;

  // Subject-scoped metrics for Attendance History & Charts tab
  const subjectAttendanceList = useMemo(
    () =>
      attendanceList.filter(
        (a) => (a.tradeId || trainee.tradeId) === selectedAttendanceTradeId
      ),
    [attendanceList, selectedAttendanceTradeId, trainee.tradeId]
  );
  const validWorkingAttendanceList = subjectAttendanceList.filter(
    (a) => getDateHolidayStatus(a.date, holidays, trainee.sessionId).isWorkingDay
  );
  const subjectMetrics = calculateTraineeAttendanceMetrics({
    records: subjectAttendanceList,
    holidays,
    sessionId: trainee.sessionId,
    referenceDate: todayStr,
    minimumAttendancePercent: liveSettings.minimumAttendancePercent,
  });
  const totalMarked = subjectMetrics.totalWorkingDays;
  const presentCount = subjectMetrics.presentDays;
  const subjectClCount = subjectMetrics.clDays;
  const subjectMlCount = subjectMetrics.mlDays;
  const subjectHalfDayCount = subjectMetrics.halfDays;
  const absentCount = subjectMetrics.absentDays;
  const subjectAttendancePercent = subjectMetrics.attendancePercent;
  const isSubjectBelowThreshold = subjectMetrics.isBelowThreshold;

  // Reactive distance computation: always stays synced with both latest device GPS and latest campus settings
  const distanceToCampus = useMemo(() => {
    if (simulateOnCampus) {
      const simLat = liveSettings.campusLocation.lat + 0.0002;
      const simLng = liveSettings.campusLocation.lng + 0.0001;
      return computeHaversineMeters(
        simLat,
        simLng,
        liveSettings.campusLocation.lat,
        liveSettings.campusLocation.lng
      );
    }
    if (!currentCoords) return null;
    return computeHaversineMeters(
      currentCoords.lat,
      currentCoords.lng,
      liveSettings.campusLocation.lat,
      liveSettings.campusLocation.lng
    );
  }, [
    simulateOnCampus,
    currentCoords,
    liveSettings.campusLocation.lat,
    liveSettings.campusLocation.lng,
  ]);

  // Account for realistic mobile GPS accuracy tolerance inside steel-roofed workshop buildings (up to 250m buffer)
  const accuracyBuffer = currentCoords ? Math.min(Math.max(0, currentCoords.accuracy), 250) : 0;
  const effectiveDistance = distanceToCampus !== null ? Math.max(0, distanceToCampus - accuracyBuffer) : null;
  const isWithinCampusPerimeter =
    distanceToCampus !== null &&
    (distanceToCampus <= liveSettings.campusLocation.radiusMeters ||
      (effectiveDistance !== null && effectiveDistance <= liveSettings.campusLocation.radiusMeters));
  const coordsQuality = currentCoords ? classifyGpsAccuracy(currentCoords.accuracy) : null;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-700 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Trainee Profile Strip */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 font-bold text-base font-mono">
            {trainee.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)}
          </div>
          <div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">{trainee.name}</h2>
                <span className="text-[11px] font-mono font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                  {trainee.rollNo}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold" title="Attendance and records auto-preserved in browser storage">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-Preserved
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                <span>Trade: <span className="font-semibold text-slate-700">{trainee.tradeName || 'Electrician'}</span></span>
                <span>·</span>
                <span className="flex items-center gap-1 text-slate-700 font-mono">
                  <Mail className="w-3 h-3 text-slate-400" />
                  {trainee.email}
                </span>
                <span>·</span>
                <span className="font-mono text-slate-600">{trainee.mobile}</span>
              </p>
              {enrolledSubjects.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] font-semibold text-slate-500">Shared Subjects:</span>
                  {enrolledSubjects
                    .filter((s) => s.isCommonTrade)
                    .map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-semibold"
                      >
                        {s.name}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Overall Attendance Stat Pill (Primary Trade) */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] text-slate-500 font-medium">Primary Trade Attendance</div>
            <div
              className={`text-xl font-extrabold font-mono ${
                isBelowThreshold ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              {attendancePercent}%
            </div>
          </div>
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
              isBelowThreshold
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {isBelowThreshold ? 'DEFICIT (<80%)' : 'REGULAR'}
          </div>
        </div>
      </div>

      {/* Mobile Navigation Header & Collapsible Submenu (sm:hidden) */}
      <div className="sm:hidden space-y-2">
        {/* Mobile Nav Top Bar */}
        <div className="bg-slate-950 rounded-2xl p-3 border border-slate-800 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-md shrink-0">
              {activeTab === 'mark_attendance' && <Compass className="w-4 h-4" />}
              {activeTab === 'history' && <BarChart2 className="w-4 h-4" />}
              {activeTab === 'leaves' && <FileText className="w-4 h-4" />}
              {activeTab === 'warnings' && <AlertTriangle className="w-4 h-4" />}
              {activeTab === 'tools' && <Wrench className="w-4 h-4" />}
              {activeTab === 'documents' && <FolderOpen className="w-4 h-4" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Active Tab
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-[10px] text-slate-400 truncate">Trainee Portal</span>
              </div>
              <h3 className="font-extrabold text-sm text-white truncate">
                {activeTab === 'mark_attendance' && 'Mark Attendance (GPS)'}
                {activeTab === 'history' && 'Attendance History & Charts'}
                {activeTab === 'leaves' && 'Leaves & Sanctions'}
                {activeTab === 'warnings' && 'Official Notices'}
                {activeTab === 'tools' && 'My Workshop Tools'}
                {activeTab === 'documents' && 'Circulars & Study Files'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              mobileMenuOpen
                ? 'bg-amber-500 text-white shadow-md shadow-amber-950/50 ring-2 ring-amber-400/40'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700'
            }`}
          >
            <Menu className="w-4 h-4 text-amber-400" />
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
          <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl p-3 space-y-2 max-h-[65vh] overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-2 pb-1.5 border-b border-slate-800 text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Select Trainee Section / अनुभाग चुनें</span>
              <span className="text-[10px] text-amber-400 font-mono">ITI Raigarh</span>
            </div>

            {[
              { id: 'mark_attendance', label: 'Mark Attendance (GPS)', hindi: 'जीपीएस उपस्थिति दर्ज', icon: Compass },
              { id: 'history', label: 'Attendance History & Charts', hindi: 'उपस्थिति इतिहास व चार्ट', icon: BarChart2 },
              {
                id: 'leaves',
                label: 'Leaves & Sanctions',
                hindi: 'अवकाश आवेदन',
                icon: FileText,
                badge: leavesList.length,
                badgeType: 'neutral',
              },
              {
                id: 'warnings',
                label: 'Official Notices',
                hindi: 'संस्थान नोटिस',
                icon: AlertTriangle,
                badge: warningsList.length,
                badgeType: 'danger',
              },
              {
                id: 'tools',
                label: 'My Workshop Tools',
                hindi: 'वर्कशॉप औजार',
                icon: Wrench,
                badge: indentsList.length,
                badgeType: 'neutral',
              },
              {
                id: 'documents',
                label: 'Circulars & Study Files',
                hindi: 'परिपत्र व अध्ययन सामग्री',
                icon: FolderOpen,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabClick(tab.id as TraineeTab)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-orange-950/40 ring-1 ring-amber-300'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-amber-400'}`} />
                    <div className="flex flex-col text-left truncate">
                      <span className="text-xs leading-tight font-extrabold truncate">{tab.label}</span>
                      <span className={`text-[10px] leading-tight font-normal truncate ${isActive ? 'text-amber-100' : 'text-slate-400'}`}>
                        {tab.hindi}
                      </span>
                    </div>
                  </div>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ml-1.5 ${
                        isActive
                          ? 'bg-white text-orange-950'
                          : tab.badgeType === 'danger'
                          ? 'bg-rose-500 text-white animate-pulse'
                          : 'bg-slate-800 text-amber-300 border border-slate-700'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Trainee Navigation Tabs - Tablet / Desktop Bar (hidden sm:flex) */}
      <div className="hidden sm:flex bg-slate-950 p-2 rounded-2xl shadow-lg border border-slate-800 ring-1 ring-slate-800/80 items-center gap-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'mark_attendance', label: 'Mark Attendance (GPS)', hindi: 'जीपीएस उपस्थिति दर्ज', icon: Compass },
          { id: 'history', label: 'Attendance History & Charts', hindi: 'उपस्थिति इतिहास व चार्ट', icon: BarChart2 },
          {
            id: 'leaves',
            label: 'Leaves & Sanctions',
            hindi: 'अवकाश आवेदन',
            icon: FileText,
            badge: leavesList.length,
            badgeType: 'neutral',
          },
          {
            id: 'warnings',
            label: 'Official Notices',
            hindi: 'संस्थान नोटिस',
            icon: AlertTriangle,
            badge: warningsList.length,
            badgeType: 'danger',
          },
          {
            id: 'tools',
            label: 'My Workshop Tools',
            hindi: 'वर्कशॉप औजार',
            icon: Wrench,
            badge: indentsList.length,
            badgeType: 'neutral',
          },
          {
            id: 'documents',
            label: 'Circulars & Study Files',
            hindi: 'परिपत्र व अध्ययन सामग्री',
            icon: FolderOpen,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id as TraineeTab)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold shadow-md shadow-orange-950/40 ring-2 ring-amber-300/30 border border-amber-300'
                  : 'bg-slate-900/90 hover:bg-slate-850 text-slate-200 hover:text-white border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <div className="flex flex-col text-left">
                <span className="tracking-tight text-xs leading-tight font-extrabold">{tab.label}</span>
                <span className={`text-[10px] leading-tight font-normal ${isActive ? 'text-amber-100 opacity-90' : 'text-slate-400'}`}>
                  {tab.hindi}
                </span>
              </div>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`ml-1 text-[11px] font-black px-2 py-0.5 rounded-full shadow-xs ${
                    isActive
                      ? 'bg-white text-orange-950'
                      : tab.badgeType === 'danger'
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-slate-800 text-amber-300 border border-slate-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Trainee Content Viewport with header scroll offset */}
      <div id="trainee-content-viewport" className="space-y-6 scroll-mt-28 sm:scroll-mt-32">

      {/* TAB 1: MARK ATTENDANCE (GPS GEOFENCE) */}
      {activeTab === 'mark_attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: GPS Geofence Terminal */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Compass className="w-5 h-5 text-amber-600" />
                  <span>Campus GPS Geofence Attendance Verification</span>
                </h3>
                <span className="font-mono text-xs text-slate-500">
                  {liveNow.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Authorized check-in between {windowEval.start12} and {windowEval.end12} ({windowEval.start24} – {windowEval.end24} IST) within Govt ITI Raigarh campus perimeter ({liveSettings.campusLocation.radiusMeters}m). Auto-absent applies at {windowEval.autoAbsent24} ({windowEval.autoAbsent12}).
              </p>
            </div>

            {enrolledSubjects.length > 1 && (
              <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-indigo-950">Select Trade / Common Subject to Mark:</span>
                  <p className="text-[11px] text-indigo-800/80">
                    Each subject records its own independent daily attendance against your profile.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {enrolledSubjects.map((sub) => {
                    const active = sub.id === selectedAttendanceTradeId;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          setSelectedAttendanceTradeId(sub.id);
                          setAttendanceError('');
                        }}
                        className={`px-3 py-1.5 rounded-lg font-semibold text-xs border transition-colors cursor-pointer ${
                          active
                            ? 'bg-indigo-700 text-white border-indigo-800 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {sub.name}
                        {sub.isCommonTrade ? ' (Common)' : ' (Primary)'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Attendance Window Notice Bar */}
            <div className="p-3 rounded-lg border bg-slate-50 border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-medium text-slate-700">Daily Attendance Window (IST):</span>
                <span className="font-mono font-bold text-slate-900">
                  {windowEval.start12} – {windowEval.end12} ({windowEval.start24} – {windowEval.end24})
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  · Now: {currentIstFormatted}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  isTodayHolidayLocked
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : isTimeWithinWindow
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isTodayHolidayLocked ? 'HOLIDAY (DISABLED)' : isTimeWithinWindow ? 'WINDOW OPEN' : 'WINDOW CLOSED / CUTOFF'}
              </span>
            </div>

            {/* Today Holiday Lock Banner */}
            {isTodayHolidayLocked ? (
              <div className="p-5 rounded-xl border-2 border-rose-200 bg-rose-50/70 text-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                    <Ban className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>Today is an Official Holiday — Attendance Disabled</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-rose-600 text-white font-extrabold text-[10px] uppercase tracking-wider">
                    Holiday
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-800">
                  <div className="bg-white p-2.5 rounded border border-rose-200">
                    <span className="text-[10px] text-slate-500">Occasion</span>
                    <div className="font-bold text-rose-900 mt-0.5">{todayDayLock.title}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-rose-200">
                    <span className="text-[10px] text-slate-500">Category</span>
                    <div className="font-bold text-slate-900 mt-0.5">{todayDayLock.categoryLabel}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-rose-200">
                    <span className="text-[10px] text-slate-500">Date</span>
                    <div className="font-bold text-slate-900 mt-0.5 font-mono">{todayStr}</div>
                  </div>
                </div>
                <p className="text-rose-800">
                  Attendance check-in and GPS verification are automatically disabled on Sundays, 2nd &amp; 3rd Saturdays, and Admin-designated holidays. No absent deduction applies today.
                  {todayHoliday?.remarks ? ` (${todayHoliday.remarks})` : ''}
                </p>
                <button
                  type="button"
                  disabled
                  className="w-full py-3 px-4 bg-slate-200 text-slate-500 font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <Ban className="w-4 h-4" />
                  <span>Mark Attendance Disabled ({todayDayLock.title})</span>
                </button>
              </div>
            ) : todayRecord ? (
              <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50/60 text-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 text-emerald-800 font-bold text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Today's Attendance Recorded Successfully!</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-white border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                    {selectedSubject?.name}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-slate-700">
                  <div className="bg-white p-2.5 rounded border border-emerald-200/80">
                    <span className="text-[10px] text-slate-500">Status</span>
                    <div className="font-bold text-slate-900 mt-0.5 font-mono">{todayRecord.status}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-emerald-200/80">
                    <span className="text-[10px] text-slate-500">Time Recorded</span>
                    <div className="font-bold text-slate-900 mt-0.5 font-mono">{todayRecord.timestamp}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-emerald-200/80">
                    <span className="text-[10px] text-slate-500">Method</span>
                    <div className="font-bold text-slate-900 mt-0.5 font-mono">
                      {todayRecord.markedBy === 'trainee_gps' ? 'GPS Geotag' : 'Officer Manual'}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-emerald-200/80">
                    <span className="text-[10px] text-slate-500">Campus Verification</span>
                    <div className="font-bold text-emerald-700 mt-0.5 font-mono">
                      {todayRecord.geotag ? `Verified (${todayRecord.geotag.distanceFromCampusMeters}m)` : 'Approved'}
                    </div>
                  </div>
                </div>

                {todayRecord.remarks && (
                  <p className="text-[11px] text-slate-600 italic">Remark: {todayRecord.remarks}</p>
                )}
              </div>
            ) : (
              /* Mark Attendance Action Box */
              <div className="space-y-4">
                {/* Live Distance & Campus Status Radar */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-amber-600" />
                      <span>Device GPS Geotag Telemetry</span>
                      {gpsStatusText && (
                        <span className="text-[10px] font-normal text-slate-500 ml-1">
                          · {gpsStatusText}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => requestLocation()}
                      disabled={gpsLoading}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${gpsLoading ? 'animate-spin' : ''}`} />
                      <span>{gpsLoading ? 'Acquiring Device GPS...' : 'Refresh Device GPS'}</span>
                    </button>
                  </div>

                  {gpsError ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs space-y-1.5">
                      <div className="font-semibold">{gpsError}</div>
                      <p className="text-[11px] text-amber-700">
                        {gpsPermission === 'denied'
                          ? 'Browser Location permission is currently blocked. Tap the lock/site-settings icon in your browser address bar, set Location to "Allow" (with Precise Location enabled), then tap "Refresh Device GPS".'
                          : 'Ensure Device GPS / High-Accuracy Location is turned ON in phone settings, step near an open window or doorway, and tap "Refresh Device GPS".'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-white rounded border border-slate-200">
                          <span className="text-slate-500 text-[10px]">Your Distance from Campus Center</span>
                          <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                            {distanceToCampus !== null ? `${distanceToCampus} meters` : 'Acquiring GPS...'}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Allowed: ≤ {liveSettings.campusLocation.radiusMeters}m
                          </span>
                        </div>

                        <div className="p-3 bg-white rounded border border-slate-200">
                          <span className="text-slate-500 text-[10px]">Device GPS Accuracy</span>
                          <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                            {currentCoords ? `±${currentCoords.accuracy}m` : 'Locking...'}
                          </div>
                          <span
                            className={`text-[10px] font-medium ${
                              coordsQuality === 'coarse_network'
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {!currentCoords
                              ? 'Reading device GPS chip'
                              : coordsQuality === 'device_gps'
                              ? `True Device GPS (+${accuracyBuffer}m buffer)`
                              : coordsQuality === 'wifi_assisted'
                              ? `Indoor GPS/Wi-Fi (+${accuracyBuffer}m buffer)`
                              : 'Coarse Network/IP Fix — step outside for GPS'}
                          </span>
                        </div>

                        <div className="p-3 bg-white rounded border border-slate-200">
                          <span className="text-slate-500 text-[10px]">Perimeter Check</span>
                          <div className="text-lg font-bold mt-1">
                            {simulateOnCampus ? (
                              <span className="text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>INSIDE CAMPUS</span>
                              </span>
                            ) : gpsLoading && !currentCoords ? (
                              <span className="text-blue-600 flex items-center gap-1 text-sm">
                                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                                <span>ACQUIRING GPS...</span>
                              </span>
                            ) : isWithinCampusPerimeter ? (
                              <span className="text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>INSIDE CAMPUS</span>
                              </span>
                            ) : (
                              <span className="text-rose-600 flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4 text-rose-500" />
                                <span>OUTSIDE CAMPUS</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">Client Device GPS Geofence</span>
                        </div>
                      </div>

                      {/* Coordinates info strip */}
                      {currentCoords && (
                        <div className="px-3 py-2 bg-white rounded border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 font-mono">
                          <div>
                            <span className="text-slate-400 font-sans">Device GPS Position:</span>{' '}
                            <span className="text-slate-800 font-semibold">{currentCoords.lat}°N, {currentCoords.lng}°E</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-sans">Campus Center:</span>{' '}
                            <span className="text-slate-800 font-semibold">{liveSettings.campusLocation.lat}°N, {liveSettings.campusLocation.lng}°E</span>
                          </div>
                        </div>
                      )}

                      {!simulateOnCampus && coordsQuality === 'coarse_network' && currentCoords && (
                        <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-300 text-amber-900 text-[11px] space-y-1">
                          <div className="font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Coarse Network/IP Location Detected (±{currentCoords.accuracy}m)</span>
                          </div>
                          <p className="text-amber-800 leading-relaxed">
                            Your browser currently returned an approximate ISP/Wi-Fi network location instead of exact hardware GPS coordinates.
                            On a smartphone/tablet, enable <strong>Precise Location / GPS</strong> in browser and OS settings, move near an open doorway or outdoors, and tap <strong>"Refresh Device GPS"</strong>.
                          </p>
                        </div>
                      )}

                      {!isWithinCampusPerimeter && !simulateOnCampus && distanceToCampus !== null && coordsQuality !== 'coarse_network' && (
                        <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-[11px] space-y-1">
                          <div className="font-semibold flex items-center gap-1">
                            <Compass className="w-3.5 h-3.5 text-amber-600" />
                            <span>On-Site GPS Verification Tip:</span>
                          </div>
                          <p className="text-amber-800 leading-relaxed">
                            Your device reported <strong>{currentCoords?.lat}°N, {currentCoords?.lng}°E</strong>, which is <strong>{distanceToCampus}m</strong> from configured Campus Center ({liveSettings.campusLocation.lat}°N, {liveSettings.campusLocation.lng}°E).
                            If you are physically inside the ITI workshop, step near a doorway and tap <strong>"Refresh Device GPS"</strong>, or ask Admin to verify the configured Campus Center coordinates in Settings.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Simulator Toggle for Demo Evaluators */}
                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        checked={simulateOnCampus}
                        onChange={(e) => setSimulateOnCampus(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="font-medium">
                        Test Mode: Simulate On-Campus Location (42m from Workshop Block A)
                      </span>
                    </label>
                    <span className="text-slate-400">For evaluators outside Raigarh campus</span>
                  </div>
                </div>

                {attendanceError && (
                  <div className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-rose-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1">{attendanceError}</div>
                  </div>
                )}

                {!isTimeWithinWindow && !simulateOnCampus && (
                  <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Attendance Window Currently Closed ({currentIstFormatted}).</span>{' '}
                      Official check-in is open from <strong>{windowEval.start12} ({windowEval.start24})</strong> to <strong>{windowEval.end12} ({windowEval.end24})</strong> IST as configured by Admin. If you need late attendance, please contact your Training Officer.
                    </div>
                  </div>
                )}

                {/* Primary Action Button */}
                <button
                  onClick={handleMarkAttendance}
                  disabled={gpsLoading || (!isWithinCampusPerimeter && !simulateOnCampus) || (!isTimeWithinWindow && !simulateOnCampus)}
                  className={`w-full py-3.5 px-6 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
                    (isWithinCampusPerimeter || simulateOnCampus) && (isTimeWithinWindow || simulateOnCampus)
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {gpsLoading && !currentCoords && !simulateOnCampus
                      ? 'Acquiring Exact Device GPS...'
                      : !isTimeWithinWindow && !simulateOnCampus
                      ? `Attendance Window Closed (${windowEval.start12} – ${windowEval.end12} IST)`
                      : isWithinCampusPerimeter || simulateOnCampus
                      ? 'Mark Present Now (Verified Device GPS Geotag)'
                      : 'Cannot Mark: Outside ITI Raigarh Campus Boundary'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Campus Geofence Info & Rules */}
          <div className="lg:col-span-4 space-y-4 text-xs">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-4 h-4 text-blue-600" />
                <span>Government ITI Raigarh Campus</span>
              </h4>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                {liveSettings.campusLocation.address}
              </p>
              <div className="font-mono text-[11px] text-slate-500 p-2.5 bg-slate-50 rounded border border-slate-200">
                Lat: {liveSettings.campusLocation.lat}° N<br />
                Long: {liveSettings.campusLocation.lng}° E<br />
                Geofence Radius: {liveSettings.campusLocation.radiusMeters}m
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Attendance Regulations</span>
              </h4>
              <ul className="space-y-2 text-[11px] text-slate-600 list-disc pl-4">
                <li>
                  Attendance must be marked between {windowEval.start12} and {windowEval.end12} ({windowEval.start24} – {windowEval.end24} IST) daily.
                </li>
                <li>
                  Candidates failing to check in before {windowEval.autoAbsent24} ({windowEval.autoAbsent12}) on a working day are automatically marked Absent.
                </li>
                <li>Attendance marking is automatically disabled on Sundays, 2nd Saturdays, 3rd Saturdays, and Admin-designated Holidays.</li>
                <li>Minimum required attendance for All India Trade Test (AITT) is {liveSettings.minimumAttendancePercent}%.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE HISTORY & CHARTS */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-6 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Personal Attendance History &amp; Breakdown
                {selectedSubject ? ` — ${selectedSubject.name}` : ''}
              </h3>
              <p className="text-slate-500 text-xs">
                Complete log of recorded dates, leave sanctions, and geotag timestamps.
              </p>
            </div>
            {enrolledSubjects.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {enrolledSubjects.map((sub) => {
                  const active = sub.id === selectedAttendanceTradeId;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSelectedAttendanceTradeId(sub.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {sub.name}
                      {sub.isCommonTrade ? ' · Common' : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Graphical Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
              <span className="text-slate-500 text-[10px]">Total Working Days</span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">{totalMarked}</div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
              <span className="text-emerald-700 text-[10px]">Present</span>
              <div className="text-lg font-bold font-mono text-emerald-800 mt-0.5">{presentCount}</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
              <span className="text-amber-700 text-[10px]">Casual Leave (CL)</span>
              <div className="text-lg font-bold font-mono text-amber-800 mt-0.5">{subjectClCount}</div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
              <span className="text-blue-700 text-[10px]">Medical / Half-Day</span>
              <div className="text-lg font-bold font-mono text-blue-800 mt-0.5">{subjectMlCount + subjectHalfDayCount}</div>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-center">
              <span className="text-rose-700 text-[10px]">Absent (Working Days)</span>
              <div className="text-lg font-bold font-mono text-rose-800 mt-0.5">{absentCount}</div>
            </div>
          </div>

          {/* Progress Bar Gauge */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-800">
                Semester Attendance Progress ({subjectAttendancePercent}% of Required 80% · Formula: Present / Working Days × 100)
              </span>
              <span className="font-mono text-slate-600">
                {isSubjectBelowThreshold ? 'Deficit Warning Active' : 'Compliant with NCVT'}
              </span>
            </div>
            <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all duration-500 ${
                  isSubjectBelowThreshold ? 'bg-rose-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(100, subjectAttendancePercent)}%` }}
              />
            </div>
          </div>

          {/* Session Calendar & Holidays View */}
          {(() => {
            const [yStr, mStr] = historyMonth.split('-');
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10);
            const breakdown = calculateMonthWorkingDayBreakdown(y, m, holidays, trainee.sessionId);
            const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
            const cells: Array<
              | { empty: true }
              | ({ empty: false; rec?: AttendanceRecord } & (typeof breakdown.days)[number])
            > = [];
            for (let i = 0; i < firstDow; i++) cells.push({ empty: true });
            for (const dayInfo of breakdown.days) {
              const rec = dayInfo.isWorkingDay
                ? validWorkingAttendanceList.find((a) => a.date === dayInfo.dateStr)
                : undefined;
              cells.push({ empty: false, ...dayInfo, rec });
            }
            const stepMonth = (delta: number) => {
              const next = stepMonthKey(historyMonth, delta);
              setHistoryMonth(next);
              onUpdatePreferences?.({ historyMonth: next });
            };
            const monthHolidays = cells.filter(
              (c): c is { empty: false; rec?: AttendanceRecord } & (typeof breakdown.days)[number] =>
                !c.empty && c.isHoliday
            );

            return (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-rose-600" />
                      <span className="font-bold text-slate-900 text-xs">Session Attendance &amp; Holiday Calendar</span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                      Working Days: <strong>{breakdown.totalWorkingDays}</strong> = {breakdown.totalCalendarDays} Calendar − {breakdown.weeklyHolidays} Weekly Offs − {breakdown.adminDesignatedHolidays} Admin Holidays
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => stepMonth(-1)}
                      className="p-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="month"
                      value={historyMonth}
                      onChange={(e) => {
                        if (e.target.value) {
                          setHistoryMonth(e.target.value);
                          onUpdatePreferences?.({ historyMonth: e.target.value });
                        }
                      }}
                      className="px-2 py-0.5 bg-white border border-slate-300 rounded font-mono text-xs font-bold text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => stepMonth(1)}
                      className="p-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-200 text-center text-[10px] font-bold text-slate-600">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd, idx) => (
                    <div key={wd} className={`py-1.5 ${idx === 0 ? 'text-amber-800 bg-amber-50/70' : idx === 6 ? 'text-orange-900 bg-orange-50/40' : ''}`}>
                      {wd}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
                  {cells.map((c, idx) => {
                    if (c.empty) {
                      return <div key={`empty_tr_${idx}`} className="min-h-[54px] bg-slate-50/60" />;
                    }
                    const isToday = c.dateStr === todayStr;
                    const isGovtSat = c.isSecondSaturday || c.isThirdSaturday;
                    return (
                      <div
                        key={c.dateStr}
                        className={`min-h-[54px] p-1.5 flex flex-col justify-between ${
                          c.isAdminHoliday
                            ? 'bg-rose-50 ring-1 ring-inset ring-rose-300'
                            : isGovtSat
                            ? 'bg-orange-50/80 ring-1 ring-inset ring-orange-200'
                            : c.isSunday
                            ? 'bg-amber-50/50'
                            : c.rec?.status === 'Present'
                            ? 'bg-emerald-50/50'
                            : c.rec?.status === 'Absent'
                            ? 'bg-rose-50/30'
                            : 'bg-white'
                        }`}
                        title={c.lockReason || c.rec?.status || 'Working Day'}
                      >
                        <div className="flex items-center justify-between gap-0.5">
                          <span
                            className={`text-[11px] font-mono font-bold px-1 rounded ${
                              isToday ? 'bg-amber-600 text-white' : c.isAdminHoliday ? 'text-rose-900' : isGovtSat ? 'text-orange-900' : 'text-slate-700'
                            }`}
                          >
                            {c.dayNumber}
                          </span>
                          {c.isAdminHoliday ? (
                            <span className="text-[8px] font-extrabold uppercase px-1 py-0.5 rounded bg-rose-600 text-white">
                              Holiday
                            </span>
                          ) : isGovtSat ? (
                            <span className="text-[8px] font-extrabold uppercase px-1 py-0.5 rounded bg-orange-600 text-white">
                              Holiday
                            </span>
                          ) : c.isSunday ? (
                            <span className="text-[8px] text-amber-800 font-bold">Sun Off</span>
                          ) : c.rec ? (
                            <span
                              className={`text-[9px] font-bold px-1 rounded ${
                                c.rec.status === 'Present'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : c.rec.status === 'Absent'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {c.rec.status === 'Present' ? 'P' : c.rec.status === 'Absent' ? 'A' : c.rec.status === 'CL' ? 'CL' : c.rec.status === 'Medical Leave' ? 'ML' : 'HD'}
                            </span>
                          ) : null}
                        </div>
                        {c.isAdminHoliday && c.adminHoliday ? (
                          <div className="text-[9px] font-semibold text-rose-900 line-clamp-1 leading-tight">
                            {c.adminHoliday.title}
                          </div>
                        ) : isGovtSat ? (
                          <div className="text-[9px] font-semibold text-orange-800 line-clamp-1 leading-tight">
                            {c.weeklyShortTag}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {monthHolidays.length > 0 && (
                  <div className="px-4 py-2.5 bg-rose-50/70 border-t border-rose-200 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-bold text-rose-900">Holidays in {historyMonth}:</span>
                    {monthHolidays
                      .filter((c) => c.isAdminHoliday || c.isSecondSaturday || c.isThirdSaturday)
                      .map((c) => (
                        <span
                          key={c.dateStr}
                          className="px-2 py-0.5 rounded bg-white border border-rose-200 text-rose-800 font-semibold"
                        >
                          <span className="font-mono">{c.dateStr}</span> — {c.title}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Detailed Log Table (valid working days only) */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold">Subject / Trade</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Time Recorded</th>
                  <th className="py-2.5 px-3 font-semibold">Marking Mode</th>
                  <th className="py-2.5 px-3 font-semibold">GPS Distance</th>
                  <th className="py-2.5 px-3 font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {validWorkingAttendanceList.map((rec) => {
                  const recTradeObj = trades.find((t) => t.id === (rec.tradeId || trainee.tradeId));
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors font-sans">
                      <td className="py-2.5 px-3 font-mono text-slate-900 font-semibold">{rec.date}</td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                          {recTradeObj?.name || trainee.tradeName || 'Primary Trade'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            rec.status === 'Present'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : rec.status === 'Absent'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800">{rec.timestamp}</td>
                      <td className="py-2.5 px-3 text-slate-600 text-xs">
                        {rec.markedBy === 'trainee_gps' && 'Student GPS Geotag'}
                        {rec.markedBy === 'officer_manual' && 'Officer Manual'}
                        {rec.markedBy === 'system_auto_absent' && '17:00 Cutoff Auto-Absent'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {rec.geotag ? `${rec.geotag.distanceFromCampusMeters}m (Campus)` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-xs">{rec.remarks || 'Regular workshop'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LEAVES & SANCTIONS */}
      {activeTab === 'leaves' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Leave Applications &amp; Quotas</h3>
              <p className="text-slate-500 text-xs">
                Apply for Casual Leave (CL), Medical Leave (ML), or Half-Day leave and track sanction status.
              </p>
            </div>
            <button
              onClick={() => setLeaveModalOpen(true)}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg shadow-xs transition-colors"
            >
              Apply for Leave
            </button>
          </div>

          {/* Quota Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[10px]">Casual Leave (CL) Balance</span>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {clCount} / {settings.leaveLimits.clAnnual} Used
              </div>
              <span className="text-[10px] text-emerald-600">
                {Math.max(0, settings.leaveLimits.clAnnual - clCount)} Days Remaining
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[10px]">Medical Leave (ML) Balance</span>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {mlCount} / {settings.leaveLimits.medicalAnnual} Used
              </div>
              <span className="text-[10px] text-emerald-600">
                {Math.max(0, settings.leaveLimits.medicalAnnual - mlCount)} Days Remaining
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 text-[10px]">Half-Day Leaves</span>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {halfDayCount} Taken
              </div>
              <span className="text-[10px] text-slate-500">Max {settings.leaveLimits.halfDayMonthlyLimit} / month</span>
            </div>
          </div>

          {/* Leaves Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">Leave Type</th>
                  <th className="py-2.5 px-3 font-semibold">From – To Dates</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Days</th>
                  <th className="py-2.5 px-3 font-semibold">Reason</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Officer Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leavesList.map((lv) => (
                  <tr key={lv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{lv.leaveType}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      {lv.fromDate} to {lv.toDate}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-800">{lv.days}</td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                      <div>{lv.reason}</div>
                      {lv.attachmentUrl && (
                        <a
                          href={lv.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200"
                        >
                          <Download className="w-3 h-3" />
                          <span>{lv.attachmentName || 'Download Attachment'}</span>
                        </a>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
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
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {lv.reviewerRemarks || 'Pending review by Training Officer'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: OFFICIAL NOTICES & WARNINGS */}
      {/* TAB 4: OFFICIAL NOTICES & WARNINGS - HINDI & BILINGUAL */}
      {activeTab === 'warnings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-rose-100 text-rose-800 rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    शासकीय चेतावनी सूचना पत्रक · Official Notices &amp; Directives
                  </h3>
                  <p className="text-slate-500 text-xs">
                    न्यूनतम 80% अनिवार्य उपस्थिति अनुपालन एवं कार्यशाला निर्देशों संबंधी आधिकारिक शासकीय सूचनाएं।
                  </p>
                </div>
              </div>
            </div>

            {/* Language filter for notices */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <span className="text-[11px] text-slate-500 px-2 font-medium">भाषा:</span>
              {(['bilingual', 'hindi', 'english'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    setNoticeLanguage(lang);
                    onUpdatePreferences?.({ noticeLanguage: lang });
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all text-xs cursor-pointer ${
                    noticeLanguage === lang
                      ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'bilingual' ? 'द्विभाषी (Bilingual)' : lang === 'hindi' ? 'हिन्दी (Hindi)' : 'English'}
                </button>
              ))}
            </div>
          </div>

          {warningsList.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-800">कोई चेतावनी या अनुशासनात्मक सूचना नहीं है।</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                No disciplinary or attendance warning notices on your record. Attendance is regular.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {warningsList.map((w) => (
                <div key={w.id} className="p-4 sm:p-5 rounded-2xl border-2 border-rose-200 bg-rose-50/40 space-y-3.5 shadow-xs">
                  {/* Notice Title Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 pb-3">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="px-2.5 py-1 rounded bg-rose-700 text-white font-mono font-bold text-xs shadow-xs">
                        {w.refNumber}
                      </span>
                      {w.tradeName && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-semibold">
                          {w.tradeName}
                        </span>
                      )}
                      <span className="text-slate-500 text-xs font-medium hidden sm:inline">
                        शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़ (छ.ग.)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-500 text-[11px] bg-white px-2 py-0.5 rounded border border-rose-100">
                        दिनांक: {w.issuedDate}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          w.status === 'acknowledged'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                        }`}
                      >
                        {w.status === 'acknowledged' ? 'पावती स्वीकृत (ACKNOWLEDGED)' : 'पावती लंबित (ACTION REQUIRED)'}
                      </span>
                    </div>
                  </div>

                  {/* Hindi Notice Directive Block */}
                  {(noticeLanguage === 'hindi' || noticeLanguage === 'bilingual') && (
                    <div className="p-4 bg-amber-50/80 border-2 border-amber-300/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-300 text-amber-950 px-2 py-0.5 rounded">
                          शासकीय हिन्दी चेतावनी आदेश
                        </span>
                        <span className="text-[11px] font-mono font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded">
                          दर्ज उपस्थिति: {w.attendancePercent}% (न्यूनतम आवश्यक: 80%)
                        </span>
                      </div>

                      <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                        विषय: {w.subjectHindi || 'न्यून उपस्थिति (80% से कम) संबंधी औपचारिक चेतावनी'}
                      </div>

                      <p className="text-slate-800 text-xs leading-relaxed whitespace-pre-line font-medium pt-1">
                        {w.messageHindi || w.message}
                      </p>

                      <div className="p-2.5 bg-amber-100/70 border border-amber-300/60 rounded-lg text-[11px] text-amber-950 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                        <div>
                          <strong>महत्वपूर्ण निर्देश:</strong> DGT/NCVT नियमों के तहत परीक्षा में शामिल होने हेतु कम से कम 80% उपस्थिति अनिवार्य है। कृपया कार्यशाला में नियमित रूप से उपस्थित होकर अपनी उपस्थिति में तत्काल सुधार करें तथा अपने प्रशिक्षण अधिकारी ({w.officerName}) से संपर्क करें।
                        </div>
                      </div>
                    </div>
                  )}

                  {/* English Notice Directive Block */}
                  {(noticeLanguage === 'english' || noticeLanguage === 'bilingual') && (
                    <div className="p-3.5 bg-white border border-rose-200 rounded-xl space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Official English Directive (DGT Regulation)
                      </div>
                      <div className="font-bold text-slate-900 text-xs">{w.subject}</div>
                      <p className="text-slate-700 leading-relaxed text-[11px] whitespace-pre-line">
                        {w.message}
                      </p>
                    </div>
                  )}

                  {/* Footer & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-rose-200/60 text-[11px]">
                    <div className="text-slate-600">
                      जारीकर्ता: <strong className="text-slate-800">{w.officerName}</strong> (प्रशिक्षण अधिकारी, ITI रायगढ़)
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewOrderNotice(w)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        title="View and print official government letterhead notice"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        <span>शासकीय आदेश पत्रक देखें (View Letter)</span>
                      </button>

                      {w.status === 'issued' && (
                        <button
                          onClick={() => handleAcknowledgeWarning(w.id)}
                          className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>पावती स्वीकार करें (Acknowledge Receipt)</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: MY WORKSHOP TOOLS (INDENTS) */}
      {activeTab === 'tools' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4 text-xs">
          <div>
            <h3 className="font-bold text-sm text-slate-900">My Workshop Tools &amp; Equipment Indents</h3>
            <p className="text-slate-500 text-xs">
              Tools and testing instruments currently borrowed for practical workshop sessions.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">Indent No</th>
                  <th className="py-2.5 px-3 font-semibold">Tool / Equipment Name</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Qty</th>
                  <th className="py-2.5 px-3 font-semibold">Issue Date</th>
                  <th className="py-2.5 px-3 font-semibold">Due Return Date</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {indentsList.map((ind) => (
                  <tr key={ind.id} className="hover:bg-slate-50/80 transition-colors font-sans">
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{ind.indentNo}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{ind.itemName}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-800">{ind.quantity}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{ind.issueDate}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{ind.expectedReturnDate}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${
                          ind.status === 'returned'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ind.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: CIRCULARS, STUDY MATERIALS & MY DOCUMENTS */}
      {activeTab === 'documents' && (
        <DocumentVaultPanel
          currentUserId={trainee.id}
          currentUserName={trainee.name}
          currentUserRole="trainee"
          trades={[]}
          sessions={[]}
          defaultTradeId={trainee.tradeId}
        />
      )}
      </div>

      {/* MODAL: APPLY FOR LEAVE */}
      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs text-slate-800">
            <h3 className="font-bold text-sm text-slate-900 mb-4">
              Apply for Leave — {trainee.name}
            </h3>
            <form onSubmit={handleApplyLeave} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Leave Type</label>
                <select
                  value={leaveForm.leaveType}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value as LeaveType })}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                >
                  <option value="Casual Leave (CL)">Casual Leave (CL)</option>
                  <option value="Medical Leave (ML)">Medical Leave (ML)</option>
                  <option value="Half-Day Leave">Half-Day Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">From Date</label>
                  <input
                    type="date"
                    value={leaveForm.fromDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">To Date</label>
                  <input
                    type="date"
                    value={leaveForm.toDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Number of Days</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={leaveForm.days}
                  onChange={(e) => setLeaveForm({ ...leaveForm, days: parseFloat(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Detailed Reason for Absence</label>
                <textarea
                  rows={3}
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  placeholder="State reason clearly (e.g. sickness, urgent family work, tehsildar office visit)"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 font-medium mb-1">
                  <Paperclip className="w-3.5 h-3.5 text-amber-700" />
                  <span>Supporting Document / Medical Certificate (Optional, up to 8 MB)</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  onChange={(e) => setLeaveAttachmentFile(e.target.files?.[0] || null)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-[11px] bg-slate-50"
                />
                {leaveAttachmentFile && (
                  <p className="text-[10px] text-emerald-700 mt-1 font-medium">
                    Ready to upload to Cloud: {leaveAttachmentFile.name}
                  </p>
                )}
              </div>

              {leaveSubmitError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium">
                  {leaveSubmitError}
                </div>
              )}

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLeaveModalOpen(false);
                    setLeaveSubmitError('');
                  }}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={leaveSubmitting}
                  className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium disabled:opacity-60"
                >
                  {leaveSubmitting ? 'Saving to Cloud...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VIEW OFFICIAL LETTER ORDER (TRAINEE VIEW) */}
      {viewOrderNotice && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-2xl w-full p-6 sm:p-8 text-xs text-slate-900 max-h-[92vh] overflow-y-auto">
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5 print:hidden">
              <span className="text-xs font-bold text-slate-700">
                शासकीय आदेश पत्रक (Official Notice Letter)
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
                  onClick={() => setViewOrderNotice(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Letterhead Body */}
            <div className="p-6 border-2 border-slate-300 bg-white rounded-xl space-y-4">
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

              <div className="flex justify-between items-center text-[11px] font-mono border-b border-slate-200 pb-2">
                <div>
                  <strong>क्रमांक:</strong> {viewOrderNotice.refNumber}
                </div>
                <div>
                  <strong>दिनांक:</strong> {viewOrderNotice.issuedDate}
                </div>
              </div>

              <div className="text-[11px] space-y-0.5">
                <div><strong>प्रति (To),</strong></div>
                <div className="pl-4">
                  <div><strong>प्रशिक्षु:</strong> {viewOrderNotice.traineeName} ({viewOrderNotice.rollNo})</div>
                  <div><strong>ट्रेड:</strong> {viewOrderNotice.tradeName || trainee.tradeName || 'Electrician'}</div>
                  <div><strong>संस्था:</strong> शासकीय आईटीआई रायगढ़ (छ.ग.)</div>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-[11px] font-bold">
                <div>विषय: {viewOrderNotice.subjectHindi || viewOrderNotice.subject}</div>
                <div className="text-[10px] text-slate-600 font-normal mt-0.5">
                  Sub: {viewOrderNotice.subject}
                </div>
              </div>

              <div className="text-xs leading-relaxed space-y-2 text-justify">
                <p className="font-medium text-slate-900">
                  उपरोक्त विषयान्तर्गत लेख है कि सत्र 2025-2026 के अंतर्गत आपकी अब तक की कुल उपस्थिति{' '}
                  <strong className="text-rose-700 font-mono underline">{viewOrderNotice.attendancePercent}%</strong> दर्ज की गई है, जो कि DGT / NCVT के न्यूनतम अनिवार्य मानक <strong className="underline">80%</strong> से अत्यंत कम है।
                </p>

                <p className="text-slate-800 bg-slate-50 p-3 rounded border border-slate-200">
                  {viewOrderNotice.messageHindi || viewOrderNotice.message}
                </p>

                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[11px] text-slate-600 italic">
                  <strong>English Directive:</strong> {viewOrderNotice.message}
                </div>
              </div>

              <div className="pt-6 flex justify-between items-end text-[11px]">
                <div className="text-left space-y-1">
                  <div className="text-[10px] text-slate-500 font-mono">
                    पावती स्थिति: <strong>{viewOrderNotice.status.toUpperCase()}</strong>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    डिजिटल सत्यापन कोड: <span className="font-mono">ITI-RAI-CG-ATT-VERIFIED</span>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <div className="h-10 flex items-center justify-center font-serif italic text-slate-400 text-xs">
                    (हस्ताक्षरित)
                  </div>
                  <div className="font-extrabold text-slate-900">{viewOrderNotice.officerName}</div>
                  <div className="text-slate-600 font-medium">प्रशिक्षण अधिकारी (Training Officer)</div>
                  <div className="text-[10px] text-slate-500">शासकीय औद्योगिक प्रशिक्षण संस्था, रायगढ़</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
