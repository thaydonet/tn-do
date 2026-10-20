import type { Point, Recognition, SheetTemplate } from './schemas';
import { normalizeNumericAnswer } from './answer-format';
export interface Pixels { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export function fillRatio(image: Pixels, center: Point & { radius: number }) {
  const cx = center.x * image.width, cy = center.y * image.height, radius = center.radius * image.width * .65;
  if (cx - radius < 0 || cy - radius < 0 || cx + radius >= image.width || cy + radius >= image.height) throw new Error('Vùng nhận diện nằm ngoài ảnh');
  let dark = 0, count = 0;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
    const i = (y * image.width + x) * 4;
    if (image.data[i] < 128) dark++;
    count++;
  }
  return count ? dark / count : 0;
}
export function classify(ratios: number[], labels: string[], thresholds: SheetTemplate['thresholds']): Omit<Recognition, 'number'> {
  const selected = labels.filter((_, i) => ratios[i] >= thresholds.filled), sorted = [...ratios].sort((a, b) => b - a), max = sorted[0] ?? 0, gap = max - (sorted[1] ?? 0);
  const state = selected.length > 1 ? 'multiple' : max < thresholds.ambiguous ? 'blank' : selected.length === 0 || gap < thresholds.min_gap || ratios.some(r => r >= thresholds.ambiguous && r < thresholds.filled) ? 'review' : 'marked';
  return { selected, state, confidence: state === 'marked' ? Math.min(1, gap) : state === 'blank' ? 1 - max : gap, ratios };
}
export function recognize(image: Pixels, template: SheetTemplate): Recognition[] {
  if (image.width !== template.width || image.height !== template.height) throw new Error('Ảnh chưa được căn chỉnh theo template');
  const read = (bubbles: (Point & { radius: number })[], labels: string[]) => classify(bubbles.map(b => fillRatio(image, b)), labels, template.thresholds);
  return template.questions.map(q => {
    if (q.true_false_items) {
      const items = q.true_false_items.map(item => read([item.true, item.false], ['T', 'F']));
      const text = items.map(item => item.selected.length === 1 ? item.selected[0] : '_').join('');
      return { number: q.number, selected: text === '____' ? [] : [text], state: items.some(item => item.state === 'review' || item.state === 'multiple') ? 'review' : text === '____' ? 'blank' : 'marked', confidence: Math.min(...items.map(item => item.confidence)), ratios: items.flatMap(item => item.ratios) };
    }
    if (q.short_answer) {
      const layout = q.short_answer, digits = layout.columns.map(col => read(col, col.map(b => b.label))), negative = read([layout.negative], ['-']), decimal = read(layout.decimal, layout.decimal.map(b => String(b.after_column)));
      const parts = [negative, decimal, ...digits], filled = digits.map((d, i) => d.selected.length === 1 ? i : -1).filter(i => i >= 0);
      const first = filled[0] ?? 0, last = filled.at(-1) ?? -1, after = decimal.selected.length === 1 ? Number(decimal.selected[0]) : null;
      let text = digits.slice(first, last + 1).map(d => d.selected[0] ?? '_').join('');
      if (after !== null) text = text.slice(0, after - first) + '.' + text.slice(after - first);
      if (negative.selected.length) text = '-' + text;
      const blank = parts.every(part => part.state === 'blank');
      const invalid = !blank && (parts.some(part => part.state === 'review' || part.state === 'multiple') || filled.length !== last - first + 1 || (after !== null && (after <= first || after > last)) || normalizeNumericAnswer(text) === null);
      return { number: q.number, selected: blank ? [] : [text], state: invalid ? 'review' : blank ? 'blank' : 'marked', confidence: Math.min(...parts.map(part => part.confidence)), ratios: parts.flatMap(part => part.ratios) };
    }
    return { number: q.number, ...read(q.bubbles, q.bubbles.map(b => b.label)) };
  });
}
export function recognizeDigits(image: Pixels, region: SheetTemplate['student_region'], thresholds: SheetTemplate['thresholds']) {
  if (!region) return null;
  const digits = region.map(col => classify(col.map(b => fillRatio(image, b)), col.map(b => b.label), thresholds));
  return digits.every(d => d.state === 'marked') ? digits.map(d => d.selected[0]).join('') : null;
}
