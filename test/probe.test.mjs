import assert from 'node:assert/strict';
import test from 'node:test';
import { runProbe } from '../src/probe.mjs';

test('offline probe proves shell and filesystem access', async () => {
  const result = await runProbe({ offline: true, timeout: 3000 });

  assert.equal(result.tool, 'proveit');
  assert.ok(result.checks.length >= 6);

  const shell = result.checks.find((check) => check.id === 'shell');
  assert.equal(shell.status, 'ok', shell.evidence);

  const temp = result.checks.find((check) => check.id === 'filesystem.temp');
  assert.equal(temp.status, 'ok', temp.evidence);

  const cwd = result.checks.find((check) => check.id === 'filesystem.cwd');
  assert.equal(cwd.status, 'ok', cwd.evidence);

  assert.equal(result.summary.ok + result.summary.blocked + result.summary.unknown, result.checks.length);
});

test('only known statuses are emitted', async () => {
  const result = await runProbe({ offline: true, timeout: 3000 });
  const allowed = new Set(['ok', 'blocked', 'unknown']);
  for (const check of result.checks) {
    assert.ok(allowed.has(check.status), `${check.id}: ${check.status}`);
  }
});
