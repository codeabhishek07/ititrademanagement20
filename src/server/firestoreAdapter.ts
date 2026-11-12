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
function cleanForFirestore<T>(obj: T): T {
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
 * Recognizes any sample, dummy, or test records so they never enter production state
 */
export const isDemoIdOrName = (item: any): boolean => {
  if (!item) return false;
  const id = String(item.id || item.traineeId || '').toLowerCase();
  const name = String(item.name || item.traineeName || item.userName || '').toLowerCase();
  const roll = String(item.rollNo || '').toLowerCase();
  const indentNo = String(item.indentNo || '').toLowerCase();
  const refNo = String(item.refNumber || '').toLowerCase();

  // Demo trainee IDs
  if (['tr_1', 'tr_2', 'tr_3', 'tr_4', 'tr_5', 'tr_6', 'tr_7'].includes(id)) return true;
  if (id.startsWith('tr_bulk_') || id.startsWith('test_')) return true;

  // Demo trainee names
  if (
    name.includes('rohan sahu') ||
    name.includes('pooja kashyap') ||
    name.includes('amit bhagat') ||
    name.includes('kavita patel') ||
    name.includes('vikas tande') ||
    name.includes('dinesh yadav') ||
    name.includes('neha agrawal') ||
    name.startsWith('trainee ')
  ) {
    return true;
  }

  // Demo rolls
  if (
    roll.includes('ele-014') ||
    roll.includes('ele-015') ||
    roll.includes('ele-016') ||
    roll.includes('ele-017') ||
    roll.includes('ele-018') ||
    roll.includes('fit-001') ||
    roll.includes('cop-005') ||
    roll.includes('test-')
  ) {
    return true;
  }

  // Demo indents / warnings / plans / sample assessments
  if (['ind_01', 'ind_02', 'warn_1', 'lp_01', 'lp_02', 'dp_01', 'wp_1', 'asm_1'].includes(id)) return true;
  if (indentNo.includes('ind/2026/elec/089') || indentNo.includes('ind/2026/elec/085')) return true;
  if (refNo.includes('iti-rai/elec/warn/2025/03')) return true;

  return false;
};

/**
 * Loads the complete database schema from Firestore.
 * Strictly filters out any lingering demo accounts or dummy records.
 */
export async function loadDatabaseFromFirestore(): Promise<DatabaseSchema | null> {
  try {
    const settingsRef = doc(firestore, 'settings', 'main');
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      console.log('Firestore is empty or not yet seeded. Initial clean seed will be created.');
      return null;
    }

    console.log('Found persistent database in Firestore! Loading collections...');
    const settings = settingsSnap.data() as any;

    // Helper to fetch entire collection
    const fetchCollection = async (collName: string) => {
      try {
        const snap = await getDocs(collection(firestore, collName));
        return snap.docs.map((d) => ({ ...d.data(), id: d.id } as any));
      } catch (err) {
        console.warn(`Failed to fetch ${collName} from Firestore:`, err);
        return [];
      }
    };

    const [
      sessions,
      monthlyWorkingDays,
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
    ] = await Promise.all([
      fetchCollection('sessions'),
      fetchCollection('workingDays'),
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
    ]);

    // Strictly filter out any demo records
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
      `Clean state loaded from Firestore: ${trainees.length} Trainees, ${assessments.length} Assessments, ${trades.length} Trades, ${sessions.length} Sessions, ${attendance.length} Attendance records.`
    );

    return {
      settings,
      sessions,
      monthlyWorkingDays,
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
    };
  } catch (err) {
    console.error('Error connecting or loading from Firestore:', err);
    return null;
  }
}

/**
 * Permanently removes all demo records, test trainees, and sample documents from Firestore.
 */
export async function purgeAllDemoDocumentsFromFirestore(): Promise<number> {
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
    try {
      const snap = await getDocs(collection(firestore, collName));
      if (!snap.empty) {
        const batch = writeBatch(firestore);
        let batchCount = 0;
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (isDemoIdOrName({ ...data, id: docSnap.id })) {
            batch.delete(docSnap.ref);
            batchCount++;
            totalDeleted++;
          }
        }
        if (batchCount > 0) {
          await batch.commit();
          console.log(`[Firestore Purge] Permanently removed ${batchCount} demo items from '${collName}'.`);
        }
      }
    } catch (err) {
      console.warn(`[Firestore Purge] Could not purge '${collName}':`, err);
    }
  }

  return totalDeleted;
}

/**
 * Persists clean production state to Firestore.
 */
export async function seedDatabaseToFirestore(dbData: DatabaseSchema): Promise<void> {
  try {
    // 1. Settings
    if (dbData.settings) {
      await setDoc(doc(firestore, 'settings', 'main'), cleanForFirestore(dbData.settings), { merge: true });
    }

    // Helper to batch write a list
    const batchWriteList = async (collName: string, items: any[], typeTag?: string) => {
      // Filter out any demo data before writing to Firestore
      const cleanItems = (items || []).filter((item) => !isDemoIdOrName(item));
      if (!Array.isArray(cleanItems) || cleanItems.length === 0) return;
      const chunkSize = 400; // Firestore 500-limit safety buffer
      for (let i = 0; i < cleanItems.length; i += chunkSize) {
        const chunk = cleanItems.slice(i, i + chunkSize);
        const batch = writeBatch(firestore);
        for (const item of chunk) {
          const rawId = String(item.id || item.code || Math.random().toString(36).substring(2));
          const id = rawId.replace(/[^a-zA-Z0-9_\-]/g, '_');
          const docRef = doc(firestore, collName, id);
          const dataToSave = typeTag ? { ...item, __type: typeTag } : item;
          batch.set(docRef, cleanForFirestore(dataToSave), { merge: true });
        }
        await batch.commit();
      }
    };

    await Promise.all([
      batchWriteList('sessions', dbData.sessions),
      batchWriteList('workingDays', dbData.monthlyWorkingDays),
      batchWriteList('trades', dbData.trades),
      batchWriteList('officers', dbData.officers),
      batchWriteList('trainees', dbData.trainees),
      batchWriteList('attendance', dbData.attendance),
      batchWriteList('leaves', dbData.leaves),
      batchWriteList('warnings', dbData.warnings),
      batchWriteList('inventory', dbData.inventory),
      batchWriteList('indents', dbData.indents),
      batchWriteList('assessments', dbData.assessments),
      batchWriteList('auditLogs', dbData.auditLogs.slice(0, 150)),
      batchWriteList('plans', dbData.lessonPlans, 'lesson'),
      batchWriteList('plans', dbData.demonstrationPlans, 'demo'),
      batchWriteList('plans', dbData.weeklyPlans, 'weekly'),
    ]);

    console.log('Database state verified and synced to Firestore.');
  } catch (err) {
    console.warn('Sync to Firestore notice:', err);
  }
}

/**
 * Persists an individual item update to Firestore in the background.
 */
export async function persistItemToFirestore(
  collName: string,
  rawId: string,
  itemData: any,
  typeTag?: string
): Promise<void> {
  // Never persist demo data
  if (isDemoIdOrName({ ...itemData, id: rawId })) return;

  try {
    const id = String(rawId).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const docRef = doc(firestore, collName, id);
    const dataToSave = typeTag ? { ...itemData, __type: typeTag } : itemData;
    await setDoc(docRef, cleanForFirestore(dataToSave), { merge: true });
  } catch (err) {
    console.warn(`Firestore save failed for ${collName}/${rawId}:`, err);
  }
}

/**
 * Removes an item from Firestore.
 */
export async function deleteItemFromFirestore(collName: string, rawId: string): Promise<void> {
  try {
    const id = String(rawId).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const docRef = doc(firestore, collName, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn(`Firestore delete failed for ${collName}/${rawId}:`, err);
  }
}
