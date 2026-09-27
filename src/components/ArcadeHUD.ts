import { JudgeEngine } from '../core/JudgeEngine';
import { ChartData } from '../core/ChartModel';

export class ArcadeHUD {
  private container: HTMLElement;
  private topBarEl: HTMLElement;
  private centerComboEl: HTMLElement;
  private comboNumEl: HTMLElement;
  private dxScoreEl: HTMLElement;
  private rankEl: HTMLElement;
  private bpmEl: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private onPauseToggle?: () => void;

  private lastCombo: number = -1;
  private lastAccuracyStr: string = '';
  private lastRank: string = '';
  private lastBpmStr: string = '';

  constructor(parent: HTMLElement, onPauseToggle?: () => void) {
    this.onPauseToggle = onPauseToggle;
    this.container = document.createElement('div');
    this.container.className = 'arcade-hud';

    // 1. 顶部曲目信息栏 (简洁浮动顶栏)
    this.topBarEl = document.createElement('div');
    this.topBarEl.className = 'hud-top-bar';
    this.topBarEl.innerHTML = `
      <div class="hud-jacket-wrap">
        <img class="hud-jacket-img" src="" alt="Jacket" />
      </div>
      <div class="hud-song-info">
        <div class="hud-title-row">
          <span class="hud-difficulty-badge">MASTER</span>
          <span class="hud-title">Title</span>
        </div>
        <div class="hud-artist-row">
          <span class="hud-artist">Artist</span>
          <span class="hud-bpm-tag">BPM <span class="hud-bpm-val">120</span></span>
        </div>
      </div>
      <button class="hud-pause-btn" id="hud-btn-pause" title="暂停/呼出控制台">⏸</button>
    `;

    // 2. 中央 COMBO 与 DX 分数
    this.centerComboEl = document.createElement('div');
    this.centerComboEl.className = 'hud-center-combo';
    this.centerComboEl.innerHTML = `
      <div class="hud-combo-label">COMBO</div>
      <div class="hud-combo-number">0</div>
      <div class="hud-score-row">
        <span class="hud-score-pct">0.0000%</span>
        <span class="hud-rank-badge">D</span>
      </div>
    `;

    this.container.appendChild(this.topBarEl);
    this.container.appendChild(this.centerComboEl);
    parent.appendChild(this.container);

    this.comboNumEl = this.centerComboEl.querySelector('.hud-combo-number')!;
    this.dxScoreEl = this.centerComboEl.querySelector('.hud-score-pct')!;
    this.rankEl = this.centerComboEl.querySelector('.hud-rank-badge')!;
    this.bpmEl = this.topBarEl.querySelector('.hud-bpm-val')!;
    this.pauseBtn = this.topBarEl.querySelector('#hud-btn-pause')!;

    this.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPauseToggle?.();
    });
  }

  setPlaying(isPlaying: boolean): void {
    if (this.pauseBtn) {
      this.pauseBtn.textContent = isPlaying ? '⏸' : '▶';
      this.pauseBtn.title = isPlaying ? '暂停/呼出控制台' : '继续播放';
    }
  }

  setAutoPlay(isAutoPlay: boolean): void {
    if (isAutoPlay) {
      this.topBarEl.classList.remove('dock-left');
      this.container.classList.remove('manual-mode');
    } else {
      this.topBarEl.classList.add('dock-left');
      this.container.classList.add('manual-mode');
    }
  }

  /**
   * 游玩打歌时顶栏浮窗平滑滑动隐藏/呼出
   */
  setGameplayHidden(hidden: boolean): void {
    if (hidden) {
      this.topBarEl.classList.add('gameplay-hidden');
      this.container.classList.add('gameplay-hidden');
    } else {
      this.topBarEl.classList.remove('gameplay-hidden');
      this.container.classList.remove('gameplay-hidden');
    }
  }

  isDockedLeft(): boolean {
    return this.topBarEl.classList.contains('dock-left');
  }

  getTopBarElement(): HTMLElement {
    return this.topBarEl;
  }

  updateSongInfo(chart: ChartData, jacketUrl?: string, difficultyName: string = 'MASTER'): void {
    const titleEl = this.topBarEl.querySelector('.hud-title')!;
    const artistEl = this.topBarEl.querySelector('.hud-artist')!;
    const badgeEl = this.topBarEl.querySelector('.hud-difficulty-badge')!;
    const jacketEl = this.topBarEl.querySelector('.hud-jacket-img') as HTMLImageElement;

    titleEl.textContent = chart.title;
    artistEl.textContent = chart.artist;
    this.bpmEl.textContent = Math.round(chart.bpm).toString();
    badgeEl.textContent = difficultyName;

    // 根据难度名称动态更新徽章样式
    badgeEl.className = 'hud-difficulty-badge';
    const lowerName = difficultyName.toLowerCase();
    if (lowerName.includes('easy')) badgeEl.classList.add('badge-easy');
    else if (lowerName.includes('basic')) badgeEl.classList.add('badge-basic');
    else if (lowerName.includes('advanced')) badgeEl.classList.add('badge-advanced');
    else if (lowerName.includes('expert')) badgeEl.classList.add('badge-expert');
    else if (lowerName.includes('remaster') || lowerName.includes('re:')) badgeEl.classList.add('badge-remaster');
    else if (lowerName.includes('utage')) badgeEl.classList.add('badge-utage');
    else badgeEl.classList.add('badge-master');

    if (jacketUrl) {
      jacketEl.src = jacketUrl;
      jacketEl.style.display = 'block';
    } else {
      jacketEl.style.display = 'none';
    }
  }

  showToast(message: string, durationMs: number = 3200): void {
    let toast = this.container.querySelector('.hud-toast') as HTMLElement;
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'hud-toast';
      this.container.appendChild(toast);
    }

    const sparkleSpan = document.createElement('span');
    sparkleSpan.className = 'toast-sparkle';
    sparkleSpan.textContent = '✨';

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = message;

    toast.innerHTML = '';
    toast.appendChild(sparkleSpan);
    toast.appendChild(document.createTextNode(' '));
    toast.appendChild(textSpan);
    toast.classList.remove('hidden');
    toast.classList.add('visible');

    if ((toast as any)._timeout) {
      clearTimeout((toast as any)._timeout);
    }

    (toast as any)._timeout = setTimeout(() => {
      toast.classList.remove('visible');
      toast.classList.add('hidden');
    }, durationMs);
  }

  updateScore(
    judge: JudgeEngine,
    currentBpm?: number,
    _currentTime: number = 0,
    _totalDuration: number = 0
  ): void {
    // 仅在 Combo 产生数值变动时才更新 DOM 与脉冲动效，杜绝每帧强制 reflow 导致骁龙发烫卡顿
    if (this.comboNumEl && judge.combo !== this.lastCombo) {
      this.comboNumEl.textContent = judge.combo.toString();
      if (judge.combo > 0 && judge.combo > this.lastCombo) {
        this.centerComboEl.classList.remove('pulse');
        void this.centerComboEl.offsetWidth; // 仅在击中连击时触发脉冲
        this.centerComboEl.classList.add('pulse');
      } else if (judge.combo === 0) {
        this.centerComboEl.classList.remove('pulse');
      }
      this.lastCombo = judge.combo;
    }

    if (this.dxScoreEl) {
      const accStr = `${judge.accuracyPercentage.toFixed(4)}%`;
      if (accStr !== this.lastAccuracyStr) {
        this.dxScoreEl.textContent = accStr;
        this.lastAccuracyStr = accStr;
      }
    }

    if (this.rankEl && judge.rank !== this.lastRank) {
      this.rankEl.textContent = judge.rank;
      this.lastRank = judge.rank;
    }

    if (currentBpm && this.bpmEl) {
      const bpmStr = Math.round(currentBpm).toString();
      if (bpmStr !== this.lastBpmStr) {
        this.bpmEl.textContent = bpmStr;
        this.lastBpmStr = bpmStr;
      }
    }
  }
}
