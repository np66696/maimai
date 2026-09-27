import { describe, it, expect } from 'vitest';
import { TimeSync } from '../src/core/TimeSync';

describe('TimeSync', () => {
  it('should calculate render time with audio offset correctly', () => {
    const sync = new TimeSync();
    sync.setOffset(50); // +50ms
    sync.update(1.0); // 1.0s audio time
    expect(sync.currentTime).toBeCloseTo(1.05, 3);

    sync.setOffset(-20); // -20ms
    sync.update(2.0);
    expect(sync.currentTime).toBeCloseTo(1.98, 3);
  });

  it('should calculate note progress based on Hi-Speed', () => {
    const sync = new TimeSync();
    sync.setHiSpeed(7.0); // T_approach = 4.2 / 7.0 = 0.6s
    sync.setOffset(0);
    sync.update(1.0); // current time = 1.0s

    // Note at 1.6s -> delta = 0.6s -> exactly spawned at center (progress 0)
    expect(sync.getNoteProgress(1.6)).toBeCloseTo(0.0, 2);

    // Note at 1.3s -> delta = 0.3s -> halfway to judge line (progress 0.5)
    expect(sync.getNoteProgress(1.3)).toBeCloseTo(0.5, 2);

    // Note at 1.0s -> delta = 0s -> reached judge line (progress 1.0)
    expect(sync.getNoteProgress(1.0)).toBeCloseTo(1.0, 2);
  });

  it('should determine note visibility window', () => {
    const sync = new TimeSync();
    sync.setHiSpeed(7.0); // 0.6s approach
    sync.setOffset(0);
    sync.update(1.0);

    // Note at 1.7s -> not yet spawned (> 1.6s)
    expect(sync.isNoteVisible(1.7)).toBe(false);

    // Note at 1.4s -> visible
    expect(sync.isNoteVisible(1.4)).toBe(true);

    // Note at 0.5s with 0 duration -> passed and expired
    expect(sync.isNoteVisible(0.5)).toBe(false);

    // Note at 0.8s with 0.5s HOLD duration -> ends at 1.3s -> visible
    expect(sync.isNoteVisible(0.8, 0.5)).toBe(true);
  });

  it('should calculate SLIDE delay and motion progress accurately', () => {
    const sync = new TimeSync();
    sync.setOffset(0);

    // Slide: hit at 2.0s, wait 0.5s, slide for 1.0s (ends at 3.5s)
    const slideTime = 2.0;
    const delay = 0.5;
    const duration = 1.0;

    // At 2.2s: waiting at ring
    sync.update(2.2);
    const state1 = sync.getSlideProgress(slideTime, delay, duration);
    expect(state1.waiting).toBe(true);
    expect(state1.moving).toBe(false);
    expect(state1.progress).toBe(0.0);

    // At 3.0s: halfway sliding (2.5s to 3.5s -> 0.5s into 1.0s = 50%)
    sync.update(3.0);
    const state2 = sync.getSlideProgress(slideTime, delay, duration);
    expect(state2.waiting).toBe(false);
    expect(state2.moving).toBe(true);
    expect(state2.progress).toBeCloseTo(0.5, 2);

    // At 3.6s: finished
    sync.update(3.6);
    const state3 = sync.getSlideProgress(slideTime, delay, duration);
    expect(state3.finished).toBe(true);
    expect(state3.progress).toBe(1.0);
  });
});
