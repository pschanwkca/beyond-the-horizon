// Beyond the Horizon · meteor shower. Asteroids and comets scattered inward by the Wanderer's passage
// through the outer solar system; in the last minutes they fall faster and more often.
// Threats near the player are telegraphed by a ground ring that fills before impact (2.6 s).
//
// What a falling rock looks like: a dark, broken stone whose leading face is white-hot from ablation, wrapped in a
// soft plasma sheath, dragging a flickering fire trail and leaving a column of smoke hanging along its path.
// What it leaves: a flash and a shock ring racing across the ground, a skirt of dust, hot fragments thrown out that
// bounce and cool, a scorched crater with a molten centre, and the rock itself, embedded and glowing as it cools.
import * as THREE from 'three';
import { audio } from './audio.js';
import { rockGeo, rockCracks } from './rock.js';
import { makeSmoke } from './fx.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const R = Math.random;
const DOWN = new THREE.Vector3(0, -1, 0);
const WARN = 2.6;          // seconds of warning
const SPEED = 170;         // m/s on screen (real entry speeds are 11-72 km/s; slowed so the streak reads)
const GRAV = 6;            // m/s² for thrown fragments (the tide has already taken a third of the Earth's pull)

// the fire trail: soft at the edges (a sheath of glowing gas, not a cone), white at the head, flickering
const trailMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  uniforms: { uA: { value: 1 }, uT: { value: 0 } },
  vertexShader: 'varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec3 n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }',
  fragmentShader: `varying vec2 vUv; varying float vF; uniform float uA, uT;
    void main(){
      float y = vUv.y, core = pow(vF, 1.8);
      float flick = 0.7 + 0.3 * sin(y * 55.0 - uT * 38.0) * sin(y * 21.0 + uT * 15.0);
      float a = pow(y, 1.9) * core * flick;
      vec3 c = mix(vec3(0.75, 0.12, 0.03), vec3(1.0, 0.5, 0.14), smoothstep(0.35, 0.8, y));
      c = mix(c, vec3(1.0, 0.93, 0.8), smoothstep(0.88, 1.0, y));
      gl_FragColor = vec4(c * a * 2.2 * uA, a * uA);
    }`,
});

// a stone heated on the face it's falling toward: white at the stagnation point, orange round it, dark behind
function headMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0x2a231e, roughness: 0.94, fog: false, flatShading: true, emissive: 0xff5a14, emissiveMap: rockCracks(), emissiveIntensity: 1.6, bumpMap: rockCracks(), bumpScale: -1.5 });
  const uDir = { value: new THREE.Vector3(0, 1, 0) }, uHeat = { value: 1 };
  m.userData = { uDir, uHeat };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDir = uDir; sh.uniforms.uHeat = uHeat;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;').replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN; uniform vec3 uDir; uniform float uHeat;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float lead = max(dot(normalize(vWN), -uDir), 0.0);
        totalEmissiveRadiance += uHeat * (vec3(1.0, 0.42, 0.1) * pow(lead, 1.3) * 2.4 + vec3(1.0, 0.9, 0.72) * pow(lead, 7.0) * 5.0 + vec3(0.3, 0.06, 0.015));`);
  };
  return m;
}

export function createMeteors(scene, { sparks, fires, smoke, floorAt }) {
  const group = new THREE.Group(); scene.add(group);
  const trailSmoke = makeSmoke(scene, 520);                 // its own particles, so trails never steal the fires' smoke
  trailSmoke.material.uniforms.uLit.value.set(0x6a4232);
  const live = [];
  const trailGeo = new THREE.CylinderGeometry(1, 0.12, 1, 14, 1, true).translate(0, -0.5, 0);   // head at the top, tail behind
  const heads = [rockGeo(11, { detail: 2, sharp: 0.9 }), rockGeo(23, { detail: 2, flat: 0.5 }), rockGeo(37, { detail: 2, sharp: 0.4 })];
  const fragGeo = rockGeo(51, { detail: 0, sharp: 1 });

  // ---------- textures: soft glow, telegraph, crater ----------
  const tex = (S, draw) => { const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d'), S); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const glowTex = tex(64, (g, S) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(0.22, 'rgba(255,150,70,.6)'); gr.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); });
  const ringTex = tex(256, (g, S) => {
    const c = S / 2, gr = g.createRadialGradient(c, c, c * 0.55, c, c, c); gr.addColorStop(0, 'rgba(255,58,30,0)'); gr.addColorStop(0.82, 'rgba(255,58,30,0.22)'); gr.addColorStop(0.93, 'rgba(255,90,50,0.95)'); gr.addColorStop(1, 'rgba(255,58,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(255,120,80,0.8)'; g.lineWidth = 3;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.8, c + Math.sin(a) * c * 0.8); g.lineTo(c + Math.cos(a) * c * 0.86, c + Math.sin(a) * c * 0.86); g.stroke(); }
  });
  const fillTex = tex(128, (g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,70,30,0.15)'); gr.addColorStop(0.9, 'rgba(255,70,30,0.5)'); gr.addColorStop(1, 'rgba(255,70,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); });
  // a fresh crater in asphalt reads by its ejecta: a black, glassy pit, a rim of pale pulverised rock and road dust, rays of debris
  const craterTex = tex(512, (g, S) => {
    const c = S / 2, r = Math.random;
    let gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(4,3,2,1)'); gr.addColorStop(0.3, 'rgba(10,8,6,0.97)'); gr.addColorStop(0.4, 'rgba(60,52,44,0.9)');
    gr.addColorStop(0.5, 'rgba(158,144,126,0.9)'); gr.addColorStop(0.6, 'rgba(128,116,102,0.6)'); gr.addColorStop(0.8, 'rgba(110,100,88,0.18)'); gr.addColorStop(1, 'rgba(100,90,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {                                                              // ejecta rays
      const a = r() * 6.28, L = c * (0.55 + r() * 0.45), w = 3 + r() * 9;
      const lg = g.createLinearGradient(c + Math.cos(a) * c * 0.45, c + Math.sin(a) * c * 0.45, c + Math.cos(a) * L, c + Math.sin(a) * L);
      lg.addColorStop(0, 'rgba(165,150,130,0.55)'); lg.addColorStop(1, 'rgba(165,150,130,0)');
      g.strokeStyle = lg; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.45, c + Math.sin(a) * c * 0.45); g.lineTo(c + Math.cos(a) * L, c + Math.sin(a) * L); g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineCap = 'round';                                     // fractures through the road
    for (let i = 0; i < 16; i++) { let a = r() * 6.28, d = c * 0.32; g.lineWidth = 1 + r() * 2.5; g.beginPath(); g.moveTo(c + Math.cos(a) * d, c + Math.sin(a) * d); for (let k = 0; k < 8; k++) { a += (r() - 0.5) * 0.3; d += c * (0.05 + r() * 0.05); g.lineTo(c + Math.cos(a) * d, c + Math.sin(a) * d); } g.stroke(); }
    for (let i = 0; i < 220; i++) { const a = r() * 6.28, d = c * (0.35 + r() * 0.6); g.fillStyle = r() < 0.6 ? `rgba(20,16,12,${0.5 + r() * 0.4})` : `rgba(190,176,158,${0.4 + r() * 0.4})`; g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + r() * 5, 2 + r() * 4); }
  });
  // broken slabs of road heaved up round the rim
  // irregular: a few big plates heaved steeply, smaller ones flipped further out, gaps where the road just cracked
  const slabGeo = () => { const parts = [], r = Math.random; let a = r() * 6.28;
    while (a < 6.28 * 1.8) { a += 0.35 + r() * 0.9; if (r() < 0.2) continue;
      const big = r() < 0.45, d = big ? 1.4 + r() * 0.4 : 2.0 + r() * 1.4, w = big ? 0.9 + r() * 0.9 : 0.25 + r() * 0.5, l = big ? 0.7 + r() * 0.6 : 0.2 + r() * 0.4;
      const g = new THREE.BoxGeometry(w, big ? 0.16 : 0.1, l).toNonIndexed(); g.rotateZ((r() - 0.5) * 0.4); g.rotateX(-(big ? 0.4 + r() * 0.7 : r() * 1.4)); g.rotateY(-a + Math.PI / 2 + (r() - 0.5) * 0.6);
      g.translate(Math.cos(a) * d, big ? 0.15 + r() * 0.15 : 0.06, Math.sin(a) * d); parts.push(g); }
    return mergeGeometries(parts); };
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.95, flatShading: true });
  const moltenTex = tex(256, (g, S) => {
    const c = S / 2, r = Math.random, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(0.3, 'rgba(255,90,20,0.8)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(255,110,30,0.9)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { let a = r() * 6.28, d = c * 0.15; g.beginPath(); g.moveTo(c + Math.cos(a) * d, c + Math.sin(a) * d); for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 0.5; d += c * 0.12; g.lineTo(c + Math.cos(a) * d, c + Math.sin(a) * d); } g.stroke(); }
  });
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const fillMat = new THREE.MeshBasicMaterial({ map: fillTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const craterMat = new THREE.MeshStandardMaterial({ map: craterTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
  const planeG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  function rockHead(size) {
    const h = new THREE.Mesh(heads[(R() * heads.length) | 0], headMat()); h.scale.setScalar(size * 0.62); h.rotation.set(R() * 6, R() * 6, 0); h.castShadow = true;
    const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(5 / 0.62); h.add(glow); h.userData.glow = glow;
    return h;
  }
  const lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffb070, 0, 70, 2); scene.add(l); return l; });
  let li = 0;
  const scars = [];
  let threatT = 3, ambientT = 0.5, skyT = 0, clock = 0;
  let onImpact = null;

  // ---------- thrown fragments: one pool, instanced, heat carried in the instance colour ----------
  const FN = 120;
  const fragMat = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.9, flatShading: true });
  fragMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * vColor.r * vColor.r * 3.5;\n#endif');
  };
  const frags = new THREE.InstancedMesh(fragGeo, fragMat, FN); frags.castShadow = true; frags.frustumCulled = false; group.add(frags);
  const F = Array.from({ length: FN }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.2, heat: 0, rest: false, t: 0 }));
  let fi = 0; const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
  for (let i = 0; i < FN; i++) { frags.setMatrixAt(i, _m.makeScale(0, 0, 0)); frags.setColorAt(i, _c.setRGB(0, 0, 0)); }
  function throwFrags(p, n, speed) {
    for (let k = 0; k < n; k++) {
      const f = F[fi++ % FN], a = R() * Math.PI * 2, up = 0.5 + R() * 0.9, sp = speed * (0.5 + R() * 0.7);
      f.on = true; f.rest = false; f.t = 0; f.heat = 0.6 + R() * 0.4; f.s = 0.04 + Math.pow(R(), 3) * 0.2;
      f.p.copy(p).add(new THREE.Vector3(Math.cos(a) * 0.6, 0.4, Math.sin(a) * 0.6)); f.v.set(Math.cos(a) * sp, up * sp, Math.sin(a) * sp);
      f.r.set(R() * 6, R() * 6, R() * 6); f.w.set((R() - 0.5) * 14, (R() - 0.5) * 14, (R() - 0.5) * 14);
    }
  }
  function fragTick(dt) {
    for (let i = 0; i < FN; i++) {
      const f = F[i]; if (!f.on) continue; f.t += dt;
      if (!f.rest) {
        f.v.y -= GRAV * dt; f.p.addScaledVector(f.v, dt); f.r.x += f.w.x * dt; f.r.y += f.w.y * dt; f.r.z += f.w.z * dt;
        const fy = floorAt ? Math.max(0, floorAt(f.p.x, f.p.z, f.p.y + 0.2)) : 0;
        if (f.p.y < fy + f.s * 0.4) { f.p.y = fy + f.s * 0.4; if (Math.abs(f.v.y) > 2.5) { f.v.y *= -0.3; f.v.x *= 0.5; f.v.z *= 0.5; f.w.multiplyScalar(0.5); if (f.heat > 0.5) sparks.emit(f.p, 3, 2, [1, 0.55, 0.2], 0.3); } else { f.rest = true; f.v.set(0, 0, 0); } }
      }
      f.heat = Math.max(0, f.heat - dt * (f.rest ? 0.09 : 0.05));
      if (f.t > 40) f.on = false;
      _q.setFromEuler(f.r); _s.set(f.s * 1.2, f.s * 0.8, f.s);
      frags.setMatrixAt(i, f.on ? _m.compose(f.p, _q, _s) : _m.makeScale(0, 0, 0)); frags.setColorAt(i, _c.setRGB(f.heat, f.heat, f.heat));
    }
    frags.instanceMatrix.needsUpdate = true; frags.instanceColor.needsUpdate = true;
  }

  // ---------- high streaks: rubble burning up in the sky over the city, many at once (never reach the ground) ----------
  const skyPool = Array.from({ length: 64 }, () => { const mesh = new THREE.Mesh(trailGeo, trailMat.clone()); mesh.visible = false; mesh.frustumCulled = false; group.add(mesh); return { mesh, on: false, p: new THREE.Vector3(), dir: new THREE.Vector3(), v: 0, t: 0, life: 1, len: 1, w: 1 }; });
  function spawnSky(camPos) {
    const s = skyPool.find((x) => !x.on); if (!s) return;
    const az = R() * Math.PI * 2, dist = 280 + R() * 1400, a2 = R() * Math.PI * 2;
    s.p.set(camPos.x + Math.cos(az) * dist, 260 + R() * 900 + Math.max(0, camPos.y) * 0.6, camPos.z + Math.sin(az) * dist);
    s.dir.set(Math.cos(a2) * 0.8, 1, Math.sin(a2) * 0.8).normalize();
    s.v = 700 + R() * 700; s.t = 0; s.life = 0.6 + R() * 1.0; s.len = 160 + R() * 320; s.w = 4 + R() * 7; s.on = true; s.mesh.visible = true;
  }

  function newTrail() { const t = new THREE.Mesh(trailGeo, trailMat.clone()); t.frustumCulled = false; return t; }
  function spawn(target, threat, size) {
    const az = R() * Math.PI * 2, el = 0.9 + R() * 0.45;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const travel = threat ? SPEED * WARN : 900 + R() * 600;
    const m = {
      target: target.clone(), dir, t: 0, dur: threat ? WARN : travel / (SPEED * 1.6), threat, size, travel, puffT: 0,
      head: rockHead(size), trail: newTrail(), ring: null, fill: null, spin: (R() - 0.5) * 6,
    };
    m.head.material.userData.uDir.value.copy(dir);
    group.add(m.head, m.trail);
    if (threat) {
      const y = floorAt ? Math.max(0, floorAt(target.x, target.z, 50)) : 0; m.target.y = y;
      m.ring = new THREE.Mesh(planeG, ringMat); m.ring.scale.setScalar(9.6); m.ring.position.set(target.x, y + 0.06, target.z);
      m.fill = new THREE.Mesh(planeG, fillMat.clone()); m.fill.position.set(target.x, y + 0.05, target.z);
      group.add(m.ring, m.fill);
      audio.whistle(WARN, 0.07);
    }
    live.push(m);
    return m;
  }

  // a rock coming down at a flying hero: passes through `aim` after `lead` s, then hits the ground beyond
  function spawnAir(aim, lead, size, camYaw = null) {
    const el = 0.65 + R() * 0.5;
    let dir;
    if (camYaw === null) { const az = R() * Math.PI * 2; dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)); }
    else { const a = camYaw + (R() - 0.5) * 1.6; dir = new THREE.Vector3(-Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el)); }   // from ahead of the camera
    const after = Math.max(0, aim.y) / dir.y, ground = aim.clone().addScaledVector(dir, -after);
    const travel = SPEED * lead + after;
    const m = { target: ground, dir, t: 0, dur: travel / SPEED, threat: false, air: true, aim: aim.clone(), lead, size, travel, spent: false, puffT: 0,
      head: rockHead(size), trail: newTrail(), ring: null, fill: null, spin: (R() - 0.5) * 6 };
    m.head.material.userData.uDir.value.copy(dir);
    group.add(m.head, m.trail); live.push(m);
    audio.whistle(Math.min(2.6, lead), 0.07);
    return m;
  }

  function flashAt(p, big) {
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff2e0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    fl.position.copy(p).y += 1.5; fl.scale.setScalar(6); group.add(fl); scars.push({ mesh: fl, t: 0, kind: 'flash', big });
  }
  // a rock that struck the hero in the air: it shatters there
  function burst(m) {
    const p = m.head.position.clone();
    flashAt(p, 0.6);
    const l = lights[li++ % lights.length]; l.position.copy(p); l.intensity = 5000;
    sparks.emit(p, 60, 16, [1, 0.6, 0.25], 0.2);
    smoke.puff(p, 6, 1, 4);
    m.spent = true; group.remove(m.head, m.trail); m.head.material.dispose(); m.trail.material.dispose();
    const i = live.indexOf(m); if (i >= 0) live.splice(i, 1);
  }

  function impact(m) {
    const p = m.target;
    const near = m.threat || m.air, big = near ? 1 : 0.6 + m.size * 0.2;
    flashAt(p, big);
    const l = lights[li++ % lights.length]; l.position.copy(p).y += 3; l.intensity = 9000 * big;
    if (near) {
      // shock ring racing out across the ground, a skirt of dust, hot fragments, sparks
      const sw = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd8b0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sw.position.set(p.x, p.y + 0.2, p.z); group.add(sw); scars.push({ mesh: sw, t: 0, kind: 'shock' });
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + R() * 0.3, d = 1.5 + R() * 2.5; smoke.puff(new THREE.Vector3(p.x + Math.cos(a) * d, p.y + 0.4, p.z + Math.sin(a) * d), 5 + R() * 3, 0.8, 5 + R() * 3); }
      for (let i = 0; i < 4; i++) smoke.puff(p.clone().add(new THREE.Vector3((R() - 0.5) * 2, 1, (R() - 0.5) * 2)), 7, 4, 7);
      throwFrags(p, 18, 8);
      sparks.emit(p.clone().setY(p.y + 0.5), 80, 15, [1, 0.6, 0.25], 0.9);
      // the crater: scorched, fractured road with a molten heart, and the stone sitting in it, cooling
      const cr = new THREE.Mesh(planeG, craterMat); cr.scale.setScalar(8.5 + R()); cr.rotation.y = R() * 6.28; cr.position.set(p.x, p.y + 0.04, p.z); cr.receiveShadow = true; group.add(cr);
      const mo = new THREE.Mesh(planeG, new THREE.MeshBasicMaterial({ map: moltenTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); mo.scale.setScalar(3.4); mo.rotation.y = R() * 6.28; mo.position.set(p.x, p.y + 0.05, p.z); group.add(mo);
      const sl = new THREE.Mesh(slabGeo(), slabMat); sl.position.set(p.x, p.y, p.z); sl.rotation.y = R() * 6.28; sl.scale.setScalar(0.9 + R() * 0.3); sl.castShadow = sl.receiveShadow = true; group.add(sl);
      scars.push({ mesh: cr, t: 0, kind: 'crater' }, { mesh: mo, t: 0, kind: 'molten' }, { mesh: sl, t: 0, kind: 'crater' });
      if (!m.air) { m.head.scale.multiplyScalar(0.62); m.head.position.set(p.x, p.y + m.size * 0.08, p.z); m.head.userData.glow.visible = false; group.remove(m.trail); m.trail.material.dispose(); scars.push({ mesh: m.head, t: 0, kind: 'stone' }); m.kept = true; }
      fires.add(p.clone(), 1.6 + R(), 16 + R() * 8);
      audio.boom();
    } else {
      // far strike: sound arrives late (343 m/s); a dust column rises over the rooftops
      const camDist = m.camDist || 400;
      setTimeout(() => audio.burst(70, 1.4, Math.min(0.5, 120 / camDist), 'lowpass'), Math.min(4000, camDist / 343 * 1000));
      for (let i = 0; i < 3; i++) smoke.puff(p.clone().add(new THREE.Vector3((R() - 0.5) * 10, 4 + i * 6, (R() - 0.5) * 10)), 26 + R() * 12, 5, 16);
    }
    onImpact && onImpact(p, near ? 4.5 : 0, big);
  }

  function dropMeteor(m, i) {
    if (!m.kept) { group.remove(m.head); m.head.material.dispose(); group.remove(m.trail); m.trail.material.dispose(); }
    if (m.ring) { group.remove(m.ring, m.fill); m.fill.material.dispose(); }
    live.splice(i, 1);
  }

  return {
    set onImpact(f) { onImpact = f; },
    spawnAir, burst,
    strike(target, from = null) { const m = spawn(target, true, 1.4); if (from) { m.dir.copy(from).normalize(); m.head.material.userData.uDir.value.copy(m.dir); } return m; },   // for testing and set pieces
    get air() { return live.filter((m) => m.air && !m.spent); },
    // intensity 0..1 ramps over the countdown; aim = where the player will be; camPos for far-strike placement
    update(dt, t, { intensity, aim, allowThreats, camPos, skyRate = 3 }) {
      threatT -= dt; ambientT -= dt; skyT -= dt; clock += dt;
      while (skyT <= 0) { skyT += (0.4 + R() * 1.2) / skyRate; spawnSky(camPos); }
      for (const s of skyPool) {
        if (!s.on) continue;
        s.t += dt; if (s.t >= s.life) { s.on = false; s.mesh.visible = false; continue; }
        s.p.addScaledVector(s.dir, -s.v * dt);
        s.mesh.position.copy(s.p); s.mesh.quaternion.setFromUnitVectors(DOWN, s.dir);
        s.mesh.scale.set(s.w, Math.min(s.len, s.v * s.t + 4), s.w);
        s.mesh.material.uniforms.uA.value = Math.sin(Math.PI * s.t / s.life) * 1.3; s.mesh.material.uniforms.uT.value = clock;
      }
      if (allowThreats && threatT <= 0) {
        threatT = 7.5 - 4.2 * intensity + R() * 2;
        const ang = R() * Math.PI * 2, rad = R() * 4.5;
        spawn(new THREE.Vector3(aim.x + Math.cos(ang) * rad, 0, aim.z + Math.sin(ang) * rad), true, 1.4);
      }
      if (ambientT <= 0) {
        ambientT = 1.4 - 1.0 * intensity + R() * 0.6;
        const ang = R() * Math.PI * 2, rad = 120 + R() * 380;
        const tgt = new THREE.Vector3(camPos.x + Math.cos(ang) * rad, 0, camPos.z + Math.sin(ang) * rad);
        spawn(tgt, false, 2 + R() * 3).camDist = rad;
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const m = live[i]; m.t += dt;
        const k = Math.min(1, m.t / m.dur);
        const remaining = (1 - k) * m.travel;
        m.head.position.copy(m.target).addScaledVector(m.dir, remaining);
        m.head.rotation.x += m.spin * dt; m.head.rotation.z += m.spin * 0.6 * dt;
        const len = Math.min(m.travel * k + 2, m.threat || m.air ? 70 : 160);
        m.trail.position.copy(m.head.position); m.trail.scale.set(m.size * 0.6, len, m.size * 0.6);
        m.trail.quaternion.setFromUnitVectors(DOWN, m.dir);   // tail points back up the incoming path
        m.trail.material.uniforms.uT.value = clock + i;
        // a smoke column left hanging along the path
        m.puffT -= dt;
        if (m.puffT <= 0 && m.head.position.y > 1.5) {
          const near = m.threat || m.air; m.puffT = near ? 0.035 : 0.09;
          trailSmoke.puff(m.head.position.clone().addScaledVector(m.dir, m.size * 1.2), near ? 1.4 + m.size * 0.6 : 4 + m.size * 2, 0.15, near ? 7 : 12);
        }
        if (m.ring) { m.fill.scale.setScalar(Math.max(0.05, k) * 8.6); m.fill.material.opacity = 0.35 + 0.55 * k; ringMat.opacity = 0.65 + 0.35 * Math.abs(Math.sin(t * 10)); }
        if (k >= 1) { impact(m); dropMeteor(m, i); }
      }
      for (let i = scars.length - 1; i >= 0; i--) {
        const s = scars[i]; s.t += dt;
        if (s.kind === 'flash') { s.mesh.scale.setScalar((6 + s.t * 120) * s.big); s.mesh.material.opacity = Math.max(0, 1 - s.t * 3.2); if (s.t > 0.35) { group.remove(s.mesh); s.mesh.material.dispose(); scars.splice(i, 1); } }
        else if (s.kind === 'shock') { s.mesh.scale.setScalar(1 + s.t * 42); s.mesh.material.opacity = Math.max(0, 0.8 - s.t * 1.8); if (s.t > 0.45) { group.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); scars.splice(i, 1); } }
        else if (s.kind === 'molten') { s.mesh.material.opacity = Math.max(0, 1 - s.t / 22); if (s.t > 22) { group.remove(s.mesh); s.mesh.material.dispose(); scars.splice(i, 1); } }
        else if (s.kind === 'stone') { s.mesh.material.userData.uHeat.value = Math.max(0, 1 - s.t / 2.5) ** 2; s.mesh.material.emissiveIntensity = 1.6 * Math.max(0.04, 1 - s.t / 30) ** 1.5; if (s.t > 90) { group.remove(s.mesh); s.mesh.material.dispose(); scars.splice(i, 1); } }
        else if (s.kind === 'crater' && s.t > 90) { group.remove(s.mesh); if (s.mesh.material === slabMat) s.mesh.geometry.dispose(); scars.splice(i, 1); }
      }
      fragTick(dt);
      trailSmoke.update(dt, null);
      for (const l of lights) l.intensity *= Math.exp(-dt * 7);
    },
    clear() {
      for (let i = live.length - 1; i >= 0; i--) { live[i].kept = false; dropMeteor(live[i], i); }
      threatT = 3; for (const s of skyPool) { s.on = false; s.mesh.visible = false; }
      for (const s of scars) { group.remove(s.mesh); } scars.length = 0;
      for (const f of F) f.on = false;
    },
  };
}
