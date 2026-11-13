// 窗外的风景：一张实时重绘的画布。白天山水 + 山间的云 + 小火车，夜里星空 + 月亮。
import * as THREE from 'three';
import { SEASON } from './config.js';
import { daylight, warmth } from './time.js';
import { rng, rand } from './util.js';

const W = 1024, H = 512;

// 配色表。以后做四季：在这里加 spring / summer / autumn / winter，再改 config.js 的 SEASON。
const PALETTES = {
  default: {
    skyTop: ['#0c1236', '#6fc1ef', '#5a5fa8'], // [夜, 昼, 霞]
    skyBot: ['#2b3468', '#e2f4ff', '#ffb48a'],
    ridges: [['#28345f', '#aecbe2'], ['#222d57', '#8ab6c9'], ['#1a2549', '#62a09f'], ['#131c3a', '#4a8a72']],
    lake: ['#1c2752', '#9fd3e6'],
    tree: ['#0f1730', '#3c7560'],
  },
};
const P = PALETTES[SEASON] || PALETTES.default;

const A = new THREE.Color(), B = new THREE.Color(), Cc = new THREE.Color();
const mix2 = (a, b, t) => A.set(a).lerp(B.set(b), t).getStyle();
const mix3 = (n, d, w, dl, wk) => A.set(n).lerp(B.set(d), dl).lerp(Cc.set(w), wk).getStyle();

export class Scenery {
  constructor() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    this.g = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.acc = 1;
    const r = rng(20240914);

    this.stars = [];
    for (let i = 0; i < 130; i++) this.stars.push({ x: r() * W, y: r() * H * 0.62, s: 0.6 + r() * 1.5, sp: 0.6 + r() * 2.2, ph: r() * 7, a: 0.5 + r() * 0.5 });

    // 四层山脊，越近越低越深
    const bases = [0.5, 0.585, 0.68, 0.8], amps = [100, 78, 62, 46];
    this.ridges = bases.map((b, i) => {
      const f1 = 0.0042 + i * 0.0016, f2 = 0.011 + i * 0.004, f3 = 0.031 + i * 0.006;
      const p1 = r() * 7, p2 = r() * 7, p3 = r() * 7, ys = [];
      for (let k = 0; k <= 128; k++) {
        const x = k * 8;
        let v1 = 1 - Math.abs(Math.sin(x * f1 + p1)); v1 *= v1;
        const v2 = 0.5 + 0.5 * Math.sin(x * f2 + p2), v3 = 0.5 + 0.5 * Math.sin(x * f3 + p3);
        ys.push(b * H - amps[i] * (0.6 * v1 + 0.28 * v2 + 0.12 * v3));
      }
      return { ys, base: b * H };
    });
    // 近山上的小树
    this.trees = [];
    for (let x = 6; x < W; x += 10 + r() * 22) this.trees.push({ x, s: 7 + r() * 9 });

    // 云
    this.cloud = document.createElement('canvas');
    this.cloud.width = 256; this.cloud.height = 128;
    const cg = this.cloud.getContext('2d');
    for (const [x, y, rad] of [[70, 82, 44], [118, 62, 56], [172, 80, 46], [98, 92, 46], [150, 94, 44], [200, 96, 28], [44, 98, 26]]) {
      const gr = cg.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = gr; cg.fillRect(0, 0, 256, 128);
    }
    this.clouds = [];
    const spec = [[-1, 0.12, 0.9], [-1, 0.24, 0.6], [0, 0.4, 1.0], [0, 0.46, 0.7], [1, 0.5, 1.1], [1, 0.55, 0.75], [2, 0.6, 1.2], [2, 0.66, 0.8], [2, 0.63, 0.6]];
    for (const [layer, y, s] of spec) this.clouds.push({ layer, y: y * H, s, x: r() * W, v: (3 + r() * 6) * (layer < 0 ? 0.6 : 1), a: layer < 0 ? 0.75 : 0.9 });

    this.train = { on: false, x: 0, dir: 1, wait: 7, puffs: [], puffT: 0 };
    this.shoot = { t: 0, wait: 25, x: 0, y: 0 };
  }

  update(dt, hour, t) {
    this.acc += dt;
    if (this.acc < 1 / 24) return;
    const step = this.acc; this.acc = 0;
    this.draw(step, hour, t);
    this.tex.needsUpdate = true;
  }

  fillRidge(i, color) {
    const g = this.g, ys = this.ridges[i].ys;
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, H);
    for (let k = 0; k <= 128; k++) g.lineTo(k * 8, ys[k]);
    g.lineTo(W, H); g.fill();
  }

  ridgeY(i, x) {
    const ys = this.ridges[i].ys, k = Math.max(0, Math.min(127, Math.floor(x / 8))), f = x / 8 - k;
    return ys[k] + (ys[k + 1] - ys[k]) * Math.max(0, Math.min(1, f));
  }

  draw(dt, h, t) {
    const g = this.g, dl = daylight(h), wm = warmth(h), nt = 1 - dl;

    // 天空
    const sky = g.createLinearGradient(0, 0, 0, H * 0.8);
    sky.addColorStop(0, mix3(...P.skyTop, dl, wm * 0.55));
    sky.addColorStop(1, mix3(...P.skyBot, dl, wm * 0.9));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    // 星星
    if (nt > 0.05) {
      g.fillStyle = '#fff';
      for (const s of this.stars) {
        g.globalAlpha = nt * s.a * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
        g.beginPath(); g.arc(s.x, s.y, s.s, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
      // 偶尔一颗流星
      const sh = this.shoot;
      if (sh.t > 0) {
        sh.t -= dt;
        const k = 1 - sh.t / 0.9, x = sh.x + k * 190, y = sh.y + k * 70;
        const gr = g.createLinearGradient(x - 70, y - 26, x, y);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(255,255,255,${nt * Math.sin(k * Math.PI)})`);
        g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 70, y - 26); g.lineTo(x, y); g.stroke();
      } else if ((sh.wait -= dt) < 0 && nt > 0.8) {
        sh.wait = rand(25, 70); sh.t = 0.9; sh.x = rand(120, 700); sh.y = rand(30, 150);
      }
    }

    // 太阳 / 月亮
    let sunX = -1, moonX = -1;
    if (h > 5.3 && h < 18.9) {
      const k = (h - 5.3) / 13.6, x = W * (0.1 + 0.8 * k), y = H * (0.6 - 0.48 * Math.sin(k * Math.PI));
      sunX = x;
      const gr = g.createRadialGradient(x, y, 0, x, y, 120);
      gr.addColorStop(0, `rgba(255,244,200,${0.75})`); gr.addColorStop(0.2, `rgba(255,226,160,${0.35 + wm * 0.3})`); gr.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = gr; g.fillRect(x - 120, y - 120, 240, 240);
      g.fillStyle = mix2('#fffbe0', '#ffd9a0', wm); g.beginPath(); g.arc(x, y, 24, 0, 7); g.fill();
    }
    if (nt > 0.02) {
      const hh = h < 12 ? h + 24 : h, k = (hh - 17.8) / 12.6, x = W * (0.12 + 0.76 * k), y = H * (0.5 - 0.4 * Math.sin(k * Math.PI));
      moonX = x;
      g.globalAlpha = nt;
      const gr = g.createRadialGradient(x, y, 0, x, y, 110);
      gr.addColorStop(0, 'rgba(255,248,220,.55)'); gr.addColorStop(0.25, 'rgba(210,220,255,.18)'); gr.addColorStop(1, 'rgba(200,210,255,0)');
      g.fillStyle = gr; g.fillRect(x - 110, y - 110, 220, 220);
      g.fillStyle = '#fff7dc'; g.beginPath(); g.arc(x, y, 23, 0, 7); g.fill();
      g.fillStyle = 'rgba(214,200,160,.55)';
      for (const [ox, oy, r] of [[-7, -5, 5], [8, 4, 4], [-2, 10, 3], [9, -9, 2.5]]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }

    this.drawClouds(-1, dt, dl);

    // 山、雾、云、火车，从远到近
    for (let i = 0; i < 4; i++) {
      const col = mix3(P.ridges[i][0], P.ridges[i][1], '#f0a58c', dl, wm * (0.34 - i * 0.07));
      this.fillRidge(i, col);
      if (i === 3) this.drawTrees(dl);
      // 山脚的雾
      const base = this.ridges[i].base, mist = g.createLinearGradient(0, base - 46, 0, base + 26);
      mist.addColorStop(0, 'rgba(255,255,255,0)'); mist.addColorStop(1, `rgba(${dl > 0.5 ? '255,255,255' : '170,185,235'},${0.1 + 0.34 * dl - i * 0.04})`);
      g.fillStyle = mist; g.fillRect(0, base - 46, W, 72);
      if (i === 1) this.drawTrain(dt, dl);
      if (i < 3) this.drawClouds(i, dt, dl);
    }

    // 湖
    const ly = H * 0.885, lake = g.createLinearGradient(0, ly, 0, H);
    lake.addColorStop(0, mix3(P.lake[0], P.lake[1], '#ffc7a0', dl, wm * 0.6));
    lake.addColorStop(1, mix3('#111a3e', '#6fb6d2', '#e79f8a', dl, wm * 0.4));
    g.fillStyle = lake; g.fillRect(0, ly, W, H - ly);
    const rx = sunX > 0 && dl > 0.3 ? sunX : moonX;
    if (rx > 0) {
      g.fillStyle = dl > 0.3 ? 'rgba(255,240,190,.5)' : `rgba(240,240,255,${0.35 * nt})`;
      for (let k = 0; k < 6; k++) {
        const w = 26 + k * 9 + Math.sin(t * 1.4 + k) * 8;
        g.fillRect(rx - w / 2 + Math.sin(t + k * 2) * 4, ly + 5 + k * 9, w, 2.5);
      }
    }
    g.fillStyle = `rgba(255,255,255,${0.1 + 0.25 * dl})`;
    for (let k = 0; k < 16; k++) {
      const x = (k * 137 + t * (6 + (k % 4) * 3)) % (W + 80) - 40, y = ly + 6 + ((k * 53) % 48);
      g.fillRect(x, y, 22 + (k % 5) * 8, 1.6);
    }
  }

  drawTrees(dl) {
    const g = this.g;
    g.fillStyle = mix2(P.tree[0], P.tree[1], dl);
    for (const tr of this.trees) {
      const y = this.ridgeY(3, tr.x) + 3;
      g.beginPath(); g.moveTo(tr.x - tr.s * 0.42, y); g.lineTo(tr.x, y - tr.s * 1.5); g.lineTo(tr.x + tr.s * 0.42, y); g.fill();
    }
  }

  drawClouds(layer, dt, dl) {
    const g = this.g;
    for (const c of this.clouds) {
      if (c.layer !== layer) continue;
      c.x += c.v * dt;
      const w = 256 * c.s;
      if (c.x > W + 20) c.x = -w - rand(0, 120);
      g.globalAlpha = c.a * (0.2 + 0.8 * dl);
      g.drawImage(this.cloud, c.x, c.y - 64 * c.s, w, 128 * c.s);
    }
    g.globalAlpha = 1;
  }

  // 一列手指头大小的小火车，贴着第二层山的山腰开过去，会被近处的山挡住一截
  drawTrain(dt, dl) {
    const g = this.g, tr = this.train, y = H * 0.607;
    // 高架桥
    g.strokeStyle = mix2('#2a3562', '#7fa3b4', dl); g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    g.lineWidth = 1.5;
    for (let x = 14; x < W; x += 34) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 20); g.stroke();
      g.beginPath(); g.arc(x + 17, y + 9, 15.5, Math.PI, 0); g.stroke();
    }
    if (!tr.on) {
      if ((tr.wait -= dt) < 0) { tr.on = true; tr.dir = Math.random() < 0.5 ? 1 : -1; tr.x = tr.dir > 0 ? -130 : W + 130; }
    } else {
      tr.x += tr.dir * ((W + 260) / 42) * dt;
      if (tr.x < -140 || tr.x > W + 140) { tr.on = false; tr.wait = rand(40, 95); }
    }
    // 烟
    for (const p of tr.puffs) { p.y -= 9 * dt; p.x -= tr.dir * 3 * dt; p.r += 4 * dt; p.a -= dt * 0.38; }
    tr.puffs = tr.puffs.filter((p) => p.a > 0);
    if (tr.on && (tr.puffT -= dt) < 0) { tr.puffT = 0.4; tr.puffs.push({ x: tr.x + tr.dir * 3, y: y - 14, r: 3, a: 0.75 }); }
    for (const p of tr.puffs) {
      g.fillStyle = `rgba(255,255,255,${p.a * (0.35 + 0.65 * dl)})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    if (!tr.on) return;
    const cw = 15, gap = 2.5, cols = ['#e2574c', '#f6e7c8', '#8fbf9a', '#f6cf6b', '#a9c9ee', '#f6e7c8'];
    for (let c = 0; c < 6; c++) {
      const cx = tr.x - tr.dir * c * (cw + gap);
      g.fillStyle = mix2('#3a2f55', cols[c], 0.35 + 0.65 * dl);
      g.beginPath(); g.roundRect(cx - cw / 2, y - 9, cw, 8, 2.5); g.fill();
      if (c === 0) { g.fillRect(cx + tr.dir * 2 - 1.5, y - 13, 3.5, 5); }
      g.fillStyle = dl < 0.5 ? '#ffe28a' : 'rgba(255,255,255,.75)';
      if (c > 0) { g.fillRect(cx - 5, y - 7, 3, 2.6); g.fillRect(cx + 2, y - 7, 3, 2.6); } else g.fillRect(cx - tr.dir * 4 - 1.5, y - 7, 3, 2.6);
      g.fillStyle = '#3a2f40';
      g.fillRect(cx - 5, y - 1.5, 2.5, 1.8); g.fillRect(cx + 2.5, y - 1.5, 2.5, 1.8);
    }
    if (dl < 0.5) {
      const hx = tr.x + tr.dir * 9, gr = g.createRadialGradient(hx, y - 5, 0, hx, y - 5, 26);
      gr.addColorStop(0, 'rgba(255,236,160,.8)'); gr.addColorStop(1, 'rgba(255,236,160,0)');
      g.fillStyle = gr; g.fillRect(hx - 26, y - 31, 52, 52);
    }
  }
}
