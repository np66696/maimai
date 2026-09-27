import { zipSync } from 'fflate';

export interface SavedSongDifficulty {
  slot: number;
  name: string;
  level: string;
  inoteKey: number;
}

export interface SavedSongItem {
  id: string; // e.g. "astrodx_10188" or "adx_title_1700000000"
  shortId?: string;
  source: 'astrodx' | 'adx_file' | 'custom';
  title: string;
  artist: string;
  bpm: number;
  genre: string;
  version?: string;
  maidataText: string;
  audioBlob: Blob;
  coverBlob?: Blob;
  difficulties: SavedSongDifficulty[];
  defaultSlot: number;
  addedAt: number; // timestamp ms
  fileSize: number; // bytes
}

const DB_NAME = 'MaimaiDX_ChartLibraryDB';
const DB_VERSION = 1;
const STORE_NAME = 'saved_songs';

export class ChartLibraryService {
  private static instance: ChartLibraryService;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryFallback: Map<string, SavedSongItem> = new Map();
  private listeners: Set<() => void> = new Set();

  private constructor() {}

  static getInstance(): ChartLibraryService {
    if (!ChartLibraryService.instance) {
      ChartLibraryService.instance = new ChartLibraryService();
    }
    return ChartLibraryService.instance;
  }

  /**
   * 初始化并打开 IndexedDB 数据库
   */
  private getDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);

          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
              store.createIndex('addedAt', 'addedAt', { unique: false });
              store.createIndex('title', 'title', { unique: false });
              store.createIndex('source', 'source', { unique: false });
            }
          };

          req.onsuccess = () => {
            resolve(req.result);
          };

          req.onerror = () => {
            console.warn('IndexedDB 打开失败，降级为内存存储:', req.error);
            resolve(null);
          };
        } catch (e) {
          console.warn('IndexedDB 不可用:', e);
          resolve(null);
        }
      });
    }

    return this.dbPromise;
  }

  /**
   * 保存曲目到本地曲库
   */
  async saveSong(song: SavedSongItem): Promise<void> {
    const size = song.fileSize || (
      song.maidataText.length +
      (song.audioBlob ? song.audioBlob.size : 0) +
      (song.coverBlob ? song.coverBlob.size : 0)
    );
    const item: SavedSongItem = {
      ...song,
      fileSize: size,
      addedAt: song.addedAt || Date.now()
    };

    const db = await this.getDb();
    if (!db) {
      this.memoryFallback.set(item.id, item);
      this.notifyListeners();
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(item);

        req.onsuccess = () => {
          this.notifyListeners();
          resolve();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 根据 ID 获取已保存曲目
   */
  async getSong(id: string): Promise<SavedSongItem | null> {
    const db = await this.getDb();
    if (!db) {
      return this.memoryFallback.get(id) || null;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 检查曲目是否已经在本地曲库中
   */
  async hasSong(id: string): Promise<boolean> {
    const song = await this.getSong(id);
    return song !== null;
  }

  /**
   * 获取本地曲库中的所有曲目 (默认按添加时间倒序排列)
   */
  async getAllSongs(): Promise<SavedSongItem[]> {
    const db = await this.getDb();
    if (!db) {
      return Array.from(this.memoryFallback.values()).sort((a, b) => b.addedAt - a.addedAt);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const list = (req.result || []) as SavedSongItem[];
          list.sort((a, b) => b.addedAt - a.addedAt);
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 从本地曲库删除某曲目
   */
  async deleteSong(id: string): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      this.memoryFallback.delete(id);
      this.notifyListeners();
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);

        req.onsuccess = () => {
          this.notifyListeners();
          resolve();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 清空所有已保存曲目
   */
  async clearAll(): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      this.memoryFallback.clear();
      this.notifyListeners();
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => {
          this.notifyListeners();
          resolve();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 获取本地曲库统计数据 (曲目数与总占用空间)
   */
  async getStats(): Promise<{ count: number; totalBytes: number }> {
    const all = await this.getAllSongs();
    const count = all.length;
    const totalBytes = all.reduce((sum, item) => sum + (item.fileSize || 0), 0);
    return { count, totalBytes };
  }

  /**
   * 打包将已保存曲目导出为标准 .adx 压缩包
   */
  async exportAdxZip(item: SavedSongItem): Promise<Blob> {
    const folderName = `${(item.shortId || '000000').padStart(6, '0')} ${item.title.replace(/[\\/:*?"<>|]/g, '_')}`;

    const maidataBytes = new TextEncoder().encode(item.maidataText);
    const audioBytes = new Uint8Array(await item.audioBlob.arrayBuffer());

    const zipData: Record<string, Uint8Array> = {
      [`${folderName}/maidata.txt`]: maidataBytes,
      [`${folderName}/track.mp3`]: audioBytes
    };

    if (item.coverBlob) {
      const coverBytes = new Uint8Array(await item.coverBlob.arrayBuffer());
      zipData[`${folderName}/bg.png`] = coverBytes;
    }

    const compressed = zipSync(zipData);
    return new Blob([compressed], { type: 'application/zip' });
  }

  /**
   * 监听曲库变化事件
   */
  onLibraryChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('Library listener error:', err);
      }
    }
  }

  /**
   * 格式化字节大小显示
   */
  static formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  }
}
