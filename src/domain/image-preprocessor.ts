import type { Point, SheetTemplate } from './schemas';
let cvPromise: Promise<any> | undefined;
export function loadOpenCV(): Promise<any> {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const finish = async () => {
      try {
        const cv = await (globalThis as any).cv;
        if (cv?.Mat) { resolve(cv); return; }
        if (cv) cv.onRuntimeInitialized = () => resolve(cv);
        else reject(new Error('Không khởi tạo được OpenCV'));
      } catch (e) { reject(e); }
    };
    const script = document.createElement('script'); script.src = import.meta.env.VITE_OPENCV_URL || '/vendor/opencv-4.11.0.js'; script.async = true;
    script.onload = finish; script.onerror = () => reject(new Error('Không tải được OpenCV. Kiểm tra mạng hoặc cấu hình bản cục bộ.'));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('OpenCV tải quá lâu. Hãy thử lại.')), 45000);
  }).catch(e => { cvPromise = undefined; throw e; });
  return cvPromise;
}
export async function imageCanvas(file: Blob): Promise<HTMLCanvasElement> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Ảnh tối đa 20 MB');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  if (bitmap.width * bitmap.height > 50_000_000) { bitmap.close(); throw new Error('Ảnh quá lớn (tối đa 50 megapixel)'); }
  const ratio = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio); canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas;
}
export async function detectAnchors(canvas: HTMLCanvasElement): Promise<Point[] | null> {
  const cv = await loadOpenCV(), src = cv.imread(canvas), gray = new cv.Mat(), binary = new cv.Mat(), contours = new cv.MatVector(), hierarchy = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU); cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates: Point[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i), rect = cv.boundingRect(contour), area = cv.contourArea(contour); contour.delete();
      const ratio = rect.width / rect.height, relative = area / (canvas.width * canvas.height);
      if (ratio > .65 && ratio < 1.5 && relative > .00004 && relative < .006 && area / (rect.width * rect.height) > .7) candidates.push({ x: (rect.x + rect.width / 2) / canvas.width, y: (rect.y + rect.height / 2) / canvas.height });
    }
    const targets = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], selected: Point[] = [];
    for (const p of targets) {
      const nearby = candidates.filter(c => Math.abs(c.x - p.x) < .3 && Math.abs(c.y - p.y) < .3).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      if (!nearby.length) return null;
      selected.push(nearby[0]);
    }
    return new Set(selected).size === 4 ? selected : null;
  } finally { [src, gray, binary, contours, hierarchy].forEach(m => m.delete()); }
}
export function validateCorners(points: Point[]) {
  if (points.length !== 4) throw new Error('Chọn đủ bốn mốc theo thứ tự trái trên → phải trên → phải dưới → trái dưới');
  let area = 0;
  for (let i = 0; i < 4; i++) { const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4]; if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= .001) throw new Error('Bốn mốc phải tạo tứ giác lồi theo đúng thứ tự'); area += a.x * b.y - b.x * a.y; }
  if (area / 2 < .1) throw new Error('Vùng phiếu quá nhỏ');
}
export async function preprocess(canvas: HTMLCanvasElement, template: SheetTemplate, points: Point[]) {
  validateCorners(points);
  const cv = await loadOpenCV(), src = cv.imread(canvas), dst = new cv.Mat(), gray = new cv.Mat(), binary = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, points.flatMap(p => [p.x * canvas.width, p.y * canvas.height]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, template.anchors.flatMap(p => [p.x * template.width, p.y * template.height]));
  const transform = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, transform, new cv.Size(template.width, template.height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY); cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 41, 12);
    const aligned = document.createElement('canvas'), processed = document.createElement('canvas'); cv.imshow(aligned, dst); cv.imshow(processed, binary);
    return { aligned, processed, pixels: processed.getContext('2d')!.getImageData(0, 0, processed.width, processed.height) };
  } finally { [src, dst, gray, binary, from, to, transform].forEach(m => m.delete()); }
}
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không xuất được ảnh')), 'image/png')); }
