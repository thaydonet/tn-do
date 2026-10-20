import type { Submission } from './schemas';
export function summarize(submissions: Submission[]) {
  const scores = submissions.map(s => s.score);
  return { count: scores.length, average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0, highest: scores.length ? Math.max(...scores) : 0, lowest: scores.length ? Math.min(...scores) : 0,
    distribution: Array.from({ length: 5 }, (_, i) => submissions.filter(s => { const normalized = s.score / s.max_score * 10; return normalized >= i * 2 && (i === 4 ? normalized <= 10 : normalized < (i + 1) * 2); }).length) };
}
export function reportRows(submissions: Submission[]) { return submissions.map(s => ({ 'Số báo danh': s.student_number, 'Họ và tên': s.student_name, 'Lớp ID': s.class_id, 'Kỳ thi ID': s.exam_id, 'Mã đề': s.exam_code, 'Điểm': s.score, 'Thang điểm': s.max_score, 'Phiên bản đáp án': s.exam_version, 'Phiên bản mẫu': s.template_version, 'Người chấm': s.graded_by, 'Lần chấm': s.revision, 'Ngày chấm': s.created_at })); }
