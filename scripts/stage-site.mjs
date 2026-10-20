import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd(), target = resolve(root, '.deploy', 'tn-do');
await mkdir(target, { recursive: true });
for (const name of ['src', 'scripts', 'docs', 'supabase', 'tests', 'public', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'eslint.config.js', 'README.md', '.env.example', '.gitignore', '.openai']) {
  await cp(resolve(root, name), resolve(target, name), { recursive: true, filter: source => !source.includes(`${resolve(root, 'public', 'vendor')}`) });
}
// Build-only browser configuration; excluded from the source repository by .gitignore.
await writeFile(resolve(target, '.env.local'), await readFile(resolve(root, '.env')));
console.log(`Prepared source checkout: ${target}. Public build configuration remains untracked.`);
