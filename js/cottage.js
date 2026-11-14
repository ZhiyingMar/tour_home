// 屋外看到的小屋：半木构的抹灰墙、一片片鱼鳞瓦的屋顶（带屋脊瓦、雕花封檐板、尖顶饰、檐沟）、
// 毛石墙基和烟囱、拱形木门和小门廊、带百叶窗和花箱的窗、山墙上的圆窗，再加门前的路灯和信箱。
// 尺寸和原来的方块小屋一样（墙 6.4 × 5，屋脊高 5.9），所以占地、门的位置、烟的位置都不用改。
import * as THREE from 'three';
import { rng, mat } from './util.js';
import { stoneTex } from './textures.js';
import { Kit, soft, lathe, rounded, molding, fabric, brass, iron } from './shapes.js';
import { canopyGeo, leafBump } from './flora.js';

const PLASTER = '#f6e7cd', TRIM = '#fff6e6', BEAM = '#8f6242', DOOR = '#dba878', SHUTTER = '#8fbf9a';
const stoneMats = ['#cfc2b2', '#bfb09e', '#d9cdbd', '#b5a592', '#c8b8a4'].map((color) =>
  new THREE.MeshStandardMaterial({ color, map: stoneTex, bumpMap: stoneTex, bumpScale: 1.4, roughness: 0.92 }));

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const mtx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => {
  if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.setScalar(s);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.clone());
};
// 在某个“父坐标系”里摆零件：先按零件自己的位置摆好，再整体放到 parent 那里
const placer = (k, parent) => (geo, m, x, y, z, rx, ry, rz, s) => {
  const g = geo.clone().applyMatrix4(mtx(x, y, z, rx, ry, rz, s)).applyMatrix4(parent);
  k.add(g, m);
};

// 拱形（下面是矩形，上面半圆）
function archShape(w, straight) {
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, straight); s.absarc(0, straight, r, 0, Math.PI, false); s.closePath();
  return s;
}

// 毛石：沿一面墙一行行垒（u 是水平方向，v 是高度；face 把 (u, v) 变成世界坐标和朝向）
function stoneRows(k, r, u0, u1, v0, v1, face, deep = 0.12) {
  let v = v0;
  while (v < v1 - 0.01) {
    const h = Math.min(0.19 + r() * 0.08, v1 - v);
    let u = u0;
    while (u < u1 - 0.01) {
      let w = 0.26 + r() * 0.22;
      if (u1 - (u + w) < 0.14) w = u1 - u;
      const d = deep + r() * 0.04;
      const g = soft(w - 0.03, h - 0.03, d, { e: 0.32, puff: 0.14, seg: 3 }).applyMatrix4(mtx(0, 0, 0, (r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.05));
      k.add(g.applyMatrix4(face(u + w / 2, v + h / 2)), stoneMats[Math.floor(r() * stoneMats.length)]);
      u += w;
    }
    v += h;
  }
}

// ───── 窗：窗套、拱心石、窗台、六格窗棂、两扇带爱心的百叶窗、花箱和花 ─────
function addWindow(k, parent, glass, { flowers = true, shutters = true } = {}) {
  const P = placer(k, parent);
  P(new THREE.PlaneGeometry(1.2, 1.1), glass, 0, 0, -0.03);
  for (const s of [-1, 1]) P(rounded(0.12, 1.3, 0.08, 0.02, 1), TRIM, s * 0.66, 0, 0.03);
  P(rounded(1.56, 0.16, 0.1, 0.02, 1), TRIM, 0, 0.63, 0.04);
  P(rounded(0.18, 0.24, 0.13, 0.02, 1), TRIM, 0, 0.66, 0.06);
  P(molding([[0, 0], [0.16, 0], [0.18, 0.02], [0.18, 0.05], [0.16, 0.07], [0, 0.07]], 1.5), TRIM, 0, -0.62, 0);
  for (const x of [-0.2, 0.2]) P(rounded(0.04, 1.1, 0.04, 0.01, 1), TRIM, x, 0, -0.01);
  P(rounded(1.2, 0.045, 0.04, 0.01, 1), TRIM, 0, 0.08, -0.01);
  // 百叶窗：三块竖板 + 两根横档 + 一根斜撑，上面镂一颗心
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.05); heart.bezierCurveTo(0.07, 0.0, 0.05, 0.06, 0, 0.03); heart.bezierCurveTo(-0.05, 0.06, -0.07, 0.0, 0, -0.05);
  const heartGeo = new THREE.ShapeGeometry(heart);
  for (const s of shutters ? [-1, 1] : []) {
    const cx = s * 0.86;
    for (const dx of [-0.12, 0, 0.12]) P(rounded(0.115, 1.18, 0.04, 0.01, 1), SHUTTER, cx + dx, 0, 0.02);
    for (const y of [-0.38, 0.38]) P(rounded(0.36, 0.08, 0.03, 0.01, 1), '#7aaa86', cx, y, 0.055);
    P(rounded(0.06, 0.85, 0.03, 0.01, 1), '#7aaa86', cx, 0, 0.055, 0, 0, s * 0.38);
    P(heartGeo, mat('#3e4a3c'), cx, 0.5, 0.042, 0, 0, 0, 1.3);
    for (const y of [-0.38, 0.38]) P(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 8), iron, s * 0.69, y, 0.05);
  }
  if (!flowers) return;
  // 花箱：木箱子、土、一丛叶子和七朵花（五片花瓣 + 黄色花心）
  P(rounded(1.4, 0.26, 0.3, 0.03, 1), BEAM, 0, -0.82, 0.18);
  P(rounded(1.32, 0.03, 0.24, 0.01, 1), mat('#5a4030', { roughness: 1 }), 0, -0.68, 0.18);
  const leafy = mat('#6fae6c', { roughness: 0.7 });
  for (let i = 0; i < 8; i++) P(new THREE.SphereGeometry(0.1, 10, 8), leafy, -0.6 + i * 0.17, -0.66, 0.18 + (i % 2 ? 0.05 : -0.04), 0, 0, 0, [1, 0.6, 1]);
  const cols = ['#f2a9a0', '#f6cf6b', '#fffaf0', '#d6b4e8', '#f2a9a0', '#a9c9ee', '#f6b8c8'];
  const petal = new THREE.SphereGeometry(0.045, 8, 6);
  cols.forEach((c, i) => {
    const fx = -0.54 + i * 0.18, fy = -0.56 + (i % 2) * 0.05, fz = 0.22;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      P(petal, mat(c, { roughness: 0.7 }), fx + Math.cos(a) * 0.04, fy + Math.sin(a) * 0.04, fz, 0, 0, a, [1, 0.6, 0.45]);
    }
    P(new THREE.SphereGeometry(0.022, 8, 6), mat('#f3c24a', { roughness: 0.6 }), fx, fy, fz + 0.015);
  });
}

export function buildCottage(winMat, lanternMat) {
  const k = new Kit(), r = rng(57);
  const g = new THREE.Group();

  // ── 墙基和墙 ──
  k.add(rounded(6.8, 0.5, 5.4, 0.04), '#a99a8c', 0, 0.2, -2.6);
  stoneRows(k, r, -3.4, 3.4, -0.02, 0.46, (u, v) => mtx(u, v, 0.1));
  for (const s of [-1, 1]) stoneRows(k, r, -5.3, 0.1, -0.02, 0.46, (u, v) => mtx(s * 3.4, v, u, 0, s * Math.PI / 2, 0));
  k.add(rounded(6.4, 3.2, 5, 0.03), PLASTER, 0, 1.9, -2.6);
  // 山墙（屋顶下面那块五边形）
  const gab = new THREE.Shape();
  gab.moveTo(-3.2, 3.48); gab.lineTo(3.2, 3.48); gab.lineTo(3.2, 3.7); gab.lineTo(0, 5.74); gab.lineTo(-3.2, 3.7); gab.closePath();
  k.add(new THREE.ExtrudeGeometry(gab, { depth: 5, bevelEnabled: false }).translate(0, 0, -5.1), PLASTER);

  // ── 木构架：四角立柱、上下横梁、侧墙的立柱和斜撑 ──
  for (const sx of [-1, 1]) for (const z of [-0.1, -5.1]) k.add(rounded(0.2, 3.2, 0.2, 0.02, 1), BEAM, sx * 3.2, 1.9, z);
  k.add(rounded(6.6, 0.18, 0.12, 0.02, 1), BEAM, 0, 3.42, -0.06);
  k.add(rounded(6.6, 0.14, 0.1, 0.02, 1), BEAM, 0, 0.4, -0.06);
  for (const sx of [-1, 1]) {
    const x = sx * 3.24;
    k.add(rounded(0.12, 0.18, 5.2, 0.02, 1), BEAM, x, 3.42, -2.6);
    k.add(rounded(0.1, 0.14, 5.2, 0.02, 1), BEAM, x, 0.4, -2.6);
    for (const z of [-1.76, -3.44]) k.add(rounded(0.12, 2.9, 0.14, 0.02, 1), BEAM, x, 1.9, z);
    const L = Math.hypot(1.5, 2.75), ang = Math.atan2(1.5, 2.75);
    k.add(rounded(0.1, L, 0.12, 0.02, 1), BEAM, x, 1.9, -0.98, ang, 0, 0);
    k.add(rounded(0.1, L, 0.12, 0.02, 1), BEAM, x, 1.9, -4.22, -ang, 0, 0);
  }

  // ── 屋顶：两块屋面板 + 一片片鱼鳞瓦（实例化，每片颜色深浅略有不同）──
  const ALPHA = Math.atan2(2.5, 3.9), ca = Math.cos(ALPHA), sa = Math.sin(ALPHA);
  const SLOPE = 4.05 / ca, Z0 = 0.6, Z1 = -5.75, ZL = Z0 - Z1;
  const deck = mat('#8f4636', { roughness: 0.9 });
  for (const s of [-1, 1]) {
    const cx = s * (SLOPE / 2) * ca - s * 0.06 * sa, cy = 5.9 - (SLOPE / 2) * sa - 0.06 * ca;
    k.add(rounded(SLOPE, 0.12, ZL, 0.02, 1), deck, cx, cy, (Z0 + Z1) / 2, 0, 0, -s * ALPHA);
  }
  const tileShape = new THREE.Shape();
  tileShape.moveTo(-0.155, 0.19); tileShape.lineTo(-0.155, -0.04); tileShape.absarc(0, -0.04, 0.155, Math.PI, 0, false); tileShape.lineTo(0.155, 0.19); tileShape.closePath();
  const tileGeo = new THREE.ExtrudeGeometry(tileShape, { depth: 0.03, bevelEnabled: false, curveSegments: 5 }).rotateX(-0.07);
  const tiles = [];
  const ROWS = 18, COLS = 21, STEP = 0.262, CW = ZL / COLS;
  for (const s of [-1, 1]) {
    const X = new THREE.Vector3(0, 0, -s), Y = new THREE.Vector3(-s * ca, sa, 0), N = new THREE.Vector3(s * sa, ca, 0);
    const E = new THREE.Vector3(s * 4.05, 5.9 - 4.05 * sa / ca, 0);
    for (let row = 0; row < ROWS; row++) {
      const d = 0.19 + row * STEP;
      for (let c = 0; c <= COLS; c++) {
        const z = Z0 - (c + (row % 2 ? 0 : 0.5)) * CW;
        if (z < Z1 + 0.15 || z > Z0 - 0.15) continue;
        const p = E.clone().addScaledVector(Y, d).addScaledVector(N, 0.015 + (row % 2) * 0.004);
        p.z = z;
        tiles.push(new THREE.Matrix4().makeBasis(X, Y, N).setPosition(p));
      }
    }
  }
  const tileMesh = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72 }), tiles.length);
  const tc = new THREE.Color(), tBase = [new THREE.Color('#e2725b'), new THREE.Color('#d8654f'), new THREE.Color('#e8846a'), new THREE.Color('#cf5f4c')];
  tiles.forEach((m, i) => { tileMesh.setMatrixAt(i, m); tileMesh.setColorAt(i, tc.copy(tBase[Math.floor(r() * 4)]).offsetHSL(0, 0, (r() - 0.5) * 0.04)); });
  tileMesh.castShadow = tileMesh.receiveShadow = true;
  g.add(tileMesh);
  // 屋脊瓦：一节节半圆筒
  const ridgeMat = mat('#c75d48', { roughness: 0.7 });
  for (let z = Z0 - 0.2; z > Z1; z -= 0.42) {
    k.add(new THREE.CylinderGeometry(0.15, 0.15, 0.44, 14, 1, false, -Math.PI / 2, Math.PI), ridgeMat, 0, 5.92, z, -Math.PI / 2, 0, 0);
    k.add(new THREE.TorusGeometry(0.15, 0.018, 6, 14, Math.PI), ridgeMat, 0, 5.92, z + 0.2, 0, 0, 0);
  }
  // 封檐板：沿着屋檐斜下来的一条，下沿是一串扇贝花边；屋脊尖上一个尖顶饰
  for (const s of [-1, 1]) {
    const L = SLOPE + 0.05, n = 14, w = L / n, sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(s * L, 0); sh.lineTo(s * L, -0.15);
    for (let i = n - 1; i >= 0; i--) { const cx = s * (i + 0.5) * w; sh.absarc(cx, -0.15, w / 2, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : 0, s > 0); }
    sh.lineTo(0, -0.15); sh.closePath();
    k.add(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false, curveSegments: 4 }), TRIM, 0, 5.93, Z0 + 0.01, 0, 0, -s * ALPHA);
  }
  k.add(lathe([[0, 0], [0.07, 0], [0.08, 0.06], [0.04, 0.12], [0.06, 0.2], [0.03, 0.3], [0.015, 0.42], [0, 0.48]], 16), TRIM, 0, 5.9, Z0 + 0.04);
  // 檐沟
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.065, 0.065, ZL, 12), mat('#c98a5a', { roughness: 0.35, metalness: 0.6 }), s * 4.12, 3.24, (Z0 + Z1) / 2, Math.PI / 2, 0, 0);

  // ── 烟囱：毛石垒的，顶上两个陶土烟囱帽 ──
  k.add(rounded(0.82, 2.0, 0.82, 0.02, 1), '#a99a8c', 1.9, 5.15, -3.6);
  const CY0 = 4.5, CY1 = 6.12;
  stoneRows(k, r, 1.48, 2.32, CY0, CY1, (u, v) => mtx(u, v, -3.19), 0.1);
  stoneRows(k, r, 1.48, 2.32, CY0, CY1, (u, v) => mtx(u, v, -4.01, 0, Math.PI, 0), 0.1);
  for (const s of [-1, 1]) stoneRows(k, r, -4.01, -3.19, CY0, CY1, (u, v) => mtx(1.9 + s * 0.41, v, u, 0, s * Math.PI / 2, 0), 0.1);
  k.add(rounded(1.08, 0.12, 1.08, 0.03, 1), '#a99a8c', 1.9, 6.2, -3.6);
  for (const dx of [-0.2, 0.2]) k.add(lathe([[0.1, 0], [0.12, 0], [0.12, 0.05], [0.1, 0.1], [0.09, 0.3], [0.11, 0.33], [0.11, 0.38], [0.08, 0.38], [0.07, 0.1]], 18), mat('#c2694f', { roughness: 0.8 }), 1.9 + dx, 6.26, -3.6);

  // ── 门：拱形门套、竖木板门、铁合页、圆窗、黄铜把手；上面一个小门廊 ──
  const D = mtx(0, 0.42, -0.1), PD = placer(k, D);
  const casing = archShape(1.5, 1.75); casing.holes.push(archShape(1.2, 1.65));
  PD(new THREE.ExtrudeGeometry(casing, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 18 }), TRIM, 0, 0, 0);
  PD(new THREE.ExtrudeGeometry(archShape(1.2, 1.65), { depth: 0.06, bevelEnabled: false, curveSegments: 18 }), DOOR, 0, 0, -0.03);
  for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) { const h = 1.65 + Math.sqrt(0.36 - x * x) - 0.05; PD(rounded(0.014, h, 0.01, 0.004, 1), BEAM, x, h / 2, 0.032); }
  for (const y of [0.4, 1.55]) {
    PD(rounded(0.85, 0.06, 0.016, 0.01, 1), iron, -0.2, y, 0.04);
    PD(new THREE.SphereGeometry(0.035, 10, 8), iron, 0.22, y, 0.04, 0, 0, 0, [1, 1, 0.4]);
  }
  PD(new THREE.CircleGeometry(0.2, 24), winMat, 0, 1.73, 0.035);
  PD(new THREE.TorusGeometry(0.21, 0.03, 8, 28), brass, 0, 1.73, 0.04);
  PD(rounded(0.025, 0.4, 0.02, 0.008, 1), brass, 0, 1.73, 0.045);
  PD(rounded(0.4, 0.025, 0.02, 0.008, 1), brass, 0, 1.73, 0.045);
  PD(lathe([[0, 0], [0.04, 0], [0.04, 0.012], [0.015, 0.025], [0.015, 0.05], [0.035, 0.07], [0.03, 0.09], [0, 0.095]], 16), brass, 0.44, 1.05, 0.03, Math.PI / 2, 0, 0);
  // 门廊：两片小屋面 + 前面一块三角山花 + 两个弯托架
  const hoodMat = mat('#e2725b');
  for (const s of [-1, 1]) PD(rounded(0.98, 0.06, 0.95, 0.02, 1), hoodMat, s * 0.43, 2.63, 0.38, 0, 0, -s * 0.42);
  const tri = new THREE.Shape(); tri.moveTo(-0.82, 0); tri.lineTo(0.82, 0); tri.lineTo(0, 0.36); tri.closePath();
  PD(new THREE.ShapeGeometry(tri), TRIM, 0, 2.43, 0.83);
  PD(rounded(1.7, 0.06, 0.06, 0.02, 1), TRIM, 0, 2.42, 0.82);
  for (const s of [-1, 1]) PD(molding([[0, 0], [0.06, 0], [0.12, 0.18], [0.3, 0.34], [0.7, 0.42], [0.82, 0.42], [0.82, 0.5], [0, 0.5]], 0.08), BEAM, s * 0.72, 1.92, 0);
  // 台阶：每级几块石板
  for (const [y, z, w, d] of [[0.36, 0.5, 1.9, 0.9], [0.2, 1.1, 2.3, 0.6]]) {
    const n = 3;
    for (let i = 0; i < n; i++) k.add(soft(w / n - 0.03, 0.14, d - 0.02, { e: 0.2, puff: 0.04, seg: 4 }), stoneMats[(i + (y > 0.3 ? 0 : 2)) % stoneMats.length], -w / 2 + (i + 0.5) * (w / n), y, z);
  }
  k.add(soft(1.3, 0.04, 0.7, { e: 0.15, puff: 0.02, seg: 6 }), fabric('#e9b08f', { sheen: '#ffd8c0' }), 0, 0.45, 0.5);
  // 门口两盆圆滚滚的黄杨球
  const pot = lathe([[0, 0], [0.16, 0], [0.18, 0.04], [0.22, 0.34], [0.25, 0.36], [0.25, 0.42], [0.21, 0.42], [0.2, 0.38], [0, 0.38]], 24);
  const box = new THREE.MeshStandardMaterial({ color: '#5f9e5c', roughness: 0.8, bumpMap: leafBump, bumpScale: 1.4 });
  for (const s of [-1, 1]) {
    k.add(pot, mat('#c98060', { roughness: 0.85 }), s * 1.32, 0, 0.38);
    k.add(canopyGeo(40 + s, { lumps: 6, amp: 0.12, seg: 16 }), box, s * 1.32, 0.68, 0.38, 0, 0, 0, 0.3);
  }

  // ── 窗：正面两扇、两侧各一扇；山墙上一扇圆窗 ──
  for (const s of [-1, 1]) addWindow(k, mtx(s * 2.05, 2.2, -0.1), winMat);
  for (const s of [-1, 1]) addWindow(k, mtx(s * 3.2, 2.2, -2.6, 0, s * Math.PI / 2, 0), winMat, { flowers: false, shutters: false });
  k.add(new THREE.CircleGeometry(0.3, 28), winMat, 0, 4.3, -0.13);
  k.add(new THREE.TorusGeometry(0.33, 0.05, 8, 32), TRIM, 0, 4.3, -0.08);
  for (const rz of [0, Math.PI / 2]) k.add(rounded(0.04, 0.6, 0.04, 0.01, 1), TRIM, 0, 4.3, -0.1, 0, 0, rz);
  k.add(rounded(0.22, 0.12, 0.1, 0.02, 1), TRIM, 0, 4.66, -0.06);

  // ── 门前的路灯：铁杆、卷曲的托臂、四面玻璃的灯笼 ──
  const LX = -1.7, LZ = 1.0;
  k.add(lathe([[0, 0], [0.16, 0], [0.16, 0.06], [0.1, 0.1], [0.06, 0.2], [0.045, 0.24], [0, 0.24]], 18), iron, LX, 0, LZ);
  k.add(new THREE.CylinderGeometry(0.035, 0.045, 1.8, 10), iron, LX, 1.06, LZ);
  for (const y of [0.4, 1.0, 1.85]) k.add(new THREE.TorusGeometry(0.05, 0.014, 6, 14), iron, LX, y, LZ, Math.PI / 2, 0, 0);
  k.add(rounded(0.3, 0.04, 0.3, 0.01, 1), iron, LX, 1.95, LZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 6), iron, LX + sx * 0.13, 2.15, LZ + sz * 0.13);
  k.add(new THREE.ConeGeometry(0.23, 0.18, 4).rotateY(Math.PI / 4), iron, LX, 2.43, LZ);
  k.add(new THREE.SphereGeometry(0.035, 10, 8), brass, LX, 2.55, LZ);
  k.add(rounded(0.24, 0.32, 0.24, 0.02, 1), lanternMat, LX, 2.15, LZ);
  for (const s of [-1, 1]) k.add(new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI * 1.5), iron, LX + s * 0.09, 1.8, LZ, 0, s > 0 ? 0 : Math.PI, 0);

  // ── 信箱：木桩 + 圆顶红信箱 + 黄色小旗 ──
  const MX = 2.1, MZ = 2.6, red = new THREE.MeshPhysicalMaterial({ color: '#e2574c', roughness: 0.35, clearcoat: 0.6 });
  k.add(rounded(0.1, 1.0, 0.1, 0.02, 1), BEAM, MX, 0.5, MZ);
  k.add(rounded(0.24, 0.04, 0.2, 0.01, 1), BEAM, MX, 0.98, MZ);
  k.add(rounded(0.48, 0.18, 0.3, 0.03, 1), red, MX, 1.09, MZ);
  k.add(new THREE.CylinderGeometry(0.15, 0.15, 0.48, 18, 1, false, -Math.PI / 2, Math.PI), red, MX, 1.18, MZ, -Math.PI / 2, 0, -Math.PI / 2);
  k.add(new THREE.CircleGeometry(0.15, 18, 0, Math.PI), red, MX + 0.241, 1.18, MZ, 0, Math.PI / 2, 0);
  k.add(rounded(0.012, 0.06, 0.06, 0.005, 1), brass, MX + 0.25, 1.12, MZ);
  k.add(rounded(0.02, 0.26, 0.025, 0.008, 1), mat('#f6cf6b'), MX + 0.05, 1.32, MZ + 0.17);
  k.add(rounded(0.12, 0.08, 0.012, 0.005, 1), mat('#f6cf6b'), MX + 0.11, 1.41, MZ + 0.17);

  g.add(k.build());
  return g;
}
