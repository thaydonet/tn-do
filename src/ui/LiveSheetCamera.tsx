import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Point, SheetTemplate } from '../domain/schemas';
import { canvasBlob, detectAnchors, loadOpenCV } from '../domain/image-preprocessor';
import { CAMERA_GUIDE_SIZE, CameraCaptureGate, cameraCrop, cameraTargets } from '../domain/camera-capture';
import './live-camera.css';

export interface CameraFrame { canvas: HTMLCanvasElement; original: Blob; corners: Point[] }
export function LiveSheetCamera({ template, onCapture, close, fallback, waitForRemoval = false }: {
  template: SheetTemplate;
  onCapture: (frame: CameraFrame) => Promise<'saved' | 'review'>;
  close: () => void;
  fallback: () => void;
  waitForRemoval?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null), captureRef = useRef(onCapture), closeRef = useRef(close);
  const initialWait = useRef(waitForRemoval);
  const [message, setMessage] = useState('Đang mở camera sau và bộ nhận diện…'), [error, setError] = useState(''), [processing, setProcessing] = useState(false), [matches, setMatches] = useState<boolean[]>([]), [progress, setProgress] = useState(0), [saved, setSaved] = useState(0);
  useEffect(() => { captureRef.current = onCapture; closeRef.current = close; });
  const aspect = template.width / template.height, targets = cameraTargets(template);
  const anchorsKey = JSON.stringify(targets);
  useEffect(() => {
    let disposed = false, stream: MediaStream | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const video = videoRef.current!, gate = new CameraCaptureGate(), probe = document.createElement('canvas');
    if (initialWait.current) gate.captured();
    const targets: Point[] = JSON.parse(anchorsKey);
    probe.width = 800; probe.height = Math.round(800 / aspect);
    const stop = () => { stream?.getTracks().forEach(track => track.stop()); video.srcObject = null; };
    const visibility = () => { gate.resetStability(); };
    document.addEventListener('visibilitychange', visibility);
    const tick = async () => {
      if (disposed) return;
      try {
        if (!document.hidden && video.readyState >= 2 && video.videoWidth) {
          const crop = cameraCrop(video.videoWidth, video.videoHeight, aspect);
          probe.getContext('2d')!.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, probe.width, probe.height);
          const corners = await detectAnchors(probe);
          if (disposed || document.hidden) { gate.resetStability(); return; }
          const state = gate.update(corners, targets, aspect, performance.now());
          setMatches(state.aligned); setProgress(state.progress);
          setMessage(state.waitingForRemoval ? 'Đã lưu. Đưa phiếu vừa chấm ra khỏi khung để chấm phiếu tiếp theo.' : state.progress > 0 ? 'Đủ 4 mốc — giữ yên để tự chụp…' : 'Đưa 4 ô đen trên phiếu vào đúng 4 ô vuông.');
          if (state.capture && corners) {
            gate.captured(); setProcessing(true); setMessage('Đang chụp, chấm và lưu kết quả…');
            const full = document.createElement('canvas'); full.width = video.videoWidth; full.height = video.videoHeight; full.getContext('2d')!.drawImage(video, 0, 0);
            const canvas = document.createElement('canvas'); canvas.width = Math.round(crop.width); canvas.height = Math.round(crop.height);
            canvas.getContext('2d')!.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
            const outcome = await captureRef.current({ canvas, original: await canvasBlob(full), corners });
            if (disposed) return;
            if (outcome === 'review') { closeRef.current(); return; }
            setSaved(n => n + 1); setProcessing(false); setProgress(0);
          }
        }
      } catch (e) {
        if (!disposed) { setError(e instanceof Error ? e.message : String(e)); setProcessing(false); stop(); }
        return;
      } finally {
        if (!disposed && stream?.active) timer = setTimeout(() => void tick(), 180);
      }
    };
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera trực tiếp cần HTTPS và trình duyệt hỗ trợ camera. Bạn có thể dùng camera hệ thống hoặc chọn ảnh.');
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 2560 } } });
        if (disposed) { stop(); return; }
        video.srcObject = stream; await video.play(); await loadOpenCV();
        if (!disposed) { setMessage('Đưa 4 ô đen trên phiếu vào đúng 4 ô vuông.'); void tick(); }
      } catch (e) {
        stop();
        if (!disposed) {
          const name = e instanceof Error ? e.name : '';
          setError(name === 'NotAllowedError' ? 'Chưa được cấp quyền camera. Cho phép camera trong trình duyệt rồi mở lại.' : name === 'NotFoundError' ? 'Không tìm thấy camera. Hãy chọn ảnh hoặc dùng thiết bị khác.' : name === 'NotReadableError' ? 'Camera đang được ứng dụng khác sử dụng. Đóng ứng dụng đó rồi thử lại.' : e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => { disposed = true; clearTimeout(timer); stop(); document.removeEventListener('visibilitychange', visibility); };
  }, [aspect, anchorsKey]);
  useEffect(() => {
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return <div className="live-camera" role="dialog" aria-modal="true" aria-label="Chụp phiếu tự động" onKeyDown={e => { if (e.key === 'Escape' && !processing) close(); }}>
    <header><div><strong>Chụp phiếu tự động</strong><small>Đã lưu trong lượt này: {saved}</small></div><button autoFocus className="button secondary" disabled={processing} onClick={close} aria-label="Đóng camera"><X size={20}/></button></header>
    <div className="live-camera-body"><div className="live-camera-viewport" style={{ aspectRatio: aspect, width: `min(100%, calc((100dvh - 210px) * ${aspect}))` }}>
      <video ref={videoRef} autoPlay playsInline muted aria-label="Hình ảnh camera sau"/>
      <div className="live-camera-paper"/>
      {targets.map((point, i) => <span key={i} className={`live-camera-target ${matches[i] ? 'matched' : ''}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, width: `${CAMERA_GUIDE_SIZE * 100}%` }} aria-label={`Mốc ${i + 1}${matches[i] ? ' đúng vị trí' : ''}`}/>)}
      {processing && <div className="live-camera-processing">Đang chấm và lưu…</div>}
    </div></div>
    <footer><p role={error ? 'alert' : 'status'}>{error || message}</p><progress aria-label="Độ ổn định của phiếu" value={progress} max={1}/>{error && <button className="button secondary" onClick={() => { close(); fallback(); }}>Dùng camera hệ thống</button>}<small>Phiếu cần xác minh sẽ mở màn hình kiểm tra kết quả.</small></footer>
  </div>;
}
