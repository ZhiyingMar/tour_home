// 两个角色共用的 Q 版小人：大圆头、豆豆眼、三角小鼻子、圆圆的手，外套敞着穿在连帽衫外面。
// 男孩（小星）：乱蓬蓬的短发、藏青外套、卡其工装裤；女孩（玩家）：两个发髻、粉色外套、百褶裙。都穿小白鞋。
import * as THREE from 'three';
import { mat, starShape } from './util.js';
import { Kit, soft, pillow, lathe, rounded, fabric, weld } from './shapes.js';
import { eyeTex, makeEye, blush, lockGeo, placeYXZ, hairMat, ribbedRing } from './charparts.js';

export const ARM_Z = 0.5; // 胳膊自然张开的角度

// 上身的轮廓（半径, 高度），外套和里面的连帽衫都按它车出来
const TORSO = [[0.272, 0.45], [0.296, 0.465], [0.298, 0.52], [0.288, 0.6], [0.272, 0.72], [0.25, 0.82], [0.215, 0.9], [0.15, 0.955], [0.1, 0.975]];
const torsoR = (y) => {
  for (let i = 1; i < TORSO.length; i++) {
    const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i];
    if (y <= y1) return r0 + (r1 - r0) * Math.max(0, (y - y0) / (y1 - y0));
  }
  return 0.1;
};
// 把零件贴到上身表面：phi = 绕到身体哪一边（0 是正前方），y = 高度，d = 离表面多远
const onTorso = (geo, phi, y, d = 0, rx = 0, rz = 0) => {
  const R = torsoR(y) + d;
  return placeYXZ(geo, R * Math.sin(phi), y, R * Math.cos(phi), rx, phi, rz);
};
const GAP = 0.4; // 外套前襟敞开的半角

const LOOKS = {
  boy: { hair: ['#4a3024', '#a87858'], jacket: ['#222947', '#5662a4'], eye: ['#2e1c14', '#6b4630'] },
  girl: { hair: ['#5d3b2b', '#c88a62'], jacket: ['#d98d98', '#ffd9de'], eye: ['#3a2218', '#96603a'] },
};

export function buildChibi({ girl = false, star = false } = {}) {
  const look = girl ? LOOKS.girl : LOOKS.boy;
  const skin = new THREE.MeshPhysicalMaterial({ color: '#ffd2b0', roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color('#ffd2c2'), sheenRoughness: 0.6 });
  const hair = hairMat(...look.hair);
  const jacket = fabric(look.jacket[0], { sheen: look.jacket[1] });
  const hoodie = fabric('#f1e9da', { sheen: '#ffffff' });
  const khaki = fabric('#c9b891', { sheen: '#f3e6c4' });
  const white = fabric('#fbf8f1', { sheen: '#ffffff' });
  const sole = mat('#e6dfd0', { roughness: 0.7 }), lace = mat('#d5cfc2', { roughness: 0.7 });
  const button = mat('#c9ccd6', { roughness: 0.35, metalness: 0.4 });
  const pink = fabric('#f2a9a0', { sheen: '#ffe0da' });
  const body = new THREE.Group();

  // ── 腿：男孩是宽松的工装裤（卷边裤脚、侧面一个口袋），女孩是光腿 + 白袜子；脚上都是小白鞋 ──
  const legs = [-1, 1].map((sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.12, 0.4, 0);
    const k = new Kit();
    if (girl) {
      k.add(new THREE.CapsuleGeometry(0.066, 0.18, 4, 14), skin, 0, -0.14, 0);
      k.add(new THREE.CylinderGeometry(0.072, 0.07, 0.11, 18), white, 0, -0.25, 0);
      k.add(ribbedRing(0.073, 0.015, 14, 40), white, 0, -0.195, 0, Math.PI / 2);
    } else {
      k.add(new THREE.SphereGeometry(0.1, 18, 14), khaki);
      k.add(new THREE.CylinderGeometry(0.098, 0.11, 0.27, 20), khaki, 0, -0.135, 0);
      k.add(new THREE.CylinderGeometry(0.119, 0.119, 0.055, 20), khaki, 0, -0.275, 0);
      k.add(rounded(0.03, 0.1, 0.11, 0.012, 1), khaki, sx * 0.098, -0.14, 0);
      k.add(rounded(0.034, 0.03, 0.118, 0.01, 1), khaki, sx * 0.1, -0.095, 0);
    }
    k.add(soft(0.155, 0.1, 0.235, { e: 0.4, puff: 0.12, seg: 8 }), white, 0, -0.338, 0.035);
    k.add(soft(0.165, 0.03, 0.25, { e: 0.22, puff: 0.02, seg: 6 }), sole, 0, -0.384, 0.035);
    for (const z of [0.05, 0.085]) k.add(new THREE.CapsuleGeometry(0.007, 0.05, 3, 6), lace, 0, -0.289, z, 0, 0, Math.PI / 2);
    p.add(k.build()); body.add(p); return p;
  });

  // ── 上身 ──
  const bk = new Kit();
  if (girl) {
    // 百褶裙
    const g = lathe([[0, 0.31], [0.37, 0.31], [0.385, 0.325], [0.35, 0.39], [0.3, 0.46], [0.26, 0.51], [0, 0.51]], 56), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), f = 1 + 0.05 * Math.max(0, Math.min(1, (0.5 - p.getY(i)) / 0.15)) * Math.sin(Math.atan2(z, x) * 14);
      p.setX(i, x * f); p.setZ(i, z * f);
    }
    bk.add(weld(g), khaki);
  } else {
    bk.add(lathe([[0, 0.3], [0.19, 0.3], [0.235, 0.34], [0.25, 0.4], [0.245, 0.5], [0, 0.5]], 32), khaki);
  }
  // 连帽衫：比外套小一圈，下摆从外套底下露出一截；脖子后面堆着帽子，胸前垂两根抽绳
  bk.add(lathe([[0, 0.42], [0.258, 0.42], [0.268, 0.44], ...TORSO.map(([r, y]) => [r * 0.965, y]), [0, 0.98]], 44), hoodie);
  bk.add(ribbedRing(0.262, 0.016, 26, 64).rotateX(Math.PI / 2), hoodie, 0, 0.428, 0);
  bk.add(soft(0.4, 0.2, 0.24, { e: 0.6, puff: 0.1, seg: 8 }), hoodie, 0, 0.885, -0.17, 0.35);
  bk.add(new THREE.TorusGeometry(0.17, 0.04, 10, 36), hoodie, 0, 0.9, 0.02, Math.PI / 2 - 0.25);
  for (const sx of [-1, 1]) {
    bk.add(onTorso(new THREE.CapsuleGeometry(0.008, 0.1, 3, 6), sx * 0.17, 0.76, -0.002, -0.2, sx * 0.08), hoodie);
    bk.add(onTorso(new THREE.SphereGeometry(0.014, 8, 6), sx * 0.2, 0.7, 0.002), hoodie);
  }
  // 外套：前面敞开，两条门襟、一排扣子、翻领、左胸一个带盖的口袋
  bk.add(new THREE.LatheGeometry(TORSO.map(([r, y]) => new THREE.Vector2(r, y)), 44, GAP, Math.PI * 2 - GAP * 2), jacket);
  for (const sx of [-1, 1]) {
    const edge = TORSO.slice(0, 7).map(([r, y]) => new THREE.Vector3(r * Math.sin(sx * GAP), y, r * Math.cos(sx * GAP)));
    bk.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 24, 0.016, 8), jacket);
    bk.add(onTorso(pillow(0.15, 0.1, 0.035), sx * (GAP + 0.2), 0.865, 0.012, -0.55, sx * 0.5), jacket);
  }
  bk.add(new THREE.TorusGeometry(0.296, 0.014, 6, 40, Math.PI * 2 - GAP * 2).rotateZ(GAP).rotateX(Math.PI / 2).rotateY(-Math.PI / 2), jacket, 0, 0.47, 0);
  for (const y of [0.53, 0.61, 0.69, 0.77]) bk.add(onTorso(new THREE.SphereGeometry(0.014, 10, 8).scale(1, 1, 0.5), -(GAP + 0.1), y, 0.004), button);
  bk.add(onTorso(rounded(0.115, 0.095, 0.016, 0.008, 1), 0.82, 0.69, 0.002, -0.12), jacket);
  bk.add(onTorso(rounded(0.122, 0.032, 0.022, 0.008, 1), 0.82, 0.735, 0.004, -0.12), jacket);
  if (!star) bk.add(onTorso(rounded(0.045, 0.02, 0.008, 0.003, 1), 0.82, 0.69, 0.012, -0.12), button);
  body.add(bk.build());

  // 小星胸前口袋上别着一颗小星星，夜里会微微发亮
  let pin = null;
  if (star) {
    const g = new THREE.ExtrudeGeometry(starShape(0.036, 0.017), { depth: 0.01, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
    pin = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#f6cf6b', roughness: 0.35, emissive: '#ffd27a', emissiveIntensity: 0.3 }));
    const R = torsoR(0.69) + 0.012;
    pin.position.set(R * Math.sin(0.82), 0.69, R * Math.cos(0.82)); pin.rotation.set(-0.12, 0.82, 0, 'YXZ');
    body.add(pin);
  }

  // ── 胳膊：袖子 + 卷起来的袖口 + 圆圆的手 ──
  const arms = [-1, 1].map((sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.27, 0.86, 0); p.rotation.z = sx * ARM_Z;
    const k = new Kit();
    k.add(new THREE.CapsuleGeometry(0.078, 0.15, 4, 14), jacket, 0, -0.12, 0);
    k.add(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 18), jacket, 0, -0.235, 0);
    k.add(new THREE.SphereGeometry(0.078, 18, 14), skin, 0, -0.315, 0, 0, 0, 0, [1, 1.1, 0.92]);
    p.add(k.build()); body.add(p); return p;
  });

  // ── 头：脸颊下半边肉嘟嘟 ──
  const head = new THREE.Group(); head.position.set(0, 1.22, 0); body.add(head);
  const hk = new Kit();
  const hg = new THREE.SphereGeometry(0.4, 36, 26), hp = hg.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i) / 0.4, k = 1 + 0.06 * Math.exp(-(((y + 0.35) / 0.3) ** 2));
    hp.setXYZ(i, hp.getX(i) * k, hp.getY(i) * 0.95, hp.getZ(i) * k * 0.96);
  }
  hg.computeVertexNormals();
  hk.add(hg, skin);
  for (const sx of [-1, 1]) hk.add(new THREE.SphereGeometry(0.085, 14, 10), skin, sx * 0.4, -0.06, -0.02, 0, 0, 0, [0.6, 1, 0.8]);
  // 三角小鼻子、弯弯的嘴、眉毛
  const tri = new THREE.Shape();
  tri.moveTo(0, 0.03); tri.lineTo(-0.027, -0.018); tri.lineTo(0.027, -0.018); tri.closePath();
  hk.add(new THREE.ExtrudeGeometry(tri, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3 }), mat('#f08a50', { roughness: 0.55 }), 0, -0.08, 0.381, 0.18, 0, 0, 1.25);
  const smile = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.05, -0.15, 0.352), new THREE.Vector3(0, -0.192, 0.366), new THREE.Vector3(0.05, -0.15, 0.352));
  hk.add(new THREE.TubeGeometry(smile, 14, 0.0085, 6), mat('#a8503f', { roughness: 0.5 }));
  const browM = mat(look.hair[0], { roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const pts = [[0.11, 0.108], [0.165, 0.124], [0.22, 0.11]].map(([x, y]) => new THREE.Vector3(sx * x, y, 0.386 * Math.sqrt(1 - (x / 0.4) ** 2 - (y / 0.38) ** 2) + 0.003));
    hk.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, girl ? 0.006 : 0.009, 6), browM);
  }

  // ── 头发：一顶发帽 + 后脑勺的蓬松 + 一缕缕刘海和鬓发 ──
  hk.add(new THREE.SphereGeometry(0.43, 36, 14, 0, Math.PI * 2, 0, Math.PI * 0.43), hair, 0, 0.02, 0, -0.42);
  const lock = (phi, el, R, len, w, d, rx, curl, twist, bow) => {
    const g = lockGeo(len, w, d, curl, twist, bow);
    hk.add(placeYXZ(g, R * Math.cos(el) * Math.sin(phi), R * Math.sin(el) + 0.02, R * Math.cos(el) * Math.cos(phi), rx, phi, 0), hair);
  };
  if (girl) {
    hk.add(new THREE.SphereGeometry(0.41, 28, 18), hair, 0, -0.03, -0.075, 0, 0, 0, [1.04, 0.95, 0.94]);
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
  } else {
    // 短发：刘海往一边撇，两鬓和后脑勺的发梢往外翘，头顶两根呆毛
    hk.add(new THREE.SphereGeometry(0.41, 28, 18), hair, 0, 0.02, -0.07, 0, 0, 0, [1.05, 0.9, 0.95]);
    [[-0.9, 0.24, 0.24, 0.14], [-0.6, 0.22, 0.24, 0.14], [-0.3, 0.24, 0.25, 0.12], [0.0, 0.21, 0.24, 0.12], [0.3, 0.16, 0.22, -0.1], [0.6, 0.21, 0.23, -0.14], [0.9, 0.24, 0.24, -0.14]]
      .forEach(([phi, len, w, tw]) => lock(phi, 0.86, 0.425, len, w, 0.085, -0.44, -0.1, tw, 0.07));
    for (const sx of [-1, 1]) {
      lock(sx * 1.15, 0.52, 0.44, 0.3, 0.22, 0.09, 0.02, 0.1, -sx * 0.1, 0.08);
      lock(sx * 1.5, 0.47, 0.44, 0.31, 0.22, 0.09, 0.08, 0.14, 0, 0.08);
      lock(sx * 1.85, 0.15, 0.41, 0.17, 0.2, 0.09, -0.6, 0.25, 0, 0);
      lock(sx * 2.3, 0.45, 0.41, 0.16, 0.2, 0.09, -0.8, 0.25, 0, 0);
    }
    for (const phi of [2.05, 2.42, 2.78, 3.14, 3.5, 3.86, 4.23]) lock(phi, 0.12, 0.425, 0.3, 0.24, 0.09, 0.28, 0.16, 0, 0.06);
    hk.add(placeYXZ(lockGeo(0.16, 0.06, 0.035, 0.55), 0.03, 0.43, 0.03, Math.PI - 0.35, 0.5, 0), hair);
    hk.add(placeYXZ(lockGeo(0.12, 0.05, 0.03, 0.5), -0.04, 0.435, 0.0, Math.PI - 0.5, -0.9, 0), hair);
  }
  head.add(hk.build());

  // 眼睛（会眨）和腮红；女孩多一道睫毛
  const eyeT = eyeTex(...look.eye);
  const eyes = [-1, 1].map((sx) => {
    const e = makeEye(0.13, 0.18, 0.03, eyeT, girl ? { side: sx, r: 0.0075 } : null);
    e.position.set(sx * 0.165, -0.025, 0.338); e.rotation.set(-0.05, sx * 0.42, 0);
    head.add(e); return e;
  });
  for (const sx of [-1, 1]) {
    const b = blush(0.13, 0.075, '#ff9f95', girl ? 0.75 : 0.5); b.position.set(sx * 0.27, -0.15, 0.275); b.rotation.y = sx * 0.72; head.add(b);
  }

  return { body, head, legs, arms, eyes, pin };
}
