import { describe, it, expect } from 'vitest';
import { SimaiParser } from '../src/core/SimaiParser';

describe('SimaiParser', () => {
  it('should parse basic metadata and note stream', () => {
    const simai = `
      &title=Garakuta Doll Play
      &artist=t+pazolite
      &first=0.5
      &inote_1=(120){4}1,2,3,4,
    `;
    const chart = SimaiParser.parse(simai, 1);
    expect(chart.title).toBe('Garakuta Doll Play');
    expect(chart.artist).toBe('t+pazolite');
    expect(chart.first).toBe(0.5);
    expect(chart.bpm).toBe(120);
    expect(chart.notes.length).toBe(4);

    // Note 1 at 0.5s, Note 2 at 1.0s, Note 3 at 1.5s, Note 4 at 2.0s
    expect(chart.notes[0].lane).toBe(1);
    expect(chart.notes[0].time).toBeCloseTo(0.5, 2);
    expect(chart.notes[1].lane).toBe(2);
    expect(chart.notes[1].time).toBeCloseTo(1.0, 2);
    expect(chart.notes[2].lane).toBe(3);
    expect(chart.notes[2].time).toBeCloseTo(1.5, 2);
    expect(chart.notes[3].lane).toBe(4);
    expect(chart.notes[3].time).toBeCloseTo(2.0, 2);
  });

  it('should parse EACH simultaneous notes separated by /', () => {
    const simai = `&inote_1=(120){4}1/5,2b/6b,`;
    const chart = SimaiParser.parse(simai, 1);
    expect(chart.notes.length).toBe(4);

    // First beat: 1 and 5
    expect(chart.notes[0].isEach).toBe(true);
    expect(chart.notes[1].isEach).toBe(true);
    expect(chart.notes[0].time).toBe(chart.notes[1].time);

    // Second beat: 2b and 6b (Breaks)
    expect(chart.notes[2].isBreak).toBe(true);
    expect(chart.notes[3].isBreak).toBe(true);
    expect(chart.notes[2].isEach).toBe(true);
  });

  it('should parse HOLD notes with duration', () => {
    // 120 BPM: 1 beat = 0.5s. {4} 1 beat hold [4:1] = 0.5s duration
    const simai = `&inote_1=(120){4}1h[4:1],`;
    const chart = SimaiParser.parse(simai, 1);
    expect(chart.notes.length).toBe(1);
    expect(chart.notes[0].type).toBe('HOLD');
    expect(chart.notes[0].duration).toBeCloseTo(0.5, 2);
  });

  it('should parse SLIDE notes with default 1-beat delay and geometry', () => {
    // 120 BPM: delay = 1 beat = 0.5s. duration [4:2] = 2 beats = 1.0s.
    const simai = `&inote_1=(120){4}1-5[4:2],`;
    const chart = SimaiParser.parse(simai, 1);
    expect(chart.notes.length).toBe(1);
    expect(chart.notes[0].type).toBe('SLIDE');
    expect(chart.notes[0].slides).toBeDefined();
    expect(chart.notes[0].slides?.length).toBe(1);

    const slide = chart.notes[0].slides![0];
    expect(slide.shape).toBe('-');
    expect(slide.startLane).toBe(1);
    expect(slide.endLane).toBe(5);
    expect(slide.delay).toBeCloseTo(0.5, 2);
    expect(slide.duration).toBeCloseTo(1.0, 2);
  });

  it('should parse parallel slides connected by * correctly', () => {
    const simai = `&inote_1=(120){4}1-5[4:2]*1-3[4:1],`;
    const chart = SimaiParser.parse(simai, 1);
    expect(chart.notes.length).toBe(1);
    expect(chart.notes[0].slides?.length).toBe(2);

    expect(chart.notes[0].slides![0].startLane).toBe(1);
    expect(chart.notes[0].slides![0].endLane).toBe(5);
    expect(chart.notes[0].slides![0].duration).toBeCloseTo(1.0, 2);

    expect(chart.notes[0].slides![1].startLane).toBe(1);
    expect(chart.notes[0].slides![1].endLane).toBe(3);
    expect(chart.notes[0].slides![1].duration).toBeCloseTo(0.5, 2);
  });


  it('should parse TOUCH notes at zones C and A/B/D/E', () => {
    const simai = `&inote_1=(120){4}C,A1,B2,Ch[4:1],`;
    const chart = SimaiParser.parse(simai, 1);
    expect(chart.notes.length).toBe(4);
    expect(chart.notes[0].type).toBe('TOUCH');
    expect(chart.notes[0].touchZone).toBe('C');
    expect(chart.notes[1].touchZone).toBe('A1');
    expect(chart.notes[2].touchZone).toBe('B2');
    expect(chart.notes[3].type).toBe('TOUCH_HOLD');
    expect(chart.notes[3].touchZone).toBe('C');
    expect(chart.notes[3].duration).toBeCloseTo(0.5, 2);
  });

  it('should handle dynamic BPM changes mid-chart', () => {
    // Starts at 120 BPM (0.5s/beat), then changes to 240 BPM (0.25s/beat)
    const simai = `&inote_1=(120){4}1,(240)2,`;
    const chart = SimaiParser.parse(simai, 1);
    expect(chart.notes.length).toBe(2);
    expect(chart.notes[0].time).toBeCloseTo(0.0, 2);
    expect(chart.notes[1].time).toBeCloseTo(0.5, 2); // 1 beat at 120 BPM
    expect(chart.bpmEvents.length).toBe(2);
    expect(chart.bpmEvents[1].bpm).toBe(240);
  });
});
