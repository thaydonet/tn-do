import type { AnswerDocument, GradedAnswer, Recognition } from './schemas';
export function resolveAnswerKey(document: AnswerDocument, code: string) {
  if (!code) throw new Error('Chưa xác định mã đề');
  const key = document.answer_sheets.find(s => s.exam_code === code);
  if (!key) throw new Error(`Mã đề ${code} không thuộc kỳ thi`);
  return key.sections.flatMap(s => s.questions);
}
export function grade(document: AnswerDocument, code: string, marks: Recognition[]) {
  const key = resolveAnswerKey(document, code);
  const numbers = new Set(key.map(q => q.number));
  marks = marks.filter(m => numbers.has(m.number));
  if (new Set(marks.map(m => m.number)).size !== marks.length || marks.length !== key.length || key.some(q => !marks.some(m => m.number === q.number))) throw new Error('Số câu nhận diện không khớp đáp án');
  const answers: GradedAnswer[] = key.map(q => {
    const m = marks.find(m => m.number === q.number)!;
    const status = m.state === 'review' ? 'review' : m.selected.length > 1 ? 'multiple' : m.selected.length === 0 ? 'blank' : m.selected[0] === q.correct_answer ? 'correct' : 'incorrect';
    return { ...m, status, correct_answer: q.correct_answer, earned: status === 'correct' ? q.points : 0, points: q.points };
  });
  return { answers, score: Math.round(answers.reduce((s, a) => s + a.earned, 0) * 10000) / 10000, max_score: document.exam.grading_scale, needsReview: answers.some(a => a.status === 'review' || a.status === 'multiple') };
}
