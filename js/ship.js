// Beyond the Horizon · 晨星號 (Morning Star), the Horizon Institute's ark ship.
// Built along +z (bow at +z, engines at -z) at 1:2.5, so about 550 m long in the world. Units: metres.
// The airlock is on the starboard (+x) side of the command module; `airlock` is its local position,
// `airlockN` the way out of it. Beacons are drawn at a fixed pixel size so the ship reads from far away;
// the engine plume doubles as a star-bright marker when the drive is lit.
import * as THREE from 'three';
import { canvasTex, mulberry } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FONT = '"Michroma", "Noto Sans TC", system-ui, sans-serif';

function panelTex(seed, base, line) {
  const R = mulberry(seed);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {           // a few panels a shade off, like plates replaced at different times
      const x = Math.floor(R() * 8) * 32, y = Math.floor(R() * 8) * 32, pw = 32 * (1 + Math.floor(R() * 2)), ph = 32 * (1 + Math.floor(R() * 3));
      g.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.07})`; g.fillRect(x, y, pw, ph);
    }
    g.strokeStyle = line; g.lineWidth = 1.2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 32 + 0.5); g.lineTo(w, i * 32 + 0.5); g.stroke(); }
    for (let r = 0; r < 8; r++) for (let c = 0; c <= 8; c++) {
      if (R() < 0.45) continue;
      g.beginPath(); g.moveTo(c * 32 + 0.5, r * 32); g.lineTo(c * 32 + 0.5, r * 32 + 32); g.stroke();
    }
  }, { repeat: true });
}

function nameTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,28,26,0.92)';
    g.font = `500 120px "Noto Sans TC", system-ui, sans-serif`; g.textBaseline = 'middle';
    g.fillText('晨星號', 40, 112);
    g.font = `400 40px ${FONT}`; g.fillStyle = 'rgba(30,28,26,0.78)';
    g.fillText('MORNING STAR', 430, 92); g.fillText('ARK · 01', 430, 146);
    g.fillStyle = '#c8722e'; g.fillRect(40, 200, 940, 10);     // the Institute's amber stripe
  });
}

const glowSprite = (() => {
  let tex = null;
  return () => tex || (tex = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.55)'); r.addColorStop(0.5, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  }, { srgb: false }));
})();

export function createShip() {
  const SCALE = 2.5;                                  // an ark for thousands: the model is built small and scaled up
  const root = new THREE.Group(); root.name = 'MorningStar';
  const hull0 = new THREE.Group(); hull0.scale.setScalar(SCALE); root.add(hull0);
  const body = new THREE.Group(); hull0.add(body);
  const hullMap = panelTex(11, '#d9d5cd', 'rgba(40,36,32,0.28)'); hullMap.repeat.set(10, 4);
  // a little self-light (hull floodlights) so she reads as a pale shape even on her night side
  const hull = new THREE.MeshStandardMaterial({ color: 0xffffff, map: hullMap, bumpMap: hullMap, bumpScale: 0.6, roughness: 0.5, metalness: 0.3, emissive: 0x3c3a38, emissiveMap: hullMap, emissiveIntensity: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.75, metalness: 0.5 });
  const tankMap = panelTex(23, '#ece7dd', 'rgba(60,52,44,0.3)'); tankMap.repeat.set(2, 3);
  const tank = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tankMap, roughness: 0.45, metalness: 0.2, emissive: 0x34322f, emissiveMap: tankMap, emissiveIntensity: 0.5 });
  const band = new THREE.MeshStandardMaterial({ color: 0xc8722e, roughness: 0.6, metalness: 0.2 });
  const rad = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.45, metalness: 0.6, emissive: 0x3a1206, emissiveIntensity: 0.28 });
  const win = new THREE.MeshBasicMaterial({ color: 0xffc27a });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
  const alongZ = Math.PI / 2;

  // She flies under thrust the whole way (2 g out, flip, 2 g in), so "down" is toward the engines and every deck is
  // stacked across the thrust axis like floors in a tower. No spinning ring: thrust is her gravity.
  // bow → stern: command module (bridge under the dome), habitat stack, seed vault, propellant, radiators, shadow shield, drive.
  const mliT = canvasTex(256, 256, (g, w, h) => {           // crinkled gold multi-layer insulation
    const R2 = mulberry(5); g.fillStyle = '#b8902e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = R2(); g.fillStyle = v < 0.5 ? `rgba(255,236,160,${0.08 + R2() * 0.18})` : `rgba(70,45,10,${0.08 + R2() * 0.2})`; g.beginPath(); g.moveTo(R2() * w, R2() * h); g.lineTo(R2() * w, R2() * h); g.lineTo(R2() * w, R2() * h); g.fill(); }
    g.strokeStyle = 'rgba(60,40,10,0.5)'; g.lineWidth = 2; for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }   // blanket seams
  }, { repeat: true });
  const mli = new THREE.MeshStandardMaterial({ color: 0xffffff, map: mliT, bumpMap: mliT, bumpScale: 2, roughness: 0.32, metalness: 0.85, emissive: 0x2a1c06, emissiveIntensity: 0.6 });
  const radT = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#2c2e33'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 2, 0, 1, h); } }, { repeat: true });
  radT.repeat.set(6, 1);
  const radM = new THREE.MeshStandardMaterial({ color: 0xd0d4da, map: radT, roughness: 0.4, metalness: 0.55, emissive: 0x401206, emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const metalD = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.45, metalness: 0.75 });

  // ---- command module (bow): drum, window band of the bridge, nose; docking port on the starboard (+x) side ----
  add(new THREE.CylinderGeometry(9, 9, 24, 40), hull, 0, 0, 88, alongZ);
  add(new THREE.CylinderGeometry(4, 9, 12, 40), hull, 0, 0, 106, alongZ);
  add(new THREE.SphereGeometry(4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hull, 0, 0, 112, alongZ);
  add(new THREE.CylinderGeometry(9.06, 9.06, 1.4, 40, 1, true), win, 0, 0, 98.6, alongZ);
  add(new THREE.CylinderGeometry(9.5, 9.5, 1.2, 40), band, 0, 0, 77, alongZ);
  add(new THREE.CylinderGeometry(2.8, 3.2, 4.4, 20), hull, 11, 0, 79, 0, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(2.9, 0.35, 8, 24), dark, 13.2, 0, 79, 0, Math.PI / 2, 0);
  for (const a of [0.6, 2.2, 3.6, 5.0]) add(new THREE.BoxGeometry(1.2, 2.4, 3.2), dark, Math.cos(a) * 9.3, Math.sin(a) * 9.3, 84, 0, 0, a);   // RCS quads
  const name = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshStandardMaterial({ map: nameTex(), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  name.position.set(9.12, 0, 92); name.rotation.y = Math.PI / 2; body.add(name);
  // ---- habitat stack: decks across the thrust axis, a ring of portholes for each ----
  add(new THREE.CylinderGeometry(13, 13, 40, 48), hull, 0, 0, 52, alongZ);
  add(new THREE.CylinderGeometry(9, 13, 4, 48), hull, 0, 0, 74, alongZ);
  for (const z of [33, 45, 59, 71]) add(new THREE.CylinderGeometry(13.25, 13.25, 0.9, 48), band, 0, 0, z, alongZ);
  for (const a of [0.4, 2.5, 4.6]) { add(new THREE.BoxGeometry(2.2, 1.6, 36), metalD, Math.cos(a) * 13.6, Math.sin(a) * 13.6, 52, 0, 0, a); }   // conduits and ladders up the outside
  // ---- seed vault: a hexagonal, foil-wrapped cold store, the reason she exists ----
  add(new THREE.CylinderGeometry(11, 11, 14, 6), mli, 0, 0, 23, alongZ);
  add(new THREE.CylinderGeometry(11.6, 11.6, 1, 6), dark, 0, 0, 30.5, alongZ); add(new THREE.CylinderGeometry(11.6, 11.6, 1, 6), dark, 0, 0, 15.5, alongZ);
  // ---- spine: a triangular lattice truss from the vault to the shadow shield ----
  { const parts = [], L = 66, z0 = -52, R0 = 4.2;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; parts.push(new THREE.CylinderGeometry(0.45, 0.45, L, 6).rotateX(alongZ).translate(Math.cos(a) * R0, Math.sin(a) * R0, z0 + L / 2)); }
    for (let z = z0; z < z0 + L; z += 6) for (let i = 0; i < 3; i++) {
      const a0 = i * Math.PI * 2 / 3, a1 = a0 + Math.PI * 2 / 3, p0 = new THREE.Vector3(Math.cos(a0) * R0, Math.sin(a0) * R0, z), p1 = new THREE.Vector3(Math.cos(a1) * R0, Math.sin(a1) * R0, z + 6);
      const d = p1.clone().sub(p0), g = new THREE.CylinderGeometry(0.22, 0.22, d.length(), 5); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2); parts.push(g);
    }
    const m = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), dark); body.add(m);
    add(new THREE.CylinderGeometry(1.4, 1.4, L, 8), metalD, 0, 0, z0 + L / 2, alongZ); }   // the main feed line down the middle
  // ---- propellant: four foil-wrapped capsule tanks round the spine ----
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    add(new THREE.CapsuleGeometry(5.6, 24, 8, 24), i % 2 ? tank : mli, Math.cos(a) * 9.6, Math.sin(a) * 9.6, -2, alongZ);
    for (const z of [-10, 6]) add(new THREE.CylinderGeometry(5.75, 5.75, 0.8, 24), band, Math.cos(a) * 9.6, Math.sin(a) * 9.6, z, alongZ);
  }
  // ---- radiators: four long panels in an X, dumping the drive's waste heat; feed manifolds along their roots ----
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);                 // between the tanks, not through them
    const panel = add(new THREE.PlaneGeometry(40, 42), radM, ca * 26, sa * 26, -30, 0, 0, 0);
    panel.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(ca, sa, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(sa, -ca, 0)));   // width out along the arm, length along the spine
    add(new THREE.BoxGeometry(1.4, 1.4, 42), metalD, ca * 6.4, sa * 6.4, -30);
    add(new THREE.BoxGeometry(0.8, 0.8, 42), metalD, ca * 46, sa * 46, -30);
    for (const z of [-50, -10]) { const g = new THREE.BoxGeometry(40, 0.6, 0.6); const m = add(g, metalD, ca * 26, sa * 26, z, 0, 0, a); void m; }
  }
  // ---- shadow shield and drive: a cone that keeps the drive's radiation off everything forward, the block, three bells, a field coil ----
  add(new THREE.CylinderGeometry(7, 16, 8, 40), dark, 0, 0, -56, alongZ);
  add(new THREE.CylinderGeometry(12, 13, 24, 40), hull, 0, 0, -72, alongZ);
  for (const z of [-62, -82]) add(new THREE.CylinderGeometry(13.3, 13.3, 1, 40), band, 0, 0, z, alongZ);
  add(new THREE.TorusGeometry(11, 1.2, 12, 48), metalD, 0, 0, -91);
  const bells = [];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + Math.PI / 2;
    const b = add(new THREE.CylinderGeometry(2.8, 6.8, 13, 24, 1, true), dark, Math.cos(a) * 6.5, Math.sin(a) * 6.5, -90, -alongZ);
    b.material = dark.clone(); b.material.side = THREE.DoubleSide; b.material.emissive = new THREE.Color(0x9fc8ff); b.material.emissiveIntensity = 0; bells.push(b);
  }
  body.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });

  // beacons: amber running lights, red/green at the radiator tips, white strobes fore and aft, green round the port
  const B = [];
  const beacon = (x, y, z, c, size, rate, phase) => B.push({ p: [x, y, z], c, size, rate, phase });
  for (let z = -60; z <= 72; z += 22) beacon(0, 3.6, z, [1, 0.72, 0.35], 3, 0, 0);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; beacon(Math.cos(a) * 46.5, Math.sin(a) * 46.5, -9, i < 2 ? [0.2, 1, 0.35] : [1, 0.16, 0.1], 5, 0, 0); }
  beacon(0, 0, 117, [1, 1, 1], 7, 1.1, 0); beacon(0, 14, -76, [1, 1, 1], 7, 1.1, 0.5);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; beacon(13.6, Math.cos(a) * 3.6, 79 + Math.sin(a) * 3.6, [0.3, 1, 0.5], 3.5, 0.8, i / 6); }
  { const R3 = mulberry(77); for (let z = 36; z <= 68; z += 4) for (let i = 0; i < 28; i++) { if (R3() < 0.45) continue; const a = i * Math.PI * 2 / 28; beacon(Math.cos(a) * 13.15, Math.sin(a) * 13.15, z, R3() < 0.85 ? [1, 0.78, 0.5] : [0.75, 0.88, 1], 1.6, 0, 0); } }   // a porthole for each deck
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(B.flatMap((b) => b.p), 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(B.flatMap((b) => b.c), 3));
  bg.setAttribute('aSize', new THREE.Float32BufferAttribute(B.map((b) => b.size), 1));
  bg.setAttribute('aRate', new THREE.Float32BufferAttribute(B.map((b) => b.rate), 1));
  bg.setAttribute('aPhase', new THREE.Float32BufferAttribute(B.map((b) => b.phase), 1));
  const beaconMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uDock: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute float aSize, aRate, aPhase; uniform float uT, uPx; varying vec3 vC; varying float vA;
      void main(){ vC = color; float on = aRate > 0.0 ? step(0.82, fract(uT * aRate + aPhase)) : 1.0;
        vA = on; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPx * (0.6 + 0.4 * on); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q);
      float a = (smoothstep(0.5, 0.0, d) * 0.6 + smoothstep(0.18, 0.0, d)) * max(vA, 0.08); gl_FragColor = vec4(vC * a, a); }`,
  });
  const beacons = new THREE.Points(bg, beaconMat); beacons.frustumCulled = false; hull0.add(beacons);

  // the drive: a plume of fusion exhaust and a glare you can see from a hundred kilometres
  const plumeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uK: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uK, uT; void main(){
      float along = 1.0 - vUv.y;                             // 1 at the bells, 0 at the far end
      float core = pow(along, 2.2) * (0.85 + 0.15 * sin(uT * 40.0 + vUv.x * 30.0));
      vec3 c = mix(vec3(0.35, 0.55, 1.0), vec3(0.95, 0.97, 1.0), pow(along, 3.0));
      gl_FragColor = vec4(c * core * uK, core * uK); }`,
  });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(9, 120, 24, 1, true), plumeMat);
  plume.position.z = -160; plume.rotation.x = -Math.PI / 2; plume.visible = false; body.add(plume);
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xbcd8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false }));
  glare.position.z = -100; glare.scale.setScalar(0.0); hull0.add(glare);
  const dockGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0x6dff9a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  dockGlow.position.set(14, 0, 79); dockGlow.scale.setScalar(16); hull0.add(dockGlow);

  let burn = 0;
  // rootScale: how far the ship is shrunk to be drawn nearer than she is (screen-space glows must not shrink with her)
  function update(dt, t, pxScale = 1, rootScale = 1) {
    beaconMat.uniforms.uT.value = t; beaconMat.uniforms.uPx.value = pxScale;
    plumeMat.uniforms.uT.value = t; plumeMat.uniforms.uK.value = burn;
    plume.visible = burn > 0.01; plume.scale.set(0.7 + 0.5 * burn, 0.5 + 0.8 * burn, 0.7 + 0.5 * burn);
    glare.scale.setScalar(0.1 * burn * (0.95 + 0.05 * Math.sin(t * 31)) / (rootScale * SCALE));
    glare.material.opacity = Math.min(1, burn * 1.4);
    bells.forEach((b) => (b.material.emissiveIntensity = burn * 2.5));
  }
  return {
    root, update,
    airlock: new THREE.Vector3(14.2, 0, 79).multiplyScalar(SCALE), airlockN: new THREE.Vector3(1, 0, 0),
    setBurn(k) { burn = k; },
    setDock(k) { dockGlow.material.opacity = k; },
    get burn() { return burn; },
  };
}
