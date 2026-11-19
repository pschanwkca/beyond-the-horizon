// Beyond the Horizon · prologue: the last three minutes of Earth.
// Wake on a ruined boulevard → take a suit from Stellar Suits → reach NASA's east-coast launch site →
// put on the RJ-7 Rocket Jack and fly out through a meteor storm before the Wanderer's tides tear the
// planet apart → watch it happen → in open space, fly to the ark ship 晨星號 and dock → she turns for Mars.
import * as THREE from 'three';
import { clamp, lerp, smooth, damp, dampAngle } from './util.js';
import { input, consume, endFrame, bindSurface, bindButtons } from './input.js';
import { audio } from './audio.js';
import { buildCity } from './city.js';
import { makeEnv } from './env.js';
import { makeSparks, makeFires, makeSmoke, makeAsh } from './fx.js';
import { createMeteors } from './meteors.js';
import { createPlayer } from './player.js';
import { FreeFlight, createSkyScene, vmaxAt, RE, SPACE_H, LAUNCH } from './flight.js';
import { createFinale, FIN_LEN } from './finale.js';
import { BH_DIR, MARS_DIR } from './doomsky.js';
import { createShip } from './ship.js';
import { createVoyage } from './voyage.js';
import { createMars, groundH } from './mars.js';

const $ = (id) => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem('bth.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('bth.' + k, JSON.stringify(v)); } catch (e) {} } };

const QUAL = [0.6, 0.85, 1.0];
const TOTAL = 180;                                   // three minutes on the clock
const MOON_LEAD = 600;                               // the Moon began to break up ten minutes before the game starts
const D0 = 5.6e5, VREL = 1240;                       // km at break-up (rigid Roche, 1 Msun hole); km/s closing speed then
const GM_C2 = 3.986004e14 / 8.98755179e16, C2 = 8.98755179e16;
// remaining-time floors when retrying from a checkpoint, so a retry is always winnable
const CP_FLOOR = { wake: TOTAL, shop: 150, nasa: 100 };
const CITY_UP = 450, CITY_DOWN = 430;                // m: hand-over between the street scene and the Earth-scale scene
let sharedRenderer = null;

// local gravity as the Wanderer closes in: tidal lift ~ 1/d³ (0.7 g at the moment the crust fails)
export const gScaleAt = (secsLeft) => 1 - 0.7 * Math.pow(D0 / (D0 + VREL * Math.max(0, secsLeft)), 3);

export function startGame({ onExit, quality = 1, audioCtx = null }) {
  const canvas = $('gc');
  const renderer = sharedRenderer || (sharedRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const pr = () => Math.min(devicePixelRatio || 1, 2) * QUAL[quality];
  renderer.setPixelRatio(pr());

  // ---------------- the city ----------------
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x5a2a16, 0.0062);   // smoke lit by fires: far things fade to a warm haze
  const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 3000);
  const city = buildCity(scene);
  // reflections of a burning dawn: smoke-dark overhead, fire-orange round the horizon, the black hole's disc low in the sky
  scene.environment = makeEnv(renderer, { zenith: 0x2a1812, horizon: 0xb85a2a, ground: 0x1c1410, sun: BH_DIR, sunColor: 0xffc898, sunK: 0.5, band: 0.35, gain: 0.7 });
  const sparks = makeSparks(scene), fires = makeFires(scene), smoke = makeSmoke(scene), ash = makeAsh(scene);
  city.fireSpots.forEach(([p, s]) => fires.add(p, s));
  city.smokeSpots.forEach(([p, rate, size]) => smoke.addSource(p, rate, size));
  const player = createPlayer(scene);
  const meteors = createMeteors(scene, { sparks, fires, smoke, floorAt: city.floorAt });
  const fill = new THREE.PointLight(0xd8c8c0, 10, 12, 2); scene.add(fill);

  const fl = new FreeFlight();
  const S = createSkyScene(renderer);
  const FIN = createFinale(renderer);
  const ship = createShip(); FIN.near.add(ship.root); ship.root.visible = false;

  const saved = store.get('cp2', null);
  const G = {
    step: 'wake', mode: 'walk', t: 0, stepT: 0, timeLeft: TOTAL, clock: 6 * 3600 + 21 * 60, drift: 0,
    camYaw: -Math.PI / 2 - 0.2, camPitch: 0.1, camDist: 4.4, fade: 1, msgs: {}, dust: 0, paused: false, dead: false,
    cp: saved && saved.cp ? saved.cp : 'wake', lastHurt: 0, ff: false, ffRate: 0,
    fYaw: 0, fPitch: 0.1, fDist: 6, lookIdle: 0, heroYaw: 0, lean: 0, tumble: 0, airT: 4, rockT: 2, fov: 62,
  };
  window.BTH = { G, player, city, fl, S, FIN, meteors, input, ship, RV: null, THREEV: THREE.Vector3 };

  // ---------------- UI ----------------
  const ui = {
    sayQ: [], sayT: 0,
    obj(t) { $('obj').textContent = t; $('obj').classList.toggle('on', !!t); },
    say(who, text, dur = 4.5, meta = '') { this.sayQ.push({ who, text, dur, meta }); },
    hint(t, dur = 6) { $('hint').textContent = t; $('hint').classList.add('on'); clearTimeout(this.hT); this.hT = setTimeout(() => $('hint').classList.remove('on'), dur * 1000); },
    prompt(t) { const p = $('prompt'); if (t) { p.innerHTML = t; p.classList.add('on'); } else p.classList.remove('on'); },
    clear() { this.sayQ.length = 0; this.sayT = 0; },
  };
  function sayTick(dt) {
    ui.sayT -= dt;
    if (ui.sayT <= 0) {
      const n = ui.sayQ.shift(); const b = $('say');
      if (n) { $('sayWho').textContent = n.who; $('sayDelay').textContent = n.meta; $('sayText').textContent = n.text; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); b.dataset.who = n.who; ui.sayT = n.dur; audio.ui(); }
      else b.classList.remove('on');
    }
  }
  const once = (k) => (G.msgs[k] ? false : (G.msgs[k] = 1, true));
  const flash = (white) => { const f = $('flash'); f.classList.toggle('red', !white); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };
  let shake = 0; const camShake = (s) => { shake = Math.max(shake, s); };
  const T = input.touch;

  // the voyage to Mars aboard 晨星號 (its own scenes, its own hero)
  const VOY = createVoyage(renderer, { ui, audio, G, saveCP: (cp) => saveCP(cp), onExit: () => marsExit() });

  // markers over incoming rocks (a few at once)
  const marks = [$('rockWarn')];
  for (let i = 0; i < 3; i++) { const m = $('rockWarn').cloneNode(); m.removeAttribute('id'); m.className = 'rockMark'; $('rockWarn').after(m); marks.push(m); }

  // ---------------- checkpoints ----------------
  function saveCP(cp) { G.cp = cp; store.set('cp2', { cp, timeLeft: G.timeLeft }); }
  function placeAt(p, yaw) { player.place(p, yaw); G.camYaw = yaw + Math.PI; G.camPitch = 0.14; }
  function hudSuit(on) { $('ghud').classList.toggle('hidden', !on); requestAnimationFrame(() => $('ghud').classList.toggle('on', on)); }
  function flightHud(on, space = false) {
    $('ahud').classList.toggle('hidden', !on); $('ahud').classList.toggle('space', space);
    document.body.classList.toggle('flying', on);
  }
  function applyCP(cp, timeLeft) {
    G.cp = cp; G.dead = false; G.mode = 'walk'; G.ff = false; ui.clear(); G.tumble = 0;
    G.timeLeft = Math.max(timeLeft ?? TOTAL, CP_FLOOR[cp] ?? TOTAL);
    player.st.dead = false; player.st.hp = 100; player.st.lying = 0; player.st.frozen = false; player.st.mode = 'walk'; player.st.thrust = 0;
    player.root.visible = true; player.shadow.visible = true; player.setShield(0); player.root.rotation.set(0, 0, 0);
    meteors.clear(); S.clearRocks(); fl.reset();
    flightHud(false); scene.fog.density = 0.0062; G.dust = 0; $('dust').style.opacity = 0;
    $('game').classList.remove('cine', 'postEarth'); $('cd').classList.remove('ff'); marks.forEach((m) => (m.style.opacity = 0)); $('aAltK').textContent = '高度';
    $('endT').classList.remove('on'); $('wp').classList.add('hidden'); ship.root.visible = false; RV.phase = '';
    VOY.stop(); document.body.classList.remove('voyage'); $('game').classList.remove('ended', 'final'); $('endTline').textContent = '第一章　火星';
    if (MARS) MARS.stop(); renderer.shadowMap.enabled = false; audio.alarm(false, 0); document.body.classList.remove('mars');
    if (cp === 'mars') { player.setSuit(true); player.heal(); hudSuit(true); enterMars('surface'); return; }
    if (cp === 'marsx') { player.setSuit(true); player.heal(); hudSuit(true); enterMars('explore'); return; }
    if (cp === 'voyage' || cp === 'orbit') { player.setSuit(true); player.heal(); hudSuit(true); enterVoyage(true, cp === 'orbit' ? 'orbit' : 'board'); return; }
    city.rocketProp.visible = true; city.suits.forEach((g) => (g.visible = true)); player.setRocket(false);
    if (cp === 'space') { player.setSuit(true); player.heal(); hudSuit(true); FIN.skipToFree(); enterSpace(true); return; }
    if (cp === 'wake') {
      store.set('cp2', { cp: 'wake', timeLeft: TOTAL }); player.setSuit(false); hudSuit(false); player.st.healed = false; placeAt(city.spots.wake, Math.PI / 2); player.st.lying = 1; G.step = 'wake'; G.stepT = 0;
      G.camYaw = -Math.PI / 2 - 0.2; G.camPitch = 0.1;     // after the opening look, the camera settles behind him facing down the boulevard, the hole over its far end
      return;
    }
    player.heal(); player.setSuit(true); hudSuit(true); city.suits[1].visible = false;
    if (cp === 'shop') { placeAt(city.spots.shopOut, Math.PI / 2); G.step = 'toNasa'; ui.obj('去大街盡頭嘅 NASA 東岸發射站'); return; }
    if (cp === 'nasa') { placeAt(city.spots.rocket, Math.PI); G.step = 'rocket'; ui.obj('拎起 RJ-7 火箭背包'); return; }
  }

  // ---------------- interactions ----------------
  // what the hero can use right now: any display suit in the shop, or the Rocket Jack (from any side of its stand)
  function nearInteractable() {
    const p = player.st.pos;
    if (G.step === 'shop' || G.step === 'toShop') { const g = city.suitNear(p); if (g) return { label: '拎呢件太空衣', act: () => takeSuit(g) }; }
    if ((G.step === 'rocket' || G.step === 'toNasa') && player.st.hasSuit && Math.hypot(p.x - city.spots.launch.x, p.z - city.spots.launch.z) < 2.9) return { label: '背上 RJ-7 火箭背包', act: takeRocket };
    return null;
  }
  function takeSuit(g) {
    flash(true); g.visible = false; player.setSuit(true); player.heal(); player.st.hp = 100; hudSuit(true);
    G.step = 'toNasa'; G.stepT = 0; saveCP('shop'); ui.clear();
    ui.say('六分儀', '太空衣上線。我係六分儀，你嘅導航 AI。', 3.6);
    ui.say('六分儀', '要離開地球，就要去 NASA 東岸發射站。RJ-7 火箭背包原型機仲喺實驗室。', 5);
    ui.obj('去大街盡頭嘅 NASA 東岸發射站');
  }
  function takeRocket() {
    flash(true); city.rocketProp.visible = false; player.setRocket(true); saveCP('nasa'); ui.clear();
    ui.say('六分儀', 'RJ-7 連線。等離子護盾啟動。', 3);
    ui.say('六分儀', '由屋頂個窿飛出去，一直向上。離地 100 公里就係太空。', 4.5);
    beginFlight();
  }

  // ---------------- meteors hitting the street ----------------
  meteors.onImpact = (p, radius, big) => {
    if (G.mode !== 'walk') return;
    const d = Math.hypot(player.st.pos.x - p.x, player.st.pos.z - p.z);
    camShake(Math.min(0.9, (radius ? 1.2 : 0.35 * big) * 30 / (d + 20)));
    if (radius && d < radius && Math.abs(player.st.pos.y - p.y) < 3) {
      if (player.damage(Math.round(38 * (1 - 0.5 * d / radius)), p, 12)) {
        G.lastHurt = G.t; flash(false); camShake(1); audio.tone(3400, 1.4, 0.035);           // thrown, ears ringing
        if (once('firstHit')) ui.hint(T ? '受咗傷會行得慢。見到紅圈即刻走開，或者撳「翻滾」' : '受咗傷會行得慢。見到紅圈即刻走開，或者撳 Shift 翻滾', 7);
      }
    }
  };

  // ---------------- free flight ----------------
  const fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), dir = new THREE.Vector3(), camOff = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function beginFlight() {
    G.mode = 'fly'; G.step = 'fly'; fl.reset(player.st.pos.clone()); G.ff = false;
    G.fYaw = -Math.PI / 2; G.fPitch = 0.12;          // facing east: out over the sea, toward the sunrise and the Wanderer
    G.lookIdle = 0; G.heroYaw = player.st.yaw; G.lean = 0; G.airT = 4; G.rockT = 2;
    player.st.mode = 'fly'; flightHud(true);
    ui.obj('飛出大氣層：離地 100 公里');
    ui.hint(T ? '撳住「上升」直上　左邊搖桿：向鏡頭方向飛　「衝」：加速' : '空白鍵 上升　WASD 向鏡頭方向飛　Shift 衝刺　C 下降　拖曳滑鼠轉鏡頭', 9);
  }
  // pilot input → wanted direction (world), camera-relative; the camera swings behind you when left alone
  function flyControls(dt) {
    const sens = T ? 0.006 : 0.0045;
    G.fYaw -= input.look.dx * sens; G.fPitch = clamp(G.fPitch + input.look.dy * sens * 0.8, -1.35, 1.25);
    G.lookIdle = input.look.dx || input.look.dy ? 0 : G.lookIdle + dt;
    const cp = Math.cos(G.fPitch);
    fwd.set(-Math.sin(G.fYaw) * cp, -Math.sin(G.fPitch), -Math.cos(G.fYaw) * cp);
    rgt.set(Math.cos(G.fYaw), 0, -Math.sin(G.fYaw));
    const rise = input.held.has('jump') || input.held.has('rise'), sink = input.held.has('sink');
    dir.set(0, 0, 0).addScaledVector(fwd, input.move.y).addScaledVector(rgt, input.move.x); dir.y += (rise ? 1 : 0) - (sink ? 1 : 0);
    // rising with no other input: a gentle gravity turn toward where the camera faces, like a real ascent
    if (rise && !sink && Math.abs(input.move.x) + Math.abs(input.move.y) < 0.1 && !fl.space) {
      const k = 0.55 * smooth(25, 160, fl.h); dir.x -= Math.sin(G.fYaw) * k; dir.z -= Math.cos(G.fYaw) * k;
    }
    if (dir.lengthSq() > 1) dir.normalize();
    const boost = input.held.has('dodge') || input.held.has('boost') || input.held.has('sprint');
    const sp = fl.speed;
    if (G.lookIdle > 1.2 && sp > 12) {
      const vx = fl.vel.x / sp, vy = fl.vel.y / sp, vz = fl.vel.z / sp, hz = Math.hypot(vx, vz);
      if (hz > 0.3) G.fYaw = dampAngle(G.fYaw, Math.atan2(-vx, -vz), 1.0 * hz, dt);
      let pt = clamp(-Math.asin(clamp(vy, -1, 1)) * 0.5, -0.55, 0.45);
      if (!fl.space && vy > 0) pt = lerp(pt, 0.08, smooth(1500, 20000, fl.h));     // high up, level out to show the planet below
      G.fPitch = damp(G.fPitch, pt, 1.1, dt);
    }
    // camera offset from the hero's chest
    const cpp = Math.cos(G.fPitch);
    G.fDist = damp(G.fDist, 6 + 2.5 * smooth(20, 2500, sp), 2, dt);
    camOff.set(Math.sin(G.fYaw) * cpp, Math.sin(G.fPitch), Math.cos(G.fYaw) * cpp).multiplyScalar(G.fDist);
    G.fov = damp(G.fov, 62 + 12 * smooth(60, 3000, sp) + (boost && dir.lengthSq() > 0.01 ? 4 : 0), 3, dt);
    return boost;
  }
  // the hero hangs under the jets, leaning into the direction of travel
  function poseFlyer(pl, dt) {
    const v = fl.vel, hs = Math.hypot(v.x, v.z);
    const yawT = hs > 3 ? Math.atan2(v.x, v.z) : G.fYaw + Math.PI;
    G.heroYaw = dampAngle(G.heroYaw, yawT, 5, dt);
    G.lean = damp(G.lean, 0.5 * clamp(hs / Math.max(40, vmaxAt(fl.h)), 0, 1), 4, dt);
    G.tumble = Math.max(0, G.tumble - dt * 1.6);
    pl.root.rotation.set(G.lean + Math.sin(G.tumble * 9) * G.tumble * 0.8, G.heroYaw, Math.sin(G.tumble * 7) * G.tumble * 0.5, 'YXZ');
    pl.st.thrust = fl.thrust; pl.st.mode = 'fly';
    pl.animate(dt, G.t, 0);
    pl.setShield(fl.space ? 0 : fl.glow, v.lengthSq() > 1 ? v : UP);
  }
  // swept sphere vs the city's boxes, the ground, and the edge of the map
  const cc = new THREE.Vector3();
  function collideFly() {
    const r = 0.75; cc.set(fl.pos.x, fl.pos.y + 1, fl.pos.z);
    for (const b of city.colliders) {
      if (!b.on || b.invisible) continue;
      if (cc.x < b.min[0] - 1 || cc.x > b.max[0] + 1 || cc.z < b.min[2] - 1 || cc.z > b.max[2] + 1 || cc.y > b.max[1] + 1 || cc.y < b.min[1] - 1) continue;
      const qx = clamp(cc.x, b.min[0], b.max[0]), qy = clamp(cc.y, b.min[1], b.max[1]), qz = clamp(cc.z, b.min[2], b.max[2]);
      let nx = cc.x - qx, ny = cc.y - qy, nz = cc.z - qz, d = Math.hypot(nx, ny, nz), push;
      if (d >= r) continue;
      if (d < 1e-5) {          // inside: out through the nearest face
        const f = [[cc.x - b.min[0], -1, 0, 0], [b.max[0] - cc.x, 1, 0, 0], [cc.y - b.min[1], 0, -1, 0], [b.max[1] - cc.y, 0, 1, 0], [cc.z - b.min[2], 0, 0, -1], [b.max[2] - cc.z, 0, 0, 1]].sort((a, c) => a[0] - c[0])[0];
        nx = f[1]; ny = f[2]; nz = f[3]; push = f[0] + r;
      } else { nx /= d; ny /= d; nz /= d; push = r - d; }
      cc.x += nx * push; cc.y += ny * push; cc.z += nz * push;
      const vn = fl.vel.x * nx + fl.vel.y * ny + fl.vel.z * nz;
      if (vn < 0) { fl.vel.x -= nx * vn; fl.vel.y -= ny * vn; fl.vel.z -= nz * vn; }
    }
    const floor = Math.max(0, city.floorAt(cc.x, cc.z, cc.y - 1));
    if (cc.y - 1 < floor) { cc.y = floor + 1; if (fl.vel.y < 0) fl.vel.y = 0; }
    fl.pos.set(cc.x, cc.y - 1, cc.z);
    edge();
  }
  // the street map is finite: down low, keep the hero over it
  function edge() {
    const dx = fl.pos.x - LAUNCH.x, dz = fl.pos.z - LAUNCH.z, r = Math.hypot(dx, dz);
    if (r > 820 && fl.pos.y < CITY_UP + 40) {
      const k = Math.min(1, (r - 820) / 120);
      fl.vel.x -= dx / r * 60 * k; fl.vel.z -= dz / r * 60 * k; if (fl.vel.y < 20) fl.vel.y += 30 * k;
      if (once('edge')) { ui.say('六分儀', '唔好飛咁遠，向上飛！', 2.5); setTimeout(() => (G.msgs.edge = 0), 8000); }
    }
  }
  function hitFly(from) {
    if (player.st.inv > 0 || G.dead) return;
    player.st.hp = Math.max(0, player.st.hp - 25); player.st.inv = 0.6; player.st.hurtT = 0.4;
    G.lastHurt = G.t; G.tumble = 1; flash(false); camShake(0.9); audio.boom(); audio.tone(3200, 0.9, 0.03);
    if (from) { const k = new THREE.Vector3().subVectors(fl.pos, from).setY(0); if (k.lengthSq() > 1e-4) fl.vel.addScaledVector(k.normalize(), Math.min(60, 20 + fl.speed * 0.1)); }
    fl.vel.multiplyScalar(0.7);
    if (once('hitFly')) ui.hint('俾隕石撞中！見到紅圈標記，向旁邊閃', 4);
    if (player.st.hp <= 0) fail('hp');
  }

  // ---------------- 晨星號 on her way to Mars ----------------
  function enterVoyage(fromSave, stage) {
    G.mode = 'voyage'; ui.clear(); ui.obj(''); ui.prompt('');
    ship.root.visible = false; $('wp').classList.add('hidden'); marks.forEach((m) => (m.style.opacity = 0));
    flightHud(false); hudSuit(true); document.body.classList.add('voyage'); $('game').classList.add('postEarth');
    $('timeLabel').textContent = '';
    $('pNext').innerHTML = stage === 'orbit' ? '晨星號喺火星軌道。去<b>艙口</b>出艙，飛落萊拉嘅中繼站。' : '晨星號往火星，兩個 g 加速、半路掉頭、再減速，大約 41 個鐘。';
    if (!fromSave || stage === 'board') { $('chapterD').textContent = '公元 3385 年 4 月 12 日　晨星號'; $('chapterP').textContent = '第一章　火星'; $('chapter').classList.add('on'); setTimeout(() => $('chapter').classList.remove('on'), 4600); }
    if (stage !== 'orbit') saveCP('voyage');
    VOY.start(stage);
  }
  // ---------------- Mars: entry, the flight down, Lyra ----------------
  let MARS = null;
  const getMars = () => MARS || (MARS = createMars(renderer, { ui, audio, G, fl, dir, camOff, flyControls, poseFlyer, store, saveCP: (cp) => saveCP(cp), flash, shake: camShake, onDone: chapterEnd }));
  function marsExit() { VOY.stop(); enterMars('entry'); }
  function enterMars(stage) {
    G.mode = 'mars'; ui.clear(); ui.obj(''); ui.prompt('');
    document.body.classList.remove('voyage'); document.body.classList.add('mars'); hudSuit(true); $('game').classList.add('postEarth');
    $('pNext').innerHTML = stage === 'explore' ? '探索火星：搵地底嘅熱源。按<b>掃描</b>睇附近有乜，喺中繼站或者信標休息。' : '跟住琥珀色標記，飛去萊拉嘅<b>火星中繼站</b>。';
    getMars().start(stage);
  }
  function chapterEnd() {
    G.mode = 'end1'; audio.alarm(false, 0); flightHud(false); document.body.classList.remove('flying');
    $('endTline').innerHTML = '第一章　火星　完<br>星圖 1／5　下一站：木衛二（製作中）';
    $('endT').classList.add('on'); $('game').classList.add('ended', 'final'); $('game').classList.remove('cine');
  }

  function hitSpace() {
    if (player.st.inv > 0 || G.dead || RV.phase === 'auto') return;
    player.st.hp = Math.max(0, player.st.hp - 18); player.st.inv = 0.8; player.st.hurtT = 0.4;
    G.lastHurt = G.t; G.tumble = 1; flash(false); camShake(0.8); audio.boom(); audio.hit();
    fl.vel.multiplyScalar(0.55);
    if (once('hitSpace')) ui.say('六分儀', '小心碎片！見到紅圈就閃開。', 3.2);
    if (player.st.hp <= 0) fail('hp');
  }
  const spaceEvents = {
    hit() { hitSpace(); },
    near() { camShake(0.22); audio.burst(500, 0.3, 0.1); },
  };

  function fail(kind) {
    if (G.dead) return; G.dead = true;
    const lines = {
      hp: ['六分儀', '維生信號中斷……重新連線。'],
      earth: ['六分儀', '地球開始瓦解……你冇及時離開。'],
    };
    const [who, text] = lines[kind] || lines.hp; ui.clear(); ui.say(who, text, 3.2);
    flash(kind !== 'earth');
    if (kind === 'earth') { $('white').style.background = '#fff2e0'; $('white').style.opacity = 1; }
    setTimeout(() => {
      const sv = store.get('cp2', null) || { cp: 'wake', timeLeft: TOTAL };
      applyCP(sv.cp, sv.timeLeft); $('white').style.opacity = 0; flash(true);
    }, 2600);
  }

  // ---------------- clocks ----------------
  function tick(dt) {
    G.timeLeft = Math.max(0, G.timeLeft - dt); G.clock += dt;
    const air = G.mode === 'fly' || G.mode === 'climb', r = air ? RE + fl.h : RE, v = air ? fl.speed : 463 * 0.92;
    G.drift += dt * (GM_C2 / r + v * v / (2 * C2));
  }
  const fmtClock = (s) => { s = Math.floor(s); return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':'); };
  const fmtCD = (s) => { const c = Math.ceil(s); return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`; };
  const fmtAlt = (h) => h < 1000 ? h.toFixed(0) + ' m' : h < 10000 ? (h / 1000).toFixed(2) + ' km' : (h / 1000).toFixed(1) + ' km';
  const fmtDrift = (s) => s < 1e-6 ? (s * 1e9).toFixed(1) + ' 納秒' : s < 1e-3 ? (s * 1e6).toFixed(1) + ' 微秒' : s < 1 ? (s * 1e3).toFixed(1) + ' 毫秒' : s.toFixed(2) + ' 秒';

  // ---------------- camera (street) ----------------
  const ray = new THREE.Vector3(), pivot = new THREE.Vector3(), camWant = new THREE.Vector3();
  function rayBox(o, d, maxT, c) {
    let t0 = 0, t1 = maxT;
    for (let a = 0; a < 3; a++) {
      const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
      if (Math.abs(da) < 1e-6) { if (oa < c.min[a] || oa > c.max[a]) return maxT; continue; }
      let ta = (c.min[a] - oa) / da, tb = (c.max[a] - oa) / da; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return maxT;
    }
    return t0;
  }
  function placeCamera(pv, rdir, want, ceiling = true) {
    let dist = want;
    for (const c of city.colliders) {
      if (!c.on || c.invisible || c.max[0] < pv.x - 60 || c.min[0] > pv.x + 60 || c.max[2] < pv.z - 60 || c.min[2] > pv.z + 60) continue;
      const t = rayBox(pv, rdir, dist, c); if (t < dist) dist = Math.max(0.6, t - 0.25);
    }
    camWant.copy(pv).addScaledVector(rdir, dist);
    if (ceiling) camWant.y = Math.min(camWant.y, city.ceilingAt(camWant.x, camWant.z) - 0.25);
    const lift = Math.max(0, 0.4 - camWant.y);              // pressed against the ground: keep looking up the way the player asked
    camWant.y = Math.max(camWant.y, 0.4);
    camera.position.copy(camWant);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.4; camera.position.y += (Math.random() - 0.5) * shake * 0.4; }
    camera.lookAt(pv.x - rdir.x * lift * 4, pv.y + 0.1 - rdir.y * lift * 4, pv.z - rdir.z * lift * 4);
  }
  function walkCamera(dt) {
    const sens = T ? 0.006 : 0.0045;
    G.camYaw -= input.look.dx * sens; G.camPitch = clamp(G.camPitch + input.look.dy * sens * 0.8, -0.8, 1.15);
    player.headPos(pivot); pivot.y -= 0.15;
    const indoor = city.ceilingAt(player.st.pos.x, player.st.pos.z) < 20;
    G.camDist = damp(G.camDist, indoor ? 3.6 : 4.6, 3, dt);
    ray.set(Math.sin(G.camYaw) * Math.cos(G.camPitch), Math.sin(G.camPitch), Math.cos(G.camYaw) * Math.cos(G.camPitch));
    placeCamera(pivot, ray, G.camDist);
    // waking up: first through his own eyes, lying in the street, the hole low over the far end of it; then up and behind him
    const wk = G.cp === 'wake' && G.t < 7 ? 1 - smooth(3.2, 6.2, G.t) : 0;
    if (wk > 0) {
      const head = out.copy(player.st.pos).add(new THREE.Vector3(0, 0.35, 0));
      const lookT = head.clone().addScaledVector(BH_DIR, 60).add(new THREE.Vector3(0, -60 * BH_DIR.y + 2.5, 0));   // horizon in the lower third, the hole above it
      const k = wk * wk * (3 - 2 * wk);
      camera.position.lerp(head, k);
      const fwdNow = new THREE.Vector3(); camera.getWorldDirection(fwdNow);
      const want = lookT.sub(camera.position).normalize();
      camera.lookAt(camera.position.clone().add(fwdNow.lerp(want, k).normalize()));
    }
    // through his own eyes, his own body must not fill the frame as he sits up: show him only once the camera has backed off
    player.root.visible = !(wk > 0 && camera.position.distanceTo(pivot) < 2.2);
    camera.fov = 62; camera.updateProjectionMatrix();
  }

  // ---------------- story on foot ----------------
  function walkStory(dt) {
    const p = player.st.pos; G.stepT += dt;
    if (G.step === 'wake') {
      if (G.t > 1.4 && once('b1')) ui.say('緊急廣播', '全球緊急廣播：月球已經俾流浪者嘅潮汐力撕碎。', 4.2);
      if (G.t > 1.4 && once('b2')) ui.say('緊急廣播', '地球預計三分鐘後開始瓦解。所有人即刻前往最近嘅發射站。', 4.5);
      if (G.t > 3) player.st.lying = Math.max(0, player.st.lying - dt * 0.7);
      if (G.t > 9.5 && once('v1')) {
        ui.say('維加', '冇太空衣，出到太空都係死。對面街「星環太空衣」應該仲有貨。', 4.5);
        ui.obj('入對面街嘅「星環太空衣」拎太空衣');
        ui.hint(T ? '左邊拖動移動　右邊拖動轉鏡頭　推盡搖桿就跑' : 'WASD 移動　拖曳滑鼠轉鏡頭　R 跑　空白鍵 跳　Shift 翻滾', 7);
        G.step = 'toShop'; G.stepT = 0;
      }
      if (G.t > 9) player.heal();
    }
    if (G.step === 'toShop') {
      if (G.stepT > 5 && once('m1')) ui.hint(T ? '地上紅圈 = 隕石就嚟，即刻走開或者撳「翻滾」' : '地上紅圈 = 隕石就嚟，即刻走開或者 Shift 翻滾', 6);
      if (city.inShop(p.x, p.z)) { G.step = 'shop'; ui.obj('拎一件太空衣'); ui.hint(T ? '行近任何一件太空衣，撳「互動」' : '行近任何一件太空衣，撳 E', 6); }
    }
    if (G.step === 'toNasa') {
      if (G.stepT > 3 && once('lyra')) {
        const meta = '火星殖民地　訊號延遲 5 分 51 秒';
        ui.say('萊拉', '哥，你仲喺地球？最後幾班撤離船都走得七七八八……', 4.2, meta);
        ui.say('萊拉', 'NASA 東岸發射站仲有部 RJ-7。你當年試飛過，你識用。快啲走！我喺火星等你。', 6, meta);
      }
      if (p.x > 62 && once('tower')) { city.startCollapse(); setTimeout(() => ui.say('維加', '……嗰棟大廈塌緊！', 2.5), 1500); camShake(0.6); }
      if (p.x > 80 && once('fissure')) { ui.say('六分儀', '前面條路裂開咗，下面係岩漿。助跑，跳過去。', 4); ui.hint(T ? '推盡搖桿助跑，再撳「跳」' : '按住 R 助跑，再撳空白鍵跳', 6); }
      if (p.x > 154 && once('gate')) { ui.say('六分儀', 'RJ-7 實驗室喺入面，屋頂俾隕石撞穿咗。', 3.5); ui.obj('入實驗室拎 RJ-7 火箭背包'); }
      if (p.x > 201 && p.x < 231 && Math.abs(p.z) < 15) { G.step = 'rocket'; ui.obj('行近台上嘅 RJ-7，背上佢'); }
    }
    const gs = gScaleAt(G.timeLeft);
    if (gs < 0.62 && player.st.hasSuit && once('tide1')) ui.say('六分儀', `重力得返 ${gs.toFixed(2)} g。流浪者嘅潮汐力扯緊成個地球，你會跳得高啲。`, 5);
    countdownLines();
  }
  function countdownLines() {
    if (G.ff) return;
    if (G.timeLeft < 120 && once('two')) ui.say('六分儀', '仲有兩分鐘。', 2.5);
    if (G.timeLeft < 60 && once('one')) ui.say('六分儀', '一分鐘！', 2);
    if (G.timeLeft < 20 && once('twenty')) ui.say('六分儀', '二十秒！', 2);
  }

  // ---------------- rocks in the air ----------------
  const segP = new THREE.Vector3(), segD = new THREE.Vector3(), chest = new THREE.Vector3();
  function cityAirThreats(dt, prog) {
    chest.set(fl.pos.x, fl.pos.y + 1, fl.pos.z);
    G.airT -= dt;
    if (G.airT <= 0 && fl.h > 16 && !G.dead) {
      G.airT = 1.5 + Math.random() * 1.1 - prog * 0.5;
      const lead = 2.2, aim = chest.clone().addScaledVector(fl.vel, lead);
      if (Math.random() < 0.45) aim.add(new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 16));
      meteors.spawnAir(aim, lead, 1.6 + Math.random() * 0.8, G.fYaw);
      if (once('rock1')) ui.say('六分儀', '隕石雨越嚟越密！見到紅圈標記就閃開。', 3.5);
    }
    for (const m of meteors.air) {
      const cur = m.head.position, prev = m._prev || cur;
      segD.subVectors(cur, prev); const l2 = segD.lengthSq();
      const k = l2 > 1e-6 ? clamp(segP.subVectors(chest, prev).dot(segD) / l2, 0, 1) : 0;
      const d = segP.copy(prev).addScaledVector(segD, k).distanceTo(chest);
      m._prev = cur.clone();
      if (d < m.size * 0.7 + 0.9) { meteors.burst(m); hitFly(cur); }
      else if (d < m.size + 7 && !m._near) { m._near = true; camShake(0.25); }
    }
  }
  function climbRocks(dt) {
    if (G.ff || fl.h < 700 || fl.h > SPACE_H || G.dead) return;
    G.rockT -= dt;
    if (G.rockT <= 0) {
      G.rockT = 0.5 + Math.random() * 0.45;
      const aimed = Math.random() < 0.4;
      S.spawnRock(fl, 2.3 + Math.random() * 0.4, aimed ? Math.random() * 1.2 : 4 + Math.random() * 24, undefined, camOff.clone().negate());
      if (aimed) audio.whistle(1.6, 0.05);
    }
  }
  const rockEvents = {
    hit(r) { hitFly(null); },
    nearMiss(r) { camShake(0.3); audio.burst(700, 0.35, 0.14); },
  };
  const proj = new THREE.Vector3(), thr = [];
  function markers(cam, list) {
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i], it = list[i];
      if (!it) { m.style.opacity = 0; continue; }
      proj.copy(it.p).project(cam);
      let x = proj.x, y = proj.y; if (proj.z > 1) { x = -x; y = -y; }
      x = clamp(x, -0.9, 0.9); y = clamp(y, -0.85, 0.62);
      const sc = clamp(1.6 - it.tc * 0.45, 0.6, 1.6);
      m.style.transform = `translate(${(x + 1) / 2 * innerWidth}px, ${(1 - y) / 2 * innerHeight}px) translate(-50%,-50%) scale(${sc})`;
      m.style.opacity = 1;
    }
  }

  // ---------------- leaving: fast-forward to the break-up, the break-up, open space ----------------
  function reachSpace() {
    G.ff = true; G.ffRate = G.timeLeft / 4.5; S.clearRocks();
    ui.clear(); ui.say('六分儀', '過咗卡門線。你已經喺太空。', 2.6); ui.say('維加', '……望返落去。', 2.4);
    ui.obj(''); $('cd').classList.add('ff');
  }
  function beginFinale() {
    G.mode = 'finale'; ui.clear(); store.set('cp2', { cp: 'space', timeLeft: 0 }); $('timeLabel').textContent = '時間加快 ×60';
    FIN.begin(fl.h / 1000);
    flightHud(false); $('ghud').classList.add('hidden'); $('obj').classList.remove('on'); $('hint').classList.remove('on'); $('cd').classList.remove('ff');
    $('game').classList.add('cine'); marks.forEach((m) => (m.style.opacity = 0)); $('dust').style.opacity = 0; $('white').style.opacity = 0;
    audio.rumble(0.1); audio.breath(true, 0); audio.wind(0);
  }
  function enterSpace(fromSave) {
    G.mode = 'space'; G.dead = false; G.timeLeft = 0;
    fl.reset(new THREE.Vector3()); fl.space = true;
    FIN.startFree(); G.fYaw = Math.atan2(-BH_DIR.x, -BH_DIR.z); G.fPitch = -Math.asin(BH_DIR.y) * 0.85; G.lookIdle = 0; G.heroYaw = G.fYaw + Math.PI;   // facing the Wanderer and the stream of what was Earth
    $('game').classList.remove('cine'); $('game').classList.add('postEarth');
    flightHud(true, true); hudSuit(true); $('aAltK').textContent = '離地球原址';
    ui.obj('飛去晨星號');
    startRendezvous();
    if (!fromSave) ui.say('六分儀', '地球冇咗。我已經遙控晨星號離開停泊軌道，嚟碎片帶接你。', 4.5);
    ui.say('六分儀', '跟住琥珀色嘅菱形標記飛。佢會喺十公里外停低等你。', 4.5);
    ui.hint(T ? '左邊搖桿：向鏡頭方向飛　「衝」：加速　跟住琥珀色標記' : 'WASD 向鏡頭方向飛　Shift 衝刺　跟住琥珀色標記', 7);
  }

  // ---------------- 晨星號: rendezvous, docking, departure ----------------
  // The ship lives in real metres (RV.P), the hero at fl.pos. In the near scene she is drawn at her real
  // place up to VNEAR, beyond that pulled in along the same line and shrunk to the same angular size.
  const RV = { phase: '', P: new THREE.Vector3(), q: new THREE.Quaternion(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), stage: 0, t: 0, v: 0, cam: new THREE.Vector3(), look: new THREE.Vector3() };
  window.BTH.RV = RV;
  const VNEAR = 2500;
  const _o = new THREE.Object3D(), _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), wpPos = new THREE.Vector3();
  const toNear = (real, out) => { out.subVectors(real, fl.pos); const d = out.length(); if (d > VNEAR) out.multiplyScalar(VNEAR / d); return d; };
  function placeShip() {
    const d = toNear(RV.P, ship.root.position);
    ship.root.scale.setScalar(d > VNEAR ? VNEAR / d : 1); ship.root.quaternion.copy(RV.q);
    return d;
  }
  const airlockReal = (out) => out.copy(ship.airlock).applyQuaternion(RV.q).add(RV.P);
  // a turn that shows the docking port (+x) toward `xDir`, the bow as near Mars as that allows
  function portToward(xDir, out) {
    const x = _b.copy(xDir).normalize();
    const z = _c.copy(MARS_DIR).addScaledVector(x, -MARS_DIR.dot(x)).normalize();
    const y = _a.crossVectors(z, x);
    return out.setFromRotationMatrix(_m.makeBasis(x, y, z));
  }
  function startRendezvous() {
    const D = new THREE.Vector3(BH_DIR.x, 0, BH_DIR.z).normalize().applyAxisAngle(UP, 0.55).setY(0.22).normalize();   // a little left of the hole and above it
    RV.P.copy(fl.pos).addScaledVector(D, 140000);
    _o.position.copy(RV.P); _o.lookAt(_a.copy(RV.P).add(D)); RV.q.copy(_o.quaternion);   // stern toward you: she is braking
    RV.phase = 'approach'; RV.stage = 0; RV.t = 0; RV.v = 0; FIN.motes.visible = true;
    ship.root.visible = true; ship.setBurn(1); ship.setDock(0);
    $('wp').classList.remove('hidden'); $('wp').classList.remove('near');
  }
  function rendezvous(dt) {
    RV.t += dt;
    const d = _a.subVectors(RV.P, fl.pos).length();
    if (RV.phase === 'approach') {
      const vs = clamp((d - 9500) * 0.03, 0, 1800);      // she comes in on her drive and stops ~10 km out
      RV.P.addScaledVector(_a, -vs * dt / d);
      ship.setBurn(damp(ship.burn, smooth(16000, 32000, d), 2, dt));
      if (d < 24000) RV.q.slerp(portToward(_b.subVectors(fl.pos, RV.P), _q), 1 - Math.exp(-0.7 * dt));   // braking done: she turns her port toward you
      if (d < 10200) { RV.phase = 'hold'; ui.say('六分儀', '晨星號停定咗。飛埋去，近到一公里半我會接手，幫你對準氣閘。', 4.8); ui.obj('飛埋晨星號'); }
    } else if (RV.phase === 'hold') {
      ship.setBurn(damp(ship.burn, 0, 2, dt));
      RV.q.slerp(portToward(_b.subVectors(fl.pos, RV.P), _q), 1 - Math.exp(-0.7 * dt));
      if (airlockReal(_c).distanceTo(fl.pos) < 1500) {
        RV.phase = 'auto'; RV.stage = 0; ship.setDock(1); $('wp').classList.add('near');
        ui.say('六分儀', '交俾我。放鬆，我帶你埋去氣閘。', 3.5); ui.obj('對接中');
      }
    }
    // a sane closing speed near her, whatever the pilot does
    fl.cap = d > 12000 ? Infinity : 70 + Math.max(0, d - 500) * 0.55;
  }
  // the last kilometre and a half: the suit flies itself to a point off the port, then in
  function autopilot() {
    airlockReal(_c); const n = _b.copy(ship.airlockN).applyQuaternion(RV.q);
    const tgt = wpPos.copy(_c).addScaledVector(n, RV.stage === 0 ? 90 : 1.2);
    const dd = tgt.distanceTo(fl.pos);
    if (RV.stage === 0 && dd < 12) RV.stage = 1;
    dir.subVectors(tgt, fl.pos).normalize(); fl.cap = 4 + 0.8 * dd;
    if (RV.stage === 1 && dd < 1.6) dock();
  }
  function waypoint(cam) {
    const el = $('wp'); if (el.classList.contains('hidden')) return;
    const d = airlockReal(_c).distanceTo(fl.pos); toNear(_c, wpPos);
    proj.copy(wpPos).project(cam);
    let x = proj.x, y = proj.y; const behind = proj.z > 1;
    if (behind) { x = -x; y = -y; if (Math.hypot(x, y) < 0.05) y = -1; }
    const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.8;
    if (off) { const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8); x /= m; y /= m; }
    el.style.transform = `translate(${(x + 1) / 2 * innerWidth}px, ${(1 - y) / 2 * innerHeight}px)`;
    el.classList.toggle('off', off); el.classList.toggle('lft', x > 0.5);
    if (off) el.style.setProperty('--a', `${Math.atan2(-y, x) * 180 / Math.PI + 90}deg`);
    $('wpD').textContent = d >= 10000 ? `${(d / 1000).toFixed(0)} km` : d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.max(0, d).toFixed(0)} m`;
  }
  function dock() {
    RV.phase = 'dock'; RV.t = 0; G.mode = 'dock'; fl.vel.set(0, 0, 0); fl.cap = Infinity;
    $('wp').classList.add('hidden'); ui.obj(''); ui.clear(); marks.forEach((m) => (m.style.opacity = 0));
    $('game').classList.add('cine'); $('timeLabel').textContent = '';
    ui.say('六分儀', '對接完成。歡迎上船，維加。', 3.4);
    audio.tone(660, 0.12, 0.05); setTimeout(() => audio.tone(990, 0.16, 0.05), 140);
    // a fixed camera on the far side of her from the hole: the ship, and beyond her the Wanderer and the stream of what was Earth
    const n = _a.copy(ship.airlockN).applyQuaternion(RV.q);
    RV.cam.copy(RV.P).addScaledVector(BH_DIR, -760).addScaledVector(n, 260).add(_b.set(0, 170, 0));
    RV.q0.copy(RV.q); _o.position.copy(RV.P); _o.lookAt(_a.copy(RV.P).add(MARS_DIR)); RV.q1.copy(_o.quaternion);
    toNear(RV.P, RV.look); RV.v = 0; FIN.motes.visible = false;
  }
  function dockScene(dt) {
    RV.t += dt; const t = RV.t;
    if (t > 1.4) FIN.hero.root.visible = false;            // through the hatch
    if (t > 2.2) ship.setDock(Math.max(0, 1 - (t - 2.2)));
    RV.q.copy(RV.q0).slerp(RV.q1, smooth(3, 10.5, t));        // she swings her bow onto Mars
    ship.setBurn(smooth(10.6, 12.4, t));
    // 2 g, the whole way: accelerate to the midpoint, flip, brake. Shown sped up x60 once she is under way.
    const rate = 1 + 59 * smooth(12.5, 15, t);
    if (t > 11) { const sdt = dt * rate; RV.v += 19.6 * smooth(11, 12.4, t) * sdt; RV.P.addScaledVector(MARS_DIR, RV.v * sdt); G.clock += sdt - dt; }
    if (t > 12.5 && once('d5')) { $('timeLabel').textContent = '時間加快 ×60'; }
    if (t > 4 && once('d1')) ui.say('六分儀', '航線：火星，一億零五百萬公里。兩個 g 加速，中途掉頭減速，四十一個鐘就到。', 5.2);
    if (t > 10.6 && once('d2')) { ui.say('六分儀', '推進器點火。', 2.6); audio.boom(); camShake(0.5); }
    if (t > 15.5 && once('d3')) ui.say('維加', '萊拉，等我。', 3.4);
    if (t > 20 && once('d4')) { $('endT').classList.add('on'); $('game').classList.add('ended'); }
    if (t > 27.5 && once('d6')) { $('endT').classList.remove('on'); $('game').classList.remove('ended', 'cine'); enterVoyage(false, 'board'); }
    audio.rumble(ship.burn * 0.35 * Math.max(0, 1 - (t - 14) / 10)); audio.hum(0.3);
    // the camera stays put and follows her out
    placeShip();
    toNear(RV.cam, _a);
    toNear(RV.P, _b); const toShip = _b.sub(_a).length();
    _b.normalize().lerp(_c.copy(BH_DIR), 0.3 * (1 - smooth(10, 16, t))).normalize().multiplyScalar(toShip).add(_a);   // both her and the hole in frame, then just her
    RV.look.lerp(_b, 1 - Math.exp(-3 * dt));
    _c.copy(RV.look); if (shake > 0) _c.add(_b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 4));
    FIN.setCam(_a, _c, 46);
  }

  // ---------------- HUD ----------------
  function hud() {
    const st = player.st;
    $('cdV').textContent = fmtCD(G.timeLeft);
    $('cd').classList.toggle('urgent', G.timeLeft < 30 && !G.ff);
    $('cdG').textContent = `重力 ${gScaleAt(G.timeLeft).toFixed(2)} g`;
    $('gShip').textContent = fmtClock(G.clock - G.drift); $('gCos').textContent = fmtClock(G.clock); $('gDrift').textContent = fmtDrift(G.drift);
    $('hpFill').style.transform = `scaleX(${st.hp / 100})`; $('hpv').textContent = Math.round(st.hp);
    $('bodyHpFill').style.transform = `scaleX(${st.hp / 100})`;
    $('bodyHp').classList.toggle('hidden', st.hasSuit);
    $('hurt').style.opacity = st.hurtT > 0 ? 0.9 : Math.max(0, 0.5 - st.hp / 100 * 0.5);
    document.body.classList.toggle('suited', st.hasSuit);
    if (G.mode === 'fly' || G.mode === 'climb') {
      const h = Math.max(0, fl.h), sp = fl.speed;
      $('aAlt').textContent = fmtAlt(h);
      $('aSpd').textContent = sp < 1000 ? sp.toFixed(0) + ' m/s' : (sp / 1000).toFixed(2) + ' km/s';
      const vm = vmaxAt(h); $('aMax').textContent = vm < 1000 ? vm.toFixed(0) + ' m/s' : (vm / 1000).toFixed(1) + ' km/s';
      $('aHp').textContent = Math.round(st.hp); $('aHpFill').style.transform = `scaleX(${st.hp / 100})`; $('aHpRow').classList.toggle('warn', st.hp < 40);
      const q = fl.qdot; $('aSh').textContent = q < 1e6 ? (q / 1000).toFixed(0) + ' kW/m²' : (q / 1e6).toFixed(1) + ' MW/m²';
      $('aShFill').style.transform = `scaleX(${fl.glow})`;
      $('aBarFill').style.transform = `scaleY(${clamp(Math.log10(1 + h / 10) / 4, 0, 1)})`;
      $('dust').style.opacity = G.dust;
    } else if (G.mode === 'space') {
      const d = (FIN.pos.length() - 6.371) * 1000;
      $('aAlt').textContent = Math.max(0, d).toFixed(0) + ' km';
      const sp = fl.speed; $('aSpd').textContent = sp < 1000 ? sp.toFixed(0) + ' m/s' : (sp / 1000).toFixed(2) + ' km/s';
      $('aHp').textContent = Math.round(st.hp); $('aHpFill').style.transform = `scaleX(${st.hp / 100})`;
      $('dust').style.opacity = 0;
    } else if (!G.dead) { $('dust').style.opacity = 0; $('white').style.opacity = 0; }
    // interaction
    if (G.mode === 'voyage') { $('bInteract').classList.toggle('hidden', !VOY.V.near); return; }
    if (G.mode === 'mars' || G.mode === 'end1') {
      if (!MARS || MARS.phase !== 'explore') $('bInteract').classList.add('hidden');
      if (MARS && MARS.flying) {
        const h = Math.max(0, fl.pos.y - Math.max(0, groundH(fl.pos.x, fl.pos.z))), sp = fl.speed;
        $('aAltK').textContent = '離地'; $('aAlt').textContent = fmtAlt(h);
        $('aSpd').textContent = sp < 1000 ? sp.toFixed(0) + ' m/s' : (sp / 1000).toFixed(2) + ' km/s';
        const vm = fl.vmaxFn ? fl.vmaxFn(fl.pos.y) : 0; $('aMax').textContent = vm < 1000 ? vm.toFixed(0) + ' m/s' : (vm / 1000).toFixed(1) + ' km/s';
        $('aHp').textContent = Math.round(st.hp); $('aHpFill').style.transform = `scaleX(${st.hp / 100})`;
        const q = fl.qdot; $('aSh').textContent = q < 1e6 ? (q / 1000).toFixed(0) + ' kW/m²' : (q / 1e6).toFixed(1) + ' MW/m²'; $('aShFill').style.transform = `scaleX(${fl.glow})`;
        $('aBarFill').style.transform = `scaleY(${clamp(Math.log10(1 + h / 10) / 4, 0, 1)})`;
      }
      return;
    }
    const near = G.mode === 'walk' && !G.dead ? nearInteractable() : null;
    G.near = near;
    ui.prompt(near ? `<b>${T ? '互動' : 'E'}</b>${near.label}` : '');
    $('bInteract').classList.toggle('hidden', !near);
  }

  // ---------------- main loop ----------------
  let last = performance.now(), running = true, W = 0, H = 0;
  function resize() {
    if (W === innerWidth && H === innerHeight) return; W = innerWidth; H = innerHeight;
    renderer.setPixelRatio(pr()); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  }
  const out = new THREE.Vector3();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, window.__bthDtMax || 0.05); last = now;
    resize();
    if (G.paused) { if (consume('pause')) pause(false); endFrame(); return; }
    G.t += dt;
    if (consume('pause') && G.mode !== 'finale') { pause(true); endFrame(); return; }
    sayTick(dt);
    G.fade = damp(G.fade, G.t > 1.4 ? 0 : 1, 1.4, dt); $('fade').style.opacity = G.fade;
    shake = Math.max(0, shake - dt * 1.8);
    const prog = clamp(1 - (G.timeLeft + MOON_LEAD) / (TOTAL + MOON_LEAD), 0, 1);   // gameplay intensity: meteors, quakes, wind
    const skyProg = clamp(0.55 + 0.45 * (1 - G.timeLeft / TOTAL), 0, 1);             // the Moon has been coming apart for ten minutes already
    if ((G.mode === 'fly' || G.mode === 'climb' || G.mode === 'walk' || G.mode === 'space') && !G.dead && G.t - G.lastHurt > 6 && player.st.hp < 100) player.st.hp = Math.min(100, player.st.hp + dt * 1.5);   // slow recovery
    player.st.inv = Math.max(0, player.st.inv - (G.mode === 'walk' ? 0 : dt)); player.st.hurtT = Math.max(0, player.st.hurtT - (G.mode === 'walk' ? 0 : dt));

    if (G.mode === 'walk') {
      if (!G.dead) tick(dt);
      if (consume('interact') && G.near) G.near.act();
      if (G.mode !== 'walk') { hud(); endFrame(); return; }
      player.st.g = 9.81 * gScaleAt(G.timeLeft);
      player.update(dt, G.camYaw, city.colliders, G.t, city);
      if (player.st.fell) {
        player.st.fell = false; player.damage(34); player.st.inv = 0; G.lastHurt = G.t; flash(false);
        const pit = city.pits[0]; player.place(pit.safe, Math.PI / 2); ui.hint('跌咗落裂縫。助跑再跳！', 4);
      }
      walkStory(dt);
      const pp = player.st.pos, inLab = pp.x > 199 && pp.x < 233 && Math.abs(pp.z) < 16;
      const indoor = city.ceilingAt(pp.x, pp.z) < 20 || inLab || city.inShop(pp.x, pp.z);
      const aim = out.copy(player.st.pos).addScaledVector(player.st.vel, 1.6);
      meteors.update(dt, G.t, { intensity: 0.4 + 0.6 * (1 - G.timeLeft / TOTAL), aim, allowThreats: G.step !== 'wake' && !indoor && !G.dead && G.step !== 'shop', camPos: player.st.pos, skyRate: 9 + 8 * prog });
      sparks.update(dt, player.st.g); fires.update(dt, G.t, player.st.pos); smoke.update(dt, player.st.pos); ash.update(dt, G.t, player.st.pos, prog * 0.5);
      city.update(dt, G.t, skyProg, G.timeLeft, smoke);
      if (!renderer.shadowMap.enabled) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; player.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); }
      city.shadowFollow(player.st.pos); city.indoor(player.st.pos, dt); player.shadow.material.opacity = Math.min(player.shadow.material.opacity, 0.22);
      fill.position.copy(camera.position).lerp(player.st.pos, 0.4); fill.position.y += 1.2;
      walkCamera(dt);
      audio.alarm(G.t < 25 || G.timeLeft < 45, G.t); audio.wind(0.35 + prog * 0.3, 380); audio.hum(0.4); audio.breath(player.st.hasSuit, G.t * 1.4);
      audio.rumble(0.08 + prog * 0.25);
      if (Math.random() < dt * prog * 0.5) camShake(0.15 + prog * 0.3);    // quakes as the crust is stressed
      if (player.st.dead && !G.dead) fail('hp');
      if (G.timeLeft <= 0 && !G.dead) fail('earth');
      renderer.render(scene, camera);
    } else if (G.mode === 'fly') {
      // ---- flying over the city ----
      const boost = flyControls(dt);
      const n = Math.max(1, Math.min(6, Math.ceil(fl.speed * dt / 0.5)));
      for (let i = 0; i < n; i++) { fl.step(dt / n, dir, boost); collideFly(); }
      if (!G.dead) tick(dt);
      player.st.pos.copy(fl.pos); player.root.position.copy(fl.pos);
      poseFlyer(player, dt);
      const fy = Math.max(0, city.floorAt(fl.pos.x, fl.pos.z, fl.pos.y));
      player.shadow.position.set(fl.pos.x, fy + 0.012, fl.pos.z); player.shadow.material.opacity = 0.4 / (1 + (fl.pos.y - fy) * 0.5);
      if (fl.thrust > 0.3 && fl.h - fy < 2.5 && Math.random() < dt * 40) sparks.emit(new THREE.Vector3(fl.pos.x + (Math.random() - 0.5) * 1.5, fy + 0.1, fl.pos.z + (Math.random() - 0.5) * 1.5), 2, 5, [0.7, 0.85, 1]);
      cityAirThreats(dt, prog);
      meteors.update(dt, G.t, { intensity: prog, aim: fl.pos, allowThreats: false, camPos: fl.pos, skyRate: 16 + 10 * prog });
      sparks.update(dt, player.st.g); fires.update(dt, G.t, fl.pos); smoke.update(dt, fl.pos); ash.update(dt, G.t, fl.pos, prog * 0.5);
      city.update(dt, G.t, skyProg, G.timeLeft, smoke); city.shadowFollow(fl.pos);
      fill.position.copy(camera.position).lerp(fl.pos, 0.4); fill.position.y += 1.2;
      // looking down through thinner smoke as you rise, then into the smoke ceiling that hands over to the Earth view
      scene.fog.density = lerp(lerp(0.0062, 0.0024, smooth(12, 160, fl.h)), 0.03, smooth(320, CITY_DOWN, fl.h));
      G.dust = smooth(330, CITY_DOWN, fl.h);
      pivot.set(fl.pos.x, fl.pos.y + 1, fl.pos.z); ray.copy(camOff).normalize();
      placeCamera(pivot, ray, camOff.length(), fl.h < 10.5);
      camera.fov = G.fov; camera.updateProjectionMatrix();
      const air = meteors.air.map((m) => ({ p: m.head.position, tc: Math.max(0, m.lead - m.t) })).filter((x) => x.tc > 0 && x.tc < 2.6).sort((a, b) => a.tc - b.tc);
      markers(camera, air);
      audio.alarm(false, 0); audio.rumble(fl.thrust * 0.5); audio.wind(clamp(fl.speed / 120, 0.1, 1) * 0.6, 300 + fl.speed * 3); audio.breath(true, G.t * 1.6);
      if (player.st.dead && !G.dead) fail('hp');
      if (G.timeLeft <= 0 && !G.dead) fail('earth');
      renderer.render(scene, camera);
      if (fl.h > CITY_UP) { G.mode = 'climb'; player.root.visible = false; player.shadow.visible = false; marks.forEach((m) => (m.style.opacity = 0)); }
    } else if (G.mode === 'climb') {
      // ---- the climb to space, Earth-scale ----
      const boost = flyControls(dt);
      fl.step(dt, dir, boost);
      const far = Math.hypot(fl.pos.x - LAUNCH.x, fl.pos.z - LAUNCH.z) > 820;
      if (fl.h < CITY_DOWN && far) { fl.pos.y = CITY_DOWN; if (fl.vel.y < 0) fl.vel.y = 0; if (once('edge')) { ui.say('六分儀', '下面嘅城市已經冇晒，向上飛！', 2.5); setTimeout(() => (G.msgs.edge = 0), 8000); } }
      if (!G.dead) tick(dt);
      if (G.ff) { G.timeLeft = Math.max(0, G.timeLeft - G.ffRate * dt); }
      climbRocks(dt);
      poseFlyer(S.hero, dt);
      S.setFov(G.fov);
      S.update(fl, dt, G.t, prog, camOff, rockEvents, { shake, skyProg });
      const hk = fl.h / 1000;
      G.dust = 1 - smooth(0.47, 0.66, hk);
      markers(S.camNear, S.threats(fl, thr).sort((a, b) => a.tc - b.tc));
      // a few words on the way up
      if (fl.glow > 0.55 && once('shield')) ui.say('六分儀', `護盾頂住緊 ${(fl.qdot / 1e6).toFixed(0)} MW/m² 嘅熱力。空氣越稀，你可以飛得越快。`, 4.5);
      if (S.state.sunUp > 0.6 && once('sunrise')) ui.say('維加', '……地球最後一次日出。', 3.5);
      if (fl.h >= SPACE_H && !G.ff) reachSpace();
      const air = Math.min(1, fl.rho() / 1.225);
      audio.rumble(fl.thrust * (0.15 + 0.6 * Math.sqrt(air))); audio.wind(Math.min(1, fl.glow + air * 0.3) * 0.8, 300 + fl.glow * 900); audio.breath(true, G.t * 1.6);
      if (fl.glow > 0.3) shake = Math.max(shake, fl.glow * 0.18);
      if (!G.ff) countdownLines();
      S.render(W, H);
      if (fl.h < CITY_DOWN && !far) { G.mode = 'fly'; player.root.visible = true; player.shadow.visible = true; S.clearRocks(); marks.forEach((m) => (m.style.opacity = 0)); }
      if (G.timeLeft <= 0 && !G.dead) { if (G.ff) beginFinale(); else fail('earth'); }
    } else if (G.mode === 'finale') {
      const tt = FIN.update(dt, G.t);
      if (tt > 2 && once('x1')) ui.say('六分儀', '潮汐力超過咗地球自己嘅引力。', 4);
      if (tt > 15.5 && once('x2')) ui.say('六分儀', '向住黑洞嗰半邊會跌入去，另一半會俾甩出太陽系。', 5);
      if (tt > 21.5 && once('x3')) ui.say('維加', '……萊拉，我嚟緊。', 3.5);
      if (tt > 25.5 && once('x4')) ui.say('六分儀', '萊拉要再等 5 分 51 秒，先會見到呢一幕。', 4.5);
      audio.rumble(tt > 12 && tt < 19 ? 0.5 : 0.05); audio.wind(0);
      FIN.render(W, H);
      if (tt > FIN_LEN) enterSpace(false);
    } else if (G.mode === 'space') {
      // ---- open space: no air, no ceiling; fly to 晨星號 ----
      const boost = flyControls(dt);
      if (RV.phase) rendezvous(dt);
      if (RV.phase === 'auto') autopilot();
      if (G.mode === 'space') {
        fl.step(dt, dir, boost && RV.phase !== 'auto');
        G.clock += dt; G.drift += dt * (GM_C2 / RE * 0.5 + fl.speed * fl.speed / (2 * C2));
        poseFlyer(FIN.hero, dt);
        FIN.setFov(G.fov);
        FIN.updateFree(fl, dt, G.t, camOff, G.dead ? null : spaceEvents);
        if (shake > 0) FIN.camNear.position.add(out.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 0.3));
        placeShip(); ship.update(dt, G.t, renderer.getPixelRatio(), ship.root.scale.x);
        if (RV.phase === 'auto') marks.forEach((m) => (m.style.opacity = 0)); else markers(FIN.camNear, FIN.threats(thr).sort((a, b) => a.tc - b.tc));
        waypoint(FIN.camNear);
        audio.rumble(fl.thrust * 0.08); audio.wind(0); audio.hum(0.3); audio.breath(true, G.t * 1.2);
        if (player.st.dead && !G.dead) fail('hp');
        FIN.render(W, H);
      }
    }
    if (G.mode === 'voyage') { VOY.update(dt, G.t); VOY.render(W, H); }
    if (G.mode === 'mars') {
      MARS.update(dt, G.t); MARS.render(W, H);
      const flying = MARS.flying;
      document.body.classList.toggle('flying', flying); $('ahud').classList.toggle('hidden', !flying); $('ahud').classList.remove('space');
    }
    if (G.mode === 'dock') {
      G.clock += dt;
      FIN.updateFree(fl, dt, G.t, camOff, null);
      dockScene(dt); ship.update(dt, G.t, renderer.getPixelRatio(), ship.root.scale.x);
      FIN.render(W, H);
    }
    hud();
    endFrame();
  }

  function pause(on) { G.paused = on; $('pause').classList.toggle('hidden', !on); audio.mute(on); if (!on) last = performance.now(); }
  $('pResume').onclick = () => pause(false);
  $('pRetry').onclick = () => { pause(false); const sv = store.get('cp2', { cp: 'wake', timeLeft: TOTAL }) || { cp: 'wake', timeLeft: TOTAL }; applyCP(sv.cp, sv.timeLeft); };
  $('pTitle').onclick = () => exit();
  $('eTitle').onclick = () => exit();
  $('eAgain').onclick = () => { $('game').classList.remove('ended', 'final'); const sv = store.get('cp2', null); applyCP(sv && sv.cp ? sv.cp : 'voyage', 0); };
  $('bPause').onclick = () => pause(true);
  function exit(restart) {
    running = false; renderer.renderLists.dispose(); VOY.stop(); if (MARS) MARS.stop(); document.body.classList.remove('voyage', 'mars'); audio.alarm(false, 0);
    audio.rumble(0); audio.wind(0); audio.hum(0); audio.alarm(false, 0); audio.breath(false, 0); audio.mute(false);
    document.body.classList.remove('flying', 'ingame', 'suited', 'touch');
    ['ghud', 'ahud', 'pause', 'wp'].forEach((id) => $(id).classList.add('hidden')); $('game').classList.remove('cine', 'postEarth', 'ended'); $('cd').classList.remove('ff'); $('endT').classList.remove('on');
    ['obj', 'hint', 'say', 'prompt', 'chapter'].forEach((id) => $(id).classList.remove('on'));
    marks.slice(1).forEach((m) => m.remove()); $('rockWarn').style.opacity = 0;
    onExit && onExit(restart);
  }

  // ---------------- boot ----------------
  window.BTH.VOY = VOY; window.BTH.enterMars = (s) => enterMars(s); window.BTH.getMars = () => getMars();
  if (!window.__bthBound) { bindSurface($('touchSurface'), { joyBase: $('joyBase'), joyKnob: $('joyKnob') }); bindButtons($('game')); window.__bthBound = true; }
  document.body.classList.add('ingame'); document.body.classList.toggle('touch', T);
  audio.start(audioCtx);
  const sv = saved && saved.cp ? saved : { cp: 'wake', timeLeft: TOTAL };
  applyCP(sv.cp, sv.timeLeft);
  if (sv.cp === 'wake') { $('chapter').classList.add('on'); setTimeout(() => $('chapter').classList.remove('on'), 4600); }
  requestAnimationFrame((t) => { last = t; frame(t); });
  return { G, exit };
}
