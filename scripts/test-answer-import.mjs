import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const server = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 4174, strictPort: true, watch: null, hmr: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run', '--disable-background-networking'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts', { recursive: true });
try {
  let bytes;
  if (process.env.ANSWER_IMPORT_FILE) bytes = await readFile(process.env.ANSWER_IMPORT_FILE);
  else {
    const book = XLSX.utils.book_new();
    const sample = Papa.parse(await readFile('public/fixtures/answers-matrix-10.csv', 'utf8'), { skipEmptyLines: true }).data;
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sample), 'DapAn'); bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  }
  const expectedBook = XLSX.read(bytes, { type: 'buffer' }), expected = XLSX.utils.sheet_to_json(expectedBook.Sheets[expectedBook.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const expectedCodes = expected[0].slice(1).map(String), count = expected.length - 1;
  await page.goto('http://127.0.0.1:4174');
  await page.getByRole('navigation').first().getByRole('button', { name: 'Kỳ thi & đáp án', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo kỳ thi', exact: true }).first().click();
  await page.getByLabel('Tên kỳ thi', { exact: true }).fill('Kiểm thử nhập bảng đáp án');
  const template = JSON.parse(await readFile('public/fixtures/template-40.json', 'utf8'));
  await page.getByLabel('Mẫu phiếu / phiên bản').selectOption(`${template.id}:1`);
  await page.getByRole('button', { name: 'Excel / CSV', exact: true }).click();
  const upload = page.locator('input[type=file][accept=".csv,.xlsx"]');
  await upload.setInputFiles({ name: 'dap-an.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
  await page.getByLabel('Bố cục tệp').waitFor();
  assert.equal(await page.getByLabel('Bố cục tệp').inputValue(), 'matrix');
  assert.deepEqual(await page.locator('.preview-table th').allTextContents(), expected[0].map(String));
  for (let i = 0; i < Math.min(count, 10); i++) assert.deepEqual(await page.locator('.preview-table tbody tr').nth(i).locator('td').allTextContents(), expected[i + 1].map(String));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Xác nhận áp dụng dữ liệu', exact: true }).click();
  await page.locator('.code-toolbar').waitFor();
  assert.deepEqual(await page.locator('.code-toolbar select option').allTextContents(), expectedCodes.map(code => `Mã đề ${code}`));
  for (let column = 0; column < expectedCodes.length; column++) {
    await page.getByLabel('Mã đề', { exact: true }).selectOption(String(column));
    assert.deepEqual(await page.locator('.answer-grid select').evaluateAll(selects => selects.map(select => select.value)), expected.slice(1).map(row => String(row[column + 1]).toUpperCase()));
    assert.equal(await page.getByLabel('Điểm mỗi câu', { exact: true }).inputValue(), String(10 / count));
  }
  await page.getByRole('button', { name: 'Lưu kỳ thi', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const saved = await page.evaluate(async () => (await (await import('/src/lib/local-db.ts')).loadLocal()).exams[0]);
  assert.equal(saved.class_id, null);
  assert.deepEqual(saved.document.answer_sheets.map(sheet => sheet.exam_code), expectedCodes);
  saved.document.answer_sheets.forEach((sheet, column) => {
    assert.deepEqual(sheet.sections[0].questions.map(q => q.correct_answer), expected.slice(1).map(row => String(row[column + 1]).toUpperCase()));
    assert.equal(sheet.sections[0].questions.length, count);
  });
  console.log(`PASS XLSX imports and persists all ${expectedCodes.length} codes × ${count} questions; column order and answers match the source file`);
  await page.getByRole('button', { name: 'Mở đáp án', exact: false }).click();
  await page.getByRole('button', { name: 'Excel / CSV', exact: true }).click();
  for (const [button, format] of [['Tải tệp mẫu XLSX', 'xlsx'], ['Tải CSV', 'csv']]) {
    const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: button, exact: true }).click();
    const download = await waiting, content = await readFile(await download.path());
    let exported;
    if (format === 'xlsx') { const book = XLSX.read(content, { type: 'buffer' }); exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, raw: false }); }
    else exported = Papa.parse(content.toString('utf8').replace(/^\uFEFF/, ''), { skipEmptyLines: true }).data;
    assert.deepEqual(exported, [['Câu', ...expectedCodes], ...expected.slice(1).map(row => row.map(String))]);
  }
  console.log('PASS downloaded XLSX and CSV templates use codes in the first row and question numbers in the first column');
  await upload.setInputFiles('public/fixtures/answers-matrix-10.csv');
  await page.getByText('4 mã đề · 10 câu/mã đề.', { exact: false }).waitFor();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Xác nhận áp dụng dữ liệu', exact: true }).click();
  await page.locator('.code-toolbar').waitFor();
  assert.deepEqual(await page.locator('.code-toolbar select option').allTextContents(), ['101', '102', '103', '104'].map(code => `Mã đề ${code}`));
  console.log('PASS CSV matrix imports into the answer editor');
  await page.getByRole('button', { name: 'Excel / CSV', exact: true }).click();
  await upload.setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('Câu,101,101\n1,A,B') });
  await page.getByText('Dòng 1: Trùng mã đề 101', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Xác nhận áp dụng dữ liệu', exact: true }).isDisabled(), true);
  console.log('PASS duplicate codes cannot replace the current answer key');
  await upload.setInputFiles('public/fixtures/answers-20.csv');
  await page.waitForFunction(() => document.querySelector('label select') && [...document.querySelectorAll('label')].some(label => label.textContent.startsWith('Bố cục tệp') && label.querySelector('select').value === 'rows'));
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Xác nhận áp dụng dữ liệu', exact: true }).click();
  await page.locator('.code-toolbar').waitFor(); assert.equal(await page.locator('.answer-grid select').count(), 20);
  console.log('PASS legacy CSV column mapping still imports weighted answers');
  assert.deepEqual(errors, []);
} catch (error) {
  // The source workbook may contain private exam answers; do not capture its preview.
  console.error('ANSWER IMPORT CHECK FAILED:', error.message); console.error('Browser errors:', errors); process.exitCode = 1;
} finally { await context.close(); await browser.close(); await server.close(); }
