import { Environment } from './environment.model';

/** Production build (`ng build`), served from Firebase Hosting. */
export const environment: Environment = {
  production: true,
  apiBaseUrl: 'https://tradiqo.duckdns.org',
  useMocks: false,
  emulators: null,
  // ─── FILL IN: Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration".
  // authDomain is the Hosting domain the app is served from, so Google's redirect sign-in stays same-origin
  // (see core/firebase/firebase.ts and docs/DEPLOYMENT-frontend.md, step 2).
  firebase: {
    apiKey: 'PLACEHOLDER',
    authDomain: 'tradiqo.web.app',
    projectId: 'tradiqo',
    appId: 'PLACEHOLDER',
    messagingSenderId: 'PLACEHOLDER',
  },
};
