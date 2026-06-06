# Fab Lab Queue

A virtual queue for **3D printing** and **laser cutting**. Students sign in with their
school Google account, upload an `.stl` or `.svg`, and join the queue. Lab staff (you)
get an admin dashboard to download files and mark jobs done.

- **Frontend:** React + Vite, hosted free on **GitHub Pages**.
- **Backend:** **Firebase** — Auth (Google sign-in), Firestore (the queue), Storage (the files).
- **No server to run.** The browser talks to Firebase directly; access is enforced by
  Firebase **Security Rules**.

---

## The big picture

```
Browser (GitHub Pages)  ──►  Firebase Auth      (who are you? school accounts only)
                        ──►  Firebase Firestore (the queue list)
                        ──►  Firebase Storage   (the uploaded files)
```

There are exactly **three values you must personalize**, in **three places** that must agree:

| What | Where |
|------|-------|
| Your school's email domain | `src/config.js`, `firestore.rules`, `storage.rules` |
| Admin email(s) (you) | `src/config.js`, `firestore.rules`, `storage.rules` |
| Firebase project keys | `src/firebaseConfig.js` |

---

## Part A — Create the Firebase project (≈10 min, one time)

1. Go to <https://console.firebase.google.com> and **Add project**. Give it a name
   (e.g. `fab-lab-queue`). You can disable Google Analytics. Click through to create it.

2. **Upgrade to the Blaze plan** (needed for Storage). Bottom-left, click the plan name →
   **Upgrade** → **Blaze** → attach a billing account. For a school queue your usage will
   sit inside the free tier, so the bill should be ~$0. *(Optional but smart: set a budget
   alert at, say, $5 so you're emailed if anything ever changes.)*

3. **Enable Google sign-in.** Left menu → **Build → Authentication → Get started** →
   **Sign-in method** tab → **Google** → enable → pick a support email → **Save**.

4. **Create the Firestore database.** Left menu → **Build → Firestore Database** →
   **Create database** → choose a location near you → start in **production mode**
   (we ship our own rules, so this is fine).

5. **Create Storage.** Left menu → **Build → Storage → Get started** → accept the default
   bucket → choose the same location.

6. **Register the web app + copy keys.** Click the **gear icon → Project settings** →
   scroll to **Your apps** → click the **`</>` (Web)** icon → give it a nickname →
   **Register app**. It shows a `const firebaseConfig = { ... }` block. **Copy that object.**

---

## Part B — Plug in your values

1. Open **`src/firebaseConfig.js`** and paste the object from step A6 over the `PASTE_ME`s.
   *(These keys are not secret — they're safe to commit. Security comes from the rules.)*

2. Open **`src/config.js`** and set:
   - `SCHOOL_DOMAIN` → e.g. `"students.myschool.edu"` (just the part after the `@`).
   - `ADMIN_EMAILS` → your school email, lowercase, e.g. `["jdoe@myschool.edu"]`.

3. Open **`firestore.rules`** and **`storage.rules`** and set the same two values in the
   `schoolDomain()` and `adminEmails()` functions at the top of each file. **These must
   match `config.js`** — the rules are the real security; `config.js` is just the UI.

---

## Part C — Run it on your computer

```bash
npm install      # first time only
npm run dev      # starts http://localhost:5173
```

Open the URL, click **Sign in with Google**, use your school account. Try adding a job.
*(Until you deploy the rules in Part D, writes may be blocked — that's expected.)*

---

## Part D — Deploy the Security Rules to Firebase

The rules files only protect your data once you upload them. Install the Firebase CLI and push them:

```bash
npm install -g firebase-tools     # one time
firebase login                    # opens a browser to authorize
firebase use --add                # pick the project you made in Part A
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Re-run that last `deploy` line any time you change a `.rules` file.

---

## Part E — Put it on GitHub Pages

1. Create a **new repository** on GitHub (e.g. `fab-lab-queue`). It can be public — remember,
   the Firebase web keys are not secrets.

2. From this folder, push your code:
   ```bash
   git add .
   git commit -m "Initial fab lab queue"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

3. In the repo on github.com: **Settings → Pages → Build and deployment → Source →
   GitHub Actions**. The included workflow (`.github/workflows/deploy.yml`) builds and
   deploys automatically on every push. Watch it run under the **Actions** tab. When it
   finishes, your site is at `https://<your-username>.github.io/<your-repo>/`.

4. **Authorize that domain for sign-in.** Back in Firebase Console →
   **Authentication → Settings → Authorized domains → Add domain** →
   enter `<your-username>.github.io`. *(Google sign-in is blocked on unlisted domains —
   this step is easy to forget.)*

Done. Every `git push` now redeploys the site.

---

## Using it as the lab admin

When you sign in with an email listed in `ADMIN_EMAILS`, you see the **Admin dashboard**
instead of the join form:

- Filter by status (Active / All / Queued / In progress / Done / Rejected).
- **⬇ download** each file when you're ready to print/cut.
- Change a job's **status** from the dropdown — the requester sees it update live.
- **Delete** a finished job (also deletes its file from Storage).

Students see the live queue with their position number and can **Cancel** their own
queued jobs.

---

## Data model (Firestore `jobs` collection)

| field | meaning |
|-------|---------|
| `ownerUid` / `ownerEmail` / `ownerName` | who submitted it |
| `type` | `"3D Print"` or `"Laser Cut"` |
| `title`, `notes` | description for the lab |
| `fileName`, `filePath` | original name + path in Storage (`uploads/<uid>/...`) |
| `status` | `queued` → `in_progress` → `done` (or `rejected`) |
| `createdAt` | server timestamp; queue is ordered by this |

---

## Cost & safety notes

- **Cost:** Blaze with this usage is effectively free; set a budget alert to be safe.
- **Privacy:** Any signed-in school user can see the *queue* (titles, names, statuses).
  The **files** can only be downloaded by their owner or an admin (enforced in `storage.rules`).
- **Why the email check is trustworthy:** Google verifies the account's email, and the rules
  require `email_verified == true`, so a user can't fake a school address.

## Troubleshooting

- **"Missing or insufficient permissions" when adding a job** → rules not deployed yet
  (Part D), or `SCHOOL_DOMAIN` in the rules doesn't match your actual email domain.
- **"The query requires an index"** → run the `firebase deploy --only firestore:indexes`
  from Part D, or click the link in the browser console to auto-create it.
- **Sign-in popup immediately closes / `auth/unauthorized-domain`** → add your domain under
  Authentication → Settings → Authorized domains (Part E step 4).
- **Non-school account gets signed out instantly** → that's intended.
