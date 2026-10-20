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
  for (const t of emptyWorkspace().templates) {
    const existing = latest(w.templates.filter(saved => saved.code === t.code))[0];
    const missingLayout = !!t.print_layout && !w.templates.some(saved => saved.code === t.code && saved.print_layout === t.print_layout);
    if (!existing || existing.version < t.version || missingLayout) {
      const targetId = existing?.id ?? crypto.randomUUID();
      // Install intermediate versions in order for an organization that has no copy yet.
      if (!existing && t.code === 'TNDO-3P-2026' && t.version === 2) {
        const first = { ...t, id: targetId, version: 1, questions: t.questions.filter(q => q.section === 'mcq'), test_note: 'Nhận diện phần I trắc nghiệm.' };
        await saveTemplate(orgId, first); w.templates.push(first);
      }
      const next = { ...t, id: targetId, version: missingLayout && existing ? Math.max(t.version, existing.version + 1) : t.version };
      await saveTemplate(orgId, next); w.templates.push(next);
    }
  }
}
export function latest<T extends { id: string; version: number }>(items: T[]): T[] { return [...new Map([...items].sort((a, b) => a.version - b.version).map(t => [t.id, t])).values()]; }
