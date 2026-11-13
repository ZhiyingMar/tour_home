// 设备真实时间 → 昼夜参数。网址加 ?hour=22.5 可预览任意时刻。
const q = new URLSearchParams(location.search);
let override = q.has('hour') ? parseFloat(q.get('hour')) : null;
if (Number.isNaN(override)) override = null;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function hourNow() {
  if (override != null) return override;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// 0 = 深夜，1 = 白天
export function daylight(h) {
  return Math.min(smooth(5, 7.5, h), 1 - smooth(17, 19.5, h));
}

// 朝霞 / 晚霞的暖色程度 0..1
export function warmth(h) {
  const bump = (c, w) => Math.max(0, 1 - Math.abs(h - c) / w);
  return Math.max(bump(6.2, 1.4), bump(18.2, 1.5));
}

export function periodName(h) {
  if (h < 5) return '深夜';
  if (h < 7.5) return '清晨';
  if (h < 11.5) return '上午';
  if (h < 13.5) return '中午';
  if (h < 17) return '下午';
  if (h < 19.5) return '傍晚';
  if (h < 23) return '夜晚';
  return '深夜';
}

export function clockText(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
