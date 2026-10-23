import assert from 'node:assert/strict';
import test from 'node:test';
import { scanText } from '../src/claims.mjs';

test('flags the classic Spanish sandbox claim', () => {
  const findings = scanText('Estoy en un sandbox remoto, aislado de tu equipo.');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'es-sandbox');
});

test('flags an English no-access claim', () => {
  const findings = scanText('I do not have access to your machine, so I cannot run that command.');
  assert.ok(findings.length >= 1);
  assert.equal(findings[0].check, 'filesystem.cwd');
});

test('flags a missing-tool claim', () => {
  const findings = scanText('There is no SSH tool in this environment.');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'en-missing-tool');
});

test('accepts a claim backed by probe evidence', () => {
  const text = [
    'Estoy en un sandbox remoto.',
    'Evidence: [proveit:runtime=ok] shows a local Windows process.',
  ].join('\n');
  assert.equal(scanText(text).length, 0);
});

test('accepts a claim explicitly ignored by the author', () => {
  const text = '<!-- proveit-ignore -->\nNo tengo acceso a tu PC.';
  assert.equal(scanText(text).length, 0);
});

test('does not scan fenced code blocks', () => {
  const text = ['```text', 'I am in a sandbox and I cannot run commands.', '```'].join('\n');
  assert.equal(scanText(text).length, 0);
});

test('reports the correct line number', () => {
  const text = ['# Title', '', 'I cannot execute commands on your machine.'].join('\n');
  const findings = scanText(text);
  assert.equal(findings[0].line, 3);
});
