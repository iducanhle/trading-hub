# Earnings Tracker — frontend

Angular 22 PWA (standalone components, signals, zoneless, OnPush by default), Angular Material 3 + Tailwind CSS 4,
Firebase Auth + Firestore through the modular Firebase SDK, TradingView Lightweight Charts. Talks to the Spring Boot
API described in [docs/CONTRACT.md](../docs/CONTRACT.md).

## Run it

Node 24 LTS. From this folder:

| Command | What it runs |
|---|---|
| `npm install` | Dependencies (once) |
| `npm run start:mock` | **No backend, no Firebase.** Fixtures from `src/assets/mocks` and a fake signed-in user. Open <http://localhost:4200>. |
| `npm start` | Against the backend on `localhost:8080` and the real Firebase project (fill in `src/environments/environment.ts` first). |
| `npm run start:emulators` | Against the local backend in emulator mode and the Firebase Auth/Firestore emulators (see [backend/README.md](../backend/README.md)). |
| `npm run test:ci` | Unit tests once (Vitest); `npm test` watches. |
| `npm run test:rules` | Firestore security-rules tests against the Firestore emulator (needs Java 21+). |
| `npm run lint` | ESLint (angular-eslint). |
| `npm run build` | Production build into `dist/earnings-tracker/browser` (mock code is swapped out). |
| `npm run deploy:rules -- a@x.com,b@y.com` | Deploys `firestore.rules` with the real allowlist without committing it. |
| `npm run deploy:hosting` | Builds and deploys to Firebase Hosting (normally done by GitHub Actions). |

In mock mode, symbols starting with `ERR` answer 503 and unknown symbols 404, so error states can be tried out.

## Layout

```
src/
  environments/        environment.ts (local), .prod.ts, .mock.ts, .emulators.ts
  assets/mocks/        contract-shaped fixtures for mock mode (not shipped in production builds)
  app/
    core/              auth, api (ApiService, errors, cache), interceptors, data (Firestore gateway), services,
                       models (contract.ts mirrors docs/CONTRACT.md), mocks, layout (app shell)
    shared/            components (StockLogo, states, headers), pipes, utils (formatting, dates), icon
    features/          auth, search, stock-detail, followed, calendar, settings
scripts/               icon generators, deploy-rules.mjs
tests/rules/           Firestore rules tests (Vitest + @firebase/rules-unit-testing)
firestore.rules        security rules (allowlist + per-user ownership + shape checks)
firebase.json          Hosting (SPA rewrite, cache headers), Firestore, emulator ports
```

Deployment: [docs/DEPLOYMENT-frontend.md](../docs/DEPLOYMENT-frontend.md).
