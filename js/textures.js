// 程序生成的材质纹理：木纹、布纹、石头、墙纸、屋瓦。全部现场画在画布上，不需要图片文件。
// 贴图画成偏白的灰度图，和材质本身的颜色相乘，所以同一张木纹可以用在各种颜色的木头上。
import * as THREE from 'three';
import { canvasTex, rng, mat } from './util.js';

function tile(t, rx = 1, ry = 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; }

export const woodTex = tile(canvasTex(256, 256, (c) => {
  const r = rng(31);
  c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {
    const y = r() * 256, a = 0.05 + r() * 0.13, w = 1 + r() * 3;
    c.strokeStyle = `rgba(90,60,40,${a})`; c.lineWidth = w;
    c.beginPath(); c.moveTo(0, y);
    const amp = 2 + r() * 5, ph = r() * 6;
    for (let x = 0; x <= 256; x += 16) c.lineTo(x, y + Math.sin(x / 256 * Math.PI * 2 + ph) * amp);
    c.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const x = r() * 256, y = r() * 256;
    for (let k = 5; k > 0; k--) { c.strokeStyle = 'rgba(90,60,40,.12)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y, k * 5, k * 2.4, 0, 0, 7); c.stroke(); }
  }
}));

export const weaveTex = tile(canvasTex(64, 64, (c) => {
  c.fillStyle = '#b8b8b8'; c.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
    const over = ((x + y) / 8) % 2 === 0;
    c.fillStyle = over ? '#f2f2f2' : '#8c8c8c';
    if (over) c.fillRect(x + 1, y + 2, 6, 4); else c.fillRect(x + 2, y + 1, 4, 6);
  }
}), 10, 10);

export const stoneTex = tile(canvasTex(256, 256, (c) => {
  const r = rng(47);
  c.fillStyle = '#f0f0f0'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = r();
    c.fillStyle = v < 0.5 ? `rgba(60,50,45,${0.04 + r() * 0.1})` : `rgba(255,255,255,${0.2 + r() * 0.3})`;
    c.beginPath(); c.arc(r() * 256, r() * 256, 0.6 + r() * 2.6, 0, 7); c.fill();
  }
}), 1.5, 1.5);

export const plasterTex = tile(canvasTex(128, 128, (c) => {
  const r = rng(53);
  c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(110,110,110,.3)';
    c.beginPath(); c.arc(r() * 128, r() * 128, 0.8 + r() * 2.4, 0, 7); c.fill();
  }
}), 4, 3);

// 墙纸：一格 1.6 米。浅色竖条纹 + 小星星
function wallpaperCanvas() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(226,190,140,.16)';
    for (let x = 0; x < 256; x += 64) c.fillRect(x, 0, 32, 256);
    c.fillStyle = 'rgba(214,160,110,.3)';
    const star = (x, y, s) => {
      c.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? s * 0.45 : s, a = (i * Math.PI) / 5 - Math.PI / 2; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.fill();
    };
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) star(i * 64 + (j % 2 ? 48 : 16), j * 64 + 32, 7);
  });
}
const WALL_TILE = 1.6;
// 每面墙单独一份材质，按墙的实际尺寸和位置设置重复次数，这样拼起来的几块墙花纹能对齐
export function wallMaterial(color, u0, v0, uLen, vLen) {
  const t = tile(wallpaperCanvas(), uLen / WALL_TILE, vLen / WALL_TILE);
  t.offset.set(u0 / WALL_TILE, v0 / WALL_TILE);
  const bump = tile(plasterTex.clone(), uLen / 1.2, vLen / 1.2);
  bump.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color, map: t, bumpMap: bump, bumpScale: 0.6, roughness: 0.95 });
}

// 墙裙：一条条竖向的护墙板
export function panelMaterial(color, len) {
  const t = tile(canvasTex(64, 64, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = 'rgba(120,80,50,.28)'; c.fillRect(0, 0, 3, 64);
    c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(3, 0, 2, 64);
    c.fillStyle = 'rgba(120,80,50,.06)'; c.fillRect(30, 0, 34, 64);
  }), len / 0.5, 1);
  return new THREE.MeshStandardMaterial({ color, map: t, bumpMap: t, bumpScale: 0.8, roughness: 0.7 });
}

// 屋瓦：一行行鱼鳞瓦（挤出体的 UV 以米为单位，所以一格就是 1 米）
export const roofTex = tile(canvasTex(128, 128, (c) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 128, 128);
  for (let j = 0; j < 3; j++) for (let i = -1; i < 3; i++) {
    const x = i * 64 + (j % 2 ? 32 : 0), y = j * 64 - 22;
    const g = c.createLinearGradient(0, y, 0, y + 64);
    g.addColorStop(0, 'rgba(110,40,30,.34)'); g.addColorStop(0.5, 'rgba(110,40,30,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x + 32, y + 22, 34, 0, Math.PI); c.fill();
    c.strokeStyle = 'rgba(110,40,30,.4)'; c.lineWidth = 2.5; c.beginPath(); c.arc(x + 32, y + 22, 32, 0, Math.PI); c.stroke();
  }
}), 1, 1);

// 把纹理挂到已有的颜色材质上（mat() 按颜色缓存，所以这里改一次，所有用到这个颜色的东西都会带上纹理）
export function applyTextures() {
  const wood = ['#b98458', '#8f6242', '#d9a877', '#dba878', '#e6b88c', '#7a4f35', '#c99364', '#6b4a36'];
  for (const c of wood) Object.assign(mat(c), { map: woodTex, bumpMap: woodTex, bumpScale: 0.5, roughness: 0.62 });
  const cloth = ['#8fbf9a', '#79ab87', '#fbf1df', '#f6cf6b', '#fbe3b0', '#f8d99c', '#ffffff', '#f7c96b', '#7fb5a5'];
  for (const c of cloth) Object.assign(mat(c), { bumpMap: weaveTex, bumpScale: 0.7, roughness: 1 });
  Object.assign(mat('#e9b08f', { roughness: 1 }), { bumpMap: weaveTex, bumpScale: 0.6 });
  for (const c of ['#cdbcab', '#a99a8c', '#b9a999', '#d8cbbb']) Object.assign(mat(c), { map: stoneTex, bumpMap: stoneTex, bumpScale: 1.2, roughness: 0.9 });
  Object.assign(mat('#f6e7cd'), { bumpMap: plasterTex, bumpScale: 0.9, roughness: 0.95 });
  Object.assign(mat('#e2725b'), { map: roofTex, bumpMap: roofTex, bumpScale: 1.5, roughness: 0.75 });
  for (const m of [...wood, ...cloth].map((c) => mat(c))) m.needsUpdate = true;
}
