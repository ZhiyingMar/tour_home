// 三个面板：和小星聊天、设置页、小星的记忆本。
import { ui } from './ui.js';
import { memory } from './memory.js';
import { settings, saveSettings, playerName, hasKey, session, ask, chatHistory, clearChat, DEFAULT_MODEL, DEFAULT_BASE_URL } from './ai.js';
import { bus } from './store.js';
import { hourNow, periodName } from './time.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ───────── 聊天框 ─────────
let busy = false, onSpeak = null;

function addLine(role, text) {
  const log = $('chat-log');
  const row = el('div', `msg ${role}`);
  if (role !== 'note') row.appendChild(el('span', 'who', role === 'user' ? playerName() : '小星'));
  row.appendChild(el('span', 'text', text));
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  return row;
}

function renderHistory() {
  $('chat-log').innerHTML = '';
  for (const m of chatHistory().slice(-10)) addLine(m.role === 'user' ? 'user' : 'xx', m.text);
  if (!hasKey()) addLine('note', '还没填 API key，小星现在只会说几句固定的话。想让它真的陪你聊天，可以去右上角的设置里填。');
}

async function send() {
  const input = $('chat-input'), text = input.value.trim();
  if (!text || busy) return;
  busy = true; $('chat-send').disabled = true;
  input.value = '';
  addLine('user', text);
  bus.emit('action', { type: 'chat', at: Date.now(), period: periodName(hourNow()), note: text.slice(0, 24) });
  const typing = addLine('xx', '…');
  typing.classList.add('typing');
  const r = await ask(text);
  typing.remove();
  addLine('xx', r.text);
  if (r.error) addLine('note', `${r.error}（先用预设台词顶一下）`);
  onSpeak && onSpeak(r.text, r.action);
  busy = false; $('chat-send').disabled = false;
  $('session-calls').textContent = session.calls;
}

export const chat = {
  get open() { return !$('chat').classList.contains('hidden'); },
  show() {
    renderHistory();
    $('chat').classList.remove('hidden');
    $('chat-title').textContent = `和小星说说话`;
  },
  hide() { $('chat').classList.add('hidden'); $('chat-input').blur(); },
  set onSpeak(fn) { onSpeak = fn; },
};

// iPad 弹出键盘时，把聊天框顶到键盘上面
function liftAboveKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const gap = Math.max(0, innerHeight - vv.height - vv.offsetTop);
  $('chat').style.bottom = `${gap}px`;
}

// ───────── 设置页 ─────────
let keyCleared = false;
function keyPlaceholder() {
  const k = (settings.apiKey || '').trim();
  $('set-key').placeholder = k && !keyCleared ? `已保存（…${k.slice(-4)}），留空就不改` : 'sk-…';
}
function openSettings() {
  chat.hide();
  $('set-name').value = settings.name || '';
  // 存好的 key 不再放回输入框，只显示末尾 4 位，免得谁拿起设备都能点“显示”看到
  keyCleared = false;
  $('set-key').value = '';
  $('set-key').type = 'password';
  keyPlaceholder();
  $('set-model').value = settings.model || DEFAULT_MODEL;
  $('set-base').value = settings.baseUrl || DEFAULT_BASE_URL;
  $('set-proactive').checked = settings.proactive !== false;
  $('session-calls').textContent = session.calls;
  ui.open('settings');
}

function saveSettingsForm() {
  saveSettings({
    name: $('set-name').value.trim().slice(0, 12),
    apiKey: $('set-key').value.trim() || (keyCleared ? '' : settings.apiKey),
    model: $('set-model').value.trim(),
    baseUrl: $('set-base').value.trim(),
    proactive: $('set-proactive').checked,
  });
  ui.closeAll();
  ui.toast(hasKey() ? '保存好啦，小星可以陪你聊天了' : '保存好啦');
}

// ───────── 记忆本 ─────────
function renderMemory() {
  const list = $('memory-list'), all = memory.all();
  list.innerHTML = '';
  $('memory-where').textContent = memory.cloud.state.signedIn
    ? '已同步到云端，浏览器清缓存也不会丢。'
    : `只存在这台设备上，最多留最近 ${memory.MAX} 条。想长期保存，去设置里登录云端同步。`;
  $('memory-count').textContent = ` 现在有 ${all.length} 条`;
  if (!all.length) { list.appendChild(el('p', 'empty', '还是空白的。去坐坐沙发、点点壁炉，小星会一件件记下来。')); return; }
  for (const e of [...all].reverse()) {
    const row = el('div', 'mem');
    const info = el('div', 'mem-info');
    info.appendChild(el('span', 'mem-what', memory.describe(e)));
    info.appendChild(el('span', 'mem-when', `${memory.time(e)}${e.period ? ` · ${e.period}` : ''}`));
    const del = el('button', 'mem-del', '删除');
    del.addEventListener('click', () => memory.remove(e.id));
    row.append(info, del);
    list.appendChild(row);
  }
}

function exportMemory() {
  const blob = new Blob([memory.exportJSON()], { type: 'application/json' });
  const a = el('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `小星的记忆本-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function importMemory(file) {
  try {
    const n = memory.importJSON(await file.text());
    ui.toast(n ? `导入了 ${n} 条记忆` : '没有新的记忆可以导入');
  } catch (e) { ui.toast(`导入失败：${e.message}`.slice(0, 40)); }
}

export function initPanels() {
  $('chat-send').addEventListener('click', send);
  $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });
  $('chat-close').addEventListener('click', () => chat.hide());
  $('chat-clear').addEventListener('click', () => { clearChat(); renderHistory(); });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', liftAboveKeyboard);
    visualViewport.addEventListener('scroll', liftAboveKeyboard);
  }

  $('btn-settings').addEventListener('click', openSettings);
  $('set-save').addEventListener('click', saveSettingsForm);
  $('set-key-show').addEventListener('click', () => { const k = $('set-key'); k.type = k.type === 'password' ? 'text' : 'password'; });
  $('set-key-clear').addEventListener('click', () => { $('set-key').value = ''; keyCleared = true; keyPlaceholder(); });

  $('btn-memory').addEventListener('click', () => { chat.hide(); renderMemory(); ui.open('memory'); });
  $('memory-export').addEventListener('click', exportMemory);
  $('memory-import').addEventListener('click', () => $('memory-file').click());
  $('memory-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importMemory(f); e.target.value = ''; });
  $('memory-clear').addEventListener('click', () => {
    const msg = memory.cloud.state.signedIn ? '把记忆本全部清空吗？云端的也会一起删掉，找不回来。' : '把记忆本全部清空吗？清空后找不回来。';
    if (confirm(msg)) memory.clear();
  });
  memory.onChange(() => { if (!$('memory').classList.contains('hidden')) renderMemory(); });

  // 云端同步
  $('cloud-signin').addEventListener('click', async () => {
    const email = $('cloud-email').value.trim(), pass = $('cloud-pass').value;
    if (!email || !pass) { ui.toast('邮箱和密码都要填'); return; }
    $('cloud-signin').disabled = true;
    try {
      await memory.cloud.signIn(email, pass);
      $('cloud-pass').value = '';
      ui.toast('登录好了，正在同步记忆');
    } catch (e) {
      ui.toast(e instanceof TypeError ? '网络不通，登录没成功' : `登录失败：${e.message}`.slice(0, 40));
    }
    $('cloud-signin').disabled = false;
  });
  $('cloud-sync').addEventListener('click', () => memory.cloud.sync());
  $('cloud-signout').addEventListener('click', () => { memory.cloud.signOut(); ui.toast('已退出，本机的记忆还在'); });
  memory.cloud.onChange(renderCloud);
  renderCloud();
}

function renderCloud() {
  const s = memory.cloud.state;
  $('cloud-login').style.display = s.signedIn ? 'none' : '';
  $('cloud-in').style.display = s.signedIn ? '' : 'none';
  const text = !s.signedIn ? (s.error || '未登录')
    : s.state === 'syncing' ? `${s.email} · 同步中…`
    : s.state === 'error' ? `${s.email} · ${s.error}`
    : s.state === 'ok' ? `${s.email} · 已同步`
    : s.email;
  $('cloud-state').textContent = text;
  if (!$('memory').classList.contains('hidden')) renderMemory();
}
