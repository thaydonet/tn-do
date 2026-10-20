import type { AnswerDocument, GradedAnswer, Recognition, AnswerState } from './schemas';
import { normalizeNumericAnswer } from './answer-format';
/** Match PostgreSQL numeric round(..., 4), including decimal half-way cases. */
export function weightedPoints(points: number, fraction: number) {
  const [coefficient, exponent = '0'] = String(points).split('e'), decimals = coefficient.split('.')[1]?.length ?? 0;
  const scale = decimals - Number(exponent), weight = BigInt(Math.round(fraction * 100));
  let numerator = BigInt(coefficient.replace('.', '')) * weight * 10000n, denominator = 100n;
  if (scale > 0) denominator *= 10n ** BigInt(scale); else numerator *= 10n ** BigInt(-scale);
  return Number((2n * numerator + denominator) / (2n * denominator)) / 10000;
}
export function resolveAnswerKey(document: AnswerDocument, code: string) {
  if (!code) throw new Error('Chưa xác định mã đề');
  const key = document.answer_sheets.find(s => s.exam_code === code);
  if (!key) throw new Error(`Mã đề ${code} không thuộc kỳ thi`);
  return key.sections.flatMap(s => s.questions.map(q => ({ ...q, type: s.type, scoring: s.scoring ?? 'partial' })));
}
export function grade(document: AnswerDocument, code: string, marks: Recognition[]) {
  const key = resolveAnswerKey(document, code);
  const numbers = new Set(key.map(q => q.number));
  marks = marks.filter(m => numbers.has(m.number));
  if (new Set(marks.map(m => m.number)).size !== marks.length || marks.length !== key.length || key.some(q => !marks.some(m => m.number === q.number))) throw new Error('Số câu nhận diện không khớp đáp án');
  const answers: GradedAnswer[] = key.map(q => {
    const m = marks.find(m => m.number === q.number)!;
    const value = m.selected[0] ?? '';
    let status: AnswerState = m.state === 'review' ? 'review' : m.selected.length > 1 ? 'multiple' : m.selected.length === 0 ? 'blank' : 'incorrect', fraction = 0;
    if (status === 'incorrect') {
      if (q.type === 'true_false') {
        if (!/^[TF_]{4}$/.test(value)) status = 'review';
        else { const correct = [...value].filter((v, i) => v === q.correct_answer[i]).length; fraction = q.scoring === 'per_item' ? correct / 4 : [0, .1, .25, .5, 1][correct]; }
      } else if (q.type === 'short_answer') {
        const numeric = normalizeNumericAnswer(value);
        if (numeric === null) status = 'review';
        else fraction = numeric === normalizeNumericAnswer(q.correct_answer) ? 1 : 0;
      } else fraction = value === q.correct_answer ? 1 : 0;
      if (status !== 'review') status = fraction === 1 ? 'correct' : fraction > 0 ? 'partial' : 'incorrect';
    }
    const selected = q.type === 'short_answer' && m.selected.length === 1 && normalizeNumericAnswer(value) !== null ? [normalizeNumericAnswer(value)!] : m.selected;
    return { ...m, selected, state: status === 'review' ? 'review' : m.state, status, correct_answer: q.correct_answer, earned: fraction === 1 ? q.points : weightedPoints(q.points, fraction), points: q.points };
  });
  return { answers, score: Math.round(answers.reduce((s, a) => s + a.earned, 0) * 10000) / 10000, max_score: document.exam.grading_scale, needsReview: answers.some(a => a.status === 'review' || a.status === 'multiple') };
}
