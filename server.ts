import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { db } from './src/server/db.ts';
import { AttendanceRecord, LeaveRequest, WarningNotice, InventoryItem, IndentRecord, Trainee, TrainingOfficer, Trade, AcademicSession, MonthlyWorkingDay, AppNotification } from './src/types.ts';

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // -------------------------------------------------------------
  // API Endpoints
  // -------------------------------------------------------------

  // Bootstrap / Current State
  app.get('/api/bootstrap', (req: Request, res: Response) => {
    const data = db.get();
    res.json({
      settings: data.settings,
      sessions: data.sessions,
      trades: data.trades,
      stats: {
        totalTrades: data.trades.filter((t) => t.status === 'active').length,
        totalOfficers: data.officers.filter((o) => o.status === 'active').length,
        totalTrainees: data.trainees.filter((t) => t.status === 'active').length,
        totalInventoryItems: data.inventory.length,
      },
    });
  });

  // Auth: Role-based / credentials login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { role, email, password, officerId, traineeId } = req.body;
    const data = db.get();

    if (role === 'admin') {
      // Allow demo admin or admin credentials
      if (password && password !== 'admin123') {
        return res.status(401).json({ error: 'Invalid admin credentials' });
      }
      db.addAuditLog({
        userId: 'usr_admin',
        userName: 'Principal / Admin',
        userRole: 'admin',
        action: 'ADMIN_LOGIN',
        details: 'Admin logged into administration portal.',
        ipAddress: req.ip,
      });
      return res.json({
        user: {
          id: 'usr_admin',
          role: 'admin',
          name: 'Shri S. K. Patel (Principal / Admin)',
          email: 'admin.iti.raigarh@cg.gov.in',
          mobile: '+91 98261 45210',
        },
      });
    }

    if (role === 'officer') {
      let officer = data.officers.find((o) => o.id === officerId || o.email === email);
      if (!officer) {
        officer = data.officers[0]; // fallback to first officer for quick demo switch
      }
      if (officer.status !== 'active') {
        return res.status(403).json({ error: 'This Training Officer account is inactive. Please contact Administrator.' });
      }
      db.addAuditLog({
        userId: officer.id,
        userName: officer.name,
        userRole: 'officer',
        action: 'OFFICER_LOGIN',
        details: `Training Officer logged in for trade(s): ${officer.assignedTradeIds.join(', ')}.`,
        ipAddress: req.ip,
      });
      return res.json({
        user: {
          id: officer.id,
          role: 'officer',
          name: officer.name,
          email: officer.email,
          mobile: officer.mobile,
          employeeId: officer.employeeId,
          assignedTradeIds: officer.assignedTradeIds,
          designation: officer.designation,
        },
      });
    }

    if (role === 'trainee') {
      let trainee = data.trainees.find((t) => t.id === traineeId || t.rollNo === email || t.email === email);
      if (!trainee) {
        trainee = data.trainees[0];
      }
      if (trainee.status !== 'active') {
        return res.status(403).json({ error: 'This Trainee account is inactive.' });
      }
      db.addAuditLog({
        userId: trainee.id,
        userName: trainee.name,
        userRole: 'trainee',
        action: 'TRAINEE_LOGIN',
        details: `Trainee logged in: Roll No ${trainee.rollNo}.`,
        ipAddress: req.ip,
      });
      return res.json({
        user: {
          id: trainee.id,
          role: 'trainee',
          name: trainee.name,
          email: trainee.email,
          mobile: trainee.mobile,
          rollNo: trainee.rollNo,
          tradeId: trainee.tradeId,
          sessionId: trainee.sessionId,
          category: trainee.category,
          gender: trainee.gender,
        },
      });
    }

    res.status(400).json({ error: 'Invalid role requested' });
  });

  // Settings
  app.get('/api/settings', (_req: Request, res: Response) => {
    res.json(db.get().settings);
  });

  app.put('/api/settings', (req: Request, res: Response) => {
    const data = db.get();
    data.settings = { ...data.settings, ...req.body };
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'UPDATE_SETTINGS',
      details: 'Updated campus geofence, attendance window, or leave rules.',
    });
    res.json({ success: true, settings: data.settings });
  });

  // Academic Sessions
  app.get('/api/sessions', (_req: Request, res: Response) => {
    res.json(db.get().sessions);
  });

  app.post('/api/sessions', (req: Request, res: Response) => {
    const data = db.get();
    const newSession: AcademicSession = {
      id: `session_${Date.now()}`,
      name: req.body.name,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      totalWorkingDays: Number(req.body.totalWorkingDays) || 240,
      status: req.body.status || 'upcoming',
    };
    data.sessions.push(newSession);
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'CREATE_SESSION',
      details: `Created new academic session: ${newSession.name}.`,
    });
    res.json({ success: true, session: newSession });
  });

  app.put('/api/sessions/:id', (req: Request, res: Response) => {
    const data = db.get();
    const idx = data.sessions.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Session not found' });
    data.sessions[idx] = { ...data.sessions[idx], ...req.body };
    db.save();
    res.json({ success: true, session: data.sessions[idx] });
  });

  app.delete('/api/sessions/:id', (req: Request, res: Response) => {
    const data = db.get();
    data.sessions = data.sessions.filter((s) => s.id !== req.params.id);
    db.save();
    res.json({ success: true });
  });

  // Monthly Working Days
  app.get('/api/monthly-working-days', (req: Request, res: Response) => {
    const { sessionId } = req.query;
    const data = db.get();
    const list = sessionId ? data.monthlyWorkingDays.filter((m) => m.sessionId === sessionId) : data.monthlyWorkingDays;
    res.json(list);
  });

  app.post('/api/monthly-working-days', (req: Request, res: Response) => {
    const data = db.get();
    const { sessionId, month, workingDays, totalDays, holidays, remarks } = req.body;
    const existingIdx = data.monthlyWorkingDays.findIndex((m) => m.sessionId === sessionId && m.month === month);

    if (existingIdx >= 0) {
      data.monthlyWorkingDays[existingIdx] = {
        ...data.monthlyWorkingDays[existingIdx],
        workingDays: Number(workingDays),
        totalDays: Number(totalDays) || 30,
        holidays: Number(holidays) || 0,
        remarks,
      };
    } else {
      data.monthlyWorkingDays.push({
        id: `mwd_${Date.now()}`,
        sessionId,
        month,
        totalDays: Number(totalDays) || 30,
        workingDays: Number(workingDays),
        holidays: Number(holidays) || 0,
        remarks,
      });
    }
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'CONFIG_WORKING_DAYS',
      details: `Configured working days for month ${month}: ${workingDays} days.`,
    });
    res.json({ success: true, monthlyWorkingDays: data.monthlyWorkingDays });
  });

  // Trades Management
  app.get('/api/trades', (_req: Request, res: Response) => {
    res.json(db.get().trades);
  });

  app.post('/api/trades', (req: Request, res: Response) => {
    const data = db.get();
    const newTrade: Trade = {
      id: `trade_${Date.now()}`,
      name: req.body.name,
      code: req.body.code,
      durationYears: Number(req.body.durationYears) || 2,
      sanctionedUnits: Number(req.body.sanctionedUnits) || 1,
      totalIntake: Number(req.body.totalIntake) || 20,
      workshopLocation: req.body.workshopLocation || 'Main Campus',
      description: req.body.description || '',
      status: req.body.status || 'active',
    };
    data.trades.push(newTrade);
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'ADD_TRADE',
      details: `Added new trade: ${newTrade.name} (${newTrade.code}).`,
    });
    res.json({ success: true, trade: newTrade });
  });

  app.put('/api/trades/:id', (req: Request, res: Response) => {
    const data = db.get();
    const idx = data.trades.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Trade not found' });
    data.trades[idx] = { ...data.trades[idx], ...req.body };
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'ALTER_TRADE',
      details: `Updated trade details for: ${data.trades[idx].name}.`,
    });
    res.json({ success: true, trade: data.trades[idx] });
  });

  app.delete('/api/trades/:id', (req: Request, res: Response) => {
    const data = db.get();
    const trade = data.trades.find((t) => t.id === req.params.id);
    data.trades = data.trades.filter((t) => t.id !== req.params.id);
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'DELETE_TRADE',
      details: `Deleted trade: ${trade?.name || req.params.id}.`,
    });
    res.json({ success: true });
  });

  // Training Officers
  app.get('/api/officers', (_req: Request, res: Response) => {
    res.json(db.get().officers);
  });

  app.post('/api/officers', (req: Request, res: Response) => {
    const data = db.get();
    const newOfficer: TrainingOfficer = {
      id: `off_${Date.now()}`,
      name: req.body.name,
      email: req.body.email,
      mobile: req.body.mobile,
      employeeId: req.body.employeeId || `CG-ITI-TO-${Math.floor(1000 + Math.random() * 9000)}`,
      assignedTradeIds: req.body.assignedTradeIds || [],
      designation: req.body.designation || 'Training Officer',
      qualification: req.body.qualification || 'Diploma/B.Tech, CITS',
      status: req.body.status || 'active',
      password: req.body.password || 'officer123',
    };
    data.officers.push(newOfficer);
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'CREATE_OFFICER',
      details: `Created Training Officer account for ${newOfficer.name} (Emp ID: ${newOfficer.employeeId}).`,
    });
    res.json({ success: true, officer: newOfficer });
  });

  app.put('/api/officers/:id', (req: Request, res: Response) => {
    const data = db.get();
    const idx = data.officers.findIndex((o) => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Officer not found' });
    data.officers[idx] = { ...data.officers[idx], ...req.body };
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'ALTER_OFFICER',
      details: `Updated Training Officer profile / trade assignments for: ${data.officers[idx].name}.`,
    });
    res.json({ success: true, officer: data.officers[idx] });
  });

  app.post('/api/officers/:id/reset-password', (req: Request, res: Response) => {
    const data = db.get();
    const officer = data.officers.find((o) => o.id === req.params.id);
    if (!officer) return res.status(404).json({ error: 'Officer not found' });
    officer.password = req.body.newPassword || 'officer123';
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'RESET_OFFICER_PASSWORD',
      details: `Reset password for Training Officer: ${officer.name}.`,
    });
    res.json({ success: true, message: `Password successfully reset for ${officer.name}.` });
  });

  app.delete('/api/officers/:id', (req: Request, res: Response) => {
    const data = db.get();
    const officer = data.officers.find((o) => o.id === req.params.id);
    data.officers = data.officers.filter((o) => o.id !== req.params.id);
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'DELETE_OFFICER',
      details: `Removed Training Officer account: ${officer?.name || req.params.id}.`,
    });
    res.json({ success: true });
  });

  // Trainees
  app.get('/api/trainees', (req: Request, res: Response) => {
    const { tradeId, sessionId } = req.query;
    const data = db.get();
    let list = data.trainees;
    if (tradeId) list = list.filter((t) => t.tradeId === tradeId);
    if (sessionId) list = list.filter((t) => t.sessionId === sessionId);
    res.json(list);
  });

  app.post('/api/trainees', (req: Request, res: Response) => {
    const data = db.get();
    const newTrainee: Trainee = {
      id: `tr_${Date.now()}`,
      rollNo: req.body.rollNo,
      registrationNo: req.body.registrationNo || `NCVT${Date.now().toString().slice(-8)}`,
      name: req.body.name,
      fatherName: req.body.fatherName || '',
      email: req.body.email || `${req.body.name.toLowerCase().replace(/\s+/g, '.')}@student.iti.cg.in`,
      mobile: req.body.mobile,
      tradeId: req.body.tradeId,
      sessionId: req.body.sessionId || data.settings.currentSessionId,
      dob: req.body.dob || '2005-01-01',
      gender: req.body.gender || 'Male',
      category: req.body.category || 'OBC',
      status: req.body.status || 'active',
      admissionDate: req.body.admissionDate || new Date().toISOString().split('T')[0],
      password: req.body.password || 'trainee123',
    };
    data.trainees.push(newTrainee);
    db.save();
    db.addAuditLog({
      userId: req.body.officerId || 'usr_admin',
      userName: req.body.officerName || 'Training Officer',
      userRole: 'officer',
      action: 'ADD_TRAINEE',
      details: `Added new trainee: ${newTrainee.name} (Roll: ${newTrainee.rollNo}).`,
    });
    res.json({ success: true, trainee: newTrainee });
  });

  app.put('/api/trainees/:id', (req: Request, res: Response) => {
    const data = db.get();
    const idx = data.trainees.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Trainee not found' });
    data.trainees[idx] = { ...data.trainees[idx], ...req.body };
    db.save();
    res.json({ success: true, trainee: data.trainees[idx] });
  });

  app.delete('/api/trainees/:id', (req: Request, res: Response) => {
    const data = db.get();
    const trainee = data.trainees.find((t) => t.id === req.params.id);
    data.trainees = data.trainees.filter((t) => t.id !== req.params.id);
    // Also remove associated attendance or mark inactive
    db.save();
    db.addAuditLog({
      userId: req.query.officerId?.toString() || 'usr_admin',
      userName: req.query.officerName?.toString() || 'Training Officer',
      userRole: 'officer',
      action: 'DELETE_TRAINEE',
      details: `Deleted trainee record: ${trainee?.name || req.params.id} (${trainee?.rollNo}).`,
    });
    res.json({ success: true });
  });

  // Attendance Records
  app.get('/api/attendance', (req: Request, res: Response) => {
    const { date, tradeId, traineeId, sessionId, month } = req.query;
    const data = db.get();
    let records = data.attendance;

    if (date) records = records.filter((r) => r.date === date);
    if (tradeId) records = records.filter((r) => r.tradeId === tradeId);
    if (traineeId) records = records.filter((r) => r.traineeId === traineeId);
    if (sessionId) records = records.filter((r) => r.sessionId === sessionId);
    if (month) records = records.filter((r) => r.date.startsWith(month.toString()));

    res.json(records);
  });

  // Trainee mark attendance with GPS Geofencing verification
  app.post('/api/attendance/mark-trainee', (req: Request, res: Response) => {
    const { traineeId, userLat, userLng, accuracy, forceSimulation } = req.body;
    const data = db.get();
    const trainee = data.trainees.find((t) => t.id === traineeId);
    if (!trainee) return res.status(404).json({ error: 'Trainee not found' });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const hours = now.getHours();
    const minutes = now.getMinutes();

    const win = data.settings.attendanceWindow;
    const isWithinTimeWindow =
      (hours > win.startHour || (hours === win.startHour && minutes >= win.startMinute)) &&
      (hours < win.endHour || (hours === win.endHour && minutes <= win.endMinute));

    // Check if already marked today
    const existing = data.attendance.find((a) => a.traineeId === traineeId && a.date === todayStr);
    if (existing) {
      return res.status(400).json({
        error: `Attendance already recorded for today as: ${existing.status} at ${existing.timestamp}.`,
        record: existing,
      });
    }

    // Geofencing verification
    const campus = data.settings.campusLocation;
    let distance = calculateDistanceMeters(userLat, userLng, campus.lat, campus.lng);
    let isWithinCampus = distance <= campus.radiusMeters;

    // Optional test simulator for demo if tester is outside campus
    if (forceSimulation) {
      distance = 42;
      isWithinCampus = true;
    }

    if (!isWithinCampus) {
      return res.status(400).json({
        error: `Geofence verification failed. You are currently ${distance}m away from ITI Raigarh Campus (Allowed radius: ${campus.radiusMeters}m). You must be present physically at the campus to record attendance.`,
        distance,
        allowedRadius: campus.radiusMeters,
      });
    }

    // Check window cutoff unless admin bypass or simulator
    if (!isWithinTimeWindow && !forceSimulation) {
      return res.status(400).json({
        error: `Attendance window is closed. Official attendance time is between ${win.startHour}:00 AM and ${win.endHour}:00 AM. Attendance recorded outside this window requires Training Officer approval.`,
      });
    }

    const timestampStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const newRecord: AttendanceRecord = {
      id: `att_${Date.now()}`,
      traineeId: trainee.id,
      traineeName: trainee.name,
      rollNo: trainee.rollNo,
      tradeId: trainee.tradeId,
      sessionId: trainee.sessionId,
      date: todayStr,
      status: 'Present',
      timestamp: timestampStr,
      markedBy: 'trainee_gps',
      geotag: {
        lat: userLat,
        lng: userLng,
        accuracyMeters: accuracy || 10,
        distanceFromCampusMeters: distance,
        isWithinCampus: true,
        verified: true,
      },
      remarks: 'Verified via Trainee GPS Geotag at ITI Campus',
    };

    data.attendance.push(newRecord);
    db.save();

    db.addAuditLog({
      userId: trainee.id,
      userName: trainee.name,
      userRole: 'trainee',
      action: 'GPS_ATTENDANCE_MARKED',
      details: `Marked Present via GPS. Distance: ${distance}m, Accuracy: ${accuracy || 10}m.`,
    });

    res.json({ success: true, record: newRecord, message: 'Attendance recorded successfully!' });
  });

  // Training Officer: Batch attendance save or override
  app.post('/api/attendance/batch-officer', (req: Request, res: Response) => {
    const { date, officerId, officerName, records } = req.body;
    // records: Array<{ traineeId: string, status: AttendanceStatus, remarks?: string }>
    const data = db.get();
    const officer = data.officers.find((o) => o.id === officerId);

    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Invalid attendance records payload' });
    }

    const now = new Date();
    const timestampStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    records.forEach((item) => {
      const trainee = data.trainees.find((t) => t.id === item.traineeId);
      if (!trainee) return;

      const existingIdx = data.attendance.findIndex((a) => a.traineeId === item.traineeId && a.date === date);
      if (existingIdx >= 0) {
        // override with officer correction
        data.attendance[existingIdx] = {
          ...data.attendance[existingIdx],
          status: item.status,
          remarks: item.remarks || data.attendance[existingIdx].remarks || 'Updated by Training Officer',
          authorizedCorrection: true,
          correctedBy: officerName || officer?.name || 'Training Officer',
        };
      } else {
        // new record entered by officer
        data.attendance.push({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          traineeId: trainee.id,
          traineeName: trainee.name,
          rollNo: trainee.rollNo,
          tradeId: trainee.tradeId,
          sessionId: trainee.sessionId,
          date,
          status: item.status,
          timestamp: timestampStr,
          markedBy: 'officer_manual',
          remarks: item.remarks || 'Recorded by Training Officer',
          authorizedCorrection: false,
          correctedBy: officerName,
        });
      }
    });

    db.save();
    db.addAuditLog({
      userId: officerId || 'usr_officer',
      userName: officerName || 'Training Officer',
      userRole: 'officer',
      action: 'OFFICER_ATTENDANCE_UPDATE',
      details: `Updated/marked attendance for ${records.length} trainees on date ${date}.`,
    });

    res.json({ success: true, count: records.length });
  });

  // Auto-mark Absent for trainees who haven't marked attendance past cutoff time
  app.post('/api/attendance/auto-absent', (req: Request, res: Response) => {
    const { date, tradeId } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const data = db.get();

    let targetTrainees = data.trainees.filter((t) => t.status === 'active');
    if (tradeId) targetTrainees = targetTrainees.filter((t) => t.tradeId === tradeId);

    let newlyMarkedAbsent = 0;
    targetTrainees.forEach((tr) => {
      const exists = data.attendance.find((a) => a.traineeId === tr.id && a.date === targetDate);
      if (!exists) {
        data.attendance.push({
          id: `att_auto_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          traineeId: tr.id,
          traineeName: tr.name,
          rollNo: tr.rollNo,
          tradeId: tr.tradeId,
          sessionId: tr.sessionId,
          date: targetDate,
          status: 'Absent',
          timestamp: '10:01 AM (Cutoff Passed)',
          markedBy: 'system_auto_absent',
          remarks: 'Automatic absent recorded past cutoff time (10:00 AM) - Subject to authorized correction by Training Officer.',
        });
        newlyMarkedAbsent++;
      }
    });

    db.save();
    res.json({ success: true, markedCount: newlyMarkedAbsent, date: targetDate });
  });

  // Leave Management
  app.get('/api/leaves', (req: Request, res: Response) => {
    const { traineeId, tradeId, status } = req.query;
    const data = db.get();
    let list = data.leaves;

    if (traineeId) list = list.filter((l) => l.traineeId === traineeId);
    if (tradeId) list = list.filter((l) => l.tradeId === tradeId);
    if (status) list = list.filter((l) => l.status === status);

    res.json(list);
  });

  app.post('/api/leaves/apply', (req: Request, res: Response) => {
    const { traineeId, leaveType, fromDate, toDate, days, reason } = req.body;
    const data = db.get();
    const trainee = data.trainees.find((t) => t.id === traineeId);
    if (!trainee) return res.status(404).json({ error: 'Trainee not found' });

    const newLeave: LeaveRequest = {
      id: `lv_${Date.now()}`,
      traineeId: trainee.id,
      traineeName: trainee.name,
      rollNo: trainee.rollNo,
      tradeId: trainee.tradeId,
      leaveType,
      fromDate,
      toDate,
      days: Number(days) || 1,
      reason,
      status: 'pending',
      appliedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };

    data.leaves.unshift(newLeave);
    db.save();
    db.addAuditLog({
      userId: trainee.id,
      userName: trainee.name,
      userRole: 'trainee',
      action: 'LEAVE_APPLICATION',
      details: `Applied for ${leaveType} from ${fromDate} to ${toDate} (${days} days).`,
    });

    res.json({ success: true, leave: newLeave });
  });

  app.put('/api/leaves/:id/review', (req: Request, res: Response) => {
    const { status, officerName, reviewerRemarks } = req.body;
    const data = db.get();
    const idx = data.leaves.findIndex((l) => l.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Leave request not found' });

    const leave = data.leaves[idx];
    leave.status = status; // 'approved' | 'rejected'
    leave.reviewedBy = officerName;
    leave.reviewerRemarks = reviewerRemarks;
    leave.reviewedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // If approved, update or insert attendance as 'CL' or 'Medical Leave' or 'Half-Day Leave'
    if (status === 'approved') {
      const attStatus = leave.leaveType === 'Casual Leave (CL)' ? 'CL' : leave.leaveType === 'Medical Leave (ML)' ? 'Medical Leave' : 'Half-Day Leave';
      
      const trainee = data.trainees.find((t) => t.id === leave.traineeId);
      const start = new Date(leave.fromDate);
      const end = new Date(leave.toDate);

      let curr = new Date(start);
      let loopCount = 0;
      while (curr <= end && loopCount < 31) {
        loopCount++;
        if (curr.getDay() !== 0) { // Skip Sundays
          const dateStr = curr.toISOString().split('T')[0];
          const attIdx = data.attendance.findIndex((a) => a.traineeId === leave.traineeId && a.date === dateStr);
          if (attIdx >= 0) {
            data.attendance[attIdx].status = attStatus;
            data.attendance[attIdx].remarks = `Approved leave (${leave.leaveType}): ${reviewerRemarks || 'Sanctioned by Training Officer'}`;
            data.attendance[attIdx].authorizedCorrection = true;
            data.attendance[attIdx].correctedBy = officerName || 'Training Officer';
          } else if (trainee) {
            data.attendance.push({
              id: `att_lv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              traineeId: trainee.id,
              traineeName: trainee.name,
              rollNo: trainee.rollNo,
              tradeId: trainee.tradeId,
              sessionId: trainee.sessionId,
              date: dateStr,
              status: attStatus,
              timestamp: '08:00 AM',
              markedBy: 'officer_manual',
              remarks: `Approved leave (${leave.leaveType}): ${reviewerRemarks || leave.reason}`,
              authorizedCorrection: true,
              correctedBy: officerName || 'Training Officer',
            });
          }
        }
        curr.setDate(curr.getDate() + 1);
      }
    }

    db.save();
    db.addAuditLog({
      userId: 'officer',
      userName: officerName || 'Training Officer',
      userRole: 'officer',
      action: `LEAVE_${status.toUpperCase()}`,
      details: `${status.toUpperCase()} leave request for ${leave.traineeName} (${leave.leaveType}).`,
    });

    res.json({ success: true, leave });
  });

  // Warning Notices for Trainees <80% Attendance
  app.get('/api/warnings', (req: Request, res: Response) => {
    const { traineeId, tradeId } = req.query;
    const data = db.get();
    let list = data.warnings;

    if (traineeId) list = list.filter((w) => w.traineeId === traineeId);
    if (tradeId) list = list.filter((w) => w.tradeId === tradeId);

    res.json(list);
  });

  app.post('/api/warnings', (req: Request, res: Response) => {
    const { traineeId, officerId, officerName, subject, message, attendancePercent } = req.body;
    const data = db.get();
    const trainee = data.trainees.find((t) => t.id === traineeId);
    if (!trainee) return res.status(404).json({ error: 'Trainee not found' });
    const trade = data.trades.find((t) => t.id === trainee.tradeId);

    const refNumber = `ITI-RAI/${trade?.code || 'TRD'}/WARN/${new Date().getFullYear()}/${Math.floor(10 + Math.random() * 90)}`;
    const newWarning: WarningNotice = {
      id: `warn_${Date.now()}`,
      refNumber,
      traineeId: trainee.id,
      traineeName: trainee.name,
      rollNo: trainee.rollNo,
      tradeId: trainee.tradeId,
      tradeName: trade?.name || 'Trade',
      officerId,
      officerName,
      attendancePercent: Number(attendancePercent),
      subject: subject || 'Notice: Deficit Attendance Below Minimum 80% Requirement',
      message,
      issuedDate: new Date().toISOString().split('T')[0],
      status: 'issued',
    };

    data.warnings.unshift(newWarning);
    db.save();
    db.addAuditLog({
      userId: officerId,
      userName: officerName,
      userRole: 'officer',
      action: 'ISSUE_ATTENDANCE_WARNING',
      details: `Issued formal warning ${refNumber} to ${trainee.name} (Attendance: ${attendancePercent}%).`,
    });

    res.json({ success: true, warning: newWarning });
  });

  app.put('/api/warnings/:id/acknowledge', (req: Request, res: Response) => {
    const data = db.get();
    const warning = data.warnings.find((w) => w.id === req.params.id);
    if (!warning) return res.status(404).json({ error: 'Warning notice not found' });
    warning.status = 'acknowledged';
    warning.acknowledgedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    db.save();
    res.json({ success: true, warning });
  });

  // Tools & Equipment Inventory
  app.get('/api/inventory', (req: Request, res: Response) => {
    const { tradeId, category } = req.query;
    const data = db.get();
    let list = data.inventory;

    if (tradeId) list = list.filter((i) => i.tradeId === tradeId);
    if (category) list = list.filter((i) => i.category === category);

    res.json(list);
  });

  app.post('/api/inventory', (req: Request, res: Response) => {
    const data = db.get();
    const total = Number(req.body.totalStock) || 0;
    const issued = Number(req.body.issuedCount) || 0;
    const damaged = Number(req.body.damagedCount) || 0;
    const available = Math.max(0, total - issued - damaged);

    const newItem: InventoryItem = {
      id: `inv_${Date.now()}`,
      tradeId: req.body.tradeId,
      toolCode: req.body.toolCode,
      name: req.body.name,
      specification: req.body.specification || '',
      category: req.body.category || 'Hand Tools',
      totalStock: total,
      issuedCount: issued,
      damagedCount: damaged,
      availableStock: available,
      binLocation: req.body.binLocation || 'General Storage',
      lastInspected: req.body.lastInspected || new Date().toISOString().split('T')[0],
    };

    data.inventory.push(newItem);
    db.save();
    db.addAuditLog({
      userId: req.body.officerId || 'usr_officer',
      userName: req.body.officerName || 'Training Officer',
      userRole: 'officer',
      action: 'ADD_INVENTORY_ITEM',
      details: `Added inventory item: ${newItem.name} (${newItem.toolCode}) - Stock: ${total}.`,
    });
    res.json({ success: true, item: newItem });
  });

  app.put('/api/inventory/:id', (req: Request, res: Response) => {
    const data = db.get();
    const idx = data.inventory.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    const total = req.body.totalStock !== undefined ? Number(req.body.totalStock) : data.inventory[idx].totalStock;
    const issued = req.body.issuedCount !== undefined ? Number(req.body.issuedCount) : data.inventory[idx].issuedCount;
    const damaged = req.body.damagedCount !== undefined ? Number(req.body.damagedCount) : data.inventory[idx].damagedCount;
    const available = Math.max(0, total - issued - damaged);

    data.inventory[idx] = {
      ...data.inventory[idx],
      ...req.body,
      totalStock: total,
      issuedCount: issued,
      damagedCount: damaged,
      availableStock: available,
      lastInspected: req.body.lastInspected || new Date().toISOString().split('T')[0],
    };

    db.save();
    res.json({ success: true, item: data.inventory[idx] });
  });

  app.delete('/api/inventory/:id', (req: Request, res: Response) => {
    const data = db.get();
    const item = data.inventory.find((i) => i.id === req.params.id);
    data.inventory = data.inventory.filter((i) => i.id !== req.params.id);
    db.save();
    db.addAuditLog({
      userId: 'usr_officer',
      userName: 'Training Officer',
      userRole: 'officer',
      action: 'DELETE_INVENTORY_ITEM',
      details: `Deleted inventory item: ${item?.name || req.params.id}.`,
    });
    res.json({ success: true });
  });

  // Indent Registers
  app.get('/api/indent', (req: Request, res: Response) => {
    const { tradeId, traineeId, status } = req.query;
    const data = db.get();
    let list = data.indents;

    if (tradeId) list = list.filter((i) => i.tradeId === tradeId);
    if (traineeId) list = list.filter((i) => i.traineeId === traineeId);
    if (status) list = list.filter((i) => i.status === status);

    res.json(list);
  });

  app.post('/api/indent/issue', (req: Request, res: Response) => {
    const { tradeId, officerId, officerName, traineeId, itemId, quantity, expectedReturnDate, remarks } = req.body;
    const data = db.get();
    const trainee = data.trainees.find((t) => t.id === traineeId);
    const item = data.inventory.find((i) => i.id === itemId);

    if (!trainee || !item) return res.status(400).json({ error: 'Trainee or Item not found' });
    const qty = Number(quantity) || 1;

    if (item.availableStock < qty) {
      return res.status(400).json({ error: `Insufficient stock! Only ${item.availableStock} available.` });
    }

    // Update item stock
    item.issuedCount += qty;
    item.availableStock -= qty;

    const newIndent: IndentRecord = {
      id: `ind_${Date.now()}`,
      indentNo: `IND/${new Date().getFullYear()}/${item.toolCode.slice(0, 4)}/${Math.floor(100 + Math.random() * 900)}`,
      tradeId,
      officerId,
      officerName,
      traineeId: trainee.id,
      traineeName: trainee.name,
      rollNo: trainee.rollNo,
      itemId: item.id,
      itemName: item.name,
      quantity: qty,
      issueDate: new Date().toISOString().split('T')[0],
      expectedReturnDate: expectedReturnDate || new Date().toISOString().split('T')[0],
      status: 'issued',
      remarks,
    };

    data.indents.unshift(newIndent);
    db.save();

    db.addAuditLog({
      userId: officerId,
      userName: officerName,
      userRole: 'officer',
      action: 'INDENT_ISSUE',
      details: `Issued ${qty}x ${item.name} to ${trainee.name} (${trainee.rollNo}) under Indent ${newIndent.indentNo}.`,
    });

    res.json({ success: true, indent: newIndent, updatedItem: item });
  });

  app.put('/api/indent/:id/return', (req: Request, res: Response) => {
    const { returnCondition, remarks, officerName } = req.body;
    const data = db.get();
    const indent = data.indents.find((i) => i.id === req.params.id);
    if (!indent) return res.status(404).json({ error: 'Indent record not found' });

    const item = data.inventory.find((i) => i.id === indent.itemId);

    indent.status = returnCondition === 'Damaged' ? 'damaged' : 'returned';
    indent.actualReturnDate = new Date().toISOString().split('T')[0];
    indent.returnCondition = returnCondition || 'Good';
    if (remarks) indent.remarks = (indent.remarks ? indent.remarks + ' | ' : '') + remarks;

    if (item) {
      item.issuedCount = Math.max(0, item.issuedCount - indent.quantity);
      if (returnCondition === 'Damaged') {
        item.damagedCount += indent.quantity;
      } else {
        item.availableStock += indent.quantity;
      }
    }

    db.save();
    db.addAuditLog({
      userId: 'usr_officer',
      userName: officerName || 'Training Officer',
      userRole: 'officer',
      action: 'INDENT_RETURN',
      details: `Returned Indent ${indent.indentNo} for ${indent.itemName} (Condition: ${returnCondition || 'Good'}).`,
    });

    res.json({ success: true, indent, updatedItem: item });
  });

  // Real-time Notifications for Trainees (Leave updates & Low Attendance Warnings)
  app.get('/api/notifications', (req: Request, res: Response) => {
    const { traineeId } = req.query;
    const data = db.get();

    if (!traineeId) {
      return res.json([]);
    }

    const trainee = data.trainees.find((t) => t.id === traineeId);
    if (!trainee) return res.json([]);

    const notifications: AppNotification[] = [];

    // 1. Trainee Warning Notices
    const traineeWarnings = data.warnings.filter((w) => w.traineeId === traineeId);
    traineeWarnings.forEach((w) => {
      notifications.push({
        id: `notif_warn_${w.id}`,
        type: 'attendance_warning',
        title: `Official Warning Notice: ${w.refNumber}`,
        message: `${w.subject}: ${w.message} (Deficit Recorded: ${w.attendancePercent}%)`,
        timestamp: w.issuedDate,
        read: w.status === 'acknowledged',
        priority: 'urgent',
        linkTab: 'warnings',
        referenceId: w.id,
        metadata: { refNumber: w.refNumber, status: w.status, percent: w.attendancePercent },
      });
    });

    // 2. Trainee Real-time Attendance Deficit Alert (<80%)
    const records = data.attendance.filter((a) => a.traineeId === traineeId);
    const totalMarked = records.length;
    if (totalMarked > 0) {
      const presentCount = records.filter((a) => a.status === 'Present').length;
      const clCount = records.filter((a) => a.status === 'CL').length;
      const mlCount = records.filter((a) => a.status === 'Medical Leave').length;
      const halfDayCount = records.filter((a) => a.status === 'Half-Day Leave').length;
      const effectiveAttended = presentCount + clCount + mlCount + halfDayCount * 0.5;
      const percent = Math.round((effectiveAttended / totalMarked) * 1000) / 10;

      if (percent < data.settings.minimumAttendancePercent) {
        notifications.unshift({
          id: `notif_deficit_${traineeId}`,
          type: 'attendance_deficit',
          title: `CRITICAL ATTENDANCE ALERT (${percent}%)`,
          message: `Your attendance of ${percent}% has dropped below the statutory NCVT requirement of ${data.settings.minimumAttendancePercent}%. You risk debarment from examination unless rectified immediately.`,
          timestamp: 'Live Attendance Alert',
          read: false,
          priority: 'urgent',
          linkTab: 'history',
          metadata: { currentPercent: percent, threshold: data.settings.minimumAttendancePercent },
        });
      }
    }

    // 3. Trainee Leave Request Updates
    const traineeLeaves = data.leaves.filter((l) => l.traineeId === traineeId);
    traineeLeaves.forEach((lv) => {
      if (lv.status === 'approved') {
        notifications.push({
          id: `notif_lv_app_${lv.id}`,
          type: 'leave_approved',
          title: `Leave Approved: ${lv.leaveType}`,
          message: `Your leave request for ${lv.fromDate} to ${lv.toDate} (${lv.days} day(s)) was APPROVED by ${lv.reviewedBy || 'Training Officer'}.${lv.reviewerRemarks ? ` Remarks: "${lv.reviewerRemarks}"` : ''}`,
          timestamp: lv.reviewedAt || lv.appliedAt,
          read: false,
          priority: 'normal',
          linkTab: 'leaves',
          referenceId: lv.id,
        });
      } else if (lv.status === 'rejected') {
        notifications.push({
          id: `notif_lv_rej_${lv.id}`,
          type: 'leave_rejected',
          title: `Leave Rejected: ${lv.leaveType}`,
          message: `Your leave application for ${lv.fromDate} to ${lv.toDate} was REJECTED.${lv.reviewerRemarks ? ` Remarks: "${lv.reviewerRemarks}"` : ''}`,
          timestamp: lv.reviewedAt || lv.appliedAt,
          read: false,
          priority: 'high',
          linkTab: 'leaves',
          referenceId: lv.id,
        });
      } else if (lv.status === 'pending') {
        notifications.push({
          id: `notif_lv_pnd_${lv.id}`,
          type: 'leave_pending',
          title: `Leave Application Pending Review`,
          message: `Your application for ${lv.leaveType} (${lv.fromDate} to ${lv.toDate}) is awaiting review by your Training Officer.`,
          timestamp: lv.appliedAt,
          read: false,
          priority: 'normal',
          linkTab: 'leaves',
          referenceId: lv.id,
        });
      }
    });

    // 4. Today's Attendance Check (Cutoff / Absence notice)
    const todayStr = new Date().toISOString().split('T')[0];
    const todayRecord = records.find((a) => a.date === todayStr);
    if (todayRecord && todayRecord.status === 'Absent') {
      notifications.unshift({
        id: `notif_absent_${todayStr}`,
        type: 'absent_recorded',
        title: `Absence Recorded for Today (${todayStr})`,
        message: todayRecord.remarks || 'Automatic absent recorded past cutoff time (10:00 AM). Authorized corrections must be processed through your Training Officer.',
        timestamp: todayRecord.timestamp,
        read: false,
        priority: 'high',
        linkTab: 'mark_attendance',
      });
    }

    res.json(notifications);
  });

  // Audit Logs
  app.get('/api/audit-logs', (_req: Request, res: Response) => {
    res.json(db.get().auditLogs);
  });

  // Reset demo data
  app.post('/api/reset-data', (_req: Request, res: Response) => {
    const reset = db.resetToDefault();
    res.json({ success: true, message: 'Database reset to original Govt ITI Raigarh default data.' });
  });

  // -------------------------------------------------------------
  // Vite Middleware Mode for Development
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Govt ITI Raigarh Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
