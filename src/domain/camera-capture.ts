import type { Point, SheetTemplate } from './schemas';

export const CAMERA_GUIDE_SIZE = .065;
export function cameraTargets(template: Pick<SheetTemplate, 'anchors'>): Point[] {
  return template.anchors.map(p => ({ x: .07 + .86 * p.x, y: .07 + .86 * p.y }));
}
export function alignedCameraCorners(points: Point[] | null, targets: Point[], aspect: number): boolean[] {
  return targets.map((target, i) => !!points?.[i] && Math.abs(points[i].x - target.x) <= CAMERA_GUIDE_SIZE / 2 && Math.abs(points[i].y - target.y) <= CAMERA_GUIDE_SIZE * aspect / 2);
}

/** Time and movement gates prevent shaky captures and repeated photos of one sheet. */
export class CameraCaptureGate {
  private stableSince: number | null = null;
  private baseline: Point[] | null = null;
  private samples = 0;
  private waitingForRemoval = false;
  private absentSince: number | null = null;

  captured() { this.waitingForRemoval = true; this.resetStability(); }
  resetStability() { this.stableSince = null; this.baseline = null; this.samples = 0; }
  update(points: Point[] | null, targets: Point[], aspect: number, now: number) {
    const aligned = alignedCameraCorners(points, targets, aspect);
    if (this.waitingForRemoval) {
      if (!points) {
        this.absentSince ??= now;
        if (now - this.absentSince >= 650) { this.waitingForRemoval = false; this.absentSince = null; }
      } else this.absentSince = null;
      return { aligned, capture: false, progress: 0, waitingForRemoval: this.waitingForRemoval };
    }
    if (!points || !aligned.every(Boolean)) this.resetStability();
    else {
      if (!this.baseline || points.some((p, i) => Math.hypot(p.x - this.baseline![i].x, (p.y - this.baseline![i].y) / aspect) > .008)) {
        this.baseline = points.map(p => ({ ...p })); this.stableSince = now; this.samples = 0;
      }
      this.samples++;
    }
    const progress = this.stableSince === null ? 0 : Math.min(1, (now - this.stableSince) / 900);
    return { aligned, capture: progress === 1 && this.samples >= 4, progress, waitingForRemoval: false };
  }
}

/** Same center crop as object-fit: cover in the portrait camera viewport. */
export function cameraCrop(width: number, height: number, aspect: number) {
  const cropWidth = Math.min(width, height * aspect), cropHeight = cropWidth / aspect;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}
