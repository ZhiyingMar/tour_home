// 小屋本体：地板、墙、窗框、家具、灯光、壁炉。
// 家具本身的模型在 furniture.js / fireplace.js / decor.js / dressing.js 里，这里只管摆放、灯光和动画。
// 想加新家具：照那几个文件的写法用 Kit 拼一件，在这里摆好，再往 obstacles 里加一块占地、往 hit() 里加一个可点区域。
import * as THREE from 'three';
import { ROOM } from './config.js';
import { hourNow } from './time.js';
import { lerp, damp, rand, rng, canvasTex, glowTex, mat, at } from './util.js';
import { wallMaterial, panelMaterial } from './textures.js';
import { buildSofa, buildBed } from './furniture.js';
import { buildFireplace } from './fireplace.js';
import { buildShelf, buildDesk, buildFloorLamp, buildDoor } from './decor.js';
import { buildWindow, buildPlant, buildRugs, buildTrim, buildFrame } from './dressing.js';
import { lathe } from './shapes.js';

const C = { wall: '#f4e4c9', wainscot: '#e9cda6', woodDark: '#8f6242', duvet: '#a9c9ee' };

export function buildRoom(scene, sceneryTex) {
  const g = new THREE.Group();
  scene.add(g);
  const hits = [];
  const add = (m, x, y, z, parent = g) => { at(m, x, y, z); parent.add(m); return m; };
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hit = (id, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat);
    m.userData.id = id;
    add(m, x, y, z);
    hits.push(m);
  };
  const plain = (w, h, d, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.receiveShadow = true;
    return m;
  };

  // ───── 地板 ─────
  const W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0, zc = (ROOM.z0 + ROOM.z1) / 2;
  const floorTex = canvasTex(1024, 640, (c, w, h) => {
    const r = rng(7);
    c.fillStyle = '#dcae7a'; c.fillRect(0, 0, w, h);
    const rows = 10, rh = h / rows;
    for (let j = 0; j < rows; j++) {
      let x = -r() * 200;
      while (x < w) {
        const pw = 170 + r() * 150, v = r();
        c.fillStyle = `hsl(${29 + v * 5}, ${52 + v * 8}%, ${64 + v * 8}%)`;
        c.fillRect(x, j * rh, pw, rh);
        c.fillStyle = 'rgba(120,75,40,.28)'; c.fillRect(x, j * rh, 2, rh);
        x += pw;
      }
      c.fillStyle = 'rgba(120,75,40,.32)'; c.fillRect(0, j * rh, w, 2);
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: 0.7, roughness: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  add(floor, 0, 0, zc);
  add(plain(W + 0.6, 0.5, D + 0.3, C.woodDark), 0, -0.26, zc - 0.15);

  // ───── 墙（后墙绕着窗洞拼四块）─────
  const win = { x0: -1.8, x1: 2.6, y0: 1.35, y1: 3.45 };
  const wz = ROOM.z0 - 0.15, H = ROOM.h;
  // 贴墙纸的墙：u0/v0 是这块墙左下角在整面墙上的位置，几块拼起来花纹才对得上
  const wall = (w, h, d, u0, v0, uLen, vLen) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial(C.wall, u0, v0, uLen, vLen));
    m.receiveShadow = true;
    return m;
  };
  const paneled = (w, h, d, len) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), panelMaterial(C.wainscot, len)); m.receiveShadow = true; return m; };
  add(wall(win.x0 - ROOM.x0, H, 0.3, 0, 0, win.x0 - ROOM.x0, H), (ROOM.x0 + win.x0) / 2, H / 2, wz);
  add(wall(ROOM.x1 - win.x1, H, 0.3, win.x1 - ROOM.x0, 0, ROOM.x1 - win.x1, H), (ROOM.x1 + win.x1) / 2, H / 2, wz);
  add(wall(win.x1 - win.x0, H - win.y1, 0.3, win.x0 - ROOM.x0, win.y1, win.x1 - win.x0, H - win.y1), (win.x0 + win.x1) / 2, (H + win.y1) / 2, wz);
  add(wall(win.x1 - win.x0, win.y0, 0.3, win.x0 - ROOM.x0, 0, win.x1 - win.x0, win.y0), (win.x0 + win.x1) / 2, win.y0 / 2, wz);
  add(wall(0.3, H, D + 0.3, 0, 0, D + 0.3, H), ROOM.x0 - 0.15, H / 2, zc - 0.15);
  add(wall(0.3, H, D + 0.3, 0, 0, D + 0.3, H), ROOM.x1 + 0.15, H / 2, zc - 0.15);
  // 墙裙 + 踢脚线 / 腰线 / 顶角线
  add(buildTrim(ROOM, H, { z: 1.3, half: 0.83 }), 0, 0, 0);
  add(paneled(W, 1.05, 0.06, W), 0, 0.525, ROOM.z0 + 0.03);
  for (const sx of [-1, 1]) {
    add(paneled(0.06, 1.05, D, D), sx * (ROOM.x1 - 0.03), 0.525, zc);
  }

  // ───── 大窗 ─────
  const wcx = (win.x0 + win.x1) / 2;
  const view = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 2.65), new THREE.MeshBasicMaterial({ map: sceneryTex, toneMapped: false }));
  add(view, wcx + 0.02, 2.08, ROOM.z0 - 1.0);
  const { group: windowGroup, glassMat } = buildWindow(win, ROOM.z0); g.add(windowGroup);

  // 窗上的小串灯
  const bulbMats = ['#ffd97a', '#ffb3a1', '#fff2c4'].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.5 }));
  const wirePts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, x = lerp(win.x0 - 0.75, win.x1 + 0.75, u), y = 4.0 - 0.17 * Math.abs(Math.sin(u * Math.PI * 3));
    wirePts.push(new THREE.Vector3(x, y, ROOM.z0 + 0.06));
    if (i % 1 === 0) add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bulbMats[i % 3]), x, y - 0.06, ROOM.z0 + 0.08);
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePts), 40, 0.012, 5), mat('#7a5a44')));

  // 地上的窗影 / 月光
  const patchTex = canvasTex(256, 160, (c) => {
    c.shadowColor = '#fff'; c.shadowBlur = 14; c.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) c.fillRect(22 + i * 74, 22 + j * 64, 60, j ? 54 : 44);
  });
  const patchMat = new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 });
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.6), patchMat);
  patch.rotation.x = -Math.PI / 2;
  add(patch, wcx + 0.2, 0.02, -0.35);

  // ───── 地毯 ─────
  for (const r of buildRugs()) g.add(r);

  // ───── 沙发 ─────
  add(buildSofa(), 0.4, 0, -2.75);
  hit('sofa', 3.3, 1.5, 1.3, 0.4, 0.75, -2.7);

  // 落地灯
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#ffe9bd', emissive: '#ffcc80', emissiveIntensity: 0, roughness: 0.9 });
  add(buildFloorLamp(shadeMat), 2.45, 0, -2.9);
  const lampLight = new THREE.PointLight('#ffc98a', 0, 9, 1.6);
  add(lampLight, 2.35, 2.0, -2.55);

  // ───── 床 ─────
  const duvetTex = canvasTex(256, 256, (c) => {
    c.fillStyle = C.duvet; c.fillRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(255,255,255,.75)';
    const r = rng(3);
    for (let i = 0; i < 26; i++) {
      c.save(); c.translate(r() * 256, r() * 256); c.rotate(r() * 6); c.beginPath();
      for (let k = 0; k < 10; k++) { const rr = k % 2 ? 4 : 9, a = (k * Math.PI) / 5; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.fill(); c.restore();
    }
  });
  add(buildBed(duvetTex), 4.65, 0, -1.9);
  hit('bed', 2.2, 1.4, 2.9, 4.65, 0.7, -1.9);
  // 床头的画
  const art = canvasTex(380, 260, (c) => {
    c.scale(2, 2);
    c.fillStyle = '#cfe6f3'; c.fillRect(0, 0, 190, 130);
    c.fillStyle = '#f9d98a'; c.beginPath(); c.arc(140, 40, 16, 0, 7); c.fill();
    c.fillStyle = '#9cc5a1'; c.beginPath(); c.moveTo(0, 130); c.lineTo(50, 60); c.lineTo(100, 130); c.fill();
    c.fillStyle = '#7fb08c'; c.beginPath(); c.moveTo(60, 130); c.lineTo(125, 75); c.lineTo(190, 130); c.fill();
    c.fillStyle = '#fbf6ee'; for (const [x, y] of [[40, 30], [70, 22], [100, 34]]) { c.beginPath(); c.ellipse(x, y, 14, 6, 0, 0, 7); c.fill(); }
  });
  add(buildFrame(1.15, 0.85, art), 4.65, 2.85, ROOM.z0);

  // ───── 壁炉 ─────
  const fp = new THREE.Group(); add(fp, -4, 0, ROOM.z0);
  const fireplace = buildFireplace(H); fp.add(fireplace.group);
  const { candleFlame, hourHand, minHand } = fireplace;
  hit('fire', 2.6, 2.2, 1.3, -4, 1.1, ROOM.z0 + 0.6);

  // 火
  const fire = { lit: false, level: 0, flames: [] };
  const fg = new THREE.Group(); add(fg, 0, 0.2, 0.45, fp);
  // 火苗：水滴形的旋转体，根部黄白、往上变橙红；叠加混合，几层叠在一起中间最亮
  const flameGeo = lathe([[0, 0], [0.5, 0.1], [0.68, 0.32], [0.62, 0.7], [0.44, 1.15], [0.22, 1.75], [0.06, 2.2], [0, 2.4]], 18);
  const fCol = [], fPos = flameGeo.attributes.position, cLo = new THREE.Color('#fff3b8'), cMid = new THREE.Color('#ff9a3c'), cHi = new THREE.Color('#ff4a1c'), cT = new THREE.Color();
  for (let i = 0; i < fPos.count; i++) {
    const t = fPos.getY(i) / 2.4;
    cT.copy(t < 0.45 ? cLo : cMid).lerp(t < 0.45 ? cMid : cHi, t < 0.45 ? t / 0.45 : (t - 0.45) / 0.55);
    fCol.push(cT.r, cT.g, cT.b);
  }
  flameGeo.setAttribute('color', new THREE.Float32BufferAttribute(fCol, 3));
  for (const [x, z, s, col] of [[0, 0, 0.3, '#ff9a5a'], [-0.26, 0.03, 0.2, '#ffa060'], [0.27, -0.02, 0.21, '#ffa060'], [0.02, 0.05, 0.19, '#ffd080'], [0, 0.09, 0.1, '#fff3c8']]) {
    const m = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), vertexColors: true, toneMapped: false, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, 0, z); m.userData.s = s; m.userData.ph = Math.random() * 9;
    fg.add(m); fire.flames.push(m);
  }
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ff9a4a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const glow = new THREE.Sprite(glowMat); glow.scale.set(3.4, 3); add(glow, 0, 0.7, 0.7, fp);
  const floorGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ff8c3a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4), floorGlowMat);
  floorGlow.rotation.x = -Math.PI / 2; add(floorGlow, -4, 0.025, -1.9);
  const fireLight = new THREE.PointLight('#ff9448', 0, 14, 1.5); add(fireLight, -4, 0.9, -2.3);
  // 余烬
  const EN = 22, ePos = new Float32Array(EN * 3), eSeed = [];
  for (let i = 0; i < EN; i++) eSeed.push({ x: rand(-0.45, 0.45), sp: rand(0.35, 0.9), ph: Math.random() });
  const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const eMat = new THREE.PointsMaterial({ map: glowTex, color: '#ffc35a', size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const embers = new THREE.Points(eGeo, eMat); embers.frustumCulled = false; add(embers, 0, 0.3, 0.5, fp);

  // ───── 书架（左墙）─────
  add(buildShelf(), ROOM.x0 + 0.3, 0, -1.1);

  // ───── 书桌和信（左墙）─────
  const deskShade = new THREE.MeshStandardMaterial({ color: '#9fd1c1', emissive: '#ffd08a', emissiveIntensity: 0, roughness: 0.9 });
  add(buildDesk(deskShade), -5.35, 0, 1.7);
  const deskLight = new THREE.PointLight('#ffd09a', 0, 6, 1.6); add(deskLight, -5.2, 1.45, 1.2);
  // 桌子上方的小画
  const starArt = canvasTex(256, 256, (c) => {
    c.fillStyle = '#3f4a7a'; c.fillRect(0, 0, 256, 256);
    const r = rng(41); c.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(r() * 256, r() * 256, 0.6 + r() * 1.6, 0, 7); c.fill(); }
    c.fillStyle = '#f3cf7a'; c.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? 34 : 80, a = (i * Math.PI) / 5 - Math.PI / 2; c.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); }
    c.fill();
  });
  add(buildFrame(0.75, 0.75, starArt), ROOM.x0, 2.5, 1.7).rotation.y = Math.PI / 2;
  hit('letter', 1.1, 0.9, 1.3, -5.3, 1.25, 1.75);

  // ───── 门（通往屋外）─────
  add(buildDoor(), ROOM.x1 - 0.03, 0, 1.3);
  hit('door', 0.5, 2.5, 1.4, ROOM.x1 - 0.2, 1.25, 1.3);

  // 盆栽
  add(buildPlant(), 5.2, 0, 3.2);

  // ───── 灯光 ─────
  const hemi = new THREE.HemisphereLight('#fff3e0', '#e6c8a2', 2);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff0dc', 2.2);
  key.position.set(5, 11, 8); key.target.position.set(0, 0, -0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: 1, far: 40 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.035; key.shadow.radius = 5;
  scene.add(key, key.target);

  // 空气里的小灰尘（白天在窗光里飘）
  const DN = 36, dPos = new Float32Array(DN * 3), dSeed = [];
  for (let i = 0; i < DN; i++) dSeed.push({ x: rand(-2, 3), y: rand(0.4, 3.2), z: rand(-3, 1), ph: rand(0, 9) });
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dMat = new THREE.PointsMaterial({ map: glowTex, color: '#fff4d6', size: 0.06, transparent: true, depthWrite: false, opacity: 0.5 });
  const dust = new THREE.Points(dGeo, dMat); dust.frustumCulled = false; g.add(dust);

  const cA = new THREE.Color(), cB = new THREE.Color();
  const mix = (target, night, day, dl, warm, wk) => target.copy(cA.set(night)).lerp(cB.set(day), dl).lerp(cA.set(warm), wk);
  let lampK = 0;

  function setEnv({ dl, wm, sleep, t, dt, out }) {
    const dim = 1 - 0.6 * sleep, moon = out ? 1.9 : 1; // 屋外的夜里有月光，亮一些
    mix(hemi.color, '#7484c8', '#fff3e0', dl, '#ffd2a8', wm * 0.5);
    mix(hemi.groundColor, '#2c2a4c', '#e6c8a2', dl, '#e6a880', wm * 0.4);
    hemi.intensity = lerp(0.62 * moon, 1.6, dl) * dim;
    mix(key.color, '#93a6ff', '#fff0dc', dl, '#ffb27a', wm * 0.6);
    key.intensity = lerp(0.42 * moon, 2.05, dl) * dim;

    lampK = damp(lampK, dl < 0.5 && sleep < 0.3 ? 1 : 0, 3, dt);
    lampLight.intensity = lampK * 9;
    deskLight.intensity = lampK * 3.5;
    shadeMat.emissiveIntensity = lampK * 3.2;
    deskShade.emissiveIntensity = lampK * 2.8;
    const bulbOn = dl < 0.6 ? 1 : 0.15;
    bulbMats.forEach((m, i) => { m.emissiveIntensity = bulbOn * (2.6 + 0.6 * Math.sin(t * 1.3 + i * 2.1)); });
    candleFlame.scale.y = 1.6 + Math.sin(t * 9) * 0.25;

    mix(patchMat.color, '#8fa8ff', '#fff2cf', dl, '#ffb98a', wm * 0.7);
    patchMat.opacity = lerp(0.14, 0.17, dl) * dim;
    glassMat.opacity = lerp(0.07, 0.22, dl); // 玻璃反光白天明显，夜里淡

    // 挂钟
    const h = hourNow();
    hourHand.rotation.z = -((h % 12) / 12) * Math.PI * 2;
    minHand.rotation.z = -(h % 1) * Math.PI * 2;

    // 火
    fire.level = damp(fire.level, fire.lit ? 1 : 0, fire.lit ? 2.2 : 3.5, dt);
    const L = fire.level, flick = 0.82 + 0.1 * Math.sin(t * 11.3) + 0.08 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 5.1);
    fg.visible = L > 0.02;
    for (const f of fire.flames) {
      const s = f.userData.s, ph = f.userData.ph, w = 0.85 + 0.25 * Math.sin(t * 8 + ph) + 0.12 * Math.sin(t * 17 + ph * 2);
      f.scale.set(s * L * (1.05 - 0.1 * w), s * L * w, s * L);
      f.rotation.z = Math.sin(t * 5 + ph) * 0.12;
    }
    fireLight.intensity = L * flick * lerp(22, 14, dl);
    glowMat.opacity = L * flick * lerp(0.6, 0.3, dl);
    floorGlowMat.opacity = L * flick * lerp(0.42, 0.14, dl);
    eMat.opacity = L;
    if (L > 0.02) {
      for (let i = 0; i < EN; i++) {
        const s = eSeed[i], k = (t * s.sp * 0.5 + s.ph) % 1;
        ePos[i * 3] = s.x * (1 - k * 0.5) + Math.sin(t * 3 + i) * 0.04;
        ePos[i * 3 + 1] = k * 1.0;
        ePos[i * 3 + 2] = Math.cos(t * 2 + i) * 0.05;
      }
      eGeo.attributes.position.needsUpdate = true;
    }

    // 灰尘
    dMat.opacity = 0.5 * dl * dim;
    for (let i = 0; i < DN; i++) {
      const s = dSeed[i];
      dPos[i * 3] = s.x + Math.sin(t * 0.2 + s.ph) * 0.4;
      dPos[i * 3 + 1] = s.y + Math.sin(t * 0.15 + s.ph * 2) * 0.3;
      dPos[i * 3 + 2] = s.z + Math.cos(t * 0.17 + s.ph) * 0.3;
    }
    dGeo.attributes.position.needsUpdate = true;
  }

  // 占地（xmin, xmax, zmin, zmax），寻路用
  const obstacles = [
    [-5.3, -2.7, -3.5, -2.2], // 壁炉
    [-1.2, 2.0, -3.5, -2.15], // 沙发
    [2.25, 2.65, -3.1, -2.7], // 落地灯
    [3.6, 5.7, -3.5, -0.48], // 床
    [-5.85, -4.88, 0.78, 2.62], // 书桌
    [-6, -5.45, -2.0, -0.2], // 书架
    [4.9, 5.5, 2.9, 3.5], // 盆栽
  ];

  // 互动提示光点悬浮的位置
  const anchors = {
    sofa: new THREE.Vector3(0.4, 1.75, -2.6),
    fire: new THREE.Vector3(-4, 2.75, -2.6),
    bed: new THREE.Vector3(4.65, 1.7, -1.6),
    letter: new THREE.Vector3(-5.2, 1.5, 1.75),
    door: new THREE.Vector3(5.75, 2.75, 1.3),
  };

  return { group: g, key, obstacles, hits, fire, anchors, setEnv };
}
