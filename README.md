# Vampire Thing

A Vampire Survivors-style "bullet heaven" survival game built with
[Phaser 4](https://phaser.io). You move; your weapons fire on their own.
Survive 15 minutes of ever-growing hordes, level up, combine weapons and
passives into evolutions, then face the Reaper. Play solo or in
**online co-op with up to 4 players**.

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

`dist/` uses relative paths, so solo play works from any static server.
Co-op also needs the small relay server, which `npm run dev` and
`npm run preview` provide (see below). Opening `index.html` straight from
disk (`file://`) won't work because browsers block ES modules there.

## Online co-op

Choose **Online co-op** on the title screen.

1. One player picks **Host game**. They get a 4-letter room code.
2. Everyone else picks **Join game** and types the code.
3. Each player picks a hunter in the lobby, then the host presses **Start**.

The game server is built into the Vite server, so there's nothing extra to
run. How others reach it depends on where they are:

| Who's playing                    | Run                | Others open                               |
| -------------------------------- | ------------------ | ----------------------------------------- |
| Testing on one computer          | `npm run dev`      | A second tab at `http://localhost:5173`   |
| Same Wi-Fi / home network        | `npm run lan`      | The "Network" URL Vite prints (e.g. `http://192.168.1.20:5173`) |
| Over the internet                | `npm run lan`      | Your public address (needs port 5173 forwarded on your router, or a tunnel such as `ngrok http 5173`) |

`npm run lan` exposes the dev server to your network, so only use it on
networks you trust. You may need to allow Node through your firewall.

**Co-op rules**

- The team shares one XP bar. On every level up the game pauses until
  each player has picked their own upgrade.
- Each player has their own weapons, passives, stats and Power Ups
  (from their own save).
- Treasure chests go to whoever touches them. Everyone sees a notice of
  what they got, and the game doesn't pause.
- A fallen player becomes a ghost and comes back at the next level up.
  The run ends when everyone is down.
- Enemy numbers and health scale with the number of players.
- Esc opens a menu but **doesn't pause** in co-op. Everyone keeps the
  team's gold when the run ends.
- The host's browser runs the game for everyone, so the **host should
  keep their game tab visible**. Browsers freeze background tabs, and the
  game would stall for everybody.

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
  world.js         Infinite ground + deterministic decoration chunks
  net.js           Browser side of co-op: relay socket + lobby session
  netsync.js       Binary display snapshots (host) and interpolated mirror (client)
  scenes/
    Game.js        Authoritative simulation: players, spawning, combat, pickups
    ClientGame.js  Co-op client: predicted local player + mirrored world
    UI.js          HUD (XP bar, timer, inventory, team, boss bar, arrows)
    Overlays.js    Level up, treasure chest, pause, game over
    Menus.js       Boot, title, character select, power-up shop
    Lobby.js       Co-op host/join screen and lobby
server/
  relay.js         WebSocket relay (rooms + message forwarding), as a Vite plugin
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
  coordinates, so the world is infinite and stays consistent, and every
  co-op peer builds the same world locally.

### How co-op works

- **Relay** (`server/relay.js`): runs no game logic. It groups sockets
  into rooms by code and forwards messages between the host and clients.
- **Host-authoritative:** the host runs the normal `Game` scene with
  several players. Clients send their own position about 30 times a
  second, and the client's own movement is predicted locally, so it feels
  instant.
- **Snapshots:** instead of every weapon and effect knowing how to
  serialize itself, the host walks its display list 20 times a second.
  For each client it encodes the visible sprites and texts near that
  client's view into compact 32-byte binary records, typically 1–4 KB
  per snapshot. Clients mirror and interpolate them. HUD state (XP, HP,
  inventory), sounds and screen effects travel in a small JSON message
  alongside.
- Effects tied to a player (Garlic aura, orbiting tomes, whip slashes) are
  tagged so the owning client can keep them glued to its predicted
  position.
