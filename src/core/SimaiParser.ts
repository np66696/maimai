import { ChartData, NoteEvent, SlideInfo, BpmEvent } from './ChartModel';
import { SlideShape } from '../renderer/RadialMath';

export class SimaiParser {
  /**
   * 解析 Simai 文本为标准 ChartData 对象
   * @param rawText 原始 maidata.txt 文本
   * @param targetDifficulty 目标难度 (1=Easy, 2=Basic, 3=Advanced, 4=Expert, 5=Master, 6=Re:Master)
   */
  static parse(rawText: string, targetDifficulty: number = 4): ChartData {
    const lines = rawText.split(/\r?\n/);
    const tags: Record<string, string> = {};

    let currentTag = '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('||')) continue;

      if (line.startsWith('&')) {
        const eqIdx = line.indexOf('=');
        if (eqIdx !== -1) {
          currentTag = line.slice(1, eqIdx).trim().toLowerCase();
          tags[currentTag] = line.slice(eqIdx + 1);
        }
      } else if (currentTag) {
        tags[currentTag] += '\n' + line;
      }
    }

    const title = tags['title']?.trim() || 'Untitled Track';
    const artist = tags['artist']?.trim() || 'Unknown Artist';
    const first = parseFloat(tags['first'] || '0.0') || 0.0;

    // 获取对应难度的谱面文本：优先指定难度，否则回退
    let inoteText =
      tags[`inote_${targetDifficulty}`] ||
      tags['inote_5'] ||
      tags['inote_4'] ||
      tags['inote_3'] ||
      tags['inote_2'] ||
      tags['inote_1'] ||
      tags['inote'] ||
      '';

    return this.parseInote(inoteText, title, artist, first);
  }

  /**
   * 解析 inote 谱面音符流
   */
  static parseInote(
    inoteText: string,
    title: string = 'Untitled',
    artist: string = 'Unknown',
    first: number = 0.0
  ): ChartData {
    // 移除注释 (|| ...)
    const cleanText = inoteText.replace(/\|\|.*$/gm, '').replace(/\s+/g, '');

    const notes: NoteEvent[] = [];
    const bpmEvents: BpmEvent[] = [];

    let currentBpm = 120;
    let currentDivisor = 4;
    let currentTime = first;
    let noteIdCounter = 1;

    // 初步扫描初始 BPM
    const initialBpmMatch = cleanText.match(/\(([0-9.]+)\)/);
    if (initialBpmMatch) {
      currentBpm = parseFloat(initialBpmMatch[1]);
    }

    let i = 0;
    const len = cleanText.length;

    while (i < len) {
      const ch = cleanText[i];

      // 1. 遇到 BPM 变速：(180)
      if (ch === '(') {
        const closeIdx = cleanText.indexOf(')', i);
        if (closeIdx !== -1) {
          const bpmStr = cleanText.slice(i + 1, closeIdx);
          const newBpm = parseFloat(bpmStr);
          if (!isNaN(newBpm) && newBpm > 0) {
            currentBpm = newBpm;
            if (bpmEvents.length === 0 || bpmEvents[bpmEvents.length - 1].bpm !== currentBpm) {
              bpmEvents.push({ time: currentTime, bpm: currentBpm });
            }
          }
          i = closeIdx + 1;
          continue;
        }
      }

      // 2. 遇到节拍分拍：{4}, {8}, {16}, {24} 等
      if (ch === '{') {
        const closeIdx = cleanText.indexOf('}', i);
        if (closeIdx !== -1) {
          const divStr = cleanText.slice(i + 1, closeIdx);
          const newDiv = parseFloat(divStr);
          if (!isNaN(newDiv) && newDiv > 0) {
            currentDivisor = newDiv;
          }
          i = closeIdx + 1;
          continue;
        }
      }

      // 3. 遇到逗号：推进一个拍子步进
      if (ch === ',') {
        const stepSeconds = (4 / currentDivisor) * (60 / currentBpm);
        currentTime += stepSeconds;
        i++;
        continue;
      }

      // 4. 收集当前拍内的音符定义（直到下一个 ','、'{' 或 '('）
      let tokenEnd = i;
      while (tokenEnd < len) {
        const nextChar = cleanText[tokenEnd];
        if (nextChar === ',' || nextChar === '{' || nextChar === '(') {
          break;
        }
        tokenEnd++;
      }

      if (tokenEnd > i) {
        const token = cleanText.slice(i, tokenEnd);
        this.parseBeatToken(token, currentTime, currentBpm, noteIdCounter, notes);
        noteIdCounter = notes.length + 1;
        i = tokenEnd;
      } else {
        i++;
      }
    }

    // 后处理：标记同拍金色双押 (isEach)
    this.flagEachNotes(notes);

    // 按时间顺序升序排列
    notes.sort((a, b) => a.time - b.time);

    // 保证至少有一个初始 BPM 事件
    if (bpmEvents.length === 0) {
      bpmEvents.push({ time: first, bpm: currentBpm });
    }

    const duration = notes.length > 0 ? Math.max(...notes.map(n => n.time + (n.duration || 0))) + 2 : 10;
    const maxCombo = notes.length;

    return {
      title,
      artist,
      first,
      bpm: bpmEvents[0]?.bpm || 120,
      bpmEvents,
      notes,
      duration,
      maxCombo
    };
  }

  /**
   * 解析同一拍内的音符（可能由 '/' 连接，也可能多个连续书写）
   */
  private static parseBeatToken(
    token: string,
    currentTime: number,
    currentBpm: number,
    startId: number,
    outNotes: NoteEvent[]
  ): void {
    if (!token) return;

    // 分割由 '/' 连接的双押/多押音符
    const subTokens = token.split('/');
    for (const subToken of subTokens) {
      if (!subToken) continue;
      this.parseSingleNoteToken(subToken, currentTime, currentBpm, startId++, outNotes);
    }
  }

  /**
   * 解析单个独立音符记号（TAP, BREAK, HOLD, SLIDE, TOUCH）
   */
  private static parseSingleNoteToken(
    rawToken: string,
    currentTime: number,
    currentBpm: number,
    id: number,
    outNotes: NoteEvent[]
  ): void {
    const token = rawToken.trim();
    if (!token) return;

    // 1. TOUCH 音符判断：以 C 或 A/B/D/E 开头
    const touchMatch = token.match(/^(C|[ABDE][1-8])(.*)$/i);
    if (touchMatch) {
      const zone = touchMatch[1].toUpperCase();
      const modifier = touchMatch[2];
      const isHold = modifier.includes('h');
      const isBreak = modifier.includes('b');

      let duration = 0;
      if (isHold) {
        duration = this.parseDuration(modifier, currentBpm);
      }

      outNotes.push({
        id,
        time: currentTime,
        type: isHold ? 'TOUCH_HOLD' : 'TOUCH',
        lane: 0,
        touchZone: zone,
        isEach: false,
        isBreak,
        duration: isHold ? duration : undefined
      });
      return;
    }

    // 2. 8 键音符判断：以数字 1~8 开头
    const laneMatch = token.match(/^([1-8])(.*)$/);
    if (!laneMatch) return;

    const lane = parseInt(laneMatch[1], 10);
    const rest = laneMatch[2];

    const isBreak = rest.includes('b');
    const isEx = rest.includes('x');

    // 2.1 SLIDE 音符（包含形态符号 -, >, <, ^, v, p, q, s, z, pp, qq, w, V）
    // 支持 '*' 连缀的并行滑条与连续滑条
    if (
      rest.includes('-') ||
      rest.includes('>') ||
      rest.includes('<') ||
      rest.includes('^') ||
      rest.includes('v') ||
      rest.includes('p') ||
      rest.includes('q') ||
      rest.includes('s') ||
      rest.includes('z') ||
      rest.includes('w') ||
      rest.includes('V')
    ) {
      const slideParts = rest.split('*');
      const slides: SlideInfo[] = [];

      for (const part of slideParts) {
        const slideShapeMatch = part.match(/([1-8])?(-|>|<|\^|v|p{1,2}|q{1,2}|s|z|w|V)([1-8])\[([^\]]+)\]/);
        if (slideShapeMatch) {
          const explicitStart = slideShapeMatch[1] ? parseInt(slideShapeMatch[1], 10) : lane;
          const shape = slideShapeMatch[2] as SlideShape;
          const endLane = parseInt(slideShapeMatch[3], 10);
          const bracketContent = slideShapeMatch[4];

          const duration = this.parseDuration(bracketContent, currentBpm);
          const delay = 60 / currentBpm;

          slides.push({
            shape,
            startLane: explicitStart,
            endLane,
            duration,
            delay,
            isBreak: part.includes('b') || isBreak
          });
        }
      }

      if (slides.length > 0) {
        const totalDuration = Math.max(...slides.map(s => s.delay + s.duration));
        outNotes.push({
          id,
          time: currentTime,
          type: 'SLIDE',
          lane,
          isEach: false,
          isBreak,
          isEx,
          slides,
          duration: totalDuration
        });
        return;
      }
    }

    // 2.2 HOLD 音符：1h[4:1]
    if (rest.includes('h')) {
      const duration = this.parseDuration(rest, currentBpm);
      outNotes.push({
        id,
        time: currentTime,
        type: 'HOLD',
        lane,
        isEach: false,
        isBreak,
        isEx,
        duration
      });
      return;
    }

    // 2.3 普通 TAP 或 BREAK
    outNotes.push({
      id,
      time: currentTime,
      type: isBreak ? 'BREAK' : 'TAP',
      lane,
      isEach: false,
      isBreak,
      isEx
    });
  }

  /**
   * 解析方括号内的持续时值：如 [4:1], [180#4:2], [0.5]
   */
  private static parseDuration(str: string, fallbackBpm: number): number {
    const bracketMatch = str.match(/\[([^\]]+)\]/);
    const content = bracketMatch ? bracketMatch[1] : str;

    // 形式 1: 180#4:1 (指定 BPM 与时值)
    if (content.includes('#')) {
      const [bpmStr, fracStr] = content.split('#');
      const bpm = parseFloat(bpmStr) || fallbackBpm;
      const [divStr, countStr] = fracStr.split(':');
      const divisor = parseFloat(divStr) || 4;
      const count = parseFloat(countStr) || 1;
      return (4 / divisor) * count * (60 / bpm);
    }

    // 形式 2: 4:1 (分数拍)
    if (content.includes(':')) {
      const [divStr, countStr] = content.split(':');
      const divisor = parseFloat(divStr) || 4;
      const count = parseFloat(countStr) || 1;
      return (4 / divisor) * count * (60 / fallbackBpm);
    }

    // 形式 3: 绝对秒数 [0.5]
    const sec = parseFloat(content);
    return !isNaN(sec) && sec > 0 ? sec : (60 / fallbackBpm);
  }

  /**
   * 标记同拍金色双押 (EACH)
   */
  private static flagEachNotes(notes: NoteEvent[]): void {
    const timeMap = new Map<number, NoteEvent[]>();

    for (const note of notes) {
      // 容差 5ms 视为同拍
      let foundKey: number | null = null;
      for (const key of timeMap.keys()) {
        if (Math.abs(key - note.time) < 0.005) {
          foundKey = key;
          break;
        }
      }

      if (foundKey !== null) {
        timeMap.get(foundKey)!.push(note);
      } else {
        timeMap.set(note.time, [note]);
      }
    }

    for (const group of timeMap.values()) {
      if (group.length > 1) {
        for (const note of group) {
          note.isEach = true;
        }
      }
    }
  }
}
