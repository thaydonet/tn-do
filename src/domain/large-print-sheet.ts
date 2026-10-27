import type { SheetTemplate } from './schemas';

// All layout dimensions are millimetres on the full A4 page. OMR uses the same geometry.
export const PRINT_MARGIN_MM = 25;
export const PRINT_ANCHOR_MM = 5.25; // Previous 20 px at 1200 px / 210 mm, enlarged by 1.5.
const point = (x: number, y: number, radius: number) => ({ x: x / 210, y: y / 297, radius: radius / 210 });

export function createLargePrintTemplate(base: SheetTemplate): SheetTemplate {
  const mixed = base.questions.some(q => q.section !== 'mcq'), count = base.questions.length;
  const digitRadius = mixed ? 1.89 : 2.436, pitch = mixed ? 4.8 : 6;
  const digits = (length: number, x: number) => Array.from({ length }, (_, col) => Array.from({ length: 10 }, (_, digit) => ({ label: String(digit), ...point(x + col * (mixed ? 4.8 : 6.4), 66 + digit * pitch, digitRadius) })));
  const edge = PRINT_MARGIN_MM + PRINT_ANCHOR_MM / 2;
  return {
    ...base, version: base.version + 1, print_layout: 'a4-25mm', active: false, tested_version: null,
    anchors: [{ x: edge / 210, y: edge / 297 }, { x: 1 - edge / 210, y: edge / 297 }, { x: 1 - edge / 210, y: 1 - edge / 297 }, { x: edge / 210, y: 1 - edge / 297 }],
    student_region: digits(mixed ? 8 : 6, 100), code_region: digits(mixed ? 4 : 3, 151),
    qr_region: mixed ? undefined : { x: 143 / 210, y: 226 / 297, width: 35 / 210, height: 35 / 297 },
    questions: base.questions.map(q => {
      if (q.section === 'mcq') {
        const groups = mixed || count > 20 ? 4 : 2, group = Math.floor((q.number - 1) / 10), row = (q.number - 1) % 10;
        const left = 33 + group * (groups === 4 ? 37.5 : 77);
        return { ...q, bubbles: q.bubbles.map((b, i) => ({ ...b, ...point(left + (groups === 4 ? 10 : 14) + i * (groups === 4 ? 7.6 : 12), (mixed ? 130 : 145) + row * (mixed ? 3.5 : 6.7), b.radius * 210) })) };
      }
      if (q.true_false_items) {
        const index = q.number - 41, left = 33 + index % 4 * 37.5, top = 177 + Math.floor(index / 4) * 24;
        return { ...q, true_false_items: q.true_false_items.map((item, i) => ({ ...item, true: point(left + 15, top + 8 + i * 3.5, item.true.radius * 210), false: point(left + 28, top + 8 + i * 3.5, item.false.radius * 210) })) };
      }
      if (q.short_answer) {
        const left = 33 + (q.number - 49) * 25;
        return { ...q, short_answer: {
          negative: point(left + 4, 242, q.short_answer.negative.radius * 210),
          decimal: q.short_answer.decimal.map((b, i) => ({ ...b, ...point(left + 4 + (i + 1) * 5.3, 242, b.radius * 210) })),
          columns: q.short_answer.columns.map((col, i) => col.map((b, digit) => ({ ...b, ...point(left + 4 + i * 5.3, 245.5 + digit * 2.65, b.radius * 210) }))),
        } };
      }
      return q;
    }),
    test_note: 'A4 lề 25 mm bốn phía; mốc đen cạnh 5,25 mm (×1,5); đường kính ô SBD/mã đề ×2. Cần kiểm thử bản in thực tế trước khi kích hoạt.',
  };
}

export function renderLargePrintSVG(t: SheetTemplate): string {
  const elements: string[] = [], sx = t.width / 210, sy = t.height / 297, mixed = t.questions.some(q => q.section !== 'mcq');
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
  const text = (x: number, y: number, s: string, size = 2.5, extra = '') => elements.push(`<text x="${x * sx}" y="${y * sy}" font-family="Arial,sans-serif" font-size="${size * sx}" fill="#173b48" ${extra}>${escape(s)}</text>`);
  const rect = (x: number, y: number, w: number, h: number, extra = '') => elements.push(`<rect x="${x * sx}" y="${y * sy}" width="${w * sx}" height="${h * sy}" ${extra}/>`);
  const bubble = (b: { x: number; y: number; radius: number }) => {
    elements.push(`<circle cx="${b.x * t.width}" cy="${b.y * t.height}" r="${b.radius * t.width}" fill="white" stroke="#273d45" stroke-width="1.2"/>`);
  };
  const section = (y: number, title: string, desc: string) => {
    rect(33, y - 3.8, 149, 5.5, 'rx="3" fill="#eaf0f1"');
    text(35, y, title, 2.8, 'font-weight="700"'); text(180, y, desc, 1.9, 'text-anchor="end"');
  };
  rect(0, 0, 210, 297, 'fill="white"');
  rect(33, 26, 144, 12, 'rx="5" fill="#173d49"');
  text(36, 34, 'TN - DO', 5.7, 'font-weight="700" style="fill:white"');
  text(174, 32, mixed ? 'PHIẾU TRẢ LỜI · 2026' : `PHIẾU TRẢ LỜI · ${t.questions.length} CÂU`, 3.4, 'font-weight="700" text-anchor="end" style="fill:white"');
  text(174, 36, `${t.code} · v${t.version} · A4 · LỀ 25 MM`, 2, 'text-anchor="end" style="fill:white"');
  text(33, 46, 'THÔNG TIN THÍ SINH', 2.8, 'font-weight="700"');
  for (const [i, label] of ['Họ tên: ....................................', 'Lớp: ............... Phòng: ............', 'Kỳ thi: ......................................', 'Môn: .........................................', 'Ngày: ......./......./.......', 'Chữ ký: .....................................'].entries()) text(33, 56 + i * 8, label, 2.5);
  for (const [region, title] of [[t.student_region, 'SỐ BÁO DANH'], [t.code_region, 'MÃ ĐỀ']] as const) {
    if (!region?.length) continue;
    text((region[0][0].x + region.at(-1)![0].x) * 105, 53, title, 2.8, 'font-weight="700" text-anchor="middle"');
    for (const col of region) {
      const zero = col[0], x = zero.x * 210, radius = zero.radius * 210;
      rect(x - radius, 56, radius * 2, 5, 'fill="white" stroke="#76858a" stroke-width="1"');
      for (const b of col) bubble(b);
    }
    // Row numbers remain outside the sampling circles, so printed ink cannot look like a mark.
    for (const b of region[0]) text((b.x - b.radius) * 210 - .9, b.y * 297 + .75, b.label, 2.1, 'text-anchor="end"');
  }
  section(mixed ? 119 : 134, mixed ? 'I. TRẮC NGHIỆM' : 'PHẦN TRẢ LỜI', 'Mỗi câu chọn một đáp án A, B, C hoặc D');
  const mcq = t.questions.filter(q => q.section === 'mcq'), groups = new Map<number, typeof mcq>();
  for (const q of mcq) { const group = Math.floor((q.number - 1) / 10); groups.set(group, [...(groups.get(group) ?? []), q]); }
  for (const [index, questions] of groups) {
    const narrow = mixed || mcq.length > 20, left = 33 + index * (narrow ? 37.5 : 77), top = mixed ? 123 : 139;
    rect(left, top, narrow ? 35 : 69, mixed ? 43 : 74, 'rx="5" fill="white" stroke="#bdcacc" stroke-width="1"');
    for (const b of questions[0].bubbles) text(b.x * 210, top + 3.5, b.label, 2, 'text-anchor="middle"');
    for (const q of questions) { text(left + 1.5, q.bubbles[0].y * 297 + .8, String(q.number).padStart(2, '0'), 2.3, 'font-weight="700"'); q.bubbles.forEach(b => bubble(b)); }
  }
  if (mixed) {
    section(173, 'II. ĐÚNG – SAI', 'Mỗi ý a–d: chọn Đúng hoặc Sai');
    for (const q of t.questions.filter(q => q.true_false_items)) {
      const index = q.number - 41, left = 33 + index % 4 * 37.5, top = 177 + Math.floor(index / 4) * 24;
      rect(left, top, 35, 21, 'rx="5" fill="white" stroke="#bdcacc" stroke-width="1"');
      text(left + 1.5, top + 4, `Câu ${index + 1}`, 2.2, 'font-weight="700"'); text(left + 15, top + 4, 'Đúng', 2, 'text-anchor="middle"'); text(left + 28, top + 4, 'Sai', 2, 'text-anchor="middle"');
      for (const item of q.true_false_items!) { text(left + 3, item.true.y * 297 + .7, item.label + ')', 2.2); bubble(item.true); bubble(item.false); }
    }
    section(230, 'III. TRẢ LỜI NGẮN', 'Bốn chữ số · dấu âm ở cột đầu · dấu phẩy ở giữa cột');
    for (const q of t.questions.filter(q => q.short_answer)) {
      const left = 33 + (q.number - 49) * 25, answer = q.short_answer!;
      rect(left, 233, 21.5, 38, 'rx="4" fill="white" stroke="#bdcacc" stroke-width="1"');
      text(left + 2, 237, `Câu ${q.number - 48}`, 2.5, 'font-weight="700"');
      bubble(answer.negative); text(answer.negative.x * 210, 242.6, '−', 1.8, 'text-anchor="middle"');
      for (const b of answer.decimal) { bubble(b); text(b.x * 210, 242.6, ',', 1.8, 'text-anchor="middle"'); }
      for (const col of answer.columns) for (const b of col) {
        bubble(b); text(b.x * 210 - b.radius * 210 - .4, b.y * 297 + .6, b.label, 1.4, 'text-anchor="end"');
      }
    }
  } else {
    text(33, 222, 'HƯỚNG DẪN', 3, 'font-weight="700"');
    for (const [i, s] of ['Tô kín một ô cho mỗi câu.', 'Tô đúng SBD và mã đề; giữ số 0 ở đầu.', 'Tẩy sạch nếu đổi lựa chọn.', 'Giữ phiếu phẳng, chụp đủ bốn mốc.'].entries()) text(33, 229 + i * 5.5, '• ' + s, 2.5);
    if (t.qr_region) { const r = t.qr_region; rect(r.x * 210, r.y * 297, r.width * 210, r.height * 297, 'fill="white" stroke="#bdcacc" stroke-dasharray="5 5"'); text((r.x + r.width / 2) * 210, (r.y + r.height / 2) * 297, 'VÙNG QR', 2.5, 'text-anchor="middle"'); }
    text(33, 263, `${t.code} · v${t.version} · In A4, tỷ lệ 100%`, 2.1);
  }
  for (const a of t.anchors) rect(a.x * 210 - PRINT_ANCHOR_MM / 2, a.y * 297 - PRINT_ANCHOR_MM / 2, PRINT_ANCHOR_MM, PRINT_ANCHOR_MM, 'fill="#000" data-anchor="true"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t.width}" height="${t.height}" viewBox="0 0 ${t.width} ${t.height}" role="img" aria-label="${escape(t.name)}">${elements.join('')}</svg>`;
}
