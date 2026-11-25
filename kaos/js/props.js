// Varil ve sandıkların ekrandaki hali (yuvarlanma, fitil yanıp sönmesi).
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

const geo = {
  barrel: new THREE.CylinderGeometry(0.4, 0.4, 0.85, 12),
  band: new THREE.CylinderGeometry(0.415, 0.415, 0.08, 12),
  crate: new THREE.BoxGeometry(0.82, 0.82, 0.82),
  plank: new THREE.BoxGeometry(0.86, 0.12, 0.86),
};
const mats = {
  barrel: new THREE.MeshLambertMaterial({ color: '#d1342b', emissive: '#000000' }),
  band: new THREE.MeshLambertMaterial({ color: '#ffd23f' }),
  crate: new THREE.MeshLambertMaterial({ color: '#b07a45', flatShading: true }),
  plank: new THREE.MeshLambertMaterial({ color: '#7a4f28', flatShading: true }),
  skull: new THREE.MeshBasicMaterial({ color: '#111111' }),
};

function makeProp(kind) {
  const root = new THREE.Group();
  const spin = new THREE.Group(); spin.position.y = kind === 0 ? 0.42 : 0.41; root.add(spin);
  const meshes = [];
  if (kind === 0) {
    const b = new THREE.Mesh(geo.barrel, mats.barrel.clone()); spin.add(b); meshes.push(b);
    for (const y of [-0.28, 0, 0.28]) { const r = new THREE.Mesh(geo.band, mats.band); r.position.y = y; spin.add(r); }
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.12, 3), mats.skull); s.position.set(0, 0.14, 0.41); spin.add(s);
  } else {
    const c = new THREE.Mesh(geo.crate, mats.crate); spin.add(c); meshes.push(c);
    for (const y of [-0.3, 0.3]) { const p = new THREE.Mesh(geo.plank, mats.plank); p.position.y = y; spin.add(p); }
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, spin, body: meshes[0] };
}

export class PropViews {
  constructor(scene) { this.scene = scene; this.list = new Map(); }
  apply(rows) {
    const seen = new Set();
    for (const r of rows) {
      const [id, kind, x, y, z, ry, roll, fl] = r;
      seen.add(id);
      let v = this.list.get(id);
      if (!v) { v = { id, kind, ...makeProp(kind), x, y, z, ry, roll, tx: x, ty: y, tz: z, try: ry, troll: roll, fl }; this.scene.add(v.root); this.list.set(id, v); }
      if (Math.hypot(x - v.x, z - v.z) > 6) { v.x = x; v.z = z; v.y = y; }
      v.tx = x; v.ty = y; v.tz = z; v.try = ry; v.troll = roll; v.fl = fl;
    }
    for (const [id, v] of this.list) if (!seen.has(id)) { this.scene.remove(v.root); this.list.delete(id); }
  }
  update(dt, time) {
    const k = Math.min(1, dt * 14);
    for (const v of this.list.values()) {
      v.x = lerp(v.x, v.tx, k); v.y = lerp(v.y, v.ty, k); v.z = lerp(v.z, v.tz, k);
      v.ry = lerpAngle(v.ry, v.try, k); v.roll = lerp(v.roll, v.troll, k);
      v.root.position.set(v.x, v.y, v.z);
      v.root.rotation.y = v.ry;
      v.spin.rotation.x = v.kind === 0 ? v.roll : v.roll * 0.25;
      if (v.kind === 0) v.body.material.emissive.setRGB((v.fl & 1) && Math.sin(time * 40) > 0 ? 0.9 : 0, (v.fl & 1) && Math.sin(time * 40) > 0 ? 0.8 : 0, 0);
    }
  }
  near(x, z, r) { let best = null, bd = r * r; for (const v of this.list.values()) { const d = (v.x - x) ** 2 + (v.z - z) ** 2; if (d < bd) { bd = d; best = v; } } return best; }
}
