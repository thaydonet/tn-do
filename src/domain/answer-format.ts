export type SectionType = 'mcq' | 'true_false' | 'short_answer';
export function normalizeNumericAnswer(value: string): string | null {
  const raw = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(raw) || raw.replace(/[-.]/g, '').length > 4) return null;
  return String(Number(raw));
}
export function questionLabel(number: number, type: string = 'mcq') {
  return type === 'true_false' ? `II.${number - 40}` : type === 'short_answer' ? `III.${number - 48}` : String(number).padStart(2, '0');
}
export function displayAnswer(value: string, type: string = 'mcq') {
  return type === 'true_false' ? [...value].map((v, i) => `${'abcd'[i]}: ${v === 'T' ? 'Đ' : v === 'F' ? 'S' : '—'}`).join(' · ') : value;
}
