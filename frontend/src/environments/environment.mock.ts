import { Environment } from './environment.model';

/** Mock mode (`npm run start:mock`): fixtures from src/assets/mocks, a fake allowed user, no backend, no Firebase. */
export const environment: Environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080',
  useMocks: true,
  emulators: null,
  firebase: {
    apiKey: 'unused-in-mock-mode',
    authDomain: 'localhost',
    projectId: 'demo-earnings-tracker',
    appId: 'unused-in-mock-mode',
    messagingSenderId: '0',
  },
};
