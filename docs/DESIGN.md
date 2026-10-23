# Design

## Goal

Make an agent's capability claims falsifiable with the smallest possible amount of machinery.

ProveIt has three parts:

1. **Probe** — a matrix of non-destructive checks that produce evidence.
2. **Contract** — a generated block that tells the model what is true right now.
3. **Claim gate** — a text scanner that rejects limitation claims without evidence.

The tool deliberately does not try to model intent, score honesty, or grade a response. Those are
open problems. "Did you run the command?" is not.

---

## Result schema

```json
{
  "tool": "proveit",
  "version": "1.0.0",
  "generatedAt": "2026-10-23T15:46:40.260Z",
  "durationMs": 1208,
  "cwd": "C:/Users/you/project",
  "platform": {
    "os": "win32",
    "arch": "x64",
    "release": "node",
    "node": "v24.18.0"
  },
  "summary": { "ok": 7, "blocked": 0, "unknown": 2 },
  "checks": [
    {
      "id": "shell",
      "label": "Execute a local process",
      "status": "ok",
      "evidence": "node.exe -e ... -> proveit-shell-ok (exit 0)",
      "detail": { "command": "node.exe -e <inline>", "exit": 0 }
    }
  ]
}
```

### Status semantics

| Status | Meaning | What the agent may say |
| --- | --- | --- |
| `ok` | A real command succeeded. | "I can." |
| `blocked` | A real command failed; the error is in `evidence`. | "I cannot, here is the error." |
| `unknown` | Not tested, or the test is inconclusive. | "Not verified." |

The distinction between `blocked` and `unknown` is the core of the design. Most confabulation
happens when an untested capability is silently promoted to `blocked`.

---

## Check contract

Every check must:

- Be non-destructive or clean up after itself.
- Never throw; catch and convert to `blocked` with the first line of the error.
- Finish within the configured timeout.
- Avoid reading secrets, tokens, cookies, or private keys.
- Produce a one-line human-readable `evidence` string.

Checks are plain functions in `src/checks.mjs` and are intentionally easy to fork.

### Adding a check

```js
export function checkDocker(timeout) {
  const result = exec('docker', ['version', '--format', '{{.Server.Version}}'], timeout);
  const ok = result.status === 0;
  return makeCheck(
    'docker',
    'Talk to the Docker daemon',
    ok ? 'ok' : 'blocked',
    ok ? `server ${String(result.stdout).trim()}` : `failed: ${errorText(result)}`,
  );
}
```

Then register it in `runProbe`.

---

## Claim gate

`scanText` is line-oriented:

1. Skip fenced code blocks.
2. Skip lines with `<!-- proveit-ignore -->` (same or previous line).
3. Match a rule.
4. If no `[proveit:<id>=<status>]` marker exists within two lines, report a finding.

Rules are regexes with a `check` hint used in the suggestion text. The list lives in
`src/claims.mjs` and is designed to be extended.

### Why not an LLM judge?

- Non-deterministic, slow, and expensive in CI.
- A second model can share the first model's blind spot.
- The task is narrow: find a sentence, look for a marker. Regex is enough.

The gate is a tripwire. It should be cheap, explainable, and easy to bypass deliberately with an
ignore comment.

---

## Security model

ProveIt runs on the user's machine, often in repositories with secrets. Therefore:

- No environment variable values are read for the report. Only names of container markers.
- No file outside the temp directory is read for evidence.
- No cookies, browser profiles, SSH keys, or credential stores are touched.
- `git remote get-url` is sanitized to remove embedded credentials.
- Network checks use DNS and `HEAD` requests only.
- The probe does not accept arbitrary commands from the model. It has a fixed check set.

If you add a check, preserve these properties. A capability tool that exfiltrates is worse than
the failure it fixes.

---

## Non-goals

- Sandboxing or permission enforcement.
- Detecting deception in arbitrary text.
- Replacing a model's tool schema.
- Benchmarking model quality.

---

## Roadmap

- More languages in the claim scanner (Portuguese, French, German).
- `proveit probe --check shell,network.https` for targeted re-checks.
- JSON Schema for `proveit.json`.
- GitHub Action wrapper with annotations.
- Optional check for Windows named pipes / Unix sockets.
- Report diffing: `proveit diff old.json new.json`.

---

## Versioning

The JSON schema is the public contract. Additive fields are minor versions. Removing or renaming a
check id or status is a major version.
