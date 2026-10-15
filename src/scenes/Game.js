import Phaser from 'phaser';
import { audio } from '../audio.js';
import { BASE_STATS, CHARACTERS, ENEMIES, PASSIVES, POWERUPS, RUN_LENGTH, WAVES, xpForLevel } from '../data.js';
import { loadSave, writeSave } from '../save.js';
import { FONT, onKeyDown } from '../ui.js';
import { BASE_WEAPON_IDS, WEAPONS, createWeapon, describeLevel } from '../weapons.js';

const ZOOM = 2;
const VIEW_W = 1280 / ZOOM;
const VIEW_H = 720 / ZOOM;
const CELL = 48;
const MAX_ENEMIES = 450;
const MAX_GEMS = 350;
const CHUNK = 320;
const TAU = Math.PI * 2;
const FILL = Phaser.TintModes.FILL;
const MULTIPLY = Phaser.TintModes.MULTIPLY;

const cellKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9;
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
}

function weighted(table, luckBias = 1) {
  let total = 0;
  for (const w of Object.values(table)) total += w;
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(table)) {
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(table)[0];
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.charId = data?.character || 'viktor';
  }

  create() {
    this.save = loadSave();
    this.char = CHARACTERS[this.charId];
    this.alive = true;
    this.victory = false;
    this.clock = 0;
    this.kills = 0;
    this.goldRun = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.pendingLevels = 0;
    this.invVersion = 0;
    this.freezeT = 0;
    this.spawnT = 0;
    this.propT = 3;
    this.lastMinute = -1;
    this.reaperSpawned = false;
    this.enemyUid = 1;

    this.enemies = [];
    this.freeEnemies = [];
    this.grid = new Map();
    this.projectiles = [];
    this.pickups = [];
    this.overflowGem = null;
    this.particles = [];
    this.numbers = [];
    this.freeNumbers = [];
    this.chunks = new Map();
    this.weapons = [];
    this.retired = [];
    this.passives = [];

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBackgroundColor('#0b0f0a');

    this.ground = this.add.tileSprite(0, 0, VIEW_W + 256, VIEW_H + 256, 'ground').setOrigin(0).setDepth(-100000);

    // Player
    this.player = {
      x: 0,
      y: 0,
      facing: 1,
      dirX: 1,
      dirY: 0,
      moving: false,
      animT: 0,
      frame: 0,
      invuln: 0,
      hp: this.char.hp,
    };
    this.playerShadow = this.add.image(0, 7, 'shadow').setDepth(-50);
    this.playerSprite = this.add.image(0, 0, `hero_${this.charId}_0`);
    this.hpBg = this.add.rectangle(0, 0, 18, 3, 0x200000).setDepth(9800).setOrigin(0, 0.5);
    this.hpFill = this.add.rectangle(0, 0, 18, 3, 0xe02030).setDepth(9801).setOrigin(0, 0.5);
    cam.startFollow(this.playerSprite, true, 1, 1);

    this.recalcStats();
    this.player.hp = this.stats.maxHp;
    this.addWeapon(this.char.weapon);

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
    this.game.events.on('blur', this.onBlur, this);
    this.events.once('shutdown', () => this.game.events.off('blur', this.onBlur, this));

    this.scene.launch('UI');
    this.updateWorld();
    this.showBanner(`${this.char.name.toUpperCase()}`, 'Survive until the Reaper comes...');
  }

  onBlur() {
    if (this.alive && this.scene.isActive()) this.openPause();
  }

  /* ---------------------------------------------------------------- */
  /* Stats & inventory                                                 */
  /* ---------------------------------------------------------------- */

  recalcStats() {
    const s = { ...BASE_STATS };
    const apply = (mods, mult = 1) => {
      for (const [k, v] of Object.entries(mods)) s[k] += v * mult;
    };
    apply(this.char.mods);
    for (const [id, lvl] of Object.entries(this.save.powerups || {})) if (POWERUPS[id]) apply(POWERUPS[id].mods, lvl);
    for (const p of this.passives) apply(PASSIVES[p.id].mods, p.level);
    s.cooldown = Math.max(0.4, s.cooldown);
    s.maxHp = Math.round(this.char.hp * s.maxHpMult);
    const prevMax = this.stats?.maxHp;
    this.stats = s;
    if (prevMax && s.maxHp > prevMax) this.player.hp += s.maxHp - prevMax;
    if (this.revivals === undefined) this.revivals = s.revival;
  }

  addWeapon(id) {
    const w = createWeapon(this, id);
    this.weapons.push(w);
    this.invVersion++;
    return w;
  }

  addPassive(id) {
    const p = this.passives.find((q) => q.id === id);
    if (p) p.level++;
    else this.passives.push({ id, level: 1 });
    this.recalcStats();
    this.invVersion++;
  }

  passiveLevel(id) {
    return this.passives.find((q) => q.id === id)?.level || 0;
  }

  buildChoices() {
    const pool = [];
    for (const w of this.weapons) {
      if (!w.isMax) pool.push({ kind: 'weapon', id: w.id, level: w.level + 1, weight: 1.3 });
    }
    for (const p of this.passives) {
      if (p.level < PASSIVES[p.id].max) pool.push({ kind: 'passive', id: p.id, level: p.level + 1, weight: 1.1 });
    }
    if (this.weapons.length < 6) {
      for (const id of BASE_WEAPON_IDS) {
        const owned = this.weapons.some((w) => w.id === id || w.id === WEAPONS[id].evo?.into);
        if (!owned) pool.push({ kind: 'weapon', id, level: 1, weight: 1 });
      }
    }
    if (this.passives.length < 6) {
      for (const id of Object.keys(PASSIVES)) {
        if (!this.passiveLevel(id)) pool.push({ kind: 'passive', id, level: 1, weight: 0.9 });
      }
    }
    const n = 3 + (Math.random() < (this.stats.luck - 1) * 1.5 ? 1 : 0);
    const out = [];
    while (out.length < n && pool.length) {
      let total = pool.reduce((a, c) => a + c.weight, 0);
      let r = Math.random() * total;
      let i = 0;
      for (; i < pool.length; i++) {
        r -= pool[i].weight;
        if (r <= 0) break;
      }
      out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
    }
    if (!out.length) {
      out.push({ kind: 'heal' }, { kind: 'gold' });
    }
    return out.map((c) => this.describeChoice(c));
  }

  describeChoice(c) {
    if (c.kind === 'weapon') {
      const d = WEAPONS[c.id];
      return { ...c, name: d.name, icon: d.icon, desc: c.level === 1 ? d.desc : describeLevel(c.id, c.level) };
    }
    if (c.kind === 'passive') {
      const d = PASSIVES[c.id];
      return { ...c, name: d.name, icon: d.icon, desc: d.desc };
    }
    if (c.kind === 'heal') return { ...c, name: 'Floor Chicken', icon: 'chicken', desc: 'Heals 30 HP' };
    return { ...c, name: 'Gold Coins', icon: 'bag', desc: 'Gain 25 gold' };
  }

  applyChoice(c) {
    if (c.kind === 'weapon') {
      const w = this.weapons.find((q) => q.id === c.id);
      if (w) w.levelUp();
      else this.addWeapon(c.id);
    } else if (c.kind === 'passive') {
      this.addPassive(c.id);
    } else if (c.kind === 'heal') {
      this.heal(30);
    } else {
      this.addGold(25);
    }
    this.invVersion++;
  }

  canEvolve(w) {
    const evo = w.def.evo;
    return evo && w.isMax && this.passiveLevel(evo.with) > 0;
  }

  evolve(w) {
    const i = this.weapons.indexOf(w);
    const into = w.def.evo.into;
    w.destroy();
    this.retired.push(w);
    const nw = createWeapon(this, into);
    this.weapons[i] = nw;
    this.invVersion++;
    return nw;
  }

  openChest() {
    const r = Math.random();
    const luck = this.stats.luck;
    const count = r < 0.03 * luck ? 5 : r < 0.12 * luck ? 3 : 1;
    const rewards = [];
    for (let i = 0; i < count; i++) {
      const evolvable = this.weapons.find((w) => this.canEvolve(w));
      if (evolvable) {
        const from = evolvable.def.name;
        const nw = this.evolve(evolvable);
        rewards.push({ icon: nw.def.icon, name: nw.def.name, desc: `${from} evolved!`, evo: true });
        continue;
      }
      const ups = [
        ...this.weapons.filter((w) => !w.isMax).map((w) => ({ kind: 'weapon', id: w.id, level: w.level + 1 })),
        ...this.passives.filter((p) => p.level < PASSIVES[p.id].max).map((p) => ({ kind: 'passive', id: p.id, level: p.level + 1 })),
      ];
      if (ups.length) {
        const c = this.describeChoice(Phaser.Utils.Array.GetRandom(ups));
        this.applyChoice(c);
        rewards.push({ icon: c.icon, name: c.name, desc: c.kind === 'weapon' ? `Level ${c.level}` : `Level ${c.level}: ${c.desc}` });
      } else {
        this.addGold(50);
        rewards.push({ icon: 'bag', name: 'Gold', desc: '+50 gold' });
      }
    }
    const gold = Math.round((20 + Math.random() * 40) * count);
    this.addGold(gold);
    this.invVersion++;
    this.scene.pause();
    this.scene.launch('Chest', { rewards, gold });
    audio.play('chest');
  }

  /* ---------------------------------------------------------------- */
  /* Main loop                                                         */
  /* ---------------------------------------------------------------- */

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 20);
    this.updateParticles(dt);
    if (!this.alive) return;
    this.clock += dt;
    this.updatePlayer(dt);
    this.updateDirector(dt);
    this.updateEnemies(dt);
    this.rebuildGrid();
    for (const w of this.weapons) w.update(dt);
    this.updateProjectiles(dt);
    this.updateContact();
    this.updatePickups(dt);
    this.updateWorld();
    if (this.pendingLevels > 0 && this.alive) this.openLevelUp();
  }

  updatePlayer(dt) {
    const p = this.player;
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
    const len = Math.hypot(ix, iy);
    p.moving = len > 0.01;
    if (p.moving) {
      ix /= len;
      iy /= len;
      const sp = 95 * this.stats.moveSpeed;
      p.x += ix * sp * dt;
      p.y += iy * sp * dt;
      p.dirX = ix;
      p.dirY = iy;
      if (Math.abs(ix) > 0.1) p.facing = ix > 0 ? 1 : -1;
      p.animT += dt;
      if (p.animT > 0.14) {
        p.animT = 0;
        p.frame ^= 1;
        this.playerSprite.setTexture(`hero_${this.charId}_${p.frame}`);
      }
    } else if (p.frame) {
      p.frame = 0;
      this.playerSprite.setTexture(`hero_${this.charId}_0`);
    }
    if (this.stats.recovery > 0) p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.recovery * dt);
    p.invuln -= dt;
    this.playerSprite.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(p.facing < 0).setDepth(p.y);
    this.playerSprite.setAlpha(p.invuln > 0 && Math.floor(p.invuln * 20) % 2 ? 0.5 : 1);
    this.playerShadow.setPosition(p.x, p.y + 7);
    this.hpBg.setPosition(p.x - 9, p.y + 11);
    this.hpFill.setPosition(p.x - 9, p.y + 11);
    this.hpFill.width = Math.max(0, 18 * (p.hp / this.stats.maxHp));
    if (this.freezeT > 0) this.freezeT -= dt;
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
    if (this.minute !== this.lastMinute) {
      this.lastMinute = this.minute;
      if (wave.elite) this.spawnEnemy(wave.elite, { elite: true });
      if (wave.boss) this.spawnBoss(wave.boss);
      if (wave.event === 'batSwarm') this.batSwarm();
      if (wave.event === 'zombieRing') this.zombieRing();
    }
    this.spawnT += dt;
    if (this.spawnT >= wave.interval) {
      this.spawnT = 0;
      const count = this.enemyCount();
      let n = count < wave.min ? Math.min(wave.min - count, 20) : 1 + Math.floor(this.minute / 4);
      n = Math.min(n, MAX_ENEMIES - this.enemies.length);
      for (let i = 0; i < n; i++) this.spawnEnemy(weighted(wave.pool));
    }
    this.propT -= dt;
    if (this.propT <= 0) {
      this.propT = 5;
      const props = this.enemies.filter((e) => e.prop && e.alive).length;
      if (props < 4) {
        const a = Math.random() * TAU;
        const d = 260 + Math.random() * 200;
        this.spawnEnemy('brazier', { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d });
      }
    }
  }

  enemyCount() {
    let n = 0;
    for (const e of this.enemies) if (e.alive && !e.prop) n++;
    return n;
  }

  edgePoint(margin = 30) {
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
    return { x: this.player.x - w / 2 + x, y: this.player.y - h / 2 + y };
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
    const scaleT = 1 + this.minute * 0.12;
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
    audio.play('boss');
    this.showBanner('A POWERFUL FOE APPROACHES', '');
  }

  spawnReaper() {
    this.reaperSpawned = true;
    this.victory = true;
    for (const e of this.enemies) if (e.alive && !e.prop) this.killEnemy(e, null, true);
    for (let i = 0; i < 1 + Math.floor((this.stats.revival || 0)); i++) this.bossRef = this.spawnEnemy('reaper');
    audio.play('boss');
    this.cameras.main.flash(600, 255, 255, 255);
    this.showBanner('THE REAPER HAS COME', 'You survived. Now face your end.');
  }

  batSwarm() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const p = this.player;
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

  zombieRing() {
    const p = this.player;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.spawnEnemy('zombie', { x: p.x + Math.cos(a) * 240, y: p.y + Math.sin(a) * 240, speedMult: 0.8 });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Enemies                                                           */
  /* ---------------------------------------------------------------- */

  updateEnemies(dt) {
    const p = this.player;
    const frozen = this.freezeT > 0;
    const decay = Math.min(1, 9 * dt);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const s = e.sprite;
      if (!e.prop && !frozen) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
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
            const pt = this.edgePoint();
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

  randomVisibleEnemy() {
    const p = this.player;
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
    audio.play('hit');
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
      this.dropFromProp(e.x, e.y);
    } else if (!silent) {
      if (e.def.xp) this.dropGem(e.x, e.y, e.def.xp * (e.elite ? 10 : 1) * (e.boss ? 30 : 1));
      if (e.elite || (e.boss && e.type !== 'reaper')) this.addPickup('chest', e.x, e.y);
      else if (Math.random() < 0.006 * this.stats.luck) this.addPickup('coin', e.x + 4, e.y);
      if (e === this.bossRef) this.bossRef = null;
      audio.play('kill');
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
    const pl = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
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

  updateContact() {
    const p = this.player;
    if (p.invuln > 0) return;
    // The strongest touching enemy hits fully, the rest of the crowd adds a bit.
    let max = 0;
    let rest = 0;
    this.queryCircle(p.x, p.y, 5, (e) => {
      if (e.prop || this.freezeT > 0) return;
      rest += Math.min(max, e.dmg);
      max = Math.max(max, e.dmg);
    });
    if (max > 0) this.takeDamage(max + Math.min(rest * 0.25, max));
  }

  takeDamage(d) {
    const p = this.player;
    d = Math.max(1, d - this.stats.armor);
    p.hp -= d;
    p.invuln = 0.4;
    audio.play('hurt');
    this.playerSprite.setTint(0xff3030).setTintMode(FILL);
    this.time.delayedCall(90, () => this.playerSprite.setTint(0xffffff).setTintMode(MULTIPLY));
    this.cameras.main.shake(90, 0.004);
    if (p.hp <= 0) this.die();
  }

  heal(n, silent = false) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + n);
    if (!silent && p.hp > before) {
      audio.play('heal');
      this.damageNumber(p.x, p.y - 14, Math.round(p.hp - before), false, '#7af07a');
    }
  }

  addGold(n) {
    this.goldRun += Math.round(n * this.stats.greed);
  }

  die() {
    if (this.revivals > 0) {
      this.revivals--;
      this.player.hp = this.stats.maxHp * 0.5;
      this.player.invuln = 2.5;
      this.cameras.main.flash(500, 255, 220, 120);
      audio.play('levelup');
      this.showBanner('REVIVED', '');
      this.queryCircle(this.player.x, this.player.y, 200, (e) => {
        if (!e.boss && !e.prop) this.killEnemy(e, null);
      });
      return;
    }
    this.alive = false;
    this.player.hp = 0;
    audio.play('death');
    this.playerSprite.setTint(0xff2020).setTintMode(FILL);
    this.tweens.add({ targets: this.playerSprite, alpha: 0, angle: 90, duration: 1200 });
    this.time.delayedCall(1500, () => this.endRun());
  }

  endRun() {
    const all = [...this.retired, ...this.weapons];
    const weaponStats = all.map((w) => ({
      name: w.def.name,
      icon: w.def.icon,
      level: w.def.evolved ? 'MAX' : w.level,
      damage: Math.round(w.damageDealt),
      dps: Math.round(w.damageDealt / Math.max(1, this.clock - w.createdAt)),
      kills: w.kills,
    }));
    const save = loadSave();
    save.gold += this.goldRun;
    save.best = save.best || {};
    save.best.time = Math.max(save.best.time || 0, this.clock);
    save.best.kills = Math.max(save.best.kills || 0, this.kills);
    save.best.level = Math.max(save.best.level || 0, this.level);
    writeSave(save);
    this.scene.stop('UI');
    this.scene.start('GameOver', {
      victory: this.victory,
      time: this.clock,
      kills: this.kills,
      level: this.level,
      gold: this.goldRun,
      character: this.charId,
      weaponStats,
    });
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

  dropFromProp(x, y) {
    const table = { chicken: 3, coin: 4, bag: 1.5 * this.stats.luck, magnet: 1.2, rosary: 0.5 * this.stats.luck, clock: 0.6 };
    this.addPickup(weighted(table), x, y);
  }

  updatePickups(dt) {
    const p = this.player;
    const magR = 34 * this.stats.magnet;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy);
      if (pk.kind !== 'chest') {
        if (!pk.mag && d < magR) pk.mag = true;
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
        this.collect(pk);
      } else if (d > 1400 && pk.kind === 'gem') {
        // far-off gems are folded into the overflow gem instead of lost
        pk.sprite.destroy();
        this.pickups.splice(i, 1);
        this.dropGem(p.x + (Math.random() - 0.5) * 300, p.y + (Math.random() - 0.5) * 200, pk.value);
      }
    }
  }

  collect(pk) {
    switch (pk.kind) {
      case 'gem':
        this.addXp(pk.value);
        audio.play('gem');
        break;
      case 'chicken':
        this.heal(30);
        break;
      case 'coin':
        this.addGold(1 + Math.floor(Math.random() * 3));
        audio.play('pickup');
        break;
      case 'bag':
        this.addGold(15);
        audio.play('pickup');
        break;
      case 'magnet':
        for (const g of this.pickups) if (g.kind === 'gem') g.mag = true;
        audio.play('pickup');
        break;
      case 'rosary': {
        this.cameras.main.flash(400, 255, 255, 255);
        audio.play('bomb');
        const p = this.player;
        for (const e of this.enemies) {
          if (e.alive && !e.prop && !e.boss && Math.abs(e.x - p.x) < VIEW_W / 2 + 20 && Math.abs(e.y - p.y) < VIEW_H / 2 + 20) {
            this.killEnemy(e, null);
          }
        }
        break;
      }
      case 'clock':
        this.freezeT = 8;
        audio.play('zap');
        for (const e of this.enemies) if (e.alive && !e.prop) e.sprite.setTint(0x7ab8ff).setTintMode(MULTIPLY);
        this.time.delayedCall(8000, () => {
          for (const e of this.enemies) if (e.alive) e.sprite.setTint(e.tint).setTintMode(MULTIPLY);
        });
        break;
      case 'chest':
        this.openChest();
        break;
    }
  }

  addXp(v) {
    this.xp += v * this.stats.growth;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level);
      this.pendingLevels++;
    }
  }

  openLevelUp() {
    this.pendingLevels--;
    audio.play('levelup');
    this.scene.pause();
    this.scene.launch('LevelUp', { choices: this.buildChoices(), level: this.level });
  }

  openPause() {
    if (!this.alive || !this.scene.isActive()) return;
    this.scene.pause();
    this.scene.launch('Pause');
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

  showBanner(title, sub) {
    this.game.events.emit('banner', title, sub);
  }

  /* ---------------------------------------------------------------- */
  /* World: infinite ground + decoration chunks                        */
  /* ---------------------------------------------------------------- */

  updateWorld() {
    const p = this.player;
    const left = Math.floor(p.x - VIEW_W / 2 - 128);
    const top = Math.floor(p.y - VIEW_H / 2 - 128);
    this.ground.setPosition(left, top);
    this.ground.tilePositionX = left;
    this.ground.tilePositionY = top;

    const cx0 = Math.floor((p.x - VIEW_W) / CHUNK);
    const cx1 = Math.floor((p.x + VIEW_W) / CHUNK);
    const cy0 = Math.floor((p.y - VIEW_H) / CHUNK);
    const cy1 = Math.floor((p.y + VIEW_H) / CHUNK);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = cellKey(cx, cy);
        if (!this.chunks.has(k)) this.chunks.set(k, { cx, cy, imgs: this.buildChunk(cx, cy) });
      }
    }
    for (const [k, c] of this.chunks) {
      if (c.cx < cx0 - 1 || c.cx > cx1 + 1 || c.cy < cy0 - 1 || c.cy > cy1 + 1) {
        c.imgs.forEach((i) => i.destroy());
        this.chunks.delete(k);
      }
    }
  }

  buildChunk(cx, cy) {
    const r = hash2(cx, cy);
    const n = 2 + Math.floor(r() * 4);
    const imgs = [];
    for (let i = 0; i < n; i++) {
      const x = cx * CHUNK + r() * CHUNK;
      const y = cy * CHUNK + r() * CHUNK;
      if (Math.hypot(x, y) < 60) continue; // keep the spawn point clear
      const roll = r();
      const tex = roll < 0.32 ? 'flowers' : roll < 0.52 ? 'rock' : roll < 0.7 ? 'grave' : roll < 0.86 ? 'tree' : 'bones';
      const flat = tex === 'flowers' || tex === 'bones' || tex === 'rock';
      const img = this.add.image(x, y, tex).setOrigin(0.5, 1).setDepth(flat ? -60 : y);
      if (r() < 0.5) img.setFlipX(true);
      imgs.push(img);
    }
    return imgs;
  }
}
