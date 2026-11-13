// 屋外的世界：小屋外观、花园、池塘、长椅、铁路，以及向四面八方无限延伸的草地和树林。
// 远处的草木不是提前摆好的，而是按坐标算出来的：走到哪儿，哪儿就“长”出同样的东西，所以没有边界。
import * as THREE from 'three';
import { daylight, warmth } from './time.js';
import { lerp, damp, rand, rng, canvasTex, glowTex, mat, rbox, ball, cyl, at } from './util.js';

const CELL = 4; // 每格 4 米，一格里最多长一样大东西
const RAIL_Z = -24;
const POND = { x: 11, z: 3.4, rx: 3.4, rz: 2.4 };

function hash(i, j, k) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 这些地方不长野生的树和石头：小屋和花园、池塘、长椅、铁路、门前的小路
function reserved(x, z, pad = 0) {
  if (Math.abs(x) < 7.2 + pad && z > -7.5 - pad && z < 6 + pad) return true;
  if (((x - POND.x) / (POND.rx + 1.6 + pad)) ** 2 + ((z - POND.z) / (POND.rz + 1.6 + pad)) ** 2 < 1) return true;
  if (Math.abs(x - 11) < 2.2 + pad && Math.abs(z + 1) < 2 + pad) return true;
  if (Math.abs(z - RAIL_Z) < 3 + pad) return true;
  if (Math.abs(x) < 1.6 + pad && z > 0 && z < 14) return true;
  return false;
}

const cellCache = new Map();
function cell(i, j) {
  const key = i * 100003 + j;
  let c = cellCache.get(key);
  if (c !== undefined) return c;
  const r = hash(i, j, 0);
  const x = (i + 0.2 + hash(i, j, 1) * 0.6) * CELL, z = (j + 0.2 + hash(i, j, 2) * 0.6) * CELL;
  c = null;
  if (!reserved(x, z)) {
    const s = 0.85 + hash(i, j, 3) * 0.5, v = hash(i, j, 4);
    if (r < 0.14) c = { type: 'tree', x, z, s, v, rad: 0.5 };
    else if (r < 0.21) c = { type: 'pine', x, z, s, v, rad: 0.55 };
    else if (r < 0.29) c = { type: 'bush', x, z, s, v, rad: 0.55 };
    else if (r < 0.34) c = { type: 'rock', x, z, s, v, rad: 0.5 };
  }
  if (cellCache.size > 6000) cellCache.clear();
  cellCache.set(key, c);
  return c;
}

export function buildOutdoor(scene) {
  const g = new THREE.Group();
  g.visible = false;
  scene.add(g);
  const hits = [];
  const add = (m, x, y, z, parent = g) => { at(m, x, y, z); parent.add(m); return m; };
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hit = (id, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat);
    m.userData.id = id; add(m, x, y, z); hits.push(m);
  };

  // ───── 草地（一大块跟着人走的地面，花纹按世界坐标贴，所以看不出它在动）─────
  const TILE = 16;
  const grassTex = canvasTex(512, 512, (c, w, h) => {
    const r = rng(5);
    c.fillStyle = '#8fce7a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, rad = 26 + r() * 60;
      c.fillStyle = r() < 0.5 ? 'rgba(120,196,104,.35)' : 'rgba(168,222,130,.3)';
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { c.beginPath(); c.ellipse(x + ox, y + oy, rad, rad * 0.7, r() * 3, 0, 7); c.fill(); }
    }
    c.strokeStyle = 'rgba(86,160,84,.5)'; c.lineWidth = 2.5; c.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 6, y - 6 - r() * 6); c.stroke();
    }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  const GROUND = 160;
  grassTex.repeat.set(GROUND / TILE, GROUND / TILE);
  const groundGeo = new THREE.PlaneGeometry(GROUND, GROUND, 80, 80);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  g.add(ground);

  // ───── 小屋外观 ─────
  const house = new THREE.Group(); g.add(house);
  add(rbox(6.8, 0.5, 5.4, '#b9a999', 0.08), 0, 0.2, -2.6, house);
  add(rbox(6.4, 3.2, 5, '#f6e7cd', 0.1), 0, 1.9, -2.6, house);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-3.9, 0); roofShape.lineTo(3.9, 0); roofShape.lineTo(0, 2.5); roofShape.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 6, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3 }), mat('#e2725b'));
  roof.castShadow = roof.receiveShadow = true;
  add(roof, 0, 3.4, -5.6, house);
  const gable = new THREE.Shape();
  gable.moveTo(-2.9, 0); gable.lineTo(2.9, 0); gable.lineTo(0, 1.85); gable.closePath();
  add(new THREE.Mesh(new THREE.ShapeGeometry(gable), mat('#f6e7cd')), 0, 3.5, 0.53, house);
  add(ball(0.32, '#fff6e6', 1, 1, 0.2), 0, 4.2, 0.55, house);
  add(rbox(0.9, 1.9, 0.9, '#cdbcab', 0.08), 1.9, 5.2, -3.6, house);
  add(rbox(1.1, 0.2, 1.1, '#a99a8c', 0.06), 1.9, 6.2, -3.6, house);
  // 门
  add(rbox(1.5, 2.5, 0.16, '#fff6e6', 0.05), 0, 1.55, -0.08, house);
  add(rbox(1.2, 2.25, 0.16, '#dba878', 0.06), 0, 1.5, -0.03, house);
  add(ball(0.07, '#f3cf7a', 1, 1, 1, { roughness: 0.4, metalness: 0.3 }), 0.42, 1.45, 0.08, house);
  add(cyl(0.22, 0.22, 0.05, '#a9c9ee', 20), 0, 2.15, 0.06, house).rotation.x = Math.PI / 2;
  add(rbox(1.5, 0.06, 0.9, '#e9b08f', 0.03), 0, 0.47, 0.5, house);
  add(rbox(1.9, 0.14, 0.9, '#b9a999', 0.05), 0, 0.36, 0.5, house);
  add(rbox(2.3, 0.14, 0.6, '#b9a999', 0.05), 0, 0.2, 1.1, house);
  // 窗：夜里会透出灯光
  const winMat = new THREE.MeshStandardMaterial({ color: '#bfe1f2', emissive: '#ffcc80', emissiveIntensity: 0, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    add(rbox(1.5, 1.4, 0.12, '#fff6e6', 0.05), sx * 2.05, 2.2, -0.08, house);
    add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), winMat), sx * 2.05, 2.2, -0.005, house);
    add(rbox(0.06, 1.1, 0.04, '#fff6e6', 0.01), sx * 2.05, 2.2, 0, house);
    add(rbox(1.2, 0.06, 0.04, '#fff6e6', 0.01), sx * 2.05, 2.2, 0, house);
    add(rbox(1.5, 0.28, 0.34, '#b98458', 0.05), sx * 2.05, 1.35, 0.1, house);
    for (let k = 0; k < 5; k++) {
      add(ball(0.11, ['#f2a9a0', '#f6cf6b', '#fff6e6', '#f2a9a0', '#d6b4e8'][k]), sx * 2.05 + (k - 2) * 0.27, 1.56, 0.12, house);
      add(ball(0.12, '#6fae6c', 1, 0.6, 1), sx * 2.05 + (k - 2) * 0.27, 1.48, 0.1, house);
    }
  }
  hit('home', 1.8, 2.8, 1.4, 0, 1.5, 0.3);
  // 烟囱的烟（屋里壁炉点着时才冒）
  const smoke = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#f4f0ea', transparent: true, opacity: 0, depthWrite: false }));
    s.userData.ph = i / 7; g.add(s); smoke.push(s);
  }
  // 门灯
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffe9bd', emissive: '#ffcc80', emissiveIntensity: 0, roughness: 0.6 });
  add(cyl(0.05, 0.07, 2.0, '#6b4a36', 8), -1.7, 1.0, 1.0);
  add(rbox(0.34, 0.4, 0.34, lanternMat, 0.08), -1.7, 2.15, 1.0);
  add(rbox(0.42, 0.08, 0.42, '#6b4a36', 0.03), -1.7, 2.4, 1.0);
  const lanternLight = new THREE.PointLight('#ffc98a', 0, 11, 1.6); add(lanternLight, -1.7, 2.1, 1.3);
  // 信箱
  add(cyl(0.05, 0.05, 1.0, '#8f6242', 8), 2.1, 0.5, 2.6);
  add(rbox(0.5, 0.34, 0.34, '#e2574c', 0.1), 2.1, 1.1, 2.6);
  add(rbox(0.04, 0.24, 0.12, '#f6cf6b', 0.01), 2.37, 1.2, 2.6);

  // ───── 篱笆 ─────
  const fenceRects = [];
  const posts = [];
  // 只在前院两个角各围一小段，中间和两侧都敞开，走路不会被拦住
  for (let x = 3.5; x <= 6; x += 1) { posts.push([x, 4.6, 0]); posts.push([-x, 4.6, 0]); }
  for (let z = 1.6; z < 4.6; z += 1) { posts.push([-6, z, 1]); posts.push([6, z, 1]); }
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), mat('#fff6e6'), posts.length);
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.06), mat('#fff6e6'), posts.length * 2);
  postMesh.castShadow = railMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  const put = (mesh, i, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry, 0); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  posts.forEach(([x, z, side], i) => {
    put(postMesh, i, x, 0.45, z);
    put(railMesh, i * 2, x, 0.62, z, 1, 1, 1, side ? Math.PI / 2 : 0);
    put(railMesh, i * 2 + 1, x, 0.3, z, 1, 1, 1, side ? Math.PI / 2 : 0);
  });
  g.add(postMesh, railMesh);
  fenceRects.push([-6.6, -3, 4.45, 4.75], [3, 6.6, 4.45, 4.75], [-6.2, -5.8, 1.1, 4.75], [5.8, 6.2, 1.1, 4.75]);

  // ───── 门前小路 ─────
  const stones = [];
  for (let z = 1.9; z < 13.5; z += 1.05) stones.push([Math.sin(z * 1.3) * 0.28, z]);
  for (let k = 0; k < 6; k++) stones.push([6.9 + k * 0.75, 1.7 + Math.sin(k) * 0.3]);
  const stoneMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 9), mat('#d8cbbb'), stones.length);
  stoneMesh.receiveShadow = true;
  stones.forEach(([x, z], i) => put(stoneMesh, i, x, 0.03, z, 1 + hash(i, 3, 9) * 0.3, 1, 0.8 + hash(i, 5, 9) * 0.3, hash(i, 7, 9) * 3));
  g.add(stoneMesh);

  // ───── 池塘和长椅 ─────
  const waterMat = new THREE.MeshStandardMaterial({ color: '#6fc3ea', emissive: '#6fc3ea', emissiveIntensity: 0.35, roughness: 0.4, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), waterMat);
  water.rotation.x = -Math.PI / 2; water.scale.set(POND.rx, POND.rz, 1);
  add(water, POND.x, 0.04, POND.z);
  const bank = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat('#d9c9a3', { roughness: 1 }));
  bank.rotation.x = -Math.PI / 2; bank.scale.set(POND.rx + 0.35, POND.rz + 0.35, 1); bank.receiveShadow = true;
  add(bank, POND.x, 0.02, POND.z);
  for (let k = 0; k < 15; k++) {
    const a = (k / 15) * Math.PI * 2 + 0.2, s = 0.22 + hash(k, 1, 7) * 0.2;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat('#b9b2aa', { flatShading: true }));
    rock.castShadow = true; rock.scale.set(s * 1.3, s * 0.8, s); rock.rotation.y = k;
    add(rock, POND.x + Math.cos(a) * (POND.rx + 0.2), 0.1, POND.z + Math.sin(a) * (POND.rz + 0.2));
  }
  for (const [x, z, s] of [[-1.4, 0.5, 0.42], [0.9, -0.8, 0.34], [1.7, 0.9, 0.3], [-0.3, 1.2, 0.26]]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(s, 16, 0.4, Math.PI * 1.8), mat('#6fae6c'));
    pad.rotation.x = -Math.PI / 2; add(pad, POND.x + x, 0.06, POND.z + z);
  }
  add(ball(0.13, '#f6b8c8', 1, 0.7, 1), POND.x - 1.4, 0.13, POND.z + 0.5);
  const bench = new THREE.Group(); add(bench, 11, 0, -1.2);
  add(rbox(2.1, 0.12, 0.62, '#c99364', 0.05), 0, 0.5, 0, bench);
  add(rbox(2.1, 0.55, 0.1, '#c99364', 0.05), 0, 0.95, -0.3, bench).rotation.x = -0.12;
  for (const sx of [-1, 1]) {
    add(rbox(0.1, 0.5, 0.56, '#8f6242', 0.03), sx * 0.9, 0.25, 0, bench);
    add(rbox(0.1, 0.9, 0.1, '#8f6242', 0.03), sx * 0.9, 0.75, -0.3, bench);
  }
  hit('bench', 2.4, 1.4, 1.1, 11, 0.7, -1.1);

  // ───── 铁路和小火车 ─────
  const railGroup = new THREE.Group(); g.add(railGroup);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, 2.6, 80, 1).rotateX(-Math.PI / 2), mat('#cdbfa8', { roughness: 1 }));
  bed.receiveShadow = true; bed.frustumCulled = false; add(bed, 0, 0.015, RAIL_Z, railGroup);
  for (const dz of [-0.55, 0.55]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(GROUND, 0.1, 0.1, 80, 1, 1), mat('#8d8a8f', { roughness: 0.4, metalness: 0.5 }));
    rail.frustumCulled = false; add(rail, 0, 0.14, RAIL_Z + dz, railGroup);
  }
  const SLEEPERS = 110;
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.09, 1.7), mat('#8f6242'), SLEEPERS);
  sleepers.frustumCulled = false;
  for (let i = 0; i < SLEEPERS; i++) put(sleepers, i, (i - SLEEPERS / 2) * 1.2, 0.06, RAIL_Z);
  railGroup.add(sleepers);

  const train = new THREE.Group(); train.visible = false; g.add(train);
  const carCols = ['#e2574c', '#f6e7c8', '#8fbf9a', '#f6cf6b', '#a9c9ee'];
  const trainWin = new THREE.MeshStandardMaterial({ color: '#fff6e6', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.4 });
  carCols.forEach((col, i) => {
    const car = new THREE.Group(); car.position.x = -i * 3.3; train.add(car);
    add(rbox(3, 1.5, 1.5, col, 0.3), 0, 1.15, 0, car);
    add(rbox(3.1, 0.2, 1.6, '#6b4a36', 0.08), 0, 0.42, 0, car);
    for (const wx of [-0.95, 0.95]) for (const wz of [-0.7, 0.7]) add(cyl(0.3, 0.3, 0.14, '#3a2f40', 14), wx, 0.3, wz, car).rotation.x = Math.PI / 2;
    if (i === 0) {
      add(cyl(0.22, 0.28, 0.8, '#3a2f40', 12), 0.9, 2.2, 0, car);
      add(rbox(1.2, 0.9, 1.4, col, 0.2), -0.8, 2.1, 0, car);
      add(ball(0.2, trainWin), 1.5, 1.2, 0, car);
    } else for (const wx of [-0.8, 0, 0.8]) add(rbox(0.5, 0.5, 1.54, trainWin, 0.08), wx, 1.4, 0, car);
    car.traverse((o) => { o.frustumCulled = false; });
  });
  const trainState = { on: false, wait: 14, dir: 1, x: 0, whistled: false };
  const puffs = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    s.userData.life = 0; g.add(s); puffs.push(s);
  }
  let puffT = 0;

  // ───── 无限延伸的草木（实例化，走到哪儿摆到哪儿）─────
  const inst = (geo, material, n) => {
    const m = new THREE.InstancedMesh(geo, material, n);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
    g.add(m); return m;
  };
  const white = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const M = {
    trunk: inst(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 8).translate(0, 0.7, 0), mat('#8f6242'), 140),
    leaf: inst(new THREE.SphereGeometry(1, 14, 10), white(), 420),
    cone: inst(new THREE.ConeGeometry(1, 1.4, 10).translate(0, 0.7, 0), white(), 220),
    bush: inst(new THREE.SphereGeometry(1, 12, 9), white(), 200),
    rock: inst(new THREE.IcosahedronGeometry(1, 0), mat('#b9b2aa', { flatShading: true }), 80),
    flower: inst(new THREE.SphereGeometry(0.12, 8, 6), white(), 1000),
    tuft: inst(new THREE.ConeGeometry(0.1, 0.34, 5).translate(0, 0.17, 0), mat('#7cc46c'), 760),
  };
  M.flower.castShadow = M.tuft.castShadow = false;
  const col = new THREE.Color();
  const LEAF = ['#7cc06e', '#6db562', '#8fce7a', '#62a85c'], PINE = ['#4f9a6a', '#458d62'], FLOWER = ['#f2a9a0', '#f6cf6b', '#ffffff', '#d6b4e8', '#f6b8c8', '#a9c9ee'];
  let lastKey = null;

  function refill(px, pz) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL), key = `${ci},${cj}`;
    if (key === lastKey) return;
    lastKey = key;
    const n = { trunk: 0, leaf: 0, cone: 0, bush: 0, rock: 0, flower: 0, tuft: 0 };
    const set = (name, x, y, z, sx, sy, sz, ry, color) => {
      const m = M[name];
      if (n[name] >= m.instanceMatrix.count) return;
      put(m, n[name], x, y, z, sx, sy, sz, ry);
      if (color) m.setColorAt(n[name], col.set(color));
      n[name]++;
    };
    for (let i = ci - 10; i <= ci + 10; i++) {
      for (let j = cj - 13; j <= cj + 4; j++) {
        const c = cell(i, j);
        if (c) {
          const { x, z, s, v } = c;
          if (c.type === 'tree') {
            const pink = v > 0.9, lc = pink ? '#f6b8c8' : LEAF[Math.floor(v * 3.99)];
            set('trunk', x, 0, z, s, s, s, v * 6);
            set('leaf', x, 2.05 * s, z, 1.08 * s, 1.0 * s, 1.08 * s, 0, lc);
            set('leaf', x - 0.5 * s, 1.55 * s, z + 0.25 * s, 0.8 * s, 0.75 * s, 0.8 * s, 0, lc);
            set('leaf', x + 0.55 * s, 1.6 * s, z - 0.1 * s, 0.78 * s, 0.72 * s, 0.78 * s, 0, lc);
          } else if (c.type === 'pine') {
            const pc = PINE[v > 0.5 ? 1 : 0];
            set('trunk', x, 0, z, s * 0.9, s * 0.7, s * 0.9, 0);
            set('cone', x, 0.75 * s, z, 1.05 * s, 1.1 * s, 1.05 * s, 0, pc);
            set('cone', x, 1.55 * s, z, 0.82 * s, 1.0 * s, 0.82 * s, 0, pc);
            set('cone', x, 2.3 * s, z, 0.56 * s, 0.9 * s, 0.56 * s, 0, pc);
          } else if (c.type === 'bush') {
            set('bush', x, 0.35 * s, z, 0.62 * s, 0.5 * s, 0.6 * s, 0, LEAF[Math.floor(v * 3.99)]);
            set('bush', x + 0.42 * s, 0.28 * s, z + 0.12, 0.42 * s, 0.36 * s, 0.42 * s, 0, LEAF[Math.floor((1 - v) * 3.99)]);
          } else set('rock', x, 0.22 * s, z, 0.55 * s, 0.38 * s, 0.48 * s, v * 6);
        }
        for (let k = 0; k < 3; k++) {
          const fx = (i + hash(i, j, 10 + k)) * CELL, fz = (j + hash(i, j, 20 + k)) * CELL, fv = hash(i, j, 30 + k);
          if (fv < 0.55 && !reserved(fx, fz, -1.2)) set('flower', fx, 0.16, fz, 1, 0.8, 1, 0, FLOWER[Math.floor(fv / 0.55 * 5.99)]);
          else if (fv > 0.62) set('tuft', fx, 0, fz, 0.5 + fv * 0.5, 0.45 + fv * 0.4, 0.5 + fv * 0.5, fv * 9);
        }
      }
    }
    for (const name in M) {
      const m = M[name];
      m.count = n[name];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // ───── 空气里飘的东西：白天是花粉，夜里是萤火虫 ─────
  const FN = 46, fPos = new Float32Array(FN * 3), fSeed = [];
  for (let i = 0; i < FN; i++) fSeed.push({ x: rand(0, 34), y: rand(0.4, 2.6), z: rand(0, 26), ph: rand(0, 9), sp: rand(0.3, 1) });
  const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const fMat = new THREE.PointsMaterial({ map: glowTex, color: '#fff4d6', size: 0.14, transparent: true, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending });
  const flies = new THREE.Points(fGeo, fMat); flies.frustumCulled = false; g.add(flies);

  // ───── 天空（画在一张画布上，当作背景）─────
  const skyC = document.createElement('canvas'); skyC.width = 512; skyC.height = 512;
  const sg = skyC.getContext('2d');
  const skyTex = new THREE.CanvasTexture(skyC); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sr = rng(99), stars = [], clouds = [];
  for (let i = 0; i < 110; i++) stars.push([sr() * 512, sr() * 300, 0.5 + sr() * 1.3, sr() * 7, 0.6 + sr() * 2]);
  for (let i = 0; i < 6; i++) clouds.push({ x: sr() * 512, y: 20 + sr() * 150, s: 0.5 + sr() * 0.7, v: 2 + sr() * 4 });
  const A = new THREE.Color(), B = new THREE.Color(), C3 = new THREE.Color();
  const mix3 = (n, d, w, dl, wk) => A.set(n).lerp(B.set(d), dl).lerp(C3.set(w), wk).getStyle();
  let skyAcc = 1;
  function drawSky(dt, h, t) {
    skyAcc += dt;
    if (skyAcc < 0.2) return;
    const step = skyAcc; skyAcc = 0;
    const dl = daylight(h), wm = warmth(h), nt = 1 - dl;
    const gr = sg.createLinearGradient(0, 0, 0, 330);
    gr.addColorStop(0, mix3('#0c1236', '#62b8ee', '#5a5fa8', dl, wm * 0.55));
    gr.addColorStop(1, mix3('#2b3468', '#e6f6ff', '#ffb48a', dl, wm * 0.9));
    sg.fillStyle = gr; sg.fillRect(0, 0, 512, 512);
    if (nt > 0.05) {
      sg.fillStyle = '#fff';
      for (const [x, y, s, ph, sp] of stars) { sg.globalAlpha = nt * (0.55 + 0.45 * Math.sin(t * sp + ph)); sg.beginPath(); sg.arc(x, y, s, 0, 7); sg.fill(); }
      sg.globalAlpha = nt;
      const mg = sg.createRadialGradient(390, 70, 0, 390, 70, 70);
      mg.addColorStop(0, 'rgba(255,248,220,.6)'); mg.addColorStop(1, 'rgba(210,220,255,0)');
      sg.fillStyle = mg; sg.fillRect(320, 0, 140, 140);
      sg.fillStyle = '#fff7dc'; sg.beginPath(); sg.arc(390, 70, 17, 0, 7); sg.fill();
      sg.globalAlpha = 1;
    }
    if (dl > 0.05) {
      const k = Math.min(1, Math.max(0, (h - 5.3) / 13.6)), x = 60 + 390 * k, y = 150 - 110 * Math.sin(k * Math.PI);
      sg.globalAlpha = dl;
      const g2 = sg.createRadialGradient(x, y, 0, x, y, 80);
      g2.addColorStop(0, 'rgba(255,244,200,.8)'); g2.addColorStop(1, 'rgba(255,226,160,0)');
      sg.fillStyle = g2; sg.fillRect(x - 80, y - 80, 160, 160);
      sg.fillStyle = '#fffbe0'; sg.beginPath(); sg.arc(x, y, 18, 0, 7); sg.fill();
      sg.globalAlpha = 1;
    }
    for (const c of clouds) {
      c.x += c.v * step; if (c.x > 560) c.x = -160;
      sg.fillStyle = `rgba(255,255,255,${0.12 + 0.7 * dl})`;
      for (const [ox, oy, r] of [[0, 0, 26], [28, -10, 32], [60, 0, 26], [30, 8, 28]]) { sg.beginPath(); sg.arc(c.x + ox * c.s, c.y + oy * c.s, r * c.s, 0, 7); sg.fill(); }
    }
    skyTex.needsUpdate = true;
  }

  // ───── 能不能走：小屋、篱笆、池塘、长椅是固定的；树和石头按格子现算 ─────
  const rects = [[-3.6, 3.6, -5.5, 0.2], [9.8, 12.2, -1.7, -0.8], ...fenceRects];
  const PAD = 0.32;
  function walkable(x, z) {
    for (const r of rects) if (x > r[0] - PAD && x < r[1] + PAD && z > r[2] - PAD && z < r[3] + PAD) return false;
    if (((x - POND.x) / (POND.rx + 0.5)) ** 2 + ((z - POND.z) / (POND.rz + 0.5)) ** 2 < 1) return false;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const c = cell(i, j);
      if (c && Math.hypot(c.x - x, c.z - z) < c.rad * c.s + PAD) return false;
    }
    return true;
  }
  const nav = {
    direct: true, // 户外不用网格寻路：朝目标直走，碰到东西就沿着边滑过去
    walkable,
    nearest(x, z) {
      if (walkable(x, z)) return { x, z };
      for (let r = 0.4; r < 6; r += 0.4) for (let a = 0; a < 6.28; a += 0.5) {
        const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
        if (walkable(nx, nz)) return { x: nx, z: nz };
      }
      return { x, z };
    },
    path(from, to) { return [this.nearest(to.x, to.z)]; },
    randomPoint() { return { x: 0, z: 2 }; },
  };

  let lampK = 0;
  function update(dt, t, { dl, wm, h, fireLevel }, px, pz) {
    // 地面跟着人走，贴图反向偏移，花纹看起来就钉在世界上
    const gx = Math.round(px / 2) * 2, gz = Math.round(pz / 2) * 2;
    ground.position.set(gx, 0, gz - 14);
    grassTex.offset.set(gx / TILE, -(gz - 14) / TILE);
    refill(px, pz);
    drawSky(dt, h, t);

    lampK = damp(lampK, dl < 0.5 ? 1 : 0, 3, dt);
    lanternLight.intensity = lampK * 10;
    lanternMat.emissiveIntensity = lampK * 2.8;
    winMat.emissiveIntensity = lampK * 3.0;
    trainWin.emissiveIntensity = lampK * 2.3;
    waterMat.color.set(mix3('#2f4390', '#6fc3ea', '#f0a58c', dl, wm * 0.25)); waterMat.emissive.copy(waterMat.color);
    water.position.y = 0.04 + Math.sin(t * 1.3) * 0.006;

    // 烟
    smoke.forEach((s) => {
      const k = (t * 0.16 + s.userData.ph) % 1;
      s.position.set(1.9 + k * 1.6 + Math.sin(t + s.userData.ph * 9) * 0.15, 6.4 + k * 3.2, -3.6);
      const sc = 0.7 + k * 1.6; s.scale.set(sc, sc, 1);
      s.material.opacity = fireLevel * Math.sin(k * Math.PI) * 0.5;
    });

    // 铁路跟着人平移；火车每隔一阵开过去
    railGroup.position.x = Math.round(px / 1.2) * 1.2;
    const tr = trainState;
    if (!tr.on) {
      if ((tr.wait -= dt) < 0) { tr.on = true; tr.dir = Math.random() < 0.5 ? 1 : -1; tr.x = px - tr.dir * 62; tr.whistled = false; train.visible = true; }
    } else {
      tr.x += tr.dir * 8.5 * dt;
      train.position.set(tr.x, 0.1, RAIL_Z);
      train.rotation.y = tr.dir > 0 ? 0 : Math.PI;
      if (Math.abs(tr.x - px) > 70) { tr.on = false; tr.wait = rand(45, 100); train.visible = false; }
      if ((puffT -= dt) < 0) {
        puffT = 0.28;
        const p = puffs.find((s) => s.userData.life <= 0);
        if (p) { p.userData.life = 1; p.position.set(tr.x + tr.dir * 0.9, 2.9, RAIL_Z); }
      }
    }
    let whistle = false;
    if (tr.on && !tr.whistled && Math.abs(tr.x - px) < 22) { tr.whistled = true; whistle = true; }
    for (const p of puffs) {
      if (p.userData.life <= 0) { p.material.opacity = 0; continue; }
      p.userData.life -= dt * 0.45;
      p.position.y += dt * 1.3;
      const sc = 0.8 + (1 - p.userData.life) * 2.2; p.scale.set(sc, sc, 1);
      p.material.opacity = Math.max(0, p.userData.life) * (0.35 + 0.4 * dl);
    }

    // 花粉 / 萤火虫：在人周围的一个盒子里循环
    const nt = 1 - dl;
    fMat.color.set(mix3('#eaff8a', '#fff8e0', '#ffe0b0', dl, wm * 0.5));
    fMat.size = lerp(0.2, 0.09, dl);
    fMat.opacity = lerp(0.9, 0.35, dl) * (0.75 + 0.25 * Math.sin(t * 2));
    for (let i = 0; i < FN; i++) {
      const s = fSeed[i];
      const wx = ((s.x + Math.sin(t * 0.3 * s.sp + s.ph) * 1.5 - px) % 34 + 34) % 34 - 17 + px;
      const wz = ((s.z + Math.cos(t * 0.25 * s.sp + s.ph) * 1.5 - pz) % 26 + 26) % 26 - 19 + pz;
      fPos[i * 3] = wx; fPos[i * 3 + 1] = s.y + Math.sin(t * s.sp + s.ph) * 0.4 + nt * 0.2; fPos[i * 3 + 2] = wz;
    }
    fGeo.attributes.position.needsUpdate = true;
    return { whistle };
  }

  const anchors = {
    home: new THREE.Vector3(0, 3.1, 0.4),
    bench: new THREE.Vector3(11, 1.7, -1.1),
  };

  return { group: g, hits, nav, anchors, skyTex, update };
}
