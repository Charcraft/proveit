# Contributing

Thanks for helping make agent limitations testable.

## Setup

```bash
git clone https://github.com/Charcraft/proveit.git
cd proveit
node --version   # 18 or newer
npm test
```

There are no dependencies to install.

## What to contribute

Good first issues:

- Claim patterns for a new language (Portuguese, French, German, Italian).
- A new non-destructive check with a clear capability and evidence format.
- An integration guide for an agent framework.
- Documentation improvements, especially real transcripts that show the failure mode.

## Adding a claim rule

Rules live in `src/claims.mjs`:

```js
{
  id: 'fr-sandbox',
  description: 'Affirme etre dans un sandbox',
  check: 'runtime',
  pattern: /\bje suis\s+(?:dans|en)\s+(?:un|une)?\s*sandbox\b/i,
}
```

Requirements:

- The rule must target a **capability** claim, not a policy refusal.
- It must include a `check` id that exists in the probe.
- Add a test to `test/claims.test.mjs`.
- Keep the regex readable. Prefer several narrow rules over one clever one.

## Adding a check

Edit `src/checks.mjs` and register it in `src/probe.mjs`.

Requirements:

- Non-destructive, or clean up after itself.
- Never throw. Catch errors and return `blocked` with the first error line.
- Respect the timeout.
- Do not read secrets, tokens, cookies, or private keys.
- Evidence must be one line and specific enough to challenge.

## Tests

```bash
npm test
```

The suite uses the built-in `node:test` runner and must pass on Windows, macOS, and Linux. If your
check needs the network, make it skippable with `--offline`.

## Style

- ESM, no dependencies.
- Two-space indentation, single quotes, semicolons.
- Comments explain *why*, not *what*.
- Keep functions small and side effects visible.

## Commits and PRs

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- One logical change per PR.
- Describe the failure mode the change addresses.
- Include the output of `npm test` in the PR body.

## Code of conduct

Be direct about code and generous about people. Harassment or personal attacks are not welcome.
