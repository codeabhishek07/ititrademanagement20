import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  writeBatch,
  Firestore,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Load configuration
let firebaseConfig: any = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  console.warn('Could not read firebase-applet-config.json:', e);
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firestore: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch };
