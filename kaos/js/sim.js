// Ev sahibi simülasyonu: yaratık yapay zekâsı ve savaş. Tek oyunculuda yerelde, çok oyunculuda
// odayı kuranın cihazında çalışır; istemciler yalnızca anlık görüntü (snapshot) alır.
import { HALF } from './world.js';

export const MOB_TYPES = ['wolf'];
const WOLF = { hp: 45, r: 0.45, walk: 1.6, chase: 6.2, lunge: 8.8, retreat: 4.2, bite: 6, ring: 2.9, detect: 17 };
export const ATTACKS = {
  jab: { dmg: 12, reach: 1.9, arc: 0.5, knock: 4, lift: 1.5 },
  heavy: { dmg: 28, reach: 2.7, arc: 0.2, knock: 8, lift: 8.5 }, // arc = cos(açı) eşiği
};

const r2 = (v) => Math.round(v * 100) / 100;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Sim {
  constructor(world, opts = {}) {
    this.world = world;
    this.t = 0;
    this.players = new Map();
    this.mobs = new Map(); this.mid = 1;
    this.packs = []; this.pid = 1;
    this.events = []; // {to: oyuncu id | '*', m: mesaj}
    this.pvp = !!opts.pvp;
    this.respawnT = 0;
    for (let i = 0; i < 3; i++) this.spawnPack();
  }

  addPlayer(id, name) { this.players.set(id, { id, name, x: this.world.spawn.x, y: 0, z: this.world.spawn.z, ry: 0, hp: 100, dead: false, crouch: false, swim: false }); }
  removePlayer(id) { this.players.delete(id); for (const p of this.packs) if (p.target === id) p.target = null; }
  setPlayer(id, s) { const p = this.players.get(id); if (p) Object.assign(p, s); }

  emit(to, m) { this.events.push({ to, m }); }

  // --------------------------------------------------------- sürü oluşturma
  spawnPack() {
    const W = this.world, sp = W.spawn;
    for (let tries = 0; tries < 40; tries++) {
      const x = (Math.random() * 2 - 1) * HALF * 0.75, z = (Math.random() * 2 - 1) * HALF * 0.75;
      const h = W.heightAt(x, z);
      if (h < 1 || h > 9 || W.slopeAt(x, z) > 1.6) continue;
      if (Math.hypot(x - sp.x, z - sp.z) < 45) continue;
      if ([...this.players.values()].some((p) => Math.hypot(p.x - x, p.z - z) < 40)) continue;
      const pack = { id: this.pid++, den: { x, z }, members: [], target: null, alertT: 0, ringA: Math.random() * 6.28, tint: Math.floor(Math.random() * 4) };
      const n = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const m = {
          id: this.mid++, type: 'wolf', pack, slot: i, x: x + (Math.random() - 0.5) * 4, z: z + (Math.random() - 0.5) * 4, y: h, ry: Math.random() * 6.28,
          vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, air: false, spd: 0, hp: WOLF.hp, maxHp: WOLF.hp,
          st: 'idle', stT: Math.random() * 3, cd: 0, wx: x, wz: z, atk: 0, hit: 0, howl: 0, dead: false, deadT: 0, spin: 0,
        };
        m.y = W.heightAt(m.x, m.z);
        pack.members.push(m);
        this.mobs.set(m.id, m);
      }
      this.packs.push(pack);
      return pack;
    }
    return null;
  }

  // --------------------------------------------------------- savaş
  // Oyuncu saldırısı: konum/yön ev sahibinde doğrulanır, menzildeki her hedef vurulur
  attack(pid, kind, x, z, ry) {
    const A = ATTACKS[kind];
    const p = this.players.get(pid);
    if (!A || !p || p.dead) return 0;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    let hits = 0;
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const dx = m.x - x, dz = m.z - z, d = Math.hypot(dx, dz);
      if (d > A.reach + WOLF.r || Math.abs(m.y - p.y) > 2.5) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < A.arc) continue;
      this.damageMob(m, A, pid, d > 0.01 ? dx / d : fx, d > 0.01 ? dz / d : fz);
      hits++;
    }
    if (this.pvp) {
      for (const q of this.players.values()) {
        if (q.id === pid || q.dead) continue;
        const dx = q.x - x, dz = q.z - z, d = Math.hypot(dx, dz);
        if (d > A.reach + 0.4 || Math.abs(q.y - p.y) > 2) continue;
        if (d > 0.6 && (dx * fx + dz * fz) / d < A.arc) continue;
        this.emit(q.id, { t: 'dmg', amt: Math.round(A.dmg * 0.6), kx: r2(dx / (d || 1)), kz: r2(dz / (d || 1)), lift: A.lift, src: p.name || 'oyuncu' });
        hits++;
      }
    }
    return hits;
  }

  damageMob(m, A, pid, ux, uz) {
    m.hp -= A.dmg; m.hit++;
    m.kx = ux * A.knock; m.kz = uz * A.knock;
    if (A.lift > 3) { m.vy = A.lift; m.air = true; m.spin = (Math.random() < 0.5 ? -1 : 1) * 9; m.st = 'launched'; }
    this.emit('*', { t: 'mhit', id: m.id, dmg: A.dmg, by: pid, x: r2(m.x), y: r2(m.y), z: r2(m.z) });
    const pack = m.pack;
    if (!pack.target && this.players.has(pid)) { pack.target = pid; pack.alertT = 0; for (const o of pack.members) if (!o.dead && o.st !== 'launched') { o.st = 'chase'; } }
    if (m.hp <= 0) this.killMob(m, pid);
    else if (m.hp < m.maxHp * 0.25 && m.st !== 'launched') { m.st = 'flee'; m.stT = 5; }
  }

  killMob(m, by) {
    m.dead = true; m.hp = 0; m.deadT = 0; m.st = 'dead';
    this.emit('*', { t: 'mdie', id: m.id, by, type: m.type });
  }

  // --------------------------------------------------------- yapay zekâ
  update(dt) {
    this.t += dt;
    const W = this.world;
    const alive = [...this.players.values()].filter((p) => !p.dead);

    for (const pack of this.packs) {
      const live = pack.members.filter((m) => !m.dead);
      if (!live.length) continue;
      pack.ringA += dt * 0.35;
      let tgt = pack.target ? this.players.get(pack.target) : null;
      if (tgt && (tgt.dead || Math.hypot(tgt.x - pack.den.x, tgt.z - pack.den.z) > 75 || live.every((m) => Math.hypot(m.x - tgt.x, m.z - tgt.z) > 38))) {
        pack.target = null; tgt = null;
        for (const m of live) if (m.st !== 'launched' && m.st !== 'flee') { m.st = 'home'; m.stT = 0; }
      }
      if (!tgt) {
        // en yakın oyuncuyu fark et (çömelen oyuncu yarı mesafeden fark edilir)
        let best = null, bd = 1e9;
        for (const p of alive) {
          if (p.swim) continue;
          const r = WOLF.detect * (p.crouch ? 0.5 : 1);
          for (const m of live) { const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < r && d < bd) { bd = d; best = p; } }
        }
        if (best) {
          pack.target = best.id; tgt = best; pack.alertT = 0.9;
          const leader = live[0]; leader.howl++;
          this.emit('*', { t: 'howl', id: leader.id, x: r2(leader.x), z: r2(leader.z) });
          for (const m of live) if (m.st !== 'launched') { m.st = 'alert'; m.stT = 0.9; }
        }
      }
      pack.attackers = live.filter((m) => m.st === 'lunge').length;
      pack.liveN = live.length;
    }

    for (const m of this.mobs.values()) this.updateWolf(m, dt, W);

    // birbirlerinin içine girmesinler
    const list = [...this.mobs.values()].filter((m) => !m.dead);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dx = b.x - a.x, dz = b.z - a.z, mr = WOLF.r * 2, d2 = dx * dx + dz * dz;
      if (d2 < mr * mr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (mr - d) * 0.5; a.x -= (dx / d) * k; a.z -= (dz / d) * k; b.x += (dx / d) * k; b.z += (dz / d) * k; }
    }

    // ölen sürüler bir süre sonra yeniden gelir
    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = 20;
      for (const m of [...this.mobs.values()]) if (m.dead && m.deadT > 12) this.mobs.delete(m.id);
      this.packs = this.packs.filter((p) => p.members.some((m) => this.mobs.has(m.id)));
      if (this.packs.length < 3) this.spawnPack();
    }
  }

  updateWolf(m, dt, W) {
    if (m.dead) { m.deadT += dt; m.spd = 0; this.physics(m, dt, W, 0, 0, 0); return; }
    m.cd -= dt; m.stT -= dt;
    const pack = m.pack;
    const tgt = pack.target ? this.players.get(pack.target) : null;
    let mx = 0, mz = 0, speed = 0, face = null;

    switch (m.st) {
      case 'launched':
        if (!m.air) { m.st = tgt ? 'chase' : 'idle'; m.stT = 0.7; m.spin = 0; }
        break;
      case 'alert':
        if (tgt) face = Math.atan2(tgt.x - m.x, tgt.z - m.z);
        if (m.stT <= 0) m.st = tgt ? 'chase' : 'idle';
        break;
      case 'flee':
        if (tgt) { const dx = m.x - tgt.x, dz = m.z - tgt.z, d = Math.hypot(dx, dz) || 1; mx = dx / d; mz = dz / d; speed = WOLF.chase * 0.9; }
        if (m.stT <= 0) { m.st = 'home'; }
        break;
      case 'home': {
        const dx = pack.den.x - m.x, dz = pack.den.z - m.z, d = Math.hypot(dx, dz);
        if (d < 4) { m.st = 'idle'; m.stT = 2; m.hp = Math.min(m.maxHp, m.hp + 10); }
        else { mx = dx / d; mz = dz / d; speed = WOLF.walk * 1.8; }
        if (tgt) m.st = 'chase';
        break;
      }
      case 'chase': case 'circle': case 'retreat': case 'lunge': {
        if (!tgt) { m.st = 'home'; break; }
        const dx = tgt.x - m.x, dz = tgt.z - m.z, d = Math.hypot(dx, dz) || 0.01;
        if (m.st === 'lunge') {
          mx = dx / d; mz = dz / d; speed = WOLF.lunge; face = Math.atan2(dx, dz);
          if (d < 1.25) {
            m.atk++; m.cd = 2.2 + Math.random() * 1.6; m.st = 'retreat'; m.stT = 0.7;
            this.emit(tgt.id, { t: 'dmg', amt: WOLF.bite, kx: r2(dx / d), kz: r2(dz / d), lift: 0, src: 'wolf' });
            this.emit('*', { t: 'bite', id: m.id });
          } else if (m.stT <= 0) { m.st = 'circle'; m.cd = 1; }
          break;
        }
        if (m.st === 'retreat') {
          mx = -dx / d; mz = -dz / d; speed = WOLF.retreat; face = Math.atan2(dx, dz);
          if (m.stT <= 0) m.st = 'circle';
          break;
        }
        // halka üzerinde kendi yerine koş, sırası gelince saldır
        const a = pack.ringA + (m.slot / Math.max(1, pack.liveN)) * Math.PI * 2;
        const gx = tgt.x + Math.cos(a) * WOLF.ring, gz = tgt.z + Math.sin(a) * WOLF.ring;
        const ex = gx - m.x, ez = gz - m.z, ed = Math.hypot(ex, ez);
        if (d > WOLF.ring + 4) { mx = dx / d; mz = dz / d; speed = WOLF.chase; m.st = 'chase'; }
        else {
          m.st = 'circle';
          if (ed > 0.4) { mx = ex / ed; mz = ez / ed; speed = Math.min(WOLF.chase, 1.5 + ed * 2); }
          face = Math.atan2(dx, dz);
          if (m.cd <= 0 && pack.attackers < 2 && !tgt.swim) { m.st = 'lunge'; m.stT = 1.2; pack.attackers++; }
        }
        break;
      }
      default: { // idle / wander
        if (tgt) { m.st = 'chase'; break; }
        if (m.stT <= 0) {
          if (Math.random() < 0.5) { m.st = 'idle'; m.stT = 2 + Math.random() * 4; }
          else { const a = Math.random() * 6.28, r = 3 + Math.random() * 10; m.wx = pack.den.x + Math.cos(a) * r; m.wz = pack.den.z + Math.sin(a) * r; m.st = 'wander'; m.stT = 8; }
        }
        if (m.st === 'wander') {
          const dx = m.wx - m.x, dz = m.wz - m.z, d = Math.hypot(dx, dz);
          if (d < 0.8) { m.st = 'idle'; m.stT = 2 + Math.random() * 3; } else { mx = dx / d; mz = dz / d; speed = WOLF.walk; }
        }
      }
    }
    this.physics(m, dt, W, mx, mz, speed);
    if (face !== null) m.ry = lerpAngle(m.ry, face, Math.min(1, dt * 10));
    else if (m.spd > 0.3) m.ry = lerpAngle(m.ry, Math.atan2(m.vx, m.vz), Math.min(1, dt * 8));
  }

  physics(m, dt, W, mx, mz, speed) {
    const acc = m.air ? 0.5 : 9;
    m.vx += (mx * speed - m.vx) * Math.min(1, acc * dt);
    m.vz += (mz * speed - m.vz) * Math.min(1, acc * dt);
    let nx = m.x + (m.vx + m.kx) * dt, nz = m.z + (m.vz + m.kz) * dt;
    const kd = Math.max(0, 1 - dt * (m.air ? 0.8 : 6)); m.kx *= kd; m.kz *= kd;
    if (W.heightAt(nx, nz) < -0.4 || Math.hypot(nx, nz) > HALF - 8) { nx = m.x; nz = m.z; m.vx *= -0.3; m.vz *= -0.3; if (m.st === 'wander') m.stT = 0; }
    const c = W.collide(nx, nz, WOLF.r);
    nx = c.x; nz = c.z;
    m.spd = Math.hypot(nx - m.x, nz - m.z) / Math.max(dt, 1e-4);
    m.x = nx; m.z = nz;
    const gh = Math.max(W.heightAt(m.x, m.z), -0.4);
    if (m.air) {
      m.vy -= 20 * dt; m.y += m.vy * dt;
      if (m.y <= gh) { m.y = gh; m.vy = 0; m.air = false; if (!m.dead) { this.emit('*', { t: 'thud', id: m.id }); } }
    } else m.y = gh;
  }

  // --------------------------------------------------------- ağ için anlık görüntü
  // [id, tip, x, y, z, ry, hız, durumBitleri, can%, saldırıSayacı, hasarSayacı, ulumaSayacı, renk]
  snapshot(cx, cz, radius = 140) {
    const out = [];
    for (const m of this.mobs.values()) {
      if (cx !== undefined && Math.hypot(m.x - cx, m.z - cz) > radius) continue;
      const fl = (m.dead ? 1 : 0) | (m.air ? 2 : 0) | (m.st === 'alert' ? 4 : 0) | (m.st === 'lunge' ? 8 : 0);
      out.push([m.id, 0, r2(m.x), r2(m.y), r2(m.z), r2(m.ry), r2(m.spd), fl, Math.round((100 * m.hp) / m.maxHp), m.atk, m.hit, m.howl, m.pack.tint]);
    }
    return out;
  }
}
