// Ev sahibi simülasyonuna eklenen dünya özellikleri: kaynaklar, yapılar, tuzaklar,
// fizik nesneleri (varil/sandık), patlamalar, taşıma-fırlatma ve kayıt.
import { PIECES, WALL_H } from './structures.js';
import { HALF, WATER } from './world.js';

const r2 = (v) => Math.round(v * 100) / 100;
const PROP = { barrel: { r: 0.42, hp: 20, mass: 1 }, crate: { r: 0.45, hp: 25, mass: 1.4 } };
const BOOM_R = 5.2;
export const SAVE_KEY = 'kaos.save.v1';

export const WorldSim = {
  initWorld(opts) {
    const W = this.world;
    this.ns = W.nodes.map((n) => ({ hp: n.maxHp, alive: true, at: 0 }));
    this.deadNodes = new Set();
    this.structs = new Map(); this.sid = 1;
    this.props = new Map(); this.oid = 1;
    this.surface = () => -Infinity; // yapıların yürünebilir yüzeyi (main.js bağlar)
    this.saveT = 10; this.dirty = false; this.secT = 0;
    if (opts.save && opts.save.structs) for (const s of opts.save.structs) { const d = { ...s, id: this.sid++ }; this.structs.set(d.id, d); }
    // adaya dağılmış variller ve sandıklar
    for (let i = 0; i < 16; i++) this.spawnProp(i % 2 ? 'crate' : 'barrel');
  },

  spawnProp(k, x, z, y) {
    const W = this.world;
    if (x === undefined) {
      for (let t = 0; t < 30; t++) {
        const a = Math.random() * 6.28, r = 8 + Math.random() * HALF * 0.6;
        x = W.spawn.x + Math.cos(a) * r; z = W.spawn.z + Math.sin(a) * r;
        if (W.heightAt(x, z) > 0.8 && W.slopeAt(x, z) < 1.5 && !W.overlaps(x, z, 0.6)) break;
      }
    }
    const o = { id: this.oid++, k, x, z, y: y ?? W.heightAt(x, z), vx: 0, vy: 0, vz: 0, ry: Math.random() * 6.28, roll: 0, hp: PROP[k].hp, fuse: -1, carriedBy: null, thrown: 0, by: '' };
    this.props.set(o.id, o);
    return o;
  },

  give(pid, items) { this.emit(pid, { t: 'give', items }); },

  // ------------------------------------------------------------ saldırının dünyaya etkisi
  attackWorld(pid, A, kind, x, z, ry, p) {
    const fx = Math.sin(ry), fz = Math.cos(ry);
    let hits = 0;
    const inArc = (ox, oz, reach) => { const dx = ox - x, dz = oz - z, d = Math.hypot(dx, dz); return d <= reach && (d < 0.6 || (dx * fx + dz * fz) / d >= A.arc) ? d : -1; };
    for (const o of this.props.values()) {
      if (o.carriedBy) continue;
      const d = inArc(o.x, o.z, A.reach + 0.4);
      if (d < 0 || Math.abs(o.y - p.y) > 2) continue;
      const ux = d > 0.01 ? (o.x - x) / d : fx, uz = d > 0.01 ? (o.z - z) / d : fz;
      o.vx += ux * A.knock * 1.3; o.vz += uz * A.knock * 1.3; o.vy += A.lift * 0.6; o.by = pid;
      o.hp -= A.dmg;
      this.emit('*', { t: 'ohit', id: o.id, x: r2(o.x), y: r2(o.y), z: r2(o.z) });
      if (o.hp <= 0) this.breakProp(o, pid);
      hits++;
    }
    if (kind === 'heavy') {
      for (const s of this.structs.values()) {
        const d = inArc(s.x, s.z, A.reach + 1);
        if (d < 0 || Math.abs(s.y - p.y) > 2.5) continue;
        this.damageStruct(s, A.dmg * 1.5); hits++;
      }
    }
    if (hits) return hits;
    // kaynak toplama: önündeki en yakın ağaç/kaya/çalı
    let best = null, bd = 1e9;
    for (const n of this.world.nodesNear(x, z, A.reach + 2)) {
      const s = this.ns[n.id];
      if (!s.alive) continue;
      const dx = n.x - x, dz = n.z - z, d = Math.hypot(dx, dz);
      if (d - n.r > A.reach || (d > n.r + 0.6 && (dx * fx + dz * fz) / d < 0.3)) continue;
      if (d - n.r < bd) { bd = d - n.r; best = n; }
    }
    if (best) this.hitNode(pid, best, kind === 'heavy' ? 3 : 1, x, z);
    return best ? 1 : 0;
  },

  hitNode(pid, n, power, fromX, fromZ) {
    const s = this.ns[n.id];
    let give = {};
    if (n.kind === 'bush') { this.emit(pid, { t: 'heal', amt: 12 }); s.hp -= 1; }
    else { const k = n.kind === 'rock' ? 'stone' : 'wood'; const amt = Math.min(power, s.hp); s.hp -= power; give[k] = amt; }
    if (s.hp <= 0) { s.hp = 0; s.alive = false; s.at = this.t + (n.kind === 'rock' ? 120 : n.kind === 'bush' ? 60 : 90); this.deadNodes.add(n.id); }
    if (Object.keys(give).length) this.give(pid, give);
    this.emit('*', { t: 'node', id: n.id, hp: s.hp, alive: s.alive ? 1 : 0, by: pid, x: r2(fromX), z: r2(fromZ) });
  },

  // ------------------------------------------------------------ yapılar
  build(pid, m) {
    const P = PIECES[m.k], p = this.players.get(pid);
    if (!P || !p) return;
    const x = +m.x, y = +m.y, z = +m.z, ry = +m.ry || 0;
    if (![x, y, z].every(isFinite) || Math.hypot(x - p.x, z - p.z) > 9) return;
    if (m.k === 'barrel') { this.spawnProp('barrel', x, z, y); return; }
    const s = { id: this.sid++, k: m.k, x: r2(x), y: r2(y), z: r2(z), ry: r2(ry), hp: P.hp, open: false, inv: m.k === 'chest' ? { wood: 0, stone: 0 } : undefined, owner: pid };
    this.structs.set(s.id, s);
    this.emit('*', { t: 'struct', s });
    this.dirty = true;
  },

  damageStruct(s, dmg) {
    s.hp -= dmg;
    if (s.hp <= 0) { this.structs.delete(s.id); this.emit('*', { t: 'sdel', id: s.id, x: s.x, y: s.y, z: s.z }); this.dirty = true; }
    else this.emit('*', { t: 'sup', id: s.id, hp: Math.round(s.hp) });
  },

  toggleDoor(pid, id) {
    const s = this.structs.get(id), p = this.players.get(pid);
    if (!s || s.k !== 'door' || !p || Math.hypot(s.x - p.x, s.z - p.z) > 3.5) return;
    s.open = !s.open; this.dirty = true;
    this.emit('*', { t: 'sup', id: s.id, open: s.open });
  },

  chestOp(pid, m) {
    const s = this.structs.get(m.id), p = this.players.get(pid);
    if (!s || s.k !== 'chest' || !p || Math.hypot(s.x - p.x, s.z - p.z) > 3.5) return;
    if (m.op === 'put') { for (const k of ['wood', 'stone']) { const n = Math.max(0, Math.min(999, m.items?.[k] | 0)); s.inv[k] += n; } }
    else if (m.op === 'take') { this.give(pid, { ...s.inv }); s.inv = { wood: 0, stone: 0 }; }
    this.dirty = true;
    this.emit('*', { t: 'sup', id: s.id, inv: s.inv });
  },

  // ------------------------------------------------------------ taşıma ve fırlatma
  grab(pid) {
    const p = this.players.get(pid);
    if (!p || p.dead) return;
    if (p.carry) { this.release(pid, 2, 2); return; }
    const fx = Math.sin(p.ry), fz = Math.cos(p.ry);
    let best = null, bd = 2.2;
    for (const q of this.players.values()) {
      if (q.id === pid || q.dead || q.carriedBy) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd && Math.abs(q.y - p.y) < 1.5) { bd = d; best = { kind: 'p', id: q.id }; }
    }
    for (const o of this.props.values()) {
      if (o.carriedBy) continue;
      const d = Math.hypot(o.x - (p.x + fx * 0.5), o.z - (p.z + fz * 0.5));
      if (d < bd && Math.abs(o.y - p.y) < 1.5) { bd = d; best = { kind: 'o', id: o.id }; }
    }
    if (!best) return;
    p.carry = best;
    if (best.kind === 'p') { const q = this.players.get(best.id); q.carriedBy = pid; this.emit(best.id, { t: 'carried', by: pid }); }
    else { const o = this.props.get(best.id); o.carriedBy = pid; o.fuse = -1; }
    this.emit('*', { t: 'grab', by: pid, kind: best.kind, id: best.id });
  },

  release(pid, speed, up) {
    const p = this.players.get(pid);
    if (!p || !p.carry) return;
    const fx = Math.sin(p.ry), fz = Math.cos(p.ry), c = p.carry;
    p.carry = null;
    if (c.kind === 'p') {
      const q = this.players.get(c.id);
      if (q) { q.carriedBy = null; this.emit(c.id, { t: 'release', kx: r2(fx * speed / 6), kz: r2(fz * speed / 6), lift: up }); }
    } else {
      const o = this.props.get(c.id);
      if (o) { o.carriedBy = null; o.vx = fx * speed; o.vz = fz * speed; o.vy = up; o.thrown = speed > 6 ? 1 : 0; o.by = pid; }
    }
    this.emit('*', { t: 'throw', by: pid, big: speed > 6 ? 1 : 0 });
  },

  escape(pid) { const q = this.players.get(pid); if (q && q.carriedBy) this.release(q.carriedBy, 3, 4); },

  // ------------------------------------------------------------ patlamalar
  breakProp(o, by) {
    if (o.k === 'barrel') { if (o.fuse < 0) o.fuse = 0.35; o.by = by || o.by; return; }
    this.props.delete(o.id);
    this.emit('*', { t: 'obreak', id: o.id, x: r2(o.x), y: r2(o.y), z: r2(o.z) });
    if (by && this.players.has(by)) this.give(by, { wood: 3 });
  },

  explode(o) {
    this.props.delete(o.id);
    const { x, y, z } = o, by = o.by;
    this.emit('*', { t: 'boom', x: r2(x), y: r2(y), z: r2(z) });
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d > BOOM_R) continue;
      const k = 1 - d / BOOM_R, ux = d > 0.01 ? (m.x - x) / d : 1, uz = d > 0.01 ? (m.z - z) / d : 0;
      this.damageMob(m, { dmg: Math.round(15 + 40 * k), knock: 6 + 8 * k, lift: 6 + 7 * k }, by, ux, uz);
    }
    for (const q of this.players.values()) {
      if (q.dead) continue;
      const d = Math.hypot(q.x - x, q.z - z);
      if (d > BOOM_R || Math.abs(q.y - y) > 3) continue;
      const k = 1 - d / BOOM_R, ux = d > 0.01 ? (q.x - x) / d : 1, uz = d > 0.01 ? (q.z - z) / d : 0;
      if (q.carriedBy) continue;
      this.emit(q.id, { t: 'dmg', amt: this.pvp ? Math.round(10 + 25 * k) : 0, kx: r2(ux * (1 + 1.4 * k)), kz: r2(uz * (1 + 1.4 * k)), lift: 6 + 7 * k, src: 'boom' });
    }
    for (const p of this.props.values()) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > BOOM_R || p.carriedBy) continue;
      const k = 1 - d / BOOM_R, ux = d > 0.01 ? (p.x - x) / d : 1, uz = d > 0.01 ? (p.z - z) / d : 0;
      p.vx += ux * 10 * k; p.vz += uz * 10 * k; p.vy += 5 + 5 * k;
      if (p.k === 'barrel' && p.fuse < 0) { p.fuse = 0.18 + Math.random() * 0.2; p.by = by; } // zincirleme
      else if (p.k === 'crate') { p.hp -= 30 * k; if (p.hp <= 0) this.breakProp(p, by); }
    }
    for (const s of [...this.structs.values()]) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < BOOM_R && Math.abs(s.y - y) < 4) this.damageStruct(s, 90 * (1 - d / BOOM_R) + 10);
    }
  },

  // ------------------------------------------------------------ her kare
  updateWorld(dt) {
    const W = this.world;
    // düğüm yeniden doğma, kayıt
    this.secT -= dt;
    if (this.secT <= 0) {
      this.secT = 1;
      for (const i of this.deadNodes) { const s = this.ns[i]; if (this.t >= s.at) { s.alive = true; s.hp = W.nodes[i].maxHp; this.deadNodes.delete(i); this.emit('*', { t: 'node', id: i, hp: s.hp, alive: 1 }); } }
      if (this.props.size < 10) this.spawnProp(Math.random() < 0.5 ? 'barrel' : 'crate');
    }
    this.saveT -= dt;
    if (this.saveT <= 0 && this.dirty) { this.saveT = 8; this.dirty = false; this.save(); }

    // taşınan oyuncu/nesne taşıyanı izler
    for (const p of this.players.values()) {
      if (!p.carry) continue;
      if (p.dead) { this.release(p.id, 0, 0); continue; }
      if (p.carry.kind === 'o') { const o = this.props.get(p.carry.id); if (!o) { p.carry = null; continue; } o.x = p.x + Math.sin(p.ry) * 0.2; o.z = p.z + Math.cos(p.ry) * 0.2; o.y = p.y + 1.95; o.vx = o.vy = o.vz = 0; o.ry = p.ry; }
      else if (!this.players.has(p.carry.id)) p.carry = null;
    }

    // tuzaklar
    for (const s of this.structs.values()) {
      if (s.k !== 'launch' && s.k !== 'spikes') continue;
      s.cd = (s.cd || 0) - dt;
      if (s.cd > 0) continue;
      const near = (x, y, z) => Math.hypot(x - s.x, z - s.z) < 0.85 && Math.abs(y - s.y) < 0.7;
      let fired = false;
      if (s.k === 'launch') {
        const fx = Math.sin(s.ry) * 0.6, fz = Math.cos(s.ry) * 0.6;
        for (const q of this.players.values()) if (!q.dead && !q.carriedBy && near(q.x, q.y, q.z)) { this.emit(q.id, { t: 'dmg', amt: 0, kx: r2(fx), kz: r2(fz), lift: 15, src: 'launch' }); fired = true; }
        for (const m of this.mobs.values()) if (!m.dead && !m.air && near(m.x, m.y, m.z)) { m.vy = 13; m.air = true; m.spin = 9; m.st = 'launched'; m.kx = fx * 6; m.kz = fz * 6; fired = true; }
        for (const o of this.props.values()) if (!o.carriedBy && near(o.x, o.y, o.z) && o.vy <= 0.1) { o.vy = 13; o.vx += fx * 4; o.vz += fz * 4; fired = true; }
        if (fired) { s.cd = 0.8; this.emit('*', { t: 'sup', id: s.id, fire: 1 }); }
      } else {
        for (const m of this.mobs.values()) if (!m.dead && near(m.x, m.y, m.z)) { this.damageMob(m, { dmg: 15, knock: 3, lift: 2 }, s.owner, -Math.sin(m.ry), -Math.cos(m.ry)); fired = true; }
        if (fired) { s.cd = 0.7; s.hp -= 4; if (s.hp <= 0) this.damageStruct(s, 1); }
      }
    }

    // varil/sandık fiziği
    const players = [...this.players.values()].filter((q) => !q.dead);
    for (const o of [...this.props.values()]) {
      if (o.fuse >= 0) { o.fuse -= dt; if (o.fuse <= 0) { this.explode(o); continue; } }
      if (o.carriedBy) continue;
      const P = PROP[o.k];
      // oyuncular ve kurtlar iter
      for (const q of players) {
        if (q.carriedBy || Math.abs(q.y - o.y) > 1.2) continue;
        // oyuncu nesneye dayandıkça iter (istemci oyuncuyu nesnenin içine sokmaz, temas payı 0.15 m)
        const dx = o.x - q.x, dz = o.z - q.z, d = Math.hypot(dx, dz), mr = P.r + 0.35 + 0.15;
        if (d < mr && d > 1e-4) { const a = 28 / P.mass; o.vx += (dx / d) * a * dt; o.vz += (dz / d) * a * dt; if (d < mr - 0.15) { o.x += (dx / d) * (mr - 0.15 - d) * 0.5; o.z += (dz / d) * (mr - 0.15 - d) * 0.5; } }
      }
      for (const m of this.mobs.values()) {
        if (m.dead) continue;
        const dx = o.x - m.x, dz = o.z - m.z, d = Math.hypot(dx, dz), mr = P.r + 0.45;
        if (d < mr && d > 1e-4) { o.x += (dx / d) * (mr - d) * 0.5; o.z += (dz / d) * (mr - d) * 0.5; if (o.thrown && Math.hypot(o.vx, o.vz) > 5) { this.damageMob(m, { dmg: 18, knock: 7, lift: 4 }, o.by, dx / -d, dz / -d); if (o.k === 'barrel') this.breakProp(o, o.by); o.thrown = 0; } }
      }
      // yerçekimi ve zemin
      const gh = Math.max(W.heightAt(o.x, o.z), this.surface(o.x, o.z, o.y + 0.5), WATER - 0.4);
      const ground = o.y <= gh + 0.02;
      if (!ground) o.vy -= 20 * dt;
      else {
        if (o.vy < -9 && o.thrown && o.k === 'barrel') { this.breakProp(o, o.by); }
        else if (o.vy < -6 && o.k === 'crate' && o.thrown) { o.hp -= 15; if (o.hp <= 0) { this.breakProp(o, o.by); continue; } }
        if (o.vy < 0) o.vy = o.vy < -4 ? -o.vy * 0.25 : 0; // sekme
        // yokuştan aşağı yuvarlanma
        const e = 0.8, sx = (W.heightAt(o.x + e, o.z) - W.heightAt(o.x - e, o.z)) / (2 * e), sz = (W.heightAt(o.x, o.z + e) - W.heightAt(o.x, o.z - e)) / (2 * e);
        const slide = o.k === 'barrel' ? 9 : 3;
        if (gh === W.heightAt(o.x, o.z) && Math.hypot(sx, sz) > (o.k === 'barrel' ? 0.12 : 0.45)) { o.vx -= sx * slide * dt; o.vz -= sz * slide * dt; }
        const fr = Math.max(0, 1 - dt * (o.k === 'barrel' ? 0.9 : 4));
        o.vx *= fr; o.vz *= fr;
        if (o.thrown && Math.hypot(o.vx, o.vz) < 2) o.thrown = 0;
      }
      let nx = o.x + o.vx * dt, nz = o.z + o.vz * dt;
      const c = W.collide(nx, nz, P.r, o.y);
      if (Math.abs(c.x - nx) + Math.abs(c.z - nz) > 0.001) {
        const sp = Math.hypot(o.vx, o.vz);
        if (o.thrown && sp > 7 && o.k === 'barrel') { this.breakProp(o, o.by); }
        o.vx *= -0.35; o.vz *= -0.35;
      }
      nx = c.x; nz = c.z;
      if (Math.hypot(nx, nz) > HALF - 4) { nx = o.x; nz = o.z; o.vx = o.vz = 0; }
      const moved = Math.hypot(nx - o.x, nz - o.z);
      if (moved > 0.002) { o.ry = Math.atan2(nx - o.x, nz - o.z); o.roll += moved / P.r; }
      o.x = nx; o.z = nz;
      o.y = Math.max(o.y + o.vy * dt, Math.max(W.heightAt(o.x, o.z), this.surface(o.x, o.z, o.y + 0.5), WATER - 0.4));
    }
    // nesneler birbirini iter
    const list = [...this.props.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.carriedBy || b.carriedBy || Math.abs(a.y - b.y) > 0.9) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), mr = PROP[a.k].r + PROP[b.k].r;
      if (d < mr && d > 1e-4) {
        const k = (mr - d) * 0.5, ux = dx / d, uz = dz / d;
        a.x -= ux * k; a.z -= uz * k; b.x += ux * k; b.z += uz * k;
        const rv = (b.vx - a.vx) * ux + (b.vz - a.vz) * uz;
        if (rv < 0) { a.vx += ux * rv * 0.9; a.vz += uz * rv * 0.9; b.vx -= ux * rv * 0.9; b.vz -= uz * rv * 0.9; }
      }
    }
  },

  // [id, tür(0 varil,1 sandık), x, y, z, ry, yuvarlanma, bitler(1 fitil, 2 taşınıyor)]
  propSnapshot() {
    const out = [];
    for (const o of this.props.values()) out.push([o.id, o.k === 'barrel' ? 0 : 1, r2(o.x), r2(o.y), r2(o.z), r2(o.ry), r2(o.roll), (o.fuse >= 0 ? 1 : 0) | (o.carriedBy ? 2 : 0)]);
    return out;
  },

  worldState() {
    const nodes = [];
    this.ns.forEach((s, i) => { if (!s.alive || s.hp < this.world.nodes[i].maxHp) nodes.push([i, s.hp, s.alive ? 1 : 0]); });
    return { nodes, structs: [...this.structs.values()] };
  },

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, seed: this.world.seed, t: Date.now(), structs: [...this.structs.values()].map(({ cd, ...s }) => s) })); } catch (e) { /* depolama yok */ }
  },
};

export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s && s.v === 1 && Array.isArray(s.structs)) return s; } catch (e) { /* yok */ }
  return null;
}
