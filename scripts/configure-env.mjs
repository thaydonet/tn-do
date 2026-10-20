import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
const example = parseEnv(await readFile('.env.example', 'utf8'));
const allowed = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_OPENCV_URL'];
const url = example.VITE_SUPABASE_URL?.trim(), key = example.VITE_SUPABASE_ANON_KEY?.trim();
if (!url || !key) throw new Error('Fill the Supabase URL and public key in .env.example first.');
if (key.startsWith('sb_secret_')) throw new Error('Secret Supabase keys cannot be used in the browser.');
if (key.split('.').length === 3) {
  const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  if (payload.role !== 'anon') throw new Error('Only an anon/publishable key may be used in VITE_SUPABASE_ANON_KEY.');
}
const endpoint = new URL(url);
if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) throw new Error('Supabase must use HTTPS.');
let active = {};
try { active = parseEnv(await readFile('.env', 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const combined = { ...active, ...Object.fromEntries(allowed.filter(k => example[k]).map(k => [k, example[k]])) };
await writeFile('.env', Object.entries(combined).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n');
await writeFile('.env.example', '# Copy to .env and fill project values. Never put service-role keys in VITE_* variables.\nVITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\nVITE_OPENCV_URL=/vendor/opencv-4.11.0.js\n# Optional, for an expendable local PostgreSQL test database only.\nTEST_DATABASE_URL=\n');
console.log('Supabase public configuration installed in ignored .env. Example restored to placeholders. No credentials printed.');
