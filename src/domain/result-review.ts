import type { Recognition } from './schemas';
export function reviewAnswer(mark: Recognition, selected: string[]): Recognition {
  return { ...mark, selected, reviewed: true, state: selected.length === 0 ? 'blank' : selected.length > 1 ? 'multiple' : 'marked' };
}
export function assertReviewed(marks: Recognition[]) {
  if (marks.some(m => m.state === 'review' || (m.state === 'multiple' && !m.reviewed))) throw new Error('Cần xác minh các câu nghi ngờ và tô nhiều ô trước khi lưu');
}
