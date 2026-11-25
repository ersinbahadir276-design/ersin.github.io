// İnşa modu: parça seçimi, ızgaraya oturan önizleme (hayalet), döndürme ve yerleştirme.
import * as THREE from 'three';
import { PIECES, PIECE_KEYS, buildMesh } from './structures.js';
import { WATER } from './world.js';

const ghostOk = new THREE.MeshBasicMaterial({ color: '#5dff7a', transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.45, depthWrite: false });
const snapTo = (v, g) => Math.round(v / g) * g;

export class BuildMode {
  constructor({ scene, world, structs, getPlayer, getYaw, inv, onPlace, bar }) {
    Object.assign(this, { scene, world, structs, getPlayer, getYaw, inv, onPlace, bar });
    this.on = false; this.sel = 0; this.rot = 0; this.ghost = null; this.ghostKey = null; this.valid = false; this.pos = { x: 0, y: 0, z: 0, ry: 0 };
    this.renderBar();
  }

  get key() { return PIECE_KEYS[this.sel]; }

  toggle(on = !this.on) {
    this.on = on;
    this.bar.classList.toggle('hidden', !on);
    document.body.classList.toggle('building', on);
    if (!on && this.ghost) { this.scene.remove(this.ghost); this.ghost = null; this.ghostKey = null; }
    this.renderBar();
  }

  select(i) { this.sel = (i + PIECE_KEYS.length) % PIECE_KEYS.length; this.renderBar(); }
  rotate() { this.rot = (this.rot + 1) % 4; }

  affordable(k) { const c = PIECES[k].cost; return Object.entries(c).every(([r, n]) => (this.inv[r] || 0) >= n); }

  renderBar() {
    const html = PIECE_KEYS.map((k, i) => {
      const P = PIECES[k], cost = Object.entries(P.cost).map(([r, n]) => `${n} ${r === 'wood' ? 'odun' : 'taş'}`).join(' + ');
      return `<button class="bp${i === this.sel ? ' on' : ''}${this.affordable(k) ? '' : ' no'}" data-i="${i}"><b>${P.name}</b><small>${cost}</small></button>`;
    }).join('');
    if (this.bar._h !== html) { this.bar._h = html; this.bar.innerHTML = html; }
  }

  // her kare: önizlemeyi oyuncunun önüne yerleştir
  update() {
    if (!this.on) return;
    const k = this.key, P = PIECES[k], p = this.getPlayer(), yaw = this.getYaw();
    if (this.ghostKey !== k) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = buildMesh(k === 'barrel' ? 'chest' : k);
      if (k === 'barrel') { this.ghost = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.85, 10), ghostOk); b.position.y = 0.42; this.ghost.add(b); }
      this.ghost.traverse((o) => { if (o.isMesh) { o.material = ghostOk; o.castShadow = false; o.receiveShadow = false; } });
      this.scene.add(this.ghost); this.ghostKey = k;
    }
    const q = Math.round(yaw / (Math.PI / 2));
    const ry = ((q + this.rot) % 4) * (Math.PI / 2);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const dist = k === 'ramp' ? 3.6 : k === 'tower' || k === 'floor' || k === 'roof' ? 2.6 : 2.0;
    let x = p.x + fx * dist, z = p.z + fz * dist;
    if (P.snap === 2) { x = snapTo(x, 2); z = snapTo(z, 2); }
    else if (P.snap === 'edge') {
      // duvar/kapı zemin kenarına oturur: uzun kenar boyunca çift, dik yönde tek ızgara
      const alongX = Math.abs(Math.cos(ry)) > 0.5;
      if (alongX) { x = snapTo(x, 2); z = snapTo(z - 1, 2) + 1; } else { z = snapTo(z, 2); x = snapTo(x - 1, 2) + 1; }
    } else { x = snapTo(x, 1); z = snapTo(z, 1); }
    const W = this.world;
    const terr = Math.max(W.heightAt(x, z), W.heightAt(x + 0.9, z + 0.9), W.heightAt(x - 0.9, z - 0.9), W.heightAt(x + 0.9, z - 0.9), W.heightAt(x - 0.9, z + 0.9));
    const top = this.structs.topAt(x, z, p.y + 1.3);
    const y = Math.max(k === 'floor' || k === 'tower' || k === 'ramp' ? terr : W.heightAt(x, z), top);
    this.pos = { x, y, z, ry };
    this.ghost.position.set(x, y, z); this.ghost.rotation.y = ry;
    let ok = this.affordable(k) && y > WATER - 0.2 && Math.hypot(x - p.x, z - p.z) < 8;
    if (ok) for (const s of this.structs.map.values()) {
      if (Math.abs(s.y - y) > 0.5) continue;
      if (Math.hypot(s.x - x, s.z - z) < 0.3 && (s.k === k || (k !== 'wall' && k !== 'door' && s.k !== 'wall' && s.k !== 'door'))) { ok = false; break; }
    }
    if (ok && k !== 'roof' && (k === 'floor' || k === 'tower' || k === 'ramp') && y - W.heightAt(x, z) > 3.5 && top < 0) ok = false;
    if (this.valid !== ok) { this.valid = ok; this.ghost.traverse((o) => { if (o.isMesh) o.material = ok ? ghostOk : ghostBad; }); }
  }

  place() {
    if (!this.on || !this.valid) return false;
    const k = this.key;
    for (const [r, n] of Object.entries(PIECES[k].cost)) this.inv[r] -= n;
    this.onPlace({ k, ...this.pos });
    this.renderBar();
    return true;
  }
}
