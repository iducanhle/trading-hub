/** Firebase web-app config: Firebase console → Project settings → General → Your apps → SDK setup and configuration. Not secret. */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
}

export interface Environment {
  production: boolean;
  /** Origin of the Spring Boot API, without `/api` and without a trailing slash. */
  apiBaseUrl: string;
  /** Serve the API from `src/assets/mocks` and replace Firebase with a fake allowed user. */
  useMocks: boolean;
  /** Connect Auth and Firestore to the local Firebase emulators (ports from `backend/emulator/firebase.json`). */
  emulators: { authUrl: string; firestoreHost: string; firestorePort: number } | null;
  firebase: FirebaseWebConfig;
}
