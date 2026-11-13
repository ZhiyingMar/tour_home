import { bend } from './bend.js';
// 入口：搭场景、接输入、跑主循环、把各个模块串起来。
import * as THREE from 'three';
import { ROOM, LETTER_TEXT } from './config.js';
import { bus, save, saveState } from './store.js';
import { hourNow, daylight, warmth, periodName } from './time.js';
import { damp, clamp, glowTex } from './util.js';
import { Nav } from './nav.js';
import { Scenery } from './scenery.js';
import { buildRoom } from './room.js';
import { buildOutdoor } from './outdoor.js';
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
const bgColor = new THREE.Color('#1b1624');
scene.background = bgColor;
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 220);

const scenery = new Scenery();
const room = buildRoom(scene, scenery.tex);
const outdoor = buildOutdoor(scene);
let area = 'indoor', switching = false; // indoor = 屋里，outdoor = 屋外
const nav = new Nav(ROOM, room.obstacles);
const player = new Player(scene, nav);
const xiaoxing = new XiaoXing(scene, nav, { player, fire: room.fire });

const emit = (type) => bus.emit('action', { type, at: Date.now(), period: periodName(hourNow()) });

// ───── 读档 ─────
room.fire.lit = !!save.fire;
if (room.fire.lit) room.fire.level = 1;
const sp = nav.nearest(save.px ?? 0.6, save.pz ?? 1.6);
player.pos.set(sp.x, 0, sp.z);
function persist() { if (area !== 'indoor') return saveState({ fire: room.fire.lit }); saveState({ fire: room.fire.lit, px: player.posed ? player.back.x : player.pos.x, pz: player.posed ? player.back.z : player.pos.z }); }
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
const basePos = new THREE.Vector3(), baseLook = new THREE.Vector3(), closePos = new THREE.Vector3(), closeLook = new THREE.Vector3();
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
    stand: [5.35, 1.3], face: [6, 1.3], label: () => '🚪 出门走走',
    run() { switchArea('outdoor'); },
  },
  // ── 屋外 ──
  home: {
    area: 'outdoor', stand: [0, 1.5], face: [0, 0], label: () => '🏠 回屋里',
    run() { switchArea('indoor'); },
  },
  bench: {
    area: 'outdoor', stand: [11, 0.1], face: [11, -2], label: () => '🪑 坐一会儿',
    run() { player.sit({ x: 11, y: 0.23, z: -1.12 }); audio.sfx('sit'); emit('sit_bench'); xiaoxing.nudge(); },
  },
};
const actArea = (id) => acts[id].area || 'indoor';

// 进屋 / 出门：黑幕一闪，换场景
function switchArea(to) {
  if (switching || area === to) return;
  switching = true;
  ui.fade(true); audio.sfx('door');
  setTimeout(() => {
    const out = to === 'outdoor';
    area = to;
    room.group.visible = !out; outdoor.group.visible = out;
    scene.background = out ? outdoor.skyTex : bgColor;
    player.nav = out ? outdoor.nav : nav;
    player.stop();
    if (out) { player.pos.set(0, 0, 1.7); player.yaw = 0; }
    else { player.pos.set(5.3, 0, 1.3); player.yaw = -Math.PI / 2; room.key.position.set(5, 11, 8); room.key.target.position.set(0, 0, -0.5); }
    xiaoxing.enter(to, player.nav, player.pos.x + (out ? 1.2 : -1.1), player.pos.z + 0.6);
    emit(out ? 'go_outside' : 'come_home');
    ui.fade(false);
    switching = false;
  }, 460);
}

function standUp(then) {
  const was = player.state;
  if (was === 'lie') { ui.sleep(false); audio.sfx('wake'); emit('wake'); }
  player.stand(then);
}

function interact(id) {
  const a = acts[id];
  if (!a || player.tw || switching || actArea(id) !== area) return;
  if (((id === 'sofa' || id === 'bench') && player.state === 'sit') || (id === 'bed' && player.state === 'lie')) return standUp();
  const go = () => player.walkTo(a.stand[0], a.stand[1], () => {
    player.turn = Math.atan2(a.face[0] - player.pos.x, a.face[1] - player.pos.z);
    a.run();
  });
  if (player.posed) standUp(go); else go();
}

function nearestAct() {
  let best = null, bd = 1.45;
  for (const id in acts) {
    if (actArea(id) !== area) continue;
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
// 双指捏合缩放（电脑上用滚轮）。zoomT：0 = 默认远景，1 = 贴近角色，负数 = 再拉远一点
const ZMIN = -0.4, ZMAX = 1;
let zoomT = 0, zoom = 0, pinchD = 0;
const pts = new Map();
const pinchDist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener('pointerdown', (e) => {
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now() };
  else { down = null; if (pts.size === 2) pinchD = pinchDist(); }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pts.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (pts.size === 2) { const d = pinchDist(); zoomT = clamp(zoomT + (d - pinchD) / 240, ZMIN, ZMAX); pinchD = d; }
});
const endPointer = (e) => { pts.delete(e.pointerId); };
canvas.addEventListener('pointercancel', (e) => { endPointer(e); down = null; });
canvas.addEventListener('pointerleave', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomT = clamp(zoomT - e.deltaY * 0.0016, ZMIN, ZMAX); }, { passive: false });
// 拦掉 Safari 自己的整页缩放手势
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
canvas.addEventListener('pointerup', (e) => {
  endPointer(e);
  if (!down) return;
  const ok = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 16 && performance.now() - down.t < 700;
  down = null;
  if (ok) tap(e.clientX, e.clientY);
});

function tap(x, y) {
  if (!started || ui.modalOpen || switching) return;
  audio.resume();
  if (player.state === 'lie') return standUp();
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.intersectObject(xiaoxing.hit).length) return onXiaoxingTap();
  const out = area === 'outdoor';
  const h = ray.intersectObjects(out ? outdoor.hits : room.hits)[0];
  if (h) { audio.sfx('tap'); return interact(h.object.userData.id); }
  if (!ray.ray.intersectPlane(ground, P) || player.tw) return;
  if (out && P.distanceTo(player.pos) > 45) return;
  const t = out ? outdoor.nav.nearest(P.x, P.z) : nav.nearest(clamp(P.x, ROOM.x0, ROOM.x1), clamp(P.z, ROOM.z0, ROOM.z1));
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
ui.onWake = () => { if (player.state === 'lie') standUp(); };
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
  room.setEnv({ dl, wm, sleep: sleepK, t, dt, out: area === 'outdoor' });
  scenery.update(dt, h, t);
  audio.tick(dt, room.fire.level);

  // 镜头：开场从远处推近，之后轻轻跟着人
  if (started) intro = Math.min(1, intro + dt / 2.6);
  const k = intro * intro * (3 - 2 * intro), px = player.pos.x;
  const pp = player.pos, out = area === 'outdoor';
  zoom = damp(zoom, zoomT, 9, dt);
  if (out) {
    basePos.set(pp.x, 9.6 + 2.2 * (1 - k), pp.z + 13.6 + 5 * (1 - k));
    baseLook.set(pp.x, 1, pp.z - 1.6);
  } else {
    basePos.set(px * 0.1 + Math.sin(t * 0.12) * 0.25 * (1 - k), 7.8 + 2.2 * (1 - k) - sleepK * 0.5, 13 + 5 * (1 - k) - sleepK * 0.8);
    baseLook.set(px * 0.16 + sleepK * 0.8, 1.3, -0.8);
  }
  closePos.set(pp.x, pp.y + 4.4, pp.z + 7);
  closeLook.set(pp.x, pp.y + 1, pp.z);
  camPos.lerpVectors(basePos, closePos, zoom);
  camLook.lerpVectors(baseLook, closeLook, Math.max(0, zoom));
  camera.position.copy(camPos); camera.lookAt(camLook);

  // 屋外：地平线往下弯；主光和影子跟着人走
  bend.value.set(out ? 0.011 : 0, camPos.distanceTo(pp) + 3);
  if (out) {
    room.key.position.set(pp.x + 5, 11, pp.z + 8); room.key.target.position.set(pp.x, 0, pp.z - 0.5);
    const o = outdoor.update(dt, t, { dl, wm, h, fireLevel: room.fire.level }, pp.x, pp.z);
    if (o.whistle) audio.sfx('whistle');
  }

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
  if (near) { hint.position.copy((out ? outdoor : room).anchors[near]); hint.position.y += Math.sin(t * 3) * 0.08; }
  hint.material.opacity = damp(hint.material.opacity, near ? 0.9 : 0, 8, dt);
  hint.scale.setScalar(0.42 + Math.sin(t * 3) * 0.05);

  ui.update(dt, camera);
  renderer.render(scene, camera);
  if (firstFrame) { firstFrame = false; ui.ready(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试用：控制台里可以直接看状态
window.__game = { player, xiaoxing, room, outdoor, scenery, nav, acts, interact, switchArea };
