import { expect, it } from 'vitest';
import { createTemplate, TNDO_TEMPLATE_IDS } from '../src/domain/templates';
import { renderSheetSVG } from '../src/domain/sheet-renderer';

it('uses distinct TN - DO A4 layouts and identities for new sheets', () => {
  const small = createTemplate(20, TNDO_TEMPLATE_IDS[20]), large = createTemplate(40, TNDO_TEMPLATE_IDS[40]);
  expect(new Set(small.questions.map(q => q.bubbles[0].x)).size).toBe(2);
  expect(new Set(large.questions.map(q => q.bubbles[0].x)).size).toBe(4);
  expect(small.qr_region!.y).toBeGreaterThan(.75);
  expect(small.width / small.height).toBeCloseTo(210 / 297, 3);
  expect([small.code, large.code]).toEqual(['TNDO-A20', 'TNDO-A40']);
});

it('renders printable geometry from the template and escapes user-provided text', () => {
  const template = createTemplate(20); template.name = '<script>alert(1)</script>';
  const svg = renderSheetSVG(template), bubble = template.questions[0].bubbles[0];
  expect(svg).toContain(`cx="${bubble.x * template.width}"`);
  expect(svg).toContain('TN - DO');
  expect(svg).toContain('&lt;script&gt;');
  expect(svg).not.toContain('<script>');
  expect(svg).not.toMatch(/tnmaker/i);
});
