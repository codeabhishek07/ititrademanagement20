import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  AttendanceRecord,
  LeaveRequest,
  WarningNotice,
  IndentRecord,
  SystemSettings,
  LeaveType,
} from '../../types.ts';
import {
  fetchAttendance,
  markTraineeAttendance,
  fetchLeaves,
  applyLeave,
  fetchWarnings,
  acknowledgeWarning,
  fetchIndents,
} from '../../api.ts';

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
}

type TraineeTab = 'mark_attendance' | 'history' | 'leaves' | 'warnings' | 'tools';

export const TraineeDashboard: React.FC<TraineeDashboardProps> = ({
  trainee,
  settings,
  selectedTab,
  onTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<TraineeTab>(selectedTab || 'mark_attendance');

  useEffect(() => {
    if (selectedTab) {
      setActiveTab(selectedTab);
    }
  }, [selectedTab]);

  const handleTabClick = (tab: TraineeTab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  // GPS State
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [distanceToCampus, setDistanceToCampus] = useState<number | null>(null);
  const [simulateOnCampus, setSimulateOnCampus] = useState(false);

  // Entities
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [leavesList, setLeavesList] = useState<LeaveRequest[]>([]);
  const [warningsList, setWarningsList] = useState<WarningNotice[]>([]);
  const [indentsList, setIndentsList] = useState<IndentRecord[]>([]);

  // Apply Leave Modal
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'Casual Leave (CL)' as LeaveType,
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    days: 1,
    reason: '',
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecord = attendanceList.find((a) => a.date === todayStr);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const loadTraineeData = async () => {
    setLoading(true);
    try {
      const [att, lvs, wrns, inds] = await Promise.all([
        fetchAttendance({ traineeId: trainee.id }),
        fetchLeaves({ traineeId: trainee.id }),
        fetchWarnings({ traineeId: trainee.id }),
        fetchIndents({ traineeId: trainee.id }),
      ]);
      setAttendanceList(att);
      setLeavesList(lvs);
      setWarningsList(wrns);
      setIndentsList(inds);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTraineeData();
    requestLocation();
  }, [trainee.id]);

  // Haversine distance calculator
  function computeMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  // GPS Geolocation Handler
  const requestLocation = () => {
    setGpsLoading(true);
    setGpsError('');

    if (simulateOnCampus) {
      // Simulate exact coordinates inside Govt ITI Raigarh campus
      const simLat = settings.campusLocation.lat + 0.0002;
      const simLng = settings.campusLocation.lng + 0.0001;
      setCurrentCoords({ lat: simLat, lng: simLng, accuracy: 8 });
      const dist = computeMeters(simLat, simLng, settings.campusLocation.lat, settings.campusLocation.lng);
      setDistanceToCampus(dist);
      setGpsLoading(false);
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setCurrentCoords({ lat: latitude, lng: longitude, accuracy: Math.round(accuracy) });
        const dist = computeMeters(latitude, longitude, settings.campusLocation.lat, settings.campusLocation.lng);
        setDistanceToCampus(dist);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(`GPS permission required: ${err.message}. (You can toggle Test Simulator below if testing outside Raigarh)`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  useEffect(() => {
    requestLocation();
  }, [simulateOnCampus]);

  // Mark Attendance via GPS
  const handleMarkAttendance = async () => {
    if (!currentCoords && !simulateOnCampus) {
      alert('Please wait for GPS coordinates or enable Test Simulator mode.');
      return;
    }

    try {
      setGpsLoading(true);
      const res = await markTraineeAttendance({
        traineeId: trainee.id,
        userLat: currentCoords?.lat || settings.campusLocation.lat,
        userLng: currentCoords?.lng || settings.campusLocation.lng,
        accuracy: currentCoords?.accuracy || 10,
        forceSimulation: simulateOnCampus,
      });

      showToast(res.message || 'Attendance recorded successfully!');
      loadTraineeData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGpsLoading(false);
    }
  };

  // Apply Leave Handler
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await applyLeave({
        traineeId: trainee.id,
        leaveType: leaveForm.leaveType,
        fromDate: leaveForm.fromDate,
        toDate: leaveForm.toDate,
        days: leaveForm.days,
        reason: leaveForm.reason,
      });
      showToast('Leave application submitted to Training Officer');
      setLeaveModalOpen(false);
      loadTraineeData();
    } catch (err: any) {
      alert(err.message);
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

  // Calculate Personal Stats
  const totalMarked = attendanceList.length;
  const presentCount = attendanceList.filter((a) => a.status === 'Present').length;
  const clCount = attendanceList.filter((a) => a.status === 'CL').length;
  const mlCount = attendanceList.filter((a) => a.status === 'Medical Leave').length;
  const halfDayCount = attendanceList.filter((a) => a.status === 'Half-Day Leave').length;
  const absentCount = attendanceList.filter((a) => a.status === 'Absent').length;

  const effectiveAttended = presentCount + clCount + mlCount + halfDayCount * 0.5;
  const attendancePercent = totalMarked > 0 ? Math.round((effectiveAttended / totalMarked) * 1000) / 10 : 100;
  const isBelowThreshold = attendancePercent < settings.minimumAttendancePercent;

  // Window check
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const win = settings.attendanceWindow;
  const isTimeWithinWindow =
    (hours > win.startHour || (hours === win.startHour && minutes >= win.startMinute)) &&
    (hours < win.endHour || (hours === win.endHour && minutes <= win.endMinute));

  const isWithinCampusPerimeter =
    distanceToCampus !== null && distanceToCampus <= settings.campusLocation.radiusMeters;

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
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">{trainee.name}</h2>
              <span className="text-[11px] font-mono font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                {trainee.rollNo}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Trade: <span className="font-semibold text-slate-700">{trainee.tradeName || 'Electrician'}</span> · Govt. ITI Raigarh
            </p>
          </div>
        </div>

        {/* Overall Attendance Stat Pill */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] text-slate-500 font-medium">Recorded Attendance</div>
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

      {/* Trainee Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200 text-xs">
        {[
          { id: 'mark_attendance', label: 'Mark Attendance (GPS)', icon: Compass },
          { id: 'history', label: 'Attendance History & Charts', icon: BarChart2 },
          { id: 'leaves', label: `Leaves & Sanctions (${leavesList.length})`, icon: FileText },
          { id: 'warnings', label: `Official Notices (${warningsList.length})`, icon: AlertTriangle },
          { id: 'tools', label: `My Workshop Tools (${indentsList.length})`, icon: Wrench },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id as TraineeTab)}
              className={`flex items-center gap-2 px-3.5 py-2 font-medium rounded-t-lg transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                isActive
                  ? 'border-amber-600 text-amber-700 bg-amber-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

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
                  {new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Authorized check-in between 07:00 AM and 10:00 AM within Govt ITI Raigarh campus perimeter ({settings.campusLocation.radiusMeters}m).
              </p>
            </div>

            {/* Attendance Window Notice Bar */}
            <div className="p-3 rounded-lg border bg-slate-50 border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-slate-700">Daily Attendance Window:</span>
                <span className="font-mono font-bold text-slate-900">
                  {settings.attendanceWindow.startHour}:00 AM – {settings.attendanceWindow.endHour}:00 AM
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  isTimeWithinWindow
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isTimeWithinWindow ? 'WINDOW OPEN' : 'WINDOW CLOSED / CUTOFF'}
              </span>
            </div>

            {/* Today's Already Marked Card */}
            {todayRecord ? (
              <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50/60 text-xs space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Today's Attendance Recorded Successfully!</span>
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
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-amber-600" />
                      <span>Live Geotag Telemetry</span>
                    </span>
                    <button
                      onClick={requestLocation}
                      disabled={gpsLoading}
                      className="text-blue-600 hover:text-blue-800 text-[11px] flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${gpsLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh GPS</span>
                    </button>
                  </div>

                  {gpsError ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                      {gpsError}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-white rounded border border-slate-200">
                        <span className="text-slate-500 text-[10px]">Your Distance from ITI Raigarh</span>
                        <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                          {distanceToCampus !== null ? `${distanceToCampus} meters` : 'Calculating...'}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Allowed: ≤ {settings.campusLocation.radiusMeters}m
                        </span>
                      </div>

                      <div className="p-3 bg-white rounded border border-slate-200">
                        <span className="text-slate-500 text-[10px]">GPS Accuracy</span>
                        <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                          {currentCoords ? `± ${currentCoords.accuracy}m` : 'Acquiring...'}
                        </div>
                        <span className="text-[10px] text-slate-400">High Precision Mode</span>
                      </div>

                      <div className="p-3 bg-white rounded border border-slate-200">
                        <span className="text-slate-500 text-[10px]">Perimeter Check</span>
                        <div className="text-lg font-bold mt-1">
                          {isWithinCampusPerimeter || simulateOnCampus ? (
                            <span className="text-emerald-700">INSIDE CAMPUS</span>
                          ) : (
                            <span className="text-rose-600">OUTSIDE CAMPUS</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">Geofence Boundary</span>
                      </div>
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

                {/* Primary Action Button */}
                <button
                  onClick={handleMarkAttendance}
                  disabled={gpsLoading || (!isWithinCampusPerimeter && !simulateOnCampus)}
                  className={`w-full py-3.5 px-6 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
                    isWithinCampusPerimeter || simulateOnCampus
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {isWithinCampusPerimeter || simulateOnCampus
                      ? 'Mark Present Now (Verified GPS Geotag)'
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
                {settings.campusLocation.address}
              </p>
              <div className="font-mono text-[11px] text-slate-500 p-2.5 bg-slate-50 rounded border border-slate-200">
                Lat: {settings.campusLocation.lat}° N<br />
                Long: {settings.campusLocation.lng}° E<br />
                Geofence Radius: {settings.campusLocation.radiusMeters}m
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Attendance Regulations</span>
              </h4>
              <ul className="space-y-2 text-[11px] text-slate-600 list-disc pl-4">
                <li>Attendance must be marked between 07:00 AM and 10:00 AM daily.</li>
                <li>Candidates failing to check in before 10:00 AM are automatically marked Absent.</li>
                <li>Any corrections or late entries require explicit Training Officer authorization.</li>
                <li>Minimum required attendance for All India Trade Test (AITT) is 80%.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE HISTORY & CHARTS */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-6 text-xs">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Personal Attendance History &amp; Breakdown</h3>
            <p className="text-slate-500 text-xs">
              Complete log of recorded dates, leave sanctions, and geotag timestamps.
            </p>
          </div>

          {/* Graphical Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
              <span className="text-slate-500 text-[10px]">Total Recorded Days</span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">{totalMarked}</div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
              <span className="text-emerald-700 text-[10px]">Present</span>
              <div className="text-lg font-bold font-mono text-emerald-800 mt-0.5">{presentCount}</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
              <span className="text-amber-700 text-[10px]">Casual Leave (CL)</span>
              <div className="text-lg font-bold font-mono text-amber-800 mt-0.5">{clCount}</div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
              <span className="text-blue-700 text-[10px]">Medical / Half-Day</span>
              <div className="text-lg font-bold font-mono text-blue-800 mt-0.5">{mlCount + halfDayCount}</div>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-center">
              <span className="text-rose-700 text-[10px]">Absent</span>
              <div className="text-lg font-bold font-mono text-rose-800 mt-0.5">{absentCount}</div>
            </div>
          </div>

          {/* Progress Bar Gauge */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-800">
                Semester Attendance Progress ({attendancePercent}% of Required 80%)
              </span>
              <span className="font-mono text-slate-600">
                {isBelowThreshold ? 'Deficit Warning Active' : 'Compliant with NCVT'}
              </span>
            </div>
            <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all duration-500 ${
                  isBelowThreshold ? 'bg-rose-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(100, attendancePercent)}%` }}
              />
            </div>
          </div>

          {/* Detailed Log Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Time Recorded</th>
                  <th className="py-2.5 px-3 font-semibold">Marking Mode</th>
                  <th className="py-2.5 px-3 font-semibold">GPS Distance</th>
                  <th className="py-2.5 px-3 font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {attendanceList.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors font-sans">
                    <td className="py-2.5 px-3 font-mono text-slate-900 font-semibold">{rec.date}</td>
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
                      {rec.markedBy === 'system_auto_absent' && '10 AM Cutoff System'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      {rec.geotag ? `${rec.geotag.distanceFromCampusMeters}m (Campus)` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-xs">{rec.remarks || 'Regular workshop'}</td>
                  </tr>
                ))}
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
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs">{lv.reason}</td>
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
      {activeTab === 'warnings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4 text-xs">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Official Notices &amp; Warnings</h3>
            <p className="text-slate-500 text-xs">
              Notifications issued by your Training Officer regarding attendance compliance and workshop directives.
            </p>
          </div>

          {warningsList.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No disciplinary or attendance warning notices on your record.
            </div>
          ) : (
            <div className="space-y-3">
              {warningsList.map((w) => (
                <div key={w.id} className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span className="font-mono font-bold text-rose-900">{w.refNumber}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-500 text-[11px]">Date: {w.issuedDate}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          w.status === 'acknowledged'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {w.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="font-semibold text-slate-900">{w.subject}</div>
                  <p className="p-3 bg-white rounded border border-rose-100 text-slate-700 leading-relaxed text-[11px]">
                    {w.message}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-slate-500">
                      Officer: {w.officerName} · Recorded Deficit: <span className="font-mono font-bold text-rose-700">{w.attendancePercent}%</span>
                    </div>
                    {w.status === 'issued' && (
                      <button
                        onClick={() => handleAcknowledgeWarning(w.id)}
                        className="px-3 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded text-[11px] font-medium"
                      >
                        Acknowledge Receipt
                      </button>
                    )}
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

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
