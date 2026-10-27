import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exam, Student } from '../src/domain/schemas';
import { emptyWorkspace, getImage, loadLocal, saveLocal } from '../src/lib/local-db';
import { addStudents, saveExam, upgradeExamPrintTemplate } from '../src/lib/repository';
import { legacyTemplates } from '../src/domain/templates';
import { commitSubmission, enqueueSubmission, pendingSubmissions, regradeSubmission, retryQueue, type PendingSubmission } from '../src/domain/submission-storage';

const student: Student = { id: crypto.randomUUID(), class_id: crypto.randomUUID(), number: '000001', name: 'Học sinh mẫu' };
const exam: Exam = { id: crypto.randomUUID(), class_id: student.class_id, template_id: '10000000-0000-4000-8000-000000000020', template_version: 1, date: '2026-10-18', version: 1, document: { schema_version: '1.0', exam: { title: 'Toán', subject: 'Toán', grading_scale: 10 }, answer_sheets: [{ exam_code: '101', sections: [{ type: 'mcq', title: 'MCQ', choices: 4, questions: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, correct_answer: 'A', points: .5 })) }] }] } };
const item = (): PendingSubmission => ({ id: crypto.randomUUID(), org_id: 'local', user_id: 'local', exam, student, exam_code: '101', marks: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, selected: ['A'], state: 'marked', confidence: 1, ratios: [1, 0, 0, 0], reviewed: true })), original: new Blob(['original'], { type: 'image/png' }), processed: new Blob(['processed'], { type: 'image/png' }), created_at: '2026-10-18T08:00:00Z' });
beforeEach(async () => { const w = emptyWorkspace(); w.classes = [{ id: student.class_id, name: '12A1', year: '2026' }]; w.students = [student]; w.exams = [structuredClone(exam)]; await saveLocal(w); });
describe('Persistent submission integration', () => {
  it('upgrades the print layout without changing saved answers, images or historical exam versions', async () => {
    const p = item(); p.exam = { ...structuredClone(exam), template_id: legacyTemplates[0].id };
    const w = await loadLocal(); w.exams = [p.exam]; await saveLocal(w);
    const saved = await commitSubmission(p);
    const before = await loadLocal();
    await upgradeExamPrintTemplate('local', p.exam, before.templates);
    const after = await loadLocal();
    expect(after.exams[0]).toEqual(before.exams[0]);
    expect(after.exams[1]).toMatchObject({ id: p.exam.id, version: 2, template_version: 2, document: p.exam.document });
    expect(after.submissions).toEqual(before.submissions);
    expect(await getImage(saved.id, 'original')).toEqual(p.original);
    expect(await getImage(saved.id, 'processed')).toEqual(p.processed);
  });
  it('retains pending blobs until successful save and isolates account queues', async () => { const p = item(); await enqueueSubmission(p); expect((await pendingSubmissions('local', 'local')).some(q => q.id === p.id)).toBe(true); expect(await pendingSubmissions('other-org', 'local')).toEqual([]); await commitSubmission(p); expect((await pendingSubmissions('local', 'local')).some(q => q.id === p.id)).toBe(false); expect(await getImage(p.id, 'original')).toBeTruthy(); });
  it('retries persisted queue after simulated connection failure', async () => { const p = item(); await enqueueSubmission(p); const failures = await retryQueue('local', 'local'); expect(failures).toEqual([]); expect((await loadLocal()).submissions.length).toBe(1); });
  it('is idempotent for the same capture and rejects a second capture of one student', async () => { const p = item(); await enqueueSubmission(p); await commitSubmission(p); await commitSubmission(p); expect((await loadLocal()).submissions.length).toBe(1); await expect(commitSubmission(item())).rejects.toThrow(/đã có bài/); });
  it('keeps previous exam versions and regrades with an explicit reason', async () => { const p = item(); const saved = await commitSubmission(p); const changed = structuredClone(exam); changed.version = 2; changed.document.answer_sheets[0].sections[0].questions[0].correct_answer = 'B'; await expect(saveExam('local', changed, false)).rejects.toThrow(); await saveExam('local', changed, true); expect((await loadLocal()).submissions[0].score).toBe(10); await regradeSubmission('local', saved, changed, 'Điều chỉnh đáp án'); const w = await loadLocal(); expect(w.exams.length).toBe(2); expect(w.submissions[0].score).toBe(9.5); expect(w.submissions[0].history.map(h => h.score)).toEqual([10, 9.5]); await expect(regradeSubmission('local', saved, changed, 'Concurrent edit')).rejects.toThrow(/đã được cập nhật/); });
  it('does not enqueue unresolved recognition', async () => { const p = item(); p.marks[0].state = 'review'; await expect(enqueueSubmission(p)).rejects.toThrow(/xác minh/); });
  it.each([20, 40])('saves a classless 10-question exam on a %i-question sheet and ignores extra review marks', async count => {
    const p = item(); p.exam = structuredClone(exam); p.exam.id = crypto.randomUUID(); p.exam.class_id = null;
    p.exam.document.answer_sheets[0].sections[0].questions = p.exam.document.answer_sheets[0].sections[0].questions.slice(0, 10).map(q => ({ ...q, points: 1 }));
    p.exam.template_id = count === 20 ? exam.template_id : '10000000-0000-4000-8000-000000000040';
    p.marks = Array.from({ length: count }, (_, i) => ({ number: i + 1, selected: ['A'], state: i < 10 ? 'marked' : 'review', confidence: 1, ratios: [1, 0, 0, 0] }));
    await saveExam('local', p.exam, false);
    expect((await loadLocal()).exams.find(e => e.id === p.exam.id)?.class_id).toBeNull();
    await enqueueSubmission(p);
    expect((await pendingSubmissions('local', 'local')).find(q => q.id === p.id)?.marks).toHaveLength(10);
    const saved = await commitSubmission(p);
    expect(saved.score).toBe(10); expect(saved.answers).toHaveLength(10); expect(saved.class_id).toBe(student.class_id);
  });
  it('cannot overwrite a confirmed pending capture with changed answers', async () => { const p = item(); await enqueueSubmission(p); const changed = structuredClone(p); changed.marks[0].selected = ['B']; await expect(enqueueSubmission(changed)).rejects.toThrow(); const stored = (await pendingSubmissions('local', 'local')).find(q => q.id === p.id); expect(stored?.exam_code).toBe('101'); await commitSubmission(p); });
  it('rejects duplicate student numbers atomically', async () => { await expect(addStudents('local', [{ ...student, id: crypto.randomUUID() }])).rejects.toThrow(/đã tồn tại/); expect((await loadLocal()).students.length).toBe(1); });
});

describe('Cloud retry integration with interrupted upload', () => {
  it('keeps the draft when upload fails, retries the same ID, and then finalizes', async () => {
    const p = item(); p.user_id = 'cloud-user'; p.org_id = 'cloud-org'; let fail = true;
    const upload = vi.fn(async () => ({ error: fail ? { message: 'Network interrupted' } : null }));
    const calls: string[] = [];
    vi.resetModules();
    vi.doMock('../src/lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: p.user_id } } }) }, storage: { from: () => ({ upload }) } }, rpc: async (name: string) => { calls.push(name); return name === 'begin_submission' ? { id: p.id, original_path: 'a.png', processed_path: 'b.png', completed: false } : { id: p.id, score: 10 }; } }));
    const cloud = await import('../src/domain/submission-storage'); await cloud.enqueueSubmission(p);
    await expect(cloud.commitSubmission(p)).rejects.toEqual({ message: 'Network interrupted' });
    expect(calls).toEqual(['begin_submission']); expect((await cloud.pendingSubmissions(p.org_id, p.user_id)).length).toBe(1);
    fail = false; await cloud.commitSubmission(p); expect(calls).toEqual(['begin_submission', 'begin_submission', 'finalize_submission']); expect(upload).toHaveBeenCalledTimes(3); expect((await cloud.pendingSubmissions(p.org_id, p.user_id)).length).toBe(0);
    vi.doUnmock('../src/lib/supabase');
  });
});
