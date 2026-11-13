// 网格寻路：把房间切成小格子，家具占的格子不能走，A* 找路后再拉直。
export class Nav {
  constructor(b, obstacles, pad = 0.3, cell = 0.25) {
    this.b = b; this.cell = cell;
    this.w = Math.round((b.x1 - b.x0) / cell);
    this.h = Math.round((b.z1 - b.z0) / cell);
    this.g = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = b.x0 + (i + 0.5) * cell, z = b.z0 + (j + 0.5) * cell;
        let ok = x > b.x0 + pad && x < b.x1 - pad && z > b.z0 + pad && z < b.z1 - 0.15;
        for (const o of obstacles) {
          if (x > o[0] - pad && x < o[1] + pad && z > o[2] - pad && z < o[3] + pad) { ok = false; break; }
        }
        this.g[j * this.w + i] = ok ? 1 : 0;
      }
    }
  }

  ci(x) { return Math.floor((x - this.b.x0) / this.cell); }
  cj(z) { return Math.floor((z - this.b.z0) / this.cell); }
  ok(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && this.g[j * this.w + i] === 1; }
  walkable(x, z) { return this.ok(this.ci(x), this.cj(z)); }
  center(i, j) { return { x: this.b.x0 + (i + 0.5) * this.cell, z: this.b.z0 + (j + 0.5) * this.cell }; }

  nearest(x, z) {
    if (this.walkable(x, z)) return { x, z };
    const ci = this.ci(x), cj = this.cj(z);
    let best = null, bd = Infinity;
    for (let r = 1; r < 50 && !best; r++) {
      for (let j = cj - r; j <= cj + r; j++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !this.ok(i, j)) continue;
          const c = this.center(i, j), d = Math.hypot(c.x - x, c.z - z);
          if (d < bd) { bd = d; best = c; }
        }
      }
    }
    return best || { x: 0, z: 1 };
  }

  los(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / (this.cell * 0.4)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (!this.walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  randomPoint() {
    for (let n = 0; n < 60; n++) {
      const i = Math.floor(Math.random() * this.w), j = Math.floor(Math.random() * this.h);
      if (this.ok(i, j)) return this.center(i, j);
    }
    return { x: 0, z: 1 };
  }

  path(from, to) {
    const a = this.nearest(from.x, from.z), b = this.nearest(to.x, to.z);
    if (this.los(a, b)) return [b];
    const W = this.w, N = W * this.h;
    const s = this.cj(a.z) * W + this.ci(a.x), e = this.cj(b.z) * W + this.ci(b.x);
    const ei = e % W, ej = (e / W) | 0;
    const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [s];
    gs[s] = 0;
    let found = false;
    while (open.length) {
      let bi = 0, bf = Infinity;
      for (let q = 0; q < open.length; q++) {
        const k = open[q], f = gs[k] + Math.hypot((k % W) - ei, ((k / W) | 0) - ej);
        if (f < bf) { bf = f; bi = q; }
      }
      const k = open.splice(bi, 1)[0];
      if (k === e) { found = true; break; }
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % W, j = (k / W) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (!this.ok(ni, nj)) continue;
          if (di && dj && (!this.ok(i + di, j) || !this.ok(i, j + dj))) continue;
          const nk = nj * W + ni;
          if (closed[nk]) continue;
          const ng = gs[k] + (di && dj ? 1.414 : 1);
          if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; open.push(nk); }
        }
      }
    }
    if (!found) return [];
    const pts = [];
    for (let k = e; k !== s && k >= 0; k = came[k]) pts.push(this.center(k % W, (k / W) | 0));
    pts.reverse();
    if (pts.length) pts[pts.length - 1] = b; else pts.push(b);
    const out = [];
    let cur = a, idx = 0;
    while (idx < pts.length) {
      let far = idx;
      for (let q = pts.length - 1; q > idx; q--) if (this.los(cur, pts[q])) { far = q; break; }
      out.push(pts[far]); cur = pts[far]; idx = far + 1;
    }
    return out;
  }
}
