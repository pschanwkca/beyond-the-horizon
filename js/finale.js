// Beyond the Horizon · finale: Earth inside the Wanderer's tidal-disruption radius, then open space.
// The planet stretches along the line to the black hole, the crust fails, and the debris spreads in a
// stream: the near half falls toward the hole and feeds its glow, the far half is flung away.
// The break-up is shown with time sped up ×60 (the real thing takes tens of minutes); afterwards the
// clock runs at ×1 again and the hero is free to fly among what is left. Units: 1 = 1000 km.
import * as THREE from 'three';
import { smooth, lerp, clamp } from './util.js';
import { createDoomSky, BH_DIR } from './doomsky.js';
import { createPlayer } from './player.js';
import { earthMaterial, atmosphereMaterial, siteQuaternion, SUN_LOCAL } from './earth.js';
import { VIS } from './flight.js';
import { rockGeo, rockCracks } from './rock.js';

const RE = 6.371;
export const FIN_LEN = 31;            // seconds of cutscene
const BREAK = 14;                     // the crust lets go
const RATE_CINE = 1, RATE_FREE = 1 / 60;

export function createFinale(renderer) {
  const far = new THREE.Scene(), near = new THREE.Scene();
  const camFar = new THREE.PerspectiveCamera(50, 1, 0.01, 5000);
  const camNear = new THREE.PerspectiveCamera(50, 1, 0.1, 9000);
  const A = BH_DIR.clone();                         // Earth -> black hole

  const sky = createDoomSky(3000); far.add(sky);
  const su = sky.material.uniforms;
  su.uAir.value = 0; su.uProg.value = 1; su.uSpace.value = 1; su.uDip.value = 0; su.uSun.value.copy(SUN_LOCAL);

  // the real Earth (day map, night lights, clouds), fault lines opening where the tide pulls hardest
  const eMat = earthMaterial({ cracks: true }); eMat.uniforms.uA.value.copy(A); eMat.uniforms.uSun.value.copy(SUN_LOCAL);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 256, 128), eMat); earth.quaternion.copy(siteQuaternion()); far.add(earth);
  const aMat = atmosphereMaterial(); aMat.uniforms.uSun.value.copy(SUN_LOCAL);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(RE + 0.09, 128, 64), aMat); atm.matrixAutoUpdate = false; far.add(atm);
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uK: { value: 0 }, uCam: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vW; uniform vec3 uCam; uniform float uK; void main(){ vec3 V = normalize(uCam - vW); float f = pow(1.0 - abs(dot(-vN, V)), 3.0); gl_FragColor = vec4(vec3(1.0, 0.4, 0.1) * f * uK, f); }',
  });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.08, 64, 32), glowMat); glow.matrixAutoUpdate = false; far.add(glow);
  // the same tidal stretch as the surface, for the shells around it
  const stretchM = (s, scale, out) => {
    const k = 1 - 0.25 * s, a = 1.25 * s;
    out.set(k + a * A.x * A.x, a * A.x * A.y, a * A.x * A.z, 0, a * A.y * A.x, k + a * A.y * A.y, a * A.y * A.z, 0, a * A.z * A.x, a * A.z * A.y, k + a * A.z * A.z, 0, 0, 0, 0, 1);
    return out.multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
  };

  // fragments + dust, hidden until the crust lets go
  // broken crust: jagged slabs of rock, sunlit on one face, the mantle still glowing through their fractures
  const N = 240, rockM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, emissive: 0xff5a14, emissiveMap: rockCracks(), emissiveIntensity: 1.9, flatShading: true });
  const frag = new THREE.InstancedMesh(rockGeo(907, { detail: 2, sharp: 1, flat: 0.15 }), rockM, N); frag.visible = false; far.add(frag);
  const cc = new THREE.Color();
  for (let i = 0; i < N; i++) { const v = 0.13 + Math.random() * 0.13; frag.setColorAt(i, cc.setRGB(v * 1.04, v * 0.97, v * 0.9)); }   // dark basalt and granite: lit faces stay rock-coloured, not chalk
  const fr = [];
  const rnd = () => Math.random();
  for (let i = 0; i < N; i++) {
    const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(Math.cbrt(rnd()) * RE);
    fr.push({ p0: d.clone(), p: d.clone(), v: new THREE.Vector3(), s: 0.1 + Math.pow(rnd(), 2.4) * 1.3, sh: new THREE.Vector3(0.7 + rnd() * 0.8, 0.35 + rnd() * 0.4, 0.6 + rnd() * 0.7), rot: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6), spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), along: d.dot(A) });
  }
  const P = 7000, pg = new THREE.BufferGeometry(), pp = new Float32Array(P * 3), pc = new Float32Array(P * 3), pv = [], p0 = [];
  for (let i = 0; i < P; i++) {
    const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(Math.cbrt(rnd()) * RE * 1.02);
    p0.push(d); pv.push(new THREE.Vector3()); pp.set([d.x, d.y, d.z], i * 3);
    const hot = rnd() < 0.55; pc.set(hot ? [1, 0.45 + rnd() * 0.3, 0.12] : [0.5, 0.42, 0.38], i * 3);
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  // points sized in screen pixels (clamped), so dust near the camera never balloons
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0.9 }, uScale: { value: 400 } },
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying float vF; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; gl_PointSize = clamp(0.09 * uScale / max(d, 1e-3), 1.0, 4.5); vF = smoothstep(0.02, 0.2, d); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vF; uniform float uA; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.2, length(q)) * uA * vF; gl_FragColor = vec4(vC * a, a); }',
  });
  const dust = new THREE.Points(pg, dustMat); dust.visible = false; dust.frustumCulled = false; far.add(dust);
  const sun = new THREE.DirectionalLight(0xfff2e4, 2.2); sun.position.copy(SUN_LOCAL).multiplyScalar(100); far.add(sun);
  far.add(new THREE.AmbientLight(0x402018, 0.5));

  // ---------- near layer: the hero, and in open space the rubble drifting around him ----------
  const hero = createPlayer(near, { noShadow: true }); hero.setSuit(true); hero.setRocket(true); hero.heal(); hero.st.mode = 'fly';
  const nHemi = new THREE.HemisphereLight(0xffb080, 0x301008, 1.1); near.add(nHemi);
  const rim = new THREE.DirectionalLight(0xffa060, 2); rim.position.set(0, -5, 3); near.add(rim);
  const nSun = new THREE.DirectionalLight(0xfff4ea, 0); nSun.position.copy(SUN_LOCAL).multiplyScalar(50); near.add(nSun, nSun.target);
  const nBH = new THREE.DirectionalLight(0xffd9b8, 0); nBH.position.copy(A).multiplyScalar(50); near.add(nBH, nBH.target);   // the hole's accretion glare
  const BOX = 520, RN = 80;
  const rubGeo = rockGeo(311, { detail: 2, sharp: 0.9, flat: 0.2 });
  const rubMat = new THREE.MeshStandardMaterial({ color: 0x6e655c, roughness: 0.95, flatShading: true, emissive: 0xff5010, emissiveMap: rockCracks(), emissiveIntensity: 0.45 });
  const rub = new THREE.InstancedMesh(rubGeo, rubMat, RN); rub.visible = false; rub.frustumCulled = false; near.add(rub);
  const rb = Array.from({ length: RN }, () => ({ p: new THREE.Vector3((rnd() - 0.5) * BOX, (rnd() - 0.5) * BOX, (rnd() - 0.5) * BOX), v: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(3), s: 0.2 + Math.pow(rnd(), 3) * 7, r: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6), w: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), hit: false, near: false }));
  const UPV = new THREE.Vector3(0, 1, 0), sh = new THREE.Vector3();
  const CHEST = new THREE.Vector3(0, 1, 0), fwdV = new THREE.Vector3(), bu = new THREE.Vector3(), bw = new THREE.Vector3(), rel = new THREE.Vector3(), rvi = new THREE.Vector3();
  // a piece that has drifted out behind comes back in ahead: flying fast you weave through a stream of it,
  // and now and then one is dead in your path
  let aimT = 4;
  function respawnAhead(r) {
    bu.set(0, 1, 0).cross(fwdV); if (bu.lengthSq() < 1e-4) bu.set(1, 0, 0); bu.normalize(); bw.crossVectors(fwdV, bu);
    const aimed = r.s > 1.2 && aimT <= 0;               // one in your path every few seconds, never a wall of them
    if (aimed) aimT = 3.5 + rnd() * 3.5;
    const a = rnd() * Math.PI * 2, rad = aimed ? rnd() * (r.s * 0.6 + 0.8) : r.s + 7 + Math.pow(rnd(), 0.8) * 170;
    r.p.copy(fwdV).multiplyScalar(BOX * 0.48 * (0.8 + 0.2 * rnd())).addScaledVector(bu, Math.cos(a) * rad).addScaledVector(bw, Math.sin(a) * rad).add(CHEST);
    r.v.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(aimed ? 0.5 : 3); r.hit = r.near = false;
  }
  const DN = 500, dp = new Float32Array(DN * 3), ds = [];
  for (let i = 0; i < DN; i++) ds.push(new THREE.Vector3((rnd() - 0.5) * 120, (rnd() - 0.5) * 120, (rnd() - 0.5) * 120));
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xd8c0a8, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false })); motes.visible = false; motes.frustumCulled = false; near.add(motes);

  let T = 0, broke = false, hk = 150, freeOn = false;
  const freePos = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), sm = new THREE.Matrix4();
  const tmp = new THREE.Vector3(), rv = new THREE.Vector3();
  const side = new THREE.Vector3().crossVectors(A, new THREE.Vector3(0, 1, 0)).normalize();
  const horiz = new THREE.Vector3(A.x, 0, A.z).normalize();
  const up2 = new THREE.Vector3(0, 1, 0).addScaledVector(A, -A.y).normalize();   // 'up' at right angles to the line to the hole

  function begin(altKm) {
    T = 0; broke = false; freeOn = false; hk = Math.max(100, altKm);
    earth.visible = atm.visible = glow.visible = true; frag.visible = false; dust.visible = false; rub.visible = motes.visible = false;
    eMat.uniforms.uStretch.value = 0; eMat.uniforms.uCrack.value = 0; nSun.intensity = 0; nHemi.intensity = 1.1; rim.intensity = 2;
    nHemi.color.set(0xffb080); nHemi.groundColor.set(0x301008); nBH.intensity = 0;
    for (let i = 0; i < P; i++) pp.set([p0[i].x, p0[i].y, p0[i].z], i * 3);
    pg.attributes.position.needsUpdate = true;
  }

  // advance the break-up by sim-seconds `dt` (cutscene time)
  function simulate(dt) {
    T += dt;
    const stretch = 0.32 * smooth(7, BREAK, T), crack = smooth(5, BREAK - 0.5, T);
    eMat.uniforms.uStretch.value = stretch; eMat.uniforms.uCrack.value = crack;
    glowMat.uniforms.uK.value = crack * crack * 0.9;
    atm.matrix.copy(stretchM(stretch, 1, sm)); glow.matrix.copy(stretchM(stretch, 1, sm));
    aMat.uniforms.uK.value = 1 - crack * 0.8;
    if (!broke && T > BREAK) {
      broke = true; earth.visible = atm.visible = glow.visible = false; frag.visible = true; dust.visible = true;
      for (const f of fr) { // positions on the stretched body; tidal velocity grows with distance along the axis
        const a = f.p0.dot(A); f.p.copy(f.p0).addScaledVector(A, a * stretch).addScaledVector(tmp.copy(f.p0).addScaledVector(A, -a), -stretch * 0.25);
        f.v.copy(A).multiplyScalar(a * 0.55).addScaledVector(tmp.copy(f.p0).addScaledVector(A, -a), -0.05).add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.2));
      }
      for (let i = 0; i < P; i++) {
        const d = p0[i], a = d.dot(A);
        tmp.copy(d).addScaledVector(A, a * stretch); pp.set([tmp.x, tmp.y, tmp.z], i * 3);
        pv[i].copy(A).multiplyScalar(a * (0.5 + rnd() * 0.25)).add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.35));
      }
    }
    if (broke) {
      const k = Math.min(1, (T - BREAK) / 2);
      su.uFlash.value = Math.max(0, 0.6 - (T - BREAK) * 0.5);
      for (let i = 0; i < N; i++) {
        const f = fr[i];
        if (f.along > 0) f.v.addScaledVector(A, 1.1 * dt);              // the near side keeps falling toward the hole
        f.p.addScaledVector(f.v, dt);
        f.rot.x += f.spin.x * dt; f.rot.y += f.spin.y * dt;
        q.setFromEuler(f.rot); sc.copy(f.sh).multiplyScalar(f.s * (0.6 + 0.4 * k)); m4.compose(f.p, q, sc); frag.setMatrixAt(i, m4);
      }
      frag.instanceMatrix.needsUpdate = true;
      rockM.emissiveIntensity = Math.max(0.5, 1.6 - (T - BREAK) * 0.06);
      for (let i = 0; i < P; i++) {
        const v = pv[i]; if (p0[i].dot(A) > 0) v.addScaledVector(A, 1.1 * dt);
        pp[i * 3] += v.x * dt; pp[i * 3 + 1] += v.y * dt; pp[i * 3 + 2] += v.z * dt;
      }
      pg.attributes.position.needsUpdate = true;
      dustMat.uniforms.uA.value = Math.max(0.35, 0.95 - (T - BREAK) * 0.03);
    }
  }

  function update(dt, t) {
    su.uT.value = t; eMat.uniforms.uT.value = t;
    simulate(dt * RATE_CINE);
    // camera: over the shoulder from orbit, then a long pull-back to the wide shot
    const pull = smooth(3.5, 10.5, T);
    const hero0 = new THREE.Vector3(0, RE + hk / 1000, 0);
    // wide shot from beside and behind Earth, looking along the line to the hole: the stream pours toward the ring
    // wide shot from the side, so the sunlit half shows (oceans, clouds, continents) with the night half burning;
    // the camera aims between the planet and the hole so both are in frame
    // framed in the Earth-hole plane: the line from the planet to the hole runs across the screen
    const wide = A.clone().multiplyScalar(-16 - T * 0.2).addScaledVector(side, -(24 + 2 * Math.sin(T * 0.05))).addScaledVector(up2, 6);   // on the sun's side: a three-quarter-lit Earth, oceans and cloud, the night limb burning
    const shot1Look = hero0.clone().addScaledVector(horiz, 1).add(new THREE.Vector3(0, Math.tan(Math.asin(A.y) - 0.05), 0));   // the cracking limb along the bottom, the hole high above it
    const camPos = hero0.clone().addScaledVector(horiz, -0.004).add(new THREE.Vector3(0, 0.0015, 0)).lerp(wide, pull);
    camFar.position.copy(camPos);
    const wideLook = tmp.copy(camPos).negate().normalize().add(A).normalize().multiplyScalar(30).add(camPos);
    camFar.up.set(0, 1, 0).lerp(up2, pull).normalize();
    camFar.lookAt(new THREE.Vector3().lerpVectors(shot1Look, wideLook, pull));
    camFar.fov = camNear.fov = lerp(82, 62, pull);
    glowMat.uniforms.uCam.value.copy(camFar.position); aMat.uniforms.uCam.value.copy(camFar.position);
    // near layer: the hero, only in the first shot
    hero.root.visible = pull < 0.15;
    if (hero.root.visible) {
      hero.st.thrust = 0.15; hero.animate(dt, t, 0);
      camNear.quaternion.copy(camFar.quaternion);
      camNear.position.set(1.3, 1.5, 5.6).applyQuaternion(camFar.quaternion);
      hero.root.position.set(0, -0.2, 0);
      hero.root.quaternion.copy(camFar.quaternion);
      hero.root.rotateY(Math.PI); hero.root.rotateX(0.25);   // facing away from us, looking down at Earth
    }
    return T;
  }

  // ---------- open space ----------
  function startFree(pos) {
    freeOn = true; freePos.copy(pos || new THREE.Vector3(0, RE + hk / 1000, 0).addScaledVector(side, 0.6));
    hero.root.visible = true; hero.root.position.set(0, 0, 0); hero.root.quaternion.identity();
    rub.visible = motes.visible = true; nSun.intensity = 3.2; nHemi.intensity = 0.45; rim.intensity = 0.7;
    nHemi.color.set(0x9aa7bc); nHemi.groundColor.set(0x3a1a0e); nBH.intensity = 0.7;   // starlight above, the glow of the debris below
    su.uFlash.value = 0;
  }
  // jump straight to open space (a checkpoint after the break-up)
  function skipToFree() { begin(100); for (let i = 0; i < FIN_LEN * 10; i++) simulate(0.1); startFree(); }

  // fl: a FreeFlight in space mode (metres); camOff: near-camera offset from the hero's chest
  // ev (optional): { hit(r), near(r) } — rubble against the hero's chest
  function updateFree(fl, dt, t, camOff, ev) {
    su.uT.value = t;
    simulate(dt * RATE_FREE);
    freePos.addScaledVector(fl.vel, dt * 1e-6);
    // rubble around the hero, in the compressed frame so fast flight still reads
    const k = fl.visK; rv.copy(fl.vel).multiplyScalar(-k);
    const fast = rv.lengthSq() > 40 * 40; if (fast) fwdV.copy(rv).normalize().negate();
    aimT -= fast ? dt : 0;
    for (let i = 0; i < RN; i++) {
      const r = rb[i]; r.p.addScaledVector(rv, dt).addScaledVector(r.v, dt);
      let out = false;
      for (const ax of ['x', 'y', 'z']) { if (r.p[ax] > BOX / 2) { r.p[ax] -= BOX; out = true; } else if (r.p[ax] < -BOX / 2) { r.p[ax] += BOX; out = true; } }
      if (out && fast) respawnAhead(r);
      if (ev) {
        const d = r.p.distanceTo(CHEST);
        if (!r.hit && d < r.s * 0.85 + 0.9) { r.hit = true; ev.hit && ev.hit(r); }
        else if (!r.near && fast && d < r.s + 9) { r.near = true; ev.near && ev.near(r); }
      }
      r.r.x += r.w.x * dt * 0.4; r.r.y += r.w.y * dt * 0.4;
      // a rock about to pass through the lens is simply not drawn: a screen-filling polygon reads as a glitch
      const dc = r.p.distanceTo(camNear.position), hide = smooth(r.s + 1.5, r.s + 6, dc);
      q.setFromEuler(r.r); sc.setScalar(r.s * hide); m4.compose(r.p, q, sc); rub.setMatrixAt(i, m4);
    }
    rub.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < DN; i++) {
      const s = ds[i]; s.addScaledVector(rv, dt);
      for (const ax of ['x', 'y', 'z']) { if (s[ax] > 60) s[ax] -= 120; else if (s[ax] < -60) s[ax] += 120; }
      dp[i * 3] = s.x; dp[i * 3 + 1] = s.y; dp[i * 3 + 2] = s.z;
    }
    dg.attributes.position.needsUpdate = true;
    // over the right shoulder, so whatever you are flying toward sits beside the hero, not behind him
    const L = camOff.length(); sh.copy(camOff).negate().cross(UPV); if (sh.lengthSq() < 1e-6) sh.set(1, 0, 0);
    sh.normalize().multiplyScalar(0.22 * L).addScaledVector(UPV, 0.05 * L);
    camNear.position.copy(camOff).add(CHEST).add(sh); camNear.up.set(0, 1, 0); camNear.lookAt(tmp.copy(CHEST).add(sh)); camFar.up.set(0, 1, 0);
    camFar.position.copy(freePos).addScaledVector(camNear.position, 1e-6); camFar.quaternion.copy(camNear.quaternion);
  }
  // rubble that will pass close in the next couple of seconds (for the red warning rings)
  function threats(out) {
    out.length = 0;
    for (const r of rb) {
      if (r.s < 0.9 || r.hit) continue;
      rel.subVectors(r.p, CHEST); rvi.copy(rv).add(r.v);
      const v2 = rvi.lengthSq(); if (v2 < 100) continue;
      const tc = -rel.dot(rvi) / v2; if (tc <= 0 || tc > 2.6) continue;
      if (rel.addScaledVector(rvi, tc).length() < r.s + 2.5) out.push({ p: r.p, tc });
    }
    return out;
  }
  // a set camera for cutscenes in open space (near-frame metres, hero at the origin)
  function setCam(pos, look, fov) {
    camNear.position.copy(pos); camNear.up.set(0, 1, 0); camNear.lookAt(look);
    camFar.up.set(0, 1, 0); camFar.quaternion.copy(camNear.quaternion); camFar.position.copy(freePos).addScaledVector(pos, 1e-6);
    if (fov) camFar.fov = camNear.fov = fov;
  }
  function setFov(f) { camFar.fov = camNear.fov = f; }
  function render(w, h) {
    camFar.aspect = camNear.aspect = w / h; camFar.updateProjectionMatrix(); camNear.updateProjectionMatrix();
    dustMat.uniforms.uScale.value = h / (2 * Math.tan(camFar.fov * Math.PI / 360));
    renderer.autoClear = false; renderer.clear();
    renderer.render(far, camFar);
    if (hero.root.visible || freeOn) { renderer.clearDepth(); renderer.render(near, camNear); }
    renderer.autoClear = true;
  }
  return { begin, update, render, startFree, skipToFree, updateFree, threats, setCam, setFov, hero, near, camNear, camFar, motes, get free() { return freeOn; }, get pos() { return freePos; }, get T() { return T; } };
}
