import { Environment } from './environment.model';

/** Local development (`npm start`): the backend on localhost:8080 and the real Firebase project. */
export const environment: Environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080',
  useMocks: false,
  emulators: null,
  // Web-app config (not secret) from: Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration".
  // Same values as environment.prod.ts, except authDomain (see docs/DEPLOYMENT-frontend.md, step 2).
  firebase: {
    apiKey: 'AIzaSyCHaNlqFO3TuH07EX6N0Oz643uh5e2nml8',
    authDomain: 'tradiqo.firebaseapp.com',
    projectId: 'tradiqo',
    messagingSenderId: '944234102566',
    appId: '1:944234102566:web:d58ba17d0bf100ed2c0be7',
  },
};
