// 屋外草木的模型（给实例化网格用，一种几何体会被摆上百次，所以每个都尽量省面）：
// 疙疙瘩瘩的树冠、带根和枝杈的树干、边缘参差下垂的松树层、长着青苔的石头。
// 颜色用顶点色做明暗（底下、里面暗，顶上亮），再乘上每棵树自己的实例颜色。
import * as THREE from 'three';
import { rng, canvasTex } from './util.js';
import { weld } from './shapes.js';

const V = new THREE.Vector3();

function vertexShade(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// 树冠：一个球上鼓起七八个包，底部压平一点；顶上亮、底下暗
export function canopyGeo(seed = 3, { lumps = 8, amp = 0.2, seg = 18 } = {}) {
  const r = rng(seed);
  const centers = [];
  for (let i = 0; i < lumps; i++) {
    const y = -0.2 + r() * 1.1, a = r() * Math.PI * 2, h = Math.sqrt(Math.max(0, 1 - Math.min(1, y) ** 2));
    centers.push(new THREE.Vector3(Math.cos(a) * h, Math.min(1, y), Math.sin(a) * h).normalize());
  }
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let bump = 0;
    for (const c of centers) bump += Math.exp(-V.distanceToSquared(c) / 0.18);
    let rad = 0.9 + amp * Math.min(1.4, bump);
    let y = V.y * rad;
    if (y < -0.45) y = -0.45 + (y + 0.45) * 0.35;
    p.setXYZ(i, V.x * rad, y, V.z * rad);
  }
  weld(g);
  return vertexShade(g, (x, y, z, nx, ny) => {
    const k = 0.62 + 0.3 * (y + 0.5) + 0.12 * ny;
    return [k * 0.97, k, k * 0.9];
  });
}

// 树干：根部外扩、往上收细、微微弯，中间分出两根短枝（都藏在树冠里）
export function trunkGeo() {
  const parts = [];
  const main = new THREE.CylinderGeometry(0.1, 0.2, 1.9, 10, 8).translate(0, 0.95, 0), p = main.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const flare = y < 0.35 ? 1 + 0.9 * ((0.35 - y) / 0.35) ** 2 * (0.75 + 0.25 * Math.sin(a * 5)) : 1;
    p.setXYZ(i, x * flare + Math.sin(y * 1.7) * 0.06, y, z * flare);
  }
  parts.push(main);
  for (const [ry, tilt, y0] of [[0.4, 0.75, 1.05], [3.3, 0.85, 1.25], [1.9, 0.6, 1.5]]) {
    const b = new THREE.CylinderGeometry(0.035, 0.07, 0.75, 7).translate(0, 0.375, 0).rotateZ(-tilt).rotateY(ry).translate(0, y0, 0);
    parts.push(b);
  }
  const g = mergeSimple(parts);
  return vertexShade(g, (x, y) => { const k = 0.7 + 0.3 * Math.min(1, y / 1.2); return [k, k, k]; });
}

// 松树的干：直直的一根，不分枝
export function pineTrunkGeo() {
  const g = new THREE.CylinderGeometry(0.1, 0.19, 1.4, 9, 3).translate(0, 0.7, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.25) { const f = 1 + 0.7 * ((0.25 - y) / 0.25) ** 2; p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
  }
  g.computeVertexNormals();
  return vertexShade(g, (x, y) => { const k = 0.7 + 0.3 * Math.min(1, y); return [k, k, k]; });
}

// 松树的一层：下沿是一圈往下耷拉的尖齿，底面往里凹，层与层之间有阴影
export function pineTierGeo(teeth = 9) {
  const g = new THREE.ConeGeometry(1, 1.4, teeth * 2, 4).translate(0, 0.7, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z);
    if (y < 0.01 && rr > 0.5) {
      // 下沿一圈顶点隔一个往外伸、往下垂，就成了一圈尖齿
      const kk = Math.round(Math.atan2(x, z) / (Math.PI / teeth)), tooth = Math.abs(kk) % 2 === 0 ? 1 : 0;
      const k = 0.88 + 0.22 * tooth;
      p.setXYZ(i, x * k, -0.12 * tooth, z * k);
    } else if (y < 0.01) {
      p.setY(i, 0.38); // 底面中心往上收，像一把伞的里面
    } else {
      p.setXYZ(i, x * (1 + 0.03 * Math.sin(a * teeth + y * 4)), y, z * (1 + 0.03 * Math.sin(a * teeth + y * 4)));
    }
  }
  weld(g);
  return vertexShade(g, (x, y, z, nx, ny) => {
    const k = ny < -0.2 ? 0.42 : 0.6 + 0.35 * (y / 1.4) + 0.1 * ny;
    return [k * 0.95, k, k * 0.95];
  });
}

// 石头：凹凸不平的二十面体，朝上的面长青苔
export function rockGeo(seed = 5) {
  const r = rng(seed), ph = [r() * 6, r() * 6, r() * 6];
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const k = 1 + 0.12 * Math.sin(V.x * 4 + ph[0]) * Math.sin(V.z * 3 + ph[1]) + 0.08 * Math.sin(V.y * 6 + ph[2]);
    const y = V.y < -0.3 ? -0.3 : V.y;
    p.setXYZ(i, V.x * k, y * k, V.z * k);
  }
  g.deleteAttribute('normal'); g.computeVertexNormals();
  const moss = new THREE.Color('#8fb06a'), stone = new THREE.Color('#b9b2aa'), dark = new THREE.Color('#8e8780'), c = new THREE.Color();
  return vertexShade(g, (x, y, z, nx, ny) => {
    c.copy(dark).lerp(stone, Math.min(1, (y + 0.3) * 1.4));
    if (ny > 0.55) c.lerp(moss, Math.min(1, (ny - 0.55) * 3));
    return [c.r, c.g, c.b];
  });
}

// 树叶的细节：一片片小叶子的凹凸贴图
export const leafBump = canvasTex(256, 256, (c) => {
  const r = rng(29);
  c.fillStyle = '#808080'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 6 + r() * 7;
    c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.25 + r() * 0.3})` : `rgba(0,0,0,${0.2 + r() * 0.3})`;
    c.beginPath(); c.ellipse(x, y, l, l * 0.45, a, 0, 7); c.fill();
  }
});
leafBump.wrapS = leafBump.wrapT = THREE.RepeatWrapping;
leafBump.repeat.set(3, 2);

export const barkBump = canvasTex(128, 128, (c) => {
  const r = rng(91);
  c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 46; i++) {
    const x = r() * 128;
    c.strokeStyle = `rgba(0,0,0,${0.25 + r() * 0.4})`; c.lineWidth = 1 + r() * 3;
    c.beginPath(); c.moveTo(x, 0);
    for (let y = 0; y <= 128; y += 16) c.lineTo(x + Math.sin(y * 0.1 + i) * 3, y);
    c.stroke();
  }
});
barkBump.wrapS = barkBump.wrapT = THREE.RepeatWrapping;
barkBump.repeat.set(2, 2);

// 合并几块几何体（都要是 indexed 的，带 position / normal / uv）
function mergeSimple(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo;
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
