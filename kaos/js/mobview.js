// Yaratıkların ekrandaki hali: simülasyondan gelen anlık görüntüyü yumuşatır ve animasyonlar.
// Kurt modelinde yalnızca "Walking" ve "Idle" klipleri var; koşma, atılma, sarsılma, uluma,
// havada takla ve ölüm hareketleri bu dosyada kodla (prosedürel) eklenir.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const WOLF_TINTS = ['#9a9ca3', '#7a5c44', '#45454b', '#ecebe6'];
const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

class WolfView {
  constructor(gltf, tint) {
    this.root = new THREE.Group();
    this.pose = new THREE.Group(); this.pose.position.y = 0.45; this.root.add(this.pose);
    this.model = skClone(gltf.scene); this.model.position.y = -0.45; this.pose.add(this.model);
    this.mats = [];
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.frustumCulled = false;
        o.material = new THREE.MeshLambertMaterial({ color: WOLF_TINTS[tint % WOLF_TINTS.length], emissive: '#000000' });
        this.mats.push(o.material);
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (n) => gltf.animations.find((a) => a.name.includes(n));
    this.walk = this.mixer.clipAction(clip('Walking')); this.idle = this.mixer.clipAction(clip('Idle'));
    this.walk.play(); this.idle.play();
    this.walk.time = Math.random(); this.idle.time = Math.random();
    this.x = 0; this.y = 0; this.z = 0; this.ry = 0; this.tx = 0; this.ty = 0; this.tz = 0; this.try = 0;
    this.spd = 0; this.fl = 0; this.hp = 100; this.atk = -1; this.hit = -1; this.howl = -1;
    this.lungeT = 0; this.hitT = 0; this.howlT = 0; this.deadK = 0; this.spinX = 0; this.phase = 0; this.first = true;
  }

  set(s) {
    const [id, , x, y, z, ry, spd, fl, hp, atk, hit, howl] = s;
    if (this.first) { this.x = x; this.y = y; this.z = z; this.ry = ry; this.atk = atk; this.hit = hit; this.howl = howl; this.first = false; }
    this.tx = x; this.ty = y; this.tz = z; this.try = ry; this.spd = spd; this.fl = fl; this.hp = hp;
    if (atk !== this.atk) { this.atk = atk; this.lungeT = 0.45; }
    if (hit !== this.hit) { this.hit = hit; this.hitT = 0.3; this.showHp = 4; }
    if (howl !== this.howl) { this.howl = howl; this.howlT = 1.3; }
  }

  get dead() { return !!(this.fl & 1); }

  update(dt) {
    const k = Math.min(1, dt * 12);
    this.x = lerp(this.x, this.tx, k); this.z = lerp(this.z, this.tz, k);
    this.y = (this.fl & 2) ? lerp(this.y, this.ty, Math.min(1, dt * 20)) : lerp(this.y, this.ty, k);
    if (!(this.fl & 2)) this.ry = lerpAngle(this.ry, this.try, k);
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.ry;

    // yürüme/bekleme karışımı ve hıza göre oynatma hızı
    const sp = this.dead ? 0 : this.spd;
    const wW = Math.min(1, sp / 0.8);
    this.walk.setEffectiveWeight(wW); this.idle.setEffectiveWeight(1 - wW);
    this.walk.setEffectiveTimeScale(Math.max(0.5, Math.min(2.8, sp / 1.6)));
    this.mixer.timeScale = this.dead ? 0 : this.howlT > 0 ? 0.3 : 1;
    this.mixer.update(dt);

    // koşarken gövde zıplaması (prosedürel)
    const run = Math.max(0, Math.min(1, (sp - 2.5) / 3));
    this.phase += dt * sp * 2.1;
    let py = 0.45 + Math.abs(Math.sin(this.phase)) * 0.13 * run, pz = 0, rx = Math.sin(this.phase * 2) * 0.07 * run, rz = 0;

    if (this.lungeT > 0) { // atılıp ısırma
      this.lungeT -= dt; const a = Math.sin((1 - this.lungeT / 0.45) * Math.PI);
      pz += a * 0.55; rx += -a * 0.35; py += a * 0.18;
    }
    if (this.howlT > 0) { // başını kaldırıp uluma
      this.howlT -= dt; const a = Math.min(1, this.howlT * 3, (1.3 - this.howlT) * 4);
      rx += -0.6 * a;
    }
    if (this.hitT > 0) { // darbe sarsıntısı + kırmızı parlama
      this.hitT -= dt; const a = this.hitT / 0.3;
      rz += Math.sin(a * Math.PI * 4) * 0.3 * a;
      for (const m of this.mats) m.emissive.setRGB(0.7 * a, 0.08 * a, 0.05 * a);
    }
    if ((this.fl & 2) && !this.dead) this.spinX += dt * 11; // havada takla
    else this.spinX = lerp(this.spinX, Math.round(this.spinX / (Math.PI * 2)) * Math.PI * 2, Math.min(1, dt * 10));
    this.deadK = lerp(this.deadK, this.dead ? 1 : 0, Math.min(1, dt * 5));
    py = lerp(py, 0.2, this.deadK);
    rz = lerp(rz, Math.PI / 2, this.deadK);
    this.pose.position.set(0, py, pz);
    this.pose.rotation.set(rx + this.spinX, 0, rz);
  }
}

export class MobViews {
  constructor(scene, assets, labels) {
    this.scene = scene; this.assets = assets; this.labels = labels;
    this.views = new Map();
  }

  apply(snap) {
    const seen = new Set();
    for (const s of snap) {
      const id = s[0];
      seen.add(id);
      let v = this.views.get(id);
      if (!v) {
        v = new WolfView(this.assets.wolf, s[12] || 0);
        v.id = id; v.type = 'wolf';
        const el = document.createElement('div'); el.className = 'mobhp'; el.innerHTML = '<i></i>'; el.style.display = 'none';
        this.labels.appendChild(el); v.el = el; v.hpEl = el.firstChild; v.showHp = 0;
        this.scene.add(v.root);
        this.views.set(id, v);
      }
      v.set(s);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) this.remove(id);
  }

  remove(id) {
    const v = this.views.get(id);
    if (!v) return;
    this.scene.remove(v.root);
    v.el.remove();
    this.views.delete(id);
  }

  update(dt) { for (const v of this.views.values()) { v.update(dt); v.showHp -= dt; } }
}
