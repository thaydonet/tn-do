import { z } from 'zod';

export const choices = ['A', 'B', 'C', 'D', 'E'] as const;
export const questionSchema = z.strictObject({ number: z.number().int().positive().max(500), correct_answer: z.enum(choices), points: z.number().positive().max(100) });
const sectionSchema = z.strictObject({ type: z.literal('mcq'), title: z.string().max(100).default('Trắc nghiệm'), choices: z.number().int().min(2).max(5).default(4), questions: z.array(questionSchema).min(1).max(500) }).superRefine((s, ctx) => {
  s.questions.forEach((q, i) => { if (choices.indexOf(q.correct_answer) >= s.choices) ctx.addIssue({ code: 'custom', path: ['questions', i, 'correct_answer'], message: 'Lựa chọn vượt cấu trúc phần' }); });
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
    if (numbers.some((n, index) => n !== index + 1)) ctx.addIssue({ code: 'custom', path: ['answer_sheets', i], message: 'Số câu phải liên tục từ 1' });
    if (Math.abs(questions.reduce((sum, q) => sum + q.points, 0) - d.exam.grading_scale) > 0.0001) ctx.addIssue({ code: 'custom', path: ['answer_sheets', i], message: 'Tổng điểm phải bằng thang điểm' });
  });
});
export type AnswerDocument = z.infer<typeof answerDocumentSchema>;
export type Question = z.infer<typeof questionSchema>;
export const pointSchema = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const bubbleSchema = pointSchema.extend({ label: z.string().min(1).max(5), radius: z.number().min(0.002).max(0.05) });
const digitRegion = z.array(z.array(bubbleSchema).length(10)).min(1).max(12);
export const templateSchema = z.strictObject({
  id: z.uuid(), name: z.string().trim().min(1).max(120), code: z.string().regex(/^[A-Za-z0-9_-]+$/), version: z.number().int().positive(),
  width: z.number().int().min(400).max(3000), height: z.number().int().min(400).max(4000),
  anchors: z.array(pointSchema).length(4),
  questions: z.array(z.strictObject({ number: z.number().int().positive(), section: z.string().default('mcq'), bubbles: z.array(bubbleSchema).min(2).max(5) })).min(1).max(500),
  student_region: digitRegion.optional(), code_region: digitRegion.optional(),
  qr_region: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).optional(),
  thresholds: z.strictObject({ filled: z.number().min(0.1).max(0.95), ambiguous: z.number().min(0).max(0.9), min_gap: z.number().min(0.01).max(1) }),
  active: z.boolean(), tested_version: z.number().int().positive().nullable(), test_note: z.string().max(1000),
}).superRefine((t, ctx) => {
  if (t.thresholds.ambiguous >= t.thresholds.filled) ctx.addIssue({ code: 'custom', message: 'Ngưỡng nghi ngờ phải thấp hơn ngưỡng tô' });
  if (new Set(t.questions.map(q => q.number)).size !== t.questions.length || t.questions.some((q, i) => q.number !== i + 1)) ctx.addIssue({ code: 'custom', message: 'Câu trong template phải liên tục và duy nhất' });
  t.questions.forEach(q => { if (new Set(q.bubbles.map(b => b.label)).size !== q.bubbles.length || q.bubbles.some(b => !choices.includes(b.label as typeof choices[number]))) ctx.addIssue({ code: 'custom', message: 'Nhãn ô trả lời không hợp lệ' }); });
  if (t.active && t.tested_version !== t.version) ctx.addIssue({ code: 'custom', message: 'Cần kiểm thử phiên bản trước khi kích hoạt' });
  for (let i = 0; i < 4; i++) { const a = t.anchors[i], b = t.anchors[(i + 1) % 4], c = t.anchors[(i + 2) % 4]; if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= .001) ctx.addIssue({ code: 'custom', message: 'Mốc phải tạo tứ giác lồi theo thứ tự TL, TR, BR, BL' }); }
  const bubbles = [...t.questions.flatMap(q => q.bubbles), ...(t.student_region?.flat() ?? []), ...(t.code_region?.flat() ?? [])];
  if (bubbles.some(b => b.x - b.radius < 0 || b.x + b.radius > 1 || b.y - b.radius * t.width / t.height < 0 || b.y + b.radius * t.width / t.height > 1)) ctx.addIssue({ code: 'custom', message: 'Ô nhận diện nằm ngoài ảnh chuẩn' });
  for (const region of [t.student_region, t.code_region]) for (const col of region ?? []) if (col.map(b => b.label).sort().join('') !== '0123456789') ctx.addIssue({ code: 'custom', message: 'Mỗi cột chữ số phải có đủ nhãn 0–9 duy nhất' });
  if (t.qr_region && (t.qr_region.x + t.qr_region.width > 1 || t.qr_region.y + t.qr_region.height > 1)) ctx.addIssue({ code: 'custom', message: 'Vùng QR nằm ngoài ảnh' });
});
export type SheetTemplate = z.infer<typeof templateSchema>;
export type Point = z.infer<typeof pointSchema>;
export const qrSchema = z.strictObject({ schema_version: z.literal('1.0'), exam_id: z.uuid(), template_id: z.uuid().optional(), template_version: z.number().int().positive().optional(), exam_code: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/).optional(), student_number: z.string().regex(/^\d{1,12}$/).optional(), reference: z.uuid().optional() });
export type SheetQR = z.infer<typeof qrSchema>;
export type Role = 'platform_admin' | 'school_admin' | 'teacher' | 'examiner' | 'viewer';
export interface SchoolClass { id: string; name: string; year: string; teacher_id?: string }
export interface Student { id: string; class_id: string; number: string; name: string }
export interface Exam { id: string; class_id: string | null; template_id: string; template_version: number; date: string; document: AnswerDocument; version: number; version_id?: string; created_by?: string }
export type MarkState = 'marked' | 'blank' | 'multiple' | 'review';
export interface Recognition { number: number; selected: string[]; state: MarkState; confidence: number; ratios: number[]; reviewed?: boolean }
export type AnswerState = 'correct' | 'incorrect' | 'blank' | 'multiple' | 'review';
export interface GradedAnswer extends Recognition { status: AnswerState; correct_answer: string; earned: number; points: number }
export interface Submission { id: string; exam_id: string; exam_version: number; template_id: string; template_version: number; student_id: string; student_number: string; student_name: string; class_id: string; exam_code: string; answers: GradedAnswer[]; score: number; max_score: number; created_at: string; graded_by: string; revision: number; original_path?: string; processed_path?: string; history: { at: string; score: number; actor: string; reason: string }[] }
export interface Workspace { classes: SchoolClass[]; students: Student[]; exams: Exam[]; templates: SheetTemplate[]; submissions: Submission[] }
