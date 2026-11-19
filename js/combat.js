// Beyond the Horizon · on-foot combat, Souls-like and plain: light, heavy, block, roll, heal, lock-on.
// Everything costs suit energy (stamina); the plasma cutter builds heat that a thin atmosphere sheds slowly.
// Enemies read their own moves (wind-up, strike, recovery) and call ctx.strike() on the frame it lands.
import * as THREE from 'three';
import { input, consume } from './input.js';
import { clamp, damp, dampAngle, smooth, lerp } from './util.js';

const STA_MAX = 100, STA_REGEN = 30, STA_DELAY = 0.65;
const MOVES = {
  l1: { dur: 0.56, hit: [0.17, 0.31], dmg: 11, poise: 12, reach: 2.5, arc: 1.25, sta: 14, heat: 9, lunge: 2.6, combo: 0.3 },
  l2: { dur: 0.56, hit: [0.17, 0.31], dmg: 12, poise: 12, reach: 2.5, arc: 1.25, sta: 14, heat: 9, lunge: 2.6, combo: 0.3 },
  l3: { dur: 0.74, hit: [0.25, 0.4], dmg: 16, poise: 20, reach: 2.7, arc: 1.0, sta: 16, heat: 12, lunge: 3.6, combo: 0 },
  hv: { dur: 1.0, hit: [0.5, 0.64], dmg: 30, poise: 48, reach: 2.9, arc: 0.9, sta: 30, heat: 22, lunge: 3.0, combo: 0 },
  cr: { dur: 1.25, hit: [0.42, 0.5], dmg: 0, poise: 0, reach: 3.2, arc: 1.6, sta: 0, heat: 10, lunge: 1.5, combo: 0 },   // the killing thrust into a staggered enemy
};

export function createCombat(ctx) {
  const { hero, ui, audio, G } = ctx;
  const $ = (id) => document.getElementById(id);
  const C = {
    armed: false, sta: STA_MAX, staT: 0, heat: 0, over: 0, heals: 3, healT: 0,
    move: null, mt: 0, hitDone: false, chain: 0, queued: false,
    block: false, blockT: 0, lock: null, slow: 0, stop: 0, perfect: 0, crit: null,
    enemies: [], dead: false, deadT: 0, shake: 0,
  };
  const rig = hero.rig;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), proj = new THREE.Vector3();

  // ---------------- HUD: bars over heads, lock mark ----------------
  const layer = $('ebars');
  function barFor(e) {
    const el = document.createElement('div'); el.className = 'eb' + (e.boss ? ' boss' : '');
    el.innerHTML = `<div class="n">${e.name}</div><div class="bar"><i class="lag"></i><i class="hp"></i></div><div class="st">失衡</div>`;
    layer.appendChild(el); e.bar = el; e.barLag = 1;
  }

  function add(e) { C.enemies.push(e); barFor(e); e.ctx = api; }
  function clear() { C.enemies.forEach((e) => { e.bar && e.bar.remove(); e.dispose && e.dispose(); }); C.enemies.length = 0; C.lock = null; }

  // ---------------- words through Lyra's chip ----------------
  function say(e, key, dur) {
    const lines = e.lines && e.lines[key]; if (!lines || e.said[key]) return; e.said[key] = 1;
    lines.forEach((l, i) => ui.say(e.name, l, dur || Math.max(2.6, l.length * 0.16 + 1), '晶片翻譯'));
  }

  // ---------------- enemy → hero ----------------
  // o: { from: Vector3, dir: yaw the blow travels along (optional), dmg, reach, arc, knock, unblockable, ring }
  function strike(e, o) {
    if (C.dead || hero.st.dead) return false;
    const hp = hero.st.pos;
    const dx = hp.x - o.from.x, dz = hp.z - o.from.z, d = Math.hypot(dx, dz);
    if (d > o.reach + hero.st.radius) return false;
    if (o.arc < Math.PI) { const a = Math.atan2(dx, dz); let da = Math.abs(((a - e.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI); if (da > o.arc) return false; }
    if (Math.abs(hp.y - o.from.y) > 2.6) return false;
    // inside a roll: no hit. Early in the roll: a perfect dodge
    if (hero.st.dodge.t > 0 && hero.st.inv > 0) {
      if (hero.st.dodge.t > 0.45 - 0.2 && !C.perfect) { C.perfect = 0.9; C.slow = 0.45; ui.hint('完美閃避', 1.2); audio.tone(1320, 0.08, 0.04); }
      return false;
    }
    // blocking, facing it
    if (C.block && !o.unblockable && C.sta > 0) {
      const face = Math.atan2(-dx, -dz); let da = Math.abs(((face - hero.st.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
      if (da < 1.2) {
        if (C.blockT < 0.2) { e.posture(e.maxPoise, true); C.slow = 0.35; ui.hint('完美格擋', 1.2); audio.tone(980, 0.1, 0.06); spark(_v.copy(hp).add(_w.set(0, 1.2, 0)), 1.6); return false; }
        spend(o.dmg * 1.6); hero.st.knock.set(dx, 0, dz).normalize().multiplyScalar(2.5);
        audio.burst(900, 0.12, 0.15); spark(_v.copy(hp).add(_w.set(0, 1.2, 0)).addScaledVector(_w.set(-dx / d, 0, -dz / d), 0.4), 0.8);
        if (C.sta <= 0) { C.block = false; hero.st.stagger = 0.8; ui.hint('體力用盡', 1); }
        else { hero.st.hp = Math.max(1, hero.st.hp - Math.round(o.dmg * 0.15)); return true; }
      }
    }
    const hit = hero.damage(o.dmg, o.from, o.knock || 4);
    if (hit) { C.shake = Math.max(C.shake, 0.5); C.move = null; ctx.flash && ctx.flash(false); if (hero.st.dead) die(); }
    return hit;
  }

  // ---------------- hero → enemy ----------------
  function spend(n) { C.sta = Math.max(0, C.sta - n); C.staT = STA_DELAY; }
  function start(kind) {
    const m = MOVES[kind]; if (C.sta <= 0 && kind !== 'cr') return false;
    if (C.over > 0) { ui.hint('切割器過熱', 0.9); return false; }
    C.move = kind; C.mt = 0; C.hitDone = false; C.queued = false; spend(m.sta);
    if (C.lock && C.lock.alive) hero.st.yaw = Math.atan2(C.lock.pos.x - hero.st.pos.x, C.lock.pos.z - hero.st.pos.z);
    audio.burst(kind === 'hv' ? 380 : 700, kind === 'hv' ? 0.35 : 0.2, 0.08);
    return true;
  }
  function tryHit(m) {
    const hp = hero.st.pos; let any = false;
    for (const e of C.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - hp.x, dz = e.pos.z - hp.z, d = Math.hypot(dx, dz) - e.radius;
      if (d > m.reach) continue;
      let da = Math.abs(((Math.atan2(dx, dz) - hero.st.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
      if (da > m.arc && d > 0.6) continue;
      if (Math.abs(e.pos.y - hp.y) > e.height) continue;
      let dmg = m.dmg * (C.perfect > 0 ? 1.5 : 1) * (C.heat > 70 ? 1.15 : 1);
      if (C.move === 'cr') dmg = Math.round(e.maxHp * (e.boss ? 0.16 : 0.42)) + 20;
      const weak = e.weakHit ? e.weakHit(hp) : false;
      if (weak) dmg *= 1.35;
      e.hurt(Math.round(dmg), m.poise * (weak ? 1.6 : 1), hp);
      spark(_v.set(e.pos.x - dx / (d + e.radius) * e.radius, e.pos.y + e.height * 0.55, e.pos.z - dz / (d + e.radius) * e.radius), C.move === 'hv' || C.move === 'cr' ? 1.6 : 1);
      any = true;
      if (!e.alive && C.lock === e) C.lock = null;
    }
    if (any) { C.stop = C.move === 'hv' || C.move === 'cr' ? 0.1 : 0.06; C.shake = Math.max(C.shake, C.move === 'hv' ? 0.4 : 0.2); audio.hit(); audio.burst(240, 0.2, 0.18, 'lowpass'); }
    C.perfect = 0;
  }

  // sparks: a few additive points that fly and fade
  const SP = 64, spPos = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3), spLife = new Float32Array(SP);
  const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  const spMat = new THREE.PointsMaterial({ color: 0xffc890, size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.Points(spGeo, spMat); sparks.frustumCulled = false;
  let spI = 0;
  function spark(p, k = 1) {
    for (let i = 0; i < Math.round(10 * k); i++) {
      const j = spI++ % SP; spLife[j] = 0.25 + Math.random() * 0.35;
      spPos[j * 3] = p.x; spPos[j * 3 + 1] = p.y; spPos[j * 3 + 2] = p.z;
      spVel[j * 3] = (Math.random() - 0.5) * 7 * k; spVel[j * 3 + 1] = Math.random() * 5 * k; spVel[j * 3 + 2] = (Math.random() - 0.5) * 7 * k;
    }
  }
  function sparksTick(dt, g) {
    for (let j = 0; j < SP; j++) {
      if (spLife[j] <= 0) { spPos[j * 3 + 1] = -9999; continue; }
      spLife[j] -= dt; spVel[j * 3 + 1] -= g * dt;
      spPos[j * 3] += spVel[j * 3] * dt; spPos[j * 3 + 1] += spVel[j * 3 + 1] * dt; spPos[j * 3 + 2] += spVel[j * 3 + 2] * dt;
    }
    spGeo.attributes.position.needsUpdate = true;
  }

  // ---------------- lock-on ----------------
  function pickLock(cam) {
    let best = null, bs = Infinity;
    for (const e of C.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(hero.st.pos); if (d > 28) continue;
      proj.copy(e.pos).setY(e.pos.y + e.height * 0.5).project(cam); if (proj.z > 1 || Math.abs(proj.x) > 1.1) continue;
      const s = d + Math.abs(proj.x) * 12; if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  // ---------------- death ----------------
  function die() {
    if (C.dead) return; C.dead = true; C.deadT = 0; C.move = null; C.block = false; C.lock = null;
    $('died').classList.add('on'); audio.boom();
  }

  // ---------------- per frame ----------------
  // call before hero.update (input gating) and after (facing, poses). Returns a time scale for hit-stop / slow-mo.
  function pre(dt) {
    if (!C.armed || C.dead) return;
    // roll costs energy; with none left, no roll
    if (input.edges.has('dodge')) { if (C.sta < 8 || hero.st.dodge.cd > 0 || C.healT > 0) consume('dodge'); else if (C.move) { const m = MOVES[C.move]; if (C.mt > m.hit[1]) C.move = null; else consume('dodge'); } }
    C.wasDodge = hero.st.dodge.t;
    hero.st.frozen = !!C.move || C.healT > 0;
  }
  function post(dt, t, cam) {
    const st = hero.st;
    if (C.dead) {
      C.deadT += dt; st.frozen = true;
      if (C.deadT > 3.2 && !C.respawning) { C.respawning = true; ctx.onDeath && ctx.onDeath(); }
      return;
    }
    if (!C.armed) { hero.setCutter(false); rig.pose = null; return; }
    if (st.dead) { die(); return; }                       // a fall can kill too
    if (st.dodge.t > 0 && !(C.wasDodge > 0)) spend(18);
    // stamina, heat
    C.staT -= dt; if (C.staT <= 0 && !C.move) C.sta = Math.min(STA_MAX, C.sta + STA_REGEN * (C.block ? 0.35 : 1) * dt);
    C.heat = Math.max(0, C.heat - (ctx.coolRate || 10) * dt);
    if (C.over > 0) { C.over -= dt; if (C.over <= 0) ui.hint('切割器冷卻咗', 0.8); }
    C.perfect = Math.max(0, C.perfect - dt);

    // lock-on toggle
    if (consume('lock')) { C.lock = C.lock ? null : pickLock(cam); if (!C.lock) ui.hint('附近冇目標', 0.8); }
    if (C.lock && (!C.lock.alive || C.lock.pos.distanceTo(st.pos) > 34)) C.lock = null;

    // heal: an injector, slow, can't be cancelled
    if (consume('heal') && !C.move && C.healT <= 0 && st.onGround && st.dodge.t <= 0) {
      if (C.heals > 0 && st.hp < st.maxHp) { C.heals--; C.healT = 1.3; audio.tone(520, 0.2, 0.04); } else ui.hint(C.heals ? '生命已經滿' : '冇治療針', 0.9);
    }
    if (C.healT > 0) { const before = C.healT; C.healT -= dt; if (before > 0.45 && C.healT <= 0.45) st.hp = Math.min(st.maxHp, st.hp + 45); }

    // block (hold)
    const wantBlock = input.held.has('block') && !C.move && C.healT <= 0 && st.dodge.t <= 0 && C.sta > 0;
    if (wantBlock && !C.block) C.blockT = 0;
    C.block = wantBlock; if (C.block) C.blockT += dt;

    // attacks; a press during the end of a swing queues the next
    const critTarget = C.enemies.find((e) => e.alive && e.staggered && e.pos.distanceTo(st.pos) < e.radius + 2.6);
    C.crit = critTarget || null;
    if (consume('attack')) {
      if (!C.move && st.dodge.t <= 0 && C.healT <= 0 && st.onGround) {
        if (critTarget) { C.lock = critTarget; start('cr'); critTarget.critHold = 1.3; }
        else if (start('l1')) C.chain = 1;
      } else if (C.move && C.move[0] === 'l' && MOVES[C.move].combo && C.mt > MOVES[C.move].dur - 0.32) C.queued = true;
    }
    if (consume('heavy') && !C.move && st.dodge.t <= 0 && C.healT <= 0 && st.onGround) start('hv');
    if (C.move) {
      const m = MOVES[C.move]; C.mt += dt;
      // a small step into the blow
      if (C.mt < m.hit[1]) { const k = m.lunge * (1 - C.mt / m.hit[1]); st.pos.x += Math.sin(st.yaw) * k * dt; st.pos.z += Math.cos(st.yaw) * k * dt; }
      if (C.lock && C.mt < m.hit[0]) st.yaw = dampAngle(st.yaw, Math.atan2(C.lock.pos.x - st.pos.x, C.lock.pos.z - st.pos.z), 14, dt);
      if (!C.hitDone && C.mt >= m.hit[0]) {
        C.hitDone = true;
        if (C.move === 'cr' && C.crit) { const e = C.crit; tryHit(m); e.critHold = 0; }
        else tryHit(m);
        C.heat += m.heat; if (C.heat >= 100) { C.heat = 100; C.over = 2.2; ui.hint('切割器過熱', 1.2); }
      }
      if (C.mt >= m.dur || (C.queued && C.mt >= m.dur - 0.12)) {
        const next = C.queued && C.chain < 3 ? (C.chain === 1 ? 'l2' : 'l3') : null;
        C.move = null;
        if (next && start(next)) C.chain++;
      }
    }
    // facing: locked on, he squares up to it unless rolling
    if (C.lock && !C.move && st.dodge.t <= 0) { st.yaw = dampAngle(st.yaw, Math.atan2(C.lock.pos.x - st.pos.x, C.lock.pos.z - st.pos.z), 10, dt); hero.root.rotation.y = st.yaw; }
    hero.root.position.copy(st.pos); hero.root.rotation.y = st.yaw;

    // the cutter lights with the fight
    const near = C.enemies.some((e) => e.alive && e.aware && e.pos.distanceTo(st.pos) < 18);
    C.lit = damp(C.lit || 0, C.move || C.block || near ? 1 : 0.0, 6, dt);
    hero.setCutter(true, C.lit * (C.over > 0 ? 0.25 : 1), C.heat / 100);

    // enemies
    for (const e of C.enemies) e.update(dt, t, api);
    sparksTick(dt, ctx.g || 3.71);
    C.shake = Math.max(0, C.shake - dt * 2.2);
  }

  // pose: arms and torso for each move (on top of the walk cycle)
  rig.pose = null;
  function pose(dt, t) {
    const { armL, armR, hips, body } = rig, st = hero.st;
    if (!C.armed || st.dead) return;
    const lerpR = (o, x, y, z) => { o.rotation.x = x; o.rotation.y = y; o.rotation.z = z; };
    let twist = 0;
    if (C.move) {
      const m = MOVES[C.move], k = C.mt / m.dur, h0 = m.hit[0] / m.dur, h1 = m.hit[1] / m.dur;
      const wind = smooth(0, h0, k), cut = smooth(h0 - 0.05, h1, k), back = smooth(h1, 1, k);
      if (C.move === 'l1' || C.move === 'l3') {      // right to left, across
        lerpR(armR.sh, lerp(lerp(-0.6, -1.9, wind), -1.25, cut) * (1 - back * 0.5) + -0.6 * back * 0.5, 0, lerp(lerp(-0.1, -1.1, wind), 0.9, cut) * (1 - back) - 0.1 * back);
        armR.el.rotation.x = lerp(-1.3, -0.25, cut);
        twist = lerp(lerp(0, -0.55, wind), 0.6, cut) * (1 - back);
      } else if (C.move === 'l2') {                  // back the other way, rising
        lerpR(armR.sh, lerp(lerp(-0.6, -0.9, wind), -2.1, cut) * (1 - back * 0.6) + -0.6 * back * 0.6, 0, lerp(lerp(-0.1, 0.9, wind), -1.0, cut) * (1 - back) - 0.1 * back);
        armR.el.rotation.x = lerp(-1.4, -0.3, cut);
        twist = lerp(lerp(0, 0.5, wind), -0.55, cut) * (1 - back);
      } else if (C.move === 'hv') {                  // two hands, over the head and down
        const up = lerp(-0.6, -2.9, wind), down = lerp(up, -0.55, cut);
        lerpR(armR.sh, lerp(down, -0.6, back), 0, -0.35); lerpR(armL.sh, lerp(down, -0.6, back), 0, 0.35);
        armR.el.rotation.x = armL.el.rotation.x = lerp(-0.9, -0.2, cut);
        body.rotation.x += lerp(-0.25 * wind, 0.35, cut) * (1 - back);
      } else if (C.move === 'cr') {                  // the thrust
        const draw = smooth(0, h0 * 0.8, k), drive = smooth(h0 * 0.8, h0, k);
        lerpR(armR.sh, lerp(lerp(-0.6, -1.0, draw), -1.55, drive) * (1 - back) - 0.6 * back, 0, -0.1);
        armR.el.rotation.x = lerp(lerp(-0.3, -1.9, draw), -0.05, drive);
        body.rotation.x += 0.3 * drive * (1 - back);
      }
    } else if (C.healT > 0) {
      const k = Math.sin(clamp((1.3 - C.healT) / 1.3, 0, 1) * Math.PI);
      lerpR(armL.sh, -1.6 * k, 0, -0.5 * k); armL.el.rotation.x = -1.9 * k;
    } else if (C.block) {
      lerpR(armR.sh, -1.25, 0, 0.75); armR.el.rotation.x = -1.7; lerpR(armL.sh, -1.1, 0, -0.4); armL.el.rotation.x = -1.4;
    } else {
      // ready: blade low and forward
      armR.sh.rotation.x = damp(armR.sh.rotation.x, -0.45 + armR.sh.rotation.x * 0.3, 8, dt); armR.el.rotation.x = Math.min(armR.el.rotation.x, -0.55);
    }
    hips.rotation.y = damp(hips.rotation.y, twist, 18, dt);
  }

  function hud(cam) {
    $('cSta').style.transform = `scaleX(${C.sta / STA_MAX})`;
    $('cHeat').style.transform = `scaleX(${C.heat / 100})`; $('cHeatRow').classList.toggle('hot', C.over > 0);
    $('cHp').style.transform = `scaleX(${hero.st.hp / hero.st.maxHp})`;
    $('cHeals').textContent = `治療針 ×${C.heals}`;
    const W = innerWidth, H = innerHeight;
    for (const e of C.enemies) {
      const el = e.bar; if (!el) continue;
      const show = e.alive && (e.aware || C.lock === e) && e.pos.distanceTo(hero.st.pos) < 36;
      proj.copy(e.pos).setY(e.pos.y + e.height + 0.35).project(cam);
      const vis = show && proj.z < 1 && Math.abs(proj.x) < 1.2 && Math.abs(proj.y) < 1.2;
      el.classList.toggle('on', vis);
      if (!vis) continue;
      el.style.transform = `translate(${(proj.x + 1) / 2 * W}px, ${(1 - proj.y) / 2 * H}px)`;
      const k = e.hp / e.maxHp; e.barLag = Math.max(k, e.barLag - 0.35 * (1 / 60));
      el.querySelector('.hp').style.transform = `scaleX(${k})`; el.querySelector('.lag').style.transform = `scaleX(${e.barLag})`;
      el.classList.toggle('stag', !!e.staggered); el.classList.toggle('lock', C.lock === e);
    }
    const lk = $('lockR');
    if (C.lock && C.lock.alive) {
      proj.copy(C.lock.pos).setY(C.lock.pos.y + C.lock.height * 0.55).project(cam);
      lk.classList.toggle('on', proj.z < 1); lk.style.transform = `translate(${(proj.x + 1) / 2 * W}px, ${(1 - proj.y) / 2 * H}px)`;
    } else lk.classList.remove('on');
    $('critP').classList.toggle('on', !!C.crit && !C.move);
  }

  // where a locked-on camera should look from: behind the hero, the target beyond
  function camYawFor() { if (!C.lock) return null; const st = hero.st; return Math.atan2(st.pos.x - C.lock.pos.x, st.pos.z - C.lock.pos.z); }

  function reset(full = true) {
    C.sta = STA_MAX; C.heat = 0; C.over = 0; C.move = null; C.block = false; C.lock = null; C.healT = 0; C.dead = false; C.deadT = 0; C.respawning = false; C.crit = null;
    if (full) C.heals = 3;
    $('died').classList.remove('on'); hero.st.frozen = false;
  }
  function setArmed(on) { C.armed = on; rig.pose = on ? pose : null; hero.setCutter(on, 0, 0); $('chud').classList.toggle('hidden', !on); if (!on) { C.lock = null; C.block = false; } }

  const api = { C, add, clear, say, strike, pre, post, hud, camYawFor, reset, setArmed, sparks, spark, die,
    get timeScale() { return C.stop > 0 ? 0.05 : C.slow > 0 ? 0.35 : 1; },
    tick(dtReal) { C.stop = Math.max(0, C.stop - dtReal); C.slow = Math.max(0, C.slow - dtReal); },
    get shake() { return C.shake; }, hero };
  return api;
}
