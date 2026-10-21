import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const functions = join(root, 'supabase/functions');
const entrypoints = readdirSync(functions, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(functions, entry.name, 'index.ts'))
  .filter(existsSync);
if (!entrypoints.length) throw new Error('No Edge Function entrypoints found.');
const deno = resolve(root, 'node_modules/deno', process.platform === 'win32' ? 'deno.exe' : 'deno');
const result = spawnSync(deno, [
  'check', '--config', join(functions, 'deno.check.json'), ...entrypoints,
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
