// 精细模型用的几何零件：软垫、枕头、车床旋转体（桌腿、灯座、花盆）、布料（窗帘、毯子）、线脚，
// 以及 Kit：把一件家具的几十个零件按材质合并成几个网格，零件再多也不会拖慢 iPad。
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { mat } from './util.js';
import { weaveTex } from './textures.js';

const V = new THREE.Vector3();

// 位置重合的顶点（面与面的接缝、球的两极）共用一个平均法线，曲面看起来才是光滑的一整块
export function weld(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    const a = groups.get(k);
    if (a) a.push(i); else groups.set(k, [i]);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    V.set(0, 0, 0);
    for (const i of ids) V.x += n.getX(i), V.y += n.getY(i), V.z += n.getZ(i);
    V.normalize();
    for (const i of ids) n.setXYZ(i, V.x, V.y, V.z);
  }
  return geo;
}

const sgnPow = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);

// 软垫：圆鼓鼓的方块。e 越小越方（0.15 像硬纸盒，0.5 像面包），puff = 面中间往外鼓多少，
// sag = 顶面中间往下塌多少（坐久了的坐垫），tuft = 拉扣：{ face: 'y'|'z', cols, rows, depth }，
// 按扣的位置放在 geo.userData.buttons 里（局部坐标），可以在上面摆小扣子。
export function soft(w, h, d, { e = 0.3, seg = 10, puff = 0.06, sag = 0, tuft = null, pinch = 0 } = {}) {
  const g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg);
  const p = g.attributes.position, hw = w / 2, hh = h / 2, hd = d / 2;
  const dents = [];
  if (tuft) {
    for (let i = 0; i < tuft.cols; i++) for (let j = 0; j < tuft.rows; j++) {
      const a = ((i + 0.5) / tuft.cols) * 2 - 1, b = ((j + 0.5) / tuft.rows) * 2 - 1;
      dents.push([a * (tuft.spread ?? 0.72), b * (tuft.spread ?? 0.72)]);
    }
  }
  for (let i = 0; i < p.count; i++) {
    V.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let x = sgnPow(V.x, e), y = sgnPow(V.y, e), z = sgnPow(V.z, e);
    const qx = x * x, qy = y * y, qz = z * z;
    if (puff) {
      const kx = 1 + puff * (1 - qy) * (1 - qz), ky = 1 + puff * (1 - qx) * (1 - qz), kz = 1 + puff * (1 - qx) * (1 - qy);
      x *= kx / (1 + puff); y *= ky / (1 + puff); z *= kz / (1 + puff);
    }
    // 枕头：越靠边越薄，四个角捏扁
    if (pinch) z *= 1 - pinch + pinch * Math.sqrt(Math.max(0, (1 - qx * qx) * (1 - qy * qy)));
    if (sag && y > 0) y -= sag * (1 - qx) * (1 - qz) * y;
    let px = x * hw, py = y * hh, pz = z * hd;
    if (tuft) {
      const onTop = tuft.face === 'y';
      const u = x, v = onTop ? z : y, face = onTop ? y : z;
      if (face > 0.2) {
        let k = 0;
        for (const [a, b] of dents) k += Math.exp(-((u - a) ** 2 + (v - b) ** 2) / 0.012);
        const dd = Math.min(1, k) * tuft.depth * face;
        if (onTop) py -= dd; else pz -= dd;
      }
    }
    p.setXYZ(i, px, py, pz);
  }
  weld(g);
  if (tuft) {
    g.userData.buttons = dents.map(([a, b]) => tuft.face === 'y'
      ? new THREE.Vector3(a * hw, hh * (1 - sag) - tuft.depth * 0.75, b * hd)
      : new THREE.Vector3(a * hw, b * hh, hd - tuft.depth * 0.75));
  }
  return g;
}

// 枕头 / 抱枕：w × h 的面，厚 d，边缘捏扁
export const pillow = (w, h, d, o = {}) => soft(w, h, d, { e: 0.22, puff: 0.12, pinch: 0.85, ...o });

// 车床旋转体：pts = [[半径, 高度], …] 从下往上
export function lathe(pts, seg = 28) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), seg);
}

// 车出来的木腿：底部小球脚、中段纺锤、顶部方颈
export function turnedLeg(h, r = 0.045) {
  return lathe([[0, 0], [r * 0.7, 0], [r * 1.05, h * 0.04], [r * 0.75, h * 0.1], [r * 0.6, h * 0.2], [r * 1.0, h * 0.45],
    [r * 0.65, h * 0.68], [r * 0.85, h * 0.78], [r * 1.15, h * 0.86], [r * 1.15, h], [0, h]], 18);
}

export const rounded = (w, h, d, r = 0.03, seg = 2) => {
  const rad = Math.max(0.004, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
  return new RoundedBoxGeometry(w, h, d, seg, rad);
};

// 布料：w × h 的一块布，fn(u, v) 返回它在 z 方向鼓出 / 凹进多少（u、v 从 0 到 1，v=1 在上面）
export function cloth(w, h, fn, sx = 48, sy = 24) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / w + 0.5, v = p.getY(i) / h + 0.5, r = fn(u, v);
    if (typeof r === 'number') p.setZ(i, r);
    else p.setXYZ(i, p.getX(i) + (r[0] || 0), p.getY(i) + (r[1] || 0), r[2] || 0);
  }
  g.computeVertexNormals();
  return g;
}

// 线脚：截面 profile = [[伸出墙多少, 高度], …]（逆时针闭合），沿 x 方向拉成 len 长的一条
export function molding(profile, len) {
  const s = new THREE.Shape(profile.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -len / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// 把几块几何体拼成一块（只保留 position / normal / uv）
export function merge(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    const a = g.attributes, c = a.position.count;
    pos.set(a.position.array, vo * 3);
    if (a.normal) nor.set(a.normal.array, vo * 3);
    if (a.uv) uv.set(a.uv.array, vo * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo;
    else for (let i = 0; i < c; i++) idx[io++] = vo + i;
    vo += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();

// 一件家具的零件箱：add() 把零件按位置 / 旋转 / 缩放摆好，build() 按材质合并成一个 Group
export class Kit {
  constructor() { this.parts = new Map(); }
  add(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    const m = typeof material === 'string' ? mat(material) : material;
    if (!this.parts.has(m)) this.parts.set(m, []);
    const g = geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (Array.isArray(s)) S.set(s[0], s[1], s[2]); else S.setScalar(s);
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S);
    g.applyMatrix4(M);
    this.parts.get(m).push(g);
    return M.clone(); // 摆放矩阵：拉扣的扣子等附属零件可以用它算出位置
  }
  build({ cast = true, receive = true } = {}) {
    const grp = new THREE.Group();
    for (const [m, geos] of this.parts) {
      const mesh = new THREE.Mesh(merge(geos), m);
      mesh.castShadow = cast && !m.userData.noShadow; mesh.receiveShadow = receive;
      grp.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.parts.clear();
    return grp;
  }
}

// 布料材质：带绒面光泽（sheen），侧光下边缘会泛一层柔光，看起来像真的织物
const fabrics = new Map();
export function fabric(color, { sheen = '#ffffff', rough = 0.92, bump = 0.7, map = null, sheenRough = 0.5, side = THREE.FrontSide } = {}) {
  const k = [color, sheen, rough, bump, map && map.uuid, sheenRough, side].join('|');
  if (!fabrics.has(k)) {
    fabrics.set(k, new THREE.MeshPhysicalMaterial({
      color, map, roughness: rough, metalness: 0, sheen: 1, sheenColor: new THREE.Color(sheen), sheenRoughness: sheenRough,
      bumpMap: weaveTex, bumpScale: bump, side,
    }));
  }
  return fabrics.get(k);
}

// 金属（黄铜把手、铁架）
export const brass = new THREE.MeshStandardMaterial({ color: '#d8a84e', roughness: 0.32, metalness: 0.85 });
export const iron = new THREE.MeshStandardMaterial({ color: '#3b3330', roughness: 0.55, metalness: 0.6 });
export const ceramic = (color) => mat(color, { roughness: 0.28, metalness: 0 });
