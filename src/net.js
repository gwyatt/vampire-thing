// Browser side of online co-op: a thin wrapper around the relay WebSocket
// plus the lobby "session" state that survives scene changes.

import Phaser from 'phaser';

export const PLAYER_COLORS = [0x5ac8ff, 0xff6a6a, 0x7af07a, 0xffd040];
export const PLAYER_CSS = ['#5ac8ff', '#ff6a6a', '#7af07a', '#ffd040'];

class Net {
  constructor() {
    this.ws = null;
    this.id = -1;
    this.code = '';
    this.isHost = false;
    this.events = new Phaser.Events.EventEmitter();
    this.session = null;
  }

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // Resolves with the welcome message, rejects with a readable error.
  connect({ create = false, join = '' } = {}) {
    this.close();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const q = create ? 'create=1' : `join=${encodeURIComponent(join)}`;
    const ws = new WebSocket(`${proto}//${location.host}/mp?${q}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    return new Promise((resolve, reject) => {
      let welcomed = false;
      const timer = setTimeout(() => {
        if (!welcomed) {
          reject(new Error('Could not reach the game server'));
          ws.close();
        }
      }, 6000);
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') {
          this.events.emit('binary', ev.data);
          return;
        }
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!welcomed) {
          clearTimeout(timer);
          if (msg.t === 'welcome') {
            welcomed = true;
            this.id = msg.id;
            this.code = msg.code;
            this.isHost = msg.host;
            resolve(msg);
          } else {
            reject(new Error(msg.msg || 'Connection refused'));
          }
          return;
        }
        if (msg.from !== undefined && this.isHost) this.events.emit('message', msg.m, msg.from);
        else this.events.emit('message', msg, 0);
      };
      ws.onerror = () => {
        if (!welcomed) {
          clearTimeout(timer);
          reject(new Error('Could not reach the game server'));
        }
      };
      ws.onclose = (ev) => {
        if (this.ws === ws) {
          this.ws = null;
          if (welcomed) this.events.emit('closed', ev.reason || 'Connection lost');
        }
      };
    });
  }

  // Client: send to host. Host: send to a client id or 'all'.
  send(m, to = 'all') {
    if (!this.connected) return;
    if (this.isHost) this.ws.send(JSON.stringify({ to, m }));
    else this.ws.send(JSON.stringify(m));
  }

  kick(id, reason) {
    if (this.connected && this.isHost) this.ws.send(JSON.stringify({ to: 'kick', id, reason }));
  }

  // Host only: binary payload for one client (or 255 = everyone).
  sendBinary(target, bytes) {
    if (!this.connected || !this.isHost) return;
    const out = new Uint8Array(bytes.byteLength + 1);
    out[0] = target;
    out.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), 1);
    this.ws.send(out);
  }

  close() {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      ws.close();
    }
    this.id = -1;
    this.isHost = false;
    this.session = null;
  }
}

export const net = new Net();

// Subscribe to net events for the lifetime of a scene.
export function netOn(scene, event, fn) {
  net.events.on(event, fn);
  scene.events.once('shutdown', () => net.events.off(event, fn));
}
