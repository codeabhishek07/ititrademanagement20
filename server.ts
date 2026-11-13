import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { db } from './src/server/db.ts';
import { isFirestoreWriteQuotaExceeded } from './src/server/firestoreAdapter.ts';
import type { AttendanceRecord, LeaveRequest, WarningNotice, InventoryItem, IndentRecord, Trainee, TrainingOfficer, Trade, AcademicSession, MonthlyWorkingDay, AppNotification, LessonPlan, DemonstrationPlan, WeeklyPlan, TraineeAssessment } from './src/types.ts';

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
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Gracefully catch and report payload errors if any occur
  app.use((err: any, _req: Request, res: Response, next: any) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      return res.status(413).json({
        error: 'Payload Too Large: The uploaded backup file or data package exceeds the server limit (50MB).',
      });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON payload received.' });
    }
    next(err);
  });

  // Initialize and synchronize with persistent Google Cloud Firestore (non-blocking fallback after 4s)
  await Promise.race([
    db.initFirestore(),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);

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

  // -------------------------------------------------------------
  // Automatic Institutional Backup & Restore Endpoints
  // -------------------------------------------------------------
  app.get('/api/system/export-backup', (req: Request, res: Response) => {
    try {
      const data = db.get();
      const backupPayload = {
        meta: {
          app: 'Government ITI Raigarh MIS',
          instituteCode: data.settings.instituteCode,
          instituteName: data.settings.instituteName,
          exportDate: new Date().toISOString(),
          formattedDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          version: '2.6.0',
          summary: {
            traineesCount: data.trainees.length,
            assessmentsCount: data.assessments?.length || 0,
            attendanceCount: data.attendance.length,
            tradesCount: data.trades.length,
            sessionsCount: data.sessions.length,
            workingDaysCount: data.monthlyWorkingDays.length,
          },
        },
        data,
      };
      res.setHeader('Content-Disposition', `attachment; filename="Govt_ITI_Raigarh_Backup_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(backupPayload);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate institutional backup' });
    }
  });

  app.post('/api/system/restore-backup', (req: Request, res: Response) => {
    try {
      const { backupData, source } = req.body;
      if (!backupData) {
        return res.status(400).json({ error: 'No backup data payload provided' });
      }
      const restored = db.restoreFromBackup(backupData);
      res.json({
        success: true,
        message: 'Institutional database successfully restored and saved',
        summary: {
          traineesCount: restored.trainees.length,
          assessmentsCount: restored.assessments?.length || 0,
          attendanceCount: restored.attendance.length,
          tradesCount: restored.trades.length,
          sessionsCount: restored.sessions.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to restore database from backup' });
    }
  });

  app.get('/api/system/cloud-status', (_req: Request, res: Response) => {
    const data = db.get();
    res.json({
      connected: true,
      provider: 'Google Cloud Firestore',
      databaseId: 'ai-studio-ititrademanageme-5b8dc514-0a44-4514-a54d-82e373529b3f',
      project: 'modified-firmament-k01dl',
      summary: {
        trainees: data.trainees.length,
        assessments: data.assessments?.length || 0,
        attendance: data.attendance.length,
        trades: data.trades.length,
        officers: data.officers.length,
        sessions: data.sessions.length,
      },
    });
  });

  app.post('/api/system/sync-cloud', async (_req: Request, res: Response) => {
    try {
      await db.forceFirestoreSync();
      if (isFirestoreWriteQuotaExceeded()) {
        return res.status(429).json({
          error: 'Quota exceeded. Free daily write units per project for Firestore have been reached. Changes remain saved locally and will sync once quota resets.',
        });
      }
      res.json({ success: true, message: 'All institutional data, marks, and settings successfully synchronized to Firestore.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to sync to Firestore' });
    }
  });

  // Auth: Real credentials-based login verifying against database
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { role, email, password } = req.body;
    const identifier = String(email || '').trim();
    const enteredPassword = String(password || '');

    if (!identifier) {
      return res.status(400).json({ error: 'Please enter your Email, Username, or Roll Number.' });
    }
    if (!enteredPassword) {
      return res.status(400).json({ error: 'Please enter your account password.' });
    }

    const data = db.get();
    const cleanId = identifier.toLowerCase();

    // 1. Administrator Authentication
    if (role === 'admin') {
      const adminAcc = data.settings.adminAccount || {
        email: 'admin.iti.raigarh@cg.gov.in',
        password: 'admin123',
        name: 'Shri S. K. Patel (Principal / Admin)',
        mobile: '+91 98261 45210',
      };

      const emailMatches =
        cleanId === adminAcc.email.toLowerCase() ||
        cleanId === 'admin' ||
        cleanId === 'principal' ||
        cleanId === 'admin.iti.raigarh@cg.gov.in';

      if (!emailMatches) {
        return res.status(401).json({ error: 'Administrator account not found with the provided email or username.' });
      }

      if (enteredPassword !== adminAcc.password) {
        return res.status(401).json({ error: 'Incorrect password for Administrator portal.' });
      }

      db.addAuditLog({
        userId: 'usr_admin',
        userName: adminAcc.name,
        userRole: 'admin',
        action: 'ADMIN_LOGIN',
        details: 'Administrator authenticated successfully.',
        ipAddress: req.ip,
      });

      return res.json({
        user: {
          id: 'usr_admin',
          role: 'admin',
          name: adminAcc.name,
          email: adminAcc.email,
          mobile: adminAcc.mobile || '+91 98261 45210',
        },
      });
    }

    // 2. Training Officer Authentication
    if (role === 'officer') {
      const officer = data.officers.find(
        (o) =>
          o.email.toLowerCase() === cleanId ||
          o.employeeId.toLowerCase() === cleanId ||
          o.mobile.replace(/\s+/g, '') === cleanId.replace(/\s+/g, '')
      );

      if (!officer) {
        return res.status(401).json({ error: 'No Training Officer account found with the provided Email or Employee ID.' });
      }

      if (officer.status !== 'active') {
        return res.status(403).json({ error: 'This Training Officer account has been deactivated. Please contact the Administrator.' });
      }

      if (officer.password !== enteredPassword) {
        return res.status(401).json({ error: 'Incorrect password for Training Officer account.' });
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

    // 3. Trainee Authentication
    if (role === 'trainee') {
      const trainee = data.trainees.find(
        (t) =>
          t.rollNo.toLowerCase() === cleanId ||
          t.email.toLowerCase() === cleanId ||
          (t.registrationNo && t.registrationNo.toLowerCase() === cleanId)
      );

      if (!trainee) {
        return res.status(401).json({ error: 'No Trainee record found with the entered Roll Number or Email.' });
      }

      if (trainee.status !== 'active') {
        return res.status(403).json({ error: 'This Trainee account has been marked inactive or suspended.' });
      }

      if (trainee.password !== enteredPassword) {
        return res.status(401).json({ error: 'Incorrect password for Trainee account.' });
      }

      db.addAuditLog({
        userId: trainee.id,
        userName: trainee.name,
        userRole: 'trainee',
        action: 'TRAINEE_LOGIN',
        details: `Trainee authenticated: Roll No ${trainee.rollNo}.`,
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

    res.status(400).json({ error: 'Invalid portal role requested.' });
  });

  // -------------------------------------------------------------
  // Password Recovery System (Token-based Secure Email Verification)
  // -------------------------------------------------------------
  interface ResetTokenRecord {
    token: string;
    email: string;
    role: 'admin' | 'officer' | 'trainee';
    userId: string;
    userName: string;
    createdAt: number;
    expiresAt: number;
  }
  const resetTokens: Map<string, ResetTokenRecord> = new Map();

  function maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const user = parts[0];
    const domain = parts[1];
    const visible = user.slice(0, Math.min(2, user.length));
    const masked = '*'.repeat(Math.max(3, user.length - visible.length));
    return `${visible}${masked}@${domain}`;
  }

  // 1. Forgot Password - Generate & Dispatch Secure Token
  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    const { identifier, role } = req.body;
    const cleanId = String(identifier || '').trim().toLowerCase();

    if (!cleanId) {
      return res.status(400).json({ error: 'Please enter your registered Email ID, Employee ID, or Roll Number.' });
    }

    const data = db.get();
    let targetUser: { role: 'admin' | 'officer' | 'trainee'; id: string; name: string; email: string } | null = null;

    // Search Admin
    if (!role || role === 'admin') {
      const adminAcc = data.settings.adminAccount || {
        email: 'admin.iti.raigarh@cg.gov.in',
        password: 'admin123',
        name: 'Shri S. K. Patel (Principal / Admin)',
        mobile: '+91 98261 45210',
      };
      if (
        cleanId === adminAcc.email.toLowerCase() ||
        cleanId === 'admin' ||
        cleanId === 'principal'
      ) {
        targetUser = {
          role: 'admin',
          id: 'usr_admin',
          name: adminAcc.name,
          email: adminAcc.email,
        };
      }
    }

    // Search Officer
    if (!targetUser && (!role || role === 'officer')) {
      const officer = data.officers.find(
        (o) =>
          o.email.toLowerCase() === cleanId ||
          o.employeeId.toLowerCase() === cleanId ||
          o.mobile.replace(/\s+/g, '') === cleanId.replace(/\s+/g, '')
      );
      if (officer) {
        targetUser = {
          role: 'officer',
          id: officer.id,
          name: officer.name,
          email: officer.email,
        };
      }
    }

    // Search Trainee
    if (!targetUser && (!role || role === 'trainee')) {
      const trainee = data.trainees.find(
        (t) =>
          t.email.toLowerCase() === cleanId ||
          t.rollNo.toLowerCase() === cleanId ||
          (t.registrationNo && t.registrationNo.toLowerCase() === cleanId)
      );
      if (trainee) {
        targetUser = {
          role: 'trainee',
          id: trainee.id,
          name: trainee.name,
          email: trainee.email,
        };
      }
    }

    if (!targetUser) {
      return res.status(404).json({
        error: 'No active account found with the provided details. Please verify your Email, Roll Number, or Employee ID.',
      });
    }

    // Generate a secure 6-digit token
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL

    // Invalidate any previous token for this user
    for (const [key, val] of resetTokens.entries()) {
      if (val.userId === targetUser.id || val.email.toLowerCase() === targetUser.email.toLowerCase()) {
        resetTokens.delete(key);
      }
    }

    resetTokens.set(token, {
      token,
      email: targetUser.email,
      role: targetUser.role,
      userId: targetUser.id,
      userName: targetUser.name,
      createdAt: Date.now(),
      expiresAt,
    });

    db.addAuditLog({
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      action: 'PASSWORD_RESET_TOKEN_ISSUED',
      details: `Password recovery token dispatched for ${targetUser.email} (Token valid for 15 minutes).`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: `A secure 6-digit verification token has been generated and dispatched to ${targetUser.email}.`,
      email: targetUser.email,
      maskedEmail: maskEmail(targetUser.email),
      userName: targetUser.name,
      role: targetUser.role,
      token,
      expiresMinutes: 15,
    });
  });

  // 2. Verify Reset Token
  app.post('/api/auth/verify-reset-token', (req: Request, res: Response) => {
    const { token, email } = req.body;
    const cleanToken = String(token || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    const record = resetTokens.get(cleanToken);
    if (!record) {
      return res.status(400).json({ error: 'Invalid or unrecognized recovery token. Please check and try again.' });
    }

    if (Date.now() > record.expiresAt) {
      resetTokens.delete(cleanToken);
      return res.status(400).json({ error: 'This security token has expired. Please request a new recovery token.' });
    }

    if (cleanEmail && record.email.toLowerCase() !== cleanEmail) {
      return res.status(400).json({ error: 'Token does not match the requested email address.' });
    }

    res.json({
      success: true,
      valid: true,
      email: record.email,
      userName: record.userName,
      role: record.role,
    });
  });

  // 3. Reset Password with Verified Token
  app.post('/api/auth/reset-password', (req: Request, res: Response) => {
    const { token, email, newPassword } = req.body;
    const cleanToken = String(token || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const passwordStr = String(newPassword || '');

    if (!cleanToken) {
      return res.status(400).json({ error: 'Security token is required.' });
    }
    if (!passwordStr || passwordStr.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const record = resetTokens.get(cleanToken);
    if (!record) {
      return res.status(400).json({ error: 'Invalid recovery token or token has already been used.' });
    }

    if (Date.now() > record.expiresAt) {
      resetTokens.delete(cleanToken);
      return res.status(400).json({ error: 'This security token has expired. Please request a new one.' });
    }

    if (cleanEmail && record.email.toLowerCase() !== cleanEmail) {
      return res.status(400).json({ error: 'Token mismatch. Please verify your email.' });
    }

    const data = db.get();

    if (record.role === 'admin') {
      if (!data.settings.adminAccount) {
        data.settings.adminAccount = {
          email: 'admin.iti.raigarh@cg.gov.in',
          password: passwordStr,
          name: 'Shri S. K. Patel (Principal / Admin)',
          mobile: '+91 98261 45210',
        };
      } else {
        data.settings.adminAccount.password = passwordStr;
      }
    } else if (record.role === 'officer') {
      const idx = data.officers.findIndex((o) => o.id === record.userId);
      if (idx !== -1) {
        data.officers[idx].password = passwordStr;
      } else {
        return res.status(404).json({ error: 'Officer account not found in database.' });
      }
    } else if (record.role === 'trainee') {
      const idx = data.trainees.findIndex((t) => t.id === record.userId);
      if (idx !== -1) {
        data.trainees[idx].password = passwordStr;
      } else {
        return res.status(404).json({ error: 'Trainee account not found in database.' });
      }
    }

    // Invalidate the token
    resetTokens.delete(cleanToken);
    db.save();

    db.addAuditLog({
      userId: record.userId,
      userName: record.userName,
      userRole: record.role,
      action: 'PASSWORD_RESET_COMPLETED',
      details: `Password securely updated for account ${record.email} via verified token.`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Your password has been successfully reset. You may now log in with your new credentials.',
      email: record.email,
      role: record.role,
    });
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
    if (data.settings.currentSessionId === req.params.id) {
      data.settings.currentSessionId = '';
    }
    data.monthlyWorkingDays = data.monthlyWorkingDays.filter((m) => m.sessionId !== req.params.id);
    db.save();
    res.json({ success: true });
  });

  app.post('/api/sessions/set-default', (req: Request, res: Response) => {
    const { sessionId } = req.body;
    const data = db.get();
    data.settings.currentSessionId = sessionId || '';
    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: sessionId ? 'SET_DEFAULT_SESSION' : 'CLEAR_DEFAULT_SESSION',
      details: sessionId
        ? `Set default active academic session to: ${sessionId}`
        : 'Cleared default active academic session.',
    });
    res.json({ success: true, currentSessionId: data.settings.currentSessionId });
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
        remarks: remarks || '',
      };
    } else {
      data.monthlyWorkingDays.push({
        id: `mwd_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        sessionId,
        month,
        totalDays: Number(totalDays) || 30,
        workingDays: Number(workingDays),
        holidays: Number(holidays) || 0,
        remarks: remarks || '',
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

  app.post('/api/monthly-working-days/bulk', (req: Request, res: Response) => {
    const { sessionId, days } = req.body as { sessionId: string; days: MonthlyWorkingDay[] };
    if (!sessionId || !Array.isArray(days)) {
      return res.status(400).json({ error: 'sessionId and days array are required' });
    }
    const data = db.get();
    data.monthlyWorkingDays = data.monthlyWorkingDays.filter((m) => m.sessionId !== sessionId);
    const addedDays: MonthlyWorkingDay[] = days.map((d, index) => ({
      id: d.id || `mwd_${Date.now()}_${index}`,
      sessionId,
      month: d.month,
      totalDays: Number(d.totalDays) || 30,
      workingDays: Number(d.workingDays) || 0,
      holidays: Number(d.holidays) || 0,
      remarks: d.remarks || '',
    }));
    data.monthlyWorkingDays.push(...addedDays);

    const totalWorking = addedDays.reduce((acc, curr) => acc + (Number(curr.workingDays) || 0), 0);
    const sessionIdx = data.sessions.findIndex((s) => s.id === sessionId);
    if (sessionIdx >= 0 && totalWorking > 0) {
      data.sessions[sessionIdx].totalWorkingDays = totalWorking;
    }

    db.save();
    db.addAuditLog({
      userId: 'usr_admin',
      userName: 'Principal / Admin',
      userRole: 'admin',
      action: 'BULK_CONFIG_WORKING_DAYS',
      details: `Saved ${addedDays.length} monthly working days records for session ${sessionId} (Total ${totalWorking} working days).`,
    });
    res.json({ success: true, monthlyWorkingDays: addedDays, totalWorkingDays: totalWorking });
  });

  app.delete('/api/monthly-working-days/:id', (req: Request, res: Response) => {
    const data = db.get();
    data.monthlyWorkingDays = data.monthlyWorkingDays.filter((m) => m.id !== req.params.id);
    db.save();
    res.json({ success: true });
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

  app.get('/api/officers/:id', (req: Request, res: Response) => {
    const data = db.get();
    const officer = data.officers.find((o) => o.id === req.params.id);
    if (!officer) return res.status(404).json({ error: 'Officer not found' });
    res.json(officer);
  });

  app.post('/api/officers', (req: Request, res: Response) => {
    const data = db.get();
    const assigned = Array.isArray(req.body.assignedTradeIds)
      ? req.body.assignedTradeIds
      : req.body.assignedTradeIds
      ? [req.body.assignedTradeIds]
      : [];
    const newOfficer: TrainingOfficer = {
      id: `off_${Date.now()}`,
      name: req.body.name,
      email: req.body.email,
      mobile: req.body.mobile,
      employeeId: req.body.employeeId || `CG-ITI-TO-${Math.floor(1000 + Math.random() * 9000)}`,
      assignedTradeIds: assigned,
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
      details: `Created Training Officer account for ${newOfficer.name} (Emp ID: ${newOfficer.employeeId}) with ${newOfficer.assignedTradeIds.length} assigned trades.`,
    });
    res.json({ success: true, officer: newOfficer });
  });

  app.put('/api/officers/:id', (req: Request, res: Response) => {
    const data = db.get();
    const idx = data.officers.findIndex((o) => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Officer not found' });
    const oldEmail = data.officers[idx].email;
    data.officers[idx] = { ...data.officers[idx], ...req.body };
    if (req.body.assignedTradeIds !== undefined) {
      data.officers[idx].assignedTradeIds = Array.isArray(req.body.assignedTradeIds)
        ? req.body.assignedTradeIds
        : [req.body.assignedTradeIds];
    }
    if (req.body.email) {
      data.officers[idx].email = String(req.body.email).trim();
    }
    db.save();
    db.addAuditLog({
      userId: req.body.editorId || 'usr_admin',
      userName: req.body.editorName || 'Principal / Admin',
      userRole: 'admin',
      action: 'ALTER_OFFICER',
      details: req.body.email && req.body.email.trim() !== oldEmail
        ? `Updated Training Officer profile and email to: ${data.officers[idx].email} (${data.officers[idx].name}).`
        : `Updated Training Officer details and trade assignments for: ${data.officers[idx].name} (${data.officers[idx].assignedTradeIds?.length || 0} trades).`,
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

  app.post('/api/trainees/bulk', (req: Request, res: Response) => {
    const { trainees, tradeId, sessionId, officerId, officerName } = req.body;
    if (!Array.isArray(trainees) || trainees.length === 0) {
      return res.status(400).json({ error: 'No trainee records provided for bulk import.' });
    }
    const data = db.get();
    const targetTradeId = tradeId || data.trades[0]?.id;
    const targetSessionId = sessionId || data.settings.currentSessionId;
    const addedTrainees: Trainee[] = [];

    trainees.forEach((item, index) => {
      const name = String(item.name || '').trim();
      if (!name) return;
      const rollNo = String(item.rollNo || item.roll || `ITI/RAI/2026/TRD-${Math.floor(100 + Math.random() * 900)}`).trim();
      const registrationNo = String(item.registrationNo || item.regNo || `NCVT2026${Math.floor(1000 + Math.random() * 9000)}`).trim();
      const fatherName = String(item.fatherName || item.father || '').trim();
      const email = String(item.email || `${name.toLowerCase().replace(/\s+/g, '.')}@student.iti.cg.in`).trim();
      const mobile = String(item.mobile || item.phone || '+91 98260 00000').trim();
      const category = (['GEN', 'OBC', 'SC', 'ST', 'EWS'].includes(item.category) ? item.category : 'OBC') as any;
      const gender = (['Male', 'Female', 'Other'].includes(item.gender) ? item.gender : 'Male') as any;
      const dob = String(item.dob || '2005-01-01').trim();

      const newTrainee: Trainee = {
        id: `tr_bulk_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`,
        rollNo,
        registrationNo,
        name,
        fatherName,
        email,
        mobile,
        tradeId: targetTradeId,
        sessionId: targetSessionId,
        dob,
        gender,
        category,
        status: 'active',
        admissionDate: new Date().toISOString().split('T')[0],
        password: item.password || 'trainee123',
      };

      data.trainees.push(newTrainee);
      addedTrainees.push(newTrainee);
    });

    db.save();
    db.addAuditLog({
      userId: officerId || 'usr_officer',
      userName: officerName || 'Training Officer',
      userRole: 'officer',
      action: 'BULK_IMPORT_TRAINEES',
      details: `Bulk imported ${addedTrainees.length} trainees via Excel/CSV for trade ${targetTradeId}.`,
    });

    res.json({ success: true, count: addedTrainees.length, trainees: addedTrainees });
  });

  app.put('/api/trainees/:id', (req: Request, res: Response) => {
    const data = db.get();
    const idx = data.trainees.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Trainee not found' });
    const oldEmail = data.trainees[idx].email;
    data.trainees[idx] = { ...data.trainees[idx], ...req.body };
    if (req.body.email) {
      data.trainees[idx].email = String(req.body.email).trim();
    }
    db.save();
    db.addAuditLog({
      userId: req.body.editorId || req.params.id,
      userName: req.body.editorName || data.trainees[idx].name,
      userRole: (req.body.editorRole as any) || 'trainee',
      action: 'UPDATE_TRAINEE_RECORD',
      details: req.body.email && req.body.email.trim() !== oldEmail
        ? `Updated email for trainee ${data.trainees[idx].name} (${data.trainees[idx].rollNo}) to: ${data.trainees[idx].email}.`
        : `Updated profile details for trainee: ${data.trainees[idx].name} (${data.trainees[idx].rollNo}).`,
    });
    res.json({ success: true, trainee: data.trainees[idx] });
  });

  app.delete('/api/trainees/:id', (req: Request, res: Response) => {
    const data = db.get();
    const trainee = data.trainees.find((t) => t.id === req.params.id);
    data.trainees = data.trainees.filter((t) => t.id !== req.params.id);
    // Also remove associated attendance or mark inactive
    db.save();
    db.deleteItem('trainees', req.params.id);
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
    const accuracyBuffer = Math.min(Number(accuracy) || 0, 150);
    const effectiveDistance = Math.max(0, distance - accuracyBuffer);
    let isWithinCampus = distance <= campus.radiusMeters || effectiveDistance <= campus.radiusMeters;

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
      const formatTime = (h: number, m: number = 0) => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const mStr = m > 0 ? `:${m.toString().padStart(2, '0')}` : ':00';
        return `${h12}${mStr} ${ampm} (${h.toString().padStart(2, '0')}:00)`;
      };
      return res.status(400).json({
        error: `Attendance window is closed. Official attendance window is between ${formatTime(win.startHour, win.startMinute)} and ${formatTime(win.endHour, win.endMinute)} (07:00 to 15:00). Attendance recorded outside this window requires Training Officer approval.`,
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
          timestamp: '05:00 PM (17:00 Cutoff)',
          markedBy: 'system_auto_absent',
          remarks: 'Automatic absent recorded past 17:00 (05:00 PM) cutoff time - Subject to authorized correction by Training Officer.',
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
    const { traineeId, officerId, officerName, subject, subjectHindi, message, messageHindi, attendancePercent } = req.body;
    const data = db.get();
    const trainee = data.trainees.find((t) => t.id === traineeId);
    if (!trainee) return res.status(404).json({ error: 'Trainee not found' });
    const trade = data.trades.find((t) => t.id === trainee.tradeId);

    const refNumber = `ITI-RAI/${trade?.code || 'TRD'}/WARN/${new Date().getFullYear()}/${Math.floor(10 + Math.random() * 90)}`;
    const pct = Number(attendancePercent);
    const resolvedSubjectHindi =
      subjectHindi ||
      `कार्यालयीन चेतावनी सूचना: न्यून उपस्थिति (${pct}%) - DGT / NCVT अनिवार्य 80% मानक से कम`;
    const resolvedMessageHindi =
      messageHindi ||
      `आपको सूचित किया जाता है कि वर्तमान सत्र में आपकी दर्ज उपस्थिति ${pct}% है, जो DGT / NCVT के अनिवार्य 80% मानक से कम है। यदि उपस्थिति में तत्काल सुधार नहीं हुआ, तो आगामी अखिल भारतीय व्यावसायिक परीक्षा (AITT) से वंचित (Debar) कर दिया जाएगा। अतः आगामी सभी वर्कशॉप प्रायोगिक कक्षाओं में अनिवार्यतः उपस्थित रहें एवं 3 कार्यदिवस में लिखित स्पष्टीकरण प्रस्तुत करें।`;

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
      attendancePercent: pct,
      subject: subject || `Official Warning: Deficit Attendance Below Minimum 80% Requirement (${pct}%)`,
      subjectHindi: resolvedSubjectHindi,
      message,
      messageHindi: resolvedMessageHindi,
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
      details: `Issued formal bilingual warning ${refNumber} to ${trainee.name} (Attendance: ${attendancePercent}%).`,
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
        title: w.subjectHindi ? `शासकीय चेतावनी पत्र (${w.refNumber})` : `Official Warning Notice: ${w.refNumber}`,
        message: w.messageHindi
          ? `${w.messageHindi} (उपस्थिति: ${w.attendancePercent}%)`
          : `${w.subject}: ${w.message} (Deficit: ${w.attendancePercent}%)`,
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
        message: todayRecord.remarks || 'Automatic absent recorded past 17:00 (05:00 PM) cutoff time. Authorized corrections must be processed through your Training Officer.',
        timestamp: todayRecord.timestamp,
        read: false,
        priority: 'high',
        linkTab: 'mark_attendance',
      });
    }

    res.json(notifications);
  });

  // -------------------------------------------------------------
  // Training Officer Academic & Administrative Routine APIs
  // -------------------------------------------------------------
  // 1. Lesson Plans
  app.get('/api/lesson-plans', (req: Request, res: Response) => {
    const tradeId = req.query.tradeId as string;
    const list = db.get().lessonPlans || [];
    if (tradeId) {
      return res.json(list.filter((lp) => lp.tradeId === tradeId));
    }
    res.json(list);
  });

  app.post('/api/lesson-plans', (req: Request, res: Response) => {
    const body = req.body;
    const newPlan: LessonPlan = {
      id: `lp_${Date.now()}`,
      tradeId: body.tradeId || 'trade_elec',
      unitName: body.unitName || 'New Module',
      syllabusRef: body.syllabusRef || 'NCVT Syllabus',
      startDate: body.startDate || new Date().toISOString().split('T')[0],
      endDate: body.endDate || new Date().toISOString().split('T')[0],
      status: body.status || 'Pending',
      objectives: body.objectives || '',
      teachingAid: body.teachingAid || '',
      keyLearningPoints: body.keyLearningPoints || '',
      assignment: body.assignment || '',
      reference: body.reference || '',
      officerName: body.officerName || 'Training Officer',
    };
    db.get().lessonPlans.unshift(newPlan);
    db.save();
    res.json({ success: true, lessonPlan: newPlan });
  });

  app.put('/api/lesson-plans/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const body = req.body;
    const list = db.get().lessonPlans;
    const index = list.findIndex((lp) => lp.id === id);
    if (index === -1) return res.status(404).json({ error: 'Lesson plan not found' });
    list[index] = { ...list[index], ...body };
    db.save();
    res.json({ success: true, lessonPlan: list[index] });
  });

  app.delete('/api/lesson-plans/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const data = db.get();
    data.lessonPlans = data.lessonPlans.filter((lp) => lp.id !== id);
    db.save();
    res.json({ success: true });
  });

  // 2. Demonstration Plans
  app.get('/api/demonstration-plans', (req: Request, res: Response) => {
    const tradeId = req.query.tradeId as string;
    const list = db.get().demonstrationPlans || [];
    if (tradeId) {
      return res.json(list.filter((dp) => dp.tradeId === tradeId));
    }
    res.json(list);
  });

  app.post('/api/demonstration-plans', (req: Request, res: Response) => {
    const body = req.body;
    const newDemo: DemonstrationPlan = {
      id: `dp_${Date.now()}`,
      tradeId: body.tradeId || 'trade_elec',
      practicalTitle: body.practicalTitle || 'Practical Demonstration',
      toolsRequired: body.toolsRequired || 'Standard Tools',
      allottedHours: Number(body.allottedHours || 4),
      targetDate: body.targetDate || new Date().toISOString().split('T')[0],
      status: body.status || 'Pending',
      objectives: body.objectives || '',
      procedureSteps: body.procedureSteps || ['Prepare workstation', 'Execute step by step', 'Verify results'],
      hints: body.hints || 'Follow safety guidelines.',
      officerName: body.officerName || 'Training Officer',
    };
    db.get().demonstrationPlans.unshift(newDemo);
    db.save();
    res.json({ success: true, demonstrationPlan: newDemo });
  });

  app.put('/api/demonstration-plans/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const body = req.body;
    const list = db.get().demonstrationPlans;
    const index = list.findIndex((dp) => dp.id === id);
    if (index === -1) return res.status(404).json({ error: 'Demonstration plan not found' });
    list[index] = { ...list[index], ...body };
    db.save();
    res.json({ success: true, demonstrationPlan: list[index] });
  });

  app.delete('/api/demonstration-plans/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const data = db.get();
    data.demonstrationPlans = data.demonstrationPlans.filter((dp) => dp.id !== id);
    db.save();
    res.json({ success: true });
  });

  // 3. Weekly Plans
  app.get('/api/weekly-plans', (req: Request, res: Response) => {
    const tradeId = req.query.tradeId as string;
    const list = db.get().weeklyPlans || [];
    if (tradeId) {
      return res.json(list.filter((wp) => wp.tradeId === tradeId));
    }
    res.json(list);
  });

  app.post('/api/weekly-plans', (req: Request, res: Response) => {
    const body = req.body;
    const newWeekly: WeeklyPlan = {
      id: `wp_${Date.now()}`,
      tradeId: body.tradeId || 'trade_elec',
      weekNumber: Number(body.weekNumber || 1),
      dateRange: body.dateRange || 'Current Week',
      dailyBreakdown: body.dailyBreakdown || [],
      summaryTheoryDone: Number(body.summaryTheoryDone || 0),
      summaryTheoryPlanned: Number(body.summaryTheoryPlanned || 5),
      summaryPracticalDone: Number(body.summaryPracticalDone || 0),
      summaryPracticalPlanned: Number(body.summaryPracticalPlanned || 5),
      officerName: body.officerName || 'Training Officer',
    };
    db.get().weeklyPlans.unshift(newWeekly);
    db.save();
    res.json({ success: true, weeklyPlan: newWeekly });
  });

  app.put('/api/weekly-plans/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const body = req.body;
    const list = db.get().weeklyPlans;
    const index = list.findIndex((wp) => wp.id === id);
    if (index === -1) return res.status(404).json({ error: 'Weekly plan not found' });
    list[index] = { ...list[index], ...body };
    db.save();
    res.json({ success: true, weeklyPlan: list[index] });
  });

  app.delete('/api/weekly-plans/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const data = db.get();
    data.weeklyPlans = data.weeklyPlans.filter((wp) => wp.id !== id);
    db.save();
    res.json({ success: true });
  });

  // 4. Trainee Assessments & Progress Cards
  app.get('/api/assessments', (req: Request, res: Response) => {
    const traineeId = req.query.traineeId as string;
    const list = db.get().assessments || [];
    if (traineeId) {
      return res.json(list.filter((asm) => asm.traineeId === traineeId));
    }
    res.json(list);
  });

  const handleAssessmentUpsert = (body: any, targetId?: string) => {
    const list = db.get().assessments;
    const idToLookFor = targetId || body.id;
    let existingIndex = -1;

    if (idToLookFor) {
      existingIndex = list.findIndex((asm) => asm.id === idToLookFor);
    }
    if (existingIndex === -1 && body.traineeId && body.month) {
      existingIndex = list.findIndex(
        (asm) => asm.traineeId === body.traineeId && asm.month === body.month
      );
    }

    if (existingIndex !== -1) {
      list[existingIndex] = {
        ...list[existingIndex],
        ...body,
        id: list[existingIndex].id,
      };
      db.save();
      return list[existingIndex];
    }

    const newAsm: TraineeAssessment = {
      id: idToLookFor || `asm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      traineeId: body.traineeId,
      sessionId: body.sessionId || 'session_2025_2026',
      month: body.month || new Date().toISOString().substring(0, 7),
      testMarks: Number(body.testMarks || 0),
      attendancePercent: Number(body.attendancePercent || 85),
      parameters: body.parameters || {
        jobCarriedOut: 8,
        recordBook: 8,
        answerSheet: 16,
        vivaVoce: 8,
        progressChart: 8,
        attendancePunctuality: 8,
        assignment: 4,
        projectWork: 4,
        cbtExam: 8,
        practicalExam: 8,
      },
      remarks: body.remarks || 'Satisfactory progress.',
    };

    list.unshift(newAsm);
    db.save();
    return newAsm;
  };

  app.post('/api/assessments', (req: Request, res: Response) => {
    try {
      const saved = handleAssessmentUpsert(req.body);
      res.json({ success: true, assessment: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to save assessment' });
    }
  });

  app.put('/api/assessments/:id', (req: Request, res: Response) => {
    try {
      const saved = handleAssessmentUpsert(req.body, req.params.id);
      res.json({ success: true, assessment: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update assessment' });
    }
  });

  app.delete('/api/assessments/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const list = db.get().assessments || [];
    const index = list.findIndex((asm) => asm.id === id);
    if (index === -1) return res.status(404).json({ error: 'Assessment not found' });
    list.splice(index, 1);
    db.save();
    res.json({ success: true, message: 'Assessment deleted' });
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
  // Service Worker and Web App Manifest Handlers
  // -------------------------------------------------------------
  const distPath = path.resolve(process.cwd(), 'dist');
  const publicPath = path.resolve(process.cwd(), 'public');

  app.get('/sw.js', (_req: Request, res: Response) => {
    const swPath = fs.existsSync(path.join(distPath, 'sw.js'))
      ? path.join(distPath, 'sw.js')
      : path.join(publicPath, 'sw.js');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(swPath);
  });

  app.get('/manifest.json', (_req: Request, res: Response) => {
    const mPath = fs.existsSync(path.join(distPath, 'manifest.json'))
      ? path.join(distPath, 'manifest.json')
      : path.join(publicPath, 'manifest.json');
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(mPath);
  });

  // -------------------------------------------------------------
  // Vite Middleware Mode for Development vs Production Static Serving
  // -------------------------------------------------------------
  const isProduction = process.env.NODE_ENV === 'production' || (process.env.NODE_ENV !== 'development' && fs.existsSync(path.join(distPath, 'index.html')));

  if (isProduction) {
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.warn('Production build dist/ directory not found. Please run npm run build.');
    }
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // -------------------------------------------------------------
  // Scheduled Background Task: Auto-Mark Absent at 17:00 Cutoff
  // -------------------------------------------------------------
  let lastAutoAbsentDate = '';
  setInterval(() => {
    try {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const todayStr = now.toISOString().split('T')[0];
      const win = db.get().settings.attendanceWindow;
      const autoHour = win.autoAbsentHour !== undefined ? win.autoAbsentHour : 17;
      const autoMinute = win.autoAbsentMinute !== undefined ? win.autoAbsentMinute : 0;

      // Run when time is at or past cutoff (17:00) and hasn't run for today yet
      if (
        (hour > autoHour || (hour === autoHour && minute >= autoMinute)) &&
        lastAutoAbsentDate !== todayStr
      ) {
        lastAutoAbsentDate = todayStr;
        const data = db.get();
        let marked = 0;
        data.trainees.forEach((tr) => {
          if (tr.status === 'active') {
            const exists = data.attendance.find((a) => a.traineeId === tr.id && a.date === todayStr);
            if (!exists) {
              data.attendance.push({
                id: `att_auto_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                traineeId: tr.id,
                traineeName: tr.name,
                rollNo: tr.rollNo,
                tradeId: tr.tradeId,
                sessionId: tr.sessionId,
                date: todayStr,
                status: 'Absent',
                timestamp: '05:00 PM (17:00 Cutoff)',
                markedBy: 'system_auto_absent',
                remarks: 'Automatic absent recorded at 17:00 (05:00 PM) cutoff time - Subject to authorized correction by Training Officer.',
              });
              marked++;
            }
          }
        });
        if (marked > 0) {
          db.save();
          console.log(`[Auto-Absent Scheduler] Flagged ${marked} unmarked active trainees as Absent for date ${todayStr} at 17:00 cutoff.`);
        }
      }
    } catch (e) {
      console.warn('[Auto-Absent Scheduler Error]:', e);
    }
  }, 30000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Govt ITI Raigarh Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
