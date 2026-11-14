// 小星：乱蓬蓬短发、穿藏青外套的小男孩，胸前别着一颗会发光的小星星。自己闲逛、跟着主人、坐沙发扶手、在壁炉旁坐着打盹。
import * as THREE from 'three';
import { damp, lerp, lerpAngle, rand, pick, at, glowTex, sparkTex, stepPathNav } from './util.js';
import { buildChibi, ARM_Z } from './chibi.js';
import { hourNow, periodName } from './time.js';

const ARM = new THREE.Vector3(-1.0, 0.98, -2.62); // 沙发左扶手顶上
const ARM_BASE = { x: -1.6, z: -1.7 };
const HEARTH = { x: -2.95, z: -1.6 };
const BEDSIDE = { x: 3.0, z: -0.9 };
const SCALE = 0.95;

// 没接 AI 时的预设台词（{name} 会换成称呼）
export const PRESET_LINES = {
  清晨: ['{name}早呀，窗外的雾还没散呢。', '起这么早？我头发都还没睡醒。'],
  上午: ['今天的云走得好慢，像在散步。', '{name}，要不要一起等小火车？'],
  中午: ['太阳晒到地毯上了，暖烘烘的。', '吃饱了吗？我给你留了一块小饼干。'],
  下午: ['下午最适合窝在沙发里发呆啦。', '{name}，你看那朵云像不像一只小鲸鱼？'],
  傍晚: ['天要黑啦，我的小星星该上班了。', '晚霞好看，{name}也好看。'],
  夜晚: ['星星出来了，有一颗和我同名哦。', '点上壁炉吧，我给你留了最暖的位置。'],
  深夜: ['这么晚还不睡呀？我陪着你。', '嘘……月亮都困了，{name}也早点睡。'],
};
// 自己跑来找主人时、没接 AI 用的台词
export const SEEK_LINES = {
  idle: ['{name}，我来找你玩啦！', '{name}，陪我待一会儿嘛。', '嘿嘿，偷偷跑过来看看你。', '{name}，你在想什么呀？我也想听听。'],
  wake: ['睡醒啦？我一直在旁边守着哦。', '{name}睡得好吗？我的小星星给你照了一晚上。'],
};

// AI 能让小星做的动作：动作名 → 给模型看的说明（按屋里 / 屋外分开）
export const ACTIONS = {
  indoor: {
    过来: '跑到主人身边，看着TA',
    扶手: '跳上沙发左边的扶手坐着',
    壁炉: '去壁炉旁边坐下烤火',
    床边: '去床边坐着守着',
    转圈: '原地蹦一下转个圈，撒星星',
    逛逛: '自己在屋里随便走走',
  },
  outdoor: {
    过来: '跑到主人身边，看着TA',
    窝着: '就地坐下歇一会儿',
    转圈: '原地蹦一下转个圈，撒星星',
    逛逛: '在主人附近随便走走',
  },
};

const POKE = ['嘿嘿，痒！', '哎呀～', '再摸一下头也可以哦。', '我的小星星亮不亮？'];

export class XiaoXing {
  constructor(scene, nav, ctx) {
    this.nav = nav; this.ctx = ctx; this.scene = scene;
    this.root = new THREE.Group();
    this.pos = this.root.position;
    this.pos.set(-1.6, 0, -0.6);
    this.yaw = 0.6; this.path = []; this.then = null;
    this.state = 'idle'; this.timer = 2.5;
    this.flat = 0; this.curl = 0; this.phase = 0; this.flare = 0; this.reactT = 0;
    this.tw = null; this.where = 'floor'; this.area = 'indoor'; this.pending = null;
    this.build();
    scene.add(this.root);
  }

  build() {
    const c = buildChibi({ star: true });
    this.body = c.body; this.head = c.head; this.legs = c.legs; this.arms = c.arms; this.eyes = c.eyes; this.pin = c.pin;
    this.root.add(c.body);
    this.root.scale.setScalar(SCALE);
    // 胸前的小星星：一圈柔光 + 一盏小灯，夜里替主人留着
    this.glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffe2a0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.1 });
    this.glow = new THREE.Sprite(this.glowMat); this.pin.add(at(this.glow, 0, 0, 0.03));
    this.light = new THREE.PointLight('#ffe0a8', 0.1, 3.5, 2); c.body.add(at(this.light, 0.1, 0.8, 0.5));

    // 可点区域（比身体大一圈，手指好点）
    this.hit = new THREE.Mesh(new THREE.SphereGeometry(0.78, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.hit.userData.id = 'xiaoxing'; this.root.add(at(this.hit, 0, 0.85, 0));

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
    this.pin.getWorldPosition(TMP);
    for (const s of this.sparks) {
      if (n <= 0) break;
      if (s.userData.life > 0) continue;
      s.position.copy(TMP).add(V.set(rand(-0.3, 0.3), rand(-0.3, 0.4), rand(-0.3, 0.3)));
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

  // 跑到主人跟前（站在TA面朝的方向上），到了以后看着TA待一会儿。arrived：到了时调用
  come(arrived) {
    const { player } = this.ctx;
    const fy = player.yaw;
    const want = { x: player.pos.x + Math.sin(fy) * 0.95, z: player.pos.z + Math.cos(fy) * 0.95 };
    const t = this.nav.nearest(want.x, want.z);
    const near = Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < 0.3;
    const stay = () => { this.state = 'attend'; this.timer = rand(9, 14); arrived && arrived(); };
    if (near) stay(); else this.moveTo(t, stay);
  }

  // AI 给的动作。在扶手上 / 正跳着的时候先下来，再去做
  // done：只对“过来”有用，跑到主人跟前时调用
  act(name, done) {
    if (!(ACTIONS[this.area] || {})[name]) return false;
    if (this.state === 'jump') { this.pending = [name, done]; return true; }
    if (this.where === 'arm' && name !== '扶手') {
      const b = this.nav.nearest(ARM_BASE.x, ARM_BASE.z);
      this.where = 'floor';
      this.jump(new THREE.Vector3(b.x, 0, b.z), 0.6, () => { this.state = 'idle'; this.timer = 1; this.act(name, done); });
      return true;
    }
    this.path = []; this.then = null;
    switch (name) {
      case '过来': this.come(done); break;
      case '扶手': if (this.where === 'arm') this.rest('perch', rand(20, 34), 0.35); else this.goPerch(); break;
      case '壁炉': this.goCurl(HEARTH, -0.9); break;
      case '床边': this.goCurl(BEDSIDE, 0.4); break;
      case '窝着': this.rest('curl', rand(12, 20), this.yaw); break;
      case '转圈': this.reactT = 0.9; this.flare = 1; this.emit(12, 1.1); this.state = 'react'; break;
      case '逛逛': this.state = 'idle'; this.timer = 0; break;
    }
    return true;
  }

  // 主人坐下 / 躺下 / 点火时，小星提前结束手头的事，凑过去
  nudge() {
    if (this.state === 'idle' || this.state === 'attend') { this.state = 'idle'; this.timer = Math.min(this.timer, 0.6); }
    else if (this.state === 'move' && !this.then) { this.path = []; this.state = 'idle'; this.timer = 0.3; }
    else if (this.state === 'perch' || this.state === 'curl') this.timer = Math.min(this.timer, rand(3, 6));
  }

  // 被点到：举起手蹦一下、转个圈、撒星屑、说句话
  react(name) {
    if (this.state === 'jump') return null;
    this.reactT = 0.9; this.flare = 1;
    this.emit(10, 1.1);
    if (this.state === 'idle' || this.state === 'move' || this.state === 'attend') { this.path = []; this.then = null; this.state = 'react'; }
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
        if (w.t >= 1) {
          this.tw = null; this.yaw = w.yaw; w.then && w.then();
          if (this.pending && this.state !== 'jump') { const [a, d] = this.pending; this.pending = null; this.act(a, d); }
        }
        break;
      }
      case 'perch':
      case 'curl':
        faceYaw = this.restYaw;
        if ((this.timer -= dt) < 0) this.leave();
        break;
      case 'attend': {
        const p = this.ctx.player.pos;
        faceYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
        if ((this.timer -= dt) < 0) { this.state = 'idle'; this.timer = rand(1, 3); }
        break;
      }
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

    // 走路：甩胳膊迈腿；被点时举起双手原地蹦两下转一圈
    if (moving) this.phase += dt * 12.5; else this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 12, dt);
    const sw = Math.sin(this.phase), amp = moving ? 1 : 0;
    let by = Math.abs(sw) * 0.06 * amp + (moving ? 0 : Math.sin(t * 1.8) * 0.012);
    let spin = 0, cheer = 0;
    if (this.reactT > 0) {
      cheer = Math.sin(rk * Math.PI);
      if (resting) by += Math.abs(Math.sin(rk * Math.PI * 3)) * 0.04;
      else { by += Math.abs(Math.sin(rk * Math.PI * 2)) * 0.3; spin = rk * Math.PI * 2; }
    }
    // 坐扶手（flat）：屁股落到扶手上，小腿垂在前面；坐地上（curl）：腿伸直，身子往前一点，低头打盹
    const lean = this.curl * 0.12;
    this.body.position.y = by - this.flat * 0.34 - this.curl * 0.33;
    this.body.rotation.x = damp(this.body.rotation.x, moving ? 0.1 : lean, 8, dt);
    this.root.rotation.y = this.yaw + spin;
    const legBase = -1.42 * this.flat - (1.5 + lean) * this.curl;
    this.legs[0].rotation.x = damp(this.legs[0].rotation.x, legBase + sw * 0.7 * amp, 14, dt);
    this.legs[1].rotation.x = damp(this.legs[1].rotation.x, legBase - sw * 0.7 * amp, 14, dt);
    const armBase = -0.45 * this.flat - 0.8 * this.curl;
    this.arms[0].rotation.x = damp(this.arms[0].rotation.x, armBase - sw * 0.6 * amp, 14, dt);
    this.arms[1].rotation.x = damp(this.arms[1].rotation.x, armBase + sw * 0.6 * amp, 14, dt);
    const az = ARM_Z - this.curl * 0.25 + cheer * 1.9;
    this.arms[0].rotation.z = -az; this.arms[1].rotation.z = az;
    this.head.rotation.x = damp(this.head.rotation.x, this.curl * 0.22, 5, dt);
    this.head.rotation.z = resting ? 0.1 * this.curl : Math.sin(t * 0.9) * 0.06;
    this.head.rotation.y = resting || moving ? 0 : Math.sin(t * 0.55) * 0.4;
    const blink = (t % 4.3) < 0.12 ? 0.1 : 1;
    const ey = this.curl > 0.5 && this.reactT <= 0 ? 0.1 : blink;
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, ey, 25, dt);

    // 胸前的小星星：隐隐地闪（夜里稍亮一点，被点到时亮一下）
    const tw = 0.85 + 0.1 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 5.1 + 1);
    this.pin.material.emissiveIntensity = tw * lerp(0.3, 2.2, night) + this.flare * 2;
    this.glowMat.opacity = lerp(0.02, 0.3, night) * tw + this.flare * 0.35;
    const gs = 0.3 + this.flare * 0.15;
    this.glow.scale.set(gs, gs, 1);
    this.light.intensity = lerp(0.03, 0.6, night) * tw + this.flare * 1.0;

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

const UP = new THREE.Vector3(0, 0.6, 0);
const TMP = new THREE.Vector3(), V = new THREE.Vector3();
