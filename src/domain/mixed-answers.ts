import type { AnswerDocument } from './schemas';

export function renumberSections(sections: AnswerDocument['answer_sheets'][number]['sections']) {
  let mcq = 1, tf = 41, numeric = 49;
  for (const section of sections) for (const q of section.questions) q.number = section.type === 'true_false' ? tf++ : section.type === 'short_answer' ? numeric++ : mcq++;
}

/** Keep entered MCQ answers and allocate 30% / 40% / 30% of the scale. */
export function addMixedSections(document: AnswerDocument): AnswerDocument {
  const next = structuredClone(document), scale = next.exam.grading_scale;
  for (const sheet of next.answer_sheets) {
    if (sheet.sections.some(s => s.type !== 'mcq')) continue;
    const questions = sheet.sections.flatMap(s => s.questions);
    if (questions.length > 40 || sheet.sections.some(s => s.choices !== 4)) throw new Error('Phần I cần tối đa 40 câu với bốn lựa chọn A–D');
    questions.forEach(q => { q.points = scale * .3 / questions.length; });
    sheet.sections.push(
      { type: 'true_false', title: 'II. Đúng–sai', choices: 4, scoring: 'partial', questions: Array.from({ length: 4 }, (_, i) => ({ number: 41 + i, correct_answer: 'TTTT', points: scale * .1 })) },
      { type: 'short_answer', title: 'III. Trả lời ngắn', choices: 4, questions: Array.from({ length: 6 }, (_, i) => ({ number: 49 + i, correct_answer: '0', points: scale * .05 })) },
    );
  }
  return next;
}
