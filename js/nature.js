// 让屋外“活”起来的东西：风（草木跟着摆）、会动的水面、还有小动物（鸟、蝴蝶、兔子、鸭子、锦鲤）。
import * as THREE from 'three';
import { bend } from './bend.js';
import { rand, lerp, mat } from './util.js';

// ───────────────────────── 风 ─────────────────────────
// time = 当前时间，gust = 这会儿风有多大（0.2 ~ 1.3，慢慢起伏）。所有会摆的材质共用这两个数。
export const wind = { time: { value: 0 }, gust: { value: 1 } };
const FLAT = { value: new THREE.Vector2(0, 18) };

// 加在“实例矩阵之后、相机矩阵之前”：这时 mvPosition 就是世界坐标。
// 越高的地方摆得越厉害；相位按所在位置算，所以风是一阵一阵从草地上扫过去的。
const WIND_GLSL = `
  {
    vec3 wo = vec3(0.0);
    #ifdef USE_INSTANCING
      wo = instanceMatrix[3].xyz;
    #endif
    float wph = wo.x * 0.21 + wo.z * 0.13;
    float ww = (0.55 + 0.45 * sin(wph - uWindT * 1.15)) * uGust + 0.22 * sin(uWindT * 2.7 + wph * 3.1);
    float wk = pow(min(max(mvPosition.y, 0.0) / uSway.y, 2.5), 1.6) * uSway.x;
    mvPosition.x += ww * wk;
    mvPosition.z += ww * wk * 0.35 + sin(uWindT * 1.9 + wph * 2.0) * wk * 0.25;
    mvPosition.xyz += uSway.z * uGust * vec3(
      sin(uWindT * 6.1 + position.y * 5.0 + wph * 7.0),
      sin(uWindT * 5.3 + position.x * 6.0 + wph * 5.0),
      sin(uWindT * 4.7 + position.z * 5.0 + wph * 3.0));
  }
`;

// 让一个实例化网格跟着风摆。amp = 在 ref 这个高度上摆多少米，flutter = 叶子自己抖多少。
// 影子用的深度材质也一起摆，不然树在动影子不动。
export function windy(mesh, amp, ref, flutter = 0) {
  const sway = { value: new THREE.Vector3(amp, ref, flutter) };
  const patch = (flat) => (shader) => {
    shader.uniforms.uBend = flat ? FLAT : bend;
    shader.uniforms.uWindT = wind.time; shader.uniforms.uGust = wind.gust; shader.uniforms.uSway = sway;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindT; uniform float uGust; uniform vec3 uSway;')
      .replace('#include <project_vertex>', THREE.ShaderChunk.project_vertex.replace(
        'mvPosition = modelViewMatrix * mvPosition;', `${WIND_GLSL}mvPosition = modelViewMatrix * mvPosition;`));
  };
  mesh.material.onBeforeCompile = patch(false);
  mesh.material.customProgramCacheKey = () => 'wind';
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  dm.onBeforeCompile = patch(true); dm.customProgramCacheKey = () => 'wind';
  mesh.customDepthMaterial = dm;
  return mesh;
}

// 草地：风扫过的地方颜色亮一点，和草摆动的那道波是同一道
export function gustTint(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = bend;
    shader.uniforms.uWindT = wind.time; shader.uniforms.uGust = wind.gust;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWxz;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWxz; uniform float uWindT; uniform float uGust;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gw = sin(vWxz.x * 0.21 + vWxz.y * 0.13 - uWindT * 1.15) + 0.35 * sin(vWxz.x * 0.9 - vWxz.y * 0.6 - uWindT * 2.1);
        diffuseColor.rgb *= 1.0 + 0.085 * smoothstep(0.1, 1.2, gw) * uGust;`);
  };
  material.customProgramCacheKey = () => 'gust';
}

// 一丛草：几片细长的叶子，根深梢浅。法线全朝上，这样和地面的明暗一致。
export function grassClumpGeo(blades = 6, seed = 7) {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pos = [], colr = [], nor = [];
  const v = (p, c) => { pos.push(p[0], p[1], p[2]); colr.push(0.2 * c, 0.5 * c, 0.13 * c); nor.push(0, 1, 0); };
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, ox = (r() - 0.5) * 0.3, oz = (r() - 0.5) * 0.3;
    const h = 0.3 + r() * 0.3, w = 0.035 + r() * 0.02, lean = 0.08 + r() * 0.14;
    const cx = Math.cos(a), cz = Math.sin(a), lx = -cz, lz = cx; // (cx,cz) 是叶片的宽度方向，(lx,lz) 是它倒的方向
    const P = (side, y, k, wk) => [ox + cx * side * w * wk + lx * lean * k, y, oz + cz * side * w * wk + lz * lean * k];
    const bl = P(-1, 0, 0, 1), br = P(1, 0, 0, 1), ml = P(-1, h * 0.55, 0.35, 0.75), mr = P(1, h * 0.55, 0.35, 0.75), tip = P(0, h, 1, 0);
    const tris = [[bl, 0.72], [br, 0.72], [mr, 1], [bl, 0.72], [mr, 1], [ml, 1], [ml, 1], [mr, 1], [tip, 1.3]];
    for (let i = 0; i < 9; i += 3) {
      v(...tris[i]); v(...tris[i + 1]); v(...tris[i + 2]);
      v(...tris[i]); v(...tris[i + 2]); v(...tris[i + 1]); // 反面再来一遍
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  return g;
}

// ───────────────────────── 水 ─────────────────────────
// 池塘水面：中间深、岸边浅；水底的光纹在晃；风吹出一道道细浪；岸边有一圈白沫；
// 鸭子游过、鱼冒头的地方会荡开一圈圈涟漪。
export function makeWater(POND) {
  const RIPS = 6;
  const u = {
    uWindT: wind.time, uGust: wind.gust, uDay: { value: 1 },
    uPond: { value: new THREE.Vector2(POND.rx, POND.rz) },
    uRip: { value: Array.from({ length: RIPS }, () => new THREE.Vector4(0, 0, -99, 0)) },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#6fc3ea', roughness: 0.16, metalness: 0.05, transparent: true, opacity: 0.86 });
  material.defines = { USE_UV: '' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = bend;
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWindT; uniform float uGust; uniform float uDay; uniform vec2 uPond; uniform vec4 uRip[${RIPS}];
        float wCaustic(vec2 p, float t) {
          vec2 i = p; float c = 1.0;
          for (int n = 0; n < 3; n++) {
            float tt = t * (1.0 - (3.5 / float(n + 1)));
            i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
            c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
          }
          c = 1.17 - pow(c / 3.0, 1.4);
          return clamp(pow(abs(c), 8.0), 0.0, 1.0);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 wq = vUv * 2.0 - 1.0; float wr = length(wq);
        vec2 wp = wq * uPond;
        float wang = atan(wq.y, wq.x);
        vec3 wc = diffuseColor.rgb * mix(1.28, 0.7, smoothstep(1.0, 0.2, wr));
        float wca = wCaustic(wp * 1.7 - 250.0, uWindT * 0.55);
        wc += wca * 0.2 * (0.25 + 0.75 * uDay);
        float wl = sin(wp.x * 5.0 - uWindT * 1.7 + sin(wp.y * 3.0 + uWindT * 0.7) * 1.5 + sin(wp.x * 1.3 - uWindT * 0.4));
        float wline = smoothstep(0.9, 1.0, wl) * (0.05 + 0.08 * uGust);
        wc += wline;
        float wrp = 0.0;
        for (int i = 0; i < ${RIPS}; i++) {
          float age = uWindT - uRip[i].z;
          if (age > 0.0 && age < 3.2) {
            float d = length(wp - uRip[i].xy) - age * 0.5;
            wrp += smoothstep(0.55, 1.0, sin(d * 24.0)) * smoothstep(0.3, 0.0, abs(d + 0.12) - 0.1) * (1.0 - age / 3.2) * uRip[i].w;
          }
        }
        wc += wrp * 0.4;
        float wfoam = 1.0 - smoothstep(0.0, 0.06 + 0.025 * sin(wang * 9.0 + uWindT * 1.3) + 0.015 * sin(wang * 23.0 - uWindT * 2.1), 1.0 - wr);
        wc = mix(wc, vec3(1.0), wfoam * 0.8);
        diffuseColor.rgb = wc;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + (0.1 + 0.08 * uGust) * vec3(
          sin(wp.x * 6.0 + uWindT * 2.0) + sin(wp.y * 9.0 - uWindT * 1.4),
          cos(wp.y * 7.0 - uWindT * 1.7) + cos(wp.x * 11.0 + uWindT * 1.1), 0.0) + vec3(wrp * 0.5, wrp * 0.5, 0.0));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = wc * 0.3 + vec3(wca * 0.3 * uDay + wline * 0.6 + wrp * 0.15);`);
  };
  material.customProgramCacheKey = () => 'water';
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), material);
  mesh.rotation.x = -Math.PI / 2; mesh.scale.set(POND.rx, POND.rz, 1);
  let next = 0;
  // 在世界坐标 (x, z) 处荡开一圈涟漪
  const ripple = (x, z, strength = 1) => {
    u.uRip.value[next].set(x - POND.x, -(z - POND.z), wind.time.value, strength);
    next = (next + 1) % RIPS;
  };
  return { mesh, material, day: u.uDay, ripple };
}

// ───────────────────────── 小动物 ─────────────────────────
const SPH = new THREE.SphereGeometry(1, 12, 9), CONE = new THREE.ConeGeometry(1, 1, 8);
function blob(parent, color, x, y, z, sx, sy = sx, sz = sx, geo = SPH) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.frustumCulled = false;
  parent.add(m); return m;
}
const turn = (obj, yaw, k) => { const d = yaw - obj.rotation.y; obj.rotation.y += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, k); };

// 所有动物都面朝 +z
function makeBird(col, belly) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  blob(body, col, 0, 0.13, 0, 0.1, 0.095, 0.14);
  blob(body, belly, 0, 0.115, 0.035, 0.085, 0.075, 0.11);
  blob(body, col, 0, 0.23, 0.1, 0.075);
  blob(body, '#f3a54a', 0, 0.22, 0.19, 0.025, 0.06, 0.025, CONE).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) blob(body, '#2a2230', s * 0.048, 0.25, 0.15, 0.014);
  blob(body, col, 0, 0.15, -0.17, 0.045, 0.015, 0.09).rotation.x = -0.4;
  const wings = [-1, 1].map((s) => {
    const p = new THREE.Group(); p.position.set(s * 0.08, 0.17, 0); body.add(p);
    blob(p, col, s * 0.1, 0, -0.01, 0.1, 0.012, 0.075);
    return p;
  });
  g.userData = { body, wings };
  return g;
}
const flap = (bird, a) => { bird.userData.wings[0].rotation.z = -a; bird.userData.wings[1].rotation.z = a; };

function makeButterfly(col) {
  const g = new THREE.Group();
  const wm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.18, side: THREE.DoubleSide, roughness: 0.8 });
  blob(g, '#4a3b46', 0, 0, 0, 0.012, 0.012, 0.06).castShadow = false;
  const wings = [-1, 1].map((s) => {
    const p = new THREE.Group(); g.add(p);
    for (const [r, x, z] of [[0.085, 0.08, 0.03], [0.06, 0.06, -0.06]]) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(r, 10), wm);
      w.rotation.x = -Math.PI / 2; w.position.set(s * x, 0, z); w.scale.y = 1.2; w.frustumCulled = false; p.add(w);
    }
    return p;
  });
  g.userData = { wings };
  return g;
}

function makeRabbit(col) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  blob(body, col, 0, 0.2, 0, 0.17, 0.16, 0.23);
  blob(body, col, 0, 0.36, 0.2, 0.125);
  blob(body, '#ffffff', 0, 0.2, -0.23, 0.06);
  blob(body, '#f2a9a0', 0, 0.35, 0.325, 0.02);
  const ears = [-1, 1].map((s) => {
    blob(body, '#2a2230', s * 0.078, 0.39, 0.295, 0.02);
    blob(body, col, s * 0.09, 0.05, 0.12, 0.045, 0.04, 0.08);
    const p = new THREE.Group(); p.position.set(s * 0.055, 0.45, 0.17); body.add(p);
    blob(p, col, 0, 0.13, 0, 0.035, 0.14, 0.025);
    blob(p, '#f6b8c8', 0, 0.13, 0.014, 0.02, 0.1, 0.015).castShadow = false;
    return p;
  });
  g.userData = { body, ears };
  return g;
}

function makeDuck(col) {
  const g = new THREE.Group();
  blob(g, col, 0, 0.1, 0, 0.15, 0.11, 0.2);
  blob(g, col, 0, 0.16, -0.19, 0.06, 0.05, 0.07);
  for (const s of [-1, 1]) blob(g, col, s * 0.13, 0.12, -0.02, 0.03, 0.07, 0.13);
  const head = new THREE.Group(); head.position.set(0, 0.16, 0.12); g.add(head);
  blob(head, col, 0, 0.06, 0.02, 0.05, 0.08, 0.05);
  blob(head, col, 0, 0.15, 0.04, 0.085);
  blob(head, '#f3a54a', 0, 0.135, 0.14, 0.045, 0.018, 0.05);
  for (const s of [-1, 1]) blob(head, '#2a2230', s * 0.055, 0.17, 0.1, 0.014);
  g.userData = { head };
  return g;
}

const FISH_BODY = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), FISH_TAIL = new THREE.CircleGeometry(1, 3).rotateX(-Math.PI / 2);
function makeFish(col, spot) {
  const g = new THREE.Group();
  const flat = (geo, c, parent, x, y, z, sx, sz) => {
    const m = new THREE.Mesh(geo, mat(c, { roughness: 0.5 })); m.position.set(x, y, z); m.scale.set(sx, 1, sz); m.frustumCulled = false; parent.add(m); return m;
  };
  flat(FISH_BODY, col, g, 0, 0, 0, 0.07, 0.2);
  flat(FISH_BODY, spot, g, 0.01, 0.002, 0.05, 0.045, 0.07);
  flat(FISH_BODY, spot, g, -0.015, 0.002, -0.09, 0.035, 0.05);
  const tail = new THREE.Group(); tail.position.set(0, 0, -0.17); g.add(tail);
  flat(FISH_TAIL, col, tail, 0, 0, -0.07, 0.09, 0.09).rotation.y = -Math.PI / 2;
  g.userData = { tail };
  return g;
}

export function buildCritters(parent, { walkable, nearest, POND, ripple }) {
  // 在主人周围找一块能落脚的地方（偏向镜头看得到的前方）
  const spot = (px, pz, rmin, rmax) => {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), r = rand(rmin, rmax), x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r * 0.7 - 3;
      if (walkable(x, z)) return { x, z };
    }
    return nearest(px + rmin, pz - 3);
  };

  // ── 小鸟：在地上蹦蹦跳跳、啄东西，人一靠近就扑棱棱飞走 ──
  const birds = [['#b08a6a', '#f1e3cf', 3, 6.5], ['#7fa9d6', '#f6e7cd', -4, 8], ['#8a7a70', '#e98a6a', 6.5, 9.5], ['#b08a6a', '#f1e3cf', -8, 2]].map(([c, b, x, z], i) => {
    const m = makeBird(c, b); parent.add(m);
    const p = nearest(x, z);
    return { m, st: 'ground', x: p.x, z: p.z, y: 0, yaw: i * 2, timer: rand(6, 18), act: rand(0, 1), hop: -1, peck: -1, fx: 0, fz: 0, tx: 0, tz: 0, k: 0, dur: 1, h: 2 };
  });
  const takeOff = (b, px, pz) => {
    const to = spot(px, pz, 6, 12);
    b.st = 'fly'; b.fx = b.x; b.fz = b.z; b.tx = to.x; b.tz = to.z; b.k = 0;
    const d = Math.hypot(to.x - b.x, to.z - b.z);
    b.dur = Math.max(1.2, d / 5.5); b.h = 1.6 + d * 0.14; b.hop = b.peck = -1;
    b.yaw = Math.atan2(to.x - b.x, to.z - b.z);
  };

  // ── 远处飞过的一小队鸟 ──
  const flock = new THREE.Group(); flock.visible = false; parent.add(flock);
  const flockBirds = [[0, 0], [-0.9, -0.8], [-0.9, 0.8], [-1.8, -1.6], [-1.8, 1.6]].map(([bx, bz]) => {
    const m = makeBird('#5d6a80', '#8894a8'); m.position.set(bz, rand(-0.2, 0.2), bx); m.scale.setScalar(1.5); flock.add(m); return m;
  });
  const fl = { on: false, wait: 8, dir: 1, x: 0, z: 0 };

  // ── 蝴蝶 ──
  const flies = ['#f6cf6b', '#ffffff', '#f2a9a0', '#a9c9ee', '#d6b4e8', '#f6cf6b', '#ffb37a'].map((c) => {
    const m = makeButterfly(c); parent.add(m);
    return { m, x: rand(0, 28), z: rand(0, 20), y: rand(0.5, 1.1), ph: rand(0, 9), sp: rand(0.6, 1.1), lx: 0, lz: 0 };
  });

  // ── 兔子：自己蹦跶、吃草，人走近了就跑开 ──
  const rabbits = [['#f4efe8', -9, 5], ['#c9a98a', 8.5, 10], ['#a9a4a0', -12, -3]].map(([c, x, z]) => {
    const m = makeRabbit(c); parent.add(m);
    const p = nearest(x, z);
    return { m, x: p.x, z: p.z, yaw: rand(0, 6), timer: rand(1, 4), hops: 0, hk: -1, pause: 0, fx: 0, fz: 0, tx: 0, tz: 0, dur: 0.3, h: 0.16, ph: rand(0, 9) };
  });
  const startHop = (r, a, len, dur, h) => {
    for (const da of [0, 0.9, -0.9, 1.8, -1.8, Math.PI]) {
      const tx = r.x + Math.sin(a + da) * len, tz = r.z + Math.cos(a + da) * len;
      if (walkable(tx, tz)) { r.fx = r.x; r.fz = r.z; r.tx = tx; r.tz = tz; r.hk = 0; r.dur = dur; r.h = h; r.yaw = a + da; return; }
    }
    r.hops = 0;
  };

  // ── 池塘里：鸭子和锦鲤 ──
  const inPond = (rmax) => { const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * rmax; return { x: POND.x + Math.cos(a) * r * POND.rx, z: POND.z + Math.sin(a) * r * POND.rz }; };
  const ducks = [['#ffffff', 0.4, 0.3], ['#f6e08a', -0.6, -0.4]].map(([c, ox, oz], i) => {
    const m = makeDuck(c); if (i) m.scale.setScalar(0.72); parent.add(m);
    return { m, x: POND.x + ox, z: POND.z + oz, yaw: i * 2.5, to: inPond(0.7), pause: i * 2, rip: 0, dip: -1, ph: i * 2.3 };
  });
  const fish = [['#f08a4b', '#ffffff', 0.5, 0.3], ['#ffffff', '#f08a4b', 0.36, -0.36], ['#f6cf6b', '#f08a4b', 0.66, 0.24]].map(([c, s, r, sp], i) => {
    const m = makeFish(c, s); parent.add(m);
    return { m, a: i * 2.1, r, sp, ph: i * 1.7, lx: 0, lz: 0, jump: rand(5, 14) };
  });

  let chirpT = 6, dropT = 3;

  function update(dt, t, dl, px, pz) {
    const ev = { tweet: false, plop: false };
    const day = dl > 0.18;

    // 小鸟
    for (const b of birds) {
      b.m.visible = day;
      if (!day) continue;
      const dist = Math.hypot(px - b.x, pz - b.z), body = b.m.userData.body;
      if (dist > 28) { const p = spot(px, pz, 8, 13); b.x = p.x; b.z = p.z; b.st = 'ground'; b.y = 0; }
      if (b.st === 'ground') {
        b.timer -= dt;
        if (dist < 2.8) { takeOff(b, px, pz); ev.tweet = true; }
        else if (b.timer < 0) takeOff(b, px, pz);
        else if (b.hop >= 0) {
          b.hop += dt / 0.2; const k = Math.min(1, b.hop);
          b.x = lerp(b.fx, b.tx, k); b.z = lerp(b.fz, b.tz, k); b.y = Math.sin(k * Math.PI) * 0.07;
          if (b.hop >= 1) b.hop = -1;
        } else if (b.peck >= 0) {
          b.peck += dt / 0.45; body.rotation.x = Math.sin(Math.min(1, b.peck) * Math.PI) * 0.95;
          if (b.peck >= 1) { b.peck = -1; body.rotation.x = 0; }
        } else if ((b.act -= dt) < 0) {
          b.act = rand(0.25, 1.3);
          if (Math.random() < 0.55) {
            b.yaw += rand(-1.2, 1.2);
            const tx = b.x + Math.sin(b.yaw) * 0.24, tz = b.z + Math.cos(b.yaw) * 0.24;
            if (walkable(tx, tz)) { b.fx = b.x; b.fz = b.z; b.tx = tx; b.tz = tz; b.hop = 0; }
          } else b.peck = 0;
        }
        flap(b.m, -1.25);
      } else {
        b.k += dt / b.dur; const k = Math.min(1, b.k), e = k * k * (3 - 2 * k);
        b.x = lerp(b.fx, b.tx, e); b.z = lerp(b.fz, b.tz, e); b.y = Math.sin(k * Math.PI) * b.h;
        body.rotation.x = -0.25 + k * 0.3;
        flap(b.m, Math.sin(t * 30) * 0.95);
        if (b.k >= 1) { b.st = 'ground'; b.y = 0; b.timer = rand(8, 22); b.act = 0.4; body.rotation.x = 0; }
      }
      b.m.position.set(b.x, b.y, b.z);
      turn(b.m, b.yaw, dt * 14);
    }

    // 飞过的鸟群
    if (!fl.on) {
      if ((fl.wait -= dt) < 0 && day) { fl.on = true; fl.dir = Math.random() < 0.5 ? 1 : -1; fl.x = px - fl.dir * 38; fl.z = pz - rand(3, 13); flock.visible = true; flock.rotation.y = fl.dir * Math.PI / 2; }
    } else {
      fl.x += fl.dir * 6.5 * dt;
      flock.position.set(fl.x, 5.6 + Math.sin(t * 0.7) * 0.4, fl.z);
      flockBirds.forEach((m, i) => { flap(m, Math.sin(t * 9 + i * 1.3) * 0.75); m.position.y = Math.sin(t * 2 + i * 2) * 0.15; });
      if (Math.abs(fl.x - px) > 42) { fl.on = false; fl.wait = rand(18, 40); flock.visible = false; }
    }

    // 蝴蝶：在主人周围的一个盒子里循环
    for (const f of flies) {
      f.m.visible = day;
      if (!day) continue;
      const bx = f.x + Math.sin(t * 0.42 * f.sp + f.ph) * 2.4 + Math.sin(t * 1.1 + f.ph * 2) * 0.5 + t * 0.12;
      const bz = f.z + Math.cos(t * 0.35 * f.sp + f.ph * 1.3) * 2.2 + Math.cos(t * 0.9 + f.ph) * 0.5;
      const x = ((bx - px) % 28 + 28) % 28 - 14 + px, z = ((bz - pz) % 20 + 20) % 20 - 14 + pz;
      const y = f.y + Math.sin(t * 1.3 * f.sp + f.ph) * 0.3 + Math.sin(t * 9 + f.ph) * 0.04;
      const dx = x - f.lx, dz = z - f.lz;
      if (Math.abs(dx) + Math.abs(dz) < 1 && Math.abs(dx) + Math.abs(dz) > 1e-5) turn(f.m, Math.atan2(dx, dz), dt * 6);
      f.lx = x; f.lz = z;
      f.m.position.set(x, y, z);
      const a = 0.15 + Math.abs(Math.sin(t * 11 * f.sp + f.ph)) * 1.15;
      f.m.userData.wings[0].rotation.z = -a; f.m.userData.wings[1].rotation.z = a;
    }

    // 兔子
    for (const r of rabbits) {
      const dist = Math.hypot(px - r.x, pz - r.z), { body, ears } = r.m.userData;
      if (dist > 30) { const p = spot(px, pz, 13, 17); r.x = p.x; r.z = p.z; r.hk = -1; r.hops = 0; }
      let y = 0, earX = Math.sin(t * 1.7 + r.ph) * 0.06;
      if (r.hk >= 0) {
        r.hk += dt / r.dur; const k = Math.min(1, r.hk);
        r.x = lerp(r.fx, r.tx, k); r.z = lerp(r.fz, r.tz, k); y = Math.sin(k * Math.PI) * r.h;
        body.rotation.x = -Math.cos(k * Math.PI) * 0.28; earX = -0.5 * Math.sin(k * Math.PI);
        if (r.hk >= 1) { r.hk = -1; body.rotation.x = 0; r.pause = dist < 4.5 ? 0.02 : rand(0.06, 0.22); }
      } else if ((r.pause -= dt) < 0) {
        if (dist < 3.4) startHop(r, Math.atan2(r.x - px, r.z - pz) + rand(-0.5, 0.5), 0.85, 0.24, 0.26);
        else if (r.hops > 0) { r.hops--; startHop(r, r.yaw + rand(-0.45, 0.45), 0.45, 0.3, 0.16); }
        else {
          // 歇着：有时低头吃草，耳朵偶尔抖一下
          const nib = Math.sin(t * 0.6 + r.ph) > 0.3;
          body.rotation.x = nib ? 0.22 + Math.sin(t * 9) * 0.03 : 0;
          if (Math.sin(t * 0.9 + r.ph * 3) > 0.96) earX += Math.sin(t * 30) * 0.15;
          if ((r.timer -= dt) < 0) { r.timer = rand(2, 7); r.hops = 2 + Math.floor(Math.random() * 5); r.yaw = rand(0, Math.PI * 2); }
        }
      }
      ears[0].rotation.x = ears[1].rotation.x = earX; ears[0].rotation.z = 0.12; ears[1].rotation.z = -0.12;
      r.m.position.set(r.x, y, r.z);
      turn(r.m, r.yaw, dt * 12);
    }

    // 鸭子：慢悠悠地游，游过的地方有水纹，偶尔低头喝水
    for (const d of ducks) {
      const head = d.m.userData.head;
      if (d.pause > 0) {
        d.pause -= dt;
        if (d.dip >= 0) { d.dip += dt / 1.1; head.rotation.x = Math.sin(Math.min(1, d.dip) * Math.PI) * 1.1; if (d.dip >= 1) { d.dip = -1; ripple(d.x + Math.sin(d.yaw) * 0.25, d.z + Math.cos(d.yaw) * 0.25, 0.7); } }
        else if (Math.random() < dt * 0.25) d.dip = 0;
        if (d.pause <= 0) d.to = inPond(0.72);
      } else {
        const dx = d.to.x - d.x, dz = d.to.z - d.z, left = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
        const diff = Math.atan2(Math.sin(want - d.yaw), Math.cos(want - d.yaw));
        d.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 1.3);
        const v = 0.34 * Math.max(0, 1 - Math.abs(diff) / 1.2);
        d.x += Math.sin(d.yaw) * v * dt; d.z += Math.cos(d.yaw) * v * dt;
        if ((d.rip -= dt) < 0 && v > 0.1) { d.rip = 0.85; ripple(d.x - Math.sin(d.yaw) * 0.15, d.z - Math.cos(d.yaw) * 0.15, 0.55); }
        if (left < 0.25) { d.pause = rand(2, 7); head.rotation.x = 0; }
      }
      d.m.position.set(d.x, 0.035 + Math.sin(t * 2.1 + d.ph) * 0.012, d.z);
      d.m.rotation.set(Math.sin(t * 1.7 + d.ph) * 0.04, d.yaw, Math.sin(t * 2.3 + d.ph) * 0.05);
    }

    // 锦鲤：在水面下绕圈，尾巴一摆一摆；偶尔冒个头，荡开一圈涟漪
    for (const f of fish) {
      f.a += dt * f.sp;
      const rr = f.r + Math.sin(t * 0.4 + f.ph) * 0.13;
      const x = POND.x + Math.cos(f.a) * rr * POND.rx, z = POND.z + Math.sin(f.a) * rr * POND.rz;
      const dx = x - f.lx, dz = z - f.lz; f.lx = x; f.lz = z;
      f.m.position.set(x, 0.036, z);
      if (Math.abs(dx) + Math.abs(dz) > 1e-6) f.m.rotation.y = Math.atan2(dx, dz) + Math.sin(t * 7 + f.ph + 1) * 0.13;
      f.m.userData.tail.rotation.y = Math.sin(t * 7 + f.ph) * 0.65;
      if ((f.jump -= dt) < 0) { f.jump = rand(9, 24); ripple(x, z, 1); if (Math.hypot(px - x, pz - z) < 9) ev.plop = true; }
    }

    // 水面上偶尔自己冒一圈小涟漪（小虫点水）
    if ((dropT -= dt) < 0) { dropT = rand(2.5, 6); const p = inPond(0.8); ripple(p.x, p.z, 0.5); }
    // 白天时不时有鸟叫
    if (day && (chirpT -= dt) < 0) { chirpT = rand(5, 13); ev.tweet = true; }
    return ev;
  }

  return { update };
}
