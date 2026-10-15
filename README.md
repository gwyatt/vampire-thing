# Vampire Thing

A Vampire Survivors-style "bullet heaven" survival game built with
[Phaser 4](https://phaser.io). You move; your weapons fire on their own.
Survive 15 minutes of ever-growing hordes, level up, combine weapons and
passives into evolutions, then face the Reaper. Play solo or in
**online co-op with up to 4 players**.

There are no image or audio files. All pixel art is generated from tiny
pixel maps when the game starts, and all sound effects and music are
synthesized with the Web Audio API.

## Put it on the web

The game and its co-op server run as one small Node app, so a single
deploy gives you one public URL for solo and co-op play.

### One click: Render (free tier)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gwyatt/vampire-thing)

1. Click the button and sign in to Render (a GitHub login works).
2. Approve the `vampire-thing` service it proposes. The settings come from
   [`render.yaml`](render.yaml): free plan, `npm run build`, `npm start`.
3. When the build finishes, Render shows the URL, e.g.
   `https://vampire-thing.onrender.com`. Share it.

On Render's free plan the service sleeps after 15 minutes without
traffic. The next visitor wakes it up, which takes about a minute. Active
co-op games keep it awake. New pushes to the repo redeploy automatically.

### Anywhere else

Any host that runs Node 18+ (or Docker) and supports WebSockets works:
Fly.io, Railway, a VPS, and so on.

```bash
npm ci && npm run build
PORT=8080 npm start          # serves dist/ + the relay on one port
```

There's also a [`Dockerfile`](Dockerfile):

```bash
docker build -t vampire-thing .
docker run -p 8080:8080 vampire-thing
```

`/healthz` returns `{"ok":true,"rooms":N,"players":N}` for uptime checks.
Use HTTPS in front of it (most hosts do this for you). The game then
connects over secure WebSockets automatically, and the lobby's **Copy
invite link** button works (browsers only allow clipboard access on
secure pages).

## Running locally

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Vite opens the game in your browser at <http://localhost:5173>.

To try the production build locally:

```bash
npm run build     # outputs to dist/
npm start         # serves it at http://localhost:8080
```

`dist/` uses relative paths, so solo play also works from any static file
host. Co-op needs the relay, which `npm start`, `npm run dev` and
`npm run preview` all include. Opening `index.html` straight from disk
(`file://`) won't work because browsers block ES modules there.

## Online co-op

Choose **Online co-op** on the title screen.

1. One player picks **Host game**. They get a 4-letter room code.
2. They press **Copy invite link** and send it to friends. Opening the
   link (`https://your-site/?join=ABCD`) drops you straight into that
   lobby. Friends can also pick **Join game** and type the code.
3. Each player picks a hunter in the lobby, then the host presses **Start**.

How others reach the game depends on where it's running:

| Where it runs                    | Run                | Others open                               |
| -------------------------------- | ------------------ | ----------------------------------------- |
| Deployed to the web (see above)  | nothing            | The site's URL, or an invite link         |
| Testing on one computer          | `npm run dev`      | A second tab at `http://localhost:5173`   |
| Same Wi-Fi / home network        | `npm run lan`      | The "Network" URL Vite prints (e.g. `http://192.168.1.20:5173`) |

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
  index.js         Production server: static dist/ + relay on one port
  relay.js         WebSocket relay (rooms + message forwarding), also a Vite plugin
render.yaml        Render blueprint (free web service)
Dockerfile         Container image for any other host
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
  For the public internet it limits rooms (`MAX_ROOMS`, default 500) and
  sockets per IP (`MAX_SOCKETS_PER_IP`, default 16), rate-limits client
  messages, and drops dead connections with a heartbeat.
  `server/index.js` serves the built game with gzip, long-lived caching
  for fingerprinted assets, and a strict Content-Security-Policy.
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
