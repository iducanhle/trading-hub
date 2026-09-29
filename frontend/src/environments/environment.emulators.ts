import { Environment } from './environment.model';

/**
 * End to end on this machine (`npm run start:emulators`): the local backend in emulator mode plus the Firebase
 * Auth and Firestore emulators (see backend/README.md, "End to end with the Firebase emulators"). No real project.
 */
export const environment: Environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080',
  useMocks: false,
  emulators: { authUrl: 'http://127.0.0.1:9099', firestoreHost: '127.0.0.1', firestorePort: 8085 },
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'localhost',
    projectId: 'demo-earnings-tracker',
    appId: 'demo-app',
    messagingSenderId: '0',
  },
};
