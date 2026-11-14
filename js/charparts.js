// 角色用的精细零件：会反光的大眼睛、软软的腮红、一缕缕头发、毛茸茸的材质、罗纹针织边、星空尾巴的边缘光。
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

// ───── 毛 ─────
const furTex = canvasTex(256, 256, (c) => {
  const r = rng(73);
  c.fillStyle = '#a0a0a0'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = r() * 256, y = r() * 256, l = 3 + r() * 6, a = Math.PI / 2 + (r() - 0.5) * 0.7;
    c.strokeStyle = r() < 0.55 ? `rgba(255,255,255,${0.25 + r() * 0.35})` : `rgba(0,0,0,${0.15 + r() * 0.25})`;
    c.lineWidth = 0.8 + r();
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
});
furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping;
furTex.repeat.set(3, 3);
export function furMat(color, sheen) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.88, sheen: 1, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.55, bumpMap: furTex, bumpScale: 1.6 });
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

// ───── 星空尾巴：边缘一圈淡淡的光（视线擦过球边的地方最亮）─────
export function rimMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: 0.5 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uK; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.6) * uK; gl_FragColor = vec4(uColor * f, f); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

// 星空：深蓝底 + 几团紫粉青的星云 + 星星（大的带十字闪光）。emissive = true 时只画会发光的部分
export function galaxyTex(emissive) {
  const r = rng(77);
  return canvasTex(512, 256, (c) => {
    if (emissive) { c.fillStyle = '#05061a'; c.fillRect(0, 0, 512, 256); } else {
      const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#3b3f9e'); g.addColorStop(0.5, '#262b78'); g.addColorStop(1, '#1b1f5a');
      c.fillStyle = g; c.fillRect(0, 0, 512, 256);
    }
    for (let i = 0; i < 9; i++) {
      const x = r() * 512, y = 40 + r() * 176, rad = 40 + r() * 70, col = ['155,110,255', '255,140,200', '110,220,255'][i % 3];
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${col},${emissive ? 0.22 : 0.4})`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      for (const ox of [0, -512, 512]) c.fillRect(x - rad + ox, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 230; i++) {
      const x = r() * 512, y = r() * 256, s = 0.5 + r() * r() * 2.4, col = r() < 0.25 ? '#ffe9a8' : r() < 0.4 ? '#cfe0ff' : '#ffffff';
      c.fillStyle = col; c.beginPath(); c.arc(x, y, s, 0, 7); c.fill();
      if (s > 2.1) { c.fillRect(x - s * 3, y - 0.5, s * 6, 1); c.fillRect(x - 0.5, y - s * 3, 1, s * 6); }
    }
  });
}
