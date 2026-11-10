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
 * Loads the complete database schema from Firestore if it exists.
 * Returns null if Firestore has not yet been initialized with data.
 */
export async function loadDatabaseFromFirestore(): Promise<DatabaseSchema | null> {
  try {
    const settingsRef = doc(firestore, 'settings', 'main');
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      console.log('Firestore is empty or not yet seeded. Initial seed will be created.');
      return null;
    }

    console.log('Found persistent database in Firestore! Loading collections...');
    const settings = settingsSnap.data() as any;

    // Helper to fetch entire collection
    const fetchCollection = async (collName: string) => {
      try {
        const snap = await getDocs(collection(firestore, collName));
        return snap.docs.map((d) => d.data() as any);
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
      trainees,
      attendance,
      leaves,
      warnings,
      inventory,
      indents,
      auditLogs,
      assessments,
      plans,
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

    const lessonPlans = plans.filter((p: any) => p.__type === 'lesson') || [];
    const demonstrationPlans = plans.filter((p: any) => p.__type === 'demo') || [];
    const weeklyPlans = plans.filter((p: any) => p.__type === 'weekly') || [];

    console.log(
      `Loaded from Firestore: ${trainees.length} Trainees, ${assessments.length} Assessments, ${trades.length} Trades, ${sessions.length} Sessions, ${attendance.length} Attendance records.`
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
 * Seeds initial database or completely persists state to Firestore.
 */
export async function seedDatabaseToFirestore(dbData: DatabaseSchema): Promise<void> {
  try {
    console.log('Syncing complete database to Firestore...');

    // 1. Settings
    if (dbData.settings) {
      await setDoc(doc(firestore, 'settings', 'main'), cleanForFirestore(dbData.settings), { merge: true });
    }

    // Helper to batch write a list
    const batchWriteList = async (collName: string, items: any[], typeTag?: string) => {
      if (!Array.isArray(items) || items.length === 0) return;
      const chunkSize = 400; // Firestore 500-limit safety buffer
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = writeBatch(firestore);
        for (const item of chunk) {
          const rawId = String(item.id || item.code || Math.random().toString(36).substring(2));
          // Sanitize doc ID
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

    console.log('Database successfully synced to Firestore!');
  } catch (err) {
    console.error('Error syncing database to Firestore:', err);
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
  try {
    const id = String(rawId).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const docRef = doc(firestore, collName, id);
    const dataToSave = typeTag ? { ...itemData, __type: typeTag } : itemData;
    await setDoc(docRef, cleanForFirestore(dataToSave), { merge: true });
  } catch (err) {
    console.warn(`Firestore background save failed for ${collName}/${rawId}:`, err);
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
    console.warn(`Firestore background delete failed for ${collName}/${rawId}:`, err);
  }
}
