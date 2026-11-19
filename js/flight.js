// Beyond the Horizon · RJ-7 free flight and the climb to space.
// Physics in SI. The RJ-7's plasma shield (after NASA's "magnetoshell" idea: a magnetic field holds a
// plasma bubble that takes the shock and the heat) lets the hero fly far faster than a bare suit could.
// The top speed rises as the air thins: v_max = 60 m/s · e^(h / 1.8 km), capped at 6 km/s.
// Earth-scale scene: far layer in km (the real globe, sky, meteors), near layer in metres (the hero, rocks).
import * as THREE from 'three';
import { clamp, smooth, GLSL_NOISE } from './util.js';
import { createDoomSky, BH_DIR, MOON_DIR, MARS_DIR, COMPASS } from './doomsky.js';
import { createPlayer } from './player.js';
import { earthMaterial, atmosphereMaterial, siteQuaternion, SUN_LOCAL } from './earth.js';

export const RE = 6.371e6, G0 = 9.80665, SPACE_H = 100000;
const RHO0 = 1.225, HSCALE = 8500;
export const LAUNCH = { x: 216, z: 0 };                 // the RJ-7 lab: where the street map is pinned to the globe
export const VCAP = 6000;
export const vmaxAt = (h) => Math.min(VCAP, 60 * Math.exp(Math.max(0, h) / 1800));
export const rhoAt = (h) => RHO0 * Math.exp(-Math.max(0, h) / HSCALE);
export const VIS = 140;                                  // m/s: fast things are drawn in a compressed frame so they stay dodgeable

const _w = new THREE.Vector3();
export class FreeFlight {
  constructor() { this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.reset(); }
  reset(p) { if (p) this.pos.copy(p); this.vel.set(0, 0, 0); this.qdot = 0; this.thrust = 0; this.space = false; this.cap = Infinity; this.vmaxFn = null; this.rhoFn = null; }
  get h() { return this.pos.y; }
  get speed() { return this.vel.length(); }
  rho() { return this.rhoFn ? this.rhoFn(this.pos.y) : rhoAt(this.pos.y); }        // rhoFn / vmaxFn: another planet's air
  // dir: where the pilot wants to go (length 0..1, world axes); the jets hold you up when you let go
  step(dt, dir, boost) {
    const m = Math.min(1, dir.length());
    const vm = Math.min(this.cap, (this.space ? VCAP : this.vmaxFn ? this.vmaxFn(this.pos.y) : vmaxAt(this.pos.y)) * (boost ? 1.6 : 1));   // cap: a speed limit set from outside (docking)
    _w.copy(dir); if (m > 1e-3) _w.multiplyScalar(vm * m / dir.length()); else _w.set(0, 0, 0);
    this.vel.lerp(_w, 1 - Math.exp(-(m > 0.02 ? 2.6 : 1.8) * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.thrust = 0.22 + 0.78 * m * (boost ? 1 : 0.75);
    // stagnation-point heating the shield has to carry (Sutton–Graves, 0.5 m effective nose)
    const v = this.vel.length(); this.qdot = 1.7415e-4 * Math.sqrt(this.rho() / 0.5) * v * v * v;
  }
  // 0..1: how hard the plasma sheath is glowing
  get glow() { return smooth(4.8, 7.4, Math.log10(Math.max(1, this.qdot))); }
  // speed scale for the compressed near frame
  get visK() { const v = this.vel.length(); return v > VIS ? VIS / v : 1; }
}

// ---------------- shaders ----------------
const CAP_FRAG = `${GLSL_NOISE} varying vec3 vL; uniform float uT;
void main(){
  vec2 p = vL.xz; float r = length(p);
  // the coast runs north-south a few km east of the pad; the Atlantic beyond
  float ex = dot(p, vec2(${Math.cos(COMPASS).toFixed(4)}, ${(-Math.sin(COMPASS)).toFixed(4)})), ny = dot(p, vec2(${(-Math.sin(COMPASS)).toFixed(4)}, ${(-Math.cos(COMPASS)).toFixed(4)}));   // true east / north (world axes are turned against the compass)
  float coast = 5.0 + 4.0 * (fbm3(vec3(0.0, ny * 0.05, 1.7)) - 0.5) * 2.0;
  float land = smoothstep(coast + 0.4, coast - 0.4, ex);
  float dens = smoothstep(0.32, 0.6, fbm3(vec3(p * 0.07, 3.0))) * exp(-r / 32.0) * land;
  float power = smoothstep(0.42, 0.58, fbm3(vec3(p * 0.22, 9.0)));            // districts that still have power
  vec3 col = mix(vec3(0.006, 0.01, 0.016), vec3(0.024, 0.018, 0.015), land);
  // streets, gently warped so the grid isn't ruler-straight; lamps as broken dotted lines
  vec2 w = p + 0.35 * vec2(fbm3(vec3(p * 0.12, 1.0)) - 0.5, fbm3(vec3(p * 0.12, 5.0)) - 0.5);
  float fw = clamp(1.0 - fwidth(w.x * 6.0) * 1.8, 0.0, 1.0);
  vec2 g1 = abs(fract(w * 1.2) - 0.5), g2 = abs(fract(w * 6.0) - 0.5);
  float av = max(smoothstep(0.022, 0.0, g1.x), smoothstep(0.022, 0.0, g1.y));
  float st = max(smoothstep(0.045, 0.0, g2.x), smoothstep(0.045, 0.0, g2.y)) * fw;
  float lamps = mix(1.0, step(0.45, h13(vec3(floor(w * 48.0), 3.0))), fw);
  float onA = step(0.3, h13(vec3(floor(w * 1.2), 1.0))), onS = step(0.5, h13(vec3(floor(w * 6.0), 2.0)));
  // seen from high up a grid of thin lines can only alias into tiles: fade each grid to its average glow as it shrinks below a pixel
  float fA = clamp(1.0 - fwidth(w.x * 1.2) * 4.0, 0.0, 1.0);
  float avL = mix(0.062, av * onA, fA), stL = mix(0.045, st * onS, fw);
  col += vec3(1.0, 0.6, 0.26) * (avL * 0.32 + stL * 0.16) * mix(0.55, lamps, fw) * dens * power;
  // fires: burning blocks, each a hot core in a soft glow
  vec2 fp = w * 2.2; vec2 fc = floor(fp); float fh = h13(vec3(fc, 4.0));
  vec2 ff = fract(fp) - 0.5 - (vec2(h13(vec3(fc, 5.0)), h13(vec3(fc, 6.0))) - 0.5) * 0.6;
  float fl = 0.75 + 0.35 * sin(uT * (4.0 + fh * 5.0) + fh * 60.0);
  float burn = step(0.88, fh) * (0.3 + dens * 2.6) * land * mix(0.35, 1.0, fA);
  col += mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.62, 0.2), fh) * burn * fl * (exp(-dot(ff, ff) * 60.0) * 1.6 + exp(-dot(ff, ff) * 9.0) * 0.18);
  col += vec3(0.5, 0.15, 0.04) * dens * 0.12 + vec3(0.9, 0.32, 0.08) * exp(-r / 1.6) * 0.25;
  // fresh impact craters, still glowing
  vec2 cp = p * 0.35; vec2 cf = fract(cp) - 0.5; float ch = h13(vec3(floor(cp), 7.0));
  col += vec3(1.0, 0.45, 0.12) * step(0.9, ch) * smoothstep(0.08, 0.0, abs(length(cf) - 0.05)) * 1.2;
  // drifting smoke shadows
  col *= 1.0 - 0.55 * smoothstep(0.5, 0.82, fbm3(vec3(p * 0.25 + uT * 0.004, 2.0)));
  gl_FragColor = vec4(col, 1.0 - smoothstep(42.0, 64.0, r));
}`;

const DECK_FRAG = (scale, cover, tint) => `${GLSL_NOISE} varying vec2 vXZ; uniform float uT, uFade; uniform vec2 uOff;
  void main(){ vec2 q = (vXZ + uOff) * ${scale.toFixed(4)};
    float n = fbm3(vec3(q, uT * 0.01)); float a = smoothstep(${(1 - cover).toFixed(3)}, ${(1.15 - cover).toFixed(3)}, n);
    float edge = 1.0 - smoothstep(60.0, 140.0, length(vXZ));
    vec3 col = vec3(${tint}) * (0.6 + 0.6 * fbm3(vec3(q * 3.0, 2.0)));
    gl_FragColor = vec4(col, a * edge * uFade * 0.95); }`;

// meteor trail: head at y = 0, tail at y = 1 (instanced; per-instance brightness in aA)
const trailShader = (instanced) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `${instanced ? 'attribute float aA; varying float vA;' : 'uniform float uA; varying float vA;'} varying vec2 vUv;
    void main(){ vUv = uv; vA = ${instanced ? 'aA' : 'uA'}; vec4 p = vec4(position, 1.0);
      ${instanced ? 'p = instanceMatrix * p;' : ''} gl_Position = projectionMatrix * modelViewMatrix * p; }`,
  fragmentShader: `varying vec2 vUv; varying float vA;
    void main(){ float y = vUv.y; float x = abs(vUv.x - 0.5) * 2.0; float a = pow(1.0 - y, 2.0) * (1.0 - x * x) * vA;
      vec3 c = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.4, 0.1), smoothstep(0.0, 0.35, y));
      gl_FragColor = vec4(c * a * 2.2, a); }`,
  uniforms: instanced ? {} : { uA: { value: 1 } },
});

// ---------------- the Earth-scale scene ----------------
export function createSkyScene(renderer) {
  const far = new THREE.Scene(), near = new THREE.Scene();
  const camFar = new THREE.PerspectiveCamera(62, 1, 0.02, 90000);
  const camNear = new THREE.PerspectiveCamera(62, 1, 0.1, 4000);
  const REk = RE / 1000;

  const sky = createDoomSky(70000); far.add(sky); const su = sky.material.uniforms;

  // the planet, turned so that the point under the hero is always on top
  const root = new THREE.Group(); far.add(root);
  const eMat = earthMaterial();
  const globe = new THREE.Mesh(new THREE.SphereGeometry(REk, 384, 192), eMat); globe.quaternion.copy(siteQuaternion()); root.add(globe);
  const aMat = atmosphereMaterial();
  const atm = new THREE.Mesh(new THREE.SphereGeometry(REk + 90, 160, 80), aMat); atm.renderOrder = 2; root.add(atm);
  // the burning coast around the launch site (the globe map is ~20 km a pixel; this is the close-up)
  const capMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vL; void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: CAP_FRAG });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(REk + 0.02, 160, 40, 0, Math.PI * 2, 0, 66 / REk), capMat); cap.renderOrder = 1; root.add(cap);

  // smoke decks over the burning city (flat locally), lit from below by the fires
  function deck(alt, scale, cover, tint) {
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uFade: { value: 1 }, uOff: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vXZ; void main(){ vXZ = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: DECK_FRAG(scale, cover, tint) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), m); mesh.rotation.x = -Math.PI / 2; mesh.userData = { alt }; mesh.renderOrder = 3; far.add(mesh); return mesh;
  }
  const decks = [deck(2.4, 0.12, 0.6, '0.22,0.12,0.08'), deck(7.0, 0.05, 0.4, '0.3,0.2,0.16')];

  // meteors burning up all over the sky (km): most die 40-80 km up, a few big ones reach the ground
  const MN = 72, trailGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true).translate(0, 0.5, 0);
  const mGeo = trailGeo.clone(); const aA = new Float32Array(MN); mGeo.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 1));
  const mInst = new THREE.InstancedMesh(mGeo, trailShader(true), MN); mInst.frustumCulled = false; mInst.renderOrder = 4; far.add(mInst);
  const mets = Array.from({ length: MN }, () => ({ on: false, p: new THREE.Vector3(), d: new THREE.Vector3(), v: 0, len: 0, w: 0, end: 0, big: false, t: 0 }));
  const flashMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uA; void main(){ float r = length(vUv - 0.5) * 2.0; float a = exp(-r * r * 6.0) * uA; gl_FragColor = vec4(vec3(1.0, 0.7, 0.4) * a * 2.0, a); }' });
  const flashes = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMat.clone()); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 4; far.add(m); return { m, t: 9 }; });
  let fi = 0, metT = 0;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();

  // ---------- near layer (metres) ----------
  const hero = createPlayer(near, { noShadow: true });
  hero.setSuit(true); hero.setRocket(true); hero.heal(); hero.st.mode = 'fly';
  const amb = new THREE.HemisphereLight(0x8a6a60, 0x3a1a10, 0.9); near.add(amb);
  const key = new THREE.DirectionalLight(0xfff0e6, 1.6); near.add(key, key.target);
  const below = new THREE.PointLight(0xff7a30, 0, 400, 2); below.position.set(0, -60, 0); near.add(below);

  // air rushing past (ash and smoke motes), drawn as short streaks along the relative wind
  const SN = 220, sp = new Float32Array(SN * 6), seeds = [];
  for (let i = 0; i < SN; i++) seeds.push(new THREE.Vector3((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90));
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xc89070, transparent: true, opacity: 0.3, depthWrite: false }));
  streaks.frustumCulled = false; near.add(streaks);

  // rocks to dodge, in the compressed frame: a rock and the hero close at most at VIS + fall speed
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  { const pa = rockGeo.attributes.position; for (let i = 0; i < pa.count; i++) { tmp.fromBufferAttribute(pa, i); tmp.multiplyScalar(0.8 + 0.35 * Math.abs(Math.sin(tmp.x * 7.1 + tmp.y * 3.3) * Math.cos(tmp.z * 5.7))); pa.setXYZ(i, tmp.x, tmp.y, tmp.z); } rockGeo.computeVertexNormals(); }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.95, emissive: 0xff4a10, emissiveIntensity: 0.22, flatShading: true });
  const rTrailGeo = new THREE.CylinderGeometry(0.15, 1, 1, 10, 1, true).translate(0, 0.5, 0);   // wide at the rock (y=0), thin back up the path (+y)
  const rocks = [];
  const view = { pull: 0 };

  function relVel(r, fl, out) { const k = fl.visK; return out.copy(r.fall).addScaledVector(fl.vel, -k); }

  // a rock that will reach the hero in `lead` seconds if they hold their course; `miss` = sideways offset (m)
  // view: the camera's forward direction; rocks come out of the sky in front of it, a little above centre
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function spawnRock(fl, lead = 2.4, miss = 0, size = 1.6 + Math.random() * 2, view = null) {
    const r = { fall: new THREE.Vector3(), size, t: 0, hit: false, passed: false, p: new THREE.Vector3(), mesh: new THREE.Mesh(rockGeo, rockMat), tr: new THREE.Mesh(rTrailGeo, trailShader(false)), spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3), minD: 1e9 };
    const vVis = _a.copy(fl.vel).multiplyScalar(fl.visK);
    const from = _b.copy(view || up).normalize();
    // tilt up 4-16 degrees and swing up to 24 degrees left or right
    const right = new THREE.Vector3().crossVectors(from, up); if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
    const upv = new THREE.Vector3().crossVectors(right, from).normalize();
    const el = (4 + Math.random() * 12) * Math.PI / 180, az = (Math.random() - 0.5) * 48 * Math.PI / 180;
    from.multiplyScalar(Math.cos(el) * Math.cos(az)).addScaledVector(upv, Math.sin(el)).addScaledVector(right, Math.cos(el) * Math.sin(az)).normalize();
    const close = Math.max(60, vVis.length() + 45);                // closing speed in the drawn frame
    const rvw = from.clone().multiplyScalar(-close);               // the rock's velocity relative to the hero
    r.fall.copy(rvw).add(vVis);                                    // so that fall - vVis = rvw while the hero holds course
    r.p.copy(from).multiplyScalar(close * lead).add(up);
    if (miss) { const side = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5); side.addScaledVector(rvw, -side.dot(rvw) / rvw.lengthSq()).normalize(); r.p.addScaledVector(side, miss); }
    r.mesh.scale.setScalar(size); r.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    near.add(r.mesh, r.tr); rocks.push(r); return r;
  }
  function clearRocks() { for (const r of rocks) { near.remove(r.mesh, r.tr); r.tr.material.dispose(); } rocks.length = 0; }

  const Roff = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  const sunW = new THREE.Vector3(), bhW = new THREE.Vector3(), moonW = new THREE.Vector3(), marsW = new THREE.Vector3();
  const rv = new THREE.Vector3();
  const state = { hk: 0, dip: 0, air: 1, sunUp: 0 };

  // camOff: camera offset from the hero's chest, metres. events: { hit(rock), nearMiss(rock) }
  function update(fl, dt, t, prog, camOff, events = {}, opts = {}) {
    const hk = Math.max(0, fl.h / 1000); state.hk = hk;
    // the globe turns under the hero as they travel over it
    qa.setFromAxisAngle(Z, (fl.pos.x - LAUNCH.x) / RE); qb.setFromAxisAngle(X, -(fl.pos.z - LAUNCH.z) / RE); Roff.copy(qa).multiply(qb);
    root.quaternion.copy(Roff); root.position.set(0, -(REk + hk), 0);
    sunW.copy(SUN_LOCAL).applyQuaternion(Roff); bhW.copy(BH_DIR).applyQuaternion(Roff); moonW.copy(MOON_DIR).applyQuaternion(Roff); marsW.copy(MARS_DIR).applyQuaternion(Roff);
    const dip = Math.acos(clamp(REk / (REk + hk), -1, 1)); state.dip = dip;
    const air = Math.pow(fl.rho() / RHO0, 0.35); state.air = air;
    su.uT.value = t; su.uProg.value = opts.skyProg ?? prog; su.uAir.value = air; su.uDip.value = dip; su.uSpace.value = smooth(25, 85, hk);
    su.uSun.value.copy(sunW); su.uBH.value.copy(bhW); su.uMoon.value.copy(moonW); su.uMars.value.copy(marsW);
    eMat.uniforms.uT.value = t; eMat.uniforms.uSun.value.copy(sunW); aMat.uniforms.uSun.value.copy(sunW);
    aMat.uniforms.uK.value = 0.35 + 0.65 * smooth(1, 30, hk);
    capMat.uniforms.uT.value = t;
    decks.forEach((d) => { const u = d.material.uniforms; d.position.y = d.userData.alt - hk; u.uT.value = t; u.uOff.value.set((fl.pos.x - LAUNCH.x) / 1000, -(fl.pos.z - LAUNCH.z) / 1000); u.uFade.value = 1 - smooth(d.userData.alt + 0.6, d.userData.alt + 5, hk); d.visible = u.uFade.value > 0.01; });

    // meteors all over the sky; more as the end nears
    metT -= dt;
    while (metT <= 0) {
      metT += 0.06 + 0.12 * Math.random() * (1.3 - prog);
      const m = mets.find((x) => !x.on); if (!m) break;
      const ang = Math.random() * Math.PI * 2, rad = 25 + Math.pow(Math.random(), 0.7) * 520;
      const startAlt = 105 + Math.random() * 30;
      m.big = Math.random() < 0.07; m.end = m.big ? 0 : 35 + Math.random() * 45;
      m.p.set(Math.cos(ang) * rad, startAlt - hk - rad * rad / (2 * REk), Math.sin(ang) * rad);
      m.d.set((Math.random() - 0.5) * 1.3, -1, (Math.random() - 0.5) * 1.3).normalize();
      m.v = 22 + Math.random() * 30; m.len = 6 + Math.random() * 20; m.w = (m.big ? 1.6 : 0.5) + Math.random() * 0.6; m.t = 0; m.on = true;
    }
    for (let i = 0; i < MN; i++) {
      const m = mets[i];
      if (!m.on) { aA[i] = 0; m4.makeScale(0, 0, 0); mInst.setMatrixAt(i, m4); continue; }
      m.t += dt; m.p.addScaledVector(m.d, m.v * dt);
      const r2 = m.p.x * m.p.x + m.p.z * m.p.z, alt = m.p.y + hk + r2 / (2 * REk);
      if (alt <= m.end) {
        m.on = false;
        if (m.big) { const f = flashes[fi++ % flashes.length]; f.t = 0; f.m.visible = true; f.m.position.set(m.p.x, -hk - r2 / (2 * REk) + 0.05, m.p.z); }
        continue;
      }
      aA[i] = Math.min(1, m.t * 3) * (m.big ? 1.6 : 1) * smooth(m.end - 2, m.end + 12, alt);
      q4.setFromUnitVectors(up, tmp.copy(m.d).negate()); s4.set(m.w, m.len, m.w);
      m4.compose(m.p, q4, s4); mInst.setMatrixAt(i, m4);
    }
    mInst.instanceMatrix.needsUpdate = true; mGeo.attributes.aA.needsUpdate = true;
    for (const f of flashes) { if (!f.m.visible) continue; f.t += dt; f.m.scale.setScalar(6 + f.t * 14); f.m.material.uniforms.uA.value = Math.max(0, 1.4 - f.t * 0.5); if (f.t > 3) f.m.visible = false; }

    // light on the hero: the Sun once it clears the limb, otherwise the Wanderer's flare and the fires below
    const sunUp = smooth(-0.01, 0.02, sunW.y + dip); state.sunUp = sunUp;
    key.position.copy(sunUp > 0.5 ? sunW : bhW).multiplyScalar(50);
    key.color.setRGB(1, 0.9 + 0.1 * sunUp, 0.85 + 0.15 * sunUp); key.intensity = 1.2 + 1.6 * sunUp;
    below.intensity = 1300 * air * air;
    amb.intensity = 0.3 + 0.6 * air;

    // the air streaming past, relative to the hero (compressed frame)
    const k = fl.visK; rv.copy(fl.vel).multiplyScalar(-k);
    const vv = rv.length(), len = clamp(vv * 0.03, 0.1, 4);
    streaks.material.opacity = clamp(vv / 40, 0, 1) * 0.32 * air * air; streaks.visible = streaks.material.opacity > 0.01;
    tmp.copy(rv).normalize();
    for (let i = 0; i < SN; i++) {
      const s = seeds[i]; s.addScaledVector(rv, dt);
      for (const ax of ['x', 'y', 'z']) { if (s[ax] > 45) s[ax] -= 90; else if (s[ax] < -45) s[ax] += 90; }
      sp[i * 6] = s.x; sp[i * 6 + 1] = s.y; sp[i * 6 + 2] = s.z;
      sp[i * 6 + 3] = s.x - tmp.x * len; sp[i * 6 + 4] = s.y - tmp.y * len; sp[i * 6 + 5] = s.z - tmp.z * len;
    }
    sg.attributes.position.needsUpdate = true;

    // rocks: move in the compressed frame, test against the hero (a 0.85 m ball at his chest)
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i]; r.t += dt; relVel(r, fl, rv);
      // closest approach during this step (the rock can move several metres a frame)
      tmp.copy(r.p).sub(up); const v2 = Math.max(1e-6, rv.lengthSq());
      const tc = clamp(-tmp.dot(rv) / v2, 0, dt), dStep = tmp.addScaledVector(rv, tc).length();
      r.p.addScaledVector(rv, dt);
      tmp.copy(r.p).sub(up);                       // hero's chest at (0, 1, 0)
      const d = tmp.length(); r.minD = Math.min(r.minD, d, dStep);
      if (!r.hit && dStep < r.size * 0.9 + 0.85) { r.hit = true; events.hit && events.hit(r); }
      const leaving = tmp.dot(rv) > 0;
      if (leaving && !r.passed) { r.passed = true; if (!r.hit && r.minD < r.size + 6) events.nearMiss && events.nearMiss(r); }
      r.mesh.position.copy(r.p); r.mesh.rotation.x += r.spin.x * dt; r.mesh.rotation.y += r.spin.y * dt;
      r.tr.position.copy(r.p); r.tr.quaternion.setFromUnitVectors(up, tmp.copy(rv).normalize().negate());
      r.tr.scale.set(r.size * 0.9, r.size * (5 + Math.min(10, rv.length() * 0.06)), r.size * 0.9);
      r.mesh.visible = r.tr.visible = !r.hit;
      r.tr.material.uniforms.uA.value = smooth(4, 14, camNear.position.distanceTo(r.p));   // never fill the lens
      if ((leaving && d > r.size + 3) || r.t > 9 || r.hit) { near.remove(r.mesh, r.tr); r.tr.material.dispose(); rocks.splice(i, 1); }
    }

    // cameras: the near one orbits the hero; the far one sits at the same spot in km
    camNear.position.copy(camOff).add(up); camNear.lookAt(0, 1, 0);
    if (opts.shake) { camNear.position.x += (Math.random() - 0.5) * opts.shake * 0.3; camNear.position.y += (Math.random() - 0.5) * opts.shake * 0.3; }
    camFar.position.copy(camNear.position).multiplyScalar(0.001); camFar.quaternion.copy(camNear.quaternion);
    aMat.uniforms.uCam.value.copy(camFar.position);
  }
  // incoming rocks that are on (or near) a collision course, for the HUD markers
  function threats(fl, out = []) {
    out.length = 0;
    for (const r of rocks) {
      if (r.hit || r.passed) continue;
      relVel(r, fl, rv); const v2 = rv.lengthSq(); if (v2 < 1) continue;
      tmp.copy(r.p).sub(up); const tc = -tmp.dot(rv) / v2; if (tc < 0 || tc > 3) continue;
      const miss = tmp.addScaledVector(rv, tc).length();
      if (miss < r.size + 2.2) out.push({ r, tc, p: r.p });
    }
    return out;
  }
  function setFov(f) { camFar.fov = camNear.fov = f; }
  function render(w, h) {
    camFar.aspect = camNear.aspect = w / h; camFar.updateProjectionMatrix(); camNear.updateProjectionMatrix();
    renderer.autoClear = false; renderer.clear();
    renderer.render(far, camFar); renderer.clearDepth(); renderer.render(near, camNear);
    renderer.autoClear = true;
  }
  return { update, render, hero, camNear, camFar, rocks, spawnRock, clearRocks, threats, setFov, state, view, sky };
}
