// 键位设置管理器
export interface KeybindConfig {
  [lane: number]: string; // lane 1..8 -> KeyboardEvent.code (e.g. 'KeyW')
}

export const DEFAULT_KEYBINDS: Record<number, string> = {
  1: 'KeyW',
  2: 'KeyE',
  3: 'KeyD',
  4: 'KeyC',
  5: 'KeyX',
  6: 'KeyZ',
  7: 'KeyA',
  8: 'KeyQ'
};

// 辅助小键盘预置映射
export const NUMPAD_KEYBINDS: Record<string, number> = {
  Numpad9: 1,
  Numpad6: 2,
  Numpad3: 3,
  Numpad2: 4,
  Numpad1: 5,
  Numpad4: 6,
  Numpad7: 7,
  Numpad8: 8
};

const STORAGE_KEY = 'maimai_viewer_keybinds_v1';

export class KeybindManager {
  private static instance: KeybindManager;
  private bindings: Record<number, string> = { ...DEFAULT_KEYBINDS };
  private listeners: Array<() => void> = [];

  private constructor() {
    this.load();
  }

  static getInstance(): KeybindManager {
    if (!KeybindManager.instance) {
      KeybindManager.instance = new KeybindManager();
    }
    return KeybindManager.instance;
  }

  private load(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        for (let i = 1; i <= 8; i++) {
          if (parsed[i]) {
            this.bindings[i] = parsed[i];
          }
        }
      }
    } catch {
      // 忽略存储读取异常
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      // 忽略存储写入异常
    }
    this.notify();
  }

  getBinding(lane: number): string {
    return this.bindings[lane] || DEFAULT_KEYBINDS[lane] || '';
  }

  getAllBindings(): Record<number, string> {
    return { ...this.bindings };
  }

  setBinding(lane: number, code: string): void {
    if (lane < 1 || lane > 8) return;
    // 如果其他键位占用了该按键，则自动解除或互换
    for (let i = 1; i <= 8; i++) {
      if (i !== lane && this.bindings[i] === code) {
        this.bindings[i] = '';
      }
    }
    this.bindings[lane] = code;
    this.save();
  }

  resetDefaults(): void {
    this.bindings = { ...DEFAULT_KEYBINDS };
    this.save();
  }

  getLaneByCode(code: string): number | null {
    for (let lane = 1; lane <= 8; lane++) {
      if (this.bindings[lane] === code) {
        return lane;
      }
    }
    // 小键盘备选映射
    if (NUMPAD_KEYBINDS[code]) {
      return NUMPAD_KEYBINDS[code];
    }
    return null;
  }

  getDisplayLabel(lane: number): string {
    const code = this.getBinding(lane);
    if (!code) return '-';
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
    if (code === 'Space') return 'SPC';
    if (code === 'Enter') return 'ENT';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
    if (code === 'ArrowUp') return '↑';
    if (code === 'ArrowDown') return '↓';
    if (code === 'ArrowLeft') return '←';
    if (code === 'ArrowRight') return '→';
    if (code === 'Semicolon') return ';';
    if (code === 'Comma') return ',';
    if (code === 'Period') return '.';
    if (code === 'Slash') return '/';
    return code.slice(0, 4);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
