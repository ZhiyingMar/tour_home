// 本地存档 + 事件总线。所有数据只在这台设备的浏览器里。
import { SAVE_KEY } from './config.js';

const listeners = {};
export const bus = {
  on(type, fn) { (listeners[type] ??= []).push(fn); },
  emit(type, data) { (listeners[type] || []).forEach((fn) => fn(data)); },
};

function read() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

export const save = read();

export function saveState(patch) {
  Object.assign(save, patch);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 无痕模式等情况：不存也能玩 */ }
}
