import { readFileSync, writeFileSync } from 'node:fs';
try {
  writeFileSync(new URL('../.env', import.meta.url), readFileSync(new URL('../.env.example', import.meta.url)), { flag: 'wx', mode: 0o600 });
  console.log('Created .env with mode 0600.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Preserved existing .env unchanged.');
}
