// Deploys the Firestore rules and indexes with the real allowlist, without committing the addresses to git
// (the repository is public). The placeholders in firestore.rules are replaced only for the deploy, then restored.
//
//   npm run deploy:rules -- you@gmail.com,friend@gmail.com
//   (or set ALLOWED_EMAILS=you@gmail.com,friend@gmail.com and run npm run deploy:rules)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const rulesUrl = new URL('../firestore.rules', import.meta.url);
const raw = process.argv[2] ?? process.env.ALLOWED_EMAILS ?? '';
const emails = raw
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (!emails.length || emails.some((e) => !/^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/.test(e))) {
  console.error('Usage: npm run deploy:rules -- you@gmail.com,friend@gmail.com');
  process.exit(1);
}

const original = readFileSync(rulesUrl, 'utf8');
const allowlist = /function allowlist\(\) \{[\s\S]*?\}/;
if (!allowlist.test(original)) {
  console.error('firestore.rules has no allowlist() function to fill in.');
  process.exit(1);
}

writeFileSync(
  rulesUrl,
  original.replace(
    allowlist,
    `function allowlist() {\n      return [${emails.map((e) => `'${e}'`).join(', ')}];\n    }`,
  ),
);
console.log(`Deploying the rules for: ${emails.join(', ')}`);
let status = 1;
try {
  const result = spawnSync(
    'npx',
    ['-y', 'firebase-tools@15', 'deploy', '--only', 'firestore:rules,firestore:indexes'],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      cwd: new URL('..', import.meta.url),
    },
  );
  status = result.status ?? 1;
} finally {
  writeFileSync(rulesUrl, original);
}
process.exit(status);
