// YABAN — ana oyun döngüsü, oyuncu, kamera, arayüz ve ağ mesajları.
import * as THREE from 'three';
import { World, HALF, WATER } from './world.js';
import { Sky } from './sky.js';
import { Particles, LightPool } from './fx.js';
import { makeHumanoid, animateHumanoid, makeQuad, animateQuad, makeStructure, makeDropModel, ghostify, setHeld } from './models.js';
import { ITEMS, RECIPES, toolOf, MOB_TYPES, MOB_NAMES, MOB_R, NODE_NAMES, STRUCTS, RESOURCE_ITEMS } from './items.js';
import { itemIcon } from './icons.js';
import { initAudio, sfx, att, setAmbience, setMuted, isMuted } from './audio.js';
import { Net } from './net.js';
import { Host, HOUR_SEC } from './host.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ================================================================ SAHNE
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600);
const sky = new Sky(scene);
const parts = new Particles(scene, 900, false);
const glow = new Particles(scene, 500, true);
const lightPool = new LightPool(scene, 4);

const G = {
  mode: 'menu', world: null, host: null, net: new Net(), myId: 'h', isHost: false,
  hour: 16.8, day: 1, time: 0, last: performance.now(),
  me: null, others: new Map(), mobs: new Map(), structs: new Map(), drops: new Map(),
  inv: new Array(10).fill(null), sel: 0, invDirty: true,
  yaw: 0, pitch: 0.32, camMode: 0, shake: 0, fov: 62,
  keys: {}, mouseDown: false, placeClick: false, locked: false, panel: false, chatOpen: false,
  bed: null, roomCode: null, name: 'Oyuncu', color: '#3a7bd5',
  ghost: null, ghostType: null, ghostValid: false, placeRot: 0,
  stats: { got: {}, made: {}, built: {}, kills: { animal: 0, ghoul: 0 }, ate: {}, deaths: 0 },
  taskIdx: 0, menuAng: 0, ambT: 0, sens: 1,
};
window.YABAN = G; // hata ayıklama için

const isNight = () => G.hour >= 20 || G.hour < 5;
const distTo = (x, z) => (G.me ? Math.hypot(x - G.me.x, z - G.me.z) : 0);

// ================================================================ DÜNYA
function makeWorld(seed) {
  if (G.world) G.world.dispose();
  G.world = new World(seed, scene);
  G.world.onImpact = (n, x, z) => {
    const v = att(distTo(n.x, n.z), 55);
    sfx.thud(v);
    parts.emit(x, n.y + 1.0, z, { n: 26, color: '#' + n.col.getHexString(), spread: 2.6, speed: 4, up: 3, life: 1.2, size: 0.22 });
    parts.emit(x, n.y + 0.3, z, { n: 10, color: '#8b6a44', spread: 2, speed: 2, up: 2, life: 1, size: 0.18 });
    if (G.me && distTo(x, z) < 12) G.shake = Math.max(G.shake, 0.15);
  };
}
makeWorld((Math.random() * 2 ** 31) >>> 0);

// ================================================================ PROFİL & MENÜ
const COLORS = ['#d94040', '#e08a2a', '#e6c62e', '#4caf50', '#2ea3a3', '#3a7bd5', '#8e5ad9', '#e05aa8'];
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('yaban.profile') || '{}');
    if (p.name) G.name = String(p.name).slice(0, 14);
    if (p.color) G.color = p.color;
  } catch (e) { /* depolama yok */ }
  if (!COLORS.includes(G.color)) G.color = COLORS[Math.floor(Math.random() * COLORS.length)];
}
function saveProfile() {
  try { localStorage.setItem('yaban.profile', JSON.stringify({ name: G.name, color: G.color })); } catch (e) { /* depolama yok */ }
}
function readName() {
  G.name = ($('nameIn').value.trim() || 'Yaban' + Math.floor(Math.random() * 90 + 10)).slice(0, 14);
  saveProfile();
}

function setupMenu() {
  loadProfile();
  $('nameIn').value = G.name === 'Oyuncu' ? '' : G.name;
  const cw = $('colors');
  COLORS.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'sw' + (c === G.color ? ' on' : '');
    d.style.background = c;
    d.onclick = () => { G.color = c; [...cw.children].forEach((x) => x.classList.toggle('on', x === d)); initAudio(); sfx.ui(); };
    cw.appendChild(d);
  });
  const q = new URLSearchParams(location.search);
  const oda = (q.get('oda') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (oda) {
    $('codeIn').value = oda;
    $('btnJoin').classList.add('pulse');
    $('menuMsg').style.color = '#ffd27a';
    $('menuMsg').textContent = 'Arkadaşın seni davet etti! Adını yaz ve Katıl\'a bas.';
  }
  $('btnHost').onclick = () => { readName(); startHost(); };
  $('btnJoin').onclick = () => {
    readName();
    const code = $('codeIn').value.trim().toUpperCase();
    if (code.length < 5) { $('menuMsg').style.color = ''; $('menuMsg').textContent = '5 haneli oda kodunu yaz.'; return; }
    startJoin(code);
  };
  $('codeIn').addEventListener('input', () => { $('codeIn').value = $('codeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoin').click(); });
  $('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') (oda ? $('btnJoin') : $('btnHost')).click(); });
  $('btnCancel').onclick = () => { location.href = location.pathname + location.search; };
  $('btnBack').onclick = () => { location.href = location.pathname; };
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) $('touchNote').classList.remove('hidden');
}

// ================================================================ OYUNA GİRİŞ
function startHost() {
  initAudio();
  G.isHost = true; G.myId = 'h';
  G.host = new Host(G);
  G.host.addPlayer('h', G.name, G.color);
  G.hour = G.host.hour; G.day = G.host.day;
  G.net.onPeerLeave = (pid) => { if (G.host) G.host.removePlayer(pid); };
  enterPlay();
  $('roomCode').textContent = '…';
  feed('Oda kuruluyor…');
  G.net.startHost((code) => {
    G.roomCode = code;
    $('roomCode').textContent = code;
    $('copyLink').classList.remove('hidden');
    feed(`Oda hazır! Kod: ${code} — arkadaşlarına gönder.`, 'good');
  }, () => {
    $('roomCode').textContent = 'ÇEVRİMDIŞI';
    $('copyLink').classList.add('hidden');
    feed('Bağlantı sunucusuna ulaşılamadı — şimdilik tek başına oynuyorsun.', 'warn');
  });
}

function startJoin(code) {
  initAudio();
  G.mode = 'joining';
  G.roomCode = code;
  $('loading').classList.remove('hidden');
  $('loadingTxt').textContent = `${code} odasına bağlanılıyor…`;
  G.net.join(code, (id) => {
    G.myId = id;
    $('loadingTxt').textContent = 'Dünya yükleniyor…';
    G.net.toHost({ t: 'hello', name: G.name, color: G.color });
  }, (msg) => {
    G.mode = 'menu';
    $('loading').classList.add('hidden');
    $('menuMsg').style.color = '';
    $('menuMsg').textContent = msg;
  }, onLost);
}

function onLost() {
  if (G.mode === 'play' || G.mode === 'joining') {
    G.mode = 'lost';
    $('loading').classList.add('hidden');
    $('lost').classList.remove('hidden');
    $('pause').classList.add('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
  }
}

function checkWelcome() {
  const q = G.net.clientQ;
  while (q.length) {
    const m = q.shift();
    if (m && m.t === 'welcome') { handleWelcome(m); return; }
    if (m && m.t === 'full') {
      G.mode = 'menu';
      $('loading').classList.add('hidden');
      $('menuMsg').textContent = 'Oda dolu (en fazla 8 oyuncu).';
      return;
    }
  }
}

function handleWelcome(w) {
  if (G.world.seed !== (w.seed >>> 0)) makeWorld(w.seed);
  G.hour = w.hour; G.day = w.day;
  for (const [id, hp, alive] of w.nodes) G.world.setNodeState(id, hp, alive, null, null, true);
  for (const s of w.structs) addStruct(s, false);
  for (const d of w.drops) addDrop(d);
  for (const p of w.players) if (p.id !== G.myId) addOther(p);
  $('roomCode').textContent = G.roomCode;
  enterPlay();
  const n = w.players.length - 1;
  feed(n > 0 ? `Odaya katıldın! Burada ${n} oyuncu daha var.` : 'Odaya katıldın!', 'good');
}

function enterPlay() {
  G.mode = 'play';
  $('menu').classList.add('hidden');
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');
  createMe();
  G.inv[9] = { id: 'berry', n: 4 };
  G.sel = 0;
  G.invDirty = true;
  renderTask(false);
  lockPointer();
  updatePause();
  setTimeout(() => announce('GÜN ' + G.day, 'Kaynak topla, gece çökmeden ateş yak!', 'day'), 500);
}

function lookFor(name, color) {
  let h = 7;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const skins = ['#f1c9a0', '#e2b48c', '#c98f62', '#a8704a', '#7a4e32'];
  const hairs = ['#2a1a10', '#3b2616', '#6b4423', '#b07a3a', '#d9b46a', '#1a1a1a', '#8a2a1a'];
  const pants = ['#34384a', '#3d3326', '#2d3e2f', '#4a3a5a', '#2a2a2a'];
  return { skin: skins[h % 5], hair: hairs[(h >>> 3) % 7], pants: pants[(h >>> 6) % 5], shirt: color };
}

function createMe() {
  const W = G.world, sp = W.spawn;
  const model = makeHumanoid(lookFor(G.name, G.color));
  scene.add(model.root);
  const x = sp.x + (Math.random() - 0.5) * 5, z = sp.z + (Math.random() - 0.5) * 5;
  G.me = {
    x, z, y: W.heightAt(x, z), vx: 0, vy: 0, vz: 0, ry: 0, speed: 0, onGround: true, swim: false,
    hp: 100, hunger: 100, thirst: 100, stam: 100, exhausted: false, dead: false, deadTimer: 0,
    atkT: -1, atkDur: 0.45, atkCd: 0, ac: 0, eatT: -1, model, stepD: 0, sendT: 0, drinkCd: 0, sprint: false,
  };
  G.yaw = Math.atan2(-x, -z);
}

// ================================================================ ENVANTER
function countIn(inv, id) { let c = 0; for (const s of inv) if (s && s.id === id) c += s.n; return c; }
function addTo(inv, id, n) {
  const st = (ITEMS[id] && ITEMS[id].stack) || 1;
  for (const s of inv) {
    if (n <= 0) break;
    if (s && s.id === id && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; }
  }
  for (let i = 0; i < inv.length && n > 0; i++) {
    if (!inv[i]) { const k = Math.min(n, st); inv[i] = { id, n: k }; n -= k; }
  }
  return n;
}
function removeFrom(inv, id, n) {
  for (let i = inv.length - 1; i >= 0 && n > 0; i--) {
    const s = inv[i];
    if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) inv[i] = null; }
  }
  return n;
}
function canAdd(inv, id, n) { const sim = inv.map((s) => s && { ...s }); return addTo(sim, id, n) === 0; }
function addItem(id, n) { const left = addTo(G.inv, id, n); G.invDirty = true; return left; }
function removeItem(id, n) { removeFrom(G.inv, id, n); G.invDirty = true; }
function hasItem(id) { return countIn(G.inv, id) > 0; }
function heldId() { const s = G.inv[G.sel]; return s ? s.id : null; }

function selectSlot(i) {
  if (G.sel === i) return;
  G.sel = i; G.invDirty = true;
  const id = heldId();
  showHeldName(id ? ITEMS[id].name : 'Boş el');
  sfx.ui();
}
let heldNameT = 0;
function showHeldName(t) {
  const e = $('heldName'); e.textContent = t; e.classList.add('show');
  clearTimeout(heldNameT); heldNameT = setTimeout(() => e.classList.remove('show'), 1400);
}

// ================================================================ OYUNCU
function updatePlayer(dt) {
  const me = G.me, W = G.world;
  const ctl = !me.dead && !G.chatOpen;
  me.atkCd -= dt; me.drinkCd -= dt;
  if (me.dead) {
    me.deadTimer -= dt;
    $('deadTimer').textContent = Math.max(0, Math.ceil(me.deadTimer));
    if (me.deadTimer <= 0) respawn();
  }

  let ix = 0, iz = 0;
  if (ctl) {
    if (G.keys.KeyW || G.keys.ArrowUp) iz += 1;
    if (G.keys.KeyS || G.keys.ArrowDown) iz -= 1;
    if (G.keys.KeyA || G.keys.ArrowLeft) ix -= 1;
    if (G.keys.KeyD || G.keys.ArrowRight) ix += 1;
  }
  const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw), rx = -fz, rz = fx;
  let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  if (me.stam <= 0.5) me.exhausted = true;
  if (me.exhausted && me.stam > 30) me.exhausted = false;
  const sprint = ctl && ml > 0 && (G.keys.ShiftLeft || G.keys.ShiftRight) && !me.exhausted;
  me.sprint = sprint;

  const groundH = W.heightAt(me.x, me.z);
  const floatY = WATER - 1.15;
  let speed = sprint ? 8.6 : 5.4;
  if (me.swim) speed *= 0.6;
  if (me.dead) speed = 0;
  const acc = me.onGround || me.swim ? 12 : 3;
  me.vx += (mx * speed - me.vx) * Math.min(1, acc * dt);
  me.vz += (mz * speed - me.vz) * Math.min(1, acc * dt);

  if (groundH < floatY && me.y <= floatY + 0.1) {
    if (!me.swim) { sfx.splash(); parts.emit(me.x, WATER, me.z, { n: 14, color: '#d8efff', spread: 0.8, speed: 3, up: 4, size: 0.12, life: 0.7 }); }
    me.swim = true; me.onGround = false; me.vy = 0;
    me.y = lerp(me.y, floatY + Math.sin(G.time * 2) * 0.05, Math.min(1, dt * 6));
  } else {
    me.swim = false;
    if (ctl && G.keys.Space && me.onGround) { me.vy = 8.5; me.onGround = false; me.y += 0.05; }
    if (me.onGround && me.vy <= 0 && me.y - groundH < 0.6) { me.y = groundH; me.vy = 0; }
    else {
      me.vy -= 25 * dt;
      me.y += me.vy * dt;
      if (me.y <= groundH) {
        if (me.vy < -17 && !me.dead) hurtSelf((-me.vy - 17) * 4, 'fall');
        me.y = groundH; me.vy = 0; me.onGround = true;
      } else me.onGround = false;
    }
  }

  let nx = me.x + me.vx * dt, nz = me.z + me.vz * dt;
  const c = W.collide(nx, nz, 0.38);
  nx = c.x; nz = c.z;
  for (const mb of G.mobs.values()) {
    if (mb.dying) continue;
    const dx = nx - mb.x, dz = nz - mb.z, m = 0.38 + mb.r, d2 = dx * dx + dz * dz;
    if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2); nx += (dx / d) * (m - d); nz += (dz / d) * (m - d); }
  }
  const rr = Math.hypot(nx, nz), lim = HALF - 8;
  if (rr > lim) { nx *= lim / rr; nz *= lim / rr; }
  const moved = Math.hypot(nx - me.x, nz - me.z);
  me.x = nx; me.z = nz;
  me.speed = moved / dt;

  const held = heldId(), hd = held && ITEMS[held];
  if (me.atkT >= 0 || (hd && hd.place)) me.ry = lerpAngle(me.ry, G.yaw, Math.min(1, dt * 18));
  else if (ml > 0.1 && !me.dead) me.ry = lerpAngle(me.ry, Math.atan2(mx, mz), Math.min(1, dt * 12));

  if (!me.dead) {
    if (sprint && me.speed > 1) me.stam -= 21 * dt;
    else me.stam += (me.swim ? -3 : ml > 0 ? 12 : 20) * dt;
    me.stam = clamp(me.stam, 0, 100);
    const k = sprint ? 1.6 : 1;
    me.hunger = Math.max(0, me.hunger - 0.16 * dt * k);
    me.thirst = Math.max(0, me.thirst - 0.22 * dt * k);
    let dhp = 0;
    if (me.hunger <= 0) dhp -= 1.2;
    if (me.thirst <= 0) dhp -= 1.6;
    if (me.swim && me.stam <= 0) dhp -= 9;
    if (me.hunger > 50 && me.thirst > 50) dhp += 0.5;
    if (nearestLitFire(6)) dhp += 1.3;
    me.hp = Math.min(100, me.hp + dhp * dt);
    if (me.hp <= 0) die(me.swim ? 'drown' : 'starve');
  }

  if (ctl && G.mouseDown && G.locked && !G.panel) useHeld();
  if (me.atkT >= 0) {
    const prev = me.atkT;
    me.atkT += dt / me.atkDur;
    if (prev < 0.4 && me.atkT >= 0.4) impact();
    if (me.atkT >= 1) me.atkT = -1;
  }
  if (me.eatT >= 0) { me.eatT += dt / 0.6; if (me.eatT >= 1) me.eatT = -1; }

  if (me.onGround && me.speed > 1) {
    me.stepD += moved;
    if (me.stepD > (sprint ? 2.5 : 1.9)) { me.stepD = 0; sfx.step(); }
  } else if (me.swim && me.speed > 1) {
    me.stepD += moved;
    if (me.stepD > 2.4) { me.stepD = 0; sfx.splash(0.35); parts.emit(me.x, WATER + 0.1, me.z, { n: 4, color: '#d8efff', spread: 0.6, speed: 1.5, up: 2, size: 0.1, life: 0.5 }); }
  }

  const M = me.model;
  M.root.position.set(me.x, me.y, me.z);
  M.root.rotation.y = me.ry;
  animateHumanoid(M, dt, { speed: me.dead ? 0 : me.speed, air: !me.onGround && !me.swim, swim: me.swim, dead: me.dead, attack: me.atkT, eat: me.eatT, time: G.time });
  if (M.itemId !== (held || null)) setHeld(M, held);
}

function hurtSelf(amt, src) { takeDamage(amt, 0, 0, src); }

function findTarget(reach) {
  const me = G.me, fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
  let best = null, bs = 1e9;
  for (const mb of G.mobs.values()) {
    if (mb.dying) continue;
    const dx = mb.x - me.x, dz = mb.z - me.z, d = Math.hypot(dx, dz);
    if (d - mb.r > reach || Math.abs(mb.y - me.y) > 3) continue;
    const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (dot < 0.5 && d > 1.2) continue;
    const s = d - dot * 1.5 - 1;
    if (s < bs) { bs = s; best = { kind: 'mob', mob: mb }; }
  }
  for (const n of G.world.nodesNear(me.x, me.z, reach + 2.5)) {
    if (!n.alive) continue;
    const dx = n.x - me.x, dz = n.z - me.z, d = Math.hypot(dx, dz);
    if (d - n.r > reach) continue;
    const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (dot < 0.35 && d > n.r + 0.6) continue;
    const s = d - n.r - dot * 1.5;
    if (s < bs) { bs = s; best = { kind: 'node', node: n }; }
  }
  return best;
}

function useHeld() {
  const me = G.me, id = heldId(), d = id && ITEMS[id];
  if (d && d.place) { if (!G.placeClick) { G.placeClick = true; tryPlace(); } return; }
  if (d && (d.food || d.heal)) { if (!G.placeClick && me.atkCd <= 0 && me.eatT < 0) { G.placeClick = true; consume(id); } return; }
  if (me.atkCd > 0 || me.atkT >= 0) return;
  const tool = toolOf(id);
  me.atkCd = tool.cd; me.atkT = 0; me.atkDur = Math.max(0.3, tool.cd * 0.85); me.ac++;
  me.ry = G.yaw;
  sfx.swing();
}

function impact() {
  const me = G.me, held = heldId(), tool = toolOf(held);
  const tg = findTarget(tool.reach);
  if (!tg) return;
  if (tg.kind === 'mob') {
    const mb = tg.mob;
    G.net.toHost({ t: 'hitMob', id: mb.id, tool: held || '' });
    mb.hitT = 0.18; mb.showHp = 4;
    const shadow = mb.type === 'ghoul' || mb.type === 'brute';
    parts.emit(mb.x, mb.y + (mb.type === 'brute' ? 2.4 : shadow ? 1.3 : 0.8), mb.z, { n: 9, color: shadow ? '#3a1a5a' : '#8a1a1a', speed: 3, up: 3, size: 0.12, life: 0.6 });
    sfx.hit();
    G.shake = Math.max(G.shake, 0.08);
  } else {
    const n = tg.node, W = G.world;
    const item = n.kind === 'rock' ? 'stone' : n.kind === 'bush' ? 'berry' : 'wood';
    if (!canAdd(G.inv, item, 1)) { feed('Envanterin dolu! [Q] ile bir şey bırak.', 'warn'); sfx.deny(); return; }
    G.net.toHost({ t: 'hitNode', id: n.id, tool: held || '' });
    W.shakeNode(n, me.x, me.z);
    nodeFx(n, 1);
  }
}

function nodeFx(n, v) {
  if (v < 0.02) return;
  if (n.kind === 'pine' || n.kind === 'oak') {
    parts.emit(n.x, n.y + 1.1, n.z, { n: 7, color: '#a0703c', spread: 0.6, speed: 3, up: 3, size: 0.12, life: 0.7 });
    parts.emit(n.x, n.y + 3.2 * n.s, n.z, { n: 5, color: '#' + n.col.getHexString(), spread: 2.2, speed: 1, up: 0.5, size: 0.16, life: 1.5, grav: -3 });
    sfx.chop(v);
  } else if (n.kind === 'rock') {
    parts.emit(n.x, n.y + 0.8 * n.s, n.z, { n: 8, color: '#a5a5a5', spread: 0.8, speed: 4, up: 3.5, size: 0.13, life: 0.6 });
    glow.emit(n.x, n.y + 0.8 * n.s, n.z, { n: 3, color: '#ffd27a', spread: 0.5, speed: 5, up: 3, life: 0.25, size: 0.05 });
    sfx.stone(v);
  } else {
    parts.emit(n.x, n.y + 0.7, n.z, { n: 8, color: '#4a8c3c', spread: 1, speed: 2, up: 2.5, size: 0.12, life: 0.8 });
    parts.emit(n.x, n.y + 0.9, n.z, { n: 3, color: '#d42a44', spread: 0.8, speed: 2, up: 2.5, size: 0.1, life: 0.6 });
    sfx.bush(v);
  }
}

function consume(id) {
  const me = G.me, d = ITEMS[id];
  if (d.heal && me.hp >= 99.5) { feed('Canın zaten dolu.'); return; }
  if (d.food && me.hunger >= 99 && !(d.food.thirst && me.thirst < 95)) { feed('Karnın tok.'); return; }
  removeItem(id, 1);
  me.eatT = 0; me.atkCd = 0.65;
  if (d.food) {
    me.hunger = Math.min(100, me.hunger + (d.food.hunger || 0));
    me.thirst = Math.min(100, me.thirst + (d.food.thirst || 0));
    if (d.food.hp) {
      me.hp = Math.min(100, me.hp + d.food.hp);
      if (d.food.hp < 0) { feed('Çiğ et midene dokundu! Ateşte pişirsen daha iyi.', 'warn'); floatText(String(d.food.hp), me.x, me.y + 2.2, me.z, 'bad'); }
      else floatText('+' + d.food.hp, me.x, me.y + 2.2, me.z, 'give');
    }
  }
  if (d.heal) { me.hp = Math.min(100, me.hp + d.heal); floatText('+' + d.heal, me.x, me.y + 2.2, me.z, 'give'); }
  G.stats.ate[id] = true;
  checkTasks();
  sfx.eat();
  const fx = Math.sin(me.ry), fz = Math.cos(me.ry);
  parts.emit(me.x + fx * 0.3, me.y + 1.5, me.z + fz * 0.3, { n: 5, color: id === 'berry' ? '#d42a44' : id === 'bandage' ? '#ffffff' : '#a0503a', spread: 0.2, speed: 1, up: 1.5, size: 0.06, life: 0.5 });
  if (me.hp <= 0) die('meat');
}

function tryPlace() {
  if (!G.ghost || !G.ghostValid) { sfx.deny(); return; }
  const id = heldId(), k = ITEMS[id].place;
  const p = G.ghost.position;
  removeItem(id, 1);
  G.net.toHost({ t: 'place', k, x: r2(p.x), z: r2(p.z), ry: r2(G.ghost.rotation.y) });
  G.stats.built[k] = true;
  checkTasks();
  if (k === 'bed') feed('Uyku tulumu kuruldu — artık burada doğacaksın.', 'good');
  if (k === 'campfire') feed('Ateş yandı! [E] ile odun atıp yakıtı artırabilirsin.', 'good');
}

function updateGhost() {
  const me = G.me, id = heldId(), d = id && ITEMS[id];
  const type = d && d.place && !me.dead ? d.place : null;
  if (type !== G.ghostType) {
    if (G.ghost) scene.remove(G.ghost);
    G.ghost = null; G.ghostType = type;
    if (type) { G.ghost = ghostify(makeStructure(type)); scene.add(G.ghost); }
  }
  if (!type) { G.ghostValid = false; return; }
  const W = G.world;
  const dist = type === 'wall' ? 3.2 : 2.6;
  const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
  const x = me.x + fx * dist, z = me.z + fz * dist;
  const y = W.heightAt(x, z);
  const ry = G.yaw + G.placeRot;
  G.ghost.position.set(x, y, z);
  G.ghost.rotation.y = ry;
  let ok = y >= 0.1 && Math.hypot(x, z) < HALF - 12;
  if (ok) {
    if (type === 'wall') {
      const cs = Math.cos(ry), sn = Math.sin(ry);
      for (const t of [-1.2, 0, 1.2]) if (W.overlaps(x + cs * t, z - sn * t, 0.32)) { ok = false; break; }
    } else if (W.overlaps(x, z, type === 'campfire' ? 0.9 : 0.6)) ok = false;
    for (const st of G.structs.values()) {
      if (st.k !== 'wall' && (st.x - x) ** 2 + (st.z - z) ** 2 < 1.6 * 1.6) { ok = false; break; }
    }
    if ((type === 'wall' || type === 'campfire') && (me.x - x) ** 2 + (me.z - z) ** 2 < 1.2) ok = false;
  }
  G.ghostValid = ok;
  G.ghost.userData.setValid(ok);
}

function nearWater() {
  const me = G.me, W = G.world;
  if (me.swim) return true;
  const fx = Math.sin(me.ry), fz = Math.cos(me.ry);
  for (const d of [0, 1, 2]) if (W.heightAt(me.x + fx * d, me.z + fz * d) < WATER - 0.15) return true;
  return false;
}
function nearestStruct(kind, r) {
  let best = null, bd = r * r;
  for (const st of G.structs.values()) {
    if (st.k !== kind) continue;
    const d = (st.x - G.me.x) ** 2 + (st.z - G.me.z) ** 2;
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}
function nearestLitFire(r) {
  let best = null, bd = r * r;
  for (const st of G.structs.values()) {
    if (st.k !== 'campfire' || !(st.fuel > 0)) continue;
    const d = (st.x - G.me.x) ** 2 + (st.z - G.me.z) ** 2;
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}

function interact() {
  const me = G.me;
  if (me.dead) return;
  if (nearWater()) {
    if (me.drinkCd > 0) return;
    me.drinkCd = 0.5;
    me.thirst = Math.min(100, me.thirst + 22);
    me.eatT = 0;
    sfx.drink();
    const fx = Math.sin(me.ry), fz = Math.cos(me.ry);
    parts.emit(me.x + fx * 1.2, WATER + 0.1, me.z + fz * 1.2, { n: 8, color: '#bfe4ff', spread: 0.5, speed: 1.5, up: 2.5, size: 0.09, life: 0.5 });
    return;
  }
  const f = nearestStruct('campfire', 3.2);
  if (f) {
    if (countIn(G.inv, 'wood') < 2) { feed('Ateşe atmak için 2 odun gerekli.', 'warn'); sfx.deny(); return; }
    removeItem('wood', 2);
    G.net.toHost({ t: 'fuel', id: f.id });
    f.fuel = Math.min(600, (f.fuel || 0) + 120);
    sfx.place(0.6);
    glow.emit(f.x, f.y + 0.6, f.z, { n: 16, color: '#ffb02a', spread: 0.5, speed: 2, up: 4, grav: -2, life: 0.9, size: 0.08 });
  }
}

function dropHeld() {
  const me = G.me, s = G.inv[G.sel];
  if (!s || me.dead) return;
  const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
  const x = me.x + fx * 1.8, z = me.z + fz * 1.8;
  G.inv[G.sel] = null; G.invDirty = true;
  G.net.toHost({ t: 'spill', x: r2(x), y: r2(Math.max(G.world.heightAt(x, z), WATER)), z: r2(z), items: { [s.id]: s.n } });
  sfx.place(0.4);
  feed(`${ITEMS[s.id].name}${s.n > 1 ? ' ×' + s.n : ''} yere bırakıldı.`);
}

// ================================================================ HASAR / ÖLÜM
const CAUSE = { brute: 'Dev Gölge seni ezip geçti.', ghoul: 'Bir Gölge seni parçaladı.', wolf: 'Kurtlara yem oldun.', boar: 'Yaban domuzu seni ezdi.', starve: 'Açlık ve susuzluk seni bitirdi.', drown: 'Boğuldun.', fall: 'Yüksekten düştün.', meat: 'Çiğ et seni zehirledi.' };

function takeDamage(amt, kx = 0, kz = 0, src = '') {
  const me = G.me;
  if (!me || me.dead) return;
  if (hasItem('armor')) amt *= 0.65;
  me.hp -= amt;
  me.vx += kx * 7; me.vz += kz * 7;
  if (me.onGround && (kx || kz)) { me.vy = 3.5; me.onGround = false; me.y += 0.05; }
  G.shake = Math.max(G.shake, 0.25);
  const h = $('hurt');
  h.style.transition = 'none'; h.style.opacity = '1';
  requestAnimationFrame(() => { h.style.transition = 'opacity 0.6s'; h.style.opacity = '0'; });
  sfx.hurt();
  floatText('-' + Math.round(amt), me.x, me.y + 2.2, me.z, 'bad');
  if (me.hp <= 0) die(src);
}

function die(src) {
  const me = G.me;
  if (me.dead) return;
  me.dead = true; me.hp = 0; me.deadTimer = 6; me.atkT = -1; G.mouseDown = false;
  const items = {};
  for (let i = 0; i < G.inv.length; i++) {
    const s = G.inv[i];
    if (s && RESOURCE_ITEMS.includes(s.id)) { items[s.id] = (items[s.id] || 0) + s.n; G.inv[i] = null; }
  }
  G.invDirty = true;
  G.net.toHost({ t: 'died', x: r2(me.x), y: r2(me.y), z: r2(me.z), items, by: src });
  $('deadCause').textContent = CAUSE[src] || 'Öldün.';
  $('deadInfo').textContent = Object.keys(items).length ? 'Kaynakların öldüğün yerde bir çantada kaldı — gidip geri alabilirsin!' : 'Aletlerin sende kaldı.';
  $('dead').classList.remove('hidden');
  if (G.panel) toggleCraft(false);
  sfx.die();
  G.stats.deaths++;
  updatePause();
}

function respawn() {
  const me = G.me, W = G.world;
  const p = G.bed && G.structs.has(G.bed.id) ? G.bed : W.spawn;
  me.x = p.x + (Math.random() - 0.5) * 2; me.z = p.z + (Math.random() - 0.5) * 2;
  me.y = W.heightAt(me.x, me.z) + 0.2;
  me.vx = me.vy = me.vz = 0;
  me.hp = 100; me.hunger = Math.max(me.hunger, 60); me.thirst = Math.max(me.thirst, 60); me.stam = 100;
  me.dead = false;
  $('dead').classList.add('hidden');
  feed(G.bed && G.structs.has(G.bed.id) ? 'Uyku tulumunda uyandın.' : 'Başlangıç noktasında uyandın.');
  updatePause();
}

// ================================================================ DİĞER OYUNCULAR
function addOther(p) {
  if (p.id === G.myId) return null;
  if (G.others.has(p.id)) {
    const o = G.others.get(p.id);
    if (p.name && p.name !== '…' && o.name === '…') { o.name = p.name; o.color = p.color; o.el.firstChild.textContent = p.name; o.el.firstChild.style.color = p.color; }
    return o;
  }
  const model = makeHumanoid(lookFor(p.name, p.color));
  scene.add(model.root);
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = `<span style="color:${esc(p.color)}">${esc(p.name)}</span><span class="hp"><i></i></span>`;
  $('labels').appendChild(el);
  const o = { id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, z: p.z, ry: 0, tx: p.x, ty: p.y, tz: p.z, try: 0, sp: 0, fl: 0, ac: -1, atkT: -1, hp: 100, model, el, hpEl: el.querySelector('.hp i') };
  G.others.set(p.id, o);
  return o;
}
function removeOther(id) {
  const o = G.others.get(id);
  if (!o) return;
  scene.remove(o.model.root);
  o.el.remove();
  G.others.delete(id);
}
function updateOthers(dt) {
  const k = Math.min(1, dt * 10);
  for (const o of G.others.values()) {
    o.x = lerp(o.x, o.tx, k); o.y = lerp(o.y, o.ty, k); o.z = lerp(o.z, o.tz, k);
    o.ry = lerpAngle(o.ry, o.try, k);
    if (o.atkT >= 0) { o.atkT += dt / 0.45; if (o.atkT >= 1) o.atkT = -1; }
    o.model.root.position.set(o.x, o.y, o.z);
    o.model.root.rotation.y = o.ry;
    animateHumanoid(o.model, dt, { speed: o.sp, air: !!(o.fl & 1), swim: !!(o.fl & 2), dead: !!(o.fl & 4), attack: o.atkT, eat: -1, time: G.time });
  }
}

// ================================================================ YARATIKLAR
function createMob(id, type, x, y, z, ry, ac) {
  let model;
  if (type === 'ghoul') model = makeHumanoid({ ghoul: true, skin: '#2e2638', shirt: '#1b1622', pants: '#141018' });
  else if (type === 'brute') { model = makeHumanoid({ ghoul: true, skin: '#3b1d2c', shirt: '#24101a', pants: '#160910' }); model.baseScale = 1.9; model.root.scale.setScalar(1.9); }
  else model = makeQuad(type);
  model.root.position.set(x, y, z);
  model.root.rotation.y = ry;
  scene.add(model.root);
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = '<div class="mobhp"><i></i></div>';
  el.style.display = 'none'; el._vis = false;
  $('labels').appendChild(el);
  const mb = { id, type, x, y, z, ry, tx: x, ty: y, tz: z, try: ry, sp: 0, ac, atkT: -1, hp: 1, maxHp: 1, model, r: MOB_R[type], dying: false, dieT: 0, hitT: 0, burn: 0, el, hpEl: el.querySelector('i'), showHp: 0, soundT: 2 + Math.random() * 6 };
  G.mobs.set(id, mb);
  if (type === 'ghoul' || type === 'brute') {
    parts.emit(x, y + 0.5, z, { n: 14, color: '#1a1022', spread: 1, speed: 1.5, up: 2.5, grav: 1, life: 1.2, size: 0.35, grow: true });
    glow.emit(x, y + 1, z, { n: 8, color: '#8a3aff', spread: 0.8, speed: 2, up: 2, grav: 0, life: 0.8, size: 0.1 });
  }
  return mb;
}
function killMobVisual(mb) {
  mb.dying = true; mb.dieT = 0;
  mb.el.style.display = 'none'; mb.el._vis = false;
  const v = att(distTo(mb.x, mb.z), 45);
  if (mb.type === 'ghoul' || mb.type === 'brute') {
    parts.emit(mb.x, mb.y + 1, mb.z, { n: 22, color: '#1a1022', spread: 1.2, speed: 2, up: 2.5, grav: 1.2, life: 1.4, size: 0.4, grow: true });
    glow.emit(mb.x, mb.y + 1.2, mb.z, { n: 16, color: mb.burn ? '#ff8a2a' : '#9a4aff', spread: 0.8, speed: 3, up: 3, grav: 0, life: 0.9, size: 0.1 });
    sfx.burn(v);
  } else {
    sfx.hit(v);
  }
}
function removeMob(id) {
  const mb = G.mobs.get(id);
  if (!mb) return;
  scene.remove(mb.model.root);
  mb.el.remove();
  G.mobs.delete(id);
}
function updateMobs(dt) {
  const k = Math.min(1, dt * 10);
  for (const mb of [...G.mobs.values()]) {
    if (!mb.dying) {
      mb.x = lerp(mb.x, mb.tx, k); mb.y = lerp(mb.y, mb.ty, k); mb.z = lerp(mb.z, mb.tz, k);
      mb.ry = lerpAngle(mb.ry, mb.try, k);
    } else {
      mb.dieT += dt;
      const shadow = mb.type === 'ghoul' || mb.type === 'brute';
      if (shadow && mb.dieT > 0.6) mb.y -= dt * 2.5;
      else if (mb.dieT > 2.6) mb.y -= dt * 0.8;
      if (mb.dieT > (shadow ? 1.8 : 3.6)) { removeMob(mb.id); continue; }
    }
    if (mb.atkT >= 0) { mb.atkT += dt / 0.4; if (mb.atkT > 1) mb.atkT = -1; }
    const M = mb.model;
    M.root.position.set(mb.x, mb.y, mb.z);
    M.root.rotation.y = mb.ry;
    mb.hitT = Math.max(0, mb.hitT - dt);
    M.root.scale.setScalar(M.baseScale * (1 + mb.hitT * 0.9));
    const st = { speed: mb.dying ? 0 : mb.sp, attack: mb.atkT, dead: mb.dying, time: G.time, air: false, swim: false, eat: -1 };
    if (M.kind === 'quad') animateQuad(M, dt, st); else animateHumanoid(M, dt, st);
    if (mb.burn && !mb.dying && Math.random() < dt * 16) {
      glow.emit(mb.x, mb.y + 1.1, mb.z, { n: 1, color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd23a', spread: 0.6, speed: 0.4, up: 2, grav: 0, life: 0.6, size: 0.14 });
      parts.emit(mb.x, mb.y + 1.6, mb.z, { n: 1, color: '#2a2a2a', spread: 0.4, speed: 0.3, up: 1.4, grav: 0.5, life: 1.4, size: 0.3, grow: true });
    }
    mb.soundT -= dt;
    if (mb.soundT <= 0 && !mb.dying) {
      mb.soundT = 3 + Math.random() * 6;
      const d = distTo(mb.x, mb.z);
      if (mb.type === 'brute' && d < 60) { sfx.growl(att(d, 60)); sfx.growl(att(d, 60) * 0.7); }
      else if (mb.type === 'ghoul' && d < 35) sfx.growl(att(d, 35));
      else if (mb.type === 'wolf' && isNight() && Math.random() < 0.2) sfx.howl(att(d, 110));
    }
    mb.showHp -= dt;
  }
}

// ================================================================ YAPILAR & YERDEKİ EŞYALAR
function addStruct(s, fresh) {
  if (G.structs.has(s.id) || !STRUCTS[s.k]) return;
  const model = makeStructure(s.k);
  model.position.set(s.x, s.y, s.z);
  model.rotation.y = s.ry;
  scene.add(model);
  const st = { ...s, model, col: null, flick: Math.random() * 10 };
  if (s.k === 'wall') { st.col = { type: 'b', x: s.x, z: s.z, hw: 1.6, hd: 0.27, ry: s.ry, sid: s.id }; G.world.addCollider(st.col); }
  else if (s.k === 'campfire') { st.col = { type: 'c', x: s.x, z: s.z, r: 0.75, sid: s.id }; G.world.addCollider(st.col); }
  G.structs.set(s.id, st);
  if (s.k === 'bed' && s.owner === G.myId) G.bed = st;
  if (fresh) {
    parts.emit(s.x, s.y + 0.3, s.z, { n: 14, color: '#b08a5a', spread: 1.2, speed: 2.5, up: 2, life: 0.7, size: 0.15 });
    sfx.place(att(distTo(s.x, s.z), 40));
  }
}
function updateStruct(m) {
  const st = G.structs.get(m.id);
  if (!st) return;
  if (m.hp !== undefined) {
    if (m.hp < st.hp) {
      parts.emit(st.x, st.y + 1, st.z, { n: 6, color: st.k === 'spikes' ? '#d2ad74' : '#8b5a2b', spread: 1, speed: 2.5, up: 2.5, life: 0.6, size: 0.13 });
      if (st.k === 'wall') sfx.chop(att(distTo(st.x, st.z), 35));
    }
    st.hp = m.hp;
  }
  if (m.fuel !== undefined) st.fuel = m.fuel;
}
function removeStruct(id, fx) {
  const st = G.structs.get(id);
  if (!st) return;
  scene.remove(st.model);
  if (st.col) G.world.removeCollider(st.col);
  G.structs.delete(id);
  if (fx) {
    parts.emit(st.x, st.y + 0.8, st.z, { n: 24, color: '#8b5a2b', spread: 1.6, speed: 3.5, up: 3, life: 1, size: 0.2 });
    sfx.thud(att(distTo(st.x, st.z), 40));
  }
  if (G.bed === st) { G.bed = null; feed('Uyku tulumun yok edildi!', 'warn'); }
}
function updateStructs(dt) {
  for (const st of G.structs.values()) {
    if (st.k !== 'campfire') continue;
    if (st.fuel > 0) st.fuel = Math.max(0.5, st.fuel - dt);
    const fl = st.model.userData.flames;
    const lit = st.fuel > 0;
    fl.visible = lit;
    if (!lit) continue;
    st.flick += dt;
    const t = st.flick;
    fl.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 17) * 0.16 + Math.sin(t * 7) * 0.08, 1 + Math.cos(t * 11) * 0.08);
    fl.rotation.y += dt * 1.5;
    if (Math.random() < dt * 7) glow.emit(st.x, st.y + 0.6, st.z, { n: 1, color: Math.random() < 0.5 ? '#ffb02a' : '#ff6a12', spread: 0.4, speed: 0.4, up: 2.2, grav: 0.5, life: 1.1, size: 0.07 });
    if (Math.random() < dt * 2.5) parts.emit(st.x, st.y + 1.3, st.z, { n: 1, color: '#5a5a5a', spread: 0.3, speed: 0.3, up: 1.4, grav: 0.3, life: 2.2, size: 0.3, grow: true });
  }
}

function addDrop(d) {
  if (G.drops.has(d.id)) return;
  const model = makeDropModel(d.items);
  model.position.set(d.x, d.y, d.z);
  scene.add(model);
  G.drops.set(d.id, { ...d, model, pend: d.by === G.myId ? 2.5 : 0, t: Math.random() * 6 });
}
function removeDrop(id) {
  const d = G.drops.get(id);
  if (!d) return;
  scene.remove(d.model);
  G.drops.delete(id);
}
function updateDrops(dt) {
  const me = G.me;
  for (const d of G.drops.values()) {
    d.t += dt;
    const inner = d.model.userData.inner;
    inner.rotation.y = d.t * 1.5;
    inner.position.y = Math.sin(d.t * 2.5) * 0.08;
    d.pend -= dt;
    if (me.dead || d.pend > 0) continue;
    if ((d.x - me.x) ** 2 + (d.z - me.z) ** 2 < 2.6 && Math.abs(d.y - me.y) < 2.5) {
      if (!Object.entries(d.items).some(([id]) => canAdd(G.inv, id, 1))) { d.pend = 3; feed('Envanterin dolu!', 'warn'); continue; }
      G.net.toHost({ t: 'pick', id: d.id });
      d.pend = 1.5;
    }
  }
}

// ================================================================ AĞ MESAJLARI
function pumpNet() {
  const hq = G.net.hostQ;
  if (hq.length) {
    const batch = hq.splice(0, hq.length);
    if (G.host) for (const [pid, m] of batch) { try { G.host.onMsg(pid, m); } catch (e) { console.error(e); } }
  }
  const cq = G.net.clientQ;
  while (cq.length && G.mode === 'play') {
    const m = cq.shift();
    try { onClientMsg(m); } catch (e) { console.error(e); }
  }
}

function onClientMsg(m) {
  if (!m || typeof m !== 'object') return;
  const W = G.world;
  switch (m.t) {
    case 'snap': applySnap(m); break;
    case 'join': addOther(m.p); feed(`${m.p.name} oyuna katıldı`, 'good'); sfx.task(); break;
    case 'leave': removeOther(m.id); feed(`${m.name} oyundan ayrıldı`); break;
    case 'node': {
      const n = W.nodes[m.id];
      if (!n) break;
      const v = att(distTo(n.x, n.z), 45);
      if (m.by && m.by !== G.myId && n.alive) { W.shakeNode(n, m.x, m.z); nodeFx(n, v); }
      if (n.alive && !m.alive) {
        if (n.kind === 'pine' || n.kind === 'oak') sfx.creak(att(distTo(n.x, n.z), 50));
        if (n.kind === 'rock') { parts.emit(n.x, n.y + 0.6, n.z, { n: 18, color: '#9a9a9a', spread: 1.5, speed: 4, up: 4, size: 0.25, life: 1 }); sfx.thud(v * 0.6); }
      }
      W.setNodeState(m.id, m.hp, m.alive, m.x, m.z);
      break;
    }
    case 'give': onGive(m); break;
    case 'mhit': {
      const mb = G.mobs.get(m.id);
      if (!mb) break;
      mb.hp = m.hp; mb.hitT = 0.18; mb.showHp = 4;
      if (m.by !== G.myId) {
        parts.emit(mb.x, mb.y + 0.9, mb.z, { n: 6, color: mb.type === 'ghoul' || mb.type === 'brute' ? '#3a1a5a' : '#8a1a1a', speed: 3, up: 3, size: 0.12, life: 0.6 });
        sfx.hit(att(distTo(mb.x, mb.z), 35));
      }
      if (m.by === G.myId || !m.by) floatText('-' + m.dmg, mb.x, mb.y + (mb.type === 'brute' ? 4 : mb.type === 'ghoul' ? 2.4 : 1.8), mb.z, 'dmg');
      break;
    }
    case 'mdie': {
      const mb = G.mobs.get(m.id);
      if (mb) killMobVisual(mb);
      if (m.by === G.myId) {
        if (m.type === 'ghoul') G.stats.kills.ghoul++;
        else if (m.type === 'brute') { G.stats.kills.ghoul++; G.stats.kills.brute = (G.stats.kills.brute || 0) + 1; }
        else G.stats.kills.animal++;
        checkTasks();
      }
      if (m.type === 'brute') {
        announce('DEV GÖLGE YIKILDI!', 'Özünü toplamayı unutma.', 'day');
        sfx.task();
      }
      break;
    }
    case 'mgone': removeMob(m.id); break;
    case 'drop': addDrop(m.d); break;
    case 'dropDel': removeDrop(m.id); break;
    case 'struct': addStruct(m.s, true); break;
    case 'sup': updateStruct(m); break;
    case 'sdel': removeStruct(m.id, true); break;
    case 'dmg': takeDamage(m.amt, m.kx, m.kz, m.src); break;
    case 'chat': addChat(m.name, m.color, m.text); break;
    case 'sys': feed(m.text); break;
    case 'ev': onEvent(m); break;
  }
}

function onGive(m) {
  const me = G.me;
  let any = false, row = 0;
  for (const [id, n] of Object.entries(m.items || {})) {
    if (!ITEMS[id]) continue;
    const left = addItem(id, n);
    const got = n - left;
    if (got > 0) {
      floatText(`+${got} ${ITEMS[id].name}`, me.x, me.y + 2.2 + row * 0.35, me.z, 'give');
      row++;
      G.stats.got[id] = (G.stats.got[id] || 0) + got;
      any = true;
    }
    if (left > 0) {
      G.net.toHost({ t: 'spill', x: r2(me.x), y: r2(me.y), z: r2(me.z), items: { [id]: left } });
      feed('Envanterin dolu! Bazı eşyalar yere düştü.', 'warn');
    }
  }
  if (m.pick) sfx.pickup();
  if (any) checkTasks();
}

function applySnap(m) {
  let dh = m.h - G.hour;
  if (dh > 12) dh -= 24;
  if (dh < -12) dh += 24;
  if (Math.abs(dh) > 0.08) G.hour = m.h;
  G.day = m.d;
  for (const a of m.p) {
    const [id, x, y, z, ry, sp, fl, it, ac, hp] = a;
    if (id === G.myId) continue;
    let o = G.others.get(id);
    if (!o) o = addOther({ id, name: '…', color: '#888888', x, y, z });
    if (!o) continue;
    if (Math.hypot(x - o.x, z - o.z) > 25) { o.x = x; o.y = y; o.z = z; }
    o.tx = x; o.ty = y; o.tz = z; o.try = ry; o.sp = sp; o.fl = fl; o.hp = hp;
    if ((o.model.itemId || '') !== it) setHeld(o.model, it || null);
    if (ac !== o.ac) {
      if (o.ac >= 0) { o.atkT = 0; sfx.swing(att(distTo(o.x, o.z), 25)); }
      o.ac = ac;
    }
  }
  const seen = new Set();
  for (const a of m.m) {
    const [id, ti, x, y, z, ry, sp, ac, hp, maxHp, burn] = a;
    seen.add(id);
    let mb = G.mobs.get(id);
    if (!mb) mb = createMob(id, MOB_TYPES[ti], x, y, z, ry, ac);
    if (mb.dying) continue;
    mb.tx = x; mb.ty = y; mb.tz = z; mb.try = ry; mb.sp = sp; mb.hp = hp; mb.maxHp = maxHp; mb.burn = burn;
    if (ac !== mb.ac) {
      mb.ac = ac; mb.atkT = 0;
      const d = distTo(x, z);
      if (mb.type === 'ghoul' || mb.type === 'brute') sfx.growl(att(d, 30)); else sfx.grunt(att(d, 30));
    }
  }
  for (const [id, mb] of G.mobs) if (!seen.has(id) && !mb.dying) removeMob(id);
}

function onEvent(m) {
  if (m.e === 'night') { announce('GECE ÇÖKTÜ', 'Gölgeler uyanıyor… ateşin yanında kal!', 'night'); sfx.night(); }
  else if (m.e === 'day') { G.day = m.day; announce(`GÜN ${m.day}`, 'Güneş doğdu, Gölgeler yanıyor!', 'day'); sfx.day(); checkTasks(); }
  else if (m.e === 'dusk') feed('Hava kararıyor… yaklaşık 30 saniye sonra gece!', 'warn');
  else if (m.e === 'boss') { announce('DEV GÖLGE GELİYOR', 'Ateşten korkmaz! Duvar ve tuzak kurun, birlikte savaşın!', 'night'); sfx.night(); sfx.growl(1); }
}

function sendState(dt) {
  const me = G.me;
  me.sendT -= dt;
  if (me.sendT > 0) return;
  me.sendT = 1 / 15;
  const fl = (!me.onGround && !me.swim ? 1 : 0) | (me.swim ? 2 : 0) | (me.dead ? 4 : 0);
  G.net.toHost({ t: 'st', x: r2(me.x), y: r2(me.y), z: r2(me.z), ry: r2(me.ry), sp: r1(me.speed), fl, it: heldId() || '', ac: me.ac, hp: Math.round(me.hp) });
}

// ================================================================ KAMERA & IŞIK & SES
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const me = G.me, W = G.world;
  const dist = [5.5, 9, 3.2][G.camMode];
  const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw), rx = -fz, rz = fx;
  const side = G.camMode === 2 ? 0.45 : 0.6;
  const ty = me.y + (me.swim ? 1.1 : me.dead ? 0.8 : 1.65);
  camTarget.set(me.x + rx * side, ty, me.z + rz * side);
  const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
  const want = camBlock(camTarget, -fx * cp, sp, -fz * cp, dist);
  G.camD = G.camD === undefined ? want : want < G.camD ? want : lerp(G.camD, want, Math.min(1, dt * 3));
  const cx = camTarget.x - fx * G.camD * cp, cz = camTarget.z - fz * G.camD * cp;
  let cy = camTarget.y + G.camD * sp;
  const gh = Math.max(W.heightAt(cx, cz), WATER - 0.1) + 0.45;
  if (cy < gh) cy = gh;
  camera.position.set(cx, cy, cz);
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - dt);
    const s = G.shake * 0.5;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
  camera.lookAt(camTarget.x + fx * 1.5, camTarget.y, camTarget.z + fz * 1.5);
  const fov = me.sprint && me.speed > 6 ? 70 : 62;
  if (Math.abs(G.fov - fov) > 0.05) { G.fov = lerp(G.fov, fov, Math.min(1, dt * 6)); camera.fov = G.fov; camera.updateProjectionMatrix(); }
}

// Kamera ile oyuncu arasında ağaç tacı varsa kamerayı yaklaştır
function camBlock(t, dx, dy, dz, dist) {
  const W = G.world;
  const trees = W.nodesNear(t.x + dx * dist * 0.5, t.z + dz * dist * 0.5, dist * 0.5 + 6);
  const steps = 12;
  for (let i = 2; i <= steps; i++) {
    const d = (dist * i) / steps;
    const x = t.x + dx * d, y = t.y + dy * d, z = t.z + dz * d;
    if (y < W.heightAt(x, z) + 0.35) return Math.max(1.0, (dist * (i - 1)) / steps);
    for (const n of trees) {
      if (n.kind !== 'pine' && n.kind !== 'oak') continue;
      if (!n.alive) continue;
      const hx = x - n.x, hz = z - n.z, hy = y - n.y, s = n.s;
      if (n.kind === 'pine') {
        if (hy > 1.3 * s && hy < 5.2 * s) {
          const r = 1.75 * s * (1 - (hy - 1.3 * s) / (4.2 * s)) + 0.3;
          if (hx * hx + hz * hz < r * r) return Math.max(1.2, (dist * (i - 1)) / steps);
        }
      } else {
        const oy = hy - 3.2 * s, r = 2.0 * s;
        if (hx * hx + oy * oy + hz * hz < r * r) return Math.max(1.2, (dist * (i - 1)) / steps);
      }
    }
  }
  return dist;
}

const tmpV = new THREE.Vector3();
function updateLights() {
  const src = [];
  for (const st of G.structs.values()) {
    if (st.k === 'campfire' && st.fuel > 0) src.push({ x: st.x, y: st.y + 1.3, z: st.z, i: 34 + Math.sin(G.time * 13 + st.flick) * 4 + Math.random() * 3, d: 26 });
  }
  const torch = (model) => {
    if (model.itemId !== 'torch' && model.itemId !== 'sword') return;
    model.handR.getWorldPosition(tmpV);
    if (model.itemId === 'torch') src.push({ x: tmpV.x, y: tmpV.y + 0.6, z: tmpV.z, i: 20 + Math.random() * 2, d: 20 });
    else src.push({ x: tmpV.x, y: tmpV.y + 1.0, z: tmpV.z, i: 2.5, c: 0xa070ff, d: 7 });
  };
  torch(G.me.model);
  for (const o of G.others.values()) torch(o.model);
  lightPool.update(src, G.me.x, G.me.z);
}

function updateAmbient(dt) {
  G.ambT -= dt;
  if (G.ambT <= 0) { G.ambT = 0.5; setAmbience(sky.night); }
  const f = nearestLitFire(14);
  if (f && Math.random() < dt * 9) sfx.crackle(att(distTo(f.x, f.z), 14));
}

// ================================================================ ARAYÜZ
const E = {};
['hpBar', 'foodBar', 'waterBar', 'stamBar', 'stHp', 'stFood', 'stWater', 'stStam', 'timeTxt', 'dayTxt', 'sunIcon', 'target', 'targetName', 'targetBar', 'prompt', 'players', 'pause'].forEach((k) => { E[k] = $(k); });
function setText(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
function setW(el, pct) { const v = Math.round(clamp(pct, 0, 100)) + '%'; if (el._w !== v) { el._w = v; el.style.width = v; } }
function fmtTime(s) { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; }

let hudT = 0;
function updateHUD(dt) {
  const me = G.me;
  setW(E.hpBar, me.hp); setW(E.foodBar, me.hunger); setW(E.waterBar, me.thirst); setW(E.stamBar, me.stam);
  E.stHp.classList.toggle('low', me.hp < 25);
  E.stFood.classList.toggle('low', me.hunger < 20);
  E.stWater.classList.toggle('low', me.thirst < 20);
  E.stStam.classList.toggle('low', me.exhausted);
  const h = Math.floor(G.hour), mi = Math.floor((G.hour - h) * 6) * 10;
  const warn = G.hour >= 18 && G.hour < 20;
  setText(E.timeTxt, `${pad2(h)}:${pad2(mi)}${warn ? ' · gece yaklaşıyor!' : isNight() ? ' · gece' : ''}`);
  E.timeTxt.classList.toggle('warn', warn);
  setText(E.dayTxt, `Gün ${G.day}`);
  E.sunIcon.classList.toggle('moon', isNight());

  const tg = me.dead ? null : findTarget(toolOf(heldId()).reach + 1.2);
  if (tg) {
    E.target.classList.remove('hidden');
    if (tg.kind === 'mob') { setText(E.targetName, MOB_NAMES[tg.mob.type]); setW(E.targetBar, (100 * tg.mob.hp) / Math.max(1, tg.mob.maxHp)); }
    else { setText(E.targetName, NODE_NAMES[tg.node.kind]); setW(E.targetBar, (100 * tg.node.hp) / tg.node.maxHp); }
  } else E.target.classList.add('hidden');
  setText(E.prompt, promptText(tg));

  if (G.invDirty) { G.invDirty = false; renderHotbar(); if (G.panel) renderCraft(); }
  hudT -= dt;
  if (hudT <= 0) { hudT = 0.5; renderPlayers(); if (G.panel) renderCraft(); }
}

function promptText(tg) {
  const me = G.me;
  if (me.dead) return '';
  const id = heldId(), d = id && ITEMS[id];
  if (d && d.place) return G.ghostValid ? '[Sol Tık] Yerleştir · [R] Döndür' : 'Buraya yerleştirilemez';
  if (d && (d.food || d.heal)) return `[Sol Tık] ${d.heal ? 'Kullan' : 'Ye'}: ${d.name}`;
  if (nearWater()) return '[E] Su iç';
  const f = nearestStruct('campfire', 3.2);
  if (f) return f.fuel > 0 ? `[E] Ateşe odun at (2 Odun) · Yakıt ${fmtTime(f.fuel)}` : '[E] Ateşi yeniden yak (2 Odun)';
  if (tg && tg.kind === 'node' && G.taskIdx < 6) return tg.node.kind === 'rock' ? '[Sol Tık] Kır' : tg.node.kind === 'bush' ? '[Sol Tık] Meyve ve lif topla' : '[Sol Tık] Kes';
  if (tg && tg.kind === 'mob' && G.taskIdx < 8) return '[Sol Tık] Saldır';
  if (me.thirst < 20) return 'Susadın! Su kenarında [E] ile su iç.';
  if (me.hunger < 20) return 'Acıktın! Meyve ya da et ye.';
  if (G.hour >= 18.3 && G.hour < 20 && !nearestLitFire(25)) return 'Gece yaklaşıyor — bir kamp ateşi kur ya da yanına git!';
  return '';
}

function renderHotbar() {
  const hb = $('hotbar');
  if (!hb.children.length) {
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `<span class="key">${(i + 1) % 10}</span><img alt="" draggable="false"><span class="cnt"></span>`;
      d.addEventListener('mousedown', (e) => { e.stopPropagation(); selectSlot(i); });
      hb.appendChild(d);
    }
  }
  for (let i = 0; i < 10; i++) {
    const s = G.inv[i], d = hb.children[i];
    d.classList.toggle('sel', i === G.sel);
    const img = d.children[1], cnt = d.children[2];
    if (s) { const src = itemIcon(s.id); if (img._src !== src) { img._src = src; img.src = src; } img.style.display = ''; d.title = ITEMS[s.id].name; }
    else { img.style.display = 'none'; d.title = ''; }
    cnt.textContent = s && s.n > 1 ? s.n : '';
  }
}

function renderPlayers() {
  const rows = [[G.myId, G.name, G.color, G.me.hp, G.me.dead]];
  for (const o of G.others.values()) rows.push([o.id, o.name, o.color, o.hp, !!(o.fl & 4)]);
  const html = rows.map(([id, n, c, hp, dead]) => `<div class="pl"><span class="dot" style="background:${esc(c)}"></span><span class="nm">${esc(n)}${id === G.myId ? ' (sen)' : ''}</span><span class="ph ${dead ? 'dead' : ''}">${dead ? 'öldü' : '❤ ' + Math.max(0, Math.ceil(hp))}</span></div>`).join('');
  if (E.players._h !== html) { E.players._h = html; E.players.innerHTML = html; }
}

function feed(text, cls = '') {
  const f = $('feed');
  const d = document.createElement('div');
  d.textContent = text;
  if (cls) d.className = cls;
  f.appendChild(d);
  while (f.children.length > 6) f.firstChild.remove();
  setTimeout(() => d.classList.add('fade'), 6000);
  setTimeout(() => d.remove(), 7000);
}

let annTimer = 0;
function announce(big, small, cls) {
  $('annBig').textContent = big;
  $('annBig').className = cls || '';
  $('annSmall').textContent = small || '';
  $('announce').classList.add('show');
  clearTimeout(annTimer);
  annTimer = setTimeout(() => $('announce').classList.remove('show'), 3800);
}

function addChat(name, color, text) {
  const log = $('chatLog');
  const d = document.createElement('div');
  d.innerHTML = `<b style="color:${esc(color)}">${esc(name)}:</b>${esc(text)}`;
  log.appendChild(d);
  while (log.children.length > 8) log.firstChild.remove();
  setTimeout(() => d.classList.add('old'), 15000);
  sfx.ui();
}
function openChat() {
  G.chatOpen = true; G.keys = {};
  const i = $('chatIn');
  i.classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  setTimeout(() => i.focus(), 0);
  updatePause();
}
function closeChat() {
  G.chatOpen = false;
  const i = $('chatIn');
  i.value = ''; i.classList.add('hidden'); i.blur();
  lockPointer();
  updatePause();
}
function sendChat() {
  const v = $('chatIn').value.trim();
  if (v) G.net.toHost({ t: 'chat', text: v });
  closeChat();
}

// Ekrana yansıtılan etiketler (isimler, can barları, uçan yazılar)
const pv = new THREE.Vector3();
function placeEl(el, x, y, z) {
  pv.set(x, y, z).project(camera);
  if (pv.z > 1 || pv.x < -1.2 || pv.x > 1.2 || pv.y < -1.2 || pv.y > 1.2) {
    if (el._vis !== false) { el.style.display = 'none'; el._vis = false; }
    return false;
  }
  if (el._vis !== true) { el.style.display = ''; el._vis = true; }
  el.style.transform = `translate(${(((pv.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - pv.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  return true;
}
const floats = [];
function floatText(text, x, y, z, cls) {
  const e = document.createElement('div');
  e.className = 'float ' + (cls || '');
  e.textContent = text;
  $('labels').appendChild(e);
  floats.push({ e, x: x + (Math.random() - 0.5) * 0.4, y, z, t: 0 });
  if (floats.length > 30) { const f = floats.shift(); f.e.remove(); }
}
function updateLabels(dt) {
  for (const o of G.others.values()) {
    if (distTo(o.x, o.z) > 80) { if (o.el._vis !== false) { o.el.style.display = 'none'; o.el._vis = false; } continue; }
    if (placeEl(o.el, o.x, o.y + 2.35, o.z)) setW(o.hpEl, o.hp);
  }
  for (const mb of G.mobs.values()) {
    if ((mb.showHp > 0 || mb.type === 'brute') && !mb.dying && mb.hp < mb.maxHp + (mb.type === 'brute' ? 1 : 0) && distTo(mb.x, mb.z) < (mb.type === 'brute' ? 60 : 30)) {
      if (placeEl(mb.el, mb.x, mb.y + (mb.type === 'brute' ? 4.2 : mb.type === 'ghoul' ? 2.45 : 1.9), mb.z)) setW(mb.hpEl, (100 * mb.hp) / Math.max(1, mb.maxHp));
    } else if (mb.el._vis !== false) { mb.el.style.display = 'none'; mb.el._vis = false; }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt; f.y += dt * 1.2;
    placeEl(f.e, f.x, f.y, f.z);
    f.e.style.opacity = f.t < 0.6 ? 1 : Math.max(0, 1 - (f.t - 0.6) / 0.5);
    if (f.t > 1.1) { f.e.remove(); floats.splice(i, 1); }
  }
}

// ================================================================ GÖREVLER
const TASKS = [
  { t: '10 odun topla — bir ağaca yaklaş ve Sol Tık ile vur', ok: (s) => (s.got.wood || 0) >= 10 },
  { t: '[C] ile üretim menüsünü aç ve Taş Balta üret', ok: (s) => s.made.axe },
  { t: '15 taş topla — kayalara vur', ok: (s) => (s.got.stone || 0) >= 15 },
  { t: 'Kamp Ateşi üret ve yere yerleştir', ok: (s) => s.built.campfire },
  { t: 'Meyve çalılarından 6 lif topla', ok: (s) => (s.got.fiber || 0) >= 6 },
  { t: 'Meşale üret — gece yolunu aydınlatır', ok: (s) => s.made.torch },
  { t: 'Bir hayvan avla (geyik, domuz ya da kurt)', ok: (s) => s.kills.animal >= 1 },
  { t: 'Ateş yanında et pişir ve ye', ok: (s) => s.ate.cooked },
  { t: 'İlk geceyi atlat', ok: () => G.day >= 2 },
  { t: 'Mızrak üret', ok: (s) => s.made.spear },
  { t: '5 Gölge öldür ve özlerini topla', ok: (s) => s.kills.ghoul >= 5 },
  { t: 'Gölge Kılıcı üret', ok: (s) => s.made.sword },
  { t: '7. güne ulaş', ok: () => G.day >= 7 },
];
function checkTasks() {
  let changed = false;
  while (G.taskIdx < TASKS.length && TASKS[G.taskIdx].ok(G.stats)) { G.taskIdx++; changed = true; }
  if (changed) { sfx.task(); feed('Görev tamamlandı!', 'good'); renderTask(true); }
}
function renderTask(flash) {
  const t = $('task');
  if (G.taskIdx >= TASKS.length) t.innerHTML = '<div class="tl">Efsane</div>Tüm görevler bitti! Kaç gün dayanabilirsin?';
  else t.innerHTML = `<div class="tl">Görev ${G.taskIdx + 1}/${TASKS.length}</div>${esc(TASKS[G.taskIdx].t)}`;
  if (flash) { t.classList.remove('done'); void t.offsetWidth; t.classList.add('done'); }
}

// ================================================================ ÜRETİM
function canCraft(r) {
  for (const [id, n] of Object.entries(r.cost)) if (countIn(G.inv, id) < n) return 'missing';
  if (r.fire && !nearestLitFire(5)) return 'fire';
  const sim = G.inv.map((s) => s && { ...s });
  for (const [id, n] of Object.entries(r.cost)) removeFrom(sim, id, n);
  if (addTo(sim, r.out, r.n) > 0) return 'full';
  return 'ok';
}
function craft(r, many) {
  let made = 0;
  for (let i = 0; i < (many ? 10 : 1); i++) {
    const c = canCraft(r);
    if (c !== 'ok') {
      if (!made) { sfx.deny(); feed(c === 'fire' ? 'Bunun için yanan bir ateşin yanında olmalısın.' : c === 'full' ? 'Envanterin dolu!' : 'Malzemen yetersiz.', 'warn'); }
      break;
    }
    for (const [id, n] of Object.entries(r.cost)) removeFrom(G.inv, id, n);
    addTo(G.inv, r.out, r.n);
    made++;
  }
  if (!made) return;
  sfx.craft();
  G.stats.made[r.out] = true;
  G.invDirty = true;
  const def = ITEMS[r.out];
  if (def.tool || def.place) { const idx = G.inv.findIndex((s) => s && s.id === r.out); if (idx >= 0) selectSlot(idx); }
  feed(`${def.name}${made * r.n > 1 ? ' ×' + made * r.n : ''} üretildi!`, 'good');
  checkTasks();
  renderCraft();
}
function renderCraft() {
  const html = RECIPES.map((r, i) => {
    const st = canCraft(r);
    const cost = Object.entries(r.cost).map(([id, n]) => {
      const have = countIn(G.inv, id);
      return `<span class="${have >= n ? 'have' : 'miss'}" title="${ITEMS[id].name}"><img src="${itemIcon(id)}" alt="">${ITEMS[id].name} ${have}/${n}</span>`;
    }).join('');
    const fire = r.fire ? `<div class="fire">${st === 'fire' ? 'Yanan bir ateşin yanında olmalısın' : 'Yanan ateş yanında'}</div>` : '';
    return `<div class="rc ${st === 'ok' ? 'ok' : 'no'}" data-i="${i}"><img src="${itemIcon(r.out)}" alt=""><div><div class="rn">${ITEMS[r.out].name}${r.n > 1 ? ` <small>×${r.n}</small>` : ''}</div><div class="rd">${r.desc}</div><div class="cost">${cost}</div>${fire}</div></div>`;
  }).join('');
  const box = $('recipes');
  if (box._h !== html) { box._h = html; box.innerHTML = html; }
}
function toggleCraft(force) {
  const open = force ?? !G.panel;
  if (open === G.panel) return;
  G.panel = open;
  $('craft').classList.toggle('hidden', !open);
  if (open) { renderCraft(); if (document.exitPointerLock) document.exitPointerLock(); G.mouseDown = false; sfx.ui(); }
  else lockPointer();
  updatePause();
}

// ================================================================ GİRDİ
function lockPointer() {
  if (G.mode !== 'play') return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* desteklenmiyor */ }
}
function updatePause() {
  const show = G.mode === 'play' && !G.locked && !G.panel && !G.chatOpen && !(G.me && G.me.dead);
  E.pause.classList.toggle('hidden', !show);
}

addEventListener('keydown', (e) => {
  if (G.mode !== 'play') return;
  if (G.chatOpen) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); sendChat(); }
    else if (e.code === 'Escape') closeChat();
    return;
  }
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (!e.repeat) {
    switch (e.code) {
      case 'KeyC': case 'Tab': toggleCraft(); return;
      case 'Enter': case 'NumpadEnter': e.preventDefault(); openChat(); return;
      case 'Escape': if (G.panel) toggleCraft(false); return;
      case 'KeyE': interact(); break;
      case 'KeyQ': dropHeld(); break;
      case 'KeyV': G.camMode = (G.camMode + 1) % 3; break;
      case 'KeyR': G.placeRot += Math.PI / 4; break;
      case 'KeyM': setMuted(!isMuted()); feed(isMuted() ? 'Ses kapalı (M)' : 'Ses açık (M)'); break;
    }
    if (/^Digit\d$/.test(e.code)) { const n = +e.code[5]; selectSlot(n === 0 ? 9 : n - 1); }
  }
  G.keys[e.code] = true;
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; G.mouseDown = false; });
canvas.addEventListener('mousedown', (e) => {
  if (G.mode !== 'play') return;
  initAudio();
  if (!G.locked) { if (!G.panel && !G.chatOpen) lockPointer(); return; }
  if (e.button === 0) G.mouseDown = true;
  else if (e.button === 2) G.placeRot += Math.PI / 4;
});
addEventListener('mouseup', (e) => { if (e.button === 0) { G.mouseDown = false; G.placeClick = false; } });
addEventListener('mousemove', (e) => {
  if (!G.locked) return;
  const mx = clamp(e.movementX, -250, 250), my = clamp(e.movementY, -250, 250);
  G.yaw -= mx * 0.0025 * G.sens;
  G.pitch = clamp(G.pitch + my * 0.0025 * G.sens, -0.45, 1.25);
});
addEventListener('wheel', (e) => {
  if (G.mode !== 'play' || G.panel || G.chatOpen) return;
  selectSlot((G.sel + (e.deltaY > 0 ? 1 : -1) + 10) % 10);
}, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  G.locked = document.pointerLockElement === canvas;
  if (!G.locked) G.mouseDown = false;
  updatePause();
});
E.pause.addEventListener('mousedown', (e) => { if (e.target.closest('.settings')) return; initAudio(); lockPointer(); });
(function setupSettings() {
  const r = $('sens');
  try { const v = parseFloat(localStorage.getItem('yaban.sens')); if (v > 0) G.sens = v; } catch (e) { /* yok */ }
  r.value = G.sens; $('sensVal').textContent = G.sens.toFixed(1);
  r.addEventListener('input', () => { G.sens = parseFloat(r.value); $('sensVal').textContent = G.sens.toFixed(1); try { localStorage.setItem('yaban.sens', G.sens); } catch (e) { /* yok */ } });
  $('muteBtn').addEventListener('click', () => { setMuted(!isMuted()); $('muteBtn').textContent = isMuted() ? 'Ses: kapalı' : 'Ses: açık'; });
  $('fsBtn').addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); });
})();
$('recipes').addEventListener('click', (e) => { const c = e.target.closest('.rc'); if (c) craft(RECIPES[+c.dataset.i], e.shiftKey); });
$('copyLink').onclick = async () => {
  const url = location.origin + location.pathname + '?oda=' + G.roomCode;
  try { await navigator.clipboard.writeText(url); feed('Davet linki kopyalandı! Arkadaşlarına gönder.', 'good'); }
  catch (e) { window.prompt('Davet linki:', url); }
};
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
addEventListener('beforeunload', (e) => {
  if (G.mode === 'play' && G.isHost && G.net.peerCount > 0) { e.preventDefault(); e.returnValue = ''; }
});

// ================================================================ ANA DÖNGÜ
function step(dt) {
  pumpNet();
  if (G.mode !== 'play') return;
  if (G.host) G.host.update(dt);
  G.hour += dt / HOUR_SEC;
  if (G.hour >= 24) G.hour -= 24;
  if (!G.isHost && performance.now() - G.net.lastHostMsg > 12000) { onLost(); return; }
  updatePlayer(dt);
  sendState(dt);
  updateOthers(dt);
  updateMobs(dt);
  updateStructs(dt);
  updateDrops(dt);
  G.world.update(dt);
  updateGhost();
  updateCamera(dt);
  parts.update(dt);
  glow.update(dt);
  updateLights();
  sky.update(G.hour, camera, G.me);
  updateAmbient(dt);
  updateHUD(dt);
  updateLabels(dt);
}

function menuView(dt) {
  G.menuAng += dt * 0.04;
  const W = G.world, sp = W.spawn, h = W.heightAt(sp.x, sp.z);
  camera.position.set(sp.x + Math.cos(G.menuAng) * 70, h + 32, sp.z + Math.sin(G.menuAng) * 70);
  camera.lookAt(sp.x, h + 4, sp.z);
  W.update(dt);
  sky.update(G.hour, camera, { x: sp.x, y: h, z: sp.z });
}

// Zayıf bilgisayarlarda kaliteyi kendiliğinden düşür (yalnızca düşürür, salınım yapmaz)
const perf = { t: 0, frames: 0, level: 0 };
const DEBUG = new URLSearchParams(location.search).has('debug');
function perfGovernor(rawDt) {
  if (G.mode !== 'play' || document.hidden || DEBUG) return;
  perf.t += rawDt; perf.frames++;
  if (perf.t < 3) return;
  const fps = perf.frames / perf.t;
  perf.t = 0; perf.frames = 0;
  if (fps >= 38 || perf.level >= 3) return;
  perf.level++;
  if (perf.level === 1) { renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); }
  else if (perf.level === 2) { sky.sun.shadow.mapSize.set(1024, 1024); if (sky.sun.shadow.map) { sky.sun.shadow.map.dispose(); sky.sun.shadow.map = null; } if (G.world.grass) G.world.grass.count = Math.floor(G.world.grass.count / 3); }
  else if (perf.level === 3) { renderer.setPixelRatio(0.75); renderer.setSize(innerWidth, innerHeight); }
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0.0001, (now - G.last) / 1000);
  const dt = Math.min(0.05, raw);
  G.last = now;
  G.time += dt;
  if (G.mode === 'play') step(dt);
  else if (G.mode !== 'lost') { if (G.mode === 'joining') checkWelcome(); menuView(dt); }
  renderer.render(scene, camera);
  if (raw < 0.5) perfGovernor(raw);
}

// test/hata ayıklama: ?debug ile simülasyonu render etmeden ilerletebilmek için
if (DEBUG) {
  window.YABAN_STEP = (n, dt = 0.05) => { for (let i = 0; i < n && G.mode === 'play'; i++) { G.time += dt; step(dt); } };
  window.YABAN_FN = { takeDamage, die, craft, interact, findTarget, addItem, countIn: (id) => countIn(G.inv, id) };
}

// Sekme arka plandayken ev sahibi dünyayı yönetmeye devam etsin
(function backgroundTicker() {
  let last = performance.now();
  try {
    const blob = new Blob(['setInterval(function(){postMessage(0)},50)'], { type: 'text/javascript' });
    const wk = new Worker(URL.createObjectURL(blob));
    wk.onmessage = () => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!document.hidden || G.mode !== 'play') return;
      pumpNet();
      if (G.mode !== 'play') return;
      if (G.host) G.host.update(dt);
      G.hour += dt / HOUR_SEC;
      if (G.hour >= 24) G.hour -= 24;
      sendState(dt);
    };
  } catch (e) { /* worker yok */ }
})();

setupMenu();
requestAnimationFrame(frame);
