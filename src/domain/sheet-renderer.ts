import type { SheetTemplate } from './schemas';
import { createMixedSheet, renderMixedSheetSVG } from './mixed-sheet';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

/** Printable vector source; all OMR geometry comes from the selected immutable template. */
export function renderSheetSVG(template: SheetTemplate): string {
  if (template.code === 'TNDO-3P-2026' || template.code.startsWith('TNDO-3P-2026-COPY-')) {
    const design = createMixedSheet();
    return renderMixedSheetSVG({
      ...design, width: template.width, height: template.height, anchors: template.anchors,
      student_region: template.student_region ?? design.student_region,
      code_region: template.code_region ?? design.code_region,
      sections: { ...design.sections, mcq: design.sections.mcq.map(q => ({ ...q,
        bubbles: q.bubbles.map(b => ({ ...b, ...template.questions.find(tq => tq.number === q.number)?.bubbles.find(tb => tb.label === b.label), label: b.label })),
      })), true_false: design.sections.true_false.map(q => ({ ...q, items: template.questions.find(tq => tq.number === 40 + q.number)?.true_false_items ?? q.items })),
      short_answer: design.sections.short_answer.map(q => ({ ...q, ...template.questions.find(tq => tq.number === 48 + q.number)?.short_answer })) },
    });
  }
  const t = template, w = t.width, h = t.height, elements: string[] = [];
  const text = (x: number, y: number, value: string, size = 17, extra = '') =>
    elements.push(`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="#172f3a" ${extra}>${escape(value)}</text>`);
  const rect = (x: number, y: number, width: number, height: number, extra = '') => elements.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" ${extra}/>`);
  const bubble = (b: { x: number; y: number; radius: number }) => elements.push(`<circle cx="${b.x * w}" cy="${b.y * h}" r="${b.radius * w}" fill="white" stroke="#344b54" stroke-width="1.3"/>`);
  rect(0, 0, w, h, 'fill="white"');
  rect(.065 * w, .043 * h, .87 * w, .047 * h, 'rx="10" fill="#163d49"');
  text(.085 * w, .074 * h, 'TN - DO', 36, 'font-weight="700" style="fill:white"');
  text(.91 * w, .073 * h, `PHIẾU TRẢ LỜI · ${t.questions.length} CÂU`, 21, 'text-anchor="end" style="fill:white"');
  text(.075 * w, .112 * h, 'Họ và tên: ....................................................   Lớp: ................   Kỳ thi: ........................................', 17);
  text(.15 * w, .13 * h, 'SỐ BÁO DANH', 17, 'font-weight="700"');
  text(.58 * w, .13 * h, 'MÃ ĐỀ', 17, 'font-weight="700"');
  for (const region of [t.student_region, t.code_region]) for (const col of region ?? []) {
    const zero = col.find(b => b.label === '0');
    if (zero) {
      // Handwriting cells sit above the zero row without moving OMR targets.
      rect(zero.x * w - .013 * w, zero.y * h - zero.radius * w - .017 * h, .026 * w, .014 * h, 'fill="white" stroke="#76858a" stroke-width="1.2"');
    }
    for (const b of col) {
      bubble(b);
      text(b.x * w - b.radius * w - 13, b.y * h + 3, b.label, 9, 'text-anchor="end" style="fill:#76858a"');
    }
  }
  text(.075 * w, .335 * h, 'PHẦN TRẢ LỜI', 20, 'font-weight="700"');
  text(.925 * w, .335 * h, 'Mỗi câu chọn một phương án', 15, 'text-anchor="end"');
  const groups = new Map<number, typeof t.questions>();
  for (const q of t.questions) { const group = Math.round(q.bubbles[0].x * 10000); groups.set(group, [...(groups.get(group) ?? []), q]); }
  for (const group of groups.values()) {
    const first = group[0], last = group[group.length - 1], left = first.bubbles[0].x * w - 58, right = Math.max(...group.flatMap(q => q.bubbles.map(b => (b.x + b.radius) * w))) + 22;
    rect(left, .355 * h, right - left, .402 * h, 'rx="12" fill="white" stroke="#cad3d5" stroke-width="1.5"');
    text(left + 12, .373 * h, `${first.number}–${last.number}`, 12, 'font-weight="700"');
    for (const b of first.bubbles) text(b.x * w, .379 * h, b.label, 13, 'text-anchor="middle"');
    for (const q of group) { text(left + 16, q.bubbles[0].y * h + 5, String(q.number).padStart(2, '0'), 15, 'font-weight="700"'); q.bubbles.forEach(bubble); }
  }
  elements.push(`<path d="M${.075 * w} ${.785 * h}H${.72 * w}" fill="none" stroke="#a3afb3"/>`);
  text(.075 * w, .815 * h, 'HƯỚNG DẪN', 18, 'font-weight="700"');
  text(.075 * w, .84 * h, '• Tô kín một ô cho mỗi câu; không đánh dấu lên mốc góc.', 15);
  text(.075 * w, .863 * h, '• Ghi đúng SBD và mã đề. Tẩy sạch ô nếu đổi lựa chọn.', 15);
  text(.075 * w, .886 * h, '• Chụp trọn bốn mốc, giữ phiếu phẳng và đủ ánh sáng.', 15);
  text(.075 * w, .929 * h, `${t.code} · v${t.version} · Thiết kế phiếu TN - DO`, 13);
  if (t.qr_region) {
    const r = t.qr_region; rect(r.x * w, r.y * h, r.width * w, r.height * h, 'rx="8" fill="white" stroke="#d3dadd" stroke-dasharray="6 6"');
    text((r.x + r.width / 2) * w, (r.y + r.height / 2) * h, 'VÙNG QR', 15, 'text-anchor="middle" style="fill:#819197"');
  }
  for (const a of t.anchors) rect(a.x * w - 10, a.y * h - 10, 20, 20, 'fill="#000"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(t.name)}">${elements.join('')}</svg>`;
}
