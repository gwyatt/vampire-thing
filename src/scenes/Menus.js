import Phaser from 'phaser';
import { audio } from '../audio.js';
import { CHARACTERS, POWERUPS, powerupCost } from '../data.js';
import { loadSave, writeSave } from '../save.js';
import { COLORS, H, Nav, W, button, card, hookAudioUnlock, txt } from '../ui.js';
import { WEAPONS } from '../weapons.js';
import { generateArt } from '../art.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateArt(this);
    const save = loadSave();
    audio.setMuted(!!save.muted);
    // Invite links look like https://host/?join=ABCD: go straight to joining.
    const params = new URLSearchParams(location.search);
    const join = (params.get('join') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (params.has('join')) {
      params.delete('join');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    }
    if (join.length === 4) this.scene.start('Coop', { autoJoin: join });
    else this.scene.start('Menu');
  }
}

// Shared animated backdrop: scrolling ground + drifting bats.
export function backdrop(scene) {
  scene.cameras.main.setBackgroundColor('#07040b');
  const g = scene.add.tileSprite(0, 0, W / 3, H / 3, 'ground').setOrigin(0).setScale(3).setAlpha(0.35);
  // Listeners live on scene.events, which outlives a scene restart, so they
  // must be removed on shutdown or they'd poke destroyed objects next time.
  const onUpdate = (fn) => {
    scene.events.on('update', fn);
    scene.events.once('shutdown', () => scene.events.off('update', fn));
  };
  onUpdate((t, dt) => {
    g.tilePositionX += dt * 0.006;
    g.tilePositionY += dt * 0.003;
  });
  for (let i = 0; i < 14; i++) {
    const b = scene.add.image(Math.random() * W, Math.random() * H, 'bat_0').setScale(2 + Math.random() * 2).setAlpha(0.5);
    const speed = 30 + Math.random() * 60;
    let f = 0;
    let ft = 0;
    onUpdate((t, dt) => {
      b.x -= (speed * dt) / 1000;
      b.y += Math.sin(t / 300 + i) * 0.3;
      ft += dt;
      if (ft > 150) {
        ft = 0;
        f ^= 1;
        b.setTexture(`bat_${f}`);
      }
      if (b.x < -40) {
        b.x = W + 40;
        b.y = Math.random() * H;
      }
    });
  }
  const vignette = scene.add.graphics();
  vignette.fillStyle(0x000000, 0.5).fillRect(0, 0, W, 60).fillRect(0, H - 60, W, 60);
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(data) {
    backdrop(this);
    hookAudioUnlock(this);
    const save = loadSave();

    const title = txt(this, W / 2, 150, 'VAMPIRE THING', 64, '#e0304a', { ox: 0.5, oy: 0.5, stroke: 10 });
    this.tweens.add({ targets: title, y: 160, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.InOut' });
    txt(this, W / 2, 230, 'a Vampire Survivors-style survival game', 14, COLORS.dim, { ox: 0.5 });

    const start = button(this, W / 2, 310, 'START', 360, 56, 20);
    const coop = button(this, W / 2, 378, 'ONLINE CO-OP', 360, 56, 20);
    const shop = button(this, W / 2, 446, 'POWER UPS', 360, 56, 20);
    const mute = button(this, W / 2, 514, audio.muted ? 'SOUND: OFF' : 'SOUND: ON', 360, 56, 20);
    start.onSelect = () => this.scene.start('CharSelect');
    coop.onSelect = () => this.scene.start('Coop');
    shop.onSelect = () => this.scene.start('Shop');
    mute.onSelect = () => {
      audio.unlock();
      audio.setMuted(!audio.muted);
      const s = loadSave();
      s.muted = audio.muted;
      writeSave(s);
      mute.label.setText(audio.muted ? 'SOUND: OFF' : 'SOUND: ON');
    };
    new Nav(this, [start, coop, shop, mute]);
    if (data?.message) {
      const m = txt(this, W / 2, 268, data.message, 12, COLORS.red, { ox: 0.5, oy: 0.5 });
      this.tweens.add({ targets: m, alpha: 0, delay: 5000, duration: 800 });
    }

    this.add.image(W - 160, H - 36, 'coin').setScale(2);
    txt(this, W - 140, H - 44, `${save.gold}`, 14, COLORS.gold);
    if (save.best?.time) {
      const m = Math.floor(save.best.time / 60);
      const s = Math.floor(save.best.time % 60);
      txt(this, 24, H - 44, `BEST ${m}:${String(s).padStart(2, '0')}  LV ${save.best.level}  ${save.best.kills} KILLS`, 10, COLORS.dim);
    }
    txt(this, W / 2, H - 92, 'WASD / ARROWS to move  -  weapons fire automatically', 10, COLORS.dim, { ox: 0.5 });
  }
}

export class CharSelectScene extends Phaser.Scene {
  constructor() {
    super('CharSelect');
  }

  create() {
    backdrop(this);
    hookAudioUnlock(this);
    txt(this, W / 2, 70, 'CHOOSE YOUR HUNTER', 32, COLORS.gold, { ox: 0.5 });
    const ids = Object.keys(CHARACTERS);
    const cw = 220;
    const items = ids.map((id, i) => {
      const c = CHARACTERS[id];
      const x = W / 2 + (i - (ids.length - 1) / 2) * (cw + 20);
      const it = card(this, x, 360, cw, 400);
      const hero = this.add.image(0, -110, `hero_${id}_0`).setScale(6);
      let f = 0;
      this.time.addEvent({
        delay: 180,
        loop: true,
        callback: () => {
          if (this.nav?.items[this.nav.idx] === it) {
            f ^= 1;
            hero.setTexture(`hero_${id}_${f}`);
          }
        },
      });
      const name = txt(this, 0, -10, c.name, 14, COLORS.text, { ox: 0.5 });
      const title = txt(this, 0, 16, c.title, 8, COLORS.dim, { ox: 0.5 });
      const wIcon = this.add.image(-70, 70, WEAPONS[c.weapon].icon).setScale(3);
      const wName = txt(this, -44, 62, WEAPONS[c.weapon].name, 8, COLORS.gold, { wrap: 140 });
      const hp = txt(this, 0, 110, `HP ${c.hp}`, 10, COLORS.red, { ox: 0.5 });
      const bonus = txt(this, 0, 140, c.bonus, 8, COLORS.green, { ox: 0.5, align: 'center', wrap: 190 });
      it.container.add([hero, name, title, wIcon, wName, hp, bonus]);
      it.onSelect = () => {
        this.cameras.main.fadeOut(250);
        this.time.delayedCall(260, () => this.scene.start('Game', { character: id }));
      };
      return it;
    });
    this.nav = new Nav(this, items, { columns: ids.length, onCancel: () => this.scene.start('Menu') });
    txt(this, W / 2, H - 50, 'ENTER to start  -  ESC to go back', 10, COLORS.dim, { ox: 0.5 });
  }
}

export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create() {
    backdrop(this);
    hookAudioUnlock(this);
    this.save = loadSave();
    txt(this, W / 2, 50, 'POWER UPS', 32, COLORS.gold, { ox: 0.5 });
    txt(this, W / 2, 96, 'Permanent bonuses bought with gold from your runs', 10, COLORS.dim, { ox: 0.5 });
    this.add.image(W / 2 - 60, 136, 'coin').setScale(3);
    this.goldText = txt(this, W / 2 - 36, 126, '', 18, COLORS.gold);

    const ids = Object.keys(POWERUPS);
    const cols = 4;
    const cw = 270;
    const ch = 118;
    this.cards = {};
    const items = ids.map((id, i) => {
      const pu = POWERUPS[id];
      const x = W / 2 + ((i % cols) - (cols - 1) / 2) * (cw + 14);
      const y = 230 + Math.floor(i / cols) * (ch + 12);
      const it = card(this, x, y, cw, ch);
      const icon = this.add.image(-cw / 2 + 36, -14, pu.icon).setScale(4);
      const name = txt(this, -cw / 2 + 68, -42, pu.name, 11, COLORS.text);
      const desc = txt(this, -cw / 2 + 68, -18, pu.desc, 8, COLORS.dim, { wrap: 180 });
      const pips = this.add.graphics();
      const cost = txt(this, cw / 2 - 14, ch / 2 - 14, '', 10, COLORS.gold, { ox: 1, oy: 1 });
      it.container.add([icon, name, desc, pips, cost]);
      this.cards[id] = { pips, cost, pu };
      it.onSelect = () => this.buy(id);
      return it;
    });
    const back = button(this, W / 2 - 160, H - 50, 'BACK', 280, 50);
    back.onSelect = () => this.scene.start('Menu');
    const refund = button(this, W / 2 + 160, H - 50, 'REFUND ALL', 280, 50);
    refund.onSelect = () => this.refund();
    items.push(back, refund);
    new Nav(this, items, { columns: cols, onCancel: () => this.scene.start('Menu') });
    this.refresh();
  }

  spent() {
    let total = 0;
    for (const [id, lvl] of Object.entries(this.save.powerups)) for (let l = 0; l < lvl; l++) total += powerupCost(id, l);
    return total;
  }

  buy(id) {
    const lvl = this.save.powerups[id] || 0;
    const pu = POWERUPS[id];
    if (lvl >= pu.max) return;
    const cost = powerupCost(id, lvl);
    if (this.save.gold < cost) {
      this.cameras.main.shake(120, 0.005);
      audio.play('hurt');
      return;
    }
    this.save.gold -= cost;
    this.save.powerups[id] = lvl + 1;
    writeSave(this.save);
    audio.play('levelup');
    this.refresh();
  }

  refund() {
    this.save.gold += this.spent();
    this.save.powerups = {};
    writeSave(this.save);
    audio.play('pickup');
    this.refresh();
  }

  refresh() {
    this.goldText.setText(String(this.save.gold));
    for (const [id, c] of Object.entries(this.cards)) {
      const lvl = this.save.powerups[id] || 0;
      c.pips.clear();
      for (let i = 0; i < c.pu.max; i++) {
        c.pips.fillStyle(i < lvl ? 0xffd76a : 0x3a2f55).fillRect(-135 + 68 + i * 16, 22, 12, 12);
      }
      if (lvl >= c.pu.max) c.cost.setText('MAX').setColor(COLORS.green);
      else {
        const cost = powerupCost(id, lvl);
        c.cost.setText(`${cost}G`).setColor(this.save.gold >= cost ? COLORS.gold : COLORS.red);
      }
    }
  }
}
