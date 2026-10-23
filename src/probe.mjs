import { VERSION } from './version.mjs';
import {
  checkBinaries,
  checkBrowser,
  checkDns,
  checkFilesystemCwd,
  checkFilesystemTemp,
  checkGit,
  checkHttps,
  checkRuntime,
  checkShell,
} from './checks.mjs';

/**
 * Run the capability matrix.
 *
 * Every check is non-destructive and wrapped so a failure becomes evidence,
 * never an exception. The result is a plain object that can be serialized.
 */
export async function runProbe(options = {}) {
  const { offline = false, browser = false, timeout = 5000, cwd = process.cwd() } = options;
  const startedAt = new Date();

  const checks = [];
  checks.push(checkRuntime());
  checks.push(checkShell(timeout));
  checks.push(checkFilesystemTemp());
  checks.push(checkFilesystemCwd());

  if (!offline) {
    checks.push(await checkDns(timeout));
    checks.push(await checkHttps(timeout));
  } else {
    checks.push({
      id: 'network.dns',
      label: 'Resolve DNS names',
      status: 'unknown',
      evidence: 'skipped (--offline)',
    });
    checks.push({
      id: 'network.https',
      label: 'Make outbound HTTPS requests',
      status: 'unknown',
      evidence: 'skipped (--offline)',
    });
  }

  checks.push(checkBinaries(timeout));
  checks.push(checkGit(timeout));

  if (browser) {
    checks.push(await checkBrowser(timeout));
  }

  const summary = { ok: 0, blocked: 0, unknown: 0 };
  for (const check of checks) summary[check.status] += 1;

  return {
    tool: 'proveit',
    version: VERSION,
    generatedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    cwd,
    platform: {
      os: process.platform,
      arch: process.arch,
      release: process.release?.name ?? 'node',
      node: process.version,
    },
    summary,
    checks,
  };
}
