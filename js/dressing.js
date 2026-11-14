// 软装和建筑细节：窗（窗套、窗台、窗棂、玻璃反光、打褶的窗帘和绑带）、绿植（一片片的叶子）、多肉、
// 地毯（有厚度和包边）、编织小地毯、踢脚线 / 腰线 / 顶角线、画框。除了画框，坐标都是房间的世界坐标。
import * as THREE from 'three';
import { rng, canvasTex, mat } from './util.js';
import { weaveTex } from './textures.js';
import { Kit, lathe, rounded, cloth, molding, fabric, brass, ceramic } from './shapes.js';
import { WOOD_DARK, WOOD_LIGHT } from './furniture.js';

const TRIM = '#fff6e6';

// ───── 窗 ─────
export function buildWindow(win, z0) {
  const k = new Kit();
  const wcx = (win.x0 + win.x1) / 2, wcy = (win.y0 + win.y1) / 2, ww = win.x1 - win.x0, wh = win.y1 - win.y0;
  // 窗洞内衬（墙的厚度）
  for (const x of [win.x0 + 0.02, win.x1 - 0.02]) k.add(rounded(0.04, wh, 0.3, 0.01, 1), TRIM, x, wcy, z0 - 0.15);
  k.add(rounded(ww, 0.04, 0.3, 0.01, 1), TRIM, wcx, win.y1 - 0.02, z0 - 0.15);
  // 窗套：两边竖板 + 顶上的楣板和檐口，里圈一道圆线
  for (const [x, s] of [[win.x0 - 0.08, -1], [win.x1 + 0.08, 1]]) {
    k.add(rounded(0.17, wh + 0.1, 0.045, 0.012, 1), TRIM, x, wcy + 0.05, z0 + 0.022);
    k.add(new THREE.CylinderGeometry(0.014, 0.014, wh + 0.1, 8), TRIM, x - s * 0.07, wcy + 0.05, z0 + 0.045);
  }
  k.add(rounded(ww + 0.42, 0.2, 0.05, 0.015, 1), TRIM, wcx, win.y1 + 0.2, z0 + 0.025);
  k.add(molding([[0, 0], [0.03, 0], [0.03, 0.02], [0.07, 0.05], [0.08, 0.08], [0, 0.08]], ww + 0.56), TRIM, wcx, win.y1 + 0.3, z0);
  // 窗台：带圆鼻头的台板 + 下面的裙板
  k.add(molding([[0, 0], [0.2, 0], [0.225, 0.012], [0.235, 0.03], [0.225, 0.048], [0.2, 0.06], [0, 0.06]], ww + 0.44), TRIM, wcx, win.y0 - 0.06, z0 - 0.04);
  k.add(rounded(ww + 0.44, 0.06, 0.3, 0.01, 1), TRIM, wcx, win.y0 - 0.03, z0 - 0.15);
  k.add(rounded(ww + 0.2, 0.12, 0.03, 0.01, 1), TRIM, wcx, win.y0 - 0.14, z0 + 0.015);
  // 窗框和窗棂
  const fzz = z0 - 0.06;
  for (const x of [win.x0 + 0.07, win.x1 - 0.07]) k.add(rounded(0.1, wh, 0.1, 0.015, 1), TRIM, x, wcy, fzz);
  k.add(rounded(ww, 0.1, 0.1, 0.015, 1), TRIM, wcx, win.y1 - 0.07, fzz);
  k.add(rounded(ww, 0.1, 0.1, 0.015, 1), TRIM, wcx, win.y0 + 0.05, fzz);
  for (const s of [-1, 1]) k.add(rounded(0.08, wh, 0.09, 0.015, 1), TRIM, wcx + s * ww / 6, wcy, fzz);
  k.add(rounded(ww, 0.07, 0.09, 0.015, 1), TRIM, wcx, wcy + 0.25, fzz);
  // 每扇上半截再分两格
  for (const i of [-1, 0, 1]) k.add(rounded(0.04, win.y1 - wcy - 0.3, 0.05, 0.01, 1), TRIM, wcx + i * ww / 3, (wcy + 0.25 + win.y1) / 2, fzz);
  // 把手
  for (const s of [-1, 1]) k.add(rounded(0.02, 0.12, 0.03, 0.008, 1), brass, wcx + s * (ww / 6 - 0.07), wcy - 0.1, fzz + 0.06);

  // 窗帘杆：两头车木杆头 + 托架
  const rodY = 3.74, rz = z0 + 0.3, rx0 = win.x0 - 0.85, rx1 = win.x1 + 0.95;
  k.add(new THREE.CylinderGeometry(0.022, 0.022, rx1 - rx0, 12), WOOD_DARK, (rx0 + rx1) / 2, rodY, rz, 0, 0, Math.PI / 2);
  const finial = lathe([[0, 0], [0.03, 0], [0.05, 0.03], [0.055, 0.06], [0.03, 0.09], [0.02, 0.1], [0.04, 0.12], [0, 0.14]], 16);
  k.add(finial, WOOD_DARK, rx0, rodY, rz, 0, 0, Math.PI / 2);
  k.add(finial, WOOD_DARK, rx1, rodY, rz, 0, 0, -Math.PI / 2);
  for (const x of [rx0 + 0.15, rx1 - 0.15]) k.add(rounded(0.03, 0.04, 0.32, 0.01, 1), brass, x, rodY, z0 + 0.15);

  // 窗帘：一道道竖褶，中间被绑带收向外侧，下摆散开
  const curtainTex = canvasTex(128, 256, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 128, 256);
    c.fillStyle = 'rgba(214,150,90,.25)'; c.fillRect(0, 226, 128, 14);
    c.fillStyle = 'rgba(214,150,90,.12)';
    for (let x = 6; x < 128; x += 16) c.fillRect(x, 0, 3, 256);
  });
  const curtainMat = fabric('#f9e0ae', { sheen: '#fff8e0', map: curtainTex, side: THREE.DoubleSide, bump: 0.6 });
  const cw = 0.62, ch = rodY - 0.08 - 1.18, ring = new THREE.TorusGeometry(0.035, 0.007, 6, 16);
  for (const side of [-1, 1]) {
    const outer = side < 0 ? rx0 + 0.12 : rx1 - 0.12;
    const cx = outer - side * cw / 2;
    const geo = cloth(cw, ch, (u, v) => {
      const o = side < 0 ? u : 1 - u; // 离外侧边多远（0~1）
      const s = 1 - 0.52 * Math.exp(-(((v - 0.42) / 0.17) ** 2));
      const amp = 0.035 * (1 + 1.4 * (1 - s)) * (0.6 + 0.4 * v);
      const dx = side < 0 ? -o * cw * (1 - s) : o * cw * (1 - s);
      return [dx, 0, Math.sin(o * Math.PI * 2 * 4.5) * amp + 0.07 * (1 - s) + (v < 0.06 ? (0.06 - v) * 0.6 : 0)];
    }, 54, 30);
    k.add(geo, curtainMat, cx, 1.18 + ch / 2, rz);
    for (let i = 0; i < 7; i++) k.add(ring, brass, outer - side * (0.04 + i * (cw - 0.08) / 6), rodY - 0.03, rz, 0, Math.PI / 2);
    // 绑带
    const ty = 1.18 + ch * 0.42, tx = outer - side * cw * 0.25;
    k.add(new THREE.TorusGeometry(0.11, 0.02, 8, 24), fabric('#e9a36b', { sheen: '#ffe0c0' }), tx, ty, rz + 0.04, Math.PI / 2, 0, 0, [1, 1, 0.75]);
  }

  // 窗台上的多肉
  const pot = lathe([[0, 0], [0.09, 0], [0.1, 0.01], [0.12, 0.13], [0.135, 0.135], [0.135, 0.16], [0.115, 0.16], [0.105, 0.14], [0, 0.14]], 22);
  const sx = win.x1 - 0.45, sz = z0 + 0.09, sy = win.y0;
  k.add(pot, mat('#d98a6c', { roughness: 0.8 }), sx, sy, sz);
  k.add(new THREE.CircleGeometry(0.105, 18), mat('#5a4030', { roughness: 1 }), sx, sy + 0.14, sz, -Math.PI / 2);
  const leaf = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996, t = i / 26, rr = 0.11 * (1 - t * 0.75), tilt = 0.25 + (1 - t) * 0.9, L = 0.075 * (1 - t * 0.45);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, -a + Math.PI / 2, 0, 'YXZ'));
    const g = leaf.clone().scale(0.42, 0.18, 1).translate(0, 0, 1).scale(L, L, L).applyQuaternion(q).translate(sx + Math.cos(a) * rr * 0.3, sy + 0.15 + t * 0.06, sz + Math.sin(a) * rr * 0.3);
    k.add(g, t > 0.7 ? '#b2d6a8' : i % 3 ? '#9cc5a1' : '#8fb99a');
  }

  // 玻璃：几道斜斜的反光
  const streak = canvasTex(256, 128, (c) => {
    const gr = c.createLinearGradient(0, 0, 256, 128);
    gr.addColorStop(0.18, 'rgba(255,255,255,0)'); gr.addColorStop(0.24, 'rgba(255,255,255,.55)'); gr.addColorStop(0.3, 'rgba(255,255,255,0)');
    gr.addColorStop(0.36, 'rgba(255,255,255,0)'); gr.addColorStop(0.38, 'rgba(255,255,255,.35)'); gr.addColorStop(0.41, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 128);
  });
  const glassMat = new THREE.MeshBasicMaterial({ map: streak, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = k.build();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.1, wh - 0.1), glassMat);
  glass.position.set(wcx, wcy, z0 - 0.09);
  g.add(glass);
  return { group: g, glassMat };
}

// ───── 大盆栽：陶瓷盆 + 二十来片带叶柄、有中脉折痕、尖端下垂的叶子 ─────
function leafGeo(len, wid) {
  const g = new THREE.PlaneGeometry(1, 1, 4, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i) + 0.5;
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.04)), 0.7) * wid * (1 - 0.25 * v);
    p.setXYZ(i, u * w, v * len, Math.abs(u) * w * 0.45 - 0.35 * v * v * len);
  }
  g.computeVertexNormals();
  return g;
}

export function buildPlant() {
  const k = new Kit(), r = rng(8);
  k.add(lathe([[0, 0], [0.2, 0], [0.24, 0.04], [0.29, 0.38], [0.31, 0.44], [0.33, 0.46], [0.33, 0.52], [0.29, 0.52], [0.27, 0.48], [0, 0.48]], 36), ceramic('#f3e7d6'), 0, 0, 0);
  k.add(rounded(0.36, 0.03, 0.36, 0.01, 1), WOOD_DARK, 0, 0.0, 0); // 托盘看不见没关系，压住影子
  k.add(new THREE.CircleGeometry(0.28, 24), mat('#5a4030', { roughness: 1 }), 0, 0.485, 0, -Math.PI / 2);
  const greens = ['#5f9e5c', '#6fae6c', '#82bf78'].map((c) => mat(c, { roughness: 0.55, side: THREE.DoubleSide }));
  const stemMat = mat('#6f9a55', { roughness: 0.8 });
  const Y = new THREE.Vector3(0, 1, 0), D = new THREE.Vector3();
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39996 + r() * 0.3, t = i / 22;
    const e = 0.25 + (1 - t) * 0.75 + r() * 0.15;       // 离竖直的角度：外圈的叶子更平
    const reach = 0.12 + (1 - t) * 0.22, hgt = 0.65 + t * 0.75 + r() * 0.15;
    const base = new THREE.Vector3(Math.cos(a) * 0.04, 0.47, Math.sin(a) * 0.04);
    const tip = new THREE.Vector3(Math.cos(a) * reach, hgt, Math.sin(a) * reach);
    const mid = base.clone().lerp(tip, 0.5).add(new THREE.Vector3(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04));
    k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base, mid, tip]), 6, 0.009, 5), stemMat);
    D.set(Math.cos(a) * Math.sin(e), Math.cos(e), Math.sin(a) * Math.sin(e));
    const qSpin = new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(-Math.cos(a), -Math.sin(a)));
    const qTilt = new THREE.Quaternion().setFromUnitVectors(Y, D);
    const g = leafGeo(0.36 + r() * 0.16, 0.2 + r() * 0.06).applyQuaternion(qSpin).applyQuaternion(qTilt).translate(tip.x, tip.y, tip.z);
    k.add(g, greens[i % 3]);
  }
  return k.build();
}

// ───── 地毯：有厚度、有包边的椭圆地毯；壁炉前一块编织小地毯 ─────
function rugMesh(tex, rx, rz, edge, thick = 0.028) {
  const k = new Kit();
  const bump = weaveTex.clone(); bump.repeat.set(rx * 16, rz * 16); bump.needsUpdate = true;
  const top = new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 0.6, roughness: 1 });
  k.add(new THREE.CircleGeometry(1, 72), top, 0, thick, 0, -Math.PI / 2, 0, 0, [rx, rz, 1]);
  k.add(lathe([[0.985, thick], [0.997, thick - 0.006], [1.0, thick * 0.5], [0.995, 0], [0.97, 0]], 72), mat(edge, { roughness: 1 }), 0, 0, 0, 0, 0, 0, [rx, 1, rz]);
  const g = k.build({ cast: false });
  return g;
}

export function buildRugs() {
  const rugTex = canvasTex(1024, 1024, (c) => {
    const C = 512, ring = (r, col) => { c.fillStyle = col; c.beginPath(); c.arc(C, C, r, 0, 7); c.fill(); };
    ring(512, '#efd9c0'); ring(496, '#e59d90'); ring(440, '#f8efe0'); ring(424, '#f0c9a6'); ring(410, '#f8f1e4');
    // 外圈花边：一圈小菱形和小圆点
    c.save(); c.translate(C, C);
    for (let i = 0; i < 64; i++) {
      c.save(); c.rotate((i / 64) * Math.PI * 2); c.translate(0, -468);
      c.fillStyle = i % 2 ? '#f8efe0' : '#f6d48a';
      c.beginPath(); c.moveTo(0, -14); c.lineTo(10, 0); c.lineTo(0, 14); c.lineTo(-10, 0); c.fill();
      c.restore();
    }
    for (let i = 0; i < 48; i++) {
      c.save(); c.rotate((i / 48) * Math.PI * 2); c.fillStyle = '#e59d90'; c.beginPath(); c.arc(0, -390, 6, 0, 7); c.fill(); c.restore();
    }
    // 中间：一圈淡淡的同心细线，正中一颗星，周围撒小星星
    c.strokeStyle = 'rgba(214,160,120,.25)'; c.lineWidth = 3;
    for (const rr of [200, 260, 320]) { c.beginPath(); c.arc(0, 0, rr, 0, 7); c.stroke(); }
    const star = (x, y, R, col, rot = 0) => {
      c.fillStyle = col; c.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? R * 0.43 : R, a = (i * Math.PI) / 5 - Math.PI / 2 + rot; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.fill();
    };
    star(0, 0, 175, '#f0c9a6'); star(0, 0, 155, '#f3cf7a');
    const r = rng(19);
    for (let i = 0; i < 14; i++) { const a = r() * 7, d = 230 + r() * 120; star(Math.cos(a) * d, Math.sin(a) * d, 12 + r() * 8, 'rgba(243,207,122,.8)', r()); }
    c.restore();
  });
  rugTex.anisotropy = 4;
  const main = rugMesh(rugTex, 2.5, 1.75, '#e8cdb0');
  main.position.set(0.3, 0, 0.5);

  const braid = canvasTex(512, 512, (c) => {
    const cols = ['#e9a98f', '#f3d2b4', '#c98d6a', '#f0c27a', '#e9a98f', '#f3d2b4'];
    for (let i = 0; i < 16; i++) {
      const rr = 256 - i * 16;
      c.fillStyle = cols[i % cols.length]; c.beginPath(); c.arc(256, 256, rr, 0, 7); c.fill();
      // 辫子纹：一圈斜斜的小短线
      c.strokeStyle = 'rgba(90,50,30,.22)'; c.lineWidth = 2;
      const n = Math.max(12, Math.floor(rr / 3));
      for (let k2 = 0; k2 < n; k2++) {
        const a = (k2 / n) * Math.PI * 2;
        c.beginPath(); c.moveTo(256 + Math.cos(a) * (rr - 13), 256 + Math.sin(a) * (rr - 13)); c.lineTo(256 + Math.cos(a + 0.04) * (rr - 3), 256 + Math.sin(a + 0.04) * (rr - 3)); c.stroke();
      }
    }
  });
  const hearth = rugMesh(braid, 1.3, 0.75, '#e9a98f', 0.024);
  hearth.position.set(-3.7, 0.002, -1.55);
  return [main, hearth];
}

// ───── 墙上的线脚：踢脚线、腰线、顶角线（右墙在门的位置断开）─────
export function buildTrim(ROOM, H, door) {
  const k = new Kit();
  const W = ROOM.x1 - ROOM.x0, zc = (ROOM.z0 + ROOM.z1) / 2;
  const base = [[0, 0], [0.025, 0], [0.025, 0.1], [0.018, 0.12], [0.012, 0.14], [0, 0.15]];
  const rail = [[0, 0], [0.02, 0], [0.035, 0.015], [0.04, 0.035], [0.035, 0.055], [0.02, 0.07], [0, 0.07]];
  const crown = [[0, 0], [0.02, 0], [0.03, 0.02], [0.06, 0.05], [0.1, 0.1], [0.12, 0.13], [0.12, 0.16], [0, 0.16]];
  // 后墙
  for (const [pf, y] of [[base, 0], [rail, 1.045], [crown, H - 0.16]]) k.add(molding(pf, W), TRIM, 0, y, ROOM.z0);
  // 左墙、右墙（右墙在门两边分两段）
  for (const [pf, y] of [[base, 0], [rail, 1.045], [crown, H - 0.16]]) {
    k.add(molding(pf, ROOM.z1 - ROOM.z0), TRIM, ROOM.x0, y, zc, 0, Math.PI / 2);
    const segs = pf === crown ? [[ROOM.z0, ROOM.z1]] : [[ROOM.z0, door.z - door.half], [door.z + door.half, ROOM.z1]];
    for (const [a, b] of segs) k.add(molding(pf, b - a), TRIM, ROOM.x1, y, (a + b) / 2, 0, -Math.PI / 2);
  }
  return k.build({ cast: false });
}

// ───── 画框：外框 + 内斜边 + 卡纸 + 画 ─────
export function buildFrame(w, h, art, frameColor = WOOD_LIGHT) {
  const k = new Kit(), b = 0.07;
  for (const s of [-1, 1]) {
    k.add(rounded(b, h, 0.05, 0.015, 1), frameColor, s * (w - b) / 2, 0, 0.025);
    k.add(rounded(w, b, 0.05, 0.015, 1), frameColor, 0, s * (h - b) / 2, 0.025);
    k.add(rounded(0.015, h - 2 * b, 0.02, 0.006, 1), WOOD_DARK, s * (w / 2 - b - 0.004), 0, 0.03);
    k.add(rounded(w - 2 * b, 0.015, 0.02, 0.006, 1), WOOD_DARK, 0, s * (h / 2 - b - 0.004), 0.03);
  }
  k.add(new THREE.PlaneGeometry(w - 2 * b, h - 2 * b), mat('#fbf3e3', { roughness: 0.9 }), 0, 0, 0.02);
  const m = 0.06;
  k.add(new THREE.PlaneGeometry(w - 2 * b - 2 * m, h - 2 * b - 2 * m), new THREE.MeshStandardMaterial({ map: art, roughness: 0.8 }), 0, 0, 0.022);
  return k.build();
}

