import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const vite = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 4176, strictPort: true, watch: null, hmr: false } });
await vite.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage(); await page.goto('http://127.0.0.1:4176');
  const results = await page.evaluate(async () => {
    const { largePrintTemplates } = await import('/src/domain/templates.ts');
    const { detectAnchors, preprocess } = await import('/src/domain/image-preprocessor.ts');
    const { recognize, recognizeDigits } = await import('/src/domain/omr-engine.ts');
    const results = [];
    for (const t of largePrintTemplates) {
      const img = new Image(); img.src = `/forms/${t.code}-v${t.version}.png`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = t.width; canvas.height = t.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, t.width, t.height).data;
      let minX = t.width, minY = t.height, maxX = 0, maxY = 0;
      for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
        const i = (y * t.width + x) * 4;
        if (Math.min(data[i], data[i + 1], data[i + 2]) < 180) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
      let corners = await detectAnchors(canvas); if (!corners) throw new Error(`Missing printed anchors: ${t.code}`);
      const blank = await preprocess(canvas, t, corners), blankStates = recognize(blank.pixels, t).map(m => m.state);
      const fill = b => { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(b.x * t.width, b.y * t.height, b.radius * t.width * .93, 0, Math.PI * 2); ctx.fill(); };
      const expected = [], numbers = ['-1.25', '0.5', '1234', '-9999', '12.3', '0'];
      for (const q of t.questions) {
        if (q.section === 'mcq') { const b = q.bubbles[(q.number - 1) % 4]; fill(b); expected.push(b.label); }
        else if (q.true_false_items) { q.true_false_items.forEach((item, i) => fill(i % 2 ? item.false : item.true)); expected.push('TFTF'); }
        else {
          const value = numbers[q.number - 49], unsigned = value.replace('-', ''), answer = q.short_answer;
          [...unsigned.replace('.', '')].forEach((digit, i) => fill(answer.columns[i][Number(digit)]));
          if (value.startsWith('-')) fill(answer.negative);
          if (unsigned.includes('.')) fill(answer.decimal[unsigned.indexOf('.') - 1]);
          expected.push(value);
        }
      }
      const student = t.student_region.length === 8 ? '00000001' : '000001', code = t.code_region.length === 4 ? '0101' : '101';
      for (const [region, value] of [[t.student_region, student], [t.code_region, code]]) [...value].forEach((digit, i) => fill(region[i][Number(digit)]));
      const variants = [];
      for (const skewed of [false, true]) {
        const source = document.createElement('canvas'); source.width = t.width; source.height = t.height;
        const c = source.getContext('2d'); c.fillStyle = '#ddd'; c.fillRect(0, 0, source.width, source.height);
        if (skewed) c.setTransform(.82, .025, -.015, .84, 120, 100);
        c.drawImage(canvas, 0, 0); corners = await detectAnchors(source); if (!corners) throw new Error(`Missing capture anchors: ${t.code}`);
        const processed = await preprocess(source, t, corners), marks = recognize(processed.pixels, t);
        variants.push({ skewed, selected: marks.map(m => m.selected.join('')), states: marks.map(m => m.state), student: recognizeDigits(processed.pixels, t.student_region, t.thresholds), code: recognizeDigits(processed.pixels, t.code_region, t.thresholds) });
      }
      results.push({ name: `${t.code} v${t.version}`, margin: { left: minX * 210 / t.width, right: (t.width - maxX - 1) * 210 / t.width, top: minY * 297 / t.height, bottom: (t.height - maxY - 1) * 297 / t.height }, blankStates, expected, student, code, variants });
    }
    return results;
  });
  for (const row of results) {
    for (const margin of Object.values(row.margin)) assert.ok(Math.abs(margin - 25) < .25, `${row.name}: margin ${margin}`);
    assert.ok(row.blankStates.every(s => s === 'blank'), `${row.name}: empty print contains nonblank marks ${row.blankStates}`);
    for (const v of row.variants) {
      assert.deepEqual(v.selected, row.expected, `${row.name}, skewed=${v.skewed}`);
      assert.ok(v.states.every(s => s === 'marked'), `${row.name}: ${v.states}`);
      assert.equal(v.student, row.student, `${row.name}: SBD, skewed=${v.skewed}`); assert.equal(v.code, row.code, `${row.name}: code, skewed=${v.skewed}`);
    }
    console.log(`PASS ${row.name}: exact 25 mm margins, blank print, all answers/SBD/code read correctly on straight and skewed captures`);
  }
} finally { await browser.close(); await vite.close(); }
