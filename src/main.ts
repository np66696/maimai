import './styles/main.css';
import { TimeSync } from './core/TimeSync';
import { JudgeEngine } from './core/JudgeEngine';
import { AudioEngine } from './core/AudioEngine';
import { SimaiParser } from './core/SimaiParser';
import { EffectSystem } from './renderer/EffectSystem';
import { CanvasRenderer } from './renderer/CanvasRenderer';
import { ArcadeHUD } from './components/ArcadeHUD';
import { ControlConsole } from './components/ControlConsole';
import { SongSelectorModal, SongItem } from './components/SongSelectorModal';
import { InputController } from './components/InputController';
import { KeybindModal } from './components/KeybindModal';
import { ChartData } from './core/ChartModel';
import { AdxLoader, LoadedAdxPackage, AdxDifficultyInfo } from './core/AdxLoader';
import { ChartLibraryService, SavedSongItem } from './core/ChartLibraryService';
import { isApkPlatform } from './utils/platform';

// 内置曲目清单
const PRESET_SONGS: SongItem[] = [
  {
    id: 'garakuta',
    title: 'Garakuta Doll Play',
    artist: 't+pazolite',
    bpm: 256,
    jacketUrl: './songs/garakuta/jacket.svg',
    chartUrl: './songs/garakuta/maidata.txt',
    difficulties: [
      { name: 'EXPERT', level: '12', inoteKey: 4 },
      { name: 'MASTER', level: '13+', inoteKey: 5 }
    ]
  },
  {
    id: 'oshama',
    title: 'Oshama Scramble!',
    artist: 't+pazolite',
    bpm: 196,
    jacketUrl: './songs/oshama/jacket.svg',
    chartUrl: './songs/oshama/maidata.txt',
    difficulties: [
      { name: 'EXPERT', level: '12+', inoteKey: 4 },
      { name: 'MASTER', level: '13', inoteKey: 5 }
    ]
  }
];

class MaimaiApp {
  private appEl: HTMLElement;
  private canvas: HTMLCanvasElement;
  private sync: TimeSync;
  private judge: JudgeEngine;
  private audio: AudioEngine;
  private effectSystem: EffectSystem;
  private renderer: CanvasRenderer;
  private hud: ArcadeHUD;
  private console: ControlConsole;
  private songModal: SongSelectorModal;
  private keybindModal: KeybindModal;
  private inputController: InputController;

  private currentChart: ChartData | null = null;
  private currentSong: SongItem = PRESET_SONGS[0];
  private currentMaidataText: string = '';
  private currentDifficulties: AdxDifficultyInfo[] = [];
  private currentDiffSlot: number = 5;
  private currentCoverUrl: string = '';
  private isAutoPlay: boolean = true;

  constructor() {
    this.appEl = document.getElementById('app')!;
    this.appEl.innerHTML = '';

    // 创建主 Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'main-canvas';
    this.appEl.appendChild(this.canvas);

    // 初始化核心引擎
    this.sync = new TimeSync(0, 7.0);
    this.judge = new JudgeEngine();
    this.audio = new AudioEngine();
    this.effectSystem = new EffectSystem();

    // 监听音频播放结束事件，避免时间继续累加
    this.audio.onEnded = () => {
      if (this.audio.isPlaying) {
        this.audio.pause();
      }
      const dur = this.currentChart?.duration || this.audio.duration;
      this.console.updatePlaybackState(false, dur, dur);
    };

    // 初始化渲染管线
    this.renderer = new CanvasRenderer(
      this.canvas,
      this.sync,
      this.judge,
      this.audio,
      this.effectSystem
    );

    if (isApkPlatform()) {
      document.body.classList.add('platform-apk');
    }

    // 初始化 HUD
    this.hud = new ArcadeHUD(this.appEl, () => this.togglePlay());
    this.hud.setAutoPlay(this.isAutoPlay);

    // 初始化键位自定义模态框
    this.keybindModal = new KeybindModal(this.appEl);

    // 初始化左右双翼控制台
    this.console = new ControlConsole(this.appEl, this.sync, this.audio, {
      onPlayPause: () => this.togglePlay(),
      onRestart: () => {
        this.seek(0);
        this.togglePlay();
      },
      onSeek: time => this.seek(time),
      onHiSpeedChange: speed => this.sync.setHiSpeed(speed),
      onOffsetChange: offsetMs => this.sync.setOffset(offsetMs),
      onRateChange: rate => {
        this.audio.setPlaybackRate(rate);
        this.sync.setPlaybackRate(rate);
      },
      onAutoPlayToggle: enabled => {
        this.isAutoPlay = enabled;
        this.renderer.setAutoPlay(enabled);
        this.hud.setAutoPlay(enabled);
        this.updateConsoleVisibility();
      },
      onSensorsToggle: enabled => this.renderer.setShowSensors(enabled),
      onButtonsToggle: enabled => this.renderer.setShowButtons(enabled),
      onThemeChange: () => {},
      onOpenSongModal: () => this.songModal.open('astrodx'),
      onOpenLibrary: () => this.songModal.open('library'),
      onOpenKeybindModal: () => this.keybindModal.open(),
      onSelectDifficulty: slot => this.switchDifficulty(slot),
      onVolumeChange: vol => this.audio.setVolume(vol),
      onSfxVolumeChange: vol => this.audio.setSfxVolume(vol)
    });

    this.audio.onEnded = () => {
      this.updateConsoleVisibility();
      this.hud.setPlaying(false);
    };

    // 初始化曲库弹窗 (含 AstroDX 在线曲库、本地已下载曲库与本地导入)
    this.songModal = new SongSelectorModal(this.appEl, PRESET_SONGS, {
      onSelectSong: (song, diffIdx) => this.loadPresetSong(song, diffIdx),
      onCustomChartLoaded: (text, audioSource, coverUrl, diffIndex) =>
        this.loadCustomChart(text, audioSource, coverUrl, diffIndex),
      onAdxPackageLoaded: pkg => this.loadAdxPackage(pkg)
    });

    // 监听本地曲库变动，实时更新左侧操作台曲库数量角标
    ChartLibraryService.getInstance().getStats().then(stats => {
      this.console.updateLibraryCount(stats.count);
    });
    ChartLibraryService.getInstance().onLibraryChange(async () => {
      const stats = await ChartLibraryService.getInstance().getStats();
      this.console.updateLibraryCount(stats.count);
    });

    // 初始化输入捕获控制器
    this.inputController = new InputController(this.canvas, {
      onLaneDown: lane => this.handleLaneDown(lane),
      onLaneUp: lane => this.renderer.releaseLane(lane),
      onTouchDown: zone => this.handleTouchDown(zone),
      onPlayPauseToggle: () => this.togglePlay(),
      onSeekRelative: delta => this.seek(this.audio.currentTime + delta),
      onHiSpeedAdjust: delta => {
        const next = Math.max(1.0, Math.min(12.0, this.sync.hiSpeed + delta));
        this.sync.setHiSpeed(next);
        this.console.setHiSpeed(next);
      }
    });

    // 初始化全局拖拽监听 (.adx / .zip / maidata.txt)
    this.setupGlobalDragAndDrop();

    // 启动主循环与状态刷新轮询
    this.renderer.start();
    this.startStateSyncLoop();

    // 默认加载首发曲目
    this.loadPresetSong(this.currentSong, 5);
  }

  private updateConsoleVisibility(): void {
    // 在关闭 auto 模式 (试玩打歌模式) 且正在播放时，自动平滑隐藏双翼控制台与顶部浮窗
    // 暂停打歌或单曲结束时，自动平滑滑出复位，保证最纯净的打歌视野
    const shouldHide = !this.isAutoPlay && this.audio.isPlaying;
    this.console.setGameplayHidden(shouldHide);
    this.hud.setGameplayHidden(shouldHide);
    // 同步顶栏状态：非 auto 模式时移至左侧空白区域
    this.hud.setAutoPlay(this.isAutoPlay);
  }

  private togglePlay(): void {
    if (this.audio.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play();
    }
    this.updateConsoleVisibility();
    this.hud.setPlaying(this.audio.isPlaying);
  }

  private seek(time: number): void {
    const effectiveDuration = this.currentChart?.duration || this.audio.duration;
    const clampedTime = Math.max(0, Math.min(time, effectiveDuration));
    this.audio.seek(clampedTime);
    this.sync.update(this.audio.currentTime);
    if (this.currentChart) {
      this.judge.loadChart(this.currentChart.notes);
      this.effectSystem.reset();
    }
  }

  private handleLaneDown(lane: number): void {
    this.renderer.pressLane(lane);

    if (!this.isAutoPlay) {
      // 玩家试玩手动打击
      const res = this.judge.handleInput(lane, this.sync.currentTime);
      if (res) {
        this.audio.triggerSfx(res.type, res.isBreak);
        const rad = ((-67.5 + (lane - 1) * 45) * Math.PI) / 180;
        const rect = this.canvas.getBoundingClientRect();
        const center = { x: rect.width / 2, y: rect.height / 2 };
        const r = Math.min(rect.width, rect.height) * 0.44 * 0.82;
        const pos = {
          x: center.x + r * Math.cos(rad),
          y: center.y + r * Math.sin(rad)
        };
        this.effectSystem.triggerHit(pos, res.grade, res.isBreak, res.fastLate, res.deltaMs);
      } else {
        // 空击音效
        this.audio.triggerSfx('TAP', false);
      }
    }
  }

  private handleTouchDown(zone: string): void {
    if (!this.isAutoPlay) {
      const res = this.judge.handleTouchInput(zone, this.sync.currentTime);
      if (res) {
        this.audio.triggerSfx(res.type, res.isBreak);
        const rect = this.canvas.getBoundingClientRect();
        const center = { x: rect.width / 2, y: rect.height / 2 };
        this.effectSystem.triggerHit(center, res.grade, res.isBreak, res.fastLate, res.deltaMs);
      }
    }
  }

  private setCoverUrl(url: string = ''): void {
    if (this.currentCoverUrl && this.currentCoverUrl.startsWith('blob:') && this.currentCoverUrl !== url) {
      try {
        URL.revokeObjectURL(this.currentCoverUrl);
      } catch {
        // 忽略非浏览器环境错误
      }
    }
    this.currentCoverUrl = url;
  }

  private async loadPresetSong(song: SongItem, diffIdx: number): Promise<void> {
    this.currentSong = song;
    if (this.audio.isPlaying) {
      this.audio.pause();
    }

    try {
      if (song.chartUrl) {
        const resp = await fetch(song.chartUrl);
        this.currentMaidataText = await resp.text();
        this.currentDifficulties = song.difficulties.map(d => ({
          slot: d.inoteKey,
          inoteKey: d.inoteKey,
          name: d.name,
          level: d.level
        }));
      }

      this.setCoverUrl(song.jacketUrl);

      if (song.audioUrl) {
        await this.audio.loadTrack(song.audioUrl);
      } else {
        this.audio.clearTrack(0);
      }

      this.switchDifficulty(diffIdx);
      this.seek(0);
    } catch (e) {
      console.error('Failed to load preset song:', e);
    }
  }

  private async loadCustomChart(
    chartText: string,
    audioSource?: File | Blob,
    coverUrl?: string,
    diffIndex: number = 5
  ): Promise<void> {
    if (this.audio.isPlaying) {
      this.audio.pause();
      this.updateConsoleVisibility();
      this.hud.setPlaying(false);
    }

    try {
      this.currentMaidataText = chartText;
      this.currentDifficulties = AdxLoader.extractDifficulties(chartText);
      this.setCoverUrl(coverUrl || '');

      if (audioSource) {
        await this.audio.loadTrack(audioSource);
      } else {
        this.audio.clearTrack(0);
      }

      this.switchDifficulty(diffIndex);
      this.seek(0);
      this.audio.play(); // 加载完成后自动开启播放
      this.updateConsoleVisibility();
      this.hud.setPlaying(true);
    } catch (e: any) {
      console.error('Failed to parse chart:', e);
      alert('谱面解析失败，请检查 Simai 语法格式！');
    }
  }

  /**
   * 载入 AstroDX .adx / .zip 谱面包
   */
  private async loadAdxPackage(pkg: LoadedAdxPackage): Promise<void> {
    if (this.audio.isPlaying) {
      this.audio.pause();
      this.updateConsoleVisibility();
      this.hud.setPlaying(false);
    }

    try {
      this.currentMaidataText = pkg.maidataText;
      this.currentDifficulties = pkg.difficulties;
      this.setCoverUrl(pkg.coverUrl || '');

      if (pkg.audioBlob) {
        await this.audio.loadTrack(pkg.audioBlob);
      } else {
        this.audio.clearTrack(0);
      }

      // 切换至默认难度 (优先 Master)
      this.switchDifficulty(pkg.defaultSlot);

      this.seek(0);
      this.audio.play();
      this.updateConsoleVisibility();
      this.hud.setPlaying(true);

      // 自动保存至本地曲库，以便后续随时从「已下载曲库」直接选择
      if (pkg.audioBlob) {
        const safeTitle = (pkg.title || 'Unknown').trim();
        const safeArtist = (pkg.artist || 'Unknown').trim();
        const id = `adx_${safeTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${pkg.bpm || 0}`;
        const savedItem: SavedSongItem = {
          id,
          source: 'adx_file',
          title: safeTitle,
          artist: safeArtist,
          bpm: pkg.bpm || 0,
          genre: 'ADX IMPORT',
          version: 'AstroDX',
          maidataText: pkg.maidataText,
          audioBlob: pkg.audioBlob,
          coverBlob: pkg.coverBlob,
          difficulties: pkg.difficulties.map(d => ({
            slot: d.slot,
            name: d.name,
            level: d.level,
            inoteKey: d.slot
          })),
          defaultSlot: pkg.defaultSlot || 5,
          addedAt: Date.now(),
          fileSize: (pkg.audioBlob?.size || 0) + pkg.maidataText.length + (pkg.coverBlob?.size || 0)
        };
        await ChartLibraryService.getInstance().saveSong(savedItem);
      }

      const diffCount = pkg.difficulties.length;
      this.hud.showToast(`已成功载入 AstroDX 谱面: [${pkg.title}] (${diffCount}个难度)`);
    } catch (err: any) {
      console.error('Failed to load .adx package:', err);
      alert(`AstroDX 谱面包载入失败: ${err.message}`);
    }
  }

  /**
   * 切换当前曲目的难度槽位 (1..7)
   */
  private switchDifficulty(slot: number): void {
    this.currentDiffSlot = slot;
    if (!this.currentMaidataText) return;

    this.currentChart = SimaiParser.parse(this.currentMaidataText, slot);
    this.renderer.setChart(this.currentChart);
    this.judge.loadChart(this.currentChart.notes);
    this.audio.setCustomDuration(this.currentChart.duration);

    const diffObj = this.currentDifficulties.find(d => d.slot === slot);
    const diffDisplayName = diffObj
      ? `${diffObj.name} ${diffObj.level}`
      : (slot === 5 ? 'MASTER' : 'EXPERT');

    this.hud.updateSongInfo(this.currentChart, this.currentCoverUrl, diffDisplayName);
    this.console.setDifficulties(this.currentDifficulties, slot);
  }

  /**
   * 全屏拖拽支持：任意处拖入 .adx 谱面包或 maidata.txt 自动识别并装载
   */
  private setupGlobalDragAndDrop(): void {
    const dropOverlay = document.createElement('div');
    dropOverlay.className = 'global-drop-backdrop hidden';
    dropOverlay.innerHTML = `
      <div class="global-drop-box">
        <div class="global-drop-icon">📦</div>
        <div class="global-drop-title">松开以立即载入 AstroDX 谱面包</div>
        <div class="global-drop-sub">
          支持 <b>.adx</b> / <b>.zip</b> 谱面包，或同时拖入 <b>maidata.txt</b> 与音频文件
        </div>
      </div>
    `;
    document.body.appendChild(dropOverlay);

    let dragDepth = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        dropOverlay.classList.remove('hidden');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragDepth--;
      if (dragDepth <= 0) {
        dragDepth = 0;
        dropOverlay.classList.add('hidden');
      }
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragDepth = 0;
      dropOverlay.classList.add('hidden');

      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) {
        return;
      }

      const files = Array.from(e.dataTransfer.files);

      // 1. 优先检查是否包含 .adx 或 .zip 文件
      const adxFile = files.find(f => AdxLoader.isAdxOrZip(f));
      if (adxFile) {
        try {
          const pkg = await AdxLoader.loadFromBlob(adxFile);
          await this.loadAdxPackage(pkg);
        } catch (err: any) {
          alert(`解包 .adx 谱面失败: ${err.message}`);
        }
        return;
      }

      // 2. 检查多文件拖放：包含 .txt 谱面和可选音频与曲绘
      const chartFile = files.find(f => f.name.endsWith('.txt'));
      const audioFile = files.find(f => f.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a)$/i.test(f.name));
      const coverFile = files.find(f => f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(f.name));

      if (chartFile) {
        const chartText = await chartFile.text();
        let coverUrl: string | undefined;
        if (coverFile) {
          coverUrl = URL.createObjectURL(coverFile);
        }
        await this.loadCustomChart(chartText, audioFile, coverUrl, 5);
        this.hud.showToast(`已加载本地谱面文件: ${chartFile.name}`);
      }
    });
  }

  private startStateSyncLoop(): void {
    const update = () => {
      const effectiveDuration = this.currentChart?.duration || this.audio.duration;
      this.console.updatePlaybackState(
        this.audio.isPlaying,
        this.audio.currentTime,
        effectiveDuration
      );

      let currentBpm = this.currentChart?.bpm;
      if (this.currentChart?.bpmEvents) {
        for (const ev of this.currentChart.bpmEvents) {
          if (this.sync.currentTime >= ev.time) {
            currentBpm = ev.bpm;
          }
        }
      }

      this.hud.updateScore(this.judge, currentBpm, this.audio.currentTime, effectiveDuration);
      this.hud.setPlaying(this.audio.isPlaying);
      if (!this.audio.isPlaying && this.console.isGameplayHidden()) {
        this.updateConsoleVisibility();
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  public getInputController(): InputController {
    return this.inputController;
  }

  public get activeDiffSlot(): number {
    return this.currentDiffSlot;
  }
}

// 挂载应用
window.addEventListener('DOMContentLoaded', () => {
  new MaimaiApp();
});
