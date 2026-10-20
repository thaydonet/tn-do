import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
const server = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 4173, strictPort: true, watch: null, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run', '--disable-background-networking'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('artifacts', { recursive: true });
try {
  const response = await page.goto('http://127.0.0.1:4173'); assert.equal(response.status(), 200);
  await page.getByRole('heading', { name: 'Tổng quan', exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
  await page.getByRole('navigation').first().getByRole('button', { name: 'Lớp học', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo lớp học', exact: true }).click();
  await page.getByLabel('Tên lớp', { exact: true }).fill('12A1'); await page.getByRole('button', { name: 'Tạo lớp', exact: true }).click();
  await page.getByPlaceholder('000001, Nguyễn Minh Anh\n000002, Trần Hoàng Nam').fill('000001, Học sinh kiểm thử');
  await page.getByRole('button', { name: 'Xác nhận thêm', exact: true }).click(); await page.getByRole('cell', { name: 'Học sinh kiểm thử' }).waitFor();
  console.log('PASS UI creates class and student roster');
  await page.getByRole('navigation').first().getByRole('button', { name: 'Kỳ thi & đáp án', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo kỳ thi', exact: true }).first().click();
  assert.equal(await page.getByLabel('Lớp học (tùy chọn)').inputValue(), '');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const shortDocument = JSON.parse(await readFile('public/fixtures/answers-20.json', 'utf8'));
  shortDocument.answer_sheets.forEach(s => { s.sections[0].questions = s.sections[0].questions.slice(0, 10).map(q => ({ ...q, points: 1 })); });
  await page.getByRole('textbox', { name: 'JSON đáp án' }).fill(JSON.stringify(shortDocument));
  await page.getByRole('button', { name: 'Kiểm tra & áp dụng JSON' }).click();
  const template = JSON.parse(await readFile('public/fixtures/template-20.json', 'utf8'));
  await page.getByLabel('Mẫu phiếu / phiên bản').selectOption(`${template.id}:1`);
  await page.getByRole('button', { name: 'Lưu kỳ thi', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Chấm phiếu →' }).click();
  await page.getByLabel('Tôi chọn sử dụng mẫu thử nghiệm').check();
  const examId = await page.locator('.scan-config select').inputValue();
  const png = await readFile('public/fixtures/sheet-20-clean.png'), qr = await QRCode.toDataURL(JSON.stringify({ schema_version: '1.0', exam_id: examId, template_id: template.id, template_version: 1, student_number: '000001', exam_code: '101' }), { errorCorrectionLevel: 'M', margin: 4, scale: 4 });
  const combined = await page.evaluate(async ({ source, qr, region }) => {
    const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
    const image = await load(source), q = await load(qr), canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(region.x * canvas.width, region.y * canvas.height, region.width * canvas.width, region.height * canvas.height); ctx.drawImage(q, Math.round(region.x * canvas.width + (region.width * canvas.width - q.width) / 2), Math.round(region.y * canvas.height + (region.height * canvas.height - q.height) / 2)); return canvas.toDataURL('image/png').split(',')[1];
  }, { source: `data:image/png;base64,${png.toString('base64')}`, qr, region: template.qr_region });
  await page.locator('.analyzer input[type=file]').first().setInputFiles({ name: 'synthetic-valid-qr.png', mimeType: 'image/png', buffer: Buffer.from(combined, 'base64') });
  await page.getByText('Đã tìm thấy 4 mốc.', { exact: false }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: 'Căn chỉnh & nhận diện', exact: true }).click();
  await page.getByText('Đã kiểm tra QR thuộc kỳ thi.', { exact: false }).waitFor({ timeout: 25000 });
  const detectedStudent = await page.locator('.review-panel select').nth(0).inputValue(), detectedCode = await page.locator('.review-panel select').nth(1).inputValue(); assert.ok(detectedStudent); assert.equal(detectedCode, '101');
  assert.match(await page.locator('.score-preview').innerText(), /10/);
  assert.equal(await page.locator('.recognition-row').count(), 10);
  assert.match(await page.locator('.score-preview').innerText(), /10 đúng \/ 10 câu/);
  assert.match(await page.locator('.analyzer').innerText(), /Đã nhận diện 10 câu/);
  console.log('PASS class is optional; 10-question exam on 20-question sheet only reviews and scores questions 1–10');
  console.log('PASS real OpenCV perspective/OMR + ZXing QR + SBD and exam-code detection');
  await page.screenshot({ path: 'artifacts/scan-review-desktop.png', fullPage: true });
  await page.getByLabel('Tôi đã đối chiếu học sinh').check(); await page.getByRole('button', { name: 'Xác nhận & lưu kết quả' }).click();
  await page.getByText('Đã lưu ảnh và kết quả chấm', { exact: true }).waitFor();
  await page.getByRole('navigation').first().getByRole('button', { name: 'Kết quả & báo cáo', exact: true }).click();
  await page.getByRole('cell', { name: 'Học sinh kiểm thử 000001' }).waitFor();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'CSV', exact: true }).click(); assert.match((await download).suggestedFilename(), /\.csv$/);
  await page.getByRole('button', { name: 'Xem bài của Học sinh kiểm thử' }).click(); await page.getByRole('img', { name: 'Ảnh phiếu thi đã lưu' }).waitFor();
  assert.equal(await page.getByRole('img', { name: 'Ảnh phiếu thi đã lưu' }).evaluate(img => img.complete && img.naturalWidth > 0), true);
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  console.log('PASS UI confirms, persists image+score, opens evidence and exports CSV');
  await page.reload(); await page.getByRole('heading', { name: 'Tổng quan', exact: true }).waitFor(); assert.match(await page.locator('.stats-grid').innerText(), /Bài đã chấm\s*1/);
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1); await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole('button', { name: 'Mở menu' }).click(); await page.getByRole('navigation').first().getByRole('button', { name: 'Kết quả & báo cáo', exact: true }).click(); await page.getByRole('heading', { name: 'Kết quả & báo cáo', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS reload persistence, mobile navigation, no horizontal overflow or browser exceptions');
  // Exercise the other template and perspective fixtures through the actual browser OpenCV modules.
  const recognition = await page.evaluate(async () => {
    const { imageCanvas, detectAnchors, preprocess } = await import('/src/domain/image-preprocessor.ts');
    const { recognize, recognizeDigits } = await import('/src/domain/omr-engine.ts');
    const outputs = [];
    for (const count of [20, 40]) for (const variant of ['clean', 'perspective', 'review']) {
      const template = await (await fetch(`/fixtures/template-${count}.json`)).json(), canvas = await imageCanvas(await (await fetch(`/fixtures/sheet-${count}-${variant}.png`)).blob()), corners = await detectAnchors(canvas);
      if (!corners) throw new Error(`Missing anchors: ${count} ${variant}`);
      const processed = await preprocess(canvas, template, corners), marks = recognize(processed.pixels, template);
      outputs.push({ count, variant, selected: marks.map(m => m.selected.join('')), states: marks.map(m => m.state), student: recognizeDigits(processed.pixels, template.student_region, template.thresholds) });
    }
    return outputs;
  });
  for (const row of recognition) { assert.equal(row.student, '000001'); if (row.variant !== 'review') { assert.deepEqual(row.selected, Array.from({ length: row.count }, (_, i) => ['A', 'B', 'C', 'D'][i % 4])); assert.ok(row.states.every(s => s === 'marked')); } else { assert.equal(row.states[1], 'blank'); assert.equal(row.states[2], 'multiple'); assert.equal(row.states[3], 'review'); } }
  console.log('PASS 6 real raster fixtures: 20/40 questions, perspective, lighting, blanks, multiple and ambiguous marks');
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('navigation').first().getByRole('button', { name: 'Mẫu phiếu', exact: true }).click();
  await page.getByRole('heading', { name: 'TN - DO 2026 · Trắc nghiệm, đúng–sai, trả lời ngắn' }).waitFor();
  const mixedDownload = page.waitForEvent('download'); await page.getByRole('link', { name: 'Tải PDF A4', exact: true }).click();
  assert.equal((await mixedDownload).suggestedFilename(), 'TNDO-3P-2026.pdf');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  console.log('PASS three-part TN - DO design is visible, downloadable as A4 PDF, and separate from automatic MCQ grading');
  // A fresh workspace must allow creating an exam before any class exists.
  const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const fresh = await emptyContext.newPage(); fresh.on('pageerror', e => errors.push(e.message));
    await fresh.goto('http://127.0.0.1:4173');
    await fresh.getByRole('navigation').first().getByRole('button', { name: 'Kỳ thi & đáp án', exact: true }).click();
    await fresh.getByRole('button', { name: 'Tạo kỳ thi', exact: true }).first().click();
    await fresh.getByLabel('Tên kỳ thi', { exact: true }).fill('Đề 10 câu trên phiếu 40');
    assert.equal(await fresh.getByLabel('Lớp học (tùy chọn)').inputValue(), '');
    assert.equal(await fresh.getByRole('button', { name: 'Lưu kỳ thi', exact: true }).isEnabled(), true);
    const largeTemplate = JSON.parse(await readFile('public/fixtures/template-40.json', 'utf8'));
    await fresh.getByLabel('Mẫu phiếu / phiên bản').selectOption(`${largeTemplate.id}:1`);
    await fresh.getByLabel('Số câu', { exact: true }).fill('10');
    await fresh.getByLabel('Điểm mỗi câu', { exact: true }).fill('1');
    await fresh.getByRole('button', { name: 'Lưu kỳ thi', exact: true }).click();
    await fresh.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.match(await fresh.locator('.exam-card').innerText(), /Không giới hạn lớp/);
    assert.match(await fresh.locator('.exam-meta').innerText(), /10\s*câu hỏi/);
    console.log('PASS empty workspace creates 10-question exam on 40-question sheet without a class');
  } finally { await emptyContext.close(); }
  assert.deepEqual(errors, []);
} catch (error) { await page.screenshot({ path: 'artifacts/browser-failure.png', fullPage: true }); console.error(error.message); console.error('Browser errors:', errors); process.exitCode = 1; }
finally { await context.close(); await browser.close(); await server.close(); }
