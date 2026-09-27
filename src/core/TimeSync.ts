export interface SlideMotionState {
  waiting: boolean;
  moving: boolean;
  finished: boolean;
  progress: number;
}

export class TimeSync {
  public currentTime: number = 0;
  public offsetMs: number = 0;
  public hiSpeed: number = 7.0;
  public playbackRate: number = 1.0;
  public isPlaying: boolean = false;

  private approachConstant: number = 4.2;

  constructor(offsetMs: number = 0, hiSpeed: number = 7.0) {
    this.offsetMs = offsetMs;
    this.hiSpeed = hiSpeed;
  }

  setOffset(offsetMs: number): void {
    this.offsetMs = offsetMs;
  }

  setHiSpeed(hiSpeed: number): void {
    this.hiSpeed = Math.max(1.0, Math.min(15.0, hiSpeed));
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.1, Math.min(3.0, rate));
  }

  get approachTime(): number {
    return this.approachConstant / this.hiSpeed;
  }

  /**
   * 基于原始音频时钟更新主渲染时间
   * renderTime = audioTime + offsetMs / 1000
   */
  update(audioTime: number): void {
    this.currentTime = audioTime + this.offsetMs / 1000;
  }

  /**
   * 计算音符从中心发射到外周判定圈的归一化进度 [0, 1]
   * 0: 刚好在中心生成
   * 1: 刚好到达外圈判定圈
   */
  getNoteProgress(noteTime: number): number {
    const delta = noteTime - this.currentTime;
    return 1 - delta / this.approachTime;
  }

  /**
   * 判断音符在当前帧是否需要进入 Canvas 渲染视锥
   */
  isNoteVisible(noteTime: number, duration: number = 0): boolean {
    const spawnTime = noteTime - this.approachTime;
    const expireTime = noteTime + duration + 0.3; // 判定后保留 300ms 渐隐打击光效
    return this.currentTime >= spawnTime && this.currentTime <= expireTime;
  }

  /**
   * 精确计算 SLIDE 滑条的等待与运动状态
   * @param slideTime 星星到达外环判定圈的时间
   * @param delay 停留等待时间（官方默认 1 拍 = 60/BPM）
   * @param duration 沿路径滑动耗时
   */
  getSlideProgress(slideTime: number, delay: number, duration: number): SlideMotionState {
    const t = this.currentTime;
    const moveStartTime = slideTime + delay;
    const finishTime = moveStartTime + duration;

    if (t < slideTime) {
      return { waiting: false, moving: false, finished: false, progress: 0 };
    }

    if (t >= slideTime && t < moveStartTime) {
      // 正在外圈原地等待
      return { waiting: true, moving: false, finished: false, progress: 0 };
    }

    if (t >= moveStartTime && t <= finishTime) {
      // 正在沿轨迹移动
      const progress = duration > 0 ? (t - moveStartTime) / duration : 1.0;
      return { waiting: false, moving: true, finished: false, progress: Math.min(1.0, progress) };
    }

    // 滑动完毕
    return { waiting: false, moving: false, finished: true, progress: 1.0 };
  }
}
