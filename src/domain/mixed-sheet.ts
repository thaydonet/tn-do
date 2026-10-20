import { z } from 'zod';

const position = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), radius: z.number().positive().max(.02) });
export const mixedSheetSchema = z.object({
  schema_version: z.literal('1.0'), kind: z.literal('three_part_print'),
  id: z.uuid(), code: z.literal('TNDO-3P-2026'), version: z.literal(1),
  name: z.string(), width: z.number().int().positive(), height: z.number().int().positive(),
  grading_support: z.literal('three_part'),
  anchors: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).length(4),
  student_region: z.array(z.array(position.extend({ label: z.string() })).length(10)).length(8),
  code_region: z.array(z.array(position.extend({ label: z.string() })).length(10)).length(4),
  sections: z.object({
    mcq: z.array(z.object({ number: z.number().int(), bubbles: z.array(position.extend({ label: z.enum(['A', 'B', 'C', 'D']) })).length(4) })).length(40),
    true_false: z.array(z.object({ number: z.number().int(), items: z.array(z.object({ label: z.enum(['a', 'b', 'c', 'd']), true: position, false: position })).length(4) })).length(8),
    short_answer: z.array(z.object({ number: z.number().int(), negative: position, decimal: z.array(position.extend({ after_column: z.number().int() })).length(3), columns: z.array(z.array(position.extend({ label: z.string() })).length(10)).length(4) })).length(6),
  }),
});
export type MixedSheetDesign = z.infer<typeof mixedSheetSchema>;

export function createMixedSheet(): MixedSheetDesign {
  const digits = (count: number, x: number) => Array.from({ length: count }, (_, col) => Array.from({ length: 10 }, (_, digit) => ({ label: String(digit), x: x + col * .033, y: .137 + digit * .0105, radius: .0045 })));
  return mixedSheetSchema.parse({
    schema_version: '1.0', kind: 'three_part_print', id: '7d0a2026-0003-4000-8000-000000000001', code: 'TNDO-3P-2026', version: 1,
    name: 'TN - DO · 2026 · 40 trắc nghiệm / 8 đúng–sai / 6 trả lời ngắn', width: 1200, height: 1697, grading_support: 'three_part',
    anchors: [{ x: .035, y: .025 }, { x: .965, y: .025 }, { x: .965, y: .975 }, { x: .035, y: .975 }],
    student_region: digits(8, .46), code_region: digits(4, .81),
    sections: {
      mcq: Array.from({ length: 40 }, (_, i) => ({ number: i + 1, bubbles: ['A', 'B', 'C', 'D'].map((label, col) => ({ label, x: .12 + Math.floor(i / 10) * .22 + col * .035, y: .31 + (i % 10) * .0165, radius: .0068 })) })),
      true_false: Array.from({ length: 8 }, (_, i) => ({ number: i + 1, items: ['a', 'b', 'c', 'd'].map((label, row) => ({ label, true: { x: .075 + (i % 4) * .22 + .09, y: .53 + Math.floor(i / 4) * .103 + .032 + row * .014, radius: .0065 }, false: { x: .075 + (i % 4) * .22 + .16, y: .53 + Math.floor(i / 4) * .103 + .032 + row * .014, radius: .0065 } })) })),
      short_answer: Array.from({ length: 6 }, (_, i) => {
        const left = .075 + i * (.86 / 6), x = left + .028;
        return { number: i + 1, negative: { x, y: .801, radius: .0055 }, decimal: [1, 2, 3].map(after_column => ({ x: x + after_column * .028, y: .814, radius: .0055, after_column })), columns: Array.from({ length: 4 }, (_, col) => Array.from({ length: 10 }, (_, digit) => ({ label: String(digit), x: x + col * .028, y: .831 + digit * .0113, radius: .0055 }))) };
      }),
    },
  });
}

export function renderMixedSheetSVG(d: MixedSheetDesign): string {
  mixedSheetSchema.parse(d);
  const w = d.width, h = d.height, elements: string[] = [];
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
  const text = (x: number, y: number, value: string, size = 13, extra = '') => elements.push(`<text x="${x * w}" y="${y * h}" font-family="Arial,sans-serif" font-size="${size}" fill="#173b48" ${extra}>${escape(value)}</text>`);
  const rect = (x: number, y: number, width: number, height: number, extra = '') => elements.push(`<rect x="${x * w}" y="${y * h}" width="${width * w}" height="${height * h}" ${extra}/>`);
  const bubble = (b: { x: number; y: number; radius: number }) => elements.push(`<circle cx="${b.x * w}" cy="${b.y * h}" r="${b.radius * w}" fill="white" stroke="#273d45" stroke-width="1.2"/>`);
  const section = (y: number, title: string, desc: string) => { rect(.065, y - .017, .87, .025, 'rx="5" fill="#eaf0f1"'); text(.078, y, title, 17, 'font-weight="700"'); text(.92, y, desc, 12, 'text-anchor="end"'); };
  rect(0, 0, 1, 1, 'fill="white"');
  rect(.065, .043, .87, .047, 'rx="10" fill="#173d49"');
  text(.085, .074, 'TN - DO', 34, 'font-weight="700" style="fill:white"');
  text(.915, .07, 'PHIẾU TRẢ LỜI · 2026', 22, 'font-weight="700" text-anchor="end" style="fill:white"');
  text(.915, .083, '40 TRẮC NGHIỆM / 8 ĐÚNG–SAI / 6 TRẢ LỜI NGẮN', 11, 'text-anchor="end" style="fill:white"');
  text(.075, .115, 'THÔNG TIN THÍ SINH', 15, 'font-weight="700"');
  text(.075, .139, 'Họ tên: ................................................', 15);
  text(.075, .162, 'Lớp: ..................  Phòng: .....................', 15);
  text(.075, .185, 'Kỳ thi: ................................................', 15);
  text(.075, .208, 'Môn: ...................  Ngày: ......./......./.......', 15);
  text(.075, .233, 'Chữ ký: ..............................................', 15);
  text(.565, .115, 'SỐ BÁO DANH', 15, 'text-anchor="middle" font-weight="700"');
  text(.86, .115, 'MÃ ĐỀ', 15, 'text-anchor="middle" font-weight="700"');
  for (const region of [d.student_region, d.code_region]) for (const col of region) {
    rect(col[0].x - .011, .119, .022, .011, 'fill="white" stroke="#b4c0c4"');
    for (const b of col) { bubble(b); text(b.x - .011, b.y + .002, b.label, 8, 'text-anchor="end" style="fill:#74858a"'); }
  }
  section(.271, '01  TRẮC NGHIỆM', 'Mỗi câu chọn một đáp án A, B, C hoặc D');
  for (let group = 0; group < 4; group++) {
    const questions = d.sections.mcq.slice(group * 10, (group + 1) * 10), left = .075 + group * .22;
    rect(left, .285, .205, .196, 'rx="8" fill="white" stroke="#c3cfd1"');
    for (const b of questions[0].bubbles) text(b.x, .299, b.label, 12, 'text-anchor="middle"');
    for (const q of questions) { text(left + .011, q.bubbles[0].y + .003, String(q.number).padStart(2, '0'), 13, 'font-weight="700"'); q.bubbles.forEach(bubble); }
  }
  section(.515, '02  ĐÚNG – SAI', 'Mỗi ý a, b, c, d: tô một ô Đúng hoặc Sai');
  for (const q of d.sections.true_false) {
    const left = .075 + ((q.number - 1) % 4) * .22, top = .53 + Math.floor((q.number - 1) / 4) * .103;
    rect(left, top, .205, .092, 'rx="8" fill="white" stroke="#c3cfd1"');
    text(left + .012, top + .018, `Câu ${q.number}`, 13, 'font-weight="700"');
    text(q.items[0].true.x, top + .018, 'Đúng', 12, 'text-anchor="middle"'); text(q.items[0].false.x, top + .018, 'Sai', 12, 'text-anchor="middle"');
    for (const item of q.items) { text(left + .022, item.true.y + .003, `${item.label})`, 12); bubble(item.true); bubble(item.false); }
  }
  section(.755, '03  TRẢ LỜI NGẮN', 'Bốn cột chữ số · dấu âm và dấu thập phân tô riêng');
  for (const q of d.sections.short_answer) {
    const left = .075 + (q.number - 1) * (.86 / 6);
    rect(left, .769, .136, .179, 'rx="7" fill="white" stroke="#c3cfd1"');
    text(left + .012, .785, `Câu ${q.number}`, 14, 'font-weight="700"');
    text(left + .009, .804, '−', 12); bubble(q.negative);
    text(left + .009, .817, ',', 13);
    for (const dot of q.decimal) bubble(dot);
    for (const col of q.columns) for (const b of col) { bubble(b); text(b.x - .008, b.y + .002, b.label, 8, 'text-anchor="end" style="fill:#74858a"'); }
  }
  text(.075, .961, 'TNDO-3P-2026 · v1 · In A4, tỷ lệ 100% · Tô kín ô, tẩy sạch nếu đổi lựa chọn.', 11);
  text(.925, .961, 'Thiết kế phiếu TN - DO', 11, 'text-anchor="end"');
  for (const a of d.anchors) rect(a.x - 10 / w, a.y - 10 / h, 20 / w, 20 / h, 'fill="#000"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Phiếu TN - DO ba phần">${elements.join('')}</svg>`;
}
