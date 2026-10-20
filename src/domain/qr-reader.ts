import { BrowserQRCodeReader } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { qrSchema, type SheetQR, type SheetTemplate } from './schemas';
export function parseQR(text: string): SheetQR {
  if (text.length > 4096) throw new Error('QR vượt kích thước cho phép');
  try { return qrSchema.parse(JSON.parse(text)); } catch { throw new Error('QR không hợp lệ hoặc chứa trường không được phép'); }
}
export async function readQR(image: HTMLCanvasElement, region?: SheetTemplate['qr_region']): Promise<SheetQR | null> {
  const Detector = (globalThis as any).BarcodeDetector;
  if (Detector) {
    let results: { rawValue: string }[] = [];
    try { const d = new Detector({ formats: ['qr_code'] }); results = await d.detect(image); } catch { /* Fall back when the native QR format is unavailable. */ }
    if (results.length > 1) throw new Error('Có nhiều QR trên ảnh; cần ảnh chỉ chứa một phiếu');
    if (results.length === 1) return parseQR(results[0].rawValue);
  }
  const inputs = [image];
  if (region) {
    const crop = document.createElement('canvas'); crop.width = Math.round(region.width * image.width); crop.height = Math.round(region.height * image.height);
    crop.getContext('2d')!.drawImage(image, region.x * image.width, region.y * image.height, crop.width, crop.height, 0, 0, crop.width, crop.height); inputs.unshift(crop);
  }
  const reader = new BrowserQRCodeReader(new Map([[DecodeHintType.TRY_HARDER, true]]));
  for (const input of inputs) {
    let text: string;
    try { text = reader.decodeFromCanvas(input).getText(); }
    catch (error) { if (error instanceof Error && /NotFound|Checksum|Format/.test(error.name)) continue; throw error; }
    return parseQR(text);
  }
  return null;
}
