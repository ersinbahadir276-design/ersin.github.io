// Prosedürel ada: arazi, su, ağaçlar, kayalar, çalılar, çimen ve çarpışma ızgarası.
import * as THREE from 'three';
import { mulberry32, makeSimplex } from './noise.js';

export const HALF = 110, SEG = 110, CELL = (HALF * 2) / SEG, WATER = 0;
const N = SEG + 1;
const GC = 8; // çarpışma ızgarası hücre boyu
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const key = (cx, cz) => cx * 4099 + cz;

function mergeGeos(list) {
  const arrs = list.map((g) => (g.index ? g.toNonIndexed() : g).getAttribute('position').array);
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const pos = new Float32Array(total);
  let o = 0;
  for (const a of arrs) { pos.set(a, o); o += a.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const TMP = new THREE.Object3D();
const COL = new THREE.Color();

export class World {
  constructor(seed, scene) {
    this.seed = seed >>> 0;
    this.scene = scene;
    this.noise = makeSimplex(this.seed);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colGrid = new Map();
    this.nodeGrid = new Map();
    this.time = 0;
    this.anims = [];
    this.active = new Set(); // sallanan / büyüyen düğümler
    this.uTime = { value: 0 };
    this.onImpact = null;
    this.buildHeights();
    this.spawn = this.findSpawn();
    this.buildTerrain();
    this.buildWater();
    this.buildNodes();
    this.buildGrass();
  }

  // ------------------------------------------------------------ yükseklik
  rawHeight(x, z) {
    const n = this.noise;
    const base = (n(x * 0.01, z * 0.01) + n(x * 0.026 + 31.7, z * 0.026 - 11.3) * 0.5 + n(x * 0.06 - 7.1, z * 0.06 + 5.5) * 0.2) / 1.7;
    const coast = n(x * 0.02 + 71.3, z * 0.02 + 19.1) * 0.08;
    const r = Math.sqrt(x * x + z * z) / HALF + coast;
    const fall = 1 - smooth((r - 0.6) / 0.32);
    const rid = 1 - Math.abs(n(x * 0.017 + 100.3, z * 0.017 - 50.9));
    const m = rid > 0.62 ? (rid - 0.62) / 0.38 : 0;
    const land = 2.6 + base * 4.5 + m * m * 14 * smooth((base + 0.2) * 1.6);
    return -6 + (land + 6) * fall;
  }

  buildHeights() {
    this.H = new Float32Array(N * N);
    for (let iz = 0; iz < N; iz++)
      for (let ix = 0; ix < N; ix++)
        this.H[iz * N + ix] = this.rawHeight(-HALF + ix * CELL, -HALF + iz * CELL);
  }

  heightAt(x, z) {
    let gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0) gx = 0; else if (gx > SEG - 0.0001) gx = SEG - 0.0001;
    if (gz < 0) gz = 0; else if (gz > SEG - 0.0001) gz = SEG - 0.0001;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const H = this.H;
    const h00 = H[iz * N + ix], h10 = H[iz * N + ix + 1], h01 = H[(iz + 1) * N + ix], h11 = H[(iz + 1) * N + ix + 1];
    if (fx >= fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }

  slopeAt(x, z) {
    return Math.abs(this.heightAt(x + 1.5, z) - this.heightAt(x - 1.5, z)) + Math.abs(this.heightAt(x, z + 1.5) - this.heightAt(x, z - 1.5));
  }

  // doğma noktasının etrafı yürünebilir mi (kayalık dibine düşmesin)
  flatAround(x, z, h) {
    for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]]) {
      const hh = this.heightAt(x + dx, z + dz);
      if (Math.abs(hh - h) > 2.2 || hh < 0.8) return false;
    }
    return true;
  }

  findSpawn() {
    for (let ring = 0; ring < 30; ring++) {
      for (let i = -ring; i <= ring; i++) {
        for (const [dx, dz] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
          const x = dx * 3, z = dz * 3;
          const h = this.heightAt(x, z);
          if (h > 1.5 && h < 6 && this.slopeAt(x, z) < 1.0 && this.flatAround(x, z, h)) return { x, z };
        }
      }
    }
    return { x: 0, z: 0 };
  }

  // ------------------------------------------------------------ arazi
  buildTerrain() {
    const pos = new Float32Array(SEG * SEG * 18);
    const col = new Float32Array(SEG * SEG * 18);
    const H = this.H;
    let p = 0;
    const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      pos[p] = ax; pos[p + 1] = ay; pos[p + 2] = az;
      pos[p + 3] = bx; pos[p + 4] = by; pos[p + 5] = bz;
      pos[p + 6] = cx; pos[p + 7] = cy; pos[p + 8] = cz;
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const ky = ny / Math.sqrt(nx * nx + ny * ny + nz * nz);
      this.faceColor((ay + by + cy) / 3, ky, (ax + bx + cx) / 3, (az + bz + cz) / 3, COL);
      const j = 0.93 + Math.random() * 0.1;
      for (let k = 0; k < 3; k++) { col[p + k * 3] = COL.r * j; col[p + k * 3 + 1] = COL.g * j; col[p + k * 3 + 2] = COL.b * j; }
      p += 9;
    };
    for (let iz = 0; iz < SEG; iz++) {
      for (let ix = 0; ix < SEG; ix++) {
        const x0 = -HALF + ix * CELL, x1 = x0 + CELL, z0 = -HALF + iz * CELL, z1 = z0 + CELL;
        const h00 = H[iz * N + ix], h10 = H[iz * N + ix + 1], h01 = H[(iz + 1) * N + ix], h11 = H[(iz + 1) * N + ix + 1];
        tri(x0, h00, z0, x1, h11, z1, x1, h10, z0);
        tri(x0, h00, z0, x0, h01, z1, x1, h11, z1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.terrain = mesh;
  }

  faceColor(h, ky, x, z, out) {
    const C = World.C;
    if (h < -1.0) out.copy(C.wet);
    else if (h < 0.9) out.copy(C.sand);
    else if (ky < 0.78) out.copy(h > 14 ? C.rock2 : C.rock);
    else if (h > 14) out.copy(C.snow);
    else if (h > 10) out.copy(C.rock2).lerp(C.g2, 0.35);
    else {
      const v = this.noise(x * 0.035 + 300, z * 0.035 - 200);
      out.copy(v > 0.25 ? C.g2 : v < -0.3 ? C.g3 : C.g1);
      if (h < 1.6) out.lerp(C.sand, 0.4);
    }
  }

  // ------------------------------------------------------------ su
  buildWater() {
    const g = new THREE.PlaneGeometry(700, 700, 140, 140);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshPhongMaterial({ color: '#2b7bb0', specular: '#cfeaff', shininess: 80, transparent: true, opacity: 0.8, flatShading: true });
    const uTime = this.uTime;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wq = modelMatrix * vec4(position, 1.0);
        transformed.y += sin(wq.x * 0.11 + uTime * 1.2) * 0.16 + cos(wq.z * 0.13 + uTime * 0.9) * 0.13;`);
    };
    const w = new THREE.Mesh(g, m);
    w.position.y = WATER - 0.05;
    w.receiveShadow = true;
    this.group.add(w);
    this.water = w;
  }

  // ------------------------------------------------------------ ağaç/kaya/çalı
  buildNodes() {
    const rng = mulberry32((this.seed * 7919 + 13) >>> 0);
    const nodes = [];
    const sgrid = new Map();
    const caps = { tree: 260, rock: 90, bush: 70 }, counts = { tree: 0, rock: 0, bush: 0 };
    const near = (x, z, r) => {
      const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const arr = sgrid.get(key(cx + i, cz + j));
        if (arr) for (const n of arr) { const dx = n.x - x, dz = n.z - z; const rr = Math.max(r, n.sp); if (dx * dx + dz * dz < rr * rr) return true; }
      }
      return false;
    };
    const sx = this.spawn.x, sz = this.spawn.z;
    for (let i = 0; i < 5000; i++) {
      const x = (rng() * 2 - 1) * HALF * 0.96, z = (rng() * 2 - 1) * HALF * 0.96;
      const r1 = rng(), r2 = rng(), r3 = rng();
      const h = this.heightAt(x, z);
      if (h < 0.9) continue;
      if ((x - sx) * (x - sx) + (z - sz) * (z - sz) < 64) continue;
      const slope = this.slopeAt(x, z);
      const forest = this.noise(x * 0.026 + 500, z * 0.026 - 300) > 0;
      const tT = forest ? 0.6 : 0.07, rT = tT + (forest ? 0.08 : 0.1), bT = rT + (forest ? 0.12 : 0.09);
      let kind = null, cat = null;
      if (r1 < tT) { if (slope < 2.6 && h < 19) { kind = h > 10 || r2 < 0.5 ? 'pine' : 'oak'; cat = 'tree'; } }
      else if (r1 < rT) { if (h < 22) { kind = 'rock'; cat = 'rock'; } }
      else if (r1 < bT) { if (h < 12 && slope < 2) { kind = 'bush'; cat = 'bush'; } }
      if (!kind || counts[cat] >= caps[cat]) continue;
      const sp = kind === 'rock' ? 3.4 : kind === 'bush' ? 2.4 : 3.0;
      if (near(x, z, sp)) continue;
      counts[cat]++;
      const s = kind === 'rock' ? 0.75 + r3 * 0.95 : 0.8 + r3 * 0.55;
      const n = {
        id: nodes.length, kind, x, z, y: h, s, rot: r2 * Math.PI * 2, sp,
        maxHp: kind === 'bush' ? 3 : 12, hp: 0, alive: true,
        r: kind === 'rock' ? 1.05 * s : kind === 'bush' ? 0.8 * s : 0.42 * s,
        shake: 0, sdx: 0, sdz: 0, grow: 1, inst: 0, col: null,
      };
      n.hp = n.maxHp;
      nodes.push(n);
      const k2 = key(Math.floor(x / 6), Math.floor(z / 6));
      if (!sgrid.has(k2)) sgrid.set(k2, []);
      sgrid.get(k2).push(n);
    }
    this.nodes = nodes;

    // geometriler
    const GEO = {
      pineTrunk: new THREE.CylinderGeometry(0.2, 0.3, 1.8, 6).translate(0, 0.9, 0),
      pineLeaf: mergeGeos([
        new THREE.ConeGeometry(1.7, 2.4, 7).translate(0, 2.6, 0),
        new THREE.ConeGeometry(1.3, 2.0, 7).translate(0, 3.6, 0),
        new THREE.ConeGeometry(0.85, 1.7, 7).translate(0, 4.5, 0),
      ]),
      oakTrunk: new THREE.CylinderGeometry(0.25, 0.36, 2.2, 6).translate(0, 1.1, 0),
      oakLeaf: mergeGeos([
        new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.2, 0),
        new THREE.IcosahedronGeometry(1.2, 0).translate(0.95, 2.8, 0.3),
        new THREE.IcosahedronGeometry(1.1, 0).translate(-0.8, 3.0, -0.5),
        new THREE.IcosahedronGeometry(1.0, 0).translate(0.1, 4.1, -0.2),
      ]),
      rock: new THREE.DodecahedronGeometry(1, 0).scale(1.25, 0.8, 1.05).translate(0, 0.3, 0),
      bush: mergeGeos([
        new THREE.IcosahedronGeometry(0.8, 0).translate(0, 0.55, 0),
        new THREE.IcosahedronGeometry(0.6, 0).translate(0.5, 0.45, 0.2),
        new THREE.IcosahedronGeometry(0.55, 0).translate(-0.45, 0.4, -0.25),
      ]),
      berry: mergeGeos([[0.3, 1.15, 0.45], [-0.45, 0.9, 0.35], [0.75, 0.7, -0.1], [-0.2, 0.75, -0.7], [0.1, 1.3, -0.2], [-0.8, 0.6, -0.2], [0.55, 0.95, 0.5], [0.0, 0.6, 0.85]]
        .map(([x, y, z]) => new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(x, y, z))),
    };
    this.GEO = GEO;
    this.matTrunk = new THREE.MeshLambertMaterial({ color: '#5e4630', flatShading: true });
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    this.matWhite = white;
    const berryMat = new THREE.MeshLambertMaterial({ color: '#d42a44', flatShading: true, emissive: '#3a0008' });
    this.matBerry = berryMat;

    const kinds = { pine: [], oak: [], rock: [], bush: [] };
    for (const n of nodes) { n.inst = kinds[n.kind].length; kinds[n.kind].push(n); }
    const mk = (geo, count, material, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, material, Math.max(1, count));
      im.count = count;
      im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    this.im = {
      pineTrunk: mk(GEO.pineTrunk, kinds.pine.length, this.matTrunk),
      pineLeaf: mk(GEO.pineLeaf, kinds.pine.length, white),
      oakTrunk: mk(GEO.oakTrunk, kinds.oak.length, this.matTrunk),
      oakLeaf: mk(GEO.oakLeaf, kinds.oak.length, white),
      rock: mk(GEO.rock, kinds.rock.length, white),
      bush: mk(GEO.bush, kinds.bush.length, white),
      berry: mk(GEO.berry, kinds.bush.length, berryMat, false),
    };
    const pc = [new THREE.Color('#2f6b3a'), new THREE.Color('#285f34'), new THREE.Color('#3a7a40')];
    const oc = [new THREE.Color('#4c8a35'), new THREE.Color('#5a9a3a'), new THREE.Color('#41782e'), new THREE.Color('#c27a2a'), new THREE.Color('#d49a2a')];
    const rc = [new THREE.Color('#8b8b88'), new THREE.Color('#7b7a76'), new THREE.Color('#999890')];
    const bc = [new THREE.Color('#3f7d36'), new THREE.Color('#4a8c3c')];
    for (const n of kinds.pine) { n.col = pc[Math.floor(Math.random() * pc.length)]; this.im.pineLeaf.setColorAt(n.inst, n.col); }
    for (const n of kinds.oak) { n.col = oc[Math.random() < 0.1 ? 3 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3)]; this.im.oakLeaf.setColorAt(n.inst, n.col); }
    for (const n of kinds.rock) { n.col = rc[Math.floor(Math.random() * rc.length)]; this.im.rock.setColorAt(n.inst, n.col); }
    for (const n of kinds.bush) { n.col = bc[Math.floor(Math.random() * bc.length)]; this.im.bush.setColorAt(n.inst, n.col); }

    for (const n of nodes) {
      this.updateNode(n);
      // hedefleme ızgarası
      const k = key(Math.floor(n.x / GC), Math.floor(n.z / GC));
      if (!this.nodeGrid.has(k)) this.nodeGrid.set(k, []);
      this.nodeGrid.get(k).push(n);
      // çarpışma
      if (n.kind !== 'bush') { n.coll = { type: 'c', x: n.x, z: n.z, r: n.r, node: n }; this.addCollider(n.coll); }
    }
  }

  updateNode(n) {
    const im = this.im;
    let tx = 0, tz = 0;
    if (n.shake > 0) {
      const k = n.shake / 0.35;
      const w = Math.sin(this.time * 55) * 0.08 * k;
      tx = w * n.sdz; tz = -w * n.sdx;
    }
    TMP.position.set(n.x, n.y - 0.15, n.z);
    TMP.rotation.set(tx, n.rot, tz);
    const g = n.grow;
    if (n.kind === 'pine' || n.kind === 'oak') {
      const T = n.kind === 'pine' ? im.pineTrunk : im.oakTrunk;
      const L = n.kind === 'pine' ? im.pineLeaf : im.oakLeaf;
      if (n.alive) TMP.scale.set(n.s * g, n.s * g, n.s * g); else TMP.scale.set(n.s, n.s * 0.2, n.s);
      TMP.updateMatrix(); T.setMatrixAt(n.inst, TMP.matrix); T.instanceMatrix.needsUpdate = true;
      TMP.scale.setScalar(n.alive ? n.s * g : 0);
      TMP.updateMatrix(); L.setMatrixAt(n.inst, TMP.matrix); L.instanceMatrix.needsUpdate = true;
    } else if (n.kind === 'rock') {
      const k = n.alive ? n.s * (0.5 + 0.5 * n.hp / n.maxHp) * g : 0;
      TMP.scale.set(k, k, k);
      TMP.updateMatrix(); im.rock.setMatrixAt(n.inst, TMP.matrix); im.rock.instanceMatrix.needsUpdate = true;
    } else {
      TMP.scale.setScalar(n.s);
      TMP.updateMatrix(); im.bush.setMatrixAt(n.inst, TMP.matrix); im.bush.instanceMatrix.needsUpdate = true;
      TMP.scale.setScalar(n.alive ? n.s * g : 0);
      TMP.updateMatrix(); im.berry.setMatrixAt(n.inst, TMP.matrix); im.berry.instanceMatrix.needsUpdate = true;
    }
  }

  shakeNode(n, fromX, fromZ) {
    const dx = n.x - fromX, dz = n.z - fromZ, d = Math.hypot(dx, dz) || 1;
    n.sdx = dx / d; n.sdz = dz / d; n.shake = 0.35;
    this.active.add(n);
  }

  // Sunucudan gelen düğüm durumu
  setNodeState(id, hp, alive, fromX, fromZ, instant = false) {
    const n = this.nodes[id];
    if (!n) return;
    const was = n.alive;
    n.hp = hp; n.alive = !!alive;
    if (was && !n.alive) {
      if ((n.kind === 'pine' || n.kind === 'oak') && !instant) this.fellTree(n, fromX ?? n.x - 1, fromZ ?? n.z);
      if (n.kind === 'rock' && n.coll) n.coll.active = false;
      n.shake = 0;
    } else if (!was && n.alive) {
      n.grow = instant ? 1 : 0.02;
      if (!instant) this.active.add(n);
      if (n.coll) n.coll.active = true;
    }
    this.updateNode(n);
  }

  fellTree(n, fx, fz) {
    const pine = n.kind === 'pine';
    const outer = new THREE.Group();
    outer.position.set(n.x, n.y - 0.15, n.z);
    outer.rotation.y = Math.atan2(n.x - fx, n.z - fz);
    const inner = new THREE.Group(); outer.add(inner);
    const trunk = new THREE.Mesh(pine ? this.GEO.pineTrunk : this.GEO.oakTrunk, this.matTrunk);
    const lm = new THREE.MeshLambertMaterial({ color: n.col, flatShading: true, transparent: true });
    const leaves = new THREE.Mesh(pine ? this.GEO.pineLeaf : this.GEO.oakLeaf, lm);
    for (const m of [trunk, leaves]) { m.scale.setScalar(n.s); m.rotation.y = n.rot - outer.rotation.y; m.castShadow = true; inner.add(m); }
    this.group.add(outer);
    this.anims.push({ outer, inner, lm, t: 0, n, impact: false, h: (pine ? 4.2 : 3.4) * n.s });
  }

  // ------------------------------------------------------------ çimen
  buildGrass() {
    // her yaprak iki yönlü üçgen; normaller yukarı bakar ki arka yüz kararmasın
    const pos = [];
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3, cx = Math.cos(a) * 0.13, cz = Math.sin(a) * 0.13;
      const tx = cx * 0.3 + 0.05, tz = cz * 0.3;
      pos.push(-cx, 0, -cz, cx, 0, cz, tx, 0.48, tz);
      pos.push(cx, 0, cz, -cx, 0, -cz, tx, 0.48, tz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nrm = []; for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const uTime = this.uTime;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        transformed.x += sin(uTime * 1.8 + ph) * 0.12 * position.y;
        transformed.z += cos(uTime * 1.4 + ph) * 0.08 * position.y;
        #endif`);
    };
    const COUNT = 5000;
    const im = new THREE.InstancedMesh(g, m, COUNT);
    const cols = [new THREE.Color('#6fae4c'), new THREE.Color('#5e9c40'), new THREE.Color('#86bf5a'), new THREE.Color('#a3c45a')];
    const flowers = [new THREE.Color('#f2e14a'), new THREE.Color('#f5f5f5'), new THREE.Color('#c77ad8')];
    let c = 0;
    for (let i = 0; i < COUNT * 4 && c < COUNT; i++) {
      const x = (Math.random() * 2 - 1) * HALF * 0.9, z = (Math.random() * 2 - 1) * HALF * 0.9;
      const h = this.heightAt(x, z);
      if (h < 1.2 || h > 10 || this.slopeAt(x, z) > 2.2) continue;
      TMP.position.set(x, h - 0.05, z);
      TMP.rotation.set(0, Math.random() * 6.28, 0);
      const s = 0.7 + Math.random() * 0.8;
      TMP.scale.set(s, s * (0.8 + Math.random() * 0.6), s);
      TMP.updateMatrix();
      im.setMatrixAt(c, TMP.matrix);
      im.setColorAt(c, Math.random() < 0.03 ? flowers[Math.floor(Math.random() * 3)] : cols[Math.floor(Math.random() * 4)]);
      c++;
    }
    im.count = c;
    im.frustumCulled = false;
    this.group.add(im);
    this.grass = im;
  }

  // ------------------------------------------------------------ çarpışma
  addCollider(c) {
    if (c.active === undefined) c.active = true;
    const r = c.type === 'b' ? Math.hypot(c.hw, c.hd) : c.r;
    const x0 = Math.floor((c.x - r) / GC), x1 = Math.floor((c.x + r) / GC);
    const z0 = Math.floor((c.z - r) / GC), z1 = Math.floor((c.z + r) / GC);
    c.cells = [];
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = key(i, j);
      if (!this.colGrid.has(k)) this.colGrid.set(k, []);
      this.colGrid.get(k).push(c);
      c.cells.push(k);
    }
  }

  removeCollider(c) {
    if (!c || !c.cells) return;
    for (const k of c.cells) {
      const arr = this.colGrid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    c.cells = null;
  }

  collide(x, z, r, y) {
    let sid = 0;
    for (let it = 0; it < 2; it++) {
      const cx = Math.floor(x / GC), cz = Math.floor(z / GC);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const arr = this.colGrid.get(key(cx + i, cz + j));
        if (!arr) continue;
        for (const c of arr) {
          if (!c.active) continue;
          if (y !== undefined && c.yMax !== undefined && (y >= c.yMax - 0.3 || y + 1.7 <= c.yMin)) continue;
          if (c.type === 'c') {
            const dx = x - c.x, dz = z - c.z, m = r + c.r, d2 = dx * dx + dz * dz;
            if (d2 < m * m) {
              const d = Math.sqrt(d2) || 0.0001;
              x += (dx / d) * (m - d); z += (dz / d) * (m - d);
              if (c.sid) sid = c.sid;
            }
          } else {
            const cs = Math.cos(c.ry), sn = Math.sin(c.ry);
            const dx = x - c.x, dz = z - c.z;
            const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
            const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
            const ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
            if (d2 < r * r) {
              let px, pz;
              if (d2 > 1e-8) { const d = Math.sqrt(d2); px = (ex / d) * (r - d); pz = (ez / d) * (r - d); }
              else {
                const ox = c.hw - Math.abs(lx), oz = c.hd - Math.abs(lz);
                if (ox < oz) { px = (lx >= 0 ? 1 : -1) * (ox + r); pz = 0; } else { pz = (lz >= 0 ? 1 : -1) * (oz + r); px = 0; }
              }
              x += px * cs + pz * sn; z += -px * sn + pz * cs;
              if (c.sid) sid = c.sid;
            }
          }
        }
      }
    }
    return { x, z, sid };
  }

  overlaps(x, z, r) {
    const p = this.collide(x, z, r);
    return Math.abs(p.x - x) > 0.001 || Math.abs(p.z - z) > 0.001;
  }

  nodesNear(x, z, r) {
    const out = [];
    const x0 = Math.floor((x - r) / GC), x1 = Math.floor((x + r) / GC);
    const z0 = Math.floor((z - r) / GC), z1 = Math.floor((z + r) / GC);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const arr = this.nodeGrid.get(key(i, j));
      if (arr) for (const n of arr) out.push(n);
    }
    return out;
  }

  // ------------------------------------------------------------ güncelleme
  update(dt) {
    this.time += dt;
    this.uTime.value = this.time;
    for (const n of this.active) {
      let busy = false;
      if (n.shake > 0) { n.shake = Math.max(0, n.shake - dt); busy = busy || n.shake > 0; }
      if (n.grow < 1) { n.grow = Math.min(1, n.grow + dt * 0.5); busy = busy || n.grow < 1; }
      this.updateNode(n);
      if (!busy) this.active.delete(n);
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const FT = 1.6;
      if (a.t < FT) {
        const k = a.t / FT;
        a.inner.rotation.x = k * k * k * (Math.PI / 2) * 0.97;
      } else {
        a.inner.rotation.x = (Math.PI / 2) * 0.97;
        if (!a.impact) {
          a.impact = true;
          const ry = a.outer.rotation.y;
          if (this.onImpact) this.onImpact(a.n, a.n.x + Math.sin(ry) * a.h * 0.7, a.n.z + Math.cos(ry) * a.h * 0.7);
        }
        const k2 = (a.t - FT - 0.8) / 1.0;
        if (k2 > 0) { a.outer.position.y -= dt * 1.2; a.lm.opacity = Math.max(0, 1 - k2); }
        if (k2 >= 1) { this.group.remove(a.outer); a.lm.dispose(); this.anims.splice(i, 1); }
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    const seen = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      if (o.material && !seen.has(o.material)) { seen.add(o.material); o.material.dispose(); }
    });
    for (const g of Object.values(this.GEO)) g.dispose();
  }
}

World.C = {
  sand: new THREE.Color('#dccb8e'), wet: new THREE.Color('#a99863'),
  g1: new THREE.Color('#6aa84f'), g2: new THREE.Color('#5a9842'), g3: new THREE.Color('#82b957'),
  rock: new THREE.Color('#7f776b'), rock2: new THREE.Color('#948b7d'), snow: new THREE.Color('#eef3f6'),
};
