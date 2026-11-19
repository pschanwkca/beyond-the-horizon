// Beyond the Horizon · the three things on Mars that fight back.
// 收割者偵察機  Reaper scout   — a self-copying probe, cutting up the old rover for metal. Weak point: dorsal radiators (from behind).
// 鹽穴盲行者    blind brine-walker — eyeless, hunts by heat in the lava tube's brine caves. Weak point: the heat pits, when it rears.
// 守熱者        the guardian   — the top predator round the shard's heat. Two phases. Weak point: the glowing chest, when it rears or is stuck after a charge.
// Every move has a wind-up you can read; each speaks a few lines through Lyra's chip.
import * as THREE from 'three';
import { clamp, damp, dampAngle, smooth, lerp, angDiff, mulberry, canvasTex } from './util.js';

// ---------------- shared bits ----------------
function h3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function n3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), L(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v),
    L(L(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), L(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v), w);
}
const f3 = (x, y, z) => n3(x, y, z) * 0.55 + n3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + n3(x * 4.3, y * 4.3, z * 4.3) * 0.15;
function lumpy(geo, amp, freq, seed = 0) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = f3(v.x * freq + seed, v.y * freq, v.z * freq) - 0.5; v.multiplyScalar(1 + n * amp); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals(); return geo;
}
// a tiling normal map from noise: pores and grain on skin, pits on rock, scuffs on metal
const normCache = {};
function noiseNormal(kind) {
  if (normCache[kind]) return normCache[kind];
  const S = 256, R = mulberry(kind.length * 31 + 7), hgt = new Float32Array(S * S);
  const fr = kind === 'skin' ? 18 : kind === 'rock' ? 9 : 26;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = x / S * Math.PI * 2, b = y / S * Math.PI * 2;      // wrap on a torus so it tiles
    const px = Math.cos(a) * fr / 6.28, py = Math.sin(a) * fr / 6.28, pz = Math.cos(b) * fr / 6.28, pw = Math.sin(b) * fr / 6.28;
    let h = f3(px + pz * 0.7, py + pw * 0.7, pz - pw);
    if (kind === 'rock') h = Math.abs(h - 0.5) * 2;
    if (kind === 'metal') h = h * 0.3 + (R() < 0.004 ? 1 : 0);
    hgt[y * S + x] = h;
  }
  const tex = canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S), k = kind === 'rock' ? 5 : kind === 'skin' ? 3 : 1.5;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hx = hgt[y * S + (x + 1) % S] - hgt[y * S + (x + S - 1) % S], hy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x];
      const nx = -hx * k, ny = -hy * k, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * S + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
  normCache[kind] = tex; return tex;
}
// glowing cracks for the guardian's carapace
function veinTex() {
  return canvasTex(512, 512, (g, w) => {
    const R = mulberry(77); g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = R() * w, y = R() * w, a = R() * 6.28; g.lineWidth = 1 + R() * 3.5; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 14; s++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * 16; y += Math.sin(a) * 16; g.lineTo(x, y); if (R() < 0.12) { g.stroke(); g.lineWidth *= 0.6; g.beginPath(); g.moveTo(x, y); } }
      g.stroke();
    }
    g.filter = 'blur(3px)'; g.globalCompositeOperation = 'lighter'; g.drawImage(g.canvas, 0, 0); g.filter = 'none';
  }, { repeat: true });
}
const mk = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
// a ground ring that shows where a blow will land
function ringMark(scene) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uK: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uK, uT; varying vec2 vUv; void main(){ float a = uK * (0.55 + 0.45 * sin(uT * 18.0)); gl_FragColor = vec4(vec3(1.0, 0.45, 0.15) * a, a); }',
  }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.86, 48), new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.add(fill); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
  return { m, show(p, r, k, t) { m.visible = k > 0.01; m.position.set(p.x, p.y + 0.06, p.z); m.scale.setScalar(r); m.material.uniforms.uK.value = k; m.material.uniforms.uT.value = t; fill.material.opacity = k * 0.12; }, hide() { m.visible = false; } };
}

// ---------------- the AI every creature shares ----------------
// cfg: name, boss, hp, poise, radius, height, speed, turn, home, yaw, moves[], sense(e, api, d), leash, bound(p), floorAt(x,z), anim(e,dt,t), lines, onDeath
function core(scene, cfg) {
  const e = {
    name: cfg.name, boss: !!cfg.boss, maxHp: cfg.hp, hp: cfg.hp, maxPoise: cfg.poise, poise: 0, radius: cfg.radius, height: cfg.height,
    pos: cfg.home.clone(), yaw: cfg.yaw || 0, home: cfg.home.clone(), homeYaw: cfg.yaw || 0, alive: true, aware: false, staggered: false, critHold: 0,
    lines: cfg.lines, said: {}, state: 'idle', st: 0, move: null, mt: 0, did: false, cd: 1.0, phase: 1, flash: 0, flinch: 0, speed: 0, deathT: 0,
    root: cfg.root, aim: new THREE.Vector3(), wander: 0, tell: 0, ctx: null,
  };
  const tmp = new THREE.Vector3();
  const fwd = (out, k = 1) => out.set(Math.sin(e.yaw) * k, 0, Math.cos(e.yaw) * k);
  e.forward = fwd;
  e.hurt = (dmg, pd, from) => {
    if (!e.alive) return;
    e.hp = Math.max(0, e.hp - dmg); e.flash = 0.16;
    if (!e.aware) { e.aware = true; e.state = 'chase'; e.ctx && e.ctx.say(e, 'spot'); }
    if (e.hp <= 0) { e.alive = false; e.state = 'dead'; e.deathT = 0; e.staggered = false; e.ctx && e.ctx.say(e, 'death', 3.4); cfg.onDeath && cfg.onDeath(e); return; }
    if (e.hp < e.maxHp * 0.5 && !e.said.half) e.ctx && e.ctx.say(e, 'half');
    if (cfg.boss && e.phase === 1 && e.hp < e.maxHp * 0.5) { e.phase = 2; cfg.onPhase && cfg.onPhase(e); }
    e.posture(pd, false);
    // small things flinch if you catch them before they commit to a blow
    if (!cfg.boss && !e.staggered && !(e.state === 'attack' && e.mt > e.move.wind - 0.25)) { e.flinch = 0.28; if (e.state === 'attack') { e.state = 'chase'; e.move = null; e.cd = 0.4; } }
  };
  e.posture = (n, parried) => {
    if (!e.alive || e.staggered) return;
    e.poise += n;
    if (e.poise >= e.maxPoise) { e.poise = 0; e.staggered = true; e.state = 'stagger'; e.st = 0; e.move = null; e.critHold = 0; cfg.ring && cfg.ring.hide(); }
  };
  e.reset = () => {
    e.hp = e.maxHp; e.poise = 0; e.alive = true; e.aware = false; e.staggered = false; e.state = 'idle'; e.move = null; e.cd = 1; e.phase = 1; e.said = {};
    e.pos.copy(e.home); e.yaw = e.homeYaw; e.root.visible = true; e.deathT = 0; e.flinch = 0; cfg.ring && cfg.ring.hide(); cfg.onReset && cfg.onReset(e);
  };
  e.update = (dt, t, api) => {
    const hero = api.hero, hp = hero.st.pos;
    const d = Math.hypot(hp.x - e.pos.x, hp.z - e.pos.z);
    const toHero = Math.atan2(hp.x - e.pos.x, hp.z - e.pos.z);
    e.flash = Math.max(0, e.flash - dt); e.poise = Math.max(0, e.poise - (e.staggered ? 0 : cfg.poise * 0.08 * dt));
    if (!e.alive) { e.deathT += dt; cfg.anim(e, dt, t); return; }
    if (api.C.dead && e.aware) { e.aware = false; e.state = 'return'; }
    // leash: lose interest far from home and walk back, healing
    if (e.aware && cfg.leash && Math.hypot(hp.x - e.home.x, hp.z - e.home.z) > cfg.leash) { e.aware = false; e.state = 'return'; e.move = null; cfg.ring && cfg.ring.hide(); }
    if (e.flinch > 0) { e.flinch -= dt; cfg.anim(e, dt, t); return; }
    switch (e.state) {
      case 'idle': case 'return': {
        const back = e.state === 'return';
        tmp.copy(e.home).sub(e.pos).setY(0);
        if (back) { if (tmp.length() < 1) { e.state = 'idle'; e.hp = e.maxHp; } else { e.yaw = dampAngle(e.yaw, Math.atan2(tmp.x, tmp.z), cfg.turn, dt); e.speed = damp(e.speed, cfg.speed * 0.6, 4, dt); } }
        else { e.wander += dt; const a = e.homeYaw + Math.sin(e.wander * 0.21) * 1.4; e.yaw = dampAngle(e.yaw, tmp.length() > 4 ? Math.atan2(tmp.x, tmp.z) : a, 0.8, dt); e.speed = damp(e.speed, cfg.idleSpeed || 0, 3, dt); }
        if (!api.C.dead && cfg.sense(e, api, d)) { e.aware = true; e.state = 'alert'; e.st = 0; api.say(e, 'spot'); }
        break;
      }
      case 'alert': {
        e.st += dt; e.speed = damp(e.speed, 0, 6, dt); e.yaw = dampAngle(e.yaw, toHero, cfg.turn, dt);
        if (e.st > (cfg.alertT || 1.1)) e.state = 'chase';
        break;
      }
      case 'chase': {
        e.cd -= dt; e.yaw = dampAngle(e.yaw, toHero, cfg.turn, dt);
        const facing = Math.abs(angDiff(e.yaw, toHero)) < 0.5;
        let pick = null;
        if (e.cd <= 0 && facing) {
          const opts = cfg.moves.filter((m) => d <= m.range && d >= (m.min || 0) && (!m.p2 || e.phase === 2));
          let wsum = opts.reduce((s, m) => s + m.w, 0), r = Math.random() * wsum;
          for (const m of opts) { r -= m.w; if (r <= 0) { pick = m; break; } }
        }
        if (pick) { e.state = 'attack'; e.move = pick; e.mt = 0; e.did = false; e.aim.copy(hp); e.speed = 0; pick.begin && pick.begin(e, api); }
        else {
          const keep = cfg.keep || 2.2;
          e.speed = damp(e.speed, d > keep ? cfg.speed * (d > 9 ? 1 : 0.65) : 0, 5, dt);
        }
        break;
      }
      case 'attack': {
        const m = e.move; e.mt += dt;
        if (e.mt < m.wind) { e.yaw = dampAngle(e.yaw, toHero, m.track ?? 2.5, dt); e.aim.lerp(hp, 1 - Math.exp(-(m.trackAim ?? 4) * dt)); }
        e.speed = 0;
        if (m.tick) m.tick(e, api, dt, t);
        if (!e.did && e.mt >= m.wind) { e.did = true; m.fire ? m.fire(e, api) : api.strike(e, { from: fwd(tmp, m.offset || 0).add(e.pos), dmg: m.dmg, reach: m.reach, arc: m.arc ?? 1.0, knock: m.knock }); }
        if (e.mt >= m.wind + (m.act || 0.15) + m.rec) { e.state = 'chase'; e.cd = (m.cool ?? 0.6) * (e.phase === 2 ? 0.6 : 1); e.move = null; m.end && m.end(e, api); }
        break;
      }
      case 'stagger': {
        e.st += dt; e.speed = 0;
        if (e.critHold > 0) { e.critHold -= dt; break; }
        if (e.st > (cfg.boss ? 2.4 : 2.8)) { e.staggered = false; e.state = 'chase'; e.cd = 0.5; }
        break;
      }
    }
    // move
    if (e.speed > 0.01) { e.pos.x += Math.sin(e.yaw) * e.speed * dt; e.pos.z += Math.cos(e.yaw) * e.speed * dt; }
    // keep out of the hero, inside the arena
    const pd = Math.hypot(hp.x - e.pos.x, hp.z - e.pos.z), minD = e.radius + hero.st.radius;
    if (pd < minD && pd > 1e-3) { const k = (minD - pd) / pd; if (e.boss || e.state === 'attack') { hp.x += (hp.x - e.pos.x) * k; hp.z += (hp.z - e.pos.z) * k; } else { e.pos.x -= (hp.x - e.pos.x) * k; e.pos.z -= (hp.z - e.pos.z) * k; } }
    cfg.bound && cfg.bound(e.pos, e.radius);
    e.pos.y = cfg.floorAt(e.pos.x, e.pos.z);
    cfg.anim(e, dt, t);
  };
  return e;
}

// ======================= 收割者偵察機 =======================
export function reaperScout(scene, { home, yaw = 0, floorAt, bound }) {
  const root = new THREE.Group(); scene.add(root);
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.38, metalness: 0.85, normalMap: noiseNormal('metal'), normalScale: new THREE.Vector2(0.5, 0.5) });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.5, metalness: 0.7 });
  const edgeM = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.25, metalness: 0.95 });
  const finM = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.4, metalness: 0.6, emissive: 0xff5a1a, emissiveIntensity: 0.4 });
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x220806, emissive: 0xff3a14, emissiveIntensity: 2.2 });
  const body = grp(root, 0, 1.05, 0);
  const thorax = mk(new THREE.CapsuleGeometry(0.36, 0.5, 6, 14).rotateX(Math.PI / 2), metal, body); thorax.scale.set(1.15, 0.72, 1);
  const abd = grp(body, 0, 0.05, -0.62);
  for (let i = 0; i < 4; i++) { const s = mk(new THREE.CapsuleGeometry(0.36 - i * 0.05, 0.18, 4, 14).rotateX(Math.PI / 2), i % 2 ? dark : metal, abd, 0, 0.04 * i, -0.28 * i); s.scale.set(1.15, 0.78, 1); }
  const head = grp(body, 0, 0.06, 0.62);
  mk(new THREE.ConeGeometry(0.3, 0.62, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), metal, head, 0, 0, 0.18).scale.set(1.25, 0.62, 1);
  const eyes = [[-0.11, 0.07, 0.24], [0.11, 0.07, 0.24], [0, 0.12, 0.3]].map(([x, y, z]) => mk(new THREE.SphereGeometry(0.045, 10, 8), eyeM, head, x, y, z));
  const eyeLight = new THREE.PointLight(0xff4a1a, 0.6, 6, 2); eyeLight.position.set(0, 0.1, 0.4); head.add(eyeLight);
  // dorsal radiators: the weak point
  const fins = [];
  for (let i = 0; i < 4; i++) { const f = mk(new THREE.BoxGeometry(0.03, 0.42, 0.56), finM, body, (i - 1.5) * 0.11, 0.42, -0.08); f.rotation.z = (i - 1.5) * 0.12; fins.push(f); }
  mk(new THREE.BoxGeometry(0.5, 0.06, 0.62), dark, body, 0, 0.24, -0.08);
  // six legs
  const legs = [];
  [[0.36, 0.28], [0.4, -0.12], [0.36, -0.55]].forEach(([x, z], row) => [-1, 1].forEach((s) => {
    const hip = grp(body, x * s, -0.04, z); const fem = grp(hip); fem.rotation.z = s * 0.95;
    mk(new THREE.CylinderGeometry(0.05, 0.065, 0.7, 8).translate(0, 0.35, 0), metal, fem);
    const knee = grp(fem, 0, 0.7, 0); knee.rotation.z = s * 2.35;
    mk(new THREE.CylinderGeometry(0.02, 0.05, 0.95, 8).translate(0, 0.475, 0), edgeM, knee);
    legs.push({ hip, fem, knee, s, ph: (row % 2 === 0) === (s > 0) ? 0 : Math.PI });
  }));
  // the cutting arms, folded like a mantis
  const arms = [-1, 1].map((s) => {
    const sh = grp(head, 0.22 * s, -0.04, 0.02); const up = grp(sh); mk(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8).translate(0, 0.25, 0), metal, up);
    const el = grp(up, 0, 0.5, 0); const blade = mk(new THREE.ConeGeometry(0.06, 0.9, 4).translate(0, 0.45, 0), edgeM, el); blade.scale.set(0.35, 1, 1.2);
    return { sh, up, el, s };
  });
  let walkPh = 0;
  const e = core(scene, {
    name: '收割者偵察機', hp: 150, poise: 46, radius: 0.95, height: 1.5, speed: 4.6, idleSpeed: 0.4, turn: 4.5, home, yaw, leash: 60, keep: 2.0,
    root, floorAt, bound,
    lines: {
      spot: ['偵測到：短命者。', '攜帶信標頻率。收割程序，開始。'],
      half: ['結構損傷：百分之五十。重新計算。'],
      death: ['訊號……上傳中……', '其他單位……會嚟。'],
    },
    sense: (e, api, d) => d < 9 || (d < 24 && Math.abs(angDiff(e.yaw, Math.atan2(api.hero.st.pos.x - e.pos.x, api.hero.st.pos.z - e.pos.z))) < 1.1),
    moves: [
      { name: 'slash', range: 2.8, w: 3, wind: 0.6, act: 0.14, rec: 0.7, dmg: 18, reach: 2.6, arc: 1.0, knock: 4, offset: 0.6 },
      { name: 'jab', range: 3.2, w: 2, wind: 0.38, act: 0.1, rec: 0.55, dmg: 12, reach: 3.0, arc: 0.5, knock: 3, offset: 0.6 },
      { name: 'leap', range: 9, min: 4, w: 2, wind: 0.75, act: 0.45, rec: 1.1, dmg: 24, knock: 9, track: 3, trackAim: 6,
        tick: (e, api, dt) => { if (e.mt > e.move.wind && e.mt < e.move.wind + 0.45) { const k = dt / 0.45; e.pos.x += (e.aim.x - e.pos.x) * Math.min(1, k * 2.2); e.pos.z += (e.aim.z - e.pos.z) * Math.min(1, k * 2.2); } },
        fire: () => {}, end: () => {} },
    ],
    anim: animate,
  });
  // the leap lands at the end of its flight
  const origUpdate = e.update;
  e.update = (dt, t, api) => {
    const m = e.move, before = e.mt;
    origUpdate(dt, t, api);
    if (m && m.name === 'leap' && e.state === 'attack' && before < m.wind + 0.45 && e.mt >= m.wind + 0.45) {
      api.strike(e, { from: e.pos.clone(), dmg: m.dmg, reach: 2.3, arc: Math.PI, knock: m.knock }); api.spark(e.pos.clone().setY(e.pos.y + 0.2), 1.4);
    }
  };
  e.weakHit = (from) => Math.abs(angDiff(e.yaw, Math.atan2(from.x - e.pos.x, from.z - e.pos.z))) > 1.9;   // from behind: the radiators
  function animate(e, dt, t) {
    root.position.copy(e.pos); root.rotation.set(0, e.yaw, 0);
    const moving = e.speed; walkPh += dt * (2 + moving * 3.2);
    let bodyY = 1.05, pitch = 0, armUp = 0, armFwd = 0;
    const m = e.move, k = m ? e.mt / m.wind : 0;
    if (e.state === 'attack' && m) {
      if (m.name === 'slash') { const wind = smooth(0, 1, k), cut = smooth(1, 1 + 0.14 / m.wind, k); armUp = wind * (1 - cut); armFwd = cut; pitch = -0.15 * wind + 0.25 * cut; }
      if (m.name === 'jab') { const wind = smooth(0, 1, k), cut = smooth(1, 1.3, k); armUp = wind * 0.4 * (1 - cut); armFwd = cut * 1.2; pitch = 0.15 * cut; }
      if (m.name === 'leap') { const crouch = smooth(0, 1, k), air = e.mt > m.wind && e.mt < m.wind + 0.45 ? Math.sin((e.mt - m.wind) / 0.45 * Math.PI) : 0; bodyY = 1.05 - 0.4 * crouch * (e.mt < m.wind ? 1 : 0) + air * 1.6; pitch = -0.3 * crouch + 0.3 * air; armUp = 0.6 * crouch; }
    }
    if (e.state === 'stagger') { bodyY = 0.72; pitch = 0.25 + Math.sin(t * 9) * 0.03; armUp = -0.3; }
    if (!e.alive) { const c = smooth(0, 1.2, e.deathT); bodyY = lerp(1.05, 0.38, c); pitch = 0.2 * c; body.rotation.z = 0.35 * c; }
    body.position.y = damp(body.position.y, bodyY, 12, dt); body.rotation.x = damp(body.rotation.x, pitch, 10, dt);
    for (const L of legs) {
      const a = walkPh + L.ph, mv = Math.min(1, moving / 3) * (e.alive ? 1 : 0);
      L.hip.rotation.y = Math.sin(a) * 0.35 * mv * L.s; L.fem.rotation.z = L.s * (0.95 - Math.max(0, Math.cos(a)) * 0.3 * mv + (bodyY < 0.9 ? -0.25 : 0) + (!e.alive ? -0.6 : 0));
    }
    for (const A of arms) {
      A.up.rotation.x = lerp(lerp(-0.4, -2.3, armUp), 1.3, armFwd); A.up.rotation.z = -A.s * 0.25;
      A.el.rotation.x = lerp(lerp(-2.4, -1.2, armUp), -0.3, armFwd);
    }
    const tell = e.state === 'attack' && e.mt < (m ? m.wind : 0) ? smooth(0, m.wind, e.mt) : 0;
    eyeM.emissiveIntensity = (e.alive ? 2.2 + tell * 5 : Math.max(0, 2.2 - e.deathT * 2)) + e.flash * 10;
    eyeLight.intensity = e.alive ? 0.6 + tell * 3 : 0;
    finM.emissiveIntensity = 0.35 + (e.state === 'chase' ? 0.3 : 0) + tell * 0.8 + e.flash * 4;
    metal.emissive.setRGB(e.flash * 2, e.flash * 1.6, e.flash * 1.2);
  }
  return e;
}

// ======================= 鹽穴盲行者 =======================
export function blindWalker(scene, { home, yaw = 0, floorAt, bound, heatOf }) {
  const root = new THREE.Group(); scene.add(root);
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xcdb8ab, roughness: 0.48, metalness: 0, sheen: 0.8, sheenColor: new THREE.Color(0xffb8a0), sheenRoughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.35,
    normalMap: noiseNormal('skin'), normalScale: new THREE.Vector2(0.8, 0.8), emissive: 0x3a1410, emissiveIntensity: 0.25 });
  const bone = new THREE.MeshStandardMaterial({ color: 0x3a2e2a, roughness: 0.6 });
  const pitM = new THREE.MeshStandardMaterial({ color: 0x0c1a1a, emissive: 0x3affd8, emissiveIntensity: 0.9 });
  const hips = grp(root, 0, 0.9, 0);
  const spine = grp(hips); spine.rotation.x = 1.15;         // crawling: the trunk leans far forward
  mk(new THREE.CapsuleGeometry(0.2, 0.5, 6, 14), skin, hips).scale.set(1.2, 1, 0.9);
  const chest = grp(spine, 0, 0.55, 0);
  mk(new THREE.CapsuleGeometry(0.24, 0.42, 6, 16), skin, spine, 0, 0.42, 0).scale.set(1.25, 1, 0.8);
  for (let i = 0; i < 5; i++) mk(new THREE.TorusGeometry(0.26 - i * 0.012, 0.018, 6, 20, Math.PI * 1.3).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.15), skin, spine, 0, 0.28 + i * 0.09, 0.06).scale.set(1.15, 1, 0.85);
  const neck = grp(chest, 0, 0.22, 0.05);
  const head = grp(neck, 0, 0.2, 0.05);
  mk(new THREE.CapsuleGeometry(0.13, 0.3, 6, 14).rotateX(-0.3), skin, head, 0, 0.12, 0.05).scale.set(1, 1, 1.1);
  const jaw = grp(head, 0, -0.02, 0.1); mk(new THREE.CapsuleGeometry(0.09, 0.2, 4, 10).rotateX(1.2), bone, jaw, 0, -0.03, 0.08);
  const pits = [[-0.07, 0.24, 0.18], [0.07, 0.24, 0.18], [-0.1, 0.16, 0.2], [0.1, 0.16, 0.2]].map(([x, y, z]) => mk(new THREE.SphereGeometry(0.03, 8, 6), pitM, head, x, y, z));
  const pitLight = new THREE.PointLight(0x3affd8, 0.5, 5, 2); pitLight.position.set(0, 0.3, 0.3); head.add(pitLight);
  const arm = (s) => {
    const sh = grp(chest, 0.3 * s, 0.05, 0); const up = grp(sh); mk(new THREE.CapsuleGeometry(0.06, 0.62, 4, 10).translate(0, 0.37, 0), skin, up);
    const el = grp(up, 0, 0.74, 0); mk(new THREE.CapsuleGeometry(0.05, 0.7, 4, 10).translate(0, 0.4, 0), skin, el);
    const hand = grp(el, 0, 0.8, 0); for (let f = -1; f <= 1; f++) { const c = mk(new THREE.ConeGeometry(0.025, 0.36, 6).translate(0, 0.18, 0), bone, hand, f * 0.04, 0, 0); c.rotation.z = f * 0.18; c.rotation.x = 0.3; }
    return { sh, up, el, hand, s };
  };
  const leg = (s) => {
    const hp = grp(hips, 0.16 * s, -0.05, 0); const th = grp(hp); mk(new THREE.CapsuleGeometry(0.08, 0.45, 4, 10).translate(0, -0.3, 0), skin, th);
    const kn = grp(th, 0, -0.6, 0); mk(new THREE.CapsuleGeometry(0.06, 0.45, 4, 10).translate(0, -0.28, 0), skin, kn);
    const an = grp(kn, 0, -0.56, 0); mk(new THREE.CapsuleGeometry(0.04, 0.24, 4, 8).translate(0, -0.14, 0), skin, an);
    return { hp, th, kn, an, s };
  };
  const A = [arm(-1), arm(1)], Lg = [leg(-1), leg(1)];
  let ph = 0;
  const e = core(scene, {
    name: '鹽穴盲行者', hp: 190, poise: 58, radius: 0.85, height: 1.6, speed: 3.6, idleSpeed: 0.3, turn: 3.2, home, yaw, leash: 40, keep: 2.1, alertT: 1.6,
    root, floorAt, bound,
    lines: {
      spot: ['熱……一團新嘅熱……', '你唔係呢度嘅熱。'],
      half: ['痛……好耐冇痛過。'],
      death: ['返去……返去個暖嘅地方……'],
    },
    // it is blind: it feels heat. A lit cutter, a sprint or a swing carries further
    sense: (e, api, d) => d < (heatOf ? heatOf() : 6),
    moves: [
      { name: 'claws', range: 2.9, w: 3, wind: 0.7, act: 0.16, rec: 0.75, dmg: 20, reach: 2.7, arc: 1.1, knock: 5, offset: 0.5 },
      { name: 'lunge', range: 7.5, min: 3.2, w: 2, wind: 0.85, act: 0.4, rec: 1.0, dmg: 26, reach: 1.6, arc: 1.4, knock: 7, track: 3.5, trackAim: 5,
        tick: (e, api, dt) => { if (e.mt > e.move.wind && e.mt < e.move.wind + 0.4) { e.pos.x += Math.sin(e.yaw) * 13 * dt; e.pos.z += Math.cos(e.yaw) * 13 * dt; if (!e.hitL && Math.hypot(api.hero.st.pos.x - e.pos.x, api.hero.st.pos.z - e.pos.z) < 1.7) { e.hitL = api.strike(e, { from: e.pos.clone(), dmg: e.move.dmg, reach: 1.9, arc: 1.4, knock: e.move.knock }); } } },
        begin: (e) => { e.hitL = false; }, fire: () => {} },
      { name: 'double', range: 2.9, w: 1, wind: 0.6, act: 0.5, rec: 0.9, dmg: 14, reach: 2.6, arc: 1.2, knock: 3, offset: 0.5,
        tick: (e, api) => { if (!e.d2 && e.mt > e.move.wind + 0.38) { e.d2 = true; api.strike(e, { from: e.forward(new THREE.Vector3(), 0.5).add(e.pos), dmg: 16, reach: 2.6, arc: 1.2, knock: 5 }); } },
        begin: (e) => { e.d2 = false; } },
    ],
    anim: animate,
  });
  e.weakHit = () => e.state === 'attack' && e.move && e.move.name !== 'lunge' && e.mt < e.move.wind;   // reared up, the heat pits exposed
  function animate(e, dt, t) {
    root.position.copy(e.pos); root.rotation.set(0, e.yaw, 0);
    ph += dt * (1.5 + e.speed * 2.6);
    const mv = Math.min(1, e.speed / 2.5);
    let rear = 0, swipe = 0, low = 0;
    const m = e.move;
    if (e.state === 'attack' && m) {
      const k = e.mt / m.wind;
      if (m.name === 'claws' || m.name === 'double') { rear = smooth(0, 1, k); swipe = smooth(1, 1 + 0.16 / m.wind, k); if (m.name === 'double' && e.mt > m.wind + 0.3) swipe = 1 - smooth(m.wind + 0.3, m.wind + 0.42, e.mt) * 0.8 + smooth(m.wind + 0.4, m.wind + 0.5, e.mt) * 0.8; }
      if (m.name === 'lunge') { low = smooth(0, 1, k) * (e.mt < m.wind ? 1 : 0); }
    }
    if (e.state === 'alert') rear = 0.5 + Math.sin(t * 6) * 0.1;
    if (e.state === 'stagger') { rear = 0.3; low = 0.3; }
    const dead = !e.alive ? smooth(0, 1.4, e.deathT) : 0;
    spine.rotation.x = damp(spine.rotation.x, lerp(lerp(1.15, 0.25, rear), 1.35, low) + dead * 0.2, 9, dt);
    hips.position.y = damp(hips.position.y, lerp(lerp(0.9, 1.15, rear), 0.6, low) - dead * 0.6, 9, dt);
    hips.rotation.z = Math.sin(ph) * 0.05 * mv;
    root.rotation.z = dead * 1.2;
    for (const a of A) {
      const g = Math.sin(ph + (a.s > 0 ? Math.PI : 0)) * mv;
      const walkX = lerp(-1.9, -1.5, 0) + g * 0.5;                          // arms as forelegs
      const up = lerp(walkX, -2.9, rear), cut = lerp(up, -0.9, swipe);
      a.up.rotation.x = damp(a.up.rotation.x, cut, 14, dt); a.up.rotation.z = a.s * lerp(0.25, 0.9, rear) * (1 - swipe * 0.7);
      a.el.rotation.x = lerp(lerp(0.9, 0.35, rear), 0.15, swipe);
    }
    for (const l of Lg) { const g = Math.sin(ph + (l.s > 0 ? 0 : Math.PI)) * mv; l.th.rotation.x = -0.9 + g * 0.5 - low * 0.4 + rear * 0.6; l.kn.rotation.x = 1.3 + Math.max(0, -g) * 0.4 + low * 0.3; l.an.rotation.x = -0.9; }
    neck.rotation.x = lerp(-1.0, 0.1, rear); head.rotation.y = Math.sin(t * 1.3) * 0.35 * (e.aware ? 0.3 : 1);   // turning its head to feel the air
    jaw.rotation.x = 0.1 + rear * 0.4 + Math.max(0, Math.sin(t * 9)) * 0.1 * (e.state === 'alert' ? 1 : 0);
    const tell = e.state === 'attack' && m && e.mt < m.wind ? smooth(0, m.wind, e.mt) : 0;
    pitM.emissiveIntensity = (e.alive ? 0.9 + tell * 4 + (e.aware ? 0.6 : 0) : Math.max(0, 0.9 - e.deathT)) + e.flash * 6;
    pitLight.intensity = e.alive ? 0.4 + tell * 2.5 : 0;
    skin.emissiveIntensity = 0.25 + e.flash * 3;
  }
  return e;
}

// ======================= 守熱者 =======================
export function guardian(scene, { home, yaw = 0, floorAt, bound, onPhase, onDeath }) {
  const root = new THREE.Group(); scene.add(root);
  const veins = veinTex(); veins.repeat.set(2, 2);
  const rock = new THREE.MeshStandardMaterial({ color: 0x3b2e2a, roughness: 0.92, metalness: 0.05, normalMap: noiseNormal('rock'), normalScale: new THREE.Vector2(1.6, 1.6),
    emissive: 0xff6a1a, emissiveMap: veins, emissiveIntensity: 0.7 });
  const salt = new THREE.MeshStandardMaterial({ color: 0xd8d0c6, roughness: 0.85, normalMap: noiseNormal('rock'), normalScale: new THREE.Vector2(0.8, 0.8) });
  // the hide is dark and dry, like cooled basalt skin: the heat shows in its cracks and chest, not as an orange sheen all over
  const hide = new THREE.MeshPhysicalMaterial({ color: 0x3a2722, roughness: 0.78, sheen: 0.22, sheenColor: new THREE.Color(0xff8050), normalMap: noiseNormal('skin'), normalScale: new THREE.Vector2(1.5, 1.5), emissive: 0x401006, emissiveIntensity: 0.18 });
  const coreM = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xffa040, emissiveIntensity: 2.4 });
  const body = grp(root, 0, 3.2, 0);
  // the hunched mass: belly hide, armoured back plates crusted with salt
  mk(lumpy(new THREE.IcosahedronGeometry(1, 3), 0.18, 1.6, 3).scale(1.7, 1.25, 2.4), hide, body, 0, 0, 0);
  const plates = [];
  for (let i = 0; i < 7; i++) {
    const z = 1.6 - i * 0.62, w = 1.5 - Math.abs(i - 2.5) * 0.12;
    const p = mk(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.32, 2.2, i * 3.1).scale(w, 0.55, 0.7), i % 3 === 1 ? salt : rock, body, 0, 1.05 - Math.abs(i - 2) * 0.08, z);
    p.rotation.x = -0.25; plates.push(p);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) mk(lumpy(new THREE.IcosahedronGeometry(0.5, 2), 0.4, 3, i + s * 7).scale(1, 0.7, 1.3), rock, body, s * 1.45, 0.35, 1.2 - i * 1.1).rotation.z = s * 0.6;
  const chestCore = mk(new THREE.SphereGeometry(0.42, 18, 14), coreM, body, 0, -0.5, 1.9); chestCore.scale.set(1, 1.3, 0.6);
  const coreLight = new THREE.PointLight(0xff9040, 4, 16, 2); coreLight.position.set(0, -0.9, 3.1); body.add(coreLight);   // out in front: it lights the ground and you, not its own arms
  const neck = grp(body, 0, 0.1, 2.3);
  const head = grp(neck, 0, -0.2, 0.7);
  mk(lumpy(new THREE.IcosahedronGeometry(0.8, 3), 0.2, 2, 11).scale(1.1, 0.7, 1.25), rock, head);
  const jaw = grp(head, 0, -0.32, 0.25); mk(lumpy(new THREE.IcosahedronGeometry(0.62, 2), 0.25, 2.5, 13).scale(1, 0.45, 1.2), hide, jaw, 0, -0.12, 0.35);
  const mouth = mk(new THREE.SphereGeometry(0.35, 12, 8), coreM, head, 0, -0.32, 0.65); mouth.scale.set(1.2, 0.35, 0.8);
  // forelimbs: long, heavy, knuckle-walking; short hind legs
  const fore = [-1, 1].map((s) => {
    const sh = grp(body, 1.35 * s, 0.2, 1.4); const up = grp(sh); mk(new THREE.CapsuleGeometry(0.42, 1.6, 6, 12).translate(0, -1.0, 0), hide, up);
    mk(lumpy(new THREE.IcosahedronGeometry(0.6, 2), 0.3, 2.5, s * 5).scale(1, 1.4, 1), rock, up, 0.15 * s, -0.4, -0.1);
    const el = grp(up, 0, -2.0, 0); mk(new THREE.CapsuleGeometry(0.36, 1.3, 6, 12).translate(0, -0.8, 0), hide, el);
    const fist = mk(lumpy(new THREE.IcosahedronGeometry(0.62, 2), 0.35, 2.8, s * 9), rock, el, 0, -1.7, 0.1); fist.scale.set(1.1, 0.8, 1.2);
    // basalt plates grown over the forearm and the back of the upper arm: no smooth tube reads from any side
    for (let i = 0; i < 3; i++) mk(lumpy(new THREE.IcosahedronGeometry(0.42, 2), 0.38, 2.6, s * 13 + i), i === 1 ? salt : rock, el, 0.12 * s, -0.35 - i * 0.42, -0.16 + (i % 2) * 0.1).scale.set(1.0, 1.25, 0.8);
    mk(lumpy(new THREE.IcosahedronGeometry(0.45, 2), 0.36, 2.4, s * 17), rock, up, 0, -1.25, -0.22).scale.set(1.05, 1.5, 0.75);
    return { sh, up, el, fist, s };
  });
  const hind = [-1, 1].map((s) => {
    const hp = grp(body, 1.1 * s, -0.4, -1.6); const th = grp(hp); mk(new THREE.CapsuleGeometry(0.45, 0.9, 6, 12).translate(0, -0.6, 0), hide, th);
    mk(lumpy(new THREE.IcosahedronGeometry(0.46, 2), 0.36, 2.4, s * 23), rock, th, 0.18 * s, -0.45, -0.1).scale.set(0.9, 1.4, 1.0);
    const kn = grp(th, 0, -1.2, 0); mk(new THREE.CapsuleGeometry(0.34, 0.8, 6, 12).translate(0, -0.6, 0), hide, kn);
    return { hp, th, kn, s };
  });
  const ring = ringMark(scene);
  const rings = [ringMark(scene), ringMark(scene), ringMark(scene)];
  let ph = 0, chargeDir = 0, hitC = false;
  const tmp = new THREE.Vector3();
  const slamPoint = (e, out) => e.forward(out, 3.8).add(e.pos);
  const e = core(scene, {
    name: '守熱者', boss: true, hp: 900, poise: 170, radius: 2.3, height: 4.6, speed: 3.2, idleSpeed: 0, turn: 1.7, home, yaw, leash: 0, keep: 3.6, alertT: 5.5,
    root, floorAt, bound, ring,
    lines: {
      spot: ['我喺呢粒熱旁邊醒咗一萬次。', '每一次，都冇人嚟。', '今次，嚟咗個短命嘅。'],
      half: ['冇咗佢，鹽水會結冰。成個洞會靜落嚟。', '我唔畀。'],
      death: ['拎去啦，短命嘅……', '記住，呢度曾經係暖嘅。'],
    },
    sense: (e, api, d) => d < 22,
    onPhase: (e) => { onPhase && onPhase(e); },
    onDeath: (e) => { ring.hide(); rings.forEach((r) => r.hide()); onDeath && onDeath(e); },
    onReset: () => { rings.forEach((r) => r.hide()); },
    moves: [
      { name: 'slam', range: 5.8, w: 3, wind: 1.15, act: 0.15, rec: 1.4, dmg: 38, knock: 10, track: 1.4, cool: 0.8,
        tick: (e, api, dt, t) => { if (e.mt < e.move.wind) ring.show(slamPoint(e, tmp).setY(e.pos.y), 3.2, smooth(0, e.move.wind, e.mt), t); },
        fire: (e, api) => { ring.hide(); const p = slamPoint(e, tmp); api.strike(e, { from: p.clone().setY(e.pos.y), dmg: 38, reach: 3.2, arc: Math.PI, knock: 10 }); api.spark(p.setY(e.pos.y + 0.3), 2.5); e.quake = 0.8; } },
      { name: 'sweep', range: 5.2, w: 3, wind: 0.85, act: 0.25, rec: 1.0, dmg: 26, reach: 5.2, arc: 1.5, knock: 8, offset: 0.4, cool: 0.6 },
      { name: 'charge', range: 18, min: 6.5, w: 2, wind: 1.0, act: 1.25, rec: 1.5, dmg: 30, knock: 11, track: 2.4, cool: 1.0,
        begin: () => { hitC = false; },
        tick: (e, api, dt) => {
          const m = e.move; if (e.mt < m.wind) { chargeDir = e.yaw; return; }
          if (e.mt < m.wind + m.act) {
            e.pos.x += Math.sin(chargeDir) * 12 * dt; e.pos.z += Math.cos(chargeDir) * 12 * dt;
            if (!hitC && Math.hypot(api.hero.st.pos.x - e.pos.x, api.hero.st.pos.z - e.pos.z) < 3.0) hitC = api.strike(e, { from: e.pos.clone(), dmg: 30, reach: 3.2, arc: 1.6, knock: 11 }) || true;
          }
        }, fire: () => {} },
      { name: 'burst', range: 14, w: 3, p2: true, wind: 1.3, act: 0.2, rec: 1.0, cool: 0.9,
        begin: (e, api) => { const h = api.hero.st.pos; e.bursts = [h.clone(), h.clone().add(tmp.set(2.8, 0, 1.2)), h.clone().add(tmp.set(-2.4, 0, -1.6))]; },
        tick: (e, api, dt, t) => { if (e.mt < e.move.wind) e.bursts.forEach((p, i) => rings[i].show(tmp.copy(p).setY(floorAt(p.x, p.z)), 2.4, smooth(0, e.move.wind, e.mt), t)); },
        fire: (e, api) => { e.bursts.forEach((p, i) => { rings[i].hide(); api.strike(e, { from: p.clone().setY(floorAt(p.x, p.z)), dmg: 28, reach: 2.4, arc: Math.PI, knock: 8 }); api.spark(p.clone().setY(floorAt(p.x, p.z) + 0.2), 2.2); }); e.quake = 0.5; } },
    ],
    anim: animate,
  });
  e.quake = 0;
  // the chest glows when it rears for a slam, or when it is stuck after a charge
  e.weakHit = (from) => {
    const front = Math.abs(angDiff(e.yaw, Math.atan2(from.x - e.pos.x, from.z - e.pos.z))) < 0.9;
    const m = e.move; return front && ((m && m.name === 'slam' && e.mt < m.wind + 0.4) || (m && m.name === 'charge' && e.mt > m.wind + m.act) || e.staggered);
  };
  function animate(e, dt, t) {
    root.position.copy(e.pos); root.rotation.set(0, e.yaw, 0);
    ph += dt * (0.8 + e.speed * 0.9);
    const mv = Math.min(1, e.speed / 2);
    let rear = 0, smash = 0, swing = 0, low = 0;
    const m = e.move;
    if (e.state === 'attack' && m) {
      const k = e.mt / m.wind;
      if (m.name === 'slam') { rear = smooth(0, 1, k) * (1 - smooth(1, 1.12, k)); smash = smooth(0.95, 1.12, k) * (1 - smooth(1 + (m.act + m.rec * 0.6) / m.wind, 1 + (m.act + m.rec) / m.wind, k)); }
      if (m.name === 'sweep') { swing = smooth(0, 1, k) * -1 + smooth(1, 1 + m.act / m.wind, k) * 2; }
      if (m.name === 'charge') { low = smooth(0, 1, k); if (e.mt > m.wind + m.act) low = 1 - smooth(m.wind + m.act, m.wind + m.act + m.rec, e.mt); }
      if (m.name === 'burst') { rear = 0.35 * smooth(0, 1, k); }
    }
    if (e.state === 'alert') rear = 0.55 * Math.sin(Math.min(1, e.st / 2) * Math.PI);
    if (e.state === 'stagger') { low = 0.6; }
    const dead = !e.alive ? smooth(0, 2.2, e.deathT) : 0;
    body.rotation.x = damp(body.rotation.x, -0.55 * rear + 0.3 * smash + 0.25 * low + 0.35 * dead, 7, dt);
    body.position.y = damp(body.position.y, 3.2 + 1.0 * rear - 0.6 * smash - 0.5 * low - 2.2 * dead, 7, dt);
    body.rotation.y = damp(body.rotation.y, swing * 0.5, 8, dt);
    body.rotation.z = dead * 0.4 + Math.sin(ph) * 0.03 * mv;
    for (const f of fore) {
      const g = Math.sin(ph + (f.s > 0 ? 0 : Math.PI)) * mv;
      f.up.rotation.x = damp(f.up.rotation.x, lerp(lerp(0.25 + g * 0.45, -2.6, rear), 0.75, smash) + (f.s * swing > 0 ? -1.1 * Math.abs(swing) : 0.3 * Math.abs(swing)), 10, dt);
      f.up.rotation.z = f.s * (0.12 + Math.abs(swing) * 0.6);
      f.el.rotation.x = lerp(lerp(-0.35, -0.9, rear), -0.15, smash);
    }
    for (const h of hind) { const g = Math.sin(ph + (h.s > 0 ? Math.PI : 0)) * mv; h.th.rotation.x = 0.3 + g * 0.35 - rear * 0.5; h.kn.rotation.x = -0.4 + rear * 0.3; }
    neck.rotation.x = lerp(0.2, -0.5, rear) + low * 0.4; head.rotation.y = Math.sin(t * 0.6) * 0.15;
    jaw.rotation.x = 0.1 + rear * 0.5 + (e.state === 'alert' ? 0.4 + Math.sin(t * 10) * 0.1 : 0);
    const tell = e.state === 'attack' && m && e.mt < m.wind ? smooth(0, m.wind, e.mt) : 0;
    const p2 = e.phase === 2 ? 1 : 0;
    rock.emissiveIntensity = (e.alive ? 0.6 + p2 * 0.9 + tell * 1.2 + Math.sin(t * 2) * 0.1 : Math.max(0, 0.6 - e.deathT * 0.25)) + e.flash * 3;
    coreM.emissiveIntensity = e.alive ? 1.6 + p2 * 1.4 + (e.weakHit(e.forward(tmp, 5).add(e.pos)) ? 4 : 0) + e.flash * 8 : Math.max(0, 2 - e.deathT);
    coreLight.intensity = e.alive ? 3.5 + p2 * 3.5 + tell * 8 : Math.max(0, 3.5 - e.deathT * 2);
    hide.emissiveIntensity = 0.3 + e.flash * 3;
  }
  return e;
}
