// 大件家具：沙发、床。每件都是按真实家具的结构一块块拼的（车木腿、拉扣软垫、卷边扶手、搭着的毯子），
// 再用 Kit 合并成少量网格。坐标都是家具自己的局部坐标，正面朝 +z，摆放在 room.js 里做。
import * as THREE from 'three';
import { rng, canvasTex } from './util.js';
import { Kit, soft, pillow, turnedLeg, rounded, fabric } from './shapes.js';

export const WOOD = '#b98458', WOOD_DARK = '#8f6242', WOOD_LIGHT = '#d9a877';

// 沿一条曲线垂下来的一块布（毯子搭在扶手上）。path 是 [x, y] 点列，布沿 z 方向宽 w，越往下褶子越明显
export function drape(path, w, { folds = 4, amp = 0.025, segU = 28, segV = 36, z0 = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(path.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const g = new THREE.PlaneGeometry(1, 1, segU, segV), p = g.attributes.position;
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = 0.5 - p.getY(i);
    curve.getPointAt(v, P); curve.getTangentAt(v, T);
    const f = Math.sin(u * folds * Math.PI * 2 + v * 2) * amp * (0.25 + 0.75 * v);
    p.setXYZ(i, P.x - T.y * f, P.y + T.x * f, z0 + (u - 0.5) * w);
  }
  g.computeVertexNormals();
  return g;
}

// 针织毯：粗条纹 + 一行行“人”字针脚
export function knitTex(a, b) {
  const t = canvasTex(128, 256, (c) => {
    c.fillStyle = a; c.fillRect(0, 0, 128, 256);
    c.fillStyle = b;
    for (const [y, h] of [[20, 26], [70, 10], [96, 10], [150, 26], [200, 10], [226, 10]]) c.fillRect(0, y, 128, h);
    c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = 1.5;
    for (let y = 0; y < 256; y += 6) for (let x = 0; x < 128; x += 8) {
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 4, y + 5); c.lineTo(x + 8, y); c.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const starPillowTex = canvasTex(256, 256, (c) => {
  c.fillStyle = '#9fc1e6'; c.fillRect(0, 0, 256, 256);
  c.fillStyle = '#fff6df';
  const r = rng(13);
  for (let i = 0; i < 18; i++) {
    c.save(); c.translate(20 + r() * 216, 20 + r() * 216); c.rotate(r() * 6); c.beginPath();
    for (let k = 0; k < 10; k++) { const rr = k % 2 ? 5 : 12, a = (k * Math.PI) / 5; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.fill(); c.restore();
  }
  c.strokeStyle = '#fff6df'; c.lineWidth = 6; c.strokeRect(8, 8, 240, 240);
});

// ───── 沙发：长 3.2、深 1.16；坐垫面高 0.86，扶手顶高 0.98（小星会跳上左扶手）─────
export function buildSofa() {
  const k = new Kit();
  const main = fabric('#8cbc97', { sheen: '#e6f7e4' }), deep = fabric('#76a682', { sheen: '#d6eed8' });
  k.add(soft(2.82, 0.38, 1.08, { e: 0.16, puff: 0.03 }), deep, 0, 0.45, 0.02);
  for (const [x, z] of [[-1.42, 0.44], [1.42, 0.44], [-1.42, -0.44], [1.42, -0.44]]) k.add(turnedLeg(0.26, 0.042), WOOD_DARK, x, 0, z);
  // 卷边扶手：下面一块方墩，上面一条圆滚滚的卷边，正面一圈包边
  for (const sx of [-1, 1]) {
    k.add(soft(0.4, 0.66, 1.12, { e: 0.2, puff: 0.04 }), main, sx * 1.38, 0.57, 0);
    k.add(soft(0.5, 0.3, 1.18, { e: 0.42, puff: 0.03 }), main, sx * 1.39, 0.83, 0.01);
    k.add(new THREE.TorusGeometry(0.11, 0.017, 8, 28), deep, sx * 1.39, 0.81, 0.6);
  }
  // 靠背 + 两个拉扣靠垫
  k.add(soft(2.86, 0.82, 0.32, { e: 0.22, puff: 0.05 }), main, 0, 0.98, -0.42);
  const button = new THREE.SphereGeometry(0.022, 10, 8);
  for (const sx of [-1, 1]) {
    const g = soft(1.2, 0.6, 0.24, { e: 0.3, puff: 0.16, tuft: { face: 'z', cols: 3, rows: 2, depth: 0.035, spread: 0.6 }, seg: 14 });
    const m = k.add(g, main, sx * 0.6, 1.0, -0.16, -0.1);
    for (const b of g.userData.buttons) { const v = b.clone().applyMatrix4(m); k.add(button, deep, v.x, v.y, v.z); }
  }
  // 坐垫：中间坐得微微塌下去
  for (const sx of [-1, 1]) k.add(soft(1.18, 0.22, 0.84, { e: 0.28, puff: 0.1, sag: 0.18 }), main, sx * 0.59, 0.75, 0.13);
  // 抱枕
  k.add(pillow(0.5, 0.5, 0.2), fabric('#fbf1df', { sheen: '#ffffff' }), 0.96, 1.06, -0.04, -0.28, -0.1, 0.1);
  k.add(pillow(0.44, 0.44, 0.18), fabric('#f2c35e', { sheen: '#fff1c4' }), 0.55, 1.0, 0.04, -0.32, 0.2, -0.16);
  k.add(pillow(0.46, 0.46, 0.18), fabric('#ffffff', { map: starPillowTex, sheen: '#e8f0ff' }), -1.0, 1.03, -0.03, -0.3, -0.15, -0.12);
  // 搭在右扶手上的针织毯
  const throwMat = fabric('#ffffff', { map: knitTex('#f6d5c8', '#ea9f92'), side: THREE.DoubleSide, bump: 0.5 });
  k.add(drape([[0.9, 0.875], [1.12, 0.92], [1.27, 1.0], [1.45, 1.015], [1.62, 0.95], [1.67, 0.78], [1.68, 0.5]], 0.62, { amp: 0.018 }), throwMat, 0, 0, 0.14);
  return k.build();
}

// ───── 床：宽 2.14、长 2.85，床头在 -z；被子面高约 1.2（人躺进去会被盖住半截）─────
export function buildBed(duvetTex) {
  const k = new Kit();
  k.add(rounded(1.98, 0.16, 2.72, 0.03), WOOD, 0, 0.36, 0);
  for (const sx of [-1, 1]) k.add(rounded(0.09, 0.24, 2.7, 0.03), WOOD, sx * 1.03, 0.38, 0);
  const finial = new THREE.SphereGeometry(0.075, 16, 12);
  for (const sx of [-1, 1]) {
    k.add(turnedLeg(1.55, 0.06), WOOD, sx * 1.03, 0, -1.38);
    k.add(finial, WOOD, sx * 1.03, 1.6, -1.38);
    k.add(turnedLeg(0.95, 0.055), WOOD, sx * 1.03, 0, 1.38);
    k.add(finial, WOOD, sx * 1.03, 0.99, 1.38, 0, 0, 0, 0.9);
  }
  // 拱形床头板 + 里面一块浅色的凸起嵌板；床尾板低一些
  const arch = (w, h, rise, depth, bevel) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.quadraticCurveTo(0, h + rise * 2, -w / 2, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 20 });
    g.translate(0, 0, -depth / 2);
    return g;
  };
  k.add(arch(1.96, 0.88, 0.2, 0.06, 0.02), WOOD, 0, 0.42, -1.38);
  k.add(arch(1.5, 0.52, 0.14, 0.03, 0.015), WOOD_LIGHT, 0, 0.6, -1.33);
  k.add(arch(1.96, 0.42, 0.06, 0.06, 0.02), WOOD, 0, 0.36, 1.38);
  k.add(arch(1.5, 0.22, 0.04, 0.03, 0.015), WOOD_LIGHT, 0, 0.46, 1.43);
  // 床垫、被子（有绗缝的小凹坑）、翻折的被头、枕头、床尾叠好的毯子
  const white = fabric('#fbf6ee', { sheen: '#ffffff' });
  k.add(soft(1.94, 0.3, 2.64, { e: 0.16, puff: 0.04 }), white, 0, 0.59, 0);
  const duvet = fabric('#ffffff', { map: duvetTex, sheen: '#eef4ff', bump: 0.5 });
  k.add(soft(2.1, 0.48, 1.84, { e: 0.2, puff: 0.1, tuft: { face: 'y', cols: 4, rows: 4, depth: 0.035, spread: 0.78 }, seg: 14 }), duvet, 0, 0.96, 0.44);
  k.add(soft(2.12, 0.16, 0.32, { e: 0.4, puff: 0.08 }), white, 0, 1.12, -0.5, 0.1);
  for (const sx of [-1, 1]) k.add(pillow(0.86, 0.56, 0.22), white, sx * 0.47, 0.88, -1.06, -1.2, 0, sx * 0.04);
  k.add(pillow(0.5, 0.32, 0.14), fabric('#ffffff', { map: starPillowTex }), 0, 0.97, -0.74, -0.95);
  k.add(soft(2.06, 0.07, 0.44, { e: 0.25, puff: 0.15 }), fabric('#ffffff', { map: knitTex('#f6d5c8', '#ea9f92') }), 0, 1.22, 1.04);
  return k.build();
}

