// 入口：搭场景、接输入、跑主循环、把各个模块串起来。
import * as THREE from 'three';
import { ROOM, LETTER_TEXT } from './config.js';
import { bus, save, saveState } from './store.js';
import { hourNow, daylight, warmth, periodName } from './time.js';
import { damp, clamp, glowTex } from './util.js';
import { Nav } from './nav.js';
import { Scenery } from './scenery.js';
import { buildRoom } from './room.js';
import { Player } from './player.js';
import { XiaoXing } from './xiaoxing.js';
import { ui } from './ui.js';
import { audio } from './audio.js';
import './memory.js';
import { playerName } from './ai.js';
import { chat, initPanels } from './panels.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1624');
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);

const scenery = new Scenery();
const room = buildRoom(scene, scenery.tex);
const nav = new Nav(ROOM, room.obstacles);
const player = new Player(scene, nav);
const xiaoxing = new XiaoXing(scene, nav, { player, fire: room.fire });

const emit = (type) => bus.emit('action', { type, at: Date.now(), period: periodName(hourNow()) });

// ───── 读档 ─────
room.fire.lit = !!save.fire;
if (room.fire.lit) room.fire.level = 1;
const sp = nav.nearest(save.px ?? 0.6, save.pz ?? 1.6);
player.pos.set(sp.x, 0, sp.z);
function persist() { saveState({ fire: room.fire.lit, px: player.posed ? player.back.x : player.pos.x, pz: player.posed ? player.back.z : player.pos.z }); }
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); else audio.resume(); });

// ───── 镜头 ─────
function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const hHalf = Math.atan(7.9 / 16.2); // 让整面后墙都落在画面里
  camera.fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / camera.aspect)), 27, 62);
  camera.updateProjectionMatrix();
}
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 250));
fit();

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let intro = 0, started = false;

// ───── 点击反馈：地上的小圈 + 互动提示光点 ─────
const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 32), new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring);
let ringT = 1;
const hint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff3c0', transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
hint.scale.set(0.45, 0.45, 1); scene.add(hint);

// ───── 互动 ─────
// 每样东西：stand = 走到哪儿，face = 面朝哪儿，label = 按钮文字，run = 做什么
const acts = {
  sofa: {
    stand: [-0.1, -1.75], face: [-0.1, -3], label: () => '🛋 窝进沙发',
    run() { player.sit({ x: -0.1, y: 0.52, z: -2.58 }); audio.sfx('sit'); emit('sit_sofa'); xiaoxing.nudge(); },
  },
  fire: {
    stand: [-4, -1.7], face: [-4, -3], label: () => (room.fire.lit ? '💨 熄灭壁炉' : '🔥 点燃壁炉'),
    run() {
      room.fire.lit = !room.fire.lit;
      audio.sfx(room.fire.lit ? 'ignite' : 'douse');
      emit(room.fire.lit ? 'light_fire' : 'put_out_fire');
      if (room.fire.lit) xiaoxing.nudge();
      persist();
    },
  },
  bed: {
    stand: [3.1, -1.5], face: [4.6, -1.5], label: () => '🛏 躺下睡会儿',
    run() { player.lie({ x: 4.65, y: 0.95, z: -1.45 }); ui.sleep(true); audio.sfx('sleep'); emit('sleep'); xiaoxing.nudge(); },
  },
  letter: {
    stand: [-4.45, 1.7], face: [-5.4, 1.7], label: () => '✉️ 读桌上的信',
    run() { ui.showLetter(LETTER_TEXT.map((l) => l.replace('{name}', playerName()))); audio.sfx('paper'); emit('read_letter'); saveState({ letterRead: true }); },
  },
  door: {
    // 厨房扩展位：以后在这里切换到厨房场景
    stand: [5.35, 1.3], face: [6, 1.3], label: () => '🚪 看看这扇门',
    run() { audio.sfx('knock'); ui.say('me', '', '门后面还在装修，以后会是厨房。', (v) => player.headPos(v), 3.2); },
  },
};

function standUp(then) {
  const was = player.state;
  if (was === 'lie') { ui.sleep(false); audio.sfx('wake'); emit('wake'); }
  player.stand(then);
}

function interact(id) {
  const a = acts[id];
  if (!a || player.tw) return;
  if ((id === 'sofa' && player.state === 'sit') || (id === 'bed' && player.state === 'lie')) return standUp();
  const go = () => player.walkTo(a.stand[0], a.stand[1], () => {
    player.turn = Math.atan2(a.face[0] - player.pos.x, a.face[1] - player.pos.z);
    a.run();
  });
  if (player.posed) standUp(go); else go();
}

function nearestAct() {
  let best = null, bd = 1.45;
  for (const id in acts) {
    const s = acts[id].stand, d = Math.hypot(s[0] - player.pos.x, s[1] - player.pos.z);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

function petXiaoxing() {
  const line = xiaoxing.react(playerName());
  if (!line) return;
  audio.sfx('chirp');
  ui.say('xx', '小星', line, (v) => xiaoxing.headPos(v));
  emit('pet_xiaoxing');
}
// 点小星：先来个小动画，再打开聊天框。再点一次就收起来。
function onXiaoxingTap() {
  if (chat.open) { chat.hide(); return petXiaoxing(); }
  if (!xiaoxing.react(playerName())) return;
  audio.sfx('chirp');
  emit('pet_xiaoxing');
  chat.show();
}

// ───── 输入 ─────
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), P = new THREE.Vector3();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const ok = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 16 && performance.now() - down.t < 700;
  down = null;
  if (ok) tap(e.clientX, e.clientY);
});

function tap(x, y) {
  if (!started || ui.modalOpen) return;
  audio.resume();
  if (player.state === 'lie') return standUp();
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(xiaoxing.hit).length) return onXiaoxingTap();
  const h = ray.intersectObjects(room.hits)[0];
  if (h) { audio.sfx('tap'); return interact(h.object.userData.id); }
  if (!ray.ray.intersectPlane(ground, P) || player.tw) return;
  const t = nav.nearest(clamp(P.x, ROOM.x0, ROOM.x1), clamp(P.z, ROOM.z0, ROOM.z1));
  ring.position.set(t.x, 0.03, t.z); ringT = 0;
  audio.sfx('tap');
  const go = () => player.walkTo(t.x, t.z);
  if (player.posed) standUp(go); else go();
}

const held = new Set();
const KEYMAP = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
function syncKeys() {
  let x = 0, z = 0;
  for (const k of held) { x += KEYMAP[k][0]; z += KEYMAP[k][1]; }
  player.keys.x = x; player.keys.z = z;
}
addEventListener('keydown', (e) => {
  if (!started || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { chat.hide(); return ui.closeAll(); }
  if (ui.modalOpen) return;
  if (KEYMAP[k]) {
    e.preventDefault();
    if (player.posed && !player.tw) standUp();
    held.add(k); syncKeys();
  } else if ((k === 'e' || k === ' ' || k === 'enter') && !e.repeat) { e.preventDefault(); doAction(); }
});
addEventListener('keyup', (e) => { held.delete(e.key.toLowerCase()); syncKeys(); });
addEventListener('blur', () => { held.clear(); syncKeys(); });

function doAction() {
  if (player.tw) return;
  if (player.posed) return standUp();
  const id = nearestAct();
  if (id) interact(id);
}

// ───── 界面 ─────
ui.init();
initPanels();
// 小星在聊天框里回话时，头顶也冒一个气泡
chat.onSpeak = (text) => { audio.sfx('chirp'); xiaoxing.flare = 0.6; ui.say('xx', '小星', text, (v) => xiaoxing.headPos(v), 5); };
ui.onAction = () => { audio.resume(); doAction(); };
ui.onSound = () => { const m = !audio.muted; audio.setMuted(m); ui.setSound(!m); saveState({ muted: m }); };
ui.onStart = () => {
  if (started) return;
  started = true;
  audio.init(!!save.muted); audio.resume(); audio.sfx('chime');
  ui.setSound(!save.muted);
  ui.enter();
  setTimeout(() => {
    audio.sfx('chirp');
    ui.say('xx', '小星', `${playerName()}，你回来啦！`, (v) => xiaoxing.headPos(v), 4);
  }, 2200);
};
player.onStep = () => audio.sfx('step');
ui.setClock(hourNow());
setInterval(() => ui.setClock(hourNow()), 5000);

// ───── 主循环 ─────
const clock = new THREE.Clock();
let sleepK = 0, firstFrame = true;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const h = hourNow(), dl = daylight(h), wm = warmth(h);

  player.update(dt, t);
  if (player.turn != null) {
    if (player.state === 'walk') player.turn = null;
    else if (!player.tw && !player.posed) { const d = player.turn - player.yaw; player.yaw += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 10); }
  }
  xiaoxing.update(dt, t, { dl });
  sleepK = damp(sleepK, player.state === 'lie' ? 1 : 0, 0.9, dt);
  room.setEnv({ dl, wm, sleep: sleepK, t, dt });
  scenery.update(dt, h, t);
  audio.tick(dt, room.fire.level);

  // 镜头：开场从远处推近，之后轻轻跟着人
  if (started) intro = Math.min(1, intro + dt / 2.6);
  const k = intro * intro * (3 - 2 * intro), px = player.pos.x;
  camPos.set(px * 0.1 + Math.sin(t * 0.12) * 0.25 * (1 - k), 7.8 + 2.2 * (1 - k) - sleepK * 0.5, 13 + 5 * (1 - k) - sleepK * 0.8);
  camLook.set(px * 0.16 + sleepK * 0.8, 1.3, -0.8);
  camera.position.copy(camPos); camera.lookAt(camLook);

  // 地上的点击圈
  if (ringT < 1) {
    ringT = Math.min(1, ringT + dt * 2.2);
    ring.scale.setScalar(0.6 + ringT * 1.3); ring.material.opacity = (1 - ringT) * 0.85;
  }

  // 动作按钮 + 提示光点
  let label = null, near = null;
  if (started && !ui.modalOpen && !(chat.open && innerWidth < 1000)) {
    if (player.state === 'sit') label = '起身';
    else if (player.state === 'lie') label = '起床';
    else if (!player.tw && (near = nearestAct())) label = acts[near].label();
  }
  ui.setAction(label);
  if (near) { hint.position.copy(room.anchors[near]); hint.position.y += Math.sin(t * 3) * 0.08; }
  hint.material.opacity = damp(hint.material.opacity, near ? 0.9 : 0, 8, dt);
  hint.scale.setScalar(0.42 + Math.sin(t * 3) * 0.05);

  ui.update(dt, camera);
  renderer.render(scene, camera);
  if (firstFrame) { firstFrame = false; ui.ready(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试用：控制台里可以直接看状态
window.__game = { player, xiaoxing, room, scenery, nav, acts, interact };
