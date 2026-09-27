import { RadialMath } from '../renderer/RadialMath';
import { KeybindManager } from '../core/KeybindManager';

export interface InputCallbacks {
  onLaneDown: (lane: number) => void;
  onLaneUp: (lane: number) => void;
  onTouchDown: (zone: string) => void;
  onPlayPauseToggle: () => void;
  onSeekRelative: (deltaSeconds: number) => void;
  onHiSpeedAdjust: (delta: number) => void;
}

export class InputController {
  private canvas: HTMLCanvasElement;
  private callbacks: InputCallbacks;
  private keybindManager = KeybindManager.getInstance();
  private activeLanes: Set<number> = new Set();
  private cleanups: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.bindKeyboard();
    this.bindPointer();
  }

  private bindKeyboard(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      // 避免在输入框中打字时误触
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.callbacks.onPlayPauseToggle();
        return;
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.callbacks.onSeekRelative(-2.0);
        return;
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.callbacks.onSeekRelative(2.0);
        return;
      }

      if (e.code === 'ArrowUp') {
        e.preventDefault();
        this.callbacks.onHiSpeedAdjust(0.25);
        return;
      }

      if (e.code === 'ArrowDown') {
        e.preventDefault();
        this.callbacks.onHiSpeedAdjust(-0.25);
        return;
      }

      const lane = this.keybindManager.getLaneByCode(e.code);
      if (lane && !this.activeLanes.has(lane)) {
        this.activeLanes.add(lane);
        this.callbacks.onLaneDown(lane);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const lane = this.keybindManager.getLaneByCode(e.code);
      if (lane && this.activeLanes.has(lane)) {
        this.activeLanes.delete(lane);
        this.callbacks.onLaneUp(lane);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.cleanups.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  private pointerToLane: Map<number, number> = new Map();

  private bindPointer(): void {
    const getHitInfo = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const dx = x - centerX;
      const dy = y - centerY;
      const r = Math.hypot(dx, dy);
      const isMobileLandscape = rect.height <= 520 && rect.width > rect.height;
      const maxR = Math.min(rect.width, rect.height) * (isMobileLandscape ? 0.475 : 0.44);

      if (r < maxR * 0.28) {
        return { isCenter: true, lane: 0, zone: 'C' };
      }

      // 计算极坐标角度 (0~360度)
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      deg = RadialMath.normalizeAngleDeg(deg);

      // 计算与 8 键的最近匹配 (每个按键对应 45 度宽幅扇区，无限延伸至手机边缘)
      let closestLane = 1;
      let minDiff = 360;

      for (let i = 1; i <= 8; i++) {
        const laneDeg = RadialMath.normalizeAngleDeg(RadialMath.getButtonAngleDeg(i));
        let diff = Math.abs(deg - laneDeg);
        if (diff > 180) diff = 360 - diff;
        if (diff < minDiff) {
          minDiff = diff;
          closestLane = i;
        }
      }

      // 推导对应的触控区 A/B/D/E
      const isInner = r < maxR * 0.65;
      const zoneLetter = isInner ? (minDiff > 11.25 ? 'E' : 'B') : (minDiff > 11.25 ? 'D' : 'A');
      const zone = `${zoneLetter}${closestLane}`;

      return { isCenter: false, lane: closestLane, zone };
    };

    const handlePointerDown = (e: PointerEvent) => {
      const hit = getHitInfo(e);
      if (hit.isCenter) {
        this.callbacks.onTouchDown('C');
        return;
      }

      const lane = hit.lane;
      this.pointerToLane.set(e.pointerId, lane);
      this.activeLanes.add(lane);

      this.callbacks.onLaneDown(lane);
      if (hit.zone) {
        this.callbacks.onTouchDown(hit.zone);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      // 仅在手指按压滑动中生效 (支持 SLIDE 与多指滑屏)
      if (!this.pointerToLane.has(e.pointerId)) return;

      const hit = getHitInfo(e);
      if (hit.isCenter) {
        this.callbacks.onTouchDown('C');
        return;
      }

      const prevLane = this.pointerToLane.get(e.pointerId);
      const newLane = hit.lane;

      if (prevLane !== newLane) {
        // 滑入新的按键
        this.pointerToLane.set(e.pointerId, newLane);
        this.activeLanes.add(newLane);
        this.callbacks.onLaneDown(newLane);
        if (hit.zone) {
          this.callbacks.onTouchDown(hit.zone);
        }

        // 检查旧按键是否还有其他手指在按
        if (prevLane) {
          const stillHeld = Array.from(this.pointerToLane.values()).includes(prevLane);
          if (!stillHeld) {
            this.activeLanes.delete(prevLane);
            this.callbacks.onLaneUp(prevLane);
          }
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const lane = this.pointerToLane.get(e.pointerId);
      if (lane !== undefined) {
        this.pointerToLane.delete(e.pointerId);

        // 仅在没有其他激活的手指占用该键时才释放，防止多指打歌时相互取消
        const stillHeld = Array.from(this.pointerToLane.values()).includes(lane);
        if (!stillHeld) {
          this.activeLanes.delete(lane);
          this.callbacks.onLaneUp(lane);
        }
      }
    };

    this.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    this.cleanups.push(() => {
      this.canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    });
  }

  dispose(): void {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
    this.pointerToLane.clear();
    this.activeLanes.clear();
  }
}
