import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ScanLine, RotateCcw, Upload } from 'lucide-react';
import type { Point, Recognition, SheetQR, SheetTemplate } from '../domain/schemas';
import { canvasBlob, detectAnchors, imageCanvas, preprocess } from '../domain/image-preprocessor';
import { recognize, recognizeDigits } from '../domain/omr-engine';
import { readQR } from '../domain/qr-reader';
import { useTask } from './context';

export interface Analysis { marks: Recognition[]; qr: SheetQR | null; studentNumber: string | null; examCode: string | null; original: Blob; processed: Blob; aligned: HTMLCanvasElement }
export function SheetAnalyzer({ template, onAnalysis, onInvalidate, calibrate, onIssue }: { template: SheetTemplate; onAnalysis?: (value: Analysis) => void; onInvalidate?: () => void; calibrate?: (point: Point) => void; onIssue?: (message: string) => void }) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null), [sourceBlob, setSourceBlob] = useState<Blob | null>(null), [corners, setCorners] = useState<Point[]>([]), [aligned, setAligned] = useState<HTMLCanvasElement | null>(null), [message, setMessage] = useState(''), [allowNoQR, setAllowNoQR] = useState(false);
  const [calibration, setCalibration] = useState(false), ref = useRef<HTMLCanvasElement>(null), fileRef = useRef<HTMLInputElement>(null), cameraRef = useRef<HTMLInputElement>(null), { busy, run } = useTask();
  const templateKey = JSON.stringify(template);
  useEffect(() => { setAligned(null); setMessage(''); }, [templateKey]);
  useEffect(() => {
    const canvas = ref.current, base = aligned ?? source; if (!canvas || !base) return;
    canvas.width = base.width; canvas.height = base.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(base, 0, 0);
    if (aligned) {
      for (const q of template.questions) for (const b of q.bubbles) { ctx.beginPath(); ctx.arc(b.x * base.width, b.y * base.height, b.radius * base.width, 0, Math.PI * 2); ctx.strokeStyle = '#00a78a'; ctx.lineWidth = 2; ctx.stroke(); }
      for (const region of [template.student_region, template.code_region]) for (const col of region ?? []) for (const b of col) { ctx.beginPath(); ctx.arc(b.x * base.width, b.y * base.height, b.radius * base.width, 0, Math.PI * 2); ctx.strokeStyle = '#8f5fd1'; ctx.lineWidth = 1; ctx.stroke(); }
    } else corners.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x * base.width, p.y * base.height, 12, 0, Math.PI * 2); ctx.fillStyle = '#dc6c36'; ctx.fill(); ctx.font = 'bold 24px sans-serif'; ctx.fillText(String(i + 1), p.x * base.width + 18, p.y * base.height); });
  }, [source, aligned, corners, template]);
  const load = (file: File) => run(async () => {
    onInvalidate?.(); setSource(null); setAligned(null); setCorners([]); setMessage('Đang tìm mốc định vị…'); setAllowNoQR(false);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Vui lòng dùng ảnh JPEG, PNG hoặc WebP');
    const canvas = await imageCanvas(file); setSource(canvas);
    // Preserve full-resolution source pixels as a PNG; only the processing canvas is resized.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }), full = document.createElement('canvas'); full.width = bitmap.width; full.height = bitmap.height; full.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close(); const original = await canvasBlob(full); if (original.size > 50 * 1024 * 1024) throw new Error('Ảnh gốc sau khi mã hóa vượt 50 MB. Chọn độ phân giải thấp hơn.'); setSourceBlob(original);
    const found = await detectAnchors(canvas); setCorners(found ?? []); setMessage(found ? 'Đã tìm thấy 4 mốc. Kiểm tra vị trí trước khi nhận diện.' : 'Chạm tâm 4 mốc: trái trên → phải trên → phải dưới → trái dưới.');
  });
  const analyze = () => run(async () => {
    if (!source || !sourceBlob) return; onInvalidate?.();
    const result = await preprocess(source, template, corners); setAligned(result.aligned);
    let qr: SheetQR | null;
    try { qr = await readQR(result.aligned, template.qr_region); } catch (e) { onIssue?.(e instanceof Error ? e.message : String(e)); throw e; }
    if (!qr && !allowNoQR) throw new Error('Không đọc được QR. Kiểm tra ảnh, hoặc xác nhận tiếp tục và nhập thông tin thủ công.');
    const marks = recognize(result.pixels, template), studentNumber = recognizeDigits(result.pixels, template.student_region, template.thresholds), examCode = recognizeDigits(result.pixels, template.code_region, template.thresholds);
    onAnalysis?.({ marks, qr, studentNumber, examCode, original: sourceBlob, processed: await canvasBlob(result.processed), aligned: result.aligned });
    setMessage(`Đã nhận diện ${marks.length} câu · ${marks.filter(m => m.state === 'review' || m.state === 'multiple').length} câu cần xác minh${qr ? ' · Có QR hợp lệ' : ' · Không có QR'}`);
  });
  const fileChanged = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void load(file); e.target.value = ''; };
  return <div className="analyzer"><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={fileChanged}/><input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={fileChanged}/>
    {!source ? <div className="upload-zone"><span className="camera-circle"><Camera size={30}/></span><strong>{busy ? 'Đang mở ảnh…' : 'Chụp hoặc tải ảnh phiếu'}</strong><span>Chụp đủ 4 mốc, ánh sáng đều, phiếu phẳng</span><button className="button primary" disabled={busy} onClick={() => cameraRef.current?.click()}><Camera size={16}/>Chụp bằng camera</button><button className="button secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16}/>Chọn ảnh từ thiết bị</button><small>JPEG, PNG, WebP · Tối đa 20 MB</small></div> : <>
      <div className="sheet-tools"><button className="button secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={15}/>Đổi ảnh</button><button className="button secondary" disabled={busy} onClick={() => cameraRef.current?.click()}><Camera size={15}/>Chụp lại</button><button className="button secondary" onClick={() => { setCorners([]); setAligned(null); onInvalidate?.(); }} disabled={busy}><RotateCcw size={15}/>Chọn lại mốc</button>{calibrate && aligned && <button className={`button ${calibration ? 'primary' : 'secondary'}`} onClick={() => setCalibration(!calibration)}>Hiệu chỉnh ô bằng chạm</button>}</div>
      <div className="sheet-canvas"><canvas ref={ref} onClick={e => { if (busy) return; const rect = e.currentTarget.getBoundingClientRect(), point = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }; if (aligned && calibration) calibrate?.(point); else if (!aligned && corners.length < 4) { setCorners([...corners, point]); onInvalidate?.(); } }}/></div>
      <p className="helper">{message}</p><label className="check"><input type="checkbox" checked={allowNoQR} onChange={e => { setAllowNoQR(e.target.checked); onInvalidate?.(); }}/> Cho phép không có QR; tôi sẽ xác nhận SBD và mã đề.</label>
      <button className="button primary" onClick={() => void analyze()} disabled={busy || corners.length !== 4}><ScanLine size={17}/>{busy ? 'Đang xử lý ảnh…' : 'Căn chỉnh & nhận diện'}</button>
    </>}
  </div>;
}
