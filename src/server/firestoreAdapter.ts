import {
  firestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  writeBatch,
} from './firestore.ts';
import type { DatabaseSchema } from './db.ts';

/**
 * Strips undefined properties recursively so Firestore setDoc does not throw
 */
export function cleanForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanForFirestore(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Recognizes ONLY legacy seeded demo/dummy records so real bulk-imported or manual trainees are NEVER stripped.
 */
export const isDemoIdOrName = (item: any): boolean => {
  if (!item) return false;
  const id = String(item.id || item.traineeId || '').toLowerCase();
  const name = String(item.name || item.traineeName || item.userName || '').toLowerCase();
  const roll = String(item.rollNo || '').toLowerCase();
  const indentNo = String(item.indentNo || '').toLowerCase();
  const refNo = String(item.refNumber || '').toLowerCase();

  // Exact legacy demo trainee IDs (never block tr_<timestamp> or bulk real imports)
  if (['tr_1', 'tr_2', 'tr_3', 'tr_4', 'tr_5', 'tr_6', 'tr_7', 'tr_1794498305273'].includes(id)) return true;
  if (id.startsWith('test_')) return true;

  // Exact legacy demo trainee names
  if (
    name.includes('rohan sahu') ||
    name.includes('pooja kashyap') ||
    name.includes('amit bhagat') ||
    name.includes('kavita patel') ||
    name.includes('vikas tande') ||
    name.includes('dinesh yadav') ||
    name.includes('neha agrawal') ||
    name.includes('aakash verma')
  ) {
    return true;
  }

  // Exact legacy demo rolls
  if (
    roll.includes('ele-014') ||
    roll.includes('ele-015') ||
    roll.includes('ele-016') ||
    roll.includes('ele-017') ||
    roll.includes('ele-018') ||
    roll.includes('elec-101') ||
    roll.includes('fit-001') ||
    roll.includes('cop-005')
  ) {
    return true;
  }

  // Exact legacy demo indents / warnings / plans / sample assessments
  if (['ind_01', 'ind_02', 'warn_1', 'lp_01', 'lp_02', 'dp_01', 'wp_1', 'asm_1'].includes(id)) return true;
  if (indentNo.includes('ind/2026/elec/089') || indentNo.includes('ind/2026/elec/085')) return true;
  if (refNo.includes('iti-rai/elec/warn/2025/03')) return true;

  return false;
};

let writeQuotaExceededUntil = 0;

export function isFirestoreWriteQuotaExceeded(): boolean {
  return Date.now() < writeQuotaExceededUntil;
}

export interface PendingFirestoreOp {
  type: 'set' | 'delete';
  coll: string;
  id: string;
  data?: any;
}

const pendingRetryOps = new Map<string, PendingFirestoreOp>();

function enqueueRetryOp(op: PendingFirestoreOp) {
  pendingRetryOps.set(`${op.coll}/${op.id}`, op);
}

export function getPendingRetryCount(): number {
  return pendingRetryOps.size;
}

function handleWriteError(context: string, err: any): boolean {
  const msg = String(err?.message || err || '');
  if (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota')
  ) {
    writeQuotaExceededUntil = Date.now() + 10 * 60 * 1000;
    console.warn(`[Firestore Quota Reached - ${context}]: ${msg}`);
    return true;
  }
  console.warn(`[Firestore ${context} error]:`, msg);
  return false;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Firestore ${label} timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type LoadFirestoreResult =
  | { status: 'ok'; data: DatabaseSchema }
  | { status: 'empty' }
  | { status: 'error'; error: string };

/**
 * Loads the complete database schema from Firestore cleanly without misidentifying timeouts as empty DB.
 */
export async function loadDatabaseFromFirestore(): Promise<LoadFirestoreResult> {
  try {
    const settingsRef = doc(firestore, 'settings', 'main');
    const settingsSnap = await withTimeout(getDoc(settingsRef), 15000, 'getDoc(settings/main)');

    if (!settingsSnap.exists()) {
      console.log('[Firestore] No settings/main found. Treating Firestore as unseeded.');
      return { status: 'empty' };
    }

    const settings = settingsSnap.data() as any;

    const fetchCollection = async (collName: string) => {
      const snap = await withTimeout(getDocs(collection(firestore, collName)), 15000, `getDocs(${collName})`);
      return snap.docs.map((d) => ({ ...d.data(), id: d.id } as any));
    };

    const [
      sessions,
      monthlyWorkingDays,
      holidays,
      trades,
      officers,
      rawTrainees,
      rawAttendance,
      rawLeaves,
      rawWarnings,
      inventory,
      rawIndents,
      rawAuditLogs,
      rawAssessments,
      rawPlans,
      documents,
      userPreferences,
      authSessions,
    ] = await Promise.all([
      fetchCollection('sessions'),
      fetchCollection('workingDays'),
      fetchCollection('holidays'),
      fetchCollection('trades'),
      fetchCollection('officers'),
      fetchCollection('trainees'),
      fetchCollection('attendance'),
      fetchCollection('leaves'),
      fetchCollection('warnings'),
      fetchCollection('inventory'),
      fetchCollection('indents'),
      fetchCollection('auditLogs'),
      fetchCollection('assessments'),
      fetchCollection('plans'),
      fetchCollection('documents'),
      fetchCollection('userPreferences'),
      fetchCollection('authSessions'),
    ]);

    const trainees = (rawTrainees || []).filter((t: any) => !isDemoIdOrName(t));
    const validTraineeIds = new Set(trainees.map((t: any) => t.id));

    const attendance = (rawAttendance || []).filter(
      (a: any) => validTraineeIds.has(a.traineeId) && !isDemoIdOrName(a)
    );
    const assessments = (rawAssessments || []).filter(
      (asm: any) => validTraineeIds.has(asm.traineeId) && !isDemoIdOrName(asm)
    );
    const leaves = (rawLeaves || []).filter(
      (l: any) => validTraineeIds.has(l.traineeId) && !isDemoIdOrName(l)
    );
    const warnings = (rawWarnings || []).filter(
      (w: any) => validTraineeIds.has(w.traineeId) && !isDemoIdOrName(w)
    );
    const indents = (rawIndents || []).filter(
      (i: any) => validTraineeIds.has(i.traineeId) && !isDemoIdOrName(i)
    );
    const plans = (rawPlans || []).filter((p: any) => !isDemoIdOrName(p));
    const auditLogs = (rawAuditLogs || []).filter(
      (log: any) =>
        !isDemoIdOrName(log) &&
        !String(log.details || '').toLowerCase().includes('rohan sahu') &&
        !String(log.details || '').toLowerCase().includes('amit bhagat')
    );

    const lessonPlans = plans.filter((p: any) => p.__type === 'lesson') || [];
    const demonstrationPlans = plans.filter((p: any) => p.__type === 'demo') || [];
    const weeklyPlans = plans.filter((p: any) => p.__type === 'weekly') || [];

    console.log(
      `[Firestore Loaded] Trainees: ${trainees.length}, Attendance: ${attendance.length}, Assessments: ${assessments.length}, Holidays: ${holidays.length}, Documents: ${documents.length}, UserPrefs: ${userPreferences.length}`
    );

    return {
      status: 'ok',
      data: {
        settings,
        sessions,
        monthlyWorkingDays,
        holidays: holidays || [],
        trades,
        officers,
        trainees,
        attendance,
        leaves,
        warnings,
        inventory,
        indents,
        auditLogs,
        lessonPlans,
        demonstrationPlans,
        weeklyPlans,
        assessments,
        documents: documents || [],
        userPreferences: userPreferences || [],
        authSessions: authSessions || [],
      },
    };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    console.error('[Firestore] Load error:', msg);
    return { status: 'error', error: msg };
  }
}

export async function purgeAllDemoDocumentsFromFirestore(): Promise<number> {
  if (isFirestoreWriteQuotaExceeded()) return 0;
  let totalDeleted = 0;
  const collectionsToClean = [
    'trainees',
    'attendance',
    'assessments',
    'leaves',
    'warnings',
    'indents',
    'plans',
    'auditLogs',
  ];

  for (const collName of collectionsToClean) {
    if (isFirestoreWriteQuotaExceeded()) break;
    try {
      const snap = await withTimeout(getDocs(collection(firestore, collName)), 8000, `getDocs(${collName})`);
      if (!snap.empty) {
        const refsToDelete = snap.docs.filter((docSnap) =>
          isDemoIdOrName({ ...docSnap.data(), id: docSnap.id })
        );
        const chunkSize = 400;
        for (let i = 0; i < refsToDelete.length; i += chunkSize) {
          if (isFirestoreWriteQuotaExceeded()) break;
          const chunk = refsToDelete.slice(i, i + chunkSize);
          const batch = writeBatch(firestore);
          for (const docSnap of chunk) {
            batch.delete(docSnap.ref);
          }
          await withTimeout(batch.commit(), 8000, `purge(${collName})`);
          totalDeleted += chunk.length;
        }
      }
    } catch (err) {
      handleWriteError(`Purge ${collName}`, err);
      break;
    }
  }

  return totalDeleted;
}

/**
 * Diff-based synchronization for reconciliation/manual cloud sync.
 */
export async function syncDiffToFirestore(
  prevData: DatabaseSchema | null,
  nextData: DatabaseSchema
): Promise<boolean> {
  if (isFirestoreWriteQuotaExceeded()) return false;
  if (!prevData) {
    await seedDatabaseToFirestore(nextData);
    return !isFirestoreWriteQuotaExceeded();
  }

  try {
    const ops: PendingFirestoreOp[] = [];

    if (JSON.stringify(prevData.settings) !== JSON.stringify(nextData.settings)) {
      ops.push({ type: 'set', coll: 'settings', id: 'main', data: nextData.settings });
    }

    const diffCollection = (
      collName: string,
      prevList: any[],
      nextList: any[],
      typeTag?: string,
      idKey: string = 'id'
    ) => {
      const prevMap = new Map<string, any>();
      for (const item of (prevList || []).filter((x) => !isDemoIdOrName(x))) {
        const rawId = String(item[idKey] || item.id || item.code || '');
        if (rawId) prevMap.set(rawId.replace(/[^a-zA-Z0-9_\-]/g, '_'), item);
      }

      const nextMap = new Map<string, any>();
      for (const item of (nextList || []).filter((x) => !isDemoIdOrName(x))) {
        const rawId = String(item[idKey] || item.id || item.code || Math.random().toString(36).substring(2));
        const id = rawId.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const payload = typeTag ? { ...item, __type: typeTag } : item;
        nextMap.set(id, payload);
        const prevItem = prevMap.get(id);
        const prevPayload = prevItem && typeTag ? { ...prevItem, __type: typeTag } : prevItem;
        if (!prevPayload || JSON.stringify(prevPayload) !== JSON.stringify(payload)) {
          ops.push({ type: 'set', coll: collName, id, data: payload });
        }
      }

      for (const id of prevMap.keys()) {
        if (!nextMap.has(id)) {
          ops.push({ type: 'delete', coll: collName, id });
        }
      }
    };

    diffCollection('sessions', prevData.sessions, nextData.sessions);
    diffCollection('workingDays', prevData.monthlyWorkingDays, nextData.monthlyWorkingDays);
    diffCollection('holidays', prevData.holidays || [], nextData.holidays || []);
    diffCollection('trades', prevData.trades, nextData.trades);
    diffCollection('officers', prevData.officers, nextData.officers);
    diffCollection('trainees', prevData.trainees, nextData.trainees);
    diffCollection('attendance', prevData.attendance, nextData.attendance);
    diffCollection('leaves', prevData.leaves, nextData.leaves);
    diffCollection('warnings', prevData.warnings, nextData.warnings);
    diffCollection('inventory', prevData.inventory, nextData.inventory);
    diffCollection('indents', prevData.indents, nextData.indents);
    diffCollection('assessments', prevData.assessments, nextData.assessments);
    diffCollection('documents', prevData.documents || [], nextData.documents || []);
    diffCollection('userPreferences', prevData.userPreferences || [], nextData.userPreferences || [], undefined, 'userId');
    diffCollection('authSessions', prevData.authSessions || [], nextData.authSessions || [], undefined, 'token');
    diffCollection('auditLogs', (prevData.auditLogs || []).slice(0, 50), (nextData.auditLogs || []).slice(0, 50));
    diffCollection('plans', prevData.lessonPlans, nextData.lessonPlans, 'lesson');
    diffCollection('plans', prevData.demonstrationPlans, nextData.demonstrationPlans, 'demo');
    diffCollection('plans', prevData.weeklyPlans, nextData.weeklyPlans, 'weekly');

    if (ops.length === 0) return true;
    return await persistBatchToFirestore(ops);
  } catch (err) {
    handleWriteError('syncDiff', err);
    return false;
  }
}

export async function seedDatabaseToFirestore(dbData: DatabaseSchema): Promise<void> {
  if (isFirestoreWriteQuotaExceeded()) return;
  try {
    if (dbData.settings) {
      await withTimeout(
        setDoc(doc(firestore, 'settings', 'main'), cleanForFirestore(dbData.settings), { merge: true }),
        10000,
        'setDoc(settings/main)'
      );
    }

    const batchWriteList = async (collName: string, items: any[], typeTag?: string, idKey: string = 'id') => {
      if (isFirestoreWriteQuotaExceeded()) return;
      const cleanItems = (items || []).filter((item) => !isDemoIdOrName(item));
      if (!Array.isArray(cleanItems) || cleanItems.length === 0) return;
      const chunkSize = 400;
      for (let i = 0; i < cleanItems.length; i += chunkSize) {
        if (isFirestoreWriteQuotaExceeded()) return;
        const chunk = cleanItems.slice(i, i + chunkSize);
        const batch = writeBatch(firestore);
        for (const item of chunk) {
          const rawId = String(item[idKey] || item.id || item.code || Math.random().toString(36).substring(2));
          const id = rawId.replace(/[^a-zA-Z0-9_\-]/g, '_');
          const docRef = doc(firestore, collName, id);
          const dataToSave = typeTag ? { ...item, __type: typeTag } : item;
          batch.set(docRef, cleanForFirestore(dataToSave), { merge: true });
        }
        await withTimeout(batch.commit(), 10000, `batch(${collName})`);
      }
    };

    await Promise.all([
      batchWriteList('sessions', dbData.sessions),
      batchWriteList('workingDays', dbData.monthlyWorkingDays),
      batchWriteList('holidays', dbData.holidays || []),
      batchWriteList('trades', dbData.trades),
      batchWriteList('officers', dbData.officers),
      batchWriteList('trainees', dbData.trainees),
      batchWriteList('attendance', dbData.attendance),
      batchWriteList('leaves', dbData.leaves),
      batchWriteList('warnings', dbData.warnings),
      batchWriteList('inventory', dbData.inventory),
      batchWriteList('indents', dbData.indents),
      batchWriteList('assessments', dbData.assessments),
      batchWriteList('documents', dbData.documents || []),
      batchWriteList('userPreferences', dbData.userPreferences || [], undefined, 'userId'),
      batchWriteList('auditLogs', dbData.auditLogs.slice(0, 50)),
      batchWriteList('plans', dbData.lessonPlans, 'lesson'),
      batchWriteList('plans', dbData.demonstrationPlans, 'demo'),
      batchWriteList('plans', dbData.weeklyPlans, 'weekly'),
    ]);

    console.log('[Firestore] Seeded clean institutional state.');
  } catch (err) {
    handleWriteError('seedDatabase', err);
  }
}

/**
 * Immediately persists a single document to Firestore and queues retry on transient failure.
 */
export async function persistItemToFirestore(
  collName: string,
  rawId: string,
  itemData: any,
  typeTag?: string
): Promise<boolean> {
  if (isDemoIdOrName({ ...itemData, id: rawId })) return true;
  const id = String(rawId).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const payload = typeTag ? { ...itemData, __type: typeTag } : itemData;

  if (isFirestoreWriteQuotaExceeded()) {
    enqueueRetryOp({ type: 'set', coll: collName, id, data: payload });
    return false;
  }

  try {
    const docRef = doc(firestore, collName, id);
    await withTimeout(setDoc(docRef, cleanForFirestore(payload), { merge: true }), 10000, `setDoc(${collName}/${id})`);
    pendingRetryOps.delete(`${collName}/${id}`);
    return true;
  } catch (err) {
    enqueueRetryOp({ type: 'set', coll: collName, id, data: payload });
    handleWriteError(`persistItem ${collName}/${id}`, err);
    return false;
  }
}

/**
 * Immediately deletes a single document from Firestore and queues retry on transient failure.
 */
export async function deleteItemFromFirestore(collName: string, rawId: string): Promise<boolean> {
  const id = String(rawId).replace(/[^a-zA-Z0-9_\-]/g, '_');
  if (isFirestoreWriteQuotaExceeded()) {
    enqueueRetryOp({ type: 'delete', coll: collName, id });
    return false;
  }

  try {
    const docRef = doc(firestore, collName, id);
    await withTimeout(deleteDoc(docRef), 10000, `deleteDoc(${collName}/${id})`);
    pendingRetryOps.delete(`${collName}/${id}`);
    return true;
  } catch (err) {
    enqueueRetryOp({ type: 'delete', coll: collName, id });
    handleWriteError(`deleteItem ${collName}/${id}`, err);
    return false;
  }
}

/**
 * Atomically executes a batch of Firestore set/delete operations immediately.
 */
export async function persistBatchToFirestore(ops: PendingFirestoreOp[]): Promise<boolean> {
  if (!ops || ops.length === 0) return true;
  if (isFirestoreWriteQuotaExceeded()) {
    ops.forEach((op) => enqueueRetryOp(op));
    return false;
  }

  const chunkSize = 400;
  try {
    for (let i = 0; i < ops.length; i += chunkSize) {
      if (isFirestoreWriteQuotaExceeded()) {
        ops.slice(i).forEach((op) => enqueueRetryOp(op));
        return false;
      }
      const chunk = ops.slice(i, i + chunkSize);
      const batch = writeBatch(firestore);
      for (const op of chunk) {
        const cleanId = String(op.id).replace(/[^a-zA-Z0-9_\-]/g, '_');
        const docRef = doc(firestore, op.coll, cleanId);
        if (op.type === 'delete') {
          batch.delete(docRef);
        } else {
          batch.set(docRef, cleanForFirestore(op.data), { merge: true });
        }
      }
      await withTimeout(batch.commit(), 10000, `batch(${chunk.length})`);
      for (const op of chunk) {
        const cleanId = String(op.id).replace(/[^a-zA-Z0-9_\-]/g, '_');
        pendingRetryOps.delete(`${op.coll}/${cleanId}`);
      }
    }
    return true;
  } catch (err) {
    ops.forEach((op) => enqueueRetryOp(op));
    handleWriteError('persistBatch', err);
    return false;
  }
}

export async function flushPendingRetryOps(): Promise<number> {
  if (pendingRetryOps.size === 0 || isFirestoreWriteQuotaExceeded()) return 0;
  const ops = Array.from(pendingRetryOps.values());
  const ok = await persistBatchToFirestore(ops);
  return ok ? ops.length : 0;
}
