import Phaser from 'phaser';
import { audio } from '../audio.js';
import { PASSIVES } from '../data.js';
import { COLORS, H, W, fmtTime, txt } from '../ui.js';

// HUD drawn on top of the Game scene at native resolution.
export class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    this.gs = this.scene.get('Game');
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

    this.bossBar = this.add.container(W / 2, H - 40).setVisible(false);
    const bb = this.add.rectangle(0, 0, 500, 16, 0x200010).setStrokeStyle(2, 0xffd76a);
    this.bossFill = this.add.rectangle(-248, 0, 496, 12, 0xc02040).setOrigin(0, 0.5);
    this.bossName = txt(this, 0, -22, 'BOSS', 12, COLORS.red, { ox: 0.5 });
    this.bossBar.add([bb, this.bossFill, this.bossName]);

    this.hint = txt(this, 12, H - 22, 'ESC: pause   M: mute', 10, COLORS.dim, { stroke: 2 });
    this.time.delayedCall(12000, () => this.tweens.add({ targets: this.hint, alpha: 0, duration: 1000 }));

    // Chest pointer arrows
    this.arrows = [];
    this.joyG = this.add.graphics();

    // Banner
    this.banner = txt(this, W / 2, H * 0.3, '', 32, COLORS.gold, { ox: 0.5, oy: 0.5 }).setAlpha(0);
    this.bannerSub = txt(this, W / 2, H * 0.3 + 40, '', 14, COLORS.text, { ox: 0.5, oy: 0.5 }).setAlpha(0);
    this.game.events.on('banner', this.onBanner, this);
    this.events.once('shutdown', () => this.game.events.off('banner', this.onBanner, this));

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

  rebuildInventory() {
    const gs = this.gs;
    this.invGroup.removeAll(true);
    const slot = (x, y, icon, level, maxed) => {
      const bg = this.add.rectangle(x, y, 34, 34, 0x0a0614, 0.85).setStrokeStyle(2, maxed ? 0xffd76a : 0x5a4a7a).setOrigin(0);
      const img = this.add.image(x + 17, y + 17, icon);
      const tex = img.texture.getSourceImage();
      img.setScale(Math.min(26 / tex.width, 26 / tex.height));
      const lv = txt(this, x + 33, y + 34, String(level), 8, maxed ? COLORS.gold : COLORS.text, { ox: 1, oy: 1, stroke: 3 });
      this.invGroup.add([bg, img, lv]);
    };
    gs.weapons.forEach((w, i) => slot(10 + i * 38, 26, w.def.icon, w.def.evolved ? 'EV' : w.level, w.isMax));
    gs.passives.forEach((p, i) => slot(10 + i * 38, 64, PASSIVES[p.id].icon, p.level, p.level >= PASSIVES[p.id].max));
  }

  update() {
    const gs = this.gs;
    if (!gs || !gs.stats) return;
    if (gs.invVersion !== this.invVersion) {
      this.invVersion = gs.invVersion;
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

    const b = gs.bossRef;
    if (b && b.alive) {
      this.bossBar.setVisible(true);
      this.bossFill.width = 496 * Math.max(0, b.hp / b.maxHp);
      this.bossName.setText(b.type === 'reaper' ? 'THE REAPER' : `GIANT ${b.type.toUpperCase()}`);
    } else this.bossBar.setVisible(false);

    // Arrows pointing at off-screen chests
    const cam = gs.cameras.main;
    const chests = gs.pickups.filter((p) => p.kind === 'chest');
    while (this.arrows.length < chests.length) {
      const a = this.add.triangle(0, 0, 0, -10, 20, 0, 0, 10, 0xffd76a).setStrokeStyle(2, 0x000000);
      this.arrows.push(a);
    }
    this.arrows.forEach((a, i) => {
      const c = chests[i];
      if (!c) return a.setVisible(false);
      const sx = (c.x - cam.worldView.x) * cam.zoom;
      const sy = (c.y - cam.worldView.y) * cam.zoom;
      const on = sx > 0 && sx < W && sy > 0 && sy < H;
      a.setVisible(!on);
      if (!on) {
        const ang = Math.atan2(sy - H / 2, sx - W / 2);
        const m = 40;
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
