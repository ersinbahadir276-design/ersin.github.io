// Diğer oyuncuların ekrandaki hali: ağdan gelen konum + animasyon durumu ile aynı karakter animasyonları.
import * as THREE from 'three';
import { Character, PLAYER_CLIPS, ONESHOT, addHat } from './character.js';

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

export function makePlayerCharacter(assets, info) {
  const ch = new Character(assets.player, PLAYER_CLIPS);
  ch.paint({ M_Main: info.color, M_Joints: shade(info.color, 0.45) });
  addHat(ch, info.hat, info.color === '#f7c548' ? '#33b5e5' : '#f7c548');
  return ch;
}

export class RemotePlayers {
  constructor(scene, assets, labels) {
    this.scene = scene; this.assets = assets; this.labels = labels;
    this.list = new Map();
  }

  add(info) {
    if (this.list.has(info.id)) return this.list.get(info.id);
    const ch = makePlayerCharacter(this.assets, info);
    this.scene.add(ch.root);
    const el = document.createElement('div');
    el.className = 'ptag';
    el.innerHTML = `<b style="color:${esc(info.color)}">${esc(info.name)}</b><span class="php"><i></i></span>`;
    this.labels.appendChild(el);
    const r = { id: info.id, info, ch, el, hpEl: el.querySelector('i'), x: info.x || 0, y: info.y || 0, z: info.z || 0, ry: 0, tx: 0, ty: 0, tz: 0, try: 0, seq: -1, dead: false, hp: 100, first: true };
    this.list.set(info.id, r);
    return r;
  }

  remove(id) {
    const r = this.list.get(id);
    if (!r) return;
    this.scene.remove(r.ch.root);
    r.el.remove();
    this.list.delete(id);
  }

  // satır: [id, x, y, z, ry, temel, temelHız, tekSefer, sıra, can, bitler]
  apply(rows, myId) {
    for (const row of rows) {
      const [id, x, y, z, ry, base, bts, one, seq, hp, fl] = row;
      if (id === myId) continue;
      const r = this.list.get(id);
      if (!r) continue;
      if (r.first || Math.hypot(x - r.x, z - r.z) > 15) { r.x = x; r.y = y; r.z = z; r.ry = ry; r.first = false; }
      r.tx = x; r.ty = y; r.tz = z; r.try = ry; r.hp = hp;
      const dead = !!(fl & 1);
      if (dead && !r.dead) { r.ch.play('death', ONESHOT.death); r.dead = true; }
      else if (!dead && r.dead) { r.ch.release(); r.dead = false; }
      if (r.seq === -1) r.seq = seq;
      else if (seq !== r.seq) {
        r.seq = seq;
        if (one && one !== 'death' && ONESHOT[one] && !dead) r.ch.play(one, ONESHOT[one]);
      }
      if (base) r.ch.setBase(base, bts || 1);
    }
  }

  update(dt) {
    const k = Math.min(1, dt * 12);
    for (const r of this.list.values()) {
      r.x = lerp(r.x, r.tx, k); r.y = lerp(r.y, r.ty, k); r.z = lerp(r.z, r.tz, k);
      r.ry = lerpAngle(r.ry, r.try, k);
      r.ch.root.position.set(r.x, r.y, r.z);
      r.ch.root.rotation.y = r.ry;
      r.ch.update(dt);
      if (r.ch.hat && r.ch.hat.userData.spin) r.ch.hat.userData.spin.rotation.y += dt * 8;
    }
  }
}
