// Display-list replication for online co-op.
//
// Rather than teaching every weapon/effect how to serialize itself, the host
// snapshots the *visible* Images and Texts of its Game scene around each
// client's view and sends them as compact binary records. Clients mirror
// those objects and interpolate between the last two snapshots. Objects
// flagged `__local` (ground, decoration) are skipped: each peer builds those
// itself.
//
// Per-object tags set on the host:
//   __owner  player id the object belongs to
//   __body   part of that player's own body (sprite, shadow, hp bar, name):
//            the owning client hides these and draws its predicted copy
//   __follow positioned relative to its owner (aura, books, whip): the owning
//            client shifts it by (predicted pos - host pos) so it doesn't lag

import Phaser from 'phaser';
import { ART_KEYS } from './art.js';
import { FONT } from './ui.js';

const FILL = Phaser.TintModes.FILL;
const MULTIPLY = Phaser.TintModes.MULTIPLY;
const TEXT_TEX = 0xffff;
const F_FLIPX = 1;
const F_FILL = 2;
const F_FOLLOW = 4;
const F_BODY = 8;

// Only our own generated art: Phaser also registers a randomly named
// texture per Text object, which would differ between peers.
function textureTable() {
  return ART_KEYS.slice();
}

export class SnapshotEncoder {
  constructor(scene) {
    this.scene = scene;
    this.texIndex = new Map(textureTable().map((k, i) => [k, i]));
    this.nextNid = 1;
    this.buf = new ArrayBuffer(512 * 1024);
    this.view = new DataView(this.buf);
    this.bytes = new Uint8Array(this.buf);
    this.seq = 0;
  }

  // Encode every visible replicated object near (cx, cy).
  encode(cx, cy, halfW, halfH) {
    const v = this.view;
    let o = 7;
    let count = 0;
    const list = this.scene.children.list;
    for (let i = 0; i < list.length; i++) {
      const obj = list[i];
      if (!obj.visible || obj.__local || obj.alpha < 0.01) continue;
      const isText = obj.type === 'Text';
      if (!isText && obj.type !== 'Image') continue;
      const w = Math.abs(obj.width * obj.scaleX) * 0.5 + 48;
      const h = Math.abs(obj.height * obj.scaleY) + 48;
      if (Math.abs(obj.x - cx) > halfW + w || Math.abs(obj.y - cy) > halfH + h) continue;
      if (o > this.buf.byteLength - 128) break;
      const tex = isText ? TEXT_TEX : this.texIndex.get(obj.texture.key);
      if (tex === undefined) continue; // not shared art; peers couldn't draw it
      let nid = obj.__nid;
      if (!nid) {
        nid = obj.__nid = this.nextNid++;
        if (this.nextNid > 0xfffffff0) this.nextNid = 1;
      }
      v.setUint32(o, nid, true);
      v.setUint16(o + 4, tex, true);
      v.setFloat32(o + 6, obj.x, true);
      v.setFloat32(o + 10, obj.y, true);
      v.setInt16(o + 14, Math.max(-32767, Math.min(32767, Math.round(obj.scaleX * 100))), true);
      v.setInt16(o + 16, Math.max(-32767, Math.min(32767, Math.round(obj.scaleY * 100))), true);
      v.setInt16(o + 18, Math.round(Phaser.Math.Angle.Wrap(obj.rotation) * 10000), true);
      v.setUint8(o + 20, Math.round(Math.min(1, obj.alpha) * 255));
      let flags = 0;
      if (obj.flipX) flags |= F_FLIPX;
      if (!isText && obj.tintMode === FILL) flags |= F_FILL;
      if (obj.__follow) flags |= F_FOLLOW;
      if (obj.__body) flags |= F_BODY;
      v.setUint8(o + 21, flags);
      v.setUint8(o + 22, Math.round(Math.min(1.25, Math.max(0, obj.originX)) * 200));
      v.setUint8(o + 23, Math.round(Math.min(1.25, Math.max(0, obj.originY)) * 200));
      let tint = 0xffffff;
      if (isText) tint = parseInt((obj.style.color || '#ffffff').slice(1, 7), 16) || 0xffffff;
      else tint = obj.tint;
      v.setUint8(o + 24, (tint >> 16) & 255);
      v.setUint8(o + 25, (tint >> 8) & 255);
      v.setUint8(o + 26, tint & 255);
      v.setFloat32(o + 27, obj.depth, true);
      v.setUint8(o + 31, obj.__owner ?? 255);
      o += 32;
      if (isText) {
        const s = obj.text.slice(0, 40);
        v.setUint8(o, s.length);
        for (let k = 0; k < s.length; k++) v.setUint8(o + 1 + k, s.charCodeAt(k) & 127);
        o += 1 + s.length;
      }
      count++;
    }
    v.setUint8(0, 1); // message type: snapshot
    v.setUint32(1, ++this.seq, true);
    v.setUint16(5, count, true);
    return new Uint8Array(this.buf, 0, o);
  }
}

function decode(buffer, textures) {
  const v = new DataView(buffer);
  if (v.getUint8(0) !== 1) return null;
  const count = v.getUint16(5, true);
  const out = new Map();
  let o = 7;
  for (let i = 0; i < count; i++) {
    const tex = v.getUint16(o + 4, true);
    const r = {
      nid: v.getUint32(o, true),
      tex: tex === TEXT_TEX ? null : textures[tex],
      text: null,
      x: v.getFloat32(o + 6, true),
      y: v.getFloat32(o + 10, true),
      sx: v.getInt16(o + 14, true) / 100,
      sy: v.getInt16(o + 16, true) / 100,
      rot: v.getInt16(o + 18, true) / 10000,
      alpha: v.getUint8(o + 20) / 255,
      flags: v.getUint8(o + 21),
      ox: v.getUint8(o + 22) / 200,
      oy: v.getUint8(o + 23) / 200,
      tint: (v.getUint8(o + 24) << 16) | (v.getUint8(o + 25) << 8) | v.getUint8(o + 26),
      depth: v.getFloat32(o + 27, true),
      owner: v.getUint8(o + 31),
    };
    o += 32;
    if (tex === TEXT_TEX) {
      const len = v.getUint8(o);
      let s = '';
      for (let k = 0; k < len; k++) s += String.fromCharCode(v.getUint8(o + 1 + k));
      r.text = s;
      o += 1 + len;
    }
    out.set(r.nid, r);
  }
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;

export class Mirror {
  constructor(scene, localId) {
    this.scene = scene;
    this.localId = localId;
    this.textures = textureTable();
    this.objs = new Map();
    this.pool = { img: [], text: [] };
    this.prev = null;
    this.cur = null;
    this.tCur = 0;
    this.interval = 50;
  }

  ingest(buffer) {
    const snap = decode(buffer, this.textures);
    if (!snap) return;
    const now = performance.now();
    if (this.cur) this.interval = Phaser.Math.Clamp(lerp(this.interval, now - this.tCur, 0.2), 20, 200);
    this.prev = this.cur;
    this.cur = snap;
    this.tCur = now;
  }

  take(kind) {
    const p = this.pool[kind].pop();
    if (p) return p.setVisible(true);
    if (kind === 'text') {
      return this.scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '8px', color: '#fff', stroke: '#000', strokeThickness: 3 });
    }
    return this.scene.add.image(0, 0, '__DEFAULT');
  }

  // follow: Map ownerId -> {dx, dy} offset for that owner's __follow objects
  render(follow) {
    if (!this.cur) return;
    const t = Phaser.Math.Clamp((performance.now() - this.tCur) / this.interval, 0, 1);
    const seen = new Set();
    for (const r of this.cur.values()) {
      if (r.flags & F_BODY && r.owner === this.localId) continue;
      const kind = r.text !== null ? 'text' : 'img';
      let entry = this.objs.get(r.nid);
      if (entry && entry.kind !== kind) {
        this.release(r.nid, entry);
        entry = null;
      }
      if (!entry) {
        entry = { kind, obj: this.take(kind), text: null, color: -1, tex: null };
        this.objs.set(r.nid, entry);
      }
      seen.add(r.nid);
      const obj = entry.obj;
      const p = this.prev?.get(r.nid);
      const same = p && p.tex === r.tex;
      let x = same ? lerp(p.x, r.x, t) : r.x;
      let y = same ? lerp(p.y, r.y, t) : r.y;
      if (r.flags & F_FOLLOW) {
        const f = follow.get(r.owner);
        if (f) {
          x += f.dx;
          y += f.dy;
        }
      }
      const rot = same ? r.rot - Phaser.Math.Angle.Wrap(r.rot - p.rot) * (1 - t) : r.rot;
      obj.setPosition(x, y);
      obj.setRotation(rot);
      obj.setScale(same ? lerp(p.sx, r.sx, t) : r.sx, same ? lerp(p.sy, r.sy, t) : r.sy);
      obj.setAlpha(same ? lerp(p.alpha, r.alpha, t) : r.alpha);
      obj.setOrigin(r.ox, r.oy);
      obj.setDepth(r.depth);
      obj.setFlipX(!!(r.flags & F_FLIPX));
      if (kind === 'text') {
        if (entry.text !== r.text) obj.setText((entry.text = r.text));
        if (entry.color !== r.tint) {
          entry.color = r.tint;
          obj.setColor('#' + r.tint.toString(16).padStart(6, '0'));
        }
      } else {
        if (entry.tex !== r.tex && r.tex) {
          entry.tex = r.tex;
          obj.setTexture(r.tex);
        }
        obj.setTint(r.tint).setTintMode(r.flags & F_FILL ? FILL : MULTIPLY);
      }
    }
    for (const [nid, entry] of this.objs) if (!seen.has(nid)) this.release(nid, entry);
  }

  release(nid, entry) {
    entry.obj.setVisible(false);
    this.pool[entry.kind].push(entry.obj);
    this.objs.delete(nid);
  }

  // Positions of other players' bodies, for arrows/minimap: ownerId -> {x,y}
  bodyPositions() {
    const out = new Map();
    if (!this.cur) return out;
    for (const r of this.cur.values()) {
      if (r.flags & F_BODY && r.tex && r.tex.startsWith('hero_')) out.set(r.owner, { x: r.x, y: r.y });
    }
    return out;
  }
}
