import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  type FirebaseStorage,
} from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const firestoreClient: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const firebaseStorage: FirebaseStorage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo:
        firebaseAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;
export async function testFirestoreConnection(): Promise<boolean> {
  if (connectionTested) return true;
  connectionTested = true;
  try {
    await getDocFromServer(doc(firestoreClient, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    // Missing document is fine; indicates server connectivity succeeded
    return true;
  }
}

// Run connection check automatically on client boot
if (typeof window !== 'undefined') {
  testFirestoreConnection().catch(() => {});
}

export async function signInWithGooglePopup() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(firebaseAuth, provider);
  const idToken = await cred.user.getIdToken();
  return { user: cred.user, idToken };
}

export async function signOutFirebaseClient() {
  try {
    await signOut(firebaseAuth);
  } catch {
    // ignore if no Firebase Auth user active
  }
}

export function subscribeFirebaseAuth(cb: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(firebaseAuth, cb);
}

/**
 * Attempts direct upload to Firebase Storage bucket; returns null cleanly if the bucket
 * has not been activated yet in Firebase Console so the backend stores chunks in Firestore.
 */
export async function tryDirectStorageUpload(
  storagePath: string,
  file: Blob | Uint8Array,
  mimeType: string
): Promise<string | null> {
  try {
    const storageRef = ref(firebaseStorage, storagePath);
    await uploadBytes(storageRef, file, { contentType: mimeType || 'application/octet-stream' });
    return await getDownloadURL(storageRef);
  } catch {
    return null;
  }
}

export async function tryDirectStorageDelete(storagePath: string): Promise<void> {
  try {
    const storageRef = ref(firebaseStorage, storagePath);
    await deleteObject(storageRef);
  } catch {
    // ignore if file lives in Firestore document store or was already removed
  }
}
