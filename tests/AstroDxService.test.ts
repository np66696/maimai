import { describe, it, expect } from 'vitest';
import { AstroDxService } from '../src/core/AstroDxService';

describe('AstroDxService', () => {
  it('should initialize and have fallback presets', async () => {
    const service = AstroDxService.getInstance();
    // 默认通过离线/快速测试
    const entries = await service.loadCatalog();
    expect(entries.length).toBeGreaterThan(0);
  }, 10000);

  it('should support search and alias matching', async () => {
    const service = AstroDxService.getInstance();
    await service.loadCatalog();

    // 搜索别名 "gdp" (Garakuta Doll Play)
    const results = service.search('gdp');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title.toLowerCase()).toContain('garakuta');

    // 搜索曲师
    const artistResults = service.search('t+pazolite');
    expect(artistResults.length).toBeGreaterThanOrEqual(1);
  });

  it('should support genre and version filters', async () => {
    const service = AstroDxService.getInstance();
    await service.loadCatalog();

    const filtered = service.search('', { genre: 'maimai' });
    for (const item of filtered) {
      expect(item.genre).toBe('maimai');
    }
  });
});
