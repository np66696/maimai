import { KeybindManager } from '../core/KeybindManager';

export class KeybindModal {
  private container: HTMLElement;
  private listeningLane: number | null = null;
  private keybindManager = KeybindManager.getInstance();

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'keybind-modal-backdrop';
    this.container.style.display = 'none';

    this.render();
    parent.appendChild(this.container);

    this.bindEvents();
    this.keybindManager.subscribe(() => this.updateButtonLabels());
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="keybind-modal-dialog">
        <div class="keybind-modal-header">
          <div class="keybind-title">⌨️ 街机按键键位自定义</div>
          <button class="keybind-close-btn" id="kb-btn-close">✕</button>
        </div>
        <div class="keybind-modal-body">
          <p class="keybind-hint">点击下方任意机台按键，然后按下键盘上的目标按键即可完成重映射：</p>
          
          <div class="keybind-arcade-circle">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(lane => `
              <button class="keybind-lane-btn" data-lane="${lane}" id="kb-lane-${lane}">
                <span class="lane-num">#${lane}</span>
                <span class="lane-key">${this.keybindManager.getDisplayLabel(lane)}</span>
              </button>
            `).join('')}
            <div class="keybind-center-status" id="kb-status-text">点击机台键进行修改</div>
          </div>

          <div class="keybind-tip-box">
            💡 支持任意字母、数字、方向键及小键盘数字（小键盘默认按 9,6,3,2,1,4,7,8 对应 1~8 键）。机台按键上将实时同步显示键位标记！
          </div>
        </div>

        <div class="keybind-modal-footer">
          <button class="console-btn" id="kb-btn-reset">↺ 恢复默认键位 (W-E-D-C-X-Z-A-Q)</button>
          <button class="console-btn active" id="kb-btn-confirm">完成</button>
        </div>
      </div>
    `;
  }

  private updateButtonLabels(): void {
    for (let lane = 1; lane <= 8; lane++) {
      const btn = this.container.querySelector(`#kb-lane-${lane}`);
      if (btn) {
        const keyEl = btn.querySelector('.lane-key');
        if (keyEl) {
          keyEl.textContent = this.keybindManager.getDisplayLabel(lane);
        }
      }
    }
  }

  private bindEvents(): void {
    // 监听 8 个按键点击
    const laneBtns = this.container.querySelectorAll('.keybind-lane-btn');
    const statusText = this.container.querySelector('#kb-status-text') as HTMLElement;

    laneBtns.forEach(el => {
      el.addEventListener('click', (e) => {
        const lane = parseInt((e.currentTarget as HTMLElement).getAttribute('data-lane') || '1');
        this.listeningLane = lane;
        laneBtns.forEach(b => b.classList.remove('listening'));
        el.classList.add('listening');
        if (statusText) {
          statusText.textContent = `请按下对应 [按键 #${lane}] 的键盘键...`;
          statusText.classList.add('waiting');
        }
      });
    });

    // 全局键盘监听（在监听模式下）
    window.addEventListener('keydown', (e) => {
      if (this.listeningLane === null || this.container.style.display === 'none') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        this.clearListening();
        return;
      }

      this.keybindManager.setBinding(this.listeningLane, e.code);
      if (statusText) {
        statusText.textContent = `按键 #${this.listeningLane} 已绑定为 [${this.keybindManager.getDisplayLabel(this.listeningLane)}]`;
        statusText.classList.remove('waiting');
      }
      this.clearListening();
    }, true);

    // 重置按键
    this.container.querySelector('#kb-btn-reset')?.addEventListener('click', () => {
      this.keybindManager.resetDefaults();
      this.clearListening();
      if (statusText) {
        statusText.textContent = '已恢复官方默认键位';
        statusText.classList.remove('waiting');
      }
    });

    // 关闭 / 完成按钮
    const close = () => {
      this.clearListening();
      this.close();
    };
    this.container.querySelector('#kb-btn-close')?.addEventListener('click', close);
    this.container.querySelector('#kb-btn-confirm')?.addEventListener('click', close);

    // 点击遮罩关闭
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        close();
      }
    });
  }

  private clearListening(): void {
    this.listeningLane = null;
    this.container.querySelectorAll('.keybind-lane-btn').forEach(b => b.classList.remove('listening'));
    const statusText = this.container.querySelector('#kb-status-text') as HTMLElement;
    if (statusText) {
      statusText.classList.remove('waiting');
    }
  }

  open(): void {
    this.clearListening();
    this.updateButtonLabels();
    this.container.style.display = 'flex';
  }

  close(): void {
    this.container.style.display = 'none';
  }
}
