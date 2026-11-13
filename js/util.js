// 小工具：数学、贴图、常用的圆润模型零件。
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function lerpAngle(a, b, t) {
  const TAU = Math.PI * 2;
  const d = (((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI;
  return a + d * t;
}

// 固定种子的随机数，保证窗外的山每天长得一样
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const glowTex = canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});

export const sparkTex = canvasTex(64, 64, (g) => {
  g.translate(32, 32);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 5 : 30, a = (i * Math.PI) / 4;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.fill();
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 18);
  r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(-32, -32, 64, 64);
});

const mats = new Map();
export function mat(color, o) {
  const k = color + (o ? JSON.stringify(o) : '');
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
  return mats.get(k);
}

function shadow(m) { m.castShadow = true; m.receiveShadow = true; return m; }

export function rbox(w, h, d, color, r = 0.06, o) {
  const rad = Math.max(0.005, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
  return shadow(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rad), typeof color === 'string' ? mat(color, o) : color));
}

export function ball(r, color, sx = 1, sy = 1, sz = 1, o) {
  const m = shadow(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), typeof color === 'string' ? mat(color, o) : color));
  m.scale.set(sx, sy, sz);
  return m;
}

export function cyl(rt, rb, h, color, seg = 20, o) {
  return shadow(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? mat(color, o) : color));
}

export function at(m, x, y, z) { m.position.set(x, y, z); return m; }

export function starShape(R, r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r : R, a = (i * Math.PI) / 5 + Math.PI / 2;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  s.closePath();
  return s;
}

// 沿路径前进一步，返回这一步的朝向
export function stepPath(pos, path, speed, dt) {
  let left = speed * dt, dx = 0, dz = 0;
  while (left > 0 && path.length) {
    const p = path[0];
    const ex = p.x - pos.x, ez = p.z - pos.z, d = Math.hypot(ex, ez);
    if (d < 1e-4) { path.shift(); continue; }
    dx = ex / d; dz = ez / d;
    if (d <= left) { pos.x = p.x; pos.z = p.z; left -= d; path.shift(); }
    else { pos.x += dx * left; pos.z += dz * left; left = 0; }
  }
  return { dx, dz };
}

// 带碰撞的沿路前进：户外没有网格寻路，朝目标直走，撞到东西就贴着它绕过去；
// 如果一阵子都没能离目标更近，就放弃（返回 blocked）
export function stepPathNav(pos, path, speed, dt, nav, st) {
  const bx = pos.x, bz = pos.z, target = path[0];
  const d = stepPath(pos, path, speed, dt);
  if (!nav || !nav.direct || !target) return d;
  if (st.navTarget !== target) { st.navTarget = target; st.best = Infinity; st.stuck = 0; st.side = 0; }
  if (!nav.walkable(pos.x, pos.z)) {
    pos.x = bx; pos.z = bz;
    if (!path.length) path.push(target);
    const step = speed * dt, sides = st.side ? [st.side, -st.side] : [1, -1];
    // 先认准一边绕到底，绕不过去再换另一边，免得左右来回抖
    search: for (const sd of sides) {
      for (const a of [0.8, 1.5, 2.2]) {
        const c = Math.cos(a * sd), sn = Math.sin(a * sd), rx = d.dx * c - d.dz * sn, rz = d.dx * sn + d.dz * c;
        if (nav.walkable(bx + rx * step, bz + rz * step)) { pos.x = bx + rx * step; pos.z = bz + rz * step; st.side = sd; d.dx = rx; d.dz = rz; break search; }
      }
    }
  }
  const left = Math.hypot(target.x - pos.x, target.z - pos.z);
  if (left < st.best - 0.03) { st.best = left; st.stuck = 0; } else st.stuck += dt;
  if (st.stuck > 3.5) { path.length = 0; st.navTarget = null; d.blocked = true; }
  return d;
}
