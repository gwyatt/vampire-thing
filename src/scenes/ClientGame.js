// Online co-op client. Runs no simulation: it moves its own hunter locally
// (client-side prediction), streams that position to the host, and mirrors
// everything else from the host's display snapshots.

import Phaser from 'phaser';
import { audio } from '../audio.js';
import { BASE_STATS, CHARACTERS, PASSIVES } from '../data.js';
import { PLAYER_CSS, net, netOn } from '../net.js';
import { Mirror } from '../netsync.js';
import { loadSave, writeSave } from '../save.js';
import { FONT, onKeyDown } from '../ui.js';
import { WEAPONS } from '../weapons.js';
import { World } from '../world.js';
import { SPAWN_OFFSETS, VIEW_H, VIEW_W, ZOOM, applyFx, recordRun } from './Game.js';

const INPUT_INTERVAL = 33; // ms (~30 Hz)

export class ClientGameScene extends Phaser.Scene {
  constructor() {
    super('ClientGame');
  }

  init(data) {
    this.roster = data.players;
    this.localId = data.localId;
  }

  create() {
    this.save = loadSave();
    this.alive = true;
    this.mp = true;
    this.victory = false;
    this.clock = 0;
    this.kills = 0;
    this.goldRun = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = 5;
    this.inputBlocked = false;
    this.boss = null;
    this.chests = [];
    this.team = [];
    this.inputT = 0;
    this.hostMe = { px: 0, py: 0, x: 0, y: 0, t: 0 };

    const r = this.roster.find((q) => q.id === this.localId) || this.roster[0];
    const slot = r.slot ?? 0;
    const charId = r.charId in CHARACTERS ? r.charId : 'viktor';
    const [sx, sy] = SPAWN_OFFSETS[slot % 4];
    // `me` mirrors the fields the HUD/pause screens read from host players.
    this.me = {
      id: this.localId,
      slot,
      name: r.name,
      charId,
      char: CHARACTERS[charId],
      x: sx,
      y: sy,
      facing: 1,
      dirX: 1,
      dirY: 0,
      moving: false,
      animT: 0,
      frame: 0,
      hp: CHARACTERS[charId].hp,
      alive: true,
      stats: { ...BASE_STATS, maxHp: CHARACTERS[charId].hp },
      revivals: 0,
      weapons: [],
      passives: [],
      invVersion: 0,
      flashT: 0,
    };
    this.hostMe = { px: sx, py: sy, x: sx, y: sy };

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBackgroundColor('#0b0f0a');
    this.world = new World(this, VIEW_W, VIEW_H);
    this.mirror = new Mirror(this, this.localId);

    const me = this.me;
    this.shadow = this.add.image(me.x, me.y + 7, 'shadow').setDepth(-50);
    this.sprite = this.add.image(me.x, me.y, `hero_${charId}_0`);
    this.hpBg = this.add.image(0, 0, 'px').setOrigin(0, 0.5).setScale(9, 1.5).setTint(0x200000).setDepth(9800);
    this.hpFill = this.add.image(0, 0, 'px').setOrigin(0, 0.5).setScale(9, 1.5).setTint(0xe02030).setDepth(9801);
    this.label = this.add
      .text(0, 0, me.name, { fontFamily: FONT, fontSize: '8px', color: PLAYER_CSS[slot % 4], stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(9802);
    cam.startFollow(this.sprite, true, 1, 1);

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    onKeyDown(this, (ev) => {
      if (ev.code === 'Escape' || ev.code === 'KeyP') this.openPause();
      else if (ev.code === 'KeyM') {
        audio.unlock();
        audio.setMuted(!audio.muted);
        this.save.muted = audio.muted;
        writeSave(this.save);
      }
    });
    this.joy = { active: false, sx: 0, sy: 0, x: 0, y: 0 };
    this.input.on('pointerdown', (p) => {
      this.joy.active = true;
      this.joy.sx = this.joy.x = p.x;
      this.joy.sy = this.joy.y = p.y;
    });
    this.input.on('pointermove', (p) => {
      if (this.joy.active) {
        this.joy.x = p.x;
        this.joy.y = p.y;
      }
    });
    this.input.on('pointerup', () => (this.joy.active = false));

    netOn(this, 'binary', (buf) => this.mirror.ingest(buf));
    netOn(this, 'message', (m) => this.onNetMessage(m));
    netOn(this, 'closed', () => this.disconnected('Lost connection to the host'));

    this.scene.launch('UI', { source: 'ClientGame' });
    this.world.update(me.x, me.y);
    this.game.events.emit('banner', 'CO-OP', `${this.roster.length} hunters. Survive until the Reaper comes...`);
  }

  onNetMessage(m) {
    switch (m.t) {
      case 'meta':
        this.applyMeta(m);
        break;
      case 'levelup':
        if (!this.scene.isActive('LevelUp')) {
          audio.play('levelup');
          this.scene.launch('LevelUp', {
            choices: m.choices,
            level: m.level,
            mp: true,
            onPick: (i) => net.send({ t: 'choice', i }),
          });
        }
        break;
      case 'resume':
        this.scene.stop('LevelUp');
        break;
      case 'gameover':
        this.alive = false;
        recordRun(m.data);
        this.scene.stop('UI');
        this.scene.stop('LevelUp');
        this.scene.stop('Pause');
        this.scene.start('GameOver', m.data);
        break;
      case 'host-left':
        this.disconnected('The host left the game');
        break;
    }
  }

  disconnected(msg) {
    if (!this.alive) return;
    this.alive = false;
    net.close();
    for (const k of ['UI', 'LevelUp', 'Pause']) this.scene.stop(k);
    this.scene.start('Menu', { message: msg });
  }

  applyMeta(m) {
    this.clock = m.c;
    this.level = m.lv;
    this.xp = m.xp;
    this.xpNext = m.xn;
    this.kills = m.k;
    this.goldRun = m.g;
    this.victory = !!m.v;
    this.boss = m.b ? { type: m.b[0], hp: m.b[1], maxHp: m.b[2] } : null;
    this.chests = (m.ch || []).map(([x, y]) => ({ x, y }));
    const me = this.me;
    this.team = m.ps.map(([id, x, y, hp, maxHp, alive]) => {
      const r = this.roster.find((q) => q.id === id);
      return { id, slot: r?.slot ?? 0, name: r?.name || '?', x, y, hp, maxHp, alive: !!alive, local: id === this.localId };
    });
    const mine = m.ps.find((q) => q[0] === this.localId);
    if (mine) {
      if (mine[3] < me.hp) me.flashT = 0.12;
      me.hp = mine[3];
      me.stats.maxHp = mine[4];
      me.alive = !!mine[5];
      this.hostMe.px = this.hostMe.x;
      this.hostMe.py = this.hostMe.y;
      this.hostMe.x = mine[1];
      this.hostMe.y = mine[2];
    }
    if (m.inv) {
      me.stats = { ...m.inv.st };
      me.revivals = m.inv.rv;
      me.weapons = m.inv.w.filter(([id]) => WEAPONS[id]).map(([id, level]) => ({ id, level, def: WEAPONS[id], isMax: level >= WEAPONS[id].levels.length }));
      me.passives = m.inv.pa.filter(([id]) => PASSIVES[id]).map(([id, level]) => ({ id, level }));
      me.invVersion++;
    }
    for (const s of m.sfx || []) audio.play(s);
    for (const ev of m.fx || []) applyFx(this, ev);
  }

  readInput() {
    if (this.inputBlocked) return [0, 0];
    const k = this.keys;
    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (this.joy.active) {
      const dx = this.joy.x - this.joy.sx;
      const dy = this.joy.y - this.joy.sy;
      const len = Math.hypot(dx, dy);
      if (len > 10) {
        ix = dx / len;
        iy = dy / len;
      }
    }
    return [ix, iy];
  }

  update(time, delta) {
    if (!this.alive) return;
    const dt = Math.min(delta / 1000, 1 / 20);
    const me = this.me;
    // While the host is paused for a level up, nobody moves.
    const frozen = this.scene.isActive('LevelUp');
    let [ix, iy] = frozen ? [0, 0] : this.readInput();
    const len = Math.hypot(ix, iy);
    me.moving = len > 0.01;
    if (me.moving) {
      ix /= len;
      iy /= len;
      const sp = 95 * (me.stats.moveSpeed || 1);
      me.x += ix * sp * dt;
      me.y += iy * sp * dt;
      me.dirX = ix;
      me.dirY = iy;
      if (Math.abs(ix) > 0.1) me.facing = ix > 0 ? 1 : -1;
      me.animT += dt;
      if (me.animT > 0.14) {
        me.animT = 0;
        me.frame ^= 1;
      }
    } else me.frame = 0;

    this.inputT += delta;
    if (this.inputT >= INPUT_INTERVAL) {
      this.inputT = 0;
      net.send({ t: 'in', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, f: me.facing, dx: me.dirX, dy: me.dirY, fr: me.frame, mv: me.moving ? 1 : 0 });
    }

    // Own body (predicted)
    const s = this.sprite;
    const tex = `hero_${me.charId}_${me.frame}`;
    if (s.texture.key !== tex) s.setTexture(tex);
    s.setPosition(Math.round(me.x), Math.round(me.y)).setFlipX(me.facing < 0).setDepth(me.y);
    me.flashT -= dt;
    if (!me.alive) s.setAlpha(0.35).setTint(0x8080a0).setTintMode(Phaser.TintModes.MULTIPLY);
    else if (me.flashT > 0) s.setAlpha(1).setTint(0xff3030).setTintMode(Phaser.TintModes.FILL);
    else s.setAlpha(1).setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
    this.shadow.setPosition(me.x, me.y + 7).setVisible(me.alive);
    this.hpBg.setPosition(me.x - 9, me.y + 11).setVisible(me.alive);
    this.hpFill.setPosition(me.x - 9, me.y + 11).setVisible(me.alive);
    this.hpFill.scaleX = Math.max(0, 9 * (me.hp / (me.stats.maxHp || 1)));
    this.label.setPosition(me.x, me.y - 10);

    // Everything else, glued to our predicted position where needed
    const t = Phaser.Math.Clamp((performance.now() - this.mirror.tCur) / this.mirror.interval, 0, 1);
    const hx = this.hostMe.px + (this.hostMe.x - this.hostMe.px) * t;
    const hy = this.hostMe.py + (this.hostMe.y - this.hostMe.py) * t;
    this.mirror.render(new Map([[this.localId, { dx: me.x - hx, dy: me.y - hy }]]));
    this.world.update(me.x, me.y);
  }

  openPause() {
    if (!this.alive || this.scene.isActive('Pause') || this.scene.isActive('LevelUp')) return;
    this.inputBlocked = true;
    this.scene.launch('Pause', { source: 'ClientGame', mp: true });
  }

  leaveGame() {
    this.alive = false;
    net.close();
    this.scene.stop('UI');
    this.scene.start('Menu');
  }

  // HUD interface (same shape as GameScene's)
  bossInfo() {
    return this.boss;
  }

  chestPositions() {
    return this.chests;
  }

  teamInfo() {
    return this.team;
  }
}
