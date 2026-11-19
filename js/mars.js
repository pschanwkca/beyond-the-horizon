// Beyond the Horizon · Mars: out of the airlock, entry, the flight down to Lyra's relay station, and the reunion.
// Physics: g = 3.71 m/s² (0.38 g); air ~1% of Earth's (ρ0 ≈ 0.020 kg/m³, scale height ≈ 11.1 km);
// from a 400 km orbit you come in at ~3.4 km/s, about Mach 14 in the thin CO2 (sound ≈ 240 m/s).
// The plasma shield carries the Sutton–Graves heating the same way it did on Earth.
import * as THREE from 'three';
import { createPlayer } from './player.js';
import { SKY_FRAG, MARS_VERT, MARS_FRAG } from './voyage.js';
import { canvasTex, clamp, damp, dampAngle, smooth, lerp, mulberry, fbm, GLSL_NOISE } from './util.js';
import { input, consume } from './input.js';
import { createExplore } from './explore.js';
import { rockField, pebbleField, safeBump } from './rock.js';
import { makeEnv } from './env.js';

export const G_MARS = 3.71, RHO0 = 0.020, HS = 11100, R_KM = 3389.5;
export const vmaxMars = (h) => Math.min(3400, 150 * Math.exp(Math.max(0, h) / 3800));
export const rhoMars = (h) => RHO0 * Math.exp(-Math.max(0, h) / HS);
const SUN = (() => { const el = 26 * Math.PI / 180, az = 130 * Math.PI / 180; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize(); })();
const PAD = new THREE.Vector3(-46, 0, 30), DOOR = new THREE.Vector3(-12.5, 0, 12.5);
const START = new THREE.Vector3(-12000, 9000, 16000);

// ---------------- the ground ----------------
const CRATERS = [[-5200, -7400, 2600], [9800, 4200, 1400], [2600, -2600, 380], [-1900, 3300, 260], [14000, -15000, 5200], [-15000, 8000, 3000], [600, 1500, 120], [-900, -700, 90]];
const hash2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
export function groundH(x, z) {
  let h = (fbm(x / 5200 + 11.3, z / 5200 + 4.1, 4) - 0.5) * 260 + (fbm(x / 420, z / 420, 3) - 0.5) * 14;
  // a scatter of small craters: one cell in three has one, 60–260 m across
  const C = 900, ci = Math.floor(x / C), cj = Math.floor(z / C);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = ci + di, j = cj + dj, hh = hash2(i, j); if (hh > 0.36) continue;
    const r = 30 + hash2(j, i) * 100, cx = (i + 0.2 + 0.6 * hash2(i + 7, j)) * C, cz = (j + 0.2 + 0.6 * hash2(i, j + 7)) * C;
    const d = Math.hypot(x - cx, z - cz) / r; if (d > 2) continue;
    h += Math.exp(-(((d - 1) / 0.22) ** 2)) * r * 0.12 - (d < 1 ? (1 - d * d) * r * 0.22 : 0);
  }
  for (const [cx, cz, r] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz) / r; if (d > 2.2) continue;
    h += Math.exp(-(((d - 1) / 0.2) ** 2)) * r * 0.07 - (d < 1 ? (1 - d * d) * r * 0.16 : 0);
  }
  if (z < -16000) h += 900 * smooth(-16000, -21000, z) * (0.65 + 0.7 * fbm(x / 2600, 7.7, 3));   // a mesa scarp: the northern skyline
  { const d = Math.hypot(x - 260, z - 220) / 42; if (d < 2) h += Math.exp(-(((d - 1) / 0.22) ** 2)) * 3.2 - (d < 1 ? (1 - d * d) * 6.5 : 0); }   // the frost crater
  const r = Math.hypot(x, z);
  return h * smooth(220, 700, r) + (r < 700 ? 0 : 0);           // the station sits on a levelled patch
}

function detailTex() {
  return canvasTex(512, 512, (g, w) => {
    const R = mulberry(9);
    const img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const n = 0.55 * fbm(x / 36, y / 36, 4) + 0.3 * fbm(x / 9 + 50, y / 9, 2) + 0.15 * R();
      const v = Math.round(150 + n * 105); const i = (y * w + x) * 4;
      img.data[i] = v; img.data[i + 1] = Math.round(v * 0.97); img.data[i + 2] = Math.round(v * 0.94); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(40,25,18,${0.08 + R() * 0.14})`; g.beginPath(); g.arc(R() * w, R() * w, 1 + R() * 3, 0, Math.PI * 2); g.fill(); }   // pebbles
  }, { repeat: true });
}
function buildGround() {
  const RINGS = 260, SEG = 192, pos = [], col = [], uv = [], idx = [];
  const radii = [0]; for (let i = 1; i <= RINGS; i++) radii.push(3 * Math.pow(1.0455, i - 1));
  const c = new THREE.Color();
  for (let i = 0; i <= RINGS; i++) {
    const r = radii[i], n = i === 0 ? 1 : SEG;
    for (let j = 0; j < n; j++) {
      const a = j / SEG * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, h = groundH(x, z);
      pos.push(x, h, z); uv.push(x / 26, z / 26);
      // albedo: bright dust, dark basaltic sand, a darker crater floor
      const dark = smooth(0.56, 0.3, fbm(x / 2600 + 3, z / 2600 - 2, 4)) * 0.55, dust = (fbm(x / 700, z / 700 + 9, 3) - 0.5) * 0.06;
      const rr = lerp(0.74, 0.5, dark) + dust, gg = lerp(0.53, 0.35, dark) + dust * 0.75, bb = lerp(0.37, 0.25, dark) + dust * 0.5;
      const lo = smooth(-10, -120, h) * 0.18;
      c.setRGB(rr * (1 - lo), gg * (1 - lo), bb * (1 - lo), THREE.SRGBColorSpace); col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
  for (let i = 1; i < RINGS; i++) {
    const a0 = 1 + (i - 1) * SEG, b0 = 1 + i * SEG;
    for (let j = 0; j < SEG; j++) { const j1 = (j + 1) % SEG; idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const MSKY_FRAG = `
uniform vec3 uSun; uniform float uK;
varying vec3 vD;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vD); float el = d.y;
  // butterscotch by day: dust, not air, colours the Martian sky; darker the higher you are
  vec3 zen = vec3(0.40, 0.28, 0.20), hor = vec3(0.84, 0.65, 0.48);
  vec3 col = mix(hor, zen, pow(clamp(el, 0.0, 1.0), 0.5));
  col *= mix(0.03, 1.0, uK);
  float sa = acos(clamp(dot(d, uSun), -1.0, 1.0));
  col += vec3(0.6, 0.72, 0.92) * exp(-sa / 0.14) * 0.32 * uK;          // the blue glow round the Sun (dust scatters blue forward)
  col += vec3(1.0, 0.97, 0.92) * (smoothstep(0.0042, 0.0031, sa) * 30.0 + exp(-sa / 0.012) * 1.1);
  vec3 sp = d * 300.0; vec3 sc = floor(sp);
  col += step(0.9975, h13(sc)) * (1.0 - uK) * 0.9 * smoothstep(-0.05, 0.1, el);
  if (el < 0.0) col = mix(col, hor * mix(0.03, 0.8, uK), smoothstep(0.0, -0.08, el));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createMars(renderer, ctx) {
  const { ui, audio, G, fl } = ctx;
  const $ = (id) => document.getElementById(id);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);

  // ======================= entry (planet scale) =======================
  const gFar = new THREE.Scene(), gNear = new THREE.Scene();
  const gCamFar = new THREE.PerspectiveCamera(60, 1, 0.5, 30000), gCamNear = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: SUN.clone() }, uBH: { value: new THREE.Vector3(0, -1, 0) }, uDebris: { value: new THREE.Vector3(0, -1, 0) }, uMars: { value: new THREE.Vector3(0, -1, 0) }, uMarsPt: { value: 0 }, uSunK: { value: 1 }, uDebrisK: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }', fragmentShader: SKY_FRAG }));
  sky.frustumCulled = false; gFar.add(sky);
  const marsMap = new THREE.TextureLoader().load(new URL('../tex/mars.jpg', import.meta.url).href); marsMap.colorSpace = THREE.SRGBColorSpace; marsMap.anisotropy = 8;
  const globeMat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: marsMap }, uSun: { value: SUN.clone() }, uCam: { value: new THREE.Vector3() }, uDetail: { value: 1 } }, vertexShader: MARS_VERT, fragmentShader: MARS_FRAG });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(R_KM, 192, 96), globeMat); globe.position.set(0, -R_KM, 0); globe.rotation.set(0.35, 1.25, 0); gFar.add(globe);
  const haze = new THREE.Mesh(new THREE.SphereGeometry(R_KM + 45, 128, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, uniforms: { uSun: { value: SUN.clone() } },
    vertexShader: 'varying vec3 vWN, vW; void main(){ vWN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vWN, vW; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(vWN, v)), 4.0);
      float lit = smoothstep(-0.2, 0.3, dot(-vWN, uSun)); gl_FragColor = vec4(vec3(0.95, 0.62, 0.42) * f * lit * 0.8, 1.0); }`,
  })); haze.position.copy(globe.position); gFar.add(haze);
  gNear.add(new THREE.HemisphereLight(0xffd9b8, 0x3a2418, 0.7));
  const gSun = new THREE.DirectionalLight(0xfff2e6, 2.6); gSun.position.copy(SUN).multiplyScalar(30); gNear.add(gSun, gSun.target);
  const entryHero = createPlayer(gNear, { noShadow: true }); entryHero.setSuit(true); entryHero.setRocket(true); entryHero.heal();

  // ======================= the surface (metres) =======================
  const ms = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(62, 1, 0.1, 200000);
  const mskyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: SUN.clone() }, uK: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }', fragmentShader: MSKY_FRAG });
  const msky = new THREE.Mesh(new THREE.SphereGeometry(150000, 48, 24), mskyMat); msky.frustumCulled = false; msky.renderOrder = -10; ms.add(msky);
  ms.fog = new THREE.FogExp2(0xc89a74, 0.00004);
  const hemi = new THREE.HemisphereLight(0xe8b88a, 0x4a2c1c, 0.75); ms.add(hemi);
  // what metal and visors reflect: butterscotch sky, rust ground, the small white sun
  ms.environment = makeEnv(renderer, { zenith: 0x6a4a36, horizon: 0xd9a57a, ground: 0x5a3422, sun: SUN, sunK: 1, gain: 0.85 });
  const sun = new THREE.DirectionalLight(0xfff1e2, 2.8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 800 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  ms.add(sun, sun.target);
  const gTex = detailTex();
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: gTex, bumpMap: gTex, bumpScale: 3.5, roughness: 0.96, metalness: 0 });
  // two more scales of the same texture: fine grit under your boots, and broad blotches so the tiling never shows
  groundMat.onBeforeCompile = (sh) => {
    safeBump(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 fine = texture2D(map, vMapUv * 6.73 + 0.31).rgb, broad = texture2D(map, vMapUv * 0.087).rgb;
      diffuseColor.rgb *= mix(1.0, fine.r * 1.45, 0.45) * (0.72 + broad.g * 0.5);`);
  };
  const ground = new THREE.Mesh(buildGround(), groundMat);
  ground.receiveShadow = true; ms.add(ground);

  // rocks: dark basalt, more of them near the station; pebbles underfoot wherever you walk
  rockField(ms, (R) => {
    const r = 30 + Math.pow(R(), 1.8) * 1800, a = R() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - PAD.x, z - PAD.z) < 24 || Math.hypot(x, z) < 40) return null;
    const sz = 0.15 + Math.pow(R(), 4) * 2.4; return { x, y: groundH(x, z) + sz * 0.12, z, s: sz };
  }, { count: 1100, kinds: 5, seed: 31, color: 0x553628, dust: 0xb27b52, detail: 2 });
  const pebbles = pebbleField(ms, groundH, { per: 95, skip: (x, z) => Math.hypot(x - PAD.x, z - PAD.z) < 15.5 || Math.hypot(x, z) < 18.5 || Math.hypot(x - 34, z + 10) < 12.5 });

  // ---------------- Lyra's relay station ----------------
  const st = new THREE.Group(); ms.add(st);
  // station hull: panelled, rivet lines, red dust banked against the lower half and blown into every seam
  const hullT = canvasTex(512, 512, (g, w, h) => { const R = mulberry(61);
    g.fillStyle = '#ddd8ce'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.05})`; g.fillRect((R() * 4 | 0) * 128, (R() * 4 | 0) * 128, 128, 128 * (1 + (R() * 2 | 0))); }
    g.strokeStyle = 'rgba(60,50,40,0.45)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
    g.fillStyle = 'rgba(60,50,40,0.5)'; for (let i = 0; i <= 4; i++) for (let k = 4; k < w; k += 16) { g.fillRect(i * 128 - 5, k, 2, 2); g.fillRect(k, i * 128 - 5, 2, 2); }
    const gr = g.createLinearGradient(0, h, 0, h * 0.35); gr.addColorStop(0, 'rgba(168,92,52,0.75)'); gr.addColorStop(1, 'rgba(168,92,52,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(160,86,48,${R() * 0.25})`; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2); }
  }, { repeat: true });
  const hull = new THREE.MeshStandardMaterial({ color: 0xffffff, map: hullT, bumpMap: hullT, bumpScale: 0.6, roughness: 0.6, metalness: 0.12 }); hull.onBeforeCompile = safeBump;
  const darkM = new THREE.MeshStandardMaterial({ color: 0x2d2e33, roughness: 0.6, metalness: 0.5 });
  const rust = new THREE.MeshStandardMaterial({ color: 0xb4572e, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.5, depthWrite: false });
  const warmGlow = new THREE.MeshBasicMaterial({ color: 0xffc27a });
  const colliders = [];   // circles {x, z, r}
  const put = (geo, mat, x, y, z, parent = st) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  function dome(x, z, r) {
    put(new THREE.CylinderGeometry(r + 0.6, r + 0.9, 1.4, 48), hull, x, 0.7, z);
    const d = put(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, x, 1.4, z); d.castShadow = false;
    // the frame: real struts (thin tubes along every edge of a geodesic-ish grid), not hairlines
    { const eg = new THREE.EdgesGeometry(new THREE.SphereGeometry(r + 0.06, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2), 1), ep = eg.attributes.position, n = ep.count / 2;
      const strut = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), new THREE.MeshStandardMaterial({ color: 0x8e8b86, roughness: 0.5, metalness: 0.6 }), n);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
      for (let i = 0; i < n; i++) { a.fromBufferAttribute(ep, i * 2); b.fromBufferAttribute(ep, i * 2 + 1); const L = a.distanceTo(b); q.setFromUnitVectors(up, b.clone().sub(a).normalize()); m4.compose(a.clone().add(b).multiplyScalar(0.5), q, sc.set(1, L, 1)); strut.setMatrixAt(i, m4); }
      strut.position.set(x, 1.4, z); strut.castShadow = true; st.add(strut); }
    // inside: a greenhouse, rows of planters under magenta grow lights, warm work lights
    const l = new THREE.PointLight(0xffc68a, r * 12, r * 3, 2); l.position.set(x, r * 0.55, z); st.add(l);
    const R = mulberry(Math.round(r * 7)), rows = Math.floor(r / 3.2), leafG = new THREE.IcosahedronGeometry(1, 1);
    const leafM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), plM = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.6 });
    const leaves = new THREE.InstancedMesh(leafG, leafM, rows * 2 * 60), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), c = new THREE.Color(); let li = 0;
    for (let i = 0; i < rows; i++) {
      const zz = (i - (rows - 1) / 2) * 3.2, half = Math.sqrt(Math.max(0, (r * 0.82) ** 2 - zz * zz)); if (half < 2) continue;
      for (const side of [-0.55, 0.55]) {
        const pl = put(new THREE.BoxGeometry(half * 2 - 1, 0.7, 1.0), plM, x, 1.75, z + zz + side * 1.2); pl.castShadow = false;
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(half * 2 - 1.4, 0.06, 0.25), new THREE.MeshBasicMaterial({ color: 0xff5cd2 })); lamp.position.set(x, 3.6, z + zz + side * 1.2); st.add(lamp);
        for (let k = 0; k < 60 && li < leaves.count; k++) {
          const s = 0.18 + R() * 0.22; p3.set(x + (R() - 0.5) * (half * 2 - 1.4), 2.1 + s * 0.5, z + zz + side * 1.2 + (R() - 0.5) * 0.7);
          q.setFromEuler(new THREE.Euler(R(), R() * 6, R())); leaves.setMatrixAt(li, m4.compose(p3, q, sc.set(s, s * 0.7, s)));
          leaves.setColorAt(li, c.setHSL(0.24 + R() * 0.1, 0.55, 0.22 + R() * 0.18)); li++;
        }
      }
    }
    leaves.count = li; st.add(leaves);
    const grow = new THREE.PointLight(0xff6ad8, r * 4, r * 2, 2); grow.position.set(x, 3.2, z); st.add(grow);
    colliders.push({ x, z, r: r + 0.9 });
  }
  dome(0, 0, 17); dome(34, -10, 11);
  put(new THREE.CylinderGeometry(2.3, 2.3, 10, 20), hull, 19.85, 2.6, -5.84).rotation.set(0, 0.286, Math.PI / 2);   // the tube between the domes
  // airlock on the main dome, facing the pad
  // a pressurised lock: a rounded hull on a plinth, a framed hatch with a porthole, a status light, handrails, stencils
  { const g = new THREE.Group(); g.position.set(DOOR.x - 2.6, 0, DOOR.z + 2.6); g.rotation.y = Math.PI / 4; st.add(g);
    const P = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    P(new THREE.BoxGeometry(5.4, 0.5, 5.4), darkM, 0, 0.25, 0);
    P(new THREE.CapsuleGeometry(2.25, 1.0, 8, 24), hull, 0, 2.6, 0, 0, 0, Math.PI / 2).scale.set(1, 1.05, 1.05);
    P(new THREE.CylinderGeometry(2.3, 2.3, 0.18, 32), rust, 1.4, 2.6, 0, 0, 0, Math.PI / 2); P(new THREE.CylinderGeometry(2.3, 2.3, 0.18, 32), rust, -1.4, 2.6, 0, 0, 0, Math.PI / 2);
    // hatch: frame, door, porthole, wheel
    P(new THREE.BoxGeometry(2.0, 2.9, 0.3), darkM, 0, 1.95, 2.28);
    P(new THREE.BoxGeometry(1.6, 2.5, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.45, metalness: 0.6 }), 0, 1.9, 2.46);
    P(new THREE.TorusGeometry(0.26, 0.05, 8, 24), darkM, 0, 2.55, 2.53);
    P(new THREE.CircleGeometry(0.24, 24), new THREE.MeshStandardMaterial({ color: 0x241c14, emissive: 0xffb070, emissiveIntensity: 0.7, roughness: 0.1 }), 0, 2.55, 2.525);
    P(new THREE.TorusGeometry(0.2, 0.025, 6, 20), darkM, 0, 1.75, 2.54);
    for (const x of [-1.15, 1.15]) P(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0xd8a830, roughness: 0.4, metalness: 0.6 }), x, 1.8, 2.5);
    const lamp = P(new THREE.BoxGeometry(1.2, 0.12, 0.16), warmGlow, 0, 3.45, 2.4);
    const stat = P(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5aff8a }), 0.78, 3.25, 2.42);
    const sten = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: canvasTex(512, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(40,36,32,0.85)'; c.font = '600 54px "Noto Sans TC", system-ui'; c.textAlign = 'center'; c.fillText('氣閘 A · AIRLOCK', w / 2, 82); }), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    sten.position.set(0, 3.95, 2.31); g.add(sten);
    void lamp; void stat; }
  colliders.push({ x: DOOR.x - 2.6, z: DOOR.z + 2.6, r: 3.6 });
  // modules
  for (const [x, z, ry] of [[22, 22, 0.3], [28, 30, 0.3], [-26, -18, -0.5]]) { const m = put(new THREE.CapsuleGeometry(3, 10, 6, 16), hull, x, 3.2, z); m.rotation.set(0, ry, Math.PI / 2); put(new THREE.BoxGeometry(14, 0.3, 0.3), rust, x, 3.2 + 2.6, z).rotation.y = ry; colliders.push({ x, z, r: 6.5 }); }
  // the relay: a lattice mast and a dish pointed at the sky — Lyra's job, humanity's line between worlds
  const RX = 30, RZ = 8;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const leg = put(new THREE.CylinderGeometry(0.18, 0.25, 46, 6), darkM, RX + Math.cos(a) * 1.6, 23, RZ + Math.sin(a) * 1.6); leg.rotation.set(Math.sin(a) * 0.03, 0, -Math.cos(a) * 0.03); }
  for (let y = 4; y < 46; y += 4) { const ring = put(new THREE.TorusGeometry(1.6 * (1 - y / 140), 0.08, 4, 4), darkM, RX, y, RZ); ring.rotation.set(Math.PI / 2, 0, Math.PI / 4); }
  const dish = put(new THREE.SphereGeometry(7, 32, 12, 0, Math.PI * 2, 0, 0.55), new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }), RX, 47, RZ);
  dish.rotation.set(-2.3, 0.4, 0);
  put(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), darkM, RX, 47, RZ).rotation.copy(dish.rotation);
  const beacon = put(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }), RX, 47.5, RZ); beacon.castShadow = false;
  colliders.push({ x: RX, z: RZ, r: 2.6 });
  // solar field
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { const p = put(new THREE.BoxGeometry(8, 0.15, 3.6), new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.25, metalness: 0.6 }), 52 + i * 10, 1.8, 30 + j * 6); p.rotation.x = -0.45; put(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 6), darkM, 52 + i * 10, 0.9, 30 + j * 6); }
  // landing pad with edge lights
  const padM = new THREE.Mesh(new THREE.CylinderGeometry(14, 14.6, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0x8b8682, roughness: 0.85 })); padM.position.set(PAD.x, 0.25, PAD.z); padM.receiveShadow = true; st.add(padM);
  const ringM = new THREE.Mesh(new THREE.RingGeometry(8.6, 9.4, 64), new THREE.MeshBasicMaterial({ color: 0xffc27a })); ringM.rotation.x = -Math.PI / 2; ringM.position.set(PAD.x, 0.52, PAD.z); st.add(ringM);
  const padLights = [];
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060 })); b.position.set(PAD.x + Math.cos(a) * 13.8, 0.6, PAD.z + Math.sin(a) * 13.8); st.add(b); padLights.push(b); }
  // a rover parked by the pad
  { const rv = new THREE.Group(); rv.position.set(PAD.x + 22, 0, PAD.z - 6); rv.rotation.y = 0.7; st.add(rv);
    const R2 = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = o.receiveShadow = true; rv.add(o); return o; };
    // a pressurised cab on a long chassis: rounded cabin, window band, roof rack, mesh wheels on rocker arms
    R2(new THREE.BoxGeometry(5.0, 0.35, 2.3), darkM, 0, 1.0, 0);
    R2(new THREE.CapsuleGeometry(1.05, 2.6, 6, 18), hull, 0.3, 1.95, 0, 0, 0, Math.PI / 2).scale.set(1, 1, 1.05);
    R2(new THREE.CylinderGeometry(1.07, 1.07, 2.0, 18, 1, true, -0.55, 1.1), new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.05, metalness: 0.6 }), 0.5, 2.1, 0, 0, 0, Math.PI / 2);
    R2(new THREE.BoxGeometry(2.4, 0.08, 1.6), darkM, -0.3, 3.05, 0);
    for (const x of [-1.2, 0, 1.2]) R2(new THREE.BoxGeometry(0.06, 0.2, 1.6), darkM, -0.3 + x, 3.15, 0);
    R2(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), darkM, -1.6, 3.6, 0.6); R2(new THREE.SphereGeometry(0.35, 14, 6, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }), -1.6, 4.3, 0.6, -0.6, 0, 0);
    const meshT = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#3a3c40'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8e9298'; c.lineWidth = 3; for (let i = -w; i < w * 2; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); c.beginPath(); c.moveTo(i, h); c.lineTo(i + h, 0); c.stroke(); } }, { repeat: true });
    const tyreM = new THREE.MeshStandardMaterial({ color: 0xffffff, map: meshT, roughness: 0.6, metalness: 0.6 });
    for (const sx of [-1.7, 0, 1.7]) for (const sz of [-1.45, 1.45]) {
      R2(new THREE.CylinderGeometry(0.6, 0.6, 0.45, 20), tyreM, sx, 0.6, sz, Math.PI / 2);
      R2(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12), darkM, sx, 0.6, sz, Math.PI / 2);
      R2(new THREE.BoxGeometry(0.14, 0.5, 0.14), darkM, sx, 0.85, sz * 0.82, 0.3 * Math.sign(sz));
    }
    colliders.push({ x: rv.position.x, z: rv.position.z, r: 2.8 }); }

  // dust devils far out on the plain
  const devils = [];
  const devilMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `${GLSL_NOISE} uniform float uT; varying vec2 vUv; void main(){
      float n = fbm3(vec3(vUv.x * 6.0 + vUv.y * 4.0 - uT * 1.4, vUv.y * 5.0, uT * 0.2));
      float a = smoothstep(0.35, 0.75, n) * (1.0 - vUv.y) * smoothstep(0.0, 0.06, vUv.y) * 0.32;
      gl_FragColor = vec4(vec3(0.78, 0.6, 0.44), a); }` });
  for (const [x, z, h, r] of [[-3600, 5200, 700, 50], [4200, 6800, 520, 36], [-8200, -2600, 900, 70]]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.6, r, h, 24, 8, true), devilMat); d.position.set(x, groundH(x, z) + h / 2, z); ms.add(d); devils.push({ m: d, x, z, h, a: Math.random() * 6 });
  }

  // ---------------- people ----------------
  const hero = createPlayer(ms, {}); hero.setSuit(true); hero.setRocket(true); hero.heal();
  hero.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const lyra = createPlayer(ms, { stubble: false }); lyra.setSuit(true); lyra.heal(); lyra.root.scale.setScalar(0.94);
  lyra.st.lookAround = 0.2;   // she keeps her eyes on him
  // Lyra's suit: Mars colony issue — terracotta and cream, a teal stripe
  { const seen = new Set(); lyra.root.traverse((o) => { if (!o.isMesh || seen.has(o.material)) return; seen.add(o.material); const hx = o.material.color && o.material.color.getHex();
      if (hx === 0xc4cad2) o.material.color.set(0xe2d6c2); else if (hx === 0x6d7076) o.material.color.set(0xa24e2c); else if (hx === 0xc6702e) o.material.color.set(0x2fa3a8); o.castShadow = true; });
    // terracotta torso and legs, cream arms and helmet: she reads as herself from across the plain
    const r = lyra.rig, cream = r.hips.children[0].material, terra = cream.clone(); terra.color.set(0xa8573a);
    r.hips.children[0].material = r.hips.children[1].material = terra;
    [r.legL, r.legR].forEach((l) => { l.th.children[0].material = l.sh.children[0].material = l.sh.children[3].material = terra; }); }
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.04), new THREE.MeshBasicMaterial({ color: 0x8ef0ff })); chip.visible = false; ms.add(chip);
  const chipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x8ef0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, map: canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, { srgb: false }) }));
  chipGlow.scale.setScalar(0.25); chip.add(chipGlow);
  // dust in the air round you, for speed
  const MN = 500, mPos = new Float32Array(MN * 3);
  for (let i = 0; i < MN; i++) { mPos[i * 3] = (Math.random() - 0.5) * 80; mPos[i * 3 + 1] = (Math.random() - 0.5) * 80; mPos[i * 3 + 2] = (Math.random() - 0.5) * 80; }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  // dust motes: round, soft, never bigger than a few pixels, and faded out right in front of the lens (no blobs on the camera)
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { opacity: { value: 0.7 }, uScale: { value: 500 } },
    vertexShader: 'uniform float uScale; varying float vF; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); float d = -mv.z; gl_PointSize = clamp(0.05 * uScale / max(d, 0.01), 0.0, 5.0); vF = smoothstep(1.2, 3.0, d) * (1.0 - smoothstep(25.0, 40.0, d)); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform float opacity; varying float vF; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)) * vF * opacity; gl_FragColor = vec4(vec3(0.85, 0.69, 0.54), a); }' }));
  motes.material.opacity = 0.7; Object.defineProperty(motes.material, 'opacity', { get() { return this.uniforms.opacity.value; }, set(v) { if (this.uniforms) this.uniforms.opacity.value = v; } });
  motes.frustumCulled = false; ms.add(motes);
  // the swarm's first sign: sand bursting up out on the plain
  const bursts = [];
  const burstTex = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, { srgb: false });
  function burst(x, z) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex, color: 0xb9875e, transparent: true, depthWrite: false, opacity: 0 })); s.position.set(x, groundH(x, z) + 4, z); ms.add(s); bursts.push({ s, t: 0 }); }

  // ---------------- state ----------------
  const M = { on: false, phase: '', t: 0, beats: {}, camYaw: 0, camPitch: 0.15, camDist: 4.2, lyraP: new THREE.Vector3(), lyraYaw: 0, alarm: 0 };
  const beat = (k) => (M.beats[k] ? false : (M.beats[k] = 1, true));
  const lag = () => `火星　延遲 ${(fl.pos.distanceTo(DOOR) / 299792458 * 1e6).toFixed(1)} 微秒`;
  const EX = createExplore(renderer, { ui, audio, G, fl, ctx, ms, cam, hero, lyra, M, colliders, DOOR, PAD, MAST: new THREE.Vector3(RX, 0, RZ), groundH, G_MARS, store: ctx.store, vmaxMars, rhoMars, flash: ctx.flash });

  function start(stage = 'entry') {
    M.on = true; M.beats = {}; M.t = 0; M.alarm = 0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    fl.reset(); fl.vmaxFn = vmaxMars; fl.rhoFn = rhoMars; fl.space = false;
    hero.st.dead = false; hero.st.hp = 100; hero.root.visible = true; hero.setShield(0);
    lyra.root.visible = true; M.lyraP.copy(DOOR).add(_v.set(-6, 0, 6)); M.lyraYaw = -Math.PI / 4 - Math.PI / 2; chip.visible = false;
    bursts.forEach((b) => ms.remove(b.s)); bursts.length = 0;
    $('wp').querySelector('b').textContent = '萊拉'; $('timeLabel').textContent = '';
    if (stage === 'explore') { M.phase = 'explore'; $('game').classList.remove('cine'); EX.begin(true); return; }
    if (stage === 'surface') { M.phase = 'fly'; startSurface(); }
    else { M.phase = 'entry'; ui.clear(); $('game').classList.add('cine'); $('timeLabel').textContent = '時間加快 ×30'; }
  }
  function startSurface() {
    M.phase = 'fly'; M.t = 0;
    fl.pos.copy(START); fl.vel.copy(_v.set(12000, 0, -16000).normalize().multiplyScalar(900)).add(_w.set(0, -120, 0));
    G.fYaw = Math.atan2(-fl.vel.x, -fl.vel.z); G.fPitch = 0.25; G.lookIdle = 0;
    $('game').classList.remove('cine'); $('wp').classList.remove('hidden', 'near');
    ui.obj('飛去萊拉嘅中繼站'); ctx.saveCP && ctx.saveCP('mars');
    ui.say('六分儀', '高度九公里。跟住標記飛，火星重力只有地球三分一，落地慢慢嚟。', 4.6);
    ui.hint(input.touch ? '左邊搖桿：向鏡頭方向飛　「下降」　「衝」：加速' : 'WASD 向鏡頭方向飛　C 下降　Shift 衝刺', 6);
  }

  // ======================= per frame =======================
  function update(dt, t) {
    if (!M.on) return;
    M.t += dt;
    if (M.phase === 'entry') return entryTick(dt, t);
    if (M.phase === 'explore') { EX.tick(dt, t); if (EX.where === 'surface') worldTick(dt, t); return; }
    if (M.phase === 'fly' || M.phase === 'land') flyTick(dt, t);
    else walkTick(dt, t);
    worldTick(dt, t);
  }

  // ---- entry: a scripted fall from orbit, 30× faster than life ----
  const ENTRY = 13;
  function entryTick(dt, t) {
    const k = clamp(M.t / ENTRY, 0, 1);
    const a = 400 * Math.exp(-3.79 * k);                       // km above the surface: 400 → 9
    const x = 20 + 580 * (Math.exp(-3.6 * k) - Math.exp(-3.6)) / (1 - Math.exp(-3.6));   // km to go: 600 → 20
    const curve = x * x / (2 * R_KM);
    const P = _v.set(-x, a - curve, 0);
    const k2 = clamp((M.t + 0.05) / ENTRY, 0, 1), a2 = 400 * Math.exp(-3.79 * k2), x2 = 20 + 580 * (Math.exp(-3.6 * k2) - Math.exp(-3.6)) / (1 - Math.exp(-3.6));
    const vel = _w.set(-x2 + x, (a2 - x2 * x2 / (2 * R_KM)) - (a - curve), 0).normalize();
    const glow = smooth(3, 6, M.t) * (1 - smooth(10.5, 12.6, M.t));
    entryHero.setShield(glow, vel);
    entryHero.st.thrust = M.t < 4 ? 0.9 : 0.35; entryHero.st.mode = 'fly';
    entryHero.root.rotation.set(0.9 * smooth(2, 5, M.t), Math.PI / 2, 0, 'YXZ');   // facing the way he falls, leaning into it
    entryHero.animate(dt, t, 0);
    // camera: wide and above to start, then in close behind him with the horizon arc on top
    const w = smooth(3.5, 7, M.t);
    const off = new THREE.Vector3(lerp(-28, -5.5, w), lerp(9, 2.8, w), lerp(10, 2.2, w));
    gCamNear.position.copy(off); gCamNear.up.set(0, 1, 0);
    gCamNear.lookAt(new THREE.Vector3(lerp(10, 6, w), lerp(-3, -1.6, w), 0));
    gCamFar.quaternion.copy(gCamNear.quaternion); gCamFar.position.copy(P).addScaledVector(off, 1e-3);
    globeMat.uniforms.uCam.value.copy(gCamFar.position);
    if (M.t > 0.4 && beat('e1')) ui.say('六分儀', '離軌燒，交俾我。', 2.6);
    if (M.t > 3.6 && beat('e2')) ui.say('六分儀', `入大氣，每秒 3.4 公里，係呢度音速嘅十四倍。空氣得地球一百分之一厚，護盾頂得住。`, 5);
    if (M.t > 8.4 && beat('e3')) ui.say('萊拉', '我見到你喇。天上一粒火。', 3.6, '火星　延遲 0.04 毫秒');
    audio.rumble(0.12 + glow * 0.5); audio.wind(glow * 0.6, 300 + glow * 700); audio.breath(true, t * 1.6);
    if (M.t > ENTRY && beat('e4')) { ctx.flash && ctx.flash(true); $('timeLabel').textContent = ''; startSurface(); }
  }

  // ---- flying down to the station ----
  const PADC = new THREE.Vector3();
  function flyTick(dt, t) {
    const boost = ctx.flyControls(dt);
    const dir = ctx.dir;
    const gh = groundH(fl.pos.x, fl.pos.z);
    PADC.set(PAD.x, 0.5, PAD.z);
    const dPad = Math.hypot(fl.pos.x - PAD.x, fl.pos.z - PAD.z), alt = fl.pos.y - gh;
    if (M.phase === 'fly' && dPad < 240 && alt < 140) {
      M.phase = 'land'; ui.say('六分儀', '自動降落。放鬆，我帶你落停機坪。', 3.4); ui.obj('降落中'); $('wp').classList.add('near');
    }
    if (M.phase === 'land') {
      // over the pad first, then straight down onto it
      const over = dPad > 3 ? 1 : 0;
      const tgt = _v.set(PAD.x, over ? Math.max(0.5 + 18, Math.min(fl.pos.y, 60)) : 0.6, PAD.z);
      const dd = tgt.distanceTo(fl.pos);
      dir.subVectors(tgt, fl.pos).normalize(); fl.cap = 3 + 0.9 * dd;
      if (!over && fl.pos.y < 0.9) { touchdown(); return; }
    }
    fl.step(dt, dir, boost && M.phase !== 'land');
    // never through the ground
    if (fl.pos.y < gh + 0.6) { fl.pos.y = gh + 0.6; if (fl.vel.y < 0) fl.vel.y *= -0.1; }
    ctx.poseFlyer(hero, dt);
    hero.root.position.copy(fl.pos); hero.st.pos.copy(fl.pos);
    G.clock += dt;
    // camera: over the shoulder, kept above the ground
    const camOff = ctx.camOff, L = camOff.length();
    const sh = new THREE.Vector3().copy(camOff).negate().cross(UPV).normalize().multiplyScalar(0.18 * L);   // over the right shoulder
    cam.position.copy(fl.pos).add(_v.set(0, 1, 0)).add(camOff).add(sh);
    const cg = groundH(cam.position.x, cam.position.z) + 0.8; if (cam.position.y < cg) cam.position.y = cg;
    cam.up.set(0, 1, 0); cam.lookAt(_v.copy(fl.pos).add(_w.set(0, 1, 0)).add(sh));
    cam.fov = G.fov; cam.updateProjectionMatrix();
    waypoint(dPad, alt);
    if (M.t > 6 && beat('f1')) ui.say('萊拉', '你嘅訊號喺我頭頂。延遲……冇咗，得返幾微秒。', 4.2, lag());
    if (M.t > 14 && beat('f2')) ui.say('萊拉', '見唔見到座塔？天線向住天嗰個就係我。', 4, lag());
    if (alt < 2500 && beat('f3')) ui.say('六分儀', '風速每秒 20 米，但空氣太薄，推唔郁你。', 3.8);
    audio.rumble(fl.thrust * 0.3); audio.wind(clamp(fl.speed / 600, 0.05, 1) * 0.35 * Math.sqrt(rhoMars(fl.pos.y) / RHO0), 260 + fl.speed); audio.breath(true, t * 1.5); audio.hum(0.25);
  }
  function waypoint(dPad, alt) {
    const el = $('wp'); if (el.classList.contains('hidden')) return;
    const p = _v.set(PAD.x, 1.5, PAD.z), d = p.distanceTo(fl.pos);
    const proj = p.clone().project(cam);
    let x = proj.x, y = proj.y; const behind = proj.z > 1;
    if (behind) { x = -x; y = -y; if (Math.hypot(x, y) < 0.05) y = -1; }
    const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.8;
    if (off) { const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8); x /= m; y /= m; }
    el.style.transform = `translate(${(x + 1) / 2 * innerWidth}px, ${(1 - y) / 2 * innerHeight}px)`;
    el.classList.toggle('off', off); el.classList.toggle('lft', x > 0.5);
    if (off) el.style.setProperty('--a', `${Math.atan2(-y, x) * 180 / Math.PI + 90}deg`);
    $('wpD').textContent = d >= 10000 ? `${(d / 1000).toFixed(0)} km` : d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d.toFixed(0)} m`;
    void dPad; void alt;
  }
  function touchdown() {
    M.phase = 'walk'; M.t = 0; fl.vel.set(0, 0, 0); fl.cap = Infinity;
    $('wp').classList.add('hidden'); ui.obj('行去萊拉度');
    hero.st.mode = 'walk'; hero.st.g = G_MARS; hero.st.heavy = 1; hero.st.thrust = 0; hero.setShield(0);
    hero.place(_v.set(PAD.x, 0.5, PAD.z), Math.atan2(DOOR.x - PAD.x, DOOR.z - PAD.z));
    hero.root.rotation.set(0, hero.st.yaw, 0);
    M.camYaw = hero.st.yaw + Math.PI; M.camPitch = 0.12;
    audio.burst(160, 0.4, 0.3, 'lowpass');
    ui.say('六分儀', '著陸。火星重力 0.38 g，你可以跳得好高。', 3.6);
    ui.hint(input.touch ? '搖桿行路　「跳」' : 'WASD 行路　空白鍵 跳', 5);
  }

  // ---- on foot: Lyra comes out to meet you ----
  const floor = { floorAt: (x, z) => (Math.hypot(x - PAD.x, z - PAD.z) < 14.3 ? 0.5 : Math.max(0, groundH(x, z))) };
  function walkTick(dt, t) {
    if (M.phase === 'walk') {
      hero.update(dt, M.camYaw, [], t, floor);
      for (const c of colliders) { const dx = hero.st.pos.x - c.x, dz = hero.st.pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + hero.st.radius; if (d < r && d > 1e-4) { hero.st.pos.x = c.x + dx / d * r; hero.st.pos.z = c.z + dz / d * r; } }
      hero.root.position.copy(hero.st.pos);
      // Lyra walks to you
      const to = _v.subVectors(hero.st.pos, M.lyraP).setY(0), d = to.length();
      const sp = d > 2.4 ? Math.min(1.5, (d - 2.4) * 1.2) : 0;
      if (sp > 0) { M.lyraP.addScaledVector(to.normalize(), sp * dt); M.lyraYaw = dampAngle(M.lyraYaw, Math.atan2(to.x, to.z), 6, dt); }
      lyra.st.speed = damp(lyra.st.speed, sp, 8, dt);
      if (M.t > 1.2 && beat('w1')) ui.say('萊拉', '維加！', 2.2, lag());
      if (d < 3.0 && M.t > 2) beginReunion();
    }
    if (M.phase === 'reunion') reunionTick(dt, t);
    if (M.phase === 'end') { hero.animate(dt, t, 0); }
    // Lyra on the ground
    M.lyraP.y = floor.floorAt(M.lyraP.x, M.lyraP.z);
    lyra.root.position.copy(M.lyraP); lyra.root.rotation.set(0, M.lyraYaw, 0); lyra.st.pos.copy(M.lyraP);
    lyra.animate(dt, t, lyra.st.speed > 0.05 ? 1 : 0);
    if (M.phase !== 'reunion' && M.phase !== 'end') walkCam(dt);
    G.clock += dt;
    audio.rumble(0.03 + M.alarm * 0.4); audio.wind(0.12, 240); audio.breath(true, t * 1.3); audio.hum(0.25);
  }
  const pivot = new THREE.Vector3(), ray = new THREE.Vector3();
  function walkCam(dt) {
    const sens = input.touch ? 0.006 : 0.0045;
    M.camYaw -= input.look.dx * sens; M.camPitch = clamp(M.camPitch + input.look.dy * sens * 0.8, -0.6, 1.1);
    hero.headPos(pivot); pivot.y -= 0.15;
    ray.set(Math.sin(M.camYaw) * Math.cos(M.camPitch), Math.sin(M.camPitch), Math.cos(M.camYaw) * Math.cos(M.camPitch));
    cam.position.copy(pivot).addScaledVector(ray, M.camDist);
    const g = floor.floorAt(cam.position.x, cam.position.z) + 0.4; if (cam.position.y < g) cam.position.y = g;
    cam.up.set(0, 1, 0); cam.lookAt(pivot); cam.fov = 60; cam.updateProjectionMatrix();
  }

  // ---- the reunion: about a minute, then the ground starts to move ----
  const SCRIPT = [
    ['萊拉', '……你真係嚟咗。'],
    ['維加', '我答應過你。'],
    ['萊拉', '地球最後嗰幕，我喺中繼站睇咗三次。每一次，都遲咗 5 分 51 秒。'],
    ['維加', '跟我走。晨星號載得落你。'],
    ['萊拉', '我唔走得。火星同木衛二仲有幾萬人，個中繼站係大家唯一可以同對方講嘢嘅地方。'],
    ['萊拉', '呢塊係我改過嘅通訊晶片。你去到幾遠，我都收到你。', 'chip'],
    ['維加', '就算延遲幾多年？'],
    ['萊拉', '就算延遲幾多年。'],
  ];
  // each line starts when the one before has finished: [start, who, text, duration, tag]
  const LINES = []; { let at = 0.8; for (const [who, text, tag] of SCRIPT) { const dur = Math.max(2.6, text.length * 0.15 + 1.1); LINES.push([at, who, text, dur, tag]); at += dur + 0.35; } }
  const T_CHIP = LINES.find((l) => l[4] === 'chip')[0], T_TALK = LINES[LINES.length - 1][0] + LINES[LINES.length - 1][3];
  let reunionCam = null;
  function beginReunion() {
    M.phase = 'reunion'; M.t = 0; ui.clear(); ui.obj(''); $('game').classList.add('cine');
    hero.setVisorUp(true); lyra.setVisorUp(true);      // sun-visors up: they see each other's faces
    hero.st.frozen = true; lyra.st.speed = 0;
    // face each other, a step apart
    const mid = new THREE.Vector3().addVectors(hero.st.pos, M.lyraP).multiplyScalar(0.5);
    const dirV = new THREE.Vector3().subVectors(M.lyraP, hero.st.pos).setY(0).normalize();
    hero.st.pos.copy(mid).addScaledVector(dirV, -0.85); M.lyraP.copy(mid).addScaledVector(dirV, 0.85);
    hero.st.yaw = Math.atan2(dirV.x, dirV.z); M.lyraYaw = hero.st.yaw + Math.PI;
    hero.root.position.copy(hero.st.pos); hero.root.rotation.set(0, hero.st.yaw, 0);
    const side = new THREE.Vector3(dirV.z, 0, -dirV.x);
    if (side.dot(new THREE.Vector3(-mid.x, 0, -mid.z)) > 0) side.negate();      // camera away from the dome: the station stands behind them
    reunionCam = { mid: mid.clone().setY(mid.y + 1.35), side, dirV: dirV.clone() };
  }
  function reunionTick(dt, t) {
    const T = M.t;
    for (const [at, who, text, dur] of LINES) if (T > at && beat('r' + at)) ui.say(who, text, dur, who === '萊拉' ? '火星　延遲 0 秒' : '');
    // the chip passes from her glove to his
    if (T > T_CHIP + 0.5 && T < T_CHIP + 5) {
      chip.visible = true; const k = smooth(T_CHIP + 1.2, T_CHIP + 3.6, T);
      chip.position.copy(M.lyraP).lerp(hero.st.pos, k).setY((M.lyraP.y + hero.st.pos.y) / 2 + 1.05 + Math.sin(k * Math.PI) * 0.08);
      chip.rotation.y += dt * 1.5;
    } else if (T >= T_CHIP + 5) chip.visible = false;
    // the ground shivers: something under the plain, with the beacon's own signature
    if (T > T_TALK + 1.2 && beat('a0')) { M.alarm = 0.5; ctx.shake && ctx.shake(0.4); ui.say('六分儀', '地震儀有反應。震源喺地底，東北面大約五百米。', 4.2); }
    if (T > T_TALK + 5.6 && beat('a1')) { M.alarm = 0; ui.say('萊拉', '又係佢。熔岩管入面有嘢。每次震完，地底嘅熱就高少少。', 4.8, '火星　延遲 0 秒'); }
    if (T > T_TALK + 10.6 && beat('a2')) ui.say('六分儀', '震源嘅能量特徵同信標一樣。係築界者嘅嘢。', 4.2);
    if (T > T_TALK + 15 && beat('a3')) { ui.say('萊拉', '攞住，我把等離子切割器。外面唔止你一個：上個禮拜開始，隕石坑西北面有收割者。', 5.6, '火星　延遲 0 秒'); hero.setCutter(true, 0.7, 0); }
    if (T > T_TALK + 21.2 && beat('a4')) { hero.setVisorUp(false); lyra.setVisorUp(false); M.phase = 'explore'; $('game').classList.remove('cine'); EX.begin(false); return; }
    hero.animate(dt, t, 0); lyra.st.speed = 0;
    // a slow two-shot from the side, drifting round as they talk; later, out toward the plain
    const rc = reunionCam, k = smooth(0, T_TALK, T), out = smooth(T_TALK + 1.2, T_TALK + 5, T);
    const camP = _v.copy(rc.mid).addScaledVector(rc.side, lerp(3.6, 2.6, k)).addScaledVector(rc.dirV, lerp(-0.6, 0.9, k)).add(_w.set(0, lerp(0.15, 0.35, k), 0));
    camP.lerp(_w.copy(rc.mid).addScaledVector(rc.side, 7).addScaledVector(rc.dirV, -6).add(new THREE.Vector3(0, 2.4, 0)), out);
    cam.position.copy(camP);
    const look = rc.mid.clone().lerp(new THREE.Vector3(380, 30, -340), out * 0.3 * (1 - smooth(T_TALK + 13, T_TALK + 16, T)));
    if (M.alarm) cam.position.add(_w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.03 * M.alarm));
    cam.up.set(0, 1, 0); cam.lookAt(look); cam.fov = lerp(42, 50, out); cam.updateProjectionMatrix();
  }

  // ---- the world ticking along ----
  function worldTick(dt, t) {
    const airborne = M.phase === 'fly' || M.phase === 'land' || (M.phase === 'explore' && EX.flying);
    const h = airborne ? fl.pos.y : hero.st.pos.y;
    const k = Math.exp(-Math.max(0, h) / HS);
    mskyMat.uniforms.uK.value = k;
    const fogC = new THREE.Color(0.84 * lerp(0.08, 1, k), 0.65 * lerp(0.08, 1, k), 0.48 * lerp(0.08, 1, k));
    ms.fog.color.copy(fogC).convertSRGBToLinear(); ms.fog.density = 0.000045 * (0.4 + 0.6 * k);
    hemi.intensity = 0.28 + 0.2 * k;
    // the sun's shadow box follows whoever is near the ground
    const focus = airborne ? fl.pos : hero.st.pos;
    sun.target.position.set(focus.x, Math.max(0, groundH(focus.x, focus.z)), focus.z); sun.position.copy(sun.target.position).addScaledVector(SUN, 400);
    motes.position.copy(focus); if (!airborne || h < 300) pebbles.update(focus);
    const mp = mg.attributes.position.array, rv = fl.vel;
    for (let i = 0; i < MN; i++) { for (let a = 0; a < 3; a++) { const key = a === 0 ? 'x' : a === 1 ? 'y' : 'z'; mp[i * 3 + a] -= rv[key] * 0.05 * dt; if (mp[i * 3 + a] > 40) mp[i * 3 + a] -= 80; else if (mp[i * 3 + a] < -40) mp[i * 3 + a] += 80; } }
    mg.attributes.position.needsUpdate = true; motes.material.opacity = 0.6 * k;
    devilMat.uniforms.uT.value = t; devils.forEach((d) => { d.a += dt * 0.02; d.m.position.x = d.x + Math.sin(d.a) * 200; d.m.rotation.y += dt * 0.6; });
    beacon.material.color.setRGB(fract(t * 0.7) < 0.15 ? 1 : 0.25, 0.08, 0.05);
    padLights.forEach((b, i) => b.material.color.setRGB(1, 0.69, 0.38).multiplyScalar(fract(t * 0.8 - i / 16) < 0.12 ? 1.6 : 0.5));
    bursts.forEach((b) => { b.t += dt; b.s.scale.setScalar(20 + b.t * 40); b.s.position.y += dt * 10; b.s.material.opacity = Math.max(0, 0.55 * Math.min(1, b.t * 2) * (1 - b.t / 5)); });
  }
  const fract = (x) => x - Math.floor(x);

  function render(W, H) {
    if (M.phase === 'entry') {
      gCamFar.aspect = gCamNear.aspect = W / H; gCamFar.updateProjectionMatrix(); gCamNear.updateProjectionMatrix();
      renderer.autoClear = true; renderer.render(gFar, gCamFar);
      renderer.autoClear = false; renderer.clearDepth(); renderer.render(gNear, gCamNear); renderer.autoClear = true;
      return;
    }
    if (M.phase === 'explore') return EX.render(W, H, G.t);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    renderer.render(ms, cam);
  }
  function stop() { if (M.on) EX.stop(); M.on = false; renderer.shadowMap.enabled = false; $('wp').querySelector('b').textContent = '晨星號'; }
  return { start, update, render, stop, M, hero, lyra, EX, cam, ms, get phase() { return M.phase; },
    get flying() { return M.phase === 'fly' || M.phase === 'land' || (M.phase === 'explore' && EX.flying); } };
}
