import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { createServer } from 'vite';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { chromium } from 'playwright-core';

const out = 'public/fixtures'; await mkdir(out, { recursive: true }); await mkdir('docs', { recursive: true });
await mkdir('public/forms', { recursive: true });
const vite = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
function crc32(bytes) { let crc = -1; for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
function chunk(type, bytes) { const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([t, bytes]))); return Buffer.concat([len, t, bytes, crc]); }
function png(width, height, pixels) { const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 0; const rows = Buffer.alloc((width + 1) * height); for (let y = 0; y < height; y++) { rows[y * (width + 1)] = 0; pixels.copy(rows, y * (width + 1) + 1, y * width, (y + 1) * width); } return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]); }
function homography(from, to) {
  const matrix = from.flatMap((p, i) => { const q = to[i]; return [[p.x, p.y, 1, 0, 0, 0, -q.x * p.x, -q.x * p.y, q.x], [0, 0, 0, p.x, p.y, 1, -q.y * p.x, -q.y * p.y, q.y]]; });
  for (let col = 0; col < 8; col++) { let pivot = col; for (let row = col + 1; row < 8; row++) if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row; [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]]; const divisor = matrix[col][col]; for (let k = col; k < 9; k++) matrix[col][k] /= divisor; for (let row = 0; row < 8; row++) if (row !== col) { const factor = matrix[row][col]; for (let k = col; k < 9; k++) matrix[row][k] -= factor * matrix[col][k]; } }
  return [...matrix.map(r => r[8]), 1];
}
try {
  const { createTemplate, TNDO_TEMPLATE_IDS } = await vite.ssrLoadModule('/src/domain/templates.ts'), { answerDocumentSchema, qrSchema, templateSchema } = await vite.ssrLoadModule('/src/domain/schemas.ts');
  const { renderSheetSVG } = await vite.ssrLoadModule('/src/domain/sheet-renderer.ts');
  for (const count of [20, 40]) {
    const t = createTemplate(count, TNDO_TEMPLATE_IDS[count]), width = t.width, height = t.height;
    const svg = renderSheetSVG(t);
    await writeFile(`public/forms/TNDO-A${count}-v1.svg`, svg);
    await page.setContent(`<style>@page{size:A4;margin:0}body{margin:0}svg{display:block;width:210mm;height:297mm}</style>${svg}`);
    await page.pdf({ path: `public/forms/TNDO-A${count}-v1.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const base64 = await page.evaluate(async ({ source, width, height }) => {
      const img = new Image(); img.src = source; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0); return Array.from(canvas.getContext('2d').getImageData(0, 0, width, height).data).filter((_, i) => i % 4 === 0);
    }, { source: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width, height });
    await writeFile(`${out}/template-${count}.json`, JSON.stringify(t, null, 2));
    const document = { schema_version: '1.0', exam: { title: `Kiểm thử tổng hợp ${count} câu`, subject: 'Toán', grading_scale: 10 }, answer_sheets: ['101', '102'].map(code => ({ exam_code: code, sections: [{ type: 'mcq', title: 'Trắc nghiệm', choices: 4, questions: t.questions.map((q, i) => ({ number: q.number, correct_answer: ['A', 'B', 'C', 'D'][(i + (code === '102' ? 1 : 0)) % 4], points: 10 / count })) }] })) };
    await writeFile(`${out}/answers-${count}.json`, JSON.stringify(document, null, 2));
    const rows = document.answer_sheets.flatMap(s => s.sections.flatMap(sec => sec.questions.map(q => ({ exam_code: s.exam_code, ...q }))));
    const sheet = XLSX.utils.json_to_sheet(rows), book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Đáp án'); await writeFile(`${out}/answers-${count}.xlsx`, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })); await writeFile(`${out}/answers-${count}.csv`, '\uFEFF' + XLSX.utils.sheet_to_csv(sheet));
    for (const variant of ['clean', 'review', 'perspective']) {
      const pixels = Buffer.from(base64);
      function rect(x, y, w, h, color) { for (let dy = Math.max(0, y); dy < Math.min(height, y + h); dy++) for (let dx = Math.max(0, x); dx < Math.min(width, x + w); dx++) pixels[dy * width + dx] = color; }
      function circle(b, filled = false, color = 0) { const cx = b.x * width, cy = b.y * height, radius = b.radius * width; for (let y = Math.max(0, Math.floor(cy - radius - 1)); y <= cy + radius + 1 && y < height; y++) for (let x = Math.max(0, Math.floor(cx - radius - 1)); x <= cx + radius + 1 && x < width; x++) { const distance = Math.hypot(x - cx, y - cy); if (filled ? distance <= radius * .83 : Math.abs(distance - radius) < .85) pixels[y * width + x] = color; } }
      t.questions.forEach((q, i) => { if (variant === 'review' && i === 1) return; if (variant === 'review' && i === 2) { circle(q.bubbles[0], true); circle(q.bubbles[1], true); return; } if (variant === 'review' && i === 3) { const b = q.bubbles[i % 4], radius = b.radius * width * .65, cx = b.x * width, cy = b.y * height; for (let y = Math.floor(cy - radius); y <= cy + radius * .3; y++) for (let x = Math.floor(cx - radius); x < cx; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < radius ** 2) pixels[y * width + x] = 0; return; } circle(q.bubbles[i % 4], true); });
      for (const [region, text] of [[t.student_region, '000001'], [t.code_region, '101']]) region.forEach((col, i) => col.forEach(b => { circle(b); if (b.label === text[i]) circle(b, true); }));
      // The fixture exam ID is deliberately fixed. UI tests replace it with the new exam ID.
      const qrText = JSON.stringify({ schema_version: '1.0', exam_id: '20000000-0000-4000-8000-000000000001', template_id: t.id, template_version: 1, exam_code: '101', student_number: '000001' });
      const qr = QRCode.create(qrText, { errorCorrectionLevel: 'M' }), size = qr.modules.size, margin = 4;
      const region = t.qr_region, scale = Math.floor(Math.min(region.width * width, region.height * height) / (size + margin * 2)), total = (size + margin * 2) * scale;
      const qrX = Math.round(region.x * width + (region.width * width - total) / 2 + margin * scale), qrY = Math.round(region.y * height + (region.height * height - total) / 2 + margin * scale);
      rect(Math.floor(region.x * width) - 1, Math.floor(region.y * height) - 1, Math.ceil(region.width * width) + 3, Math.ceil(region.height * height) + 3, 255);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.modules.get(y, x)) rect(qrX + x * scale, qrY + y * scale, scale, scale, 0);
      let final = pixels;
      if (variant === 'perspective') {
        final = Buffer.alloc(width * height, 210); const from = [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }], to = [{ x: 60, y: 80 }, { x: width - 70, y: 20 }, { x: width - 15, y: height - 30 }, { x: 20, y: height - 100 }], H = homography(to, from);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const divisor = H[6] * x + H[7] * y + 1, sx = Math.round((H[0] * x + H[1] * y + H[2]) / divisor), sy = Math.round((H[3] * x + H[4] * y + H[5]) / divisor); if (sx >= 0 && sx < width && sy >= 0 && sy < height) final[y * width + x] = Math.round(pixels[sy * width + sx] * (.8 + .2 * x / width)); }
      }
      await writeFile(`${out}/sheet-${count}-${variant}.png`, png(width, height, final));
    }
  }
  await writeFile('docs/answer-key.schema.json', JSON.stringify(z.toJSONSchema(answerDocumentSchema), null, 2));
  await writeFile('docs/qr.schema.json', JSON.stringify(z.toJSONSchema(qrSchema), null, 2));
  await writeFile('docs/template.schema.json', JSON.stringify(z.toJSONSchema(templateSchema), null, 2));
  console.log('Generated TN - DO A4 PDF/SVG forms, 6 PNG test sheets, versioned configs, answer files and JSON Schemas.');
} finally { await browser.close(); await vite.close(); }
