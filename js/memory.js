// 小星的记忆：自动记下你在小屋里做过的事。只存在这台设备的浏览器里，最多留最近 200 条。
import { bus } from './store.js';

const KEY = 'starhome.memory.v1';
const MAX = 200;

// 事件类型 → 人话。加新玩法（比如以后的厨房）时在这里加一行即可。
const LABEL = {
  sit_sofa: '窝进了沙发',
  light_fire: '点燃了壁炉',
  put_out_fire: '熄灭了壁炉',
  sleep: '躺到床上睡觉',
  wake: '睡醒起床',
  read_letter: '读了桌上的信',
  pet_xiaoxing: '摸了摸小星',
  chat: '和小星聊天',
};
// 这几类短时间内重复发生时只记一次，免得刷屏
const QUIET = { pet_xiaoxing: 3 * 60e3, chat: 10 * 60e3 };

function load() {
  try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch { return []; }
}
let events = load();
const listeners = [];
function commit() {
  if (events.length > MAX) events = events.slice(-MAX);
  try { localStorage.setItem(KEY, JSON.stringify(events)); } catch { /* 存不下就只留在内存里 */ }
  listeners.forEach((fn) => fn());
}

const pad = (n) => String(n).padStart(2, '0');

export const memory = {
  MAX,
  all: () => events,
  onChange(fn) { listeners.push(fn); },

  add({ type, at = Date.now(), period = '', note = '' }) {
    if (!LABEL[type]) return;
    const gap = QUIET[type];
    if (gap) {
      const last = [...events].reverse().find((e) => e.type === type);
      if (last && at - last.at < gap) return;
    }
    events.push({ id: `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, at, type, period, note: String(note).slice(0, 60) });
    commit();
  },

  remove(id) { events = events.filter((e) => e.id !== id); commit(); },
  clear() { events = []; commit(); },

  time(e) {
    const d = new Date(e.at);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  describe(e) { return LABEL[e.type] + (e.note ? `（${e.note}）` : ''); },

  // 给提示词用的“最近事件摘要”
  summary(n = 12) {
    if (!events.length) return '（还没有记下什么）';
    return events.slice(-n).map((e) => `- ${this.time(e)}${e.period ? ` ${e.period}` : ''}：${this.describe(e)}`).join('\n');
  },

  exportJSON() {
    return JSON.stringify({ app: 'starhome', version: 1, exportedAt: new Date().toISOString(), events }, null, 2);
  },

  // 导入：和现有记录合并去重，返回新增了多少条
  importJSON(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data && data.events;
    if (!Array.isArray(list)) throw new Error('文件里没有找到 events 列表');
    const have = new Set(events.map((e) => e.id));
    let added = 0;
    for (const e of list) {
      if (!e || !LABEL[e.type] || !Number.isFinite(e.at)) continue;
      const id = typeof e.id === 'string' ? e.id : `${e.at.toString(36)}imp${added}`;
      if (have.has(id)) continue;
      have.add(id);
      events.push({ id, at: e.at, type: e.type, period: String(e.period || '').slice(0, 8), note: String(e.note || '').slice(0, 60) });
      added++;
    }
    events.sort((a, b) => a.at - b.at);
    commit();
    return added;
  },
};

bus.on('action', (e) => memory.add(e));
