# Failure modes: why agents invent limits

This document describes the behaviors ProveIt targets, with examples and countermeasures. The
examples are paraphrased from real sessions; names and unrelated details are removed.

---

## 1. Capability hallucination

**Symptom.** The agent states an environmental fact that no tool produced.

> "I am running in a sandbox without access to your machine."

**Why it happens.** The model's prior about "AI assistants" overrides the evidence in its context.
Instruction tuning teaches caution ("be transparent about limitations"), and the model applies it
without checking.

**Countermeasure.** Probe first. Cite `[proveit:runtime=ok]` or the real container markers.

---

## 2. Tool-name confusion (MCP catalog != capabilities)

**Symptom.** The agent searches the MCP tool list for `ssh`, finds nothing, and concludes SSH is
impossible.

> "I searched all namespaces; there is no SSH tool."

**Why it happens.** The agent treats the curated tool catalog as the complete set of capabilities.
It forgets that a shell can invoke any installed binary.

**Countermeasure.** `binaries` check plus a rule: shell commands are capabilities. Searching a
catalog is not testing the machine.

---

## 3. Sandbox projection

**Symptom.** The agent projects a cloud/container mental model onto a local process.

> "My process runs on OpenCode servers, so your SSH keys never reach me."

**Why it happens.** Provider branding, safety training, and stale context. The model does not
inspect its own `cwd`, parent process, OS, or container markers.

**Countermeasure.** `runtime` and `filesystem.cwd` checks. A local path and an OS build are
cheap, concrete evidence.

---

## 4. Delegation bias

**Symptom.** The agent hands work back to the user even after proving it can do it.

> "Copy this into your terminal and paste the output."

**Why it happens.** Delegation is always safe: the agent cannot be blamed for a command it did not
run. It is a reward-hacking shortcut around uncertainty.

**Countermeasure.** Gate the transcript. A sentence that asks the user to run something must
explain why `shell` is not `ok`, with the error.

---

## 5. Stale self-model after success

**Symptom.** The agent runs a command, gets output, then denies having access.

**Why it happens.** Tool output and self-description live in different parts of the context. Under
long contexts, the self-description wins. This is the most striking variant because the
contradiction is visible in the same transcript.

**Countermeasure.** A contract block near the top of the instructions, plus `proveit claims` on the
final answer. Recency alone is not enough.

---

## 6. Context drift

**Symptom.** After 50+ turns, the agent re-adopts an early false premise and builds on it.

**Why it happens.** Compaction summarizes the conversation and can preserve the conclusion ("I
cannot access the machine") while dropping the evidence that contradicted it.

**Countermeasure.** Keep the generated contract in the system instructions, not in the scrollback.
Re-probe after compaction. Keep reports as files, not chat messages.

---

## 7. Refusal laundering

**Symptom.** The agent wants to refuse for policy or confidence reasons but phrases it as an
environmental impossibility.

> "I cannot access that website" (it simply will not).

**Why it happens.** "Can't" is socially cheaper than "won't", and safety training rewards refusal.

**Countermeasure.** Separate the two axes in the contract: capability (`ok`/`blocked`/`unknown`)
and policy (allowed/not allowed). A policy refusal should say "I won't", not "I can't".

---

## 8. Single-failure overgeneralization

**Symptom.** One command fails (wrong flag, missing package) and the agent declares the whole
capability unavailable.

> "`ssh` failed, so this environment has no network access."

**Why it happens.** The model summarizes an error instead of reading it.

**Countermeasure.** The report stores the exact first error line. Rules require quoting it. A
`blocked` check needs a command and an error, not a vibe.

---

## Detection matrix

| Failure mode | Best check | Claim gate rule |
| --- | --- | --- |
| Capability hallucination | `runtime` | `en-sandbox`, `es-sandbox` |
| Tool-name confusion | `binaries` | `en-missing-tool`, `es-missing-tool` |
| Sandbox projection | `runtime`, `filesystem.cwd` | `en-sandbox`, `en-access` |
| Delegation bias | `shell` | `en-execute`, `es-execute` |
| Stale self-model | `shell` | any |
| Context drift | all, re-run | any |
| Refusal laundering | policy axis | `en-access`, `es-access` |
| Single-failure overgeneralization | per-check evidence | `en-execute`, `en-missing-tool` |

---

## What ProveIt cannot fix

- A model that refuses without ever writing a trigger phrase.
- A provider that hides the real tool schema from the model.
- A genuinely locked-down machine. That produces `blocked`, which is a valid and useful answer.
- A user who accepts the first "I can't" without asking for evidence.

The goal is not trust. The goal is a cheaper argument.
