import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
const env = { ...parseEnv(await readFile('.env', 'utf8')), ...process.env };
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, ''), key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase public configuration is missing.');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const status = { checked_at: new Date().toISOString(), auth: null, database: null, rpc: [] };
const settings = await fetch(`${url}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(15000) });
const auth = await settings.json().catch(() => ({}));
status.auth = { http_status: settings.status, email_enabled: auth.external?.email ?? null };
const tables = await fetch(`${url}/rest/v1/answer_sheet_templates?select=id&limit=0`, { headers, signal: AbortSignal.timeout(15000) });
const data = await tables.json().catch(() => ({}));
status.database = { http_status: tables.status, code: data.code ?? null, schema_present: tables.ok || data.code === '42501' };
const probes = [
  ['my_organizations', {}],
  ['get_workspace', { p_org: '00000000-0000-4000-8000-000000000001' }],
  ['begin_submission', { p_org: '00000000-0000-4000-8000-000000000001', p_id: '00000000-0000-4000-8000-000000000002', p_exam: '00000000-0000-4000-8000-000000000003', p_version: 1, p_student: '00000000-0000-4000-8000-000000000004', p_code: '101' }],
  ['finalize_submission', { p_id: '00000000-0000-4000-8000-000000000002', p_marks: [] }],
  ['get_review_issues', { p_org: '00000000-0000-4000-8000-000000000001' }],
];
status.rpc = await Promise.all(probes.map(async ([name, args]) => {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  return { name, http_status: response.status, code: body.code ?? null, exists: body.code === '42501' || response.ok || body.code === 'P0001', anonymous_denied: response.status === 401 || response.status === 403 };
}));
await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/supabase-status.json', JSON.stringify(status, null, 2));
console.log(JSON.stringify(status, null, 2));
