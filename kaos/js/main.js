// KAOS ADASI — ana döngü, menü, kamera, ağ (oda kur / katıl), arayüz.
import * as THREE from 'three';
import { World, WATER } from './world.js';
import { Sky } from './sky.js';
import { Particles } from './fx.js';
import { loadAssets } from './assets.js';
import { HATS } from './character.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Sim } from './sim.js';
import { MobViews } from './mobview.js';
import { RemotePlayers, makePlayerCharacter } from './remote.js';
import { Net } from './net.js';
import { initAudio, sfx, setAmbience, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const COARSE = window.matchMedia && matchMedia('(pointer: coarse)').matches;
const MAX_PLAYERS = 4;

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
  mode: 'loading', assets: null, world: null, player: null, ch: null, sim: null, mobs: null, others: null,
  net: new Net(), isHost: false, myId: 'h', roomCode: null, pvp: false, infos: new Map(),
  yaw: 0, pitch: 0.28, camMode: 0, camD: 4.5, shake: 0, time: 0, hour: 10.5, last: performance.now(),
  name: 'Oyuncu', color: '#ff6b35', hat: 'parti', sendT: 0, snapT: 0,
};
window.KAOS = G;

function makeWorld(seed) {
  if (G.world) G.world.dispose();
  G.world = new World(seed >>> 0, scene);
}
const SEED_Q = parseInt(QS.get('seed'), 10);
makeWorld(Number.isFinite(SEED_Q) ? SEED_Q : (Math.random() * 2 ** 31) >>> 0);

const input = new Input(canvas, $('touch'));
input.enabled = false;
input.onLockChange = () => updatePause();
input.onModeChange = (on) => { updatePause(); if (on && G.mode === 'play') showHint('Sol: hareket · Sağ: kamera'); };
let hintT = 0;
function showHint(t, ms = 6000) { const h = $('hint'); h.textContent = t; h.style.opacity = '0.85'; clearTimeout(hintT); hintT = setTimeout(() => { h.style.opacity = '0'; }, ms); }

// ---------------------------------------------------------------- yükleme & menü
const COLORS = ['#ff6b35', '#f7c548', '#4ecb71', '#33b5e5', '#9b6dff', '#ff5fa2', '#e9ecef', '#3d3d3d'];
const HAT_NAMES = { parti: 'Parti şapkası', boynuz: 'Boynuzlu miğfer', tac: 'Taç', tencere: 'Tencere', pervane: 'Pervaneli şapka', kovboy: 'Kovboy şapkası' };
function setupMenu() {
  try { const p = JSON.parse(localStorage.getItem('kaos.profile') || '{}'); if (p.name) G.name = String(p.name).slice(0, 14); if (COLORS.includes(p.color)) G.color = p.color; if (HATS.includes(p.hat)) G.hat = p.hat; } catch (e) { /* yok */ }
  $('nameIn').value = G.name === 'Oyuncu' ? '' : G.name;
  const cw = $('colors');
  COLORS.forEach((c) => {
    const d = document.createElement('button'); d.className = 'sw' + (c === G.color ? ' on' : ''); d.style.background = c; d.setAttribute('aria-label', 'Renk');
    d.onclick = () => { G.color = c; [...cw.children].forEach((x) => x.classList.toggle('on', x === d)); };
    cw.appendChild(d);
  });
  const hw = $('hats');
  HATS.forEach((h) => {
    const d = document.createElement('button'); d.className = 'hatb' + (h === G.hat ? ' on' : ''); d.textContent = HAT_NAMES[h];
    d.onclick = () => { G.hat = h; [...hw.children].forEach((x) => x.classList.toggle('on', x === d)); };
    hw.appendChild(d);
  });
  const oda = (QS.get('oda') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (oda) { $('codeIn').value = oda; $('btnJoin').classList.add('pulse'); menuMsg('Arkadaşın seni davet etti! Adını yaz ve Katıl\'a bas.', true); }
  $('btnHost').onclick = () => { readProfile(); startHost(); };
  $('btnJoin').onclick = () => {
    readProfile();
    const code = $('codeIn').value.trim().toUpperCase();
    if (code.length !== 5) { menuMsg('5 haneli oda kodunu yaz.'); return; }
    startJoin(code);
  };
  $('codeIn').addEventListener('input', () => { $('codeIn').value = $('codeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('btnCancel').onclick = () => { location.href = location.pathname; };
  $('btnBack').onclick = () => { location.href = location.pathname; };
}
function menuMsg(t, good) { const m = $('menuMsg'); m.textContent = t; m.style.color = good ? '#ffd23f' : '#ff8a7a'; }
function readProfile() {
  G.name = ($('nameIn').value.trim() || 'Kaosçu' + Math.floor(Math.random() * 90 + 10)).slice(0, 14);
  try { localStorage.setItem('kaos.profile', JSON.stringify({ name: G.name, color: G.color, hat: G.hat })); } catch (e) { /* yok */ }
  initAudio();
}
function myInfo() { return { id: G.myId, name: G.name, color: G.color, hat: G.hat }; }

loadAssets((p) => { $('loadBar').style.width = Math.round(p * 100) + '%'; }).then((a) => {
  G.assets = a;
  G.mode = 'menu';
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
}).catch((e) => { console.error(e); $('loadTxt').textContent = 'Modeller yüklenemedi. Sayfayı yenile.'; });

// ---------------------------------------------------------------- oda kur / katıl
function startHost() {
  G.isHost = true; G.myId = 'h';
  G.pvp = $('pvpIn').checked;
  G.sim = new Sim(G.world, { pvp: G.pvp });
  G.sim.addPlayer('h', G.name);
  G.infos.set('h', myInfo());
  G.net.onPeerLeave = (pid) => hostRemovePlayer(pid);
  enterPlay();
  $('roomCode').textContent = '…';
  G.net.startHost((code) => {
    G.roomCode = code; $('roomCode').textContent = code; $('shareBtn').classList.remove('hidden');
    showHint(`Oda kodu: ${code} — arkadaşlarına gönder!`, 9000);
  }, () => {
    $('roomCode').textContent = 'ÇEVRİMDIŞI'; $('shareBtn').classList.add('hidden');
    showHint('Bağlantı sunucusuna ulaşılamadı — tek başına oynuyorsun.', 8000);
  });
}

function startJoin(code) {
  G.mode = 'joining'; G.roomCode = code;
  $('menu').classList.add('hidden');
  $('joinScr').classList.remove('hidden');
  $('joinTxt').textContent = `${code} odasına bağlanılıyor…`;
  G.net.join(code, (id) => {
    G.myId = id;
    $('joinTxt').textContent = 'Adaya iniliyor…';
    G.net.toHost({ t: 'hello', ...myInfo() });
  }, (msg) => {
    G.mode = 'menu';
    $('joinScr').classList.add('hidden'); $('menu').classList.remove('hidden');
    menuMsg(msg);
  }, onLost);
}

function onLost() {
  if (G.mode !== 'play' && G.mode !== 'joining') return;
  G.mode = 'lost';
  $('joinScr').classList.add('hidden');
  $('lost').classList.remove('hidden');
  input.enabled = false;
  if (document.exitPointerLock) document.exitPointerLock();
}

function checkWelcome() {
  const q = G.net.clientQ;
  while (q.length) {
    const m = q.shift();
    if (!m) continue;
    if (m.t === 'full') { G.mode = 'menu'; $('joinScr').classList.add('hidden'); $('menu').classList.remove('hidden'); menuMsg(`Oda dolu (en fazla ${MAX_PLAYERS} kişi).`); return; }
    if (m.t === 'welcome') {
      if (G.world.seed !== (m.seed >>> 0)) makeWorld(m.seed);
      const mine = m.players.find((i) => i.id === G.myId);
      if (mine && mine.color !== G.color) { G.color = mine.color; showHint('Bu renk alınmıştı, sana yeni bir renk verildi.', 5000); }
      G.pvp = !!m.pvp;
      enterPlay();
      for (const info of m.players) if (info.id !== G.myId) addOther(info);
      showHint(m.players.length > 1 ? `Odaya katıldın! ${m.players.length - 1} arkadaşın burada.` : 'Odaya katıldın!', 6000);
      return;
    }
  }
}

function enterPlay() {
  const ch = makePlayerCharacter(G.assets, myInfo());
  scene.add(ch.root);
  G.ch = ch;
  G.player = new Player(G.world, ch);
  G.player.x += (Math.random() - 0.5) * 4; G.player.z += (Math.random() - 0.5) * 4;
  G.player.y = G.world.heightAt(G.player.x, G.player.z);
  G.yaw = Math.atan2(-G.player.x, -G.player.z);
  G.mobs = new MobViews(scene, G.assets, $('labels'));
  G.others = new RemotePlayers(scene, G.assets, $('labels'));
  G.mode = 'play';
  input.enabled = true;
  $('menu').classList.add('hidden'); $('joinScr').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('roomCode').textContent = G.roomCode || '…';
  $('pvpTag').classList.toggle('hidden', !G.pvp);
  if (COARSE) input.setTouchMode(true);
  input.requestLock();
  updatePause();
  renderPlayers();
}

function addOther(info) {
  G.infos.set(info.id, info);
  G.others.add(info);
  renderPlayers();
}
function removeOther(id) {
  G.infos.delete(id);
  G.others.remove(id);
  renderPlayers();
}

// ---------------------------------------------------------------- ev sahibi: mesajlar
const remoteState = new Map(); // id -> son durum satırı
const lastSeen = new Map();    // id -> son mesaj zamanı (sessizce kopanları düşürmek için)
let staleT = 0;
function hostRemovePlayer(pid) {
  if (!G.infos.has(pid)) return;
  const name = G.infos.get(pid).name;
  G.sim.removePlayer(pid);
  remoteState.delete(pid); lastSeen.delete(pid);
  G.infos.delete(pid); G.others.remove(pid); renderPlayers();
  G.net.kick(pid);
  G.net.broadcast({ t: 'leave', id: pid, name });
}
function hostOnMsg(pid, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    if (G.infos.has(pid)) return;
    if (G.infos.size >= MAX_PLAYERS) { G.net.sendTo(pid, { t: 'full' }); return; }
    const info = {
      id: pid, name: String(m.name || 'Oyuncu').replace(/[<>&"]/g, '').slice(0, 14) || 'Oyuncu',
      color: COLORS.includes(m.color) ? m.color : '#33b5e5', hat: HATS.includes(m.hat) ? m.hat : 'parti',
    };
    // aynı renk alınmışsa boştaki bir rengi ver (karakterler karışmasın)
    const used = new Set([...G.infos.values()].map((i) => i.color));
    if (used.has(info.color)) info.color = COLORS.find((c) => !used.has(c)) || info.color;
    G.sim.addPlayer(pid, info.name);
    G.net.sendTo(pid, { t: 'welcome', id: pid, seed: G.world.seed, pvp: G.pvp, players: [...G.infos.values(), info] });
    G.net.broadcast({ t: 'join', p: info }, pid);
    G.infos.set(pid, info);
    lastSeen.set(pid, performance.now());
    return;
  }
  if (!G.infos.has(pid)) return;
  lastSeen.set(pid, performance.now());
  if (m.t === 'st') {
    const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
    const row = [pid, num(m.x), num(m.y), num(m.z), num(m.ry), String(m.b || 'idle').slice(0, 12), num(m.bts, 1), String(m.o || '').slice(0, 12), num(m.q) | 0, num(m.hp, 100), num(m.fl) | 0];
    remoteState.set(pid, row);
    G.sim.setPlayer(pid, { x: row[1], y: row[2], z: row[3], ry: row[4], hp: row[9], dead: !!(row[10] & 1), crouch: !!(row[10] & 2), swim: !!(row[10] & 4) });
  } else if (m.t === 'atk') {
    const sp = G.sim.players.get(pid);
    if (sp && Math.hypot(sp.x - m.x, sp.z - m.z) < 3) G.sim.attack(pid, m.k === 'heavy' ? 'heavy' : 'jab', m.x, m.z, m.ry);
  }
}

function myRow() {
  const p = G.player, ch = G.ch;
  const fl = (p.state === 'dead' ? 1 : 0) | (p.crouch ? 2 : 0) | (p.swim ? 4 : 0);
  return [G.myId, r2(p.x), r2(p.y), r2(p.z), r2(p.ry), ch.base, r2(ch.baseTs || 1), ch.oneName || '', ch.seq || 0, Math.round(p.hp), fl];
}

// ---------------------------------------------------------------- istemci: mesajlar
function clientOnMsg(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'snap':
      G.others.apply(m.p, G.myId);
      G.mobs.apply(m.m);
      break;
    case 'join': addOther(m.p); showHint(`${m.p.name} adaya düştü!`, 4000); sfx.boing(0.6); break;
    case 'leave': removeOther(m.id); showHint(`${m.name} oyundan ayrıldı`, 4000); break;
    default: onSimMsg(m);
  }
}

// ---------------------------------------------------------------- simülasyon olayları (ses, efekt)
const att = (x, z, max = 40) => Math.max(0, 1 - Math.hypot(x - G.player.x, z - G.player.z) / max);
const COMIC = ['PAT!', 'ÇAT!', 'POF!', 'TAK!', 'BAM!'];
function onSimMsg(m) {
  const p = G.player;
  switch (m.t) {
    case 'dmg':
      p.hurt(m.amt, m.kx, m.kz, m.src, m.lift);
      if (m.amt > 0) floatText('-' + m.amt, p.x, p.y + 2.1, p.z, 'bad');
      break;
    case 'mhit': {
      const big = m.dmg >= 20;
      sfx.pow(att(m.x, m.z)); sfx.yelp(att(m.x, m.z));
      if (big) sfx.boing(att(m.x, m.z));
      parts.emit(m.x, m.y + 0.6, m.z, { n: big ? 18 : 8, color: '#ffe066', spread: 0.4, speed: big ? 6 : 3.5, up: 3, size: 0.12, life: 0.45, grav: -6 });
      floatText(big ? 'GÜM!' : COMIC[Math.floor(Math.random() * COMIC.length)], m.x, m.y + 1.4, m.z, big ? 'big' : 'pow');
      if (m.by === G.myId) floatText('-' + m.dmg, m.x + 0.4, m.y + 1.1, m.z, '');
      break;
    }
    case 'phit': {
      sfx.pow(att(m.x, m.z)); if (m.big) sfx.boing(att(m.x, m.z));
      parts.emit(m.x, m.y + 1.2, m.z, { n: m.big ? 14 : 6, color: '#ffe066', spread: 0.4, speed: 4, up: 3, size: 0.1, life: 0.45, grav: -6 });
      floatText(m.big ? 'UÇTUN!' : COMIC[Math.floor(Math.random() * COMIC.length)], m.x, m.y + 2.2, m.z, m.big ? 'big' : 'pow');
      break;
    }
    case 'mdie': sfx.yelp(1); sfx.thud(0.4); break;
    case 'howl': { const v = G.mobs.views.get(m.id); sfx.howl(v ? att(v.x, v.z, 90) : 0.5); break; }
    case 'bite': sfx.bite(1); sfx.growl(0.6); break;
    case 'thud': { const v = G.mobs.views.get(m.id); if (v) { sfx.thud(att(v.x, v.z, 30) * 0.6); parts.emit(v.x, v.y + 0.1, v.z, { n: 10, color: '#c9b48a', spread: 0.6, speed: 2.5, up: 1.6, size: 0.14, life: 0.6, grav: -4 }); } break; }
  }
}

// ---------------------------------------------------------------- ağ + simülasyon döngüsü
function netTick(dt) {
  const net = G.net;
  if (G.isHost) {
    if (net.hostQ.length) { const batch = net.hostQ.splice(0, net.hostQ.length); for (const [pid, m] of batch) { try { hostOnMsg(pid, m); } catch (e) { console.error(e); } } }
    const p = G.player, S = G.sim;
    S.setPlayer('h', { x: p.x, y: p.y, z: p.z, ry: p.ry, hp: p.hp, dead: p.state === 'dead', crouch: p.crouch, swim: p.swim });
    S.update(dt);
    for (const e of S.events) { if (e.to === '*') net.broadcast(e.m); else net.sendTo(e.to, e.m); }
    S.events.length = 0;
    G.mobs.apply(S.snapshot());
    const rows = [myRow(), ...remoteState.values()];
    G.others.apply(rows, 'h');
    staleT -= dt;
    if (staleT <= 0) { staleT = 1; const now = performance.now(); for (const [pid, t] of lastSeen) if (now - t > 10000) hostRemovePlayer(pid); }
    G.snapT -= dt;
    if (G.snapT <= 0 && net.peerCount > 0) {
      G.snapT = 1 / 15;
      for (const pid of net.conns.keys()) {
        const sp = S.players.get(pid);
        net.sendTo(pid, { t: 'snap', p: rows, m: S.snapshot(sp ? sp.x : undefined, sp ? sp.z : undefined) });
      }
    }
  } else {
    G.sendT -= dt;
    if (G.sendT <= 0) {
      G.sendT = 1 / 15;
      const row = myRow();
      net.toHost({ t: 'st', x: row[1], y: row[2], z: row[3], ry: row[4], b: row[5], bts: row[6], o: row[7], q: row[8], hp: row[9], fl: row[10] });
    }
    if (performance.now() - net.lastHostMsg > 12000) { onLost(); return; }
  }
  const q = net.clientQ;
  while (q.length && G.mode === 'play') { const m = q.shift(); try { clientOnMsg(m); } catch (e) { console.error(e); } }
  G.mobs.update(dt);
  G.others.update(dt);
  // oyuncu kurtların ve arkadaşlarının içinden geçemesin (arkadaşını itebilirsin)
  const p = G.player;
  const push = (x, z, m) => { const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz); if (d < m && d > 1e-4) { p.x += (dx / d) * (m - d); p.z += (dz / d) * (m - d); } };
  for (const v of G.mobs.views.values()) if (!v.dead) push(v.x, v.z, 0.8);
  for (const r of G.others.list.values()) if (!r.dead) push(r.x, r.z, 0.6);
}

function sendAttack(kind) {
  const p = G.player;
  if (G.isHost) return G.sim.attack('h', kind, p.x, p.z, p.ry);
  G.net.toHost({ t: 'atk', k: kind, x: r2(p.x), z: r2(p.z), ry: r2(p.ry) });
  return 1;
}

// ---------------------------------------------------------------- oyuncu olayları -> ses & efekt
function handleEvents() {
  const p = G.player;
  for (const e of p.events) {
    switch (e) {
      case 'step': sfx.step(); break;
      case 'jump': sfx.swing(0.6); dust(p, 6); break;
      case 'land': sfx.thud(0.35); dust(p, 12); G.shake = Math.max(G.shake, 0.08); break;
      case 'roll': sfx.swing(1); dust(p, 10); break;
      case 'attack': sfx.swing(1); break;
      case 'heavy': sfx.swing(1.2); break;
      case 'impactJab': sendAttack('jab'); break;
      case 'impactHeavy': sendAttack('heavy'); sfx.thud(0.5); dust(p, 14); G.shake = Math.max(G.shake, 0.15); break;
      case 'splash': sfx.splash(); parts.emit(p.x, WATER, p.z, { n: 16, color: '#d8efff', spread: 0.8, speed: 3, up: 4, size: 0.12, life: 0.7 }); break;
      case 'hurt': sfx.hurt(); G.shake = 0.25; flash(); break;
      case 'die': sfx.die(); setTimeout(() => { if (G.player.state === 'dead') $('dead').classList.remove('hidden'); }, 1200); break;
    }
  }
  p.events.length = 0;
}
function dust(p, n) { if (!p.swim) parts.emit(p.x, p.y + 0.1, p.z, { n, color: '#c9b48a', spread: 0.6, speed: 2.2, up: 1.5, size: 0.14, life: 0.6, grav: -4 }); }
function flash() { const h = $('hurt'); h.style.transition = 'none'; h.style.opacity = '1'; requestAnimationFrame(() => { h.style.transition = 'opacity 0.6s'; h.style.opacity = '0'; }); }
$('btnRespawn').onclick = () => { $('dead').classList.add('hidden'); G.player.respawn(); input.requestLock(); };

// ---------------------------------------------------------------- kamera
const camT = new THREE.Vector3();
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
  const ty = p.y + (p.swim ? 1.2 : p.crouch ? 1.1 : p.state === 'dead' ? 0.7 : 1.55);
  camT.set(p.x + rx * 0.45, lerp(camT.y || ty, ty, Math.min(1, dt * 12)), p.z + rz * 0.45);
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
function updatePause() {
  const show = G.mode === 'play' && !input.touchMode && !input.locked && !DEBUG;
  $('pause').classList.toggle('hidden', !show);
}
$('pause').addEventListener('mousedown', (e) => { if (e.target.closest('.nolock')) return; input.requestLock(); });
$('muteBtn').onclick = () => { setMuted(!isMuted()); $('muteBtn').textContent = isMuted() ? 'Ses: kapalı' : 'Ses: açık'; };
$('sens').oninput = () => { input.sens = parseFloat($('sens').value); };
$('shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + '?oda=' + G.roomCode;
  try {
    if (navigator.share) await navigator.share({ title: 'Kaos Adası', text: `Kaos Adası'na gel! Oda kodu: ${G.roomCode}`, url });
    else { await navigator.clipboard.writeText(url); showHint('Davet linki kopyalandı!', 3000); }
  } catch (e) { /* kullanıcı vazgeçti */ }
};

function renderPlayers() {
  const rows = [...G.infos.values()];
  if (!G.isHost) rows.unshift(myInfo());
  $('players').innerHTML = rows.map((i) => `<div><span class="dot" style="background:${esc(i.color)}"></span>${esc(i.name)}${i.id === G.myId ? ' (sen)' : ''}</div>`).join('');
}

const hud = { hp: $('hpBar'), st: $('stBar') };
let fpsT = 0, fpsN = 0;
function updateHUD(dt) {
  const p = G.player;
  hud.hp.style.width = Math.max(0, p.hp) + '%';
  hud.st.style.width = p.stam + '%';
  hud.st.parentElement.classList.toggle('tired', p.exhausted);
  fpsT += dt; fpsN++;
  if (fpsT > 0.5) { const fps = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0; if (DEBUG || $('dbg').dataset.on) $('dbg').textContent = `${fps} FPS · ${G.ch.status().name}`; }
}
$('dbg').onclick = () => { $('dbg').dataset.on = $('dbg').dataset.on ? '' : '1'; if (!$('dbg').dataset.on) $('dbg').textContent = 'FPS'; };

const pv = new THREE.Vector3();
function placeEl(el, x, y, z) {
  pv.set(x, y, z).project(camera);
  if (pv.z > 1 || Math.abs(pv.x) > 1.2 || Math.abs(pv.y) > 1.2) { if (el._vis !== false) { el.style.display = 'none'; el._vis = false; } return false; }
  if (el._vis !== true) { el.style.display = ''; el._vis = true; }
  el.style.transform = `translate(${(((pv.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - pv.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  return true;
}
const floats = [];
function floatText(text, x, y, z, cls) {
  const e = document.createElement('div'); e.className = 'float ' + (cls || ''); e.textContent = text;
  $('labels').appendChild(e);
  floats.push({ e, x: x + (Math.random() - 0.5) * 0.5, y, z, t: 0 });
  if (floats.length > 24) floats.shift().e.remove();
}
function updateLabels(dt) {
  const p = G.player;
  for (const v of G.mobs.views.values()) {
    if (v.showHp > 0 && !v.dead && Math.hypot(v.x - p.x, v.z - p.z) < 35) { if (placeEl(v.el, v.x, v.y + 1.25, v.z)) v.hpEl.style.width = v.hp + '%'; }
    else if (v.el._vis !== false) { v.el.style.display = 'none'; v.el._vis = false; }
  }
  for (const r of G.others.list.values()) {
    if (Math.hypot(r.x - p.x, r.z - p.z) < 70) { if (placeEl(r.el, r.x, r.y + 2.25, r.z)) r.hpEl.style.width = Math.max(0, r.hp) + '%'; }
    else if (r.el._vis !== false) { r.el.style.display = 'none'; r.el._vis = false; }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.y += dt * 1.3;
    placeEl(f.e, f.x, f.y, f.z);
    f.e.style.opacity = f.t < 0.55 ? 1 : Math.max(0, 1 - (f.t - 0.55) / 0.45);
    f.e.style.scale = String(Math.max(1, 1.4 - f.t * 3));
    if (f.t > 1) { f.e.remove(); floats.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- döngü
function step(dt) {
  G.time += dt;
  input.update(dt);
  G.player.update(dt, input, G.yaw);
  handleEvents();
  netTick(dt);
  if (G.mode !== 'play') return;
  updateCamera(dt);
  G.world.update(dt);
  parts.update(dt);
  if (G.ch.hat && G.ch.hat.userData.spin) G.ch.hat.userData.spin.rotation.y += dt * (6 + G.player.speed * 4);
  sky.update(G.hour, camera, G.player);
  updateHUD(dt);
  updateLabels(dt);
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
  if (G.mode === 'play') step(dt);
  else if (G.mode !== 'lost') { if (G.mode === 'joining') checkWelcome(); menuView(dt); }
  renderer.render(scene, camera);
}

// sekme arka plandayken ev sahibi dünyayı yönetmeye devam etsin
(function backgroundTicker() {
  let last = performance.now();
  try {
    const wk = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},50)'], { type: 'text/javascript' })));
    wk.onmessage = () => {
      const now = performance.now(), dt = Math.min(0.2, (now - last) / 1000); last = now;
      if (!document.hidden || G.mode !== 'play') return;
      netTick(dt);
    };
  } catch (e) { /* worker yok */ }
})();

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
addEventListener('beforeunload', (e) => { if (G.mode === 'play' && G.isHost && G.net.peerCount > 0) { e.preventDefault(); e.returnValue = ''; } });
if (DEBUG) { window.KAOS_STEP = (n, dt = 1 / 30) => { for (let i = 0; i < n && G.mode === 'play'; i++) step(dt); }; window.KAOS_INPUT = input; }
setupMenu();
setAmbience(0);
requestAnimationFrame(frame);
