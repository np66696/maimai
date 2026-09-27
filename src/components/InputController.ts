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

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.bindKeyboard();
    this.bindPointer();
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', e => {
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
    });

    window.addEventListener('keyup', e => {
      const lane = this.keybindManager.getLaneByCode(e.code);
      if (lane && this.activeLanes.has(lane)) {
        this.activeLanes.delete(lane);
        this.callbacks.onLaneUp(lane);
      }
    });
  }

  private bindPointer(): void {
    const handlePointerDown = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const dx = x - centerX;
      const dy = y - centerY;
      const r = Math.hypot(dx, dy);
      const maxR = Math.min(rect.width, rect.height) * 0.44;

      if (r < maxR * 0.25) {
        // 中心触控区 C
        this.callbacks.onTouchDown('C');
        return;
      }

      // 计算极坐标角度 (0~360度)
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      deg = RadialMath.normalizeAngleDeg(deg);

      // 计算与 8 键的最近匹配
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

      this.callbacks.onLaneDown(closestLane);
      this.activeLanes.add(closestLane);
    };

    const handlePointerUp = () => {
      for (const lane of this.activeLanes) {
        this.callbacks.onLaneUp(lane);
      }
      this.activeLanes.clear();
    };

    this.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }
}
