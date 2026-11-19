// Beyond the Horizon · aboard 晨星號: the bridge under thrust, the flip at the midpoint, arrival at Mars.
// Physics: 2 g (19.6 m/s²) the whole way, flip at the midpoint, brake at 2 g. Earth → Mars is 1.053e8 km
// (Mars near opposition), so t = 2√(d/a) ≈ 40.7 h and the top speed is ≈ 1,437 km/s.
// Under thrust "down" is toward the engines: the bridge is a round deck with the bow overhead. Accelerating,
// Mars is up through the dome; braking (stern first) it is down through the floor window. At the flip the drive
// is off: weightless for a minute while she turns.
import * as THREE from 'three';
import { createPlayer } from './player.js';
import { makeEnv } from './env.js';
import { MARS_DIR, SUN_DIR, BH_DIR } from './doomsky.js';
import { canvasTex, clamp, damp, dampAngle, smooth, mulberry, GLSL_NOISE } from './util.js';
import { input, consume } from './input.js';

export const TRIP = { D: 1.053e11, A: 19.6 };
const TH = Math.sqrt(TRIP.D / TRIP.A), TT = 2 * TH;          // 73,300 s to the flip, 146,600 s in all
const C = 299792458, R_MARS = 3.3895e6, ORBIT_H = 4.0e5;
export function tripAt(tau) {
  tau = clamp(tau, 0, TT);
  if (tau <= TH) return { s: 0.5 * TRIP.A * tau * tau, v: TRIP.A * tau };
  const r = TT - tau; return { s: TRIP.D - 0.5 * TRIP.A * r * r, v: TRIP.A * r };
}
const R = 8, H = 4.4, DOME = 3.2, FWIN = 1.6, RAIL = 2.1;    // the bridge: radius, height, dome, floor window, railing
const FONT = '"Noto Sans TC", system-ui, sans-serif', NUMF = '"Michroma", "Noto Sans TC", system-ui, sans-serif';
const COSMOS = '#8ec9ff', SHIP = '#ffc27a', MARSC = '#ff8a5c';

// ---------------- what you see out of the windows ----------------
export const SKY_FRAG = `
uniform vec3 uSun, uBH, uDebris, uMars; uniform float uMarsPt, uSunK, uDebrisK;
varying vec3 vD;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vD);
  vec3 col = vec3(0.003, 0.004, 0.008);
  // the Milky Way: a dusty band right round the sky
  vec3 N = normalize(vec3(0.31, 0.83, -0.46));
  float b = dot(d, N), band = exp(-b * b / 0.02);
  float neb = fbm3(d * 5.0) * fbm3(d * 15.0 + 3.0);
  col += vec3(0.5, 0.48, 0.58) * band * (0.04 + 0.26 * neb);
  col *= 1.0 - 0.6 * band * smoothstep(0.48, 0.66, fbm3(d * 8.0 + 7.0));
  vec3 sp = d * 320.0; vec3 sc = floor(sp); float sh = h13(sc);
  float st = step(0.9968 - band * 0.004, sh) * (0.3 + 0.7 * h13(sc + 2.7));
  vec3 tint = mix(vec3(1.0, 0.84, 0.68), vec3(0.74, 0.85, 1.0), h13(sc + 5.1));
  col += st * tint * 1.4;
  // the Sun: no air, so a hard white disk and a tight glare
  float sa = acos(clamp(dot(d, uSun), -1.0, 1.0));
  col += vec3(1.0, 0.97, 0.92) * (smoothstep(0.0062, 0.0046, sa) * 40.0 + exp(-sa / 0.01) * 1.6 + exp(-sa / 0.08) * 0.16) * uSunK;
  // Mars as a point, until its disk is big enough to draw
  float ma = acos(clamp(dot(d, uMars), -1.0, 1.0));
  col += vec3(1.0, 0.5, 0.28) * (exp(-ma / 0.0014) * 2.4 + exp(-ma / 0.009) * 0.1) * uMarsPt;
  // the Wanderer, far behind now: a pinprick and a hair of a ring
  float a = acos(clamp(dot(d, uBH), -1.0, 1.0));
  col *= mix(0.3, 1.0, smoothstep(0.0012, 0.0026, a));
  col += vec3(1.0, 0.86, 0.72) * exp(-pow((a - 0.0028) / 0.0005, 2.0)) * 0.7 + vec3(0.9, 0.95, 1.0) * exp(-a / 0.0007) * 0.9;
  // what was Earth: a faint warm smear behind
  float ea = acos(clamp(dot(d, uDebris), -1.0, 1.0));
  col += vec3(1.0, 0.55, 0.3) * exp(-ea / 0.012) * 0.3 * uDebrisK;
  gl_FragColor = vec4(col, 1.0);
}`;

export const MARS_VERT = `varying vec2 vUv; varying vec3 vN, vWN, vW;
void main(){ vUv = uv; vN = normal; vWN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const MARS_FRAG = `
uniform sampler2D uMap; uniform vec3 uSun, uCam; uniform float uDetail;
varying vec2 vUv; varying vec3 vN, vWN, vW;
${GLSL_NOISE}
// craters at two scales: a bowl, a raised rim, a bright ejecta skirt; one per cell, not every cell
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
vec2 craters(vec3 p, float s){
  vec3 c = floor(p * s); float e = h31(c); if (e < 0.5) return vec2(0.0);
  vec3 j = vec3(h31(c + 1.3), h31(c + 2.7), h31(c + 4.1)) - 0.5;
  float r = 0.18 + 0.2 * h31(c + 7.7), d = length(fract(p * s) - 0.5 - j * 0.35) / r;
  float bowl = -(1.0 - d * d) * step(d, 1.0), rim = exp(-pow((d - 1.0) / 0.18, 2.0));
  return vec2(bowl + rim * 0.55, smoothstep(2.2, 1.0, d) * step(1.0, d) * 0.25);   // height, ejecta brightening
}
void main(){
  vec3 alb = texture2D(uMap, vUv).rgb;
  // close up, the 21 km/pixel map is blurry: noise, dark albedo streaks and craters with real relief break it up
  float n = fbm3(vN * 70.0), n2 = fbm3(vN * 260.0 + 4.0);
  alb *= mix(1.0, 0.78 + 0.34 * n * (0.7 + 0.6 * n2), uDetail);
  vec2 c1 = craters(vN, 90.0), c2 = craters(vN * 1.7 + 3.0, 420.0);
  float h = (c1.x * 1.0 + c2.x * 0.35 + (n2 - 0.5) * 0.6) * uDetail;
  alb *= 1.0 + (c1.y + c2.y * 0.6 - max(-c1.x, 0.0) * 0.18) * uDetail;
  vec3 nrm = normalize(vWN);
  // bump from the height field, in screen space (as a bump map does): shadows inside craters, lit rims
  vec3 sx = dFdx(vW), sy = dFdy(vW); float lx = length(sx), ly = length(sy);
  if (lx > 1e-9 && ly > 1e-9) {
    sx /= lx; sy /= ly; vec3 r1 = cross(sy, nrm), r2 = cross(nrm, sx); float det = dot(sx, r1);
    vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * 1.4; vec3 nb = abs(det) * nrm - g;
    if (dot(nb, nb) > 1e-12) nrm = normalize(nb);
  }
  float lam = dot(nrm, uSun);
  vec3 col = alb * (max(lam, 0.0) * 1.7 + 0.015);
  // a thin dusty atmosphere: butterscotch haze toward the limb on the day side
  vec3 v = normalize(uCam - vW);
  float rim = 1.0 - max(dot(nrm, v), 0.0);
  col += vec3(0.95, 0.6, 0.38) * pow(rim, 3.0) * 0.28 * smoothstep(-0.15, 0.35, lam);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------- canvases: panels, floor, screens ----------------
function wallTex() {
  const t = canvasTex(1024, 720, (g, w, h) => {
    const R0 = mulberry(5);
    g.fillStyle = '#e3e4e4'; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(255,255,255,0.08)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30,34,40,0.38)'; g.lineWidth = 2;
    const cols = [0, 256, 512, 768, 1024], rows = [0, 150, 470, 640, 720];
    cols.forEach((x) => { g.beginPath(); g.moveTo(x + 1, 0); g.lineTo(x + 1, h); g.stroke(); });
    rows.forEach((y) => { g.beginPath(); g.moveTo(0, y + 1); g.lineTo(w, y + 1); g.stroke(); });
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + R0() * 0.05})`; const c = Math.floor(R0() * 4), r = Math.floor(R0() * 4); g.fillRect(cols[c] + 3, rows[r] + 3, 250, rows[r + 1] - rows[r] - 4); }
    g.fillStyle = '#2b2c30'; g.fillRect(0, 640, w, 80);                    // kick plate
    for (let x = 0; x < w; x += 22) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, 652, 12, 56); }
    g.fillStyle = 'rgba(30,28,26,0.55)'; g.font = `500 22px ${NUMF}`;
    ['B-1', 'B-2', 'B-3', 'B-4'].forEach((s, i) => g.fillText(s, i * 256 + 18, 182));
    g.fillStyle = '#c8722e'; g.fillRect(0, 150, w, 4);                     // the Institute's amber stripe
  }, { repeat: true });
  t.repeat.set(-8, 1); return t;                                           // negative: seen from inside, the lettering reads the right way
}
function portholeAlpha(angles) {
  return canvasTex(4096, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000';
    const rx = 0.44 / (2 * Math.PI * R) * w, ry = 0.44 / H * h, cy = h * (1 - 1.75 / H);
    angles.forEach((a) => { const cx = (a / (Math.PI * 2)) * w; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); });
  }, { srgb: false });
}
function floorTex() {
  return canvasTex(1024, 1024, (g, w) => {
    g.fillStyle = '#3c3f45'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    const c = w / 2;
    for (let r = 1; r <= 4; r++) { g.beginPath(); g.arc(c, c, r * c / 4, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.25, c + Math.sin(a) * c * 0.25); g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 6; y < w; y += 14) for (let x = (y / 14) % 2 ? 6 : 13; x < w; x += 14) g.fillRect(x, y, 4, 4);   // grip studs
  });
}
const glowTex = (() => { let t; return () => t || (t = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w); }, { srgb: false })); })();

export function createVoyage(renderer, ctx) {
  const { ui, audio, G } = ctx;
  const inn = new THREE.Scene();
  const out = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(60, 1, 0.05, 80);
  const camOut = new THREE.PerspectiveCamera(60, 1, 0.1, 6000);

  // ---- outside ----
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: new THREE.Vector3() }, uBH: { value: new THREE.Vector3() }, uDebris: { value: new THREE.Vector3() }, uMars: { value: MARS_DIR.clone() }, uMarsPt: { value: 1 }, uSunK: { value: 1 }, uDebrisK: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: SKY_FRAG,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; out.add(sky);
  const marsMap = new THREE.TextureLoader().load(new URL('../tex/mars.jpg', import.meta.url).href); marsMap.colorSpace = THREE.SRGBColorSpace; marsMap.anisotropy = 8;
  const marsMat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: marsMap }, uSun: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uDetail: { value: 0 } }, vertexShader: MARS_VERT, fragmentShader: MARS_FRAG });
  const mars = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), marsMat); mars.visible = false; out.add(mars);
  const marsHaze = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uSun: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vWN, vW; void main(){ vWN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vWN, vW; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(vWN, v)), 5.0);
      float lit = smoothstep(-0.25, 0.3, dot(-vWN, uSun)); gl_FragColor = vec4(vec3(0.95, 0.62, 0.42) * f * lit * 0.9, 1.0); }`,
  })); marsHaze.visible = false; out.add(marsHaze);

  // ---- the bridge ----
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = inn) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // light: a cool ring of light under the ceiling, a little warmth at the desks
  const hemi = new THREE.HemisphereLight(0xeef2fa, 0x3a3e46, 0.6); inn.add(hemi);
  // what the rails, the hatch lid and the visor see: white wall panels all round, a dark deck, the lit dome above
  inn.environment = makeEnv(renderer, { zenith: 0xc8ccd4, horizon: 0xd6d8dc, ground: 0x24262b, sun: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, sunK: 0.3, band: 0.05, gain: 0.55 });
  const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(0.5, 8, 0.3); inn.add(key, key.target);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3; const l = new THREE.PointLight(0xe6edff, 9, 0, 2); l.position.set(Math.sin(a) * 5.6, H - 0.35, Math.cos(a) * 5.6); inn.add(l); }
  const warmL = new THREE.PointLight(0xffb070, 5, 0, 2); warmL.position.set(0, 2.2, -5.6); inn.add(warmL);
  const warmR = new THREE.PointLight(0xffb070, 3, 0, 2); warmR.position.set(5.6, 2.2, 0.8); inn.add(warmR);
  const sunL = new THREE.DirectionalLight(0xfff6ea, 0); inn.add(sunL, sunL.target);
  const marsL = new THREE.DirectionalLight(0xffb48a, 0); marsL.position.set(0, -6, 0); inn.add(marsL, marsL.target);

  const PORTS = [20, 55, 125, 235, 305, 340].map((d) => d * Math.PI / 180);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallTex(), alphaMap: portholeAlpha(PORTS), alphaTest: 0.5, roughness: 0.62, metalness: 0.08, side: THREE.BackSide });
  add(new THREE.CylinderGeometry(R, R, H, 96, 1, true), wallMat, 0, H / 2, 0);
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.6, metalness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 0.35, metalness: 0.8 });
  const panel = new THREE.MeshStandardMaterial({ color: 0xd8dadd, roughness: 0.55, metalness: 0.1 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc3, roughness: 0.7, metalness: 0.1, emissive: 0x1a1c20 });
  const amber = new THREE.MeshBasicMaterial({ color: 0xffb15e });
  const coolLight = new THREE.MeshBasicMaterial({ color: 0xf4f6ff });
  PORTS.forEach((a) => {
    const fr = add(new THREE.TorusGeometry(0.47, 0.055, 10, 40), metal, Math.sin(a) * (R - 0.04), 1.75, Math.cos(a) * (R - 0.04));
    fr.lookAt(0, 1.75, 0);
    const gl = add(new THREE.CircleGeometry(0.45, 32), new THREE.MeshBasicMaterial({ color: 0x8fb4d8, transparent: true, opacity: 0.06, depthWrite: false }), Math.sin(a) * (R + 0.02), 1.75, Math.cos(a) * (R + 0.02));
    gl.lookAt(0, 1.75, 0);
  });
  // floor with the window in its middle
  const fMap = floorTex();
  add(new THREE.RingGeometry(FWIN + 0.14, R, 96, 1), new THREE.MeshStandardMaterial({ map: fMap, roughness: 0.82, metalness: 0.15 })).rotation.x = -Math.PI / 2;
  add(new THREE.TorusGeometry(FWIN + 0.08, 0.08, 10, 80), metal, 0, 0.02, 0).rotation.x = -Math.PI / 2;
  add(new THREE.CircleGeometry(FWIN + 0.08, 64), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.9, depthWrite: false }), 0, 0.01, 0).rotation.x = -Math.PI / 2;
  add(new THREE.TorusGeometry(R - 0.06, 0.028, 6, 160), amber, 0, 0.07, 0).rotation.x = -Math.PI / 2;
  // railing round the floor window
  add(new THREE.TorusGeometry(RAIL, 0.035, 8, 96), metal, 0, 1.02, 0).rotation.x = -Math.PI / 2;
  add(new THREE.TorusGeometry(RAIL, 0.022, 8, 96), metal, 0, 0.55, 0).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; add(new THREE.CylinderGeometry(0.03, 0.03, 1.02, 8), metal, Math.sin(a) * RAIL, 0.51, Math.cos(a) * RAIL); }
  // ceiling, ring light, and the dome over the bow
  const ceil = add(new THREE.RingGeometry(DOME + 0.16, R, 96, 1), ceilMat, 0, H, 0); ceil.rotation.x = Math.PI / 2;
  // structural ribs round the drum: a rhythm on the wall, something to push off when weightless
  [0, 38, 100, 152, 208, 255, 322].forEach((deg) => { const a = deg * Math.PI / 180; const r = add(new THREE.BoxGeometry(0.22, H, 0.16), dark, Math.sin(a) * (R - 0.08), H / 2, Math.cos(a) * (R - 0.08)); r.rotation.y = a; });
  add(new THREE.TorusGeometry(5.6, 0.05, 8, 160), coolLight, 0, H - 0.03, 0).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(R - 0.06, 0.03, 6, 160), amber, 0, H - 0.05, 0).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(DOME + 0.16, DOME + 0.16, 0.5, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }), 0, H + 0.25, 0);
  for (let i = 0; i < 4; i++) { const rib = add(new THREE.TorusGeometry(DOME + 0.16, 0.045, 8, 64, Math.PI), dark, 0, H + 0.5, 0); rib.rotation.y = i * Math.PI / 4; }
  add(new THREE.TorusGeometry(DOME * 0.55, 0.04, 8, 64), dark, 0, H + 0.5 + Math.sqrt((DOME + 0.16) ** 2 - (DOME * 0.55) ** 2), 0).rotation.x = Math.PI / 2;
  const domeGlass = add(new THREE.SphereGeometry(DOME + 0.16, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: 'varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'varying vec3 vN, vW; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(vN, v)), 3.0); gl_FragColor = vec4(vec3(0.55, 0.7, 0.9) * f * 0.18, 1.0); }',
  }), 0, H + 0.5, 0);
  domeGlass.renderOrder = 2;

  // pilot station: a curved desk under the front wall, two screens, two seats
  const cols = [];
  const box = (w, h, d, mat, x, y, z, ry = 0, solid = true) => {
    const m = add(new THREE.BoxGeometry(w, h, d), mat, x, y, z); m.rotation.y = ry;
    if (solid) { const c = Math.cos(ry), s = Math.sin(ry), hx = Math.abs(c) * w / 2 + Math.abs(s) * d / 2, hz = Math.abs(s) * w / 2 + Math.abs(c) * d / 2; cols.push({ on: true, min: [x - hx, y - h / 2, z - hz], max: [x + hx, y + h / 2, z + hz] }); }
    return m;
  };
  const deskA0 = Math.PI - 0.5, deskA1 = Math.PI + 0.5;
  const deskTop = add(new THREE.RingGeometry(6.4, 7.75, 48, 1, Math.PI / 2 - deskA1 + Math.PI, deskA1 - deskA0), dark, 0, 0.98, 0); deskTop.rotation.x = -Math.PI / 2;
  add(new THREE.CylinderGeometry(6.4, 6.4, 0.98, 48, 1, true, deskA0, deskA1 - deskA0), panel, 0, 0.49, 0);
  add(new THREE.CylinderGeometry(6.42, 6.42, 0.05, 48, 1, true, deskA0, deskA1 - deskA0), amber, 0, 0.97, 0);
  for (let k = -1; k <= 1; k++) { const a = Math.PI + k * 0.33; cols.push({ on: true, min: [Math.sin(a) * 7 - 1.25, 0, Math.cos(a) * 7 - 0.75], max: [Math.sin(a) * 7 + 1.25, 1, Math.cos(a) * 7 + 0.75] }); }
  const screens = [];
  for (const k of [-1, 1]) {
    const a = Math.PI + k * 0.22;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const scr = add(new THREE.PlaneGeometry(2.3, 1.3), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }), Math.sin(a) * 7.35, 1.85, Math.cos(a) * 7.35);
    scr.lookAt(0, 1.6, 0);
    const bez = add(new THREE.BoxGeometry(2.42, 1.42, 0.06), dark, 0, 0, 0); bez.position.copy(scr.position).multiplyScalar(1.012); bez.quaternion.copy(scr.quaternion);
    screens.push({ c, g: c.getContext('2d'), tx });
  }
  function seat(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); inn.add(g);
    const s = new THREE.MeshStandardMaterial({ color: 0x34363c, roughness: 0.8 });
    const m = (geo, mat, px, py, pz, rx = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(px, py, pz); k.rotation.x = rx; g.add(k); return k; };
    m(new THREE.CylinderGeometry(0.12, 0.2, 0.42, 12), metal, 0, 0.21, 0);
    m(new THREE.BoxGeometry(0.62, 0.12, 0.6), s, 0, 0.47, 0);
    m(new THREE.BoxGeometry(0.62, 0.95, 0.12), s, 0, 0.98, 0.3, -0.18);
    m(new THREE.BoxGeometry(0.34, 0.2, 0.1), s, 0, 1.55, 0.4, -0.18);
    for (const sx of [-1, 1]) m(new THREE.BoxGeometry(0.08, 0.08, 0.5), dark, sx * 0.34, 0.68, 0.02);
    m(new THREE.BoxGeometry(0.62, 0.02, 0.02), amber, 0, 0.535, -0.29);
    cols.push({ on: true, min: [x - 0.36, 0, z - 0.32], max: [x + 0.36, 1.5, z + 0.4] });
    return g;
  }
  const SEAT = new THREE.Vector3(-1.15, 0, -5.05), SEAT2 = new THREE.Vector3(1.15, 0, -5.05);
  seat(SEAT.x, SEAT.z); seat(SEAT2.x, SEAT2.z);
  // comms station (starboard)
  const COMMS = new THREE.Vector3(6.25, 0, 0.9);
  box(0.9, 1.05, 0.7, panel, COMMS.x + 0.35, 0.525, COMMS.z);
  add(new THREE.BoxGeometry(0.92, 0.04, 0.72), amber, COMMS.x + 0.35, 1.06, COMMS.z);
  const cc = document.createElement('canvas'); cc.width = 640; cc.height = 400;
  const ctx2 = cc.getContext('2d'); const ctex = new THREE.CanvasTexture(cc); ctex.colorSpace = THREE.SRGBColorSpace;
  const cscr = add(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshBasicMaterial({ map: ctex, toneMapped: false }), COMMS.x + 0.55, 1.62, COMMS.z); cscr.rotation.y = -Math.PI / 2; cscr.rotateX(-0.12);
  // lockers (port) and the hatch down to the airlock deck
  for (let i = 0; i < 4; i++) { box(0.62, 2.2, 0.66, panel, -7.15, 1.1, -1.05 + i * 0.7); add(new THREE.BoxGeometry(0.02, 1.9, 0.5), dark, -6.83, 1.15, -1.05 + i * 0.7); add(new THREE.BoxGeometry(0.03, 0.18, 0.04), amber, -6.82, 1.15, -0.9 + i * 0.7); }
  const HATCH = new THREE.Vector3(-3.7, 0, 4.4);
  const hatchRing = add(new THREE.TorusGeometry(0.78, 0.07, 8, 48), new THREE.MeshStandardMaterial({ color: 0xd9a020, roughness: 0.6 }), HATCH.x, 0.03, HATCH.z); hatchRing.rotation.x = -Math.PI / 2;
  add(new THREE.CircleGeometry(0.72, 40), new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.7 }), HATCH.x, 0.012, HATCH.z).rotation.x = -Math.PI / 2;
  const lid = add(new THREE.CylinderGeometry(0.74, 0.74, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0x9a9ea6, roughness: 0.42, metalness: 0.65 }), 0, 0, 0); lid.position.set(HATCH.x - 0.62, 0.62, HATCH.z); lid.rotation.z = Math.PI / 2 - 0.2;
  const hatchLight = add(new THREE.TorusGeometry(0.66, 0.02, 6, 48), new THREE.MeshBasicMaterial({ color: 0x6dff9a }), HATCH.x, 0.04, HATCH.z); hatchLight.rotation.x = -Math.PI / 2; hatchLight.visible = false;
  // handrail round the wall (for the weightless minute)
  add(new THREE.TorusGeometry(R - 0.22, 0.03, 8, 160), metal, 0, 1.15, 0).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; const b = add(new THREE.BoxGeometry(0.04, 0.04, 0.22), metal, Math.sin(a) * (R - 0.11), 1.15, Math.cos(a) * (R - 0.11)); b.rotation.y = a; }

  // the hologram over the floor window: the inner solar system, the Wanderer's line, and us
  const hc = document.createElement('canvas'); hc.width = hc.height = 1024;
  const hg = hc.getContext('2d'); const htex = new THREE.CanvasTexture(hc); htex.anisotropy = 8;
  const holo = add(new THREE.CircleGeometry(1.5, 64), new THREE.MeshBasicMaterial({ map: htex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 0, 1.38, 0);
  holo.rotation.x = -Math.PI / 2;
  const beam = add(new THREE.CylinderGeometry(1.5, 1.62, 1.36, 64, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.0) * 0.07; gl_FragColor = vec4(vec3(0.55, 0.78, 1.0) * a, 1.0); }',
  }), 0, 0.69, 0);

  // sunlight through the dome (after the flip): a pool of light on the floor
  const pool = add(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xfff1d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.015, 0);
  pool.rotation.x = -Math.PI / 2;

  // things on the desks that float when the drive stops
  const props = [];
  function prop(mesh, x, y, z, r) { mesh.position.set(x, y, z); inn.add(mesh); props.push({ m: mesh, p: mesh.position, v: new THREE.Vector3(), w: new THREE.Vector3(), r, rest: true, home: new THREE.Vector3(x, y, z) }); }
  const mug = new THREE.Group(); mug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.4 })));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), new THREE.MeshStandardMaterial({ color: 0xe8e2d6 })); handle.position.x = 0.05; mug.add(handle);
  prop(mug, -0.55, 1.05, -6.55, 0.06);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.17), new THREE.MeshStandardMaterial({ color: 0x15171a, emissive: 0x3a6a9a, emissiveIntensity: 0.4 }));
  prop(tab, 0.6, 1.0, -6.7, 0.1);
  prop(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0xc8722e })), 0.85, 0.995, -6.6, 0.05);
  const photo = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.012), new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.6 })); prop(photo, COMMS.x + 0.2, 1.17, COMMS.z - 0.25, 0.08);
  prop(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc8e04a, roughness: 0.8 })), -6.4, 0.035, 2.4, 0.035);
  prop(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: 0x9ab0c0, roughness: 0.3, transparent: true, opacity: 0.75 })), -0.2, 1.06, -6.85, 0.08);

  // Vega, helmet off
  const hero = createPlayer(inn, {});
  hero.setSuit(true); hero.setHelmet(false); hero.heal();

  // ---------------- state ----------------
  const V = { on: false, step: '', tau: 0, rate: 1, target: 0, gK: 1, flipK: 0, flipT: 0, seated: false, camYaw: Math.PI + 0.6, camPitch: 0.22, camDist: 3.2, beats: {}, arrT: 0, fv: new THREE.Vector3(), near: null, drawT: 0, orbitA: 0 };
  const beat = (k) => (V.beats[k] ? false : (V.beats[k] = 1, true));
  const qAcc = new THREE.Quaternion(), shipQ = new THREE.Quaternion(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  { const Y = MARS_DIR.clone(); const f = new THREE.Vector3(0, 1, 0).addScaledVector(Y, -Y.y).normalize(); const Z = f.clone().negate(); const X = new THREE.Vector3().crossVectors(Y, Z); qAcc.setFromRotationMatrix(_m.makeBasis(X, Y, Z)); }
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), pivot = new THREE.Vector3(), ray = new THREE.Vector3();

  const lag = (tau) => (TRIP.D - tripAt(tau).s + ORBIT_H) / C;
  const fmtLag = (s) => s >= 60 ? `${Math.floor(s / 60)} 分 ${String(Math.floor(s % 60)).padStart(2, '0')} 秒` : s >= 1 ? `${s.toFixed(1)} 秒` : `${(s * 1000).toFixed(1)} 毫秒`;
  const fmtKm = (m) => { const km = m / 1000; return km >= 1e8 ? `${(km / 1e8).toFixed(2)} 億 km` : km >= 1e4 ? `${Math.round(km / 1e4).toLocaleString('en-US')} 萬 km` : `${Math.round(km).toLocaleString('en-US')} km`; };
  const fmtHMS = (s) => { s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':'); };
  const lyra = (text, dur = 5) => ui.say('萊拉', text, dur, `火星　延遲 ${fmtLag(lag(V.tau))}`);

  // ---------------- screens ----------------
  function drawScreens() {
    const { s, v } = tripAt(V.tau);
    // left: the mission profile — speed against time, the flip at the top of the triangle
    {
      const { g, tx } = screens[0]; const w = 1024, h = 576;
      g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(142,201,255,0.55)'; g.font = `400 22px ${FONT}`; g.fillText('航程　地球 → 火星', 48, 62);
      g.fillStyle = '#e8eef5'; g.font = `400 54px ${NUMF}`; g.fillText(`${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })} km/s`, 48, 140);
      g.fillStyle = 'rgba(232,238,245,0.5)'; g.font = `400 22px ${FONT}`; g.fillText(V.tau < TH ? '加速　2 g' : V.step === 'flip' ? '掉頭' : '減速　2 g', 50, 180);
      const x0 = 48, x1 = 976, y0 = 500, y1 = 240;
      g.strokeStyle = 'rgba(142,201,255,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.stroke();
      g.strokeStyle = COSMOS; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo((x0 + x1) / 2, y1); g.lineTo(x1, y0); g.stroke();
      g.setLineDash([6, 8]); g.strokeStyle = 'rgba(142,201,255,0.4)'; g.beginPath(); g.moveTo((x0 + x1) / 2, y1 - 12); g.lineTo((x0 + x1) / 2, y0); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(142,201,255,0.7)'; g.font = `400 20px ${FONT}`; g.fillText('掉頭點　1,437 km/s', (x0 + x1) / 2 + 12, y1 + 8);
      const k = V.tau / TT, sx = x0 + (x1 - x0) * k, sy = y0 - (y0 - y1) * (v / (TRIP.A * TH));
      g.fillStyle = SHIP; g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(232,238,245,0.5)'; g.font = `400 20px ${FONT}`; g.fillText('地球', x0, y0 + 34); g.textAlign = 'right'; g.fillText('火星', x1, y0 + 34); g.textAlign = 'left';
      g.fillStyle = 'rgba(232,238,245,0.55)'; g.font = `400 22px ${FONT}`; g.textAlign = 'right';
      g.fillText(`仲有 ${fmtKm(Math.max(0, TRIP.D - s))}`, x1, 62); g.fillText(`到達 ${fmtHMS(TT - V.tau)}`, x1, 96); g.textAlign = 'left';
      tx.needsUpdate = true;
    }
    // right: Lyra's line — the light-time to Mars, falling
    {
      const { g, tx } = screens[1]; const w = 1024, h = 576;
      g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,194,122,0.7)'; g.font = `400 22px ${FONT}`; g.fillText('火星中繼站　萊拉', 48, 62);
      g.fillStyle = '#e8eef5'; g.font = `400 54px ${NUMF}`; g.fillText(fmtLag(lag(V.tau)), 48, 140);
      g.fillStyle = 'rgba(232,238,245,0.5)'; g.font = `400 22px ${FONT}`; g.fillText('訊號延遲　光由火星去到你嘅時間', 50, 180);
      const x0 = 48, x1 = 976, y0 = 500, y1 = 240;
      g.strokeStyle = 'rgba(255,194,122,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.stroke();
      g.strokeStyle = SHIP; g.lineWidth = 3; g.beginPath();
      for (let i = 0; i <= 60; i++) { const t = TT * i / 60, x = x0 + (x1 - x0) * i / 60, y = y0 - (y0 - y1) * lag(t) / lag(0); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      const sx = x0 + (x1 - x0) * V.tau / TT, sy = y0 - (y0 - y1) * lag(V.tau) / lag(0);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 8, 0, Math.PI * 2); g.fill();
      tx.needsUpdate = true;
    }
    // comms panel
    {
      const g = ctx2, w = 640, h = 400;
      g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,194,122,0.8)'; g.font = `400 26px ${FONT}`; g.fillText('萊拉', 34, 54);
      g.fillStyle = 'rgba(232,238,245,0.5)'; g.font = `400 18px ${FONT}`; g.fillText(`火星中繼站　延遲 ${fmtLag(lag(V.tau))}`, 34, 86);
      g.strokeStyle = SHIP; g.lineWidth = 2; g.beginPath();
      for (let x = 0; x <= 572; x += 4) { const a = Math.sin(x * 0.07 + G.t * 3) * Math.sin(x * 0.013 + G.t) * (V.step === 'board' ? 34 : 10); x ? g.lineTo(34 + x, 220 + a) : g.moveTo(34, 220 + a); }
      g.stroke();
      if (V.step === 'board') { g.fillStyle = '#e8eef5'; g.font = `400 22px ${FONT}`; g.fillText('新訊息　1', 34, 340); }
      ctex.needsUpdate = true;
    }
    // hologram: Sun, the orbits, Earth's remains, Mars, the Wanderer's line and 晨星號 between them
    {
      const g = hg, w = 1024, c = w / 2, au = 230;
      g.clearRect(0, 0, w, w);
      const bg = g.createRadialGradient(c, c, 0, c, c, c); bg.addColorStop(0, 'rgba(142,201,255,0.10)'); bg.addColorStop(0.92, 'rgba(142,201,255,0.05)'); bg.addColorStop(1, 'rgba(142,201,255,0)');
      g.fillStyle = bg; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(142,201,255,0.5)'; g.lineWidth = 5; g.beginPath(); g.arc(c, c, c - 6, 0, Math.PI * 2); g.stroke();
      const rot = G.t * 0.03, P = (r, a) => [c + Math.cos(a + rot) * r * au, c + Math.sin(a + rot) * r * au];
      g.strokeStyle = 'rgba(142,201,255,0.35)'; g.lineWidth = 5;
      [0.39, 0.72].forEach((r) => { g.beginPath(); g.arc(c, c, r * au, 0, Math.PI * 2); g.stroke(); });
      g.setLineDash([16, 14]); g.strokeStyle = 'rgba(255,150,90,0.6)'; g.beginPath(); g.arc(c, c, au, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(142,201,255,0.6)'; g.beginPath(); g.arc(c, c, 1.52 * au, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,240,200,1)'; g.beginPath(); g.arc(c, c, 20, 0, Math.PI * 2); g.fill();
      const ea = -0.3, E = P(1, ea), M = P(1.704, ea), k = tripAt(V.tau).s / TRIP.D, S = P(1 + 0.704 * k, ea);
      g.fillStyle = 'rgba(255,140,80,1)'; for (let i = 0; i < 11; i++) { g.beginPath(); g.arc(E[0] + Math.sin(i * 7.1) * 14, E[1] + Math.cos(i * 3.3) * 14, 5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = MARSC; g.beginPath(); g.arc(M[0], M[1], 16, 0, Math.PI * 2); g.fill();
      g.strokeStyle = COSMOS; g.lineWidth = 7; g.beginPath(); g.moveTo(E[0], E[1]); g.lineTo(M[0], M[1]); g.stroke();
      const bA = ea + 1.9, B0 = [E[0] - Math.cos(bA + rot) * 600, E[1] - Math.sin(bA + rot) * 600], B1 = [E[0] + Math.cos(bA + rot) * 600, E[1] + Math.sin(bA + rot) * 600];
      g.setLineDash([10, 16]); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 4; g.beginPath(); g.moveTo(B0[0], B0[1]); g.lineTo(B1[0], B1[1]); g.stroke(); g.setLineDash([]);
      g.fillStyle = SHIP; g.beginPath(); g.arc(S[0], S[1], 14 + 3 * Math.sin(G.t * 5), 0, Math.PI * 2); g.fill();
      g.font = `500 44px ${FONT}`; g.fillStyle = 'rgba(232,238,245,0.95)';
      g.fillText('火星', M[0] + 24, M[1] - 18); g.fillText('地球', E[0] - 20, E[1] + 64); g.fillStyle = SHIP; g.fillText('晨星號', S[0] - 50, S[1] - 30);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText('流浪者', B1[0] - 150, B1[1]);
      htex.needsUpdate = true;
    }
  }

  // ---------------- start / checkpoints ----------------
  function start(stage = 'board') {
    V.on = true; V.beats = {}; V.near = null; V.fv.set(0, 0, 0); V.rate = 1; V.flipT = 0;
    props.forEach((p) => { p.p.copy(p.home); p.v.set(0, 0, 0); p.w.set(0, 0, 0); p.rest = true; p.m.rotation.set(0, 0, 0); });
    hero.st.dead = false; hero.st.hp = 100; hero.st.frozen = false; hero.st.mode = 'walk'; hero.st.heavy = 0.68; hero.st.g = TRIP.A;
    hatchLight.visible = false;
    if (stage === 'orbit') {
      V.tau = TT; V.step = 'orbit'; V.gK = 0; V.flipK = 1; V.arrT = 99;
      hero.st.g = 0.001; hero.st.mode = 'float'; hero.place(new THREE.Vector3(-2.4, 0.4, 3.0), Math.PI * 0.75);
      props.forEach((p) => { p.rest = false; p.v.set((Math.random() - 0.5) * 0.06, Math.random() * 0.05, (Math.random() - 0.5) * 0.06); });
      hatchLight.visible = true; ui.obj('去艙口，出艙飛落火星');
    } else {
      V.tau = 0; V.step = 'board'; V.gK = 1; V.flipK = 0;
      hero.place(new THREE.Vector3(-3.0, 0, 3.4), Math.PI * 0.8);
      V.camYaw = -0.6 + Math.PI * 0.8 + Math.PI; V.camPitch = 0.2;
      // let the chapter card have the screen first, then talk
      setTimeout(() => { if (V.step !== 'board') return;
        ui.say('六分儀', '歡迎上船。引擎兩個 g 加速緊，你而家重一倍，行慢啲。', 4.6);
        ui.say('六分儀', '萊拉由火星發咗訊息俾你，喺右邊嘅通訊台。', 4.2);
        ui.obj('去通訊台聽萊拉嘅訊息'); }, 4200);
    }
    $('vhud').classList.remove('hidden');
  }
  const $ = (id) => document.getElementById(id);

  // ---------------- interactions ----------------
  function nearest() {
    const p = hero.st.pos;
    const d = (q) => Math.hypot(p.x - q.x, p.z - q.z);
    if (V.step === 'board' && d(COMMS) < 1.9) return { label: '聽萊拉嘅訊息', act: playMsg };
    if ((V.step === 'toSeat' || V.step === 'reseat') && d(SEAT) < 1.5 && V.gK > 0.9) return { label: '坐上駕駛座', act: sit };
    if (V.step === 'orbit' && d(HATCH) < 1.5) return { label: '落去氣閘，出艙', act: () => ctx.onExit && ctx.onExit() };
    return null;
  }
  function playMsg() {
    V.step = 'toSeat'; ui.clear(); audio.tone(880, 0.1, 0.05);
    lyra('維加，六分儀話你上咗太空。我呢度望出去，地球仲係完整嘅。', 5.2);
    lyra('我知你聽到呢句嗰陣，已經唔係咁。總之，嚟火星。我等你。', 5.2);
    ui.say('六分儀', '佢講呢段說話嗰陣，地球仲未碎。光要 5 分 51 秒先去到火星，佢而家先開始見到。', 6);
    ui.say('六分儀', '去火星要 40 幾個鐘。去駕駛座坐低，我幫你快轉時間。', 4.6);
    ui.obj('坐上駕駛座（快轉時間）'); V.idleT = -14;
  }
  function sit() {
    hero.st.mode = 'sit'; hero.st.frozen = true; V.seated = true;
    hero.place(SEAT.clone().add(new THREE.Vector3(0, 0, 0.05)), Math.PI);
    V.camYaw = Math.PI * 0.5 + 0.35; V.camPitch = 0.18; V.camDist = 3.6;
    if (V.step === 'toSeat') { V.step = 'skip1'; V.target = TH; ui.obj(''); ui.hint('時間快轉中', 4); ui.say('六分儀', '睇住你。去到半路我會叫醒你。', 3.6); }
    else { V.step = 'skip2'; V.target = TT; ui.obj(''); ui.hint('時間快轉中', 4); }
  }
  function standUp(float) {
    V.seated = false; hero.st.frozen = false; hero.st.mode = float ? 'float' : 'walk';
    if (float) { hero.st.onGround = false; V.fv.set(0, 0.18, 0.12); }
  }

  // ---------------- the flip ----------------
  function beginFlip() {
    V.step = 'flip'; V.flipT = 0; ui.clear();
    ui.say('六分儀', '到咗半路。引擎熄火，準備掉頭。', 4);
    audio.boom();
    ui.hint(input.touch ? '無重：搖桿推住扶手移動　「跳」向上　「翻滾」向下' : '無重：WASD 推住扶手移動　空白鍵 向上　C 向下', 7);
  }
  function flipTick(dt) {
    V.flipT += dt; const t = V.flipT;
    V.gK = 1 - smooth(0, 1.6, t);
    if (t > 1.2 && V.seated) standUp(true);
    if (t > 1.6) props.forEach((p) => { if (p.rest) { p.rest = false; p.v.set((Math.random() - 0.5) * 0.12, 0.06 + Math.random() * 0.12, (Math.random() - 0.5) * 0.12); p.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.4); } });
    V.flipK = smooth(5, 23, t);                               // she turns 180° on her thrusters
    if (t > 5 && beat('f1')) ui.say('六分儀', '而家佢用姿態推進器打個圈。望上個圓頂。', 4);
    const sunInDome = sunInterior().y;
    if (sunInDome > 0.93 && beat('f2')) ui.say('維加', '……又一次日出。', 3.4);
    if (t > 25 && beat('f3')) { ui.say('六分儀', '掉頭完成。減速燒，兩個 g。坐返好，唔係就跌落地。', 4.6); }
    if (t > 28) V.gK = smooth(28, 30, t);
    if (t > 28 && beat('f4')) { audio.boom(); }
    if (t > 30 && beat('f5')) { V.step = 'reseat'; ui.obj('坐返駕駛座'); if (hero.st.mode === 'float') { hero.st.mode = 'walk'; hero.st.onGround = false; hero.st.vy = V.fv.y; } }
  }
  const sunInterior = () => _w.copy(SUN_DIR).applyQuaternion(_q.copy(shipQ).invert());

  // ---------------- per frame ----------------
  function update(dt, t) {
    if (!V.on) return;
    // mission time: a fast-forward while seated, slowing into each stop
    if (V.step === 'skip1' || V.step === 'skip2') {
      const rem = V.target - V.tau, Rmax = TH / 22;
      V.rate = Math.min(damp(V.rate, Rmax, 0.9, dt), Math.max(1, rem / 1.4));
      V.tau = Math.min(V.target, V.tau + V.rate * dt);
      if (V.tau >= V.target - 0.5) { V.rate = 1; if (V.step === 'skip1') { V.tau = TH; beginFlip(); } else arrive(); }
    } else if (V.step !== 'orbit') { V.rate = 1; V.tau += (V.step === 'flip' ? 0 : dt); }
    if (V.step === 'flip') flipTick(dt);
    if (V.step === 'orbit') V.arrT += dt;
    // the clocks: the faster she goes, the slower Vega's clock runs (v²/2c²)
    const { v } = tripAt(V.tau), sdt = dt * V.rate;
    G.clock += sdt; G.drift += sdt * v * v / (2 * C * C);
    // story beats along the way
    if (V.step === 'skip1') {
      if (V.tau > 580 && beat('m1')) lyra('我見到喇……成個地球……', 4.6);
      if (V.tau > 600 && beat('m2')) lyra('六分儀話你冇事。你冇事就好。', 4.4);
      if (V.tau > 6 * 3600 && beat('m3')) ui.say('六分儀', `速度每秒 ${Math.round(tripAt(V.tau).v / 1000)} 公里。萊拉嘅訊號延遲而家係 ${fmtLag(lag(V.tau))}。`, 4.6);
      if (V.tau > 13 * 3600 && beat('m4')) lyra('火星啲人成晚都喺天文台，冇人講嘢。我喺中繼站，聽緊地球最後嗰啲訊號。', 5.6);
    }
    if (V.step === 'skip2') {
      if (V.tau > 27 * 3600 && beat('m5')) lyra(`延遲得返 ${fmtLag(lag(V.tau))}。我開始覺得你真係嚟緊。`, 4.8);
      if (V.tau > 37.5 * 3600 && beat('m6')) ui.say('六分儀', '火星喺你腳底。望吓個地窗。', 3.8);
    }
    if (V.step === 'orbit') {
      if (V.arrT > 1 && beat('o1')) ui.say('六分儀', '入軌完成。高度 400 公里，每 1 小時 58 分鐘繞火星一圈。', 4.8);
      if (V.arrT > 6 && beat('o2')) { ui.say('萊拉', '維加？', 2.4, '火星　延遲 1.3 毫秒'); ui.say('維加', '萊拉。', 2.2); ui.say('萊拉', '……冇延遲喇。我講一句，你即刻就聽到。', 4.4, '火星　延遲 1.3 毫秒'); ui.say('萊拉', '中繼站嘅坐標傳咗俾六分儀。落嚟啦。', 4.2, '火星　延遲 1.3 毫秒'); }
      if (V.arrT > 22 && beat('o3')) { ui.obj('去艙口，出艙飛落火星'); hatchLight.visible = true; }
    }

    // ship attitude: bow to Mars, then the turn, then stern to Mars
    shipQ.copy(qAcc).multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI * V.flipK));

    // Vega: walking under thrust, floating when the drive is off
    const g = TRIP.A * V.gK;
    if (hero.st.mode === 'float') floatMove(dt);
    else {
      hero.st.g = Math.max(0.01, g);
      hero.update(dt, V.camYaw, cols, t, { floorAt: () => 0 });
      constrain(hero.st.pos, 0.35);
      if (V.gK < 0.25 && !V.seated && (V.step === 'flip' || V.step === 'orbit')) { hero.st.mode = 'float'; V.fv.set(0, 0.1, 0); }
    }
    if (V.seated) { hero.st.pos.copy(SEAT).add(_v.set(0, 0, 0.05)); hero.root.position.copy(hero.st.pos); hero.root.rotation.set(0, Math.PI, 0); hero.animate(dt, t, 0); }
    propsTick(dt, g);

    // interactions
    const near = V.seated || V.step === 'flip' ? null : nearest(); V.near = near;
    ui.prompt(near ? `<b>${input.touch ? '互動' : 'E'}</b>${near.label}` : '');
    if (near && consume('interact')) near.act();

    // camera: orbit round his head, kept inside the room
    camTick(dt);
    wpTick(dt, near);

    // outside: sky directions in the ship's frame, Mars when it has a disk
    outsideTick(dt);
    // light through the dome
    lightTick(dt);
    // screens, a few times a second
    V.drawT -= dt; if (V.drawT <= 0) { V.drawT = 0.2; drawScreens(); }
    holo.rotation.z += dt * 0.05;
    hud();
    audio.rumble(0.18 * V.gK * (V.step === 'orbit' ? 0 : 1)); audio.hum(0.35); audio.wind(0); audio.breath(false, 0);
  }

  function constrain(p, r) {
    const d = Math.hypot(p.x, p.z), lim = R - 0.3 - r;
    if (d > lim) { p.x *= lim / d; p.z *= lim / d; }
    if (d < RAIL + r && p.y < 1.1) { const k = (RAIL + r) / Math.max(d, 1e-3); p.x *= k; p.z *= k; }
  }
  function floatMove(dt) {
    const st = hero.st;
    const yaw = V.camYaw, cp = V.camPitch;                 // the camera looks along -ray: push the way it looks
    const f = _v.set(-Math.sin(yaw) * Math.cos(cp), -Math.sin(cp), -Math.cos(yaw) * Math.cos(cp)).normalize();
    const rt = _w.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const push = new THREE.Vector3().addScaledVector(f, input.move.y).addScaledVector(rt, input.move.x);
    if (input.held.has('jump') || input.held.has('rise')) push.y += 1;
    if (input.held.has('dodge') || input.held.has('sink')) push.y -= 1;
    if (push.lengthSq() > 1) push.normalize();
    V.fv.addScaledVector(push, 1.4 * dt);
    if (V.fv.length() > 1.8) V.fv.setLength(1.8);
    V.fv.multiplyScalar(Math.exp(-0.25 * dt));
    V.fv.y -= TRIP.A * V.gK * dt;
    st.pos.addScaledVector(V.fv, dt);
    // the room: floor, ceiling (higher under the dome), wall, railing
    const d = Math.hypot(st.pos.x, st.pos.z), top = (d < DOME ? H + 0.4 : H) - 1.8;
    if (st.pos.y < 0) { st.pos.y = 0; if (V.fv.y < 0) V.fv.y *= -0.3; if (V.gK > 0.3) { st.mode = 'walk'; st.onGround = true; } }
    if (st.pos.y > top) { st.pos.y = top; if (V.fv.y > 0) V.fv.y *= -0.3; }
    const lim = R - 0.65;
    if (d > lim) { const nx = st.pos.x / d, nz = st.pos.z / d; st.pos.x = nx * lim; st.pos.z = nz * lim; const vn = V.fv.x * nx + V.fv.z * nz; if (vn > 0) { V.fv.x -= 1.3 * vn * nx; V.fv.z -= 1.3 * vn * nz; } }
    if (d < RAIL + 0.35 && st.pos.y < 1.1) { const k = (RAIL + 0.35) / Math.max(d, 1e-3); st.pos.x *= k; st.pos.z *= k; }
    st.yaw = dampAngle(st.yaw, yaw + Math.PI, 1.5, dt);
    hero.root.position.copy(st.pos); hero.root.rotation.set(0, st.yaw, 0);
    hero.shadow.position.set(st.pos.x, 0.012, st.pos.z); hero.shadow.material.opacity = 0.4 / (1 + st.pos.y * 0.8);
    hero.animate(dt, G.t, 0);
  }
  function propsTick(dt, g) {
    for (const pr of props) {
      if (pr.rest) continue;
      pr.v.y -= g * dt; pr.p.addScaledVector(pr.v, dt);
      pr.m.rotation.x += pr.w.x * dt; pr.m.rotation.y += pr.w.y * dt; pr.m.rotation.z += pr.w.z * dt;
      const d = Math.hypot(pr.p.x, pr.p.z), top = (d < DOME ? H + 0.45 : H) - pr.r;
      if (pr.p.y < pr.r) {
        pr.p.y = pr.r;
        if (pr.v.y < 0) pr.v.y *= -0.35;
        if (g > 1) { pr.v.x *= 0.8; pr.v.z *= 0.8; pr.w.multiplyScalar(0.8); if (Math.abs(pr.v.y) < 0.2) pr.v.y = 0; }
      }
      if (d < FWIN && pr.p.y < pr.r + 0.01) pr.p.y = pr.r + 0.01;
      if (pr.p.y > top) { pr.p.y = top; if (pr.v.y > 0) pr.v.y *= -0.4; }
      if (d > R - 0.3) { const nx = pr.p.x / d, nz = pr.p.z / d; pr.p.x = nx * (R - 0.3); pr.p.z = nz * (R - 0.3); const vn = pr.v.x * nx + pr.v.z * nz; if (vn > 0) { pr.v.x -= 1.5 * vn * nx; pr.v.z -= 1.5 * vn * nz; } }
    }
  }
  // two shots the story needs: at the flip the camera drops behind him and looks up through the dome as the sun swings
  // over; on arrival it rises and looks down past him through the floor window at Mars
  let cineK = 0, cineMode = null; const _lk = new THREE.Vector3(), _cc = new THREE.Vector3();
  function camTick(dt) {
    const sens = input.touch ? 0.006 : 0.0045;
    V.camYaw -= input.look.dx * sens; V.camPitch = clamp(V.camPitch + input.look.dy * sens * 0.8, -0.7, 1.2);
    hero.headPos(pivot); pivot.y -= 0.1;
    if (V.seated) pivot.y -= 0.35;
    const want = V.step === 'flip' && V.flipT > 5 && V.flipT < 25 ? 'dome' : V.step === 'orbit' && V.arrT < 15 && !V.seated ? 'floor' : null;
    if (want) cineMode = want;
    cineK = damp(cineK, want ? 1 : 0, 1.3, dt);
    if (cineK > 0.01 && cineMode === 'floor') {
      const yawW = Math.atan2(pivot.x, pivot.z) + 0.5;      // stand off from the centre, a little to one side
      V.camYaw = dampAngle(V.camYaw, yawW, 2.2 * cineK, dt); V.camPitch = damp(V.camPitch, 0.95, 2.2 * cineK, dt);
    }
    if (want === 'dome' && V.domeA == null) V.domeA = Math.atan2(pivot.x, pivot.z) + Math.PI + 0.5;   // across from him, so he floats between us and the glass
    if (!want) V.domeA = null;
    holo.material.opacity = 1 - (cineMode === 'floor' ? cineK : 0);
    V.camDist = damp(V.camDist, V.seated ? 3.6 : 3.0, 3, dt);
    ray.set(Math.sin(V.camYaw) * Math.cos(V.camPitch), Math.sin(V.camPitch), Math.cos(V.camYaw) * Math.cos(V.camPitch));
    // keep the camera inside the drum: radius, floor, ceiling (higher under the dome)
    let tMax = V.camDist;
    const a = ray.x * ray.x + ray.z * ray.z, b = 2 * (pivot.x * ray.x + pivot.z * ray.z), c = pivot.x * pivot.x + pivot.z * pivot.z - (R - 1.4) ** 2;   // clear of the portholes and wall consoles, not just the wall
    if (a > 1e-6) { const disc = b * b - 4 * a * c; if (disc > 0) tMax = Math.min(tMax, (-b + Math.sqrt(disc)) / (2 * a)); }
    if (ray.y > 1e-4) { for (let it = 0; it < 2; it++) { const px = pivot.x + ray.x * tMax, pz = pivot.z + ray.z * tMax; const top = Math.hypot(px, pz) < DOME ? H + 0.45 : H - 0.2; tMax = Math.min(tMax, (top - pivot.y) / ray.y); } }
    if (ray.y < -1e-4) tMax = Math.min(tMax, (0.25 - pivot.y) / ray.y);
    cam.position.copy(pivot).addScaledVector(ray, Math.max(0.3, tMax));
    _lk.copy(pivot);
    if (cineK > 0.01 && cineMode === 'floor') _lk.lerp(_cc.set(0, 0, 0), 0.55 * cineK);
    if (cineK > 0.01 && cineMode === 'dome') {
      // low on the deck under the dome, looking up through the glass as the sky wheels past, him adrift in between
      const a = (V.domeA == null ? 0 : V.domeA) + (V.flipT || 0) * 0.015;
      cam.position.lerp(_cc.set(Math.sin(a) * 2.5, 1.15, Math.cos(a) * 2.5), cineK);
      _lk.lerp(_cc.set(0, H + 2.9, 0), 0.72 * cineK);
    }
    cam.up.set(0, 1, 0); cam.lookAt(_lk);
    cam.fov = 62 + (cineMode === 'dome' ? 12 : 6) * cineK; cam.updateProjectionMatrix();
  }
  function outsideTick(dt) {
    const inv = _q.copy(shipQ).invert();
    const { s } = tripAt(V.tau);
    const su = skyMat.uniforms;
    // everything is placed in the outer (inertial) frame; the outer camera turns with the ship
    su.uSun.value.copy(SUN_DIR);
    const bh = _v.copy(BH_DIR).multiplyScalar(-1.0e6 * (V.tau + 600)).addScaledVector(MARS_DIR, -s); su.uBH.value.copy(bh.normalize());
    su.uDebris.value.copy(MARS_DIR).negate(); su.uDebrisK.value = 1 - smooth(0, 20 * 3600, V.tau) * 0.7;
    const dC = Math.max(R_MARS + ORBIT_H, TRIP.D - s + R_MARS + ORBIT_H);
    const ang = Math.asin(Math.min(0.999, R_MARS / dC));
    const show = ang > 0.0025;
    su.uMarsPt.value = 1 - smooth(0.0025, 0.006, ang);
    mars.visible = marsHaze.visible = show;
    if (show) {
      const dist = 1000, r = dist * R_MARS / dC;              // a sphere of radius r at distance D subtends asin(r/D), as Mars does
      mars.position.copy(MARS_DIR).multiplyScalar(dist); mars.scale.setScalar(r); marsHaze.position.copy(mars.position); marsHaze.scale.setScalar(r);
      if (V.step === 'orbit') V.orbitA += dt * 2 * Math.PI / 7083;
      mars.rotation.set(0.42, 2.1 + V.orbitA, 0.1); marsHaze.rotation.copy(mars.rotation);
      marsMat.uniforms.uSun.value.copy(SUN_DIR); marsHaze.material.uniforms.uSun.value.copy(SUN_DIR).negate();
      marsMat.uniforms.uDetail.value = smooth(0.15, 0.9, ang); marsMat.uniforms.uCam.value.set(0, 0, 0);
    }
    camOut.quaternion.copy(shipQ).multiply(cam.quaternion); camOut.fov = cam.fov; camOut.position.set(0, 0, 0);
    // a little of what is outside lights the room: Mars glow from below in orbit
    const marsBelow = _w.copy(MARS_DIR).applyQuaternion(inv);
    marsL.position.copy(marsBelow).multiplyScalar(6); marsL.intensity = 0.7 * smooth(0.2, 0.9, ang) * Math.max(0, -marsBelow.y);
  }
  function lightTick() {
    const sI = sunInterior();
    // through the dome only when the sun is above the deck, inside the dome's cone
    const up = Math.max(0, sI.y);
    const inCone = smooth(0.82, 0.95, up);
    sunL.position.copy(sI).multiplyScalar(10); sunL.intensity = 2.2 * inCone;
    if (inCone > 0.001) {
      const top = new THREE.Vector3(0, H + 0.5, 0), hitT = top.y / sI.y, c = top.clone().addScaledVector(sI, -hitT);
      pool.position.set(c.x, 0.016, c.z); pool.scale.set(DOME * 1.25, DOME * 1.25 / Math.max(0.3, sI.y), 1);
      pool.rotation.set(-Math.PI / 2, 0, Math.atan2(-sI.x, -sI.z));
      pool.material.opacity = 0.55 * inCone;
    } else { pool.material.opacity = 0; }
  }
  function hud() {
    const { s, v } = tripAt(V.tau);
    $('vDist').textContent = V.step === 'orbit' ? '火星軌道' : fmtKm(Math.max(0, TRIP.D - s));
    $('vSpd').textContent = `${Math.round(v / 1000).toLocaleString('en-US')} km/s`;
    $('vG').textContent = V.step === 'orbit' ? '0 g' : `${(2 * V.gK).toFixed(1)} g`;
    $('vEl').textContent = fmtHMS(V.tau);
    $('vLag').textContent = fmtLag(lag(V.tau));
    $('vMk').style.left = `${(V.tau / TT * 100).toFixed(2)}%`;
    $('vPhase').textContent = V.step === 'orbit' ? '入軌' : V.step === 'flip' ? '掉頭' : V.tau < TH ? '加速' : '減速';
    $('vRate').textContent = V.rate > 2 ? `時間加快 ×${Math.round(V.rate).toLocaleString('en-US')}` : '';
  }
  function arrive() {
    V.tau = TT; V.step = 'orbit'; V.arrT = 0; V.rate = 1; V.gK = 0; ui.obj('');
    ctx.saveCP && ctx.saveCP('orbit');
    audio.boom();
    if (V.seated) standUp(true);
    props.forEach((p) => { p.rest = false; p.v.set((Math.random() - 0.5) * 0.05, 0.03 + Math.random() * 0.05, (Math.random() - 0.5) * 0.05); });
    ui.hint(input.touch ? '無重：搖桿移動　「跳」向上　「翻滾」向下' : '無重：WASD 移動　空白鍵 向上　C 向下', 6);
  }

  function render(W, H2) {
    cam.aspect = camOut.aspect = W / H2; cam.updateProjectionMatrix(); camOut.updateProjectionMatrix();
    renderer.autoClear = true; renderer.render(out, camOut);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(inn, cam); renderer.autoClear = true;
  }
  // ---------------- where to go: a marker over the thing to use next, and a nudge if you wander ----------------
  const wpProj = new THREE.Vector3();
  function goal() {
    if (V.seated) return null;
    if (V.step === 'board') return { at: COMMS, h: 1.5, name: '通訊台', say: '萊拉嘅訊息喺通訊台，跟住琥珀色標記行過去，' };
    if (V.step === 'toSeat' || V.step === 'reseat') return V.gK > 0.9 ? { at: SEAT, h: 1.3, name: '駕駛座', say: '去駕駛座坐低，我幫你快轉時間。跟住標記行過去，' } : null;
    if (V.step === 'orbit' && hatchLight.visible) return { at: HATCH, h: 0.6, name: '艙口', say: '到火星喇。艙口喺你後面，地板上面綠色嗰圈，' };
    return null;
  }
  function wpTick(dt, near) {
    const el = $('wp'), g = goal();
    if (!g) { el.classList.add('hidden'); V.idleT = 0; return; }
    el.classList.remove('hidden'); el.querySelector('b').textContent = g.name; el.classList.toggle('near', !!near);
    wpProj.set(g.at.x, g.h, g.at.z).project(cam);
    let x = wpProj.x, y = wpProj.y; const behind = wpProj.z > 1;
    if (behind) { x = -x; y = -y; if (Math.hypot(x, y) < 0.05) y = -1; }
    const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.8;
    if (off) { const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8); x /= m; y /= m; if (input.touch && x > 0.2 && y < 0.3) y = 0.3; }
    el.style.transform = `translate(${(x + 1) / 2 * innerWidth}px, ${(1 - y) / 2 * innerHeight}px)`;
    el.classList.toggle('off', off); el.classList.toggle('lft', x > 0.5);
    if (off) el.style.setProperty('--a', `${Math.atan2(-y, x) * 180 / Math.PI + 90}deg`);
    const d = Math.hypot(hero.st.pos.x - g.at.x, hero.st.pos.z - g.at.z);
    $('wpD').textContent = `${Math.max(0, d).toFixed(1)} m`; el.style.opacity = near ? '0.35' : '1';
    // not getting there: Sextant says it once more, plainly, with the key
    V.idleT = near ? 0 : (V.idleT || 0) + dt;
    if (V.idleT > 18) { V.idleT = -40; ui.say('六分儀', g.say + (input.touch ? '撳「互動」。' : '去到按 E。'), 5); }
  }
  function stop() { V.on = false; $('vhud').classList.add('hidden'); $('wp').classList.add('hidden'); ui.prompt(''); }
  return { start, update, render, stop, V, hero, cam, get step() { return V.step; } };
}
