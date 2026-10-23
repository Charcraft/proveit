/**
 * Claim scanner.
 *
 * AI agents often assert environment limits they never tested:
 *   "I am in a sandbox", "I don't have access to your machine",
 *   "there is no shell tool".
 *
 * The scanner finds those claims in prose. A claim is allowed only when the
 * surrounding lines cite a probe result such as [proveit:shell=ok]. That turns
 * an unverifiable self-report into an auditable statement.
 */

export const EVIDENCE_PATTERN = /\[proveit:[a-z0-9._-]+=(?:ok|blocked|unknown)\]/i;
export const IGNORE_PATTERN = /<!--\s*proveit-ignore\s*-->/i;

export const RULES = [
  {
    id: 'en-sandbox',
    description: 'Claims to be inside a sandbox or isolated remote environment',
    check: 'runtime',
    pattern:
      /\b(?:i am|i'm|we are|we're)\s+(?:in|inside|running in)\s+(?:a|an|the)?\s*(?:(?:isolated|remote|local|restricted|virtual)\s+)?(?:sandbox|container|isolated (?:environment|vm)|remote (?:server|environment))\b/i,
  },
  {
    id: 'en-access',
    description: 'Claims it cannot access the user machine, files or network',
    check: 'filesystem.cwd',
    pattern:
      /\b(?:i|we)\s+(?:(?:also|still|just|really|simply|honestly)\s+)?(?:do not|don't|did not|can't|cannot|am unable to|are unable to)\s+(?:have\s+|get\s+)?(?:access|reach|connect)\b/i,
  },
  {
    id: 'en-execute',
    description: 'Claims it cannot run commands, scripts or code',
    check: 'shell',
    pattern:
      /\b(?:i|we)\s+(?:(?:also|still|just|really|simply|honestly)\s+)?(?:can't|cannot|am unable to|are unable to|do not|don't)\s+(?:run|execute|invoke|read|write)\s+(?:commands?|shell|scripts?|code|files?|programs?)\b/i,
  },
  {
    id: 'en-missing-tool',
    description: 'Claims a tool does not exist without testing the shell',
    check: 'shell',
    pattern:
      /\b(?:there is|there's)\s+no\s+(?:ssh|shell|bash|terminal|browser|network|filesystem)\s+(?:tool|access|command)\b/i,
  },
  {
    id: 'en-as-an-ai',
    description: 'Uses "as an AI" to justify an environment limitation',
    check: 'runtime',
    pattern: /\bas an ai\b[^.\n]{0,80}\b(?:cannot|can't|don't have|do not have)\b/i,
  },
  {
    id: 'es-access',
    description: 'Afirma que no tiene acceso a la maquina, archivos o red',
    check: 'filesystem.cwd',
    pattern: /\b(?:no|sin)\s+(?:tengo|tenemos|tiene)\s+acceso\b/i,
  },
  {
    id: 'es-execute',
    description: 'Afirma que no puede ejecutar comandos, scripts o codigo',
    check: 'shell',
    pattern: /\bno\s+(?:puedo|podemos)\s+(?:ejecutar|correr|acceder|leer|escribir|conectar|usar)\b/i,
  },
  {
    id: 'es-sandbox',
    description: 'Afirma estar en un sandbox, contenedor o servidor remoto',
    check: 'runtime',
    pattern:
      /\b(?:estoy|estamos)\s+(?:en|dentro de)\s+(?:un|una|el)?\s*(?:sandbox|contenedor|entorno aislado|servidor remoto)\b/i,
  },
  {
    id: 'es-missing-tool',
    description: 'Afirma que no existe una herramienta sin probar el shell',
    check: 'shell',
    pattern:
      /\bno\s+(?:hay|existe)\s+(?:herramienta|comando|acceso)\s+(?:de\s+)?(?:ssh|shell|terminal|navegador|red)\b/i,
  },
];

function isFence(line) {
  return /^\s*(```|~~~)/.test(line);
}

/**
 * Scan a block of text and return every unverified capability claim.
 *
 * @param {string} text
 * @param {{ file?: string }} [options]
 * @returns {Array<{file: string, line: number, rule: string, claim: string, check: string, suggestion: string}>}
 */
export function scanText(text, options = {}) {
  const file = options.file ?? '<text>';
  const lines = String(text).split(/\r?\n/);
  const findings = [];
  let insideFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isFence(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    if (IGNORE_PATTERN.test(line)) continue;
    if (index > 0 && IGNORE_PATTERN.test(lines[index - 1])) continue;

    for (const rule of RULES) {
      if (!rule.pattern.test(line)) continue;

      const context = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3)).join('\n');
      if (EVIDENCE_PATTERN.test(context)) break;

      const claim = line.trim().replace(/\s+/g, ' ');
      findings.push({
        file,
        line: index + 1,
        rule: rule.id,
        claim: claim.length > 180 ? `${claim.slice(0, 177)}...` : claim,
        check: rule.check,
        suggestion: `Test it, then cite [proveit:${rule.check}=ok] or show the real error.`,
      });
      break;
    }
  }

  return findings;
}
