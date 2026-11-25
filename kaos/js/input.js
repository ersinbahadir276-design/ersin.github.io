// Klavye + fare + dokunmatik (sol joystick, sağdan kamera sürükleme, butonlar) tek bir girdi durumunda birleşir.

export class Input {
  constructor(canvas, touchLayer) {
    this.canvas = canvas;
    this.keys = {};
    this.move = { x: 0, y: 0, mag: 0 };   // x: sağ, y: ileri
    this.look = { dx: 0, dy: 0 };
    this.pressed = new Set();             // bu karede basılan eylemler
    this.held = new Set();                // basılı tutulan eylemler
    this.locked = false;
    this.touchMode = false;
    this.sens = 1;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, edgeT: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.attackDown = 0;
    this.enabled = true;
    this._bindKeyboard();
    this._bindMouse();
    if (touchLayer) this._bindTouch(touchLayer);
  }

  _bindKeyboard() {
    const map = { Space: 'jump', KeyC: 'crouch', ControlLeft: 'crouch', KeyQ: 'roll', KeyG: 'dance', KeyE: 'interact', KeyF: 'interact', KeyV: 'camera', KeyB: 'build', KeyR: 'rotate', Escape: 'escape' };
    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      this.keys[e.code] = true;
      if (!e.repeat && map[e.code]) this.pressed.add(map[e.code]);
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.held.clear(); });
  }

  _bindMouse() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (this.touchMode || !this.enabled) return;
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) { this.attackDown = performance.now(); this.held.add('attack'); }
      if (e.button === 2) this.pressed.add('heavy');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.held.has('attack')) { this.held.delete('attack'); this._releaseAttack(); }
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.dx += Math.max(-250, Math.min(250, e.movementX)) * 0.0025 * this.sens;
      this.look.dy += Math.max(-250, Math.min(250, e.movementY)) * 0.0025 * this.sens;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === c; if (this.onLockChange) this.onLockChange(this.locked); });
  }

  requestLock() {
    if (this.touchMode) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* desteklenmiyor */ }
  }

  // Saldırı: kısa basış = hafif vuruş, uzun basış (0.35 sn+) = ağır vuruş
  _releaseAttack() {
    const held = performance.now() - this.attackDown;
    this.pressed.add(held > 350 ? 'heavy' : 'attack');
  }

  _bindTouch(layer) {
    this.touchLayer = layer;
    const joyBase = layer.querySelector('#joyBase'), joyKnob = layer.querySelector('#joyKnob');
    this.joyBase = joyBase; this.joyKnob = joyKnob;
    const R = 60;
    layer.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.enabled) return;
      this.setTouchMode(true);
      if (e.target.closest('.tbtn')) return;
      if (e.clientX < innerWidth * 0.45 && this.joy.id === null) {
        this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY; this.joy.x = 0; this.joy.y = 0;
        joyBase.style.transform = `translate(${e.clientX - R}px, ${e.clientY - R}px)`;
        joyKnob.style.transform = 'translate(0px, 0px)';
        joyBase.classList.add('on');
      } else if (this.lookTouch.id === null) {
        this.lookTouch.id = e.pointerId; this.lookTouch.x = e.clientX; this.lookTouch.y = e.clientY;
      }
      layer.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joy.id) {
        let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.joy.x = dx / R; this.joy.y = -dy / R;
        joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (e.pointerId === this.lookTouch.id) {
        this.look.dx += (e.clientX - this.lookTouch.x) * 0.0065 * this.sens;
        this.look.dy += (e.clientY - this.lookTouch.y) * 0.0065 * this.sens;
        this.lookTouch.x = e.clientX; this.lookTouch.y = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.joy.id) { this.joy.id = null; this.joy.x = 0; this.joy.y = 0; joyBase.classList.remove('on'); }
      if (e.pointerId === this.lookTouch.id) this.lookTouch.id = null;
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);

    // butonlar
    layer.querySelectorAll('.tbtn').forEach((b) => {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        this.setTouchMode(true);
        b.classList.add('down');
        if (act === 'attack') { this.attackDown = performance.now(); this.held.add('attack'); }
        else { this.pressed.add(act); this.held.add(act); }
      });
      const up = (e) => {
        b.classList.remove('down');
        if (act === 'attack' && this.held.has('attack')) { this.held.delete('attack'); this._releaseAttack(); }
        else this.held.delete(act);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.body.classList.toggle('touch', on);
    if (this.onModeChange) this.onModeChange(on);
  }

  // Her karenin başında: hareket vektörünü hesapla
  update(dt) {
    let x = 0, y = 0;
    if (this.enabled) {
      if (this.keys.KeyW || this.keys.ArrowUp) y += 1;
      if (this.keys.KeyS || this.keys.ArrowDown) y -= 1;
      if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) x += 1;
    }
    let mag = Math.hypot(x, y);
    let kb = mag > 0;
    if (kb) { x /= mag; y /= mag; mag = 1; }
    else if (this.joy.id !== null) { x = this.joy.x; y = this.joy.y; mag = Math.min(1, Math.hypot(x, y)); if (mag < 0.12) { x = y = 0; mag = 0; } }
    this.move.x = x; this.move.y = y; this.move.mag = mag;
    // joystick kenara dayalı tutulursa depar
    if (!kb && mag > 0.93) this.joy.edgeT += dt; else this.joy.edgeT = 0;
    this.sprint = (kb && (this.keys.ShiftLeft || this.keys.ShiftRight)) || this.joy.edgeT > 0.6;
    this.walkOnly = kb && (this.keys.AltLeft || this.keys.AltRight);
  }

  consume(a) { if (this.pressed.has(a)) { this.pressed.delete(a); return true; } return false; }

  endFrame() { this.look.dx = 0; this.look.dy = 0; this.pressed.clear(); }
}
