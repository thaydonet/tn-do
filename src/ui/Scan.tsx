import { useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, ScanLine, Save } from 'lucide-react';
import { latest, upgradeExamPrintTemplate } from '../lib/repository';
import { newestPrintTemplate } from '../domain/templates';
import { grade } from '../domain/grading-engine';
import { checkQR, matchTemplate } from '../domain/template-matcher';
import { reviewAnswer } from '../domain/result-review';
import { commitSubmission, enqueueSubmission, pendingSubmissions, type PendingSubmission } from '../domain/submission-storage';
import type { Recognition, Student } from '../domain/schemas';
import { Badge, Empty, useApp, useTask } from './context';
import { SheetAnalyzer, type Analysis } from './SheetAnalyzer';
import { rpc } from '../lib/supabase';
import { recordIssue } from '../domain/review-issues';
import { RecognitionAnswerEditor } from './RecognitionAnswerEditor';
import { questionLabel } from '../domain/answer-format';
export function Scan({ initialExamId = '' }: { initialExamId?: string }) {
  const { workspace: w, orgId, userId, reload, navigate, notify } = useApp(), { busy, run } = useTask();
  const [examId, setExamId] = useState(initialExamId), [analysis, setAnalysis] = useState<Analysis | null>(null), [marks, setMarks] = useState<Recognition[]>([]), [studentId, setStudentId] = useState(''), [code, setCode] = useState(''), [confirmed, setConfirmed] = useState(false), [allowDraft, setAllowDraft] = useState(false), [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [resetToken, setResetToken] = useState(0), savedStudents = useRef(new Set<string>());
  const exam = latest(w.exams).find(e => e.id === examId), template = w.templates.find(t => t.id === exam?.template_id && t.version === exam?.template_version), students = w.students.filter(s => exam && (!exam.class_id || s.class_id === exam.class_id)), student = students.find(s => s.id === studentId);
  const newestPrint = template && newestPrintTemplate(w.templates, template.code);
  const hasNewPrint = newestPrint && (newestPrint.id !== template?.id || newestPrint.version !== template?.version);
  const recognitionTemplate = useMemo(() => {
    if (!template || !exam) return template;
    const numbers = new Set(exam.document.answer_sheets.flatMap(s => s.sections.flatMap(section => section.questions.map(q => q.number))));
    return { ...template, questions: template.questions.filter(q => numbers.has(q.number)) };
  }, [template, exam]);
  const activeNumbers = new Set((exam?.document.answer_sheets.find(s => s.exam_code === code)?.sections.flatMap(s => s.questions) ?? recognitionTemplate?.questions ?? []).map(q => q.number));
  const activeMarks = marks.filter(m => activeNumbers.has(m.number));
  const result = useMemo(() => { if (!exam || !code || !marks.length) return null; try { return grade(exam.document, code, marks); } catch { return null; } }, [exam, code, marks]);
  const invalidate = () => { setAnalysis(null); setMarks([]); setConfirmed(false); };
  const save = async (a: Analysis, detectedStudent: Student, examCode: string, detectedMarks: Recognition[], id: string) => {
    if (!exam) return;
    if (savedStudents.current.has(`${exam.id}:${detectedStudent.id}`) || w.submissions.some(s => s.exam_id === exam.id && s.student_id === detectedStudent.id)) throw new Error('Học sinh đã có bài trong kỳ thi này. Dùng chức năng chấm lại trong báo cáo.');
    if ((await pendingSubmissions(orgId, userId)).some(p => p.exam.id === exam.id && p.student.id === detectedStudent.id)) throw new Error('Phiếu của học sinh này đã nằm trong bản chờ. Mở Kết nối & đồng bộ để gửi lại, tránh lưu trùng.');
    const item: PendingSubmission = { id, org_id: orgId, user_id: userId, exam, student: detectedStudent, exam_code: examCode, marks: detectedMarks, original: a.original, processed: a.processed, created_at: new Date().toISOString() };
    await enqueueSubmission(item);
    try { await commitSubmission(item); }
    catch (e) { throw new Error(`${e instanceof Error ? e.message : String(e)}. Ảnh và kết quả đang được giữ trong bản chờ trên thiết bị. Mở Kết nối & đồng bộ để gửi lại.`); }
    savedStudents.current.add(`${exam.id}:${detectedStudent.id}`);
    invalidate(); setCode(''); setStudentId(''); setResetToken(token => token + 1);
    await reload().catch(() => notify('Đã lưu phiếu; chưa tải lại được danh sách kết quả.', true));
  };
  const receive = async (a: Analysis, automatic = false): Promise<'saved' | 'review'> => {
    let outcome: 'saved' | 'review' = 'review';
    await run(async () => { try {
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
    const rawNumber = a.qr?.student_number ?? a.studentNumber, rawCode = a.qr?.exam_code ?? a.examCode;
    const matchedSheet = exam.document.answer_sheets.find(s => s.exam_code === rawCode || (rawCode && s.exam_code.replace(/^0+/, '') === rawCode.replace(/^0+/, '')));
    if (rawCode && !matchedSheet) throw new Error(`Mã đề nhận diện ${rawCode} không thuộc kỳ thi`);
    const detectedCode = matchedSheet ? matchedSheet.exam_code : rawCode;
    const matchingStudents = students.filter(s => s.number === rawNumber || (rawNumber && s.number.replace(/^0+/, '') === rawNumber.replace(/^0+/, ''))), detectedStudent = matchingStudents.length === 1 ? matchingStudents[0] : undefined;
    if (rawNumber && !detectedStudent) { const message = `SBD ${rawNumber} không có trong danh sách học sinh được chọn. Cần xác minh thủ công.`; notify(message, true); await recordIssue(orgId, exam.id, 'student', message); }
    const id = crypto.randomUUID();
    setStudentId(detectedStudent?.id ?? ''); setCode(detectedCode ?? ''); setAnalysis(a); setMarks(a.marks); setConfirmed(false); setSubmissionId(id);
    if (automatic) {
      const detectedResult = detectedCode ? grade(exam.document, detectedCode, a.marks) : null;
      if (detectedStudent && detectedCode && detectedResult && !detectedResult.needsReview) {
        await save(a, detectedStudent, detectedCode, detectedResult.answers, id);
        outcome = 'saved';
        notify(`Đã lưu ${detectedStudent.number} · ${detectedStudent.name}: ${detectedResult.score.toLocaleString('vi-VN')}/${detectedResult.max_score} điểm`);
      } else notify('Phiếu cần xác minh SBD, mã đề hoặc ô tô. Kiểm tra và xác nhận lưu để tiếp tục chấm.');
    }
  } catch (e) { if (exam) await recordIssue(orgId, exam.id, 'qr', e instanceof Error ? e.message : String(e)).catch(() => {}); throw e; } });
    return outcome;
  };
  return <><div className="page-heading"><div><p className="eyebrow">CHẤM THI BẰNG CAMERA</p><h1>Mỗi phiếu, một kết quả rõ ràng.</h1><p>Đưa 4 mốc vào khung: tự chụp, chấm, lưu và tiếp tục phiếu kế tiếp.</p></div><Badge tone="neutral"><ScanLine size={14}/> OMR theo template</Badge></div>
    <div className="scan-steps"><span className="active">01 <b>Chọn kỳ thi</b></span><i/><span className={analysis ? 'active' : ''}>02 <b>Nhận diện phiếu</b></span><i/><span className={result ? 'active' : ''}>03 <b>Xác minh & lưu</b></span></div>
    <section className="panel scan-config"><label>Kỳ thi<select value={examId} onChange={e => { setExamId(e.target.value); invalidate(); setCode(''); setStudentId(''); setAllowDraft(false); }}><option value="">Chọn kỳ thi cần chấm</option>{latest(w.exams).map(e => <option key={e.id} value={e.id}>{e.document.exam.title} · {w.classes.find(c => c.id === e.class_id)?.name ?? 'Không giới hạn lớp'} · v{e.version}</option>)}</select></label><div><span className="helper">Mẫu phiếu đã chọn</span><p><strong>{template?.name ?? 'Chưa chọn'}</strong>{template && <Badge tone="neutral">v{template.version}</Badge>}</p></div></section>
    {!exam ? <section className="panel"><Empty text="Chọn kỳ thi để bắt đầu"><button className="button secondary" onClick={() => navigate('exams')}>Quản lý kỳ thi</button></Empty></section> : !template ? <p className="notice amber">Không tìm thấy đúng phiên bản mẫu phiếu. Kiểm tra cấu hình kỳ thi.</p> : <>
      {hasNewPrint && <div className="notice amber"><p>Kỳ thi đang dùng {template.code} v{template.version}. Phiếu tải từ thư mục forms hiện dùng v{newestPrint.version}; cần chuyển mẫu trước khi chấm phiếu mới.</p><button className="button secondary" disabled={busy} onClick={() => void run(async () => { await upgradeExamPrintTemplate(orgId, exam, w.templates); invalidate(); setCode(''); setStudentId(''); setAllowDraft(false); setResetToken(token => token + 1); await reload(); }, 'Đã chuyển kỳ thi sang mẫu in mới; điểm và ảnh bài cũ được giữ nguyên')}>Dùng phiếu mới nhất · v{newestPrint.version}</button></div>}
      {template.print_layout === 'a4-25mm' && <p className="helper">Phiếu đang chấm: {template.code} · v{template.version} · A4, lề 25 mm. SBD {template.student_region?.length} chữ số, mã đề {template.code_region?.length} chữ số. Đối chiếu mã và phiên bản ở đầu phiếu.</p>}
      {!template.active && <label className="notice amber check"><input type="checkbox" checked={allowDraft} onChange={e => { setAllowDraft(e.target.checked); invalidate(); }}/>Tôi xác nhận sử dụng phiên bản mẫu phiếu này và sẽ đối chiếu kết quả nhận diện.</label>}
      {(template.active || allowDraft) && <div className="scan-layout"><section className="panel"><div className="panel-title"><div><h2>Ảnh phiếu trả lời</h2><p>Chỉ chấm và xác minh các câu trong đề; bỏ qua phần còn lại của phiếu.</p></div><span className="step-number">02</span></div><SheetAnalyzer key={`${exam.id}:${template.version}`} template={recognitionTemplate!} resetToken={resetToken} onAnalysis={receive} onInvalidate={invalidate} onIssue={message => { void recordIssue(orgId, exam.id, 'qr', message).catch(() => {}); }}/></section>
      <section className="panel review-panel"><div className="panel-title"><div><h2>Xác minh kết quả</h2><p>Đối chiếu với phiếu trước khi lưu.</p></div><span className="step-number">03</span></div>{!analysis ? <Empty text="Kết quả sẽ xuất hiện ở đây"><p>Chụp ảnh và chạy nhận diện để tiếp tục.</p></Empty> : <><div className="form-grid"><label>Học sinh / số báo danh<select value={studentId} onChange={e => { setStudentId(e.target.value); setConfirmed(false); }}><option value="">Xác nhận học sinh</option>{students.map(s => <option key={s.id} value={s.id}>{s.number} · {s.name}</option>)}</select></label><label>Mã đề<select value={code} onChange={e => { setCode(e.target.value); setConfirmed(false); }}><option value="">Xác nhận mã đề</option>{exam.document.answer_sheets.map(s => <option key={s.exam_code}>{s.exam_code}</option>)}</select></label></div><p className="helper">{analysis.qr ? 'Đã kiểm tra QR thuộc kỳ thi.' : 'Không có QR; cần xác nhận SBD và mã đề thủ công.'}</p>
      {result && <div className="score-preview"><span>Điểm dự kiến<strong>{result.score.toLocaleString('vi-VN')}<small> / {result.max_score}</small></strong></span><span>{result.answers.filter(a => a.status === 'correct').length} đúng / {result.answers.length} câu<small>{result.answers.filter(a => a.state === 'review' || (a.state === 'multiple' && !a.reviewed)).length} câu cần xác minh</small></span></div>}
      <div className="recognition-list">{activeMarks.map(m => { const q = template.questions.find(q => q.number === m.number)!, answer = result?.answers.find(a => a.number === m.number); return <div key={m.number} className={`recognition-row ${m.state === 'review' || m.state === 'multiple' ? 'needs-review' : ''}`}><span className="question-number">{questionLabel(m.number, q.section)}</span><RecognitionAnswerEditor question={q} mark={m} change={selected => { setMarks(marks.map(old => old.number === m.number ? reviewAnswer(old, selected) : old)); setConfirmed(false); }}/><span className={`mark-label ${answer?.status ?? m.state}`}>{m.state === 'review' || answer?.status === 'review' ? 'Xác minh' : m.state === 'multiple' ? 'Nhiều ô' : m.state === 'blank' ? 'Bỏ trống' : answer?.status === 'correct' ? 'Đúng' : answer?.status === 'partial' ? 'Đúng một phần' : answer ? 'Sai' : 'Đã tô'}</span><button className={`icon-button ${m.reviewed ? 'verified' : ''}`} title="Xác nhận giữ nguyên ô đã nhận diện" aria-label={`Xác nhận câu ${m.number}`} onClick={() => { setMarks(marks.map(old => old.number === m.number ? reviewAnswer(old, old.selected) : old)); setConfirmed(false); }}><Check size={17}/></button></div>; })}</div>
      <button className="text-button" onClick={() => { setMarks(marks.map(m => m.state === 'review' || m.state === 'multiple' ? m : reviewAnswer(m, m.selected))); }}><CheckCheck size={16}/>Xác nhận các câu rõ ràng</button>
      <label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>Tôi đã đối chiếu học sinh, mã đề và các câu trả lời với ảnh phiếu.</label><button className="button primary full-width" disabled={busy || !confirmed || !student || !result || result.answers.some(a => a.state === 'review' || (a.state === 'multiple' && !a.reviewed))} onClick={() => void run(async () => { if (!student || !analysis || !result) return; await save(analysis, student, code, activeMarks, submissionId); }, 'Đã lưu ảnh và kết quả chấm')}><Save size={17}/>{busy ? 'Đang lưu…' : 'Xác nhận & lưu kết quả'}</button><p className="helper">Nếu mất mạng, bản chờ được giữ trên thiết bị. Gửi lại tại mục Kết nối.</p></>}
      </section></div>}
    </>}
  </>;
}
