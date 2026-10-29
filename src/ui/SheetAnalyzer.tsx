import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ScanLine, RotateCcw, Upload } from 'lucide-react';
import type { Point, Recognition, SheetQR, SheetTemplate } from '../domain/schemas';
import { questionBubbles } from '../domain/schemas';
import { canvasBlob, detectAnchors, imageCanvas, preprocess } from '../domain/image-preprocessor';
import { recognize, recognizeDigits } from '../domain/omr-engine';
import { readQR } from '../domain/qr-reader';
import { useTask } from './context';
import { LiveSheetCamera, type CameraFrame } from './LiveSheetCamera';
import { createTNMakerTemplate } from '../domain/tnmaker-sheet';

export interface Analysis { marks: Recognition[]; qr: SheetQR | null; studentNumber: string | null; examCode: string | null; original: Blob; processed: Blob; aligned: HTMLCanvasElement }
export function SheetAnalyzer({ template, onAnalysis, onInvalidate, calibrate, onIssue, resetToken = 0 }: { template: SheetTemplate; onAnalysis?: (value: Analysis, automatic?: boolean) => void | 'saved' | 'review' | Promise<void | 'saved' | 'review'>; onInvalidate?: () => void; calibrate?: (point: Point) => void; onIssue?: (message: string) => void; resetToken?: number }) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null), [sourceBlob, setSourceBlob] = useState<Blob | null>(null), [corners, setCorners] = useState<Point[]>([]), [aligned, setAligned] = useState<HTMLCanvasElement | null>(null), [message, setMessage] = useState(''), [allowNoQR, setAllowNoQR] = useState(false);
  const [calibration, setCalibration] = useState(false), ref = useRef<HTMLCanvasElement>(null), fileRef = useRef<HTMLInputElement>(null), cameraRef = useRef<HTMLInputElement>(null), { busy, run } = useTask();
  const [cameraOpen, setCameraOpen] = useState(false), [waitForRemoval, setWaitForRemoval] = useState(false), resumeCamera = useRef(false), previousReset = useRef(resetToken);
  const [activeTemplate, setActiveTemplate] = useState<SheetTemplate>(template);
  useEffect(() => {
    if (previousReset.current === resetToken) return;
    previousReset.current = resetToken;
    setSource(null); setSourceBlob(null); setAligned(null); setCorners([]); setMessage(''); setAllowNoQR(false);
    if (resumeCamera.current) { setWaitForRemoval(true); setCameraOpen(true); }
  }, [resetToken]);
  const templateKey = JSON.stringify(template);
  useEffect(() => { setAligned(null); setMessage(''); setActiveTemplate(template); }, [templateKey, template]);
  useEffect(() => {
    const canvas = ref.current, base = aligned ?? source; if (!canvas || !base) return;
    canvas.width = base.width; canvas.height = base.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(base, 0, 0);
    if (aligned) {
      for (const q of activeTemplate.questions) for (const b of questionBubbles(q)) { ctx.beginPath(); ctx.arc(b.x * base.width, b.y * base.height, b.radius * base.width, 0, Math.PI * 2); ctx.strokeStyle = '#00a78a'; ctx.lineWidth = 2; ctx.stroke(); }
      for (const region of [activeTemplate.student_region, activeTemplate.code_region]) for (const col of region ?? []) for (const b of col) { ctx.beginPath(); ctx.arc(b.x * base.width, b.y * base.height, b.radius * base.width, 0, Math.PI * 2); ctx.strokeStyle = '#8f5fd1'; ctx.lineWidth = 1; ctx.stroke(); }
    } else corners.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x * base.width, p.y * base.height, 12, 0, Math.PI * 2); ctx.fillStyle = '#dc6c36'; ctx.fill(); ctx.font = 'bold 24px sans-serif'; ctx.fillText(String(i + 1), p.x * base.width + 18, p.y * base.height); });
  }, [source, aligned, corners, activeTemplate]);
  const load = (file: File) => run(async () => {
    resumeCamera.current = false;
    onInvalidate?.(); setSource(null); setAligned(null); setCorners([]); setMessage('Đang tìm mốc định vị…'); setAllowNoQR(false);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Vui lòng dùng ảnh JPEG, PNG hoặc WebP');
    const canvas = await imageCanvas(file); setSource(canvas);
    // Preserve full-resolution source pixels as a PNG; only the processing canvas is resized.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }), full = document.createElement('canvas'); full.width = bitmap.width; full.height = bitmap.height; full.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close(); const original = await canvasBlob(full); if (original.size > 50 * 1024 * 1024) throw new Error('Ảnh gốc sau khi mã hóa vượt 50 MB. Chọn độ phân giải thấp hơn.'); setSourceBlob(original);
    const found = await detectAnchors(canvas); setCorners(found ?? []);
    if (found && found.length === 4 && template.code === 'TNMAKER-2026') {
      setActiveTemplate(createTNMakerTemplate(template.questions.map(q => q.number)));
    }
    setMessage(found ? 'Đã tìm thấy 4 mốc. Kiểm tra vị trí trước khi nhận diện.' : 'Chạm tâm 4 mốc: trái trên → phải trên → phải dưới → trái dưới.');
  });
  const analyzeSource = async (canvas: HTMLCanvasElement, original: Blob, points: Point[], automatic = false) => {
    onInvalidate?.();
    const isTNMaker = template.code === 'TNMAKER-2026';
    const effectiveTemplate = isTNMaker ? createTNMakerTemplate(template.questions.map(q => q.number)) : template;
    setActiveTemplate(effectiveTemplate);
    const result = await preprocess(canvas, effectiveTemplate, points); setAligned(result.aligned);
    let qr: SheetQR | null = null;
    try {
      if (effectiveTemplate.qr_region) qr = await readQR(result.aligned, effectiveTemplate.qr_region);
    } catch (e) {
      if (!isTNMaker) { onIssue?.(e instanceof Error ? e.message : String(e)); throw e; }
    }
    if (!qr && !allowNoQR && !automatic && !isTNMaker) throw new Error('Không đọc được QR. Kiểm tra ảnh, hoặc xác nhận tiếp tục và nhập thông tin thủ công.');
    const marks = recognize(result.pixels, effectiveTemplate), studentNumber = recognizeDigits(result.pixels, effectiveTemplate.student_region, effectiveTemplate.thresholds), examCode = recognizeDigits(result.pixels, effectiveTemplate.code_region, effectiveTemplate.thresholds);
    const outcome = await onAnalysis?.({ marks, qr, studentNumber, examCode, original, processed: await canvasBlob(result.processed), aligned: result.aligned }, automatic);
    setMessage(`Đã nhận diện ${marks.length} câu · ${marks.filter(m => m.state === 'review' || m.state === 'multiple').length} câu cần xác minh${qr ? ' · Có QR hợp lệ' : isTNMaker ? ' · Mẫu TN-Maker 2026' : ' · Không có QR'}`);
    return outcome;
  };
  const analyze = () => run(async () => { if (source && sourceBlob) await analyzeSource(source, sourceBlob, corners); });
  const capture = async (frame: CameraFrame): Promise<'saved' | 'review'> => {
    let outcome: 'saved' | 'review' = 'review';
    await run(async () => {
      onInvalidate?.(); setAligned(null); setAllowNoQR(true); setSourceBlob(frame.original);
      const canvas = document.createElement('canvas'), ratio = Math.min(1, 2400 / Math.max(frame.canvas.width, frame.canvas.height));
      canvas.width = Math.round(frame.canvas.width * ratio); canvas.height = Math.round(frame.canvas.height * ratio);
      canvas.getContext('2d')!.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height); setSource(canvas);
      const found = await detectAnchors(canvas); setCorners(found ?? frame.corners);
      if (!found) throw new Error('Phiếu bị dịch chuyển khi chụp. Kiểm tra ảnh hoặc chụp lại.');
      const received = await analyzeSource(canvas, frame.original, found, !calibrate);
      if (received === 'saved') outcome = 'saved';
    });
    return outcome;
  };
  const openCamera = () => { resumeCamera.current = true; setWaitForRemoval(false); setCameraOpen(true); };
  const fileChanged = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void load(file); e.target.value = ''; };
  return <div className="analyzer"><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={fileChanged} /><input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={fileChanged} />
    {cameraOpen && <LiveSheetCamera template={activeTemplate} waitForRemoval={waitForRemoval} onCapture={capture} close={() => setCameraOpen(false)} fallback={() => cameraRef.current?.click()} />}
    {!source ? <div className="upload-zone"><span className="camera-circle"><Camera size={30} /></span><strong>{busy ? 'Đang mở ảnh…' : 'Chụp hoặc tải ảnh phiếu'}</strong><span>Đưa 4 ô đen vào khung để tự chụp, chấm và lưu</span><button className="button primary" disabled={busy} onClick={openCamera}><Camera size={16} />Chụp bằng camera</button><button className="button secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} />Chọn ảnh từ thiết bị</button><small>JPEG, PNG, WebP · Tối đa 20 MB</small></div> : <>
      <div className="sheet-tools"><button className="button secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={15} />Đổi ảnh</button><button className="button secondary" disabled={busy} onClick={openCamera}><Camera size={15} />Chụp lại</button><button className="button secondary" onClick={() => { setCorners([]); setAligned(null); onInvalidate?.(); }} disabled={busy}><RotateCcw size={15} />Chọn lại mốc</button>{calibrate && aligned && <button className={`button ${calibration ? 'primary' : 'secondary'}`} onClick={() => setCalibration(!calibration)}>Hiệu chỉnh ô bằng chạm</button>}</div>
      <div className="sheet-canvas"><canvas ref={ref} onClick={e => { if (busy) return; const rect = e.currentTarget.getBoundingClientRect(), point = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }; if (aligned && calibration) calibrate?.(point); else if (!aligned && corners.length < 4) { setCorners([...corners, point]); onInvalidate?.(); } }} /></div>
      <p className="helper">{message}</p><label className="check"><input type="checkbox" checked={allowNoQR} onChange={e => { setAllowNoQR(e.target.checked); onInvalidate?.(); }} /> Cho phép không có QR; tôi sẽ xác nhận SBD và mã đề.</label>
      <button className="button primary" onClick={() => void analyze()} disabled={busy || corners.length !== 4}><ScanLine size={17} />{busy ? 'Đang xử lý ảnh…' : 'Căn chỉnh & nhận diện'}</button>
    </>}
  </div>;
}
