import { Environment } from './environment.model';

/** Local development (`npm start`): the backend on localhost:8080 and the real Firebase project. */
export const environment: Environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080',
  useMocks: false,
  emulators: null,
  // ─── FILL IN: Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration".
  // Same values as environment.prod.ts, except authDomain (see docs/DEPLOYMENT-frontend.md, step 2).
  firebase: {
    apiKey: 'PLACEHOLDER',
    authDomain: 'tradiqo.firebaseapp.com',
    projectId: 'tradiqo',
    appId: 'PLACEHOLDER',
    messagingSenderId: 'PLACEHOLDER',
  },
};
