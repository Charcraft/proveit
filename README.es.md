# ProveIt

**Haz que tu agente de IA demuestre sus límites en vez de inventarlos.**

[![CI](https://github.com/Charcraft/proveit/actions/workflows/ci.yml/badge.svg)](https://github.com/Charcraft/proveit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

ProveIt es un kit de **atestación de capacidades** para agentes de código. Ejecuta una batería de
comprobaciones no destructivas, genera un contrato que puedes poner en `AGENTS.md` y rechaza
frases que afirman un sandbox, falta de acceso o ausencia de herramientas cuando no citan evidencia
real.

```text
$ npx github:Charcraft/proveit probe --browser
OK       shell              Execute a local process
OK       filesystem.temp    Read and write files in temp
OK       network.https      Make outbound HTTPS requests
UNKNOWN  browser.cdp        no CDP endpoint on 9222, 9333
```

> Documentación principal en inglés: [`README.md`](README.md)

---

## El problema

Los agentes modernos corren en tu máquina. Tienen shell, filesystem y herramientas MCP. Aun así
afirman límites que nunca probaron:

<!-- proveit-ignore -->
> "Estoy en un sandbox aislado."
>
<!-- proveit-ignore -->
> "No tengo acceso a tu computadora."
>
<!-- proveit-ignore -->
> "No existe una herramienta SSH en este entorno."

En una sesión real, un agente ejecutó `tasklist`, `netstat` y `node` con éxito, escribió archivos en
disco y tres llamadas después dijo que no podía acceder a la PC. No era un problema de permisos ni
una negativa de seguridad: era **confabulación de capacidades**. El modelo pierde el rastro de lo que
sus propias herramientas ya demostraron.

El costo es concreto:

- Te pide ejecutar comandos que él mismo podía ejecutar.
- El trabajo se detiene o vuelve a tus manos.
- No puedes distinguir un límite real de uno inventado.
- En sesiones largas, una frase falsa se convierte en la premisa de las siguientes veinte.

ProveIt no hace que un modelo sea honesto. Hace que las afirmaciones sin verificar sean **visibles,
comprobables y bloqueables en CI**.

Taxonomía completa en [`docs/FAILURE-MODES.md`](docs/FAILURE-MODES.md).

---

## Qué hace

| Comando | Propósito |
| --- | --- |
| `proveit probe` | Ejecuta la matriz de comprobaciones y emite evidencia (Markdown + JSON). |
| `proveit claims <archivo>` | Detecta afirmaciones de límite sin evidencia. Sale con código 1. |
| `proveit prompt --write AGENTS.md` | Instala el contrato de capacidades en las instrucciones del agente. |

Todo es local, sin dependencias y con Node 18+.

## Inicio rápido

```bash
# 1. Inspecciona el entorno
npx github:Charcraft/proveit probe --save --browser

# 2. Instala el contrato en las instrucciones de tu agente
npx github:Charcraft/proveit prompt --write AGENTS.md

# 3. Filtra una respuesta o un transcript
npx github:Charcraft/proveit claims response.md
```

Desde el código fuente:

```bash
git clone https://github.com/Charcraft/proveit.git
cd proveit
node bin/proveit.mjs probe --save
npm test
```

## El contrato

`proveit prompt` convierte el informe en un bloque que puedes versionar:

```markdown
<!-- proveit:begin -->
## Capability contract

| Check | Status | Evidence |
| --- | --- | --- |
| `shell` | **ok** | node.exe -e ... -> proveit-shell-ok (exit 0) |
| `browser.cdp` | **unknown** | no CDP endpoint on 9222, 9333 |

Rules for the agent:

1. Nunca afirmes un límite que contradiga esta tabla.
2. Antes de afirmar una limitación, pruébala y cita `[proveit:<id>=<status>]`.
3. Si el estado es `blocked` o `unknown`, muestra el error exacto.
4. Vuelve a ejecutar `proveit probe` cuando cambie el entorno.
<!-- proveit:end -->
```

`--write` es idempotente: reemplaza el bloque entre marcadores y conserva el resto del archivo.

## El filtro de afirmaciones

```text
$ proveit claims examples/bad-agent-response.md

bad-agent-response.md: 4 unverified capability claim(s)
  bad-agent-response.md:5  [en-sandbox]
    "I am in an isolated sandbox, so I cannot access your machine."
    Test it, then cite [proveit:runtime=ok] or show the real error.
  bad-agent-response.md:9  [en-access]
    "I also do not have access to your filesystem, so please run this yourself:"
    Test it, then cite [proveit:filesystem.cwd=ok] or show the real error.
```

El escáner lee prosa, ignora bloques de código y acepta una afirmación cuando cita evidencia:

```markdown
No puedo alcanzar el registro interno. Evidence: [proveit:network.https=blocked]
```

Úsalo en CI, en un hook de pre-commit o como paso final de tu agente:

```bash
proveit claims transcript.md || exit 1
```

Es heurístico a propósito: un detector barato y explicable, no un juez. Los falsos positivos se
silencian con `<!-- proveit-ignore -->` en la línea anterior.

## Integraciones

### OpenCode

```bash
mkdir -p ~/.config/opencode/skills/proveit
cp skills/proveit/SKILL.md ~/.config/opencode/skills/proveit/SKILL.md
npx github:Charcraft/proveit prompt --write AGENTS.md
```

### Claude Code

```bash
mkdir -p .claude/skills/proveit
cp skills/proveit/SKILL.md .claude/skills/proveit/SKILL.md
npx github:Charcraft/proveit prompt --write CLAUDE.md
```

### Cursor

```bash
mkdir -p .cursor/rules
npx github:Charcraft/proveit prompt --write .cursor/rules/proveit.mdc
```

### Cualquier agente

Pon el contrato en el system prompt o en las instrucciones del repositorio. La regla que importa:

> No afirmes que no puedes hacer algo hasta haberlo intentado y poder citar el error.

Más detalle en [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).

## Comprobaciones

| Check | Qué demuestra | ¿Destructivo? |
| --- | --- | --- |
| `runtime` | SO, arquitectura, Node, cwd, usuario, marcadores de contenedor | No |
| `shell` | Se puede lanzar un proceso hijo y leer su salida | No |
| `filesystem.temp` | Escribir, leer y borrar un archivo temporal | Solo el temporal |
| `filesystem.cwd` | Se puede listar el directorio de trabajo | No |
| `network.dns` | Resolución DNS | No |
| `network.https` | HTTPS saliente responde | No |
| `binaries` | Qué herramientas CLI existen (`git`, `ssh`, `ffmpeg`, ...) | No |
| `git` | Repo, rama y origin sanitizado | No |
| `browser.cdp` | Endpoints de Chrome DevTools en 9222/9223/9333/9334 | No, opt-in |

`--offline` omite DNS y HTTPS. `--browser` activa la comprobación CDP.

## Seguridad y privacidad

- No lee credenciales. No imprime valores de variables de entorno.
- Nunca accede a llaves SSH, cookies ni tokens.
- Sanitiza URLs con credenciales embebidas.
- Las comprobaciones de red son DNS y `HEAD`; no sube nada.
- El único archivo que escribe fuera del informe es un temporal que borra al instante.
- Los informes contienen rutas y nombres de usuario: revísalos antes de commitearlos.

## Principios de diseño

1. **Evidencia antes que autoinforme.** Lo que una herramienta dice de sí misma es dato, no verdad.
2. **Prueba lo mínimo.** Lanza un proceso, escribe un temporal. No simules una carga de trabajo.
3. **Tres estados, no dos.** `blocked` es un hecho; `unknown` es ausencia de evidencia. Confundirlos
   es cómo un agente convierte "no lo probé" en "no puedo".
4. **Local y sin dependencias.** Un árbol de Node, sin telemetría, sin servicio.
5. **Filtra la salida, no el modelo.** No puedes parchear los pesos del proveedor desde un repo, pero
   sí puedes rechazar una frase sin evidencia.

## Limitaciones

- El escáner es de patrones y soporta inglés y español. Agrega reglas para tu idioma.
- Un informe describe el momento en que se ejecutó. El entorno cambia: vuelve a probar.
- `ok` en `shell` no significa que todo comando esté permitido, sino que la capacidad existe.
- ProveIt no detecta a un modelo que miente sin usar las frases típicas.
- En máquinas gestionadas, el software de seguridad puede bloquear la creación de procesos. Eso es un
  `blocked` real y el informe muestra el error.

## Contribuir

Se aceptan issues y PRs, sobre todo:

- Patrones de afirmaciones en otros idiomas.
- Nuevas comprobaciones no destructivas.
- Integraciones con frameworks de agentes.

Ejecuta `npm test` antes de abrir un PR. Ver [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licencia

MIT © 2026 Carlos Martinez Pineda ([Charcraft](https://github.com/Charcraft))
