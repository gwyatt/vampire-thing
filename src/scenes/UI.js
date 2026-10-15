import Phaser from 'phaser';
import { audio } from '../audio.js';
import { PASSIVES } from '../data.js';
import { PLAYER_COLORS, PLAYER_CSS } from '../net.js';
import { COLORS, H, W, fmtTime, txt } from '../ui.js';

// HUD drawn on top of the Game (or ClientGame) scene at native resolution.
// It only reads the HUD interface both scenes share: clock/level/xp/kills/
// goldRun/victory/joy/alive/mp, `me`, bossInfo(), chestPositions(), teamInfo().
export class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create(data) {
    this.gs = this.scene.get(data?.source || 'Game');
    this.invVersion = -1;

    this.xpBg = this.add.rectangle(0, 0, W, 18, 0x0a0614).setOrigin(0);
    this.xpFill = this.add.rectangle(2, 2, 0, 14, 0x3a6aff).setOrigin(0);
    this.xpShine = this.add.rectangle(2, 2, 0, 4, 0x9ac0ff).setOrigin(0);
    this.add.rectangle(0, 18, W, 2, 0x8a6a2a).setOrigin(0);
    this.lvText = txt(this, W - 10, 3, 'LV 1', 12, COLORS.text, { ox: 1 });

    this.timeText = txt(this, W / 2, 30, '00:00', 28, COLORS.text, { ox: 0.5 });
    this.killText = txt(this, W - 14, 30, '0', 14, COLORS.text, { ox: 1 });
    this.add.image(W - 14 - 0, 58, 'coin').setScale(2).setOrigin(1, 0);
    this.goldText = txt(this, W - 38, 58, '0', 14, COLORS.gold, { ox: 1 });

    this.invGroup = this.add.container(0, 0);

    // Team panel (co-op): one row per hunter under the inventory
    this.teamG = this.add.graphics();
    this.teamTexts = [];

    this.bossBar = this.add.container(W / 2, H - 40).setVisible(false);
    const bb = this.add.rectangle(0, 0, 500, 16, 0x200010).setStrokeStyle(2, 0xffd76a);
    this.bossFill = this.add.rectangle(-248, 0, 496, 12, 0xc02040).setOrigin(0, 0.5);
    this.bossName = txt(this, 0, -22, 'BOSS', 12, COLORS.red, { ox: 0.5 });
    this.bossBar.add([bb, this.bossFill, this.bossName]);

    this.hint = txt(this, 12, H - 22, 'ESC: pause   M: mute', 10, COLORS.dim, { stroke: 2 });
    this.time.delayedCall(12000, () => this.tweens.add({ targets: this.hint, alpha: 0, duration: 1000 }));

    // Arrows pointing at off-screen chests and teammates
    this.arrows = [];
    this.joyG = this.add.graphics();

    // Banner + treasure toast
    this.banner = txt(this, W / 2, H * 0.3, '', 32, COLORS.gold, { ox: 0.5, oy: 0.5 }).setAlpha(0);
    this.bannerSub = txt(this, W / 2, H * 0.3 + 40, '', 14, COLORS.text, { ox: 0.5, oy: 0.5 }).setAlpha(0);
    this.toastBox = this.add.container(W - 16, 96);
    this.game.events.on('banner', this.onBanner, this);
    this.game.events.on('toast', this.onToast, this);
    this.events.once('shutdown', () => {
      this.game.events.off('banner', this.onBanner, this);
      this.game.events.off('toast', this.onToast, this);
    });

    this.muteText = txt(this, W - 14, H - 22, '', 10, COLORS.dim, { ox: 1, stroke: 2 });
  }

  onBanner(title, sub) {
    this.banner.setText(title);
    this.bannerSub.setText(sub);
    this.tweens.killTweensOf([this.banner, this.bannerSub]);
    this.banner.setAlpha(0).setScale(1.6);
    this.bannerSub.setAlpha(0);
    this.tweens.add({ targets: this.banner, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: this.bannerSub, alpha: 1, duration: 300, delay: 200 });
    this.tweens.add({ targets: [this.banner, this.bannerSub], alpha: 0, duration: 600, delay: 2600 });
  }

  // Non-blocking treasure notice used in co-op instead of the chest screen.
  onToast(ev) {
    this.toastBox.removeAll(true);
    this.tweens.killTweensOf(this.toastBox);
    const items = ev.items || [];
    const h = 44 + items.length * 34 + (ev.gold ? 22 : 0);
    const g = this.add.graphics();
    g.fillStyle(0x1a1230, 0.92).fillRect(-380, 0, 380, h);
    g.lineStyle(3, 0xffd76a).strokeRect(-380, 0, 380, h);
    this.toastBox.add(g);
    this.toastBox.add(txt(this, -366, 12, ev.title, 12, ev.color || COLORS.gold));
    items.forEach((it, i) => {
      const y = 50 + i * 34;
      const img = this.add.image(-350, y, it.icon);
      const src = img.texture.getSourceImage();
      img.setScale(Math.min(24 / src.width, 24 / src.height));
      this.toastBox.add(img);
      this.toastBox.add(txt(this, -326, y - 12, it.name, 10, it.evo ? COLORS.red : COLORS.text));
      this.toastBox.add(txt(this, -326, y + 2, it.desc, 8, COLORS.dim));
    });
    if (ev.gold) this.toastBox.add(txt(this, -366, h - 22, `+${ev.gold} gold`, 10, COLORS.gold));
    this.toastBox.setAlpha(0).setX(W + 40);
    this.tweens.add({ targets: this.toastBox, alpha: 1, x: W - 16, duration: 250, ease: 'Back.Out' });
    this.tweens.add({ targets: this.toastBox, alpha: 0, delay: 4500, duration: 500 });
  }

  rebuildInventory() {
    const me = this.gs.me;
    this.invGroup.removeAll(true);
    const slot = (x, y, icon, level, maxed) => {
      const bg = this.add.rectangle(x, y, 34, 34, 0x0a0614, 0.85).setStrokeStyle(2, maxed ? 0xffd76a : 0x5a4a7a).setOrigin(0);
      const img = this.add.image(x + 17, y + 17, icon);
      const tex = img.texture.getSourceImage();
      img.setScale(Math.min(26 / tex.width, 26 / tex.height));
      const lv = txt(this, x + 33, y + 34, String(level), 8, maxed ? COLORS.gold : COLORS.text, { ox: 1, oy: 1, stroke: 3 });
      this.invGroup.add([bg, img, lv]);
    };
    me.weapons.forEach((w, i) => slot(10 + i * 38, 26, w.def.icon, w.def.evolved ? 'EV' : w.level, w.isMax));
    me.passives.forEach((p, i) => slot(10 + i * 38, 64, PASSIVES[p.id].icon, p.level, p.level >= PASSIVES[p.id].max));
  }

  drawTeam(team) {
    this.teamG.clear();
    const rows = this.gs.mp ? team : [];
    while (this.teamTexts.length < rows.length) this.teamTexts.push(txt(this, 0, 0, '', 8, COLORS.text, { stroke: 3 }));
    this.teamTexts.forEach((t, i) => {
      const p = rows[i];
      if (!p) return t.setVisible(false);
      const y = 110 + i * 22;
      t.setVisible(true).setPosition(12, y).setText(p.alive ? p.name : `${p.name} (down)`).setColor(PLAYER_CSS[p.slot % 4]);
      this.teamG.fillStyle(0x200000, 0.9).fillRect(84, y, 100, 8);
      if (p.alive) this.teamG.fillStyle(0xe02030, 1).fillRect(84, y, 100 * Math.max(0, p.hp / p.maxHp), 8);
      this.teamG.lineStyle(1, PLAYER_COLORS[p.slot % 4], 0.8).strokeRect(84, y, 100, 8);
    });
  }

  update() {
    const gs = this.gs;
    if (!gs || !gs.me) return;
    if (gs.me.invVersion !== this.invVersion) {
      this.invVersion = gs.me.invVersion;
      this.rebuildInventory();
    }
    const frac = Math.min(1, gs.xp / gs.xpNext);
    this.xpFill.width = (W - 4) * frac;
    this.xpShine.width = (W - 4) * frac;
    this.lvText.setText(`LV ${gs.level}`);
    this.timeText.setText(fmtTime(gs.clock));
    this.timeText.setColor(gs.victory ? COLORS.red : COLORS.text);
    this.killText.setText(`KILLS ${gs.kills}`);
    this.goldText.setText(String(gs.goldRun));
    this.muteText.setText(audio.muted ? 'MUTED' : '');

    const b = gs.bossInfo();
    if (b) {
      this.bossBar.setVisible(true);
      this.bossFill.width = 496 * Phaser.Math.Clamp(b.hp / b.maxHp, 0, 1);
      this.bossName.setText(b.type === 'reaper' ? 'THE REAPER' : `GIANT ${b.type.toUpperCase()}`);
    } else this.bossBar.setVisible(false);

    const team = gs.teamInfo();
    this.drawTeam(team);

    // Arrows pointing at off-screen chests (gold) and teammates (their colour)
    const cam = gs.cameras.main;
    const targets = gs.chestPositions().map((c) => ({ x: c.x, y: c.y, color: 0xffd76a }));
    if (gs.mp) for (const p of team) if (!p.local) targets.push({ x: p.x, y: p.y, color: PLAYER_COLORS[p.slot % 4] });
    while (this.arrows.length < targets.length) {
      this.arrows.push(this.add.triangle(0, 0, 0, -10, 20, 0, 0, 10, 0xffffff).setStrokeStyle(2, 0x000000));
    }
    this.arrows.forEach((a, i) => {
      const c = targets[i];
      if (!c) return a.setVisible(false);
      const sx = (c.x - cam.worldView.x) * cam.zoom;
      const sy = (c.y - cam.worldView.y) * cam.zoom;
      const on = sx > 0 && sx < W && sy > 0 && sy < H;
      a.setVisible(!on);
      if (!on) {
        const ang = Math.atan2(sy - H / 2, sx - W / 2);
        const m = 40;
        a.setFillStyle(c.color);
        a.setPosition(Phaser.Math.Clamp(sx, m, W - m), Phaser.Math.Clamp(sy, m + 80, H - m));
        a.setRotation(ang);
      }
    });

    // Virtual joystick
    this.joyG.clear();
    if (gs.joy.active && gs.alive) {
      const j = gs.joy;
      this.joyG.lineStyle(3, 0xffffff, 0.25).strokeCircle(j.sx, j.sy, 44);
      const dx = j.x - j.sx;
      const dy = j.y - j.sy;
      const len = Math.min(44, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      this.joyG.fillStyle(0xffffff, 0.3).fillCircle(j.sx + Math.cos(a) * len, j.sy + Math.sin(a) * len, 18);
    }
  }
}
