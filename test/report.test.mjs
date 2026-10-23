import assert from 'node:assert/strict';
import test from 'node:test';
import { renderContract, renderMarkdown, upsertContract } from '../src/report.mjs';

const sample = {
  tool: 'proveit',
  version: '1.0.0',
  generatedAt: '2026-10-23T12:00:00.000Z',
  durationMs: 12,
  cwd: 'C:/work',
  platform: { os: 'win32', arch: 'x64', release: 'node', node: 'v24.0.0' },
  summary: { ok: 2, blocked: 0, unknown: 1 },
  checks: [
    { id: 'shell', label: 'Execute a local process', status: 'ok', evidence: 'node -e ... -> ok' },
    { id: 'filesystem.temp', label: 'Read and write files', status: 'ok', evidence: 'temp dir' },
    { id: 'network.https', label: 'HTTPS', status: 'unknown', evidence: 'skipped' },
  ],
};

test('markdown report includes every check', () => {
  const markdown = renderMarkdown(sample);
  assert.match(markdown, /capability report/i);
  assert.match(markdown, /`shell`/);
  assert.match(markdown, /2 ok/);
});

test('contract block has the machine-readable markers', () => {
  const block = renderContract(sample);
  assert.match(block, /^<!-- proveit:begin -->/);
  assert.match(block, /<!-- proveit:end -->$/);
  assert.match(block, /\[proveit:<id>=<status>\]/);
});

test('upsertContract is idempotent', () => {
  const block = renderContract(sample);
  const once = upsertContract('# AGENTS\n', block);
  const twice = upsertContract(once, renderContract({ ...sample, generatedAt: '2026-10-24T12:00:00.000Z' }));
  assert.equal(twice.match(/<!-- proveit:begin -->/g).length, 1);
  assert.match(twice, /2026-10-24/);
});
