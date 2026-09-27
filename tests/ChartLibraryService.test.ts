import { describe, it, expect, beforeEach } from 'vitest';
import { ChartLibraryService, SavedSongItem } from '../src/core/ChartLibraryService';
import { unzipSync } from 'fflate';

describe('ChartLibraryService', () => {
  const service = ChartLibraryService.getInstance();

  beforeEach(async () => {
    await service.clearAll();
  });

  const mockSong: SavedSongItem = {
    id: 'test_song_1',
    shortId: '10001',
    source: 'astrodx',
    title: 'Test Melody',
    artist: 'Composer X',
    bpm: 180,
    genre: 'POPS',
    version: 'PRiSM',
    maidataText: '&title=Test Melody\n&artist=Composer X\n&inote_5=(180){4}1,2,3,4,',
    audioBlob: new Blob([new Uint8Array([0x49, 0x44, 0x33])], { type: 'audio/mpeg' }),
    coverBlob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
    difficulties: [
      { slot: 4, inoteKey: 4, name: 'EXPERT', level: '11' },
      { slot: 5, inoteKey: 5, name: 'MASTER', level: '13+' }
    ],
    defaultSlot: 5,
    addedAt: Date.now(),
    fileSize: 1200
  };

  it('saves and retrieves a song', async () => {
    await service.saveSong(mockSong);
    const retrieved = await service.getSong('test_song_1');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('Test Melody');
    expect(retrieved?.artist).toBe('Composer X');
    expect(retrieved?.difficulties).toHaveLength(2);
  });

  it('checks hasSong correctly', async () => {
    expect(await service.hasSong('test_song_1')).toBe(false);
    await service.saveSong(mockSong);
    expect(await service.hasSong('test_song_1')).toBe(true);
  });

  it('lists all songs ordered by addedAt descending', async () => {
    await service.saveSong({
      ...mockSong,
      id: 'song_first',
      title: 'First Song',
      addedAt: 1000
    });

    await service.saveSong({
      ...mockSong,
      id: 'song_second',
      title: 'Second Song',
      addedAt: 2000
    });

    const all = await service.getAllSongs();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('song_second');
    expect(all[1].id).toBe('song_first');
  });

  it('deletes a song and calculates stats', async () => {
    await service.saveSong(mockSong);
    let stats = await service.getStats();
    expect(stats.count).toBe(1);
    expect(stats.totalBytes).toBeGreaterThan(0);

    await service.deleteSong('test_song_1');
    stats = await service.getStats();
    expect(stats.count).toBe(0);
    expect(stats.totalBytes).toBe(0);
  });

  it('formats byte strings nicely', () => {
    expect(ChartLibraryService.formatBytes(500)).toBe('500.0 B');
    expect(ChartLibraryService.formatBytes(1024 * 1024 * 4.5)).toBe('4.5 MB');
  });

  it('exports saved song to valid .adx zip', async () => {
    const zipBlob = await service.exportAdxZip(mockSong);
    expect(zipBlob).toBeDefined();
    expect(zipBlob.size).toBeGreaterThan(0);

    const buf = await zipBlob.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buf));
    const keys = Object.keys(unzipped);

    expect(keys.some(k => k.endsWith('maidata.txt'))).toBe(true);
    expect(keys.some(k => k.endsWith('track.mp3'))).toBe(true);
    expect(keys.some(k => k.endsWith('bg.png'))).toBe(true);
  });
});
