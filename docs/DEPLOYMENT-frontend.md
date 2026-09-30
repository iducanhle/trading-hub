# Deploying the frontend

This guide takes you from the code in `frontend/` to the app running at **https://tradiqo.web.app**, redeployed automatically on every push to `main`, and installed on your phones. It assumes you have never deployed anything. Every step says what to click or type and what you should see; troubleshooting is at the end.

**What you end up with**

```
 Phone / browser ──► https://tradiqo.web.app          Firebase Hosting (free): the Angular app, cached offline
        │                     │
        │                     └── Firebase Auth + Firestore (your follows, notes, settings; guarded by firestore.rules)
        │
        └── HTTPS + Firebase ID token ──► https://tradiqo.duckdns.org/api/…   the backend on the Oracle VM
```

**Cost:** $0. Firebase stays on the free **Spark** plan (section 10 shows how to check).
**Time:** about 45 minutes the first time.
**Already done:** the Firebase project (`tradiqo`), its Firestore database and the sign-in methods were created with the backend ([DEPLOYMENT-backend.md](DEPLOYMENT-backend.md), section 1). The backend already accepts calls from `https://tradiqo.web.app` (checked on 2026-09-30, section 5).

**Conventions**
- `PC>` marks commands for your computer. On Windows use **PowerShell** (Start menu → type "PowerShell"); on macOS/Linux the Terminal.
- Run the commands from the repository's `frontend` folder unless a step says otherwise:
  ```
  PC> cd path\to\trading-hub\frontend
  ```
- The Firebase console is redesigned from time to time. If a button has moved, use the search bar at the top.

---

## 1. Prerequisites (once)

1. **Node.js 24 LTS.** Download the "LTS" installer from <https://nodejs.org> and run it with the defaults.
   ```
   PC> node --version
   ```
   **You should see** `v24.…` (Angular 22 needs 22.22+ or 24.15+).
2. **Angular CLI** (optional; the project's own copy also works as `npx ng`):
   ```
   PC> npm install -g @angular/cli
   ```
3. **Firebase CLI:**
   ```
   PC> npm install -g firebase-tools
   PC> firebase --version
   ```
   **You should see** `15.…` or newer.
4. **Sign in to Firebase** with the Google account that owns the project:
   ```
   PC> firebase login
   ```
   A browser tab opens; pick your account and allow access. **You should see** `✔ Success! Logged in as you@gmail.com`.
   Check that the project is visible:
   ```
   PC> firebase projects:list
   ```
   **You should see** a row with the project ID `tradiqo`.
5. **Install the app's dependencies:**
   ```
   PC> npm ci
   ```
   **You should see** `added … packages` and no `ERR!` lines (warnings are fine).
6. *(Only for the Firestore rules tests in step 4)* **Java 21 or newer.** You already have it if you ran the backend locally (`java --version`).

## 2. Register the web app and fill in its config

Firebase needs to know about the web app before it can sign anyone in.

1. Open <https://console.firebase.google.com> → project **tradiqo**.
2. Click the gear next to **Project Overview** → **Project settings** → tab **General**.
3. Scroll to **Your apps** → click the **`</>`** (Web) icon.
4. **App nickname:** `Earnings Tracker web`. Leave **"Also set up Firebase Hosting"** unticked (the project already has a Hosting site). Click **Register app**.
5. You see a code block with `const firebaseConfig = { … }`. Keep the page open; you need three values from it: `apiKey`, `messagingSenderId`, `appId`. (Later you can find them again in the same **Your apps** section → **SDK setup and configuration** → **Config**.)
6. Click **Continue to console**.
7. Open `frontend/src/environments/environment.prod.ts` in an editor and replace the three `PLACEHOLDER`s:
   ```ts
   firebase: {
     apiKey: 'AIza…',                 // from firebaseConfig.apiKey
     authDomain: 'tradiqo.web.app',   // leave as is (see below)
     projectId: 'tradiqo',            // leave as is
     appId: '1:1234…:web:abcd…',      // from firebaseConfig.appId
     messagingSenderId: '1234…',      // from firebaseConfig.messagingSenderId
   },
   ```
8. Do the same in `frontend/src/environments/environment.ts` (used by `npm start` on your computer). There `authDomain` stays `tradiqo.firebaseapp.com`.

These values are **not secret**: every Firebase web app sends them to the browser, and the security rules (step 4) and the backend's allowlist protect the data. Commit them.

### Why `authDomain` is `tradiqo.web.app`

On phones and in the installed app, "Continue with Google" leaves the app for Google's sign-in page and comes back (a *redirect*). Modern browsers (Safari on iPhone especially) block the storage that this round trip needs when the page it returns through is on another domain. Firebase's fix is to use the domain the app is served from as `authDomain`: Firebase Hosting serves the sign-in helper at `https://tradiqo.web.app/__/auth/handler`, so everything stays on one domain. The app also switches `authDomain` automatically when it is opened on `tradiqo.firebaseapp.com`.

Google must be told that this helper address is allowed:

1. Open <https://console.cloud.google.com/apis/credentials?project=tradiqo> (same Google account).
2. Under **OAuth 2.0 Client IDs**, click **Web client (auto created by Google Service)**.
3. Under **Authorized redirect URIs** click **+ Add URI** and enter exactly:
   ```
   https://tradiqo.web.app/__/auth/handler
   ```
   (`https://tradiqo.firebaseapp.com/__/auth/handler` is already in the list; keep it.)
4. Click **Save**. **You should see** "OAuth client saved". It can take a few minutes to take effect.

## 3. Check the sign-in settings

1. Firebase console → **Build → Authentication** → tab **Sign-in method**. **You should see** **Email/Password** and **Google** marked **Enabled**. (If not: DEPLOYMENT-backend.md, step 1.3.)
2. Tab **Settings** → **Authorized domains**. **You should see** `localhost`, `tradiqo.firebaseapp.com` and `tradiqo.web.app`. If one is missing, click **Add domain** and add it.
3. *(Optional)* Tab **Templates** → **Email address verification** → pencil icon: change the **Sender name** to "Earnings Tracker" and adjust the text. **Save**. This is the email a new email/password account receives.

## 4. Firestore security rules

The rules in `frontend/firestore.rules` let each allowed, verified user read and write only their own `users/{uid}` document, follows and notes, check the shape of what is written (theme, 1–7 days, notes up to 10,000 characters…), and close everything else (the backend's collections) to browsers.

They contain an allowlist of two addresses, like the backend's `ALLOWED_EMAILS`. The repository is public, so the real addresses should not be committed: the placeholders `USER1_EMAIL` / `USER2_EMAIL` stay in git, and a small script fills them in only for the deploy.

1. *(Optional)* Run the rules tests (they start a local Firestore emulator; needs Java):
   ```
   PC> npm run test:rules
   ```
   **You should see** `Tests  11 passed (11)` and `Script exited successfully`.
2. Deploy the rules with your two addresses (the same ones as `ALLOWED_EMAILS` on the VM, comma-separated, no spaces):
   ```
   PC> npm run deploy:rules -- you@gmail.com,friend@gmail.com
   ```
   **You should see** `Deploying the rules for: you@gmail.com, friend@gmail.com`, then `✔ cloud.firestore: rules file firestore.rules compiled successfully` and `✔ Deploy complete!`. Afterwards `firestore.rules` shows the placeholders again (check with `git status`: no change).
3. Check: Firebase console → **Firestore Database** → tab **Rules**. **You should see** the new rules with your addresses and a "Published" time of just now.

*The manual way* (what the prompt describes): replace `USER1_EMAIL` and `USER2_EMAIL` in `firestore.rules`, run `firebase deploy --only firestore:rules,firestore:indexes`, then undo the edit before committing.

**Whenever you change who may use the app**, change both lists: `ALLOWED_EMAILS` on the VM (DEPLOYMENT-backend.md, 9.3) and the rules (repeat step 2).

## 5. Link to the backend

Nothing to change today; this is what to check if you ever move the backend or the app:

- `frontend/src/environments/environment.prod.ts` → `apiBaseUrl: 'https://tradiqo.duckdns.org'` (no `/api`, no trailing slash).
- `frontend/ngsw-config.json` → the `api` data group lists `https://tradiqo.duckdns.org/api/**`, so the last viewed data works offline. Change it together with `apiBaseUrl`.
- On the VM, in `/opt/earnings-tracker/.env` (checked 2026-09-30, both already correct):
  ```
  CORS_ALLOWED_ORIGINS=https://tradiqo.web.app,https://tradiqo.firebaseapp.com,http://localhost:4200
  APP_BASE_URL=https://tradiqo.web.app
  ```
  `CORS_ALLOWED_ORIGINS` lets the browser call the API from the app's address; `APP_BASE_URL` is where the digest email's links point (`…/stock/AAPL`). After a change, restart as in DEPLOYMENT-backend.md 9.3.

## 6. Build and deploy by hand (first time)

```
PC> npm run build
```
**You should see** `Application bundle generation complete` and `Output location: …\dist\earnings-tracker`, with no `ERROR` lines.

```
PC> firebase deploy --only hosting
```
**You should see** `✔ hosting[tradiqo]: release complete`, `✔ Deploy complete!` and
```
Hosting URL: https://tradiqo.web.app
```
Open that URL: the sign-in page appears. (`npm run deploy:hosting` runs both commands.)

## 7. Automatic deploys with GitHub Actions

`.github/workflows/frontend.yml` runs on every push to `main` that touches `frontend/**` (and on pull requests): lint, unit tests, the Firestore rules tests, the production build, then the deploy to Firebase Hosting with the official `FirebaseExtended/action-hosting-deploy` action. The deploy runs only when the repository variable `FIREBASE_DEPLOY_ENABLED` is `true`, and it refuses to deploy while `environment.prod.ts` still contains `PLACEHOLDER`. The rules are not deployed by CI (step 4 stays manual, because the addresses are not in git).

### 7.1 A service account for GitHub

GitHub needs its own key that can deploy Hosting (and nothing else).

1. Open <https://console.cloud.google.com/iam-admin/serviceaccounts?project=tradiqo>.
2. **+ Create service account** → name `github-hosting-deploy` → **Create and continue**.
3. **Grant this service account access** → add these roles (type the name in the role box):
   - **Firebase Hosting Admin**
   - **API Keys Viewer**

   → **Continue** → **Done**.
4. Click the new account → tab **Keys** → **Add key → Create new key** → **JSON** → **Create**. A `.json` file downloads.
5. Treat that file like a password: it can replace your live site. Don't commit it or email it; delete the download after step 7.2.

*Alternative:* `firebase init hosting:github` creates the account and the secret for you, but it also writes its own workflow files and may rewrite `firebase.json`. If you use it, delete the `.github/workflows/firebase-hosting-*.yml` files it creates, restore `frontend/firebase.json` with `git checkout frontend/firebase.json`, and rename the secret it made (`FIREBASE_SERVICE_ACCOUNT_TRADIQO`) to `FIREBASE_SERVICE_ACCOUNT` (or change the name in `frontend.yml`).

### 7.2 Secret and switch in GitHub

1. Open <https://github.com/iducanhle/trading-hub> → **Settings** → **Secrets and variables** → **Actions**.
2. Tab **Secrets** → **New repository secret** → Name `FIREBASE_SERVICE_ACCOUNT` → Value: open the JSON file in Notepad, select all, copy, paste → **Add secret**.
3. Tab **Variables** → **New repository variable** → Name `FIREBASE_DEPLOY_ENABLED`, Value `true` → **Add variable**.

### 7.3 First automatic deploy

Commit the filled-in environment files and push:
```
PC> git add src/environments/environment.ts src/environments/environment.prod.ts
PC> git commit -m "chore(frontend): add the Firebase web config"
PC> git push
```
Open the repository → tab **Actions** → **Frontend**. **You should see** the run go green: "Lint, test and build" (about 3–4 minutes) then "Deploy to Firebase Hosting". The log of the deploy step ends with the Hosting URL.

**Preview channels (optional):** a pull request from a branch of this repository gets its own temporary address (posted as a comment, deleted after 7 days). Previews are for looking at layout changes: their addresses are not in the backend's `CORS_ALLOWED_ORIGINS` or the Google redirect URIs, so sign-in with Google and API data won't work there.

## 8. Install it as an app

- **iPhone:** open <https://tradiqo.web.app> in **Safari** → **Share** (square with arrow) → **Add to Home Screen** → **Add**. Open it from the home screen and sign in there (the installed app keeps its own sign-in, separate from Safari).
- **Android:** open it in **Chrome** → menu **⋮** → **Install app** (or **Add to Home screen**) → **Install**.

It opens full screen, starts on **Followed**, and keeps working offline with the data you last viewed. When a new version is deployed, the app shows "A new version is available" with a **Reload** button.

## 9. Verification checklist

Do these once after the first deploy (phone and desktop):

- [ ] **Google sign-in** on desktop (popup) and on the phone / installed app (redirect) → you land on **Followed**.
- [ ] **Email registration:** Create account → "Verify your email" screen → the email arrives → open the link → **I've verified** → the app opens. (Use an allowlisted address.)
- [ ] **Not allowlisted:** sign in with another Google account → "This app is private — access not granted" → **Sign out** works.
- [ ] **Search** `sap` → SAP.DE and SAP appear; the query survives going back from a stock page.
- [ ] **Stock pages** for `AAPL` and `SAP.DE`: price and change, key stats, chart (Line/Candles, ranges, tap an "E" marker), history tabs, earnings cards (table on desktop), recommendations, news, peers.
- [ ] **Follow / unfollow** on a stock page → it appears on / disappears from **Followed**; unfollow from the row menu → **Undo** brings it back. Follow on the phone → it shows up on the desktop without reloading.
- [ ] **Notes:** type a note → "Saved" → reload → the note is still there.
- [ ] **Calendar:** week and month views, swipe, Today, filters (market cap, region, followed only) survive a reload; tap a day for the list.
- [ ] **Theme:** Light / Dark / System in Settings; reload → no flash of the wrong colours; the choice follows you to the other device.
- [ ] **Test email** in Settings → "Test email sent to …" and the email arrives (a second tap within a minute says to wait).
- [ ] **Offline:** open the installed app, then switch on airplane mode and reopen it → the app and the last viewed pages still show, with "You're offline" at the top.

## 10. Check that it costs nothing

1. Firebase console: the plan badge at the bottom left says **Spark** (no-cost). Don't click **Upgrade**.
2. **Hosting** → tab **Usage**: storage and data transfer far below the free 10 GB stored and 360 MB/day.
3. **Firestore Database** → tab **Usage**: reads and writes far below the free 50,000 reads and 20,000 writes per day. The app reads your user document and follows once per session through live listeners (no polling) and a note once per stock page; the backend's own usage is in DEPLOYMENT-backend.md 9.8.
4. **Authentication** → tab **Usage**: email/password and Google sign-ins are free; the app uses no phone (SMS) sign-in.
5. On Spark nothing is ever billed: going over a quota makes requests fail until the next day.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Sign-in says "The Firebase config is missing or wrong" | `PLACEHOLDER` values still in the environment file you built with (step 2). Rebuild and redeploy. |
| Google sign-in: "This domain is not authorized" | Add the domain in Authentication → Settings → Authorized domains (step 3). |
| Google sign-in on the phone returns to the login page, or Google shows `redirect_uri_mismatch` | The redirect URI `https://tradiqo.web.app/__/auth/handler` is missing or mistyped (step 2), or it was added minutes ago; wait 5 minutes and retry. Make sure you open the app at `tradiqo.web.app`. |
| "This app is private — access not granted" for your own account | The address is not in `ALLOWED_EMAILS` on the VM, or the email/password account is not verified yet. |
| Followed / Settings: "Couldn't load … from the database" | The Firestore rules' allowlist doesn't contain your address (redeploy the rules, step 4), or the rules were never deployed. |
| Every page shows "Can't reach the server right now" | The backend is down (`https://tradiqo.duckdns.org/api/health` should say `UP`), or `CORS_ALLOWED_ORIGINS` on the VM doesn't contain the address you opened (browser console: "blocked by CORS policy"). |
| After a deploy the app still shows the old version | The service worker updates in the background: wait for "A new version is available" → **Reload**, or close all tabs of the app and open it again. |
| `firebase deploy` says "Failed to get Firebase project tradiqo" | Run `firebase login` again with the account that owns the project (`firebase projects:list` must show it). |
| GitHub Action fails at "Refuse to deploy without the Firebase web config" | Commit the filled-in `environment.prod.ts` (step 7.3). |
| GitHub Action deploy step: "Permission denied" / 403 | The service account lacks **Firebase Hosting Admin** (step 7.1), or the secret is not the complete JSON file. |
| `npm run test:rules` fails with "Could not spawn java" | Install Java 21+ (step 1.6) or skip the optional local rules test; CI runs it anyway. |
| Blank page and `Cannot match any routes` or 404 for `/stock/…` on reload | `firebase.json` must keep the rewrite of `**` to `/index.html`; deploy from the `frontend` folder. |

## Local development

See [frontend/README.md](../frontend/README.md): `npm run start:mock` needs no backend or Firebase at all, `npm start` uses the backend on `localhost:8080` and the real project, and `npm run start:emulators` runs everything against the local Firebase emulators.
