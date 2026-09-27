import { AstroDxEntry } from '../core/AstroDxService';

export type DownloadStage = 'init' | 'chart' | 'audio' | 'cover' | 'packaging' | 'ready' | 'error';

export interface DownloadModalOptions {
  entry: AstroDxEntry;
  diffSlot?: number;
  diffName?: string;
  diffLevel?: string;
  mode?: 'play' | 'export';
  onAbort?: () => void;
}

export class DownloadModal {
  private overlay: HTMLElement;
  private currentOptions: DownloadModalOptions | null = null;
  private isAborted: boolean = false;

  constructor(parent: HTMLElement = document.body) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'download-modal-overlay hidden';

    this.overlay.innerHTML = `
      <div class="download-modal-dialog">
        <!-- 弹窗顶栏 -->
        <div class="download-modal-header">
          <div class="download-modal-tag" id="dl-header-tag">
            <span class="dl-tag-pulse"></span>
            <span id="dl-modal-title">AstroDX 曲目下载与加载</span>
          </div>
          <button class="download-modal-close" id="btn-dl-close" title="取消">&times;</button>
        </div>

        <!-- 曲目展示区域 -->
        <div class="download-song-hero">
          <div class="download-jacket-wrap">
            <img class="download-jacket-img" id="dl-jacket-img" src="" alt="Jacket" />
            <div class="download-spinner-ring" id="dl-spinner-ring"></div>
            <div class="download-success-check" id="dl-success-check">✓</div>
          </div>
          <div class="download-song-details">
            <div class="download-song-title" id="dl-song-title">曲目名称</div>
            <div class="download-song-artist" id="dl-song-artist">艺术家</div>
            <div class="download-meta-tags">
              <span class="download-tag-genre" id="dl-song-genre">POPS</span>
              <span class="download-tag-bpm" id="dl-song-bpm">BPM -</span>
              <span class="download-tag-diff" id="dl-song-diff">MASTER 12+</span>
            </div>
          </div>
        </div>

        <!-- 下载进度区域 -->
        <div class="download-progress-section">
          <div class="download-progress-stats">
            <span class="download-status-msg" id="dl-status-msg">准备连接加速镜像源...</span>
            <span class="download-status-pct" id="dl-status-pct">0%</span>
          </div>

          <div class="download-progress-bar-wrap">
            <div class="download-progress-bar-fill" id="dl-progress-bar" style="width: 0%;"></div>
            <div class="download-progress-glow"></div>
          </div>

          <!-- 分步加载指示器 -->
          <div class="download-steps">
            <div class="download-step-item" id="step-chart">
              <span class="step-icon" id="icon-step-chart">⏳</span>
              <div class="step-text">
                <span class="step-name">谱面文件 (maidata.txt)</span>
                <span class="step-desc" id="desc-step-chart">等待下载</span>
              </div>
            </div>
            <div class="download-step-item" id="step-audio">
              <span class="step-icon" id="icon-step-audio">⏳</span>
              <div class="step-text">
                <span class="step-name">音频原声 (track.mp3)</span>
                <span class="step-desc" id="desc-step-audio">等待下载</span>
              </div>
            </div>
            <div class="download-step-item" id="step-cover">
              <span class="step-icon" id="icon-step-cover">⏳</span>
              <div class="step-text">
                <span class="step-name">曲绘封面 (bg.png)</span>
                <span class="step-desc" id="desc-step-cover">等待下载</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 错误提示区 -->
        <div class="download-error-box" id="dl-error-box" style="display: none;">
          <span class="error-icon">⚠️</span>
          <span class="error-msg" id="dl-error-msg">下载遇到错误</span>
        </div>

        <!-- 底部信息与操作 -->
        <div class="download-modal-footer">
          <div class="download-mirror-info">
            <span class="mirror-dot"></span>
            <span>节点: Alice / WMC / G510 跨域加速镜像</span>
          </div>
          <div class="download-footer-actions">
            <button class="download-cancel-btn" id="btn-dl-abort">取消</button>
            <button class="download-retry-btn" id="btn-dl-retry" style="display: none;">重试</button>
          </div>
        </div>
      </div>
    `;

    parent.appendChild(this.overlay);
    this.bindEvents();
  }

  private bindEvents(): void {
    const closeBtn = this.overlay.querySelector('#btn-dl-close') as HTMLButtonElement;
    const abortBtn = this.overlay.querySelector('#btn-dl-abort') as HTMLButtonElement;

    const doAbort = () => {
      this.isAborted = true;
      this.currentOptions?.onAbort?.();
      this.close();
    };

    closeBtn.addEventListener('click', doAbort);
    abortBtn.addEventListener('click', doAbort);
  }

  /**
   * 打开下载弹窗并初始化曲目信息展示
   */
  show(options: DownloadModalOptions): void {
    this.currentOptions = options;
    this.isAborted = false;

    const { entry, diffSlot = 5, diffName, diffLevel, mode = 'play' } = options;

    const modalTitle = this.overlay.querySelector('#dl-modal-title') as HTMLElement;
    const jacketImg = this.overlay.querySelector('#dl-jacket-img') as HTMLImageElement;
    const titleEl = this.overlay.querySelector('#dl-song-title') as HTMLElement;
    const artistEl = this.overlay.querySelector('#dl-song-artist') as HTMLElement;
    const genreEl = this.overlay.querySelector('#dl-song-genre') as HTMLElement;
    const bpmEl = this.overlay.querySelector('#dl-song-bpm') as HTMLElement;
    const diffEl = this.overlay.querySelector('#dl-song-diff') as HTMLElement;

    const errorBox = this.overlay.querySelector('#dl-error-box') as HTMLElement;
    const retryBtn = this.overlay.querySelector('#btn-dl-retry') as HTMLElement;
    const abortBtn = this.overlay.querySelector('#btn-dl-abort') as HTMLElement;
    const checkEl = this.overlay.querySelector('#dl-success-check') as HTMLElement;
    const spinnerRing = this.overlay.querySelector('#dl-spinner-ring') as HTMLElement;

    errorBox.style.display = 'none';
    retryBtn.style.display = 'none';
    abortBtn.style.display = 'block';
    checkEl.classList.remove('show');
    spinnerRing.style.display = 'block';

    if (mode === 'export') {
      modalTitle.textContent = '打包并导出 AstroDX 谱面包 (.adx)';
    } else {
      modalTitle.textContent = 'AstroDX 曲目下载中...';
    }

    // 设置曲目封面
    const folder = entry.source_folder || `0/${entry.short_id}`;
    const coverUrl = entry.media?.cover_url || `https://astrodx-charts-alice.saop.cc/${folder}/bg.png`;
    jacketImg.src = coverUrl;
    jacketImg.onerror = () => {
      jacketImg.src = './songs/garakuta/jacket.svg';
    };

    titleEl.textContent = entry.title;
    artistEl.textContent = entry.artist;
    genreEl.textContent = entry.genre || 'POPS';
    bpmEl.textContent = entry.bpm ? `BPM ${entry.bpm}` : 'BPM -';

    // 难度标签展示
    const matchedDiff = entry.difficulties.find(d => d.slot === diffSlot);
    const dName = diffName || matchedDiff?.name || (diffSlot === 5 ? 'MASTER' : 'EXPERT');
    const dLv = diffLevel || matchedDiff?.level || '';
    diffEl.textContent = `${dName} ${dLv}`.trim();

    // 难度颜色类
    diffEl.className = 'download-tag-diff';
    const lowerName = dName.toLowerCase().replace(':', '');
    diffEl.classList.add(`diff-${lowerName}`);

    // 重置进度和步骤状态
    this.resetSteps();
    this.updateProgress('init', 0, '正在连接加速镜像源...');

    this.overlay.classList.remove('hidden');
  }

  private resetSteps(): void {
    const steps: DownloadStage[] = ['chart', 'audio', 'cover'];
    steps.forEach(s => {
      const icon = this.overlay.querySelector(`#icon-step-${s}`) as HTMLElement;
      const desc = this.overlay.querySelector(`#desc-step-${s}`) as HTMLElement;
      const row = this.overlay.querySelector(`#step-${s}`) as HTMLElement;
      if (icon) icon.textContent = '⏳';
      if (desc) desc.textContent = '等待下载';
      if (row) row.className = 'download-step-item';
    });
  }

  /**
   * 阶段进度更新
   */
  updateProgress(stage: DownloadStage, pct: number, message: string): void {
    if (this.isAborted) return;

    const progressBar = this.overlay.querySelector('#dl-progress-bar') as HTMLElement;
    const statusMsg = this.overlay.querySelector('#dl-status-msg') as HTMLElement;
    const statusPct = this.overlay.querySelector('#dl-status-pct') as HTMLElement;

    const clampedPct = Math.min(100, Math.max(0, Math.round(pct)));
    progressBar.style.width = `${clampedPct}%`;
    statusMsg.textContent = message;
    statusPct.textContent = `${clampedPct}%`;

    // 更新各个步骤项的高亮与图标
    const updateStep = (stepId: 'chart' | 'audio' | 'cover', state: 'waiting' | 'active' | 'done') => {
      const row = this.overlay.querySelector(`#step-${stepId}`) as HTMLElement;
      const icon = this.overlay.querySelector(`#icon-step-${stepId}`) as HTMLElement;
      const desc = this.overlay.querySelector(`#desc-step-${stepId}`) as HTMLElement;
      if (!row || !icon || !desc) return;

      if (state === 'done') {
        row.className = 'download-step-item done';
        icon.textContent = '✓';
        desc.textContent = '已完成';
      } else if (state === 'active') {
        row.className = 'download-step-item active';
        icon.textContent = '⚡';
        desc.textContent = '正在下载...';
      } else {
        row.className = 'download-step-item';
        icon.textContent = '⏳';
        desc.textContent = '等待中';
      }
    };

    if (stage === 'chart') {
      updateStep('chart', 'active');
    } else if (stage === 'audio') {
      updateStep('chart', 'done');
      updateStep('audio', 'active');
    } else if (stage === 'cover') {
      updateStep('chart', 'done');
      updateStep('audio', 'done');
      updateStep('cover', 'active');
    } else if (stage === 'ready' || stage === 'packaging') {
      updateStep('chart', 'done');
      updateStep('audio', 'done');
      updateStep('cover', 'done');
    }
  }

  /**
   * 下载成功动画与完成回调
   */
  complete(onDone?: () => void): void {
    const progressBar = this.overlay.querySelector('#dl-progress-bar') as HTMLElement;
    const statusMsg = this.overlay.querySelector('#dl-status-msg') as HTMLElement;
    const statusPct = this.overlay.querySelector('#dl-status-pct') as HTMLElement;
    const checkEl = this.overlay.querySelector('#dl-success-check') as HTMLElement;
    const spinnerRing = this.overlay.querySelector('#dl-spinner-ring') as HTMLElement;
    const abortBtn = this.overlay.querySelector('#btn-dl-abort') as HTMLElement;

    progressBar.style.width = '100%';
    statusPct.textContent = '100%';
    statusMsg.textContent = '✨ 资源装配就绪，正在载入机台！';
    abortBtn.style.display = 'none';

    spinnerRing.style.display = 'none';
    checkEl.classList.add('show');

    setTimeout(() => {
      this.close();
      onDone?.();
    }, 700);
  }

  /**
   * 发生错误时展示错误信息
   */
  error(errMsg: string, onRetry?: () => void): void {
    const errorBox = this.overlay.querySelector('#dl-error-box') as HTMLElement;
    const errorMsg = this.overlay.querySelector('#dl-error-msg') as HTMLElement;
    const retryBtn = this.overlay.querySelector('#btn-dl-retry') as HTMLElement;
    const abortBtn = this.overlay.querySelector('#btn-dl-abort') as HTMLElement;
    const spinnerRing = this.overlay.querySelector('#dl-spinner-ring') as HTMLElement;

    spinnerRing.style.display = 'none';
    errorBox.style.display = 'flex';
    errorMsg.textContent = errMsg;

    if (onRetry) {
      retryBtn.style.display = 'block';
      retryBtn.onclick = () => {
        errorBox.style.display = 'none';
        retryBtn.style.display = 'none';
        onRetry();
      };
    }

    abortBtn.textContent = '关闭';
  }

  close(): void {
    this.overlay.classList.add('hidden');
  }

  isOpen(): boolean {
    return !this.overlay.classList.contains('hidden');
  }
}
