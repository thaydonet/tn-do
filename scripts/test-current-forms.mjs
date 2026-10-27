import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const server = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 4177, strictPort: true, watch: null, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4177');
  await page.getByRole('navigation').first().getByRole('button', { name: 'Kỳ thi & đáp án', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo kỳ thi', exact: true }).first().click();
  assert.equal(await page.getByLabel('Mẫu phiếu / phiên bản').inputValue(), '7d0a0020-2026-4000-8000-000000000001:2');
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  const fixtures = await page.evaluate(async () => {
    const { emptyWorkspace, saveLocal } = await import('/src/lib/local-db.ts');
    const { legacyTemplates, largePrintTemplates } = await import('/src/domain/templates.ts');
    const w = emptyWorkspace(), classId = crypto.randomUUID(), fixtures = [];
    w.classes.push({ id: classId, name: 'Phiếu mới', year: '2026' });
    for (const [index, t] of largePrintTemplates.entries()) {
      const legacy = legacyTemplates[index], student = { id: crypto.randomUUID(), class_id: classId, number: String(index + 1).padStart(t.student_region.length, '0'), name: `Học sinh ${index + 1}` };
      const code = '101'.padStart(t.code_region.length, '0');
      const document = { schema_version: '1.0', exam: { title: t.code, subject: 'Toán', grading_scale: t.questions.length }, answer_sheets: [{ exam_code: code, sections: ['mcq', 'true_false', 'short_answer'].filter(type => t.questions.some(q => q.section === type)).map(type => ({ type, title: type, choices: 4, questions: t.questions.filter(q => q.section === type).map(q => ({ number: q.number, correct_answer: type === 'mcq' ? 'A' : type === 'true_false' ? 'TTTT' : '-1.25', points: 1 })) })) }] };
      const exam = { id: crypto.randomUUID(), class_id: classId, template_id: legacy.id, template_version: legacy.version, version: 1, date: '2026-10-27', document };
      w.students.push(student); w.exams.push(exam);
      fixtures.push({ id: exam.id, code: t.code, version: t.version, student: student.number, examCode: code, questions: t.questions.length });
    }
    await saveLocal(w); return fixtures;
  });
  await page.reload();
  for (const fixture of fixtures) {
    await page.getByRole('navigation').first().getByRole('button', { name: 'Chấm phiếu', exact: true }).click();
    await page.locator('.scan-config select').selectOption(fixture.id);
    await page.getByRole('button', { name: `Dùng phiếu mới nhất · v${fixture.version}`, exact: true }).click();
    await page.getByText('Đã chuyển kỳ thi sang mẫu in mới', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
    await page.getByLabel('Tôi xác nhận sử dụng phiên bản mẫu phiếu này').check();
    const png = await page.evaluate(async fixture => {
      const t = await (await fetch(`/forms/${fixture.code}.json`)).json();
      const { largePrintTemplates } = await import('/src/domain/templates.ts');
      const runtime = largePrintTemplates.find(template => template.code === fixture.code);
      if (JSON.stringify(t) !== JSON.stringify(runtime)) throw new Error('Printed JSON and runtime template differ');
      const image = new Image(); image.src = `/forms/${fixture.code}.png`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = t.width; canvas.height = t.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const fill = b => { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(b.x * t.width, b.y * t.height, b.radius * t.width * .93, 0, Math.PI * 2); ctx.fill(); };
      for (const q of t.questions) {
        if (q.section === 'mcq') fill(q.bubbles[0]);
        if (q.true_false_items) q.true_false_items.forEach(item => fill(item.true));
        if (q.short_answer) { fill(q.short_answer.negative); fill(q.short_answer.decimal[0]); [1, 2, 5].forEach((digit, column) => fill(q.short_answer.columns[column][digit])); }
      }
      for (const [region, value] of [[t.student_region, fixture.student], [t.code_region, fixture.examCode]]) [...value].forEach((digit, column) => fill(region[column][Number(digit)]));
      return canvas.toDataURL('image/png').split(',')[1];
    }, fixture);
    await page.locator('.analyzer input[type=file]').first().setInputFiles({ name: `${fixture.code}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByText('Đã tìm thấy 4 mốc.', { exact: false }).waitFor({ timeout: 25000 });
    await page.getByLabel('Cho phép không có QR').check();
    await page.getByRole('button', { name: 'Căn chỉnh & nhận diện', exact: true }).click();
    await page.getByText(`Đã nhận diện ${fixture.questions} câu`, { exact: false }).waitFor({ timeout: 25000 });
    assert.equal(await page.locator('.recognition-row').count(), fixture.questions);
    assert.equal(await page.locator('.review-panel select').nth(1).inputValue(), fixture.examCode);
    await page.getByLabel('Tôi đã đối chiếu học sinh').check();
    await page.getByRole('button', { name: 'Xác nhận & lưu kết quả', exact: true }).click();
    await page.getByText('Đã lưu ảnh và kết quả chấm', { exact: true }).waitFor();
    const saved = await page.evaluate(async id => {
      const { loadLocal, getImage } = await import('/src/lib/local-db.ts'); const w = await loadLocal();
      const submission = w.submissions.find(s => s.exam_id === id);
      return { submission, versions: w.exams.filter(e => e.id === id).map(e => [e.version, e.template_version]), original: !!await getImage(submission.id, 'original'), processed: !!await getImage(submission.id, 'processed') };
    }, fixture.id);
    assert.equal(saved.submission.score, fixture.questions);
    assert.equal(saved.submission.template_version, fixture.version);
    assert.equal(saved.submission.exam_version, 2);
    assert.equal(saved.versions.length, 2);
    assert.ok(saved.original && saved.processed);
    console.log(`PASS ${fixture.code} v${fixture.version}: upgrade old exam, read current public/forms PNG and JSON, recognize all answers/SBD/code, persist full score and images; historical exam preserved`);
    await page.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
