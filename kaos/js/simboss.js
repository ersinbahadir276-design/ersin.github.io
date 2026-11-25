// Ev sahibi simülasyonu: Dev, Ejderha, rastgele olaylar ve gün-gece döngüsü.
import { HALF, WATER } from './world.js';

const r2 = (v) => Math.round(v * 100) / 100;
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
export const HOUR_SEC = 25; // bir oyun saati 25 sn -> bir gün 10 dakika
export const GIANT = { hp: 700, r: 1.3, walk: 1.3, chase: 2.5, reach: 4.6, dmg: 22, scale: 2.8 };
export const DRAGON = { hp: 450, r: 2.2, fly: 9, alt: 16, territory: 40, breath: 2.4, scale: 1.6 };
const EVENTS = ['meteor', 'chest', 'storm', 'giant', 'hunt', 'dragon', 'barrels'];
export const EVENT_TEXT = {
  meteor: ['METEOR!', 'Gökyüzünden bir şey düşüyor… kaçın!'],
  chest: ['GİZEMLİ SANDIK', 'Adada parlayan bir sandık belirdi!'],
  storm: ['FIRTINA', 'Yıldırımlar düşüyor, açıkta kalmayın!'],
  giant: ['DEV UYANDI', 'Ormandan dev adımlar geliyor…'],
  hunt: ['AV BAŞLADI', 'Aç bir kurt sürüsü sizi kokladı!'],
  dragon: ['EJDERHA ÖFKELİ', 'Ejderha yuvasından kalktı ve birini arıyor!'],
  barrels: ['VARİL YAĞMURU', 'Gökten patlayıcı variller yağıyor!?'],
};

export const BossSim = {
  initBoss() {
    this.hour = 9; this.day = 1;
    this.storm = 0; this.boltT = 0;
    this.eventT = 50; this.pending = [];
    // ejderhanın yuvası: adanın en yüksek yeri
    const W = this.world; let best = { x: 0, z: 0, h: -99 };
    // yüksek ama yürüyerek çıkılabilen, düzce bir tepe (dinlenirken yakın dövüşte vurulabilsin)
    for (let x = -HALF * 0.7; x <= HALF * 0.7; x += 3) for (let z = -HALF * 0.7; z <= HALF * 0.7; z += 3) {
      const h = W.heightAt(x, z);
      if (h <= best.h || Math.hypot(x - W.spawn.x, z - W.spawn.z) < 45 || W.slopeAt(x, z) > 1.2) continue;
      let ok = true;
      for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (Math.abs(W.heightAt(x + dx, z + dz) - h) > 3.2) { ok = false; break; }
      if (ok) best = { x, z, h };
    }
    this.nest = best;
    this.spawnDragon();
  },

  isNight() { return this.hour >= 20 || this.hour < 5; },

  spawnGiant(nearPid) {
    if ([...this.mobs.values()].some((m) => m.type === 'giant' && !m.dead)) return null;
    const W = this.world, ps = [...this.players.values()].filter((p) => !p.dead);
    const ref = (nearPid && this.players.get(nearPid)) || ps[Math.floor(Math.random() * ps.length)] || W.spawn;
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * 6.28, d = 30 + Math.random() * 12, x = ref.x + Math.cos(a) * d, z = ref.z + Math.sin(a) * d;
      if (Math.hypot(x, z) > HALF - 15 || W.heightAt(x, z) < 1 || W.slopeAt(x, z) > 2) continue;
      const m = { id: this.mid++, type: 'giant', x, z, y: W.heightAt(x, z), ry: Math.atan2(ref.x - x, ref.z - z), vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, air: false, spd: 0, hp: GIANT.hp, maxHp: GIANT.hp, st: 'wander', stT: 0, cd: 2, atk: 0, hit: 0, howl: 0, dead: false, deadT: 0, target: ref.id || null, wx: x, wz: z, smashT: -1 };
      this.mobs.set(m.id, m);
      return m;
    }
    return null;
  },

  spawnDragon() {
    const n = this.nest;
    const m = { id: this.mid++, type: 'dragon', x: n.x + 14, z: n.z, y: n.h + DRAGON.alt, ry: 0, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0, air: true, spd: 0, hp: DRAGON.hp, maxHp: DRAGON.hp, st: 'circle', stT: 40 + Math.random() * 30, cd: 3, atk: 0, hit: 0, howl: 0, dead: false, deadT: 0, target: null, ang: 0, breath: 0, huntT: 0 };
    this.mobs.set(m.id, m);
    return m;
  },

  // Dev: yavaş yürür, ağaçları devirir, duvarları kırar, sopasını yere vurup herkesi fırlatır
  updateGiant(m, dt, W) {
    if (m.dead) { m.deadT += dt; if (m.deadT > 20) this.mobs.delete(m.id); return; }
    m.cd -= dt; m.stT -= dt;
    const alive = [...this.players.values()].filter((p) => !p.dead && !p.carriedBy);
    let tgt = m.target ? this.players.get(m.target) : null;
    if (!tgt || tgt.dead || Math.hypot(tgt.x - m.x, tgt.z - m.z) > 60) { tgt = null; m.target = null; let bd = 34; for (const p of alive) { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < bd) { bd = d; tgt = p; } } if (tgt) { m.target = tgt.id; m.howl++; this.emit('*', { t: 'roar', id: m.id }); } }
    let mx = 0, mz = 0, speed = 0;
    if (m.smashT >= 0) {
      m.smashT += dt;
      if (m.smashT >= 0.55 && !m.smashDone) { m.smashDone = true; this.giantSmash(m); }
      if (m.smashT > 1.2) m.smashT = -1;
    } else if (tgt) {
      const dx = tgt.x - m.x, dz = tgt.z - m.z, d = Math.hypot(dx, dz) || 1;
      m.ry = lerpAngle(m.ry, Math.atan2(dx, dz), Math.min(1, dt * 3));
      if (d < GIANT.reach - 0.6 && m.cd <= 0) { m.smashT = 0; m.smashDone = false; m.cd = 2.6; m.atk++; }
      else if (d > 2.5) { mx = dx / d; mz = dz / d; speed = GIANT.chase; }
    } else {
      if (m.stT <= 0) { const a = Math.random() * 6.28; m.wx = m.x + Math.cos(a) * 20; m.wz = m.z + Math.sin(a) * 20; m.stT = 10; }
      const dx = m.wx - m.x, dz = m.wz - m.z, d = Math.hypot(dx, dz);
      if (d > 2) { mx = dx / d; mz = dz / d; speed = GIANT.walk; }
    }
    m.vx += (mx * speed - m.vx) * Math.min(1, dt * 3); m.vz += (mz * speed - m.vz) * Math.min(1, dt * 3);
    let nx = m.x + (m.vx + m.kx) * dt, nz = m.z + (m.vz + m.kz) * dt;
    m.kx *= 0.9; m.kz *= 0.9;
    if (W.heightAt(nx, nz) < -0.8 || Math.hypot(nx, nz) > HALF - 10) { nx = m.x; nz = m.z; m.stT = 0; }
    const c = W.collide(nx, nz, GIANT.r);
    if (c.node && c.node.kind !== 'rock' && this.ns[c.node.id].alive) this.hitNode(null, c.node, 99, m.x, m.z); // ağacı devir
    else if (c.sid) { const s = this.structs.get(c.sid); if (s) this.damageStruct(s, 140 * dt); }
    else { nx = c.x; nz = c.z; }
    if (c.node && c.node.kind === 'rock') { nx = c.x; nz = c.z; }
    m.spd = Math.hypot(nx - m.x, nz - m.z) / Math.max(dt, 1e-4);
    if (!tgt && m.spd > 0.2) m.ry = lerpAngle(m.ry, Math.atan2(nx - m.x, nz - m.z), Math.min(1, dt * 3));
    m.x = nx; m.z = nz; m.y = Math.max(W.heightAt(nx, nz), WATER - 0.8);
  },

  giantSmash(m) {
    const fx = Math.sin(m.ry), fz = Math.cos(m.ry);
    const cx = m.x + fx * 2.6, cz = m.z + fz * 2.6, R = GIANT.reach;
    this.emit('*', { t: 'smash', id: m.id, x: r2(cx), y: r2(this.world.heightAt(cx, cz)), z: r2(cz) });
    for (const q of this.players.values()) {
      if (q.dead) continue;
      const d = Math.hypot(q.x - cx, q.z - cz);
      if (d > R || q.y - m.y > 3) continue;
      const ux = (q.x - m.x) / (Math.hypot(q.x - m.x, q.z - m.z) || 1), uz = (q.z - m.z) / (Math.hypot(q.x - m.x, q.z - m.z) || 1);
      this.emit(q.id, { t: 'dmg', amt: GIANT.dmg, kx: r2(ux * 1.4), kz: r2(uz * 1.4), lift: 11, src: 'giant' });
    }
    for (const o of this.mobs.values()) {
      if (o === m || o.dead || o.type !== 'wolf') continue;
      const d = Math.hypot(o.x - cx, o.z - cz);
      if (d < R) this.damageMob(o, { dmg: 40, knock: 9, lift: 10 }, null, (o.x - m.x) / (d || 1), (o.z - m.z) / (d || 1));
    }
    for (const o of this.props.values()) { const d = Math.hypot(o.x - cx, o.z - cz); if (d < R && !o.carriedBy) { o.vy += 9; o.vx += (o.x - cx) * 2; o.vz += (o.z - cz) * 2; } }
    for (const s of [...this.structs.values()]) if (Math.hypot(s.x - cx, s.z - cz) < R) this.damageStruct(s, 220);
  },

  // Ejderha: yuvasının üstünde döner, bölgesine gireni dalıp ateşle yakar, ara sıra yuvaya iner
  updateDragon(m, dt, W) {
    const n = this.nest;
    if (m.dead) {
      m.deadT += dt;
      if (m.y > W.heightAt(m.x, m.z) + 0.1) { m.vy -= 18 * dt; m.y = Math.max(W.heightAt(m.x, m.z), m.y + m.vy * dt); }
      if (m.deadT > 90) { this.mobs.delete(m.id); this.spawnDragon(); }
      return;
    }
    m.cd -= dt; m.stT -= dt; m.huntT -= dt;
    const alive = [...this.players.values()].filter((p) => !p.dead && !p.carriedBy);
    let tgt = m.target ? this.players.get(m.target) : null;
    if (tgt && (tgt.dead || (m.huntT <= 0 && Math.hypot(tgt.x - n.x, tgt.z - n.z) > DRAGON.territory + 15))) { tgt = null; m.target = null; }
    if (!tgt && m.st !== 'rest') for (const p of alive) if (Math.hypot(p.x - n.x, p.z - n.z) < DRAGON.territory) { tgt = p; m.target = p.id; m.howl++; this.emit('*', { t: 'roar', id: m.id, dragon: 1 }); break; }
    let gx, gy, gz;
    m.breath = Math.max(0, m.breath - dt);
    if (m.st === 'rest') {
      gx = n.x; gz = n.z; gy = n.h;
      if (tgt && Math.hypot(tgt.x - m.x, tgt.z - m.z) < 7 && m.cd <= 0) { m.breath = DRAGON.breath; m.cd = 4; m.atk++; }
      if (m.stT <= 0 || m.hp < m.maxHp * 0.5 && m.hitRecent > 0) { m.st = 'circle'; m.stT = 45 + Math.random() * 30; }
    } else if (tgt) {
      const dx = tgt.x - m.x, dz = tgt.z - m.z, d = Math.hypot(dx, dz) || 1;
      const th = W.heightAt(tgt.x, tgt.z);
      if (d > 13 || m.breath <= 0) { gx = tgt.x - (dx / d) * 9; gz = tgt.z - (dz / d) * 9; gy = Math.max(th, tgt.y) + 7; }
      else { gx = m.x; gz = m.z; gy = Math.max(th, tgt.y) + 6.5; }
      if (d < 14 && m.cd <= 0 && m.breath <= 0) { m.breath = DRAGON.breath; m.cd = 5.5; m.atk++; }
      m.ry = lerpAngle(m.ry, Math.atan2(dx, dz), Math.min(1, dt * 4));
    } else {
      m.ang += dt * 0.35;
      gx = n.x + Math.cos(m.ang) * 15; gz = n.z + Math.sin(m.ang) * 15; gy = n.h + DRAGON.alt;
      if (m.stT <= 0) { m.st = 'rest'; m.stT = 14; }
    }
    // uçuş
    const dx = gx - m.x, dy = gy - m.y, dz = gz - m.z, d = Math.hypot(dx, dy, dz);
    const sp = m.st === 'rest' && d < 3 ? 2 : DRAGON.fly;
    if (d > 0.3) { m.vx += ((dx / d) * sp - m.vx) * Math.min(1, dt * 1.5); m.vy += ((dy / d) * sp - m.vy) * Math.min(1, dt * 1.5); m.vz += ((dz / d) * sp - m.vz) * Math.min(1, dt * 1.5); }
    else { m.vx *= 0.9; m.vy *= 0.9; m.vz *= 0.9; }
    m.x += (m.vx + m.kx) * dt; m.z += (m.vz + m.kz) * dt; m.y += m.vy * dt; m.kx *= 0.9; m.kz *= 0.9;
    m.y = Math.max(m.y, W.heightAt(m.x, m.z) + (m.st === 'rest' ? 0 : 2.5));
    m.spd = Math.hypot(m.vx, m.vz);
    if (!tgt && m.spd > 1) m.ry = lerpAngle(m.ry, Math.atan2(m.vx, m.vz), Math.min(1, dt * 3));
    m.hitRecent = Math.max(0, (m.hitRecent || 0) - dt);
    // ateş nefesi
    if (m.breath > 0) {
      m.burnT = (m.burnT || 0) - dt;
      if (m.burnT <= 0) {
        m.burnT = 0.25;
        const fx = Math.sin(m.ry), fz = Math.cos(m.ry);
        const hx = m.x + fx * 3.2 * DRAGON.scale / 1.6, hz = m.z + fz * 3.2 * DRAGON.scale / 1.6, hy = m.y + 2.4;
        for (const q of this.players.values()) {
          if (q.dead) continue;
          const vx = q.x - hx, vy = q.y + 1 - hy, vz = q.z - hz, vd = Math.hypot(vx, vy, vz);
          if (vd > 12) continue;
          const hor = (vx * fx + vz * fz) / (Math.hypot(vx, vz) || 1);
          if (hor > 0.75) this.emit(q.id, { t: 'burn', amt: 4 });
        }
        for (const s of [...this.structs.values()]) { const vx = s.x - hx, vz = s.z - hz, vd = Math.hypot(vx, vz); if (vd < 11 && (vx * fx + vz * fz) / (vd || 1) > 0.75) this.damageStruct(s, 12); }
        for (const o of this.mobs.values()) { if (o.type !== 'wolf' || o.dead) continue; const vx = o.x - hx, vz = o.z - hz, vd = Math.hypot(vx, vz); if (vd < 11 && (vx * fx + vz * fz) / (vd || 1) > 0.75) this.damageMob(o, { dmg: 6, knock: 1, lift: 0 }, null, fx, fz); }
        for (const o of this.props.values()) { const vx = o.x - hx, vz = o.z - hz, vd = Math.hypot(vx, vz); if (o.k === 'barrel' && vd < 11 && (vx * fx + vz * fz) / (vd || 1) > 0.75 && o.fuse < 0) o.fuse = 0.6; }
      }
    }
  },

  // Patlama (meteor, yıldırım): breakProp/explode ile aynı etkiler, varil olmadan
  blast(x, z, R, power) {
    const y = this.world.heightAt(x, z);
    this.explode({ id: -1, x, y, z, by: null, R, power });
  },

  // ------------------------------------------------------------ rastgele olaylar
  startEvent(k) {
    const ps = [...this.players.values()].filter((p) => !p.dead);
    if (!ps.length) return;
    const ref = ps[Math.floor(Math.random() * ps.length)];
    const near = (min, max) => { for (let t = 0; t < 30; t++) { const a = Math.random() * 6.28, d = min + Math.random() * (max - min); const x = ref.x + Math.cos(a) * d, z = ref.z + Math.sin(a) * d; if (Math.hypot(x, z) < HALF - 12 && this.world.heightAt(x, z) > 0.8) return { x, z }; } return { x: ref.x + 10, z: ref.z }; };
    let extra = {};
    if (k === 'meteor') {
      const pt = near(10, 25); extra = pt;
      this.pending.push({ at: this.t + 2.6, fn: () => { this.blast(pt.x, pt.z, 6.5, 1.3); for (let i = 0; i < 3; i++) { const o = this.spawnProp('crate', pt.x + (Math.random() - 0.5) * 3, pt.z + (Math.random() - 0.5) * 3); o.loot = { stone: 10 }; o.gold = 2; } } });
    } else if (k === 'chest') {
      const pt = near(25, 45); const o = this.spawnProp('crate', pt.x, pt.z); o.gold = 1; o.hp = 40; o.loot = { wood: 25, stone: 15 }; extra = pt;
    } else if (k === 'storm') { this.storm = 45; this.boltT = 3; }
    else if (k === 'giant') { const g = this.spawnGiant(ref.id); if (!g) return; extra = { x: g.x, z: g.z }; }
    else if (k === 'hunt') { const pk = this.spawnPack(); if (!pk) return; pk.target = ref.id; for (const m of pk.members) { const pt = near(25, 30); m.x = pt.x; m.z = pt.z; m.st = 'chase'; } extra = { x: pk.members[0].x, z: pk.members[0].z }; }
    else if (k === 'dragon') { const d = [...this.mobs.values()].find((m) => m.type === 'dragon' && !m.dead); if (!d) return; d.target = ref.id; d.huntT = 30; d.st = 'circle'; }
    else if (k === 'barrels') { for (let i = 0; i < 8; i++) { const pt = near(4, 16); const o = this.spawnProp('barrel', pt.x, pt.z, this.world.heightAt(pt.x, pt.z) + 22 + i * 2); o.thrown = 1; o.vy = -2; } }
    this.emit('*', { t: 'event', k, ...extra, ...(k === 'storm' ? { dur: 45 } : {}) });
  },

  updateBoss(dt) {
    // gün-gece
    const prev = this.hour;
    this.hour += dt / HOUR_SEC; if (this.hour >= 24) this.hour -= 24;
    if (prev < 6 && this.hour >= 6) { this.day++; this.emit('*', { t: 'daybreak', day: this.day }); }
    if (prev < 20 && this.hour >= 20) this.emit('*', { t: 'nightfall' });
    // bekleyen işler (meteor çarpması vb.)
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.t >= this.pending[i].at) { const f = this.pending[i].fn; this.pending.splice(i, 1); f(); }
    // fırtına: rastgele yıldırımlar
    if (this.storm > 0) {
      this.storm -= dt; this.boltT -= dt;
      const ps = [...this.players.values()].filter((p) => !p.dead);
      if (this.boltT <= 0 && ps.length) {
        this.boltT = 3 + Math.random() * 4;
        const p = ps[Math.floor(Math.random() * ps.length)], a = Math.random() * 6.28, d = 4 + Math.random() * 18;
        const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        this.emit('*', { t: 'bolt', x: r2(x), z: r2(z), y: r2(this.world.heightAt(x, z)) });
        this.blast(x, z, 3.2, 0.7);
      }
      for (const o of this.props.values()) if (!o.carriedBy) { o.vx += 0.8 * dt; o.vz += 0.4 * dt; }
    }
    // olay yönetmeni
    this.eventT -= dt;
    if (this.eventT <= 0) { this.eventT = 70 + Math.random() * 60; this.startEvent(EVENTS[Math.floor(Math.random() * EVENTS.length)]); }
  },
};
