// Beyond the Horizon · Mars on foot: exploring round Lyra's station in Jezero crater, and the lava tube below.
// Few enemies, each one an event: a Reaper scout cutting up Perseverance, a blind brine-walker in the tube,
// and the guardian in the warm chamber. Rest at the relay mast (or a beacon you plant). Scan (T) to find things.
import * as THREE from 'three';
import { input, consume } from './input.js';
import { clamp, damp, dampAngle, smooth, lerp, mulberry, canvasTex } from './util.js';
import { createCombat } from './combat.js';
import { reaperScout, blindWalker, guardian } from './creatures.js';
import { createCave } from './cave.js';
import { createPost } from './post.js';

export const P_PERS = new THREE.Vector3(-240, 0, -200), P_FROST = new THREE.Vector3(260, 0, 220), P_SKY = new THREE.Vector3(380, 0, -340);

export function createExplore(renderer, w) {
  const { ui, audio, G, fl, ctx, ms, cam, hero, lyra, M, colliders, DOOR, MAST, groundH, G_MARS, store } = w;
  const $ = (id) => document.getElementById(id);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _d = new THREE.Vector3(), proj = new THREE.Vector3();
  const post = createPost(renderer);
  const cave = createCave(renderer);
  const X = { on: false, where: 'surface', phase: 'walk', flags: {}, rest: 'mast', beaconP: null, scanCd: 0, scanT: 0, fadeT: 0, cine: null, coldK: 0, beats: {}, lyraLine: 0 };
  const beat = (k) => (X.beats[k] ? false : (X.beats[k] = 1, true));
  const surfFloor = (x, z) => {
    if (Math.hypot(x - P_SKY.x, z - P_SKY.z) < 6.6) return groundH(x, z) - 60;                    // the skylight: a hole
    return Math.hypot(x - w.PAD.x, z - w.PAD.z) < 14.3 ? 0.5 : groundH(x, z);
  };
  const floorNow = (x, z) => (X.where === 'cave' ? cave.floorAt(x, z) : surfFloor(x, z));
  const boundSurf = (p, r) => { for (const c of colliders) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } } };

  // ---------------- combat and the three of them ----------------
  const combat = createCombat({ hero, ui, audio, G, g: G_MARS, coolRate: 9, flash: w.flash, onDeath: () => respawn() });
  const scout = reaperScout(ms, { home: P_PERS.clone().add(new THREE.Vector3(10, 0, 6)), yaw: -2.2, floorAt: surfFloor, bound: boundSurf });
  const heatOf = () => 5.5 + (combat.C.lit > 0.4 ? 7 : 0) + (input.held.has('sprint') ? 4 : 0) + (combat.C.move ? 5 : 0);
  const walker = blindWalker(cave.scene, { home: cave.S[Math.round(78 * 2)].p.clone(), yaw: Math.PI, floorAt: cave.floorAt, bound: cave.bound, heatOf });
  const gHome = cave.CHAMBER.clone().addScaledVector(cave.S[Math.round((cave.L - 20) * 2)].tg, 6);
  const boss = guardian(cave.scene, { home: gHome, yaw: Math.PI, floorAt: cave.floorAt, bound: cave.bound,
    onPhase: () => { ui.say('六分儀', '佢啲熱度升緊！地面會爆，見到橙色圈即刻走開。', 3.8); },
    onDeath: () => { X.flags.guardian = 1; saveFlags(); setTimeout(() => { ui.say('六分儀', '佢冇再郁。碎片喺佢身後嘅石台上面。', 3.6); ui.obj('拎起界碑碎片'); }, 4200); } });
  const surfEnemies = [scout], caveEnemies = [walker, boss];
  [scout, walker, boss].forEach((e) => combat.add(e));
  const origScoutHurt = scout.hurt; scout.hurt = (a, b, c) => { const was = scout.alive; origScoutHurt(a, b, c); if (was && !scout.alive) { X.flags.scout = 1; saveFlags(); setTimeout(() => ui.say('六分儀', '佢拆緊毅力號嘅金屬。收割者會用身邊嘅物質複製自己。', 4.4), 3800); } };
  const origWalkerHurt = walker.hurt; walker.hurt = (a, b, c) => { const was = walker.alive; origWalkerHurt(a, b, c); if (was && !walker.alive) { X.flags.walker = 1; saveFlags(); } };
  function setPlace(where) {
    X.where = where;
    combat.C.enemies = where === 'cave' ? caveEnemies : surfEnemies;
    [scout, walker, boss].forEach((e) => e.bar && e.bar.classList.remove('on'));
    const sc = where === 'cave' ? cave.scene : ms;
    sc.add(hero.root, combat.sparks); hero.shadow.visible = where !== 'cave'; if (where !== 'cave') ms.add(hero.shadow);
    hero.setVisorGlow(where === 'cave' ? 0.025 : 0.18);
  }

  // ---------------- things on the plain ----------------
  // Perseverance, 1,364 years after landing: dust-coloured, wheels sunk, the Reaper's cuts in its side
  const pers = new THREE.Group(); pers.position.set(P_PERS.x, groundH(P_PERS.x, P_PERS.z) - 0.25, P_PERS.z); pers.rotation.set(0.04, 0.6, -0.06); ms.add(pers);
  { const dusty = new THREE.MeshStandardMaterial({ color: 0xb08a6c, roughness: 0.9, metalness: 0.2 }), metal = new THREE.MeshStandardMaterial({ color: 0x6a5a50, roughness: 0.6, metalness: 0.6 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.7 });
    const add = (g, m, x, y, z, p = pers) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; p.add(o); return o; };
    add(new THREE.BoxGeometry(2.6, 0.7, 2.2), dusty, 0, 1.0, 0);
    add(new THREE.BoxGeometry(2.4, 0.08, 2.0), metal, 0, 1.4, 0);
    for (const sx of [-1.2, 0, 1.2]) for (const sz of [-1.25, 1.25]) { const wh = add(new THREE.CylinderGeometry(0.26, 0.26, 0.4, 16), dark, sx, 0.3, sz); wh.rotation.x = Math.PI / 2; }
    for (const sz of [-1.25, 1.25]) add(new THREE.BoxGeometry(2.8, 0.08, 0.08), metal, 0, 0.62, sz);
    const mast = add(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 8), metal, 0.9, 2.1, 0.7); mast.rotation.z = -0.25;
    add(new THREE.BoxGeometry(0.42, 0.26, 0.3), dusty, 1.08, 2.85, 0.7).rotation.z = -0.25;
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 12), dark, -1.45, 1.05, 0).rotation.z = Math.PI / 2 + 0.6;   // the RTG, cold for a thousand years
    const arm = add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), metal, 1.7, 0.9, -0.4); arm.rotation.z = 1.2;
    // cut open: a bright scar where the scout has been at it
    add(new THREE.BoxGeometry(0.06, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x2a1006, emissive: 0xff7a2a, emissiveIntensity: 1.2 }), 1.31, 1.0, 0.2);
    // Ingenuity, on its side, one blade snapped
    const ing = new THREE.Group(); ing.position.set(5.5, 0.2, 3.2); ing.rotation.set(0, 0.4, 1.3); pers.add(ing);
    add(new THREE.BoxGeometry(0.2, 0.18, 0.2), dusty, 0, 0, 0, ing); add(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), metal, 0, 0.3, 0, ing);
    add(new THREE.BoxGeometry(1.2, 0.01, 0.1), dark, 0, 0.42, 0, ing); add(new THREE.BoxGeometry(0.5, 0.01, 0.1), dark, 0.25, 0.5, 0, ing).rotation.y = 1.5;
    for (let i = 0; i < 4; i++) { const l = add(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 4), metal, Math.cos(i * 1.57) * 0.14, -0.2, Math.sin(i * 1.57) * 0.14, ing); l.rotation.z = Math.cos(i * 1.57) * 0.4; }
    colliders.push({ x: P_PERS.x, z: P_PERS.z, r: 1.9 }); }
  // the frost crater: salt frost, and under it a dark crust that is alive
  const frost = new THREE.Group(); frost.position.copy(P_FROST).setY(groundH(P_FROST.x, P_FROST.z)); ms.add(frost);
  { const R = mulberry(5);
    const ft = canvasTex(256, 256, (g, s) => { for (let i = 0; i < 60; i++) { const x = R() * s, y = R() * s, r = 6 + R() * 30, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); } }, { srgb: false });
    const mt = canvasTex(256, 256, (g, s) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, s, s); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${40 + R() * 30},${16 + R() * 10},${46 + R() * 30},${0.4 + R() * 0.5})`; g.beginPath(); g.arc(s / 2 + (R() - 0.5) * s * 0.7, s / 2 + (R() - 0.5) * s * 0.7, 2 + R() * 9, 0, Math.PI * 2); g.fill(); } });
    for (let i = 0; i < 9; i++) {
      const a = R() * 6.28, r = R() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r, y = groundH(P_FROST.x + x, P_FROST.z + z) - frost.position.y + 0.05;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(10 + R() * 12, 10 + R() * 12), new THREE.MeshStandardMaterial({ color: 0xf2eee8, alphaMap: ft, transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
      f.rotation.set(-Math.PI / 2, 0, R() * 6); f.position.set(x, y, z); f.receiveShadow = true; frost.add(f);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4 + R() * 5, 4 + R() * 5), new THREE.MeshStandardMaterial({ map: mt, transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
      m.rotation.set(-Math.PI / 2, 0, R() * 6); m.position.set(x * 0.6, y + 0.01, z * 0.6); m.receiveShadow = true; frost.add(m);
    } }
  // the skylight: a black hole in the plain with a rubble rim, warm air shimmering out of it
  const sky = new THREE.Group(); sky.position.copy(P_SKY).setY(groundH(P_SKY.x, P_SKY.z)); ms.add(sky);
  { const ht = canvasTex(256, 256, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.72, 'rgba(0,0,0,1)'); gr.addColorStop(0.86, 'rgba(20,10,6,0.85)'); gr.addColorStop(1, 'rgba(40,20,12,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, { srgb: false });
    const hole = new THREE.Mesh(new THREE.CircleGeometry(9.5, 48), new THREE.MeshBasicMaterial({ map: ht, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.12; sky.add(hole);
    const R = mulberry(8), rm = new THREE.MeshStandardMaterial({ color: 0x6a4434, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28 + R() * 0.2, r = 7.4 + R() * 2.4, s = 0.4 + R() * 1.2; const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rm); b.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r); b.rotation.set(R() * 3, R() * 3, R() * 3); b.castShadow = b.receiveShadow = true; sky.add(b); } }
  const steam = []; { const st = canvasTex(64, 64, (g, s) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, { srgb: false });
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, color: 0xe8d8c8, transparent: true, depthWrite: false, opacity: 0 })); sky.add(s); steam.push({ s, t: i / 14 * 6 }); } }
  // the rest point at the relay mast
  const MASTP = new THREE.Vector3(MAST.x - 3.2, 0, MAST.z + 2.4);
  // a beacon you can plant in the tube
  const beaconG = new THREE.Group(); beaconG.visible = false; cave.scene.add(beaconG);
  { const m = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.5, metalness: 0.6 });
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), m); const a = i * 2.09; l.position.set(Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25); l.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); beaconG.add(l); }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc27a })); top.position.y = 1.15; beaconG.add(top);
    const bl = new THREE.PointLight(0xffb060, 8, 10, 2); bl.position.y = 1.3; beaconG.add(bl); beaconG.userData.light = bl; }

  // ---------------- points of interest (for the scanner) ----------------
  const POIS = [
    { id: 'pers', name: '毅力號（2021）', at: P_PERS, where: 'surface', r: 6 },
    { id: 'frost', name: '鹽霜坑', at: P_FROST, where: 'surface', r: 10 },
    { id: 'skyl', name: '熔岩管天窗', at: P_SKY, where: 'surface', r: 14 },
    { id: 'mast', name: '中繼站（休息點）', at: MASTP, where: 'surface', r: 5, known: true },
    { id: 'chamber', name: '熱源', at: cave.CHAMBER, where: 'cave', r: 20 },
  ];
  const poiLayer = $('pois');
  POIS.forEach((p) => { const el = document.createElement('div'); el.className = 'poi'; el.innerHTML = '<i></i><b></b><span class="num"></span>'; poiLayer.appendChild(el); p.el = el; });

  function saveFlags() { store.set('marsFlags', { ...X.flags, rest: X.rest, beacon: X.beaconP ? X.beaconP.toArray() : null }); }

  // ---------------- begin / resume ----------------
  function begin(resume) {
    X.on = true; X.beats = {}; X.phase = 'walk'; X.cine = null; X.fadeT = 0;
    const sv = resume ? store.get('marsFlags', {}) : {};
    X.flags = { ...sv }; delete X.flags.rest; delete X.flags.beacon;
    X.rest = sv.rest || 'mast'; X.beaconP = sv.beacon ? new THREE.Vector3().fromArray(sv.beacon) : null;
    beaconG.visible = !!X.beaconP; if (X.beaconP) beaconG.position.copy(X.beaconP);
    [scout, walker, boss].forEach((e) => e.reset());
    if (X.flags.scout) kill(scout); if (X.flags.walker) kill(walker); if (X.flags.guardian) kill(boss);
    if (X.flags.shard) { cave.takeShard(); X.coldK = 1; cave.setCold(1); } else { X.coldK = 0; cave.setCold(0); }
    combat.reset(true); combat.setArmed(true);
    document.body.classList.add('explore');
    if (resume && X.rest === 'beacon' && X.beaconP) { setPlace('cave'); hero.place(X.beaconP.clone().add(_v.set(1.2, 0, 0)), Math.PI); }
    else { setPlace('surface'); hero.place(new THREE.Vector3(MASTP.x - 2, 0, MASTP.z + 1.5), -2.4); }
    hero.st.mode = 'walk'; hero.st.g = G_MARS; hero.st.heavy = 1; hero.st.thrust = 0; hero.setShield(0); hero.st.frozen = false;
    M.camYaw = hero.st.yaw + Math.PI; M.camPitch = 0.15;
    placeLyra();
    objective();
    ctx.saveCP && ctx.saveCP('marsx'); saveFlags();
    if (!resume) {
      ui.hint(input.touch ? '「攻擊」「重擊」「格擋」「翻滾」　「鎖定」對準敵人' : '左鍵 輕擊　X 重擊　右鍵／Q 格擋（按住）　Shift 翻滾　Tab 鎖定', 9);
      setTimeout(() => X.on && ui.hint(input.touch ? '「治療」打針　「掃描」搵附近嘅嘢　「飛」用 RJ-7' : 'G 治療針　T 掃描　V 用 RJ-7 飛　R 跑', 8), 9500);
    }
  }
  function kill(e) { e.alive = false; e.state = 'dead'; e.deathT = 99; e.root.visible = false; }
  function placeLyra() { M.lyraP.copy(DOOR).add(_v.set(-6.5, 0, 6.5)); M.lyraYaw = Math.atan2(MASTP.x - M.lyraP.x, MASTP.z - M.lyraP.z) - 0.6; lyra.root.visible = true; }

  function objective() {
    const f = X.flags; const wpB = $('wp').querySelector('b');
    if (f.shard) { ui.obj('返中繼站搵萊拉'); X.target = { at: M.lyraP, where: 'surface', name: '萊拉' }; }
    else if (X.where === 'cave') { ui.obj(f.guardian ? '拎起界碑碎片' : '沿住熔岩管搵熱源'); X.target = { at: cave.CHAMBER, where: 'cave', name: '熱源' }; }
    else { ui.obj('搵地底嘅熱源'); X.target = { at: P_SKY, where: 'surface', name: '熱源' }; }
    wpB.textContent = X.target.name; $('wp').classList.remove('hidden', 'near');
  }

  // ---------------- interactions ----------------
  function nearest() {
    const p = hero.st.pos, f = X.flags;
    const d = (q) => Math.hypot(p.x - q.x, p.z - q.z);
    const fight = combat.C.enemies.some((e) => e.alive && e.aware);
    if (X.where === 'surface') {
      if (d(M.lyraP) < 2.6) return { label: f.shard ? '將碎片俾萊拉睇' : '同萊拉講嘢', act: talkLyra };
      if (d(MASTP) < 3.2 && !fight) return { label: '喺中繼站休息', act: () => rest('mast') };
      if (d(P_PERS) < 5 && !f.pers) return { label: '睇吓毅力號', act: lookPers };
      if (d(P_FROST) < 9 && !f.frost) return { label: '採集樣本', act: sampleFrost };
    } else {
      if (d(cave.SKY) < 6 && !X.beaconP) return { label: '插低信標（休息點）', act: plantBeacon };
      if (X.beaconP && d(X.beaconP) < 2.6 && !fight) return { label: '喺信標休息', act: () => rest('beacon') };
      if (d(cave.SKY) < 4.5 && !fight) return { label: '飛出天窗', act: exitCave };
      if (f.guardian && !f.shard && d(cave.SHARD) < 3.4) return { label: '拎起界碑碎片', act: takeShard };
    }
    return null;
  }
  function talkLyra() {
    const f = X.flags; const L = (t, d) => ui.say('萊拉', t, d || Math.max(2.6, t.length * 0.15 + 1), '火星　延遲 0 秒');
    if (f.shard) return finale();
    const lines = !f.skyl ? [['熱源喺東北面，大約五百米，地底下。'], ['用掃描睇吓，六分儀會幫你標低附近有乜。']]
      : !f.guardian ? [['入到熔岩管，記得插低信標。'], ['死咗都可以由嗰度再嚟。']]
      : [['你拎到未？']];
    const k = X.lyraLine++ % lines.length; L(lines[k][0]);
    if (!f.scout && X.lyraLine === 2) L('仲有，隕石坑西北面嗰邊有收割者，好似係拆緊毅力號。');
  }
  function lookPers() {
    X.flags.pers = 1; saveFlags();
    ui.say('六分儀', '毅力號。公元 2021 年降落喺呢個耶澤羅隕石坑，搵古代微生物嘅痕跡。', 5);
    ui.say('六分儀', '旁邊嗰架係機智號直升機，2024 年斷咗片槳。佢哋喺度等咗一千三百幾年。', 5);
    ui.say('維加', '佢哋搵唔到嘅嘢，原來一直喺地底。', 3.6);
  }
  function sampleFrost() {
    X.flags.frost = 1; saveFlags(); audio.tone(740, 0.12, 0.05);
    ui.say('六分儀', '高氯酸鹽鹵水，零下七十度都唔結冰。入面有嘢郁緊。', 4.4);
    ui.say('六分儀', '微生物，用鹽同熱過活，地底一定仲有更多。新物種：鹽霜菌毯。', 4.6);
  }
  function rest(where) {
    X.rest = where; combat.reset(true); hero.st.hp = hero.st.maxHp; audio.tone(523, 0.3, 0.05); setTimeout(() => audio.tone(784, 0.4, 0.05), 180);
    (where === 'cave' || where === 'beacon' ? caveEnemies : surfEnemies).forEach((e) => { if (e.alive) e.reset(); });
    ui.hint('已休息：生命同治療針補滿', 2.2); saveFlags(); ctx.saveCP && ctx.saveCP('marsx');
  }
  function plantBeacon() {
    X.beaconP = hero.st.pos.clone().addScaledVector(_v.set(Math.sin(hero.st.yaw), 0, Math.cos(hero.st.yaw)), 1.2); X.beaconP.y = cave.floorAt(X.beaconP.x, X.beaconP.z);
    beaconG.position.copy(X.beaconP); beaconG.visible = true; rest('beacon');
    ui.say('六分儀', '信標插好。喺度休息會補返生命同治療針；死咗會喺度醒返。', 4.4);
  }

  // ---------------- the cave: in and out ----------------
  function fade(fn) { if (X.fadeT > 0 || X.afterFade) return; $('fade').classList.add('on'); X.fadeT = 0.35; X.afterFade = fn; }
  function enterCave() {
    fade(() => {
      setPlace('cave'); X.phase = 'walk'; hero.rig.pose = null; combat.setArmed(true); document.body.classList.remove('flying');
      // land a few metres into the tube, facing down it, so the camera has tunnel behind him and not the dead end
      const s0 = cave.S[8], fy = Math.atan2(s0.tg.x, s0.tg.z);
      hero.place(s0.p.clone().add(_v.set(0, 2.4, 0)), fy); hero.st.onGround = false; hero.st.vy = -2; hero.st.mode = 'walk'; hero.st.thrust = 0; hero.setShield(0);
      M.camYaw = fy + Math.PI; M.camPitch = 0.22; M.camDist = 4.3;
      if (!X.flags.skyl) { X.flags.skyl = 1; saveFlags(); }
      if (beat('cave1')) { ui.say('六分儀', '熔岩管。溫度零下二十度，比上面暖五十度。熱源喺前面大約一百五十米。', 5); }
      objective();
    });
  }
  function exitCave() {
    fade(() => {
      setPlace('surface'); startHop(new THREE.Vector3(P_SKY.x, groundH(P_SKY.x, P_SKY.z) + 3, P_SKY.z), 22);
      // out of the hole and down on the rim, on the side that faces the station, unless you take the controls
      const toSt = _v.set(-P_SKY.x, 0, -P_SKY.z).normalize();
      X.auto = { t: 0, to: new THREE.Vector3(P_SKY.x + toSt.x * 11, 0, P_SKY.z + toSt.z * 11) };
      objective();
    });
  }

  // ---------------- flying (RJ-7) on the surface ----------------
  function canFly() { return !combat.C.enemies.some((e) => e.alive && e.aware && e.pos.distanceTo(hero.st.pos) < 30); }
  function startHop(from, up = 14) {
    X.phase = 'hop'; fl.reset(from); fl.vmaxFn = w.vmaxMars; fl.rhoFn = w.rhoMars; fl.vel.set(0, up, 0); ui.prompt(''); X.near = null;
    hero.rig.pose = null; hero.setCutter(false); hero.st.mode = 'fly'; hero.st.frozen = true;
    G.fYaw = M.camYaw + Math.PI; G.fPitch = 0.2; G.lookIdle = 0; document.body.classList.add('flying');
    combat.C.lock = null; $('lockR').classList.remove('on');
  }
  function land(p) {
    X.phase = 'walk'; fl.vel.set(0, 0, 0); hero.st.frozen = false; hero.st.mode = 'walk'; hero.st.thrust = 0; hero.setShield(0);
    hero.place(p, hero.st.yaw); hero.root.rotation.set(0, hero.st.yaw, 0);
    combat.setArmed(true); document.body.classList.remove('flying'); audio.burst(160, 0.35, 0.25, 'lowpass');
    M.camYaw = hero.st.yaw + Math.PI;
  }
  function hopTick(dt, t) {
    const boost = ctx.flyControls(dt);
    const a = X.auto;
    if (a && (input.move.x || input.move.y || boost)) X.auto = null;
    if (X.auto) {
      a.t += dt;
      const gy = groundH(a.to.x, a.to.z), dx = a.to.x - fl.pos.x, dz = a.to.z - fl.pos.z, dh = Math.hypot(dx, dz);
      if (a.t < 0.8) fl.vel.y = damp(fl.vel.y, 14, 4, dt);
      else { const sp = Math.min(11, dh * 1.4) / Math.max(dh, 1e-3), vy = dh > 3 ? (gy + 5 - fl.pos.y) * 1.6 : (gy - fl.pos.y) * 2.4;
        fl.vel.x = damp(fl.vel.x, dx * sp, 5, dt); fl.vel.z = damp(fl.vel.z, dz * sp, 5, dt); fl.vel.y = damp(fl.vel.y, vy, 5, dt); }
      fl.pos.addScaledVector(fl.vel, dt);
      if (a.t > 0.8 && dh < 1.0 && fl.pos.y - gy < 1.0) { X.auto = null; ctx.poseFlyer(hero, dt); land(new THREE.Vector3(fl.pos.x, gy, fl.pos.z)); return; }
    } else fl.step(dt, ctx.dir, boost);
    const g = surfFloor(fl.pos.x, fl.pos.z);
    const inPit = Math.hypot(fl.pos.x - P_SKY.x, fl.pos.z - P_SKY.z) < 6.6;
    if (!inPit && fl.pos.y < g + 0.6) { fl.pos.y = g + 0.6; if (fl.vel.y < 0) fl.vel.y = 0; }
    ctx.poseFlyer(hero, dt); hero.root.position.copy(fl.pos); hero.st.pos.copy(fl.pos);
    const alt = fl.pos.y - g;
    if (inPit && fl.pos.y < groundH(P_SKY.x, P_SKY.z) - 3) return enterCave();
    if (!inPit && alt < 0.9 && fl.vel.y <= 0.3 && fl.speed < 30) land(new THREE.Vector3(fl.pos.x, g, fl.pos.z));
    if (consume('fly')) { if (alt < 8) land(new THREE.Vector3(fl.pos.x, g, fl.pos.z)); else ui.hint(input.touch ? '降低高度先落得地（「下降」）' : '降低高度先落得地（C）', 1.4); }
    // camera over the shoulder
    const camOff = ctx.camOff, L = camOff.length();
    const sh = _w.copy(camOff).negate().cross(_v.set(0, 1, 0)).normalize().multiplyScalar(0.18 * L);
    cam.position.copy(fl.pos).add(_v.set(0, 1, 0)).add(camOff).add(sh);
    const cg = surfFloor(cam.position.x, cam.position.z); if (cam.position.y < Math.max(cg, groundH(cam.position.x, cam.position.z)) + 0.8) cam.position.y = groundH(cam.position.x, cam.position.z) + 0.8;
    cam.up.set(0, 1, 0); cam.lookAt(_v.copy(fl.pos).add(_w.set(0, 1, 0)).add(sh.set(sh.x, 0, sh.z)));
    cam.fov = G.fov; cam.updateProjectionMatrix();
    audio.rumble(fl.thrust * 0.3); audio.wind(clamp(fl.speed / 600, 0.05, 1) * 0.3, 260 + fl.speed); audio.breath(true, t * 1.5);
  }

  // ---------------- on foot ----------------
  const pivot = new THREE.Vector3(), ray = new THREE.Vector3();
  function walkTick(dt, t) {
    combat.pre(dt);
    hero.update(dt, M.camYaw, [], t, { floorAt: floorNow });
    if (X.where === 'surface') boundSurf(hero.st.pos, hero.st.radius); else cave.bound(hero.st.pos, hero.st.radius);
    combat.post(dt, t, cam);
    if (X.where === 'surface' && hero.st.pos.y < groundH(P_SKY.x, P_SKY.z) - 3 && Math.hypot(hero.st.pos.x - P_SKY.x, hero.st.pos.z - P_SKY.z) < 7) return enterCave();
    // take off
    if (consume('fly')) {
      if (X.where === 'cave') { if (Math.hypot(hero.st.pos.x - cave.SKY.x, hero.st.pos.z - cave.SKY.z) < 4.5) exitCave(); else ui.hint('熔岩管入面飛唔到，返天窗下面先得', 1.6); }
      else if (!canFly()) ui.hint('附近有敵人，飛唔起', 1.2);
      else if (hero.st.onGround) startHop(hero.st.pos.clone().add(_v.set(0, 0.6, 0)));
    }
    // interactions
    const near = combat.C.dead ? null : nearest(); X.near = near;
    ui.prompt(near ? `<b>${input.touch ? '互動' : 'E'}</b>${near.label}` : '');
    if (near && consume('interact')) near.act();
    // camera
    const sens = input.touch ? 0.006 : 0.0045;
    M.camYaw -= input.look.dx * sens; M.camPitch = clamp(M.camPitch + input.look.dy * sens * 0.8, -0.6, 1.1);
    const ly = combat.camYawFor();
    const lk = combat.C.lock;
    if (ly != null) { M.camYaw = dampAngle(M.camYaw, ly - 0.12, 7, dt); M.camPitch = damp(M.camPitch, lk.boss ? 0.34 : 0.26, 3, dt); }
    hero.headPos(pivot); pivot.y -= 0.15;
    const dist = lk ? (lk.boss ? 7.5 : 5.0) : 4.3;
    M.camDist = damp(M.camDist, dist, 4, dt);
    ray.set(Math.sin(M.camYaw) * Math.cos(M.camPitch), Math.sin(M.camPitch), Math.cos(M.camYaw) * Math.cos(M.camPitch));
    // over the right shoulder (further out when locked on, so the hero never hides what he's fighting)
    const shoulder = _w.set(Math.cos(M.camYaw), 0, -Math.sin(M.camYaw)).multiplyScalar(lk ? 0.85 : 0.5);
    X.sh = X.sh || new THREE.Vector3(); X.sh.lerp(shoulder, 1 - Math.exp(-5 * dt));
    pivot.add(X.sh);
    // never let the camera sink into a dome, tank or wall: walk the boom out and stop short of the first solid
    let boom = M.camDist;
    if (X.where === 'surface') for (let t = 0.6; t < boom; t += 0.25) {
      const x = pivot.x + ray.x * t, y = pivot.y + ray.y * t, z = pivot.z + ray.z * t;
      if (colliders.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.35) ** 2 && y < c.r + 1.6)) { boom = Math.max(0.7, t - 0.35); break; }
    }
    cam.position.copy(pivot).addScaledVector(ray, boom);
    if (X.where === 'cave') cave.clampCam(cam.position, pivot);
    else { const g = groundH(cam.position.x, cam.position.z) + 0.4; if (cam.position.y < g) cam.position.y = g; }
    // squeezed right up against him (a tight tunnel, the skylight): hide him rather than fill the screen with helmet
    hero.root.visible = cam.position.distanceTo(pivot) > 0.8;
    const look = _v.copy(pivot); if (lk) look.lerp(_w.copy(lk.pos).setY(lk.pos.y + lk.height * 0.45).add(X.sh), 0.3);
    const s = combat.shake; if (s > 0) cam.position.add(_w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(s * 0.12));
    cam.up.set(0, 1, 0); cam.lookAt(look); cam.fov = 60; cam.updateProjectionMatrix();
    // story beats while walking about
    if (X.where === 'cave') {
      const wd = walker.alive ? walker.pos.distanceTo(hero.st.pos) : 99;
      if (wd < 24 && !walker.aware && beat('blind')) ui.say('六分儀', '前面有嘢。佢冇眼，靠熱嚟搵你。收埋切割器、唔好跑，可以偷偷行過去。', 5.2);
      if (boss.alive && boss.pos.distanceTo(hero.st.pos) < 30 && beat('bossnear')) ui.say('六分儀', '熱源就喺前面。仲有一樣好大嘅嘢。', 3.6);
    } else if (scout.alive && scout.pos.distanceTo(hero.st.pos) < 40 && !scout.aware && beat('scoutnear')) ui.say('六分儀', '收割者偵察機。佢背脊嗰幾塊散熱片係弱點，由後面打。', 4.4);
  }

  // ---------------- the scanner ----------------
  function scan() {
    if (X.scanCd > 0) return; X.scanCd = 5; X.scanT = 12; audio.tone(1100, 0.15, 0.04); setTimeout(() => audio.tone(1650, 0.2, 0.03), 120);
    $('scanRing').classList.remove('go'); void $('scanRing').offsetWidth; $('scanRing').classList.add('go');
    const e = combat.C.enemies.find((e) => e.alive && e.pos.distanceTo(hero.st.pos) < 60);
    if (e && beat('scan_' + e.name)) ui.say('六分儀', e === scout ? '掃描：收割者偵察機。弱點：背部散熱片。' : e === walker ? '掃描：鹽穴盲行者。冇眼，靠熱感應。佢企起身嗰陣，頭上啲熱感應坑係弱點。' : '掃描：守熱者。佢企起身或者衝完卡住嗰陣，胸口嘅熱核係弱點。', 4.6);
  }
  function poisHud() {
    const W = innerWidth, H = innerHeight, f = X.flags;
    for (const p of POIS) {
      const show = X.scanT > 0 && p.where === X.where && p.at.distanceTo(hero.st.pos) < 1500;
      const el = p.el; if (!show) { el.classList.remove('on'); continue; }
      proj.copy(p.at).setY(floorNow(p.at.x, p.at.z) + 3).project(cam);
      const vis = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05; el.classList.toggle('on', vis); if (!vis) continue;
      el.style.transform = `translate(${(proj.x + 1) / 2 * W}px, ${(1 - proj.y) / 2 * H}px)`;
      const known = p.known || f[p.id] || p.at.distanceTo(hero.st.pos) < 60;
      el.querySelector('b').textContent = known ? p.name : '未知訊號';
      el.querySelector('span').textContent = `${Math.round(p.at.distanceTo(hero.st.pos))} m`;
      el.style.opacity = Math.min(1, X.scanT / 2);
    }
  }
  function waypoint() {
    const el = $('wp'); const tg = X.target;
    if (!tg || tg.where !== X.where || X.phase === 'cine') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const p = _v.copy(tg.at).setY(floorNow(tg.at.x, tg.at.z) + 2), d = p.distanceTo(hero.st.pos);
    proj.copy(p).project(cam);
    let x = proj.x, y = proj.y; const behind = proj.z > 1;
    if (behind) { x = -x; y = -y; if (Math.hypot(x, y) < 0.05) y = -1; }
    const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.8;
    if (off) { const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8); x /= m; y /= m;
      if (input.touch && x > 0.2 && y < 0.3) y = 0.3; }       // phones: keep the edge marker above the thumb buttons
    el.style.transform = `translate(${(x + 1) / 2 * innerWidth}px, ${(1 - y) / 2 * innerHeight}px)`;
    el.classList.toggle('off', off); el.classList.toggle('lft', x > 0.5);
    if (off) el.style.setProperty('--a', `${Math.atan2(-y, x) * 180 / Math.PI + 90}deg`);
    $('wpD').textContent = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.max(0, d).toFixed(0)} m`;
    el.style.opacity = d < 8 ? '0.25' : '1';
  }

  // ---------------- the shard ----------------
  // the record: he holds the shard up, its light on his visor, and the Builders' star map opens above it
  let rec = null;
  function makeRecord() {
    const dotT = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }, { srgb: false });
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
    // the shard in his right hand, and its light
    const shardM = new THREE.MeshStandardMaterial({ color: 0xffd2a0, emissive: 0xff9a48, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.1 });
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), shardM); shard.scale.set(0.7, 1.9, 0.7); shard.position.set(0, -0.11, 0.02);
    const sLight = new THREE.PointLight(0xffb070, 0, 4, 2); sLight.position.set(0, -0.05, 0.12); shard.add(sLight);   // a hand's width from the suit: it warms the visor, it doesn't blow it out
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotT, color: 0xffb070, opacity: 0.22, ...add })); halo.scale.setScalar(0.2); shard.add(halo);
    hero.rig.armR.hand.add(shard); shard.visible = false;
    // the map: a flattened swirl of stars, five marked, the route between them, a projection disc and the light cone
    const g = new THREE.Group(); g.visible = false; g.rotation.order = 'YXZ'; const spin = new THREE.Group(); g.add(spin);
    const R = mulberry(5150), N = 170, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 0.05 + Math.pow(R(), 0.75) * 0.4, a = R() * Math.PI * 2 + r * 6 + (i % 2) * Math.PI;
      pos.set([Math.cos(a) * r, (R() - 0.5) * 0.05 * (1 - r), Math.sin(a) * r], i * 3);
      const warm = R() < 0.3; col.set(warm ? [1, 0.78, 0.5] : [0.55, 0.85, 1], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const starsM = new THREE.PointsMaterial({ size: 0.024, map: dotT, vertexColors: true, opacity: 0, ...add }); spin.add(new THREE.Points(sg, starsM));
    const NP = [[0.02, 0.01, 0.03], [0.17, 0.03, -0.09], [-0.1, 0.05, 0.27], [0.31, -0.01, 0.2], [-0.3, 0.02, -0.17]].map((a) => new THREE.Vector3(...a));
    const nodes = NP.map((p, i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotT, color: i === 0 ? 0xffb070 : 0x9fdcff, opacity: 0, ...add })); sp.position.copy(p); sp.scale.setScalar(i === 0 ? 0.09 : 0.06); spin.add(sp); return sp; });
    const lineM = new THREE.LineBasicMaterial({ color: 0x8fd6ff, opacity: 0, ...add });
    spin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(NP), lineM));
    const discM = new THREE.MeshBasicMaterial({ color: 0x6fc4ff, opacity: 0, side: THREE.DoubleSide, ...add });
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.43, 0.445, 64), discM); disc.rotation.x = -Math.PI / 2; spin.add(disc);
    const beamM = new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: { uK: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vY; uniform float uK; void main(){ float a = uK * (0.05 + 0.16 * (1.0 - vY)) * smoothstep(0.0, 0.08, vY); gl_FragColor = vec4(vec3(0.55, 0.82, 1.0) * a, a); }' });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.012, 1, 40, 1, true).translate(0, 0.5, 0), beamM); beam.visible = false;
    return { shard, shardM, sLight, g, spin, starsM, nodes, lineM, discM, beamM, beam, center: new THREE.Vector3(), hand: new THREE.Vector3() };
  }
  function recordPose(dt, t) {
    const c = X.cine, k = c ? c.hold || 0 : 0; if (k <= 0) return;
    const { armL, armR, neck } = hero.rig;
    const to = (o, x, y, z) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };
    to(armR.sh, -0.95, 0, 0.32); armR.el.rotation.x += (-1.3 - armR.el.rotation.x) * k;
    to(armL.sh, -0.72, 0, -0.38); armL.el.rotation.x += (-1.45 - armL.el.rotation.x) * k;
    const look = c.t < 3.6 ? 0.32 : c.t < 20 ? -0.18 : 0.38; c.neck = damp(c.neck == null ? 0 : c.neck, look, 2.5, dt);
    neck.rotation.x += (c.neck - neck.rotation.x) * k;
  }
  function takeShard() {
    X.phase = 'cine'; X.cine = { t: 0, hold: 0 }; ui.prompt(''); ui.obj(''); $('game').classList.add('cine'); combat.C.lock = null;
    combat.setArmed(false); $('chud').classList.add('hidden');
    if (!rec) rec = makeRecord();
    cave.scene.add(rec.g, rec.beam); rec.shard.visible = true; hero.rig.pose = recordPose;
    cave.takeShard(); X.flags.shard = 1; saveFlags(); audio.tone(392, 0.6, 0.05); setTimeout(() => audio.tone(587, 0.8, 0.05), 300);
    const L = [
      ['六分儀', '碎片入面有段記錄。我試吓解碼。', 3.6],
      ['築界者記錄', '我哋喺每一個有熱嘅地方，留低一粒種子。', 4],
      ['築界者記錄', '拎得起佢嘅，即係準備好行出去。', 3.6],
      ['築界者記錄', '跟住星圖。下一道門，喺比鄰。', 3.8],
      ['六分儀', '星圖完成五分之一。集齊五塊，先計得出可以住嘅星球座標。', 4.6],
      ['六分儀', '……洞入面嘅溫度跌緊。冇咗碎片，鹵水會慢慢結冰。', 4.4],
      ['維加', '對唔住。', 2.4],
    ];
    L.forEach(([who, text, d]) => ui.say(who, text, d, who === '築界者記錄' ? '碎片　解碼' : ''));
  }
  function cineTick(dt, t) {
    const c = X.cine; c.t += dt;
    X.coldK = Math.min(1, X.coldK + dt / 22); cave.setCold(X.coldK);
    // he raises it, holds it through the record, lowers it when the cold sets in
    c.hold = Math.min(smooth(0, 1.4, c.t), 1 - smooth(23.5, 26.5, c.t));
    cave.lamp.intensity = 22;            // the shard is the light in this scene, not his helmet lamp
    hero.animate(dt, t, 0);
    hero.root.updateMatrixWorld(true);
    const r = rec, fwd = _v.set(Math.sin(hero.st.yaw), 0, Math.cos(hero.st.yaw)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    r.shard.getWorldPosition(r.hand);
    // the shard's light breathes; the map opens with the Builders' voice and folds away when the cold comes
    const pulse = 0.85 + 0.15 * Math.sin(t * 3.1);
    r.sLight.intensity = 0.3 * pulse * (1 - X.coldK * 0.5); r.shardM.emissiveIntensity = 1.2 * pulse;
    const mk = Math.min(smooth(3.6, 5.4, c.t), 1 - smooth(19.6, 21.4, c.t)), lit = smooth(15, 16.2, c.t);
    r.g.visible = r.beam.visible = mk > 0.003;
    if (r.g.visible) {
      // the map hangs above and ahead of the shard, tipped toward him so he (and we, over his shoulder) look into it
      r.center.copy(r.hand).add(_w.set(0, 0.62 + 0.04 * Math.sin(t * 0.8), 0)).addScaledVector(fwd, 0.18);
      r.g.position.copy(r.center); r.g.rotation.set(-0.85, hero.st.yaw, 0); r.spin.rotation.y += dt * 0.12; r.g.scale.setScalar((0.6 + 0.4 * mk) * 1.5);
      const up = _w.subVectors(r.center, r.hand); const len = up.length();
      r.beam.position.copy(r.hand); r.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.normalize()); r.beam.scale.set(1, len, 1);
      r.starsM.opacity = mk * 0.95; r.lineM.opacity = mk * (0.28 + 0.5 * lit); r.discM.opacity = mk * 0.35; r.beamM.uniforms.uK.value = mk;
      r.nodes.forEach((n, i) => { n.material.opacity = mk * (i === 0 ? 0.6 + 0.4 * lit : 0.55); n.scale.setScalar((i === 0 ? 0.08 + 0.05 * lit * (0.8 + 0.2 * Math.sin(t * 5)) : 0.055)); });
    }
    // three shots: the shard on his visor; over his shoulder into the map; the push-in as the chamber freezes
    let look;
    if (c.t < 3.6) {
      cam.position.copy(r.hand).addScaledVector(fwd, 0.95).addScaledVector(side, 0.5).add(_w.set(0, -0.12, 0));
      look = _w.copy(r.hand).lerp(hero.headPos(new THREE.Vector3()), 0.45); cam.fov = 40;
    } else if (c.t < 19.6) {
      const ph = lerp(0.32, 0.62, smooth(3.6, 19.6, c.t)), rad = lerp(2.6, 2.2, smooth(3.6, 19.6, c.t));
      cam.position.copy(hero.st.pos).addScaledVector(fwd, -Math.cos(ph) * rad).addScaledVector(side, Math.sin(ph) * rad).add(_w.set(0, 1.85, 0));
      look = _w.copy(r.center).lerp(hero.headPos(new THREE.Vector3()), 0.3); cam.fov = 46;
    } else {
      cam.position.copy(hero.st.pos).addScaledVector(fwd, lerp(3.2, 2.3, smooth(19.6, 29, c.t))).add(_w.set(0, 1.7, 0)).addScaledVector(side, 1.1);
      look = _w.copy(hero.st.pos).setY(hero.st.pos.y + 1.45); cam.fov = 46;
    }
    cave.clampCam(cam.position, hero.st.pos);
    cam.lookAt(look); cam.updateProjectionMatrix();
    if (c.t > 29) {
      X.phase = 'walk'; X.cine = null; $('game').classList.remove('cine');
      r.shard.visible = false; r.sLight.intensity = 0; r.g.visible = r.beam.visible = false; hero.rig.pose = null; combat.setArmed(true); cave.lamp.intensity = 60;
      objective(); ui.hint(input.touch ? '返天窗下面「互動」飛出去' : '返天窗下面按 E 飛出去', 4);
    }
  }
  function finale() {
    X.phase = 'fin'; X.cine = { t: 0 }; ui.prompt(''); ui.obj(''); $('game').classList.add('cine'); $('wp').classList.add('hidden');
    combat.setArmed(false); $('chud').classList.add('hidden');       // no blade in his hand for this
    hero.setVisorUp(true); lyra.setVisorUp(true);
    const L = (t) => ui.say('萊拉', t, Math.max(2.8, t.length * 0.15 + 1.1), '火星　延遲 0 秒');
    L('……佢好暖。'); ui.say('維加', '下面嗰個洞，會凍返。', 3); L('火星會搵到另一種熱。我哋一向都係咁過。');
    L('六分儀收到木星方向有個訊號，同你條信標一樣。'); ui.say('維加', '木衛二。', 2.4); L('去啦。我喺度聽住。');
  }
  function finTick(dt, t) {
    const c = X.cine; c.t += dt;
    hero.animate(dt, t, 0);
    const mid = _v.addVectors(hero.st.pos, M.lyraP).multiplyScalar(0.5), dirV = _d.subVectors(M.lyraP, hero.st.pos).setY(0).normalize();
    // pick the angle once: room for the camera behind it, and open plain (not the airlock hull) behind them
    if (!c.dir) {
      const ray = (ox, oz, dx, dz, max) => { let b = max; for (const q of colliders) { const fx = q.x - ox, fz = q.z - oz, tt = fx * dx + fz * dz; if (tt < 0) continue; const d2 = fx * fx + fz * fz - tt * tt; if (d2 > q.r * q.r) continue; b = Math.min(b, Math.max(0, tt - Math.sqrt(q.r * q.r - d2))); } return b; };
      let best = -1;
      for (const sg of [1, -1]) for (const th of [0, 0.3, -0.3, 0.6, -0.6]) {
        const bx = dirV.z * sg, bz = -dirV.x * sg, dx = bx * Math.cos(th) - bz * Math.sin(th), dz = bx * Math.sin(th) + bz * Math.cos(th);
        const room = ray(mid.x, mid.z, dx, dz, 3.6), bg = ray(mid.x, mid.z, -dx, -dz, 45);
        const sc = Math.min(bg, 40) * 0.5 + Math.min(room, 3.6) * 9 - Math.abs(th) * 5;      // room for a real two-shot first, open plain behind second
        if (sc > best) { best = sc; c.dir = new THREE.Vector3(dx, 0, dz); c.sg = sg; c.boom = Math.max(1.8, Math.min(3.3, room - 0.3)); }
      }
    }
    const perp = _u.set(dirV.z * c.sg, 0, -dirV.x * c.sg);
    let look;
    if (c.t < 8.5) {                    // the two of them, a slow push in
      cam.position.copy(mid).addScaledVector(c.dir, lerp(c.boom, c.boom * 0.85, smooth(0, 8.5, c.t))).add(_w.set(0, 1.55, 0));
      look = _w.copy(mid).setY(mid.y + 1.35); cam.fov = 44;
    } else if (c.t < 15.5) {            // over his shoulder, on her face
      let back = 1.5; const inside = (b) => colliders.some((q) => Math.hypot(hero.st.pos.x - dirV.x * b + perp.x * 0.78 - q.x, hero.st.pos.z - dirV.z * b + perp.z * 0.78 - q.z) < q.r - 0.2);
      while (back > 0.8 && inside(back)) back -= 0.1;
      cam.position.copy(hero.st.pos).addScaledVector(dirV, -back).addScaledVector(perp, 0.78).add(_w.set(0, 1.82, 0));
      look = _w.copy(M.lyraP).setY(M.lyraP.y + 1.5); cam.fov = 34;
    } else {                            // and up and away: two people, a station, the whole plain
      const k = smooth(15.5, 25, c.t), e = k * k * (3 - 2 * k);
      cam.position.copy(mid).addScaledVector(c.dir, c.boom + 8 * e).add(_w.set(0, 1.55 + 7 * e, 0));
      look = _w.copy(mid).addScaledVector(c.dir, -5 * e).setY(mid.y + 1.35 + 1.0 * e); cam.fov = 44 + 8 * e;   // steep enough to clear the station, the horizon coming in at the top
    }
    cam.lookAt(look); cam.updateProjectionMatrix();
    hero.st.yaw = Math.atan2(dirV.x, dirV.z); hero.root.rotation.y = hero.st.yaw; M.lyraYaw = hero.st.yaw + Math.PI;
    if (c.t > 25 && !c.done) { c.done = true; ctx.onDone && ctx.onDone(); }
  }

  // ---------------- death ----------------
  function respawn() {
    fade(() => {
      hero.st.dead = false; hero.st.hp = hero.st.maxHp; hero.st.lying = 0; hero.st.thrown = false; hero.st.stagger = 0; hero.st.getUp = false; hero.st.knock.set(0, 0, 0);
      combat.reset(true);
      [scout, walker, boss].forEach((e) => { if (e.alive) e.reset(); });
      if (X.rest === 'beacon' && X.beaconP) { setPlace('cave'); hero.place(X.beaconP.clone().add(_v.set(1.2, 0, 0)), Math.PI); }
      else { setPlace('surface'); hero.place(new THREE.Vector3(MASTP.x - 2, 0, MASTP.z + 1.5), -2.4); }
      X.phase = 'walk'; M.camYaw = hero.st.yaw + Math.PI; objective();
    });
  }

  // ---------------- per frame ----------------
  function tick(dtReal, t) {
    if (!X.on) return;
    combat.tick(dtReal); const dt = dtReal * combat.timeScale;
    X.scanCd -= dtReal; X.scanT -= dtReal;
    if (X.fadeT > 0) { X.fadeT -= dtReal; if (X.fadeT <= 0) { const f = X.afterFade; X.afterFade = null; f && f(); setTimeout(() => $('fade').classList.remove('on'), 60); } }
    if (consume('scope')) scan();
    hero.root.visible = true;
    if (X.fadeT > 0) { /* the screen is black: hold everything still */ }
    else if (X.phase === 'hop') hopTick(dt, t);
    else if (X.phase === 'cine') cineTick(dt, t);
    else if (X.phase === 'fin') finTick(dt, t);
    else walkTick(dt, t);
    // Lyra: waits by the airlock
    if (X.where === 'surface') {
      M.lyraP.y = surfFloor(M.lyraP.x, M.lyraP.z);
      if (X.phase !== 'fin') { const dh = hero.st.pos.distanceTo(M.lyraP); if (dh < 8) M.lyraYaw = dampAngle(M.lyraYaw, Math.atan2(hero.st.pos.x - M.lyraP.x, hero.st.pos.z - M.lyraP.z), 3, dt); }
      lyra.root.position.copy(M.lyraP); lyra.root.rotation.set(0, M.lyraYaw, 0); lyra.st.pos.copy(M.lyraP); lyra.animate(dt, t, 0);
    }
    if (X.where === 'cave') cave.update(dt, t, hero, cam);
    // steam out of the skylight
    steam.forEach((s) => { s.t += dt; const k = (s.t % 6) / 6; s.s.position.set(Math.sin(s.t * 1.7) * 2, k * 14, Math.cos(s.t * 1.3) * 2); s.s.scale.setScalar(3 + k * 9); s.s.material.opacity = 0.16 * Math.sin(k * Math.PI) * (1 - X.coldK * 0.8); });
    beaconG.visible && (beaconG.userData.light.intensity = 6 + Math.sin(t * 3) * 2);
    // HUD
    if (X.phase === 'walk') combat.hud(cam); else { combat.C.enemies.forEach((e) => e.bar && e.bar.classList.remove('on')); $('lockR').classList.remove('on'); $('critP').classList.remove('on'); }
    $('bInteract').classList.toggle('hidden', !X.near || X.phase !== 'walk');
    poisHud(); waypoint();
    G.clock += dtReal;
    if (X.phase !== 'hop') { audio.rumble(0.03 + (boss.alive && boss.aware ? 0.12 : 0)); audio.wind(X.where === 'cave' ? 0.03 : 0.12, 240); audio.breath(true, t * (combat.C.sta < 40 ? 2.2 : 1.3)); audio.hum(0.25); }
  }
  function render(W, H, t) {
    cam.aspect = W / H; cam.updateProjectionMatrix();
    if (X.where === 'cave') { post.look({ bloom: 0.6, thr: 0.72, vig: 0.5, grain: 0.05, tint: [1, 0.97, 0.95], lift: [0.004, 0.003, 0.004] }); post.render(cave.scene, cam, W, H, t); }
    else { post.look({ bloom: 0.32, thr: 0.88, vig: 0.3, grain: 0.032, tint: [1.02, 1, 0.97], lift: [0, 0, 0] }); post.render(ms, cam, W, H, t); }
  }
  function stop() {
    X.on = false; document.body.classList.remove('explore', 'flying'); combat.setArmed(false);
    [scout, walker, boss].forEach((e) => e.bar && e.bar.classList.remove('on')); POIS.forEach((p) => p.el.classList.remove('on'));
    $('lockR').classList.remove('on'); $('critP').classList.remove('on'); $('died').classList.remove('on'); $('fade').classList.remove('on');
    if (X.where === 'cave') setPlace('surface');
  }
  return { begin, tick, render, stop, X, combat, cave, get flying() { return X.phase === 'hop'; }, get where() { return X.where; } };
}
