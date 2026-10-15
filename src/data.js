// Static game data: characters, passive items, enemies, waves, meta shop.

export const RUN_LENGTH = 15 * 60; // seconds; the Reaper arrives after this

export const BASE_STATS = {
  maxHp: 100,
  maxHpMult: 1,
  recovery: 0, // hp per second
  armor: 0,
  moveSpeed: 1,
  might: 1,
  area: 1,
  projSpeed: 1,
  duration: 1,
  amount: 0,
  cooldown: 1,
  luck: 1,
  growth: 1,
  greed: 1,
  magnet: 1,
  revival: 0,
};

export const CHARACTERS = {
  viktor: {
    name: 'Viktor',
    title: 'the Whipper',
    weapon: 'whip',
    bonus: '+10% Might',
    hp: 120,
    mods: { might: 0.1 },
  },
  selene: {
    name: 'Selene',
    title: 'Star Mage',
    weapon: 'wand',
    bonus: '+10% XP, -5% Cooldown',
    hp: 100,
    mods: { growth: 0.1, cooldown: -0.05 },
  },
  dash: {
    name: 'Dash',
    title: 'Knife Runner',
    weapon: 'knife',
    bonus: '+20% Move Speed',
    hp: 90,
    mods: { moveSpeed: 0.2 },
  },
  gorlic: {
    name: 'Old Gorlic',
    title: 'Garlic Hermit',
    weapon: 'garlic',
    bonus: '+0.5 HP/s Recovery',
    hp: 130,
    mods: { recovery: 0.5 },
  },
  greta: {
    name: 'Greta',
    title: 'Axe Maiden',
    weapon: 'axe',
    bonus: '+10% Area, +1 Armor',
    hp: 110,
    mods: { area: 0.1, armor: 1 },
  },
};

export const PASSIVES = {
  spinach: { name: 'Iron Leaf', icon: 'p_spinach', max: 5, desc: 'Might +10%', mods: { might: 0.1 } },
  armor: { name: 'Plate Armor', icon: 'p_armor', max: 5, desc: 'Armor +1 (less damage taken)', mods: { armor: 1 } },
  heart: { name: 'Hollow Heart', icon: 'p_heart', max: 5, desc: 'Max HP +20%', mods: { maxHpMult: 0.2 } },
  tomato: { name: 'Tomato Charm', icon: 'p_tomato', max: 5, desc: 'Recovery +0.2 HP/s', mods: { recovery: 0.2 } },
  tome: { name: 'Empty Tome', icon: 'p_tome', max: 5, desc: 'Cooldown -8%', mods: { cooldown: -0.08 } },
  candle: { name: 'Candelabra', icon: 'p_candle', max: 5, desc: 'Area +10%', mods: { area: 0.1 } },
  bracer: { name: 'Bracer', icon: 'p_bracer', max: 5, desc: 'Projectile speed +10%', mods: { projSpeed: 0.1 } },
  spellbinder: { name: 'Spellbinder', icon: 'p_spellbinder', max: 5, desc: 'Effect duration +10%', mods: { duration: 0.1 } },
  duplicator: { name: 'Duplicator', icon: 'p_duplicator', max: 2, desc: 'Amount +1 (more projectiles)', mods: { amount: 1 } },
  wings: { name: 'Wings', icon: 'p_wings', max: 5, desc: 'Move speed +10%', mods: { moveSpeed: 0.1 } },
  attractorb: { name: 'Attractorb', icon: 'p_attractorb', max: 5, desc: 'Pickup range +30%', mods: { magnet: 0.3 } },
  clover: { name: 'Clover', icon: 'p_clover', max: 5, desc: 'Luck +10%', mods: { luck: 0.1 } },
  crown: { name: 'Crown', icon: 'p_crown', max: 5, desc: 'XP gain +8%', mods: { growth: 0.08 } },
};

// radius = collision radius in world px; scale = sprite scale
export const ENEMIES = {
  bat: { tex: 'bat', hp: 4, speed: 58, dmg: 2, xp: 1, radius: 6, flap: true, blood: 0x6b3484 },
  redbat: { tex: 'redbat', hp: 20, speed: 70, dmg: 6, xp: 3, radius: 6, flap: true, blood: 0xa02828 },
  zombie: { tex: 'zombie', hp: 11, speed: 30, dmg: 4, xp: 1, radius: 6, blood: 0x6aa84f },
  skeleton: { tex: 'skeleton', hp: 22, speed: 40, dmg: 5, xp: 2, radius: 6, blood: 0xe8e4d4 },
  ghost: { tex: 'ghost', hp: 12, speed: 75, dmg: 4, xp: 1, radius: 6, alpha: 0.8, blood: 0xcfe8ff },
  werewolf: { tex: 'werewolf', hp: 70, speed: 50, dmg: 8, xp: 4, radius: 7, blood: 0x8a6a4a },
  mummy: { tex: 'mummy', hp: 140, speed: 34, dmg: 10, xp: 6, radius: 7, blood: 0xd8c8a0 },
  mantis: { tex: 'mantis', hp: 110, speed: 62, dmg: 9, xp: 5, radius: 7, blood: 0x5ac04a },
  reaper: { tex: 'reaper', hp: 655350, speed: 210, dmg: 65535, xp: 0, radius: 9, scale: 2, boss: true, blood: 0x1a0f22 },
};

// Each wave lasts one minute. `pool` is weighted spawn table,
// `min` is the minimum enemy count the director maintains.
export const WAVES = [
  { pool: { bat: 1 }, min: 14, interval: 1.0 },
  { pool: { bat: 2, zombie: 2 }, min: 30, interval: 0.9 },
  { pool: { zombie: 2, skeleton: 2 }, min: 45, interval: 0.8, elite: 'skeleton' },
  { pool: { skeleton: 2, ghost: 2 }, min: 55, interval: 0.8, event: 'batSwarm' },
  { pool: { ghost: 1, werewolf: 2, skeleton: 1 }, min: 65, interval: 0.7, elite: 'werewolf' },
  { pool: { werewolf: 2, redbat: 2 }, min: 80, interval: 0.6, event: 'zombieRing' },
  { pool: { redbat: 1, mummy: 1, werewolf: 1 }, min: 90, interval: 0.6, elite: 'mummy' },
  { pool: { mummy: 2, ghost: 2 }, min: 100, interval: 0.5, event: 'batSwarm' },
  { pool: { mantis: 2, redbat: 2 }, min: 110, interval: 0.5, elite: 'mantis' },
  { pool: { mantis: 2, mummy: 1, werewolf: 1 }, min: 120, interval: 0.45, event: 'zombieRing' },
  { pool: { skeleton: 2, mummy: 2, mantis: 1 }, min: 140, interval: 0.4, boss: 'mummy' },
  { pool: { redbat: 3, ghost: 2 }, min: 160, interval: 0.35, event: 'batSwarm' },
  { pool: { mantis: 2, werewolf: 2, mummy: 2 }, min: 180, interval: 0.3, elite: 'mantis' },
  { pool: { mummy: 3, mantis: 3 }, min: 200, interval: 0.3, event: 'zombieRing' },
  { pool: { mantis: 2, mummy: 2, redbat: 2, werewolf: 2 }, min: 230, interval: 0.25, boss: 'mantis' },
];

export const POWERUPS = {
  might: { name: 'Might', desc: '+5% damage', max: 5, cost: 200, mods: { might: 0.05 }, icon: 'p_spinach' },
  armor: { name: 'Armor', desc: '+1 armor', max: 3, cost: 600, mods: { armor: 1 }, icon: 'p_armor' },
  maxhp: { name: 'Max Health', desc: '+10% max HP', max: 3, cost: 200, mods: { maxHpMult: 0.1 }, icon: 'p_heart' },
  recovery: { name: 'Recovery', desc: '+0.1 HP/s', max: 5, cost: 200, mods: { recovery: 0.1 }, icon: 'p_tomato' },
  cooldown: { name: 'Cooldown', desc: '-2.5% cooldown', max: 2, cost: 900, mods: { cooldown: -0.025 }, icon: 'p_tome' },
  area: { name: 'Area', desc: '+5% area', max: 2, cost: 300, mods: { area: 0.05 }, icon: 'p_candle' },
  speed: { name: 'Move Speed', desc: '+5% move speed', max: 2, cost: 300, mods: { moveSpeed: 0.05 }, icon: 'p_wings' },
  magnet: { name: 'Magnet', desc: '+25% pickup range', max: 2, cost: 300, mods: { magnet: 0.25 }, icon: 'p_attractorb' },
  luck: { name: 'Luck', desc: '+10% luck', max: 3, cost: 600, mods: { luck: 0.1 }, icon: 'p_clover' },
  growth: { name: 'Growth', desc: '+3% XP gain', max: 5, cost: 900, mods: { growth: 0.03 }, icon: 'p_crown' },
  greed: { name: 'Greed', desc: '+10% gold gain', max: 5, cost: 200, mods: { greed: 0.1 }, icon: 'coin' },
  revival: { name: 'Revival', desc: 'Revive once per run', max: 1, cost: 10000, mods: { revival: 1 }, icon: 'p_heart' },
};

export function powerupCost(id, level) {
  return Math.round(POWERUPS[id].cost * (level + 1));
}

export function xpForLevel(level) {
  if (level < 20) return 5 + (level - 1) * 8;
  if (level < 40) return 157 + (level - 20) * 12;
  return 397 + (level - 40) * 16;
}
