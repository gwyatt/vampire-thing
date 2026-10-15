# Vampire Thing

A Vampire Survivors-style "bullet heaven" survival game built with
[Phaser 4](https://phaser.io). You move; your weapons fire on their own.
Survive 15 minutes of ever-growing hordes, level up, combine weapons and
passives into evolutions, then face the Reaper.

There are no image or audio files. All pixel art is generated from tiny
pixel maps when the game starts, and all sound effects and music are
synthesized with the Web Audio API.

## Running locally

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Vite opens the game in your browser at <http://localhost:5173>.

To make a static production build:

```bash
npm run build     # outputs to dist/
npm run preview   # serves dist/ at http://localhost:4173
```

`dist/` uses relative paths, so you can host it on any static server.
Opening `index.html` straight from disk (`file://`) won't work because
browsers block ES modules there.

## Controls

| Action              | Keys                                                 |
| ------------------- | ---------------------------------------------------- |
| Move                | WASD / arrow keys, or click/touch and drag           |
| Menus               | Arrow keys + Enter/Space, number keys, or the mouse  |
| Pause               | Esc or P (the game also pauses when the window loses focus) |
| Mute                | M                                                    |

## What's in it

- **5 characters**, each with a starting weapon and a stat bonus.
- **8 weapons**, each with 8 levels: Whip, Magic Wand, Knife, Axe,
  Holy Tome, Garlic, Sacred Water, Storm Ring.
- **13 passive items**: Might, Armor, Max HP, Recovery, Cooldown, Area,
  Projectile Speed, Duration, Amount, Move Speed, Magnet, Luck and Growth.
- **8 evolutions.** Get a weapon to level 8, own its paired passive, then
  open a treasure chest:

  | Weapon       | + Passive    | = Evolution     |
  | ------------ | ------------ | --------------- |
  | Whip         | Hollow Heart | Crimson Lash    |
  | Magic Wand   | Empty Tome   | Arcane Torrent  |
  | Knife        | Bracer       | Thousand Blades |
  | Axe          | Candelabra   | Death Spiral    |
  | Holy Tome    | Spellbinder  | Eternal Codex   |
  | Garlic       | Tomato Charm | Soul Devourer   |
  | Sacred Water | Attractorb   | Abyssal Font    |
  | Storm Ring   | Duplicator   | Thunder Loop    |

- **Enemies and waves:** bats, zombies, skeletons, ghosts, werewolves,
  mummies and mantises across 15 one-minute waves. The waves include elite
  enemies that drop treasure chests, bat swarms, zombie rings, giant
  bosses, and the Reaper at 15:00.
- **Pickups:** XP gems (blue, green and red), floor chicken, coins, magnet,
  rosary (clears the screen) and stopwatch (freezes enemies). Most come
  from breaking braziers.
- **Treasure chests** can give 1, 3 or 5 upgrades depending on luck.
- **Meta progression:** gold earned in runs buys permanent Power Ups in
  the shop, with a refund button. Progress is saved in `localStorage`.
- **End-of-run report** with the damage and DPS of each weapon.

## Project layout

```
src/
  main.js          Phaser game config and font loading
  art.js           Procedural pixel art (sprites, icons, ground, props)
  audio.js         Web Audio sound effects and chiptune music
  data.js          Characters, passives, enemies, waves, shop, XP curve
  weapons.js       Weapon definitions, level tables and behaviours
  save.js          localStorage persistence
  ui.js            Pixel text, panels, cards, keyboard/mouse menu navigation
  scenes/
    Game.js        Core loop: player, spawning, spatial grid, combat, pickups
    UI.js          HUD (XP bar, timer, inventory, boss bar, chest arrows)
    Overlays.js    Level up, treasure chest, pause, game over
    Menus.js       Boot, title, character select, power-up shop
```

### Tuning

- `RUN_LENGTH` in `src/data.js` sets the run length.
- `WAVES` in `src/data.js` sets each minute's enemy mix and density.
- Weapon stats and per-level upgrades are the `WEAPONS` table in
  `src/weapons.js`.

### Implementation notes

- Enemies don't use a physics engine. A uniform spatial hash grid is
  rebuilt every frame and handles weapon hit queries, enemy separation
  and contact damage. Hundreds of enemies cost about 1 ms of game logic
  per frame.
- Enemy sprites, damage numbers and particles are pooled.
- The ground is a single `TileSprite` that follows the camera. Props are
  placed in deterministic chunks generated from a hash of the chunk
  coordinates, so the world is infinite and stays consistent.
