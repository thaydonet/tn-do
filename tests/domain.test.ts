import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { answerDocumentSchema, templateSchema, type AnswerDocument, type Recognition } from '../src/domain/schemas';
import { parseCSV, parseJSON, mapRows, readTable } from '../src/domain/import-service';
import { grade, resolveAnswerKey } from '../src/domain/grading-engine';
import { createTemplate } from '../src/domain/templates';
import { classify, fillRatio, recognize, recognizeDigits } from '../src/domain/omr-engine';
import { parseQR } from '../src/domain/qr-reader';
import { matchTemplate, checkQR } from '../src/domain/template-matcher';
import { assertReviewed, reviewAnswer } from '../src/domain/result-review';
import { validateCorners } from '../src/domain/image-preprocessor';
import { summarize } from '../src/domain/report-service';

const document: AnswerDocument = answerDocumentSchema.parse({ schema_version: '1.0', exam: { title: 'Toán', subject: 'Toán', grading_scale: 10 }, answer_sheets: ['101', '102'].map(code => ({ exam_code: code, sections: [{ type: 'mcq', choices: 4, questions: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, correct_answer: code === '101' ? 'A' : 'B', points: .5 })) }] })) });
const marks = (answer: string): Recognition[] => Array.from({ length: 20 }, (_, i) => ({ number: i + 1, selected: [answer], state: 'marked', confidence: 1, ratios: [1, 0, 0, 0] }));
const id = '10000000-0000-4000-8000-000000000001';
describe('Versioned answer documents', () => {
  it('accepts two codes and preserves weighted grading', () => { expect(grade(document, '101', marks('A')).score).toBe(10); expect(grade(document, '102', marks('A')).score).toBe(0); });
  it('uses per-question weights instead of a fixed score', () => { const d = structuredClone(document), qs = d.answer_sheets[0].sections[0].questions; qs[0].points = 1.5; qs.slice(1, 5).forEach(q => { q.points = .25; }); answerDocumentSchema.parse(d); const m = marks('B'); m[0].selected = ['A']; expect(grade(d, '101', m).score).toBe(1.5); });
  it('requires an exact code', () => { expect(() => resolveAnswerKey(document, '')).toThrow(); expect(() => grade(document, '999', marks('A'))).toThrow(); });
  it('rejects duplicate questions and wrong totals', () => { const d = structuredClone(document); d.answer_sheets[0].sections[0].questions[1].number = 1; expect(() => answerDocumentSchema.parse(d)).toThrow(); d.answer_sheets[0].sections[0].questions[1].number = 2; d.answer_sheets[0].sections[0].questions[0].points = 2; expect(() => answerDocumentSchema.parse(d)).toThrow(); });
  it('rejects invalid choices, duplicate codes, unsupported schemas and extra fields', () => { for (const value of [{ ...document, schema_version: '2.0' }, { ...document, answer_sheets: [document.answer_sheets[0], document.answer_sheets[0]] }, { ...document, execute: 'alert()' }]) expect(() => answerDocumentSchema.parse(value)).toThrow(); const d = structuredClone(document); d.answer_sheets[0].sections[0].questions[0].correct_answer = 'E'; expect(() => answerDocumentSchema.parse(d)).toThrow(); });
  it('accepts extended MCQ sections with 5 choices', () => { const d = structuredClone(document); d.answer_sheets[0].sections[0].choices = 5; d.answer_sheets[0].sections[0].questions[0].correct_answer = 'E'; expect(answerDocumentSchema.parse(d)).toBeTruthy(); });
  it('returns correct, incorrect, blank, multiple and review states', () => { const m = marks('A'); m[1].selected = ['B']; m[2] = { ...m[2], selected: [], state: 'blank' }; m[3] = { ...m[3], selected: ['A', 'B'], state: 'multiple' }; m[4] = { ...m[4], state: 'review' }; const result = grade(document, '101', m); expect(result.answers.slice(0, 5).map(a => a.status)).toEqual(['correct', 'incorrect', 'blank', 'multiple', 'review']); expect(result.score).toBe(8); });
  it('rejects missing and duplicate recognition questions', () => { expect(() => grade(document, '101', marks('A').slice(1))).toThrow(); const m = marks('A'); m[0].number = 2; expect(() => grade(document, '101', m)).toThrow(); });
  it.each([20, 40])('grades only the 10 exam questions on a %i-question sheet', count => {
    const d = structuredClone(document);
    d.answer_sheets[0].sections[0].questions = d.answer_sheets[0].sections[0].questions.slice(0, 10).map(q => ({ ...q, points: 1 }));
    answerDocumentSchema.parse(d);
    const m: Recognition[] = Array.from({ length: count }, (_, i) => ({ number: i + 1, selected: i < 10 ? ['A'] : ['A', 'B'], state: i < 10 ? 'marked' : 'review', confidence: 1, ratios: [1, 0, 0, 0] }));
    const result = grade(d, '101', m);
    expect(result.score).toBe(10); expect(result.answers).toHaveLength(10); expect(result.needsReview).toBe(false);
    expect(() => assertReviewed(result.answers)).not.toThrow();
    expect(() => grade(d, '101', m.slice(1))).toThrow();
    expect(() => grade(d, '101', [...m, m[0]])).toThrow();
    expect(grade(d, '102', m).answers).toHaveLength(20);
  });
  it('requires confirmation of ambiguous and multiple bubbles', () => { const m = { ...marks('A')[0], state: 'multiple' as const, selected: ['A', 'B'] }; expect(() => assertReviewed([m])).toThrow(); expect(() => assertReviewed([reviewAnswer(m, ['A', 'B'])])).not.toThrow(); expect(reviewAnswer(m, []).state).toBe('blank'); });
});
describe('CSV / XLSX / JSON imports', () => {
  const map = { code: 'Ma', number: 'Cau', answer: 'DapAn', points: 'Diem' };
  it('reads UTF-8 BOM, quoted commas, custom column mapping and multiple codes', () => { const text = '\uFEFFMa,Cau,DapAn,Diem\n101,1,A,"10,0"\n102,1,B,10'; const result = mapRows(parseCSV(text), map, document.exam); expect(result.errors).toEqual([]); expect(result.document?.answer_sheets.length).toBe(2); });
  it('reports duplicate, missing and invalid row data with row numbers', () => { const result = mapRows(parseCSV('Ma,Cau,DapAn,Diem\n101,1,A,5\n101,1,,5\n101,2,Z,0'), map, document.exam); expect(result.document).toBeNull(); expect(result.errors.map(e => e.row)).toEqual([3, 4]); expect(result.errors[0].message).toMatch(/Trùng/); });
  it('rejects empty number and non-contiguous questions', () => { expect(mapRows([{ Ma: '101', Cau: '', DapAn: 'A', Diem: 10 }], map, document.exam).errors[0].row).toBe(2); expect(mapRows([{ Ma: '101', Cau: 2, DapAn: 'A', Diem: 10 }], map, document.exam).document).toBeNull(); });
  it('round-trips actual XLSX bytes through the parser', async () => { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Ma: '001', Cau: 1, DapAn: 'A', Diem: 10 }]), 'Keys'); const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }); const file = new File([bytes], 'keys.xlsx'); const rows = await readTable(file); expect(rows[0].Ma).toBe('001'); expect(mapRows(rows, map, document.exam).errors).toEqual([]); });
  it('validates JSON without dropping unknown fields', () => { expect(parseJSON(JSON.stringify(document)).schema_version).toBe('1.0'); expect(() => parseJSON(JSON.stringify({ ...document, unexpected: true }))).toThrow(); expect(() => parseJSON('https://evil.example')).toThrow(); });
  it('rejects malformed CSV', () => expect(() => parseCSV('a,b\n"unterminated,b')).toThrow());
});
describe('QR safety and template matching', () => {
  const template = createTemplate(20, id);
  it('accepts metadata only and validates exam and template', () => { const qr = parseQR(JSON.stringify({ schema_version: '1.0', exam_id: id, exam_code: '101', student_number: '000001', template_id: id, template_version: 1 })); expect(() => checkQR(qr, id, template)).not.toThrow(); expect(() => checkQR(qr, crypto.randomUUID(), template)).toThrow(); expect(() => checkQR({ ...qr, template_version: 2 }, id, template)).toThrow(); });
  it('rejects arbitrary URLs, script text, answer payloads and oversized input', () => { for (const raw of ['https://example.com', 'javascript:alert(1)', JSON.stringify({ schema_version: '1.0', exam_id: id, answers: ['A'] }), 'x'.repeat(4097)]) expect(() => parseQR(raw)).toThrow(); });
  it('never chooses a template or version implicitly', () => { expect(() => matchTemplate([template], undefined, 1)).toThrow(); expect(() => matchTemplate([template], id, 2)).toThrow(); expect(matchTemplate([createTemplate(40, id)], id, 1, document).id).toBe(id); expect(matchTemplate([template], id, 1, document).id).toBe(id); });
  it.each([20, 40])('accepts 10 questions within a %i-question template', count => {
    const d = structuredClone(document);
    d.answer_sheets.forEach(s => { s.sections[0].questions = s.sections[0].questions.slice(0, 10).map(q => ({ ...q, points: 1 })); });
    expect(matchTemplate([createTemplate(count, id)], id, 1, answerDocumentSchema.parse(d)).questions).toHaveLength(count);
    const t = createTemplate(count, id); t.questions[0].bubbles.pop();
    expect(() => matchTemplate([t], id, 1, d)).toThrow();
  });
  it('rejects questions beyond the sheet capacity', () => {
    const t = createTemplate(20, id); t.questions = t.questions.slice(0, 10);
    expect(() => matchTemplate([t], id, 1, document)).toThrow();
  });
  it.each([20, 40])('validates development template %i', count => { const t = createTemplate(count); expect(templateSchema.parse(t).questions.length).toBe(count); expect(() => templateSchema.parse({ ...t, active: true })).toThrow(); });
  it('rejects inverted thresholds and duplicate template questions', () => { const t = createTemplate(20); t.thresholds.ambiguous = .8; expect(() => templateSchema.parse(t)).toThrow(); });
  it('rejects QR bounds, duplicate digit labels and degenerate anchors', () => { const t = createTemplate(20); t.qr_region!.width = 1; expect(() => templateSchema.parse(t)).toThrow(); const d = createTemplate(20); d.student_region![0][0].label = '1'; expect(() => templateSchema.parse(d)).toThrow(); const a = createTemplate(20); a.anchors[1] = a.anchors[0]; expect(() => templateSchema.parse(a)).toThrow(); });
  it('rejects degenerate perspective points and incorrect order', () => { expect(() => validateCorners([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).not.toThrow(); expect(() => validateCorners([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }])).toThrow(); expect(() => validateCorners([{ x: .1, y: .1 }])).toThrow(); });
});
describe('OMR bubble pixels', () => {
  const thresholds = createTemplate(20).thresholds;
  it('detects blank, clear, faint, competing and multiple fills', () => { expect(classify([0, 0, .01, 0], ['A', 'B', 'C', 'D'], thresholds).state).toBe('blank'); expect(classify([.9, 0, 0, 0], ['A', 'B', 'C', 'D'], thresholds).selected).toEqual(['A']); expect(classify([.3, 0, 0, 0], ['A', 'B', 'C', 'D'], thresholds).state).toBe('review'); expect(classify([.52, .4, 0, 0], ['A', 'B', 'C', 'D'], thresholds).state).toBe('review'); expect(classify([.9, .8, 0, 0], ['A', 'B', 'C', 'D'], thresholds).state).toBe('multiple'); });
  it.each([20, 40])('recognizes actual synthetic pixels for %i questions and SBD digits', count => {
    const t = createTemplate(count), data = new Uint8ClampedArray(t.width * t.height * 4).fill(255), image = { width: t.width, height: t.height, data };
    const paint = (b: { x: number; y: number; radius: number }) => { const cx = b.x * t.width, cy = b.y * t.height, r = b.radius * t.width; for (let y = Math.floor(cy - r); y < cy + r; y++) for (let x = Math.floor(cx - r); x < cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) { const i = (y * t.width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; } };
    t.questions.forEach((q, i) => paint(q.bubbles[i % 4])); t.student_region!.forEach((col, i) => paint(col[i]));
    const recognized = recognize(image, t); expect(recognized.every((m, i) => m.state === 'marked' && m.selected[0] === ['A', 'B', 'C', 'D'][i % 4])).toBe(true); expect(recognizeDigits(image, t.student_region, t.thresholds)).toBe('012345'); expect(() => recognize({ ...image, width: 10 }, t)).toThrow(); expect(fillRatio(image, t.questions[0].bubbles[0])).toBe(1);
  });
  it('rejects out-of-bounds bubbles rather than silently scoring', () => expect(() => fillRatio({ width: 100, height: 100, data: new Uint8ClampedArray(40000) }, { x: 0, y: 0, radius: .1 })).toThrow());
  it('includes perfect scores in the last distribution bucket', () => { const report = summarize([{ score: 10, max_score: 10 }, { score: 5, max_score: 10 }] as any); expect(report.distribution).toEqual([0, 0, 1, 0, 1]); expect(report.average).toBe(7.5); });
});
