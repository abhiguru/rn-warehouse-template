/**
 * Route screens and the profile service do not write profile ids, names, mobile numbers
 * or whole records to the device log with a bare console.log (it is stripped only from
 * a production bundle). Diagnostics go through createLogger, which redacts.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');

it.each([
  'app/profile.tsx',
  'app/help.tsx',
  'app/user/edit/[userId].tsx',
  'app/item-edit/[id].tsx',
  'app/reports/dispatch-activity.tsx',
  'src/services/user-service.ts',
])('%s has no console.log', (file) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  expect(source.match(/console\.log\(/g) ?? []).toEqual([]);
});
