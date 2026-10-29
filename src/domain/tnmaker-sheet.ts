import type { Point, SheetTemplate } from './schemas';

export const TNMAKER_WIDTH = 2328;
export const TNMAKER_HEIGHT = 3381;
export const TNMAKER_TEMPLATE_ID = '7d0a2026-0004-4000-8000-000000000001';

const pt = (x: number, y: number, r: number = 20.0): Point & { radius: number } => ({
  x: x / TNMAKER_WIDTH,
  y: y / TNMAKER_HEIGHT,
  radius: r / TNMAKER_WIDTH,
});

export function createTNMakerTemplate(idOrQuestions?: string | number[], maybeQuestions?: number[]): SheetTemplate {
  const id = typeof idOrQuestions === 'string' ? idOrQuestions : TNMAKER_TEMPLATE_ID;
  const activeQuestions = Array.isArray(idOrQuestions) ? idOrQuestions : maybeQuestions;
  // 4 Corner anchors
  const anchors: Point[] = [
    { x: 76.5 / TNMAKER_WIDTH, y: 92.5 / TNMAKER_HEIGHT },
    { x: 2245.0 / TNMAKER_WIDTH, y: 92.5 / TNMAKER_HEIGHT },
    { x: 2245.0 / TNMAKER_WIDTH, y: 3296.5 / TNMAKER_HEIGHT },
    { x: 76.5 / TNMAKER_WIDTH, y: 3296.5 / TNMAKER_HEIGHT },
  ];

  // SBD: 8 columns x 10 digits (0 to 9)
  const sbdColsX = [1593.5, 1641.5, 1689.5, 1737.5, 1784.5, 1831.5, 1878.5, 1925.5];
  const digitsY = [330.5, 398.5, 466.5, 534.5, 603.5, 671.5, 739.5, 807.5, 875.5, 943.5];
  const studentRegion = sbdColsX.map(colX =>
    digitsY.map((y, digit) => ({
      label: String(digit),
      ...pt(colX, y, 19.5),
    }))
  );

  // Mã đề: 4 columns x 10 digits (0 to 9)
  const codeColsX = [2043.5, 2091.5, 2138.5, 2184.5];
  const codeRegion = codeColsX.map(colX =>
    digitsY.map((y, digit) => ({
      label: String(digit),
      ...pt(colX, y, 19.5),
    }))
  );

  // Phần I: 40 câu trắc nghiệm (A, B, C, D)
  const p1BlocksX = [
    [267.5, 370.5, 472.2, 572.5],
    [777.5, 879.5, 981.5, 1082.5],
    [1286.5, 1388.5, 1490.5, 1591.5],
    [1797.5, 1899.5, 2001.5, 2100.5],
  ];
  const p1RowsY = [1280.0, 1332.5, 1384.5, 1436.5, 1489.5, 1544.5, 1596.5, 1646.5, 1698.5, 1753.5];
  const mcqQuestions = Array.from({ length: 40 }, (_, i) => {
    const blockIdx = Math.floor(i / 10);
    const rowIdx = i % 10;
    const xs = p1BlocksX[blockIdx];
    const y = p1RowsY[rowIdx];
    return {
      number: i + 1,
      section: 'mcq' as const,
      bubbles: (['A', 'B', 'C', 'D'] as const).map((label, cIdx) => ({
        label,
        ...pt(xs[cIdx], y, 20.0),
      })),
    };
  });

  // Phần II: 8 câu Đúng / Sai (mỗi câu 4 ý a, b, c, d với Đúng và Sai)
  const p2QX = [
    [267.5, 369.5],
    [473.8, 573.5],
    [779.5, 881.5],
    [983.5, 1085.0],
    [1287.5, 1389.5],
    [1494.5, 1596.5],
    [1799.5, 1901.5],
    [2003.5, 2105.5],
  ];
  const p2RowsY = [2042.0, 2094.5, 2146.5, 2198.5];
  const trueFalseQuestions = Array.from({ length: 8 }, (_, i) => {
    const [trueX, falseX] = p2QX[i];
    return {
      number: 41 + i,
      section: 'true_false' as const,
      bubbles: [],
      true_false_items: (['a', 'b', 'c', 'd'] as const).map((label, itemIdx) => ({
        label,
        true: pt(trueX, p2RowsY[itemIdx], 19.5),
        false: pt(falseX, p2RowsY[itemIdx], 19.5),
      })),
    };
  });

  // Phần III: 6 câu Trả lời ngắn (mỗi câu 4 cột số, dấu âm '-' và dấu phẩy ',')
  const p3QColsX = [
    [251.5, 321.5, 392.4, 462.5],
    [577.1, 646.5, 717.4, 787.5],
    [902.5, 972.5, 1043.4, 1113.5],
    [1228.5, 1300.5, 1371.4, 1441.5],
    [1556.5, 1626.5, 1697.4, 1767.5],
    [1882.5, 1951.5, 2022.4, 2092.8],
  ];
  const p3NegY = 2510.5;
  const p3CommasY = 2562.5;
  const p3DigitsY = [2621.0, 2673.5, 2728.5, 2783.5, 2836.5, 2888.5, 2943.5, 2996.5, 3051.5, 3106.5];
  const shortAnswerQuestions = Array.from({ length: 6 }, (_, i) => {
    const cols = p3QColsX[i];
    return {
      number: 49 + i,
      section: 'short_answer' as const,
      bubbles: [],
      short_answer: {
        negative: pt(cols[0], p3NegY, 19.5),
        decimal: [
          { ...pt(cols[1], p3CommasY, 19.0), after_column: 1 },
          { ...pt(cols[2], p3CommasY, 19.0), after_column: 2 },
          { ...pt(cols[3], p3CommasY, 19.0), after_column: 3 },
        ],
        columns: cols.map(colX =>
          p3DigitsY.map((y, digit) => ({
            label: String(digit),
            ...pt(colX, y, 19.5),
          }))
        ),
      },
    };
  });

  return {
    id,
    name: 'Phiếu TNMaker 2026 (Bộ GD&ĐT)',
    code: 'TNMAKER-2026',
    version: 1,
    width: TNMAKER_WIDTH,
    height: TNMAKER_HEIGHT,
    anchors,
    questions: (() => {
      const all = [...mcqQuestions, ...trueFalseQuestions, ...shortAnswerQuestions];
      return activeQuestions ? all.filter(q => activeQuestions.includes(q.number)) : all;
    })(),
    student_region: studentRegion,
    code_region: codeRegion,
    thresholds: { filled: 0.40, ambiguous: 0.18, min_gap: 0.12 },
    active: true,
    tested_version: 1,
    test_note: 'Phiếu trắc nghiệm chuẩn Bộ GD&ĐT 2025–2026 (TNMaker 2026): 40 câu trắc nghiệm A–D, 8 câu đúng–sai (4 ý/câu), 6 câu trả lời ngắn. SBD 8 chữ số, mã đề 4 chữ số.',
  };
}

export function renderTNMakerSVG(t: SheetTemplate): string {
  const w = t.width;
  const h = t.height;
  const elements: string[] = [];
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
  const text = (x: number, y: number, s: string, size = 26, extra = '') => elements.push(`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="#000" ${extra}>${escape(s)}</text>`);
  const rect = (x: number, y: number, width: number, height: number, extra = '') => elements.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" ${extra}/>`);
  const bubble = (b: { x: number; y: number; radius: number }) => {
    elements.push(`<circle cx="${b.x * w}" cy="${b.y * h}" r="${b.radius * w}" fill="white" stroke="#222" stroke-width="2"/>`);
  };

  // Background
  rect(0, 0, w, h, 'fill="white"');

  // Outer corner anchors (63x63 px)
  for (const a of t.anchors) {
    rect(a.x * w - 31.5, a.y * h - 31.5, 63, 63, 'fill="#000" data-anchor="true"');
  }

  // Header Title
  text(w * 0.08, 140, 'PHIẾU TRẢ LỜI TRẮC NGHIỆM', 46, 'font-weight="bold"');
  text(w * 0.08, 200, 'KỲ THI TỐT NGHIỆP TRUNG HỌC PHỔ THÔNG', 28, 'font-weight="bold"');

  // Candidate Info Box
  rect(w * 0.05, 240, w * 0.58, 730, 'fill="none" stroke="#333" stroke-width="2" rx="4"');
  text(w * 0.07, 300, 'Họ và tên thí sinh: .........................................................................', 26);
  text(w * 0.07, 380, 'Ngày sinh: ......./......./...........   Giới tính: ....................................', 26);
  text(w * 0.07, 460, 'Lớp: .........................   Phòng thi: ............................................', 26);
  text(w * 0.07, 540, 'Hội đồng thi: .............................................................................', 26);
  text(w * 0.07, 620, 'Điểm thi: ...................................................................................', 26);
  text(w * 0.07, 700, 'Môn thi: ....................................   Ngày thi: ......./......./...........', 26);
  text(w * 0.07, 780, 'Chữ ký CBCT 1: ........................   Chữ ký CBCT 2: ....................', 24);
  text(w * 0.07, 860, 'Chữ ký thí sinh: ..........................................................................', 26);

  // SBD Header & Bubbles
  text(1750, 200, '7. Số báo danh', 30, 'font-weight="bold" text-anchor="middle"');
  rect(1565, 235, 385, 80, 'fill="white" stroke="#333" stroke-width="2"');
  if (t.student_region) {
    for (const col of t.student_region) {
      const topB = col[0];
      rect(topB.x * w - 21, 240, 42, 70, 'fill="white" stroke="#999" stroke-width="1.5"');
      for (const b of col) {
        bubble(b);
        text(b.x * w, b.y * h + 7, b.label, 19, 'text-anchor="middle" fill="#666"');
      }
    }
  }

  // Mã đề Header & Bubbles
  text(2110, 200, '8. Mã đề thi', 30, 'font-weight="bold" text-anchor="middle"');
  rect(2015, 235, 195, 80, 'fill="white" stroke="#333" stroke-width="2"');
  if (t.code_region) {
    for (const col of t.code_region) {
      const topB = col[0];
      rect(topB.x * w - 21, 240, 42, 70, 'fill="white" stroke="#999" stroke-width="1.5"');
      for (const b of col) {
        bubble(b);
        text(b.x * w, b.y * h + 7, b.label, 19, 'text-anchor="middle" fill="#666"');
      }
    }
  }

  // Section Divider: Phần I
  rect(w * 0.045, 1070, w * 0.91, 715, 'fill="none" stroke="#222" stroke-width="2" rx="4"');
  rect(w * 0.045, 1070, 360, 50, 'fill="#eee" stroke="#222" stroke-width="1.5"');
  text(w * 0.06, 1107, 'PHẦN I (40 câu)', 30, 'font-weight="bold"');

  // Part 1 Questions
  const mcq = t.questions.filter(q => q.section === 'mcq');
  for (let block = 0; block < 4; block++) {
    const questions = mcq.slice(block * 10, (block + 1) * 10);
    if (!questions.length) continue;
    for (let c = 0; c < 4; c++) {
      const b = questions[0].bubbles[c];
      text(b.x * w, 1235, b.label, 26, 'font-weight="bold" text-anchor="middle"');
    }
    for (const q of questions) {
      text(q.bubbles[0].x * w - 45, q.bubbles[0].y * h + 8, String(q.number).padStart(2, '0'), 24, 'font-weight="bold" text-anchor="end"');
      for (const b of q.bubbles) {
        bubble(b);
      }
    }
  }

  // Section Divider: Phần II
  rect(w * 0.045, 1830, w * 0.91, 400, 'fill="none" stroke="#222" stroke-width="2" rx="4"');
  rect(w * 0.045, 1830, 360, 50, 'fill="#eee" stroke="#222" stroke-width="1.5"');
  text(w * 0.06, 1867, 'PHẦN II (8 câu Đ/S)', 30, 'font-weight="bold"');

  const trueFalse = t.questions.filter(q => q.section === 'true_false');
  for (let i = 0; i < trueFalse.length; i++) {
    const q = trueFalse[i];
    if (!q.true_false_items) continue;
    const item0 = q.true_false_items[0];
    const qNum = q.number - 40;
    text((item0.true.x + item0.false.x) * w / 2, 1945, `Câu ${qNum}`, 26, 'font-weight="bold" text-anchor="middle"');
    text(item0.true.x * w, 1995, 'Đ', 22, 'font-weight="bold" text-anchor="middle"');
    text(item0.false.x * w, 1995, 'S', 22, 'font-weight="bold" text-anchor="middle"');
    for (const item of q.true_false_items) {
      text(item.true.x * w - 42, item.true.y * h + 7, `${item.label})`, 22, 'text-anchor="end"');
      bubble(item.true);
      bubble(item.false);
    }
  }

  // Section Divider: Phần III
  rect(w * 0.045, 2275, w * 0.91, 950, 'fill="none" stroke="#222" stroke-width="2" rx="4"');
  rect(w * 0.045, 2275, 420, 50, 'fill="#eee" stroke="#222" stroke-width="1.5"');
  text(w * 0.06, 2312, 'PHẦN III (6 câu TL ngắn)', 30, 'font-weight="bold"');

  const shortAnswer = t.questions.filter(q => q.section === 'short_answer');
  for (let i = 0; i < shortAnswer.length; i++) {
    const q = shortAnswer[i];
    if (!q.short_answer) continue;
    const qNum = q.number - 48;
    const midX = (q.short_answer.columns[0][0].x + q.short_answer.columns[3][0].x) * w / 2;
    text(midX, 2420, `Câu ${qNum}`, 26, 'font-weight="bold" text-anchor="middle"');

    // Negative
    bubble(q.short_answer.negative);
    text(q.short_answer.negative.x * w - 38, q.short_answer.negative.y * h + 8, '−', 24, 'text-anchor="end" font-weight="bold"');

    // Decimal commas
    for (const d of q.short_answer.decimal) {
      bubble(d);
      text(d.x * w - 35, d.y * h + 7, ',', 24, 'text-anchor="end" font-weight="bold"');
    }

    // Digits
    for (let c = 0; c < q.short_answer.columns.length; c++) {
      const col = q.short_answer.columns[c];
      for (const b of col) {
        bubble(b);
        text(b.x * w, b.y * h + 7, b.label, 19, 'text-anchor="middle" fill="#666"');
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(t.name)}">${elements.join('')}</svg>`;
}
