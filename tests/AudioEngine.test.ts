import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioEngine } from '../src/core/AudioEngine';

describe('AudioEngine Volume Management', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      }
    });
  });

  it('initializes with default volumes when localStorage is empty', () => {
    const audio = new AudioEngine();
    expect(audio.volume).toBeCloseTo(0.8);
    expect(audio.sfxVolume).toBeCloseTo(0.9);
  });

  it('restores saved volume levels from localStorage on creation', () => {
    mockStorage['maimai_bgm_volume'] = '0.45';
    mockStorage['maimai_sfx_volume'] = '0.65';

    const audio = new AudioEngine();
    expect(audio.volume).toBeCloseTo(0.45);
    expect(audio.sfxVolume).toBeCloseTo(0.65);
  });

  it('clamps volume within [0, 1] and saves to localStorage', () => {
    const audio = new AudioEngine();

    audio.setVolume(0.5);
    expect(audio.volume).toBeCloseTo(0.5);
    expect(mockStorage['maimai_bgm_volume']).toBe('0.5');

    // Clamps overflow
    audio.setVolume(1.8);
    expect(audio.volume).toBe(1.0);
    expect(mockStorage['maimai_bgm_volume']).toBe('1');

    // Clamps underflow
    audio.setVolume(-0.3);
    expect(audio.volume).toBe(0.0);
    expect(mockStorage['maimai_bgm_volume']).toBe('0');
  });

  it('supports setMusicVolume as alias for setVolume', () => {
    const audio = new AudioEngine();
    audio.setMusicVolume(0.72);
    expect(audio.volume).toBeCloseTo(0.72);
    expect(mockStorage['maimai_bgm_volume']).toBe('0.72');
  });

  it('clamps sfxVolume within [0, 1] and saves to localStorage', () => {
    const audio = new AudioEngine();

    audio.setSfxVolume(0.35);
    expect(audio.sfxVolume).toBeCloseTo(0.35);
    expect(mockStorage['maimai_sfx_volume']).toBe('0.35');

    // Clamps overflow
    audio.setSfxVolume(2.5);
    expect(audio.sfxVolume).toBe(1.0);
    expect(mockStorage['maimai_sfx_volume']).toBe('1');

    // Clamps underflow
    audio.setSfxVolume(-0.5);
    expect(audio.sfxVolume).toBe(0.0);
    expect(mockStorage['maimai_sfx_volume']).toBe('0');
  });
});
