import type { Point, Recognition, SheetTemplate } from './schemas';
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
  return template.questions.map(q => ({ number: q.number, ...classify(q.bubbles.map(b => fillRatio(image, b)), q.bubbles.map(b => b.label), template.thresholds) }));
}
export function recognizeDigits(image: Pixels, region: SheetTemplate['student_region'], thresholds: SheetTemplate['thresholds']) {
  if (!region) return null;
  const digits = region.map(col => classify(col.map(b => fillRatio(image, b)), col.map(b => b.label), thresholds));
  return digits.every(d => d.state === 'marked') ? digits.map(d => d.selected[0]).join('') : null;
}
