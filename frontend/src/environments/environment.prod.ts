import { Environment } from './environment.model';

/** Production build (`ng build`), served from Firebase Hosting. */
export const environment: Environment = {
  production: true,
  apiBaseUrl: 'https://tradiqo.duckdns.org',
  useMocks: false,
  emulators: null,
  // Web-app config (not secret) from: Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration".
  // authDomain is the Hosting domain the app is served from, so Google's redirect sign-in stays same-origin
  // (see core/firebase/firebase.ts and docs/DEPLOYMENT-frontend.md, step 2).
  firebase: {
    apiKey: 'AIzaSyCHaNlqFO3TuH07EX6N0Oz643uh5e2nml8',
    authDomain: 'tradiqo.web.app',
    projectId: 'tradiqo',
    messagingSenderId: '944234102566',
    appId: '1:944234102566:web:d58ba17d0bf100ed2c0be7',
  },
};
