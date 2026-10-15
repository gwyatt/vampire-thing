// All game art is generated at boot from tiny pixel maps and canvas drawing,
// so the game ships with zero image assets.

const T = '.'; // transparent

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function hex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

// Mirror a half-width map (left half) into a symmetric full map.
function mirror(rows) {
  return rows.map((r) => r + r.split('').reverse().join(''));
}

function drawMap(ctx, rows, palette, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === T || ch === ' ') continue;
      const col = palette[ch];
      if (col === undefined) continue;
      ctx.fillStyle = typeof col === 'number' ? hex(col) : col;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

// Every generated texture key, in generation order. Identical on every peer,
// so co-op snapshots can refer to textures by index (see netsync.js).
export const ART_KEYS = [];

function addMap(scene, key, rows, palette) {
  const w = Math.max(...rows.map((r) => r.length));
  const { c, ctx } = makeCanvas(w, rows.length);
  drawMap(ctx, rows, palette);
  scene.textures.addCanvas(key, c);
  ART_KEYS.push(key);
}

function addCanvasTex(scene, key, w, h, draw) {
  const { c, ctx } = makeCanvas(w, h);
  draw(ctx, w, h);
  scene.textures.addCanvas(key, c);
  ART_KEYS.push(key);
}

// Deterministic RNG so generated textures look the same every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

const HERO_A = [
  '......HHHH......',
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '....HSSSSSSH....',
  '....SSESSESS....',
  '....SSSSSSSS....',
  '.....SSMMSS.....',
  '...CCCCCCCCCC...',
  '..SCCCCAACCCCS..',
  '..SCCCCAACCCCS..',
  '..S.CCCCCCCC.S..',
  '....BBBAABBB....',
  '....PPPP.PPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '...KKKK..KKKK...',
];
const HERO_B = [
  '................',
  '......HHHH......',
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '....HSSSSSSH....',
  '....SSESSESS....',
  '....SSSSSSSS....',
  '...CCSSMMSSCC...',
  '..SCCCCAACCCCS..',
  '..SCCCCAACCCCS..',
  '..S.CCCCCCCC.S..',
  '....BBBAABBB....',
  '....PPPP.PPP....',
  '...PPP....PPP...',
  '..KKKK....KKKK..',
  '................',
];

export const HERO_PALETTES = {
  viktor: { H: 0x6b3a1f, S: 0xf1c27d, E: 0x1a1a2e, M: 0xb5524a, C: 0x2e5aa8, A: 0xe8c547, B: 0x5a3a1a, P: 0x3b2b4f, K: 0x2a1a10 },
  selene: { H: 0xd9d4ff, S: 0xf6d5b8, E: 0x4a1a7a, M: 0xc0607a, C: 0x6a2fb0, A: 0xf7e26b, B: 0x3a1a5a, P: 0x4b2b7f, K: 0x221133 },
  dash: { H: 0x2a2a2a, S: 0xd8a070, E: 0x111111, M: 0x9a4040, C: 0x2f8f5a, A: 0xbfbfbf, B: 0x333333, P: 0x2a3a2a, K: 0x111111 },
  gorlic: { H: 0xe6e6e6, S: 0xe0b48a, E: 0x222222, M: 0xffffff, C: 0x8a6a3a, A: 0xeae0b0, B: 0x4a3a20, P: 0x5a4a30, K: 0x2a2010 },
  greta: { H: 0xd04020, S: 0xf3c9a0, E: 0x203040, M: 0xa03030, C: 0x8f2a2a, A: 0xc0c0c0, B: 0x3a2a1a, P: 0x4a3a3a, K: 0x221a1a },
};

/* ------------------------------------------------------------------ */
/* Enemies (half maps, mirrored)                                       */
/* ------------------------------------------------------------------ */

const BAT_A = mirror([
  '........',
  '........',
  'W.......',
  'WW......',
  'WWW...BB',
  'WWWW.BBB',
  '.WWWWBRB',
  '..WWWBBB',
  '...W.BBB',
  '......BF',
  '........',
  '........',
]);
const BAT_B = mirror([
  '........',
  '........',
  '........',
  '......BB',
  '.....BBB',
  '....WBRB',
  '...WWBBB',
  '..WWWBBB',
  '.WWWW.BF',
  'WWW.....',
  'WW......',
  '........',
]);

const ZOMBIE = mirror([
  '........',
  '.....GGG',
  '....GGGG',
  '....GRGG',
  '....GGGG',
  '.....GDD',
  '...CCCCC',
  '..GCCCCC',
  '.GGCCCCC',
  'GG.CCCCC',
  '...PPPPP',
  '...PPP..',
  '...PPP..',
  '...PPP..',
  '..KKKK..',
  '........',
]);

const SKELETON = mirror([
  '........',
  '....WWWW',
  '...WWWWW',
  '...WKKWW',
  '...WKKWW',
  '...WWWWW',
  '....WKWK',
  '.....WWW',
  '..W.WWWW',
  '.W..W.KW',
  'W...WWWW',
  '....W.KW',
  '.....WWW',
  '....WW.W',
  '....W...',
  '...WW...',
]);

const GHOST = mirror([
  '........',
  '....WWWW',
  '...WWWWW',
  '..WWWWWW',
  '..WKKWWW',
  '..WKKWWW',
  '..WWWWWW',
  '..WWWWWK',
  '..WWWWWW',
  '.WWWWWWW',
  '.WWWWWWW',
  '.WWWWWWW',
  '.WW.WWWW',
  '.W...WW.',
  '........',
  '........',
]);

const WEREWOLF = mirror([
  '...F....',
  '...FF...',
  '...FFFFF',
  '...FYFFF',
  '...FFFFF',
  '....FFNN',
  '....FWFW',
  '.FFFFFFF',
  'FFFFTTTT',
  'FF.FTTTT',
  'F..FTTTT',
  '...PPPPP',
  '...PPP..',
  '...FFF..',
  '..FFFF..',
  '........',
]);

const MUMMY = mirror([
  '........',
  '....TTTT',
  '...TLTTT',
  '...TTTTL',
  '...TRRTT',
  '...LTTTT',
  '....TTLT',
  '..TTTTTT',
  '.TTLTTTL',
  'TT.TTTTT',
  '...TLTTT',
  '...TTTTL',
  '...TTT..',
  '...LTT..',
  '...TTT..',
  '..TTTT..',
]);

const REAPER = mirror([
  '....KKKK',
  '...KKKKK',
  '..KKKWWW',
  '..KKWWWW',
  '..KKWRRW',
  '..KKWWWW',
  '..KKKWKW',
  '.KKKKKKK',
  'KKKKKKKK',
  'KKKKKKKK',
  'KKKKKKKK',
  '.KKKKKKK',
  '.KKKKKKK',
  '..KKKKKK',
  '..KKKKKK',
  '...K.K.K',
]);

const MANTIS = mirror([
  '..G.....',
  '...G..GG',
  '....GGGG',
  '...GYGGG',
  '....GGGG',
  'LL...GGG',
  '.LL.GGGG',
  '..LGGGGG',
  '...GGLGG',
  '....GGGG',
  '....GLGG',
  '...GG.GG',
  '..GG..G.',
  '.GG...G.',
  '......G.',
  '........',
]);

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

const GEM = [
  '...XX...',
  '..XLLX..',
  '.XLLMMX.',
  'XLLMMMDX',
  'XLMMMMDX',
  '.XMMMDX.',
  '..XMDX..',
  '...XX...',
];

const CHICKEN = [
  '....WWW.....',
  '...WWWWW....',
  '..BBBBBWW...',
  '.BBLLBBBW...',
  'BBLLBBBBB...',
  'BBBBBBBBB...',
  '.BBBBBBBDW..',
  '..BBBBBD.WW.',
  '....DDD..WW.',
];

const COIN = [
  '..YYYY..',
  '.YLLYYO.',
  'YLYYYYYO',
  'YLYOOYYO',
  'YYYOOYYO',
  'YYYYYYYO',
  '.YYYYYO.',
  '..OOOO..',
];

const BAG = [
  '...BB...',
  '..BYYB..',
  '...BB...',
  '.BBBBBB.',
  'BBBYYBBB',
  'BBYBBBBB',
  'BBBYYBBB',
  'BBBBBYBB',
  'BBYYYBBB',
  '.BBBBBB.',
];

const CHEST = [
  '..OOOOOOOOOO..',
  '.ORRRRRRRRRRO.',
  'ORRRRRRRRRRRRO',
  'OYYYYYYYYYYYYO',
  'ORRRRRYYRRRRRO',
  'ORRRRYKKYRRRRO',
  'OYYYYYKKYYYYYO',
  'ORRRRRYYRRRRRO',
  'ORRRRRRRRRRRRO',
  'ORRRRRRRRRRRRO',
  'OYYYYYYYYYYYYO',
  '.OOOOOOOOOOOO.',
];

const MAGNET = [
  'RR....RR',
  'RR....RR',
  'RR....RR',
  'RR....RR',
  'RR....RR',
  'RRR..RRR',
  '.RRRRRR.',
  '..RRRR..',
  'WW....WW',
];

const ROSARY = [
  '...YY...',
  '...YY...',
  'YYYYYYYY',
  'YYYYYYYY',
  '...YY...',
  '...YY...',
  '...YY...',
  '...YY...',
];

const CLOCK = [
  '..WWWW..',
  '.WYYYYW.',
  'WYYKYYYW',
  'WYYKYYYW',
  'WYYKKKYW',
  'WYYYYYYW',
  '.WYYYYW.',
  '..WWWW..',
];

const KNIFE = [
  'BB.........',
  'BBGGGGGGWW.',
  'BBGGGGGGGWW',
  'BB.........',
];

const AXE = [
  '....SSSS....',
  '..SSSSSSSS..',
  '.SSWSSSSSS..',
  'SSWSSBSSSS..',
  'SSSSSBB.....',
  '.SSS.BB.....',
  '.....BB.....',
  '.....BB.....',
  '.....BB.....',
  '.....BB.....',
  '.....BB.....',
  '.....DD.....',
];

const BOOK = [
  '.BBBBBBBB.',
  'BBBBBBBBWW',
  'BBBYYBBBWW',
  'BBYYYYBBWW',
  'BBBYYBBBWW',
  'BBBYYBBBWW',
  'BBBYYBBBWW',
  'BBBBBBBBWW',
  'BBBBBBBBWW',
  '.BBBBBBBB.',
];

const FLASK = [
  '...WW...',
  '...KK...',
  '...LL...',
  '..LBBL..',
  '.LBBBBL.',
  'LBBWBBBL',
  'LBWBBBBL',
  'LBBBBBBL',
  '.LBBBBL.',
  '..LLLL..',
];

const BRAZIER = [
  '....OY....',
  '...OYYO...',
  '..OYWWYO..',
  '..OYWWYO..',
  '.KKKKKKKK.',
  '.KSSSSSSK.',
  '..KSSSSK..',
  '...KSSK...',
  '....SS....',
  '....SS....',
  '....SS....',
  '...SSSS...',
  '..KKKKKK..',
];
const BRAZIER_B = [
  '.....O....',
  '....OYO...',
  '...OYWYO..',
  '..OYWWYO..',
  '.KKKKKKKK.',
  '.KSSSSSSK.',
  '..KSSSSK..',
  '...KSSK...',
  '....SS....',
  '....SS....',
  '....SS....',
  '...SSSS...',
  '..KKKKKK..',
];

/* Passive icons (8x8) */
const ICONS = {
  p_spinach: [['......GG', '....GGGG', '...GGLGG', '..GGLGG.', '.GGLGG..', '.GLGG...', '.LGG....', 'L.......'], { G: 0x3fbf4f, L: 0x9cf09c }],
  p_armor: [['SSSSSSSS', 'SLLLLLLS', 'SLLSSLLS', 'SLSSSSLS', 'SLLSSLLS', '.SLLLLS.', '..SLLS..', '...SS...'], { S: 0x5a6070, L: 0xb8c0d0 }],
  p_heart: [['.RR..RR.', 'RLLRRDDR', 'RLDDDDDR', 'RDDDDDDR', '.RDDDDR.', '..RDDR..', '...RR...', '........'], { R: 0xe04050, L: 0xff9aa8, D: 0x6a1020 }],
  p_tomato: [['...GG...', '..GGGG..', '.RRGGRR.', 'RRRRRRRR', 'RLRRRRRR', 'RRRRRRRR', '.RRRRRR.', '..RRRR..'], { G: 0x3faf3f, R: 0xe03a2a, L: 0xff9a8a }],
  p_tome: [['.BBBBBB.', 'BBBBBBWW', 'BBYBBBWW', 'BYYYBBWW', 'BBYBBBWW', 'BBBBBBWW', 'BBBBBBWW', '.BBBBBB.'], { B: 0x3050c0, Y: 0xf0d040, W: 0xf0f0e0 }],
  p_candle: [['...Y....', '..YOY...', '...Y....', '..WWW...', '..WWW...', '..WWW...', '.GGGGG..', 'GGGGGGG.'], { Y: 0xffe060, O: 0xff8020, W: 0xf0eadc, G: 0xd0a020 }],
  p_bracer: [['........', '.BBBBBB.', 'BYBBBBYB', 'BBBBBBBB', 'BYBBBBYB', '.BBBBBB.', '........', '........'], { B: 0x8a5a2a, Y: 0xf0d040 }],
  p_spellbinder: [['..PPPP..', '.P....P.', 'P..YY..P', 'P.Y..Y.P', 'P.Y..Y.P', 'P..YY..P', '.P....P.', '..PPPP..'], { P: 0xa050f0, Y: 0xffe060 }],
  p_duplicator: [['.YYY....', 'Y...Y...', 'Y...Y...', 'Y..SSS..', '.YYS..S.', '...S..S.', '....SS..', '........'], { Y: 0xf0d040, S: 0xc0c8d8 }],
  p_wings: [['W.......', 'WW......', 'WWW.....', 'WWLW....', 'WWWLW...', '.WWWWLW.', '..WWWWWW', '...WWWW.'], { W: 0xf0f0ff, L: 0xa0b0d0 }],
  p_attractorb: [['..BBBB..', '.BLLBBB.', 'BLLBBBBB', 'BLBBBBBB', 'BBBBBBBB', 'BBBBBBDB', '.BBBBDB.', '..BBBB..'], { B: 0x40a0f0, L: 0xc0f0ff, D: 0x2060a0 }],
  p_clover: [['.GG..GG.', 'GGGGGGGG', '.GGGGGG.', '...GG...', '.GGGGGG.', 'GGGGGGGG', '.GG..GG.', '....G...'], { G: 0x40c040 }],
  p_crown: [['Y..Y..Y.', 'YY.Y.YY.', 'YYYYYYY.', 'YRYYYBY.', 'YYYYYYY.', 'YYYYYYY.', '........', '........'], { Y: 0xf0c030, R: 0xe03040, B: 0x3080f0 }],
};

/* ------------------------------------------------------------------ */

export function generateArt(scene) {
  // Heroes: 2 walk frames per palette
  for (const [name, pal] of Object.entries(HERO_PALETTES)) {
    addMap(scene, `hero_${name}_0`, HERO_A, pal);
    addMap(scene, `hero_${name}_1`, HERO_B, pal);
  }

  // Enemies
  const batPal = { W: 0x3a1d4a, B: 0x6b3484, R: 0xff3030, F: 0xffffff };
  addMap(scene, 'bat_0', BAT_A, batPal);
  addMap(scene, 'bat_1', BAT_B, batPal);
  const redBat = { W: 0x5a1010, B: 0xa02828, R: 0xffee40, F: 0xffffff };
  addMap(scene, 'redbat_0', BAT_A, redBat);
  addMap(scene, 'redbat_1', BAT_B, redBat);
  const zPal = { G: 0x6aa84f, R: 0xff2020, D: 0x2a3a20, C: 0x5a4a6a, P: 0x3a3048, K: 0x201810 };
  addMap(scene, 'zombie_0', ZOMBIE, zPal);
  addMap(scene, 'zombie_1', shiftLegs(ZOMBIE), zPal);
  const sPal = { W: 0xe8e4d4, K: 0x2a2030 };
  addMap(scene, 'skeleton_0', SKELETON, sPal);
  addMap(scene, 'skeleton_1', shiftLegs(SKELETON), sPal);
  const gPal = { W: 0xcfe8ff, K: 0x2a3050 };
  addMap(scene, 'ghost_0', GHOST, gPal);
  addMap(scene, 'ghost_1', bob(GHOST), gPal);
  const wPal = { F: 0x6a4a30, Y: 0xffe040, N: 0x1a1010, W: 0xffffff, T: 0x8a6a4a, P: 0x3a3048 };
  addMap(scene, 'werewolf_0', WEREWOLF, wPal);
  addMap(scene, 'werewolf_1', shiftLegs(WEREWOLF), wPal);
  const mPal = { T: 0xd8c8a0, L: 0x9a8a68, R: 0xff3020 };
  addMap(scene, 'mummy_0', MUMMY, mPal);
  addMap(scene, 'mummy_1', shiftLegs(MUMMY), mPal);
  const rPal = { K: 0x1a0f22, W: 0xe8e4d4, R: 0xff1010 };
  addMap(scene, 'reaper_0', REAPER, rPal);
  addMap(scene, 'reaper_1', bob(REAPER), rPal);
  const mtPal = { G: 0x5ac04a, L: 0xcfe8a0, Y: 0xff3030 };
  addMap(scene, 'mantis_0', MANTIS, mtPal);
  addMap(scene, 'mantis_1', shiftLegs(MANTIS), mtPal);

  // Gems: blue / green / red
  addMap(scene, 'gem_blue', GEM, { X: 0x0a2a6a, L: 0xbfe8ff, M: 0x3a8aff, D: 0x1a4ab0 });
  addMap(scene, 'gem_green', GEM, { X: 0x0a4a1a, L: 0xcfffcf, M: 0x3adf5a, D: 0x1a8a3a });
  addMap(scene, 'gem_red', GEM, { X: 0x5a0a0a, L: 0xffd0d0, M: 0xff3a3a, D: 0xb01a1a });

  addMap(scene, 'chicken', CHICKEN, { W: 0xf0f0e0, B: 0xc07a30, L: 0xf0c080, D: 0x7a4a1a });
  addMap(scene, 'coin', COIN, { Y: 0xf0c030, L: 0xfff0a0, O: 0xa07010 });
  addMap(scene, 'bag', BAG, { B: 0x8a6a3a, Y: 0xf0c030 });
  addMap(scene, 'chest', CHEST, { O: 0x3a2010, R: 0x9a4a20, Y: 0xf0c030, K: 0x1a1010 });
  addMap(scene, 'magnet', MAGNET, { R: 0xe03030, W: 0xd0d0e0 });
  addMap(scene, 'rosary', ROSARY, { Y: 0xffe080 });
  addMap(scene, 'clock', CLOCK, { W: 0xc0a040, Y: 0xfff4c0, K: 0x202020 });
  const brPal = { O: 0xff6a10, Y: 0xffd040, W: 0xffffd0, K: 0x2a2a2a, S: 0x6a6a7a };
  addMap(scene, 'brazier_0', BRAZIER, brPal);
  addMap(scene, 'brazier_1', BRAZIER_B, brPal);

  // Weapons / projectiles
  addMap(scene, 'knife', KNIFE, { B: 0x6a4a2a, G: 0xc8d0e0, W: 0xffffff });
  addMap(scene, 'knife_evo', KNIFE, { B: 0x8a2a2a, G: 0xffe080, W: 0xffffff });
  addMap(scene, 'axe', AXE, { S: 0xb8c0d0, W: 0xffffff, B: 0x8a5a2a, D: 0x4a2a10 });
  addMap(scene, 'scythe', [
    '..KKKKKK....',
    '.KRRRRRRKK..',
    'KRR.....RRK.',
    '..........RK',
    '...........K',
    '...........K',
  ], { K: 0x2a0a10, R: 0xff3050 });
  addMap(scene, 'book', BOOK, { B: 0x3050c0, Y: 0xf0d040, W: 0xf0f0e0 });
  addMap(scene, 'book_evo', BOOK, { B: 0x9a1a3a, Y: 0xffe080, W: 0xfff0f0 });
  addMap(scene, 'flask', FLASK, { W: 0xffffff, K: 0x6a4a2a, L: 0xc0e8ff, B: 0x3a7aff });
  addMap(scene, 'flask_evo', FLASK, { W: 0xffffff, K: 0x6a4a2a, L: 0xe0c0ff, B: 0x7a2aff });

  for (const [key, [map, pal]] of Object.entries(ICONS)) addMap(scene, key, map, pal);

  // Magic bolt
  addCanvasTex(scene, 'bolt', 10, 10, (ctx) => {
    ctx.fillStyle = '#3a6aff';
    ctx.fillRect(2, 1, 6, 8);
    ctx.fillRect(1, 2, 8, 6);
    ctx.fillStyle = '#9ac8ff';
    ctx.fillRect(3, 2, 4, 6);
    ctx.fillRect(2, 3, 6, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 3, 2, 4);
    ctx.fillRect(3, 4, 4, 2);
  });
  addCanvasTex(scene, 'bolt_evo', 10, 10, (ctx) => {
    ctx.fillStyle = '#b02aff';
    ctx.fillRect(2, 1, 6, 8);
    ctx.fillRect(1, 2, 8, 6);
    ctx.fillStyle = '#f0a0ff';
    ctx.fillRect(3, 2, 4, 6);
    ctx.fillRect(2, 3, 6, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 4, 4, 2);
    ctx.fillRect(4, 3, 2, 4);
  });

  // Whip slash: a tapered crescent
  for (const [key, outer, inner] of [
    ['slash', '#e8f0ff', '#ffffff'],
    ['slash_evo', '#ff3a50', '#ffd0d8'],
  ]) {
    addCanvasTex(scene, key, 96, 20, (ctx, w, h) => {
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const thick = Math.max(1, Math.round(Math.sin(t * Math.PI) * 7));
        const cy = Math.round(h / 2 + Math.sin(t * Math.PI * 1.0) * -3);
        ctx.fillStyle = outer;
        ctx.fillRect(x, cy - thick, 1, thick * 2);
        if (thick > 2) {
          ctx.fillStyle = inner;
          ctx.fillRect(x, cy - Math.floor(thick / 2), 1, Math.floor(thick / 2) * 2 || 1);
        }
      }
    });
  }

  // Soft round glow (tinted for garlic aura, pools, explosions)
  addCanvasTex(scene, 'glow', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  addCanvasTex(scene, 'disc', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  // Water pool (pixelly ellipse)
  addCanvasTex(scene, 'pool', 64, 64, (ctx, w, h) => {
    const r = rng(42);
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const dx = (x - w / 2) / (w / 2);
        const dy = (y - h / 2) / (h / 2);
        const d = dx * dx + dy * dy;
        if (d < 1 - r() * 0.15) {
          const a = d > 0.75 ? 0.95 : 0.55 + r() * 0.15;
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
  });
  // Lightning bolt
  addCanvasTex(scene, 'lightning', 24, 160, (ctx, w, h) => {
    const r = rng(7);
    let x = w / 2;
    for (let y = 0; y < h; y += 4) {
      const nx = Math.max(3, Math.min(w - 4, x + (r() - 0.5) * 10));
      ctx.fillStyle = '#7ab8ff';
      ctx.fillRect(Math.min(x, nx) - 2, y, Math.abs(nx - x) + 5, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.min(x, nx) - 1, y + 1, Math.abs(nx - x) + 3, 3);
      x = nx;
    }
  });
  // Generic pixels
  addCanvasTex(scene, 'px', 2, 2, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 2, 2);
  });
  addCanvasTex(scene, 'shadow', 14, 5, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(2, 0, 10, 5);
    ctx.fillRect(0, 1, 14, 3);
  });

  // Weapon icons that aren't projectiles
  addCanvasTex(scene, 'w_whip', 10, 10, (ctx) => {
    ctx.fillStyle = '#6a4a2a';
    ctx.fillRect(0, 8, 3, 2);
    ctx.fillStyle = '#c8a070';
    const pts = [[2, 7], [3, 6], [4, 5], [5, 4], [6, 3], [7, 3], [8, 2], [9, 1], [8, 0]];
    pts.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
  });
  addCanvasTex(scene, 'w_garlic', 10, 10, (ctx) => {
    ctx.fillStyle = '#f0ecd8';
    ctx.fillRect(2, 3, 6, 6);
    ctx.fillRect(1, 4, 8, 4);
    ctx.fillStyle = '#c8c0a0';
    ctx.fillRect(4, 3, 1, 6);
    ctx.fillStyle = '#7ac050';
    ctx.fillRect(4, 0, 2, 3);
  });
  addCanvasTex(scene, 'w_ring', 10, 10, (ctx) => {
    ctx.fillStyle = '#f0c030';
    ctx.fillRect(2, 1, 6, 1);
    ctx.fillRect(2, 8, 6, 1);
    ctx.fillRect(1, 2, 1, 6);
    ctx.fillRect(8, 2, 1, 6);
    ctx.fillStyle = '#7ab8ff';
    ctx.fillRect(4, 0, 2, 2);
  });
  addCanvasTex(scene, 'w_soul', 10, 10, (ctx) => {
    ctx.fillStyle = '#9a2a5a';
    ctx.fillRect(2, 3, 6, 6);
    ctx.fillRect(1, 4, 8, 4);
    ctx.fillStyle = '#ff80b0';
    ctx.fillRect(4, 3, 1, 6);
    ctx.fillStyle = '#3a0a1a';
    ctx.fillRect(4, 0, 2, 3);
  });

  // Ground tile and props
  generateGround(scene);
  generateProps(scene);
}

function shiftLegs(rows) {
  // Simple walk frame: shift the bottom 4 rows sideways in opposite directions.
  return rows.map((r, i) => {
    if (i < rows.length - 4) return r;
    const half = r.length / 2;
    const left = r.slice(0, half);
    const right = r.slice(half);
    return (left.slice(1) + '.') + ('.' + right.slice(0, -1));
  });
}

function bob(rows) {
  return ['.'.repeat(rows[0].length), ...rows.slice(0, -1)];
}

function generateGround(scene) {
  addCanvasTex(scene, 'ground', 128, 128, (ctx, w, h) => {
    const r = rng(1337);
    ctx.fillStyle = '#1d2a1a';
    ctx.fillRect(0, 0, w, h);
    // mottled patches
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(r() * w);
      const y = Math.floor(r() * h);
      const s = 4 + Math.floor(r() * 10);
      ctx.fillStyle = r() < 0.5 ? '#223220' : '#1a2517';
      for (let k = 0; k < s * 3; k++) {
        const px = (x + Math.floor((r() - 0.5) * s * 2) + w) % w;
        const py = (y + Math.floor((r() - 0.5) * s) + h) % h;
        ctx.fillRect(px, py, 2, 2);
      }
    }
    // grass blades
    for (let i = 0; i < 120; i++) {
      const x = Math.floor(r() * w);
      const y = Math.floor(r() * h);
      ctx.fillStyle = r() < 0.3 ? '#3a5a2a' : '#2a4022';
      ctx.fillRect(x, y, 1, 2);
      if (r() < 0.4) ctx.fillRect((x + 1) % w, (y + 1) % h, 1, 1);
    }
    // pebbles
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(r() * (w - 2));
      const y = Math.floor(r() * (h - 2));
      ctx.fillStyle = '#3a3a34';
      ctx.fillRect(x, y, 2, 1);
      ctx.fillStyle = '#4a4a42';
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

function generateProps(scene) {
  addCanvasTex(scene, 'tree', 32, 44, (ctx) => {
    const r = rng(99);
    ctx.fillStyle = '#3a2614';
    ctx.fillRect(13, 26, 6, 16);
    ctx.fillStyle = '#2a1a0c';
    ctx.fillRect(13, 26, 2, 16);
    ctx.fillRect(10, 40, 12, 3);
    const blobs = [[16, 14, 13], [9, 20, 8], [23, 20, 8], [16, 8, 9]];
    const cols = ['#0f2a14', '#163a1a', '#1f4a22'];
    cols.forEach((c, ci) => {
      ctx.fillStyle = c;
      blobs.forEach(([bx, by, br]) => {
        const rr = br - ci * 3;
        for (let y = -rr; y <= rr; y++)
          for (let x = -rr; x <= rr; x++)
            if (x * x + y * y <= rr * rr && r() > 0.08) ctx.fillRect(bx + x - ci, by + y - ci, 1, 1);
      });
    });
  });
  addCanvasTex(scene, 'grave', 14, 18, (ctx) => {
    ctx.fillStyle = '#4a4a56';
    ctx.fillRect(2, 2, 10, 15);
    ctx.fillRect(3, 1, 8, 1);
    ctx.fillRect(4, 0, 6, 1);
    ctx.fillStyle = '#6a6a78';
    ctx.fillRect(3, 2, 2, 14);
    ctx.fillStyle = '#2a2a33';
    ctx.fillRect(6, 4, 2, 7);
    ctx.fillRect(4, 6, 6, 2);
    ctx.fillStyle = '#1a2a14';
    ctx.fillRect(0, 16, 14, 2);
  });
  addCanvasTex(scene, 'rock', 12, 8, (ctx) => {
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(1, 2, 10, 6);
    ctx.fillRect(3, 1, 6, 1);
    ctx.fillStyle = '#5a5a62';
    ctx.fillRect(2, 2, 4, 2);
  });
  addCanvasTex(scene, 'flowers', 16, 10, (ctx) => {
    const r = rng(5);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * 14);
      const y = Math.floor(r() * 8);
      ctx.fillStyle = '#2a4a22';
      ctx.fillRect(x, y + 1, 1, 2);
      ctx.fillStyle = ['#d04060', '#e0d040', '#a060e0'][i % 3];
      ctx.fillRect(x, y, 1, 1);
    }
  });
  addCanvasTex(scene, 'bones', 12, 6, (ctx) => {
    ctx.fillStyle = '#cfc8b4';
    ctx.fillRect(1, 2, 8, 1);
    ctx.fillRect(0, 1, 2, 1);
    ctx.fillRect(0, 3, 2, 1);
    ctx.fillRect(8, 1, 2, 1);
    ctx.fillRect(8, 3, 2, 1);
    ctx.fillRect(9, 4, 3, 2);
  });
}
