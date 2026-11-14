// 中小件家具：书架（一本本有书脊、书页的书）、书桌（车木腿、抽屉、台灯、信、笔筒、马克杯）、落地灯、门。
// 坐标都是家具自己的局部坐标，摆放在 room.js 里做。
import * as THREE from 'three';
import { rng, mat } from './util.js';
import { Kit, soft, lathe, turnedLeg, rounded, molding, fabric, brass, ceramic } from './shapes.js';
import { WOOD, WOOD_DARK, WOOD_LIGHT } from './furniture.js';

const BOOK_COLS = ['#e58f84', '#8fb3d9', '#f0c766', '#8dbb95', '#c7a3dc', '#f3e6cf', '#e9a36b', '#6f8fb8', '#b5625a', '#9cc5a1'];
const PAGES = '#f7efdc', GILT = '#d9b264';

// 一本书：书脊朝 +x，d = 进深，h = 高，t = 厚。两块封面板 + 书脊 + 书页（书页比封面矮一点，从上面看得到）
function book(k, x, y, z, d, h, t, color, rz = 0, ry = 0, bands = false) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rz, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const put = (geo, material, px, py, pz) => { geo.translate(px, py, pz); geo.applyMatrix4(m); k.add(geo, material); };
  put(new THREE.BoxGeometry(d, h, 0.006), color, 0, 0, t / 2 - 0.003);
  put(new THREE.BoxGeometry(d, h, 0.006), color, 0, 0, -t / 2 + 0.003);
  put(rounded(0.014, h, t, 0.006, 1), color, d / 2 - 0.007, 0, 0);
  put(new THREE.BoxGeometry(d - 0.016, h - 0.018, t - 0.012), PAGES, -0.006, -0.002, 0);
  if (bands) for (const s of [-0.32, 0.32]) put(new THREE.BoxGeometry(0.004, 0.018, t * 0.9), GILT, d / 2 + 0.001, s * h, 0);
}

// ───── 书架：深 0.5（x）、宽 1.8（z）、高 2.5；书脊朝 +x ─────
export function buildShelf() {
  const k = new Kit(), r = rng(21);
  for (const s of [-1, 1]) k.add(rounded(0.5, 2.5, 0.05, 0.015, 1), WOOD, 0, 1.25, s * 0.875);
  k.add(rounded(0.02, 2.4, 1.72, 0.005, 1), WOOD_DARK, -0.235, 1.22, 0);
  k.add(rounded(0.48, 0.1, 1.72, 0.02), WOOD_DARK, 0.0, 0.05, 0);
  // 顶上的檐口线脚（沿 z 方向，往 +x 伸出来）
  k.add(molding([[0, 0], [0.04, 0], [0.04, 0.03], [0.08, 0.07], [0.09, 0.1], [0.09, 0.13], [0, 0.13]], 1.96), WOOD, 0.24, 2.5, 0, 0, Math.PI / 2);
  k.add(rounded(0.54, 0.04, 1.86, 0.012, 1), WOOD, 0, 2.5, 0);
  const SH = [0.1, 0.68, 1.26, 1.84];
  for (const y of SH) k.add(rounded(0.46, 0.035, 1.72, 0.01, 1), WOOD, 0, y + 0.0175, 0);
  for (const y of SH.slice(1)) k.add(rounded(0.02, 0.05, 1.72, 0.008, 1), WOOD_LIGHT, 0.225, y + 0.01, 0); // 隔板前沿的小压条
  k.add(rounded(0.46, 0.035, 1.72, 0.01, 1), WOOD, 0, 2.42, 0);

  SH.forEach((y0, row) => {
    const top = y0 + 0.035;
    let z = -0.83, n = 0;
    while (z < 0.8) {
      const roll = r();
      // 偶尔空一格放个小摆件，或者一摞平放的书
      if (roll < 0.07 && z < 0.5 && n > 2) {
        const kind = (row + n) % 3;
        if (kind === 0) {
          k.add(lathe([[0, 0], [0.06, 0], [0.07, 0.08], [0.04, 0.16], [0.03, 0.2], [0.04, 0.22], [0, 0.22]], 18), ceramic(['#7fb5a5', '#f2a9a0', '#a9c9ee'][row % 3]), 0, top, z + 0.09);
        } else if (kind === 1) {
          for (let i = 0; i < 3; i++) book(k, -0.01, top + 0.02 + i * 0.04, z + 0.1, 0.26 - i * 0.02, 0.2 - i * 0.015, 0.04, BOOK_COLS[(row * 3 + i) % BOOK_COLS.length], Math.PI / 2, 0.1 * i);
        } else {
          k.add(rounded(0.03, 0.2, 0.16, 0.01, 1), WOOD_LIGHT, -0.08, top + 0.1, z + 0.09, 0, 0, 0.12);
          k.add(new THREE.PlaneGeometry(0.12, 0.15), new THREE.MeshStandardMaterial({ color: '#cfe6f3', roughness: 0.6 }), -0.063, top + 0.1, z + 0.09, 0, Math.PI / 2, 0.12);
        }
        z += 0.2; n = 0;
        continue;
      }
      const t = 0.035 + r() * 0.05, h = 0.3 + r() * 0.17, d = 0.25 + r() * 0.07;
      // 一排的最后一本，有时候斜靠着
      const lean = r() < 0.08 ? 0.22 : 0;
      book(k, 0.22 - d / 2, top + h / 2 + (lean ? -0.01 : 0), z + t / 2 + (lean ? h * 0.1 : 0), d, h, t, BOOK_COLS[Math.floor(r() * BOOK_COLS.length)], lean, 0, r() < 0.4);
      z += t + 0.004 + (lean ? h * 0.22 : 0);
      n++;
    }
  });
  return k.build();
}

// ───── 书桌：x 方向深 0.95，z 方向长 1.85，桌面高 1.0；正面朝 +x ─────
export function buildDesk(shadeMat) {
  const k = new Kit();
  k.add(rounded(0.95, 0.06, 1.85, 0.02), WOOD_LIGHT, 0, 0.97, 0);
  k.add(rounded(0.82, 0.16, 1.7, 0.015, 1), WOOD, 0, 0.86, 0);
  for (const z of [-0.43, 0.43]) {
    k.add(rounded(0.02, 0.11, 0.72, 0.008, 1), WOOD_LIGHT, 0.415, 0.86, z);
    k.add(lathe([[0, 0], [0.018, 0], [0.012, 0.012], [0.02, 0.025], [0, 0.03]], 12), brass, 0.425, 0.86, z, 0, 0, -Math.PI / 2);
  }
  for (const [x, z] of [[-0.37, -0.8], [0.37, -0.8], [-0.37, 0.8], [0.37, 0.8]]) k.add(turnedLeg(0.78, 0.04), WOOD, x, 0, z);
  for (const x of [-0.37, 0.37]) k.add(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 8), WOOD, x, 0.18, 0, Math.PI / 2);

  // 信：信封 + 三角封口 + 火漆印
  const env = new THREE.Group();
  const ek = new Kit();
  ek.add(rounded(0.3, 0.012, 0.44, 0.004, 1), '#fbf1df', 0, 0, 0);
  const flap = new THREE.Shape(); flap.moveTo(-0.15, 0.22); flap.lineTo(0.15, 0.22); flap.lineTo(0, 0.02); flap.closePath();
  ek.add(new THREE.ShapeGeometry(flap), mat('#f1e3c8', { side: THREE.DoubleSide }), 0, 0.007, 0, -Math.PI / 2);
  ek.add(lathe([[0, 0], [0.045, 0], [0.05, 0.006], [0.042, 0.012], [0.03, 0.014], [0, 0.014]], 16), mat('#d9473d', { roughness: 0.35 }), 0, 0.006, 0.02);
  env.add(ek.build()); env.position.set(0.12, 1.006, 0.05); env.rotation.y = 0.25;

  // 笔筒和铅笔
  k.add(lathe([[0, 0], [0.065, 0], [0.068, 0.01], [0.062, 0.15], [0.066, 0.155], [0.058, 0.155], [0.054, 0.012], [0, 0.012]], 20), ceramic('#a9c9ee'), -0.2, 1.0, 0.6);
  ['#f6cf6b', '#f2a9a0', '#9cc5a1', '#8fb3d9'].forEach((c, i) => {
    const a = i * 1.6, tilt = 0.12 + i * 0.03;
    k.add(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6).translate(0, 0.11, 0), c, -0.2 + Math.cos(a) * 0.02, 1.01, 0.6 + Math.sin(a) * 0.02, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
  });
  // 马克杯
  k.add(lathe([[0, 0], [0.05, 0], [0.055, 0.01], [0.055, 0.11], [0.048, 0.11], [0.046, 0.02], [0, 0.02]], 20), ceramic('#fbf1df'), 0.2, 1.0, -0.22);
  k.add(new THREE.TorusGeometry(0.03, 0.009, 8, 16, Math.PI), ceramic('#fbf1df'), 0.2, 1.055, -0.165, 0, -Math.PI / 2, -Math.PI / 2);
  k.add(new THREE.CircleGeometry(0.046, 16), mat('#7a4a2e', { roughness: 0.2 }), 0.2, 1.09, -0.22, -Math.PI / 2);
  // 两本叠着的书
  k.add(rounded(0.3, 0.05, 0.22, 0.01, 1), '#8dbb95', -0.18, 1.025, -0.15, 0, 0.1);
  k.add(rounded(0.27, 0.045, 0.2, 0.01, 1), '#e58f84', -0.17, 1.073, -0.15, 0, -0.15);

  // 台灯：车出来的灯座 + 一根弯弯的灯杆 + 喇叭形灯罩（灯罩材质由外面传进来，夜里会亮）
  k.add(lathe([[0, 0], [0.12, 0], [0.125, 0.015], [0.1, 0.035], [0.03, 0.05], [0.02, 0.06], [0, 0.06]], 24), ceramic('#7fb5a5'), -0.2, 1.0, -0.6);
  const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.22, 0), new THREE.Vector3(0.08, 0.4, 0), new THREE.Vector3(0.13, 0.45, 0)]);
  k.add(new THREE.TubeGeometry(arm, 16, 0.012, 8), brass, -0.2, 1.06, -0.6);
  const desk = k.build();
  const shade = new THREE.Mesh(lathe([[0.17, 0], [0.15, 0.04], [0.11, 0.13], [0.08, 0.18], [0.05, 0.2]], 28), shadeMat);
  shade.material.side = THREE.DoubleSide; shade.castShadow = true;
  shade.position.set(-0.07, 1.33, -0.6);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff4d6' }));
  bulb.position.set(-0.07, 1.38, -0.6);
  desk.add(env, shade, bulb);
  return desk;
}

// ───── 落地灯：圆顶底座、细灯杆、褶皱灯罩 ─────
export function buildFloorLamp(shadeMat) {
  const k = new Kit();
  k.add(lathe([[0, 0], [0.24, 0], [0.245, 0.02], [0.2, 0.05], [0.08, 0.09], [0.04, 0.12], [0, 0.12]], 32), WOOD_DARK, 0, 0, 0);
  k.add(new THREE.CylinderGeometry(0.018, 0.022, 1.78, 12), brass, 0, 1.0, 0);
  for (const y of [0.13, 0.95, 1.82]) k.add(lathe([[0, 0], [0.028, 0], [0.034, 0.015], [0.028, 0.03], [0, 0.03]], 14), brass, 0, y, 0);
  k.add(new THREE.SphereGeometry(0.045, 14, 10), new THREE.MeshBasicMaterial({ color: '#fff4d6' }), 0, 1.95, 0);
  k.add(lathe([[0, 0], [0.016, 0], [0.024, 0.03], [0, 0.06]], 12), brass, 0, 2.26, 0);
  const g = k.build();
  // 褶皱灯罩：一圈圈竖褶（顶点按角度往里外推）
  const shadeGeo = new THREE.CylinderGeometry(0.22, 0.36, 0.42, 72, 4, true), p = shadeGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), f = 1 + 0.03 * Math.abs(Math.sin(a * 18));
    p.setXYZ(i, x * f, p.getY(i), z * f);
  }
  shadeGeo.computeVertexNormals();
  shadeMat.side = THREE.DoubleSide;
  const shade = new THREE.Mesh(shadeGeo, shadeMat); shade.position.y = 2.05; shade.castShadow = true;
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.012, 6, 64), mat('#f3cf7a')); trim.rotation.x = Math.PI / 2; trim.position.y = 1.84;
  g.add(shade, trim);
  return g;
}

// ───── 门：嵌在右墙里，朝 -x（屋里）。宽 1.36（z），高 2.5 ─────
export function buildDoor() {
  const k = new Kit(), trim = '#fff6e6', leaf = '#dba878', panel = '#e6b88c';
  // 门套：两边 + 顶上，外圈宽板 + 里圈一道圆线
  for (const s of [-1, 1]) {
    k.add(rounded(0.05, 2.56, 0.16, 0.015, 1), trim, -0.04, 1.28, s * 0.74);
    k.add(new THREE.CylinderGeometry(0.018, 0.018, 2.5, 8), trim, -0.07, 1.25, s * 0.68);
  }
  k.add(rounded(0.06, 0.2, 1.68, 0.02), trim, -0.045, 2.62, 0);
  k.add(rounded(0.09, 0.05, 1.76, 0.015, 1), trim, -0.06, 2.74, 0);
  k.add(rounded(0.24, 0.03, 1.32, 0.01, 1), WOOD_DARK, -0.06, 0.015, 0);
  // 门扇：框架（两根竖梃 + 三根横档）+ 四块凸起的门板
  const X = -0.045;
  for (const s of [-1, 1]) k.add(rounded(0.06, 2.36, 0.16, 0.012, 1), leaf, X, 1.2, s * 0.5);
  for (const [y, h] of [[0.12, 0.2], [1.0, 0.16], [2.31, 0.14]]) k.add(rounded(0.06, h, 0.86, 0.012, 1), leaf, X, y + 0.02, 0);
  for (const [y, h] of [[0.6, 0.72], [1.68, 1.12]]) for (const s of [-1, 1]) {
    k.add(rounded(0.03, h, 0.4, 0.01, 1), leaf, X + 0.01, y, s * 0.21);
    k.add(rounded(0.035, h - 0.12, 0.3, 0.025), panel, X - 0.012, y, s * 0.21);
  }
  // 黄铜门把手、钥匙孔、合页
  k.add(lathe([[0, 0], [0.04, 0], [0.042, 0.01], [0.02, 0.02], [0.015, 0.05], [0.04, 0.07], [0.045, 0.09], [0.03, 0.105], [0, 0.11]], 18), brass, -0.06, 1.12, -0.42, 0, 0, Math.PI / 2);
  k.add(rounded(0.012, 0.14, 0.05, 0.01, 1), brass, -0.065, 0.98, -0.42);
  k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), mat('#2b201a'), -0.072, 0.99, -0.42, 0, 0, Math.PI / 2);
  for (const y of [0.35, 1.25, 2.1]) k.add(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10), brass, -0.07, y, 0.6);
  // 门口的小地垫
  const mat2 = fabric('#c98d6a', { sheen: '#f2c9ad' });
  k.add(soft(0.62, 0.03, 1.0, { e: 0.15, puff: 0.02, seg: 8 }), mat2, -0.5, 0.015, 0);
  return k.build();
}

