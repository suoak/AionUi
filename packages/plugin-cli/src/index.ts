import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync, watch as fsWatch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const TEMPLATES = join(PKG_ROOT, 'templates');

export type CliResult = number;

function printHelp(): void {
  process.stdout.write(`workmate-plugin-cli — CSBU WorkMate plugin tooling

Usage:
  workmate-plugin-cli init <name> [--dir <path>]
  workmate-plugin-cli check [dir]
  workmate-plugin-cli pack [dir] [--out <file>]
  workmate-plugin-cli watch [dir]

Commands:
  init   Scaffold a plugin with aion-extension.json + AGENTS.md
  check  Validate aion-extension.json (required fields + agentTools.planSafeActions)
  pack   Zip the extension directory to a .wmx archive
  watch  Re-run check on file changes (hot-reload helper)

v1 is curated-install only. Brand: CSBU WorkMate.
`);
}

function toDisplayName(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderTemplate(raw: string, vars: Record<string, string>): string {
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function copyTemplateDir(src: string, dest: string, vars: Record<string, string>): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const from = join(src, entry);
    const to = join(dest, entry);
    const st = statSync(from);
    if (st.isDirectory()) {
      copyTemplateDir(from, to, vars);
    } else {
      const body = renderTemplate(readFileSync(from, 'utf8'), vars);
      writeFileSync(to, body);
    }
  }
}

export function cmdInit(name: string, dir?: string): CliResult {
  if (!name || !/^[a-z0-9][a-z0-9-_]*$/i.test(name)) {
    process.stderr.write('error: init requires a name like my-plugin\n');
    return 1;
  }
  const target = resolve(dir ?? join(process.cwd(), name));
  if (existsSync(join(target, 'aion-extension.json'))) {
    process.stderr.write(`error: ${target} already has aion-extension.json\n`);
    return 1;
  }
  const vars = {
    name,
    displayName: toDisplayName(name),
    description: `${toDisplayName(name)} — CSBU WorkMate plugin`,
  };
  copyTemplateDir(join(TEMPLATES, 'basic'), target, vars);
  process.stdout.write(`Created CSBU WorkMate plugin scaffold at ${target}\n`);
  return 0;
}

type Manifest = {
  name?: unknown;
  version?: unknown;
  contributes?: {
    agentTools?: Array<Record<string, unknown>>;
    agent_tools?: Array<Record<string, unknown>>;
  };
};

export function validateManifest(manifest: Manifest): string[] {
  const errors: string[] = [];
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    errors.push('name is required');
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    errors.push('version is required');
  }
  const tools = manifest.contributes?.agentTools ?? manifest.contributes?.agent_tools ?? [];
  for (const [i, tool] of tools.entries()) {
    const has =
      Object.prototype.hasOwnProperty.call(tool, 'planSafeActions') ||
      Object.prototype.hasOwnProperty.call(tool, 'plan_safe_actions');
    if (!has) {
      errors.push(`contributes.agentTools[${i}] must set planSafeActions (boolean)`);
    }
    if (typeof tool.id !== 'string' || !tool.id) {
      errors.push(`contributes.agentTools[${i}].id is required`);
    }
    if (typeof tool.name !== 'string' || !tool.name) {
      errors.push(`contributes.agentTools[${i}].name is required`);
    }
  }
  return errors;
}

export function cmdCheck(dir?: string): CliResult {
  const root = resolve(dir ?? process.cwd());
  const manifestPath = join(root, 'aion-extension.json');
  if (!existsSync(manifestPath)) {
    process.stderr.write(`error: no aion-extension.json in ${root}\n`);
    return 1;
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  } catch (err) {
    process.stderr.write(`error: invalid JSON: ${(err as Error).message}\n`);
    return 1;
  }
  const errors = validateManifest(manifest);
  if (errors.length) {
    for (const e of errors) process.stderr.write(`error: ${e}\n`);
    return 1;
  }
  process.stdout.write(`OK ${manifest.name}@${manifest.version}\n`);
  return 0;
}

function listFilesRecursive(root: string, base = root): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === '.git' || entry.endsWith('.wmx')) continue;
    const full = join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFilesRecursive(full, base));
    else out.push(full.slice(base.length + 1));
  }
  return out;
}

export function cmdPack(dir?: string, outFile?: string): CliResult {
  const root = resolve(dir ?? process.cwd());
  if (cmdCheck(root) !== 0) return 1;
  const manifest = JSON.parse(readFileSync(join(root, 'aion-extension.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  const out = resolve(outFile ?? join(root, `${manifest.name}-${manifest.version}.wmx`));
  const files = listFilesRecursive(root);
  // Build a real zip via Python's zipfile (no native zip binary required on CI images).
  const py = `
import zipfile, sys
root, out = sys.argv[1], sys.argv[2]
files = sys.argv[3:]
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for rel in files:
        zf.write(f"{root}/{rel}", arcname=rel)
`;
  const result = spawnSync('python3', ['-c', py, root, out, ...files], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(`error: pack failed: ${result.stderr || result.error?.message || 'unknown'}\n`);
    return 1;
  }
  process.stdout.write(`Packed ${out}\n`);
  return 0;
}

export function cmdWatch(dir?: string): CliResult {
  const root = resolve(dir ?? process.cwd());
  process.stdout.write(`watching ${root} (Ctrl+C to stop)\n`);
  cmdCheck(root);
  let timer: NodeJS.Timeout | undefined;
  const rerun = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      process.stdout.write(`[watch] recheck…\n`);
      cmdCheck(root);
    }, 200);
  };
  try {
    fsWatch(root, { recursive: true }, rerun);
  } catch {
    fsWatch(root, rerun);
  }
  return 0; // keeps process alive via watch handles — caller should not exit in watch mode from bin
}

export async function runCli(argv: string[]): Promise<CliResult> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help') {
    printHelp();
    return 0;
  }
  switch (cmd) {
    case 'init': {
      let name = '';
      let dir: string | undefined;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--dir') {
          dir = rest[++i];
        } else if (!name) {
          name = rest[i] ?? '';
        }
      }
      return cmdInit(name, dir);
    }
    case 'check':
      return cmdCheck(rest[0]);
    case 'pack': {
      let dir: string | undefined;
      let out: string | undefined;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--out') out = rest[++i];
        else if (!dir) dir = rest[i];
      }
      return cmdPack(dir, out);
    }
    case 'watch': {
      // watch is long-running; return after scheduling
      const code = cmdWatch(rest[0]);
      // Keep event loop alive
      await new Promise(() => {});
      return code;
    }
    default:
      process.stderr.write(`error: unknown command ${cmd}\n`);
      printHelp();
      return 1;
  }
}
