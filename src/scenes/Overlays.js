import Phaser from 'phaser';
import { audio } from '../audio.js';
import { PASSIVES } from '../data.js';
import { COLORS, H, Nav, W, button, card, fmtTime, onKeyDown, panel, txt } from '../ui.js';
import { WEAPONS } from '../weapons.js';

function dim(scene, a = 0.65) {
  return scene.add.rectangle(0, 0, W, H, 0x000000, a).setOrigin(0);
}

function fitIcon(img, size) {
  const src = img.texture.getSourceImage();
  img.setScale(Math.floor(Math.min(size / src.width, size / src.height)) || 1);
  return img;
}

/* ---------------------------------------------------------------------- */

export class LevelUpScene extends Phaser.Scene {
  constructor() {
    super('LevelUp');
  }

  create({ choices, level }) {
    this.done = false;
    const gs = this.scene.get('Game');
    dim(this);
    const cardH = 104;
    const totalH = choices.length * (cardH + 14) + 120;
    panel(this, W / 2, H / 2 + 20, 720, totalH);
    const title = txt(this, W / 2, H / 2 + 20 - totalH / 2 + 30, 'LEVEL UP!', 32, COLORS.gold, { ox: 0.5 });
    this.tweens.add({ targets: title, scale: { from: 1.4, to: 1 }, duration: 300, ease: 'Back.Out' });

    const startY = H / 2 + 20 - totalH / 2 + 100 + cardH / 2;
    const items = choices.map((c, i) => {
      const it = card(this, W / 2, startY + i * (cardH + 14), 660, cardH);
      const iconBg = this.add.rectangle(-280, 0, 76, 76, 0x0a0614).setStrokeStyle(2, 0x5a4a7a);
      const icon = fitIcon(this.add.image(-280, 0, c.icon), 60);
      const isNew = c.level === 1;
      const name = txt(this, -225, -34, c.name, 16, COLORS.text);
      let tag = '';
      if (c.kind === 'weapon' || c.kind === 'passive') tag = isNew ? 'NEW!' : `LV ${c.level}`;
      const tagT = txt(this, 310, -34, tag, 12, isNew ? COLORS.gold : COLORS.blue, { ox: 1 });
      const desc = txt(this, -225, -4, c.desc, 11, COLORS.dim, { wrap: 520, lineSpacing: 8 });
      const key = txt(this, 310, 34, `[${i + 1}]`, 10, COLORS.dim, { ox: 1, oy: 1 });
      it.container.add([iconBg, icon, name, tagT, desc, key]);
      // Evolution hint
      if (c.kind === 'weapon' && WEAPONS[c.id].evo) {
        const ev = WEAPONS[c.id].evo;
        const has = gs.passiveLevel(ev.with) > 0;
        const hint = txt(this, -225, 30, `Evolves with ${PASSIVES[ev.with].name}`, 8, has ? COLORS.green : '#6a5f80');
        it.container.add(hint);
      } else if (c.kind === 'passive') {
        const pairs = Object.entries(WEAPONS)
          .filter(([, d]) => d.evo?.with === c.id)
          .map(([, d]) => d.name);
        if (pairs.length) it.container.add(txt(this, -225, 30, `Evolves ${pairs.join(', ')}`, 8, '#6a5f80'));
      }
      it.container.setAlpha(0);
      this.tweens.add({ targets: it.container, alpha: 1, x: { from: W / 2 + 40, to: W / 2 }, duration: 200, delay: 60 * i });
      it.onSelect = () => {
        if (this.done) return; // stop() is deferred a frame; never apply twice
        this.done = true;
        gs.applyChoice(c);
        this.close();
      };
      return it;
    });
    // Ignore input for a beat so held keys don't insta-pick
    const nav = new Nav(this, items, { numberKeys: true });
    nav.enabled = false;
    this.time.delayedCall(250, () => (nav.enabled = true));
    txt(this, W / 2, H - 28, `Level ${level}  -  choose with arrows / 1-${choices.length} / click`, 10, COLORS.dim, { ox: 0.5 });
  }

  close() {
    this.scene.stop();
    this.scene.resume('Game');
  }
}

/* ---------------------------------------------------------------------- */

export class ChestScene extends Phaser.Scene {
  constructor() {
    super('Chest');
  }

  create({ rewards, gold }) {
    this.done = false;
    dim(this, 0.75);
    const cx = W / 2;
    const chest = this.add.image(cx, H / 2 - 40, 'chest').setScale(8);
    const rays = this.add.image(cx, H / 2 + 150, 'glow').setScale(4).setTint(0xffd76a).setAlpha(0);
    this.tweens.add({ targets: chest, angle: { from: -6, to: 6 }, duration: 70, yoyo: true, repeat: 6 });
    this.time.delayedCall(700, () => {
      audio.play('levelup');
      this.cameras.main.flash(250, 255, 240, 180);
      this.tweens.add({ targets: chest, y: H / 2 + 150, scale: 6, duration: 300 });
      this.tweens.add({ targets: rays, alpha: 0.7, duration: 300 });
      this.tweens.add({ targets: rays, scale: 4.6, yoyo: true, repeat: -1, duration: 700 });
      // coin shower
      for (let i = 0; i < 40; i++) {
        const c = this.add.image(cx, H / 2 + 120, 'coin').setScale(3);
        this.tweens.add({
          targets: c,
          x: cx + (Math.random() - 0.5) * 900,
          y: { from: H / 2 + 120, to: H + 40 },
          duration: 1200 + Math.random() * 800,
          ease: (k) => (k < 0.3 ? -Math.sin((k / 0.3) * Math.PI) * 0.6 : (k - 0.3) / 0.7),
          delay: Math.random() * 400,
          onComplete: () => c.destroy(),
        });
      }
      rewards.forEach((r, i) => {
        const y = 110 + i * 78;
        const row = this.add.container(cx, y).setAlpha(0);
        const bg = this.add.graphics();
        bg.fillStyle(r.evo ? 0x4a1a2a : 0x1a1230, 0.95).fillRect(-300, -32, 600, 64);
        bg.lineStyle(3, r.evo ? 0xff5a6a : 0xffd76a).strokeRect(-300, -32, 600, 64);
        const ic = fitIcon(this.add.image(-260, 0, r.icon), 44);
        const n = txt(this, -220, -18, r.name, 16, r.evo ? COLORS.red : COLORS.gold);
        const d = txt(this, -220, 8, r.desc, 10, COLORS.text);
        row.add([bg, ic, n, d]);
        this.tweens.add({ targets: row, alpha: 1, scale: { from: 1.5, to: 1 }, delay: 300 + i * 350, duration: 250, onStart: () => audio.play('select') });
      });
      const goldT = txt(this, cx, 110 + rewards.length * 78, `+${gold} GOLD`, 16, COLORS.gold, { ox: 0.5 }).setAlpha(0);
      this.tweens.add({ targets: goldT, alpha: 1, delay: 300 + rewards.length * 350, duration: 300 });
      const done = 400 + rewards.length * 350;
      this.time.delayedCall(done, () => {
        const btn = button(this, cx, H - 60, 'CONTINUE', 300, 54);
        btn.onSelect = () => {
          if (this.done) return;
          this.done = true;
          this.scene.stop();
          this.scene.resume('Game');
        };
        new Nav(this, [btn]);
      });
    });
  }
}

/* ---------------------------------------------------------------------- */

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create() {
    this.done = false;
    const gs = this.scene.get('Game');
    dim(this, 0.7);
    panel(this, W / 2, H / 2, 900, 600);
    txt(this, W / 2, 80, 'PAUSED', 32, COLORS.gold, { ox: 0.5 });

    const s = gs.stats;
    const pct = (v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
    const lines = [
      ['Max Health', `${Math.ceil(gs.player.hp)} / ${s.maxHp}`],
      ['Recovery', `${s.recovery.toFixed(1)}/s`],
      ['Armor', `${s.armor}`],
      ['Move Speed', pct(s.moveSpeed)],
      ['Might', pct(s.might)],
      ['Area', pct(s.area)],
      ['Speed', pct(s.projSpeed)],
      ['Duration', pct(s.duration)],
      ['Amount', `+${s.amount}`],
      ['Cooldown', `${Math.round((s.cooldown - 1) * 100)}%`],
      ['Luck', pct(s.luck)],
      ['Growth', pct(s.growth)],
      ['Greed', pct(s.greed)],
      ['Magnet', pct(s.magnet)],
      ['Revival', `${gs.revivals}`],
    ];
    lines.forEach(([k, v], i) => {
      txt(this, 380, 140 + i * 24, k, 10, COLORS.dim);
      txt(this, 600, 140 + i * 24, v, 10, COLORS.text, { ox: 1 });
    });

    txt(this, 660, 140, 'WEAPONS', 12, COLORS.gold);
    gs.weapons.forEach((w, i) => {
      fitIcon(this.add.image(676, 180 + i * 34, w.def.icon), 24);
      txt(this, 700, 172 + i * 34, `${w.def.name}`, 10, COLORS.text);
      txt(this, 700, 186 + i * 34, w.def.evolved ? 'EVOLVED' : `LV ${w.level}`, 8, w.isMax ? COLORS.gold : COLORS.dim);
    });
    txt(this, 660, 390, 'PASSIVES', 12, COLORS.gold);
    gs.passives.forEach((p, i) => {
      const x = 676 + (i % 3) * 80;
      const y = 430 + Math.floor(i / 3) * 40;
      fitIcon(this.add.image(x, y, PASSIVES[p.id].icon), 24);
      txt(this, x + 16, y + 4, `${p.level}`, 10, COLORS.text);
    });

    const resume = button(this, W / 2 - 170, H - 100, 'RESUME', 300, 54);
    const quit = button(this, W / 2 + 170, H - 100, 'QUIT RUN', 300, 54);
    resume.onSelect = () => this.resume();
    quit.onSelect = () => {
      if (this.done) return;
      this.done = true;
      this.scene.stop();
      gs.scene.resume();
      gs.alive = false;
      gs.endRun();
    };
    new Nav(this, [resume, quit], { columns: 2, onCancel: () => this.resume() });
    onKeyDown(this, (ev) => ev.code === 'KeyP' && this.resume());
  }

  resume() {
    if (this.done) return;
    this.done = true;
    this.scene.stop();
    this.scene.resume('Game');
  }
}

/* ---------------------------------------------------------------------- */

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data) {
    this.cameras.main.setBackgroundColor('#07040b');
    const title = data.victory ? 'YOU SURVIVED!' : 'GAME OVER';
    const t = txt(this, W / 2, 70, title, 40, data.victory ? COLORS.gold : COLORS.red, { ox: 0.5, oy: 0.5 });
    this.tweens.add({ targets: t, scale: { from: 2, to: 1 }, alpha: { from: 0, to: 1 }, duration: 500, ease: 'Back.Out' });

    panel(this, W / 2, 360, 1000, 480);
    const hero = this.add.image(230, 230, `hero_${data.character}_0`).setScale(6);
    this.tweens.add({ targets: hero, y: 222, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.InOut' });
    const rows = [
      ['Survived', fmtTime(data.time)],
      ['Level', String(data.level)],
      ['Enemies', String(data.kills)],
      ['Gold', `+${data.gold}`],
    ];
    rows.forEach(([k, v], i) => {
      txt(this, 160, 320 + i * 34, k, 12, COLORS.dim);
      txt(this, 380, 320 + i * 34, v, 12, i === 3 ? COLORS.gold : COLORS.text, { ox: 1 });
    });

    const tx = 460;
    txt(this, tx, 150, 'WEAPON', 10, COLORS.gold);
    txt(this, tx + 330, 150, 'LV', 10, COLORS.gold, { ox: 1 });
    txt(this, tx + 460, 150, 'DAMAGE', 10, COLORS.gold, { ox: 1 });
    txt(this, tx + 560, 150, 'DPS', 10, COLORS.gold, { ox: 1 });
    data.weaponStats
      .filter((w) => w.damage > 0)
      .sort((a, b) => b.damage - a.damage)
      .slice(0, 9)
      .forEach((w, i) => {
        const y = 182 + i * 36;
        fitIcon(this.add.image(tx + 12, y + 6, w.icon), 24);
        txt(this, tx + 36, y, w.name, 10, COLORS.text);
        txt(this, tx + 330, y, String(w.level), 10, COLORS.text, { ox: 1 });
        txt(this, tx + 460, y, w.damage.toLocaleString(), 10, COLORS.text, { ox: 1 });
        txt(this, tx + 560, y, String(w.dps), 10, COLORS.dim, { ox: 1 });
      });

    const retry = button(this, W / 2 - 170, H - 70, 'RETRY', 300, 54);
    const menu = button(this, W / 2 + 170, H - 70, 'MAIN MENU', 300, 54);
    retry.onSelect = () => this.scene.start('Game', { character: data.character });
    menu.onSelect = () => this.scene.start('Menu');
    const nav = new Nav(this, [retry, menu], { columns: 2 });
    nav.enabled = false;
    this.time.delayedCall(600, () => (nav.enabled = true));
  }
}
