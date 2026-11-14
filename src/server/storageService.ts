import {
  firestore,
  storage,
  firebaseProjectConfig,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from './firestore.ts';
import type { DocumentCategory, StoredDocumentRecord, UserRole } from '../types.ts';

const CHUNK_CHAR_SIZE = 450_000; // ~450KB base64 per Firestore document (< 1MB limit)
let cachedBucketStatus: { checkedAt: number; available: boolean; bucket: string } | null = null;

export async function checkFirebaseStorageStatus(): Promise<{
  available: boolean;
  bucket: string;
  mode: 'firebase_storage' | 'firestore_storage';
}> {
  const bucket = firebaseProjectConfig?.storageBucket || '';
  if (!bucket) {
    return { available: false, bucket: '', mode: 'firestore_storage' };
  }
  if (cachedBucketStatus && Date.now() - cachedBucketStatus.checkedAt < 120_000) {
    return {
      available: cachedBucketStatus.available,
      bucket,
      mode: cachedBucketStatus.available ? 'firebase_storage' : 'firestore_storage',
    };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?maxResults=1`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    // 200 or 401/403 means bucket exists; 404 means Storage hasn't been initialized in Firebase Console
    const exists = res.status !== 404;
    cachedBucketStatus = { checkedAt: Date.now(), available: exists, bucket };
    return {
      available: exists,
      bucket,
      mode: exists ? 'firebase_storage' : 'firestore_storage',
    };
  } catch {
    return { available: false, bucket, mode: 'firestore_storage' };
  }
}

function sanitizeFileName(name: string): string {
  return String(name || 'document')
    .replace(/[^a-zA-Z0-9._\- ]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

export interface UploadDocumentInput {
  title: string;
  fileName: string;
  mimeType: string;
  base64Content: string; // raw base64 or data URL
  category: DocumentCategory;
  uploadedById: string;
  uploadedByName: string;
  uploadedByRole: UserRole;
  tradeId?: string;
  sessionId?: string;
  traineeId?: string;
  relatedId?: string;
  remarks?: string;
  existingDownloadUrl?: string;
  existingStoragePath?: string;
}

export async function storeDocumentAndPersist(input: UploadDocumentInput): Promise<StoredDocumentRecord> {
  const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const safeName = sanitizeFileName(input.fileName);
  const storagePath = input.existingStoragePath || `iti_documents/${input.uploadedByRole}/${input.uploadedById}/${docId}_${safeName}`;

  let rawBase64 = String(input.base64Content || '');
  const commaIdx = rawBase64.indexOf(',');
  if (rawBase64.startsWith('data:') && commaIdx !== -1) {
    rawBase64 = rawBase64.slice(commaIdx + 1);
  }

  const fileBuffer = Buffer.from(rawBase64, 'base64');
  const sizeBytes = fileBuffer.length;
  if (sizeBytes > 8 * 1024 * 1024) {
    throw new Error('File exceeds maximum allowed size of 8 MB.');
  }

  let storageProvider: 'firebase_storage' | 'firestore_storage' = 'firestore_storage';
  let downloadUrl = input.existingDownloadUrl || `/api/documents/${docId}/download`;
  let chunkCount = 0;

  // 1. If client already uploaded directly to Firebase Storage URL, record reference directly
  if (input.existingDownloadUrl && input.existingDownloadUrl.startsWith('https://')) {
    storageProvider = 'firebase_storage';
    downloadUrl = input.existingDownloadUrl;
  } else {
    // 2. Try server upload to Firebase Storage bucket if available
    const status = await checkFirebaseStorageStatus();
    if (status.available && fileBuffer.length > 0) {
      try {
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, new Uint8Array(fileBuffer), {
          contentType: input.mimeType || 'application/octet-stream',
        });
        downloadUrl = await getDownloadURL(storageRef);
        storageProvider = 'firebase_storage';
      } catch (err) {
        console.warn('[Firebase Storage] Bucket upload unavailable, persisting binary chunks in Cloud Firestore:', err);
      }
    }
  }

  // 3. Persist binary chunks in Cloud Firestore `storedFiles` if not stored in Cloud Storage bucket
  if (storageProvider === 'firestore_storage' && rawBase64.length > 0) {
    const totalChunks = Math.max(1, Math.ceil(rawBase64.length / CHUNK_CHAR_SIZE));
    chunkCount = totalChunks;
    const batch = writeBatch(firestore);
    for (let i = 0; i < totalChunks; i++) {
      const slice = rawBase64.slice(i * CHUNK_CHAR_SIZE, (i + 1) * CHUNK_CHAR_SIZE);
      const chunkId = `${docId}_part_${i}`;
      batch.set(doc(firestore, 'storedFiles', chunkId), {
        docId,
        partIndex: i,
        totalChunks,
        mimeType: input.mimeType || 'application/octet-stream',
        fileName: safeName,
        data: slice,
        createdAt: new Date().toISOString(),
      });
    }
    await batch.commit();
  }

  const record: StoredDocumentRecord = {
    id: docId,
    title: String(input.title || safeName).trim(),
    fileName: safeName,
    mimeType: input.mimeType || 'application/octet-stream',
    sizeBytes,
    category: input.category || 'Other',
    storagePath,
    downloadUrl,
    storageProvider,
    chunkCount: chunkCount || undefined,
    uploadedById: input.uploadedById,
    uploadedByName: input.uploadedByName,
    uploadedByRole: input.uploadedByRole,
    tradeId: input.tradeId || undefined,
    sessionId: input.sessionId || undefined,
    traineeId: input.traineeId || undefined,
    relatedId: input.relatedId || undefined,
    remarks: input.remarks || undefined,
    createdAt: new Date().toISOString(),
  };

  // Persist reference metadata in Firestore `documents` collection
  const cleanMeta: Record<string, any> = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined) cleanMeta[k] = v;
  }
  await setDoc(doc(firestore, 'documents', docId), cleanMeta, { merge: true });

  return record;
}

export async function readStoredDocumentBuffer(record: StoredDocumentRecord): Promise<{
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  externalUrl?: string;
}> {
  if (record.storageProvider === 'firebase_storage' && record.downloadUrl.startsWith('https://')) {
    return {
      buffer: Buffer.alloc(0),
      mimeType: record.mimeType,
      fileName: record.fileName,
      externalUrl: record.downloadUrl,
    };
  }

  const totalChunks = Math.max(1, record.chunkCount || 1);
  let combined = '';
  for (let i = 0; i < totalChunks; i++) {
    const snap = await getDoc(doc(firestore, 'storedFiles', `${record.id}_part_${i}`));
    if (!snap.exists()) {
      throw new Error('Document binary payload missing from Firestore storage.');
    }
    combined += String((snap.data() as any).data || '');
  }

  return {
    buffer: Buffer.from(combined, 'base64'),
    mimeType: record.mimeType || 'application/octet-stream',
    fileName: record.fileName,
  };
}

export async function deleteStoredDocumentFiles(record: StoredDocumentRecord): Promise<void> {
  if (record.storageProvider === 'firebase_storage' && record.storagePath) {
    try {
      await deleteObject(ref(storage, record.storagePath));
    } catch {
      // ignore if already removed
    }
  } else {
    const totalChunks = Math.max(1, record.chunkCount || 1);
    const batch = writeBatch(firestore);
    for (let i = 0; i < totalChunks; i++) {
      batch.delete(doc(firestore, 'storedFiles', `${record.id}_part_${i}`));
    }
    await batch.commit().catch(() => {});
  }

  await deleteDoc(doc(firestore, 'documents', record.id)).catch(() => {});
}
