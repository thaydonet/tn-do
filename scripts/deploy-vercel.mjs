import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const npm = process.env.npm_execpath || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const args = new Set(process.argv.slice(2));
for (const arg of args) if (!['--login', '--check', '--preview'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
const target = args.has('--preview') ? 'preview' : 'production';
const scope = process.env.VERCEL_SCOPE ? ['--scope', process.env.VERCEL_SCOPE] : [];
function vercel(command, input) {
  const result = spawnSync(process.execPath, [npm, 'exec', '--yes', '--cache', '.npm-cache', '--package=vercel@54.14.2', '--', 'vercel', ...command, ...scope], {
    env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' },
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    ...(input === undefined ? {} : { input }),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (args.has('--login')) {
  vercel(['login']);
} else {
  // Send only public browser settings, via stdin, rather than uploading .env.
  const local = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
  const settings = Object.fromEntries(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_OPENCV_URL'].map(name => [name, (process.env[name] ?? local[name] ?? '').trim()]));
  settings.VITE_OPENCV_URL ||= '/vendor/opencv-4.11.0.js';
  if (!settings.VITE_SUPABASE_URL || !settings.VITE_SUPABASE_ANON_KEY) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env before deploying.');
  if (new URL(settings.VITE_SUPABASE_URL).protocol !== 'https:') throw new Error('The deployed Supabase endpoint must use HTTPS.');
  const key = settings.VITE_SUPABASE_ANON_KEY;
  if (key.startsWith('sb_secret_')) throw new Error('Use a Supabase anon/publishable key for browser builds.');
  if (key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') throw new Error('Use a Supabase anon/publishable key for browser builds.');
  if (args.has('--check')) {
    console.log(`Vercel configuration ready for ${target}. Public variables validated: ${Object.keys(settings).join(', ')}. No values printed; no deployment created.`);
  } else {
    vercel(['whoami', '--non-interactive']);
    if (!existsSync('.vercel/project.json')) vercel(['link', '--yes', '--project', process.env.VERCEL_PROJECT_NAME || 'tn-do']);
    for (const [name, value] of Object.entries(settings)) vercel(['env', 'add', name, target, '--force', '--yes'], value);
    vercel(['deploy', '--yes', ...(target === 'production' ? ['--prod'] : [])]);
  }
}
