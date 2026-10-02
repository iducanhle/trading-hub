import { Environment } from './environment.model';

/**
 * Local frontend against the production backend on the VM (`npm run start:remote`, port 4200 only: the backend's
 * CORS allows http://localhost:4200). Real data and the real Firebase project, so changes are real too.
 */
export const environment: Environment = {
  production: false,
  apiBaseUrl: 'https://tradiqo.duckdns.org',
  useMocks: false,
  emulators: null,
  // Same as environment.ts (authDomain firebaseapp.com, see docs/DEPLOYMENT-frontend.md, step 2).
  firebase: {
    apiKey: 'AIzaSyCHaNlqFO3TuH07EX6N0Oz643uh5e2nml8',
    authDomain: 'tradiqo.firebaseapp.com',
    projectId: 'tradiqo',
    messagingSenderId: '944234102566',
    appId: '1:944234102566:web:d58ba17d0bf100ed2c0be7',
  },
};
