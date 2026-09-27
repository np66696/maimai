import { NoteEvent, NoteType } from './ChartModel';

export type JudgeGrade = 'CRITICAL_PERFECT' | 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';
export type FastLate = 'FAST' | 'LATE' | 'EXACT';

export interface JudgeResult {
  noteId: number;
  type: NoteType;
  grade: JudgeGrade;
  lane: number;
  touchZone?: string;
  deltaMs: number;
  fastLate: FastLate;
  isBreak: boolean;
  isEach: boolean;
  dxScoreBonus: number;
  isSubJudgment?: boolean;
}

interface JudgeItem {
  id: string;
  parentNoteId: number;
  time: number;
  type: NoteType;
  lane: number;
  touchZone?: string;
  isBreak: boolean;
  isEach: boolean;
  isEx?: boolean;
  isSubJudgment?: boolean;
  baseWeight: number;
  dxStarMax: number;
  judged: boolean;
}

export class JudgeEngine {
  private items: JudgeItem[] = [];
  private activeStartIndex: number = 0;

  public combo: number = 0;
  public maxCombo: number = 0;
  public totalBaseScore: number = 0;
  public maxTheoreticalBaseScore: number = 0;
  public earnedBreakBonus: number = 0;
  public maxBreakBonus: number = 0;
  public dxScore: number = 0;
  public maxTheoreticalDxScore: number = 0;

  public counts: Record<JudgeGrade, number> = {
    CRITICAL_PERFECT: 0,
    PERFECT: 0,
    GREAT: 0,
    GOOD: 0,
    MISS: 0
  };
  public fastCount: number = 0;
  public lateCount: number = 0;

  // 官方判定窗口（秒）
  private readonly WINDOW_CP = 0.033; // ±33ms
  private readonly WINDOW_P = 0.066;  // ±66ms
  private readonly WINDOW_G = 0.100;  // ±100ms
  private readonly WINDOW_GD = 0.150; // ±150ms

  loadChart(notes: NoteEvent[]): void {
    this.items = [];
    let baseScore = 0;
    let breakBonusPool = 0;
    let maxDx = 0;

    for (const note of notes) {
      if (note.type === 'BREAK') {
        // BREAK 音符：基础分 2500，额外奖励 100分 (对应 101% 的 1% 加分池)
        this.items.push({
          id: `${note.id}-break`,
          parentNoteId: note.id,
          time: note.time,
          type: 'BREAK',
          lane: note.lane,
          touchZone: note.touchZone,
          isBreak: true,
          isEach: note.isEach,
          isEx: note.isEx,
          baseWeight: 2500,
          dxStarMax: 5,
          judged: false
        });
        baseScore += 2500;
        breakBonusPool += 100;
        maxDx += 5;
      } else if (note.type === 'HOLD' && note.duration) {
        // HOLD 音符：头部 TAP (500分) + 尾部释放判定 (500分) = 总计 1000分
        this.items.push({
          id: `${note.id}-hold-head`,
          parentNoteId: note.id,
          time: note.time,
          type: 'HOLD',
          lane: note.lane,
          touchZone: note.touchZone,
          isBreak: false,
          isEach: note.isEach,
          isEx: note.isEx,
          baseWeight: 500,
          dxStarMax: 3,
          judged: false
        });
        this.items.push({
          id: `${note.id}-hold-tail`,
          parentNoteId: note.id,
          time: note.time + note.duration,
          type: 'HOLD',
          lane: note.lane,
          touchZone: note.touchZone,
          isBreak: false,
          isEach: note.isEach,
          isEx: note.isEx,
          isSubJudgment: true,
          baseWeight: 500,
          dxStarMax: 3,
          judged: false
        });
        baseScore += 1000;
        maxDx += 6;
      } else if (note.type === 'SLIDE' && note.slides && note.slides.length > 0) {
        // SLIDE 音符：起始 TAP (500分) + 每个分支滑条完成 (1000分) = 1500分
        this.items.push({
          id: `${note.id}-slide-head`,
          parentNoteId: note.id,
          time: note.time,
          type: 'SLIDE',
          lane: note.lane,
          isBreak: note.isBreak,
          isEach: note.isEach,
          isEx: note.isEx,
          baseWeight: 500,
          dxStarMax: 3,
          judged: false
        });
        baseScore += 500;
        maxDx += 3;

        for (let sIdx = 0; sIdx < note.slides.length; sIdx++) {
          const s = note.slides[sIdx];
          const finishTime = note.time + s.delay + s.duration;
          this.items.push({
            id: `${note.id}-slide-finish-${sIdx}`,
            parentNoteId: note.id,
            time: finishTime,
            type: 'SLIDE',
            lane: s.endLane,
            isBreak: s.isBreak || note.isBreak,
            isEach: note.isEach,
            isEx: note.isEx,
            isSubJudgment: true,
            baseWeight: 1000,
            dxStarMax: 3,
            judged: false
          });
          baseScore += 1000;
          maxDx += 3;
        }
      } else {
        // 普通 TAP 或 TOUCH (基础分 500)
        this.items.push({
          id: `${note.id}-tap`,
          parentNoteId: note.id,
          time: note.time,
          type: note.type,
          lane: note.lane,
          touchZone: note.touchZone,
          isBreak: false,
          isEach: note.isEach,
          isEx: note.isEx,
          baseWeight: 500,
          dxStarMax: 3,
          judged: false
        });
        baseScore += 500;
        maxDx += 3;
      }
    }

    // 按时间顺序对所有判定点排序
    this.items.sort((a, b) => a.time - b.time);

    this.maxTheoreticalBaseScore = baseScore > 0 ? baseScore : 1;
    this.maxBreakBonus = breakBonusPool;
    this.maxTheoreticalDxScore = maxDx > 0 ? maxDx : 1;

    this.reset();
  }

  reset(): void {
    this.activeStartIndex = 0;
    for (const item of this.items) {
      item.judged = false;
    }
    this.combo = 0;
    this.maxCombo = 0;
    this.totalBaseScore = 0;
    this.earnedBreakBonus = 0;
    this.dxScore = 0;
    this.counts = {
      CRITICAL_PERFECT: 0,
      PERFECT: 0,
      GREAT: 0,
      GOOD: 0,
      MISS: 0
    };
    this.fastCount = 0;
    this.lateCount = 0;
  }

  /**
   * 帧更新循环：处理 Auto-Play 打击、HOLD长按/SLIDE滑条持续判定与漏键 (MISS) 结算
   * 采用时间窗口索引裁剪算法，避免每帧轮询数千个音符，从根本上解决 CPU 负载与发热
   */
  update(currentTime: number, autoPlay: boolean, activeLanes?: Set<number>): JudgeResult[] {
    const results: JudgeResult[] = [];

    // 快速前进跳过已判定的历史音符
    while (this.activeStartIndex < this.items.length && this.items[this.activeStartIndex].judged) {
      this.activeStartIndex++;
    }

    for (let i = this.activeStartIndex; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.judged) continue;

      if (autoPlay) {
        // 自动演示：当到达判定时间戳瞬间触发 CRITICAL_PERFECT
        if (currentTime >= item.time) {
          const res = this.applyJudgment(item, 'CRITICAL_PERFECT', 0);
          results.push(res);
        } else {
          // 由于 items 严格按时间升序，后续所有音符的 item.time > currentTime，立即终止检索
          break;
        }
      } else {
        // 手动模式：
        // 1. 处理长按 (HOLD) 持续判定与滑条 (SLIDE) 终点滑动完成判定
        if (item.isSubJudgment && activeLanes && activeLanes.has(item.lane)) {
          if (currentTime >= item.time - this.WINDOW_GD) {
            const delta = (currentTime - item.time) * 1000;
            const res = this.applyJudgment(item, 'CRITICAL_PERFECT', delta);
            results.push(res);
            continue;
          }
        }

        // 2. 超出判定窗口 (+150ms) 判定为 MISS
        if (currentTime > item.time + this.WINDOW_GD) {
          const delta = (currentTime - item.time) * 1000;
          const res = this.applyJudgment(item, 'MISS', delta);
          results.push(res);
        } else if (item.time > currentTime + this.WINDOW_GD) {
          // 当前音符还未到达判定窗口，后续音符时间更晚，直接终止检索
          break;
        }
      }
    }

    return results;
  }

  /**
   * 响应玩家按键打击 (1..8)
   */
  handleInput(lane: number, currentTime: number): JudgeResult | null {
    let candidate: JudgeItem | null = null;
    let minDelta = Infinity;

    for (let i = this.activeStartIndex; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.judged) continue;
      if (item.time > currentTime + this.WINDOW_GD) {
        break;
      }
      if (item.lane !== lane) continue;

      const delta = currentTime - item.time;
      if (Math.abs(delta) <= this.WINDOW_GD) {
        if (Math.abs(delta) < Math.abs(minDelta)) {
          minDelta = delta;
          candidate = item;
        }
      }
    }

    if (!candidate) return null;

    const absDelta = Math.abs(minDelta);
    let grade: JudgeGrade = 'MISS';

    if (candidate.isEx) {
      grade = 'CRITICAL_PERFECT';
    } else if (absDelta <= this.WINDOW_CP) {
      grade = 'CRITICAL_PERFECT';
    } else if (absDelta <= this.WINDOW_P) {
      grade = 'PERFECT';
    } else if (absDelta <= this.WINDOW_G) {
      grade = 'GREAT';
    } else if (absDelta <= this.WINDOW_GD) {
      grade = 'GOOD';
    }

    return this.applyJudgment(candidate, grade, minDelta * 1000);
  }

  /**
   * 响应玩家触控打击 (A1..E8, C)
   */
  handleTouchInput(zone: string, currentTime: number): JudgeResult | null {
    let candidate: JudgeItem | null = null;
    let minDelta = Infinity;

    const targetZone = zone.toUpperCase().trim();
    for (let i = this.activeStartIndex; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.judged) continue;
      if (item.time > currentTime + this.WINDOW_GD) {
        break;
      }
      if (item.touchZone?.toUpperCase().trim() !== targetZone) continue;

      const delta = currentTime - item.time;
      if (Math.abs(delta) <= this.WINDOW_GD) {
        if (Math.abs(delta) < Math.abs(minDelta)) {
          minDelta = delta;
          candidate = item;
        }
      }
    }

    if (!candidate) return null;

    const absDelta = Math.abs(minDelta);
    let grade: JudgeGrade = 'MISS';

    if (absDelta <= this.WINDOW_CP) {
      grade = 'CRITICAL_PERFECT';
    } else if (absDelta <= this.WINDOW_P) {
      grade = 'PERFECT';
    } else if (absDelta <= this.WINDOW_G) {
      grade = 'GREAT';
    } else if (absDelta <= this.WINDOW_GD) {
      grade = 'GOOD';
    }

    return this.applyJudgment(candidate, grade, minDelta * 1000);
  }

  private applyJudgment(item: JudgeItem, grade: JudgeGrade, deltaMs: number): JudgeResult {
    item.judged = true;
    this.counts[grade]++;

    let fastLate: FastLate = 'EXACT';
    if (Math.abs(deltaMs) > 16) {
      fastLate = deltaMs < 0 ? 'FAST' : 'LATE';
      if (fastLate === 'FAST') this.fastCount++;
      else if (fastLate === 'LATE') this.lateCount++;
    }

    let dxBonus = 0;
    let scoreRatio = 0;

    if (grade === 'CRITICAL_PERFECT') {
      this.combo++;
      scoreRatio = 1.0;
      dxBonus = item.isBreak ? 5 : 3;
      if (item.isBreak) this.earnedBreakBonus += 100;
    } else if (grade === 'PERFECT') {
      this.combo++;
      scoreRatio = 1.0;
      dxBonus = item.isBreak ? 4 : 2;
      if (item.isBreak) this.earnedBreakBonus += 50;
    } else if (grade === 'GREAT') {
      this.combo++;
      scoreRatio = 0.8;
      dxBonus = item.isBreak ? 2 : 1;
    } else if (grade === 'GOOD') {
      this.combo++;
      scoreRatio = 0.5;
      dxBonus = 0;
    } else {
      // MISS
      this.combo = 0;
      scoreRatio = 0;
      dxBonus = 0;
    }

    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.totalBaseScore += item.baseWeight * scoreRatio;
    this.dxScore += dxBonus;

    return {
      noteId: item.parentNoteId,
      type: item.type,
      grade,
      lane: item.lane,
      touchZone: item.touchZone,
      deltaMs,
      fastLate,
      isBreak: item.isBreak,
      isEach: item.isEach,
      dxScoreBonus: dxBonus,
      isSubJudgment: item.isSubJudgment
    };
  }

  /**
   * 官方 maimai DX 达成率计算公式 (最高 101.0000%)：
   * 达成率 = (当前基础分 / 理论全连基础分) * 100% + (获得Break奖励 / Break总奖励池) * 1.0%
   */
  get accuracyPercentage(): number {
    if (this.maxTheoreticalBaseScore === 0) return 0;

    const basePercent = (this.totalBaseScore / this.maxTheoreticalBaseScore) * 100.0;
    const breakBonusPercent =
      this.maxBreakBonus > 0 ? (this.earnedBreakBonus / this.maxBreakBonus) * 1.0 : 0;

    return Math.min(101.0, Math.max(0, basePercent + breakBonusPercent));
  }

  /**
   * 官方评级 (SSS+, SSS, SS+, SS, S+, S, AAA, AA, A, B, C, D)
   */
  get rank(): string {
    const acc = this.accuracyPercentage;
    if (acc >= 100.5) return 'SSS+';
    if (acc >= 100.0) return 'SSS';
    if (acc >= 99.5) return 'SS+';
    if (acc >= 99.0) return 'SS';
    if (acc >= 98.0) return 'S+';
    if (acc >= 97.0) return 'S';
    if (acc >= 94.0) return 'AAA';
    if (acc >= 90.0) return 'AA';
    if (acc >= 80.0) return 'A';
    if (acc >= 75.0) return 'B';
    if (acc >= 60.0) return 'C';
    return 'D';
  }
}
