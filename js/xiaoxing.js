// 小星：拟人站姿的小松鼠，尾巴是一颗装着星空的圆球。自己闲逛、跟着主人、趴沙发扶手、窝在壁炉旁。
import * as THREE from 'three';
import { damp, lerp, lerpAngle, rand, pick, canvasTex, mat, at, glowTex, sparkTex, starShape, stepPathNav } from './util.js';
import { Kit, soft, lathe, rounded, fabric } from './shapes.js';
import { eyeTex, makeEye, cap, blush, lockGeo, placeYXZ, furMat, ribbedRing, rimMaterial, galaxyTex } from './charparts.js';
import { hourNow, periodName } from './time.js';

const ARM = new THREE.Vector3(-1.0, 0.98, -2.62); // 沙发左扶手顶上
const ARM_BASE = { x: -1.6, z: -1.7 };
const HEARTH = { x: -2.95, z: -1.6 };
const BEDSIDE = { x: 3.0, z: -0.9 };

// 麻花针织：两股绞在一起的粗麻花 + 两边的竖条罗纹，颜色画在贴图里（毛衣材质本身是白色）
const cableTex = canvasTex(128, 128, (c) => {
  c.fillStyle = '#7fb5a5'; c.fillRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(0,40,30,.18)';
  for (let x = 0; x < 128; x += 8) c.fillRect(x, 0, 2, 128);
  for (const cx of [32, 96]) {
    c.fillStyle = '#6fa898'; c.fillRect(cx - 18, 0, 36, 128);
    for (let y = -32; y < 160; y += 32) {
      for (const [dir, col] of [[1, 'rgba(255,255,255,.28)'], [-1, 'rgba(0,30,20,.25)']]) {
        c.strokeStyle = col; c.lineWidth = 9; c.lineCap = 'round';
        c.beginPath(); c.moveTo(cx - 9 * dir, y); c.bezierCurveTo(cx - 9 * dir, y + 14, cx + 9 * dir, y + 18, cx + 9 * dir, y + 32); c.stroke();
      }
    }
  }
});
cableTex.wrapS = cableTex.wrapT = THREE.RepeatWrapping;
cableTex.repeat.set(3, 1.5);

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
// 自己跑来找主人时、没接 AI 用的台词
export const SEEK_LINES = {
  idle: ['{name}，我来找你玩啦！', '{name}，陪我待一会儿嘛。', '嘿嘿，偷偷跑过来看看你。', '{name}，你在想什么呀？我也想听听。'],
  wake: ['睡醒啦？我一直在旁边守着哦。', '{name}睡得好吗？我的尾巴给你照了一晚上。'],
};

// AI 能让小星做的动作：动作名 → 给模型看的说明（按屋里 / 屋外分开）
export const ACTIONS = {
  indoor: {
    过来: '跑到主人身边，看着TA',
    扶手: '跳上沙发左边的扶手趴着',
    壁炉: '去壁炉旁边窝成一团',
    床边: '去床边窝着',
    转圈: '原地蹦一下转个圈，撒星星',
    逛逛: '自己在屋里随便走走',
  },
  outdoor: {
    过来: '跑到主人身边，看着TA',
    窝着: '就地窝成一团歇一会儿',
    转圈: '原地蹦一下转个圈，撒星星',
    逛逛: '在主人附近随便走走',
  },
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
    this.tw = null; this.where = 'floor'; this.area = 'indoor'; this.headY = 0.73; this.pending = null;
    this.build();
    scene.add(this.root);
  }

  build() {
    // 拟人站姿：大脑袋、小身子、穿件麻花针织高领毛衣；尾巴是一颗装着星空的圆球
    const fur = furMat('#cf7d43', '#ffcf98'), cream = furMat('#fdebd2', '#ffffff'), dark = furMat('#a85e30', '#e8a070');
    const knit = fabric('#ffffff', { map: cableTex, sheen: '#d8fff0', bump: 0.9 });
    const knitRib = fabric('#6fa898', { sheen: '#d8fff0' });
    const pinkSkin = mat('#f6b8a8', { roughness: 0.6 });
    const body = this.body = new THREE.Group(); this.root.add(body);

    const bk = new Kit();
    for (const sx of [-1, 1]) {
      // 腿和大脚丫（三个脚趾）
      bk.add(new THREE.SphereGeometry(0.085, 18, 14), fur, sx * 0.1, 0.13, -0.01, 0, 0, 0, [1, 1.25, 1.1]);
      bk.add(soft(0.09, 0.055, 0.17, { e: 0.45, puff: 0.1, seg: 8 }), fur, sx * 0.095, 0.03, 0.05);
      for (const tx of [-0.026, 0, 0.026]) bk.add(new THREE.SphereGeometry(0.019, 10, 8), cream, sx * 0.095 + tx, 0.026, 0.128);
      // 袖子 + 罗纹袖口 + 小爪子（三根手指）
      bk.add(new THREE.CapsuleGeometry(0.056, 0.1, 4, 12), knit, sx * 0.2, 0.36, 0.02, 0, 0, sx * 0.5);
      bk.add(ribbedRing(0.05, 0.018, 12, 32).rotateX(Math.PI / 2), knitRib, sx * 0.236, 0.29, 0.02, 0, 0, sx * 0.5);
      bk.add(new THREE.SphereGeometry(0.047, 14, 12), fur, sx * 0.258, 0.255, 0.03);
      for (const fx of [-0.02, 0, 0.02]) bk.add(new THREE.SphereGeometry(0.016, 8, 6), fur, sx * 0.262 + fx, 0.218, 0.05);
    }
    // 毛衣身子、下摆和高领的罗纹、胸口一颗小星星
    bk.add(lathe([[0, 0.13], [0.16, 0.13], [0.195, 0.17], [0.205, 0.26], [0.2, 0.36], [0.18, 0.45], [0.14, 0.51], [0.09, 0.545], [0, 0.55]], 40), knit, 0, 0, 0, 0, 0, 0, [1, 1, 0.92]);
    bk.add(ribbedRing(0.19, 0.03, 22, 56).rotateX(Math.PI / 2), knitRib, 0, 0.15, 0, 0, 0, 0, [1, 1, 0.92]);
    bk.add(ribbedRing(0.1, 0.042, 16, 40).rotateX(Math.PI / 2), knitRib, 0, 0.54, 0);
    const badge = new THREE.ExtrudeGeometry(starShape(0.05, 0.022), { depth: 0.012, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2 });
    bk.add(badge, mat('#f6cf6b', { roughness: 0.4 }), 0, 0.37, 0.176, -0.2);
    body.add(bk.build());

    // ── 头 ──
    const head = this.head = new THREE.Group(); head.position.set(0, this.headY, 0.02); body.add(head);
    const hk = new Kit();
    hk.add(new THREE.SphereGeometry(0.27, 32, 24), fur, 0, 0, 0, 0, 0, 0, [1.1, 0.94, 1]);
    for (const sx of [-1, 1]) {
      hk.add(new THREE.SphereGeometry(0.11, 18, 14), cream, sx * 0.17, -0.09, 0.12, 0, 0, 0, [1, 0.8, 0.85]);   // 鼓鼓的腮帮子
      hk.add(placeYXZ(lockGeo(0.09, 0.07, 0.04, 0.2), sx * 0.27, -0.05, 0.04, 0, 0, sx * 1.17), cream); // 腮边一撮毛
      hk.add(cap(0.125, 0.145, 0.03), cream, sx * 0.113, 0.012, 0.226, -0.05, sx * 0.42, 0);                   // 眼圈
    }
    hk.add(new THREE.SphereGeometry(0.15, 22, 16), cream, 0, -0.09, 0.165, 0, 0, 0, [1.25, 0.75, 0.62]);     // 嘴巴一圈
    hk.add(new THREE.SphereGeometry(0.1, 18, 12), furMat('#e39a62', '#ffd2a0'), 0, 0.19, 0.155, 0, 0, 0, [1.5, 0.5, 0.6]); // 额头一抹深色
    for (const [x, rz] of [[-0.05, 0.35], [0, 0], [0.05, -0.35]]) hk.add(placeYXZ(lockGeo(0.1, 0.075, 0.035, 0.35), x, 0.235, 0.01, Math.PI - 0.55, 0, rz), fur); // 头顶的呆毛
    // 鼻子、ω 嘴、两颗小门牙
    hk.add(new THREE.SphereGeometry(0.026, 16, 12), mat('#8a4a48', { roughness: 0.25 }), 0, -0.05, 0.272, 0, 0, 0, [1.35, 0.85, 0.9]);
    hk.add(new THREE.SphereGeometry(0.007, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0.01, -0.041, 0.293);
    const w = new THREE.CatmullRomCurve3([[-0.038, -0.077, 0.26], [-0.02, -0.095, 0.268], [0, -0.08, 0.272], [0.02, -0.095, 0.268], [0.038, -0.077, 0.26]].map((p) => new THREE.Vector3(...p)));
    hk.add(new THREE.TubeGeometry(w, 24, 0.005, 6), mat('#5a3328', { roughness: 0.5 }));
    for (const sx of [-1, 1]) hk.add(rounded(0.014, 0.02, 0.008, 0.003, 1), mat('#ffffff', { roughness: 0.3 }), sx * 0.008, -0.102, 0.262);
    // 尖耳朵：外面是毛，里面粉粉的，耳尖一撮深色簇毛
    const earP = [[0, 0], [0.07, 0], [0.078, 0.04], [0.068, 0.1], [0.04, 0.15], [0.012, 0.18], [0, 0.185]];
    for (const sx of [-1, 1]) {
      const put = (g, m) => hk.add(placeYXZ(g, sx * 0.19, 0.17, -0.02, -0.1, sx * 0.15, -sx * 0.35), m);
      put(lathe(earP, 22).scale(1, 1, 0.5), fur);
      put(lathe(earP, 18).scale(0.68, 0.8, 0.3).translate(0, 0.015, 0.022), pinkSkin);
      for (const [x, rz] of [[-0.012, 0.25], [0, 0], [0.012, -0.25]]) put(lockGeo(0.075, 0.03, 0.022, 0.25).rotateX(Math.PI).rotateZ(rz).translate(x, 0.17, 0), dark);
    }
    head.add(hk.build());
    // 眼睛（会眨）和腮红
    const eyeT = eyeTex('#2a1810', '#7a4426');
    this.eyes = [-1, 1].map((sx) => {
      const e = makeEye(0.085, 0.105, 0.025, eyeT, { side: sx, r: 0.005 });
      e.position.set(sx * 0.115, 0.012, 0.238); e.rotation.set(-0.05, sx * 0.42, 0);
      head.add(e); return e;
    });
    for (const sx of [-1, 1]) { const b = blush(0.08, 0.05, '#ffa99a', 0.8); b.position.set(sx * 0.17, -0.07, 0.222); b.rotation.y = sx * 0.6; head.add(b); }

    // ── 星空尾巴：毛茸茸的尾巴根卷上去，托着一颗亮晶晶的星空球 ──
    const tail = this.tail = new THREE.Group(); tail.position.set(0, 0.2, -0.14); body.add(tail);
    const tk = new Kit();
    const stem = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.03, 0.03), new THREE.Vector3(0, 0.03, -0.1), new THREE.Vector3(0, 0.12, -0.2)]);
    tk.add(new THREE.TubeGeometry(stem, 16, 0.065, 12), fur);
    tk.add(new THREE.SphereGeometry(0.065, 12, 10), fur, 0, -0.03, 0.03);
    tk.add(new THREE.TorusGeometry(0.11, 0.05, 12, 32), fur, 0, 0.15, -0.24, 0.39);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      tk.add(placeYXZ(lockGeo(0.08, 0.06, 0.03, 0.3).rotateX(Math.PI / 2 + 0.39).translate(Math.cos(a) * 0.12, 0.15 + Math.sin(a) * 0.11, -0.24 + Math.sin(a) * 0.04), 0, 0, 0, 0, 0, 0), fur);
    }
    tail.add(tk.build());
    this.tailMat = new THREE.MeshPhysicalMaterial({ map: galaxyTex(false), emissive: '#ffffff', emissiveMap: galaxyTex(true), emissiveIntensity: 0.6, roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.29, 32, 24), this.tailMat);
    this.ball.castShadow = true;
    tail.add(at(this.ball, 0, 0.2, -0.36));
    this.rimMat = rimMaterial('#a9b6ff');
    tail.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.296, 24, 18), this.rimMat), 0, 0.2, -0.36));
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

  // 被点到：蹦一下、转个圈、撒星屑、说句话
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
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, ey, 25, dt);

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
    this.rimMat.uniforms.uK.value = lerp(0.3, 0.85, night) * tw + this.flare * 0.8;

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
