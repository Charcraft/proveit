import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Run a command and never throw. Returns exit status, stdio and elapsed time.
 */
function exec(command, args, timeout) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  return { ...result, elapsedMs: Date.now() - started };
}

function errorText(result) {
  if (result?.error?.message) return result.error.message;
  const stderr = (result?.stderr || '').trim();
  if (stderr) return stderr.split(/\r?\n/)[0];
  return `exit ${result?.status ?? 'unknown'}`;
}

function makeCheck(id, label, status, evidence, detail) {
  const check = { id, label, status, evidence };
  if (detail !== undefined) check.detail = detail;
  return check;
}

function sanitizeUrl(raw) {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return String(raw).replace(/\/\/[^/@]+@/, '//');
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function checkRuntime() {
  const markers = [
    'CI',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CODESPACES',
    'KUBERNETES_SERVICE_HOST',
    'WSL_DISTRO_NAME',
    'SANDBOX',
    'DOCKER_CONTAINER',
  ].filter((name) => process.env[name]);

  const detail = {
    platform: process.platform,
    release: process.release?.name ?? 'node',
    arch: process.arch,
    node: process.version,
    cwd: process.cwd(),
    user: process.env.USERNAME || process.env.USER || 'unknown',
    containerMarkers: markers,
  };

  const markerText = markers.length ? markers.join(', ') : 'none';
  return makeCheck(
    'runtime',
    'Process runs on this machine',
    'ok',
    `${process.platform}/${process.arch}, node ${process.version}, container markers: ${markerText}`,
    detail,
  );
}

export function checkShell(timeout) {
  const marker = 'proveit-shell-ok';
  const result = exec(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(marker)})`], timeout);
  const ok = result.status === 0 && String(result.stdout).trim() === marker;
  return makeCheck(
    'shell',
    'Execute a local process',
    ok ? 'ok' : 'blocked',
    ok
      ? `${basename(process.execPath)} -e ... -> ${marker} (exit 0)`
      : `failed: ${errorText(result)}`,
    { command: `${basename(process.execPath)} -e <inline>`, exit: result.status },
  );
}

export function checkFilesystemTemp() {
  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), 'proveit-'));
    const file = join(dir, 'probe.txt');
    const payload = `proveit ${Date.now()}`;
    writeFileSync(file, payload, 'utf8');
    const readBack = readFileSync(file, 'utf8');
    rmSync(dir, { recursive: true, force: true });
    if (readBack !== payload) throw new Error('read-back mismatch');
    return makeCheck(
      'filesystem.temp',
      'Read and write files in temp',
      'ok',
      `${tmpdir()} (write + read + delete)`,
      { path: tmpdir() },
    );
  } catch (error) {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
    return makeCheck('filesystem.temp', 'Read and write files in temp', 'blocked', `failed: ${error.message}`);
  }
}

export function checkFilesystemCwd() {
  try {
    const entries = readdirSync(process.cwd());
    return makeCheck(
      'filesystem.cwd',
      'Read the working directory',
      'ok',
      `${entries.length} entries in ${process.cwd()}`,
      { entries: entries.length },
    );
  } catch (error) {
    return makeCheck('filesystem.cwd', 'Read the working directory', 'blocked', `failed: ${error.message}`);
  }
}

export async function checkDns(timeout) {
  try {
    const result = await withTimeout(dns.lookup('example.com'), timeout, 'DNS timeout');
    return makeCheck('network.dns', 'Resolve DNS names', 'ok', `example.com -> ${result.address}`, {
      family: result.family,
    });
  } catch (error) {
    return makeCheck('network.dns', 'Resolve DNS names', 'blocked', `failed: ${error.message}`);
  }
}

export async function checkHttps(timeout) {
  const started = Date.now();
  try {
    const status = await withTimeout(
      new Promise((resolve, reject) => {
        const request = https.request(
          {
            method: 'HEAD',
            hostname: 'api.github.com',
            path: '/',
            headers: { 'user-agent': 'proveit-capability-probe' },
            timeout,
          },
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
          },
        );
        request.on('timeout', () => request.destroy(new Error('HTTPS timeout')));
        request.on('error', reject);
        request.end();
      }),
      timeout + 500,
      'HTTPS timeout',
    );
    return makeCheck(
      'network.https',
      'Make outbound HTTPS requests',
      'ok',
      `HTTP ${status} api.github.com in ${Date.now() - started}ms`,
      { status },
    );
  } catch (error) {
    return makeCheck('network.https', 'Make outbound HTTPS requests', 'blocked', `failed: ${error.message}`);
  }
}

const BINARIES = [
  'git',
  'node',
  'npm',
  'python',
  'python3',
  'ffmpeg',
  'ssh',
  'scp',
  'curl',
  'tailscale',
  'docker',
  'gh',
  'code',
];

export function checkBinaries(timeout) {
  const finder = IS_WINDOWS ? 'where' : 'which';
  const found = {};
  for (const name of BINARIES) {
    const result = exec(finder, [name], Math.min(timeout, 3000));
    if (result.status === 0) {
      const first = String(result.stdout).split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (first) found[name] = first;
    }
  }
  const count = Object.keys(found).length;
  return makeCheck(
    'binaries',
    'Locate installed command line tools',
    count > 0 ? 'ok' : 'blocked',
    `${count}/${BINARIES.length} found: ${Object.keys(found).join(', ') || 'none'}`,
    found,
  );
}

export function checkGit(timeout) {
  const inside = exec('git', ['rev-parse', '--is-inside-work-tree'], timeout);
  if (inside.error || inside.status !== 0) {
    return makeCheck('git', 'Inspect a git repository', 'unknown', 'not inside a git work tree');
  }

  const branchResult = exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], timeout);
  const remoteResult = exec('git', ['remote', 'get-url', 'origin'], timeout);
  const branch = String(branchResult.stdout || '').trim() || 'unknown';
  const remote = String(remoteResult.stdout || '').trim();
  return makeCheck(
    'git',
    'Inspect a git repository',
    'ok',
    `branch ${branch}${remote ? `, origin ${sanitizeUrl(remote)}` : ', no origin'}`,
    { branch, remote: remote ? sanitizeUrl(remote) : null },
  );
}

function probeCdpPort(port, timeout) {
  return new Promise((resolve) => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: '/json/version', timeout: Math.min(timeout, 1200) },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            const info = JSON.parse(body);
            resolve({ port, browser: info.Browser || 'unknown browser' });
          } catch {
            resolve(null);
          }
        });
      },
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

export async function checkBrowser(timeout) {
  const ports = [9222, 9223, 9333, 9334];
  const results = await Promise.all(ports.map((port) => probeCdpPort(port, timeout)));
  const active = results.filter(Boolean);
  if (active.length > 0) {
    return makeCheck(
      'browser.cdp',
      'Attach to a browser over CDP',
      'ok',
      active.map((item) => `${item.browser} at 127.0.0.1:${item.port}`).join(', '),
      { endpoints: active },
    );
  }
  return makeCheck(
    'browser.cdp',
    'Attach to a browser over CDP',
    'unknown',
    `no CDP endpoint on ${ports.join(', ')} (a browser may still be running without --remote-debugging-port)`,
  );
}
