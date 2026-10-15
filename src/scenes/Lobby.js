// Online co-op menus: host/join screen and the pre-game lobby.

import Phaser from 'phaser';
import { audio } from '../audio.js';
import { CHARACTERS } from '../data.js';
import { PLAYER_COLORS, PLAYER_CSS, net, netOn } from '../net.js';
import { loadSave, writeSave } from '../save.js';
import { COLORS, H, Nav, W, button, card, hookAudioUnlock, onKeyDown, panel, txt } from '../ui.js';
import { WEAPONS } from '../weapons.js';
import { backdrop } from './Menus.js';

const MAX_PLAYERS = 4;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function lastChar() {
  const c = loadSave().lastChar;
  return c in CHARACTERS ? c : 'viktor';
}

/* ---------------------------------------------------------------------- */

export class CoopScene extends Phaser.Scene {
  constructor() {
    super('Coop');
  }

  create() {
    backdrop(this);
    hookAudioUnlock(this);
    this.busy = false;
    txt(this, W / 2, 110, 'ONLINE CO-OP', 40, COLORS.gold, { ox: 0.5 });
    txt(this, W / 2, 170, 'Up to 4 hunters. Shared XP, your own upgrades.', 12, COLORS.dim, { ox: 0.5 });

    const host = button(this, W / 2, 280, 'HOST GAME', 380, 60, 20);
    const join = button(this, W / 2, 360, 'JOIN GAME', 380, 60, 20);
    const back = button(this, W / 2, 440, 'BACK', 380, 60, 20);
    host.onSelect = () => this.host();
    join.onSelect = () => this.startEntry();
    back.onSelect = () => this.scene.start('Menu');
    this.nav = new Nav(this, [host, join, back], { onCancel: () => !this.entry && this.scene.start('Menu') });

    this.status = txt(this, W / 2, 540, '', 12, COLORS.text, { ox: 0.5, align: 'center', wrap: 1000 });

    // Room code entry (shown when joining)
    this.entry = null;
    this.entryUI = this.add.container(W / 2, H / 2).setVisible(false).setDepth(10);
    this.entryUI.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setInteractive());
    const g = this.add.graphics();
    this.entryUI.add(g);
    g.fillStyle(0x1a1230, 0.98).fillRect(-330, -150, 660, 300);
    g.lineStyle(4, 0xffd76a).strokeRect(-330, -150, 660, 300);
    this.entryUI.add(txt(this, 0, -120, 'ENTER ROOM CODE', 20, COLORS.gold, { ox: 0.5 }));
    this.codeBoxes = [];
    for (let i = 0; i < 4; i++) {
      const x = -150 + i * 100;
      this.entryUI.add(this.add.rectangle(x, -10, 80, 96, 0x0a0614).setStrokeStyle(3, 0x8a6a2a));
      const t = txt(this, x, -10, '', 40, COLORS.text, { ox: 0.5, oy: 0.5 });
      this.entryUI.add(t);
      this.codeBoxes.push(t);
    }
    this.entryUI.add(txt(this, 0, 80, 'Type the 4 letters, ENTER to join, ESC to cancel', 10, COLORS.dim, { ox: 0.5 }));
    const typeBtn = txt(this, 0, 112, '[ tap here to type ]', 10, COLORS.blue, { ox: 0.5 }).setInteractive({ useHandCursor: true });
    typeBtn.on('pointerdown', () => {
      // Fallback for touch devices without a hardware keyboard.
      const v = window.prompt('Room code');
      if (v) {
        this.entry = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        this.refreshEntry();
        if (this.entry.length === 4) this.join(this.entry);
      }
    });
    this.entryUI.add(typeBtn);

    onKeyDown(this, (ev) => {
      if (this.entry === null || this.busy) return;
      if (ev.code === 'Escape') this.endEntry();
      else if (ev.code === 'Backspace') this.entry = this.entry.slice(0, -1);
      else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
        if (this.entry.length === 4) this.join(this.entry);
      } else if (/^Key[A-Z]$/.test(ev.code) && this.entry.length < 4) {
        const ch = ev.code.slice(3);
        if (LETTERS.includes(ch)) this.entry += ch;
        audio.play('move');
      }
      this.refreshEntry();
    });

    if (location.protocol === 'file:') this.status.setText('Co-op needs the game server: run "npm run dev" and open the URL it prints.').setColor(COLORS.red);
  }

  startEntry() {
    this.entry = '';
    this.nav.enabled = false;
    this.entryUI.setVisible(true);
    this.refreshEntry();
  }

  endEntry() {
    this.entry = null;
    this.entryUI.setVisible(false);
    this.time.delayedCall(50, () => (this.nav.enabled = true));
  }

  refreshEntry() {
    this.codeBoxes.forEach((t, i) => t.setText(this.entry?.[i] || ''));
  }

  async host() {
    if (this.busy) return;
    this.busy = true;
    this.status.setText('Creating room...').setColor(COLORS.text);
    try {
      await net.connect({ create: true });
      const save = loadSave();
      net.session = {
        inGame: false,
        players: [{ id: net.id, slot: 0, name: 'P1', charId: lastChar(), powerups: save.powerups || {} }],
      };
      this.scene.start('Lobby');
    } catch (e) {
      this.busy = false;
      this.status.setText(e.message).setColor(COLORS.red);
    }
  }

  async join(code) {
    if (this.busy) return;
    this.busy = true;
    this.status.setText(`Joining ${code}...`).setColor(COLORS.text);
    try {
      await net.connect({ join: code });
      this.scene.start('Lobby');
    } catch (e) {
      this.busy = false;
      this.endEntry();
      this.status.setText(e.message).setColor(COLORS.red);
    }
  }
}

/* ---------------------------------------------------------------------- */

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create() {
    backdrop(this);
    hookAudioUnlock(this);
    this.players = net.session?.players || [];
    this.myChar = lastChar();
    this.leaving = false;

    txt(this, W / 2, 46, 'LOBBY', 32, COLORS.gold, { ox: 0.5 });
    txt(this, W / 2, 100, `ROOM CODE  ${net.code}`, 24, COLORS.text, { ox: 0.5 });
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const hint = local
      ? 'Same computer: open another tab at this address. Other devices: run "npm run lan" and use its Network URL.'
      : `Friends open ${location.origin} and join with the code above.`;
    txt(this, W / 2, 140, hint, 9, COLORS.dim, { ox: 0.5, align: 'center', wrap: 1100 });

    // Player slots
    this.slotViews = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const x = W / 2 + (i - 1.5) * 250;
      panel(this, x, 280, 220, 200, { border: PLAYER_COLORS[i] });
      const hero = this.add.image(x, 255, 'hero_viktor_0').setScale(5).setVisible(false);
      const name = txt(this, x, 330, '', 12, PLAYER_CSS[i], { ox: 0.5 });
      const sub = txt(this, x, 354, 'waiting...', 8, COLORS.dim, { ox: 0.5 });
      this.slotViews.push({ hero, name, sub });
    }

    // Character picker
    txt(this, W / 2, 410, 'CHOOSE YOUR HUNTER', 12, COLORS.gold, { ox: 0.5 });
    const ids = Object.keys(CHARACTERS);
    const items = ids.map((id, i) => {
      const it = card(this, W / 2 + (i - (ids.length - 1) / 2) * 150, 500, 136, 120);
      const c = CHARACTERS[id];
      it.container.add(this.add.image(0, -22, `hero_${id}_0`).setScale(3));
      it.container.add(txt(this, 0, 26, c.name, 8, COLORS.text, { ox: 0.5 }));
      it.container.add(this.add.image(-30, 44, WEAPONS[c.weapon].icon).setScale(1.5));
      it.container.add(txt(this, -18, 40, WEAPONS[c.weapon].name, 6, COLORS.gold));
      it.onSelect = () => this.pick(id);
      return it;
    });

    const leave = button(this, W / 2 - 170, H - 56, 'LEAVE', 300, 54);
    leave.onSelect = () => this.leave();
    items.push(leave);
    if (net.isHost) {
      this.startBtn = button(this, W / 2 + 170, H - 56, 'START', 300, 54, 18);
      this.startBtn.onSelect = () => this.start();
      items.push(this.startBtn);
    } else {
      txt(this, W / 2 + 170, H - 56, 'Waiting for host...', 12, COLORS.dim, { ox: 0.5, oy: 0.5 });
    }
    this.nav = new Nav(this, items, { columns: ids.length, initial: Math.max(0, ids.indexOf(this.myChar)), onCancel: () => this.leave() });

    netOn(this, 'message', (m, from) => (net.isHost ? this.hostMessage(m, from) : this.clientMessage(m)));
    netOn(this, 'closed', (reason) => this.bail(`Disconnected: ${reason}`));

    if (net.isHost) {
      this.broadcast();
    } else {
      net.send({ t: 'hello', charId: this.myChar, powerups: loadSave().powerups || {} });
    }
    this.render();
  }

  pick(id) {
    this.myChar = id;
    const save = loadSave();
    save.lastChar = id;
    writeSave(save);
    if (net.isHost) {
      const me = this.players.find((p) => p.id === net.id);
      if (me) me.charId = id;
      this.broadcast();
    } else {
      net.send({ t: 'pick', charId: id });
    }
    this.render();
  }

  // ---- host -------------------------------------------------------------

  hostMessage(m, from) {
    const s = net.session;
    if (m.t === 'peer-join') {
      if (s.players.length >= MAX_PLAYERS) {
        net.kick(m.id, 'full');
        return;
      }
      const used = new Set(s.players.map((p) => p.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      s.players.push({ id: m.id, slot, name: `P${slot + 1}`, charId: 'viktor', powerups: {} });
      audio.play('pickup');
    } else if (m.t === 'peer-leave') {
      s.players = s.players.filter((p) => p.id !== m.id);
    } else {
      const p = s.players.find((q) => q.id === from);
      if (!p) return;
      if ((m.t === 'hello' || m.t === 'pick') && m.charId in CHARACTERS) p.charId = m.charId;
      if (m.t === 'hello' && m.powerups && typeof m.powerups === 'object') p.powerups = m.powerups;
    }
    s.players.sort((a, b) => a.slot - b.slot);
    this.players = s.players;
    this.broadcast();
    this.render();
  }

  broadcast() {
    const players = net.session.players.map(({ id, slot, name, charId }) => ({ id, slot, name, charId }));
    net.send({ t: 'lobby', players }, 'all');
  }

  start() {
    const s = net.session;
    s.inGame = true;
    const players = s.players.map(({ id, slot, name, charId }) => ({ id, slot, name, charId }));
    net.send({ t: 'start', players }, 'all');
    this.scene.start('Game', { mp: true, players: s.players, localId: net.id });
  }

  // ---- client -----------------------------------------------------------

  clientMessage(m) {
    if (m.t === 'lobby') {
      this.players = m.players;
      this.render();
    } else if (m.t === 'start') {
      this.scene.start('ClientGame', { players: m.players, localId: net.id });
    } else if (m.t === 'host-left') {
      this.bail('The host closed the lobby');
    } else if (m.t === 'error') {
      this.bail(m.msg);
    }
  }

  // ---- shared -----------------------------------------------------------

  render() {
    this.slotViews.forEach((v, i) => {
      const p = this.players.find((q) => q.slot === i);
      v.hero.setVisible(!!p);
      if (!p) {
        v.name.setText('');
        v.sub.setText('waiting...');
        return;
      }
      v.hero.setTexture(`hero_${p.charId}_0`);
      v.name.setText(p.id === net.id ? `${p.name} (YOU)` : p.name);
      v.sub.setText(`${CHARACTERS[p.charId]?.name || '?'}${p.id === 0 ? ' - host' : ''}`);
    });
    if (this.startBtn) this.startBtn.label.setText(this.players.length > 1 ? 'START' : 'START SOLO');
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    net.close();
    this.scene.start('Menu');
  }

  bail(message) {
    if (this.leaving) return;
    this.leaving = true;
    net.close();
    this.scene.start('Menu', { message });
  }
}
