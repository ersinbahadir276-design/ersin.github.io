// Tüm 3B modeller kutulardan/primitiflerden kodla kurulur ve
// prosedürel olarak (kemik yerine pivot grupları ile) animasyonlanır.
import * as THREE from 'three';

const mats = new Map();
export function mat(color, extra) {
  const key = 'L' + color + (extra ? JSON.stringify(extra) : '');
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...(extra || {}) }); mats.set(key, m); }
  return m;
}
export function basic(color, extra) {
  const key = 'B' + color + (extra ? JSON.stringify(extra) : '');
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, ...(extra || {}) }); mats.set(key, m); }
  return m;
}

const geos = new Map();
function cachedGeo(key, make) {
  let g = geos.get(key);
  if (!g) { g = make(); geos.set(key, g); }
  return g;
}
export function boxGeo(w, h, d) { return cachedGeo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)); }

export function box(w, h, d, color, x = 0, y = 0, z = 0, material) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material || mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function meshOf(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- İNSAN
export function makeHumanoid({ skin = '#e2b48c', shirt = '#3a7bd5', pants = '#34384a', hair = '#3b2616', ghoul = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
  const chest = new THREE.Group(); hips.add(chest);

  chest.add(box(0.56, 0.62, 0.3, shirt, 0, 0.36, 0));
  chest.add(box(0.58, 0.1, 0.32, ghoul ? '#0d0a10' : '#4a3520', 0, 0.06, 0));
  if (!ghoul) chest.add(box(0.12, 0.08, 0.02, '#c9a24a', 0, 0.06, 0.165));

  const neck = new THREE.Group(); neck.position.y = 0.68; chest.add(neck);
  neck.add(box(0.4, 0.4, 0.38, skin, 0, 0.2, 0));
  if (!ghoul) {
    neck.add(box(0.43, 0.12, 0.42, hair, 0, 0.42, -0.01));
    neck.add(box(0.43, 0.26, 0.1, hair, 0, 0.3, -0.17));
    neck.add(box(0.06, 0.07, 0.02, '#1a1a1a', 0.09, 0.22, 0.195));
    neck.add(box(0.06, 0.07, 0.02, '#1a1a1a', -0.09, 0.22, 0.195));
    neck.add(box(0.12, 0.03, 0.02, '#8a5040', 0, 0.1, 0.195));
  } else {
    const eye = basic('#ff3b2a');
    neck.add(box(0.1, 0.05, 0.02, null, 0.09, 0.23, 0.195, eye));
    neck.add(box(0.1, 0.05, 0.02, null, -0.09, 0.23, 0.195, eye));
    neck.add(box(0.2, 0.05, 0.02, '#000000', 0, 0.09, 0.195));
    neck.add(box(0.46, 0.32, 0.44, '#120e16', 0, 0.36, -0.04));
    chest.add(box(0.62, 0.5, 0.08, '#120e16', 0, 0.32, -0.19));
  }

  const mkArm = (side) => {
    const a = new THREE.Group(); a.position.set(0.37 * side, 0.6, 0); chest.add(a);
    a.add(box(0.17, 0.32, 0.18, shirt, 0, -0.13, 0));
    a.add(box(0.15, ghoul ? 0.46 : 0.34, 0.15, skin, 0, ghoul ? -0.5 : -0.44, 0));
    return a;
  };
  const armL = mkArm(1), armR = mkArm(-1);
  const handR = new THREE.Group(); handR.position.set(0, ghoul ? -0.72 : -0.6, 0.03); armR.add(handR);

  const mkLeg = (side) => {
    const l = new THREE.Group(); l.position.set(0.14 * side, 0.92, 0); body.add(l);
    l.add(box(0.22, 0.62, 0.24, pants, 0, -0.31, 0));
    l.add(box(0.23, 0.3, 0.3, ghoul ? '#0d0a10' : '#3a2a1c', 0, -0.77, 0.03));
    return l;
  };
  const legL = mkLeg(1), legR = mkLeg(-1);

  const baseScale = ghoul ? 1.12 : 1;
  root.scale.setScalar(baseScale);
  return { kind: 'human', root, body, hips, chest, neck, armL, armR, handR, legL, legR, phase: Math.random() * 6, ghoul, itemId: null, item: null, deadT: 0, baseScale };
}

function atkArm(a) {
  if (a < 0.3) { const k = a / 0.3; return -3.1 * (1 - (1 - k) * (1 - k)); }
  if (a < 0.52) { const k = (a - 0.3) / 0.22; return lerp(-3.1, -0.35, k * k); }
  return lerp(-0.35, 0, (a - 0.52) / 0.48);
}

// s: {speed, air, swim, dead, attack (-1 ya da 0..1), eat (-1 ya da 0..1), time}
export function animateHumanoid(h, dt, s) {
  const k = Math.min(1, dt * 14);
  h.phase += dt * s.speed * 1.75;
  const amp = Math.min(1, s.speed / 5) * (s.speed > 7 ? 1.1 : 0.85);
  const sw = Math.sin(h.phase);
  let tLL = sw * amp * 0.85, tLR = -sw * amp * 0.85;
  let tAL = -sw * amp * 0.75, tAR = sw * amp * 0.75;
  let zAL = 0.07, zAR = -0.07;
  let lean = s.speed > 7 ? 0.2 : amp * 0.06;
  let twist = 0, headX = 0;
  const breath = Math.sin(s.time * 2.1 + h.phase) * 0.035 * (1 - Math.min(1, amp));
  zAL += breath; zAR -= breath;
  let hipY = 0.92 + Math.abs(Math.cos(h.phase)) * 0.07 * amp;

  if (s.swim) {
    const p = s.time * 4.5;
    tAL = -2.4 + Math.sin(p) * 0.9; tAR = -2.4 - Math.sin(p) * 0.9;
    zAL = 0.35; zAR = -0.35;
    tLL = Math.sin(p * 2) * 0.4; tLR = -Math.sin(p * 2) * 0.4;
    lean = 0.75; headX = -0.6;
  } else if (s.air) {
    tLL = -0.75; tLR = 0.3; zAL = 0.65; zAR = -0.65; tAL = -0.5; tAR = -0.5;
  }
  if (h.ghoul) {
    tAL = -1.45 + Math.sin(s.time * 3 + 1) * 0.16;
    tAR = -1.45 + Math.sin(s.time * 3) * 0.16;
    zAL = 0.12; zAR = -0.12;
    lean += 0.38; headX = -0.3;
  }

  h.legL.rotation.x = lerp(h.legL.rotation.x, tLL, k);
  h.legR.rotation.x = lerp(h.legR.rotation.x, tLR, k);
  h.armL.rotation.x = lerp(h.armL.rotation.x, tAL, k);
  h.armL.rotation.z = lerp(h.armL.rotation.z, zAL, k);

  if (s.attack >= 0 && s.attack <= 1) {
    h.armR.rotation.x = atkArm(s.attack);
    h.armR.rotation.z = -0.08;
    twist = Math.sin(s.attack * Math.PI) * 0.35;
    if (h.ghoul) h.armL.rotation.x = atkArm(Math.min(1, s.attack + 0.1));
  } else if (s.eat >= 0 && s.eat <= 1) {
    const e = Math.sin(s.eat * Math.PI);
    h.armR.rotation.x = lerp(0, -2.3, e) + Math.sin(s.time * 25) * 0.08 * e;
    h.armR.rotation.z = 0.55 * e;
  } else {
    h.armR.rotation.x = lerp(h.armR.rotation.x, tAR, k);
    h.armR.rotation.z = lerp(h.armR.rotation.z, zAR, k);
  }
  h.chest.rotation.x = lerp(h.chest.rotation.x, lean, k);
  h.chest.rotation.y = lerp(h.chest.rotation.y, twist, Math.min(1, dt * 25));
  h.neck.rotation.x = lerp(h.neck.rotation.x, headX, k);
  h.hips.position.y = hipY;

  h.deadT = lerp(h.deadT, s.dead ? 1 : 0, Math.min(1, dt * 5));
  h.body.rotation.x = -1.5 * h.deadT;
  h.body.position.y = 0.17 * h.deadT;

  if (h.item && h.item.userData.flame) {
    const f = h.item.userData.flame;
    f.scale.set(1 + Math.sin(s.time * 31) * 0.12, 1 + Math.sin(s.time * 23) * 0.22, 1 + Math.cos(s.time * 27) * 0.12);
  }
}

export function setHeld(h, id) {
  if (h.item) { h.handR.remove(h.item); h.item = null; }
  h.itemId = id || null;
  if (id) { h.item = makeItemModel(id); h.handR.add(h.item); }
}

// ---------------------------------------------------------------- DÖRT AYAKLILAR
const QUAD = {
  deer: { body: '#a8733f', belly: '#ead5b4', leg: '#7a5230', w: 0.48, h: 0.55, len: 1.25, legH: 0.85, legW: 0.11, neck: 0.55, head: [0.26, 0.28, 0.46] },
  wolf: { body: '#6d6d74', belly: '#bdbdc4', leg: '#55555c', w: 0.44, h: 0.46, len: 1.1, legH: 0.56, legW: 0.13, neck: 0.18, head: [0.3, 0.3, 0.44] },
  boar: { body: '#4f3626', belly: '#6d4d38', leg: '#3a281c', w: 0.62, h: 0.62, len: 1.15, legH: 0.38, legW: 0.16, neck: 0.04, head: [0.42, 0.42, 0.46] },
};

export function makeQuad(type) {
  const c = QUAD[type];
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const baseY = c.legH + c.h / 2;
  const torso = new THREE.Group(); torso.position.y = baseY; body.add(torso);
  torso.add(box(c.w, c.h, c.len, c.body));
  torso.add(box(c.w * 0.92, c.h * 0.3, c.len * 0.8, c.belly, 0, -c.h * 0.38, 0));

  const headG = new THREE.Group(); headG.position.set(0, c.h * 0.25, c.len / 2 - 0.05); torso.add(headG);
  if (c.neck > 0.1) headG.add(box(c.w * 0.45, c.neck, c.w * 0.5, c.body, 0, c.neck / 2, 0.06));
  const [hw, hh, hl] = c.head;
  const head = new THREE.Group(); head.position.set(0, c.neck, 0.08); headG.add(head);
  head.add(box(hw, hh, hl, c.body, 0, 0, hl * 0.35));
  head.add(box(0.02, 0.06, 0.06, '#111', hw / 2 + 0.005, hh * 0.15, hl * 0.45));
  head.add(box(0.02, 0.06, 0.06, '#111', -hw / 2 - 0.005, hh * 0.15, hl * 0.45));

  let tail;
  if (type === 'deer') {
    const ant = mat('#e0cfa8');
    for (const sd of [1, -1]) {
      const a = box(0.05, 0.42, 0.05, null, sd * 0.1, hh / 2 + 0.18, hl * 0.15, ant); a.rotation.z = -sd * 0.35; head.add(a);
      const b = box(0.04, 0.22, 0.04, null, sd * 0.2, hh / 2 + 0.3, hl * 0.25, ant); b.rotation.z = -sd * 0.9; b.rotation.x = 0.4; head.add(b);
      const e = box(0.06, 0.16, 0.1, c.body, sd * 0.17, hh / 2 + 0.02, 0); e.rotation.z = -sd * 0.8; head.add(e);
    }
    head.add(box(hw * 0.7, hh * 0.5, 0.14, '#3a2a1c', 0, -hh * 0.18, hl * 0.82));
    tail = new THREE.Group(); tail.position.set(0, c.h * 0.3, -c.len / 2); torso.add(tail);
    tail.add(box(0.1, 0.18, 0.08, '#f0e6d6', 0, -0.05, -0.03));
  } else if (type === 'wolf') {
    for (const sd of [1, -1]) head.add(box(0.08, 0.16, 0.06, c.body, sd * 0.09, hh / 2 + 0.08, hl * 0.1));
    head.add(box(hw * 0.6, hh * 0.48, 0.24, '#3a3a40', 0, -hh * 0.14, hl * 0.78));
    head.add(box(0.06, 0.05, 0.04, '#111', 0, -0.02, hl * 0.92));
    tail = new THREE.Group(); tail.position.set(0, c.h * 0.3, -c.len / 2); torso.add(tail);
    const tm = box(0.12, 0.12, 0.55, c.body, 0, 0, -0.25); tail.add(tm); tail.rotation.x = 0.5;
    torso.add(box(c.w * 1.05, c.h * 0.9, 0.3, '#5c5c63', 0, 0.04, c.len * 0.3));
  } else {
    head.add(box(hw * 0.62, hh * 0.45, 0.12, '#c48a7a', 0, -hh * 0.15, hl * 0.86));
    for (const sd of [1, -1]) {
      const t = box(0.045, 0.16, 0.045, '#f0ead8', sd * 0.14, -0.02, hl * 0.72); t.rotation.z = sd * 0.3; head.add(t);
      head.add(box(0.08, 0.12, 0.06, c.body, sd * 0.15, hh / 2 + 0.04, 0));
    }
    torso.add(box(0.1, 0.16, c.len * 0.85, '#2e1f15', 0, c.h / 2 + 0.06, 0));
    tail = new THREE.Group(); tail.position.set(0, c.h * 0.2, -c.len / 2); torso.add(tail);
    tail.add(box(0.05, 0.22, 0.05, c.body, 0, -0.1, -0.02));
  }

  const legs = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const l = new THREE.Group();
    l.position.set(sx * (c.w / 2 - c.legW / 2), c.legH, sz * (c.len / 2 - 0.16));
    l.add(box(c.legW, c.legH, c.legW, c.leg, 0, -c.legH / 2, 0));
    l.add(box(c.legW + 0.02, 0.08, c.legW + 0.04, '#1d1612', 0, -c.legH + 0.04, 0.01));
    body.add(l); legs.push(l);
  }
  return { kind: 'quad', type, root, body, torso, headG, head, tail, legs, baseY, headZ: headG.position.z, phase: Math.random() * 6, deadT: 0, seed: Math.random() * 10, baseScale: 1, w: c.w };
}

export function animateQuad(q, dt, s) {
  const k = Math.min(1, dt * 10);
  q.phase += dt * s.speed * 2.5;
  const amp = Math.min(1, s.speed / 3.5) * 0.7;
  const sw = Math.sin(q.phase);
  const [FL, FR, BL, BR] = q.legs;
  FL.rotation.x = lerp(FL.rotation.x, sw * amp, k);
  BR.rotation.x = lerp(BR.rotation.x, sw * amp, k);
  FR.rotation.x = lerp(FR.rotation.x, -sw * amp, k);
  BL.rotation.x = lerp(BL.rotation.x, -sw * amp, k);
  q.torso.position.y = q.baseY + Math.abs(Math.cos(q.phase)) * 0.06 * amp;
  q.torso.rotation.x = Math.sin(q.phase * 2) * 0.03 * amp;

  let hx = 0, hz = q.headZ;
  if (s.speed < 0.3 && q.type !== 'wolf' && Math.sin(s.time * 0.45 + q.seed) > 0.35) hx = 0.95; // otlama
  if (s.attack >= 0 && s.attack <= 1) {
    const a = Math.sin(s.attack * Math.PI);
    hz = q.headZ + a * 0.3; hx = q.type === 'boar' ? 0.35 * a : -0.35 * a;
  }
  q.headG.rotation.x = lerp(q.headG.rotation.x, hx, k);
  q.headG.position.z = lerp(q.headG.position.z, hz, Math.min(1, dt * 20));
  if (q.tail) q.tail.rotation.y = Math.sin(s.time * (q.type === 'wolf' ? 6 : 9) + q.seed) * (q.type === 'wolf' ? 0.35 : 0.5);

  q.deadT = lerp(q.deadT, s.dead ? 1 : 0, Math.min(1, dt * 5));
  q.body.rotation.z = 1.55 * q.deadT;
  q.body.position.x = q.baseY * q.deadT;
  q.body.position.y = (q.w / 2 - 0.05) * q.deadT;
}

// ---------------------------------------------------------------- EŞYA MODELLERİ (el)
const WOOD = '#8b5a2b', STONE = '#9d9d9d';
export function makeItemModel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'axe':
      g.add(box(0.06, 0.06, 0.75, WOOD, 0, 0, 0.25));
      g.add(box(0.07, 0.3, 0.2, STONE, 0, 0.09, 0.55));
      g.add(box(0.09, 0.09, 0.09, '#c9b27a', 0, 0, 0.55));
      break;
    case 'pick':
      g.add(box(0.06, 0.06, 0.75, WOOD, 0, 0, 0.25));
      g.add(box(0.07, 0.62, 0.09, STONE, 0, 0, 0.58));
      g.add(box(0.09, 0.09, 0.1, '#c9b27a', 0, 0, 0.58));
      break;
    case 'spear': {
      g.add(box(0.05, 0.05, 1.75, WOOD, 0, 0, 0.45));
      const tip = meshOf(cachedGeo('spearTip', () => new THREE.ConeGeometry(0.08, 0.32, 4)), mat('#b5b5b5'), 0, 0, 1.45);
      tip.rotation.x = Math.PI / 2; g.add(tip);
      g.add(box(0.08, 0.08, 0.1, '#c9b27a', 0, 0, 1.28));
      break;
    }
    case 'torch': {
      g.add(box(0.07, 0.6, 0.07, WOOD, 0, 0.2, 0.04));
      g.add(box(0.12, 0.14, 0.12, '#2a1d12', 0, 0.52, 0.04));
      const fl = new THREE.Group(); fl.position.set(0, 0.6, 0.04);
      fl.add(meshOf(cachedGeo('flameA', () => new THREE.ConeGeometry(0.11, 0.34, 5)), basic('#ff7a1a'), 0, 0.15, 0));
      fl.add(meshOf(cachedGeo('flameB', () => new THREE.ConeGeometry(0.065, 0.22, 5)), basic('#ffe066'), 0, 0.11, 0));
      fl.children.forEach((c) => (c.castShadow = false));
      g.add(fl); g.userData.flame = fl;
      g.rotation.x = 0.45;
      break;
    }
    case 'sword':
      g.add(box(0.06, 0.06, 0.24, '#2a1d2e', 0, 0, 0));
      g.add(box(0.32, 0.07, 0.07, '#6a4a8e', 0, 0, 0.14));
      g.add(box(0.05, 0.15, 0.95, null, 0, 0, 0.64, mat('#7a46c8', { emissive: '#3a1670' })));
      g.add(box(0.02, 0.05, 0.9, null, 0, 0.05, 0.64, basic('#e8d4ff')));
      break;
    case 'berry':
      g.add(box(0.1, 0.1, 0.1, '#c8263d', 0.04, 0, 0.05)); g.add(box(0.1, 0.1, 0.1, '#c8263d', -0.05, 0.03, 0.02));
      break;
    case 'meat': g.add(box(0.2, 0.15, 0.24, '#c94a55', 0, 0, 0.08)); break;
    case 'cooked': g.add(box(0.2, 0.15, 0.24, '#7a4422', 0, 0, 0.08)); break;
    case 'bandage': g.add(box(0.16, 0.16, 0.16, '#f0f0f0', 0, 0, 0.06)); break;
    case 'wood': g.add(box(0.13, 0.13, 0.42, WOOD, 0, 0, 0.12)); break;
    case 'stone': g.add(box(0.2, 0.16, 0.2, STONE, 0, 0, 0.06)); break;
    case 'fiber': g.add(box(0.06, 0.06, 0.3, '#6fa53e', 0, 0, 0.1)); break;
    case 'hide': g.add(box(0.3, 0.04, 0.3, '#c89a64', 0, 0, 0.1)); break;
    case 'essence': g.add(box(0.14, 0.14, 0.14, null, 0, 0, 0.08, basic('#b77bff'))); break;
    case 'armor': g.add(box(0.26, 0.26, 0.08, '#b07a48', 0, 0, 0.08)); break;
    default: g.add(box(0.24, 0.24, 0.24, '#9a6433', 0, 0, 0.1));
  }
  return g;
}

// ---------------------------------------------------------------- YAPILAR
const logGeo = () => cachedGeo('log', () => new THREE.CylinderGeometry(0.21, 0.21, 1, 6));
export function makeStructure(type) {
  const g = new THREE.Group();
  if (type === 'campfire') {
    const sg = cachedGeo('fireStone', () => new THREE.DodecahedronGeometry(0.2, 0));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = meshOf(sg, mat(i % 2 ? '#8a8a8a' : '#6f6f6f'), Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
      s.rotation.set(i, i * 2, 0); g.add(s);
    }
    const lg = cachedGeo('fireLog', () => new THREE.CylinderGeometry(0.08, 0.09, 1.05, 5));
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 4) * Math.PI * 2;
      const l = meshOf(lg, mat(i % 2 ? '#5a3a1e' : '#6b4421'), 0, 0.32, 0.22);
      l.rotation.x = -0.75;
      pivot.add(l);
      g.add(pivot);
    }
    g.add(box(0.7, 0.04, 0.7, null, 0, 0.03, 0, basic('#3a1408')));
    const fl = new THREE.Group(); fl.position.y = 0.1;
    const f1 = meshOf(cachedGeo('cfA', () => new THREE.ConeGeometry(0.34, 1.0, 6)), basic('#ff6a12'), 0, 0.5, 0);
    const f2 = meshOf(cachedGeo('cfB', () => new THREE.ConeGeometry(0.22, 0.72, 6)), basic('#ffb02a'), 0.06, 0.38, 0.04);
    const f3 = meshOf(cachedGeo('cfC', () => new THREE.ConeGeometry(0.13, 0.5, 5)), basic('#fff07a'), -0.04, 0.27, -0.03);
    [f1, f2, f3].forEach((f) => { f.castShadow = false; fl.add(f); });
    g.add(fl);
    g.userData.flames = fl;
  } else if (type === 'wall') {
    const lgeo = logGeo();
    for (let i = 0; i < 7; i++) {
      const x = -1.35 + i * 0.45;
      const h = 2.2 + (i % 2) * 0.25;
      const l = meshOf(lgeo, mat(i % 2 ? '#8b5a2b' : '#7a4c22'), x, h / 2, 0);
      l.scale.y = h; g.add(l);
      const tip = meshOf(cachedGeo('wallTip', () => new THREE.ConeGeometry(0.21, 0.35, 6)), mat('#a87a48'), x, h + 0.17, 0);
      g.add(tip);
    }
    for (const y of [0.6, 1.65]) {
      g.add(box(3.15, 0.18, 0.14, '#5e3b1a', 0, y, 0.23));
      g.add(box(3.15, 0.18, 0.14, '#5e3b1a', 0, y, -0.23));
    }
  } else if (type === 'spikes') {
    g.add(box(1.7, 0.1, 1.7, '#6b4421', 0, 0.05, 0));
    const sg = cachedGeo('spike', () => new THREE.ConeGeometry(0.08, 0.75, 5));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const s = meshOf(sg, mat('#d2ad74'), -0.55 + i * 0.55, 0.42, -0.55 + j * 0.55);
      s.rotation.set((j - 1) * 0.25, 0, -(i - 1) * 0.25);
      g.add(s);
    }
  } else if (type === 'bed') {
    g.add(box(0.95, 0.22, 2.0, '#2f6b4f', 0, 0.11, 0));
    g.add(box(0.97, 0.08, 1.0, '#3d8a65', 0, 0.25, 0.45));
    g.add(box(0.8, 0.16, 0.42, '#ece5d3', 0, 0.28, -0.72));
  }
  g.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; } });
  return g;
}

const ghostMats = {
  ok: new THREE.MeshBasicMaterial({ color: '#5dff7a', transparent: true, opacity: 0.42, depthWrite: false }),
  bad: new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.42, depthWrite: false }),
};
export function ghostify(g) {
  g.traverse((o) => { if (o.isMesh) { o.material = ghostMats.ok; o.castShadow = false; o.receiveShadow = false; } });
  g.userData.setValid = (v) => g.traverse((o) => { if (o.isMesh) o.material = v ? ghostMats.ok : ghostMats.bad; });
  return g;
}

// ---------------------------------------------------------------- YERDEKİ EŞYALAR
const DROP_COL = { wood: '#8b5a2b', stone: '#9d9d9d', fiber: '#6fa53e', berry: '#c8263d', meat: '#c94a55', cooked: '#7a4422', hide: '#c89a64', bandage: '#f0f0f0' };
export function makeDropModel(items) {
  const g = new THREE.Group();
  const keys = Object.keys(items);
  const inner = new THREE.Group(); g.add(inner);
  if (keys.length === 1 && keys[0] === 'essence') {
    const m = meshOf(cachedGeo('ess', () => new THREE.OctahedronGeometry(0.22, 0)), basic('#c08aff'), 0, 0.45, 0);
    inner.add(m);
    inner.add(meshOf(cachedGeo('ess2', () => new THREE.OctahedronGeometry(0.34, 0)), basic('#7a2fd0', { transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.45, 0));
  } else if (keys.length === 1 && DROP_COL[keys[0]]) {
    inner.add(box(0.32, 0.22, 0.32, DROP_COL[keys[0]], 0, 0.35, 0));
    inner.add(box(0.22, 0.16, 0.22, DROP_COL[keys[0]], 0.12, 0.55, -0.05));
  } else if (keys.length === 1) {
    const it = makeItemModel(keys[0]); it.position.y = 0.45; it.rotation.z = 0.6; inner.add(it);
  } else {
    const sack = meshOf(cachedGeo('sack', () => new THREE.IcosahedronGeometry(0.38, 0)), mat('#8a6a3a'), 0, 0.38, 0);
    sack.scale.y = 0.9; inner.add(sack);
    inner.add(box(0.16, 0.16, 0.16, '#6b4a22', 0, 0.78, 0));
    inner.add(box(0.06, 0.1, 0.06, '#c9b27a', 0, 0.68, 0));
  }
  g.userData.inner = inner;
  return g;
}
