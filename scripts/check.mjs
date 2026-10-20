import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const npm = process.env.npm_execpath || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/verification.txt', `TN - DO verification · ${new Date().toISOString()}\nNode ${process.version}\n`);
for (const script of ['typecheck', 'lint', 'test', 'test:db', 'test:import', 'test:browser', 'build']) {
  const result = spawnSync(process.execPath, [npm, 'run', script], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output); appendFileSync('artifacts/verification.txt', `\n[${script}] exit=${result.status}\n${output}`);
  if (result.status !== 0) { process.exitCode = 1; break; }
}
