import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Firestore security-rules tests. Run through `npm run test:rules`, which starts the Firestore emulator.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
