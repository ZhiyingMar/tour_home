// 壁炉：一块块垒起来的毛石、平拱券、烟熏过的炉膛、铁柴架上的带皮木柴、线脚壁炉台、台上的小摆件和挂钟。
// 火焰、火光、余烬还在 room.js 里（它们每帧都要动）。局部坐标：z=0 贴墙，正面朝 +z。
import * as THREE from 'three';
import { rng, canvasTex, mat, starShape } from './util.js';
import { stoneTex, plasterTex } from './textures.js';
import { Kit, soft, lathe, rounded, molding, brass, iron, ceramic } from './shapes.js';
import { WOOD, WOOD_DARK, WOOD_LIGHT } from './furniture.js';

const stoneMats = ['#d3c3b1', '#c4b29f', '#dccfbf', '#bba893', '#cbb8a2'].map((color) =>
  new THREE.MeshStandardMaterial({ color, map: stoneTex, bumpMap: stoneTex, bumpScale: 1.4, roughness: 0.92 }));

const sootTex = canvasTex(256, 256, (c) => {
  c.fillStyle = '#5a4038'; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = 'rgba(30,18,14,.55)'; c.lineWidth = 3;
  for (let y = 0; y < 256; y += 32) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke();
    for (let x = (y / 32) % 2 ? 0 : 40; x < 256; x += 80) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 32); c.stroke(); }
  }
  const g = c.createRadialGradient(128, 200, 10, 128, 160, 200);
  g.addColorStop(0, 'rgba(10,6,5,.92)'); g.addColorStop(0.6, 'rgba(18,10,8,.7)'); g.addColorStop(1, 'rgba(18,10,8,.25)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
});
const sootMat = new THREE.MeshStandardMaterial({ map: sootTex, roughness: 1 });

const barkTex = canvasTex(128, 128, (c) => {
  const r = rng(91);
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const x = r() * 128;
    c.strokeStyle = `rgba(40,25,15,${0.25 + r() * 0.4})`; c.lineWidth = 1 + r() * 3;
    c.beginPath(); c.moveTo(x, 0);
    for (let y = 0; y <= 128; y += 16) c.lineTo(x + Math.sin(y * 0.1 + i) * 3, y);
    c.stroke();
  }
});
barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
const barkMat = new THREE.MeshStandardMaterial({ color: '#6e4b35', map: barkTex, bumpMap: barkTex, bumpScale: 2, roughness: 0.95 });
const ringMat = new THREE.MeshStandardMaterial({
  roughness: 0.9,
  map: canvasTex(64, 64, (c) => {
    c.fillStyle = '#d9b07c'; c.fillRect(0, 0, 64, 64);
    c.strokeStyle = 'rgba(120,75,40,.5)'; c.lineWidth = 1.5;
    for (let k = 4; k < 32; k += 5) { c.beginPath(); c.arc(32, 32, k, 0, 7); c.stroke(); }
    c.strokeStyle = '#6e4b35'; c.lineWidth = 5; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.stroke();
  }),
});

// 一根带树皮的木柴（沿 y 轴），表面有点凹凸，两头露出年轮
function logGeos(len, rad, seed) {
  const r = rng(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  const bark = new THREE.CylinderGeometry(rad, rad, len, 14, 6, true), p = bark.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.07 * Math.sin(a * 3 + ph[0]) + 0.05 * Math.sin(a * 7 + y * 9 + ph[1]) + 0.04 * Math.sin(y * 13 + ph[2]);
    p.setXYZ(i, x * k, y, z * k);
  }
  bark.computeVertexNormals();
  const a = new THREE.CircleGeometry(rad * 1.02, 14).rotateX(-Math.PI / 2).translate(0, len / 2, 0);
  const b = new THREE.CircleGeometry(rad * 1.02, 14).rotateX(Math.PI / 2).translate(0, -len / 2, 0);
  return [bark, a, b];
}

export function buildFireplace(H) {
  const k = new Kit(), r = rng(11);
  const grout = '#a99a8c';
  // 灰缝底子：两根柱子 + 炉口上方的横梁
  k.add(rounded(0.56, 2.0, 0.78, 0.02), grout, -0.94, 1.0, 0.4);
  k.add(rounded(0.56, 2.0, 0.78, 0.02), grout, 0.94, 1.0, 0.4);
  k.add(rounded(1.4, 0.72, 0.78, 0.02), grout, 0, 1.64, 0.4);

  // 正面的毛石：一行行随机长短，绕开炉口和拱券
  const stone = (w, h, x, y, z, ry = 0, deep = 0.12) => {
    const d = deep + r() * 0.04;
    k.add(soft(w - 0.03, h - 0.03, d, { e: 0.32, puff: 0.14, seg: 4 }), stoneMats[Math.floor(r() * stoneMats.length)],
      x, y, z, (r() - 0.5) * 0.04, ry, (r() - 0.5) * 0.05);
  };
  let y = 0;
  while (y < 1.99) {
    const h = Math.min(0.2 + r() * 0.07, 2.0 - y), yc = y + h / 2;
    const segs = y < 1.62 ? [[-1.22, -0.7], [0.7, 1.22]] : [[-1.22, 1.22]];
    for (const [a, b] of segs) {
      let x = a;
      while (x < b - 0.01) {
        let w = 0.24 + r() * 0.2;
        if (b - (x + w) < 0.14) w = b - x;
        stone(w, h, x + w / 2, yc, 0.8);
        x += w;
      }
    }
    // 右侧面（镜头看得到的那一面）
    let z = 0.02;
    while (z < 0.79) {
      let w = 0.22 + r() * 0.18;
      if (0.79 - (z + w) < 0.12) w = 0.79 - z;
      stone(w, h, 1.23, yc, z + w / 2, Math.PI / 2, 0.1);
      z += w;
    }
    y += h;
  }
  // 平拱：七块往外放射的楔石，中间的拱心石大一点、凸出来一点
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.205, key = i === 0;
    k.add(soft(0.19, key ? 0.38 : 0.31, key ? 0.18 : 0.15, { e: 0.3, puff: 0.1, seg: 5 }), stoneMats[(i + 3) % stoneMats.length],
      x, 1.3 + (key ? 0.17 : 0.155), key ? 0.83 : 0.81, 0, 0, -Math.atan2(x, 1.6));
  }

  // 炉膛：烟熏的耐火砖，后墙 + 两侧 + 底
  const back = new THREE.PlaneGeometry(1.32, 1.3);
  k.add(back, sootMat, 0, 0.65, 0.08);
  k.add(new THREE.PlaneGeometry(0.72, 1.3), sootMat, -0.655, 0.65, 0.44, 0, Math.PI / 2);
  k.add(new THREE.PlaneGeometry(0.72, 1.3), sootMat, 0.655, 0.65, 0.44, 0, -Math.PI / 2);
  k.add(new THREE.PlaneGeometry(1.32, 0.72), sootMat, 0, 0.012, 0.44, -Math.PI / 2);
  k.add(soft(1.0, 0.06, 0.5, { e: 0.5, puff: 0.3, seg: 6 }), '#6d625d', 0, 0.03, 0.42);
  // 炉前石板
  k.add(rounded(2.74, 0.1, 0.56, 0.035), stoneMats[2], 0, 0.05, 1.06);

  // 铁柴架
  const bar = new THREE.CylinderGeometry(0.014, 0.014, 0.9, 8);
  for (const z of [0.3, 0.6]) k.add(bar, iron, 0, 0.14, z, 0, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const x = -0.4 + i * 0.16;
    k.add(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), iron, x, 0.14, 0.45, Math.PI / 2);
    k.add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), iron, x, 0.27, 0.25, -0.3);
  }
  for (const x of [-0.42, 0.42]) for (const z of [0.3, 0.6]) k.add(new THREE.CylinderGeometry(0.016, 0.02, 0.14, 8), iron, x, 0.07, z);
  // 木柴
  [[-0.17, 0.22, 0.42, 0.3, 0.8, 0.085], [0.18, 0.22, 0.46, -0.35, 0.78, 0.08], [0.0, 0.35, 0.5, 1.45, 0.72, 0.075]].forEach(([x, yy, z, ry, len, rad], i) => {
    const [bk, e1, e2] = logGeos(len, rad, 30 + i);
    k.add(bk, barkMat, x, yy, z, 0, ry, Math.PI / 2);
    k.add(e1, ringMat, x, yy, z, 0, ry, Math.PI / 2);
    k.add(e2, ringMat, x, yy, z, 0, ry, Math.PI / 2);
  });

  // 壁炉台：带弧形线脚的台面 + 两个托架
  k.add(molding([[0, 0], [0.96, 0], [0.99, 0.02], [1.02, 0.045], [1.05, 0.08], [1.07, 0.11], [1.07, 0.15], [0, 0.15]], 2.9), WOOD, 0, 2.0, 0);
  k.add(rounded(2.5, 0.1, 0.06, 0.02), WOOD_DARK, 0, 1.95, 0.84);
  for (const x of [-1.05, 1.05]) {
    k.add(molding([[0, 0], [0.04, 0], [0.06, 0.06], [0.1, 0.12], [0.17, 0.18], [0.2, 0.2], [0, 0.2]], 0.12), WOOD_DARK, x, 1.8, 0.79);
  }
  // 上面的烟囱墙（抹灰）
  const plaster = new THREE.MeshStandardMaterial({ color: '#efdcc0', bumpMap: plasterTex, bumpScale: 0.9, roughness: 0.95 });
  k.add(rounded(1.9, H - 2.15, 0.5, 0.04), plaster, 0, (H + 2.15) / 2, 0.25);
  k.add(molding([[0, 0], [0.04, 0], [0.04, 0.03], [0.07, 0.06], [0.07, 0.1], [0, 0.1]], 2.0), WOOD_LIGHT, 0, H - 0.1, 0.48);

  // ── 台上的摆件 ──
  // 相框（斜靠着）
  const photo = canvasTex(64, 80, (c) => {
    c.fillStyle = '#f7e8cf'; c.fillRect(0, 0, 64, 80);
    c.fillStyle = '#bfe0ef'; c.fillRect(8, 8, 48, 64);
    c.fillStyle = '#9cc5a1'; c.beginPath(); c.moveTo(8, 72); c.lineTo(30, 40); c.lineTo(56, 72); c.fill();
    c.fillStyle = '#f9d98a'; c.beginPath(); c.arc(44, 24, 7, 0, 7); c.fill();
  });
  k.add(rounded(0.3, 0.38, 0.04, 0.012), WOOD_LIGHT, -0.95, 2.34, 0.35, -0.14);
  k.add(new THREE.PlaneGeometry(0.24, 0.31), new THREE.MeshStandardMaterial({ map: photo, roughness: 0.6 }), -0.95, 2.343, 0.373, -0.14);
  // 两本平放的书 + 一颗小星星摆件
  k.add(rounded(0.36, 0.06, 0.26, 0.01), '#a9c9ee', -0.45, 2.18, 0.42, 0, 0.12);
  k.add(rounded(0.32, 0.05, 0.24, 0.01), '#f2a9a0', -0.44, 2.235, 0.43, 0, -0.08);
  const star = new THREE.ExtrudeGeometry(starShape(0.085, 0.037), { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
  k.add(star, brass, -0.44, 2.33, 0.43, 0, 0.3);
  // 小花瓶 + 干花
  k.add(lathe([[0, 0], [0.05, 0], [0.075, 0.05], [0.07, 0.12], [0.035, 0.18], [0.03, 0.21], [0.04, 0.23], [0, 0.23]], 20), ceramic('#7fb5a5'), 0.5, 2.15, 0.42);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26, tilt = 0.18 + r() * 0.1, len = 0.24 + r() * 0.1;
    k.add(new THREE.CylinderGeometry(0.005, 0.006, len, 4).translate(0, len / 2, 0), '#8a7a52', 0.5, 2.33, 0.42, Math.cos(a) * tilt, 0, Math.sin(a) * tilt);
    k.add(new THREE.SphereGeometry(0.025, 8, 6), ['#f2a9a0', '#f6cf6b', '#fbf1df'][i % 3], 0.5 - Math.sin(a) * tilt * len, 2.33 + len, 0.42 + Math.cos(a) * tilt * len);
  }
  // 黄铜烛台 + 蜡烛（火苗是单独的网格，每帧会跳）
  k.add(lathe([[0, 0], [0.08, 0], [0.085, 0.015], [0.03, 0.03], [0.022, 0.09], [0.035, 0.1], [0.045, 0.115], [0, 0.115]], 20), brass, 0.95, 2.15, 0.45);
  k.add(new THREE.CylinderGeometry(0.032, 0.034, 0.22, 16), '#fbf1df', 0.95, 2.375, 0.45);
  const g = k.build();

  const candleFlame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2.2), toneMapped: false }));
  candleFlame.scale.set(1, 1.6, 1); candleFlame.position.set(0.95, 2.53, 0.45); g.add(candleFlame);

  // ── 挂钟（走的是真实时间）──
  const clock = new THREE.Group(); clock.position.set(0, 3.1, 0.52); g.add(clock);
  const ck = new Kit();
  ck.add(new THREE.CylinderGeometry(0.38, 0.4, 0.07, 40).rotateX(Math.PI / 2), WOOD_DARK, 0, 0, 0);
  ck.add(new THREE.TorusGeometry(0.37, 0.035, 10, 48), WOOD, 0, 0, 0.04);
  const faceTex = canvasTex(256, 256, (c) => {
    c.fillStyle = '#fbf3e3'; c.beginPath(); c.arc(128, 128, 128, 0, 7); c.fill();
    c.strokeStyle = '#d9c4a2'; c.lineWidth = 3; c.beginPath(); c.arc(128, 128, 112, 0, 7); c.stroke();
    c.fillStyle = '#5a3d2c';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
      c.save(); c.translate(128, 128); c.rotate(a); c.fillRect(-(big ? 2.5 : 1), -118, big ? 5 : 2, big ? 14 : 6); c.restore();
    }
    c.font = 'bold 30px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [n, a] of [['12', 0], ['3', 0.5], ['6', 1], ['9', 1.5]]) c.fillText(n, 128 + Math.sin(a * Math.PI) * 82, 128 - Math.cos(a * Math.PI) * 82);
  });
  ck.add(new THREE.CircleGeometry(0.335, 48), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.55 }), 0, 0, 0.037);
  ck.add(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 16).rotateX(Math.PI / 2), brass, 0, 0, 0.07);
  clock.add(ck.build());
  const handShape = (len, w) => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.05); s.lineTo(w / 2, 0); s.lineTo(w * 0.18, len * 0.85); s.lineTo(0, len); s.lineTo(-w * 0.18, len * 0.85); s.lineTo(-w / 2, 0); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false });
  };
  const hand = (len, w, z) => {
    const p = new THREE.Group(); p.position.z = z;
    const m = new THREE.Mesh(handShape(len, w), mat('#3d2a20', { roughness: 0.4, metalness: 0.3 }));
    m.castShadow = true; p.add(m); clock.add(p); return p;
  };
  const hourHand = hand(0.19, 0.05, 0.045), minHand = hand(0.28, 0.036, 0.055);

  return { group: g, candleFlame, hourHand, minHand };
}
