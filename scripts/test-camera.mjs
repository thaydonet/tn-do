import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Exercise the real live video, OpenCV, OMR, IndexedDB and continuous capture UI.
const server = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 4175, strictPort: true, watch: null, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run', '--disable-background-networking'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const countSaved = () => page.evaluate(async () => (await (await import('/src/lib/local-db.ts')).loadLocal()).submissions.length);
const show = (number, options = {}) => page.evaluate(({ number, options }) => window.cameraFixture.show(number, options), { number, options });
await mkdir('artifacts', { recursive: true });
try {
  await page.goto('http://127.0.0.1:4175');
  await page.getByRole('heading', { name: 'Tổng quan', exact: true }).waitFor();
  const examId = await page.evaluate(async () => {
    const { emptyWorkspace, saveLocal } = await import('/src/lib/local-db.ts');
    const template = await (await fetch('/fixtures/template-20.json')).json(), document = await (await fetch('/fixtures/answers-20.json')).json();
    template.active = true;
    const w = emptyWorkspace(), classId = crypto.randomUUID(), id = crypto.randomUUID();
    w.templates = w.templates.filter(t => t.id !== template.id); w.templates.push(template); w.classes.push({ id: classId, name: 'Camera 12A', year: '2026' });
    for (const number of ['000001', '000002', '000003', '000004']) w.students.push({ id: crypto.randomUUID(), class_id: classId, number, name: `Học sinh ${number}` });
    w.exams.push({ id, class_id: classId, template_id: template.id, template_version: template.version, version: 1, date: '2026-10-20', document });
    await saveLocal(w); return id;
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Tổng quan', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('navigation').first().getByRole('button', { name: 'Chấm phiếu', exact: true }).click();
  await page.locator('.scan-config select').selectOption(examId);
  await page.evaluate(async () => {
    const template = await (await fetch('/fixtures/template-20.json')).json();
    const image = new Image(); image.src = '/fixtures/sheet-20-clean.png'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = template.width; canvas.height = template.height;
    const ctx = canvas.getContext('2d'), tracks = [];
    const show = (number, { offset = 0, noCode = false, review = false } = {}) => {
      ctx.fillStyle = '#c5cbca'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!number) return;
      const sheet = document.createElement('canvas'); sheet.width = template.width; sheet.height = template.height;
      const c = sheet.getContext('2d'); c.drawImage(image, 0, 0);
      c.fillStyle = '#fff';
      const qr = template.qr_region; c.fillRect(qr.x * sheet.width, qr.y * sheet.height, qr.width * sheet.width, qr.height * sheet.height);
      for (const region of [template.student_region, template.code_region]) for (const column of region) for (const b of column) {
        c.beginPath(); c.arc(b.x * sheet.width, b.y * sheet.height, b.radius * sheet.width * 1.6, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#000';
      for (const [text, region] of [[number, template.student_region], [noCode ? '' : '101', template.code_region]]) [...text].forEach((digit, i) => {
        const b = region[i].find(b => b.label === digit); c.beginPath(); c.arc(b.x * sheet.width, b.y * sheet.height, b.radius * sheet.width, 0, Math.PI * 2); c.fill();
      });
      if (review) { const b = template.questions[0].bubbles[1]; c.beginPath(); c.arc(b.x * sheet.width, b.y * sheet.height, b.radius * sheet.width, 0, Math.PI * 2); c.fill(); }
      ctx.drawImage(sheet, (.07 + offset) * canvas.width, .07 * canvas.height, .86 * canvas.width, .86 * canvas.height);
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const stream = canvas.captureStream(12); tracks.push(...stream.getTracks()); return stream;
    } });
    const timer = setInterval(() => { ctx.drawImage(canvas, 0, 0); }, 70);
    window.cameraFixture = { show, tracks, timer };
    show('000001', { offset: .07 });
  });
  await page.getByRole('button', { name: 'Chụp bằng camera', exact: true }).click();
  const camera = page.getByRole('dialog', { name: 'Chụp phiếu tự động' });
  await camera.getByText('Đưa 4 ô đen trên phiếu vào đúng 4 ô vuông.', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await camera.locator('.live-camera-target').count(), 4);
  await page.waitForTimeout(1600); assert.equal(await countSaved(), 0);
  console.log('PASS misaligned paper never captures; four square guides appear on mobile');
  await show('000001');
  await camera.getByText('Đã lưu trong lượt này: 1', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await countSaved(), 1);
  await page.waitForTimeout(1800); assert.equal(await countSaved(), 1);
  assert.match(await camera.innerText(), /Đưa phiếu vừa chấm ra khỏi khung/);
  await page.screenshot({ path: 'artifacts/camera-mobile-saved.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const evidence = await page.evaluate(async () => {
    const { loadLocal, getImage } = await import('/src/lib/local-db.ts'), w = await loadLocal(), s = w.submissions[0];
    return { score: s.score, number: s.student_number, original: (await getImage(s.id, 'original'))?.size, processed: (await getImage(s.id, 'processed'))?.size };
  });
  assert.equal(evidence.score, 10); assert.equal(evidence.number, '000001'); assert.ok(evidence.original > 1000 && evidence.processed > 1000);
  console.log('PASS camera automatically captures, grades and saves full source + processed images; same paper is held without duplicates');
  await show(null); await page.waitForTimeout(1400); await show('000002');
  await camera.getByText('Đã lưu trong lượt này: 2', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await countSaved(), 2);
  console.log('PASS removing the first sheet automatically arms capture for the next student');
  await show(null); await page.waitForTimeout(1400); await show('000003', { noCode: true, review: true });
  await camera.waitFor({ state: 'hidden', timeout: 30000 });
  assert.equal(await countSaved(), 2);
  assert.equal(await page.evaluate(() => window.cameraFixture.tracks.every(track => track.readyState === 'ended')), true);
  await page.locator('.review-panel select').nth(1).selectOption('101');
  const first = page.locator('.recognition-row').first();
  await first.getByRole('button', { name: 'Câu 1, B', exact: true }).click();
  await first.getByRole('button', { name: 'Xác nhận câu 1', exact: true }).click();
  await page.getByLabel('Tôi đã đối chiếu học sinh').check();
  await page.getByRole('button', { name: 'Xác nhận & lưu kết quả', exact: true }).click();
  await camera.waitFor({ state: 'visible', timeout: 15000 });
  await camera.getByText('Đã lưu. Đưa phiếu vừa chấm ra khỏi khung để chấm phiếu tiếp theo.', { exact: true }).waitFor();
  assert.equal(await countSaved(), 3);
  await page.waitForTimeout(1800); assert.equal(await countSaved(), 3);
  console.log('PASS unclear marks/missing code pause for review, release camera, then resume after manual save without recapturing');
  await show(null); await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'images') { IDBObjectStore.prototype.put = put; throw new Error('Simulated interrupted save'); }
      return put.apply(this, args);
    };
  });
  await show('000004'); await camera.waitFor({ state: 'hidden', timeout: 30000 });
  assert.equal(await countSaved(), 3);
  assert.match(await page.getByRole('alert').innerText(), /Ảnh và kết quả đang được giữ trong bản chờ/);
  assert.equal(await page.evaluate(async () => (await (await import('/src/domain/submission-storage.ts')).pendingSubmissions('local', 'local')).length), 1);
  await page.getByRole('button', { name: 'Chụp lại', exact: true }).click();
  await camera.waitFor({ state: 'visible' }); await camera.waitFor({ state: 'hidden', timeout: 30000 });
  assert.match(await page.getByRole('alert').innerText(), /đã nằm trong bản chờ/);
  assert.equal(await page.evaluate(async () => (await (await import('/src/domain/submission-storage.ts')).pendingSubmissions('local', 'local')).length), 1);
  assert.deepEqual(await page.evaluate(async () => (await import('/src/domain/submission-storage.ts')).retryQueue('local', 'local')), []);
  assert.equal(await countSaved(), 4);
  console.log('PASS interrupted save keeps original/processed images in queue, stops camera, blocks duplicate pending capture and retries successfully');
  assert.equal(await page.evaluate(() => window.cameraFixture.tracks.every(track => track.readyState === 'ended')), true);
  await page.evaluate(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }));
  await page.getByRole('button', { name: 'Chụp lại', exact: true }).click();
  await camera.getByRole('alert').filter({ hasText: 'Chưa được cấp quyền camera' }).waitFor();
  assert.ok(await camera.getByRole('button', { name: 'Dùng camera hệ thống' }).isVisible());
  await page.getByRole('button', { name: 'Đóng camera', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS close stops all tracks; camera permission errors offer system-camera fallback; no browser exceptions');
} catch (e) {
  await page.screenshot({ path: 'artifacts/camera-failure.png', fullPage: true });
  console.error(e); console.error('Browser errors:', errors); process.exitCode = 1;
} finally { await context.close(); await browser.close(); await server.close(); }
