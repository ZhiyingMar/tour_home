// 角色用的精细零件：会反光的大眼睛、软软的腮红、一缕缕头发、头发材质、罗纹针织边。
import * as THREE from 'three';
import { canvasTex, rng } from './util.js';
import { weld } from './shapes.js';

// ───── 眼睛：贴在脸上的一小块球面，从正面投影贴图（瞳孔、虹膜渐变、两颗高光）─────
export function eyeTex(top, bottom) {
  return canvasTex(128, 128, (c) => {
    c.fillStyle = '#21140e'; c.beginPath(); c.ellipse(64, 64, 63, 63, 0, 0, 7); c.fill();
    const g = c.createLinearGradient(0, 18, 0, 122);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.beginPath(); c.ellipse(64, 70, 52, 54, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,214,160,.35)'; c.beginPath(); c.ellipse(64, 106, 34, 12, 0, 0, 7); c.fill();
    c.fillStyle = '#120a06'; c.beginPath(); c.ellipse(64, 64, 25, 29, 0, 0, 7); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(86, 40, 19, 16, -0.5, 0, 7); c.fill();
    c.beginPath(); c.ellipse(42, 94, 8, 7, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(70, 58, 5, 5, 0, 0, 7); c.fill();
  });
}

// 朝 +z 的半个椭球，UV 按正面投影铺，贴图不会被拉歪
export function cap(w, h, d, seg = 20) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.8), 0, Math.PI);
  g.scale(w / 2, h / 2, d);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

export function makeEye(w, h, d, tex, lash = null) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(cap(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.12, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 }));
  grp.add(m);
  if (lash) {
    // 上睫毛：沿着眼睛上沿的一道弧，外眼角往上翘一下
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.12 + 0.76 * (i / 10)), x = Math.cos(a) * w * 0.53 * lash.side, y = Math.sin(a) * h * 0.5;
      pts.push(new THREE.Vector3(x, y, d * 0.35));
    }
    const o = pts[0];
    pts.unshift(new THREE.Vector3(o.x + 0.02 * lash.side, o.y + 0.02, o.z - 0.004));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, lash.r, 6), new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.5 }));
    grp.add(tube);
  }
  return grp;
}

// 腮红：边缘慢慢变透明的一小片
const blushTex = canvasTex(64, 64, (c) => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.55, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
});
export function blush(w, h, color = '#ff9f95', opacity = 0.75) {
  const m = new THREE.Mesh(cap(w, h, 0.008, 12), new THREE.MeshBasicMaterial({ map: blushTex, color, transparent: true, opacity, depthWrite: false }));
  m.renderOrder = 2;
  return m;
}

// ───── 头发 ─────
// 一缕头发：根部宽、梢细，梢往 curl 方向卷（curl 是相对长度的比例，负数往脸的方向卷）。根在原点，朝 -y 长
export function lockGeo(len, w, d, curl = 0, twist = 0, bow = 0) {
  const g = new THREE.SphereGeometry(1, 8, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (1 - y) / 2;
    // 截面半径：根部圆圆地收口，往梢越来越细
    const s = Math.sqrt(Math.max(0, 1 - y * y));
    const f = Math.sin(Math.min(1, t / 0.18) * Math.PI / 2) * Math.pow(1 - t, 0.75);
    const k = s > 1e-5 ? f / s : 0;
    let nx = x * k * (w / 2), nz = z * k * (d / 2);
    nz += curl * t * t * len + bow * Math.sin(Math.PI * t) * len;
    nx += twist * t * t * len;
    p.setXYZ(i, nx, -t * len, nz);
  }
  return weld(g);
}

// 按 YXZ 顺序摆一块几何体（先转 y 绕到头的哪一边，再转 x 让它贴着头往下）
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export function placeYXZ(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s);
  return geo.applyMatrix4(_m);
}

// 头发的高光丝：顺着 v 方向的细条纹
const strandTex = canvasTex(128, 128, (c) => {
  const r = rng(61);
  c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    const x = r() * 128;
    c.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.2 + r() * 0.35})` : `rgba(0,0,0,${0.15 + r() * 0.25})`;
    c.lineWidth = 0.6 + r() * 1.6;
    c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 3, 40, x - 3, 90, x + 1, 128); c.stroke();
  }
});
strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping;
export function hairMat(color, sheen) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.48, sheen: 1, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.32, bumpMap: strandTex, bumpScale: 0.9 });
}

// 罗纹边（毛衣领口、袖口、下摆、袜口）：一圈竖着的小棱
export function ribbedRing(R, tube, ribs = 24, seg = 64) {
  const g = new THREE.TorusGeometry(R, tube, 6, seg), p = g.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(y, x);
    c.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const k = 1 + 0.18 * Math.abs(Math.sin(a * ribs));
    p.setXYZ(i, c.x + (x - c.x) * k, c.y + (y - c.y) * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
