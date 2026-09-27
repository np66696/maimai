import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ArcadeHUD } from '../src/components/ArcadeHUD';

// Mock lightweight DOM element for node environment
class MockClassList {
  private classes = new Set<string>();
  add(...tokens: string[]) { tokens.forEach(t => this.classes.add(t)); }
  remove(...tokens: string[]) { tokens.forEach(t => this.classes.delete(t)); }
  toggle(token: string, force?: boolean) {
    if (force !== undefined) {
      if (force) this.classes.add(token);
      else this.classes.delete(token);
      return force;
    }
    if (this.classes.has(token)) {
      this.classes.delete(token);
      return false;
    } else {
      this.classes.add(token);
      return true;
    }
  }
  contains(token: string) { return this.classes.has(token); }
}

class MockElement {
  public tagName: string;
  public className: string = '';
  public classList = new MockClassList();
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public innerHTML: string = '';
  public textContent: string = '';
  public style: any = {};
  public title: string = '';
  public src: string = '';
  private listeners: Record<string, ((e: any) => void)[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, cb: (e: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  dispatchEvent(event: { type: string; stopPropagation?: () => void }) {
    const cbs = this.listeners[event.type] || [];
    cbs.forEach(cb => cb({ ...event, stopPropagation: vi.fn() }));
  }

  querySelector(selector: string): MockElement | null {
    // Basic selector matching for test elements
    for (const child of this.children) {
      if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
        return child;
      }
      if (selector.startsWith('#') && (child as any).id === selector.slice(1)) {
        return child;
      }
      const found = child.querySelector(selector);
      if (found) return found;
    }
    // Fallback: create mock child if requested
    const mock = new MockElement('div');
    if (selector.startsWith('.')) mock.classList.add(selector.slice(1));
    if (selector.startsWith('#')) (mock as any).id = selector.slice(1);
    this.appendChild(mock);
    return mock;
  }
}

describe('ArcadeHUD', () => {
  let originalDocument: any;

  beforeEach(() => {
    originalDocument = (global as any).document;
    (global as any).document = {
      createElement: (tag: string) => new MockElement(tag)
    };
  });

  afterEach(() => {
    (global as any).document = originalDocument;
  });

  it('initializes with top bar and center combo elements', () => {
    const parent = new MockElement('div');
    const hud = new ArcadeHUD(parent as any);

    expect(hud.getTopBarElement()).toBeDefined();
    expect(parent.children.length).toBe(1);
  });

  it('moves to left blank space when autoPlay is false (manual mode)', () => {
    const parent = new MockElement('div');
    const hud = new ArcadeHUD(parent as any);

    // Initial state: Auto mode (centered, not docked left)
    expect(hud.isDockedLeft()).toBe(false);

    // Turn off Auto mode (manual play mode)
    hud.setAutoPlay(false);
    expect(hud.isDockedLeft()).toBe(true);
    expect(hud.getTopBarElement().classList.contains('dock-left')).toBe(true);

    // Turn back on Auto mode
    hud.setAutoPlay(true);
    expect(hud.isDockedLeft()).toBe(false);
    expect(hud.getTopBarElement().classList.contains('dock-left')).toBe(false);
  });

  it('toggles pause button state smoothly', () => {
    let pauseToggled = false;
    const parent = new MockElement('div');
    const hud = new ArcadeHUD(parent as any, () => {
      pauseToggled = true;
    });

    hud.setPlaying(true);
    const pauseBtn = hud.getTopBarElement().querySelector('#hud-btn-pause') as unknown as MockElement;
    expect(pauseBtn.textContent).toBe('⏸');

    hud.setPlaying(false);
    expect(pauseBtn.textContent).toBe('▶');

    pauseBtn.dispatchEvent({ type: 'click' });
    expect(pauseToggled).toBe(true);
  });
});
