import { describe, expect, it } from 'vitest';
import { CameraCaptureGate, alignedCameraCorners, cameraCrop, cameraTargets } from '../src/domain/camera-capture';
import { createTemplate } from '../src/domain/templates';

const template = createTemplate(20), targets = cameraTargets(template), aspect = template.width / template.height;
describe('Automatic phone capture', () => {
  it('uses the same crop for portrait and landscape video and square guide tolerances', () => {
    expect(cameraCrop(1920, 1080, .75)).toEqual({ x: 555, y: 0, width: 810, height: 1080 });
    expect(cameraCrop(1200, 2000, .75)).toEqual({ x: 0, y: 200, width: 1200, height: 1600 });
    expect(alignedCameraCorners(targets, targets, aspect)).toEqual([true, true, true, true]);
    expect(alignedCameraCorners(targets.map(p => ({ x: p.x, y: p.y + .03 })), targets, aspect)).toEqual([false, false, false, false]);
  });
  it('requires all four markers and a steady sequence of frames for 900ms', () => {
    const gate = new CameraCaptureGate();
    expect(gate.update(targets, targets, aspect, 0).capture).toBe(false);
    expect(gate.update(targets, targets, aspect, 400).capture).toBe(false);
    expect(gate.update(targets, targets, aspect, 800).capture).toBe(false);
    expect(gate.update(targets, targets, aspect, 950).capture).toBe(true);
    expect(gate.update(null, targets, aspect, 1000).capture).toBe(false);
    const partial = targets.slice(0, 3);
    for (const time of [1200, 1600, 2200, 2800]) expect(gate.update(partial, targets, aspect, time).capture).toBe(false);
  });
  it('resets the timer on motion, misalignment or interrupted visibility', () => {
    const gate = new CameraCaptureGate();
    gate.update(targets, targets, aspect, 0);
    gate.update(targets, targets, aspect, 400);
    const moved = targets.map(p => ({ ...p, x: p.x + .015 }));
    expect(gate.update(moved, targets, aspect, 800).progress).toBe(0);
    expect(gate.update(moved, targets, aspect, 1100).capture).toBe(false);
    gate.resetStability();
    expect(gate.update(moved, targets, aspect, 2000).progress).toBe(0);
    expect(gate.update(targets.map(p => ({ ...p, x: p.x + .1 })), targets, aspect, 4000).capture).toBe(false);
  });
  it('does not take the same sheet again until the markers disappear continuously', () => {
    const gate = new CameraCaptureGate(); gate.captured();
    for (const time of [0, 1000, 2000]) expect(gate.update(targets, targets, aspect, time).waitingForRemoval).toBe(true);
    gate.update(null, targets, aspect, 2100);
    gate.update(targets, targets, aspect, 2400);
    expect(gate.update(null, targets, aspect, 2800).waitingForRemoval).toBe(true);
    expect(gate.update(null, targets, aspect, 3500).waitingForRemoval).toBe(false);
    for (const time of [3700, 4000, 4300]) expect(gate.update(targets, targets, aspect, time).capture).toBe(false);
    expect(gate.update(targets, targets, aspect, 4700).capture).toBe(true);
  });
});
