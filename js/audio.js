// Beyond the Horizon · synthesized audio (no files): rumble, wind, alarm, breath, hits
let ctx = null, master, rumbleG, windG, breathG, alarmG, alarmOsc, humG;
let muted = false;
function noiseBuffer(type) {
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (type === 'pink') { b0 = 0.97 * b0 + 0.03 * w; d[i] = b0 * 4 + w * 0.1; }
    else d[i] = w;
  }
  return buf;
}
function loop(buf, filterType, freq, q, gainNode) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  s.connect(f); f.connect(gainNode); s.start(); return f;
}
export const audio = {
  start(existing) {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = existing || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    const brown = noiseBuffer('brown'), pink = noiseBuffer('pink'), white = noiseBuffer('white');
    rumbleG = ctx.createGain(); rumbleG.gain.value = 0; rumbleG.connect(master); loop(brown, 'lowpass', 140, 0.7, rumbleG);
    windG = ctx.createGain(); windG.gain.value = 0; windG.connect(master); this.windF = loop(pink, 'bandpass', 500, 0.6, windG);
    breathG = ctx.createGain(); breathG.gain.value = 0; breathG.connect(master); loop(white, 'bandpass', 900, 1.4, breathG);
    humG = ctx.createGain(); humG.gain.value = 0; humG.connect(master);
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 55; hum.connect(humG); hum.start();
    alarmG = ctx.createGain(); alarmG.gain.value = 0; alarmG.connect(master);
    alarmOsc = ctx.createOscillator(); alarmOsc.type = 'triangle'; alarmOsc.frequency.value = 660; alarmOsc.connect(alarmG); alarmOsc.start();
    this.white = white;
  },
  t() { return ctx ? ctx.currentTime : 0; },
  set(node, v, tc = 0.15) { if (ctx && node) node.gain.setTargetAtTime(v, ctx.currentTime, tc); },
  rumble(v) { this.set(rumbleG, v * 0.9); },
  wind(v, f = 500) { this.set(windG, v * 0.35); if (this.windF) this.windF.frequency.setTargetAtTime(f, ctx.currentTime, 0.3); },
  hum(v) { this.set(humG, v * 0.05); },
  breath(on, phase) { if (!ctx) return; const v = on ? (0.5 + 0.5 * Math.sin(phase)) ** 3 * 0.05 : 0; this.set(breathG, v, 0.08); },
  alarm(on, time) {
    if (!ctx) return;
    const beat = on ? ((time % 1.2) < 0.35 ? 0.06 : 0) : 0;
    alarmOsc.frequency.setTargetAtTime((time % 2.4) < 1.2 ? 660 : 520, ctx.currentTime, 0.01);
    this.set(alarmG, beat, 0.02);
  },
  burst(freq = 1200, dur = 0.12, vol = 0.25, type = 'bandpass') {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = vol; g.gain.setTargetAtTime(0, ctx.currentTime + dur * 0.3, dur * 0.35);
    s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(ctx.currentTime + dur * 3);
  },
  tone(freq = 880, dur = 0.08, vol = 0.06, type = 'sine') {
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol; g.gain.setTargetAtTime(0, ctx.currentTime + dur, dur * 0.4);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur * 4);
  },
  whistle(dur = 2.6, vol = 0.06) { // an incoming meteor: a falling, rising-in-volume shriek
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(2600, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(vol * 3, ctx.currentTime + dur * 0.95); g.gain.setTargetAtTime(0, ctx.currentTime + dur, 0.03);
    s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(ctx.currentTime + dur + 0.3);
  },
  siren(on, time) { this.alarm(on, time); },
  hit() { this.burst(2400, 0.08, 0.22); this.burst(300, 0.12, 0.25, 'lowpass'); },
  zap() { this.burst(3200, 0.06, 0.12, 'highpass'); },
  boom() { this.burst(90, 0.9, 0.6, 'lowpass'); this.burst(400, 0.4, 0.2); },
  ui() { this.tone(1320, 0.05, 0.04); },
  mute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
};
