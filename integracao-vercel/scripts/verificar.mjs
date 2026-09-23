import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.js')).sort()
  .map(name => `tests/${name}`);
if (!tests.length) throw new Error('Publicação bloqueada: nenhum teste encontrado.');
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(['--test', '--test-concurrency=2', ...tests]);
if (process.argv.includes('--build')) {
  run(['node_modules/vite/bin/vite.js', 'build']);
}
