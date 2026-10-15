// Infinite scrolling ground plus deterministic decoration chunks. Each
// client builds this locally around its own camera, so it is never sent
// over the network.

const CHUNK = 320;

const chunkKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9;
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
}

export class World {
  constructor(scene, viewW, viewH) {
    this.scene = scene;
    this.viewW = viewW;
    this.viewH = viewH;
    this.chunks = new Map();
    this.ground = scene.add.tileSprite(0, 0, viewW + 256, viewH + 256, 'ground').setOrigin(0).setDepth(-100000);
    this.ground.__local = true;
  }

  update(x, y) {
    const left = Math.floor(x - this.viewW / 2 - 128);
    const top = Math.floor(y - this.viewH / 2 - 128);
    this.ground.setPosition(left, top);
    this.ground.tilePositionX = left;
    this.ground.tilePositionY = top;

    const cx0 = Math.floor((x - this.viewW) / CHUNK);
    const cx1 = Math.floor((x + this.viewW) / CHUNK);
    const cy0 = Math.floor((y - this.viewH) / CHUNK);
    const cy1 = Math.floor((y + this.viewH) / CHUNK);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = chunkKey(cx, cy);
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
      const img = this.scene.add.image(x, y, tex).setOrigin(0.5, 1).setDepth(flat ? -60 : y);
      if (r() < 0.5) img.setFlipX(true);
      img.__local = true;
      imgs.push(img);
    }
    return imgs;
  }
}
