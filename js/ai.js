// 小星的 AI 对话：浏览器直接调用 Claude API。
//
// 关于“浏览器直连”（依据 Anthropic 官方文档 Authentication → Browser-based applications）：
// - 浏览器发出的是跨域（CORS）请求，API 只在请求带有
//   `anthropic-dangerous-direct-browser-access: true` 这个请求头时才接受。
// - 官方不建议把 key 放在网页里，因为能打开页面的人都能读到它。这里之所以可以接受：
//   key 由玩家自己粘贴，只存在这台设备的 localStorage，不进代码、不进仓库，也不经过任何服务器。
// - 开启了零数据保留（ZDR）或 Compliance API 的组织不能从浏览器调用，会返回 401，
//   提示以 “CORS requests are not allowed for this Organization” 开头。
// - 没有绑定到单个 workspace 的 key 还需要 `anthropic-workspace-id` 请求头（设置页里可填）。
//
// 这里没有用官方 SDK：项目是无构建的纯静态页面，一个 fetch 就够了。
import { DEFAULT_NAME } from './config.js';
import { hourNow, periodName } from './time.js';
import { memory } from './memory.js';
import { PRESET_LINES } from './xiaoxing.js';

const SETTINGS_KEY = 'starhome.settings.v1';
const CHAT_KEY = 'starhome.chat.v1';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
export const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 600; // 每次回复的硬上限（模型的思考也算在里面）
const MAX_SENTENCES = 3; // 小星每次最多说三句
const HISTORY_FOR_PROMPT = 10; // 带进提示词的最近对话句数

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 忽略 */ } }

export const settings = Object.assign({ name: '', apiKey: '', model: DEFAULT_MODEL, workspaceId: '' }, read(SETTINGS_KEY, {}));
export function saveSettings(patch) {
  Object.assign(settings, patch);
  settings.model = (settings.model || '').trim() || DEFAULT_MODEL;
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
    `你是“小星”，一只住在温馨小屋里的小松鼠，尾巴是一颗装着星空的圆球，会隐隐发光。你陪着屋子的主人“${name}”。`,
    '性格：温柔，有一点俏皮，像很亲近的小伙伴。',
    `说话方式：简短、口语化的中文；每次回复不超过三句话；称呼对方为“${name}”，不用每句都叫；不用列表、标题、括号里的动作描写或表情符号堆砌。`,
    '你只知道小屋里的事：沙发、壁炉、床、桌上的信、窗外的山水、云和偶尔经过的小火车、夜里的星星月亮。右边那扇门后面还在装修。',
    '下面是你记得的、你们最近一起做过的事。聊天时可以自然地提起一两件，不要逐条复述，也不要编造没发生过的事。',
    '',
    `现在是 ${d.getMonth() + 1}月${d.getDate()}日 ${periodName(h)}。`,
    '最近的事：',
    memory.summary(12),
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

function trimReply(text) {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^。！？!?…~～]+[。！？!?…~～]*/g) || [text.trim()];
  return parts.slice(0, MAX_SENTENCES).join('').trim();
}

function presetLine() {
  const lines = PRESET_LINES[periodName(hourNow())];
  return lines[Math.floor(Math.random() * lines.length)].replace('{name}', playerName());
}

const noEffort = new Set(); // 不支持 effort 参数的模型，记下来之后不再发

async function callAPI(userText) {
  const model = settings.model || DEFAULT_MODEL;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': settings.apiKey.trim(),
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if ((settings.workspaceId || '').trim()) headers['anthropic-workspace-id'] = settings.workspaceId.trim();
  const base = { model, max_tokens: MAX_TOKENS, system: systemPrompt(), messages: buildMessages(userText) };

  for (let attempt = 0; attempt < 2; attempt++) {
    const body = noEffort.has(model) ? base : { ...base, output_config: { effort: 'low' } };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    let res;
    try {
      session.calls++;
      res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? '等了很久也没有回应，可能是网络不太好。' : '连不上 API，检查一下网络。');
    } finally { clearTimeout(timer); }

    if (res.ok) {
      const data = await res.json();
      if (data.stop_reason === 'refusal') throw new Error('这句话模型没有回答。');
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      if (!text) throw new Error(data.stop_reason === 'max_tokens' ? '回复被长度上限截断了，换个说法再试一次。' : '模型没有说话。');
      return trimReply(text);
    }

    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* 不是 JSON */ }
    if (res.status === 400 && !noEffort.has(model) && /effort|output_config/i.test(msg)) { noEffort.add(model); continue; }
    if (res.status === 401) {
      throw new Error(/CORS requests are not allowed/i.test(msg)
        ? '这个 key 所在的组织不允许从浏览器直接调用（开启了零数据保留或 Compliance API）。'
        : 'API key 无效或已过期，去设置里检查一下。');
    }
    if (res.status === 400 && /workspace/i.test(msg)) throw new Error('这个 key 没有绑定 workspace，需要在设置里填 Workspace ID。');
    if (res.status === 404) throw new Error(`找不到模型“${model}”，去设置里检查模型名。`);
    if (res.status === 429) throw new Error('调用太频繁或额度用完了，等一会儿再试。');
    if (res.status >= 500) throw new Error('API 那边暂时出了点问题，等一会儿再试。');
    throw new Error(msg ? `请求没成功：${msg.slice(0, 120)}` : `请求没成功（${res.status}）。`);
  }
  throw new Error('请求没成功。');
}

// 对外只有这一个入口：返回 { text, source: 'ai' | 'preset', error? }
export async function ask(userText) {
  remember('user', userText);
  let result;
  if (!hasKey()) result = { text: presetLine(), source: 'preset' };
  else {
    try { result = { text: await callAPI(userText), source: 'ai' }; }
    catch (e) { result = { text: presetLine(), source: 'preset', error: e.message }; }
  }
  remember('assistant', result.text);
  return result;
}
