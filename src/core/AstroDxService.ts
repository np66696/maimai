// AstroDX 在线曲库服务 (基于 adxdls.saop.cc 与 adx-dl 架构)
import { zipSync } from 'fflate';

export interface AstroDxDifficulty {
  slot: number;
  name: string; // Basic / Advanced / Expert / Master / Re:Master / Utage
  level: string; // e.g. "13+"
  designer: string;
  notes?: {
    tap: number;
    hold: number;
    slide: number;
    touch: number;
    touch_hold: number;
    break: number;
    total: number;
  };
  duration_ms?: number;
}

export interface AstroDxEntry {
  id: string;
  short_id: string;
  title: string;
  title_en?: string;
  artist: string;
  version: string;
  versionid?: number;
  genre: string;
  genreid?: number;
  bpm: number | null;
  source_folder: string; // e.g. "0/10"
  aliases?: string[];
  difficulties: AstroDxDifficulty[];
  duration_ms?: number;
  files?: {
    maidata?: string;
    audio?: string;
    background?: string;
  };
  media?: {
    cover_url?: string;
    audio_url?: string;
  };
}

// 镜像源列表（按可用性与 CORS 友好度降序排列）
export const ASTRODX_MIRRORS = [
  'https://astrodx-charts-alice.saop.cc/',
  'https://astrodx-charts-wmc.saop.cc/',
  'https://astrodx-charts-g510.saop.cc/',
  'https://astrodx-charts.saop.cc/'
];

export const CATALOG_URL = 'https://raw.githubusercontent.com/AdingApkgg/adx-dl/main/data/catalog/index.json';
const CACHE_KEY = 'astrodx_catalog_cache_v2';
const CACHE_TIME_KEY = 'astrodx_catalog_cache_time_v2';
const CACHE_TTL_MS = 24 * 3600 * 1000; // 缓存 24 小时

export class AstroDxService {
  private static instance: AstroDxService;
  private entries: AstroDxEntry[] = [];
  private isLoaded: boolean = false;
  private isLoading: boolean = false;

  private constructor() {}

  static getInstance(): AstroDxService {
    if (!AstroDxService.instance) {
      AstroDxService.instance = new AstroDxService();
    }
    return AstroDxService.instance;
  }

  /**
   * 初始化并加载曲目全量索引
   */
  async loadCatalog(onProgress?: (msg: string) => void): Promise<AstroDxEntry[]> {
    if (this.isLoaded && this.entries.length > 0) {
      return this.entries;
    }

    if (this.isLoading) {
      // 等待并发请求完成
      while (this.isLoading) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.entries;
    }

    this.isLoading = true;

    // 1. 尝试从本地持久化缓存恢复
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
      if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_TTL_MS) {
        onProgress?.('正在从本地缓存加载曲库...');
        this.entries = JSON.parse(cached);
        this.isLoaded = true;
        this.isLoading = false;
        return this.entries;
      }
    } catch {
      // 忽略缓存解析错误
    }

    // 2. 从 GitHub Raw 拉取最新 catalog/index.json
    try {
      onProgress?.('正在同步 AstroDX 在线曲库目录 (共约 1900+ 首曲目)...');
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;
      const resp = await fetch(CATALOG_URL, controller ? { signal: controller.signal } : {});
      if (timeoutId) clearTimeout(timeoutId);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
      const data = await resp.json();
      const rawEntries = (data.entries || []) as AstroDxEntry[];

      this.entries = rawEntries.map(e => ({
        id: e.id,
        short_id: e.short_id || e.id,
        title: e.title,
        title_en: e.title_en,
        artist: e.artist,
        version: e.version || 'maimai',
        versionid: e.versionid,
        genre: e.genre || 'POPS＆アニメ',
        genreid: e.genreid,
        bpm: e.bpm,
        source_folder: e.source_folder || '',
        aliases: e.aliases || [],
        difficulties: e.difficulties || [],
        duration_ms: e.duration_ms,
        files: e.files,
        media: e.media
      }));

      this.isLoaded = true;

      // 异步存入 localStorage (避免阻塞)
      setTimeout(() => {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(this.entries));
          localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        } catch {
          // localStorage 配额超出时静默忽略
        }
      }, 50);

      return this.entries;
    } catch (err) {
      console.warn('Failed to fetch remote catalog, falling back to local presets:', err);
      // 若在线拉取失败，加载内置经典曲库保障可用性
      this.entries = this.getFallbackPresets();
      this.isLoaded = true;
      return this.entries;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 搜索与多维度筛选
   */
  search(
    query: string,
    filters?: {
      genre?: string;
      version?: string;
      minLevel?: number;
      maxLevel?: number;
    }
  ): AstroDxEntry[] {
    const q = query.trim().toLowerCase();

    return this.entries.filter(entry => {
      // 关键词匹配 (标题、英文标题、曲师、别名)
      if (q) {
        const titleMatch = entry.title.toLowerCase().includes(q);
        const titleEnMatch = entry.title_en?.toLowerCase().includes(q);
        const artistMatch = entry.artist.toLowerCase().includes(q);
        const aliasMatch = entry.aliases?.some(a => a.toLowerCase().includes(q));
        const shortIdMatch = entry.short_id === q;

        if (!titleMatch && !titleEnMatch && !artistMatch && !aliasMatch && !shortIdMatch) {
          return false;
        }
      }

      // 乐曲分类筛选
      if (filters?.genre && filters.genre !== 'all') {
        if (entry.genre !== filters.genre) return false;
      }

      // 版本筛选
      if (filters?.version && filters.version !== 'all') {
        if (entry.version !== filters.version) return false;
      }

      // 难度等级区间筛选
      if (filters?.minLevel !== undefined || filters?.maxLevel !== undefined) {
        const hasMatchingDiff = entry.difficulties.some(d => {
          const numLevel = parseFloat(d.level);
          if (isNaN(numLevel)) return false;
          if (filters.minLevel !== undefined && numLevel < filters.minLevel) return false;
          if (filters.maxLevel !== undefined && numLevel > filters.maxLevel) return false;
          return true;
        });
        if (!hasMatchingDiff) return false;
      }

      return true;
    });
  }

  /**
   * 智能多镜像源获取资源（自动故障转移）
   */
  private async fetchWithMirrorFallback(
    relativePath: string,
    responseType: 'text' | 'blob'
  ): Promise<any> {
    const cleanPath = relativePath.replace(/^\/+/, '');
    let lastError: Error | null = null;

    for (const mirror of ASTRODX_MIRRORS) {
      const url = `${mirror}${cleanPath}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s 超时

        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (resp.ok) {
          return responseType === 'text' ? await resp.text() : await resp.blob();
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    throw new Error(`无法从所有 AstroDX 镜像源拉取资源: ${cleanPath} (${lastError?.message || '网络超时'})`);
  }

  /**
   * 下载曲目所需全套文件（谱面 maidata.txt、音乐 track.mp3、曲绘 bg.png）
   */
  async fetchChartPackage(
    entry: AstroDxEntry,
    onProgress?: (msg: string, pct: number, stage: 'chart' | 'audio' | 'cover' | 'ready') => void
  ): Promise<{
    maidataText: string;
    audioBlob: Blob;
    coverBlob?: Blob;
    coverUrl?: string;
  }> {
    const folder = entry.source_folder || `0/${entry.short_id}`;

    // 1. 下载 maidata.txt
    onProgress?.(`正在下载谱面数据 [${entry.title}]...`, 20, 'chart');
    const maidataText = await this.fetchWithMirrorFallback(`${folder}/maidata.txt`, 'text');

    // 2. 下载音乐 track.mp3
    onProgress?.(`正在下载音频文件 track.mp3...`, 60, 'audio');
    const audioBlob = await this.fetchWithMirrorFallback(`${folder}/track.mp3`, 'blob');

    // 3. 下载曲绘 bg.png (可选)
    let coverBlob: Blob | undefined;
    let coverUrl: string | undefined;
    try {
      onProgress?.(`正在加载高清曲绘封面...`, 88, 'cover');
      coverBlob = await this.fetchWithMirrorFallback(`${folder}/bg.png`, 'blob');
      if (coverBlob) {
        coverUrl = URL.createObjectURL(coverBlob);
      }
    } catch {
      // 曲绘缺失不阻断主流程
    }

    onProgress?.(`加载完成，准备启动！`, 100, 'ready');

    return {
      maidataText,
      audioBlob,
      coverBlob,
      coverUrl
    };
  }

  /**
   * 打包为 AstroDX 标准 .adx / .zip 格式供手机或本地导入
   */
  async exportAdxZip(
    entry: AstroDxEntry,
    onProgress?: (msg: string, pct: number, stage: 'chart' | 'audio' | 'cover' | 'packaging' | 'ready') => void
  ): Promise<Blob> {
    onProgress?.('正在拉取曲目资源...', 10, 'chart');
    const pkg = await this.fetchChartPackage(entry, (msg, pct, stage) => {
      onProgress?.(msg, Math.round(pct * 0.85), stage);
    });

    onProgress?.('正在打包 AstroDX 谱面压缩包...', 92, 'packaging');
    const folderName = `${entry.short_id.padStart(6, '0')} ${entry.title.replace(/[\\/:*?"<>|]/g, '_')}`;

    const maidataBytes = new TextEncoder().encode(pkg.maidataText);
    const audioBytes = new Uint8Array(await pkg.audioBlob.arrayBuffer());

    const zipData: Record<string, Uint8Array> = {
      [`${folderName}/maidata.txt`]: maidataBytes,
      [`${folderName}/track.mp3`]: audioBytes
    };

    if (pkg.coverBlob) {
      const coverBytes = new Uint8Array(await pkg.coverBlob.arrayBuffer());
      zipData[`${folderName}/bg.png`] = coverBytes;
    }

    const compressed = zipSync(zipData);
    onProgress?.('打包就绪！', 100, 'ready');
    return new Blob([compressed], { type: 'application/zip' });
  }

  /**
   * 获取所有可用分类和版本列表
   */
  getFiltersMetadata(): { genres: string[]; versions: string[] } {
    const genres = new Set<string>();
    const versions = new Set<string>();

    for (const entry of this.entries) {
      if (entry.genre) genres.add(entry.genre);
      if (entry.version) versions.add(entry.version);
    }

    return {
      genres: Array.from(genres),
      versions: Array.from(versions)
    };
  }

  /**
   * 离线兜底精选曲目（在无网络连通时备用）
   */
  private getFallbackPresets(): AstroDxEntry[] {
    return [
      {
        id: '10-love-joy',
        short_id: '10',
        title: 'LOVE ＆ JOY',
        artist: '木村由姫 [cover]',
        version: 'maimai',
        genre: 'POPS＆アニメ',
        bpm: 173,
        source_folder: '0/10',
        aliases: ['love and joy', '爱情与欢乐'],
        difficulties: [
          { slot: 2, name: 'Basic', level: '5.0', designer: '-' },
          { slot: 3, name: 'Advanced', level: '7.1', designer: '-' },
          { slot: 4, name: 'Expert', level: '8.1', designer: '-' },
          { slot: 5, name: 'Master', level: '9.9', designer: '-' }
        ]
      },
      {
        id: '100-tell-your-world',
        short_id: '100',
        title: 'Tell Your World',
        artist: 'livetune',
        version: 'maimai PLUS',
        genre: 'niconico＆ボーカロイド',
        bpm: 150,
        source_folder: '1/100',
        aliases: ['告诉你的世界', 'tyw'],
        difficulties: [
          { slot: 2, name: 'Basic', level: '6.0', designer: '-' },
          { slot: 3, name: 'Advanced', level: '7.5', designer: '-' },
          { slot: 4, name: 'Expert', level: '10.5', designer: '譜面-100号とはっぴー' },
          { slot: 5, name: 'Master', level: '12.4', designer: 'mai-Star' },
          { slot: 6, name: 'Re:Master', level: '13.2', designer: '某S氏' }
        ]
      },
      {
        id: '128-garakuta-doll-play',
        short_id: '128',
        title: 'Garakuta Doll Play',
        artist: 't+pazolite',
        version: 'maimai GreeN',
        genre: 'maimai',
        bpm: 256,
        source_folder: '2/128',
        aliases: ['加特林', '破烂洋娃娃', 'garakuta', 'gdp'],
        difficulties: [
          { slot: 4, name: 'Expert', level: '12.0', designer: 'チャン@DP皆伝' },
          { slot: 5, name: 'Master', level: '13.9', designer: '譜面-100号' }
        ]
      },
      {
        id: '243-oshama-scramble',
        short_id: '243',
        title: 'Oshama Scramble!',
        artist: 't+pazolite',
        version: 'maimai ORANGE PLUS',
        genre: 'maimai',
        bpm: 196,
        source_folder: '5/243',
        aliases: ['牛奶', '洗衣服', 'oshama'],
        difficulties: [
          { slot: 4, name: 'Expert', level: '12.6', designer: 'Jack' },
          { slot: 5, name: 'Master', level: '13.7', designer: 'mai-Star' }
        ]
      },
      {
        id: '834-pandora-paradoxxx',
        short_id: '834',
        title: 'PANDORA PARADOXXX',
        artist: '佐々木トモコ',
        version: 'maimai FiNALE',
        genre: 'maimai',
        bpm: 300,
        source_folder: '12/834',
        aliases: ['潘多拉', 'pandora'],
        difficulties: [
          { slot: 4, name: 'Expert', level: '13.5', designer: 'Revo@LC' },
          { slot: 5, name: 'Master', level: '15.0', designer: 'JACK & Technokit' },
          { slot: 6, name: 'Re:Master', level: '15.0', designer: 'すきあ & Technokit' }
        ]
      }
    ];
  }
}
