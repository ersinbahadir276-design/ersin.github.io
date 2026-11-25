// Tüm sesler Web Audio ile anlık sentezlenir — hiçbir ses dosyası yok.

let ctx = null, master = null, nbuf = null, windGain = null, droneGain = null;
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);

  const len = ctx.sampleRate * 2;
  nbuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = nbuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  // rüzgâr
  const src = ctx.createBufferSource(); src.buffer = nbuf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  windGain = ctx.createGain(); windGain.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain(); lfoG.gain.value = 220;
  lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
  src.connect(lp); lp.connect(windGain); windGain.connect(master); src.start();

  // gece uğultusu
  droneGain = ctx.createGain(); droneGain.gain.value = 0; droneGain.connect(master);
  [55, 82.4, 110.7].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = i === 1 ? 'triangle' : 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0.12;
    o.connect(g); g.connect(droneGain); o.start();
  });
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.55;
}
export function isMuted() { return muted; }

export function setAmbience(night) {
  if (!ctx) return;
  droneGain.gain.setTargetAtTime(night * 0.1, ctx.currentTime, 2);
  windGain.gain.setTargetAtTime(0.035 + night * 0.035, ctx.currentTime, 2);
}

function env(g, t, vol, a, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noise(dur, { type = 'bandpass', freq = 1000, q = 1, vol = 0.4, a = 0.003, delay = 0, sweep = 0 } = {}) {
  if (!ctx || muted || vol < 0.004) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = nbuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + a + dur);
  const g = ctx.createGain(); env(g, t, vol, a, dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
}

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, a = 0.005, delay = 0 } = {}) {
  if (!ctx || muted || vol < 0.004) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + a + dur);
  const g = ctx.createGain(); env(g, t, vol, a, dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + a + dur + 0.05);
}

export const sfx = {
  swing(v = 1) { noise(0.12, { freq: 1800, q: 0.7, vol: 0.1 * v, sweep: -1200 }); },
  chop(v = 1) { noise(0.09, { freq: 700, q: 2, vol: 0.5 * v }); tone(150, 0.1, { type: 'triangle', vol: 0.32 * v, slide: -60 }); },
  stone(v = 1) { noise(0.07, { freq: 2600, q: 3, vol: 0.42 * v }); tone(950, 0.05, { type: 'square', vol: 0.05 * v, slide: -300 }); },
  bush(v = 1) { noise(0.2, { freq: 3200, type: 'highpass', q: 0.5, vol: 0.14 * v }); },
  hit(v = 1) { noise(0.08, { freq: 420, q: 1, vol: 0.5 * v }); tone(180, 0.1, { type: 'sawtooth', vol: 0.12 * v, slide: -100 }); },
  hurt(v = 1) { tone(230, 0.22, { type: 'sawtooth', vol: 0.18 * v, slide: -140 }); noise(0.1, { freq: 500, vol: 0.3 * v }); },
  eat(v = 1) { for (let i = 0; i < 3; i++) noise(0.05, { freq: 1300, q: 2, vol: 0.22 * v, delay: i * 0.12 }); },
  drink(v = 1) { for (let i = 0; i < 3; i++) tone(420 + i * 110, 0.08, { vol: 0.14 * v, slide: 320, delay: i * 0.11 }); },
  craft() { tone(523, 0.12, { type: 'triangle', vol: 0.18 }); tone(784, 0.22, { type: 'triangle', vol: 0.16, delay: 0.1 }); },
  place(v = 1) { tone(90, 0.2, { type: 'triangle', vol: 0.38 * v, slide: -30 }); noise(0.12, { freq: 300, vol: 0.28 * v }); },
  pickup(v = 1) { tone(620, 0.08, { type: 'triangle', vol: 0.14 * v, slide: 520 }); },
  creak(v = 1) { tone(140, 0.9, { type: 'sawtooth', vol: 0.05 * v, slide: -50, a: 0.2 }); noise(0.8, { freq: 600, q: 6, vol: 0.12 * v, sweep: -300, a: 0.2 }); },
  thud(v = 1) { tone(65, 0.5, { type: 'triangle', vol: 0.45 * v, slide: -25 }); noise(0.35, { freq: 220, vol: 0.4 * v, type: 'lowpass' }); },
  growl(v = 1) { const f = 58 + Math.random() * 30; tone(f, 0.7, { type: 'sawtooth', vol: 0.1 * v, slide: -18, a: 0.12 }); tone(f * 1.51, 0.6, { type: 'square', vol: 0.03 * v, slide: -14, a: 0.12 }); },
  howl(v = 1) { tone(360, 1.5, { type: 'sine', vol: 0.1 * v, slide: 200, a: 0.35 }); },
  grunt(v = 1) { tone(120, 0.18, { type: 'square', vol: 0.06 * v, slide: -40 }); },
  night() { tone(110, 2.6, { type: 'sawtooth', vol: 0.07, slide: -30, a: 0.5 }); tone(155.6, 2.6, { type: 'sawtooth', vol: 0.05, slide: -40, a: 0.5 }); },
  day() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.55, { type: 'triangle', vol: 0.11, delay: i * 0.12 })); },
  step(v = 1) { noise(0.05, { freq: 260 + Math.random() * 220, q: 1.2, vol: 0.07 * v }); },
  splash(v = 1) { noise(0.28, { freq: 900, q: 0.6, vol: 0.2 * v, sweep: -500 }); },
  crackle(v = 1) { noise(0.02, { freq: 2800 + Math.random() * 2200, q: 4, vol: 0.12 * v }); },
  die() { tone(300, 1.3, { type: 'sawtooth', vol: 0.18, slide: -250 }); },
  burn(v = 1) { noise(0.5, { freq: 1500, q: 0.5, vol: 0.22 * v, sweep: -1000 }); },
  task() { [659, 880, 1175].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.13, delay: i * 0.09 })); },
  yelp(v = 1) { tone(900, 0.18, { type: 'triangle', vol: 0.12 * v, slide: 500 }); tone(1300, 0.12, { type: 'sine', vol: 0.06 * v, slide: -400, delay: 0.08 }); },
  bite(v = 1) { noise(0.06, { freq: 1800, q: 2, vol: 0.3 * v }); tone(140, 0.12, { type: 'square', vol: 0.08 * v, slide: -60 }); },
  pow(v = 1) { tone(220, 0.15, { type: 'square', vol: 0.12 * v, slide: -120 }); noise(0.1, { freq: 900, vol: 0.4 * v }); },
  boing(v = 1) { tone(180, 0.35, { type: 'sine', vol: 0.18 * v, slide: 420 }); },
  ui() { tone(880, 0.04, { type: 'square', vol: 0.04 }); },
  deny() { tone(160, 0.12, { type: 'square', vol: 0.06, slide: -40 }); },
};

export function att(d, max = 45) { return Math.max(0, 1 - d / max); }
