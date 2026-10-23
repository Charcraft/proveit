# Integrations

ProveIt is agent-agnostic. The pattern is always the same:

1. Probe the environment.
2. Put the contract where the model reads instructions.
3. Gate the output.

---

## OpenCode

OpenCode loads skills from the configured skills directory and instructions from `AGENTS.md`.

```bash
mkdir -p ~/.config/opencode/skills/proveit
cp skills/proveit/SKILL.md ~/.config/opencode/skills/proveit/SKILL.md
npx proveit prompt --write AGENTS.md
```

If you prefer a project-local install, use `.opencode/skills/proveit/SKILL.md` and commit it.

Add to `opencode.json` if you keep instructions outside `AGENTS.md`:

```json
{
  "instructions": ["AGENTS.md"]
}
```

---

## Claude Code

```bash
mkdir -p .claude/skills/proveit
cp skills/proveit/SKILL.md .claude/skills/proveit/SKILL.md
npx proveit prompt --write CLAUDE.md
```

Claude Code reads `CLAUDE.md` as project memory and skills from `.claude/skills/`.

---

## Cursor

Cursor uses project rules in `.cursor/rules/*.mdc`.

```bash
mkdir -p .cursor/rules
npx proveit prompt --write .cursor/rules/proveit.mdc
```

Add frontmatter if your Cursor version requires it:

```markdown
---
description: Capability contract and evidence rules
alwaysApply: true
---
```

---

## Codex and other CLI agents

Most agents accept a repository instruction file. Generate the contract and append it:

```bash
npx proveit prompt --write AGENTS.md
```

If the agent only accepts a system prompt, print the block and paste it:

```bash
npx proveit prompt
```

---

## CI

Fail a pull request when an agent-generated document contains an unverified limitation:

```yaml
- name: Gate agent claims
  run: npx proveit claims docs/agent-output.md
```

Run the probe on the runner to prove what CI can do:

```yaml
- name: Capability attestation
  run: npx proveit probe --save --offline
- uses: actions/upload-artifact@v4
  with:
    name: proveit-report
    path: |
      PROVEIT.md
      proveit.json
```

CI containers often block process spawning or network access. That is exactly the case where a
real `blocked` result is more useful than a model's guess.

---

## MCP servers

ProveIt does not call MCP servers. It records which capabilities are available through the shell
and the filesystem. If an MCP tool is the only path to a capability, add a check for it and record
the server name and tool name in `evidence`.

Example custom check shape:

```js
{
  id: 'mcp.github',
  label: 'GitHub MCP responds',
  status: 'ok',
  evidence: 'tools.github.get_me -> Charcraft',
  detail: { server: 'github', tool: 'get_me' }
}
```

---

## Pre-commit hook

```bash
#!/usr/bin/env sh
# .git/hooks/pre-commit
npx proveit claims docs/*.md || exit 1
```

Make it executable with `chmod +x .git/hooks/pre-commit`.

---

## Agent framework integration

If you build an agent, run the probe at session start and inject the contract into the system
prompt. Then run the claim scanner on the final message before returning it. Two calls, no
dependencies:

```js
import { runProbe } from 'proveit/src/probe.mjs';
import { renderContract } from 'proveit/src/report.mjs';
import { scanText } from 'proveit/src/claims.mjs';

const contract = renderContract(await runProbe({ offline: false }));
const systemPrompt = `${basePrompt}\n\n${contract}`;

// before returning the answer
const findings = scanText(answer);
if (findings.length > 0) {
  // retry with the findings, or surface them to the user
}
```

The package is ESM and has no runtime dependencies.
