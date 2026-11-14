// 玩家角色：圆头圆脑的小人，会走、会坐、会躺。模型零件见 charparts.js（眼睛、头发）和 shapes.js（软垫、车床体）。
import * as THREE from 'three';
import { damp, lerpAngle, mat, stepPathNav } from './util.js';
import { Kit, soft, pillow, lathe, rounded, fabric, weld } from './shapes.js';
import { eyeTex, makeEye, blush, lockGeo, placeYXZ, hairMat, ribbedRing } from './charparts.js';

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
    const r = this.root;
    const skin = new THREE.MeshPhysicalMaterial({ color: '#ffe1c8', roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color('#ffd2c2'), sheenRoughness: 0.6 });
    const hair = hairMat('#5d3b2b', '#c88a62');
    const dress = fabric('#f7c96b', { sheen: '#fff2c8' }), white = fabric('#fffaf0', { sheen: '#ffffff' }), pink = fabric('#f2a9a0', { sheen: '#ffe0da' });
    const red = new THREE.MeshPhysicalMaterial({ color: '#e2574c', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const sole = mat('#8a4a3a', { roughness: 0.7 }), gold = mat('#f6cf6b', { roughness: 0.3, metalness: 0.5 });
    const body = this.body = new THREE.Group(); r.add(body);

    // 腿：白袜子（罗纹袜口）+ 红色漆皮玛丽珍鞋（鞋底、脚背带、小金扣）
    this.legs = [-1, 1].map((sx) => {
      const p = new THREE.Group(); p.position.set(sx * 0.12, 0.4, 0);
      const k = new Kit();
      k.add(new THREE.CapsuleGeometry(0.066, 0.18, 4, 14), skin, 0, -0.14, 0);
      k.add(new THREE.CylinderGeometry(0.072, 0.07, 0.13, 18), white, 0, -0.265, 0);
      k.add(ribbedRing(0.073, 0.015, 14, 40), white, 0, -0.2, 0, Math.PI / 2);
      k.add(soft(0.15, 0.1, 0.22, { e: 0.38, puff: 0.12, seg: 8 }), red, 0, -0.335, 0.035);
      k.add(soft(0.16, 0.026, 0.235, { e: 0.22, puff: 0.02, seg: 6 }), sole, 0, -0.383, 0.035);
      k.add(new THREE.TorusGeometry(0.076, 0.011, 6, 20, Math.PI), red, 0, -0.298, 0, Math.PI / 2);
      k.add(new THREE.SphereGeometry(0.015, 10, 8), gold, sx * 0.077, -0.298, 0);
      p.add(k.build()); body.add(p); return p;
    });

    // 连衣裙：腰以下一道道褶，下摆一圈白色花边；腰上一条白缎带，正面打个粉色蝴蝶结；两颗扣子、一个小口袋
    const pleat = (a, y) => 1 + 0.045 * Math.max(0, Math.min(1, (0.62 - y) / 0.24)) * Math.sin(a * 14);
    const pleated = (geo) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = pleat(Math.atan2(z, x), p.getY(i)); p.setX(i, x * k); p.setZ(i, z * k); }
      return weld(geo);
    };
    const dk = new Kit();
    dk.add(pleated(lathe([[0, 0.36], [0.39, 0.36], [0.405, 0.375], [0.37, 0.45], [0.31, 0.55], [0.27, 0.63], [0.275, 0.7], [0.285, 0.8], [0.265, 0.88], [0.21, 0.94], [0.13, 0.975], [0, 0.98]], 56)), dress);
    dk.add(pleated(new THREE.TorusGeometry(0.4, 0.02, 8, 112).rotateX(Math.PI / 2).translate(0, 0.37, 0)), white);
    dk.add(new THREE.TorusGeometry(0.272, 0.02, 8, 48), white, 0, 0.635, 0, Math.PI / 2);
    for (const s of [-1, 1]) dk.add(pillow(0.085, 0.06, 0.03), pink, s * 0.045, 0.64, 0.285, 0, s * 0.35, s * 0.35);
    dk.add(new THREE.SphereGeometry(0.02, 10, 8), pink, 0, 0.64, 0.293);
    for (const s of [-1, 1]) dk.add(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), pink, s * 0.03, 0.59, 0.29, 0.15, 0, s * 0.35);
    for (const y of [0.79, 0.72]) dk.add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 14), white, 0, y, 0.283, Math.PI / 2);
    dk.add(rounded(0.1, 0.085, 0.015, 0.012, 1), dress, 0.155, 0.47, 0.335, -0.2, 0.45, 0);
    dk.add(rounded(0.1, 0.012, 0.018, 0.005, 1), white, 0.157, 0.51, 0.326, -0.2, 0.45, 0);
    body.add(dk.build());

    // 胳膊：泡泡袖 + 白色罗纹袖口 + 胳膊 + 软乎乎的小手（带大拇指）
    this.arms = [-1, 1].map((sx) => {
      const p = new THREE.Group(); p.position.set(sx * 0.3, 0.86, 0); p.rotation.z = sx * 0.28;
      const k = new Kit();
      k.add(soft(0.17, 0.16, 0.17, { e: 0.55, puff: 0.12, seg: 8 }), dress, 0, -0.04, 0);
      k.add(ribbedRing(0.058, 0.014, 12, 32), white, 0, -0.115, 0, Math.PI / 2);
      k.add(new THREE.CapsuleGeometry(0.046, 0.1, 4, 12), skin, 0, -0.18, 0);
      k.add(soft(0.1, 0.11, 0.08, { e: 0.5, puff: 0.1, seg: 8 }), skin, 0, -0.29, 0.005);
      k.add(new THREE.SphereGeometry(0.026, 12, 10), skin, -sx * 0.03, -0.27, 0.04);
      p.add(k.build()); body.add(p); return p;
    });

    // 头：脸颊下半边肉嘟嘟
    const head = this.head = new THREE.Group(); head.position.set(0, 1.22, 0); body.add(head);
    const hk = new Kit();
    const hg = new THREE.SphereGeometry(0.4, 36, 26), hp = hg.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const y = hp.getY(i) / 0.4, k = 1 + 0.06 * Math.exp(-(((y + 0.35) / 0.3) ** 2));
      hp.setXYZ(i, hp.getX(i) * k, hp.getY(i) * 0.95, hp.getZ(i) * k * 0.96);
    }
    hg.computeVertexNormals();
    hk.add(hg, skin);
    for (const sx of [-1, 1]) hk.add(new THREE.SphereGeometry(0.07, 14, 10), skin, sx * 0.39, -0.05, -0.02, 0, 0, 0, [0.55, 1, 0.8]);
    hk.add(new THREE.SphereGeometry(0.022, 12, 8), mat('#f7c4a6', { roughness: 0.5 }), 0, -0.085, 0.372, 0, 0, 0, [1.3, 0.8, 0.7]);
    const smile = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.045, -0.13, 0.356), new THREE.Vector3(0, -0.168, 0.372), new THREE.Vector3(0.045, -0.13, 0.356));
    hk.add(new THREE.TubeGeometry(smile, 14, 0.0085, 6), mat('#b8574c', { roughness: 0.5 }));

    // 头发：一顶发帽 + 后脑勺的蓬松 + 一缕缕刘海和鬓发 + 头顶一根翘起来的呆毛
    hk.add(new THREE.SphereGeometry(0.43, 36, 14, 0, Math.PI * 2, 0, Math.PI * 0.43), hair, 0, 0.02, 0, -0.42);
    hk.add(new THREE.SphereGeometry(0.41, 28, 18), hair, 0, -0.03, -0.075, 0, 0, 0, [1.04, 0.95, 0.94]);
    const lock = (phi, el, R, len, w, d, rx, curl, twist, bow) => {
      const g = lockGeo(len, w, d, curl, twist, bow);
      hk.add(placeYXZ(g, R * Math.cos(el) * Math.sin(phi), R * Math.sin(el) + 0.02, R * Math.cos(el) * Math.cos(phi), rx, phi, 0), hair);
    };
    [[-0.82, 0.31, 0.15, 0.06], [-0.55, 0.29, 0.15, -0.05], [-0.27, 0.27, 0.16, 0.05], [0.02, 0.25, 0.16, -0.04], [0.29, 0.27, 0.16, 0.05], [0.56, 0.29, 0.15, -0.05], [0.83, 0.31, 0.15, -0.06]]
      .forEach(([phi, len, w, tw]) => lock(phi, 0.86, 0.425, len, w, 0.075, -0.44, -0.12, tw, 0.07));
    for (const sx of [-1, 1]) {
      lock(sx * 1.12, 0.5, 0.44, 0.44, 0.15, 0.08, 0.05, -0.1, -sx * 0.06, 0.11);
      lock(sx * 1.45, 0.45, 0.44, 0.4, 0.15, 0.08, 0.12, -0.08, 0, 0.1);
    }
    for (const phi of [2.3, 2.75, 3.14, 3.53, 3.98]) lock(phi, 0.2, 0.43, 0.3, 0.17, 0.08, 0.35, -0.05, 0, 0.08);
    hk.add(placeYXZ(lockGeo(0.17, 0.05, 0.03, 0.55), 0.02, 0.44, 0.04, Math.PI - 0.3, 0.4, 0), hair);
    // 两个盘起来的发髻（一圈圈螺旋），底下套着粉色发圈
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 70; i++) { const t = i / 70, a = t * Math.PI * 2 * 2.6 * sx, rr = 0.115 * (1 - t * 0.78); pts.push(new THREE.Vector3(Math.cos(a) * rr, 0.02 + t * 0.15, Math.sin(a) * rr)); }
      const place = (g) => placeYXZ(g, sx * 0.27, 0.33, -0.05, -0.15, 0, -sx * 0.7);
      hk.add(place(new THREE.SphereGeometry(0.115, 18, 14).translate(0, 0.08, 0)), hair);
      hk.add(place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.048, 8)), hair);
      hk.add(place(ribbedRing(0.115, 0.03, 16, 48).rotateX(Math.PI / 2)), pink);
    }
    head.add(hk.build());

    // 眼睛（会眨）、睫毛、腮红
    const eyeT = eyeTex('#4a2c20', '#b0703f');
    this.eyes = [-1, 1].map((sx) => {
      const e = makeEye(0.105, 0.14, 0.028, eyeT, { side: sx, r: 0.0075 });
      e.position.set(sx * 0.15, -0.015, 0.345); e.rotation.set(-0.05, sx * 0.38, 0);
      head.add(e); return e;
    });
    for (const sx of [-1, 1]) {
      const b = blush(0.13, 0.075); b.position.set(sx * 0.245, -0.115, 0.292); b.rotation.y = sx * 0.62; head.add(b);
    }
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
        const d = stepPathNav(this.pos, this.path, SPEED, dt, this.nav, this);
        if (d.blocked) this.onArrive = null;
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
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, ey, 25, dt);
  }
}

const UP = new THREE.Vector3(0, 0.62, 0);
