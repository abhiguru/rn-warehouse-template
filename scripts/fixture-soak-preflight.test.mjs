import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFaultState } from './fixture-soak-preflight.mjs';
async function withReply(reply, action) {
  const directory = mkdtempSync(join(tmpdir(), 'fixture-readonly-control-'));
  const socket = join(directory, 'status.sock');
  const server = createServer(client =>
    client.once('data', request => {
      assert.deepEqual(JSON.parse(request), { action: 'status' });
      client.end(reply);
    })
  );
  try {
    await new Promise(resolve => server.listen(socket, resolve));
    await action(socket);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
}
test('preflight control performs a bounded read-only status request', async () => {
  await withReply('{"state":"DISARMED"}\n', async socket =>
    assert.deepEqual(await readFaultState(socket), { state: 'DISARMED' })
  );
});
test('preflight refuses malformed control replies instead of reporting readiness', async () => {
  for (const reply of ['not JSON', '{"unrecognized":true}'])
    await withReply(reply, async socket =>
      assert.rejects(readFaultState(socket))
    );
});
