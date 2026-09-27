import { TimeSync } from '../core/TimeSync';
import { AudioEngine } from '../core/AudioEngine';
import { ThemeManager, ThemeName } from '../renderer/ThemeManager';
import { isApkPlatform } from '../utils/platform';

export interface ConsoleCallbacks {
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (targetTime: number) => void;
  onHiSpeedChange: (speed: number) => void;
  onOffsetChange: (offsetMs: number) => void;
  onRateChange: (rate: number) => void;
  onAutoPlayToggle: (enabled: boolean) => void;
  onSensorsToggle: (enabled: boolean) => void;
  onButtonsToggle?: (enabled: boolean) => void;
  onThemeChange: (theme: ThemeName) => void;
  onOpenSongModal: () => void;
  onOpenLibrary?: () => void;
  onOpenKeybindModal: () => void;
  onSelectDifficulty?: (slot: number) => void;
  onVolumeChange?: (vol: number) => void;
  onSfxVolumeChange?: (vol: number) => void;
}

export class ControlConsole {
  private leftContainer: HTMLElement;
  private rightContainer: HTMLElement;

  // 播放控制元素
  private playBtn: HTMLButtonElement;
  private restartBtn: HTMLButtonElement;
  private rewindBtn: HTMLButtonElement;
  private forwardBtn: HTMLButtonElement;
  private progressBar: HTMLInputElement;
  private timeDisplay: HTMLElement;
  private rateSelect: HTMLSelectElement;

  // 速度与延迟
  private hiSpeedInput: HTMLInputElement;
  private hiSpeedValEl: HTMLElement;
  private offsetValEl: HTMLElement;

  // 模式与开关
  private autoPlayBtn: HTMLButtonElement;
  private sensorsBtn: HTMLButtonElement;
  private buttonsToggleBtn: HTMLButtonElement | null = null;
  private keybindBtn: HTMLButtonElement | null = null;
  private songModalBtn: HTMLButtonElement;
  private openLibraryBtn: HTMLButtonElement;
  private flankLibCountEl: HTMLElement;
  private showButtons: boolean = !isApkPlatform();

  // 音量控制
  private musicVolumeSlider: HTMLInputElement;
  private musicVolumeValEl: HTMLElement;
  private sfxVolumeSlider: HTMLInputElement;
  private sfxVolumeValEl: HTMLElement;
  private muteMusicBtn: HTMLButtonElement;
  private muteSfxBtn: HTMLButtonElement;
  private prevMusicVol: number = 0.8;
  private prevSfxVol: number = 0.9;

  // 折叠状态
  private isLeftCollapsed: boolean = false;
  private isRightCollapsed: boolean = false;

  // 进度条拖拽防抖状态
  private isDraggingProgress: boolean = false;
  private dragPreviewTime: number = 0;
  private currentDuration: number = 0;

  private isAutoPlay: boolean = true;
  private showSensors: boolean = true;
  private callbacks: ConsoleCallbacks;

  constructor(parent: HTMLElement, sync: TimeSync, audio: AudioEngine, callbacks: ConsoleCallbacks) {
    this.callbacks = callbacks;
    const isApk = isApkPlatform();

    // 1. 创建左侧控制翼板
    this.leftContainer = document.createElement('div');
    this.leftContainer.className = 'console-flank flank-left';
    this.leftContainer.innerHTML = `
      <div class="flank-content">
        <div class="flank-header">
          <span class="flank-title">舞萌 DX 谱面库</span>
        </div>

        <!-- 曲库与导入 -->
        <div class="flank-card">
          <div class="flank-card-title">🎵 曲库与下载</div>
          <button class="flank-btn flank-btn-primary" id="btn-open-library" style="margin-bottom: 8px;">
            💾 已下载曲库 (<span id="flank-lib-count">0</span>)
          </button>
          <button class="flank-btn flank-btn-secondary" id="btn-song-modal">
            🌐 AstroDX 在线曲库 (1900+)
          </button>
        </div>

        <!-- 谱面难度选择 -->
        <div class="flank-card" id="flank-diff-card">
          <div class="flank-card-title">🎯 谱面难度选择</div>
          <div class="flank-diff-container" id="flank-diff-container">
            <span class="flank-no-diff">加载曲目中...</span>
          </div>
        </div>

        <!-- 视觉与主题 -->
        <div class="flank-card">
          <div class="flank-card-title">🎨 界面视觉与辅助</div>
          <div class="flank-row">
            <label class="flank-label">机台主题:</label>
            <select class="flank-select" id="theme-select">
              <option value="prism">PRiSM 宇宙幻彩</option>
              <option value="finale">FiNALE 经典蓝白</option>
              <option value="dark">Dark Pro 电竞纯黑</option>
            </select>
          </div>

          <div class="flank-row">
            <button class="flank-btn active" id="btn-sensors">感应区分界线 [显]</button>
          </div>
          ${!isApk ? `
          <div class="flank-row" id="flank-buttons-toggle-row">
            <button class="flank-btn active" id="btn-toggle-buttons">外圈物理按键 [显]</button>
          </div>
          ` : ''}
        </div>

        ${!isApk ? `
        <!-- 键盘按键设置 (仅在桌面端显示，移动端/APK下不保留) -->
        <div class="flank-card" id="flank-keybinds-card">
          <div class="flank-card-title">⌨️ 街机按键映射</div>
          <p class="flank-desc">自由调整机台 1~8 键对应的键盘按键，机台上实时标记按键字符：</p>
          <button class="flank-btn flank-btn-secondary" id="btn-keybinds">
            ⚙️ 自定义按键设置
          </button>
        </div>
        ` : ''}
      </div>

      <!-- 左折叠把手 -->
      <button class="flank-toggle-btn left-toggle" id="btn-toggle-left" title="折叠/展开左侧面板">◀</button>
    `;

    // 2. 创建右侧控制翼板
    this.rightContainer = document.createElement('div');
    this.rightContainer.className = 'console-flank flank-right';
    this.rightContainer.innerHTML = `
      <!-- 右折叠把手 -->
      <button class="flank-toggle-btn right-toggle" id="btn-toggle-right" title="折叠/展开右侧面板">▶</button>

      <div class="flank-content">
        <div class="flank-header">
          <span class="flank-title">播放与判定调校</span>
        </div>

        <!-- 播放控制与精准拖拽进度条 -->
        <div class="flank-card">
          <div class="flank-card-title">⏯️ 播放进度与倍速</div>
          
          <div class="flank-btn-group play-group">
            <button class="flank-btn-round" id="btn-restart" title="重新从头播放">↺</button>
            <button class="flank-btn-round" id="btn-rewind" title="后退2秒">⏪</button>
            <button class="flank-btn flank-btn-primary flex-1" id="btn-play">▶ 播放</button>
            <button class="flank-btn-round" id="btn-forward" title="前进2秒">⏩</button>
          </div>

          <div class="progress-container">
            <input type="range" class="console-slider progress-slider" id="progress-bar" min="0" max="1000" value="0" step="1" />
            <div class="progress-time-row">
              <span class="progress-time-badge" id="time-display">00:00 / 00:00</span>
              <div class="rate-wrap">
                <label>倍速:</label>
                <select class="flank-select-mini" id="rate-select">
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1.0" selected>1.0x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2.0">2.0x</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- 流速与延迟 -->
        <div class="flank-card">
          <div class="flank-card-title">⚡ 街机流速与声音延迟</div>
          
          <div class="flank-row">
            <label class="flank-label">Hi-Speed 流速:</label>
            <input type="range" class="console-slider flex-1" id="hispeed-slider" min="1.0" max="12.0" step="0.25" value="${sync.hiSpeed}" />
            <span class="flank-badge" id="hispeed-val">${sync.hiSpeed.toFixed(2)}</span>
          </div>

          <div class="flank-row offset-row">
            <label class="flank-label">音频延迟 Offset:</label>
            <div class="offset-btn-group">
              <button class="offset-btn" id="offset-sub10">-10</button>
              <button class="offset-btn" id="offset-sub1">-1</button>
              <span class="flank-badge offset-badge" id="offset-val">+0 ms</span>
              <button class="offset-btn" id="offset-add1">+1</button>
              <button class="offset-btn" id="offset-add10">+10</button>
            </div>
          </div>
        </div>

        <!-- 音量控制 -->
        <div class="flank-card">
          <div class="flank-card-title">🔊 音量控制</div>
          
          <div class="flank-row">
            <div class="flank-label-with-icon">
              <button class="flank-icon-btn" id="btn-mute-music" title="静音/恢复音乐">🎵</button>
              <span class="flank-label">音乐音量:</span>
            </div>
            <input type="range" class="console-slider flex-1" id="music-volume-slider" min="0" max="100" step="1" value="${Math.round(audio.volume * 100)}" />
            <span class="flank-badge volume-badge" id="music-volume-val">${Math.round(audio.volume * 100)}%</span>
          </div>

          <div class="flank-row">
            <div class="flank-label-with-icon">
              <button class="flank-icon-btn" id="btn-mute-sfx" title="静音/恢复打击音效">🥁</button>
              <span class="flank-label">打击音效:</span>
            </div>
            <input type="range" class="console-slider flex-1 sfx-slider" id="sfx-volume-slider" min="0" max="100" step="1" value="${Math.round(audio.sfxVolume * 100)}" />
            <span class="flank-badge volume-badge sfx-badge" id="sfx-volume-val">${Math.round(audio.sfxVolume * 100)}%</span>
          </div>
        </div>

        <!-- 玩法模式切换 -->
        <div class="flank-card">
          <div class="flank-card-title">🎮 演示与试玩模式</div>
          <button class="flank-btn active full-width" id="btn-autoplay">
            Auto-Play [全自动演示开启]
          </button>
        </div>
      </div>
    `;

    parent.appendChild(this.leftContainer);
    parent.appendChild(this.rightContainer);

    // 绑定 DOM 元素
    this.playBtn = this.rightContainer.querySelector('#btn-play')!;
    this.restartBtn = this.rightContainer.querySelector('#btn-restart')!;
    this.rewindBtn = this.rightContainer.querySelector('#btn-rewind')!;
    this.forwardBtn = this.rightContainer.querySelector('#btn-forward')!;
    this.progressBar = this.rightContainer.querySelector('#progress-bar')!;
    this.timeDisplay = this.rightContainer.querySelector('#time-display')!;
    this.rateSelect = this.rightContainer.querySelector('#rate-select')!;
    this.hiSpeedInput = this.rightContainer.querySelector('#hispeed-slider')!;
    this.hiSpeedValEl = this.rightContainer.querySelector('#hispeed-val')!;
    this.offsetValEl = this.rightContainer.querySelector('#offset-val')!;
    this.autoPlayBtn = this.rightContainer.querySelector('#btn-autoplay')!;
    this.sensorsBtn = this.leftContainer.querySelector('#btn-sensors')!;
    this.buttonsToggleBtn = this.leftContainer.querySelector('#btn-toggle-buttons');
    this.keybindBtn = this.leftContainer.querySelector('#btn-keybinds');
    this.songModalBtn = this.leftContainer.querySelector('#btn-song-modal')!;
    this.openLibraryBtn = this.leftContainer.querySelector('#btn-open-library')!;
    this.flankLibCountEl = this.leftContainer.querySelector('#flank-lib-count')!;

    // 音量控制 DOM 元素
    this.musicVolumeSlider = this.rightContainer.querySelector('#music-volume-slider')!;
    this.musicVolumeValEl = this.rightContainer.querySelector('#music-volume-val')!;
    this.sfxVolumeSlider = this.rightContainer.querySelector('#sfx-volume-slider')!;
    this.sfxVolumeValEl = this.rightContainer.querySelector('#sfx-volume-val')!;
    this.muteMusicBtn = this.rightContainer.querySelector('#btn-mute-music')!;
    this.muteSfxBtn = this.rightContainer.querySelector('#btn-mute-sfx')!;

    this.bindEvents(sync, audio);
  }

  private bindEvents(sync: TimeSync, audio: AudioEngine): void {
    // 播放/暂停
    this.playBtn.addEventListener('click', () => {
      this.callbacks.onPlayPause();
    });

    // 重新从头开始播放
    this.restartBtn.addEventListener('click', () => {
      this.callbacks.onRestart();
    });

    // 步进按钮
    this.rewindBtn.addEventListener('click', () => {
      this.callbacks.onSeek(Math.max(0, audio.currentTime - 2.0));
    });

    this.forwardBtn.addEventListener('click', () => {
      this.callbacks.onSeek(Math.min(this.currentDuration, audio.currentTime + 2.0));
    });

    // 进度条拖拽防抖与平滑 Seek
    const onStartDrag = () => {
      this.isDraggingProgress = true;
    };

    const onMoveDrag = () => {
      if (!this.isDraggingProgress) return;
      const ratio = parseFloat(this.progressBar.value) / 1000;
      this.dragPreviewTime = ratio * this.currentDuration;
      this.renderTimeText(this.dragPreviewTime, this.currentDuration);
    };

    const onEndDrag = () => {
      if (!this.isDraggingProgress) return;
      this.isDraggingProgress = false;
      const ratio = parseFloat(this.progressBar.value) / 1000;
      const targetTime = ratio * this.currentDuration;
      this.callbacks.onSeek(targetTime);
    };

    this.progressBar.addEventListener('mousedown', onStartDrag);
    this.progressBar.addEventListener('touchstart', onStartDrag, { passive: true });
    this.progressBar.addEventListener('input', onMoveDrag);
    this.progressBar.addEventListener('change', onEndDrag);
    window.addEventListener('mouseup', () => {
      if (this.isDraggingProgress) onEndDrag();
    });
    window.addEventListener('touchend', () => {
      if (this.isDraggingProgress) onEndDrag();
    });

    // 流速调节
    this.hiSpeedInput.addEventListener('input', () => {
      const speed = parseFloat(this.hiSpeedInput.value);
      this.hiSpeedValEl.textContent = speed.toFixed(2);
      sync.setHiSpeed(speed);
      this.callbacks.onHiSpeedChange(speed);
    });

    // 延迟微调
    const updateOffset = (delta: number) => {
      const current = Math.max(-500, Math.min(500, sync.offsetMs + delta));
      sync.setOffset(current);
      const sign = current >= 0 ? '+' : '';
      this.offsetValEl.textContent = `${sign}${current} ms`;
      this.callbacks.onOffsetChange(current);
    };

    this.rightContainer.querySelector('#offset-sub10')?.addEventListener('click', () => updateOffset(-10));
    this.rightContainer.querySelector('#offset-sub1')?.addEventListener('click', () => updateOffset(-1));
    this.rightContainer.querySelector('#offset-add1')?.addEventListener('click', () => updateOffset(1));
    this.rightContainer.querySelector('#offset-add10')?.addEventListener('click', () => updateOffset(10));

    // 倍速选择
    this.rateSelect.addEventListener('change', () => {
      const rate = parseFloat(this.rateSelect.value);
      audio.setPlaybackRate(rate);
      sync.setPlaybackRate(rate);
      this.callbacks.onRateChange(rate);
    });

    // Auto-Play 开关
    this.autoPlayBtn.addEventListener('click', () => {
      this.isAutoPlay = !this.isAutoPlay;
      this.autoPlayBtn.textContent = this.isAutoPlay ? 'Auto-Play [全自动演示开启]' : '手动试玩 [键盘玩家打击]';
      this.autoPlayBtn.classList.toggle('active', this.isAutoPlay);
      this.autoPlayBtn.classList.toggle('manual-mode', !this.isAutoPlay);
      this.callbacks.onAutoPlayToggle(this.isAutoPlay);
    });

    // 感应区分界线开关
    this.sensorsBtn.addEventListener('click', () => {
      this.showSensors = !this.showSensors;
      this.sensorsBtn.textContent = this.showSensors ? '感应区分界线 [显]' : '感应区分界线 [隐]';
      this.sensorsBtn.classList.toggle('active', this.showSensors);
      this.callbacks.onSensorsToggle(this.showSensors);
    });

    // 主题切换
    const themeSelect = this.leftContainer.querySelector('#theme-select') as HTMLSelectElement;
    themeSelect?.addEventListener('change', () => {
      const theme = themeSelect.value as ThemeName;
      ThemeManager.setTheme(theme);
      document.body.className = `theme-${theme}`;
      this.callbacks.onThemeChange(theme);
    });

    // 打开已下载曲库
    this.openLibraryBtn.addEventListener('click', () => {
      this.callbacks.onOpenLibrary?.();
    });

    // 打开曲库弹窗 (AstroDX 在线)
    this.songModalBtn.addEventListener('click', () => {
      this.callbacks.onOpenSongModal();
    });

    // 外圈物理按键徽章开关 (仅在非 APK 桌面环境展示)
    if (this.buttonsToggleBtn) {
      this.buttonsToggleBtn.addEventListener('click', () => {
        this.showButtons = !this.showButtons;
        this.buttonsToggleBtn!.textContent = this.showButtons ? '外圈物理按键 [显]' : '外圈物理按键 [隐]';
        this.buttonsToggleBtn!.classList.toggle('active', this.showButtons);
        this.callbacks.onButtonsToggle?.(this.showButtons);
      });
    }

    // 打开按键绑定设置弹窗 (仅在非 APK 环境触发)
    this.keybindBtn?.addEventListener('click', () => {
      this.callbacks.onOpenKeybindModal();
    });

    // 折叠展开按钮
    const leftToggle = this.leftContainer.querySelector('#btn-toggle-left') as HTMLButtonElement;
    leftToggle?.addEventListener('click', () => {
      this.isLeftCollapsed = !this.isLeftCollapsed;
      this.leftContainer.classList.toggle('collapsed', this.isLeftCollapsed);
      leftToggle.textContent = this.isLeftCollapsed ? '▶' : '◀';
    });

    const rightToggle = this.rightContainer.querySelector('#btn-toggle-right') as HTMLButtonElement;
    rightToggle?.addEventListener('click', () => {
      this.isRightCollapsed = !this.isRightCollapsed;
      this.rightContainer.classList.toggle('collapsed', this.isRightCollapsed);
      rightToggle.textContent = this.isRightCollapsed ? '◀' : '▶';
    });

    // 初始化音量 UI 状态
    this.prevMusicVol = audio.volume > 0.01 ? audio.volume : 0.8;
    this.prevSfxVol = audio.sfxVolume > 0.01 ? audio.sfxVolume : 0.9;
    this.updateMusicVolumeUI(audio.volume);
    this.updateSfxVolumeUI(audio.sfxVolume);

    // 音乐音量滑条
    this.musicVolumeSlider.addEventListener('input', () => {
      const val = parseInt(this.musicVolumeSlider.value, 10);
      const vol = Math.max(0, Math.min(1, val / 100));
      if (vol > 0.01) {
        this.prevMusicVol = vol;
      }
      this.updateMusicVolumeUI(vol);
      audio.setVolume(vol);
      this.callbacks.onVolumeChange?.(vol);
    });

    // 打击音效音量滑条
    this.sfxVolumeSlider.addEventListener('input', () => {
      const val = parseInt(this.sfxVolumeSlider.value, 10);
      const vol = Math.max(0, Math.min(1, val / 100));
      if (vol > 0.01) {
        this.prevSfxVol = vol;
      }
      this.updateSfxVolumeUI(vol);
      audio.setSfxVolume(vol);
      this.callbacks.onSfxVolumeChange?.(vol);
    });

    // 释放音效滑条时播放一次 TAP 试听音效
    this.sfxVolumeSlider.addEventListener('change', () => {
      if (audio.sfxVolume > 0.01) {
        audio.triggerSfx('TAP');
      }
    });

    // 音乐静音切换
    this.muteMusicBtn.addEventListener('click', () => {
      if (audio.volume > 0.001) {
        this.prevMusicVol = audio.volume;
        this.setMusicVolume(0, audio);
      } else {
        const restore = this.prevMusicVol > 0.01 ? this.prevMusicVol : 0.8;
        this.setMusicVolume(restore, audio);
      }
    });

    // 音效静音切换
    this.muteSfxBtn.addEventListener('click', () => {
      if (audio.sfxVolume > 0.001) {
        this.prevSfxVol = audio.sfxVolume;
        this.setSfxVolume(0, audio);
      } else {
        const restore = this.prevSfxVol > 0.01 ? this.prevSfxVol : 0.9;
        this.setSfxVolume(restore, audio);
        audio.triggerSfx('TAP');
      }
    });
  }

  private renderTimeText(current: number, total: number): void {
    const fmt = (t: number) => {
      const clamped = Math.max(0, t);
      const m = Math.floor(clamped / 60).toString().padStart(2, '0');
      const s = Math.floor(clamped % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };
    this.timeDisplay.textContent = `${fmt(current)} / ${fmt(total)}`;
  }

  /**
   * 更新左侧面板已下载曲库曲目数量角标
   */
  updateLibraryCount(count: number): void {
    if (this.flankLibCountEl) {
      this.flankLibCountEl.textContent = count.toString();
    }
  }

  /**
   * 由主循环每帧调用，更新播放器状态与时间显示
   */
  updatePlaybackState(isPlaying: boolean, currentTime: number, duration: number): void {
    this.currentDuration = Math.max(1, duration);
    this.playBtn.textContent = isPlaying ? '⏸ 暂停' : '▶ 播放';
    this.playBtn.classList.toggle('playing', isPlaying);

    if (!this.isDraggingProgress) {
      const clampedTime = Math.min(currentTime, this.currentDuration);
      const pct = (clampedTime / this.currentDuration) * 1000;
      this.progressBar.value = Math.round(pct).toString();
      this.renderTimeText(clampedTime, this.currentDuration);
    }
  }

  /**
   * 设置当前曲目可用的难度列表及当前选中的槽位
   */
  setDifficulties(diffs: { slot: number; name: string; level: string }[], activeSlot: number): void {
    const container = this.leftContainer.querySelector('#flank-diff-container');
    if (!container) return;
    container.innerHTML = '';

    if (diffs.length === 0) {
      container.innerHTML = '<span class="flank-no-diff">标准难度</span>';
      return;
    }

    for (const diff of diffs) {
      const btn = document.createElement('button');
      const diffClass = `diff-${diff.name.toLowerCase().replace(':', '')}`;
      btn.className = `flank-diff-choice-btn ${diffClass} ${diff.slot === activeSlot ? 'active' : ''}`;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'diff-btn-name';
      nameSpan.textContent = diff.name;

      const lvSpan = document.createElement('span');
      lvSpan.className = 'diff-btn-lv';
      lvSpan.textContent = diff.level;

      btn.appendChild(nameSpan);
      btn.appendChild(lvSpan);
      btn.addEventListener('click', () => {
        this.callbacks.onSelectDifficulty?.(diff.slot);
      });
      container.appendChild(btn);
    }
  }

  private updateMusicVolumeUI(vol: number): void {
    const pct = Math.round(vol * 100);
    this.musicVolumeSlider.value = pct.toString();
    if (pct === 0) {
      this.musicVolumeValEl.textContent = '静音';
      this.musicVolumeValEl.classList.add('muted');
      this.muteMusicBtn.textContent = '🔇';
      this.muteMusicBtn.classList.add('muted');
    } else {
      this.musicVolumeValEl.textContent = `${pct}%`;
      this.musicVolumeValEl.classList.remove('muted');
      this.muteMusicBtn.textContent = '🎵';
      this.muteMusicBtn.classList.remove('muted');
    }
  }

  private updateSfxVolumeUI(vol: number): void {
    const pct = Math.round(vol * 100);
    this.sfxVolumeSlider.value = pct.toString();
    if (pct === 0) {
      this.sfxVolumeValEl.textContent = '静音';
      this.sfxVolumeValEl.classList.add('muted');
      this.muteSfxBtn.textContent = '🔇';
      this.muteSfxBtn.classList.add('muted');
    } else {
      this.sfxVolumeValEl.textContent = `${pct}%`;
      this.sfxVolumeValEl.classList.remove('muted');
      this.muteSfxBtn.textContent = '🥁';
      this.muteSfxBtn.classList.remove('muted');
    }
  }

  public setMusicVolume(vol: number, audio?: AudioEngine): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.updateMusicVolumeUI(clamped);
    if (audio) {
      audio.setVolume(clamped);
    }
    this.callbacks.onVolumeChange?.(clamped);
  }

  public setSfxVolume(vol: number, audio?: AudioEngine): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.updateSfxVolumeUI(clamped);
    if (audio) {
      audio.setSfxVolume(clamped);
    }
    this.callbacks.onSfxVolumeChange?.(clamped);
  }

  /**
   * 控制打歌/试玩期间浮窗控制台的滑动隐藏与弹出显示
   */
  public setGameplayHidden(hidden: boolean): void {
    if (hidden) {
      this.leftContainer.classList.add('gameplay-hidden');
      this.rightContainer.classList.add('gameplay-hidden');
    } else {
      this.leftContainer.classList.remove('gameplay-hidden');
      this.rightContainer.classList.remove('gameplay-hidden');
    }
  }

  public isGameplayHidden(): boolean {
    return this.leftContainer.classList.contains('gameplay-hidden');
  }
}

