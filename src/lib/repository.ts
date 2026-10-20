import { rpc, supabase } from './supabase';
import { loadLocal, saveLocal, emptyWorkspace } from './local-db';
import { answerDocumentSchema, templateSchema, type Exam, type SchoolClass, type SheetTemplate, type Student, type Workspace } from '../domain/schemas';
export interface Organization { id: string; name: string; role: string }
export interface Member { user_id: string; role: string; display_name: string }
export async function loadWorkspace(orgId: string): Promise<Workspace> { return supabase ? rpc<Workspace>('get_workspace', { p_org: orgId }) : loadLocal(); }
export async function organizations(): Promise<Organization[]> { return rpc('my_organizations'); }
export async function saveClass(orgId: string, value: SchoolClass) {
  if (supabase) return rpc('save_class', { p_org: orgId, p_class: value });
  const w = await loadLocal(); const old = w.classes.findIndex(c => c.id === value.id); if (old >= 0) w.classes[old] = value; else w.classes.push(value); await saveLocal(w);
}
export async function addStudents(orgId: string, students: Student[]) {
  if (new Set(students.map(s => s.number)).size !== students.length || students.some(s => !/^\d{1,12}$/.test(s.number) || !s.name.trim())) throw new Error('Số báo danh phải gồm 1–12 chữ số, không trùng; họ tên bắt buộc');
  if (supabase) return rpc('add_students', { p_org: orgId, p_students: students });
  const w = await loadLocal(); if (students.some(s => w.students.some(old => old.number === s.number))) throw new Error('Số báo danh đã tồn tại'); w.students.push(...students); await saveLocal(w);
}
export async function saveExam(orgId: string, exam: Exam, confirmed: boolean) {
  answerDocumentSchema.parse(exam.document);
  if (supabase) return rpc('save_exam', { p_org: orgId, p_exam: exam, p_confirm: confirmed });
  const w = await loadLocal(), previous = w.exams.filter(e => e.id === exam.id);
  if (previous.length && !confirmed) throw new Error('Cần xác nhận tạo phiên bản đáp án mới');
  if (previous.some(e => e.version >= exam.version)) throw new Error('Phiên bản đã thay đổi; hãy tải lại');
  w.exams.push(exam); await saveLocal(w);
}
export async function saveTemplate(orgId: string, template: SheetTemplate) {
  templateSchema.parse(template);
  if (supabase) return rpc('save_template', { p_org: orgId, p_template: template });
  const w = await loadLocal();
  if (w.templates.some(t => t.id === template.id && t.code !== template.code)) throw new Error('Mã template không thay đổi giữa các phiên bản; hãy tạo bản sao');
  if (w.templates.some(t => t.id === template.id && t.version === template.version)) throw new Error('Phiên bản đã tồn tại; hãy tăng số phiên bản');
  w.templates.push(template); await saveLocal(w);
}
export async function seedCloudTemplates(orgId: string) {
  const w = await loadWorkspace(orgId);
  for (const t of emptyWorkspace().templates) if (!w.templates.some(existing => existing.code === t.code)) await saveTemplate(orgId, { ...t, id: crypto.randomUUID() });
}
export function latest<T extends { id: string; version: number }>(items: T[]): T[] { return [...new Map([...items].sort((a, b) => a.version - b.version).map(t => [t.id, t])).values()]; }
