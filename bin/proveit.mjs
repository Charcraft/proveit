#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { scanText } from '../src/claims.mjs';
import { runProbe } from '../src/probe.mjs';
import { renderContract, renderJson, renderMarkdown, upsertContract } from '../src/report.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const HELP = `
proveit v${pkg.version} - make your agent prove its limits.

Usage:
  proveit probe [options]          Run the capability matrix
  proveit claims <file...>         Flag unverified capability claims
  proveit prompt [options]         Print or install the capability contract
  proveit help                     Show this help

Probe options:
  --json                 Print JSON instead of Markdown
  --save                 Write proveit.json and PROVEIT.md to the current directory
  --out <dir>            Directory for --save (implies --save)
  --offline              Skip network checks
  --browser              Also probe Chrome DevTools endpoints (9222, 9333, ...)
  --timeout <ms>         Per-command timeout (default 5000)
  --quiet                Do not print the report

Claims options:
  --json                 Print findings as JSON
  --                      Read from stdin when no file is given

Prompt options:
  --write <file>         Insert or update the contract inside <file>
  --from <proveit.json>  Render from a previous probe instead of running a new one
  --offline              Skip network checks when probing
  --timeout <ms>         Per-command timeout (default 5000)

Examples:
  npx proveit probe --save --browser
  npx proveit claims transcript.md
  npx proveit prompt --write AGENTS.md

Exit codes: 0 success, 1 unverified claims found, 2 usage or runtime error.
`;

function fail(message) {
  console.error(`proveit: ${message}`);
  process.exitCode = 2;
}

function readInput(file) {
  if (file === '-' || file === undefined) {
    return readFileSync(0, 'utf8');
  }
  return readFileSync(resolve(file), 'utf8');
}

async function commandProbe(values) {
  const timeout = Number(values.timeout);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    fail('--timeout must be a positive number of milliseconds');
    return;
  }

  const result = await runProbe({
    offline: Boolean(values.offline),
    browser: Boolean(values.browser),
    timeout,
  });

  if (values.save || values.out) {
    const dir = resolve(values.out || '.');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'proveit.json'), renderJson(result), 'utf8');
    writeFileSync(join(dir, 'PROVEIT.md'), renderMarkdown(result), 'utf8');
    if (!values.quiet) {
      console.error(`Saved ${join(dir, 'proveit.json')} and ${join(dir, 'PROVEIT.md')}`);
    }
  }

  if (values.json) {
    process.stdout.write(renderJson(result));
  } else if (!values.quiet) {
    process.stdout.write(renderMarkdown(result));
  }
}

function commandClaims(positionals, values) {
  const files = positionals.slice(1);
  const inputs = files.length > 0 ? files : [undefined];
  let total = 0;

  for (const file of inputs) {
    let text;
    try {
      text = readInput(file);
    } catch (error) {
      fail(`cannot read ${file}: ${error.message}`);
      return;
    }

    const label = file === undefined ? '<stdin>' : basename(file);
    const findings = scanText(text, { file: label });
    total += findings.length;

    if (values.json) {
      for (const finding of findings) process.stdout.write(`${JSON.stringify(finding)}\n`);
      continue;
    }

    if (findings.length === 0) {
      console.log(`${label}: no unverified capability claims.`);
      continue;
    }

    console.log(`${label}: ${findings.length} unverified capability claim(s)`);
    for (const finding of findings) {
      console.log(`  ${label}:${finding.line}  [${finding.rule}]`);
      console.log(`    "${finding.claim}"`);
      console.log(`    ${finding.suggestion}`);
    }
  }

  if (total > 0) {
    process.exitCode = 1;
  }
}

async function commandPrompt(values) {
  let result;
  if (values.from) {
    try {
      result = JSON.parse(readFileSync(resolve(values.from), 'utf8'));
    } catch (error) {
      fail(`cannot read ${values.from}: ${error.message}`);
      return;
    }
  } else {
    const timeout = Number(values.timeout);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      fail('--timeout must be a positive number of milliseconds');
      return;
    }
    result = await runProbe({ offline: Boolean(values.offline), timeout });
  }

  const block = renderContract(result);

  if (values.write) {
    const target = resolve(values.write);
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
    writeFileSync(target, upsertContract(existing, block), 'utf8');
    console.log(`Updated capability contract in ${target}`);
    return;
  }

  process.stdout.write(`${block}\n`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      save: { type: 'boolean', default: false },
      out: { type: 'string' },
      offline: { type: 'boolean', default: false },
      browser: { type: 'boolean', default: false },
      timeout: { type: 'string', default: '5000' },
      write: { type: 'string' },
      from: { type: 'string' },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.version) {
    console.log(pkg.version);
    return;
  }

  const command = positionals[0] ?? (values.help ? 'help' : 'help');

  switch (command) {
    case 'probe':
      await commandProbe(values);
      break;
    case 'claims':
      commandClaims(positionals, values);
      break;
    case 'prompt':
      await commandPrompt(values);
      break;
    case 'help':
    case '--help':
      console.log(HELP.trim());
      break;
    default:
      fail(`unknown command "${command}"`);
      console.log(HELP.trim());
      break;
  }
}

main().catch((error) => {
  fail(error.stack || error.message);
});
