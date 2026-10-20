import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = await createServer({ server: { host: '127.0.0.1', port: 4176, strictPort: true, watch: null, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:4176');
  await page.getByRole('heading', { name: 'Chào mừng trở lại' }).waitFor();
  assert.match(await page.title(), /TN - DO/); assert.ok(await page.getByLabel('Email', { exact: true }).isVisible());
  assert.equal(await page.getByRole('heading', { name: 'Tổng quan', exact: true }).count(), 0);
  for (const path of ['/about.html', '/forms/TNDO-A20.pdf', '/forms/TNDO-A40.svg', '/forms/TNDO-3P-2026.pdf', '/forms/TNDO-3P-2026.png', '/vendor/opencv-4.11.0.js']) assert.equal((await page.request.get(`http://127.0.0.1:4176${path}`)).status(), 200);
  assert.deepEqual(errors, []); await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/tn-do-cloud-login.png' });
  await writeFile('artifacts/cloud-ui-check.json', JSON.stringify({ checked_at: new Date().toISOString(), cloud_login_rendered: true, branding: 'TN - DO', printable_forms_reachable: true, errors }, null, 2));
  console.log('PASS actual .env activates Supabase login; TN - DO branding and A4 forms are served. No account created or emails sent.');
} finally { await browser.close(); await server.close(); }
