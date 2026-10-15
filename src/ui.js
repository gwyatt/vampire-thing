// Shared UI helpers: pixel text, framed panels, selectable cards and
// keyboard/mouse navigation for menus.

import { audio } from './audio.js';

export const FONT = '"Press Start 2P", monospace';
export const W = 1280;
export const H = 720;

export const COLORS = {
  panel: 0x1a1230,
  panelHi: 0x2e2152,
  border: 0x8a6a2a,
  borderHi: 0xffd76a,
  gold: '#ffd76a',
  text: '#f4ecd8',
  dim: '#9a8fb0',
  red: '#ff5a6a',
  green: '#7af07a',
  blue: '#7ab8ff',
};

export function txt(scene, x, y, str, size = 16, color = COLORS.text, opts = {}) {
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: '#000000',
    strokeThickness: opts.stroke ?? Math.max(2, Math.round(size / 4)),
    align: opts.align || 'left',
    lineSpacing: opts.lineSpacing ?? Math.round(size * 0.5),
    wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
  });
  t.setOrigin(opts.ox ?? 0, opts.oy ?? 0);
  return t;
}

// A framed panel drawn with Graphics, centered at (x, y).
export function panel(scene, x, y, w, h, { fill = COLORS.panel, border = COLORS.border, alpha = 0.96 } = {}) {
  const g = scene.add.graphics();
  drawPanel(g, x - w / 2, y - h / 2, w, h, fill, border, alpha);
  return g;
}

export function drawPanel(g, x, y, w, h, fill, border, alpha = 0.96) {
  g.clear();
  g.fillStyle(0x000000, 0.5);
  g.fillRect(x + 6, y + 6, w, h);
  g.fillStyle(fill, alpha);
  g.fillRect(x, y, w, h);
  g.lineStyle(4, border, 1);
  g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  g.lineStyle(2, 0x000000, 0.6);
  g.strokeRect(x + 7, y + 7, w - 14, h - 14);
}

// A selectable card: a container with a background that highlights.
export function card(scene, x, y, w, h) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  c.add(g);
  const hit = scene.add.rectangle(0, 0, w, h, 0x000000, 0.001);
  c.add(hit);
  const item = {
    container: c,
    hit,
    w,
    h,
    disabled: false,
    setHi(on) {
      drawPanel(g, -w / 2, -h / 2, w, h, on ? COLORS.panelHi : COLORS.panel, on ? COLORS.borderHi : COLORS.border);
      item.hiTween?.stop();
      item.hiTween = scene.tweens.add({ targets: c, scale: on ? 1.03 : 1, duration: 90 });
    },
  };
  item.setHi(false);
  return item;
}

export function button(scene, x, y, label, w = 320, h = 56, size = 16) {
  const item = card(scene, x, y, w, h);
  item.label = txt(scene, 0, 0, label, size, COLORS.text, { ox: 0.5, oy: 0.5 });
  item.container.add(item.label);
  return item;
}

// Phaser re-dispatches the whole frame's key queue whenever a new DOM key
// event arrives, so several presses within one frame would otherwise be
// delivered more than once. Every key handler goes through this filter,
// which remembers (per handler) the native events it has already seen.
export function onKeyDown(scene, fn) {
  const seen = new WeakSet();
  const handler = (ev) => {
    if (seen.has(ev)) return;
    seen.add(ev);
    fn(ev);
  };
  scene.input.keyboard.on('keydown', handler);
  scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown', handler));
}

// Keyboard + mouse navigation over a list of cards.
export class Nav {
  constructor(scene, items, { columns = 1, onCancel = null, initial = 0, numberKeys = false } = {}) {
    this.scene = scene;
    this.items = items;
    this.cols = columns;
    this.idx = -1;
    this.enabled = true;
    items.forEach((it, i) => {
      it.hit.setInteractive({ useHandCursor: true });
      it.hit.on('pointerover', () => this.set(i));
      it.hit.on('pointerdown', () => {
        this.set(i, true);
        this.activate();
      });
    });
    onKeyDown(scene, (ev) => {
      if (!this.enabled) return;
      const c = ev.code;
      const n = this.items.length;
      if (c === 'ArrowUp' || c === 'KeyW') this.set((this.idx - this.cols + n) % n);
      else if (c === 'ArrowDown' || c === 'KeyS') this.set((this.idx + this.cols) % n);
      else if (c === 'ArrowLeft' || c === 'KeyA') this.set((this.idx - 1 + n) % n);
      else if (c === 'ArrowRight' || c === 'KeyD') this.set((this.idx + 1) % n);
      else if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') this.activate();
      else if ((c === 'Escape' || c === 'Backspace') && onCancel) {
        audio.play('move');
        onCancel();
      } else if (numberKeys && /^Digit[1-9]$/.test(c)) {
        const i = Number(c.slice(5)) - 1;
        if (i < n) {
          this.set(i, true);
          this.activate();
        }
      }
    });
    this.set(initial, true);
  }

  set(i, silent = false) {
    if (i === this.idx) return;
    if (this.items[this.idx]) this.items[this.idx].setHi(false);
    this.idx = i;
    this.items[i].setHi(true);
    if (!silent) audio.play('move');
  }

  activate() {
    const it = this.items[this.idx];
    if (!it || it.disabled || !this.enabled) return;
    audio.play('select');
    it.onSelect?.();
  }
}

export function fmtTime(sec) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Unlock audio on the first gesture in any scene.
export function hookAudioUnlock(scene) {
  const unlock = () => {
    audio.unlock();
    audio.startMusic();
  };
  scene.input.once('pointerdown', unlock);
  scene.input.keyboard.once('keydown', unlock);
}
