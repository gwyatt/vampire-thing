// Weapons. Each weapon has a data definition (stats + per-level deltas)
// and a class implementing how it fires. Evolutions are separate weapon
// ids that replace their base weapon once unlocked from a treasure chest.


const TAU = Math.PI * 2;

export const WEAPONS = {
  whip: {
    name: 'Whip',
    icon: 'w_whip',
    desc: 'Slashes horizontally. Passes through enemies.',
    base: { dmg: 10, cd: 1.35, amount: 1, area: 1 },
    levels: [{}, { amount: 1 }, { dmg: 5 }, { dmg: 5, area: 0.1 }, { dmg: 5 }, { dmg: 5, area: 0.1 }, { dmg: 5 }, { dmg: 5 }],
    evo: { with: 'heart', into: 'crimson' },
  },
  wand: {
    name: 'Magic Wand',
    icon: 'bolt',
    desc: 'Fires at the nearest enemy.',
    base: { dmg: 10, cd: 1.2, amount: 1, speed: 1, pierce: 0, area: 1 },
    levels: [{}, { amount: 1 }, { cd: -0.2 }, { amount: 1 }, { dmg: 10 }, { amount: 1 }, { pierce: 1 }, { dmg: 10 }],
    evo: { with: 'tome', into: 'torrent' },
  },
  knife: {
    name: 'Knife',
    icon: 'knife',
    desc: 'Fires quickly in the faced direction.',
    base: { dmg: 6.5, cd: 1.0, amount: 1, speed: 1, pierce: 0, area: 1 },
    levels: [{}, { amount: 1 }, { amount: 1, dmg: 5 }, { amount: 1 }, { pierce: 1 }, { amount: 1 }, { amount: 1, dmg: 5 }, { pierce: 1 }],
    evo: { with: 'bracer', into: 'blades' },
  },
  axe: {
    name: 'Axe',
    icon: 'axe',
    desc: 'High damage, high area scaling. Arcs upward.',
    base: { dmg: 20, cd: 4, amount: 1, speed: 1, pierce: 2, area: 1 },
    levels: [{}, { amount: 1 }, { dmg: 20 }, { pierce: 2 }, { amount: 1 }, { dmg: 20 }, { pierce: 2 }, { dmg: 20 }],
    evo: { with: 'candle', into: 'spiral' },
  },
  bible: {
    name: 'Holy Tome',
    icon: 'book',
    desc: 'Orbits around the character.',
    base: { dmg: 10, cd: 3, amount: 1, speed: 1, area: 1, duration: 3 },
    levels: [{}, { amount: 1 }, { speed: 0.3, area: 0.25 }, { duration: 0.5, dmg: 10 }, { amount: 1 }, { speed: 0.3, area: 0.25 }, { duration: 0.5, dmg: 10 }, { amount: 1 }],
    evo: { with: 'spellbinder', into: 'codex' },
  },
  garlic: {
    name: 'Garlic',
    icon: 'w_garlic',
    desc: 'Damages nearby enemies. Reduces their resistance.',
    base: { dmg: 6, cd: 1.2, area: 1 },
    levels: [{}, { area: 0.4, dmg: 2 }, { dmg: 1, cd: -0.1 }, { area: 0.2, dmg: 1 }, { dmg: 2, cd: -0.1 }, { area: 0.2, dmg: 1 }, { dmg: 1, cd: -0.1 }, { area: 0.2, dmg: 1 }],
    evo: { with: 'tomato', into: 'souleater' },
  },
  water: {
    name: 'Sacred Water',
    icon: 'flask',
    desc: 'Leaves damaging pools on the ground.',
    base: { dmg: 10, cd: 4.5, amount: 1, area: 1, duration: 2 },
    levels: [{}, { amount: 1, area: 0.2 }, { dmg: 10, duration: 0.5 }, { amount: 1, area: 0.2 }, { dmg: 10, duration: 0.3 }, { amount: 1, area: 0.2 }, { dmg: 5, duration: 0.3 }, { dmg: 5, area: 0.2 }],
    evo: { with: 'attractorb', into: 'abyss' },
  },
  ring: {
    name: 'Storm Ring',
    icon: 'w_ring',
    desc: 'Strikes random enemies with lightning.',
    base: { dmg: 15, cd: 4.5, amount: 2, area: 1 },
    levels: [{}, { amount: 1 }, { dmg: 10, area: 0.25 }, { amount: 1 }, { dmg: 20, area: 0.25 }, { amount: 1 }, { dmg: 20, area: 0.25 }, { amount: 1 }],
    evo: { with: 'duplicator', into: 'thunder' },
  },

  // ---- Evolutions ------------------------------------------------------
  crimson: {
    name: 'Crimson Lash',
    icon: 'w_whip',
    evolved: true,
    desc: 'Evolved Whip. Can deal critical damage and absorbs HP.',
    base: { dmg: 50, cd: 1.1, amount: 2, area: 1.4 },
    levels: [{}],
  },
  torrent: {
    name: 'Arcane Torrent',
    icon: 'bolt_evo',
    evolved: true,
    desc: 'Evolved Magic Wand. Fires with no delay.',
    base: { dmg: 25, cd: 0.12, amount: 1, speed: 1.3, pierce: 1, area: 1.2 },
    levels: [{}],
  },
  blades: {
    name: 'Thousand Blades',
    icon: 'knife_evo',
    evolved: true,
    desc: 'Evolved Knife. A relentless stream of blades.',
    base: { dmg: 16, cd: 0.07, amount: 1, speed: 1.4, pierce: 2, area: 1 },
    levels: [{}],
  },
  spiral: {
    name: 'Death Spiral',
    icon: 'scythe',
    evolved: true,
    desc: 'Evolved Axe. Scythes spiral outward, passing through everything.',
    base: { dmg: 60, cd: 2.5, amount: 9, speed: 1, pierce: 999, area: 1.6 },
    levels: [{}],
  },
  codex: {
    name: 'Eternal Codex',
    icon: 'book_evo',
    evolved: true,
    desc: 'Evolved Holy Tome. Never stops orbiting.',
    base: { dmg: 30, cd: 0, amount: 4, speed: 1.6, area: 1.5, duration: 999 },
    levels: [{}],
  },
  souleater: {
    name: 'Soul Devourer',
    icon: 'w_soul',
    evolved: true,
    desc: 'Evolved Garlic. Steals HP and grows with every kill.',
    base: { dmg: 12, cd: 0.8, area: 2.4 },
    levels: [{}],
  },
  abyss: {
    name: 'Abyssal Font',
    icon: 'flask_evo',
    evolved: true,
    desc: 'Evolved Sacred Water. Huge pools that chase you.',
    base: { dmg: 30, cd: 3.5, amount: 4, area: 1.8, duration: 4.5 },
    levels: [{}],
  },
  thunder: {
    name: 'Thunder Loop',
    icon: 'w_ring',
    evolved: true,
    desc: 'Evolved Storm Ring. Every bolt strikes twice.',
    base: { dmg: 75, cd: 3.5, amount: 6, area: 1.75 },
    levels: [{}],
  },
};

export function maxLevel(id) {
  return WEAPONS[id].levels.length;
}

export function describeLevel(id, level) {
  const d = WEAPONS[id].levels[level - 1];
  const parts = [];
  if (d.amount) parts.push(`+${d.amount} projectile${d.amount > 1 ? 's' : ''}`);
  if (d.dmg) parts.push(`Damage +${d.dmg}`);
  if (d.cd) parts.push(`Cooldown ${d.cd}s`);
  if (d.area) parts.push(`Area +${Math.round(d.area * 100)}%`);
  if (d.pierce) parts.push(`Pierce +${d.pierce}`);
  if (d.speed) parts.push(`Speed +${Math.round(d.speed * 100)}%`);
  if (d.duration) parts.push(`Duration +${d.duration}s`);
  return parts.join(', ');
}

let uidCounter = 1;

export class Weapon {
  constructor(scene, id, owner) {
    this.scene = scene;
    this.owner = owner;
    this.id = id;
    this.def = WEAPONS[id];
    this.level = 1;
    this.uid = uidCounter++;
    this.timer = 0.4;
    this.damageDealt = 0;
    this.kills = 0;
    this.createdAt = scene.clock;
    this._stats = null;
  }

  get s() {
    if (!this._stats) {
      const s = { ...this.def.base };
      for (let i = 1; i < this.level; i++) {
        for (const [k, v] of Object.entries(this.def.levels[i])) s[k] = (s[k] || 0) + v;
      }
      this._stats = s;
    }
    return this._stats;
  }

  get isMax() {
    return this.level >= this.def.levels.length;
  }

  levelUp() {
    this.level++;
    this._stats = null;
    this.onLevel?.();
  }

  // Effective stats including the player's passives
  get dmg() {
    return this.s.dmg * this.owner.stats.might;
  }
  get area() {
    return (this.s.area || 1) * this.owner.stats.area;
  }
  get amount() {
    return (this.s.amount || 1) + this.owner.stats.amount;
  }
  get cooldown() {
    return Math.max(0.05, this.s.cd * this.owner.stats.cooldown);
  }
  get speed() {
    return (this.s.speed || 1) * this.owner.stats.projSpeed;
  }
  get duration() {
    return (this.s.duration || 1) * this.owner.stats.duration;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      const extra = this.fire() || 0;
      this.timer = Math.max(this.timer + this.cooldown + extra, 0.02);
    }
    this.tick?.(dt);
  }

  // Run `fn` `n` times spaced by `gap` ms (uses scene clock so pausing works)
  burst(n, gap, fn) {
    for (let i = 0; i < n; i++) {
      if (i === 0) fn(0);
      else this.scene.time.delayedCall(i * gap, () => this.scene.alive && this.owner.alive && fn(i));
    }
  }

  // Tag a display object as belonging to (and positioned around) the owner,
  // so the owner's client can keep it glued to its predicted position.
  follow(obj) {
    obj.__owner = this.owner.id;
    obj.__follow = true;
    return obj;
  }

  destroy() {}
}

/* ---------------------------------------------------------------------- */

class Whip extends Weapon {
  fire() {
    this.scene.sfx('whip');
    const p = this.owner;
    this.burst(this.amount, 110, (i) => {
      const side = i % 2 === 0 ? p.facing : -p.facing;
      const yOff = -Math.floor(i / 2) * 12;
      this.slash(side, yOff);
    });
  }

  slash(dir, yOff) {
    const sc = this.scene;
    const p = this.owner;
    const evo = this.id === 'crimson';
    const len = 100 * this.area;
    const h = 22 * this.area;
    const cy = p.y - 4 + yOff;
    const x0 = dir > 0 ? p.x + 4 : p.x - 4 - len;
    const fx = this.follow(sc.add.image(dir > 0 ? p.x + 4 : p.x - 4, cy, evo ? 'slash_evo' : 'slash'));
    fx.setOrigin(dir > 0 ? 0 : 1, 0.5).setFlipX(dir < 0).setDepth(9000);
    fx.setScale(len / 96, this.area);
    sc.tweens.add({ targets: fx, alpha: 0, scaleY: this.area * 0.3, duration: 220, onComplete: () => fx.destroy() });
    sc.queryRect(x0, cy - h / 2, x0 + len, cy + h / 2, (e) => {
      let d = this.dmg;
      let crit = false;
      if (evo && Math.random() < 0.25) {
        d *= 2;
        crit = true;
      }
      sc.damageEnemy(e, d, this, dir, 0, 1, crit);
      if (evo) sc.heal(this.owner, 0.4, true);
    });
  }
}

class Wand extends Weapon {
  fire() {
    const sc = this.scene;
    const evo = this.id === 'torrent';
    this.burst(this.amount, 90, () => {
      const p = this.owner;
      const t = sc.nearestEnemy(p.x, p.y, 420);
      let ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.random() * TAU;
      if (evo) ang += (Math.random() - 0.5) * 0.15;
      this.scene.sfx('shoot');
      const spd = 230 * this.speed;
      sc.addProjectile({
        tex: evo ? 'bolt_evo' : 'bolt',
        x: p.x,
        y: p.y - 4,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        dmg: this.dmg,
        pierce: this.s.pierce,
        life: 2.5,
        radius: 5 * this.area,
        scale: this.area,
        weapon: this,
        spin: 6,
      });
    });
  }
}

class Knife extends Weapon {
  fire() {
    const sc = this.scene;
    const evo = this.id === 'blades';
    this.burst(this.amount, 55, () => {
      const p = this.owner;
      const ang = Math.atan2(p.dirY, p.dirX) + (evo ? (Math.random() - 0.5) * 0.25 : 0);
      const perp = (Math.random() - 0.5) * 14;
      const spd = 380 * this.speed;
      this.scene.sfx('shoot');
      sc.addProjectile({
        tex: evo ? 'knife_evo' : 'knife',
        x: p.x + Math.cos(ang + Math.PI / 2) * perp,
        y: p.y - 4 + Math.sin(ang + Math.PI / 2) * perp,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        dmg: this.dmg,
        pierce: this.s.pierce,
        life: 1.4,
        radius: 5 * this.area,
        scale: this.area,
        weapon: this,
        faceVelocity: true,
      });
    });
  }
}

class Axe extends Weapon {
  fire() {
    const sc = this.scene;
    const p = this.owner;
    const n = this.amount;
    if (this.id === 'spiral') {
      const off = Math.random() * TAU;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        const spd = 150 * this.speed;
        sc.addProjectile({
          tex: 'scythe',
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          dmg: this.dmg,
          pierce: this.s.pierce,
          life: 2.6,
          radius: 10 * this.area,
          scale: this.area * 1.4,
          weapon: this,
          spin: 12,
          growth: 0.5,
        });
      }
      this.scene.sfx('whip');
      return;
    }
    this.burst(n, 120, (i) => {
      const spread = (i - (n - 1) / 2) * 55;
      sc.addProjectile({
        tex: 'axe',
        x: p.x,
        y: p.y - 6,
        vx: spread + (Math.random() - 0.5) * 40 + p.facing * 15,
        vy: -310 * Math.sqrt(this.speed),
        gravity: 560,
        dmg: this.dmg,
        pierce: this.s.pierce,
        life: 3,
        radius: 8 * this.area,
        scale: this.area,
        weapon: this,
        spin: 10 * p.facing,
      });
      this.scene.sfx('whip');
    });
  }
}

class Tome extends Weapon {
  constructor(scene, id, owner) {
    super(scene, id, owner);
    this.books = [];
    this.angle = 0;
    this.activeT = 0;
    this.timer = 0.3;
  }

  get evo() {
    return this.id === 'codex';
  }

  fire() {
    this.spawnBooks();
    this.activeT = this.duration;
    return this.evo ? 9999 : this.duration; // cooldown starts after the books vanish
  }

  spawnBooks() {
    this.clearBooks(false);
    const n = this.amount;
    for (let i = 0; i < n; i++) {
      const b = this.follow(this.scene.add.image(0, 0, this.evo ? 'book_evo' : 'book').setDepth(9000));
      b.setScale(0);
      this.scene.tweens.add({ targets: b, scale: Math.sqrt(this.area), duration: 200 });
      this.books.push(b);
    }
  }

  clearBooks(animate = true) {
    for (const b of this.books) {
      if (animate) this.scene.tweens.add({ targets: b, scale: 0, alpha: 0, duration: 200, onComplete: () => b.destroy() });
      else b.destroy();
    }
    this.books = [];
  }

  onLevel() {
    if (this.books.length) this.spawnBooks();
  }

  sleep() {
    this.clearBooks(false);
    this.timer = 0.5;
  }

  tick(dt) {
    if (!this.books.length) return;
    if (this.evo && this.books.length !== this.amount) this.spawnBooks();
    if (!this.evo) {
      this.activeT -= dt;
      if (this.activeT <= 0) {
        this.clearBooks();
        return;
      }
    }
    const sc = this.scene;
    const p = this.owner;
    this.angle += dt * 3.2 * this.speed;
    const r = 48 * this.area;
    const n = this.books.length;
    this.books.forEach((b, i) => {
      const a = this.angle + (i / n) * TAU;
      b.x = p.x + Math.cos(a) * r;
      b.y = p.y - 4 + Math.sin(a) * r;
      sc.queryCircle(b.x, b.y, 8 * Math.sqrt(this.area), (e) => {
        if (sc.canHit(e, this, 0.5)) sc.damageEnemy(e, this.dmg, this, Math.cos(a), Math.sin(a), 1);
      });
    });
  }

  destroy() {
    this.clearBooks(false);
  }
}

class Garlic extends Weapon {
  constructor(scene, id, owner) {
    super(scene, id, owner);
    const evo = id === 'souleater';
    this.aura = this.follow(scene.add.image(0, 0, 'glow').setDepth(-5).setAlpha(0.8));
    this.aura.setTint(evo ? 0xff3a8a : 0xf8f0c0);
    this.growth = 0;
  }

  get radius() {
    return 30 * this.area * (1 + this.growth);
  }

  fire() {}

  tick() {
    const sc = this.scene;
    const p = this.owner;
    this.aura.setVisible(p.alive);
    if (!p.alive) return;
    const r = this.radius;
    const pulse = 1 + Math.sin(sc.clock * 6) * 0.04;
    this.aura.setPosition(p.x, p.y - 2).setScale(((r * 2) / 128) * 1.15 * pulse);
    const evo = this.id === 'souleater';
    sc.queryCircle(p.x, p.y, r, (e) => {
      if (!sc.canHit(e, this, this.cooldown)) return;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const killed = sc.damageEnemy(e, this.dmg, this, dx / len, dy / len, 0.6);
      if (evo) {
        sc.heal(this.owner, 0.25, true);
        if (killed) this.growth = Math.min(0.6, this.growth + 0.002);
      }
    });
  }

  sleep() {
    this.aura.setVisible(false);
  }

  destroy() {
    this.aura.destroy();
  }
}

class Water extends Weapon {
  constructor(scene, id, owner) {
    super(scene, id, owner);
    this.pools = [];
  }

  get evo() {
    return this.id === 'abyss';
  }

  fire() {
    const sc = this.scene;
    this.burst(this.amount, 160, () => {
      const p = this.owner;
      const t = sc.randomVisibleEnemy(this.owner);
      let tx;
      let ty;
      if (t && Math.random() < 0.8) {
        tx = t.x;
        ty = t.y;
      } else {
        const a = Math.random() * TAU;
        const d = 40 + Math.random() * 90;
        tx = p.x + Math.cos(a) * d;
        ty = p.y + Math.sin(a) * d;
      }
      const flask = sc.add.image(p.x, p.y - 8, this.evo ? 'flask_evo' : 'flask').setDepth(9000);
      sc.tweens.add({ targets: flask, x: tx, duration: 380 });
      sc.tweens.add({
        targets: flask,
        y: { from: p.y - 8, to: ty },
        duration: 380,
        ease: (k) => k * k,
        onComplete: () => {
          flask.destroy();
          this.spawnPool(tx, ty);
        },
      });
      sc.tweens.add({ targets: flask, angle: 360, duration: 380 });
    });
  }

  spawnPool(x, y) {
    const sc = this.scene;
    const r = 26 * this.area;
    const img = sc.add.image(x, y, 'pool').setDepth(-6).setTint(this.evo ? 0x8a3aff : 0x3a8aff).setAlpha(0.75);
    img.setScale(0);
    sc.tweens.add({ targets: img, scale: (r * 2) / 64, duration: 150 });
    this.pools.push({ img, x, y, r, life: this.duration });
    this.scene.sfx('hit');
  }

  tick(dt) {
    const sc = this.scene;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pl = this.pools[i];
      pl.life -= dt;
      if (this.evo) {
        const dx = this.owner.x - pl.x;
        const dy = this.owner.y - pl.y;
        const len = Math.hypot(dx, dy) || 1;
        pl.x += (dx / len) * 30 * dt;
        pl.y += (dy / len) * 30 * dt;
        pl.img.setPosition(pl.x, pl.y);
      }
      pl.img.rotation += dt * 0.5;
      if (pl.life <= 0) {
        const img = pl.img;
        sc.tweens.add({ targets: img, alpha: 0, scale: img.scale * 0.6, duration: 250, onComplete: () => img.destroy() });
        this.pools.splice(i, 1);
        continue;
      }
      sc.queryCircle(pl.x, pl.y, pl.r, (e) => {
        if (sc.canHit(e, this, 0.4)) sc.damageEnemy(e, this.dmg, this, 0, 0, 0);
      });
    }
  }

  sleep() {
    this.destroy();
  }

  destroy() {
    this.pools.forEach((p) => p.img.destroy());
    this.pools = [];
  }
}

class Ring extends Weapon {
  fire() {
    const sc = this.scene;
    const evo = this.id === 'thunder';
    this.burst(this.amount, 100, () => {
      const t = sc.randomVisibleEnemy(this.owner);
      if (!t) return;
      const x = t.x;
      const y = t.y;
      this.strike(x, y);
      if (evo) sc.time.delayedCall(180, () => sc.alive && this.strike(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20));
    });
  }

  strike(x, y) {
    const sc = this.scene;
    const r = 20 * this.area;
    const bolt = sc.add.image(x, y, 'lightning').setOrigin(0.5, 1).setDepth(9500).setScale(1, 1.2);
    sc.tweens.add({ targets: bolt, alpha: 0, duration: 260, onComplete: () => bolt.destroy() });
    const flash = sc.add.image(x, y, 'disc').setDepth(9400).setTint(0x9ad0ff).setScale((r * 2) / 64);
    sc.tweens.add({ targets: flash, alpha: 0, scale: (r * 2.6) / 64, duration: 300, onComplete: () => flash.destroy() });
    this.scene.sfx('zap');
    sc.queryCircle(x, y, r, (e) => sc.damageEnemy(e, this.dmg, this, 0, 0, 0.3));
  }
}

const CLASSES = {
  whip: Whip,
  crimson: Whip,
  wand: Wand,
  torrent: Wand,
  knife: Knife,
  blades: Knife,
  axe: Axe,
  spiral: Axe,
  bible: Tome,
  codex: Tome,
  garlic: Garlic,
  souleater: Garlic,
  water: Water,
  abyss: Water,
  ring: Ring,
  thunder: Ring,
};

export function createWeapon(scene, id, owner) {
  return new CLASSES[id](scene, id, owner);
}

export const BASE_WEAPON_IDS = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].evolved);
