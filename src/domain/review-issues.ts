import { rpc, supabase } from '../lib/supabase';
import { getLocalValue, putLocalValue } from '../lib/local-db';
export interface ReviewIssue { id: string; exam_id: string; kind: 'qr' | 'student' | 'template' | 'image'; message: string; created_at: string; resolved_at?: string }
export async function reviewIssues(org: string): Promise<ReviewIssue[]> { return supabase ? rpc('get_review_issues', { p_org: org }) : (await getLocalValue<ReviewIssue[]>('issues')) ?? []; }
export async function recordIssue(org: string, examId: string, kind: ReviewIssue['kind'], message: string) {
  if (supabase) return rpc('record_review_issue', { p_org: org, p_exam: examId, p_kind: kind, p_message: message });
  const issues = await reviewIssues(org); issues.unshift({ id: crypto.randomUUID(), exam_id: examId, kind, message, created_at: new Date().toISOString() }); await putLocalValue('issues', issues);
}
export async function resolveIssue(org: string, id: string) {
  if (supabase) return rpc('resolve_review_issue', { p_id: id });
  const issues = await reviewIssues(org), issue = issues.find(i => i.id === id); if (issue) issue.resolved_at = new Date().toISOString(); await putLocalValue('issues', issues);
}
