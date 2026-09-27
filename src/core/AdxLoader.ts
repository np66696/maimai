import { unzipSync } from 'fflate';
import { sanitizePath, truncateSafe } from '../utils/security';

export interface AdxDifficultyInfo {
  slot: number;
  name: string; // 'EASY' | 'BASIC' | 'ADVANCED' | 'EXPERT' | 'MASTER' | 'Re:MASTER' | 'UTAGE'
  level: string; // e.g. "12.8"
  inoteKey: number; // same as slot (1..7)
}

export interface LoadedAdxPackage {
  title: string;
  artist: string;
  bpm: number;
  first: number;
  maidataText: string;
  audioBlob?: Blob;
  audioUrl?: string;
  coverBlob?: Blob;
  coverUrl?: string;
  difficulties: AdxDifficultyInfo[];
  defaultSlot: number;
  fileName?: string;
}

const SLOT_NAMES: Record<number, string> = {
  1: 'EASY',
  2: 'BASIC',
  3: 'ADVANCED',
  4: 'EXPERT',
  5: 'MASTER',
  6: 'Re:MASTER',
  7: 'UTAGE'
};

const DEFAULT_LEVELS: Record<number, string> = {
  1: '3',
  2: '6',
  3: '9',
  4: '11',
  5: '13',
  6: '14',
  7: '?'
};

export class AdxLoader {
  /**
   * 判断文件是否为 .adx 或 .zip 压缩谱面包
   */
  static isAdxOrZip(fileOrName: File | Blob | string): boolean {
    const name = typeof fileOrName === 'string' ? fileOrName : (fileOrName as File).name || '';
    if (/\.(adx|zip)$/i.test(name)) return true;
    if (typeof fileOrName !== 'string' && fileOrName.type) {
      if (fileOrName.type === 'application/zip' || fileOrName.type === 'application/x-zip-compressed') {
        return true;
      }
    }
    return false;
  }

  /**
   * 从 maidata 文本中提取所有可用的难度及标级
   */
  static extractDifficulties(maidataText: string): AdxDifficultyInfo[] {
    const diffs: AdxDifficultyInfo[] = [];

    for (let slot = 1; slot <= 7; slot++) {
      // 检查 &inote_X= 是否存在且有实际内容
      const inoteRegex = new RegExp(`&inote_${slot}\\s*=([\\s\\S]*?)(?:&|$)`, 'i');
      const inoteMatch = maidataText.match(inoteRegex);
      if (inoteMatch && inoteMatch[1].trim().length > 0) {
        // 查找对应标级 &lv_X=
        const lvRegex = new RegExp(`&lv_${slot}\\s*=\\s*([^\\r\\n]+)`, 'i');
        const lvMatch = maidataText.match(lvRegex);
        const level = lvMatch ? lvMatch[1].trim() : DEFAULT_LEVELS[slot] || '-';

        diffs.push({
          slot,
          inoteKey: slot,
          name: SLOT_NAMES[slot] || `LV${slot}`,
          level
        });
      }
    }

    // 若未按 slot 命名，而仅有单一 &inote=，则默认为 MASTER (5)
    if (diffs.length === 0) {
      const singleInote = maidataText.match(/&inote\s*=([\s\S]*?)(?:&|$)/i);
      if (singleInote && singleInote[1].trim().length > 0) {
        const lvMatch = maidataText.match(/&lv(?:_5)?\s*=\s*([^\r\n]+)/i);
        diffs.push({
          slot: 5,
          inoteKey: 5,
          name: 'MASTER',
          level: lvMatch ? lvMatch[1].trim() : '12'
        });
      }
    }

    return diffs;
  }

  /**
   * 解析任意二进制 buffer 或 Blob 形式的 .adx / .zip 谱面包
   */
  static async loadFromBlob(fileOrBlob: Blob | File, fileName?: string): Promise<LoadedAdxPackage> {
    const buffer = await fileOrBlob.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    const name = fileName || (fileOrBlob as File).name || 'chart.adx';
    return this.loadFromUint8Array(uint8, name);
  }

  /**
   * 同步或异步解压并提取 .adx 内部文件
   */
  static loadFromUint8Array(uint8: Uint8Array, fileName: string = 'chart.adx'): LoadedAdxPackage {
    // 1. 防御超大文件与内存溢出 (250MB 上限)
    if (uint8.length > 250 * 1024 * 1024) {
      throw new Error('文件体积超过 250MB 限制，拒绝解析以防内存崩溃');
    }

    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(uint8);
    } catch (err: any) {
      throw new Error(`解压 .adx 失败，文件可能已损坏或非标准 Zip 格式: ${err.message}`);
    }

    // 过滤带有目录穿越与非法空字符的 Zip 条目
    const entryKeys = Object.keys(unzipped).filter(k => {
      const sanitized = sanitizePath(k);
      return !k.includes('..') && !k.includes('\0') && !k.startsWith('/') && sanitized.length > 0;
    });
    if (entryKeys.length === 0) {
      throw new Error('.adx 压缩包内为空或所有文件均为非法路径');
    }

    // 1. 查找 maidata.txt 谱面文本
    // 优先匹配结尾为 maidata.txt，其次匹配任意 .txt 且内容包含 &title 或 &inote
    let chartKey = entryKeys.find(k => k.toLowerCase().endsWith('maidata.txt'));
    if (!chartKey) {
      for (const k of entryKeys) {
        if (k.toLowerCase().endsWith('.txt')) {
          try {
            const preview = new TextDecoder('utf-8').decode(unzipped[k].subarray(0, 1000));
            if (preview.includes('&title') || preview.includes('&inote') || preview.includes('&first')) {
              chartKey = k;
              break;
            }
          } catch {
            // 忽略编码错误
          }
        }
      }
    }

    if (!chartKey) {
      // 最后降级：取任意 .txt 文件
      chartKey = entryKeys.find(k => k.toLowerCase().endsWith('.txt'));
    }

    if (!chartKey) {
      throw new Error('.adx 谱面包中未找到 maidata.txt 谱面文件');
    }

    // 解码谱面文本 (优先 UTF-8，容错 BOM)
    let maidataText = new TextDecoder('utf-8').decode(unzipped[chartKey]);
    if (maidataText.charCodeAt(0) === 0xfeff) {
      maidataText = maidataText.slice(1);
    }

    // 2. 查找音乐音频文件 (track.mp3, track.ogg, track.wav 等)
    const audioExts = ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac'];
    const audioKeys = entryKeys.filter(k => {
      const lower = k.toLowerCase();
      return audioExts.some(ext => lower.endsWith(ext));
    });

    let audioKey: string | undefined;
    if (audioKeys.length > 0) {
      // 优先寻找名字中含有 track 或 bgm 或 music 的音频
      audioKey = audioKeys.find(k => /track|bgm|music|song/i.test(k)) || audioKeys[0];
    }

    let audioBlob: Blob | undefined;
    let audioUrl: string | undefined;
    if (audioKey && unzipped[audioKey].length > 0) {
      const ext = audioKey.slice(audioKey.lastIndexOf('.')).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac'
      };
      const mime = mimeMap[ext] || 'audio/mpeg';
      audioBlob = new Blob([unzipped[audioKey] as unknown as BlobPart], { type: mime });
      if (typeof URL !== 'undefined' && URL.createObjectURL) {
        audioUrl = URL.createObjectURL(audioBlob);
      }
    }

    // 3. 查找曲绘封面 (bg.png, jacket.png, cover.jpg 等)
    const imgExts = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
    const imgKeys = entryKeys.filter(k => {
      const lower = k.toLowerCase();
      return imgExts.some(ext => lower.endsWith(ext));
    });

    let coverKey: string | undefined;
    if (imgKeys.length > 0) {
      // 优先找 bg.*, jacket.*, cover.*
      coverKey = imgKeys.find(k => /bg|jacket|cover|folder/i.test(k)) || imgKeys[0];
    }

    let coverBlob: Blob | undefined;
    let coverUrl: string | undefined;
    if (coverKey && unzipped[coverKey].length > 0) {
      const ext = coverKey.slice(coverKey.lastIndexOf('.')).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
      coverBlob = new Blob([unzipped[coverKey] as unknown as BlobPart], { type: mime });
      if (typeof URL !== 'undefined' && URL.createObjectURL) {
        coverUrl = URL.createObjectURL(coverBlob);
      }
    }

    // 4. 解析元数据
    const titleMatch = maidataText.match(/&title\s*=\s*([^\r\n]+)/i);
    const artistMatch = maidataText.match(/&artist\s*=\s*([^\r\n]+)/i);
    const bpmMatch = maidataText.match(/&(?:wholebpm|bpm)\s*=\s*([^\r\n]+)/i);
    const firstMatch = maidataText.match(/&first\s*=\s*([^\r\n]+)/i);

    const rawTitle = titleMatch ? titleMatch[1].trim() : fileName.replace(/\.(adx|zip)$/i, '');
    const rawArtist = artistMatch ? artistMatch[1].trim() : 'Unknown Artist';
    const title = truncateSafe(rawTitle.replace(/[\x00-\x1f\x7f]/g, ''), 150) || 'Untitled';
    const artist = truncateSafe(rawArtist.replace(/[\x00-\x1f\x7f]/g, ''), 150) || 'Unknown Artist';
    
    let bpm = bpmMatch ? parseFloat(bpmMatch[1]) || 120 : 120;
    if (isNaN(bpm) || bpm <= 0 || bpm > 2000) bpm = 120;
    
    let first = firstMatch ? parseFloat(firstMatch[1]) || 0 : 0;
    if (isNaN(first) || Math.abs(first) > 3600) first = 0;

    // 5. 提取可用难度
    const difficulties = this.extractDifficulties(maidataText);

    // 确定默认难度槽位：优先 5(Master)，其次 4(Expert)，或最高可用
    let defaultSlot = 5;
    if (!difficulties.some(d => d.slot === 5)) {
      if (difficulties.some(d => d.slot === 4)) {
        defaultSlot = 4;
      } else if (difficulties.length > 0) {
        defaultSlot = difficulties[difficulties.length - 1].slot;
      }
    }

    return {
      title,
      artist,
      bpm,
      first,
      maidataText,
      audioBlob,
      audioUrl,
      coverBlob,
      coverUrl,
      difficulties,
      defaultSlot,
      fileName
    };
  }
}
