// 小星的 AI 对话：浏览器直接调用任意 OpenAI 兼容的 Chat Completions 接口
// （DeepSeek、OpenAI、通义、Moonshot、OpenRouter、本地 Ollama 等都可以，在设置里改 Base URL 和模型名）。
//
// - key 由玩家自己粘贴，只存在这台设备的 localStorage，不进代码、不进仓库，也不经过别的服务器。
// - 浏览器发的是跨域（CORS）请求，所用的服务必须允许浏览器直连，否则会提示“连不上 API”。
//
// 这里没有用官方 SDK：项目是无构建的纯静态页面，一个 fetch 就够了。
import { DEFAULT_NAME } from './config.js';
import { hourNow, periodName } from './time.js';
import { memory } from './memory.js';
import { PRESET_LINES, SEEK_LINES, ACTIONS } from './xiaoxing.js';

const SETTINGS_KEY = 'starhome.settings.v1';
const CHAT_KEY = 'starhome.chat.v1';
export const DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-chat';
const MAX_TOKENS = 600; // 每次回复的硬上限（模型的思考也算在里面）
const MAX_SENTENCES = 3; // 小星每次最多说三句
const HISTORY_FOR_PROMPT = 10; // 带进提示词的最近对话句数

// 游戏把“现在的情况”告诉这里：在屋里还是屋外、主人在干嘛、壁炉亮没亮（main.js 里设置）
export const world = { area: 'indoor', describe: () => '' };

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 忽略 */ } }

export const settings = Object.assign({ name: '', apiKey: '', model: DEFAULT_MODEL, baseUrl: DEFAULT_BASE_URL, proactive: true }, read(SETTINGS_KEY, {}));
delete settings.workspaceId;
// 旧版本存的是 Claude 的 key 和模型名，换成通用接口后不能再用
if (/^claude/i.test(settings.model || '') || /^sk-ant-/.test(settings.apiKey || '')) {
  settings.model = DEFAULT_MODEL; settings.baseUrl = DEFAULT_BASE_URL;
  if (/^sk-ant-/.test(settings.apiKey || '')) settings.apiKey = '';
}
export function saveSettings(patch) {
  Object.assign(settings, patch);
  settings.model = (settings.model || '').trim() || DEFAULT_MODEL;
  settings.baseUrl = (settings.baseUrl || '').trim() || DEFAULT_BASE_URL;
  write(SETTINGS_KEY, settings);
}
export const playerName = () => (settings.name || '').trim() || DEFAULT_NAME;
export const hasKey = () => !!(settings.apiKey || '').trim();

// 本次会话（打开页面到关闭）的调用次数
export const session = { calls: 0 };

// 对话记录：[{ role: 'user' | 'assistant', text }]，本地只留最近 40 句
let history = read(CHAT_KEY, []);
if (!Array.isArray(history)) history = [];
export const chatHistory = () => history;
export function clearChat() { history = []; write(CHAT_KEY, history); }
function remember(role, text) {
  history.push({ role, text });
  if (history.length > 40) history = history.slice(-40);
  write(CHAT_KEY, history);
}

function systemPrompt() {
  const name = playerName(), h = hourNow();
  const d = new Date();
  return [
    `你是“小星”，一个住在温馨小屋里的小男孩，头发乱蓬蓬的，穿着藏青色外套，胸前别着一颗会隐隐发光的小星星。你陪着屋子的主人“${name}”。`,
    '性格：温柔，有一点俏皮，像很亲近的小伙伴。',
    `说话方式：简短、口语化的中文；每次回复不超过三句话；称呼对方为“${name}”，不用每句都叫；不用列表、标题、括号里的动作描写或表情符号堆砌。`,
    '你只知道小屋和屋外这片地方的事：沙发、壁炉、床、桌上的信、窗外的山水、云和偶尔经过的小火车、夜里的星星月亮。右边那扇门通往屋外：有花园、池塘边的长椅、望不到头的草地和树林，还有一条偶尔过火车的铁路。',
    '下面是你记得的、你们最近一起做过的事。聊天时可以自然地提起一两件，不要逐条复述，也不要编造没发生过的事。',
    '',
    `现在是 ${d.getMonth() + 1}月${d.getDate()}日 ${periodName(h)}。`,
    '最近的事：',
    memory.summary(12),
    '',
    `此刻：${world.describe() || '你们在小屋里。'}`,
    '',
    '你不只会说话，还能自己动。想做动作时，在回复最后单独加一个标记，比如【动作:壁炉】，一次最多一个，不想动就不加。标记不会被念出来，所以话里不用重复描述这个动作。',
    '现在能做的动作：',
    ...Object.entries(ACTIONS[world.area] || {}).map(([k, v]) => `- ${k}：${v}`),
    `${name}让你去哪儿、做什么时，就用对应的动作去做；做不到的就俏皮地说一声。`,
  ].join('\n');
}

// 取最近 10 句对话，整理成 API 要求的格式（必须以 user 开头、角色交替）
function buildMessages(userText) {
  const recent = history.slice(-HISTORY_FOR_PROMPT);
  const out = [];
  for (const m of recent) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.text}`;
    else out.push({ role: m.role, content: m.text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  const last = out[out.length - 1];
  if (last && last.role === 'user') last.content += `\n${userText}`;
  else out.push({ role: 'user', content: userText });
  return out;
}

// 把回复里的【动作:xxx】拿出来，剩下的才是要说的话
const TAG = /[【\[]\s*动作\s*[:：]\s*([^】\]]+?)\s*[】\]]/g;
function splitAction(text) {
  let action = null;
  const valid = ACTIONS[world.area] || {};
  const clean = text.replace(TAG, (_, a) => { if (!action && valid[a]) action = a; return ''; });
  return { text: clean, action };
}

function trimReply(text) {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^。！？!?…~～]+[。！？!?…~～]*/g) || [text.trim()];
  return parts.slice(0, MAX_SENTENCES).join('').trim();
}

function presetLine() {
  return pickLine(PRESET_LINES[periodName(hourNow())]);
}

// 兼容写法：Base URL 可以填到根（https://api.deepseek.com）、/v1，或完整的 /chat/completions
function endpoint() {
  const base = (settings.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

async function callAPI(userText) {
  const model = settings.model || DEFAULT_MODEL;
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${settings.apiKey.trim()}`,
  };
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'system', content: systemPrompt() }, ...buildMessages(userText)],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res;
  try {
    session.calls++;
    res = await fetch(endpoint(), { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? '等了很久也没有回应，可能是网络不太好。' : '连不上 API，检查一下网络和 Base URL（也要确认该服务允许浏览器直连）。');
  } finally { clearTimeout(timer); }

  if (res.ok) {
    const data = await res.json();
    const choice = data.choices?.[0];
    const text = (choice?.message?.content || '').trim();
    if (!text) throw new Error(choice?.finish_reason === 'length' ? '回复被长度上限截断了，换个说法再试一次。' : '模型没有说话。');
    const r = splitAction(text);
    r.text = trimReply(r.text);
    if (!r.text) throw new Error('模型没有说话。');
    return r;
  }

  let msg = '';
  try { const j = await res.json(); msg = j.error?.message || j.message || ''; } catch { /* 不是 JSON */ }
  if (res.status === 401) throw new Error('API key 无效或已过期，去设置里检查一下。');
  if (res.status === 402) throw new Error('账户余额不足，去服务商那边充值后再试。');
  if (res.status === 404) throw new Error(`找不到接口或模型“${model}”，去设置里检查 Base URL 和模型名。`);
  if (res.status === 429) throw new Error('调用太频繁或额度用完了，等一会儿再试。');
  if (res.status >= 500) throw new Error('API 那边暂时出了点问题，等一会儿再试。');
  throw new Error(msg ? `请求没成功：${msg.slice(0, 120)}` : `请求没成功（${res.status}）。`);
}

// 主人说话：返回 { text, action, source: 'ai' | 'preset', error? }
export async function ask(userText) {
  remember('user', userText);
  let result;
  if (!hasKey()) result = { text: presetLine(), action: null, source: 'preset' };
  else {
    try { result = { ...(await callAPI(userText)), source: 'ai' }; }
    catch (e) { result = { text: presetLine(), action: null, source: 'preset', error: e.message }; }
  }
  remember('assistant', result.text);
  return result;
}

// 小星自己跑来找主人说话。reason：'idle'（主人有一阵没动静了）| 'wake'（主人刚睡醒）
// 这句提示不算主人说的话，不进对话记录；小星说的那句会进记录，主人打开聊天框就能接着聊。
const SEEK_HINT = {
  idle: (name, mins) => `${name}已经${mins}分钟左右没怎么动了，你自己跑到TA身边，主动找TA说说话。`,
  wake: (name) => `${name}刚睡醒起床，你凑过去跟TA打招呼。`,
};
export async function seek(reason, mins = 3) {
  const name = playerName();
  let result;
  const fallback = () => pickLine(SEEK_LINES[reason] || SEEK_LINES.idle);
  if (!hasKey()) result = { text: fallback(), action: null, source: 'preset' };
  else {
    const hint = `（旁白，不是${name}说的话：${SEEK_HINT[reason](name, mins)}说一两句，可以聊聊刚才一起做过的事、现在的天色和屋里屋外的样子，或者邀请TA一起做点什么。别问“在干嘛”这种空话，也别说自己是被旁白叫来的。）`;
    try { result = { ...(await callAPI(hint)), source: 'ai' }; }
    catch (e) { result = { text: fallback(), action: null, source: 'preset', error: e.message }; }
  }
  remember('assistant', result.text);
  return result;
}
function pickLine(lines) { return lines[Math.floor(Math.random() * lines.length)].replace('{name}', playerName()); }
