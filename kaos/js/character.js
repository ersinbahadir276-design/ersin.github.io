// İskelet animasyonlu karakter: model klonu + AnimationMixer + yumuşak geçişli durum makinesi.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

// Oyuncu animasyonları (Universal Animation Library klip adları)
export const PLAYER_CLIPS = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop',
  crouch: 'Crouch_Idle_Loop', crouchWalk: 'Crouch_Fwd_Loop', fall: 'Jump_Loop',
  jump: 'Jump_Start', land: 'Jump_Land', attack: 'Punch_Jab', heavy: 'Sword_Attack',
  hit: 'Hit_Chest', death: 'Death01', roll: 'Roll', dance: 'Dance_Loop',
  swim: 'Swim_Fwd_Loop', swimIdle: 'Swim_Idle_Loop', push: 'Push_Loop',
  interact: 'Interact', pickup: 'PickUp_Table',
};

export class Character {
  constructor(gltf, clipMap) {
    this.root = new THREE.Group();
    this.model = skClone(gltf.scene);
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    const byName = {};
    for (const c of gltf.animations) byName[c.name] = c;
    for (const [k, n] of Object.entries(clipMap)) if (byName[n]) this.actions[k] = this.mixer.clipAction(byName[n]);
    this.cur = null; this.curName = null;
    this.base = 'idle'; this.baseTs = 1;
    this.one = null; this.oneName = null; this.onDone = null;
    this.hold = false; // ölümde son karede kal
    this.bones = {};
    this.model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
      if (o.isBone) this.bones[o.name] = o;
    });
    this.mixer.addEventListener('finished', (e) => {
      if (this.one && e.action === this.one) {
        const cb = this.onDone;
        this.one = null; this.oneName = null; this.onDone = null;
        if (!this.hold) this._go(this.base, 0.18, this.baseTs);
        if (cb) cb();
      }
    });
  }

  // Malzemeleri bu karaktere özel kopyala ve renklendir: {MalzemeAdı: renk}
  paint(map) {
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      const col = map[src.name] ?? map['*'];
      o.material = new THREE.MeshLambertMaterial({ color: col ?? src.color, name: src.name });
    });
  }

  _go(name, fade, ts = 1) {
    const a = this.actions[name];
    if (!a) return;
    if (this.cur === a) { a.setEffectiveTimeScale(ts); return; }
    a.reset();
    a.setEffectiveTimeScale(ts);
    a.setEffectiveWeight(1);
    a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a; this.curName = name;
  }

  // Sürekli (döngü) animasyon: yürü, koş, bekle...
  setBase(name, ts = 1, fade = 0.2) {
    this.base = name; this.baseTs = ts;
    if (!this.one && !this.hold) this._go(name, fade, ts);
  }

  // Tek seferlik animasyon: saldırı, zıplama, hasar, ölüm...
  play(name, { fade = 0.1, ts = 1, start = 0, clamp = false, onDone = null, hold = false } = {}) {
    const a = this.actions[name];
    if (!a) return false;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = clamp || hold;
    this.hold = hold;
    this.one = a; this.oneName = name; this.onDone = onDone;
    if (this.cur === a) { a.reset(); a.setEffectiveTimeScale(ts); a.setEffectiveWeight(1); a.play(); }
    else this._go(name, fade, ts);
    a.time = start * a.getClip().duration;
    return true;
  }

  release() { this.hold = false; this.one = null; this.oneName = null; this._go(this.base, 0.25, this.baseTs); }

  // Şu an oynayan animasyon ve ilerleme oranı (test ve ağ için)
  status() {
    const a = this.one || this.cur;
    if (!a) return { name: null, t: 0 };
    return { name: this.oneName || this.curName, t: a.time / a.getClip().duration, running: a.isRunning() };
  }

  update(dt) { this.mixer.update(dt); }
}

// Kafaya takılan komik şapkalar (oyuncuları ayırt etmek için)
export const HATS = ['parti', 'boynuz', 'tac', 'tencere', 'pervane', 'kovboy'];
export function addHat(ch, type, color) {
  const head = ch.bones['DEF-head'];
  if (!head) return null;
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshLambertMaterial({ color: c });
  if (type === 'parti') {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 10), M(color)); c.position.y = 0.16; g.add(c);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M('#ffffff')); b.position.y = 0.33; g.add(b);
  } else if (type === 'boynuz') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.14, 0.07, 12), M('#8a8f99')); band.position.y = 0.02; g.add(band);
    for (const s of [1, -1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 8), M('#f2ead2'));
      h.position.set(0.14 * s, 0.1, 0); h.rotation.z = -0.9 * s; g.add(h);
    }
  } else if (type === 'tac') {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10, 1, true), M('#f5c542')); r.material.side = THREE.DoubleSide; r.position.y = 0.04; g.add(r);
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), M('#f5c542')); const a = (i / 5) * Math.PI * 2; s.position.set(Math.cos(a) * 0.11, 0.11, Math.sin(a) * 0.11); g.add(s); }
  } else if (type === 'tencere') {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.14, 12), M('#9aa3ad')); p.position.y = 0.05; g.add(p);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.04), M('#3a3a3a')); h.position.set(0.2, 0.1, 0); g.add(h);
  } else if (type === 'pervane') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(color)); g.add(cap);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), M('#333')); stick.position.y = 0.16; g.add(stick);
    const prop = new THREE.Group(); prop.position.y = 0.2;
    for (const c of ['#e74c3c', '#3498db']) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.01, 0.05), M(c)); prop.add(b); prop.children.length === 2 && (b.rotation.y = Math.PI / 2); }
    g.add(prop); g.userData.spin = prop;
  } else if (type === 'kovboy') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 14), M('#8b5a2b')); brim.position.y = 0.02; g.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 12), M('#8b5a2b')); top.position.y = 0.09; g.add(top);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.03, 12), M(color)); band.position.y = 0.05; g.add(band);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.y = 0.2; // kemik ucundan başın tepesine
  head.add(g);
  ch.hat = g;
  return g;
}
