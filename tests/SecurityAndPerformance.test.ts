import { describe, it, expect, vi } from 'vitest';
import { escapeHtml, sanitizePath, truncateSafe, ObjectUrlTracker } from '../src/utils/security';
import { AdxLoader } from '../src/core/AdxLoader';
import { EffectSystem } from '../src/renderer/EffectSystem';
import { zipSync, strToU8 } from 'fflate';
import { InputController } from '../src/components/InputController';
import { TimeSync } from '../src/core/TimeSync';
import { NoteRenderer } from '../src/renderer/NoteRenderer';
import { NoteEvent } from '../src/core/ChartModel';
import { ThemeManager } from '../src/renderer/ThemeManager';

describe('Security & XSS Prevention', () => {
  it('correctly escapes dangerous HTML characters to prevent XSS', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
    expect(escapeHtml("<img src=x onerror='alert(1)'>")).toBe(
      '&lt;img src=x onerror=&#39;alert(1)&#39;&gt;'
    );
    expect(escapeHtml('Hello & "World"')).toBe('Hello &amp; &quot;World&quot;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12345)).toBe('12345');
  });

  it('sanitizes paths against Zip Slip and path traversal attacks', () => {
    expect(sanitizePath('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizePath('..\\..\\windows\\system32\\calc.exe')).toBe('windows/system32/calc.exe');
    expect(sanitizePath('/root/secret\0.txt')).toBe('root/secret.txt');
    expect(sanitizePath('folder:with*weird?chars')).toBe('folder_with_weird_chars');
    expect(sanitizePath('   /my-chart/maidata.txt/  ')).toBe('my-chart/maidata.txt');
    expect(sanitizePath('')).toBe('unnamed');
  });

  it('safely truncates excessively long strings to prevent memory exhaustion', () => {
    const longString = 'a'.repeat(500);
    expect(truncateSafe(longString, 100).length).toBe(100);
    expect(truncateSafe('short', 100)).toBe('short');
  });
});

describe('Memory Leak Prevention & ObjectUrlTracker', () => {
  it('tracks and revokes object URLs safely', () => {
    const tracker = new ObjectUrlTracker();
    const revoked: string[] = [];

    // Mock URL.createObjectURL and URL.revokeObjectURL
    const originalCreate = global.URL.createObjectURL;
    const originalRevoke = global.URL.revokeObjectURL;

    let idCounter = 1;
    global.URL.createObjectURL = vi.fn(() => `blob:mock-url-${idCounter++}`);
    global.URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });

    try {
      const blob1 = new Blob(['1']);
      const blob2 = new Blob(['2']);
      const url1 = tracker.create(blob1);
      const url2 = tracker.create(blob2);

      expect(url1).toBe('blob:mock-url-1');
      expect(url2).toBe('blob:mock-url-2');

      tracker.revoke(url1);
      expect(revoked).toContain('blob:mock-url-1');
      expect(revoked).not.toContain('blob:mock-url-2');

      tracker.revokeAll();
      expect(revoked).toContain('blob:mock-url-2');
    } finally {
      global.URL.createObjectURL = originalCreate;
      global.URL.revokeObjectURL = originalRevoke;
    }
  });
});

describe('AdxLoader Security & Malformed File Hardening', () => {
  it('rejects oversized packages above 250MB limit', () => {
    const fakeOversized = { length: 260 * 1024 * 1024 } as Uint8Array;
    expect(() => AdxLoader.loadFromUint8Array(fakeOversized, 'huge.adx')).toThrow(/超过 250MB 限制/);
  });

  it('safely discards path traversal zip entries', () => {
    const zipData: Record<string, Uint8Array> = {
      '../../secret.txt': strToU8('&title=Hack\n&inote_5=1,2,3,4,'),
      'normal/maidata.txt': strToU8('&title=Safe Track\n&artist=Good Guy\n&bpm=150\n&inote_5=1,2,3,4,')
    };
    const zipBytes = zipSync(zipData);

    const loaded = AdxLoader.loadFromUint8Array(zipBytes, 'test.adx');
    expect(loaded.title).toBe('Safe Track');
    expect(loaded.artist).toBe('Good Guy');
    expect(loaded.bpm).toBe(150);
  });

  it('clamps extreme or invalid BPM and first offset values', () => {
    const zipData: Record<string, Uint8Array> = {
      'maidata.txt': strToU8('&title=Extreme Track\n&bpm=999999\n&first=-999999\n&inote_5=1,2,3,4,')
    };
    const zipBytes = zipSync(zipData);

    const loaded = AdxLoader.loadFromUint8Array(zipBytes, 'extreme.adx');
    expect(loaded.bpm).toBe(120); // clamped invalid extreme BPM
    expect(loaded.first).toBe(0); // clamped invalid extreme first
  });
});

describe('EffectSystem Performance & Particle Capping', () => {
  it('caps particle count and uses O(1) swap-and-pop cleanup', () => {
    const origImage = (global as any).Image;
    (global as any).Image = class { src: string = ''; };

    try {
      const effects = new EffectSystem();

      // Trigger hit repeatedly to produce hundreds of particles
      for (let i = 0; i < 20; i++) {
        effects.triggerHit({ x: 200, y: 200 }, 'CRITICAL_PERFECT', true);
      }

      // EffectSystem limits particles to <= 250
      expect((effects as any).particles.length).toBeLessThanOrEqual(250);

      // Update with delta time to expire particles
      effects.update(1.0); // 1.0s exceeds particle lifetime (0.48s)

      expect((effects as any).particles.length).toBe(0);
      expect((effects as any).shockwaves.length).toBe(0);
    } finally {
      (global as any).Image = origImage;
    }
  });
});

describe('NoteRenderer Windowing Performance', () => {
  it('renders without error under windowed note filtering', () => {
    const sync = new TimeSync();
    sync.setHiSpeed(6.0);
    sync.update(5.0); // Current song time: 5.0s

    const notes: NoteEvent[] = [
      { id: 1, time: 0.5, type: 'TAP', lane: 1, isEach: false, isBreak: false }, // expired
      { id: 2, time: 1.0, type: 'TAP', lane: 2, isEach: false, isBreak: false }, // expired
      { id: 3, time: 5.2, type: 'TAP', lane: 3, isEach: false, isBreak: false }, // visible!
      { id: 4, time: 5.5, type: 'BREAK', lane: 4, isEach: false, isBreak: true }, // visible!
      { id: 5, time: 100.0, type: 'TAP', lane: 5, isEach: false, isBreak: false } // far in future
    ];

    const mockGradient = { addColorStop: vi.fn() };
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      createRadialGradient: vi.fn(() => mockGradient),
      createLinearGradient: vi.fn(() => mockGradient)
    } as unknown as CanvasRenderingContext2D;

    const theme = ThemeManager.getTheme('prism');

    expect(() => {
      NoteRenderer.renderNotes(mockCtx, notes, sync, { x: 400, y: 400 }, 300, theme);
    }).not.toThrow();

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });
});

describe('InputController Lifecycle & Disposal', () => {
  it('registers and cleanly disposes event listeners', () => {
    const listeners: Record<string, Function[]> = {};
    const addMock = vi.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    });
    const removeMock = vi.fn((event: string, cb: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(fn => fn !== cb);
      }
    });

    const origWindow = (global as any).window;
    (global as any).window = {
      addEventListener: addMock,
      removeEventListener: removeMock
    };

    try {
      const mockCanvas = {
        addEventListener: addMock,
        removeEventListener: removeMock,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 })
      } as unknown as HTMLCanvasElement;

      const controller = new InputController(mockCanvas, {
        onLaneDown: vi.fn(),
        onLaneUp: vi.fn(),
        onTouchDown: vi.fn(),
        onPlayPauseToggle: vi.fn(),
        onSeekRelative: vi.fn(),
        onHiSpeedAdjust: vi.fn()
      });

      expect(addMock).toHaveBeenCalled();

      // Dispose should remove all listeners
      controller.dispose();
      expect(removeMock).toHaveBeenCalled();
    } finally {
      (global as any).window = origWindow;
    }
  });
});
