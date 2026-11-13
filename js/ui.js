// 界面：标题页、时钟、动作按钮、对话气泡、信纸、睡眠遮罩。
import * as THREE from 'three';
import { clockText, periodName, daylight } from './time.js';

const $ = (id) => document.getElementById(id);
const V = new THREE.Vector3();
const bubbles = new Map(); // key → { el, anchor, life }
let toastTimer = 0;

export const ui = {
  onWake: null, onStart: null, onAction: null, onSound: null, onClose: null,

  init() {
    $('start').addEventListener('click', () => this.onStart && this.onStart());
    $('action').addEventListener('click', () => this.onAction && this.onAction());
    $('btn-sound').addEventListener('click', () => this.onSound && this.onSound());
    $('btn-help').addEventListener('click', () => this.open('help'));
    // 睡觉的遮罩盖在画面上，点它就是起床
    $('sleep').addEventListener('click', () => this.onWake && this.onWake());
    document.querySelectorAll('.modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m || e.target.hasAttribute('data-close')) this.closeAll(); });
    });
  },

  ready() { const b = $('start'); b.disabled = false; b.textContent = '推门进去'; },
  enter() { $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); },

  setSound(on) { $('btn-sound').textContent = on ? '🔊' : '🔇'; },

  setClock(h) {
    $('clock-time').textContent = clockText(h);
    $('clock-period').textContent = periodName(h);
    const dl = daylight(h);
    $('clock-icon').textContent = dl > 0.85 ? '☀️' : dl > 0.15 ? (h < 12 ? '🌅' : '🌇') : '🌙';
  },

  setAction(label) {
    const b = $('action');
    if (!label) { b.classList.add('hidden'); b.dataset.label = ''; return; }
    if (b.dataset.label !== label) {
      b.dataset.label = label; b.textContent = label;
      b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    }
    b.classList.remove('hidden');
  },

  // anchor：返回世界坐标的函数，气泡会一直跟着它
  say(key, who, text, anchor, dur = 3.6) {
    let b = bubbles.get(key);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble';
      $('bubbles').appendChild(el);
      b = { el, anchor, life: 0 };
      bubbles.set(key, b);
    }
    b.el.innerHTML = '';
    const inner = document.createElement('div');
    if (who) { const w = document.createElement('span'); w.className = 'who'; w.textContent = who; inner.appendChild(w); }
    inner.appendChild(document.createTextNode(text));
    b.el.appendChild(inner);
    b.el.style.opacity = 1;
    b.anchor = anchor; b.life = dur;
  },

  update(dt, camera) {
    const w = innerWidth, h = innerHeight;
    for (const [key, b] of bubbles) {
      b.life -= dt;
      if (b.life < -0.35) { b.el.remove(); bubbles.delete(key); continue; }
      if (b.life < 0) b.el.style.opacity = 0;
      b.anchor(V).project(camera);
      const x = Math.min(w - 120, Math.max(120, (V.x + 1) / 2 * w)), y = Math.max(90, (1 - V.y) / 2 * h);
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) translateY(-16px)`;
    }
  },

  showLetter(lines) {
    const body = $('letter-body');
    body.innerHTML = '';
    for (const l of lines) { const p = document.createElement('p'); p.textContent = l; body.appendChild(p); }
    this.open('letter');
  },

  open(id) { $(id).classList.remove('hidden'); },
  get modalOpen() { return !!document.querySelector('.modal:not(.hidden)'); },
  closeAll() {
    const was = this.modalOpen;
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    if (was && this.onClose) this.onClose();
  },

  fade(on) { $('fade').classList.toggle('on', on); },

  sleep(on) { $('sleep').classList.toggle('hidden', !on); },

  toast(text, dur = 2600) {
    const t = $('toast');
    t.textContent = text; t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), dur);
  },
};
