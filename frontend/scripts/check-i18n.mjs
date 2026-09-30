// Checks that every message of the app has a Czech translation (and that the translation file has no stale ones).
//
//   npm run i18n:check
//
// It extracts the messages with `ng extract-i18n` into a temporary folder and compares their ids with
// src/locale/messages.cs.json. When English text changes, its id changes: translate the new id and delete the old one.
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'i18n-'));
try {
  execSync(`npx ng extract-i18n --format=json --output-path="${dir}"`, { stdio: 'ignore' });
  const source = JSON.parse(readFileSync(join(dir, 'messages.json'), 'utf8')).translations;
  const cs = JSON.parse(readFileSync('src/locale/messages.cs.json', 'utf8')).translations;
  const missing = Object.keys(source).filter((id) => !(id in cs));
  const stale = Object.keys(cs).filter((id) => !(id in source));
  for (const id of missing)
    console.error(`Missing Czech translation: ${id} ${JSON.stringify(source[id])}`);
  for (const id of stale)
    console.error(`Stale Czech translation (no such message): ${id} ${JSON.stringify(cs[id])}`);
  if (missing.length || stale.length) process.exit(1);
  console.log(`All ${Object.keys(source).length} messages are translated.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
