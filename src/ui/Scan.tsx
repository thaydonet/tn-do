import { useMemo, useState } from 'react';
import { Check, CheckCheck, ScanLine, Save } from 'lucide-react';
import { latest } from '../lib/repository';
import { grade } from '../domain/grading-engine';
import { checkQR, matchTemplate } from '../domain/template-matcher';
import { reviewAnswer } from '../domain/result-review';
import { commitSubmission, enqueueSubmission, type PendingSubmission } from '../domain/submission-storage';
import type { Recognition } from '../domain/schemas';
import { Badge, Empty, useApp, useTask } from './context';
import { SheetAnalyzer, type Analysis } from './SheetAnalyzer';
import { rpc } from '../lib/supabase';
import { recordIssue } from '../domain/review-issues';
export function Scan({ initialExamId = '' }: { initialExamId?: string }) {
  const { workspace: w, orgId, userId, reload, navigate, notify } = useApp(), { busy, run } = useTask();
  const [examId, setExamId] = useState(initialExamId), [analysis, setAnalysis] = useState<Analysis | null>(null), [marks, setMarks] = useState<Recognition[]>([]), [studentId, setStudentId] = useState(''), [code, setCode] = useState(''), [confirmed, setConfirmed] = useState(false), [allowDraft, setAllowDraft] = useState(false), [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const exam = latest(w.exams).find(e => e.id === examId), template = w.templates.find(t => t.id === exam?.template_id && t.version === exam?.template_version), students = w.students.filter(s => exam && (!exam.class_id || s.class_id === exam.class_id)), student = students.find(s => s.id === studentId);
  const recognitionTemplate = useMemo(() => {
    if (!template || !exam) return template;
    const numbers = new Set(exam.document.answer_sheets.flatMap(s => s.sections.flatMap(section => section.questions.map(q => q.number))));
    return { ...template, questions: template.questions.filter(q => numbers.has(q.number)) };
  }, [template, exam]);
  const activeNumbers = new Set((exam?.document.answer_sheets.find(s => s.exam_code === code)?.sections.flatMap(s => s.questions) ?? recognitionTemplate?.questions ?? []).map(q => q.number));
  const activeMarks = marks.filter(m => activeNumbers.has(m.number));
  const result = useMemo(() => { if (!exam || !code || !marks.length) return null; try { return grade(exam.document, code, marks); } catch { return null; } }, [exam, code, marks]);
  const invalidate = () => { setAnalysis(null); setMarks([]); setConfirmed(false); };
  const receive = (a: Analysis) => void run(async () => { try {
    if (!exam || !template) return;
    matchTemplate(w.templates, template.id, template.version, exam.document);
    if (a.qr) {
      checkQR(a.qr, exam.id, template);
      if (a.qr.reference) {
        const resolved = await rpc<{ student_number: string; exam_code: string }>('validate_sheet_reference', { p_reference: a.qr.reference, p_exam: exam.id, p_student_number: a.qr.student_number ?? null, p_code: a.qr.exam_code ?? null });
        a.qr = { ...a.qr, ...resolved };
      }
    }
    if (a.qr?.student_number && a.studentNumber && a.qr.student_number !== a.studentNumber) throw new Error('Số báo danh QR và ô tô không khớp');
    if (a.qr?.exam_code && a.examCode && a.qr.exam_code !== a.examCode) throw new Error('Mã đề QR và ô tô không khớp');
    const number = a.qr?.student_number ?? a.studentNumber, detectedCode = a.qr?.exam_code ?? a.examCode;
    if (detectedCode && !exam.document.answer_sheets.some(s => s.exam_code === detectedCode)) throw new Error(`Mã đề nhận diện ${detectedCode} không thuộc kỳ thi`);
    const detectedStudent = students.find(s => s.number === number);
    if (number && !detectedStudent) { const message = `SBD ${number} không có trong danh sách học sinh được chọn. Cần xác minh thủ công.`; notify(message, true); await recordIssue(orgId, exam.id, 'student', message); }
    setStudentId(detectedStudent?.id ?? ''); setCode(detectedCode ?? ''); setAnalysis(a); setMarks(a.marks); setConfirmed(false); setSubmissionId(crypto.randomUUID());
  } catch (e) { if (exam) await recordIssue(orgId, exam.id, 'qr', e instanceof Error ? e.message : String(e)).catch(() => {}); throw e; } });
  return <><div className="page-heading"><div><p className="eyebrow">CHẤM THI BẰNG CAMERA</p><h1>Mỗi phiếu, một kết quả rõ ràng.</h1><p>Chụp ảnh, kiểm tra nhận diện và xác nhận trước khi lưu.</p></div><Badge tone="neutral"><ScanLine size={14}/> OMR theo template</Badge></div>
    <div className="scan-steps"><span className="active">01 <b>Chọn kỳ thi</b></span><i/><span className={analysis ? 'active' : ''}>02 <b>Nhận diện phiếu</b></span><i/><span className={result ? 'active' : ''}>03 <b>Xác minh & lưu</b></span></div>
    <section className="panel scan-config"><label>Kỳ thi<select value={examId} onChange={e => { setExamId(e.target.value); invalidate(); setCode(''); setStudentId(''); setAllowDraft(false); }}><option value="">Chọn kỳ thi cần chấm</option>{latest(w.exams).map(e => <option key={e.id} value={e.id}>{e.document.exam.title} · {w.classes.find(c => c.id === e.class_id)?.name ?? 'Không giới hạn lớp'} · v{e.version}</option>)}</select></label><div><span className="helper">Mẫu phiếu đã chọn</span><p><strong>{template?.name ?? 'Chưa chọn'}</strong>{template && <Badge tone={template.active ? 'green' : 'amber'}>v{template.version} · {template.active ? 'Hoạt động' : 'Thử nghiệm'}</Badge>}</p></div></section>
    {!exam ? <section className="panel"><Empty text="Chọn kỳ thi để bắt đầu"><button className="button secondary" onClick={() => navigate('exams')}>Quản lý kỳ thi</button></Empty></section> : !template ? <p className="notice amber">Không tìm thấy đúng phiên bản mẫu phiếu. Kiểm tra cấu hình kỳ thi.</p> : <>
      {!template.active && <label className="notice amber check"><input type="checkbox" checked={allowDraft} onChange={e => { setAllowDraft(e.target.checked); invalidate(); }}/>Tôi chọn sử dụng mẫu thử nghiệm này và sẽ kiểm tra toàn bộ kết quả nhận diện.</label>}
      {(template.active || allowDraft) && <div className="scan-layout"><section className="panel"><div className="panel-title"><div><h2>Ảnh phiếu trả lời</h2><p>Chỉ chấm và xác minh các câu trong đề; bỏ qua phần còn lại của phiếu.</p></div><span className="step-number">02</span></div><SheetAnalyzer key={`${exam.id}:${template.version}`} template={recognitionTemplate!} onAnalysis={receive} onInvalidate={invalidate} onIssue={message => { void recordIssue(orgId, exam.id, 'qr', message).catch(() => {}); }}/></section>
      <section className="panel review-panel"><div className="panel-title"><div><h2>Xác minh kết quả</h2><p>Đối chiếu với phiếu trước khi lưu.</p></div><span className="step-number">03</span></div>{!analysis ? <Empty text="Kết quả sẽ xuất hiện ở đây"><p>Chụp ảnh và chạy nhận diện để tiếp tục.</p></Empty> : <><div className="form-grid"><label>Học sinh / số báo danh<select value={studentId} onChange={e => { setStudentId(e.target.value); setConfirmed(false); }}><option value="">Xác nhận học sinh</option>{students.map(s => <option key={s.id} value={s.id}>{s.number} · {s.name}</option>)}</select></label><label>Mã đề<select value={code} onChange={e => { setCode(e.target.value); setConfirmed(false); }}><option value="">Xác nhận mã đề</option>{exam.document.answer_sheets.map(s => <option key={s.exam_code}>{s.exam_code}</option>)}</select></label></div><p className="helper">{analysis.qr ? 'Đã kiểm tra QR thuộc kỳ thi.' : 'Không có QR; cần xác nhận SBD và mã đề thủ công.'}</p>
      {result && <div className="score-preview"><span>Điểm dự kiến<strong>{result.score.toLocaleString('vi-VN')}<small> / {result.max_score}</small></strong></span><span>{result.answers.filter(a => a.status === 'correct').length} đúng / {result.answers.length} câu<small>{activeMarks.filter(m => m.state === 'review' || (m.state === 'multiple' && !m.reviewed)).length} câu cần xác minh</small></span></div>}
      <div className="recognition-list">{activeMarks.map(m => { const q = template.questions.find(q => q.number === m.number)!, answer = result?.answers.find(a => a.number === m.number); return <div key={m.number} className={`recognition-row ${m.state === 'review' || m.state === 'multiple' ? 'needs-review' : ''}`}><span className="question-number">{String(m.number).padStart(2, '0')}</span><div className="bubble-options">{q.bubbles.map(b => <button key={b.label} className={m.selected.includes(b.label) ? 'chosen' : ''} aria-label={`Câu ${m.number}, ${b.label}`} aria-pressed={m.selected.includes(b.label)} onClick={() => { setMarks(marks.map(old => old.number === m.number ? reviewAnswer(old, m.selected.includes(b.label) ? m.selected.filter(x => x !== b.label) : [b.label]) : old)); setConfirmed(false); }}>{b.label}</button>)}</div><span className={`mark-label ${answer?.status ?? m.state}`}>{m.state === 'review' ? 'Xác minh' : m.state === 'multiple' ? 'Nhiều ô' : m.state === 'blank' ? 'Bỏ trống' : answer?.status === 'correct' ? 'Đúng' : answer ? 'Sai' : 'Đã tô'}</span><button className={`icon-button ${m.reviewed ? 'verified' : ''}`} title="Xác nhận giữ nguyên ô đã nhận diện" aria-label={`Xác nhận câu ${m.number}`} onClick={() => { setMarks(marks.map(old => old.number === m.number ? reviewAnswer(old, old.selected) : old)); setConfirmed(false); }}><Check size={17}/></button></div>; })}</div>
      <button className="text-button" onClick={() => { setMarks(marks.map(m => m.state === 'review' || m.state === 'multiple' ? m : reviewAnswer(m, m.selected))); }}><CheckCheck size={16}/>Xác nhận các câu rõ ràng</button>
      <label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>Tôi đã đối chiếu học sinh, mã đề và các câu trả lời với ảnh phiếu.</label><button className="button primary full-width" disabled={busy || !confirmed || !student || !result} onClick={() => void run(async () => { if (!student || !analysis || !result) return; const item: PendingSubmission = { id: submissionId, org_id: orgId, user_id: userId, exam, student, exam_code: code, marks: activeMarks, original: analysis.original, processed: analysis.processed, created_at: new Date().toISOString() }; await enqueueSubmission(item); await commitSubmission(item); await reload(); invalidate(); setCode(''); setStudentId(''); }, 'Đã lưu ảnh và kết quả chấm')}><Save size={17}/>{busy ? 'Đang lưu…' : 'Xác nhận & lưu kết quả'}</button><p className="helper">Nếu mất mạng, bản chờ được giữ trên thiết bị. Gửi lại tại mục Kết nối.</p></>}
      </section></div>}
    </>}
  </>;
}
