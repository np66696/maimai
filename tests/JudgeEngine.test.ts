import { describe, it, expect } from 'vitest';
import { JudgeEngine } from '../src/core/JudgeEngine';
import { NoteEvent } from '../src/core/ChartModel';

describe('JudgeEngine', () => {
  const sampleNotes: NoteEvent[] = [
    { id: 1, time: 1.0, type: 'TAP', lane: 1, isEach: false, isBreak: false },
    { id: 2, time: 2.0, type: 'BREAK', lane: 2, isEach: false, isBreak: true },
    { id: 3, time: 3.0, type: 'HOLD', lane: 3, isEach: false, isBreak: false, duration: 1.0 }
  ];

  it('should auto-play notes with Critical Perfect at exact time', () => {
    const engine = new JudgeEngine();
    engine.loadChart(sampleNotes);

    // At 0.5s: no notes reached
    let results = engine.update(0.5, true);
    expect(results.length).toBe(0);

    // At 1.0s: Note 1 should be judged as CRITICAL_PERFECT
    results = engine.update(1.0, true);
    expect(results.length).toBe(1);
    expect(results[0].grade).toBe('CRITICAL_PERFECT');
    expect(results[0].lane).toBe(1);
    expect(engine.combo).toBe(1);

    // At 2.0s: Note 2 (BREAK) should be judged as CRITICAL_PERFECT
    results = engine.update(2.0, true);
    expect(results.length).toBe(1);
    expect(results[0].grade).toBe('CRITICAL_PERFECT');
    expect(results[0].isBreak).toBe(true);
    expect(engine.combo).toBe(2);
  });

  it('should evaluate manual player hits with accurate grades and Fast/Late', () => {
    const engine = new JudgeEngine();
    engine.loadChart(sampleNotes);

    // Player hits lane 1 at 0.98s (-20ms early -> CRITICAL_PERFECT & FAST)
    const result1 = engine.handleInput(1, 0.98);
    expect(result1).not.toBeNull();
    expect(result1?.grade).toBe('CRITICAL_PERFECT');
    expect(result1?.fastLate).toBe('FAST');
    expect(engine.combo).toBe(1);

    // Player hits lane 2 at 2.05s (+50ms late -> PERFECT & LATE)
    const result2 = engine.handleInput(2, 2.05);
    expect(result2).not.toBeNull();
    expect(result2?.grade).toBe('PERFECT');
    expect(result2?.fastLate).toBe('LATE');
    expect(engine.combo).toBe(2);
  });

  it('should register MISS when player misses a note past judge window', () => {
    const engine = new JudgeEngine();
    engine.loadChart(sampleNotes);

    // Advance to 1.3s (> 150ms after Note 1) without hitting in manual mode
    const results = engine.update(1.3, false);
    expect(results.length).toBe(1);
    expect(results[0].grade).toBe('MISS');
    expect(engine.combo).toBe(0);
  });

  it('should judge HOLD tail and SLIDE finish in Auto-Play', () => {
    const slideNotes: NoteEvent[] = [
      {
        id: 10,
        time: 1.0,
        type: 'SLIDE',
        lane: 1,
        isEach: false,
        isBreak: false,
        slides: [{ shape: '-', startLane: 1, endLane: 5, delay: 0.5, duration: 1.0 }]
      }
    ];

    const engine = new JudgeEngine();
    engine.loadChart(slideNotes);

    // At 1.0s: SLIDE head tapped
    let res = engine.update(1.0, true);
    expect(res.length).toBe(1);
    expect(res[0].grade).toBe('CRITICAL_PERFECT');
    expect(engine.combo).toBe(1);

    // At 2.0s: midway sliding, no new judgment yet
    res = engine.update(2.0, true);
    expect(res.length).toBe(0);

    // At 2.5s: SLIDE reaches destination (1.0 + 0.5 delay + 1.0 duration = 2.5s)
    res = engine.update(2.5, true);
    expect(res.length).toBe(1);
    expect(res[0].grade).toBe('CRITICAL_PERFECT');
    expect(engine.combo).toBe(2);
  });

  it('should compute official DX Score and Rank correctly', () => {
    const engine = new JudgeEngine();
    engine.loadChart(sampleNotes);
    engine.update(4.5, true); // Auto-play through all notes (TAP, BREAK, HOLD head+tail = 4 combo)

    expect(engine.combo).toBe(4);
    expect(engine.dxScore).toBeGreaterThan(0);
    expect(engine.accuracyPercentage).toBeCloseTo(101.0, 1);
    expect(engine.rank).toBe('SSS+');
  });
});
