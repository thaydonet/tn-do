import { expect, it } from 'vitest';
import { createMixedSheet, mixedSheetSchema, renderMixedSheetSVG } from '../src/domain/mixed-sheet';
import { answerDocumentSchema, templateSchema } from '../src/domain/schemas';

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

it('keeps print-only designs out of the MCQ grading schemas', () => {
  const design = createMixedSheet(); expect(design.grading_support).toBe('print_only');
  expect(templateSchema.safeParse(design).success).toBe(false); expect(answerDocumentSchema.safeParse(design).success).toBe(false);
});
