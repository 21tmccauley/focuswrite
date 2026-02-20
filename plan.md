# FocusWrite MVP — Build Plan & Mini-Tutorials

This plan walks you through building FocusWrite from your existing Vite + React setup. Each step includes a mini-tutorial: what to do, key code patterns, and pitfalls to avoid. Steps are ordered so that each builds on the previous one.

---

## Additional design decisions (summary)

- **Student identity:** On page load for `/write/:assignmentId`, a **popup asks for Student ID** (required). Optionally ask for name for display. Session is keyed by `assignmentId + '_' + normalizedStudentId` so one submission per student; teacher can match exports to their roster.
- **Assignment document fields:** `teacherId`, `promptText`, `createdAt`; optional `activeStatus` ('active' | 'archived'), `strikeLimit`. Document ID = assignment link id (nanoid). Optional later: `title`, `dueAt`, `updatedAt`.
- **Teacher-only access:** Firestore rules allow read/update/delete on assignments only when `resource.data.teacherId == request.auth.uid`; create only when `request.resource.data.teacherId == request.auth.uid`. Dashboard always queries with `where('teacherId', '==', user.uid)`.
- **Unique assignment link:** Generate `assignmentId` with **nanoid**; use it as the Firestore document ID for `assignments/{assignmentId}`. Student URL = `https://yourapp.com/write/{assignmentId}`. No sequential or guessable IDs.

---

## Phase 0: Prerequisites & Project Setup

### Step 0.1 — Install dependencies and add Firebase + router

**What to do:** Add React Router, Firebase SDK, and nanoid. You already have nanoid in the lockfile; add it to `package.json` if not listed.

**Commands:**
```bash
cd focusWrite
npm install react-router-dom firebase nanoid
```

**Verify:** `package.json` includes `"react-router-dom"`, `"firebase"`, and `"nanoid"`.

**Mini-tutorial:**  
- **React Router:** You’ll have routes like `/` (landing or teacher), `/write/:assignmentId` (student room), and maybe `/dashboard` for the teacher. Use `createBrowserRouter` + `RouterProvider` in `main.jsx`, and `Link` / `useNavigate` / `useParams` in components.  
- **Firebase:** You’ll use `initializeApp`, `getAuth`, `getFirestore`, and later `GoogleAuthProvider`, `signInWithPopup`, `onAuthStateChanged`, `doc`, `setDoc`, `getDoc`, `onSnapshot`, `collection`, `query`, `where`, `serverTimestamp`.  
- **nanoid:** Use for unguessable `assignmentId` (e.g. `nanoid(10)` or `nanoid(12)`). Never use sequential IDs for assignment URLs.

---

### Step 0.2 — Create Firebase project and get config

**What to do:** In Firebase Console create a new project, enable Authentication (Google provider) and Firestore. Register a web app and copy the config object.

**Mini-tutorial:**  
1. Go to [Firebase Console](https://console.firebase.google.com/) → Create project (e.g. “FocusWrite”).  
2. **Authentication** → Sign-in method → Enable **Google**.  
3. **Firestore Database** → Create database → Start in **test mode** for now (you’ll lock it down in Phase 4).  
4. Project Settings → Your apps → Add web app → Copy `firebaseConfig` (apiKey, authDomain, projectId, etc.).

Create `src/firebase.js`:

```javascript
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
```

Do not commit real keys to public repos; use env vars (e.g. `import.meta.env.VITE_*`) and a `.env` file that’s in `.gitignore`.

---

### Step 0.3 — App shell and routing

**What to do:** Replace the default App content with a router and minimal placeholder pages so you have a clear entry point for “teacher” vs “student” flows.

**Mini-tutorial:**  
- In `main.jsx`: create a `createBrowserRouter` with routes such as:  
  - `/` → Home/Landing (e.g. “Teacher” vs “Student” links for dev).  
  - `/dashboard` → Teacher dashboard (placeholder).  
  - `/write/:assignmentId` → Student writing room (placeholder).  
- Wrap the app with `<RouterProvider router={router} />`.  
- In `App.jsx` you can either render `<Outlet />` and keep layout there, or put layout in a route `element` and nest routes.  
- Use `useParams()` in the write page to read `assignmentId` and display it (e.g. “Assignment: xyz”) to confirm routing works.

**Unique assignment link strategy:** Generate the link id with **nanoid** (e.g. `nanoid(10)` or `nanoid(12)`). Use that value as the **Firestore document ID** for the new assignment: `assignments/{assignmentId}`. The student URL is then `https://yourapp.com/write/{assignmentId}` — one ID, one doc, no separate slug or redirect. Never use sequential or guessable IDs.

---

## Phase 1: Firebase data model and security

### Step 1.1 — Define Firestore collections and document shape

**What to do:** Lock in the document structure so security rules and client code stay in sync.

**Collections:**

- **assignments**  
  - `teacherId` (string, Firebase Auth UID of creator) — used in security rules and dashboard filtering.  
  - `promptText` (string) — the writing prompt.  
  - `createdAt` (Firestore Timestamp, use `serverTimestamp()`).  
  - `activeStatus` (string, optional) — e.g. `'active'` | `'archived'` to hide or disable old assignments without deleting.  
  - `strikeLimit` (number, optional) — max strikes before auto-submit (default 3).  
  - **Document ID:** Use the **unique assignment link id** (from nanoid) as the doc ID so the URL `/write/{assignmentId}` maps directly to `assignments/{assignmentId}`.

- **sessions**  
  - `assignmentId` (string)  
  - `studentId` (string) — **primary identifier**; ties submission to one student (e.g. school ID number).  
  - `studentName` (string, optional) — for display on dashboard (e.g. “12345 – Jane”).  
  - `content` (string)  
  - `wordCount` (number)  
  - `strikeCount` (number)  
  - `status` (`'active'` | `'locked'`)  
  - `createdAt`, `updatedAt` (Timestamps)  
  - Optional: `submittedAt` (Timestamp when status became `locked`)

**Session identity:** One session per student per assignment. Use a stable doc id: **`sessionId = assignmentId + '_' + normalizedStudentId`** (e.g. trim, no spaces: `studentId.trim().replace(/\s+/g, '')`). This gives one submission per student ID and blocks re-entry when that session is locked.

**Mini-tutorial:**  
- Create a small `src/constants.js` or `src/firebase-collections.js` that exports collection names: `ASSIGNMENTS`, `SESSIONS`.  
- When writing Firestore rules later, use these same field names so “no decreasing strikes” and “only append-like content” (if you add length checks) are easy to express.

---

### Step 1.2 — Firestore security rules (deter cheating)

**What to do:** Write rules so that clients cannot decrease `strikeCount`, and only the right actors can read/write. This addresses the “savvy student in DevTools” case.

**Mini-tutorial:**  
- In Firebase Console → Firestore → Rules, replace with something like the following. Adjust to your exact collection and field names.

**Assignments — only the creating teacher can view and manage:**  
- **Read:** Allow only when `resource.data.teacherId == request.auth.uid` (so each teacher sees only their own assignments).  
- **Create:** Allow when `request.resource.data.teacherId == request.auth.uid` and required fields are present.  
- **Update / Delete:** Allow only when `resource.data.teacherId == request.auth.uid`.  
- **Dashboard:** In the app, always query with `where('teacherId', '==', auth.currentUser.uid)` so the client never requests another teacher’s docs; rules enforce the same on the server.

**Sessions:**  
- **Read:** Allow for authenticated users; the dashboard only shows sessions for assignments owned by the current teacher (by querying assignments by `teacherId` first, then sessions by those `assignmentId`s).  
- **Create:** Allow unauthenticated create only if `strikeCount == 0`, `status == 'active'`, and `content` is string (and optional length cap).  
- **Update:** Only if document’s `status == 'active'`. Enforce: `request.resource.data.strikeCount >= resource.data.strikeCount` and optionally `request.resource.data.content.size() >= resource.data.content.size()`.  
- **Delete:** Deny for students; e.g. `allow delete: if false` for MVP (or add teacher-only delete via a get on the assignment).

Example snippet (adapt to your naming):

```javascript
// Assignments: only the creating teacher can read/update/delete their own
match /assignments/{assignmentId} {
  allow read, update, delete: if request.auth != null && resource.data.teacherId == request.auth.uid;
  allow create: if request.auth != null && request.resource.data.teacherId == request.auth.uid;
}

// Sessions: students create/update (unauthenticated); teachers read via dashboard
match /sessions/{sessionId} {
  allow read: if request.auth != null;
  allow create: if request.resource.data.strikeCount == 0 && request.resource.data.status == 'active';
  allow update: if resource.data.status == 'active'
    && request.resource.data.strikeCount >= resource.data.strikeCount
    && request.resource.data.content.size() >= resource.data.content.size();
  allow delete: if false;
}
```

Note: For teacher-only session delete (later), use `get(/databases/$(database)/documents/assignments/$(resource.data.assignmentId))` and check `teacherId == request.auth.uid`. For MVP, `allow delete: if false` is safe.

**Improvement:** These rules implement “strikes can only increase” and “content cannot shrink,” reducing the impact of a student tampering via DevTools.

---

## Phase 2: Student “Clean Room” (writing environment)

### Step 2.1 — Student entry (ID popup) and fullscreen

**What to do:** On load of `/write/:assignmentId`, show a **popup/modal asking for Student ID** (and optionally name for display). This associates the unauthenticated session with one student. Then create the session, request fullscreen, and show the writing UI.

**Mini-tutorial:**  
- **Route:** `/write/:assignmentId` — use `useParams()` to get `assignmentId`.  
- **Entry (on page load):** Show a modal or full-page form: “Student ID” (required), optionally “Name (for display).” On submit: validate student ID (non-empty, trim; optional format like numeric or max length). Compute **sessionId** = `assignmentId + '_' + normalizedStudentId` (e.g. `studentId.trim().replace(/\s+/g, '')`).  
- **Re-entry / existing session:** Before showing the form, check Firestore for a doc with id `sessionId`. If it exists and `status === 'locked'`, show “You have already been submitted for this assignment” and do not allow a new session. If it exists and `status === 'active'`, load that session (same doc) so the student can continue where they left off.  
- **Create session:** If no doc or new start, create session doc with `assignmentId`, `studentId`, optional `studentName`, `content: ''`, `wordCount: 0`, `strikeCount: 0`, `status: 'active'`, timestamps.  
- **Fullscreen:** After creating/loading the session, call `document.documentElement.requestFullscreen().catch(() => {})`. Optionally show: “Fullscreen couldn’t be enabled; please stay on this tab.”  
- **State:** Keep `sessionId`, `studentId`, `studentName` (optional), `assignmentId`, and whether the writing room is active. When active, render the writing UI; otherwise the entry form (or “already submitted” message).

---

### Step 2.2 — Textarea, word count, and strike indicator

**What to do:** Implement the main writing UI: plain textarea, live word count, and a visible strike counter (e.g. “Strikes: 0 / 3”).

**Mini-tutorial:**  
- **Controlled textarea:** `value={content}` and `onChange` that updates local state. Word count = `content.trim().split(/\s+/).filter(Boolean).length` (or your preferred definition).  
- **Strike indicator:** Display `strikeCount` and max (e.g. 3). Use clear, visible styling (e.g. red when strikeCount > 0).  
- **No rich text:** Use a plain `<textarea>`; no formatting toolbar.

---

### Step 2.3 — Tripwires: visibility, blur, paste (and drag-drop)

**What to do:** Add event listeners that increment strikes and show warnings or lock the session.

**Mini-tutorial:**  
- **visibilitychange:** `document.addEventListener('visibilitychange', handler)`. In the handler, if `document.visibilityState === 'hidden'`, treat as one strike (increment local state and sync to Firestore).  
- **window blur:** `window.addEventListener('blur', handler)` — same: one strike, then sync.  
- **Debounce / coalesce:** To avoid double-counting (e.g. blur and visibilitychange firing together), use a short debounce (e.g. 300–500 ms) or a “last strike time” and ignore repeat events within 1–2 seconds.  
- **paste:** On the textarea, `onPaste={(e) => e.preventDefault()}`.  
- **Improvement — drag and drop:** Prevent dropping text into the textarea: `onDragOver={(e) => e.preventDefault()}` and `onDrop={(e) => e.preventDefault()}`.  
- **Strike flow:** On strike 1 or 2: show a modal (“You left the tab or window. This is strike N of 3. Stay in this window.”). On strike 3: set status to `'locked'`, write final content + wordCount + `submittedAt` in one update, then show a “Submitted” screen and optionally exit fullscreen.  
- **Improvement (final write race):** When you hit strike 3, do a single Firestore update that sets both the latest `content`/`wordCount` and `status: 'locked'` (and `submittedAt`) so the “final” submission is never overwritten by a pending auto-save. Then stop auto-save and remove tripwire listeners.

---

### Step 2.4 — Auto-save to Firestore

**What to do:** Periodically save content and wordCount (and strikeCount if it changed) to the session doc so work isn’t lost.

**Mini-tutorial:**  
- **useEffect** that depends on `content`, `strikeCount`, and `sessionId`. Inside, start a timer (e.g. 3–5 seconds). On tick, run an update to the session doc: `content`, `wordCount`, `updatedAt: serverTimestamp()`. Only run while `status === 'active'` and session exists.  
- **Cleanup:** Clear the timer on unmount and when session becomes locked. When strike 3 fires, do the final write first, then clear the auto-save timer so it never overwrites the locked submission.

---

### Step 2.5 — Fullscreen exit and accidental strikes (optional improvement)

**What to do:** Reduce unfair strikes when the user exits fullscreen (e.g. Escape key).

**Mini-tutorial:**  
- When you detect visibility hidden or blur, you can show a confirmation modal: “Did you leave the testing environment? This will count as a strike. Continue?” with [Cancel] [Count as strike]. Only increment strike when they click “Count as strike.”  
- Alternatively, for MVP you can count fullscreen exit as a strike but make the warning modal very clear so students know Esc counts. Choose one and document it.

---

## Phase 3: Teacher dashboard

### Step 3.1 — Teacher auth and dashboard shell

**What to do:** Protect the teacher flow with Google Sign-In and show a minimal dashboard layout.

**Mini-tutorial:**  
- **Auth state:** Use `onAuthStateChanged(auth, (user) => { ... })` and store the user in React state or context. Show a “Sign in with Google” button when `!user`; use `signInWithPopup(auth, new GoogleAuthProvider())`.  
- **Route guard:** For `/dashboard`, if there’s no user, redirect to a login page or show login on the same page.  
- **Dashboard shell:** Once logged in, show a simple layout: sidebar or top nav with “Create assignment” and “Monitor” (or one combined view). Use the teacher’s `user.uid` as `teacherId` for new assignments.

---

### Step 3.2 — Create assignment and share unique link

**What to do:** Form to create an assignment; use **nanoid as the Firestore doc ID** so the assignment link is unique and unguessable. Copy link for students.

**Mini-tutorial:**  
- Form fields: “Prompt” (textarea), optional “Strike limit” (default 3), optional “Title” or “Active status.” On submit: **generate `assignmentId = nanoid(10)`** (or 12), then `setDoc(doc(db, 'assignments', assignmentId), { teacherId: user.uid, promptText, strikeLimit: 3, createdAt: serverTimestamp(), activeStatus: 'active' })`. The **document ID is the assignmentId** — one ID, one doc, one link.  
- Show success and the **assignment URL:** `window.location.origin + '/write/' + assignmentId`. “Copy link” via `navigator.clipboard.writeText(url)`.

---

### Step 3.3 — Live monitoring (Firestore snapshot)

**What to do:** List sessions for **only this teacher’s assignments** in real time. Only the creating teacher can see and manage their assignments (enforced by rules + query).

**Mini-tutorial:**  
- **Query assignments:** `query(collection(db, 'assignments'), where('teacherId', '==', user.uid))`. Use `onSnapshot` to get the list of assignment docs. This ensures the dashboard only ever requests assignments owned by the signed-in teacher.  
- **Query sessions:** For each assignment id (or combined list), use `onSnapshot` on `query(collection(db, 'sessions'), where('assignmentId', '==', id))`, or `where('assignmentId', 'in', arrayOfIds)` if you have ≤10 assignments. For more, listen to `sessions` and filter client-side by assignmentIds from the first query.  
- **Table columns:** Student ID, (optional) Student name, Word count, Strike count, Status (Writing / Submitted). Update in real time from snapshot data.  
- **Optional:** Filter by assignment (dropdown).

---

### Step 3.4 — Export submission as .txt

**What to do:** Button per row (or per submission) to download that session’s final content as a text file.

**Mini-tutorial:**  
- When the user clicks “Export” for a session, get the session’s `content`, `studentId`, and optional `studentName` (and optionally the assignment prompt).  
- Create a Blob and trigger download. Use **studentId in the filename** so the teacher can match to their roster: e.g. `a.download = \`${studentId}_submission.txt\`;` or `${studentId}_${studentName}_submission.txt`.  
- Optionally prepend the prompt and metadata to the file content so the export is self-contained.

---

## Phase 4: Polish and deployment

### Step 4.1 — Loading and error states

**What to do:** Add simple loading spinners and error messages for auth, Firestore reads/writes, and routing (e.g. invalid assignment id).

**Mini-tutorial:**  
- Use local state like `loading` and `error`. Set `loading = true` before async calls and `false` after. Set `error` on catch and display it. For Firestore, handle permission-denied and not-found cases with user-friendly messages.

---

### Step 4.2 — Environment variables and Firebase Hosting

**What to do:** Move Firebase config to `VITE_*` env vars and deploy the app to Firebase Hosting.

**Mini-tutorial:**  
- Create `.env`: `VITE_FIREBASE_API_KEY=...`, etc. In `firebase.js`, use `import.meta.env.VITE_FIREBASE_API_KEY`. Add `.env` to `.gitignore`.  
- Install Firebase CLI: `npm install -g firebase-tools`. Run `firebase login`, then `firebase init` in the project: choose Hosting, set public directory to `dist`, single-page app yes. Build with `npm run build`, then `firebase deploy`.

---

### Step 4.3 — Switch Firestore out of test mode

**What to do:** Remove the “test mode” rules and rely on the rules you wrote in Step 1.2 so production data is protected.

**Mini-tutorial:**  
- In Firestore Rules, paste your production rules (assignments + sessions). Use “Publish” and test with a second browser or incognito (student, no auth) and with a teacher account to ensure reads/writes behave as expected.

---

## Order summary (checklist)

- [ ] **0.1** Install react-router-dom, firebase, nanoid  
- [ ] **0.2** Firebase project + config in `src/firebase.js`  
- [ ] **0.3** Router + placeholder pages for `/`, `/dashboard`, `/write/:assignmentId`  
- [ ] **1.1** Collection/document shape + sessionId convention  
- [ ] **1.2** Firestore security rules (no decreasing strikes, no shortening content)  
- [ ] **2.1** Student entry (Student ID popup, optional name; create/load session; fullscreen; re-entry block when locked)  
- [ ] **2.2** Textarea, word count, strike indicator  
- [ ] **2.3** Tripwires: visibility, blur, paste, drag-drop; strike modal; strike 3 = lock + final write  
- [ ] **2.4** Auto-save; stop on lock  
- [ ] **2.5** (Optional) Confirm before counting strike  
- [ ] **3.1** Teacher Google Sign-In + dashboard shell  
- [ ] **3.2** Create assignment + copy URL  
- [ ] **3.3** Live monitoring table (snapshots)  
- [ ] **3.4** Export .txt  
- [ ] **4.1** Loading and error states  
- [ ] **4.2** Env vars + Firebase Hosting deploy  
- [ ] **4.3** Production Firestore rules  

---

## Suggested file structure (reference)

```
src/
  firebase.js           # init, auth, db
  constants.js          # ASSIGNMENTS, SESSIONS, default strike limit
  main.jsx              # router
  App.jsx               # layout + Outlet
  components/
    StudentEntry.jsx    # Student ID (and optional name) form + start writing
    WritingRoom.jsx     # textarea, word count, strikes, tripwires, auto-save
    StrikeModal.jsx     # warning / “Count as strike”
    TeacherDashboard.jsx
    CreateAssignment.jsx
    MonitorTable.jsx
  hooks/
    useAuth.js          # optional: auth state
    useSession.js       # optional: load/update session
  pages/
    Home.jsx
    Dashboard.jsx
    Write.jsx           # /write/:assignmentId — entry or writing room
```

You can merge components into fewer files for MVP; this structure keeps responsibilities clear as you add the improvements above.
