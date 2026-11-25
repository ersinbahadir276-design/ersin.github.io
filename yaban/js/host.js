// Ev sahibi (otorite): zaman, hayvan/yaratık yapay zekâsı, kaynaklar, yapılar, yerdeki eşyalar.
import { ITEMS, toolOf, STRUCTS, MOB_TYPES } from './items.js';

export const HOUR_SEC = 15; // 1 oyun saati = 15 sn → bir gün 6 dakika

const MOBDEF = {
  deer: { hp: 40, walk: 1.7, run: 7.4, r: 0.6, loot: { meat: 2, hide: 1 } },
  boar: { hp: 70, walk: 1.3, run: 5.6, r: 0.65, dmg: 12, rate: 1.3, reach: 1.5, loot: { meat: 3, hide: 2 } },
  wolf: { hp: 55, walk: 1.6, run: 6.4, r: 0.55, dmg: 9, rate: 1.0, reach: 1.5, loot: { meat: 1, hide: 2 } },
  ghoul: { hp: 55, walk: 2.0, run: 4.4, r: 0.45, dmg: 10, rate: 1.15, reach: 1.45, loot: { essence: 1 } },
  brute: { hp: 380, walk: 2.0, run: 3.7, r: 0.85, dmg: 24, rate: 1.7, reach: 2.3, loot: { essence: 5, hide: 3 } },
};
const SHADOW = { ghoul: 1, brute: 1 };
const FIRE_R = 7.5;

const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const clean = (s, n = 16) => String(s ?? '').replace(/[<>&"]/g, '').trim().slice(0, n);
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function cleanItems(items) {
  const out = {};
  if (!items || typeof items !== 'object') return out;
  for (const [k, v] of Object.entries(items)) {
    const n = Math.floor(num(v));
    if (ITEMS[k] && n > 0 && n < 1000) out[k] = n;
  }
  return out;
}

export class Host {
  constructor(G) {
    this.G = G;
    this.net = G.net;
    this.world = G.world;
    this.hour = 7.5; this.day = 1; this.t = 0;
    this.players = new Map();
    this.mobs = new Map(); this.mid = 1;
    this.structs = new Map(); this.sid = 1;
    this.drops = new Map(); this.did = 1;
    this.ns = this.world.nodes.map((n) => ({ hp: n.maxHp, alive: true, at: 0 }));
    this.deadNodes = new Set();
    this.snapT = 0; this.secT = 0; this.spawnT = 3; this.ghoulT = 0;
    for (let i = 0; i < 30; i++) this.spawnAnimal(['deer', 'deer', 'deer', 'boar', 'wolf'][i % 5]);
  }

  isNight() { return this.hour >= 20 || this.hour < 5; }

  pub(p) { return { id: p.id, name: p.name, color: p.color, x: r2(p.x), y: r2(p.y), z: r2(p.z) }; }

  addPlayer(id, name, color) {
    const p = {
      id, name: clean(name) || 'Oyuncu', color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#3a7bd5',
      x: this.world.spawn.x, y: 0, z: this.world.spawn.z, ry: 0, sp: 0, fl: 0, it: '', ac: 0, hp: 100, dead: false, last: performance.now(),
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.net.broadcast({ t: 'leave', id, name: p.name });
  }

  // ------------------------------------------------------------ mesajlar
  onMsg(pid, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (this.players.has(pid) || pid === 'h') return;
      if (this.players.size >= 8) { this.net.sendTo(pid, { t: 'full' }); return; }
      const p = this.addPlayer(pid, m.name, m.color);
      this.net.sendTo(pid, {
        t: 'welcome', id: pid, seed: this.world.seed, hour: this.hour, day: this.day,
        nodes: [...this.deadNodesAndDamaged()],
        structs: [...this.structs.values()],
        drops: [...this.drops.values()].map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z, items: d.items })),
        players: [...this.players.values()].map((q) => this.pub(q)),
      });
      this.net.broadcast({ t: 'join', p: this.pub(p) }, pid);
      return;
    }
    const p = this.players.get(pid);
    if (!p) return;
    p.last = performance.now();
    switch (m.t) {
      case 'st': {
        p.x = num(m.x, p.x); p.y = num(m.y, p.y); p.z = num(m.z, p.z); p.ry = num(m.ry); p.sp = num(m.sp);
        p.fl = num(m.fl) | 0; p.it = typeof m.it === 'string' && (m.it === '' || ITEMS[m.it]) ? m.it : '';
        p.ac = num(m.ac) | 0; p.hp = num(m.hp, 100); p.dead = !!(p.fl & 4);
        break;
      }
      case 'hitNode': this.hitNode(p, m); break;
      case 'hitMob': this.hitMob(p, m); break;
      case 'place': this.place(p, m); break;
      case 'fuel': {
        const s = this.structs.get(m.id);
        if (s && s.k === 'campfire') { s.fuel = Math.min(600, s.fuel + 120); this.net.broadcast({ t: 'sup', id: s.id, fuel: s.fuel, hp: s.hp }); }
        break;
      }
      case 'pick': {
        const d = this.drops.get(m.id);
        if (!d) return;
        if ((d.x - p.x) ** 2 + (d.z - p.z) ** 2 > 16) return;
        this.drops.delete(d.id);
        this.net.sendTo(pid, { t: 'give', items: d.items, pick: 1 });
        this.net.broadcast({ t: 'dropDel', id: d.id, by: pid });
        break;
      }
      case 'died': {
        const items = cleanItems(m.items);
        if (Object.keys(items).length) this.addDrop(num(m.x, p.x), num(m.y, p.y), num(m.z, p.z), items, 900, pid);
        const causes = { ghoul: 'bir Gölge tarafından parçalandı', wolf: 'kurtlara yem oldu', boar: 'yaban domuzuna ezildi', starve: 'açlıktan ve susuzluktan öldü', drown: 'boğuldu', fall: 'yüksekten düştü', meat: 'çiğ etten zehirlendi' };
        this.net.broadcast({ t: 'sys', text: `${p.name} ${causes[m.by] || 'öldü'}.` });
        break;
      }
      case 'spill': {
        const items = cleanItems(m.items);
        if (Object.keys(items).length) this.addDrop(num(m.x, p.x), num(m.y, p.y), num(m.z, p.z), items, 600, pid);
        break;
      }
      case 'chat': {
        const text = String(m.text ?? '').slice(0, 120).trim();
        if (text) this.net.broadcast({ t: 'chat', name: p.name, color: p.color, text });
        break;
      }
    }
  }

  *deadNodesAndDamaged() {
    for (let i = 0; i < this.ns.length; i++) {
      const s = this.ns[i];
      if (!s.alive || s.hp < this.world.nodes[i].maxHp) yield [i, s.hp, s.alive ? 1 : 0];
    }
  }

  hitNode(p, m) {
    const n = this.world.nodes[m.id], s = this.ns[m.id];
    if (!n || !s || !s.alive) return;
    if ((n.x - p.x) ** 2 + (n.z - p.z) ** 2 > (6 + n.r) ** 2) return;
    const tool = toolOf(m.tool);
    let give, dmg;
    if (n.kind === 'bush') { dmg = 1; give = { berry: Math.random() < 0.35 ? 2 : 1, fiber: 2 }; }
    else if (n.kind === 'rock') { dmg = tool.stone; give = { stone: Math.min(dmg, s.hp) }; }
    else { dmg = tool.wood; give = { wood: Math.min(dmg, s.hp) }; if (Math.random() < 0.2) give.fiber = 1; }
    s.hp -= dmg;
    if (s.hp <= 0) {
      s.hp = 0; s.alive = false;
      s.at = this.t + (n.kind === 'rock' ? 240 : n.kind === 'bush' ? 80 : 150);
      this.deadNodes.add(m.id);
    }
    this.net.sendTo(p.id, { t: 'give', items: give, node: n.kind });
    this.net.broadcast({ t: 'node', id: m.id, hp: s.hp, alive: s.alive ? 1 : 0, by: p.id, x: r2(p.x), z: r2(p.z) });
  }

  hitMob(p, m) {
    const mob = this.mobs.get(m.id);
    if (!mob) return;
    const tool = toolOf(m.tool);
    const dx = mob.x - p.x, dz = mob.z - p.z, d = Math.hypot(dx, dz) || 1;
    if (d > tool.reach + mob.r + 3) return;
    const dmg = Math.round(tool.dmg * (0.9 + Math.random() * 0.2));
    mob.hp -= dmg;
    mob.kx = (dx / d) * 7; mob.kz = (dz / d) * 7;
    if (mob.type === 'deer') { mob.fleeT = 5; mob.fx = p.x; mob.fz = p.z; }
    else { mob.target = p.id; mob.aggroT = 20; }
    this.net.broadcast({ t: 'mhit', id: mob.id, hp: Math.max(0, Math.ceil(mob.hp)), dmg, by: p.id });
    if (mob.hp <= 0) this.killMob(mob, p.id);
  }

  place(p, m) {
    const k = m.k;
    if (!STRUCTS[k]) return;
    const x = num(m.x), z = num(m.z);
    if ((x - p.x) ** 2 + (z - p.z) ** 2 > 64) return;
    const y = this.world.heightAt(x, z);
    if (y < 0) return;
    const s = { id: this.sid++, k, x: r2(x), y: r2(y), z: r2(z), ry: r2(num(m.ry)), hp: STRUCTS[k].hp, fuel: k === 'campfire' ? 240 : 0, owner: p.id };
    this.structs.set(s.id, s);
    this.net.broadcast({ t: 'struct', s });
  }

  removeStruct(s) {
    this.structs.delete(s.id);
    this.net.broadcast({ t: 'sdel', id: s.id });
  }

  addDrop(x, y, z, items, ttl = 300, by = '') {
    const d = { id: this.did++, x: r2(x), y: r2(y), z: r2(z), items, ttl };
    this.drops.set(d.id, d);
    this.net.broadcast({ t: 'drop', d: { id: d.id, x: d.x, y: d.y, z: d.z, items, by } });
  }

  // ------------------------------------------------------------ yaratıklar
  spawnMob(type, x, z) {
    const D = MOBDEF[type];
    const hp = type === 'ghoul' ? D.hp + this.day * 8 : type === 'brute' ? D.hp + this.day * 25 : D.hp;
    const m = {
      id: this.mid++, type, x, z, y: this.world.heightAt(x, z), ry: Math.random() * 6.28,
      hp, maxHp: hp, spd: 0, ac: 0, wt: 0, wdx: 0, wdz: 0, target: null, aggroT: 0,
      fleeT: 0, fx: 0, fz: 0, atkCd: 0, kx: 0, kz: 0, burn: 0, spikeCd: 0,
    };
    this.mobs.set(m.id, m);
    return m;
  }

  spawnAnimal(type) {
    const refs = this.players.size ? [...this.players.values()] : [this.world.spawn];
    for (let tries = 0; tries < 14; tries++) {
      const x = (Math.random() * 2 - 1) * 215, z = (Math.random() * 2 - 1) * 215;
      const h = this.world.heightAt(x, z);
      if (h < 1 || h > 16) continue;
      if (refs.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 55 * 55)) continue;
      return this.spawnMob(type, x, z);
    }
    return null;
  }

  spawnGhoul(players, fires, type = 'ghoul') {
    const p = players[Math.floor(Math.random() * players.length)];
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 18;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (Math.abs(x) > 245 || Math.abs(z) > 245) continue;
      if (this.world.heightAt(x, z) < 0.2) continue;
      if (fires.some((f) => (f.x - x) ** 2 + (f.z - z) ** 2 < 13 * 13)) continue;
      return this.spawnMob(type, x, z);
    }
    return null;
  }

  killMob(m, by) {
    this.mobs.delete(m.id);
    this.net.broadcast({ t: 'mdie', id: m.id, by: by || '', type: m.type, x: r2(m.x), z: r2(m.z) });
    if (by) this.addDrop(m.x, m.y, m.z, { ...MOBDEF[m.type].loot });
  }

  updateMobs(dt, players, fires, spikes) {
    const night = this.isNight();
    const W = this.world;
    for (const m of this.mobs.values()) {
      const D = MOBDEF[m.type];
      m.atkCd -= dt; m.spikeCd -= dt;
      m.burn = 0;
      if (SHADOW[m.type] && this.hour >= 5 && this.hour < 19.5) {
        m.burn = 1;
        m.hp -= (m.type === 'brute' ? 90 : 28) * dt;
        if (m.hp <= 0) { this.killMob(m, null); continue; }
      }
      let near = null, nd = 1e9;
      for (const p of players) { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < nd) { nd = d; near = p; } }
      let mx = 0, mz = 0, speed = 0, target = null;
      const findT = (id) => players.find((p) => p.id === id) || null;

      if (m.type === 'deer') {
        if (near && nd < 11 && m.fleeT <= 0) { m.fleeT = 4; m.fx = near.x; m.fz = near.z; }
        if (m.fleeT > 0) {
          m.fleeT -= dt;
          const dx = m.x - m.fx, dz = m.z - m.fz, d = Math.hypot(dx, dz) || 1;
          mx = dx / d; mz = dz / d; speed = D.run;
        }
      } else if (m.type === 'boar') {
        if (m.aggroT > 0) { m.aggroT -= dt; target = findT(m.target); }
      } else if (m.type === 'wolf') {
        if (m.aggroT > 0) m.aggroT -= dt;
        const aggroR = night ? 26 : 14;
        if (m.aggroT <= 0 && near && nd < aggroR) { m.target = near.id; m.aggroT = 12; }
        if (m.aggroT > 0) target = findT(m.target);
      } else if (SHADOW[m.type]) {
        target = findT(m.target);
        if (!target || (near && Math.hypot(target.x - m.x, target.z - m.z) > nd + 8)) { target = near; m.target = near ? near.id : null; }
        if (!near || nd > 150) { this.mobs.delete(m.id); this.net.broadcast({ t: 'mgone', id: m.id }); continue; }
      }
      if (target && Math.hypot(target.x - m.x, target.z - m.z) > 45 && !SHADOW[m.type]) { target = null; m.aggroT = 0; }

      if (target) {
        const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz) || 1;
        m.ry = lerpAngle(m.ry, Math.atan2(dx, dz), Math.min(1, dt * 10));
        if (d < D.reach + 0.35) {
          if (m.atkCd <= 0) {
            m.atkCd = D.rate; m.ac++;
            const dmg = SHADOW[m.type] ? D.dmg + Math.min(this.day, 12) : D.dmg;
            this.net.sendTo(target.id, { t: 'dmg', amt: dmg, kx: r2(dx / d), kz: r2(dz / d), src: m.type });
          }
        } else { mx = dx / d; mz = dz / d; speed = D.run; }
      }

      // ateş korkusu: içerideyse kaç, yolu ateşten geçiyorsa etrafından dolaş,
      // hedef ateşin yanındaysa sınırda dört dön
      if (m.type === 'ghoul' || m.type === 'wolf') {
        for (const f of fires) {
          const fx = m.x - f.x, fz = m.z - f.z, fd = Math.hypot(fx, fz) || 0.01;
          const ux = fx / fd, uz = fz / fd;
          if (fd < FIRE_R) { mx = ux; mz = uz; speed = Math.max(speed, 3.2); m.fearT = 1; break; }
          if (speed > 0 && fd < FIRE_R + 3) {
            const nx = m.x + mx * 1.5, nz = m.z + mz * 1.5;
            if ((nx - f.x) ** 2 + (nz - f.z) ** 2 < FIRE_R * FIRE_R) {
              let tx = -uz, tz = ux;
              if (tx * mx + tz * mz < 0) { tx = -tx; tz = -tz; }
              const tIn = target && (target.x - f.x) ** 2 + (target.z - f.z) ** 2 < (FIRE_R + 1) ** 2;
              mx = tx; mz = tz; speed = tIn ? 1.3 : speed;
              break;
            }
          }
        }
      }

      // gezinme
      if (!target && m.fleeT <= 0) {
        m.wt -= dt;
        if (m.wt <= 0) {
          m.wt = 2 + Math.random() * 5;
          if (Math.random() < 0.4) { m.wdx = 0; m.wdz = 0; }
          else { const a = Math.random() * 6.283; m.wdx = Math.sin(a); m.wdz = Math.cos(a); }
        }
        if (m.wdx || m.wdz) { mx = m.wdx; mz = m.wdz; speed = D.walk; }
      }

      const vx = mx * speed + m.kx, vz = mz * speed + m.kz;
      const kd = Math.max(0, 1 - dt * 7); m.kx *= kd; m.kz *= kd;
      let nx = m.x + vx * dt, nz = m.z + vz * dt;
      if (W.heightAt(nx, nz) < -0.6 || Math.abs(nx) > 250 || Math.abs(nz) > 250) {
        nx = m.x; nz = m.z; m.wdx = -m.wdx; m.wdz = -m.wdz; m.wt = 1.5;
        if (m.fleeT > 0) { m.fx = m.x + (m.x - m.fx); m.fz = m.z + (m.z - m.fz); }
      }
      const c = W.collide(nx, nz, D.r);
      nx = c.x; nz = c.z;
      if (c.sid && target && m.type !== 'deer' && m.atkCd <= 0) {
        const s = this.structs.get(c.sid);
        if (s && s.k === 'wall') {
          m.atkCd = D.rate; m.ac++;
          s.hp -= m.type === 'brute' ? 45 : m.type === 'ghoul' ? 16 : 8;
          if (s.hp <= 0) this.removeStruct(s);
          else this.net.broadcast({ t: 'sup', id: s.id, hp: s.hp, hit: 1 });
        }
      }
      const moved = Math.hypot(nx - m.x, nz - m.z);
      m.spd = dt > 0 ? moved / dt : 0;
      if (!target && moved > 0.001) m.ry = lerpAngle(m.ry, Math.atan2(nx - m.x, nz - m.z), Math.min(1, dt * 6));
      m.x = nx; m.z = nz;
      m.y = Math.max(W.heightAt(nx, nz), -0.6);

      // tuzaklar
      if (m.spikeCd <= 0 && m.type !== 'deer') {
        for (const s of spikes) {
          if ((s.x - m.x) ** 2 + (s.z - m.z) ** 2 < 1.4 * 1.4) {
            m.spikeCd = 0.6;
            m.hp -= 22; m.kx = -mx * 5; m.kz = -mz * 5;
            s.hp -= 1;
            this.net.broadcast({ t: 'mhit', id: m.id, hp: Math.max(0, Math.ceil(m.hp)), dmg: 22, by: '' });
            if (s.hp <= 0) this.removeStruct(s); else this.net.broadcast({ t: 'sup', id: s.id, hp: s.hp });
            if (m.hp <= 0) { this.killMob(m, s.owner); }
            break;
          }
        }
      }
    }
    // üst üste binmeyi engelle
    const list = [...this.mobs.values()];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z, mr = MOBDEF[a.type].r + MOBDEF[b.type].r;
        const d2 = dx * dx + dz * dz;
        if (d2 < mr * mr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (mr - d) * 0.5;
          a.x -= (dx / d) * push; a.z -= (dz / d) * push;
          b.x += (dx / d) * push; b.z += (dz / d) * push;
        }
      }
    }
  }

  spawnLogic(players, fires) {
    if (!players.length) return;
    const cnt = { deer: 0, boar: 0, wolf: 0, ghoul: 0 };
    for (const m of this.mobs.values()) cnt[m.type]++;
    const night = this.isNight();
    const want = { deer: 18, boar: 8, wolf: night ? 10 : 6 };
    for (const t of ['deer', 'boar', 'wolf']) if (cnt[t] < want[t]) this.spawnAnimal(t);
  }

  ghoulLogic(players, fires) {
    if (!players.length || !this.isNight() || !(this.hour > 20.3 || this.hour < 4.3)) return;
    let n = 0;
    for (const m of this.mobs.values()) if (m.type === 'ghoul') n++;
    const gw = Math.min(30, Math.round((3 + this.day * 2) * (0.6 + 0.4 * players.length)));
    if (n < gw) this.spawnGhoul(players, fires);
    // her 3. gece bir Dev Gölge gelir (ateşten korkmaz!)
    if (this.day % 3 === 0 && this.bossDay !== this.day && this.hour > 21 && this.hour < 23) {
      const b = this.spawnGhoul(players, fires, 'brute');
      if (b) { this.bossDay = this.day; this.net.broadcast({ t: 'ev', e: 'boss', day: this.day }); }
    }
  }

  // ------------------------------------------------------------ ana döngü
  update(dt) {
    this.t += dt;
    const prev = this.hour;
    this.hour += dt / HOUR_SEC;
    if (this.hour >= 24) this.hour -= 24;
    if (prev < 6 && this.hour >= 6) { this.day++; this.net.broadcast({ t: 'ev', e: 'day', day: this.day }); }
    if (prev < 20 && this.hour >= 20) this.net.broadcast({ t: 'ev', e: 'night', day: this.day });
    if (prev < 18 && this.hour >= 18) this.net.broadcast({ t: 'ev', e: 'dusk', day: this.day });

    const players = [...this.players.values()].filter((p) => !p.dead);
    const fires = [], spikes = [];
    for (const s of this.structs.values()) {
      if (s.k === 'campfire' && s.fuel > 0) fires.push(s);
      else if (s.k === 'spikes') spikes.push(s);
    }

    this.secT += dt;
    if (this.secT >= 1) {
      this.secT -= 1;
      for (const i of this.deadNodes) {
        const s = this.ns[i];
        if (this.t >= s.at) {
          s.alive = true; s.hp = this.world.nodes[i].maxHp;
          this.deadNodes.delete(i);
          this.net.broadcast({ t: 'node', id: i, hp: s.hp, alive: 1 });
        }
      }
      for (const s of this.structs.values()) {
        if (s.k === 'campfire' && s.fuel > 0) {
          s.fuel -= 1;
          if (s.fuel <= 0) { s.fuel = 0; this.net.broadcast({ t: 'sup', id: s.id, fuel: 0, hp: s.hp }); }
        }
      }
      for (const d of this.drops.values()) {
        if (--d.ttl <= 0) { this.drops.delete(d.id); this.net.broadcast({ t: 'dropDel', id: d.id }); }
      }
      // sessizce kopan oyuncuları düşür
      for (const p of [...this.players.values()]) {
        if (p.id !== 'h' && performance.now() - p.last > 10000) { this.net.kick(p.id); this.removePlayer(p.id); }
      }
    }

    this.updateMobs(dt, players, fires, spikes);

    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 3.5; this.spawnLogic(players, fires); }
    this.ghoulT -= dt;
    if (this.ghoulT <= 0) { this.ghoulT = 1.6; this.ghoulLogic(players, fires); }

    this.snapT -= dt;
    if (this.snapT <= 0) { this.snapT = 1 / 12; this.sendSnaps(); }
  }

  sendSnaps() {
    const ps = [];
    for (const p of this.players.values()) ps.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.ry), r1(p.sp), p.fl, p.it, p.ac, Math.round(p.hp)]);
    for (const p of this.players.values()) {
      const ms = [];
      for (const m of this.mobs.values()) {
        const dx = m.x - p.x, dz = m.z - p.z;
        if (dx * dx + dz * dz < 150 * 150)
          ms.push([m.id, MOB_TYPES.indexOf(m.type), r2(m.x), r2(m.y), r2(m.z), r2(m.ry), r1(m.spd), m.ac, Math.ceil(m.hp), m.maxHp, m.burn]);
      }
      this.net.sendTo(p.id, { t: 'snap', h: r2(this.hour), d: this.day, p: ps, m: ms });
    }
  }
}
