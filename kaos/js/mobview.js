// Yaratıkların ekrandaki hali: simülasyondan gelen anlık görüntüyü yumuşatır ve animasyonlar.
// Kurt modelinde yalnızca "Walking" ve "Idle" klipleri var; koşma, atılma, sarsılma, uluma,
// havada takla ve ölüm hareketleri bu dosyada kodla (prosedürel) eklenir.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { Character, PLAYER_CLIPS, ONESHOT } from './character.js';
import { GIANT, DRAGON } from './simboss.js';

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

// Dev: oyuncu mankeninin büyütülmüş, taş renkli hali (gerçek yürüme/ezme/hasar/ölüm klipleri)
class GiantView {
  constructor(gltf) {
    this.ch = new Character(gltf, PLAYER_CLIPS);
    this.ch.paint({ M_Main: '#7f8a6e', M_Joints: '#4e4a3e' });
    this.root = this.ch.root;
    this.root.scale.setScalar(GIANT.scale);
    const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const hand = this.ch.bones['DEF-handR'];
    if (hand) { const club = new THREE.Group(); const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 6), M('#6b4421')); h.position.y = 0.25; club.add(h); const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), M('#8d8d8d')); head.position.y = 0.62; club.add(head); club.rotation.x = Math.PI / 2; hand.add(club); }
    const headB = this.ch.bones['DEF-head'];
    if (headB) for (const sd of [1, -1]) { const hn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), M('#e8e0c8')); hn.position.set(0.1 * sd, 0.24, 0.02); hn.rotation.z = -0.5 * sd; headB.add(hn); }
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.x = this.y = this.z = this.ry = 0; this.first = true; this.dead = false; this.atk = -1; this.hit = -1; this.howl = -1; this.spd = 0; this.hp = 100;
  }
  set(s) {
    const [, , x, y, z, ry, spd, fl, hp, atk, hit, howl] = s;
    if (this.first) { this.x = x; this.y = y; this.z = z; this.ry = ry; this.atk = atk; this.hit = hit; this.howl = howl; this.first = false; }
    this.tx = x; this.ty = y; this.tz = z; this.try = ry; this.spd = spd; this.hp = hp;
    const dead = !!(fl & 1);
    if (dead && !this.dead) { this.ch.play('death', ONESHOT.death); this.dead = true; }
    if (atk !== this.atk) { this.atk = atk; if (!dead) this.ch.play('heavy', { ts: 1.35, fade: 0.1 }); }
    if (hit !== this.hit) { this.hit = hit; this.showHp = 6; if (!dead && this.ch.oneName !== 'heavy') this.ch.play('hit', ONESHOT.hit); }
    this.howl = howl;
  }
  update(dt) {
    const k = Math.min(1, dt * 10);
    this.x = lerp(this.x, this.tx, k); this.y = lerp(this.y, this.ty, k); this.z = lerp(this.z, this.tz, k); this.ry = lerpAngle(this.ry, this.try, k);
    this.root.position.set(this.x, this.y, this.z); this.root.rotation.y = this.ry;
    if (!this.dead) { const sp = this.spd / GIANT.scale; if (sp < 0.15) this.ch.setBase('idle'); else this.ch.setBase('walk', Math.max(0.5, sp / 1.6)); }
    this.ch.update(dt);
  }
}

// Ejderha: uçma, saldırı, hasar, ölüm klipleri + burnundan ateş
const DRAGON_COLORS = { Main: '#c0392b', Belly: '#f1c40f', Wings: '#7b241c', Claws: '#f5f0e6', Eyes: '#ffe14d' };
class DragonView {
  constructor(gltf) {
    this.root = new THREE.Group();
    this.model = skClone(gltf.scene); this.model.scale.setScalar(DRAGON.scale); this.root.add(this.model);
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.frustumCulled = false;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        const nm = ms.map((m) => new THREE.MeshLambertMaterial({ color: DRAGON_COLORS[m.name] || '#c0392b', flatShading: true, emissive: '#000000' }));
        o.material = nm.length === 1 ? nm[0] : nm;
      }
      if (o.isBone && o.name === 'Nose') this.nose = o;
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (n) => gltf.animations.find((a) => a.name.endsWith(n));
    this.acts = { fly: this.mixer.clipAction(clip('Dragon_Flying')), atk: this.mixer.clipAction(clip('Dragon_Attack2')), hit: this.mixer.clipAction(clip('Dragon_Hit')), death: this.mixer.clipAction(clip('Dragon_Death')) };
    this.acts.fly.play(); this.cur = this.acts.fly;
    for (const k of ['atk', 'hit', 'death']) { this.acts[k].setLoop(THREE.LoopOnce, 1); this.acts[k].clampWhenFinished = k === 'death'; }
    this.mixer.addEventListener('finished', (e) => { if (e.action !== this.acts.death && !this.dead) this.to(this.acts.fly, 0.25); });
    this.x = this.y = this.z = this.ry = 0; this.first = true; this.dead = false; this.atk = -1; this.hit = -1; this.fl = 0; this.hp = 100; this.pitch = 0;
    this.mouth = new THREE.Vector3();
  }
  to(a, fade) { if (this.cur === a) { a.reset().play(); return; } a.reset(); a.setEffectiveWeight(1); a.play(); this.cur.crossFadeTo(a, fade, false); this.cur = a; }
  set(s) {
    const [, , x, y, z, ry, spd, fl, hp, atk, hit] = s;
    if (this.first) { this.x = x; this.y = y; this.z = z; this.ry = ry; this.atk = atk; this.hit = hit; this.first = false; }
    this.tx = x; this.ty = y; this.tz = z; this.try = ry; this.fl = fl; this.hp = hp; this.spd = spd;
    const dead = !!(fl & 1);
    if (dead && !this.dead) { this.dead = true; this.to(this.acts.death, 0.15); }
    if (atk !== this.atk) { this.atk = atk; if (!dead) this.to(this.acts.atk, 0.1); }
    if (hit !== this.hit) { this.hit = hit; this.showHp = 6; if (!dead && this.cur !== this.acts.atk) this.to(this.acts.hit, 0.1); }
  }
  get breathing() { return !!(this.fl & 16) && !this.dead; }
  update(dt) {
    const k = Math.min(1, dt * 6);
    this.x = lerp(this.x, this.tx, k); this.y = lerp(this.y, this.ty, k); this.z = lerp(this.z, this.tz, k); this.ry = lerpAngle(this.ry, this.try, k);
    const rest = !!(this.fl & 32);
    this.pitch = lerp(this.pitch, this.breathing ? 0.35 : rest ? 0 : -Math.min(0.25, this.spd * 0.03), k);
    this.root.position.set(this.x, this.y, this.z); this.root.rotation.set(0, this.ry, 0); this.model.rotation.x = this.pitch;
    this.acts.fly.setEffectiveTimeScale(rest ? 0.5 : 1);
    this.mixer.update(dt);
    if (this.nose) this.nose.getWorldPosition(this.mouth);
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
        const type = ['wolf', 'giant', 'dragon'][s[1]] || 'wolf';
        v = type === 'giant' ? new GiantView(this.assets.player) : type === 'dragon' ? new DragonView(this.assets.dragon) : new WolfView(this.assets.wolf, s[12] || 0);
        v.id = id; v.type = type;
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
