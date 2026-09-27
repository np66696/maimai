import { NoteType } from './ChartModel';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private trackBuffer: AudioBuffer | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;

  private startContextTime: number = 0;
  private pausedAtTime: number = 0;
  private customDuration: number = 0;
  private _isPlaying: boolean = false;
  private _playbackRate: number = 1.0;
  private _volume: number = 0.8;
  private _sfxVolume: number = 0.9;
  public onEnded?: () => void;

  constructor() {
    // 延迟初始化 AudioContext，避免部分浏览器用户未点击时的 AutoPlay 策略警告
    try {
      if (typeof localStorage !== 'undefined') {
        const savedBgm = localStorage.getItem('maimai_bgm_volume');
        if (savedBgm !== null) {
          const parsed = parseFloat(savedBgm);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            this._volume = parsed;
          }
        }
        const savedSfx = localStorage.getItem('maimai_sfx_volume');
        if (savedSfx !== null) {
          const parsed = parseFloat(savedSfx);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            this._sfxVolume = parsed;
          }
        }
      }
    } catch {
      // 忽略存储读取异常
    }
  }

  private sfxBuffers: Map<string, AudioBuffer> = new Map();
  private lastSfxTimes: Map<string, number> = new Map();
  private isPreloadingSfx: boolean = false;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this._volume, this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);

      this.sfxGainNode = this.ctx.createGain();
      this.sfxGainNode.gain.setValueAtTime(this._sfxVolume, this.ctx.currentTime);
      this.sfxGainNode.connect(this.ctx.destination);

      this.initSfxBuffers();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * 加载音乐音轨（支持在线 URL 或本地 Blob / File）
   */
  async loadTrack(source: string | Blob): Promise<void> {
    const ctx = this.ensureContext();
    let arrayBuffer: ArrayBuffer;

    if (typeof source === 'string') {
      const resp = await fetch(source);
      arrayBuffer = await resp.arrayBuffer();
    } else {
      arrayBuffer = await source.arrayBuffer();
    }

    this.trackBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.customDuration = 0;
    this.seek(0);
  }

  /**
   * 清除音轨并切换为虚拟时钟模式
   */
  clearTrack(fallbackDuration?: number): void {
    if (this._isPlaying) {
      this.pause();
    }
    this.trackBuffer = null;
    this.customDuration = fallbackDuration || 0;
    this.pausedAtTime = 0;
  }

  /**
   * 设置外部谱面时长（在无音频文件或音频未加载时作为主时钟终点）
   */
  setCustomDuration(dur: number): void {
    this.customDuration = Math.max(0, dur);
  }

  /**
   * 播放音乐
   */
  play(fromTime?: number): void {
    const ctx = this.ensureContext();
    if (this._isPlaying) return;

    if (fromTime !== undefined) {
      this.pausedAtTime = Math.max(0, Math.min(fromTime, this.duration));
    }

    // 若已在终点，则从头重新播放
    if (this.duration > 0 && this.pausedAtTime >= this.duration - 0.05) {
      this.pausedAtTime = 0;
    }

    if (!this.trackBuffer) {
      // 容灾模式：若无音频文件，依然维持内部虚拟时钟正常走动
      this._isPlaying = true;
      this.startContextTime = ctx.currentTime;
      return;
    }

    this.currentSource = ctx.createBufferSource();
    this.currentSource.buffer = this.trackBuffer;
    this.currentSource.playbackRate.setValueAtTime(this._playbackRate, ctx.currentTime);
    this.currentSource.connect(this.gainNode!);

    const offset = Math.min(this.pausedAtTime, this.trackBuffer.duration);
    this.currentSource.start(0, offset);
    this.startContextTime = ctx.currentTime;
    this._isPlaying = true;

    this.currentSource.onended = () => {
      if (this._isPlaying && this.currentTime >= (this.trackBuffer?.duration || 0) - 0.1) {
        this.pause();
        this.pausedAtTime = this.duration;
        this.onEnded?.();
      }
    };
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (!this._isPlaying) return;
    const finalTime = Math.min(this.currentTime, this.duration);
    this.pausedAtTime = finalTime;
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // 忽略已停止节点异常
      }
      this.currentSource = null;
    }
    this._isPlaying = false;
  }

  /**
   * 跳转到指定时间戳（秒）
   */
  seek(targetTime: number): void {
    const wasPlaying = this._isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const maxDur = this.duration;
    this.pausedAtTime = Math.max(0, maxDur > 0 ? Math.min(targetTime, maxDur) : targetTime);
    if (wasPlaying && (maxDur === 0 || this.pausedAtTime < maxDur)) {
      this.play();
    }
  }

  /**
   * 获取当前播放进度（秒）
   */
  get currentTime(): number {
    if (!this._isPlaying || !this.ctx) {
      return this.pausedAtTime;
    }
    const elapsed = (this.ctx.currentTime - this.startContextTime) * this._playbackRate;
    const current = this.pausedAtTime + elapsed;
    const maxDur = this.duration;
    if (maxDur > 0 && current >= maxDur) {
      // 到达终点，自动锁住并暂停，防止时间继续往前跑
      this.pause();
      this.pausedAtTime = maxDur;
      this.onEnded?.();
      return maxDur;
    }
    return current;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get duration(): number {
    if (this.trackBuffer && this.trackBuffer.duration > 0) {
      return this.trackBuffer.duration;
    }
    if (this.customDuration > 0) {
      return this.customDuration;
    }
    return 180;
  }

  setPlaybackRate(rate: number): void {
    this._playbackRate = Math.max(0.1, Math.min(2.0, rate));
    if (this.currentSource && this.ctx) {
      this.currentSource.playbackRate.setValueAtTime(this._playbackRate, this.ctx.currentTime);
    }
  }

  get volume(): number {
    return this._volume;
  }

  get sfxVolume(): number {
    return this._sfxVolume;
  }

  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this._volume, this.ctx.currentTime);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('maimai_bgm_volume', this._volume.toString());
      }
    } catch {
      // 忽略写入异常
    }
  }

  setMusicVolume(vol: number): void {
    this.setVolume(vol);
  }

  setSfxVolume(vol: number): void {
    this._sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.sfxGainNode && this.ctx) {
      this.sfxGainNode.gain.setValueAtTime(this._sfxVolume, this.ctx.currentTime);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('maimai_sfx_volume', this._sfxVolume.toString());
      }
    } catch {
      // 忽略写入异常
    }
  }

  /**
   * 预先离线渲染所有音效到 AudioBuffer 中，彻底消除实时创建 Oscillator 导致的 GC 卡顿与音画延迟
   */
  private async initSfxBuffers(): Promise<void> {
    if (this.isPreloadingSfx) return;
    this.isPreloadingSfx = true;

    try {
      const OfflineCtx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      if (!OfflineCtx) return;

      const sampleRate = this.ctx?.sampleRate || 44100;

      // 1. TAP (0.05s)
      const tapOffline = new OfflineCtx(1, Math.ceil(sampleRate * 0.05), sampleRate);
      const tapOsc = tapOffline.createOscillator();
      const tapGain = tapOffline.createGain();
      tapOsc.type = 'triangle';
      tapOsc.frequency.setValueAtTime(750, 0);
      tapOsc.frequency.exponentialRampToValueAtTime(180, 0.045);
      tapGain.gain.setValueAtTime(0.7, 0);
      tapGain.gain.exponentialRampToValueAtTime(0.001, 0.045);
      tapOsc.connect(tapGain);
      tapGain.connect(tapOffline.destination);
      tapOsc.start(0);
      tapOsc.stop(0.05);
      const tapBuf = await tapOffline.startRendering();
      this.sfxBuffers.set('TAP', tapBuf);

      // 2. BREAK (0.13s)
      const breakOffline = new OfflineCtx(1, Math.ceil(sampleRate * 0.13), sampleRate);
      const bOsc = breakOffline.createOscillator();
      const bGain = breakOffline.createGain();
      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(320, 0);
      bOsc.frequency.exponentialRampToValueAtTime(45, 0.12);
      bGain.gain.setValueAtTime(1.0, 0);
      bGain.gain.exponentialRampToValueAtTime(0.001, 0.12);
      bOsc.connect(bGain);
      bGain.connect(breakOffline.destination);
      bOsc.start(0);
      bOsc.stop(0.13);

      const bellOsc = breakOffline.createOscillator();
      const bellGain = breakOffline.createGain();
      bellOsc.type = 'square';
      bellOsc.frequency.setValueAtTime(1320, 0);
      bellOsc.frequency.exponentialRampToValueAtTime(660, 0.09);
      bellGain.gain.setValueAtTime(0.35, 0);
      bellGain.gain.exponentialRampToValueAtTime(0.001, 0.09);
      bellOsc.connect(bellGain);
      bellGain.connect(breakOffline.destination);
      bellOsc.start(0);
      bellOsc.stop(0.1);
      const breakBuf = await breakOffline.startRendering();
      this.sfxBuffers.set('BREAK', breakBuf);

      // 3. SLIDE (0.07s)
      const slideOffline = new OfflineCtx(1, Math.ceil(sampleRate * 0.07), sampleRate);
      const sOsc = slideOffline.createOscillator();
      const sGain = slideOffline.createGain();
      sOsc.type = 'sine';
      sOsc.frequency.setValueAtTime(980, 0);
      sOsc.frequency.exponentialRampToValueAtTime(1450, 0.06);
      sGain.gain.setValueAtTime(0.5, 0);
      sGain.gain.exponentialRampToValueAtTime(0.001, 0.06);
      sOsc.connect(sGain);
      sGain.connect(slideOffline.destination);
      sOsc.start(0);
      sOsc.stop(0.07);
      const slideBuf = await slideOffline.startRendering();
      this.sfxBuffers.set('SLIDE', slideBuf);

      // 4. HOLD (0.03s)
      const holdOffline = new OfflineCtx(1, Math.ceil(sampleRate * 0.03), sampleRate);
      const hOsc = holdOffline.createOscillator();
      const hGain = holdOffline.createGain();
      hOsc.type = 'sine';
      hOsc.frequency.setValueAtTime(620, 0);
      hGain.gain.setValueAtTime(0.3, 0);
      hGain.gain.exponentialRampToValueAtTime(0.001, 0.025);
      hOsc.connect(hGain);
      hGain.connect(holdOffline.destination);
      hOsc.start(0);
      hOsc.stop(0.03);
      const holdBuf = await holdOffline.startRendering();
      this.sfxBuffers.set('HOLD', holdBuf);

      // 5. TOUCH (0.08s)
      const touchOffline = new OfflineCtx(1, Math.ceil(sampleRate * 0.08), sampleRate);
      const tOsc = touchOffline.createOscillator();
      const tGain = touchOffline.createGain();
      tOsc.type = 'sine';
      tOsc.frequency.setValueAtTime(1200, 0);
      tOsc.frequency.exponentialRampToValueAtTime(1600, 0.07);
      tGain.gain.setValueAtTime(0.6, 0);
      tGain.gain.exponentialRampToValueAtTime(0.001, 0.07);
      tOsc.connect(tGain);
      tGain.connect(touchOffline.destination);
      tOsc.start(0);
      tOsc.stop(0.08);
      const touchBuf = await touchOffline.startRendering();
      this.sfxBuffers.set('TOUCH', touchBuf);
    } catch {
      // 容灾：离线渲染不可用时自动回退为即时合成
    }
  }

  /**
   * 触发高品质打击音效（优先采用预生成 AudioBuffer，零 CPU 与 GC 开销）
   */
  triggerSfx(type: NoteType, isBreak: boolean = false): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const sfxKey = isBreak ? 'BREAK' : (type === 'TOUCH_HOLD' ? 'TOUCH' : type);
    const lastTime = this.lastSfxTimes.get(sfxKey) || 0;
    // 节流：同类型打击音效在 12ms 内只播一次，防止同拍多押或密集连击导致的音效爆音与线程阻塞
    if (now - lastTime < 0.012) {
      return;
    }
    this.lastSfxTimes.set(sfxKey, now);

    // 优先从预生成的 AudioBuffer 中播放，单次消耗近乎为 0
    const buffer = this.sfxBuffers.get(sfxKey);
    if (buffer) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.sfxGainNode!);
        source.start(now);
        return;
      } catch {
        // 异常时回退到实时合成
      }
    }

    if (isBreak) {
      this.synthesizeBreakSfx(ctx, now);
      return;
    }

    switch (type) {
      case 'TAP':
        this.synthesizeTapSfx(ctx, now);
        break;
      case 'BREAK':
        this.synthesizeBreakSfx(ctx, now);
        break;
      case 'SLIDE':
        this.synthesizeSlideSfx(ctx, now);
        break;
      case 'HOLD':
        this.synthesizeHoldTickSfx(ctx, now);
        break;
      case 'TOUCH':
      case 'TOUCH_HOLD':
        this.synthesizeTouchSfx(ctx, now);
        break;
    }
  }

  /**
   * 程序化合成 TAP 清脆街机敲击声
   */
  private synthesizeTapSfx(ctx: AudioContext, time: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(750, time);
    osc.frequency.exponentialRampToValueAtTime(180, time + 0.045);

    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    osc.connect(gain);
    gain.connect(this.sfxGainNode!);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  /**
   * 程序化合成 BREAK 红色爆裂齿轮轰鸣玻璃破碎声
   */
  private synthesizeBreakSfx(ctx: AudioContext, time: number): void {
    // 1. 低音爆冲
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);

    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGainNode!);
    osc.start(time);
    osc.stop(time + 0.13);

    // 2. 高频金属亮光 (Bell / Glass shatter)
    const bellOsc = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bellOsc.type = 'square';
    bellOsc.frequency.setValueAtTime(1320, time);
    bellOsc.frequency.exponentialRampToValueAtTime(660, time + 0.09);

    bellGain.gain.setValueAtTime(0.35, time);
    bellGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

    bellOsc.connect(bellGain);
    bellGain.connect(this.sfxGainNode!);
    bellOsc.start(time);
    bellOsc.stop(time + 0.1);
  }

  /**
   * 程序化合成 SLIDE 划动流光音效
   */
  private synthesizeSlideSfx(ctx: AudioContext, time: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, time);
    osc.frequency.exponentialRampToValueAtTime(1450, time + 0.06);

    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGainNode!);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  /**
   * 程序化合成 HOLD 持续计数微弱嘀嗒声
   */
  private synthesizeHoldTickSfx(ctx: AudioContext, time: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, time);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);

    osc.connect(gain);
    gain.connect(this.sfxGainNode!);
    osc.start(time);
    osc.stop(time + 0.03);
  }

  /**
   * 程序化合成 TOUCH 清脆风铃/气泡声
   */
  private synthesizeTouchSfx(ctx: AudioContext, time: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, time);
    osc.frequency.exponentialRampToValueAtTime(1600, time + 0.07);

    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);

    osc.connect(gain);
    gain.connect(this.sfxGainNode!);
    osc.start(time);
    osc.stop(time + 0.08);
  }
}
