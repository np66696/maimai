import { SlideShape } from '../renderer/RadialMath';

export type NoteType = 'TAP' | 'HOLD' | 'BREAK' | 'SLIDE' | 'TOUCH' | 'TOUCH_HOLD';

export interface SlideInfo {
  shape: SlideShape;
  startLane: number;
  endLane: number;
  duration: number; // 滑动时长（秒）
  delay: number;    // 停顿延迟（秒，默认 1 拍 = 60/BPM）
  isBreak?: boolean;
  stopLanes?: number[];
}

export interface NoteEvent {
  id: number;
  time: number;          // 目标判定时间戳（秒）
  type: NoteType;
  lane: number;          // 1..8 按键轨，0 代表中心或非按键触控
  touchZone?: string;    // 'C', 'A1'..'A8', 'B1'..'B8', 'D1'..'D8', 'E1'..'E8'
  isEach: boolean;       // 同拍金色双押
  isBreak: boolean;      // 红色爆裂音符
  isEx?: boolean;        // EX 音符
  duration?: number;     // HOLD / TOUCH_HOLD 的持续时间（秒）
  slides?: SlideInfo[];  // SLIDE 包含的滑动路径
  judged?: boolean;      // 是否已触发判定
}

export interface BpmEvent {
  time: number;
  bpm: number;
}

export interface ChartData {
  title: string;
  artist: string;
  first: number;
  bpm: number;
  bpmEvents: BpmEvent[];
  notes: NoteEvent[];
  duration: number;
  maxCombo: number;
}
