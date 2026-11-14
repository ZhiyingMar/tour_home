// 音效全部用 WebAudio 现场合成，不需要任何音频文件。
let ac = null, master = null, fireGain = null, windGain = null, windFilter = null, noiseBuf = null, crack = 0, muted = false;

function tone(freq, dur, { type = 'sine', vol = 0.12, to = 0, delay = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, { vol = 0.1, type = 'lowpass', freq = 800, delay = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

export const audio = {
  init(startMuted) {
    if (ac) return;
    muted = !!startMuted;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 520;
    fireGain = ac.createGain(); fireGain.gain.value = 0;
    s.connect(f).connect(fireGain).connect(master); s.start();
    // 屋外的风声：一段循环的噪声，风大的时候响一点、亮一点
    const ws = ac.createBufferSource(); windFilter = ac.createBiquadFilter();
    ws.buffer = noiseBuf; ws.loop = true; windFilter.type = 'bandpass'; windFilter.frequency.value = 380; windFilter.Q.value = 0.6;
    windGain = ac.createGain(); windGain.gain.value = 0;
    ws.connect(windFilter).connect(windGain).connect(master); ws.start(0, 0.7);
  },

  resume() { if (ac && ac.state !== 'running') ac.resume(); },

  setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.05); },
  get muted() { return muted; },

  // 每帧调用：壁炉的呼呼声和噼啪声
  tick(dt, fireLevel, windLevel = 0) {
    if (!ac) return;
    windGain.gain.setTargetAtTime(windLevel > 0 ? 0.012 + windLevel * 0.03 : 0, ac.currentTime, 0.4);
    windFilter.frequency.setTargetAtTime(300 + windLevel * 260, ac.currentTime, 0.4);
    fireGain.gain.setTargetAtTime(fireLevel * 0.07, ac.currentTime, 0.1);
    if (fireLevel > 0.3 && (crack -= dt) < 0) {
      crack = 0.08 + Math.random() * 0.5;
      noise(0.03 + Math.random() * 0.04, { vol: 0.04 + Math.random() * 0.08, type: 'highpass', freq: 1500 + Math.random() * 2500 });
    }
  },

  sfx(name) {
    switch (name) {
      case 'tap': tone(720, 0.09, { vol: 0.07, to: 900 }); break;
      case 'step': noise(0.05, { vol: 0.035, freq: 420 }); break;
      case 'chirp': tone(1500, 0.08, { vol: 0.09, to: 2300 }); tone(1800, 0.09, { vol: 0.08, to: 2700, delay: 0.11 }); break;
      case 'chime': [784, 988, 1175].forEach((f, i) => tone(f, 0.5, { vol: 0.08, delay: i * 0.09, type: 'triangle' })); break;
      case 'paper': noise(0.22, { vol: 0.07, type: 'highpass', freq: 2500 }); break;
      case 'ignite': noise(0.7, { vol: 0.14, freq: 900 }); tone(180, 0.4, { vol: 0.06, to: 420 }); break;
      case 'douse': noise(0.5, { vol: 0.1, type: 'highpass', freq: 3000 }); break;
      case 'sit': tone(170, 0.16, { vol: 0.12, to: 90 }); noise(0.12, { vol: 0.05, freq: 300 }); break;
      case 'sleep': [659, 523, 392].forEach((f, i) => tone(f, 0.7, { vol: 0.07, delay: i * 0.22, type: 'triangle' })); break;
      case 'wake': [392, 523, 659].forEach((f, i) => tone(f, 0.4, { vol: 0.07, delay: i * 0.12, type: 'triangle' })); break;
      case 'door': tone(190, 0.12, { vol: 0.12, to: 120 }); noise(0.2, { vol: 0.05, freq: 500, delay: 0.05 }); break;
      case 'whistle': tone(880, 0.55, { vol: 0.05, type: 'triangle' }); tone(1108, 0.55, { vol: 0.04, type: 'triangle' }); tone(880, 0.8, { vol: 0.05, type: 'triangle', delay: 0.7 }); tone(1108, 0.8, { vol: 0.04, type: 'triangle', delay: 0.7 }); break;
      case 'tweet': { const f = 2300 + Math.random() * 1200, n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) tone(f, 0.07, { vol: 0.03, to: f * (1.15 + Math.random() * 0.25), delay: i * 0.11 }); break; }
      case 'plop': tone(520, 0.12, { vol: 0.05, to: 190 }); noise(0.1, { vol: 0.02, type: 'highpass', freq: 2200, delay: 0.03 }); break;
      case 'knock': tone(140, 0.09, { vol: 0.14, to: 100 }); tone(140, 0.09, { vol: 0.14, to: 100, delay: 0.16 }); break;
    }
  },
};
