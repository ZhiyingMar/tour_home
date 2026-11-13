// 小屋本体：地板、墙、窗框、家具、灯光、壁炉。
// 想加新家具：照下面的写法拼几个圆角方块，再往 obstacles 里加一块占地、往 hit() 里加一个可点区域。
import * as THREE from 'three';
import { ROOM } from './config.js';
import { hourNow } from './time.js';
import { lerp, damp, rand, rng, canvasTex, glowTex, mat, rbox, ball, cyl, at, starShape } from './util.js';
import { wallMaterial, panelMaterial, weaveTex } from './textures.js';

const C = {
  wall: '#f4e4c9', wainscot: '#e9cda6', trim: '#fff6e6',
  wood: '#b98458', woodDark: '#8f6242', woodLight: '#d9a877',
  sofa: '#8fbf9a', sofaDark: '#79ab87', cream: '#fbf1df',
  stone: '#cdbcab', stoneDark: '#a99a8c', soot: '#3a2b28',
  duvet: '#a9c9ee', pink: '#f2a9a0', yellow: '#f6cf6b', leaf: '#6fae6c',
};

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
  // 墙裙和踢脚线
  add(paneled(W, 1.05, 0.06, W), 0, 0.525, ROOM.z0 + 0.03);
  add(plain(W, 0.07, 0.09, C.trim), 0, 1.08, ROOM.z0 + 0.045);
  for (const sx of [-1, 1]) {
    add(paneled(0.06, 1.05, D, D), sx * (ROOM.x1 - 0.03), 0.525, zc);
    add(plain(0.09, 0.07, D, C.trim), sx * (ROOM.x1 - 0.045), 1.08, zc);
  }

  // ───── 大窗 ─────
  const wcx = (win.x0 + win.x1) / 2, wcy = (win.y0 + win.y1) / 2, ww = win.x1 - win.x0, wh = win.y1 - win.y0;
  const view = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 2.65), new THREE.MeshBasicMaterial({ map: sceneryTex, toneMapped: false }));
  add(view, wcx + 0.02, 2.08, ROOM.z0 - 1.0);
  const fz = ROOM.z0 + 0.02;
  add(rbox(ww + 0.36, 0.18, 0.2, C.trim, 0.05), wcx, win.y1 + 0.05, fz);
  add(rbox(0.18, wh + 0.2, 0.2, C.trim, 0.05), win.x0 - 0.05, wcy, fz);
  add(rbox(0.18, wh + 0.2, 0.2, C.trim, 0.05), win.x1 + 0.05, wcy, fz);
  add(rbox(ww + 0.6, 0.12, 0.5, C.trim, 0.05), wcx, win.y0 - 0.04, ROOM.z0 + 0.12);
  add(rbox(0.07, wh, 0.08, C.trim, 0.02), wcx - ww / 6, wcy, ROOM.z0 - 0.05);
  add(rbox(0.07, wh, 0.08, C.trim, 0.02), wcx + ww / 6, wcy, ROOM.z0 - 0.05);
  add(rbox(ww, 0.07, 0.08, C.trim, 0.02), wcx, wcy + 0.25, ROOM.z0 - 0.05);
  // 窗帘
  add(cyl(0.035, 0.035, ww + 1.3, C.woodDark, 10), wcx, 3.72, ROOM.z0 + 0.2).rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      add(rbox(0.2, 2.5, 0.16, k % 2 ? '#fbe3b0' : '#f8d99c', 0.08), wcx + sx * (ww / 2 + 0.18 + k * 0.17), 2.45, ROOM.z0 + 0.2);
    }
    add(ball(0.07, C.woodDark), wcx + sx * (ww / 2 + 0.68), 3.72, ROOM.z0 + 0.2);
  }
  // 窗台小盆栽
  const pot = add(cyl(0.13, 0.1, 0.2, '#e8927c'), win.x1 - 0.45, win.y0 + 0.12, ROOM.z0 + 0.15);
  add(ball(0.16, C.leaf, 1, 0.9, 1), 0, 0.2, 0, pot);
  add(ball(0.1, '#84c282'), 0.1, 0.3, 0.02, pot);

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
  const rugTex = canvasTex(512, 512, (c) => {
    const ring = (r, col) => { c.fillStyle = col; c.beginPath(); c.arc(256, 256, r, 0, 7); c.fill(); };
    ring(256, '#f6ead6'); ring(236, '#eaa79b'); ring(214, '#f8f0e2'); ring(204, '#f3c8a8'); ring(196, '#f8f0e2');
    c.fillStyle = '#f3cf7a';
    c.translate(256, 256); c.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 34 : 80, a = (i * Math.PI) / 5 - Math.PI / 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.fill();
  });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.scale.set(2.5, 1.75, 1); rug.receiveShadow = true;
  add(rug, 0.3, 0.012, 0.5);
  const hearthRug = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mat('#e9b08f', { roughness: 1 }));
  hearthRug.rotation.x = -Math.PI / 2; hearthRug.scale.set(1.3, 0.75, 1); hearthRug.receiveShadow = true;
  add(hearthRug, -3.7, 0.014, -1.55);

  // ───── 沙发 ─────
  const sofa = new THREE.Group(); add(sofa, 0.4, 0, -2.75);
  add(rbox(3.2, 0.45, 1.16, C.sofaDark, 0.12), 0, 0.425, 0, sofa);
  add(rbox(3.2, 0.95, 0.38, C.sofa, 0.17), 0, 0.95, -0.39, sofa);
  for (const sx of [-1, 1]) {
    add(rbox(0.44, 0.78, 1.16, C.sofa, 0.2), sx * 1.4, 0.59, 0, sofa);
    add(rbox(1.14, 0.24, 0.86, C.sofa, 0.11), sx * 0.59, 0.74, 0.14, sofa);
    add(cyl(0.05, 0.04, 0.2, C.woodDark, 8), sx * 1.4, 0.1, 0.42, sofa);
    add(cyl(0.05, 0.04, 0.2, C.woodDark, 8), sx * 1.4, 0.1, -0.42, sofa);
  }
  const pl1 = add(rbox(0.5, 0.5, 0.2, C.cream, 0.1), 0.92, 1.05, -0.08, sofa); pl1.rotation.set(-0.25, 0, 0.12);
  const pl2 = add(rbox(0.44, 0.44, 0.2, C.yellow, 0.1), 0.55, 1.02, 0.0, sofa); pl2.rotation.set(-0.3, 0.2, -0.15);
  hit('sofa', 3.3, 1.5, 1.3, 0.4, 0.75, -2.7);

  // 落地灯
  const lamp = new THREE.Group(); add(lamp, 2.75, 0, -2.95);
  add(cyl(0.2, 0.24, 0.06, C.woodDark), 0, 0.03, 0, lamp);
  add(cyl(0.03, 0.03, 1.9, C.woodDark, 8), 0, 0.98, 0, lamp);
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#ffe9bd', emissive: '#ffcc80', emissiveIntensity: 0, roughness: 0.9 });
  add(cyl(0.22, 0.36, 0.42, shadeMat), 0, 2.05, 0, lamp);
  const lampLight = new THREE.PointLight('#ffc98a', 0, 9, 1.6);
  add(lampLight, 2.6, 2.0, -2.6);

  // ───── 床 ─────
  const bed = new THREE.Group(); add(bed, 4.65, 0, -1.9);
  add(rbox(2.14, 0.4, 2.85, C.wood, 0.08), 0, 0.3, 0, bed);
  add(rbox(2.14, 1.35, 0.18, C.wood, 0.09), 0, 0.72, -1.42, bed);
  add(rbox(2.14, 0.6, 0.14, C.wood, 0.07), 0, 0.42, 1.4, bed);
  add(rbox(1.98, 0.28, 2.66, C.cream, 0.1), 0, 0.6, 0, bed);
  add(rbox(1.25, 0.24, 0.6, '#ffffff', 0.11), 0, 0.82, -0.98, bed);
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
  add(rbox(2.06, 0.62, 1.85, new THREE.MeshStandardMaterial({ map: duvetTex, bumpMap: weaveTex, bumpScale: 1.2, roughness: 1 }), 0.26), 0, 0.93, 0.43, bed);
  add(rbox(2.08, 0.2, 0.34, C.cream, 0.1), 0, 1.16, -0.4, bed);
  hit('bed', 2.2, 1.4, 2.9, 4.65, 0.7, -1.9);
  // 床头的画
  add(rbox(1.15, 0.85, 0.07, C.woodLight, 0.03), 4.65, 2.85, ROOM.z0 + 0.04);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.65), new THREE.MeshStandardMaterial({
    roughness: 1,
    map: canvasTex(190, 130, (c) => {
      c.fillStyle = '#cfe6f3'; c.fillRect(0, 0, 190, 130);
      c.fillStyle = '#f9d98a'; c.beginPath(); c.arc(140, 40, 16, 0, 7); c.fill();
      c.fillStyle = '#9cc5a1'; c.beginPath(); c.moveTo(0, 130); c.lineTo(50, 60); c.lineTo(100, 130); c.fill();
      c.fillStyle = '#7fb08c'; c.beginPath(); c.moveTo(60, 130); c.lineTo(125, 75); c.lineTo(190, 130); c.fill();
    }),
  }));
  add(art, 4.65, 2.85, ROOM.z0 + 0.08);

  // ───── 壁炉 ─────
  const fp = new THREE.Group(); add(fp, -4, 0, ROOM.z0);
  add(rbox(0.6, 2.0, 0.85, C.stone, 0.1), -0.92, 1.0, 0.42, fp);
  add(rbox(0.6, 2.0, 0.85, C.stone, 0.1), 0.92, 1.0, 0.42, fp);
  add(rbox(2.44, 0.85, 0.85, C.stone, 0.1), 0, 1.58, 0.42, fp);
  add(plain(1.4, 1.3, 0.1, C.soot), 0, 0.65, 0.1, fp);
  add(plain(1.4, 0.06, 0.8, C.soot), 0, 0.03, 0.42, fp);
  add(rbox(2.8, 0.14, 1.05, C.wood, 0.05), 0, 2.07, 0.47, fp);
  add(rbox(1.9, H - 2.1, 0.5, C.wainscot, 0.06), 0, (H + 2.1) / 2, 0.25, fp);
  add(rbox(2.7, 0.1, 0.55, C.stoneDark, 0.04), 0, 0.05, 1.05, fp);
  // 石缝点缀
  const sr = rng(11);
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 0.92 : -0.92;
    add(rbox(0.2 + sr() * 0.12, 0.13, 0.03, C.stoneDark, 0.03), side + (sr() - 0.5) * 0.25, 0.25 + i * 0.19, 0.85, fp);
  }
  // 柴
  for (const [x, z, ry] of [[-0.18, 0.4, 0.3], [0.18, 0.42, -0.35], [0, 0.5, 1.5]]) {
    const log = add(cyl(0.085, 0.085, 0.75, '#7a4f35', 10), x, 0.14 + (ry > 1 ? 0.12 : 0), z, fp);
    log.rotation.set(0, ry, Math.PI / 2);
  }
  // 壁炉台上的小摆件
  add(rbox(0.3, 0.38, 0.06, C.cream, 0.03), -0.95, 2.33, 0.4, fp).rotation.x = -0.15;
  add(rbox(0.22, 0.3, 0.02, '#f6b8a8', 0.01), -0.95, 2.33, 0.44, fp).rotation.x = -0.15;
  add(cyl(0.07, 0.07, 0.3, C.cream, 12), 0.95, 2.29, 0.45, fp);
  const candleFlame = add(ball(0.035, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2.2), toneMapped: false }), 1, 1.6, 1), 0.95, 2.5, 0.45, fp);
  // 挂钟（走的是真实时间）
  const clock = new THREE.Group(); add(clock, 0, 3.1, 0.52, fp);
  const face = cyl(0.36, 0.36, 0.06, C.cream, 28); face.rotation.x = Math.PI / 2; clock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 10, 32), mat(C.woodDark)); clock.add(rim);
  const hand = (len, w) => { const p = new THREE.Group(); p.position.z = 0.045; add(rbox(w, len, 0.02, C.woodDark, 0.01), 0, len / 2 - 0.02, 0, p); clock.add(p); return p; };
  const hourHand = hand(0.2, 0.045), minHand = hand(0.29, 0.03);
  hit('fire', 2.6, 2.2, 1.3, -4, 1.1, ROOM.z0 + 0.6);

  // 火
  const fire = { lit: false, level: 0, flames: [] };
  const fg = new THREE.Group(); add(fg, 0, 0.2, 0.45, fp);
  const flameGeo = new THREE.ConeGeometry(1, 2.4, 14);
  flameGeo.translate(0, 1.2, 0);
  for (const [x, z, s, col] of [[0, 0, 0.3, '#ff8a3c'], [-0.26, 0.03, 0.2, '#ff9a45'], [0.27, -0.02, 0.21, '#ff9a45'], [0.02, 0.05, 0.19, '#ffc85a'], [0, 0.09, 0.1, '#fff3b5']]) {
    const m = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(3.2), toneMapped: false, transparent: true, opacity: 0.95 }));
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
  const shelf = new THREE.Group(); add(shelf, ROOM.x0 + 0.3, 0, -1.1);
  add(rbox(0.5, 2.5, 1.8, C.wood, 0.05), 0, 1.25, 0, shelf);
  const br = rng(21), bookCols = ['#f2a9a0', '#a9c9ee', '#f6cf6b', '#9cc5a1', '#d6b4e8', '#fbf1df', '#f3b27a'];
  for (let s = 0; s < 4; s++) {
    add(plain(0.1, 0.5, 1.6, C.woodDark), 0.22, 0.42 + s * 0.58, 0, shelf);
    let z = -0.72;
    while (z < 0.6) {
      const bw = 0.09 + br() * 0.08, bh = 0.3 + br() * 0.14;
      if (br() > 0.15) add(rbox(0.26, bh, bw, bookCols[Math.floor(br() * bookCols.length)], 0.015), 0.24, 0.19 + s * 0.58 + bh / 2, z + bw / 2, shelf);
      z += bw + 0.012;
    }
  }

  // ───── 书桌和信（左墙）─────
  const desk = new THREE.Group(); add(desk, -5.35, 0, 1.7);
  add(rbox(0.95, 0.09, 1.85, C.woodLight, 0.04), 0, 0.95, 0, desk);
  for (const [x, z] of [[-0.38, -0.82], [0.38, -0.82], [-0.38, 0.82], [0.38, 0.82]]) add(rbox(0.09, 0.92, 0.09, C.wood, 0.03), x, 0.46, z, desk);
  add(rbox(0.85, 0.2, 1.7, C.wood, 0.03), 0, 0.82, 0, desk);
  const env = add(rbox(0.3, 0.025, 0.44, C.cream, 0.01), 0.12, 1.01, 0.05, desk); env.rotation.y = 0.25;
  add(cyl(0.045, 0.045, 0.02, '#e2574c', 14), 0.12, 1.03, 0.05, desk);
  add(cyl(0.07, 0.06, 0.14, '#a9c9ee', 14), -0.2, 1.07, 0.6, desk);
  for (let i = 0; i < 3; i++) add(cyl(0.012, 0.012, 0.24, ['#f6cf6b', '#f2a9a0', '#9cc5a1'][i], 6), -0.2 + (i - 1) * 0.025, 1.17, 0.6 + (i - 1) * 0.02, desk).rotation.z = (i - 1) * 0.2;
  // 台灯
  add(cyl(0.11, 0.13, 0.04, '#7fb5a5'), -0.2, 1.01, -0.6, desk);
  add(cyl(0.018, 0.018, 0.42, '#7fb5a5', 8), -0.2, 1.2, -0.6, desk);
  const deskShade = new THREE.MeshStandardMaterial({ color: '#9fd1c1', emissive: '#ffd08a', emissiveIntensity: 0, roughness: 0.9 });
  add(cyl(0.1, 0.2, 0.2, deskShade), -0.2, 1.46, -0.6, desk);
  const deskLight = new THREE.PointLight('#ffd09a', 0, 6, 1.6); add(deskLight, -5.2, 1.45, 1.2);
  // 桌子上方的小画
  const frame = add(rbox(0.07, 0.75, 0.75, C.woodLight, 0.03), ROOM.x0 + 0.04, 2.5, 1.7);
  const starPic = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.2, 0.09)), mat('#f3cf7a'));
  starPic.rotation.y = Math.PI / 2; add(starPic, 0.045, 0, 0, frame);
  const inner = plain(0.02, 0.58, 0.58, '#3f4a7a'); add(inner, 0.03, 0, 0, frame);
  hit('letter', 1.1, 0.9, 1.3, -5.3, 1.25, 1.75);

  // ───── 门（通往屋外）─────
  const door = new THREE.Group(); add(door, ROOM.x1 - 0.03, 0, 1.3);
  add(rbox(0.1, 2.5, 1.36, C.trim, 0.04), 0, 1.25, 0, door);
  add(rbox(0.1, 2.36, 1.16, '#dba878', 0.05), -0.03, 1.2, 0, door);
  add(rbox(0.04, 0.8, 0.85, '#e6b88c', 0.04), -0.08, 1.65, 0, door);
  add(rbox(0.04, 0.7, 0.85, '#e6b88c', 0.04), -0.08, 0.6, 0, door);
  add(ball(0.06, '#f3cf7a', 1, 1, 1, { roughness: 0.4, metalness: 0.3 }), -0.13, 1.12, -0.42, door);
  hit('door', 0.5, 2.5, 1.4, ROOM.x1 - 0.2, 1.25, 1.3);

  // 盆栽
  const plant = new THREE.Group(); add(plant, 5.2, 0, 3.2);
  add(cyl(0.3, 0.22, 0.5, '#f1e3d0'), 0, 0.25, 0, plant);
  for (const [x, y, z, r] of [[0, 0.95, 0, 0.42], [-0.28, 0.75, 0.1, 0.28], [0.26, 0.8, -0.08, 0.3], [0.05, 1.35, 0.05, 0.28], [-0.1, 1.1, -0.2, 0.25]]) {
    add(ball(r, r > 0.29 ? C.leaf : '#84c282'), x, y, z, plant);
  }

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
    [2.55, 2.95, -3.15, -2.75], // 落地灯
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
