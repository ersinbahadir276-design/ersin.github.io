// Gökyüzü kubbesi, güneş/ay, yıldızlar, sis ve gün-gece ışığı.
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const K = [
  { h: 0, top: '#03060f', hor: '#0d1530', light: 0.0, hemi: 0.3, fogN: 18, fogF: 125 },
  { h: 4.6, top: '#03060f', hor: '#0d1530', light: 0.0, hemi: 0.3, fogN: 18, fogF: 125 },
  { h: 5.6, top: '#2b3a6b', hor: '#e3916a', light: 0.5, hemi: 0.5, fogN: 35, fogF: 200 },
  { h: 7.0, top: '#4b8ed8', hor: '#cfe4f4', light: 1.0, hemi: 0.95, fogN: 70, fogF: 320 },
  { h: 17.2, top: '#4b8ed8', hor: '#cfe4f4', light: 1.0, hemi: 0.95, fogN: 70, fogF: 320 },
  { h: 18.8, top: '#384d86', hor: '#f29b5c', light: 0.55, hemi: 0.6, fogN: 45, fogF: 240 },
  { h: 20.2, top: '#0b1026', hor: '#1d2650', light: 0.0, hemi: 0.33, fogN: 20, fogF: 140 },
  { h: 24, top: '#03060f', hor: '#0d1530', light: 0.0, hemi: 0.3, fogN: 18, fogF: 125 },
].map((k) => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor) }));

const VS = `varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
void main(){
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.4), 0.6)) : mix(horizon, bottom, min(1.0, -h * 5.0));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a2a, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 320;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog(0xcfe4f4, 70, 320);

    this.uni = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    dome.renderOrder = -10; dome.frustumCulled = false;
    scene.add(dome); this.dome = dome;

    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(38, 24), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false, depthWrite: false }));
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0xe6ecff, fog: false, depthWrite: false }));
    for (const d of [this.sunDisc, this.moonDisc]) { d.renderOrder = -9; d.frustumCulled = false; scene.add(d); }

    const sp = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.95 + 0.05;
      const r = Math.sqrt(1 - v * v);
      sp.push(Math.cos(u) * r * 900, v * 900, Math.sin(u) * r * 900);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -8; this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.dir = new THREE.Vector3();
    this.night = 0;
    this.tmpA = new THREE.Color(); this.tmpB = new THREE.Color();
    this.hemiBase = new THREE.Color(0xcfe6ff);
    this.sd = new THREE.Vector3();
  }

  update(hour, camera, focus) {
    let i = 0;
    while (i < K.length - 2 && hour >= K[i + 1].h) i++;
    const a = K[i], b = K[i + 1];
    const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h)));
    const top = this.tmpA.copy(a.top).lerp(b.top, t);
    const hor = this.tmpB.copy(a.hor).lerp(b.hor, t);
    const light = a.light + (b.light - a.light) * t;
    const hemi = a.hemi + (b.hemi - a.hemi) * t;
    this.uni.top.value.copy(top);
    this.uni.horizon.value.copy(hor);
    this.uni.bottom.value.copy(hor).multiplyScalar(0.55);
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = a.fogN + (b.fogN - a.fogN) * t;
    this.scene.fog.far = a.fogF + (b.fogF - a.fogF) * t;

    const ang = ((hour - 6) / 12) * Math.PI;
    const sx = Math.cos(ang), sy = Math.sin(ang);
    const day = sy > 0;
    if (day) this.dir.set(sx, sy, 0.35).normalize();
    else this.dir.set(-sx, -sy, 0.35).normalize();
    const elev = Math.abs(sy);
    if (day) {
      this.sun.intensity = 2.7 * Math.max(light, 0.25) * smooth(0, 0.14, elev);
      this.sun.color.setRGB(1, 0.72 + 0.26 * smooth(0, 0.45, elev), 0.5 + 0.42 * smooth(0, 0.45, elev));
    } else {
      this.sun.intensity = 0.55 * smooth(0, 0.14, elev);
      this.sun.color.set(0x8ea6ff);
    }
    this.hemi.intensity = hemi;
    this.hemi.color.copy(hor).lerp(this.hemiBase, 0.5);
    this.night = 1 - smooth(0.05, 0.6, light);

    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0, fy = focus ? focus.y : 0;
    this.sun.position.set(fx + this.dir.x * 140, fy + this.dir.y * 140, fz + this.dir.z * 140);
    this.sun.target.position.set(fx, fy, fz);

    const cp = camera.position;
    this.dome.position.copy(cp);
    this.stars.position.copy(cp);
    this.stars.material.opacity = this.night * 0.95;
    const sd = this.sd.set(sx, sy, 0.35).normalize();
    this.sunDisc.position.set(cp.x + sd.x * 880, cp.y + sd.y * 880, cp.z + sd.z * 880);
    this.sunDisc.lookAt(cp);
    this.sunDisc.material.color.setRGB(1, 0.75 + 0.2 * smooth(0, 0.4, sy), 0.45 + 0.4 * smooth(0, 0.4, sy));
    this.sunDisc.visible = sy > -0.12;
    this.moonDisc.position.set(cp.x - sd.x * 880, cp.y - sd.y * 880, cp.z - sd.z * 880);
    this.moonDisc.lookAt(cp);
    this.moonDisc.visible = sy < 0.12;
  }
}
