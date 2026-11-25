// KAOS ADASI — Aşama 1: tek oyunculu karakter, kamera, hareket, animasyon, dokunmatik kontroller.
import * as THREE from 'three';
import { World, WATER } from './world.js';
import { Sky } from './sky.js';
import { Particles } from './fx.js';
import { loadAssets } from './assets.js';
import { Character, PLAYER_CLIPS, addHat, HATS } from './character.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { initAudio, sfx, setAmbience, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const DEBUG = new URLSearchParams(location.search).has('debug');
const COARSE = window.matchMedia && matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- sahne
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !COARSE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1600);
const sky = new Sky(scene);
if (COARSE) sky.sun.shadow.mapSize.set(1024, 1024);
const parts = new Particles(scene, 500, false);

const G = {
  mode: 'loading', assets: null, world: null, player: null, ch: null,
  yaw: 0, pitch: 0.28, camMode: 0, camD: 4.5, shake: 0, time: 0, hour: 10.5, last: performance.now(),
  name: 'Oyuncu', color: '#ff6b35', hat: 'parti',
};
window.KAOS = G;

const SEED_Q = parseInt(new URLSearchParams(location.search).get('seed'), 10);
G.world = new World(Number.isFinite(SEED_Q) ? SEED_Q : (Math.random() * 2 ** 31) >>> 0, scene);
const input = new Input(canvas, $('touch'));
input.enabled = false;
input.onLockChange = () => updatePause();
input.onModeChange = (on) => { updatePause(); if (on) showHint('Sol: hareket · Sağ: kamera'); };
let hintT = 0;
function showHint(t, ms = 6000) { const h = $('hint'); h.textContent = t; h.style.opacity = '0.8'; clearTimeout(hintT); hintT = setTimeout(() => { h.style.opacity = '0'; }, ms); }

// ---------------------------------------------------------------- yükleme & menü
const COLORS = ['#ff6b35', '#f7c548', '#4ecb71', '#33b5e5', '#9b6dff', '#ff5fa2', '#e9ecef', '#3d3d3d'];
function setupMenu() {
  try { const p = JSON.parse(localStorage.getItem('kaos.profile') || '{}'); if (p.name) G.name = p.name; if (COLORS.includes(p.color)) G.color = p.color; if (HATS.includes(p.hat)) G.hat = p.hat; } catch (e) { /* yok */ }
  $('nameIn').value = G.name === 'Oyuncu' ? '' : G.name;
  const cw = $('colors');
  COLORS.forEach((c) => {
    const d = document.createElement('button'); d.className = 'sw' + (c === G.color ? ' on' : ''); d.style.background = c; d.setAttribute('aria-label', 'Renk ' + c);
    d.onclick = () => { G.color = c; [...cw.children].forEach((x) => x.classList.toggle('on', x === d)); };
    cw.appendChild(d);
  });
  const hw = $('hats');
  const HAT_NAMES = { parti: 'Parti şapkası', boynuz: 'Boynuzlu miğfer', tac: 'Taç', tencere: 'Tencere', pervane: 'Pervaneli şapka', kovboy: 'Kovboy şapkası' };
  HATS.forEach((h) => {
    const d = document.createElement('button'); d.className = 'hatb' + (h === G.hat ? ' on' : ''); d.textContent = HAT_NAMES[h];
    d.onclick = () => { G.hat = h; [...hw.children].forEach((x) => x.classList.toggle('on', x === d)); };
    hw.appendChild(d);
  });
  $('btnPlay').onclick = () => {
    G.name = ($('nameIn').value.trim() || 'Kaosçu' + Math.floor(Math.random() * 90 + 10)).slice(0, 14);
    try { localStorage.setItem('kaos.profile', JSON.stringify({ name: G.name, color: G.color, hat: G.hat })); } catch (e) { /* yok */ }
    initAudio();
    startGame();
  };
}

loadAssets((p) => { $('loadBar').style.width = Math.round(p * 100) + '%'; }).then((a) => {
  G.assets = a;
  G.mode = 'menu';
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
}).catch((e) => {
  console.error(e);
  $('loadTxt').textContent = 'Modeller yüklenemedi. Sayfayı yenile.';
});

function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

function startGame() {
  const ch = new Character(G.assets.player, PLAYER_CLIPS);
  ch.paint({ M_Main: G.color, M_Joints: shade(G.color, 0.45) });
  addHat(ch, G.hat, G.color === '#f7c548' ? '#33b5e5' : '#f7c548');
  scene.add(ch.root);
  G.ch = ch;
  G.player = new Player(G.world, ch);
  G.yaw = Math.atan2(-G.player.x, -G.player.z);
  G.mode = 'play';
  input.enabled = true;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (COARSE) input.setTouchMode(true);
  input.requestLock();
  updatePause();
}

function updatePause() {
  const show = G.mode === 'play' && !input.touchMode && !input.locked && !DEBUG;
  $('pause').classList.toggle('hidden', !show);
}
$('pause').addEventListener('mousedown', (e) => { if (e.target.closest('.nolock')) return; input.requestLock(); });
$('muteBtn').onclick = () => { setMuted(!isMuted()); $('muteBtn').textContent = isMuted() ? 'Ses: kapalı' : 'Ses: açık'; };
$('sens').oninput = () => { input.sens = parseFloat($('sens').value); };

// ---------------------------------------------------------------- olaylar -> ses & efekt
function handleEvents() {
  const p = G.player;
  for (const e of p.events) {
    switch (e) {
      case 'step': sfx.step(); break;
      case 'jump': sfx.swing(0.6); dust(p, 6); break;
      case 'land': sfx.thud(0.35); dust(p, 12); G.shake = Math.max(G.shake, 0.08); break;
      case 'roll': sfx.swing(1); dust(p, 10); break;
      case 'attack': sfx.swing(1); break;
      case 'heavy': sfx.swing(1.2); setTimeout(() => { sfx.thud(0.5); dust(p, 14); G.shake = Math.max(G.shake, 0.15); }, 520); break;
      case 'splash': sfx.splash(); parts.emit(p.x, WATER, p.z, { n: 16, color: '#d8efff', spread: 0.8, speed: 3, up: 4, size: 0.12, life: 0.7 }); break;
      case 'hurt': sfx.hurt(); G.shake = 0.25; flash(); break;
      case 'die': sfx.die(); setTimeout(() => { $('dead').classList.remove('hidden'); }, 1200); break;
    }
  }
  p.events.length = 0;
}
function dust(p, n) { if (!p.swim) parts.emit(p.x, p.y + 0.1, p.z, { n, color: '#c9b48a', spread: 0.6, speed: 2.2, up: 1.5, size: 0.14, life: 0.6, grav: -4 }); }
function flash() { const h = $('hurt'); h.style.transition = 'none'; h.style.opacity = '1'; requestAnimationFrame(() => { h.style.transition = 'opacity 0.6s'; h.style.opacity = '0'; }); }
$('btnRespawn').onclick = () => { $('dead').classList.add('hidden'); G.player.respawn(); input.requestLock(); };

// ---------------------------------------------------------------- kamera
const camT = new THREE.Vector3();
// Kamera ile oyuncu arasında arazi varsa kamerayı yaklaştır (ağaç yaprakları kamerayı itmez)
function camBlock(t, dx, dy, dz, dist) {
  const W = G.world, steps = 10;
  for (let i = 2; i <= steps; i++) {
    const d = (dist * i) / steps, x = t.x + dx * d, y = t.y + dy * d, z = t.z + dz * d;
    if (y < W.heightAt(x, z) + 0.3) return Math.max(1.2, (dist * (i - 1)) / steps);
  }
  return dist;
}
function updateCamera(dt) {
  const p = G.player;
  G.yaw -= input.look.dx;
  G.pitch = clamp(G.pitch + input.look.dy, -0.5, 1.2);
  if (input.consume('camera')) G.camMode = (G.camMode + 1) % 3;
  const dist = [4.5, 7.5, 2.6][G.camMode];
  const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw), rx = -fz, rz = fx;
  const side = 0.45;
  const ty = p.y + (p.swim ? 1.2 : p.crouch ? 1.1 : p.state === 'dead' ? 0.7 : 1.55);
  camT.set(p.x + rx * side, lerp(camT.y || ty, ty, Math.min(1, dt * 12)), p.z + rz * side);
  const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
  const want = camBlock(camT, -fx * cp, sp, -fz * cp, dist);
  G.camD = want < G.camD ? want : lerp(G.camD, want, Math.min(1, dt * 3));
  const cx = camT.x - fx * G.camD * cp, cz = camT.z - fz * G.camD * cp;
  let cy = camT.y + G.camD * sp;
  const gh = Math.max(G.world.heightAt(cx, cz), WATER - 0.1) + 0.35;
  if (cy < gh) cy = gh;
  camera.position.set(cx, cy, cz);
  if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt); const s = G.shake * 0.5; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; }
  camera.lookAt(camT.x + fx * 1.5, camT.y, camT.z + fz * 1.5);
  const fov = p.sprinting && p.speed > 6 ? 68 : 60;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 6)); camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------- arayüz
const hud = { hp: $('hpBar'), st: $('stBar'), state: $('dbg') };
let fpsT = 0, fpsN = 0, fps = 0;
function updateHUD(dt) {
  const p = G.player;
  hud.hp.style.width = Math.max(0, p.hp) + '%';
  hud.st.style.width = p.stam + '%';
  hud.st.parentElement.classList.toggle('tired', p.exhausted);
  fpsT += dt; fpsN++;
  if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0; if (DEBUG || $('dbg').dataset.on) hud.state.textContent = `${fps} FPS · ${G.ch.status().name}`; }
}
$('dbg').onclick = () => { $('dbg').dataset.on = $('dbg').dataset.on ? '' : '1'; if (!$('dbg').dataset.on) $('dbg').textContent = 'FPS'; };

// ---------------------------------------------------------------- döngü
function step(dt) {
  G.time += dt;
  input.update(dt);
  G.player.update(dt, input, G.yaw);
  handleEvents();
  updateCamera(dt);
  G.world.update(dt);
  parts.update(dt);
  if (G.ch.hat && G.ch.hat.userData.spin) G.ch.hat.userData.spin.rotation.y += dt * (6 + G.player.speed * 4);
  sky.update(G.hour, camera, G.player);
  updateHUD(dt);
  input.endFrame();
}

function menuView(dt) {
  G.time += dt;
  const W = G.world, sp = W.spawn, h = W.heightAt(sp.x, sp.z), a = G.time * 0.05;
  camera.position.set(sp.x + Math.cos(a) * 40, h + 20, sp.z + Math.sin(a) * 40);
  camera.lookAt(sp.x, h + 3, sp.z);
  W.update(dt);
  sky.update(G.hour, camera, { x: sp.x, y: h, z: sp.z });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0001, (now - G.last) / 1000));
  G.last = now;
  if (G.mode === 'play') step(dt); else menuView(dt);
  renderer.render(scene, camera);
}

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
if (DEBUG) { window.KAOS_STEP = (n, dt = 1 / 30) => { for (let i = 0; i < n && G.mode === 'play'; i++) step(dt); }; window.KAOS_INPUT = input; }
setupMenu();
setAmbience(0);
requestAnimationFrame(frame);
