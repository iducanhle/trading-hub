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
| `npm run lint` | ESLint (angular-eslint). |
| `npm run build` | Production build into `dist/earnings-tracker/browser`. |

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
scripts/               icon generators (Material Symbols paths, placeholder app icon)
```

Deployment: [docs/DEPLOYMENT-frontend.md](../docs/DEPLOYMENT-frontend.md).
