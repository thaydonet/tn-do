import { expect, it } from 'vitest';
import { largePrintTemplates, legacyTemplates } from '../src/domain/templates';
import { questionBubbles, templateSchema } from '../src/domain/schemas';
import { PRINT_ANCHOR_MM } from '../src/domain/large-print-sheet';
import { renderSheetSVG } from '../src/domain/sheet-renderer';
import { CAMERA_GUIDE_SIZE } from '../src/domain/camera-capture';

it('triples camera guide sides and enlarges each printed identifier diameter exactly twice', () => {
  expect(CAMERA_GUIDE_SIZE).toBeCloseTo(.065 * 3);
  expect(PRINT_ANCHOR_MM).toBeCloseTo(20 / 1200 * 210 * 1.5);
  largePrintTemplates.forEach((t, i) => {
    expect(templateSchema.parse(t)).toEqual(t);
    expect(t.version).toBe(legacyTemplates[i].version + 1);
    for (const region of ['student_region', 'code_region'] as const) {
      expect(t[region]![0][0].radius / legacyTemplates[i][region]![0][0].radius).toBeCloseTo(2);
      for (const col of t[region]!) {
        for (let j = 1; j < col.length; j++) expect((col[j].y - col[j - 1].y) * 297).toBeGreaterThan(col[j].radius * 210 * 2);
      }
    }
  });
});

it('keeps all recognition geometry and four enlarged markers within the 25 mm A4 margins', () => {
  for (const t of largePrintTemplates) {
    for (const b of [...t.questions.flatMap(questionBubbles), ...t.student_region!.flat(), ...t.code_region!.flat()]) {
      const x = b.x * 210, y = b.y * 297, radius = b.radius * 210;
      expect(x - radius).toBeGreaterThanOrEqual(25); expect(x + radius).toBeLessThanOrEqual(185);
      expect(y - radius).toBeGreaterThanOrEqual(25); expect(y + radius).toBeLessThanOrEqual(272);
    }
    expect(t.anchors[0].x * 210 - PRINT_ANCHOR_MM / 2).toBeCloseTo(25);
    expect(t.anchors[0].y * 297 - PRINT_ANCHOR_MM / 2).toBeCloseTo(25);
    expect(t.anchors[2].x * 210 + PRINT_ANCHOR_MM / 2).toBeCloseTo(185);
    expect(t.anchors[2].y * 297 + PRINT_ANCHOR_MM / 2).toBeCloseTo(272);
    expect(renderSheetSVG(t).match(/data-anchor="true"/g)).toHaveLength(4);
    const q = structuredClone(t); q.questions[0].bubbles[0].x += .001;
    expect(renderSheetSVG(q)).toContain(`cx="${q.questions[0].bubbles[0].x * q.width}"`);
    expect(legacyTemplates.find(p => p.id === t.id)?.print_layout).toBeUndefined();
  }
});
