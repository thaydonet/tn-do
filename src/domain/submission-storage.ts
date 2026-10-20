import type { Exam, Recognition, Student, Submission } from './schemas';
import { grade } from './grading-engine';
import { assertReviewed } from './result-review';
import { rpc, supabase } from '../lib/supabase';
import { getImage, loadLocal, putImage, queueAdd, queueDelete, queueGet, queuePut, saveLocal } from '../lib/local-db';

export interface PendingSubmission { id: string; org_id: string; user_id: string; exam: Exam; student: Student; exam_code: string; marks: Recognition[]; original: Blob; processed: Blob; created_at: string; error?: string }
export async function enqueueSubmission(item: PendingSubmission) {
  const result = grade(item.exam.document, item.exam_code, item.marks);
  assertReviewed(result.answers);
  if ((await queueGet<PendingSubmission>()).some(p => p.id === item.id)) throw new Error('Bản chờ này đã được lưu trên thiết bị. Mở Kết nối & đồng bộ để gửi lại bản đã xác nhận.');
  await queueAdd({ ...item, marks: result.answers });
}
export async function commitSubmission(item: PendingSubmission): Promise<Submission> {
  const result = grade(item.exam.document, item.exam_code, item.marks);
  assertReviewed(result.answers);
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser(); if (user?.id !== item.user_id) throw new Error('Bản chờ thuộc tài khoản khác');
    const draft = await rpc<{ id: string; original_path: string; processed_path: string; completed: boolean }>('begin_submission', { p_org: item.org_id, p_id: item.id, p_exam: item.exam.id, p_version: item.exam.version, p_student: item.student.id, p_code: item.exam_code });
    if (!draft.completed) {
      for (const [path, blob] of [[draft.original_path, item.original], [draft.processed_path, item.processed]] as const) {
        // Immutable uploads. A duplicate path can only belong to this same server-created draft.
        const { error } = await supabase.storage.from('answer-sheets').upload(path, blob, { contentType: 'image/png', upsert: false });
        if (error && !/already exists|Duplicate|resource exists/i.test(error.message)) throw error;
      }
    }
    const saved = await rpc<Submission>('finalize_submission', { p_id: draft.id, p_marks: result.answers }); await queueDelete(item.id); return saved;
  }
  const workspace = await loadLocal(), existing = workspace.submissions.find(s => s.id === item.id);
  if (existing) { await queueDelete(item.id); return existing; }
  if (workspace.submissions.some(s => s.exam_id === item.exam.id && s.student_id === item.student.id)) throw new Error('Học sinh đã có bài trong kỳ thi này. Dùng chức năng chấm lại trong báo cáo.');
  await putImage(item.id, 'original', item.original); await putImage(item.id, 'processed', item.processed);
  const saved: Submission = { id: item.id, exam_id: item.exam.id, exam_version: item.exam.version, template_id: item.exam.template_id, template_version: item.exam.template_version, student_id: item.student.id, student_name: item.student.name, student_number: item.student.number, class_id: item.student.class_id, exam_code: item.exam_code, answers: result.answers, score: result.score, max_score: result.max_score, created_at: item.created_at, graded_by: 'Cục bộ', revision: 1, history: [{ at: new Date().toISOString(), score: result.score, actor: 'Cục bộ', reason: 'Chấm lần đầu' }] };
  workspace.submissions.push(saved); await saveLocal(workspace); await queueDelete(item.id); return saved;
}
export async function pendingSubmissions(orgId: string, userId: string) { return (await queueGet<PendingSubmission>()).filter(p => p.org_id === orgId && p.user_id === userId); }
export async function retryQueue(orgId: string, userId: string) {
  const failures: string[] = [];
  for (const p of await pendingSubmissions(orgId, userId)) { try { await commitSubmission(p); } catch (e) { p.error = e instanceof Error ? e.message : String(e); await queuePut(p); failures.push(p.error); } }
  return failures;
}
export async function submissionImage(submission: Submission, kind: 'original' | 'processed') {
  if (!supabase) { const blob = await getImage(submission.id, kind); return blob ? URL.createObjectURL(blob) : null; }
  const path = kind === 'original' ? submission.original_path : submission.processed_path; if (!path) return null;
  const { data, error } = await supabase.storage.from('answer-sheets').createSignedUrl(path, 120); if (error) throw error; return data.signedUrl;
}
export async function regradeSubmission(orgId: string, submission: Submission, exam: Exam, reason: string) {
  if (reason.trim().length < 5) throw new Error('Nhập lý do chấm lại (tối thiểu 5 ký tự)');
  if (exam.id !== submission.exam_id || exam.template_id !== submission.template_id || exam.template_version !== submission.template_version) throw new Error('Mẫu phiếu đã thay đổi; cần chụp và xác minh lại');
  if (supabase) return rpc('regrade_submission', { p_id: submission.id, p_org: orgId, p_version: exam.version, p_revision: submission.revision, p_reason: reason });
  const w = await loadLocal(), current = w.submissions.find(s => s.id === submission.id);
  if (!current || current.revision !== submission.revision) throw new Error('Bài đã được cập nhật. Hãy tải lại');
  const result = grade(exam.document, submission.exam_code, submission.answers); current.answers = result.answers; current.score = result.score; current.exam_version = exam.version; current.revision++; current.history.push({ at: new Date().toISOString(), score: result.score, actor: 'Cục bộ', reason }); await saveLocal(w);
}
