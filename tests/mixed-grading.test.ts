import { describe, expect, it } from 'vitest';
import { answerDocumentSchema, templateSchema, type AnswerDocument, type Recognition } from '../src/domain/schemas';
import { addMixedSections } from '../src/domain/mixed-answers';
import { createMixedTemplate } from '../src/domain/templates';
import { grade, weightedPoints } from '../src/domain/grading-engine';
import { normalizeNumericAnswer } from '../src/domain/answer-format';
import { recognize, type Pixels } from '../src/domain/omr-engine';
import { matchTemplate } from '../src/domain/template-matcher';
import { assertReviewed, reviewAnswer } from '../src/domain/result-review';
import { answerMatrixCells, mapMixedAnswerTable } from '../src/domain/import-service';

function document(): AnswerDocument {
  const doc = addMixedSections({ schema_version: '1.0', exam: { title: 'Ba phần', subject: 'Toán', grading_scale: 10 }, answer_sheets: [{ exam_code: '0101', sections: [{ type: 'mcq', title: 'I', choices: 4, questions: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, correct_answer: 'A', points: .5 })) }] }] });
  doc.answer_sheets[0].sections[1].questions.forEach(q => { q.correct_answer = 'TFTF'; });
  doc.answer_sheets[0].sections[2].questions.forEach(q => { q.correct_answer = '-1.25'; });
  return answerDocumentSchema.parse(doc);
}
function marks(doc: AnswerDocument): Recognition[] { return doc.answer_sheets[0].sections.flatMap(s => s.questions.map(q => ({ number: q.number, selected: [q.correct_answer], state: 'marked', confidence: 1, ratios: [], reviewed: true }))); }

describe('Three-part answer keys and scoring', () => {
  it('rounds partial points like PostgreSQL numeric, including halves and scientific notation', () => {
    expect(weightedPoints(1.2345, .1)).toBe(.1235);
    expect(weightedPoints(.00005, 1)).toBe(.0001);
    expect(weightedPoints(1e-7, 1)).toBe(0);
    expect(weightedPoints(.001, .75)).toBe(.0008);
    const d = document();
    d.answer_sheets[0].sections = [{ type: 'mcq', title: 'I', choices: 4, questions: Array.from({ length: 3 }, (_, i) => ({ number: i + 1, correct_answer: 'A', points: 10 / 3 })) }];
    expect(grade(d, '0101', marks(d)).score).toBe(10);
  });
  it('round-trips mixed Excel/CSV matrices with section labels, weights and TF scoring', () => {
    const doc = document(), cells = answerMatrixCells(doc), table = { headers: cells[0], rows: cells.slice(1) };
    expect(table.rows.some(row => row[0] === 'II.1')).toBe(true);
    expect(table.rows.some(row => row[0] === 'III.1')).toBe(true);
    table.rows.find(row => row[0] === 'II.1')![1] = 'ĐSĐS';
    table.rows.find(row => row[0] === 'III.1')![1] = '-1,25';
    const result = mapMixedAnswerTable(table, doc);
    expect(result.errors).toEqual([]);
    expect(result.document?.answer_sheets[0].sections[1]).toEqual(doc.answer_sheets[0].sections[1]);
    expect(result.document?.answer_sheets[0].sections[2].questions[0].correct_answer).toBe('-1,25');
    expect(mapMixedAnswerTable({ ...table, rows: table.rows.slice(1) }, doc).errors.some(e => e.message.includes('Thiếu'))).toBe(true);
    expect(mapMixedAnswerTable({ ...table, rows: [...table.rows, table.rows[0]] }, doc).errors.some(e => e.message.includes('Trùng'))).toBe(true);
    expect(mapMixedAnswerTable({ headers: table.headers, rows: [['II.0', 'TTTT']] }, doc).document).toBeNull();
  });
  it('matches a shorter three-part exam to v2 and rejects the old MCQ-only template', () => {
    const t = templateSchema.parse(createMixedTemplate()), doc = document();
    expect(matchTemplate([t], t.id, 2, doc)).toEqual(t);
    expect(() => matchTemplate([{ ...t, version: 1, questions: t.questions.slice(0, 40) }], t.id, 1, doc)).toThrow();
    expect(grade(doc, '0101', marks(doc)).score).toBe(10);
    expect(doc.answer_sheets[0].sections[0].questions[0].correct_answer).toBe('A');
  });
  it.each([[0, 0], [1, .1], [2, .25], [3, .5], [4, 1]])('awards %s correct true-false items a fraction of %s', (correct, fraction) => {
    const doc = document(), rows = marks(doc), answer = 'TFTF'.slice(0, correct) + 'FTFT'.slice(correct);
    rows.find(m => m.number === 41)!.selected = [answer];
    const result = grade(doc, '0101', rows), q = result.answers.find(q => q.number === 41)!;
    expect(q.earned).toBe(fraction);
    expect(q.status).toBe(correct === 4 ? 'correct' : correct ? 'partial' : 'incorrect');
    expect(result.score).toBe(9 + fraction);
  });
  it('supports equal per-item weighting and does not count blank items as correct', () => {
    const doc = document(), rows = marks(doc); doc.answer_sheets[0].sections[1].scoring = 'per_item';
    rows.find(m => m.number === 41)!.selected = ['TF__'];
    expect(grade(doc, '0101', rows).answers.find(q => q.number === 41)?.earned).toBe(.5);
    rows.find(m => m.number === 41)!.selected = [];
    expect(grade(doc, '0101', rows).answers.find(q => q.number === 41)?.earned).toBe(0);
  });
  it('normalizes signs, leading/trailing zeroes and decimal separators without tolerance', () => {
    expect(normalizeNumericAnswer('-01,25')).toBe('-1.25');
    expect(normalizeNumericAnswer('0000')).toBe('0');
    expect(normalizeNumericAnswer('-0.00')).toBe('0');
    for (const value of ['1e2', 'Infinity', 'NaN', '12345', '-1.2345', '1..2', '+1', '', '1.']) expect(normalizeNumericAnswer(value)).toBeNull();
    const doc = document(), rows = marks(doc); rows.find(m => m.number === 49)!.selected = ['-1,25'];
    expect(grade(doc, '0101', rows).score).toBe(10);
    rows.find(m => m.number === 49)!.selected = ['-1.26'];
    expect(grade(doc, '0101', rows).score).toBe(9.5);
  });
  it('blocks malformed manually reviewed answers and unresolved recognition', () => {
    const doc = document(), rows = marks(doc);
    rows[20] = reviewAnswer(rows[20], ['TF?T']);
    expect(() => assertReviewed(grade(doc, '0101', rows).answers)).toThrow();
    rows[20] = reviewAnswer(rows[20], ['TFTF']); rows[24] = reviewAnswer(rows[24], ['1e2']);
    expect(() => assertReviewed(grade(doc, '0101', rows).answers)).toThrow();
  });
  it('rejects wrong types, duplicate slots, unsupported weights and answers exceeding the printed digits', () => {
    for (const modify of [
      (d: AnswerDocument) => { d.answer_sheets[0].sections[1].questions[0].correct_answer = 'ABCD'; },
      (d: AnswerDocument) => { d.answer_sheets[0].sections[1].questions[0].number = 1; },
      (d: AnswerDocument) => { d.answer_sheets[0].sections[2].questions[0].correct_answer = '12345'; },
      (d: AnswerDocument) => { d.answer_sheets[0].sections[0].scoring = 'partial'; },
    ]) { const d = document(); modify(d); expect(answerDocumentSchema.safeParse(d).success).toBe(false); }
  });
});

function canvas(): Pixels {
  const t = createMixedTemplate(); return { width: t.width, height: t.height, data: new Uint8Array(t.width * t.height * 4).fill(255) };
}
function fill(image: Pixels, b: { x: number; y: number; radius: number }) {
  const cx = b.x * image.width, cy = b.y * image.height, r = b.radius * image.width * .9;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r ** 2) image.data.fill(0, (y * image.width + x) * 4, (y * image.width + x) * 4 + 3);
}
describe('Three-part OMR', () => {
  it('reads independent true/false choices, blanks and double marks', () => {
    const image = canvas(), t = createMixedTemplate(), items = t.questions[40].true_false_items!;
    fill(image, items[0].true); fill(image, items[1].false); fill(image, items[3].false);
    expect(recognize(image, t)[40]).toMatchObject({ selected: ['TF_F'], state: 'marked' });
    fill(image, items[0].false);
    expect(recognize(image, t)[40].state).toBe('review');
    expect(recognize(canvas(), t)[40]).toMatchObject({ selected: [], state: 'blank' });
  });
  it.each(['-1.25', '1234', '0.5', '00.50', '-9999', '-0.00'])('reads numeric answer %s including sign and decimal', value => {
    const image = canvas(), t = createMixedTemplate(), q = t.questions[48].short_answer!, unsigned = value.replace('-', ''), digits = unsigned.replace('.', '');
    [...digits].forEach((digit, i) => fill(image, q.columns[i][Number(digit)]));
    if (value.startsWith('-')) fill(image, q.negative);
    if (unsigned.includes('.')) fill(image, q.decimal[unsigned.indexOf('.') - 1]);
    expect(recognize(image, t)[48]).toMatchObject({ selected: [value], state: 'marked' });
  });
  it('accepts contiguous right-aligned digits and adjusts the decimal position', () => {
    const image = canvas(), t = createMixedTemplate(), q = t.questions[48].short_answer!;
    fill(image, q.columns[2][1]); fill(image, q.columns[3][2]); fill(image, q.decimal[2]);
    expect(recognize(image, t)[48]).toMatchObject({ selected: ['1.2'], state: 'marked' });
  });
  it('requires review for holes, multiple digits, misplaced decimals and sign-only marks', () => {
    const t = createMixedTemplate(), q = t.questions[48].short_answer!;
    for (const bubbles of [ [q.columns[0][1], q.columns[2][2]], [q.columns[0][1], q.columns[0][2]], [q.columns[0][1], q.decimal[2]], [q.negative], [q.columns[0][1], q.columns[1][2], q.decimal[0], q.decimal[1]] ]) {
      const image = canvas(); bubbles.forEach(b => fill(image, b)); expect(recognize(image, t)[48].state).toBe('review');
    }
    expect(recognize(canvas(), t)[48]).toMatchObject({ selected: [], state: 'blank' });
  });
});
