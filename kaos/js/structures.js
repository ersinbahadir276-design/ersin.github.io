// İnşa parçaları: tanımlar, 3B modeller, çarpışma kutuları ve üstünde yürünebilen yüzeyler.
import * as THREE from 'three';

export const PIECES = {
  floor:  { name: 'Zemin', cost: { wood: 3 }, hp: 120, snap: 2 },
  wall:   { name: 'Duvar', cost: { wood: 4 }, hp: 140, snap: 'edge' },
  door:   { name: 'Kapı', cost: { wood: 4, stone: 1 }, hp: 120, snap: 'edge' },
  ramp:   { name: 'Rampa', cost: { wood: 4 }, hp: 120, snap: 1 },
  roof:   { name: 'Çatı', cost: { wood: 3 }, hp: 100, snap: 2 },
  tower:  { name: 'Kule', cost: { wood: 8, stone: 2 }, hp: 200, snap: 2 },
  launch: { name: 'Zıplatıcı', cost: { wood: 3, stone: 3 }, hp: 80, snap: 1 },
  spikes: { name: 'Kazık', cost: { wood: 4, stone: 2 }, hp: 60, snap: 1 },
  chest:  { name: 'Sandık', cost: { wood: 5 }, hp: 80, snap: 1 },
  fire:   { name: 'Kamp Ateşi', cost: { wood: 3, stone: 3 }, hp: 80, snap: 1 },
  barrel: { name: 'Patlayıcı Varil', cost: { wood: 2, stone: 3 }, hp: 0, snap: 1, prop: true },
};
export const PIECE_KEYS = Object.keys(PIECES);
export const WALL_H = 2.6, TOWER_H = 3.0, RAMP_L = 4.5;

const MAT = new Map();
function m(color, extra) {
  const k = color + JSON.stringify(extra || {});
  if (!MAT.has(k)) MAT.set(k, new THREE.MeshLambertMaterial({ color, flatShading: true, ...(extra || {}) }));
  return MAT.get(k);
}
function bx(g, w, h, d, color, x, y, z, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(color));
  mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
}
const WOOD = '#9a6a3c', WOOD2 = '#84562c', DARK = '#5e3b1a', STONE = '#8d8d8d';

export function buildMesh(k) {
  const g = new THREE.Group();
  if (k === 'floor') {
    bx(g, 2, 0.25, 2, WOOD, 0, 0.125, 0);
    for (let i = 0; i < 4; i++) bx(g, 0.03, 0.02, 2, DARK, -0.75 + i * 0.5, 0.255, 0);
  } else if (k === 'wall' || k === 'door') {
    if (k === 'wall') { for (let i = 0; i < 4; i++) bx(g, 0.5, WALL_H, 0.22, i % 2 ? WOOD : WOOD2, -0.75 + i * 0.5, WALL_H / 2, 0); }
    else {
      bx(g, 0.3, WALL_H, 0.24, WOOD2, -0.85, WALL_H / 2, 0); bx(g, 0.3, WALL_H, 0.24, WOOD2, 0.85, WALL_H / 2, 0);
      bx(g, 2, 0.45, 0.24, WOOD2, 0, WALL_H - 0.225, 0);
      const pivot = new THREE.Group(); pivot.position.set(-0.7, 0, 0); g.add(pivot);
      bx(pivot, 1.4, 2.1, 0.12, '#b07a45', 0.7, 1.05, 0);
      bx(pivot, 0.12, 0.12, 0.08, '#e8c86a', 1.2, 1.05, 0.1);
      g.userData.leaf = pivot;
    }
    bx(g, 2, 0.12, 0.3, DARK, 0, 0.7, 0.02); bx(g, 2, 0.12, 0.3, DARK, 0, 1.9, 0.02);
  } else if (k === 'ramp') {
    const ang = Math.atan2(TOWER_H, RAMP_L), len = Math.hypot(TOWER_H, RAMP_L);
    const r = bx(g, 2, 0.2, len, WOOD, 0, TOWER_H / 2, 0, -ang);
    for (let i = 1; i < 8; i++) { const t = i / 8; bx(g, 2, 0.06, 0.12, DARK, 0, TOWER_H * t + 0.12, -RAMP_L / 2 + RAMP_L * t); }
    r.receiveShadow = true;
  } else if (k === 'roof') {
    bx(g, 2.2, 0.2, 2.2, '#b5523b', 0, WALL_H + 0.1, 0);
    bx(g, 2.2, 0.06, 0.12, '#8f3b28', 0, WALL_H + 0.23, -0.6); bx(g, 2.2, 0.06, 0.12, '#8f3b28', 0, WALL_H + 0.23, 0.6);
  } else if (k === 'tower') {
    for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) bx(g, 0.22, TOWER_H, 0.22, WOOD2, x, TOWER_H / 2, z);
    bx(g, 2, 0.25, 2, WOOD, 0, TOWER_H - 0.125, 0);
    for (const [x, z, w, d] of [[0, -0.95, 2, 0.1], [0, 0.95, 2, 0.1], [-0.95, 0, 0.1, 2]]) bx(g, w, 0.1, d, DARK, x, TOWER_H + 0.55, z);
    for (const [x, z] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) bx(g, 0.1, 0.6, 0.1, DARK, x, TOWER_H + 0.3, z);
    bx(g, 2.3, 0.12, 0.12, DARK, 0, 1.4, -0.85); bx(g, 2.3, 0.12, 0.12, DARK, 0, 1.4, 0.85);
  } else if (k === 'launch') {
    bx(g, 1.6, 0.15, 1.6, '#5a5a5a', 0, 0.075, 0);
    const top = new THREE.Group(); g.add(top);
    bx(top, 1.4, 0.12, 1.4, '#ff6b35', 0, 0.3, 0);
    bx(top, 0.6, 0.02, 0.6, '#ffd23f', 0, 0.37, 0);
    const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8, 1, true), m('#cccccc', { side: THREE.DoubleSide })); spring.position.y = 0.2; top.add(spring);
    g.userData.top = top;
  } else if (k === 'spikes') {
    bx(g, 1.6, 0.1, 1.6, DARK, 0, 0.05, 0);
    const cg = new THREE.ConeGeometry(0.08, 0.6, 5);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const c = new THREE.Mesh(cg, m('#d8b27a')); c.position.set(-0.5 + i * 0.5, 0.38, -0.5 + j * 0.5); c.castShadow = true; g.add(c); }
  } else if (k === 'chest') {
    bx(g, 1.1, 0.6, 0.7, '#a0662f', 0, 0.3, 0);
    const lid = bx(g, 1.14, 0.22, 0.74, '#8a5424', 0, 0.71, 0);
    bx(g, 1.16, 0.08, 0.1, '#e8c86a', 0, 0.45, 0.36); bx(g, 0.14, 0.18, 0.06, '#e8c86a', 0, 0.6, 0.38);
    g.userData.lid = lid;
  } else if (k === 'fire') {
    const sg = new THREE.DodecahedronGeometry(0.18, 0);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const s = new THREE.Mesh(sg, m(STONE)); s.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55); s.castShadow = true; g.add(s); }
    for (let i = 0; i < 3; i++) { const l = bx(g, 0.14, 0.14, 0.9, DARK, 0, 0.15, 0); l.rotation.y = (i / 3) * Math.PI; }
    const fl = new THREE.Group(); fl.position.y = 0.2; g.add(fl);
    for (const [r, h, c, y] of [[0.32, 0.9, '#ff6a12', 0.45], [0.2, 0.65, '#ffb02a', 0.33], [0.11, 0.45, '#fff07a', 0.23]]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), new THREE.MeshBasicMaterial({ color: c })); f.position.y = y; fl.add(f);
    }
    g.userData.flames = fl;
  }
  return g;
}

// Parçanın çarpışma kutuları ve yürünebilir yüzeyleri (dünya koordinatında)
export function pieceShapes(s) {
  const cs = Math.cos(s.ry), sn = Math.sin(s.ry);
  const W = (lx, lz) => [s.x + lx * cs + lz * sn, s.z - lx * sn + lz * cs];
  const cols = [], tops = [];
  const box = (lx, lz, hw, hd, y0, y1, extra) => { const [x, z] = W(lx, lz); cols.push({ type: 'b', x, z, hw, hd, ry: s.ry, yMin: s.y + y0, yMax: s.y + y1, sid: s.id, ...extra }); };
  const circ = (lx, lz, r, y0, y1) => { const [x, z] = W(lx, lz); cols.push({ type: 'c', x, z, r, yMin: s.y + y0, yMax: s.y + y1, sid: s.id }); };
  switch (s.k) {
    case 'floor': tops.push({ kind: 'rect', hw: 1, hd: 1, h: 0.25 }); break;
    case 'wall': box(0, 0, 1, 0.13, 0, WALL_H); break;
    case 'door': box(-0.85, 0, 0.15, 0.13, 0, WALL_H); box(0.85, 0, 0.15, 0.13, 0, WALL_H); if (!s.open) box(0, 0, 0.7, 0.09, 0, 2.15, { door: true }); break;
    case 'roof': tops.push({ kind: 'rect', hw: 1.1, hd: 1.1, h: WALL_H + 0.2 }); break;
    case 'tower': for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) circ(x, z, 0.16, 0, TOWER_H); tops.push({ kind: 'rect', hw: 1, hd: 1, h: TOWER_H }); break;
    case 'ramp': tops.push({ kind: 'ramp', hw: 1, hd: RAMP_L / 2, h: TOWER_H }); break;
    case 'chest': box(0, 0, 0.55, 0.35, 0, 0.8); tops.push({ kind: 'rect', hw: 0.55, hd: 0.35, h: 0.82 }); break;
    case 'fire': circ(0, 0, 0.6, 0, 0.6); break;
  }
  return { cols, tops };
}

// Bir noktadaki yürünebilir yüzey yüksekliği (yoksa -Infinity)
export function topHeight(s, tops, x, z) {
  const cs = Math.cos(s.ry), sn = Math.sin(s.ry);
  const dx = x - s.x, dz = z - s.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  let best = -Infinity;
  for (const t of tops) {
    if (Math.abs(lx) > t.hw || Math.abs(lz) > t.hd) continue;
    const h = t.kind === 'ramp' ? s.y + t.h * ((lz + t.hd) / (2 * t.hd)) : s.y + t.h;
    if (h > best) best = h;
  }
  return best;
}

// Istemci tarafı: yapıların sahnedeki hali + çarpışmaları + yürünebilir yüzey sorgusu
export class Structs {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.map = new Map();
    this.grid = new Map(); // yüzey ızgarası (4 m)
  }
  _cells(s, f) { const r = s.k === 'ramp' ? 3 : 2; for (let i = Math.floor((s.x - r) / 4); i <= Math.floor((s.x + r) / 4); i++) for (let j = Math.floor((s.z - r) / 4); j <= Math.floor((s.z + r) / 4); j++) f(i * 4099 + j); }
  add(s) {
    if (this.map.has(s.id)) return this.map.get(s.id);
    const mesh = buildMesh(s.k);
    mesh.position.set(s.x, s.y, s.z); mesh.rotation.y = s.ry;
    this.scene.add(mesh);
    const r = { ...s, mesh, cols: [], tops: [], anim: 0 };
    this.map.set(s.id, r);
    this._shapes(r);
    this._cells(r, (k) => { if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(r); });
    if (s.k === 'door' && s.open) this._doorVisual(r);
    return r;
  }
  _shapes(r) {
    for (const c of r.cols) this.world.removeCollider(c);
    const sh = pieceShapes(r);
    r.cols = sh.cols; r.tops = sh.tops;
    for (const c of r.cols) this.world.addCollider(c);
  }
  _doorVisual(r) { const leaf = r.mesh.userData.leaf; if (leaf) leaf.rotation.y = r.open ? -1.45 : 0; }
  update(m) {
    const r = this.map.get(m.id);
    if (!r) return null;
    if (m.hp !== undefined) r.hp = m.hp;
    if (m.open !== undefined && m.open !== r.open) { r.open = m.open; this._shapes(r); this._doorVisual(r); }
    if (m.fire) r.anim = 0.5;
    return r;
  }
  remove(id) {
    const r = this.map.get(id);
    if (!r) return null;
    this.scene.remove(r.mesh);
    for (const c of r.cols) this.world.removeCollider(c);
    this._cells(r, (k) => { const a = this.grid.get(k); if (a) { const i = a.indexOf(r); if (i >= 0) a.splice(i, 1); } });
    this.map.delete(id);
    return r;
  }
  clear() { for (const id of [...this.map.keys()]) this.remove(id); }
  // y'nin en fazla 'step' üstündeki en yüksek yürünebilir yüzey
  topAt(x, z, maxY) {
    let best = -Infinity;
    const a = this.grid.get(Math.floor(x / 4) * 4099 + Math.floor(z / 4));
    if (!a) return best;
    for (const r of a) { if (!r.tops.length) continue; const h = topHeight(r, r.tops, x, z); if (h <= maxY && h > best) best = h; }
    return best;
  }
  near(x, z, rad, k) { let best = null, bd = rad * rad; for (const r of this.map.values()) { if (k && r.k !== k) continue; const d = (r.x - x) ** 2 + (r.z - z) ** 2; if (d < bd) { bd = d; best = r; } } return best; }
  tick(dt, time) {
    for (const r of this.map.values()) {
      if (r.k === 'fire') { const f = r.mesh.userData.flames; f.scale.set(1 + Math.sin(time * 13 + r.id) * 0.08, 1 + Math.sin(time * 17 + r.id) * 0.18, 1 + Math.cos(time * 11) * 0.08); f.rotation.y += dt * 1.5; }
      if (r.k === 'launch' && r.anim > 0) { r.anim = Math.max(0, r.anim - dt); const t = r.mesh.userData.top; t.position.y = Math.sin((r.anim / 0.5) * Math.PI) * 0.5; }
    }
  }
}
