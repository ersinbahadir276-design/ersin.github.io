// Yerel oyuncu: fizik, hareket ve animasyon durum makinesi.
import { HALF, WATER } from './world.js';
import { ONESHOT } from './character.js';

const SPEED = { walk: 1.9, run: 4.6, sprint: 7.2, crouch: 1.5, swim: 2.6 };
const GRAV = 22, JUMP_V = 7.4;
const FLOAT_Y = WATER - 1.25; // yüzerken ayak yüksekliği

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Player {
  constructor(world, ch) {
    this.world = world;
    this.ch = ch;
    const s = world.spawn;
    this.x = s.x; this.z = s.z; this.y = world.heightAt(s.x, s.z);
    this.vx = 0; this.vy = 0; this.vz = 0; this.ry = 0;
    this.onGround = true; this.airT = 0; this.swim = false; this.crouch = false; this.dance = false;
    this.state = 'move'; this.stateT = 0; // move | attack | heavy | roll | hit | land | dead
    this.hp = 100; this.stam = 100; this.exhausted = false; this.lastHurt = -99; this.time = 0;
    this.speed = 0; this.sprinting = false;
    this.rollDx = 0; this.rollDz = 0;
    this.events = []; // ses/efekt için: 'jump','land','step','attack','heavy','roll','splash','hurt','die'
    this.stepD = 0;
    this.radius = 0.35;
  }

  get busy() { return this.state !== 'move'; }

  hurt(amount, kx = 0, kz = 0, src = '', lift = 0) {
    if (this.state === 'dead' || this.state === 'roll') return false; // yuvarlanırken hasar yok
    this.hp -= amount; if (amount > 0) this.lastHurt = this.time;
    this.vx += kx * 6; this.vz += kz * 6;
    if (lift > 0 && !this.swim) { this.vy = lift; this.onGround = false; this.y += 0.05; }
    this.events.push('hurt');
    if (this.hp <= 0) { this.die(src); return true; }
    this.state = 'hit'; this.stateT = 0.42; this.dance = false;
    this.ch.play('hit', ONESHOT.hit);
    return true;
  }

  die(src) {
    if (this.state === 'dead') return;
    this.hp = 0; this.state = 'dead'; this.stateT = 0; this.deathSrc = src;
    this.ch.play('death', ONESHOT.death);
    this.events.push('die');
  }

  respawn() {
    const s = this.world.spawn;
    this.x = s.x + (Math.random() - 0.5) * 3; this.z = s.z + (Math.random() - 0.5) * 3;
    this.y = this.world.heightAt(this.x, this.z) + 0.3;
    this.vx = this.vy = this.vz = 0;
    this.hp = 100; this.stam = 100; this.state = 'move'; this.crouch = false; this.dance = false;
    this.ch.release();
  }

  update(dt, input, camYaw) {
    const W = this.world, ch = this.ch;
    this.time += dt;
    if (this.stateT > 0) this.stateT -= dt;
    const alive = this.state !== 'dead';

    // --- girdi -> istenen hareket yönü (kameraya göre)
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -fz, rz = fx;
    let mx = 0, mz = 0, mag = 0;
    if (alive) {
      mx = fx * input.move.y + rx * input.move.x;
      mz = fz * input.move.y + rz * input.move.x;
      mag = Math.min(1, Math.hypot(mx, mz));
    }
    const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }

    // --- eylemler
    if (alive && this.state === 'move') {
      if (input.consume('crouch')) { this.crouch = !this.crouch; this.dance = false; }
      if (input.consume('dance')) { this.dance = !this.dance; this.crouch = false; }
      if (input.consume('jump') && (this.onGround || this.swim)) {
        if (this.swim) { this.vy = 4.5; }
        else { this.vy = JUMP_V; this.crouch = false; }
        this.onGround = false; this.swim = false; this.y += 0.05; this.dance = false;
        ch.play('jump', ONESHOT.jump);
        this.events.push('jump');
      } else if (input.consume('roll') && this.onGround && this.stam >= 18) {
        this.stam -= 18; this.dance = false; this.crouch = false;
        this.state = 'roll'; this.stateT = 0.85;
        let dx = mx, dz = mz;
        if (mag < 0.1) { dx = Math.sin(this.ry); dz = Math.cos(this.ry); }
        this.rollDx = dx; this.rollDz = dz; this.ry = Math.atan2(dx, dz);
        ch.play('roll', ONESHOT.roll);
        this.events.push('roll');
      } else if (input.consume('heavy')) {
        this.state = 'heavy'; this.stateT = 1.53 / 1.35; this.dance = false; this.hitDone = false; this.atkE = 0;
        this.ry = camYaw;
        ch.play('heavy', ONESHOT.heavy);
        this.events.push('heavy');
      } else if (input.consume('attack')) {
        this.state = 'attack'; this.stateT = 0.87 / 1.7; this.dance = false; this.hitDone = false; this.atkE = 0;
        this.ry = camYaw;
        ch.play('attack', ONESHOT.attack);
        this.events.push('attack');
      }
    } else {
      input.consume('jump'); input.consume('attack'); input.consume('heavy'); input.consume('roll');
    }
    // vuruşun isabet anı (animasyonda yumruğun/kolun öne indiği kare)
    if ((this.state === 'attack' || this.state === 'heavy') && !this.hitDone) {
      this.atkE += dt;
      if (this.atkE >= (this.state === 'attack' ? 0.2 : 0.5)) { this.hitDone = true; this.events.push(this.state === 'attack' ? 'impactJab' : 'impactHeavy'); }
    }
    if (this.state !== 'move' && this.state !== 'dead' && this.stateT <= 0) this.state = 'move';
    if (this.dance && mag > 0.1) this.dance = false;

    // --- hız
    if (input.sprint && mag > 0.5 && !this.crouch && !this.exhausted && this.stam > 0) this.sprinting = true; else this.sprinting = false;
    let want = 0;
    if (mag > 0) {
      if (this.swim) want = SPEED.swim;
      else if (this.crouch) want = SPEED.crouch * Math.min(1, mag * 1.4);
      else if (this.sprinting) want = SPEED.sprint;
      else if (input.walkOnly || mag < 0.55) want = SPEED.walk * Math.max(0.5, mag / 0.55);
      else want = SPEED.run;
    }
    if (this.state === 'attack' || this.state === 'heavy' || this.state === 'land') want *= 0.3;
    if (this.state === 'hit' || !alive) want = 0;
    let tvx = mx * want, tvz = mz * want;
    if (this.state === 'roll') { const rs = this.stateT > 0.25 ? 7.5 : 2.5; tvx = this.rollDx * rs; tvz = this.rollDz * rs; }
    // vururken bir adım öne atıl
    if ((this.state === 'attack' || this.state === 'heavy') && !this.hitDone) { const f = this.state === 'heavy' ? 3.2 : 2.2; tvx += Math.sin(this.ry) * f; tvz += Math.cos(this.ry) * f; }
    const acc = this.onGround || this.swim ? (this.state === 'roll' ? 20 : 11) : 2.5;
    this.vx += (tvx - this.vx) * Math.min(1, acc * dt);
    this.vz += (tvz - this.vz) * Math.min(1, acc * dt);

    // --- dikey
    const gh = W.heightAt(this.x, this.z);
    const deep = gh < FLOAT_Y - 0.15;
    if (deep && this.y <= FLOAT_Y + 0.05 && this.vy <= 0.5) {
      if (!this.swim) { this.events.push('splash'); this.crouch = false; }
      this.swim = true; this.onGround = false; this.vy = 0; this.airT = 0;
      this.y = lerp(this.y, FLOAT_Y + Math.sin(this.time * 2.2) * 0.04, Math.min(1, dt * 6));
    } else {
      this.swim = false;
      const snap = 0.5 + Math.hypot(this.vx, this.vz) * dt * 1.8; // yokuş aşağı inerken yere yapış
      if (this.onGround && this.vy <= 0 && this.y - gh < snap) { this.y = gh; this.vy = 0; }
      else {
        this.vy -= GRAV * dt;
        this.y += this.vy * dt;
        if (this.y <= gh) {
          const impactV = -this.vy;
          this.y = gh; this.vy = 0;
          if (!this.onGround) this.onLand(impactV);
          this.onGround = true; this.airT = 0;
        } else { this.onGround = false; this.airT += dt; }
      }
    }

    // --- yatay + çarpışma
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    // çok dik yamaçlara tırmanılamaz (yaklaşık 52°)
    if (this.onGround && !this.swim) {
      const step = Math.hypot(nx - this.x, nz - this.z);
      if (step > 1e-4 && (W.heightAt(nx, nz) - gh) / step > 1.3) {
        // yamaç boyunca kaymayı dene
        if ((W.heightAt(nx, this.z) - gh) / Math.max(1e-4, Math.abs(nx - this.x)) <= 1.3) nz = this.z;
        else if ((W.heightAt(this.x, nz) - gh) / Math.max(1e-4, Math.abs(nz - this.z)) <= 1.3) nx = this.x;
        else { nx = this.x; nz = this.z; }
      }
    }
    const c = W.collide(nx, nz, this.radius);
    nx = c.x; nz = c.z;
    const rr = Math.hypot(nx, nz), lim = HALF - 6;
    if (rr > lim) { nx *= lim / rr; nz *= lim / rr; }
    const moved = Math.hypot(nx - this.x, nz - this.z);
    this.x = nx; this.z = nz;
    this.speed = moved / Math.max(dt, 1e-4);

    // --- yön
    if (alive) {
      if (this.state === 'attack' || this.state === 'heavy') this.ry = lerpAngle(this.ry, camYaw, Math.min(1, dt * 20));
      else if (this.state !== 'roll' && mag > 0.1) this.ry = lerpAngle(this.ry, Math.atan2(mx, mz), Math.min(1, dt * 12));
    }

    // --- dayanıklılık & can
    if (this.sprinting && this.speed > 3) this.stam -= 18 * dt; else this.stam += 15 * dt;
    if (this.swim && mag > 0) this.stam -= 4 * dt;
    this.stam = Math.max(0, Math.min(100, this.stam));
    if (this.stam <= 0) this.exhausted = true; else if (this.stam > 30) this.exhausted = false;
    if (alive && this.time - this.lastHurt > 5) this.hp = Math.min(100, this.hp + 2 * dt);

    // --- adım sesleri
    if (this.onGround && this.speed > 1) { this.stepD += moved; if (this.stepD > (this.sprinting ? 2.4 : 1.8)) { this.stepD = 0; this.events.push('step'); } }

    // --- temel animasyon seçimi
    this.pickBase();
    ch.root.position.set(this.x, this.y, this.z);
    ch.root.rotation.y = this.ry;
    ch.update(dt);
  }

  onLand(v) {
    if (this.state === 'dead') return;
    if (v > 15) { this.hurt(Math.round((v - 15) * 5), 0, 0, 'fall'); if (this.state === 'dead') return; }
    if (this.airT > 0.3 || v > 6) {
      this.events.push('land');
      if (this.speed < 2.5 && this.state === 'move') {
        this.state = 'land'; this.stateT = 0.32;
        this.ch.play('land', ONESHOT.land);
      }
    }
  }

  pickBase() {
    const ch = this.ch, s = this.speed;
    if (this.state === 'dead') return;
    if (this.swim) { ch.setBase(s > 0.4 ? 'swim' : 'swimIdle', s > 0.4 ? Math.max(0.7, s / SPEED.swim) : 1); return; }
    if (!this.onGround && (this.airT > 0.12 || this.vy > 0)) { ch.setBase('fall'); return; }
    if (this.crouch) { ch.setBase(s > 0.3 ? 'crouchWalk' : 'crouch', s > 0.3 ? Math.max(0.6, s / SPEED.crouch) : 1); return; }
    if (this.dance) { ch.setBase('dance'); return; }
    if (s < 0.35) ch.setBase('idle');
    else if (s < 3.0) ch.setBase('walk', Math.max(0.6, s / SPEED.walk));
    else if (s < 5.9) ch.setBase('run', Math.max(0.7, s / SPEED.run));
    else ch.setBase('sprint', Math.max(0.8, s / SPEED.sprint));
  }
}
