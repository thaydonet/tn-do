import type { AnswerDocument, SheetTemplate, SheetQR } from './schemas';
export function matchTemplate(templates: SheetTemplate[], id: string | undefined, version: number | undefined, document?: AnswerDocument) {
  if (!id || !version) throw new Error('Phải chọn mẫu phiếu và phiên bản; không tự suy đoán');
  const t = templates.find(t => t.id === id && t.version === version);
  if (!t) throw new Error('Không tìm thấy đúng phiên bản mẫu phiếu');
  if (document && document.answer_sheets.some(s => s.sections.some(section => section.questions.some(q => {
    const target = t.questions.find(tq => tq.number === q.number);
    return !target || target.section !== section.type || (section.type === 'mcq' && target.bubbles.length !== section.choices);
  })))) throw new Error('Số câu vượt sức chứa phiếu hoặc loại câu / lựa chọn không khớp mẫu phiếu');
  return t;
}
export function checkQR(qr: SheetQR, examId: string, template: SheetTemplate) {
  if (qr.exam_id !== examId) throw new Error('QR không thuộc kỳ thi đang chọn');
  if (qr.template_id && qr.template_id !== template.id) throw new Error('QR không khớp mẫu phiếu');
  if (qr.template_version && qr.template_version !== template.version) throw new Error('QR khác phiên bản mẫu phiếu');
}
