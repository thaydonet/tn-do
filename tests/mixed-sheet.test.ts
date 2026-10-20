import { expect, it } from 'vitest';
import { createMixedSheet, mixedSheetSchema, renderMixedSheetSVG } from '../src/domain/mixed-sheet';
import { answerDocumentSchema, templateSchema } from '../src/domain/schemas';
import { createMixedTemplate, initialTemplates } from '../src/domain/templates';
import { matchTemplate } from '../src/domain/template-matcher';
import { renderSheetSVG } from '../src/domain/sheet-renderer';

it('matches the requested 40 / 8 × 4 / 6 structure and four short-answer digits', () => {
  const d = createMixedSheet();
  expect(d.sections.mcq).toHaveLength(40); expect(d.sections.true_false).toHaveLength(8); expect(d.sections.short_answer).toHaveLength(6);
  expect(d.sections.true_false.every(q => q.items.length === 4)).toBe(true);
  expect(d.sections.short_answer.every(q => q.columns.length === 4 && q.columns.every(c => c.length === 10) && q.decimal.length === 3)).toBe(true);
  expect(d.student_region).toHaveLength(8); expect(d.code_region).toHaveLength(4);
  expect(mixedSheetSchema.parse(d)).toBeTruthy();
});

it('prints all three TN - DO sections without importing third-party branding or assets', () => {
  const svg = renderMixedSheetSVG(createMixedSheet());
  expect(svg).toContain('TRẮC NGHIỆM'); expect(svg).toContain('ĐÚNG – SAI'); expect(svg).toContain('TRẢ LỜI NGẮN');
  expect(svg).toContain('TNDO-3P-2026'); expect(svg).not.toMatch(/tnmaker|<image|<script/i);
});

it('keeps print layout metadata separate from recognition and answer schemas', () => {
  const design = createMixedSheet(); expect(design.grading_support).toBe('three_part');
  expect(templateSchema.safeParse(design).success).toBe(false); expect(answerDocumentSchema.safeParse(design).success).toBe(false);
});

it('registers TN - DO 2026 with the exact printed MCQ and identifier geometry', () => {
  const design = createMixedSheet(), template = templateSchema.parse(createMixedTemplate());
  expect(initialTemplates.find(t => t.code === design.code)).toEqual(template);
  expect(template.questions.filter(q => q.section === 'mcq').map(({ section, ...q }) => { expect(section).toBe('mcq'); return q; })).toEqual(design.sections.mcq);
  expect(template.questions.filter(q => q.section === 'true_false').map(q => q.true_false_items)).toEqual(design.sections.true_false.map(q => q.items));
  expect(template.questions.filter(q => q.section === 'short_answer').map(q => q.short_answer)).toEqual(design.sections.short_answer.map(q => ({ negative: q.negative, decimal: q.decimal, columns: q.columns })));
  expect(template.anchors).toEqual(design.anchors);
  expect(template.student_region).toEqual(design.student_region);
  expect(template.code_region).toEqual(design.code_region);
  expect(template.active).toBe(false);
  const document = answerDocumentSchema.parse({ schema_version: '1.0', exam: { title: 'TN - DO 2026', subject: 'Toán', grading_scale: 10 }, answer_sheets: [{ exam_code: '0101', sections: [{ type: 'mcq', choices: 4, questions: template.questions.filter(q => q.section === 'mcq').map(q => ({ number: q.number, correct_answer: 'A', points: .25 })) }] }] });
  expect(matchTemplate(initialTemplates, template.id, template.version, document)).toEqual(template);
  document.answer_sheets[0].sections[0].choices = 5;
  expect(() => matchTemplate(initialTemplates, template.id, template.version, document)).toThrow(/lựa chọn/);
});

it('renders the three-part sheet for the grading template and preserves calibrated MCQ coordinates', () => {
  const template = createMixedTemplate();
  expect(renderSheetSVG(template)).toEqual(renderMixedSheetSVG(createMixedSheet()));
  template.questions[0].bubbles[0].x = .125;
  const svg = renderSheetSVG(template);
  expect(svg).toContain(`cx="${.125 * template.width}"`);
  expect(svg).toContain('ĐÚNG – SAI');
  expect(svg).toContain('TRẢ LỜI NGẮN');
});
