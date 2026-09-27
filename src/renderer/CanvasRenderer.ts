import { Point } from './RadialMath';
import { TrackRenderer } from './TrackRenderer';
import { NoteRenderer } from './NoteRenderer';
import { EffectSystem } from './EffectSystem';
import { ThemeManager } from './ThemeManager';
import { TimeSync } from '../core/TimeSync';
import { JudgeEngine } from '../core/JudgeEngine';
import { AudioEngine } from '../core/AudioEngine';
import { ChartData } from '../core/ChartModel';
import { isApkPlatform } from '../utils/platform';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sync: TimeSync;
  private judge: JudgeEngine;
  private audio: AudioEngine;
  private effectSystem: EffectSystem;

  private chart: ChartData | null = null;
  private activeLanes: Set<number> = new Set();
  private autoPlay: boolean = true;
  private showSensors: boolean = true;
  private showButtons: boolean = !isApkPlatform();

  private center: Point = { x: 400, y: 400 };
  private maxRadius: number = 360;
  private viewWidth: number = 800;
  private viewHeight: number = 800;
  private lastFrameTime: number = 0;
  private animFrameId: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    sync: TimeSync,
    judge: JudgeEngine,
    audio: AudioEngine,
    effectSystem: EffectSystem
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.sync = sync;
    this.judge = judge;
    this.audio = audio;
    this.effectSystem = effectSystem;

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  setChart(chart: ChartData): void {
    this.chart = chart;
    this.judge.loadChart(chart.notes);
    this.effectSystem.reset();
  }

  setAutoPlay(enabled: boolean): void {
    this.autoPlay = enabled;
  }

  setShowSensors(enabled: boolean): void {
    this.showSensors = enabled;
  }

  setShowButtons(enabled: boolean): void {
    this.showButtons = enabled;
  }

  getShowButtons(): boolean {
    return this.showButtons;
  }

  pressLane(lane: number): void {
    this.activeLanes.add(lane);
  }

  releaseLane(lane: number): void {
    this.activeLanes.delete(lane);
  }

  handleResize(): void {
    const parent = this.canvas.parentElement || document.body;
    const rect = parent.getBoundingClientRect();
    // 性能优化：限制移动端最高 2.0 DPR，防范 3x/3.5x AMOLED 屏幕导致像素填充率过载卡顿
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);

    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    this.viewWidth = width;
    this.viewHeight = height;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);

    this.center = { x: width / 2, y: height / 2 };
    // 移动端横屏/异形屏适配：当屏幕高度较小（<= 520px）且为宽屏时，扩大机台圆形半径至 0.475（占满高度的 95%），显著放大按键与判定区
    const isMobileLandscape = height <= 520 && width > height;
    this.maxRadius = isMobileLandscape
      ? Math.min(width, height) * 0.475
      : Math.min(width, height) * 0.44;
  }

  start(): void {
    if (this.animFrameId) return;
    this.lastFrameTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;

      this.renderFrame(dt);
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private renderFrame(dt: number): void {
    const ctx = this.ctx;
    const theme = ThemeManager.getTheme();

    // 1. 同步时间轴
    this.sync.update(this.audio.currentTime);

    // 2. 判定系统更新
    if (this.chart) {
      const results = this.judge.update(this.sync.currentTime, this.autoPlay);
      for (const res of results) {
        // 播放打击音效
        this.audio.triggerSfx(res.type, res.isBreak);

        // 产生打击光效与粒子
        const judgeRadius = this.maxRadius * 0.82;
        let pos: Point;
        if (res.lane > 0) {
          const rad = ((-67.5 + (res.lane - 1) * 45) * Math.PI) / 180;
          pos = {
            x: this.center.x + judgeRadius * Math.cos(rad),
            y: this.center.y + judgeRadius * Math.sin(rad)
          };
        } else {
          pos = { x: this.center.x, y: this.center.y };
        }
        this.effectSystem.triggerHit(pos, res.grade, res.isBreak, res.fastLate, res.deltaMs);
      }
    }

    // 3. 更新粒子系统
    this.effectSystem.update(dt);

    // 4. 重绘画布背景（直接绘制视口尺寸，避免重复 clearRect 与 DPR 冗余像素填充）
    ctx.fillStyle = theme.bgFill;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    // 5. 绘制机台底盘与判定圈
    const effectiveDuration = this.chart?.duration || this.audio.duration;
    const songProgress = effectiveDuration > 0 ? this.sync.currentTime / effectiveDuration : 0;

    TrackRenderer.render(
      ctx,
      this.center,
      this.maxRadius,
      theme,
      this.activeLanes,
      this.showSensors,
      songProgress,
      this.showButtons
    );

    // 6. 绘制音符与轨迹
    if (this.chart) {
      NoteRenderer.renderNotes(
        ctx,
        this.chart.notes,
        this.sync,
        this.center,
        this.maxRadius,
        theme
      );
    }

    // 7. 绘制打击爆裂与判定光效
    this.effectSystem.render(ctx);
  }
}
