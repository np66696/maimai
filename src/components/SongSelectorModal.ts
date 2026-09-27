import { AstroDxService, AstroDxEntry } from '../core/AstroDxService';
import { AdxLoader, LoadedAdxPackage } from '../core/AdxLoader';
import { DownloadModal } from './DownloadModal';
import { ChartLibraryService, SavedSongItem } from '../core/ChartLibraryService';
import { escapeHtml } from '../utils/security';

export interface SongItem {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  jacketUrl: string;
  audioUrl?: string;
  chartUrl?: string;
  difficulties: { name: string; level: string; inoteKey: number }[];
}

export interface SongModalCallbacks {
  onSelectSong: (song: SongItem, difficultyIndex: number) => void;
  onCustomChartLoaded: (chartText: string, audioSource?: File | Blob, coverUrl?: string, diffIndex?: number) => void;
  onAdxPackageLoaded?: (pkg: LoadedAdxPackage) => void;
}

export class SongSelectorModal {
  private overlay: HTMLElement;
  private callbacks: SongModalCallbacks;
  private presetSongs: SongItem[] = [];
  private astroService = AstroDxService.getInstance();
  private libraryService = ChartLibraryService.getInstance();
  private downloadModal: DownloadModal;

  private librarySongs: SavedSongItem[] = [];
  private librarySearchKeyword: string = '';
  private librarySortBy: 'time-desc' | 'title-asc' | 'bpm-desc' | 'size-desc' = 'time-desc';
  private libObjectUrls: string[] = [];

  private searchKeyword: string = '';
  private selectedGenre: string = 'all';
  private selectedVersion: string = 'all';
  private selectedLevelRange: string = 'all';

  private isDownloading: boolean = false;

  constructor(parent: HTMLElement, presetSongs: SongItem[], callbacks: SongModalCallbacks) {
    this.presetSongs = presetSongs;
    this.callbacks = callbacks;

    this.overlay = document.createElement('div');
    this.overlay.className = 'song-modal-overlay hidden';
    this.downloadModal = new DownloadModal(parent);

    this.overlay.innerHTML = `
      <div class="song-modal-dialog">
        <!-- 弹窗顶栏 -->
        <div class="song-modal-header">
          <div class="song-modal-tabs">
            <button class="modal-tab-btn active" data-tab="library">💾 已下载曲库 (<span id="tab-library-count">0</span>)</button>
            <button class="modal-tab-btn" data-tab="astrodx">🌐 AstroDX 在线曲库 (1900+ 曲目)</button>
            <button class="modal-tab-btn" data-tab="preset">🎵 内置经典曲目</button>
            <button class="modal-tab-btn" data-tab="custom">📂 本地谱面导入</button>
          </div>
          <button class="song-modal-close" id="modal-close" title="关闭">&times;</button>
        </div>

        <!-- 弹窗主体内容区 -->
        <div class="song-modal-body">
          <!-- 状态通知浮层 -->
          <div class="modal-status-bar" id="modal-status-bar" style="display: none;">
            <div class="status-spinner"></div>
            <span class="status-msg" id="status-msg">正在加载...</span>
          </div>

          <!-- TAB 0: 已下载曲库管理系统 -->
          <div class="tab-pane active" id="tab-library">
            <div class="library-toolbar">
              <div class="search-input-wrap flex-1">
                <span class="search-icon">🔍</span>
                <input
                  type="text"
                  class="astrodx-search-input"
                  id="library-search"
                  placeholder="搜索已下载的曲名、曲师、流派..."
                />
                <button class="clear-search-btn" id="btn-clear-lib-search" style="display: none;">✕</button>
              </div>

              <div class="filters-row">
                <div class="filter-group">
                  <label>排序:</label>
                  <select class="flank-select-mini" id="library-sort">
                    <option value="time-desc">最新添加优先</option>
                    <option value="title-asc">曲名 (A-Z)</option>
                    <option value="bpm-desc">BPM (从高到低)</option>
                    <option value="size-desc">占用空间 (从大到小)</option>
                  </select>
                </div>

                <div class="library-stats-badge" id="library-stats">
                  已保存 0 首 (0 B)
                </div>

                <button class="library-danger-btn" id="btn-clear-library" title="清空所有已下载曲目">
                  🗑️ 清空曲库
                </button>
              </div>
            </div>

            <!-- 曲库卡片列表 -->
            <div class="library-grid" id="library-grid">
              <div class="grid-loading">正在读取本地曲库...</div>
            </div>
          </div>

          <!-- TAB 1: AstroDX 在线曲库 -->
          <div class="tab-pane" id="tab-astrodx">
            <!-- 搜索与筛选工具栏 -->
            <div class="astrodx-toolbar">
              <div class="search-input-wrap">
                <span class="search-icon">🔍</span>
                <input
                  type="text"
                  class="astrodx-search-input"
                  id="astrodx-search"
                  placeholder="搜索曲名、曲师、版本、或社区别名 (如: 告诉你的世界 / gdp / 潘多拉)..."
                />
                <button class="clear-search-btn" id="btn-clear-search" style="display: none;">✕</button>
              </div>

              <div class="filters-row">
                <div class="filter-group">
                  <label>流派:</label>
                  <select class="flank-select-mini" id="filter-genre">
                    <option value="all">全部流派</option>
                  </select>
                </div>

                <div class="filter-group">
                  <label>版本:</label>
                  <select class="flank-select-mini" id="filter-version">
                    <option value="all">全部版本</option>
                  </select>
                </div>

                <div class="filter-group">
                  <label>等级:</label>
                  <select class="flank-select-mini" id="filter-level">
                    <option value="all">全部等级</option>
                    <option value="1-7">1 ~ 7 (入门)</option>
                    <option value="8-10">8 ~ 10 (进阶)</option>
                    <option value="11-12">11 ~ 12 (高手)</option>
                    <option value="13-13.9">13 ~ 13+ (大师)</option>
                    <option value="14-15">14 ~ 15 (极限)</option>
                  </select>
                </div>

                <div class="results-count" id="results-count">加载中...</div>
              </div>
            </div>

            <!-- 曲目卡片瀑布流 -->
            <div class="astrodx-grid" id="astrodx-grid">
              <div class="grid-loading">正在拉取 AstroDX 曲库目录...</div>
            </div>
          </div>

          <!-- TAB 2: 内置经典曲目 -->
          <div class="tab-pane" id="tab-preset">
            <div class="song-section-title">内置经典街机代表曲目</div>
            <div class="song-grid" id="preset-grid"></div>
          </div>

          <!-- TAB 3: 本地自定义导入 -->
          <div class="tab-pane" id="tab-custom">
            <div class="custom-import-box">
              <div class="drop-zone" id="drop-zone">
                <div class="drop-zone-icon">📦</div>
                <p class="drop-zone-title">拖拽 <b>.adx</b> 谱面包，或 <b>maidata.txt</b> 与 <b>track.mp3</b> 到此处即可自动加载</p>
                <p class="drop-zone-sub">支持 AstroDX 标准 .adx 及普通 Zip 格式，自动识别谱面、音乐及曲绘封面</p>
                <div class="file-input-row">
                  <label class="custom-file-label primary-label">
                    📦 选择 AstroDX 谱面包 (.adx / .zip)
                    <input type="file" id="adx-file-input" accept=".adx,.zip" style="display: none;" />
                  </label>
                  <label class="custom-file-label">
                    📄 选择谱面 (.txt)
                    <input type="file" id="chart-file-input" accept=".txt" style="display: none;" />
                  </label>
                  <label class="custom-file-label">
                    🎵 选择音频 (.mp3/.ogg/.wav)
                    <input type="file" id="audio-file-input" accept="audio/*" style="display: none;" />
                  </label>
                </div>
              </div>

              <div class="paste-zone">
                <textarea id="simai-paste-area" placeholder="或在此直接粘贴 Simai 格式代码 (&inote_...)..."></textarea>
                <button class="console-btn active full-width" id="btn-parse-paste">⚡ 即时解析并开始播放</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    parent.appendChild(this.overlay);

    this.bindEvents();
    this.renderPresetCards();
    this.initAstroDxCatalog();
    this.initLibrary();
  }

  private initLibrary(): void {
    this.libraryService.onLibraryChange(() => {
      this.refreshLibrary();
    });
    this.refreshLibrary();
  }

  private bindEvents(): void {
    // 选项卡切换
    const tabs = this.overlay.querySelectorAll('.modal-tab-btn');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-tab') as 'library' | 'astrodx' | 'preset' | 'custom';
        this.switchTab(target);
      });
    });

    // 关闭弹窗
    const closeBtn = this.overlay.querySelector('#modal-close')!;
    closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // 本地曲库搜索与筛选
    const libSearchInput = this.overlay.querySelector('#library-search') as HTMLInputElement;
    const libClearBtn = this.overlay.querySelector('#btn-clear-lib-search') as HTMLButtonElement;
    let libDebounce: any = null;

    libSearchInput?.addEventListener('input', () => {
      this.librarySearchKeyword = libSearchInput.value.trim();
      libClearBtn.style.display = this.librarySearchKeyword ? 'block' : 'none';
      clearTimeout(libDebounce);
      libDebounce = setTimeout(() => {
        this.renderLibraryCards();
      }, 200);
    });

    libClearBtn?.addEventListener('click', () => {
      libSearchInput.value = '';
      this.librarySearchKeyword = '';
      libClearBtn.style.display = 'none';
      this.renderLibraryCards();
    });

    const libSortSelect = this.overlay.querySelector('#library-sort') as HTMLSelectElement;
    libSortSelect?.addEventListener('change', () => {
      this.librarySortBy = libSortSelect.value as any;
      this.renderLibraryCards();
    });

    const clearLibBtn = this.overlay.querySelector('#btn-clear-library') as HTMLButtonElement;
    clearLibBtn?.addEventListener('click', async () => {
      if (this.librarySongs.length === 0) return;
      if (confirm(`确定要清空全部 ${this.librarySongs.length} 首已下载曲目吗？此操作无法撤销。`)) {
        await this.libraryService.clearAll();
      }
    });

    // 搜索输入防抖
    const searchInput = this.overlay.querySelector('#astrodx-search') as HTMLInputElement;
    const clearBtn = this.overlay.querySelector('#btn-clear-search') as HTMLButtonElement;
    let debounceTimer: any = null;

    searchInput.addEventListener('input', () => {
      this.searchKeyword = searchInput.value;
      clearBtn.style.display = this.searchKeyword ? 'block' : 'none';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.renderAstroDxCards();
      }, 250);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      this.searchKeyword = '';
      clearBtn.style.display = 'none';
      this.renderAstroDxCards();
    });

    // 筛选变动
    const genreSelect = this.overlay.querySelector('#filter-genre') as HTMLSelectElement;
    genreSelect.addEventListener('change', () => {
      this.selectedGenre = genreSelect.value;
      this.renderAstroDxCards();
    });

    const versionSelect = this.overlay.querySelector('#filter-version') as HTMLSelectElement;
    versionSelect.addEventListener('change', () => {
      this.selectedVersion = versionSelect.value;
      this.renderAstroDxCards();
    });

    const levelSelect = this.overlay.querySelector('#filter-level') as HTMLSelectElement;
    levelSelect.addEventListener('change', () => {
      this.selectedLevelRange = levelSelect.value;
      this.renderAstroDxCards();
    });

    // 本地导入事件绑定
    this.bindCustomImportEvents();
  }

  private switchTab(tab: 'library' | 'astrodx' | 'preset' | 'custom'): void {
    this.overlay.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    const targetPane = this.overlay.querySelector(`#tab-${tab}`);
    if (targetPane) {
      targetPane.classList.add('active');
    }
    if (tab === 'library') {
      this.refreshLibrary();
    }
  }

  private async refreshLibrary(): Promise<void> {
    try {
      this.librarySongs = await this.libraryService.getAllSongs();
      const countEl = this.overlay.querySelector('#tab-library-count');
      if (countEl) countEl.textContent = this.librarySongs.length.toString();

      const stats = await this.libraryService.getStats();
      const statsEl = this.overlay.querySelector('#library-stats');
      if (statsEl) {
        statsEl.textContent = `已保存 ${stats.count} 首 (${ChartLibraryService.formatBytes(stats.totalBytes)})`;
      }

      this.renderLibraryCards();
      // 同步更新 AstroDX 在线卡片上的「已保存在曲库」状态
      this.renderAstroDxCards();
    } catch (e) {
      console.error('刷新本地曲库失败:', e);
    }
  }

  private cleanupLibObjectUrls(): void {
    for (const url of this.libObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.libObjectUrls = [];
  }

  private renderLibraryCards(): void {
    const grid = this.overlay.querySelector('#library-grid') as HTMLElement;
    if (!grid) return;

    this.cleanupLibObjectUrls();
    grid.innerHTML = '';

    if (this.librarySongs.length === 0) {
      grid.innerHTML = `
        <div class="library-empty-box">
          <div class="lib-empty-icon">💿</div>
          <div class="lib-empty-title">本地已下载曲库暂无曲目</div>
          <div class="lib-empty-sub">
            在「🌐 AstroDX 在线曲库」点击试玩，或将 <b>.adx</b> 谱面包拖入窗口，即可将谱面永久保存至本地。<br/>
            数据存储在浏览器本地数据库中，离线可用且不耗流量！
          </div>
          <button class="flank-btn flank-btn-primary lib-goto-astro" id="btn-goto-astro">
            🌐 前往 AstroDX 在线曲库挑选曲目
          </button>
        </div>
      `;

      grid.querySelector('#btn-goto-astro')?.addEventListener('click', () => {
        const astroTabBtn = this.overlay.querySelector('.modal-tab-btn[data-tab="astrodx"]') as HTMLButtonElement;
        astroTabBtn?.click();
      });
      return;
    }

    // 搜索过滤
    let filtered = this.librarySongs;
    if (this.librarySearchKeyword) {
      const kw = this.librarySearchKeyword.toLowerCase();
      filtered = filtered.filter(s =>
        s.title.toLowerCase().includes(kw) ||
        s.artist.toLowerCase().includes(kw) ||
        (s.genre && s.genre.toLowerCase().includes(kw))
      );
    }

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="grid-empty">未找到匹配「${escapeHtml(this.librarySearchKeyword)}」的已保存曲目</div>`;
      return;
    }

    // 排序
    const sorted = [...filtered].sort((a, b) => {
      switch (this.librarySortBy) {
        case 'time-desc':
          return (b.addedAt || 0) - (a.addedAt || 0);
        case 'title-asc':
          return a.title.localeCompare(b.title);
        case 'bpm-desc':
          return (b.bpm || 0) - (a.bpm || 0);
        case 'size-desc':
          return (b.fileSize || 0) - (a.fileSize || 0);
        default:
          return 0;
      }
    });

    for (const song of sorted) {
      const card = document.createElement('div');
      card.className = 'adx-card library-card';

      let coverUrl = './songs/garakuta/jacket.svg';
      if (song.coverBlob) {
        coverUrl = URL.createObjectURL(song.coverBlob);
        this.libObjectUrls.push(coverUrl);
      }

      const sourceTagMap: Record<string, { label: string; cls: string }> = {
        astrodx: { label: 'AstroDX', cls: 'source-astrodx' },
        adx_file: { label: '.adx 导入', cls: 'source-adx' },
        custom: { label: '自定义', cls: 'source-custom' }
      };
      const sourceInfo = sourceTagMap[song.source] || { label: '本地', cls: 'source-local' };

      const dateStr = song.addedAt
        ? new Date(song.addedAt).toLocaleDateString()
        : '';

      const safeTitle = escapeHtml(song.title);
      const safeArtist = escapeHtml(song.artist);
      const safeGenre = escapeHtml(song.genre || 'ORIGINAL');

      card.innerHTML = `
        <div class="adx-card-jacket">
          <img src="${coverUrl}" loading="lazy" onerror="this.src='./songs/garakuta/jacket.svg'" alt="${safeTitle}" />
          <span class="lib-source-tag ${sourceInfo.cls}">${sourceInfo.label}</span>
        </div>
        <div class="adx-card-info">
          <div class="lib-card-header">
            <div class="adx-card-title" title="${safeTitle}">${safeTitle}</div>
            <span class="lib-card-size">${ChartLibraryService.formatBytes(song.fileSize)}</span>
          </div>
          <div class="adx-card-artist" title="${safeArtist}">${safeArtist}</div>
          <div class="adx-card-meta">
            <span class="adx-genre-tag">${safeGenre}</span>
            <span class="adx-bpm-tag">BPM ${song.bpm || '-'}</span>
            ${dateStr ? `<span class="lib-date-tag">${escapeHtml(dateStr)}</span>` : ''}
          </div>

          <!-- 难度按钮选择栏 -->
          <div class="adx-diff-row">
            ${song.difficulties.map(d => `
              <button class="adx-diff-btn diff-${escapeHtml(d.name.toLowerCase().replace(':', ''))}" data-slot="${d.slot}" title="${escapeHtml(d.name)} ${escapeHtml(d.level)}">
                <span class="diff-name">${escapeHtml(d.name.slice(0, 3))}</span>
                <span class="diff-lv">${escapeHtml(d.level)}</span>
              </button>
            `).join('')}
          </div>

          <!-- 操作按钮栏 -->
          <div class="adx-actions-row">
            <button class="adx-action-btn btn-play-online btn-play-local" id="lib-play-${song.id}">
              ▶ 立即游玩
            </button>
            <button class="adx-action-btn btn-download-zip" id="lib-export-${song.id}" title="打包导出为 AstroDX .adx 格式文件">
              📦 导出 .adx
            </button>
            <button class="adx-action-btn btn-delete-item" id="lib-del-${song.id}" title="从本地曲库删除">
              🗑️
            </button>
          </div>
        </div>
      `;

      // 绑定一键游玩
      const playBtn = card.querySelector(`#lib-play-${song.id}`) as HTMLButtonElement;
      playBtn?.addEventListener('click', () => {
        this.handlePlaySavedSong(song, song.defaultSlot || 5);
      });

      // 绑定各个难度槽位直接开玩
      card.querySelectorAll('.adx-diff-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const slot = parseInt((e.currentTarget as HTMLElement).getAttribute('data-slot') || '5');
          this.handlePlaySavedSong(song, slot);
        });
      });

      // 绑定导出 .adx
      const exportBtn = card.querySelector(`#lib-export-${song.id}`) as HTMLButtonElement;
      exportBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.handleExportSavedSong(song);
      });

      // 绑定删除
      const delBtn = card.querySelector(`#lib-del-${song.id}`) as HTMLButtonElement;
      delBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`确定要从本地曲库删除 [${song.title}] 吗？`)) {
          await this.libraryService.deleteSong(song.id);
        }
      });

      grid.appendChild(card);
    }
  }

  private handlePlaySavedSong(song: SavedSongItem, slot: number): void {
    let coverUrl: string | undefined;
    if (song.coverBlob) {
      coverUrl = URL.createObjectURL(song.coverBlob);
    }
    this.close();
    this.callbacks.onCustomChartLoaded(
      song.maidataText,
      song.audioBlob,
      coverUrl,
      slot
    );
  }

  private async handleExportSavedSong(song: SavedSongItem): Promise<void> {
    try {
      const zipBlob = await this.libraryService.exportAdxZip(song);
      const safeTitle = song.title.replace(/[\\/:*?"<>|]/g, '_');
      const fileName = `${(song.shortId || '000000').padStart(6, '0')} ${safeTitle}.adx`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`导出 .adx 失败: ${err.message}`);
    }
  }

  private async initAstroDxCatalog(): Promise<void> {
    const statusBar = this.overlay.querySelector('#modal-status-bar') as HTMLElement;
    const statusMsg = this.overlay.querySelector('#status-msg') as HTMLElement;

    try {
      statusBar.style.display = 'flex';
      statusMsg.textContent = '正在获取 AstroDX 在线曲库数据...';

      await this.astroService.loadCatalog((msg) => {
        statusMsg.textContent = msg;
      });

      // 初始化筛选下拉选项
      const meta = this.astroService.getFiltersMetadata();
      const genreSelect = this.overlay.querySelector('#filter-genre') as HTMLSelectElement;
      const versionSelect = this.overlay.querySelector('#filter-version') as HTMLSelectElement;

      meta.genres.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        genreSelect.appendChild(opt);
      });

      meta.versions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        versionSelect.appendChild(opt);
      });

      statusBar.style.display = 'none';
      this.renderAstroDxCards();
    } catch (e: any) {
      statusMsg.textContent = `曲库拉取失败: ${e.message}`;
      setTimeout(() => {
        statusBar.style.display = 'none';
      }, 3000);
      this.renderAstroDxCards();
    }
  }

  private renderAstroDxCards(): void {
    const grid = this.overlay.querySelector('#astrodx-grid') as HTMLElement;
    const countEl = this.overlay.querySelector('#results-count') as HTMLElement;
    if (!grid || !countEl) return;

    let minLevel: number | undefined;
    let maxLevel: number | undefined;
    if (this.selectedLevelRange === '1-7') { minLevel = 1; maxLevel = 7.9; }
    else if (this.selectedLevelRange === '8-10') { minLevel = 8; maxLevel = 10.9; }
    else if (this.selectedLevelRange === '11-12') { minLevel = 11; maxLevel = 12.9; }
    else if (this.selectedLevelRange === '13-13.9') { minLevel = 13; maxLevel = 13.9; }
    else if (this.selectedLevelRange === '14-15') { minLevel = 14; maxLevel = 15.0; }

    const results = this.astroService.search(this.searchKeyword, {
      genre: this.selectedGenre,
      version: this.selectedVersion,
      minLevel,
      maxLevel
    });

    countEl.textContent = `共找到 ${results.length} 首曲目`;
    grid.innerHTML = '';

    if (results.length === 0) {
      grid.innerHTML = `<div class="grid-empty">未找到匹配的曲目，请尝试其他关键词或别名</div>`;
      return;
    }

    // 限制首批渲染至最多 80 首以确保极致流畅度
    const displayList = results.slice(0, 80);
    const savedIds = new Set(this.librarySongs.map(s => s.id));

    for (const entry of displayList) {
      const card = document.createElement('div');
      card.className = 'adx-card';

      const folder = entry.source_folder || `0/${entry.short_id}`;
      // 曲绘缩略图地址
      const coverUrl = entry.media?.cover_url || `https://astrodx-charts-alice.saop.cc/${folder}/bg.png`;
      const isSaved = savedIds.has(`astrodx_${entry.short_id}`);

      const safeTitle = escapeHtml(entry.title);
      const safeArtist = escapeHtml(entry.artist);
      const safeGenre = escapeHtml(entry.genre);
      const safeVersion = escapeHtml(entry.version);

      card.innerHTML = `
        <div class="adx-card-jacket">
          <img src="${coverUrl}" loading="lazy" onerror="this.src='./songs/garakuta/jacket.svg'" alt="${safeTitle}" />
          <span class="adx-version-badge">${safeVersion}</span>
          ${isSaved ? `<span class="adx-saved-badge">✅ 已保存在曲库</span>` : ''}
        </div>
        <div class="adx-card-info">
          <div class="adx-card-title" title="${safeTitle}">${safeTitle}</div>
          <div class="adx-card-artist" title="${safeArtist}">${safeArtist}</div>
          <div class="adx-card-meta">
            <span class="adx-genre-tag">${safeGenre}</span>
            <span class="adx-bpm-tag">BPM ${entry.bpm || '-'}</span>
          </div>

          <!-- 难度按钮选择栏 -->
          <div class="adx-diff-row">
            ${entry.difficulties.map(d => `
              <button class="adx-diff-btn diff-${escapeHtml(d.name.toLowerCase().replace(':', ''))}" data-slot="${d.slot}" title="${escapeHtml(d.name)} (${escapeHtml(d.designer || '-')})">
                <span class="diff-name">${escapeHtml(d.name.slice(0, 3))}</span>
                <span class="diff-lv">${escapeHtml(d.level)}</span>
              </button>
            `).join('')}
          </div>

          <!-- 操作按钮栏 -->
          <div class="adx-actions-row">
            <button class="adx-action-btn ${isSaved ? 'btn-play-online btn-play-saved' : 'btn-play-online'}" id="adx-play-${entry.id}">
              ${isSaved ? '▶ 立即游玩 (本地秒启)' : '▶ 一键下载并试玩'}
            </button>
            <button class="adx-action-btn btn-download-zip" id="adx-zip-${entry.id}" title="打包下载为 AstroDX .adx 谱面包">
              📦 导出 .adx
            </button>
          </div>
        </div>
      `;

      // 绑定一键在线下载并试玩 / 本地秒开
      const playBtn = card.querySelector(`#adx-play-${entry.id}`) as HTMLButtonElement;
      playBtn.addEventListener('click', async () => {
        if (this.isDownloading) return;
        await this.handleAstroDxPlay(entry, 5); // 默认加载 Master 槽位 (5)
      });

      // 绑定单独难度点击试玩
      card.querySelectorAll('.adx-diff-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (this.isDownloading) return;
          const slot = parseInt((e.currentTarget as HTMLElement).getAttribute('data-slot') || '5');
          await this.handleAstroDxPlay(entry, slot);
        });
      });

      // 绑定导出 .adx 压缩包
      const zipBtn = card.querySelector(`#adx-zip-${entry.id}`) as HTMLButtonElement;
      zipBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.handleExportAdxZip(entry);
      });

      grid.appendChild(card);
    }
  }

  /**
   * 处理 AstroDX 在线下载并装载到游戏引擎
   */
  private async handleAstroDxPlay(entry: AstroDxEntry, diffSlot: number): Promise<void> {
    try {
      // 1. 优先检查本地是否已经下载过该曲目 (实现零延迟秒启)
      const songId = `astrodx_${entry.short_id}`;
      const existing = await this.libraryService.getSong(songId);
      if (existing) {
        this.handlePlaySavedSong(existing, diffSlot);
        return;
      }

      this.isDownloading = true;

      // 提取目标难度信息
      const matchedDiff = entry.difficulties.find(d => d.slot === diffSlot);
      const diffName = matchedDiff?.name || (diffSlot === 5 ? 'MASTER' : 'EXPERT');
      const diffLevel = matchedDiff?.level || '';

      // 弹出下载进度弹窗
      this.downloadModal.show({
        entry,
        diffSlot,
        diffName,
        diffLevel,
        mode: 'play',
        onAbort: () => {
          this.isDownloading = false;
        }
      });

      // 拉取数据并向弹窗实时反馈进度与阶段
      const pkg = await this.astroService.fetchChartPackage(entry, (msg, pct, stage) => {
        this.downloadModal.updateProgress(stage, pct, msg);
      });

      // 自动保存至本地 IndexedDB 曲库
      const savedItem: SavedSongItem = {
        id: songId,
        shortId: entry.short_id,
        source: 'astrodx',
        title: entry.title,
        artist: entry.artist,
        bpm: entry.bpm || 0,
        genre: entry.genre || 'ORIGINAL',
        version: entry.version || 'PRiSM',
        maidataText: pkg.maidataText,
        audioBlob: pkg.audioBlob,
        coverBlob: pkg.coverBlob,
        difficulties: entry.difficulties.map(d => ({
          slot: d.slot,
          name: d.name,
          level: d.level,
          inoteKey: d.slot
        })),
        defaultSlot: diffSlot,
        addedAt: Date.now(),
        fileSize: (pkg.audioBlob?.size || 0) + pkg.maidataText.length + (pkg.coverBlob?.size || 0)
      };
      await this.libraryService.saveSong(savedItem);

      // 下载并装配就绪：弹窗展示完成动画后无缝过渡至游戏界面并开始试玩
      this.downloadModal.complete(() => {
        this.close();
        this.callbacks.onCustomChartLoaded(
          pkg.maidataText,
          pkg.audioBlob,
          pkg.coverUrl,
          diffSlot
        );
      });
    } catch (err: any) {
      this.downloadModal.error(`曲目资源下载失败: ${err.message}`, () => {
        this.handleAstroDxPlay(entry, diffSlot);
      });
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * 打包下载为 AstroDX .adx 格式
   */
  private async handleExportAdxZip(entry: AstroDxEntry): Promise<void> {
    try {
      this.downloadModal.show({
        entry,
        mode: 'export',
        onAbort: () => {}
      });

      const zipBlob = await this.astroService.exportAdxZip(entry, (msg, pct, stage) => {
        this.downloadModal.updateProgress(stage, pct, msg);
      });

      // 触发浏览器另存为
      const fileName = `${entry.short_id.padStart(6, '0')} ${entry.title.replace(/[\\/:*?"<>|]/g, '_')}.adx`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.downloadModal.complete();
    } catch (err: any) {
      this.downloadModal.error(`打包失败: ${err.message}`, () => {
        this.handleExportAdxZip(entry);
      });
    }
  }

  private renderPresetCards(): void {
    const grid = this.overlay.querySelector('#preset-grid')!;
    grid.innerHTML = '';

    for (const song of this.presetSongs) {
      const card = document.createElement('div');
      card.className = 'song-card';
      const safeTitle = escapeHtml(song.title);
      const safeArtist = escapeHtml(song.artist);

      card.innerHTML = `
        <div class="song-card-jacket">
          <img src="${song.jacketUrl}" alt="${safeTitle}" />
        </div>
        <div class="song-card-details">
          <div class="song-card-title">${safeTitle}</div>
          <div class="song-card-artist">${safeArtist}</div>
          <div class="song-card-bpm">BPM ${song.bpm}</div>
          <div class="song-card-diffs">
            ${song.difficulties
              .map(
                d => `
                <button class="diff-btn diff-${escapeHtml(d.name.toLowerCase().replace(':', ''))}" data-diff="${d.inoteKey}">
                  ${escapeHtml(d.name)} ${escapeHtml(d.level)}
                </button>
              `
              )
              .join('')}
          </div>
        </div>
      `;

      card.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const inoteKey = parseInt((e.currentTarget as HTMLElement).getAttribute('data-diff') || '5');
          this.callbacks.onSelectSong(song, inoteKey);
          this.close();
        });
      });

      grid.appendChild(card);
    }
  }

  private bindCustomImportEvents(): void {
    const dropZone = this.overlay.querySelector('#drop-zone')!;
    const adxInput = this.overlay.querySelector('#adx-file-input') as HTMLInputElement;
    const chartInput = this.overlay.querySelector('#chart-file-input') as HTMLInputElement;
    const audioInput = this.overlay.querySelector('#audio-file-input') as HTMLInputElement;
    const pasteArea = this.overlay.querySelector('#simai-paste-area') as HTMLTextAreaElement;
    const parseBtn = this.overlay.querySelector('#btn-parse-paste')!;

    let loadedChartText: string | null = null;
    let loadedAudioFile: File | undefined = undefined;

    const handleAdxFile = async (file: File | Blob) => {
      const statusBar = this.overlay.querySelector('#modal-status-bar') as HTMLElement;
      const statusMsg = this.overlay.querySelector('#status-msg') as HTMLElement;
      try {
        statusBar.style.display = 'flex';
        statusMsg.textContent = '正在解包 AstroDX 谱面...';
        const pkg = await AdxLoader.loadFromBlob(file);

        // 自动保存至本地曲库
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
          await this.libraryService.saveSong(savedItem);
        }

        statusBar.style.display = 'none';
        this.close();

        if (this.callbacks.onAdxPackageLoaded) {
          this.callbacks.onAdxPackageLoaded(pkg);
        } else {
          this.callbacks.onCustomChartLoaded(pkg.maidataText, pkg.audioBlob, pkg.coverUrl, pkg.defaultSlot);
        }
      } catch (err: any) {
        statusBar.style.display = 'none';
        alert(`加载 .adx 谱面包失败: ${err.message}`);
      }
    };

    const tryLoad = () => {
      if (loadedChartText) {
        this.callbacks.onCustomChartLoaded(loadedChartText, loadedAudioFile, undefined, 5);
        this.close();
      }
    };

    adxInput.addEventListener('change', async () => {
      if (adxInput.files && adxInput.files[0]) {
        await handleAdxFile(adxInput.files[0]);
      }
    });

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e: any) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');

      const files = Array.from(e.dataTransfer.files) as File[];
      
      // 优先检测 .adx / .zip 谱面包
      const adxFile = files.find(f => AdxLoader.isAdxOrZip(f));
      if (adxFile) {
        await handleAdxFile(adxFile);
        return;
      }

      for (const file of files) {
        if (file.name.endsWith('.txt')) {
          loadedChartText = await file.text();
        } else if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|ogg|wav)$/i)) {
          loadedAudioFile = file;
        }
      }

      if (loadedChartText) {
        tryLoad();
      }
    });

    chartInput.addEventListener('change', async () => {
      if (chartInput.files && chartInput.files[0]) {
        loadedChartText = await chartInput.files[0].text();
        tryLoad();
      }
    });

    audioInput.addEventListener('change', () => {
      if (audioInput.files && audioInput.files[0]) {
        loadedAudioFile = audioInput.files[0];
        tryLoad();
      }
    });

    parseBtn.addEventListener('click', () => {
      const text = pasteArea.value.trim();
      if (text) {
        this.callbacks.onCustomChartLoaded(text, undefined, undefined, 5);
        this.close();
      }
    });
  }

  open(initialTab?: 'library' | 'astrodx' | 'preset' | 'custom'): void {
    this.overlay.classList.remove('hidden');
    let target = initialTab;
    if (!target) {
      target = this.librarySongs.length > 0 ? 'library' : 'astrodx';
    }
    const targetBtn = this.overlay.querySelector(`.modal-tab-btn[data-tab="${target}"]`) as HTMLButtonElement;
    if (targetBtn) {
      this.overlay.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
      this.switchTab(target);
    }
    this.refreshLibrary();
  }

  close(): void {
    this.overlay.classList.add('hidden');
  }
}
