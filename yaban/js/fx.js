// Parçacık sistemi (talaş, kıvılcım, duman, kan...) ve sabit ışık havuzu.
import * as THREE from 'three';

const TMP = new THREE.Object3D();
const C = new THREE.Color();
const S = 13; // parçacık başına veri

export class Particles {
  constructor(scene, cap, glow) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m = glow
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
      : new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, m, cap);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.cap = cap; this.n = 0;
    this.d = new Float32Array(cap * S);
    this.c = new Float32Array(cap * 3);
  }

  // o: {n, color, spread, speed, up, life, size, grav, var, grow}
  emit(x, y, z, o = {}) {
    const n = o.n ?? 8;
    C.set(o.color ?? '#ffffff');
    const v = o.var ?? 0.08, sp = o.speed ?? 3, s = o.spread ?? 0.3, up = o.up ?? 3;
    for (let i = 0; i < n; i++) {
      if (this.n >= this.cap) return;
      const idx = this.n++, k = idx * S, d = this.d;
      const a = Math.random() * Math.PI * 2, u = 0.3 + Math.random() * 0.7;
      d[k] = x + (Math.random() - 0.5) * s; d[k + 1] = y + (Math.random() - 0.5) * s; d[k + 2] = z + (Math.random() - 0.5) * s;
      d[k + 3] = Math.cos(a) * sp * u; d[k + 4] = up * (0.5 + Math.random() * 0.7); d[k + 5] = Math.sin(a) * sp * u;
      const life = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
      d[k + 6] = life; d[k + 7] = life;
      d[k + 8] = (o.size ?? 0.15) * (0.7 + Math.random() * 0.6);
      d[k + 9] = o.grav ?? -12;
      d[k + 10] = (Math.random() - 0.5) * 12;
      d[k + 11] = Math.random() * 6;
      d[k + 12] = o.grow ? 1 : 0;
      const j = 1 + (Math.random() - 0.5) * 2 * v;
      this.c[idx * 3] = C.r * j; this.c[idx * 3 + 1] = C.g * j; this.c[idx * 3 + 2] = C.b * j;
    }
  }

  update(dt) {
    const d = this.d, c = this.c;
    let i = 0;
    while (i < this.n) {
      const k = i * S;
      d[k + 6] -= dt;
      if (d[k + 6] <= 0) {
        const last = --this.n;
        if (i !== last) {
          d.copyWithin(k, last * S, last * S + S);
          c.copyWithin(i * 3, last * 3, last * 3 + 3);
        }
        continue;
      }
      d[k + 4] += d[k + 9] * dt;
      if (d[k + 12]) { d[k + 3] *= 1 - dt * 1.5; d[k + 5] *= 1 - dt * 1.5; d[k + 4] *= 1 - dt * 1.2; }
      d[k] += d[k + 3] * dt; d[k + 1] += d[k + 4] * dt; d[k + 2] += d[k + 5] * dt;
      d[k + 11] += d[k + 10] * dt;
      i++;
    }
    const m = this.mesh;
    for (let j = 0; j < this.n; j++) {
      const k = j * S;
      const life = d[k + 6] / d[k + 7];
      const s = d[k + 12] ? d[k + 8] * (2.4 - life * 1.4) * Math.min(1, life * 3) : d[k + 8] * Math.min(1, life * 2.5);
      TMP.position.set(d[k], d[k + 1], d[k + 2]);
      TMP.rotation.set(d[k + 11], d[k + 11] * 0.7, 0);
      TMP.scale.setScalar(s);
      TMP.updateMatrix();
      m.setMatrixAt(j, TMP.matrix);
      m.instanceColor.setXYZ(j, c[j * 3], c[j * 3 + 1], c[j * 3 + 2]);
    }
    m.count = this.n;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
  }
}

// Gölgelendirici yeniden derlenmesin diye ışık sayısı sabit; en yakın kaynaklara atanır.
export class LightPool {
  constructor(scene, n = 4) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xff9a45, 0, 26, 1.8);
      scene.add(l);
      this.lights.push(l);
    }
  }
  update(sources, cx, cz) {
    sources.sort((a, b) => ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
    this.lights.forEach((l, i) => {
      const s = sources[i];
      if (s) { l.position.set(s.x, s.y, s.z); l.intensity = s.i; l.color.set(s.c || 0xff9a45); l.distance = s.d || 26; }
      else l.intensity = 0;
    });
  }
}
