import { describe, expect, it } from 'vitest';
import { createTNMakerTemplate, renderTNMakerSVG } from '../src/domain/tnmaker-sheet';
import { templateSchema } from '../src/domain/schemas';
import { recognize, recognizeDigits, type Pixels } from '../src/domain/omr-engine';

describe('TNMaker 2026 Sheet Template', () => {
  it('strictly conforms to templateSchema', () => {
    const t = createTNMakerTemplate();
    const parsed = templateSchema.safeParse(t);
    expect(parsed.success).toBe(true);
  });

  it('contains 40 MCQ, 8 True/False, and 6 Short Answer questions', () => {
    const t = createTNMakerTemplate();
    expect(t.questions).toHaveLength(54);
    expect(t.questions.filter(q => q.section === 'mcq')).toHaveLength(40);
    expect(t.questions.filter(q => q.section === 'true_false')).toHaveLength(8);
    expect(t.questions.filter(q => q.section === 'short_answer')).toHaveLength(6);
    expect(t.student_region).toHaveLength(8);
    expect(t.code_region).toHaveLength(4);
  });

  it('renders valid SVG with all 4 anchors and section headers', () => {
    const t = createTNMakerTemplate();
    const svg = renderTNMakerSVG(t);
    expect(svg).toContain('<svg');
    expect(svg).toContain('data-anchor="true"');
    expect(svg).toContain('PHẦN I');
    expect(svg).toContain('PHẦN II');
    expect(svg).toContain('PHẦN III');
    expect(svg).toContain('7. Số báo danh');
    expect(svg).toContain('8. Mã đề thi');
  });

  it('accurately recognizes filled bubbles on simulated pixel buffer', () => {
    const t = createTNMakerTemplate();
    const pixels: Pixels = {
      width: t.width,
      height: t.height,
      data: new Uint8Array(t.width * t.height * 4).fill(255),
    };

    const fillBubble = (b: { x: number; y: number; radius: number }) => {
      const cx = b.x * t.width;
      const cy = b.y * t.height;
      const r = b.radius * t.width * 0.9;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 < r ** 2) {
            pixels.data.fill(0, (y * t.width + x) * 4, (y * t.width + x) * 4 + 3);
          }
        }
      }
    };

    // Fill SBD: 01234567
    const sbd = '01234567';
    t.student_region!.forEach((col, i) => fillBubble(col[Number(sbd[i])]));
    const detectedSbd = recognizeDigits(pixels, t.student_region, t.thresholds);
    expect(detectedSbd).toBe('01234567');

    // Fill Code: 0102
    const code = '0102';
    t.code_region!.forEach((col, i) => fillBubble(col[Number(code[i])]));
    const detectedCode = recognizeDigits(pixels, t.code_region, t.thresholds);
    expect(detectedCode).toBe('0102');

    // Fill Part I: Q1=A, Q2=B, Q3=C, Q4=D
    fillBubble(t.questions[0].bubbles[0]);
    fillBubble(t.questions[1].bubbles[1]);
    fillBubble(t.questions[2].bubbles[2]);
    fillBubble(t.questions[3].bubbles[3]);

    // Fill Part II: Q41=TFTF
    const q41 = t.questions[40].true_false_items!;
    fillBubble(q41[0].true);
    fillBubble(q41[1].false);
    fillBubble(q41[2].true);
    fillBubble(q41[3].false);

    // Fill Part III: Q49=-1.25
    const q49 = t.questions[48].short_answer!;
    fillBubble(q49.negative);
    fillBubble(q49.decimal[0]); // after col 0
    fillBubble(q49.columns[0][1]);
    fillBubble(q49.columns[1][2]);
    fillBubble(q49.columns[2][5]);

    const marks = recognize(pixels, t);
    expect(marks[0].selected).toEqual(['A']);
    expect(marks[1].selected).toEqual(['B']);
    expect(marks[2].selected).toEqual(['C']);
    expect(marks[3].selected).toEqual(['D']);
    expect(marks[40].selected).toEqual(['TFTF']);
    expect(marks[48].selected).toEqual(['-1.25']);
  });
});
