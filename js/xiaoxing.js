// 小星：拟人站姿的小松鼠，尾巴是一颗装着星空的圆球。自己闲逛、跟着主人、趴沙发扶手、窝在壁炉旁。
import * as THREE from 'three';
import { damp, lerp, lerpAngle, rand, pick, rng, canvasTex, ball, at, glowTex, sparkTex, stepPathNav } from './util.js';
import { hourNow, periodName } from './time.js';

const ARM = new THREE.Vector3(-1.0, 0.98, -2.62); // 沙发左扶手顶上
const ARM_BASE = { x: -1.6, z: -1.7 };
const HEARTH = { x: -2.95, z: -1.6 };
const BEDSIDE = { x: 3.0, z: -0.9 };

// 没接 AI 时的预设台词（{name} 会换成称呼）
export const PRESET_LINES = {
  清晨: ['{name}早呀，窗外的雾还没散呢。', '起这么早？我尾巴都还没睡醒。'],
  上午: ['今天的云走得好慢，像在散步。', '{name}，要不要一起等小火车？'],
  中午: ['太阳晒到地毯上了，暖烘烘的。', '吃饱了吗？我刚藏好一颗松果。'],
  下午: ['下午最适合窝在沙发里发呆啦。', '{name}，你看那朵云像不像我的尾巴？'],
  傍晚: ['天要黑啦，我的尾巴该上班了。', '晚霞好看，{name}也好看。'],
  夜晚: ['星星出来了，有一颗是我的亲戚哦。', '点上壁炉吧，我给你留了最暖的位置。'],
  深夜: ['这么晚还不睡呀？我陪着你。', '嘘……月亮都困了，{name}也早点睡。'],
};
const POKE = ['嘿嘿，痒！', '吱～', '再摸一下也可以哦。', '尾巴亮不亮？'];

export class XiaoXing {
  constructor(scene, nav, ctx) {
    this.nav = nav; this.ctx = ctx; this.scene = scene;
    this.root = new THREE.Group();
    this.pos = this.root.position;
    this.pos.set(-1.6, 0, -0.6);
    this.yaw = 0.6; this.path = []; this.then = null;
    this.state = 'idle'; this.timer = 2.5;
    this.flat = 0; this.curl = 0; this.hop = 0; this.flare = 0; this.reactT = 0; this.spin = 0;
    this.tw = null; this.where = 'floor'; this.area = 'indoor'; this.headY = 0.73;
    this.build();
    scene.add(this.root);
  }

  build() {
    // 拟人站姿：大脑袋、小身子、穿件小毛衣；尾巴是一颗装着星空的圆球
    const fur = '#cf7d43', cream = '#fdebd2', knit = '#7fb5a5';
    const body = this.body = new THREE.Group(); this.root.add(body);
    for (const sx of [-1, 1]) {
      body.add(at(ball(0.075, fur, 1, 1.5, 1), sx * 0.09, 0.12, 0));
      body.add(at(ball(0.075, fur, 1, 0.55, 1.45), sx * 0.09, 0.035, 0.04));
      const arm = ball(0.06, knit, 1, 1.9, 1); arm.rotation.z = sx * 0.5;
      body.add(at(arm, sx * 0.2, 0.36, 0.02));
      body.add(at(ball(0.05, fur), sx * 0.25, 0.27, 0.03));
    }
    body.add(at(ball(0.19, knit, 1, 1.12, 0.92), 0, 0.34, 0));
    body.add(at(ball(0.12, cream, 1, 0.5, 0.9), 0, 0.5, 0.01));
    const head = this.head = new THREE.Group(); head.position.set(0, this.headY, 0.02); body.add(head);
    head.add(ball(0.27, fur, 1.1, 0.94, 1));
    head.add(at(ball(0.17, cream, 1.25, 0.72, 0.6), 0, -0.09, 0.16));
    head.add(at(ball(0.1, '#e9a066', 1.5, 0.5, 0.6), 0, 0.2, 0.15));
    for (const sx of [-1, 1]) {
      head.add(at(ball(0.095, fur, 1, 1, 0.6), sx * 0.2, 0.22, -0.02));
      head.add(at(ball(0.055, '#f6b8a8', 1, 1, 0.4), sx * 0.2, 0.22, 0.03));
      const ch = ball(0.045, new THREE.MeshBasicMaterial({ color: '#ffa99a', transparent: true, opacity: 0.8 }), 1, 0.6, 0.3);
      ch.castShadow = false; head.add(at(ch, sx * 0.17, -0.07, 0.225));
    }
    this.eyes = [-1, 1].map((sx) => {
      const e = ball(0.042, '#2e211e', 1, 1.2, 0.6, { roughness: 0.25 }); e.castShadow = false;
      head.add(at(e, sx * 0.115, 0.01, 0.245));
      const hl = ball(0.015, new THREE.MeshBasicMaterial({ color: '#fff' })); hl.castShadow = false;
      e.add(at(hl, 0.012, 0.016, 0.035));
      return e;
    });
    head.add(at(ball(0.026, '#e98b86', 1.2, 0.8, 1), 0, -0.05, 0.275));

    // 星空尾巴：深蓝的球，里面是一粒粒星星；只有星星自己微微发亮
    const tail = this.tail = new THREE.Group(); tail.position.set(0, 0.2, -0.14); body.add(tail);
    const stars = [];
    const r = rng(77);
    for (let k = 0; k < 90; k++) stars.push([r() * 256, r() * 256, 0.6 + r() * r() * 2.6, r() < 0.25 ? '#ffe9a8' : '#ffffff']);
    const paint = (bg) => canvasTex(256, 256, (c) => {
      if (bg) { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#3a3f9a'); g.addColorStop(1, '#1f2463'); c.fillStyle = g; }
      else c.fillStyle = '#0a0c22';
      c.fillRect(0, 0, 256, 256);
      for (const [x, y, rad, col] of stars) { c.fillStyle = col; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); }
    });
    this.tailMat = new THREE.MeshStandardMaterial({ map: paint(true), emissive: '#ffffff', emissiveMap: paint(false), emissiveIntensity: 0.6, roughness: 0.75 });
    tail.add(at(ball(0.08, fur, 1, 1, 1.6), 0, 0.02, -0.08));
    this.ball = ball(0.29, this.tailMat);
    tail.add(at(this.ball, 0, 0.2, -0.36));
    this.glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#8f9cff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.1 });
    this.glow = new THREE.Sprite(this.glowMat); tail.add(at(this.glow, 0, 0.2, -0.36));
    this.light = new THREE.PointLight('#aab4ff', 0.1, 3.5, 2); tail.add(at(this.light, 0, 0.3, -0.36));

    // 可点区域（比身体大一圈，手指好点）
    this.hit = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.hit.userData.id = 'xiaoxing'; this.root.add(at(this.hit, 0, 0.5, -0.1));

    // 星屑
    this.sparks = [];
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: '#dfe4ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      s.visible = false; s.userData = { life: 0, v: new THREE.Vector3() };
      this.scene.add(s); this.sparks.push(s);
    }
    this.sparkT = 0;
  }

  headPos(out) { return this.head.getWorldPosition(out).add(UP); }

  emit(n, speed) {
    this.ball.getWorldPosition(TMP);
    for (const s of this.sparks) {
      if (n <= 0) break;
      if (s.userData.life > 0) continue;
      s.position.copy(TMP).add(V.set(rand(-0.15, 0.15), rand(-0.2, 0.1), rand(-0.1, 0.1)));
      s.userData.v.set(rand(-1, 1) * speed, rand(0.2, 1) * speed + 0.15, rand(-0.5, 0.5) * speed);
      s.userData.life = s.userData.max = rand(0.7, 1.3);
      s.userData.size = rand(0.08, 0.16);
      s.visible = true; n--;
    }
  }

  moveTo(p, then) {
    this.path = this.nav.path({ x: this.pos.x, z: this.pos.z }, p);
    this.then = then || null; this.state = 'move';
  }

  jump(to, yaw, then) {
    this.state = 'jump';
    this.tw = { from: this.pos.clone(), to: to.clone(), yaw, t: 0, dur: 0.5, arc: 0.55, then };
  }

  rest(kind, time, yaw) { this.state = kind; this.timer = time; this.restYaw = yaw; }

  leave() {
    if (this.where === 'arm') {
      const b = this.nav.nearest(ARM_BASE.x, ARM_BASE.z);
      this.where = 'floor';
      this.jump(new THREE.Vector3(b.x, 0, b.z), 0.6, () => { this.state = 'idle'; this.timer = rand(0.6, 1.5); });
    } else { this.state = 'idle'; this.timer = rand(0.5, 1.2); }
  }

  goPerch() {
    this.moveTo(ARM_BASE, () => this.jump(ARM, 0.35, () => { this.where = 'arm'; this.rest('perch', rand(16, 30), 0.35); }));
  }

  goCurl(spot, yaw) { this.moveTo(spot, () => this.rest('curl', rand(16, 32), yaw)); }

  // 换地方（进屋 / 出门）：直接出现在主人身边，从头开始
  enter(area, nav, x, z) {
    this.area = area; this.nav = nav;
    const p = nav.nearest(x, z);
    this.pos.set(p.x, 0, p.z);
    this.path = []; this.then = null; this.tw = null; this.where = 'floor';
    this.state = 'idle'; this.timer = 1.2;
  }

  decide() {
    const { player, fire } = this.ctx, r = Math.random();
    const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (this.area === 'outdoor') {
      // 屋外：一直跟在主人附近，偶尔自己转一圈或者原地窝一会儿
      const a = Math.random() * Math.PI * 2, rad = dist > 3.2 ? 1.3 : 1.2 + Math.random() * 2.6;
      if (dist < 3.2 && r < 0.22) return this.rest('curl', rand(7, 14), 0.3);
      return this.moveTo({ x: player.pos.x + Math.cos(a) * rad, z: player.pos.z + Math.sin(a) * rad }, null);
    }
    if (player.state === 'lie' && r < 0.75) return this.goCurl(BEDSIDE, 0.4);
    if (player.state === 'sit' && r < 0.7) return this.goPerch();
    if (fire.lit && r < 0.5) return this.goCurl(HEARTH, -0.9);
    if (r < 0.14) return this.goPerch();
    if (r < 0.26) return this.goCurl(HEARTH, -0.9);
    if (dist > 2.6 && r < 0.75 && !player.posed) {
      const a = Math.random() * Math.PI * 2;
      return this.moveTo({ x: player.pos.x + Math.cos(a) * 1.1, z: player.pos.z + Math.sin(a) * 1.1 }, null);
    }
    this.moveTo(this.nav.randomPoint(), null);
  }

  // 主人坐下 / 躺下 / 点火时，小星提前结束手头的事，凑过去
  nudge() {
    if (this.state === 'idle') this.timer = Math.min(this.timer, 0.6);
    else if (this.state === 'move' && !this.then) { this.path = []; this.state = 'idle'; this.timer = 0.3; }
    else if (this.state === 'perch' || this.state === 'curl') this.timer = Math.min(this.timer, rand(3, 6));
  }

  // 被点到：蹦一下、转个圈、撒星屑、说句话
  react(name) {
    if (this.state === 'jump') return null;
    this.reactT = 0.9; this.flare = 1;
    this.emit(10, 1.1);
    if (this.state === 'idle' || this.state === 'move') { this.path = []; this.then = null; this.state = 'react'; }
    const lines = Math.random() < 0.3 ? POKE : PRESET_LINES[periodName(hourNow())];
    return pick(lines).replace('{name}', name);
  }

  update(dt, t, env) {
    const night = 1 - env.dl;
    let moving = false, faceYaw = null;

    if (this.reactT > 0) this.reactT -= dt;
    if (this.area === 'outdoor') {
      const p = this.ctx.player.pos, far = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (far > 30) this.enter('outdoor', this.nav, p.x + 1.2, p.z + 0.8);
      else if (far > 5.5 && (this.state === 'idle' || this.state === 'curl')) { this.state = 'idle'; this.timer = 0; }
      else if (far > 7 && this.state === 'move' && this.path.length && Math.hypot(this.path[0].x - p.x, this.path[0].z - p.z) > 5) { this.state = 'idle'; this.timer = 0; }
    }
    switch (this.state) {
      case 'idle':
        if ((this.timer -= dt) < 0) this.decide();
        break;
      case 'move': {
        const d = stepPathNav(this.pos, this.path, this.area === 'outdoor' ? 4.2 : 3.3, dt, this.nav, this);
        if (d.blocked) this.then = null;
        if (d.dx || d.dz) faceYaw = Math.atan2(d.dx, d.dz);
        moving = true;
        if (!this.path.length) {
          const th = this.then; this.then = null;
          if (th) th(); else { this.state = 'idle'; this.timer = rand(1.8, 5); }
        }
        break;
      }
      case 'jump': {
        const w = this.tw; w.t = Math.min(1, w.t + dt / w.dur);
        this.pos.lerpVectors(w.from, w.to, w.t);
        this.pos.y += Math.sin(w.t * Math.PI) * w.arc;
        faceYaw = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z);
        if (w.t >= 1) { this.tw = null; this.yaw = w.yaw; w.then && w.then(); }
        break;
      }
      case 'perch':
      case 'curl':
        faceYaw = this.restYaw;
        if ((this.timer -= dt) < 0) this.leave();
        break;
      case 'react':
        faceYaw = 0.15;
        if (this.reactT <= 0) { this.state = 'idle'; this.timer = rand(1.2, 2.5); }
        break;
    }

    if (faceYaw != null) this.yaw = lerpAngle(this.yaw, faceYaw, Math.min(1, dt * 10));
    const resting = this.state === 'perch' || this.state === 'curl';
    const rk = this.reactT > 0 ? 1 - this.reactT / 0.9 : 0;
    this.flat = damp(this.flat, this.state === 'perch' ? 1 : 0, 6, dt);
    this.curl = damp(this.curl, this.state === 'curl' ? 1 : 0, 5, dt);
    this.flare = damp(this.flare, 0, 2.2, dt);

    // 跑动时一蹦一蹦；被点时原地蹦两下转一圈
    this.hop = moving ? this.hop + dt * 13 : damp(this.hop, Math.round(this.hop / Math.PI) * Math.PI, 14, dt);
    let by = Math.abs(Math.sin(this.hop)) * 0.11 * (moving ? 1 : 0);
    let spin = 0;
    if (this.reactT > 0) {
      if (resting) by += Math.abs(Math.sin(rk * Math.PI * 3)) * 0.05;
      else { by += Math.abs(Math.sin(rk * Math.PI * 2)) * 0.34; spin = rk * Math.PI * 2; }
    }
    const lowK = Math.max(this.flat, this.curl);
    const breathe = 1 + Math.sin(t * (resting ? 1.6 : 2.6)) * 0.025;
    this.body.position.y = by;
    this.body.scale.set(1 + lowK * 0.1, (1 - lowK * 0.3) * breathe, 1 + lowK * 0.08);
    this.body.rotation.x = moving ? 0.22 : 0;
    this.root.rotation.y = this.yaw + spin;
    this.head.position.y = this.headY - lowK * 0.08;
    this.head.position.z = 0.02 + lowK * 0.05;
    this.head.rotation.z = resting ? 0.12 * this.curl : Math.sin(t * 0.9) * 0.08;
    this.head.rotation.y = resting || moving ? 0 : Math.sin(t * 0.55) * 0.5;
    const blink = (t % 4.3) < 0.12 ? 0.1 : 1;
    const ey = this.curl > 0.5 && this.reactT <= 0 ? 0.1 : blink;
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, 1.2 * ey, 25, dt);

    // 尾巴：轻轻晃 + 星星隐隐地闪（夜里稍亮一点，被点到时亮一下）
    this.tail.rotation.x = damp(this.tail.rotation.x, this.curl * 0.35 - this.flat * 0.2 + (moving ? -0.2 : 0), 6, dt);
    this.tail.rotation.y = Math.sin(t * 1.6) * (resting ? 0.06 : 0.16);
    this.ball.rotation.y = t * 0.15;
    const tw = 0.85 + 0.1 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 5.1 + 1);
    this.tailMat.emissiveIntensity = tw * lerp(0.5, 1.8, night) + this.flare * 1.6;
    this.glowMat.opacity = lerp(0.03, 0.16, night) * tw + this.flare * 0.25;
    const gs = 1.15 + this.flare * 0.3;
    this.glow.scale.set(gs, gs, 1);
    this.light.intensity = lerp(0.05, 0.7, night) * tw + this.flare * 1.2;

    // 星屑
    if ((this.sparkT -= dt) < 0) { this.sparkT = lerp(3.5, 1.2, night) * rand(0.6, 1.4); this.emit(1, 0.25); }
    for (const s of this.sparks) {
      const u = s.userData;
      if (u.life <= 0) continue;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      const k = u.life / u.max;
      u.v.y -= dt * 0.5; u.v.multiplyScalar(1 - dt * 1.5);
      s.position.addScaledVector(u.v, dt);
      s.material.opacity = Math.sin(k * Math.PI) * (0.3 + 0.4 * night);
      s.material.rotation += dt * 2;
      const sc = u.size * (0.6 + 0.4 * k);
      s.scale.set(sc, sc, 1);
    }
  }
}

const UP = new THREE.Vector3(0, 0.5, 0);
const TMP = new THREE.Vector3(), V = new THREE.Vector3();
