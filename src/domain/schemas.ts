import { z } from 'zod';
import { normalizeNumericAnswer } from './answer-format';

export const choices = ['A', 'B', 'C', 'D', 'E'] as const;
export const questionSchema = z.strictObject({ number: z.number().int().positive().max(500), correct_answer: z.string().trim().min(1).max(20), points: z.number().positive().max(100) });
const sectionSchema = z.strictObject({ type: z.enum(['mcq', 'true_false', 'short_answer']), title: z.string().max(100).default('Trắc nghiệm'), choices: z.number().int().min(2).max(5).default(4), scoring: z.enum(['partial', 'per_item']).optional(), questions: z.array(questionSchema).min(1).max(500) }).superRefine((s, ctx) => {
  if (s.type !== 'mcq' && s.choices !== 4) ctx.addIssue({ code: 'custom', message: 'Phần đúng–sai và trả lời ngắn dùng cấu hình bốn ý / bốn cột' });
  if (s.scoring && s.type !== 'true_false') ctx.addIssue({ code: 'custom', message: 'Cách tính điểm theo ý chỉ dùng cho phần đúng–sai' });
  s.questions.forEach((q, i) => {
    const valid = s.type === 'mcq' ? choices.slice(0, s.choices).some(c => c === q.correct_answer) : s.type === 'true_false' ? /^[TF]{4}$/.test(q.correct_answer) : normalizeNumericAnswer(q.correct_answer) !== null;
    if (!valid) ctx.addIssue({ code: 'custom', path: ['questions', i, 'correct_answer'], message: s.type === 'mcq' ? 'Lựa chọn vượt cấu trúc phần' : s.type === 'true_false' ? 'Đúng–sai cần bốn ký tự T/F theo thứ tự a–d' : 'Trả lời ngắn cần số có tối đa 4 chữ số; hỗ trợ dấu âm và thập phân' });
  });
});
export const answerDocumentSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  exam: z.strictObject({ title: z.string().trim().min(1).max(150), subject: z.string().trim().min(1).max(80), grading_scale: z.number().positive().max(100) }),
  answer_sheets: z.array(z.strictObject({ exam_code: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/), sections: z.array(sectionSchema).min(1).max(20) })).min(1).max(100),
}).superRefine((d, ctx) => {
  const codes = new Set<string>();
  d.answer_sheets.forEach((s, i) => {
    if (codes.has(s.exam_code)) ctx.addIssue({ code: 'custom', path: ['answer_sheets', i], message: 'Trùng mã đề' });
    codes.add(s.exam_code);
    const questions = s.sections.flatMap(x => x.questions), seen = new Set<number>();
    questions.forEach(q => { if (seen.has(q.number)) ctx.addIssue({ code: 'custom', path: ['answer_sheets', i], message: `Trùng câu ${q.number}` }); seen.add(q.number); });
    const numbers = [...seen].sort((a, b) => a - b);
    if (s.sections.every(section => section.type === 'mcq')) {
      if (numbers.some((n, index) => n !== index + 1)) ctx.addIssue({ code: 'custom', path: ['answer_sheets', i], message: 'Số câu phải liên tục từ 1' });
    } else {
      for (const [type, start, capacity] of [['mcq', 1, 40], ['true_false', 41, 8], ['short_answer', 49, 6]] as const) {
        const ns = s.sections.filter(section => section.type === type).flatMap(section => section.questions.map(q => q.number)).sort((a, b) => a - b);
        if (ns.length > capacity || ns.some((n, index) => n !== start + index)) ctx.addIssue({ code: 'custom', path: ['answer_sheets', i], message: `Số câu phần ${type} phải liên tục từ ${start}, tối đa ${capacity} câu` });
      }
    }
    if (Math.abs(questions.reduce((sum, q) => sum + q.points, 0) - d.exam.grading_scale) > 0.0001) ctx.addIssue({ code: 'custom', path: ['answer_sheets', i], message: 'Tổng điểm phải bằng thang điểm' });
  });
});
export type AnswerDocument = z.infer<typeof answerDocumentSchema>;
export type Question = z.infer<typeof questionSchema>;
export const pointSchema = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const bubbleSchema = pointSchema.extend({ label: z.string().min(1).max(5), radius: z.number().min(0.002).max(0.05) });
const digitRegion = z.array(z.array(bubbleSchema).length(10)).min(1).max(12);
const markPosition = pointSchema.extend({ radius: z.number().min(.002).max(.05) });
const templateQuestionSchema = z.strictObject({
  number: z.number().int().positive(), section: z.string().default('mcq'), bubbles: z.array(bubbleSchema).max(5),
  true_false_items: z.array(z.strictObject({ label: z.enum(['a', 'b', 'c', 'd']), true: markPosition, false: markPosition })).length(4).optional(),
  short_answer: z.strictObject({ negative: markPosition, decimal: z.array(markPosition.extend({ after_column: z.number().int().min(1).max(3) })).length(3), columns: z.array(z.array(bubbleSchema).length(10)).length(4) }).optional(),
});
export const templateSchema = z.strictObject({
  id: z.uuid(), name: z.string().trim().min(1).max(120), code: z.string().regex(/^[A-Za-z0-9_-]+$/), version: z.number().int().positive(),
  width: z.number().int().min(400).max(3000), height: z.number().int().min(400).max(4000),
  anchors: z.array(pointSchema).length(4),
  questions: z.array(templateQuestionSchema).min(1).max(500),
  student_region: digitRegion.optional(), code_region: digitRegion.optional(),
  qr_region: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).optional(),
  thresholds: z.strictObject({ filled: z.number().min(0.1).max(0.95), ambiguous: z.number().min(0).max(0.9), min_gap: z.number().min(0.01).max(1) }),
  active: z.boolean(), tested_version: z.number().int().positive().nullable(), test_note: z.string().max(1000),
}).superRefine((t, ctx) => {
  if (t.thresholds.ambiguous >= t.thresholds.filled) ctx.addIssue({ code: 'custom', message: 'Ngưỡng nghi ngờ phải thấp hơn ngưỡng tô' });
  if (new Set(t.questions.map(q => q.number)).size !== t.questions.length || t.questions.some((q, i) => q.number !== i + 1)) ctx.addIssue({ code: 'custom', message: 'Câu trong template phải liên tục và duy nhất' });
  t.questions.forEach(q => {
    const valid = q.section === 'mcq' ? q.bubbles.length >= 2 && !q.true_false_items && !q.short_answer && new Set(q.bubbles.map(b => b.label)).size === q.bubbles.length && q.bubbles.every(b => choices.some(c => c === b.label)) : q.section === 'true_false' ? q.bubbles.length === 0 && !q.short_answer && q.true_false_items?.map(item => item.label).join('') === 'abcd' : q.section === 'short_answer' && q.bubbles.length === 0 && !q.true_false_items && !!q.short_answer && q.short_answer.decimal.map(d => d.after_column).join('') === '123';
    if (!valid) ctx.addIssue({ code: 'custom', message: 'Cấu trúc hoặc nhãn ô trả lời không hợp lệ' });
  });
  if (t.active && t.tested_version !== t.version) ctx.addIssue({ code: 'custom', message: 'Cần kiểm thử phiên bản trước khi kích hoạt' });
  for (let i = 0; i < 4; i++) { const a = t.anchors[i], b = t.anchors[(i + 1) % 4], c = t.anchors[(i + 2) % 4]; if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= .001) ctx.addIssue({ code: 'custom', message: 'Mốc phải tạo tứ giác lồi theo thứ tự TL, TR, BR, BL' }); }
  const bubbles = [...t.questions.flatMap(questionBubbles), ...(t.student_region?.flat() ?? []), ...(t.code_region?.flat() ?? [])];
  if (bubbles.some(b => b.x - b.radius < 0 || b.x + b.radius > 1 || b.y - b.radius * t.width / t.height < 0 || b.y + b.radius * t.width / t.height > 1)) ctx.addIssue({ code: 'custom', message: 'Ô nhận diện nằm ngoài ảnh chuẩn' });
  for (const region of [t.student_region, t.code_region, ...t.questions.map(q => q.short_answer?.columns)]) for (const col of region ?? []) if (col.map(b => b.label).sort().join('') !== '0123456789') ctx.addIssue({ code: 'custom', message: 'Mỗi cột chữ số phải có đủ nhãn 0–9 duy nhất' });
  if (t.qr_region && (t.qr_region.x + t.qr_region.width > 1 || t.qr_region.y + t.qr_region.height > 1)) ctx.addIssue({ code: 'custom', message: 'Vùng QR nằm ngoài ảnh' });
});
export type SheetTemplate = z.infer<typeof templateSchema>;
export type TemplateQuestion = SheetTemplate['questions'][number];
export function questionBubbles(q: z.infer<typeof templateQuestionSchema>) {
  return [...q.bubbles, ...(q.true_false_items?.flatMap(item => [item.true, item.false]) ?? []), ...(q.short_answer ? [q.short_answer.negative, ...q.short_answer.decimal, ...q.short_answer.columns.flat()] : [])];
}
export type Point = z.infer<typeof pointSchema>;
export const qrSchema = z.strictObject({ schema_version: z.literal('1.0'), exam_id: z.uuid(), template_id: z.uuid().optional(), template_version: z.number().int().positive().optional(), exam_code: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/).optional(), student_number: z.string().regex(/^\d{1,12}$/).optional(), reference: z.uuid().optional() });
export type SheetQR = z.infer<typeof qrSchema>;
export type Role = 'platform_admin' | 'school_admin' | 'teacher' | 'examiner' | 'viewer';
export interface SchoolClass { id: string; name: string; year: string; teacher_id?: string }
export interface Student { id: string; class_id: string; number: string; name: string }
export interface Exam { id: string; class_id: string | null; template_id: string; template_version: number; date: string; document: AnswerDocument; version: number; version_id?: string; created_by?: string }
export type MarkState = 'marked' | 'blank' | 'multiple' | 'review';
export interface Recognition { number: number; selected: string[]; state: MarkState; confidence: number; ratios: number[]; reviewed?: boolean }
export type AnswerState = 'correct' | 'partial' | 'incorrect' | 'blank' | 'multiple' | 'review';
export interface GradedAnswer extends Recognition { status: AnswerState; correct_answer: string; earned: number; points: number }
export interface Submission { id: string; exam_id: string; exam_version: number; template_id: string; template_version: number; student_id: string; student_number: string; student_name: string; class_id: string; exam_code: string; answers: GradedAnswer[]; score: number; max_score: number; created_at: string; graded_by: string; revision: number; original_path?: string; processed_path?: string; history: { at: string; score: number; actor: string; reason: string }[] }
export interface Workspace { classes: SchoolClass[]; students: Student[]; exams: Exam[]; templates: SheetTemplate[]; submissions: Submission[] }
