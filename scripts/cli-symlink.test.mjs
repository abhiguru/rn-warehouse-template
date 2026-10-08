import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('symlinked CLI checks and postinstall adapters execute instead of silently succeeding', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'warehouse-cli-symlink-'));
  const root = join(scratch, 'checkout');
  const alias = join(scratch, 'alias');
  try {
    mkdirSync(root);
    mkdirSync(join(root, 'src/config'), { recursive: true });
    cpSync(new URL('./', import.meta.url), join(root, 'scripts'), { recursive: true });
    cpSync(new URL('../src/config/bootstrapValidation.ts', import.meta.url), join(root, 'src/config/bootstrapValidation.ts'));
    symlinkSync(root, alias, 'dir');
    // Deliberately omit dependencies/configuration: these programs must report
    // failure, not skip their CLI body when launched through the alias.
    for (const [script, reason] of [
      ['doctor.mjs', /npm is unavailable/],
      ['check-backend.mjs', /Backend check failed/],
      ['patch-expo-metro.mjs', /Cannot find module/],
      ['patch-navigation-decoder.mjs', /ENOENT/],
    ]) {
      const result = spawnSync(process.execPath, [join(alias, 'scripts', script)], {
        encoding: 'utf8',
        env: { ...process.env, PATH: join(scratch, 'no-tools'), EXPO_PUBLIC_CONFIG_API_URL: 'invalid-origin' },
      });
      assert.equal(result.status, 1, `${script}: ${result.stderr}`);
      assert.match(result.stderr, reason);
    }
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
      "await import('./scripts/doctor.mjs'); await import('./scripts/check-backend.mjs'); await import('./scripts/patch-expo-metro.mjs'); await import('./scripts/patch-navigation-decoder.mjs');"], {
      cwd: alias, encoding: 'utf8',
    });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, '');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
