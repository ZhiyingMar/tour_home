// 玩家角色：圆头圆脑的小人，会走、会坐、会躺。
import * as THREE from 'three';
import { damp, lerpAngle, ball, cyl, at, mat, stepPath } from './util.js';

const SPEED = 2.7;

export class Player {
  constructor(scene, nav) {
    this.nav = nav;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.pos = this.root.position;
    this.path = []; this.onArrive = null;
    this.state = 'idle'; // idle | walk | sit | lie
    this.keys = { x: 0, z: 0 };
    this.yaw = 0; this.phase = 0; this.tw = null; this.back = null;
    this.onStep = null;
    this.build();
    scene.add(this.root);
  }

  build() {
    const r = this.root, skin = '#ffe1c6', hair = '#5d3b2b', dress = '#f7c96b';
    const body = this.body = new THREE.Group(); r.add(body);
    this.legs = [-1, 1].map((sx) => {
      const p = new THREE.Group(); p.position.set(sx * 0.12, 0.4, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 4, 10), mat(skin)); leg.castShadow = true;
      p.add(at(leg, 0, -0.17, 0));
      p.add(at(ball(0.1, '#e2574c', 1, 0.75, 1.35), 0, -0.34, 0.04));
      body.add(p); return p;
    });
    body.add(at(ball(0.3, dress, 1, 1.15, 0.92), 0, 0.68, 0));
    body.add(at(cyl(0.2, 0.37, 0.3, dress, 22), 0, 0.5, 0));
    body.add(at(cyl(0.16, 0.16, 0.05, '#fff6e6', 18), 0, 0.93, 0));
    this.arms = [-1, 1].map((sx) => {
      const p = new THREE.Group(); p.position.set(sx * 0.3, 0.86, 0); p.rotation.z = sx * 0.28;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.2, 4, 10), mat(dress)); arm.castShadow = true;
      p.add(at(arm, 0, -0.15, 0));
      p.add(at(ball(0.075, skin), 0, -0.32, 0));
      body.add(p); return p;
    });
    const head = this.head = new THREE.Group(); head.position.set(0, 1.22, 0); body.add(head);
    head.add(ball(0.4, skin, 1, 0.95, 0.96));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.435, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), mat(hair));
    cap.castShadow = true; cap.rotation.x = -0.42; cap.position.y = 0.02; head.add(cap);
    head.add(at(ball(0.2, hair, 1.7, 0.55, 0.5), 0, 0.26, 0.27));
    for (const sx of [-1, 1]) {
      head.add(at(ball(0.16, hair), sx * 0.3, 0.4, -0.06));
      head.add(at(ball(0.06, '#f2a9a0'), sx * 0.3, 0.29, 0.06));
    }
    this.eyes = [-1, 1].map((sx) => {
      const e = ball(0.055, '#3a2a26', 1, 1.35, 0.5, { roughness: 0.3 }); e.castShadow = false;
      head.add(at(e, sx * 0.15, -0.02, 0.365));
      const hl = ball(0.018, new THREE.MeshBasicMaterial({ color: '#fff' })); hl.castShadow = false;
      e.add(at(hl, 0.015, 0.02, 0.05));
      return e;
    });
    for (const sx of [-1, 1]) {
      const b = ball(0.07, new THREE.MeshBasicMaterial({ color: '#ffb3a6', transparent: true, opacity: 0.75 }), 1, 0.6, 0.25);
      b.castShadow = false; head.add(at(b, sx * 0.25, -0.12, 0.31));
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), mat('#b8574c'));
    mouth.rotation.z = Math.PI; head.add(at(mouth, 0, -0.12, 0.385));
  }

  get posed() { return this.state === 'sit' || this.state === 'lie'; }
  get busy() { return this.posed || !!this.tw; }

  walkTo(x, z, cb) {
    if (this.busy) return;
    this.path = this.nav.path({ x: this.pos.x, z: this.pos.z }, { x, z });
    this.onArrive = cb || null;
    if (!this.path.length && cb) { this.onArrive = null; cb(); }
  }

  stop() { this.path = []; this.onArrive = null; }

  tween(to, yaw, dur, arc, done) {
    this.tw = { from: this.pos.clone(), to, yaw, t: 0, dur, arc, done };
  }

  sit(seat) {
    this.stop(); this.back = { x: this.pos.x, z: this.pos.z }; this.state = 'sit';
    this.tween(new THREE.Vector3(seat.x, seat.y, seat.z), 0, 0.45, 0.3);
  }

  lie(spot) {
    this.stop(); this.back = { x: this.pos.x, z: this.pos.z }; this.state = 'lie';
    this.tween(new THREE.Vector3(spot.x, spot.y, spot.z), 0, 0.6, 0.45);
  }

  stand(done) {
    if (!this.posed) { done && done(); return; }
    this.state = 'idle';
    this.tween(new THREE.Vector3(this.back.x, 0, this.back.z), this.yaw, 0.4, 0.3, done);
  }

  headPos(out) { return this.head.getWorldPosition(out).add(UP); }

  update(dt, t) {
    let moving = false;
    if (this.tw) {
      const w = this.tw; w.t = Math.min(1, w.t + dt / w.dur);
      const k = w.t * w.t * (3 - 2 * w.t);
      this.pos.lerpVectors(w.from, w.to, k);
      this.pos.y += Math.sin(k * Math.PI) * w.arc;
      this.yaw = lerpAngle(this.yaw, w.yaw, Math.min(1, dt * 10));
      if (w.t >= 1) { this.tw = null; w.done && w.done(); }
    } else if (!this.posed) {
      const kx = this.keys.x, kz = this.keys.z;
      if (kx || kz) {
        this.stop();
        const l = Math.hypot(kx, kz), dx = kx / l, dz = kz / l;
        const nx = this.pos.x + dx * SPEED * dt, nz = this.pos.z + dz * SPEED * dt;
        if (this.nav.walkable(nx, this.pos.z)) this.pos.x = nx;
        if (this.nav.walkable(this.pos.x, nz)) this.pos.z = nz;
        this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 12));
        moving = true;
      } else if (this.path.length) {
        const d = stepPath(this.pos, this.path, SPEED, dt);
        if (d.dx || d.dz) this.yaw = lerpAngle(this.yaw, Math.atan2(d.dx, d.dz), Math.min(1, dt * 12));
        moving = true;
      }
      this.state = moving ? 'walk' : 'idle';
      // 到站回调放在最后：它可能把状态改成坐下 / 躺下
      if (moving && !this.path.length && this.onArrive) { const cb = this.onArrive; this.onArrive = null; cb(); }
    }

    // 姿势
    const sit = this.state === 'sit', lie = this.state === 'lie';
    if (moving) {
      const before = Math.sin(this.phase);
      this.phase += dt * 10.5;
      if (before * Math.sin(this.phase) < 0 && this.onStep) this.onStep();
    } else this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 12, dt);
    const sw = Math.sin(this.phase), amp = moving ? 1 : 0;
    const legBase = sit ? -1.42 : 0;
    this.legs[0].rotation.x = damp(this.legs[0].rotation.x, legBase + sw * 0.75 * amp, 14, dt);
    this.legs[1].rotation.x = damp(this.legs[1].rotation.x, legBase - sw * 0.75 * amp, 14, dt);
    this.arms[0].rotation.x = damp(this.arms[0].rotation.x, -sw * 0.65 * amp + (sit ? -0.5 : 0), 14, dt);
    this.arms[1].rotation.x = damp(this.arms[1].rotation.x, sw * 0.65 * amp + (sit ? -0.5 : 0), 14, dt);
    this.body.position.y = Math.abs(sw) * 0.06 * amp + (moving ? 0 : Math.sin(t * 1.8) * 0.012);
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = damp(this.root.rotation.x, lie ? -Math.PI / 2 : sit ? -0.16 : 0, 7, dt);
    this.head.rotation.z = damp(this.head.rotation.z, sit ? Math.sin(t * 0.6) * 0.1 : 0, 4, dt);
    this.head.rotation.x = damp(this.head.rotation.x, sit ? 0.12 : 0, 4, dt);
    // 眨眼；躺下就闭眼
    const blink = (t % 3.7) < 0.12 ? 0.1 : 1;
    const ey = lie ? 0.1 : blink;
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, 1.35 * ey, 25, dt);
  }
}

const UP = new THREE.Vector3(0, 0.62, 0);
