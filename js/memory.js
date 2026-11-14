// 小星的记忆：自动记下你在小屋里做过的事。
// 本地（浏览器 localStorage）留最近 MAX 条当缓存，随时可用、断网也能记；
// 登录云端后，每条都会同步到 Supabase，云端不设上限、不会被浏览器清掉。
import { bus } from './store.js';
import { cloud } from './cloud.js';

const KEY = 'starhome.memory.v1';
const PENDING_KEY = 'starhome.memory.pending.v1';
const MAX = 2000;

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
  go_outside: '出门去屋外走了走',
  come_home: '回到了屋里',
  sit_bench: '在池塘边的长椅上坐了一会儿',
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
  schedule();
}

// ───────── 云端同步 ─────────
// 本地改动先记在 pending 里（待上传 add、待删除 del、待清空 clear），联网后再补做，所以断网也不丢。
let pending = { add: [], del: [], clear: false };
try { const p = JSON.parse(localStorage.getItem(PENDING_KEY)); if (p) pending = { add: p.add || [], del: p.del || [], clear: !!p.clear }; } catch { /* 没有待办 */ }
function savePending() { try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch { /* 同上 */ } }

const cloudState = { state: cloud.signedIn() ? 'idle' : 'off', at: 0, error: '' };
const cloudListeners = [];
function setCloud(patch) { Object.assign(cloudState, patch); cloudListeners.forEach((fn) => fn()); }

let timer = 0, syncing = false, again = false;
function schedule(ms = 1500) {
  if (!cloud.signedIn()) return;
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

async function sync() {
  if (!cloud.signedIn()) return;
  if (syncing) { again = true; return; }
  syncing = true;
  setCloud({ state: 'syncing', error: '' });
  try {
    if (pending.clear) { await cloud.removeAll(); pending.clear = false; savePending(); }
    if (pending.del.length) {
      const dels = [...pending.del];
      await cloud.removeIds(dels);
      pending.del = pending.del.filter((id) => !dels.includes(id));
      savePending();
    }
    if (pending.add.length) {
      const ids = [...pending.add], byId = new Map(events.map((e) => [e.id, e]));
      const rows = ids.map((id) => byId.get(id)).filter(Boolean).map(({ id, at, type, period, note }) => ({ id, at, type, period, note }));
      if (rows.length) await cloud.insert(rows);
      pending.add = pending.add.filter((id) => !ids.includes(id));
      savePending();
    }

    // 拉取云端最近 MAX 条，和本地对齐（别的设备新增的拿进来，别的设备删掉的去掉）
    const remote = await cloud.list(MAX);
    if (pending.clear || pending.del.length) { again = true; return; } // 同步途中用户又删了东西，先处理完再对齐
    const remoteIds = new Set(remote.map((r) => r.id));
    const pend = new Set(pending.add);
    const oldest = remote.length >= MAX ? remote[remote.length - 1].at : -Infinity; // 比这更早的不在拉取范围内，不能当成“被删了”
    const have = new Set(events.map((e) => e.id));
    const kept = events.filter((e) => remoteIds.has(e.id) || pend.has(e.id) || e.at < oldest);
    const fresh = remote.filter((r) => !have.has(r.id) && LABEL[r.type]);
    if (kept.length !== events.length || fresh.length) {
      events = [...kept, ...fresh.map(({ id, at, type, period, note }) => ({ id, at, type, period, note }))].sort((a, b) => a.at - b.at);
      commitLocal();
    }
    setCloud({ state: 'ok', at: Date.now(), error: '' });
  } catch (e) {
    if (!cloud.signedIn()) setCloud({ state: 'off', error: '登录已失效，请重新登录' });
    else setCloud({ state: 'error', error: e instanceof TypeError ? '网络不通，稍后会自动再试' : e.message });
  } finally {
    syncing = false;
    if (again) { again = false; schedule(300); }
  }
}
// 只写本地、不触发再次同步（同步过程中对齐用）
function commitLocal() {
  if (events.length > MAX) events = events.slice(-MAX);
  try { localStorage.setItem(KEY, JSON.stringify(events)); } catch { /* 同上 */ }
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
    const id = `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    events.push({ id, at, type, period, note: String(note).slice(0, 60) });
    if (cloud.signedIn()) { pending.add.push(id); savePending(); }
    commit();
  },

  remove(id) {
    events = events.filter((e) => e.id !== id);
    if (cloud.signedIn()) { pending.add = pending.add.filter((x) => x !== id); pending.del.push(id); savePending(); }
    commit();
  },
  clear() {
    events = [];
    if (cloud.signedIn()) { pending = { add: [], del: [], clear: true }; savePending(); }
    commit();
  },

  // 云端：登录后把本机已有的记忆全部排队上传，再和云端合并
  cloud: {
    get state() { return { ...cloudState, signedIn: cloud.signedIn(), email: cloud.email() }; },
    onChange(fn) { cloudListeners.push(fn); },
    async signIn(email, password) {
      await cloud.signIn(email, password);
      pending = { add: events.map((e) => e.id), del: [], clear: false };
      savePending();
      setCloud({ state: 'idle', error: '' });
      sync();
    },
    signOut() {
      cloud.signOut();
      pending = { add: [], del: [], clear: false };
      savePending();
      setCloud({ state: 'off', error: '' });
    },
    sync: () => sync(),
  },

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
    const before = new Set(have);
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
    if (cloud.signedIn()) { pending.add.push(...events.filter((e) => !before.has(e.id)).map((e) => e.id)); savePending(); }
    commit();
    return added;
  },
};

bus.on('action', (e) => memory.add(e));

// 启动时、回到页面时、恢复联网时各同步一次
if (cloud.signedIn()) schedule(500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(300); });
addEventListener('online', () => schedule(300));
