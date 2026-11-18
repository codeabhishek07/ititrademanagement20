# ITI Trade Management Portal — Government ITI, Raigarh (Chhattisgarh)

A full-stack institutional Training & Trade Management Information System (MIS) built for **Government Industrial Training Institute (ITI), Raigarh (C.G.)** under NCVT / DGT guidelines. The portal supports role-based workflows for **Principal / Admin**, **Training Officers**, and **Trainees**, with **IST (`Asia/Kolkata`, UTC+05:30) synchronized attendance**, **GPS geofenced self-attendance**, **government holiday & working-day calculations**, **NCVT/DGT printable registers & progress cards**, **Document Vault**, and **offline-resilient PWA support**.

---

## Table of Contents

1. [Overview & Key Features](#overview--key-features)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Installation & Local Development](#installation--local-development)
6. [Environment Variables & Configuration](#environment-variables--configuration)
7. [Firebase Database & Security Setup](#firebase-database--security-setup)
8. [Production Build & Custom Domain Deployment](#production-build--custom-domain-deployment)
9. [API Overview](#api-overview)
10. [Pre-Launch Security & Testing Notes](#pre-launch-security--testing-notes)
11. [Troubleshooting](#troubleshooting)

---

## Overview & Key Features

### Role-Based Dashboards
- **Principal / Admin Portal (`AdminDashboard`)**
  - Configure institute metadata, GPS campus geofence (`lat`, `lng`, `radiusMeters`), IST attendance window (`startHour`/`startMinute`, `endHour`/`endMinute`, `autoAbsentHour`/`autoAbsentMinute`), leave limits, and minimum attendance threshold.
  - Manage academic sessions (`session_2024_2025`, `session_2025_2026`, etc.), trades, Training Officers, and bulk/individual Trainee records (Excel import/export via `xlsx`).
  - Manage Admin-designated holidays in the Session Calendar and review full institutional backups/restores (`/api/system/export-backup`, `/api/system/restore-backup`).
- **Training Officer Portal (`OfficerDashboard`)**
  - Batch attendance marking, auto-absent review/correction, and monthly attendance analytics.
  - **Academic Planning**: Lesson Plan Manager, Demonstration Plan Manager, and Weekly Plan Manager.
  - **Digital Progress Card Tracker**: Formative assessments, CBT/Practical/Assignment scoring, and single-page A4 landscape printable Progress Cards.
  - **Government Registers (`OfficerRegisters`)**: Printable/PDF-ready institutional registers with responsive mobile/desktop preview, auto-fit scaling, zoom controls, CSV export, and Devanagari headers.
  - Leave review/approval, disciplinary Warning Notices, and Trade Tool Inventory & Indent issuing/return tracking.
- **Trainee Portal (`TraineeDashboard`)**
  - **GPS Geofenced Self-Attendance**: Validates trainee coordinates against campus geofence (`Haversine` distance in meters) within the Admin-configured IST attendance window.
  - View personal attendance calendar, percentage breakdown, leave applications, issued tools, assessments, and warning notices.

### Calendar, Timezone & Persistence Architecture
- **Authoritative IST (`Asia/Kolkata`, UTC+05:30) Synchronization**:
  - Server process locks `process.env.TZ = 'Asia/Kolkata'` at boot (`src/server/tzInit.ts`) and exposes `/api/system/time` + `X-Server-Time-Ms` headers so frontend clocks and attendance windows stay synced regardless of browser or host timezone.
- **Government Working-Day & Holiday Rules (`src/utils/attendanceCalendar.ts`)**:
  - Automatically locks **every Sunday**, **2nd Saturday**, **3rd Saturday**, and **Admin-designated holidays** for attendance.
  - Working-day formula without double deduction:
    $$\text{Total Working Days} = \text{Total Calendar Days} - \text{Weekly Holidays} - \text{Admin-Designated Holidays}$$
    $$\text{Attendance \%} = \frac{\text{Present Days}}{\text{Total Working Days}} \times 100$$
  - Auto-absent scheduler (`17:00 IST` default) runs strictly on valid working days and never marks holidays as Absent.
- **Cloud Persistence & Offline PWA**:
  - **Cloud Firestore** stores operational collections (`settings`, `sessions`, `trades`, `officers`, `trainees`, `attendance`, `leaves`, `warnings`, `inventory`, `indents`, `plans`, `assessments`, `holidays`, `workingDays`, `documents`, `userPreferences`, `authSessions`, `auditLogs`).
  - **Document Vault**: Uploads to **Firebase Storage** when the bucket is provisioned, with automatic fallback to chunked binary storage (`storedFiles`) in Cloud Firestore.
  - **Offline Resilience**: Service Worker (`public/sw.js`) and IndexedDB queue (`src/offline/indexedDb.ts`) cache read views and queue offline actions when connectivity drops.

---

## Technology Stack

- **Frontend**: React `19.0.1`, TypeScript, Tailwind CSS `v4` (`@tailwindcss/vite`), `lucide-react`, `motion`, `xlsx`
- **Backend**: Node.js (`v22+`), Express `4.21.2`, `tsx` (`4.21.0` for development)
- **Build Tooling**: Vite `8.3.5` (`@vitejs/plugin-react`)
- **Database, Auth & Storage**: Firebase (`13.2.0` — Cloud Firestore, Firebase Storage, Firebase Authentication)

---

## Project Structure

```text
.
├── server.ts                          # Express API server, Vite dev middleware / dist static serving, IST scheduler
├── package.json                       # Scripts (dev, build, start, lint) and dependencies
├── tsconfig.json                      # TypeScript compiler configuration
├── vite.config.ts                     # Vite React + Tailwind CSS configuration
├── index.html                         # HTML entry point & PWA metadata
├── metadata.json                      # App identity and required frame permissions (geolocation)
├── firebase-applet-config.json        # Firebase project credentials & Firestore database ID
├── firebase-blueprint.json            # Firestore entity & collection schema blueprint
├── firestore.rules                    # Firestore security rules
├── .env.example                       # Environment variable template
├── public/
│   ├── manifest.json                  # Web App Manifest
│   └── sw.js                          # Service Worker for PWA offline caching
└── src/
    ├── App.tsx                        # Root application shell, auth session restoration, clock sync
    ├── api.ts                         # Typed frontend API client & server-time offset sync
    ├── firebase.ts                    # Client Firebase Auth, Firestore testConnection, Storage helpers
    ├── types.ts                       # Shared domain TypeScript interfaces
    ├── index.css                      # Tailwind CSS imports & A4 print / PDF isolation stylesheets
    ├── utils/
    │   └── attendanceCalendar.ts      # IST date/time helpers, holiday locks, working-day math
    ├── offline/                       # IndexedDB store, SW registration, online/PWA install hooks
    ├── services/
    │   └── backupService.ts           # Backup export/restore helpers
    ├── server/
    │   ├── tzInit.ts                  # Forces Node process TZ='Asia/Kolkata' before imports
    │   ├── db.ts                      # In-memory synchronized state + Firestore persistence + local cache
    │   ├── firestore.ts               # Firebase app/Firestore/Storage initialization from config
    │   ├── firestoreAdapter.ts        # Batch diff sync, retry queue, demo-record sanitization
    │   └── storageService.ts          # Firebase Storage & chunked Firestore document persistence
    └── components/
        ├── Header.tsx
        ├── LandingPage.tsx
        ├── DocumentVaultPanel.tsx
        ├── OfflineIndicator.tsx
        ├── PWAInstallButton.tsx
        ├── admin/AdminDashboard.tsx
        ├── officer/
        │   ├── OfficerDashboard.tsx
        │   ├── OfficerRegisters.tsx
        │   ├── DigitalProgressCardTracker.tsx
        │   ├── LessonPlanManager.tsx
        │   ├── DemonstrationPlanManager.tsx
        │   └── WeeklyPlanManager.tsx
        └── trainee/TraineeDashboard.tsx
```

---

## Prerequisites

- **Node.js**: **`v22.6.0` or higher** (tested on `v22.23.2`).
  > **Important:** The production start script (`"start": "node server.ts"`) uses Node.js's built-in TypeScript execution support introduced in Node 22. If you deploy on Node 20, run `npx tsx server.ts` or upgrade Node to v22 LTS.
- **npm**: `v10+`
- **Firebase Project**:
  - Cloud Firestore database created (matching `firestoreDatabaseId` in `firebase-applet-config.json`)
  - Firebase Authentication enabled (Google Sign-In provider if using Google login)
  - Firebase Storage enabled (optional; falls back to Firestore chunk storage if unprovisioned)
- **Custom Domain with HTTPS (Production)**:
  - **HTTPS is mandatory in production** for Browser Geolocation (`navigator.geolocation`) and Service Workers (`/sw.js`). Browsers block GPS access on plain `http://` outside `localhost`.

---

## Installation & Local Development

1. **Clone the repository**
   ```bash
   git clone <YOUR_GITHUB_REPOSITORY_URL>
   cd <REPO_DIRECTORY>
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` as needed (see [Environment Variables & Configuration](#environment-variables--configuration)).

4. **Verify Firebase configuration**
   Ensure `firebase-applet-config.json` contains your live Firebase project configuration and `firestoreDatabaseId`.

5. **Run in development mode**
   ```bash
   npm run dev
   ```
   The server starts on `http://localhost:3000` (with Vite middleware and Express API routes mounted together).

6. **Verify TypeScript & production bundle**
   ```bash
   npm run lint
   npm run build
   ```

---

## Environment Variables & Configuration

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Recommended (`production` in prod) | `development` | Set to `production` in live hosting so Express serves compiled `dist/` static assets instead of Vite dev middleware. |
| `DEFAULT_APP_PORT` | Optional | `3000` | Port Express listens on. You can also pass `--port <PORT>` via CLI args. *(Note: `server.ts` reads `DEFAULT_APP_PORT`, not `PORT`, unless adapted.)* |
| `APP_URL` | Recommended in Prod | — | Public HTTPS URL of your deployed custom domain (e.g., `https://mis.itiraigarh.in`). |
| `GEMINI_API_KEY` | Optional | — | Required only if enabling server-side Gemini API capabilities. Never expose in `VITE_*` variables. |
| `DISABLE_HMR` | Optional | `false` | Disables Vite file watching in constrained container environments. |
| `TZ` | Handled in code | `Asia/Kolkata` | Automatically set to `Asia/Kolkata` on startup via `src/server/tzInit.ts`. |

> **Security Note:** Never commit `.env` files, service account keys, or `data/iti_db.json` (which caches institutional records locally) to version control. Add `data/` to `.gitignore` before pushing live data changes.

---

## Firebase Database & Security Setup

1. **Firebase Config (`firebase-applet-config.json`)**
   - Verify `projectId`, `apiKey`, `authDomain`, `appId`, `storageBucket`, and `firestoreDatabaseId` match your target Firebase project.
2. **Firebase Authentication Authorized Domains**
   - In **Firebase Console → Authentication → Settings → Authorized domains**, add your custom domain (e.g., `portal.yourdomain.com` and `www.portal.yourdomain.com`). Without this, Google Sign-In popups will fail with `auth/unauthorized-domain`.
3. **Firestore Security Rules (`firestore.rules`)**
   - Deploy rules whenever modified:
     ```bash
     firebase deploy --only firestore:rules
     ```
   - **Important Production Security Advisory**: Currently, `server.ts` accesses Firestore via `src/server/firestore.ts` (client SDK running on the server without Firebase user auth context), and `firestore.rules` permits writes matching `isValidId(...)` and public reads (`allow read: if true`). Before exposing the portal broadly on a public custom domain, review and harden `firestore.rules` (for example by migrating server-side writes to `firebase-admin` with a service account and restricting direct client Firestore reads/writes to authenticated Firebase users).
4. **Default Credentials**
   - On an empty database, `src/server/db.ts` seeds initial institutional config and default accounts (`admin.iti.raigarh@cg.gov.in` / `admin123`, officer accounts with `officer123`). **Change all default passwords immediately** after first login in production.

---

## Production Build & Custom Domain Deployment

### Step 1: Build Frontend Assets & Start Express Server
Always run `npm run build` before starting in production so `dist/` is generated:
```bash
npm ci
npm run lint
npm run build
NODE_ENV=production DEFAULT_APP_PORT=3000 npm start
```
> **Note on Hosting Platforms (Render / Railway / Cloud Run / Fly.io):** Many PaaS platforms inject a dynamic `PORT` environment variable. If your platform requires listening on `$PORT`, start the server with:
> ```bash
> NODE_ENV=production node server.ts --port "${PORT:-3000}"
> ```

### Step 2: Recommended Deployment via Git Clone (VPS + Nginx + HTTPS + PM2)
Deploying via `git clone` (rather than uploading a ZIP) ensures clean updates, rollbacks, and excludes untracked build artifacts.

1. **Clone & Build on Server**
   ```bash
   git clone <YOUR_REPO_URL> /var/www/iti-portal
   cd /var/www/iti-portal
   npm ci
   npm run build
   ```
2. **Keep Server Alive with PM2**
   ```bash
   npm install -g pm2
   NODE_ENV=production DEFAULT_APP_PORT=3000 pm2 start server.ts --name iti-portal --interpreter node
   pm2 save
   pm2 startup
   ```
3. **Reverse Proxy with Nginx + SSL (Let's Encrypt)**
   Point your domain's `A` / `AAAA` DNS records to your server IP, then configure Nginx:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com www.yourdomain.com;

       client_max_body_size 55M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   > `client_max_body_size 55M;` matches Express's `50mb` JSON limit for institutional backup restores and document uploads.
   
   Enable HTTPS with Certbot:
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

### Updating Production Safely
```bash
cd /var/www/iti-portal
git pull origin main
npm ci
npm run lint
npm run build
pm2 restart iti-portal
```

---

## API Overview

| Group | Key Endpoints |
| :--- | :--- |
| **Health & Sync** | `GET /healthz`, `GET /api/system/time`, `GET /api/bootstrap`, `GET /api/system/cloud-status`, `POST /api/system/sync-cloud` |
| **Backups** | `GET /api/system/export-backup`, `POST /api/system/restore-backup` |
| **Auth & Preferences** | `POST /api/auth/login`, `POST /api/auth/google`, `GET /api/auth/session`, `POST /api/auth/logout`, `POST /api/auth/forgot-password`, `GET/PUT /api/user-preferences/:userId` |
| **Core Entities** | `/api/settings`, `/api/sessions`, `/api/trades`, `/api/officers`, `/api/trainees`, `/api/trainees/bulk` |
| **Attendance & Calendar** | `GET /api/attendance`, `POST /api/attendance/mark-trainee`, `POST /api/attendance/batch-officer`, `POST /api/attendance/auto-absent`, `/api/holidays`, `/api/monthly-working-days` |
| **Operations & Academics** | `/api/leaves`, `/api/warnings`, `/api/inventory`, `/api/indent`, `/api/lesson-plans`, `/api/demonstration-plans`, `/api/weekly-plans`, `/api/assessments`, `/api/notifications`, `/api/audit-logs` |
| **Document Vault** | `GET /api/documents`, `POST /api/documents/upload`, `GET /api/documents/:id/download`, `DELETE /api/documents/:id` |

---

## Pre-Launch Security & Testing Notes

Before routing real institutional traffic to your custom domain:
1. Change all seeded default passwords (`admin123`, `officer123`) in production.
2. Harden `firestore.rules` and move server-side Firestore mutations to `firebase-admin` (or authenticated service context) before broad public exposure.
3. Restrict CORS/Proxy headers and ensure `HTTPS` is enforced (`301` redirect from HTTP → HTTPS) so cookies (`iti_session_token`) and GPS geolocation work reliably.
4. Keep automated periodic backups via `GET /api/system/export-backup`.

---

## Troubleshooting

- **`Production build dist/ directory not found` in production**
  - Run `npm run build` before `NODE_ENV=production npm start`.
- **Node syntax error when running `node server.ts`**
  - Verify `node -v` is **`v22.6+`**. Older Node versions cannot execute `.ts` files directly and require `npx tsx server.ts`.
- **GPS Attendance says location permission denied or unavailable on custom domain**
  - Verify the site is accessed over **`https://`** (not `http://`), SSL certificate is valid, and browser location permissions are enabled.
- **Google Sign-In fails with `auth/unauthorized-domain`**
  - Add your custom domain (and `www` subdomain if used) under **Firebase Console → Authentication → Settings → Authorized domains**.
- **Large document upload or backup restore returns `413 Payload Too Large`**
  - Increase your reverse proxy upload limit (e.g., `client_max_body_size 55M;` in Nginx). Express already allows `50mb` JSON payloads (`8 MB` per document upload).
- **Port conflict or platform `$PORT` mismatch**
  - `server.ts` uses `DEFAULT_APP_PORT` (default `3000`) or `--port <PORT>`. Pass `--port $PORT` if your PaaS provider injects `PORT`.
