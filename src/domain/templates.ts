import type { SheetTemplate } from './schemas';
export const TNDO_TEMPLATE_IDS: Record<number, string> = {
  20: '7d0a0020-2026-4000-8000-000000000001',
  40: '7d0a0040-2026-4000-8000-000000000001',
};

/** TN - DO's own A4 layout. Never alter a persisted version when redesigning a sheet. */
export function createTemplate(count: number, id: string = crypto.randomUUID()): SheetTemplate {
  const columns = count <= 20 ? 2 : 4, rows = Math.ceil(count / columns);
  const columnWidth = .88 / columns, spacing = columns === 2 ? .060 : .034;
  const digitRegion = (digits: number, startX: number) => Array.from({ length: digits }, (_, col) =>
    Array.from({ length: 10 }, (_, digit) => ({ label: String(digit), x: startX + col * .038, y: .155 + digit * .016, radius: .0058 })));
  return {
    id, name: `TN - DO · A4 ${count} câu`, code: `TNDO-A${count}`, version: 1,
    width: 1200, height: 1697,
    anchors: [{ x: .035, y: .025 }, { x: .965, y: .025 }, { x: .965, y: .975 }, { x: .035, y: .975 }],
    questions: Array.from({ length: count }, (_, i) => ({
      number: i + 1, section: 'mcq',
      bubbles: ['A', 'B', 'C', 'D'].map((label, j) => ({
        label, x: .12 + Math.floor(i / rows) * columnWidth + j * spacing,
        y: .395 + (i % rows) * (.325 / Math.max(1, rows - 1)), radius: columns === 2 ? .009 : .0085,
      })),
    })),
    student_region: digitRegion(6, .16), code_region: digitRegion(3, .59),
    qr_region: { x: .755, y: .795, width: .21, height: .15 },
    thresholds: { filled: .5, ambiguous: .22, min_gap: .15 },
    active: false, tested_version: null,
    test_note: 'Bố cục TN - DO: nhóm câu dạng thẻ, mã định danh phía trên, QR cuối trang. Đã có ảnh tổng hợp; cần kiểm thử bản in thực tế.',
  };
}
export const initialTemplates = [20, 40].map(count => createTemplate(count, TNDO_TEMPLATE_IDS[count]));
