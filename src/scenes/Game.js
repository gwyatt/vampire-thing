// The authoritative game simulation. In solo play it runs with a single
// local player. In online co-op the host's browser runs this scene for
// everyone: remote players send their positions, and the host streams
// display snapshots + HUD state back (see netsync.js / ClientGame.js).

import Phaser from 'phaser';
import { audio } from '../audio.js';
import { BASE_STATS, CHARACTERS, ENEMIES, PASSIVES, POWERUPS, RUN_LENGTH, WAVES, xpForLevel } from '../data.js';
import { PLAYER_COLORS, PLAYER_CSS, net, netOn } from '../net.js';
import { SnapshotEncoder } from '../netsync.js';
import { loadSave, writeSave } from '../save.js';
import { FONT, onKeyDown } from '../ui.js';
import { BASE_WEAPON_IDS, WEAPONS, createWeapon, describeLevel } from '../weapons.js';
import { World } from '../world.js';

export const ZOOM = 2;
export const VIEW_W = 1280 / ZOOM;
export const VIEW_H = 720 / ZOOM;
const CELL = 48;
const MAX_ENEMIES = 500;
const MAX_GEMS = 350;
const TAU = Math.PI * 2;
const FILL = Phaser.TintModes.FILL;
const MULTIPLY = Phaser.TintModes.MULTIPLY;
const NET_INTERVAL = 50; // ms between snapshots (20 Hz)

export const SPAWN_OFFSETS = [
  [-14, 0],
  [14, 0],
  [0, -14],
  [0, 14],
];

const cellKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

function weighted(table) {
  let total = 0;
  for (const w of Object.values(table)) total += w;
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(table)) {
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(table)[0];
}

// Mark a display object as part of a player's body (see netsync.js).
function body(obj, p) {
  obj.__owner = p.id;
  obj.__body = true;
  return obj;
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.mp = !!data?.mp;
    this.roster = data?.players || [{ id: 0, charId: data?.character || 'viktor', name: 'P1' }];
    this.localId = data?.localId ?? 0;
  }

  create() {
    this.save = loadSave();
    this.alive = true;
    this.ended = false;
    this.victory = false;
    this.clock = 0;
    this.kills = 0;
    this.goldRun = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.pendingLevels = 0;
    this.freezeT = 0;
    this.spawnT = 0;
    this.propT = 3;
    this.lastMinute = -1;
    this.reaperSpawned = false;
    this.enemyUid = 1;
    this.inputBlocked = false;
    this.levelChoices = null;
    this.bossRef = null;

    this.enemies = [];
    this.freeEnemies = [];
    this.grid = new Map();
    this.projectiles = [];
    this.pickups = [];
    this.overflowGem = null;
    this.particles = [];
    this.numbers = [];
    this.freeNumbers = [];

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBackgroundColor('#0b0f0a');
    this.world = new World(this, VIEW_W, VIEW_H);

    this.players = this.roster.map((r, i) => this.createPlayer(r, r.slot ?? i));
    this.me = this.players.find((p) => p.id === this.localId);
    cam.startFollow(this.me.sprite, true, 1, 1);

    // Input
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

    if (this.mp) {
      this.encoder = new SnapshotEncoder(this);
      this.netT = 0;
      netOn(this, 'message', (m, from) => this.onNetMessage(m, from));
      netOn(this, 'closed', () => this.scene.start('Menu', { message: 'Lost connection to the server' }));
    } else {
      this.game.events.on('blur', this.onBlur, this);
      this.events.once('shutdown', () => this.game.events.off('blur', this.onBlur, this));
    }

    this.scene.launch('UI', { source: 'Game' });
    this.world.update(this.me.x, this.me.y);
    const sub = this.mp ? `${this.players.length} hunters. Survive until the Reaper comes...` : 'Survive until the Reaper comes...';
    this.showBanner(this.mp ? 'CO-OP' : this.me.char.name.toUpperCase(), sub);
  }

  onBlur() {
    if (this.alive && this.scene.isActive()) this.openPause();
  }

  /* ---------------------------------------------------------------- */
  /* Players                                                           */
  /* ---------------------------------------------------------------- */

  createPlayer(r, slot) {
    const char = CHARACTERS[r.charId] || CHARACTERS.viktor;
    const local = r.id === this.localId;
    const [ox, oy] = this.mp ? SPAWN_OFFSETS[slot % 4] : [0, 0];
    const p = {
      id: r.id,
      slot,
      name: r.name || `P${slot + 1}`,
      local,
      connected: true,
      charId: r.charId in CHARACTERS ? r.charId : 'viktor',
      char,
      powerups: local ? this.save.powerups || {} : r.powerups || {},
      x: ox,
      y: oy,
      facing: 1,
      dirX: 1,
      dirY: 0,
      moving: false,
      animT: 0,
      frame: 0,
      invuln: 0,
      alive: true,
      weapons: [],
      retired: [],
      passives: [],
      invVersion: 0,
      sentInv: -1,
      sfxQ: new Set(),
      fxQ: [],
    };
    p.shadow = body(this.add.image(p.x, p.y + 7, 'shadow').setDepth(-50), p);
    p.sprite = body(this.add.image(p.x, p.y, `hero_${p.charId}_0`), p);
    p.hpBg = body(this.add.image(0, 0, 'px').setOrigin(0, 0.5).setScale(9, 1.5).setTint(0x200000).setDepth(9800), p);
    p.hpFill = body(this.add.image(0, 0, 'px').setOrigin(0, 0.5).setScale(9, 1.5).setTint(0xe02030).setDepth(9801), p);
    if (this.mp) {
      p.label = body(
        this.add
          .text(0, 0, p.name, { fontFamily: FONT, fontSize: '8px', color: PLAYER_CSS[slot % 4], stroke: '#000', strokeThickness: 3 })
          .setOrigin(0.5, 1)
          .setDepth(9802),
        p,
      );
    }
    this.recalcStats(p);
    p.hp = p.stats.maxHp;
    this.addWeapon(p, char.weapon);
    return p;
  }

  alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  nearestPlayer(x, y) {
    let best = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  randomAlivePlayer() {
    const a = this.alivePlayers();
    return a.length ? a[(Math.random() * a.length) | 0] : this.me;
  }

  /* ---------------------------------------------------------------- */
  /* Stats & inventory                                                 */
  /* ---------------------------------------------------------------- */

  recalcStats(p) {
    const s = { ...BASE_STATS };
    const apply = (mods, mult = 1) => {
      for (const [k, v] of Object.entries(mods)) s[k] += v * mult;
    };
    apply(p.char.mods);
    for (const [id, lvl] of Object.entries(p.powerups)) {
      if (POWERUPS[id]) apply(POWERUPS[id].mods, Math.min(Number(lvl) || 0, POWERUPS[id].max));
    }
    for (const q of p.passives) apply(PASSIVES[q.id].mods, q.level);
    s.cooldown = Math.max(0.4, s.cooldown);
    s.maxHp = Math.round(p.char.hp * s.maxHpMult);
    const prevMax = p.stats?.maxHp;
    p.stats = s;
    if (prevMax && s.maxHp > prevMax) p.hp += s.maxHp - prevMax;
    if (p.revivals === undefined) p.revivals = s.revival;
  }

  addWeapon(p, id) {
    const w = createWeapon(this, id, p);
    p.weapons.push(w);
    p.invVersion++;
    return w;
  }

  addPassive(p, id) {
    const q = p.passives.find((x) => x.id === id);
    if (q) q.level++;
    else p.passives.push({ id, level: 1 });
    this.recalcStats(p);
    p.invVersion++;
  }

  passiveLevel(p, id) {
    return p.passives.find((q) => q.id === id)?.level || 0;
  }

  buildChoices(p) {
    const pool = [];
    for (const w of p.weapons) {
      if (!w.isMax) pool.push({ kind: 'weapon', id: w.id, level: w.level + 1, weight: 1.3 });
    }
    for (const q of p.passives) {
      if (q.level < PASSIVES[q.id].max) pool.push({ kind: 'passive', id: q.id, level: q.level + 1, weight: 1.1 });
    }
    if (p.weapons.length < 6) {
      for (const id of BASE_WEAPON_IDS) {
        const owned = p.weapons.some((w) => w.id === id || w.id === WEAPONS[id].evo?.into);
        if (!owned) pool.push({ kind: 'weapon', id, level: 1, weight: 1 });
      }
    }
    if (p.passives.length < 6) {
      for (const id of Object.keys(PASSIVES)) {
        if (!this.passiveLevel(p, id)) pool.push({ kind: 'passive', id, level: 1, weight: 0.9 });
      }
    }
    const n = 3 + (Math.random() < (p.stats.luck - 1) * 1.5 ? 1 : 0);
    const out = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((a, c) => a + c.weight, 0);
      let r = Math.random() * total;
      let i = 0;
      for (; i < pool.length; i++) {
        r -= pool[i].weight;
        if (r <= 0) break;
      }
      out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
    }
    if (!out.length) out.push({ kind: 'heal' }, { kind: 'gold' });
    return out.map((c) => this.describeChoice(p, c));
  }

  // Everything the level-up card needs, so clients don't need game state.
  describeChoice(p, c) {
    const { weight, ...rest } = c;
    if (c.kind === 'weapon') {
      const d = WEAPONS[c.id];
      let hint = null;
      if (d.evo) hint = { text: `Evolves with ${PASSIVES[d.evo.with].name}`, ok: this.passiveLevel(p, d.evo.with) > 0 };
      return { ...rest, name: d.name, icon: d.icon, desc: c.level === 1 ? d.desc : describeLevel(c.id, c.level), hint };
    }
    if (c.kind === 'passive') {
      const d = PASSIVES[c.id];
      const pairs = Object.values(WEAPONS)
        .filter((w) => w.evo?.with === c.id)
        .map((w) => w.name);
      return { ...rest, name: d.name, icon: d.icon, desc: d.desc, hint: pairs.length ? { text: `Evolves ${pairs.join(', ')}`, ok: false } : null };
    }
    if (c.kind === 'heal') return { ...rest, name: 'Floor Chicken', icon: 'chicken', desc: 'Heals 30 HP', hint: null };
    return { ...rest, name: 'Gold Coins', icon: 'bag', desc: 'Gain 25 gold', hint: null };
  }

  applyChoice(p, c) {
    if (c.kind === 'weapon') {
      const w = p.weapons.find((q) => q.id === c.id);
      if (w) {
        if (!w.isMax) w.levelUp();
      } else if (p.weapons.length < 6 && BASE_WEAPON_IDS.includes(c.id)) this.addWeapon(p, c.id);
    } else if (c.kind === 'passive') {
      const lvl = this.passiveLevel(p, c.id);
      if (PASSIVES[c.id] && lvl < PASSIVES[c.id].max && (lvl > 0 || p.passives.length < 6)) this.addPassive(p, c.id);
    } else if (c.kind === 'heal') {
      this.heal(p, 30);
    } else {
      this.addGold(25, p);
    }
    p.invVersion++;
  }

  canEvolve(p, w) {
    const evo = w.def.evo;
    return evo && w.isMax && this.passiveLevel(p, evo.with) > 0;
  }

  evolve(p, w) {
    const i = p.weapons.indexOf(w);
    w.destroy();
    p.retired.push(w);
    const nw = createWeapon(this, w.def.evo.into, p);
    p.weapons[i] = nw;
    p.invVersion++;
    return nw;
  }

  openChest(p) {
    const r = Math.random();
    const luck = p.stats.luck;
    const count = r < 0.03 * luck ? 5 : r < 0.12 * luck ? 3 : 1;
    const rewards = [];
    for (let i = 0; i < count; i++) {
      const evolvable = p.weapons.find((w) => this.canEvolve(p, w));
      if (evolvable) {
        const from = evolvable.def.name;
        const nw = this.evolve(p, evolvable);
        rewards.push({ icon: nw.def.icon, name: nw.def.name, desc: `${from} evolved!`, evo: true });
        continue;
      }
      const ups = [
        ...p.weapons.filter((w) => !w.isMax).map((w) => ({ kind: 'weapon', id: w.id, level: w.level + 1 })),
        ...p.passives.filter((q) => q.level < PASSIVES[q.id].max).map((q) => ({ kind: 'passive', id: q.id, level: q.level + 1 })),
      ];
      if (ups.length) {
        const c = this.describeChoice(p, Phaser.Utils.Array.GetRandom(ups));
        this.applyChoice(p, c);
        rewards.push({ icon: c.icon, name: c.name, desc: c.kind === 'weapon' ? `Level ${c.level}` : `Level ${c.level}: ${c.desc}` });
      } else {
        this.addGold(50, p);
        rewards.push({ icon: 'bag', name: 'Gold', desc: '+50 gold' });
      }
    }
    const gold = Math.round((20 + Math.random() * 40) * count);
    this.addGold(gold, p);
    p.invVersion++;
    this.sfx('chest');
    if (!this.mp) {
      this.scene.pause();
      this.scene.launch('Chest', { rewards, gold });
      return;
    }
    // Co-op: no pause; everyone gets a toast saying who found what.
    this.fx({ k: 'toast', title: `${p.name} found treasure!`, color: PLAYER_CSS[p.slot % 4], items: rewards, gold });
  }

  /* ---------------------------------------------------------------- */
  /* Main loop                                                         */
  /* ---------------------------------------------------------------- */

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 20);
    this.updateParticles(dt);
    if (!this.alive) return;
    this.clock += dt;
    if (this.freezeT > 0) this.freezeT -= dt;
    this.updatePlayers(dt);
    this.updateDirector(dt);
    this.updateEnemies(dt);
    this.rebuildGrid();
    for (const p of this.players) if (p.alive) for (const w of p.weapons) w.update(dt);
    this.updateProjectiles(dt);
    for (const p of this.players) if (p.alive) this.updateContact(p);
    this.updatePickups(dt);
    this.world.update(this.me.x, this.me.y);
    if (this.mp) this.updateNet(delta);
    if (this.pendingLevels > 0 && this.alive) this.openLevelUp();
  }

  readLocalInput() {
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

  updatePlayers(dt) {
    for (const p of this.players) {
      if (p.local) {
        let [ix, iy] = this.readLocalInput();
        const len = Math.hypot(ix, iy);
        p.moving = len > 0.01;
        if (p.moving) {
          ix /= len;
          iy /= len;
          const sp = 95 * p.stats.moveSpeed;
          p.x += ix * sp * dt;
          p.y += iy * sp * dt;
          p.dirX = ix;
          p.dirY = iy;
          if (Math.abs(ix) > 0.1) p.facing = ix > 0 ? 1 : -1;
          p.animT += dt;
          if (p.animT > 0.14) {
            p.animT = 0;
            p.frame ^= 1;
          }
        } else p.frame = 0;
      }
      // remote players' positions arrive via onNetMessage('in')
      if (p.alive && p.stats.recovery > 0) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.recovery * dt);
      p.invuln -= dt;
      this.updatePlayerVisual(p);
    }
  }

  updatePlayerVisual(p) {
    const s = p.sprite;
    const tex = `hero_${p.charId}_${p.frame}`;
    if (s.texture.key !== tex) s.setTexture(tex);
    s.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(p.facing < 0).setDepth(p.y);
    if (p.alive) {
      s.setAlpha(p.invuln > 0 && Math.floor(p.invuln * 20) % 2 ? 0.5 : 1);
      if (!p.hurtT || this.clock > p.hurtT) s.setTint(0xffffff).setTintMode(MULTIPLY);
    } else {
      s.setAlpha(0.35).setTint(0x8080a0).setTintMode(MULTIPLY);
    }
    p.shadow.setPosition(p.x, p.y + 7).setVisible(p.alive);
    p.hpBg.setPosition(p.x - 9, p.y + 11).setVisible(p.alive);
    p.hpFill.setPosition(p.x - 9, p.y + 11).setVisible(p.alive);
    p.hpFill.scaleX = Math.max(0, 9 * (p.hp / p.stats.maxHp));
    p.label?.setPosition(p.x, p.y - 10);
  }

  /* ---------------------------------------------------------------- */
  /* Networking (host side)                                            */
  /* ---------------------------------------------------------------- */

  onNetMessage(m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'peer-join') {
      net.send({ t: 'error', msg: 'That game is already in progress' }, m.id);
      net.kick(m.id, 'in progress');
      return;
    }
    if (m.t === 'peer-leave') {
      this.removePlayer(m.id);
      if (net.session) net.session.players = net.session.players.filter((q) => q.id !== m.id);
      return;
    }
    const p = this.players.find((q) => q.id === from && !q.local);
    if (!p) return;
    if (m.t === 'in') {
      const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
      // Clients are trusted for their own movement, but clamp the step so a
      // glitch can't teleport anyone across the map.
      const nx = num(m.x, p.x);
      const ny = num(m.y, p.y);
      const step = Math.hypot(nx - p.x, ny - p.y);
      const maxStep = 400;
      if (step <= maxStep) {
        p.x = nx;
        p.y = ny;
      }
      p.facing = m.f < 0 ? -1 : 1;
      const dl = Math.hypot(num(m.dx), num(m.dy));
      if (dl > 0.01) {
        p.dirX = num(m.dx) / dl;
        p.dirY = num(m.dy) / dl;
      }
      p.frame = m.fr ? 1 : 0;
      p.moving = !!m.mv;
    } else if (m.t === 'choice') {
      this.submitChoice(p.id, m.i);
    }
  }

  removePlayer(id) {
    const p = this.players.find((q) => q.id === id);
    if (!p || p.local) return;
    p.connected = false;
    p.alive = false;
    for (const w of p.weapons) w.destroy();
    for (const o of [p.sprite, p.shadow, p.hpBg, p.hpFill, p.label]) o?.destroy();
    this.players.splice(this.players.indexOf(p), 1);
    this.fx({ k: 'banner', a: `${p.name} LEFT`, b: '' });
    if (this.levelChoices?.has(id)) {
      this.levelChoices.delete(id);
      if (this.levelChoices.size === 0) this.finishLevelUp();
    }
    if (this.alive && !this.alivePlayers().length) this.die(null);
  }

  updateNet(delta) {
    this.netT += delta;
    if (this.netT < NET_INTERVAL) return;
    this.netT = 0;
    this.sendNet();
  }

  sendNet() {
    for (const p of this.players) {
      if (p.local || !p.connected) continue;
      const snap = this.encoder.encode(p.x, p.y, VIEW_W / 2 + 40, VIEW_H / 2 + 40);
      net.sendBinary(p.id, snap);
      net.send(this.buildMeta(p), p.id);
      p.sfxQ.clear();
      p.fxQ.length = 0;
    }
  }

  buildMeta(p) {
    const b = this.bossRef?.alive ? this.bossRef : null;
    const meta = {
      t: 'meta',
      c: Math.round(this.clock * 100) / 100,
      lv: this.level,
      xp: Math.round(this.xp * 10) / 10,
      xn: this.xpNext,
      k: this.kills,
      g: this.goldRun,
      v: this.victory ? 1 : 0,
      ps: this.players.map((q) => [q.id, Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, Math.ceil(q.hp), q.stats.maxHp, q.alive ? 1 : 0]),
      b: b ? [b.type, Math.round(b.hp), Math.round(b.maxHp)] : 0,
      ch: this.pickups.filter((k) => k.kind === 'chest').map((k) => [Math.round(k.x), Math.round(k.y)]),
    };
    if (p.sfxQ.size) meta.sfx = [...p.sfxQ];
    if (p.fxQ.length) meta.fx = p.fxQ.slice();
    if (p.sentInv !== p.invVersion) {
      p.sentInv = p.invVersion;
      meta.inv = {
        st: p.stats,
        rv: p.revivals,
        w: p.weapons.map((w) => [w.id, w.level]),
        pa: p.passives.map((q) => [q.id, q.level]),
      };
    }
    return meta;
  }

  // Sound for everyone (target null) or for one player only.
  sfx(name, target = null) {
    if (!target || target.local) audio.play(name);
    if (!this.mp) return;
    for (const p of this.players) if (!p.local && (!target || target === p)) p.sfxQ.add(name);
  }

  // Screen effects: banner / toast / shake / flash, for everyone or one player.
  fx(ev, target = null) {
    if (!target || target.local) applyFx(this, ev);
    if (!this.mp) return;
    for (const p of this.players) if (!p.local && (!target || target === p)) p.fxQ.push(ev);
  }

  showBanner(title, sub) {
    this.fx({ k: 'banner', a: title, b: sub });
  }

  /* ---------------------------------------------------------------- */
  /* Spawning                                                          */
  /* ---------------------------------------------------------------- */

  get minute() {
    return Math.floor(this.clock / 60);
  }

  updateDirector(dt) {
    if (this.clock >= RUN_LENGTH) {
      if (!this.reaperSpawned) this.spawnReaper();
      return;
    }
    const wave = WAVES[Math.min(this.minute, WAVES.length - 1)];
    const crowd = 1 + 0.6 * (this.alivePlayers().length - 1);
    if (this.minute !== this.lastMinute) {
      this.lastMinute = this.minute;
      if (wave.elite) for (let i = 0; i < Math.max(1, Math.round(crowd)); i++) this.spawnEnemy(wave.elite, { elite: true });
      if (wave.boss) this.spawnBoss(wave.boss);
      if (wave.event === 'batSwarm') this.batSwarm();
      if (wave.event === 'zombieRing') this.zombieRing();
    }
    this.spawnT += dt;
    if (this.spawnT >= wave.interval) {
      this.spawnT = 0;
      const count = this.enemyCount();
      const min = Math.round(wave.min * crowd);
      let n = count < min ? Math.min(min - count, 20) : Math.round((1 + Math.floor(this.minute / 4)) * crowd);
      n = Math.min(n, MAX_ENEMIES - this.enemies.length);
      for (let i = 0; i < n; i++) this.spawnEnemy(weighted(wave.pool));
    }
    this.propT -= dt;
    if (this.propT <= 0) {
      this.propT = 5;
      const props = this.enemies.filter((e) => e.prop && e.alive).length;
      if (props < 3 + this.players.length) {
        const p = this.randomAlivePlayer();
        const a = Math.random() * TAU;
        const d = 260 + Math.random() * 200;
        this.spawnEnemy('brazier', { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
      }
    }
  }

  enemyCount() {
    let n = 0;
    for (const e of this.enemies) if (e.alive && !e.prop) n++;
    return n;
  }

  // A random point just outside a player's view.
  edgePoint(p = this.randomAlivePlayer(), margin = 30) {
    const w = VIEW_W + margin * 2;
    const h = VIEW_H + margin * 2;
    const per = Math.random() * (w + h) * 2;
    let x;
    let y;
    if (per < w) {
      x = per;
      y = 0;
    } else if (per < w + h) {
      x = w;
      y = per - w;
    } else if (per < w * 2 + h) {
      x = per - w - h;
      y = h;
    } else {
      x = 0;
      y = per - w * 2 - h;
    }
    return { x: p.x - w / 2 + x, y: p.y - h / 2 + y };
  }

  spawnEnemy(type, opts = {}) {
    const isProp = type === 'brazier';
    const def = isProp ? { tex: 'brazier', hp: 1, speed: 0, dmg: 0, xp: 0, radius: 6, flap: true, blood: 0xff8a20 } : ENEMIES[type];
    let e = this.freeEnemies.pop();
    if (!e) {
      e = { sprite: this.add.image(0, 0, `${def.tex}_0`) };
      this.enemies.push(e);
    }
    const pos = opts.x !== undefined ? opts : this.edgePoint();
    const scaleT = (1 + this.minute * 0.12) * (1 + 0.15 * (this.players.length - 1));
    e.id = this.enemyUid++;
    e.type = type;
    e.def = def;
    e.x = pos.x;
    e.y = pos.y;
    e.alive = true;
    e.prop = isProp;
    e.elite = !!opts.elite;
    e.boss = !!(opts.boss || def.boss);
    e.maxHp = e.hp = def.hp * (isProp ? 1 : scaleT) * (e.elite ? 15 : 1) * (opts.hpMult || 1);
    e.speed = def.speed * (e.elite ? 1.1 : 1) * (opts.speedMult || 1);
    e.dmg = def.dmg * (isProp ? 1 : 1 + this.minute * 0.06) * (e.elite ? 1.5 : 1) * (opts.dmgMult || 1);
    e.scale = (def.scale || 1) * (e.elite ? 2 : 1) * (opts.scale || 1);
    e.radius = def.radius * e.scale;
    e.kbx = e.kby = 0;
    e.flash = 0;
    e.hitTimes = {};
    e.animT = Math.random();
    e.frame = 0;
    e.vx = opts.vx || 0;
    e.vy = opts.vy || 0;
    e.life = opts.life || 0;
    e.tint = opts.tint ?? (e.elite ? 0xffb0b0 : 0xffffff);
    const s = e.sprite;
    s.setTexture(`${def.tex}_0`).setVisible(true).setActive(true).setScale(e.scale).setAlpha(def.alpha || 1).setAngle(0);
    s.setTint(e.tint).setTintMode(MULTIPLY);
    s.setOrigin(0.5, 0.5);
    s.setPosition(e.x, e.y);
    return e;
  }

  spawnBoss(type) {
    const e = this.spawnEnemy(type, { boss: true, hpMult: 45, scale: 3, dmgMult: 2, speedMult: 0.85, tint: 0xd0a0ff });
    this.bossRef = e;
    this.sfx('boss');
    this.showBanner('A POWERFUL FOE APPROACHES', '');
  }

  spawnReaper() {
    this.reaperSpawned = true;
    this.victory = true;
    for (const e of this.enemies) if (e.alive && !e.prop) this.killEnemy(e, null, true);
    for (const p of this.players) {
      for (let i = 0; i < 1 + (p.revivals || 0); i++) this.bossRef = this.spawnEnemy('reaper', this.edgePoint(p));
    }
    this.sfx('boss');
    this.fx({ k: 'flash', d: 600, c: [255, 255, 255] });
    this.showBanner('THE REAPER HAS COME', 'You survived. Now face your end.');
  }

  batSwarm() {
    for (const p of this.alivePlayers()) {
      const side = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 40; i++) {
        this.spawnEnemy('bat', {
          x: p.x - side * (VIEW_W / 2 + 30 + Math.random() * 80),
          y: p.y + (Math.random() - 0.5) * VIEW_H * 0.9,
          vx: side * (95 + Math.random() * 20),
          vy: 0,
          life: 12,
        });
      }
    }
  }

  zombieRing() {
    for (const p of this.alivePlayers()) {
      const n = 40;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        this.spawnEnemy('zombie', { x: p.x + Math.cos(a) * 240, y: p.y + Math.sin(a) * 240, speedMult: 0.8 });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Enemies                                                           */
  /* ---------------------------------------------------------------- */

  updateEnemies(dt) {
    const frozen = this.freezeT > 0;
    const decay = Math.min(1, 9 * dt);
    const alive = this.alivePlayers();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const s = e.sprite;
      if (!e.prop && !frozen && alive.length) {
        // chase the nearest living player
        let p = alive[0];
        let bd = Infinity;
        for (const q of alive) {
          const d = (q.x - e.x) ** 2 + (q.y - e.y) ** 2;
          if (d < bd) {
            bd = d;
            p = q;
          }
        }
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.sqrt(bd) || 1;
        if (e.life > 0) {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          e.life -= dt;
          if (e.life <= 0) {
            this.despawn(e);
            continue;
          }
        } else {
          let sp = e.speed;
          if (e.type === 'bat' || e.type === 'redbat') sp *= 0.85 + Math.sin(this.clock * 6 + e.id) * 0.3;
          e.x += (dx / dist) * sp * dt;
          e.y += (dy / dist) * sp * dt;
          // Recycle stragglers that fell far behind
          if (dist > 620 && !e.boss) {
            const pt = this.edgePoint(p);
            e.x = pt.x;
            e.y = pt.y;
          }
        }
        if (e.kbx || e.kby) {
          e.x += e.kbx * dt;
          e.y += e.kby * dt;
          e.kbx -= e.kbx * decay;
          e.kby -= e.kby * decay;
          if (Math.abs(e.kbx) < 1) e.kbx = 0;
          if (Math.abs(e.kby) < 1) e.kby = 0;
        }
        // Soft separation against neighbours in the same cell
        const bucket = this.grid.get(cellKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL)));
        if (bucket) {
          let checks = 0;
          for (const o of bucket) {
            if (o === e || !o.alive || o.prop) continue;
            if (++checks > 6) break;
            const ox = e.x - o.x;
            const oy = e.y - o.y;
            const rr = (e.radius + o.radius) * 0.8;
            const d2 = ox * ox + oy * oy;
            if (d2 < rr * rr && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const push = ((rr - d) / d) * 0.5;
              const wE = e.boss ? 0.1 : 1;
              e.x += ox * push * wE;
              e.y += oy * push * wE;
            }
          }
        }
        s.setFlipX(e.life > 0 ? e.vx < 0 : dx < 0);
      }
      // Animation
      e.animT += dt;
      const frameT = e.def.flap ? 0.15 : 0.3;
      if (e.animT > frameT && !frozen) {
        e.animT = 0;
        e.frame ^= 1;
        s.setTexture(`${e.def.tex}_${e.frame}`);
      }
      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) s.setTint(frozen ? 0x7ab8ff : e.tint).setTintMode(MULTIPLY);
      }
      s.setPosition(e.x, e.y);
      s.setDepth(e.y + (e.boss ? 20 : 0));
    }
  }

  rebuildGrid() {
    const g = this.grid;
    g.clear();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const k = cellKey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      let b = g.get(k);
      if (!b) {
        b = [];
        g.set(k, b);
      }
      b.push(e);
    }
  }

  queryCircle(x, y, r, fn) {
    const pad = r + 30; // allow for large enemy radii
    const x0 = Math.floor((x - pad) / CELL);
    const x1 = Math.floor((x + pad) / CELL);
    const y0 = Math.floor((y - pad) / CELL);
    const y1 = Math.floor((y + pad) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.grid.get(cellKey(cx, cy));
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          if (!e.alive) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const rr = r + e.radius;
          if (dx * dx + dy * dy <= rr * rr) fn(e);
        }
      }
    }
  }

  queryRect(xa, ya, xb, yb, fn) {
    const x0 = Math.floor((xa - 30) / CELL);
    const x1 = Math.floor((xb + 30) / CELL);
    const y0 = Math.floor((ya - 30) / CELL);
    const y1 = Math.floor((yb + 30) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.grid.get(cellKey(cx, cy));
        if (!b) continue;
        for (const e of b) {
          if (!e.alive) continue;
          const r = e.radius;
          if (e.x + r >= xa && e.x - r <= xb && e.y + r >= ya && e.y - r <= yb) fn(e);
        }
      }
    }
  }

  nearestEnemy(x, y, maxD) {
    let best = null;
    let bd = maxD * maxD;
    for (const e of this.enemies) {
      if (!e.alive || e.prop) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // A random enemy on the given player's screen.
  randomVisibleEnemy(p) {
    const list = [];
    for (const e of this.enemies) {
      if (e.alive && !e.prop && Math.abs(e.x - p.x) < VIEW_W / 2 && Math.abs(e.y - p.y) < VIEW_H / 2) list.push(e);
    }
    return list.length ? list[(Math.random() * list.length) | 0] : null;
  }

  canHit(e, weapon, cd) {
    const t = e.hitTimes[weapon.uid];
    if (t !== undefined && this.clock - t < cd) return false;
    e.hitTimes[weapon.uid] = this.clock;
    return true;
  }

  damageEnemy(e, dmg, weapon, kx = 0, ky = 0, kb = 1, crit = false) {
    if (!e.alive) return false;
    dmg = Math.max(1, dmg);
    e.hp -= dmg;
    if (weapon) weapon.damageDealt += Math.min(dmg, e.hp + dmg);
    if (!e.prop) this.damageNumber(e.x, e.y - 8 * e.scale, dmg, crit);
    e.flash = 0.1;
    e.sprite.setTint(0xffffff).setTintMode(FILL);
    if (kb && !e.boss && !e.prop && e.life <= 0) {
      const f = 110 * kb * (e.elite ? 0.25 : 1);
      e.kbx = kx * f;
      e.kby = ky * f;
    }
    this.sfx('hit');
    if (e.hp <= 0) {
      this.killEnemy(e, weapon);
      return true;
    }
    return false;
  }

  killEnemy(e, weapon, silent = false) {
    if (!e.alive) return;
    e.alive = false;
    if (!silent && !e.prop) {
      this.kills++;
      if (weapon) weapon.kills++;
    }
    this.burstParticles(e.x, e.y, e.def.blood, e.boss ? 24 : e.elite ? 12 : 4);
    if (e.prop) {
      this.dropFromProp(e.x, e.y, weapon?.owner);
    } else if (!silent) {
      if (e.def.xp) this.dropGem(e.x, e.y, e.def.xp * (e.elite ? 10 : 1) * (e.boss ? 30 : 1));
      const luck = weapon?.owner?.stats.luck ?? 1;
      if (e.elite || (e.boss && e.type !== 'reaper')) this.addPickup('chest', e.x, e.y);
      else if (Math.random() < 0.006 * luck) this.addPickup('coin', e.x + 4, e.y);
      if (e === this.bossRef) this.bossRef = null;
      this.sfx('kill');
    }
    const s = e.sprite;
    s.setTint(0xffffff).setTintMode(FILL);
    this.tweens.add({
      targets: s,
      alpha: 0,
      scaleX: e.scale * 1.3,
      scaleY: e.scale * 0.2,
      duration: 220,
      onComplete: () => {
        s.setVisible(false);
        this.freeEnemies.push(e);
      },
    });
  }

  despawn(e) {
    e.alive = false;
    e.sprite.setVisible(false);
    this.freeEnemies.push(e);
  }

  /* ---------------------------------------------------------------- */
  /* Projectiles                                                       */
  /* ---------------------------------------------------------------- */

  addProjectile(cfg) {
    const s = this.add.image(cfg.x, cfg.y, cfg.tex).setDepth(9000).setScale(cfg.scale || 1);
    const p = { ...cfg, sprite: s, hit: new Set(), age: 0 };
    if (cfg.faceVelocity) s.rotation = Math.atan2(cfg.vy, cfg.vx);
    this.projectiles.push(p);
    return p;
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const pl = p.weapon.owner;
      p.age += dt;
      if (p.gravity) p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const s = p.sprite;
      s.setPosition(p.x, p.y);
      if (p.spin) s.rotation += p.spin * dt;
      if (p.growth) s.setScale((p.scale || 1) * (1 + p.age * p.growth));
      let dead = p.age >= p.life || Math.abs(p.x - pl.x) > 700 || Math.abs(p.y - pl.y) > 500;
      if (!dead) {
        const r = p.radius * (p.growth ? 1 + p.age * p.growth : 1);
        this.queryCircle(p.x, p.y, r, (e) => {
          if (dead || p.hit.has(e.id)) return;
          p.hit.add(e.id);
          const len = Math.hypot(p.vx, p.vy) || 1;
          this.damageEnemy(e, p.dmg, p.weapon, p.vx / len, p.vy / len, 0.7);
          if (!e.prop) {
            p.pierce--;
            if (p.pierce < 0) dead = true;
          }
        });
      }
      if (dead) {
        this.tweens.add({ targets: s, alpha: 0, duration: 80, onComplete: () => s.destroy() });
        this.projectiles.splice(i, 1);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Player damage                                                     */
  /* ---------------------------------------------------------------- */

  updateContact(p) {
    if (p.invuln > 0) return;
    // The strongest touching enemy hits fully, the rest of the crowd adds a bit.
    let max = 0;
    let rest = 0;
    this.queryCircle(p.x, p.y, 5, (e) => {
      if (e.prop || this.freezeT > 0) return;
      rest += Math.min(max, e.dmg);
      max = Math.max(max, e.dmg);
    });
    if (max > 0) this.takeDamage(p, max + Math.min(rest * 0.25, max));
  }

  takeDamage(p, d) {
    d = Math.max(1, d - p.stats.armor);
    p.hp -= d;
    p.invuln = 0.4;
    p.hurtT = this.clock + 0.09;
    p.sprite.setTint(0xff3030).setTintMode(FILL);
    this.sfx('hurt', p);
    this.fx({ k: 'shake' }, p);
    if (p.hp <= 0) this.die(p);
  }

  heal(p, n, silent = false) {
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + n);
    if (!silent && p.hp > before) {
      this.sfx('heal', p);
      this.damageNumber(p.x, p.y - 14, Math.round(p.hp - before), false, '#7af07a');
    }
  }

  addGold(n, p = this.me) {
    this.goldRun += Math.round(n * p.stats.greed);
  }

  revive(p, frac = 0.5) {
    p.alive = true;
    p.hp = Math.max(1, p.stats.maxHp * frac);
    p.invuln = 2.5;
    for (const w of p.weapons) w.timer = 0.3;
  }

  // p = the player who died, or null when the last player disconnected.
  die(p) {
    if (p) {
      if (p.revivals > 0) {
        p.revivals--;
        p.invVersion++;
        this.revive(p);
        this.fx({ k: 'flash', d: 500, c: [255, 220, 120] }, p);
        this.sfx('levelup', p);
        this.fx({ k: 'banner', a: 'REVIVED', b: '' }, p);
        this.queryCircle(p.x, p.y, 200, (e) => {
          if (!e.boss && !e.prop) this.killEnemy(e, null);
        });
        return;
      }
      p.alive = false;
      p.hp = 0;
      for (const w of p.weapons) w.sleep?.();
      this.sfx('death', p);
      this.burstParticles(p.x, p.y, 0xe02030, 16);
      if (this.alivePlayers().length) {
        this.fx({ k: 'banner', a: `${p.name} HAS FALLEN`, b: 'Fallen hunters return at the next level up' });
        return;
      }
    }
    this.alive = false;
    for (const q of this.players) {
      this.tweens.add({ targets: q.sprite, alpha: 0, angle: 90, duration: 1200 });
    }
    this.time.delayedCall(1500, () => this.endRun());
  }

  weaponStats(p) {
    return [...p.retired, ...p.weapons].map((w) => ({
      name: w.def.name,
      icon: w.def.icon,
      level: w.def.evolved ? 'MAX' : w.level,
      damage: Math.round(w.damageDealt),
      dps: Math.round(w.damageDealt / Math.max(1, this.clock - w.createdAt)),
      kills: w.kills,
    }));
  }

  endRun() {
    if (this.ended) return;
    this.ended = true;
    this.alive = false;
    const base = { victory: this.victory, time: this.clock, kills: this.kills, level: this.level, gold: this.goldRun, mp: this.mp };
    if (this.mp) {
      if (net.session) net.session.inGame = false;
      for (const p of this.players) {
        if (!p.local) net.send({ t: 'gameover', data: { ...base, character: p.charId, weaponStats: this.weaponStats(p) } }, p.id);
      }
    }
    recordRun(base);
    this.scene.stop('UI');
    this.scene.stop('LevelUp');
    this.scene.stop('Pause');
    this.scene.stop('Chest');
    this.scene.start('GameOver', { ...base, character: this.me.charId, weaponStats: this.weaponStats(this.me) });
  }

  /* ---------------------------------------------------------------- */
  /* Pickups                                                           */
  /* ---------------------------------------------------------------- */

  gemTexture(v) {
    return v >= 10 ? 'gem_red' : v >= 3 ? 'gem_green' : 'gem_blue';
  }

  dropGem(x, y, value) {
    let gems = 0;
    for (const pk of this.pickups) if (pk.kind === 'gem') gems++;
    if (gems >= MAX_GEMS) {
      if (!this.overflowGem || !this.pickups.includes(this.overflowGem)) {
        this.overflowGem = this.addPickup('gem', x, y, 0);
      }
      this.overflowGem.value += value;
      this.overflowGem.sprite.setTexture('gem_red').setScale(1.4);
      return;
    }
    this.addPickup('gem', x, y, value);
  }

  addPickup(kind, x, y, value = 0) {
    const tex = kind === 'gem' ? this.gemTexture(value) : kind;
    const s = this.add.image(x, y, tex).setDepth(kind === 'chest' ? y : -20);
    const pk = { kind, x, y, value, sprite: s, mag: false, v: 0, t: Math.random() * 6 };
    if (kind === 'chest') {
      s.setScale(0);
      this.tweens.add({ targets: s, scale: 1, duration: 300, ease: 'Back.Out' });
      const glow = this.add.image(x, y, 'disc').setTint(0xffd76a).setAlpha(0.5).setDepth(y - 1).setScale(0.6);
      this.tweens.add({ targets: glow, alpha: 0.15, scale: 0.9, yoyo: true, repeat: -1, duration: 600 });
      pk.glow = glow;
    }
    this.pickups.push(pk);
    return pk;
  }

  dropFromProp(x, y, p) {
    const luck = p?.stats.luck ?? 1;
    const table = { chicken: 3, coin: 4, bag: 1.5 * luck, magnet: 1.2, rosary: 0.5 * luck, clock: 0.6 };
    this.addPickup(weighted(table), x, y);
  }

  updatePickups(dt) {
    if (!this.alivePlayers().length) return;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      const p = this.nearestPlayer(pk.x, pk.y);
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy);
      if (pk.kind !== 'chest') {
        if (!pk.mag && d < 34 * p.stats.magnet) pk.mag = true;
        if (pk.mag) {
          pk.v = Math.min(pk.v + 700 * dt, 420);
          const step = Math.min(d, pk.v * dt);
          pk.x += (dx / (d || 1)) * step;
          pk.y += (dy / (d || 1)) * step;
        }
        pk.t += dt;
        pk.sprite.setPosition(pk.x, pk.y + (pk.kind === 'gem' ? 0 : Math.sin(pk.t * 4) * 1.5));
      }
      if (d < (pk.kind === 'chest' ? 14 : 8)) {
        this.pickups.splice(i, 1);
        pk.sprite.destroy();
        pk.glow?.destroy();
        this.collect(pk, p);
      } else if (d > 1400 && pk.kind === 'gem') {
        // far-off gems are folded into the overflow gem instead of lost
        pk.sprite.destroy();
        this.pickups.splice(i, 1);
        this.dropGem(p.x + (Math.random() - 0.5) * 300, p.y + (Math.random() - 0.5) * 200, pk.value);
      }
    }
  }

  collect(pk, p) {
    switch (pk.kind) {
      case 'gem':
        this.addXp(pk.value, p);
        this.sfx('gem', p);
        break;
      case 'chicken':
        this.heal(p, 30);
        break;
      case 'coin':
        this.addGold(1 + Math.floor(Math.random() * 3), p);
        this.sfx('pickup', p);
        break;
      case 'bag':
        this.addGold(15, p);
        this.sfx('pickup', p);
        break;
      case 'magnet':
        for (const g of this.pickups) if (g.kind === 'gem') g.mag = true;
        this.sfx('pickup');
        break;
      case 'rosary': {
        this.fx({ k: 'flash', d: 400, c: [255, 255, 255] });
        this.sfx('bomb');
        for (const e of this.enemies) {
          if (e.alive && !e.prop && !e.boss && Math.abs(e.x - p.x) < VIEW_W / 2 + 20 && Math.abs(e.y - p.y) < VIEW_H / 2 + 20) {
            this.killEnemy(e, null);
          }
        }
        break;
      }
      case 'clock':
        this.freezeT = 8;
        this.sfx('zap');
        for (const e of this.enemies) if (e.alive && !e.prop) e.sprite.setTint(0x7ab8ff).setTintMode(MULTIPLY);
        this.time.delayedCall(8000, () => {
          for (const e of this.enemies) if (e.alive) e.sprite.setTint(e.tint).setTintMode(MULTIPLY);
        });
        break;
      case 'chest':
        this.openChest(p);
        break;
    }
  }

  // XP is shared by the whole team.
  addXp(v, p) {
    this.xp += v * p.stats.growth;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level);
      this.pendingLevels++;
    }
  }

  openLevelUp() {
    this.pendingLevels--;
    // Fallen co-op players come back on every level up.
    for (const p of this.players) {
      if (!p.alive && p.connected) {
        this.revive(p);
        this.fx({ k: 'banner', a: 'REVIVED', b: '' }, p);
      }
    }
    this.sfx('levelup');
    if (!this.mp) {
      this.scene.pause();
      this.scene.launch('LevelUp', { choices: this.buildChoices(this.me), level: this.level });
      return;
    }
    // Everyone picks their own upgrade; the game stays paused until all have.
    this.sendNet(); // flush revives / sounds before freezing
    this.levelChoices = new Map();
    for (const p of this.players) {
      const choices = this.buildChoices(p);
      this.levelChoices.set(p.id, choices);
      if (!p.local) net.send({ t: 'levelup', choices, level: this.level }, p.id);
    }
    this.scene.pause();
    this.scene.launch('LevelUp', {
      choices: this.levelChoices.get(this.me.id),
      level: this.level,
      mp: true,
      onPick: (i) => this.submitChoice(this.me.id, i),
    });
  }

  submitChoice(id, index) {
    const choices = this.levelChoices?.get(id);
    const c = choices?.[index];
    const p = this.players.find((q) => q.id === id);
    if (!c || !p) return;
    this.levelChoices.delete(id);
    this.applyChoice(p, c);
    this.game.events.emit('levelup-progress', this.players.length - this.levelChoices.size, this.players.length);
    if (this.levelChoices.size === 0) this.finishLevelUp();
  }

  finishLevelUp() {
    this.levelChoices = null;
    this.scene.stop('LevelUp');
    net.send({ t: 'resume' }, 'all');
    this.scene.resume();
  }

  openPause() {
    if (!this.alive || !this.scene.isActive()) return;
    if (this.mp) {
      // Co-op never pauses the shared world.
      if (this.scene.isActive('Pause')) return;
      this.inputBlocked = true;
      this.scene.launch('Pause', { source: 'Game', mp: true });
      return;
    }
    this.scene.pause();
    this.scene.launch('Pause', { source: 'Game' });
  }

  leaveGame() {
    net.close();
    this.scene.stop('UI');
    this.scene.start('Menu');
  }

  /* ---------------------------------------------------------------- */
  /* HUD interface (shared with ClientGame)                            */
  /* ---------------------------------------------------------------- */

  bossInfo() {
    const b = this.bossRef;
    return b && b.alive ? { type: b.type, hp: b.hp, maxHp: b.maxHp } : null;
  }

  chestPositions() {
    return this.pickups.filter((p) => p.kind === 'chest');
  }

  teamInfo() {
    return this.players.map((p) => ({ id: p.id, slot: p.slot, name: p.name, hp: p.hp, maxHp: p.stats.maxHp, alive: p.alive, x: p.x, y: p.y, local: p.local }));
  }

  /* ---------------------------------------------------------------- */
  /* Effects                                                           */
  /* ---------------------------------------------------------------- */

  damageNumber(x, y, v, crit = false, color = null) {
    if (this.numbers.length > 70) return;
    let t = this.freeNumbers.pop();
    const str = String(Math.round(v));
    if (!t) {
      t = this.add.text(0, 0, str, { fontFamily: FONT, fontSize: '8px', color: '#fff', stroke: '#000', strokeThickness: 3 });
      t.setOrigin(0.5);
    } else {
      t.setText(str).setVisible(true);
    }
    t.setColor(color || (crit ? '#ffd040' : '#ffffff'));
    t.setScale(crit ? 1.5 : 1).setAlpha(1).setDepth(20000);
    t.setPosition(x + (Math.random() - 0.5) * 6, y);
    this.numbers.push(t);
    this.tweens.add({
      targets: t,
      y: y - 12,
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Cubic.Out',
      onComplete: () => {
        t.setVisible(false);
        this.numbers.splice(this.numbers.indexOf(t), 1);
        this.freeNumbers.push(t);
      },
    });
  }

  burstParticles(x, y, color, n) {
    for (let i = 0; i < n && this.particles.length < 300; i++) {
      const s = this.add.image(x, y, 'px').setTint(color).setDepth(8000);
      const a = Math.random() * TAU;
      const sp = 30 + Math.random() * 70;
      this.particles.push({ s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.4 + Math.random() * 0.3 });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy += 200 * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.setAlpha(Math.min(1, p.life * 3));
      if (p.life <= 0) {
        p.s.destroy();
        this.particles.splice(i, 1);
      }
    }
  }
}

// Apply a screen effect locally (used by host and clients alike).
export function applyFx(scene, ev) {
  switch (ev.k) {
    case 'banner':
      scene.game.events.emit('banner', ev.a, ev.b);
      break;
    case 'toast':
      scene.game.events.emit('toast', ev);
      break;
    case 'shake':
      scene.cameras.main.shake(90, 0.004);
      break;
    case 'flash':
      scene.cameras.main.flash(ev.d || 400, ...(ev.c || [255, 255, 255]));
      break;
  }
}

// Persist gold and personal bests after a run (host and clients).
export function recordRun({ gold, time, kills, level }) {
  const save = loadSave();
  save.gold += gold;
  save.best = save.best || {};
  save.best.time = Math.max(save.best.time || 0, time);
  save.best.kills = Math.max(save.best.kills || 0, kills);
  save.best.level = Math.max(save.best.level || 0, level);
  writeSave(save);
}
