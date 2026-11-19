// Beyond the Horizon · Vega: procedural model, movement (dazed → run, roll, jump), floors, Rocket Jack
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, dampAngle, GLSL_NOISE } from './util.js';
import { input, consume } from './input.js';
import { audio } from './audio.js';

// a limb segment: a lathed, slightly full shape (fabric over muscle), a ball joint, and a suit bearing ring
function limb(r0, r1, len, mat) {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, r = (r0 + (r1 - r0) * t) * (1 + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.15))); pts.push(new THREE.Vector2(Math.max(0.005, r * (i === 0 || i === 12 ? 0.85 : 1)), -t * len)); }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), mat); g.add(m);
  const j = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.05, 16, 12), mat); g.add(j);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r0 * 1.02, r0 * 0.12, 6, 20), RING); ring.rotation.x = Math.PI / 2; ring.position.y = -len * 0.06; g.add(ring);
  // suit convolutes: the fabric bellows that let a pressurised elbow or knee bend (shown on the suit's lower segments only)
  const bg = []; for (let i = 0; i < 3; i++) bg.push(new THREE.TorusGeometry(r0 * 1.3, r0 * 0.16, 8, 22).rotateX(Math.PI / 2).translate(0, -0.024 - i * 0.03, 0));
  const bel = new THREE.Mesh(mergeGeometries(bg), mat); bel.visible = false; g.add(bel);
  return g;
}
const RING = new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.45, metalness: 0.6 });
// sleeve patches: the mission emblem (a sun over a curved horizon) and an ID tab
const patchMat = (() => { const m = {}; return (emblem) => {
  const k = emblem ? 'e' : 'i'; if (m[k]) return m[k];
  const c = document.createElement('canvas'); c.width = 128; c.height = emblem ? 128 : 78; const g = c.getContext('2d');
  if (emblem) {
    g.fillStyle = '#c9752f'; g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#16202e'; g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#e7a35a'; g.beginPath(); g.arc(64, 182, 112, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4ead8'; g.beginPath(); g.arc(64, 56, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(244,234,216,0.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(64, 56, 30, 9, -0.3, 0, Math.PI * 2); g.stroke(); g.restore();
  } else {
    g.fillStyle = '#2a2f37'; g.fillRect(0, 0, 128, 78); g.fillStyle = '#c9752f'; g.fillRect(0, 0, 22, 78);
    g.fillStyle = '#e8e2d6'; g.font = 'bold 30px sans-serif'; g.fillText('BH-01', 32, 50);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (m[k] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 })); }; })();
// woven suit fabric: a faint ripstop grid
const fabricN = (() => { let t = null; return () => {
  if (t) return t; const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 16) { g.fillStyle = 'rgb(108,128,255)'; g.fillRect(i, 0, 2, S); g.fillStyle = 'rgb(148,128,255)'; g.fillRect(i + 2, 0, 1, S); g.fillStyle = 'rgb(128,108,255)'; g.fillRect(0, i, S, 2); g.fillStyle = 'rgb(128,148,255)'; g.fillRect(0, i + 2, S, 1); }
  for (let k = 0; k < 900; k++) { const v = 118 + Math.random() * 20; g.fillStyle = `rgb(${v},${256 - v},255)`; g.fillRect(Math.random() * S, Math.random() * S, 1, 1); }
  t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t; }; })();
// what a visor shows: sky, a warm horizon, the ground
const visorMap = (() => { let t = null; return () => {
  if (t) return t; const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#0b1018'); gr.addColorStop(0.42, '#2c3440'); gr.addColorStop(0.5, '#d8a070'); gr.addColorStop(0.56, '#5a3626'); gr.addColorStop(1, '#120c0a');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }; })();

const flameMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uT: { value: 0 }, uK: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform float uT, uK;
    void main(){ float y = 1.0 - vUv.y; float flick = 0.85 + 0.15 * sin(uT * 60.0 + y * 20.0);
      float a = pow(y, 1.6) * uK * flick; vec3 c = mix(vec3(0.35, 0.55, 1.0), vec3(0.95, 0.97, 1.0), pow(y, 4.0));
      gl_FragColor = vec4(c * a * 2.0, a); }`,
});

export function createPlayer(scene, opts = {}) {
  const suitWhite = new THREE.MeshStandardMaterial({ color: 0xc4cad2, roughness: 0.72, metalness: 0.02, normalMap: fabricN(), normalScale: new THREE.Vector2(0.6, 0.6) });
  const suitGrey = new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.6, metalness: 0.25 });
  const suitOrange = new THREE.MeshStandardMaterial({ color: 0xc6702e, roughness: 0.6 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3e4650, roughness: 0.9 });
  const coat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc49a80, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
  const visorM = new THREE.MeshStandardMaterial({ color: 0xffd9a8, map: visorMap(), roughness: 0.08, metalness: 0.85, emissive: 0xffffff, emissiveMap: visorMap(), emissiveIntensity: 0.18 });
  const rjBody = new THREE.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.42, metalness: 0.55 });
  const rjDark = new THREE.MeshStandardMaterial({ color: 0x5b6069, roughness: 0.38, metalness: 0.6 });
  const rjAccent = new THREE.MeshStandardMaterial({ color: 0xffc27a, emissive: 0xff9a40, emissiveIntensity: 0.6 });

  const root = new THREE.Group(); scene.add(root);
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
  // torso: lathed hips → waist → chest → shoulders, flattened front to back
  const tp = [[0.0, 0.012], [0.165, 0.0], [0.172, 0.06], [0.152, 0.17], [0.165, 0.28], [0.198, 0.4], [0.205, 0.5], [0.175, 0.585], [0.09, 0.62], [0.0, 0.625]].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(tp, 24), coat); torso.scale.set(1.12, 1, 0.82); torso.position.y = 0.0; hips.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.175, 20, 14), coat); chest.scale.set(1.12, 0.62, 0.78); chest.position.set(0, 0.5, 0.02); hips.add(chest);
  // suit details: collar ring, chest unit with its little lights, belt
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.03, 10, 28), suitGrey); collar.rotation.x = Math.PI / 2; collar.position.y = 0.63; hips.add(collar);
  const dcm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.06), suitGrey); dcm.position.set(0, 0.42, 0.17); hips.add(dcm);
  const dcmL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.016, 0.012), new THREE.MeshBasicMaterial({ color: 0x8ec9ff })); dcmL.position.set(0, 0.44, 0.205); hips.add(dcmL);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 28), suitGrey); belt.rotation.x = Math.PI / 2; belt.scale.set(1.1, 0.84, 1); belt.position.y = 0.08; hips.add(belt);
  const suitBits = [collar, dcm, dcmL, belt];
  const neck = new THREE.Group(); neck.position.y = 0.66; hips.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), skin); head.position.y = 0.13; head.scale.set(0.92, 1.05, 1); neck.add(head);
  // a face, so a bare head is a person and not a mannequin: brows, eyes, nose, mouth, ears, a day's stubble on the jaw
  { const F = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); head.add(o); return o; };
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e0d8, roughness: 0.3 }), iris = new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 0.2 });
    const lip = new THREE.MeshStandardMaterial({ color: 0x9a6656, roughness: 0.6 });
    const stub = new THREE.MeshStandardMaterial({ color: 0x5a463c, roughness: 0.95, transparent: true, opacity: 0.42, depthWrite: false });
    for (const sx of [-1, 1]) {
      F(new THREE.SphereGeometry(0.0135, 12, 10), white, sx * 0.037, 0.012, 0.096);
      F(new THREE.SphereGeometry(0.0072, 10, 8), iris, sx * 0.037, 0.012, 0.1085);
      const br = F(new THREE.BoxGeometry(0.036, 0.0075, 0.012), hair, sx * 0.039, 0.036, 0.104); br.rotation.z = -sx * 0.14; br.rotation.y = sx * 0.25;
      const ear = F(new THREE.SphereGeometry(0.026, 10, 8), skin, sx * 0.111, 0.002, -0.004); ear.scale.set(0.32, 1, 0.68);
    }
    const nose = F(new THREE.SphereGeometry(0.0145, 10, 8), skin, 0, -0.008, 0.112); nose.scale.set(0.72, 1.55, 1.05); nose.rotation.x = -0.25;
    F(new THREE.BoxGeometry(0.034, 0.0045, 0.006), lip, 0, -0.05, 0.103).rotation.x = 0.2;
    if (opts.stubble !== false) F(new THREE.SphereGeometry(0.1166, 20, 10, 0, Math.PI, Math.PI * 0.56, Math.PI * 0.33), stub, 0, 0, 0); }
  // hair: short, a hairline that sits back from the brow, fuller at the back
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.121, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.43), hair); hairM.position.set(0, 0.152, -0.008); hairM.rotation.x = -0.32; neck.add(hairM);
  { const back = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 12, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.32), hair); back.rotation.x = 0.32; back.position.set(0, -0.012, -0.004); hairM.add(back); }
  // the helmet shell has a real opening where the visor sits, so with the gold sun-visor raised you can see his face
  const VP0 = Math.PI * 0.08, VPL = Math.PI * 0.84, VT0 = Math.PI * 0.28, VTL = Math.PI * 0.38;
  const shellGeo = mergeGeometries([
    new THREE.SphereGeometry(0.19, 32, 24, VP0 + VPL, Math.PI * 2 - VPL),          // back and sides
    new THREE.SphereGeometry(0.19, 28, 8, VP0, VPL, 0, VT0),                         // brow
    new THREE.SphereGeometry(0.19, 28, 10, VP0, VPL, VT0 + VTL, Math.PI - VT0 - VTL), // chin
  ].map((g) => g.toNonIndexed()));
  const helmet = new THREE.Mesh(shellGeo, suitWhite); helmet.position.y = 0.13; neck.add(helmet);
  const lip = new THREE.Mesh(new THREE.SphereGeometry(0.1935, 32, 2, VP0 - 0.04, VPL + 0.08, VT0 - 0.03, 0.03), suitGrey); lip.position.y = 0.13; helmet.add(lip); lip.position.y = 0;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.193, 32, 18, VP0, VPL, VT0, VTL), visorM);
  visor.position.y = 0.13; neck.add(visor);
  // the clear pressure visor under the gold one: faint reflections, you see through it
  const clearM = new THREE.MeshStandardMaterial({ color: 0xcfe2ee, roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.16, envMapIntensity: 1.5, depthWrite: false });
  const pack = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.24, 6, 16), suitWhite); pack.scale.set(1.25, 1, 0.6); pack.position.set(0, 0.42, -0.2); hips.add(pack);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 24), suitOrange); stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.42; hips.add(stripe);
  // Rocket Jack: core + two thrust pods with flames
  const rj = new THREE.Group(); rj.position.set(0, 0.44, -0.24); hips.add(rj); rj.visible = false;
  const rjCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 6, 14), rjBody); rjCore.scale.set(1.25, 1, 0.62); rj.add(rjCore);
  const rjPanel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.02), rjDark); rjPanel.position.set(0, 0.02, -0.1); rj.add(rjPanel);
  const flames = [];
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 6, 14), rjDark); pod.position.set(0.22 * s, -0.06, -0.05); rj.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 6, 16), rjAccent); ring.rotation.x = Math.PI / 2; ring.position.set(0.22 * s, -0.36, -0.05); rj.add(ring);
    const fm = flameMat();
    // wide at the nozzle (y = 0), tapering to a point 1 unit below; scale.y sets the length
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1, 14, 1, true).rotateX(Math.PI).translate(0, -0.5, 0), fm);
    fl.position.set(0.22 * s, -0.38, -0.05); rj.add(fl); flames.push(fl);
  }
  const rjStrip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.2), rjAccent); rjStrip.position.y = 0.2; rj.add(rjStrip);
  const thrustLight = new THREE.PointLight(0x9fc4ff, 0, 30, 2); thrustLight.position.set(0, -1.2, -0.1); rj.add(thrustLight);

  // RJ-7 plasma shield: a magnetically held plasma bubble, brightest at the bow where it meets the air
  const shieldMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: { value: 0 }, uK: { value: 0 } },
    vertexShader: 'varying vec3 vO; varying vec3 vN; varying vec3 vV; void main(){ vO = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `${GLSL_NOISE} varying vec3 vO; varying vec3 vN; varying vec3 vV; uniform float uT, uK;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
        float bow = smoothstep(0.15, 1.0, vO.z);                       // the cap that meets the air
        float flow = fbm3(vec3(vO.x * 5.0, vO.y * 5.0, vO.z * 1.4 - uT * 9.0));
        float sheath = f * smoothstep(-0.9, 0.5, vO.z) * (0.25 + 0.9 * flow);   // plasma streaming back along the sides
        float a = (bow * bow * (0.55 + 0.6 * flow) + sheath * 0.55) * uK;
        vec3 c = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.86, 0.66), bow * bow);
        c = mix(c, vec3(0.7, 0.55, 1.0), f * (1.0 - bow) * 0.6);
        gl_FragColor = vec4(c * a * 1.6, a); }`,
  });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), shieldMat); shield.visible = false; root.add(shield);
  const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _o = new THREE.Vector3();

  const mkArm = (s) => {
    const sh = new THREE.Group(); sh.position.set(0.25 * s, 0.56, 0); hips.add(sh);
    const up = limb(0.06, 0.05, 0.3, coat); sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.3; up.add(el);
    const fo = limb(0.05, 0.045, 0.28, coat); el.add(fo);
    const hand = new THREE.Group(); hand.position.y = -0.3; fo.add(hand);
    const hm = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.05, 4, 10), skin); hm.scale.set(1.1, 1, 0.75); hm.position.y = -0.02; hand.add(hm);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 6), skin); th.position.set(0.035 * s, 0.0, 0.02); th.rotation.z = 0.5 * s; hm.add(th);
    return { sh, up, el, fo, hand, hm };
  };
  const mkLeg = (s) => {
    const hp = new THREE.Group(); hp.position.set(0.11 * s, 0, 0); hips.add(hp);
    const th = limb(0.085, 0.07, 0.46, cloth); hp.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.46; th.add(kn);
    const sh = limb(0.068, 0.055, 0.44, cloth); kn.add(sh);
    // an ankle, so the foot can land on its heel, lie flat, and push off the toe
    const an = new THREE.Group(); an.position.set(0, -0.44, 0); sh.add(an);
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.13, 4, 12), suitGrey); boot.rotation.x = Math.PI / 2; boot.scale.set(1.05, 1, 0.8); boot.position.set(0, -0.015, 0.045); an.add(boot);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.27), new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.9 })); sole.position.set(0, -0.06, 0.045); an.add(sole);
    return { hp, th, kn, sh, an, boot };
  };
  const armL = mkArm(1), armR = mkArm(-1), legL = mkLeg(1), legR = mkLeg(-1);
  // what makes it a worn suit and not a mannequin: ID stripes on thighs and upper arms, thigh pockets, knee pads,
  // glove and boot cuffs, a mission patch
  for (const [l, s] of [[legL, 1], [legR, -1]]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.009, 6, 26), suitOrange); band.rotation.x = Math.PI / 2; band.position.y = -0.14; l.th.add(band);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.12, 0.1), suitGrey); pocket.position.set(s * 0.104, -0.27, 0.01); l.th.add(pocket);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.104), suitGrey); flap.position.set(s * 0.106, -0.205, 0.01); l.th.add(flap);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), suitGrey); pad.rotation.x = Math.PI / 2; pad.scale.set(1.05, 0.45, 1.35); pad.position.set(0, -0.07, 0.098); l.sh.add(pad);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 22), suitGrey); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.415; l.sh.add(cuff);
    suitBits.push(band, pocket, flap, pad, cuff);
  }
  for (const [a, s] of [[armL, 1], [armR, -1]]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 24), suitOrange); band.rotation.x = Math.PI / 2; band.position.y = -0.15; a.up.add(band);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 22), suitGrey); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.265; a.fo.add(cuff);
    const patch = new THREE.Mesh(s > 0 ? new THREE.CircleGeometry(0.034, 24) : new THREE.PlaneGeometry(0.06, 0.036), patchMat(s > 0));
    patch.position.set(s * 0.083, -0.07, 0.0); patch.rotation.y = s * Math.PI / 2; a.up.add(patch);
    suitBits.push(band, cuff, patch);
  }

  // plasma cutter (Lyra's): a grip in the right hand, the emitter forward, a short plasma edge when lit
  const cutter = new THREE.Group(); cutter.visible = false; armR.hand.add(cutter);
  cutter.rotation.set(Math.PI / 2, 0, 0);                         // along the forearm's forward, edge out past the knuckles
  { const gm = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.45, metalness: 0.7 });
    const am = new THREE.MeshStandardMaterial({ color: 0xc8722e, roughness: 0.5 });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.2, 10), gm); grip.position.y = 0.02; cutter.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.05), gm); guard.position.y = 0.13; cutter.add(guard);
    const emit = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.12, 10), gm); emit.position.y = 0.2; cutter.add(emit);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.02, 10), am); band.position.y = -0.04; cutter.add(band); }
  const edgeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uK: { value: 0 }, uHeat: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
    fragmentShader: `varying vec2 vUv; varying vec3 vN, vV; uniform float uT, uK, uHeat;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(f, 3.0), flick = 0.85 + 0.15 * sin(uT * 70.0 + vUv.y * 30.0);
        vec3 c = mix(vec3(0.45, 0.75, 1.0), vec3(1.0, 0.62, 0.3), uHeat);      // blue-white when cool, orange as it heats
        c = mix(c, vec3(1.0), core * 0.7);
        float a = (0.25 + core) * flick * uK * smoothstep(0.0, 0.1, vUv.y);
        gl_FragColor = vec4(c * a * 1.6, a); }`,
  });
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.028, 0.95, 12, 1, true).translate(0, 0.475, 0), edgeMat); edge.position.y = 0.26; cutter.add(edge);
  const edgeLight = new THREE.PointLight(0x9fc8ff, 0, 6, 2); edgeLight.position.y = 0.6; cutter.add(edgeLight);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; scene.add(shadow); shadow.visible = !opts.noShadow;

  const st = {
    pos: new THREE.Vector3(), vy: 0, yaw: 0, onGround: true, speed: 0, phase: 0, g: 9.81,
    hp: 100, maxHp: 100, healed: false, hasSuit: false, hasRocket: false,
    dodge: { t: 0, cd: 0, dir: new THREE.Vector3() }, inv: 0, hurtT: 0, frozen: false, lying: 0,
    knock: new THREE.Vector3(), dead: false, radius: 0.35, mode: 'walk', thrust: 0, fell: false, lastSafe: new THREE.Vector3(),
    stagger: 0, getUp: false, thrown: false,          // thrown by a blast: airborne, then down, then back up
    heavy: 1,                                        // walking speed factor (2 g on the ship: slower, shorter steps)
    vel: new THREE.Vector3(),
  };
  const setSuit = (on) => {
    st.hasSuit = on;
    const a = on ? suitWhite : coat, b = on ? suitGrey : coat, legA = on ? suitWhite : cloth, legB = on ? suitGrey : cloth;
    [torso, chest].forEach((m) => (m.material = a));
    [armL, armR].forEach((r) => { r.up.children[0].material = a; r.up.children[1].material = a; r.fo.children[0].material = a; r.fo.children[1].material = a; r.hm.material = on ? suitGrey : skin; r.hm.children.forEach((c) => (c.material = r.hm.material)); });
    [legL, legR].forEach((l) => { l.th.children[0].material = legA; l.sh.children[0].material = legA; l.th.children[1].material = on ? legA : legB; l.sh.children[1].material = on ? legA : legB; });
    helmet.visible = visor.visible = stripe.visible = on; visor.material = visorM; visor.renderOrder = 0; pack.visible = on && !st.hasRocket; head.visible = hairM.visible = !on;
    suitBits.forEach((m) => (m.visible = on));
    // a pressure suit is bulky: fuller limbs, broader torso (meshes only, so the joints stay where they are)
    const bk = on ? 1.22 : 1;
    [armL.up, armL.fo, armR.up, armR.fo, legL.th, legL.sh, legR.th, legR.sh].forEach((g) => { g.children[0].scale.set(bk, 1, bk); g.children[1].scale.setScalar(on ? bk * 0.9 : 1); });   // the ball stays inside the fabric: a suit shoulder is a bearing, not a ball
    torso.scale.set(1.12 * (on ? 1.1 : 1), 1, 0.82 * (on ? 1.12 : 1));
    [armL, armR].forEach((r) => { r.up.children[2].visible = r.fo.children[2].visible = on; });
    [legL, legR].forEach((l) => { l.th.children[2].visible = l.sh.children[2].visible = on; });
    // elbows and knees bend on convolutes, not on a bearing ring or a ball
    [armL.fo, armR.fo, legL.sh, legR.sh].forEach((g) => { g.children[3].visible = on; g.children[3].material = g.children[0].material; g.children[2].visible = false; if (on) g.children[1].scale.setScalar(bk * 0.86); });
  };
  const setRocket = (on) => { st.hasRocket = on; rj.visible = on; pack.visible = st.hasSuit && !on; };
  const setHelmet = (on) => { helmet.visible = visor.visible = on; head.visible = hairM.visible = !on; pack.visible = on && st.hasSuit && !st.hasRocket; };   // on board: helmet and life-support pack off
  // gold sun-visor up (face visible through the clear one) or down
  // the visor's painted sky reflection: dimmed in the dark, where there is nothing bright for it to mirror
  const setVisorGlow = (k) => { visorM.emissiveIntensity = k; visorM.envMapIntensity = 0.4 + k * 3; };
  const setVisorUp = (up) => { if (!helmet.visible) return; visor.material = up ? clearM : visorM; head.visible = hairM.visible = up; visor.renderOrder = up ? 2 : 0; };
  setSuit(false);

  function collide(cols) {
    const r = st.radius, p = st.pos;
    for (let it = 0; it < 2; it++) {
      for (const c of cols) {
        if (!c.on || p.y + 1.7 < c.min[1] || p.y >= c.max[1] - 0.45) continue;   // over it (or a low step): no wall
        const cx = clamp(p.x, c.min[0], c.max[0]), cz = clamp(p.z, c.min[2], c.max[2]);
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2), push = r - d; p.x += dx / d * push; p.z += dz / d * push; }
        else {
          const l = p.x - c.min[0], rr = c.max[0] - p.x, b = p.z - c.min[2], f = c.max[2] - p.z, m = Math.min(l, rr, b, f);
          if (m === l) p.x = c.min[0] - r; else if (m === rr) p.x = c.max[0] + r; else if (m === b) p.z = c.min[2] - r; else p.z = c.max[2] + r;
        }
      }
    }
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3(), prev = new THREE.Vector3();
  function update(dt, camYaw, cols, t, world) {
    prev.copy(st.pos);
    st.inv = Math.max(0, st.inv - dt); st.hurtT = Math.max(0, st.hurtT - dt); st.dodge.cd = Math.max(0, st.dodge.cd - dt);
    fwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw)); right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    if (st.stagger > 0) st.stagger = Math.max(0, st.stagger - dt);
    if (st.getUp) { st.lying = Math.max(0, st.lying - dt * 1.3); if (st.lying <= 0) st.getUp = false; }
    const free = !st.frozen && !st.dead && st.lying <= 0 && !st.thrown;
    want.set(0, 0, 0);
    if (free) want.addScaledVector(fwd, input.move.y).addScaledVector(right, input.move.x);
    const mag = Math.min(1, want.length()); if (mag > 0.01) want.normalize();
    const sprint = st.healed && (input.held.has('sprint') || (input.touch && mag > 0.96));
    const hurt = 0.45 + 0.55 * clamp(st.hp / 100, 0, 1);          // injured: everything slower until you recover
    const maxV = (!st.healed ? 1.6 : sprint ? 5.8 : 3.4) * hurt * st.heavy;
    const targetV = mag * maxV * (st.onGround ? 1 : 0.85);

    if (free && consume('dodge') && st.dodge.cd <= 0 && st.dodge.t <= 0 && st.healed && st.onGround) {
      st.dodge.t = 0.45; st.dodge.cd = 0.7; st.inv = 0.3;
      st.dodge.dir.copy(mag > 0.1 ? want : new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw)));
      st.yaw = Math.atan2(st.dodge.dir.x, st.dodge.dir.z); audio.burst(500, 0.18, 0.12);
    }
    if (free && consume('jump') && st.onGround && st.healed) { st.vy = 4.3; st.onGround = false; }

    let vx = 0, vz = 0;
    if (st.dodge.t > 0) { st.dodge.t -= dt; const k = 9.5 * (st.dodge.t / 0.45 + 0.25); vx = st.dodge.dir.x * k; vz = st.dodge.dir.z * k; }
    else {
      st.speed = damp(st.speed, targetV, st.onGround ? 10 : 3, dt);
      if (mag > 0.05) st.yaw = dampAngle(st.yaw, Math.atan2(want.x, want.z), 12, dt);
      const dir = mag > 0.05 ? want : new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
      vx = dir.x * st.speed; vz = dir.z * st.speed;
    }
    vx += st.knock.x; vz += st.knock.z; st.knock.multiplyScalar(Math.exp(-5 * dt));
    st.pos.x += vx * dt; st.pos.z += vz * dt;
    collide(cols);

    // vertical: local gravity (weakening as the tides grow), floors, pits
    const floor = world ? world.floorAt(st.pos.x, st.pos.z, st.pos.y) : 0;
    if (st.onGround) {
      if (floor < st.pos.y - 0.06) st.onGround = false;
      else { st.pos.y = floor; st.vy = 0; }
    }
    if (!st.onGround) {
      st.vy -= st.g * dt; st.pos.y += st.vy * dt;
      if (st.pos.y <= floor) {
        st.pos.y = floor; const impactV = -st.vy;
        if (impactV > 9.5) damage(Math.round((impactV - 9.5) * 7));
        st.vy = 0; st.onGround = true;
        if (st.thrown) { st.thrown = false; st.stagger = 0; st.lying = 1; st.getUp = true; st.knock.multiplyScalar(0.3); audio.burst(160, 0.3, 0.3, 'lowpass'); }
      }
    }
    if (st.onGround && floor >= 0) st.lastSafe.copy(st.pos);
    if (st.pos.y < -2.5 && !st.fell) st.fell = true;      // dropped into a fissure: the game handles it
    st.vel.subVectors(st.pos, prev).divideScalar(Math.max(dt, 1e-4));

    animate(dt, t, mag);
    root.position.copy(st.pos); root.rotation.set(0, st.yaw, 0);
    shadow.position.set(st.pos.x, Math.max(0, floor) + 0.012, st.pos.z); shadow.material.opacity = 0.4 / (1 + Math.max(0, st.pos.y - floor) * 0.6);
  }

  function animate(dt, t, mag) {
    const spd = st.dodge.t > 0 ? 6 : st.speed;
    st.phase += dt * (spd > 0.05 ? (st.healed ? 2.2 + spd * 1.55 : 4.0) : 0);
    const ph = st.phase, s = Math.sin(ph), c = Math.cos(ph);
    const amp = Math.min(1, spd / 3.4) * 0.75, run = Math.min(1, Math.max(0, (spd - 3.6) / 2.2));   // 0 walking .. 1 sprinting
    const a2 = amp * (1 + run * 0.35);
    let bodyY = -Math.abs(c) * (0.05 + run * 0.05) * amp, tilt = spd * 0.03 + run * 0.12, roll = 0;
    legL.hp.rotation.x = s * a2; legR.hp.rotation.x = -s * a2;
    legL.kn.rotation.x = Math.max(0, -c) * (1.1 + run * 0.7) * amp + 0.05 + run * 0.15; legR.kn.rotation.x = Math.max(0, c) * (1.1 + run * 0.7) * amp + 0.05 + run * 0.15;
    // feet: flat while they carry weight, heel first as they land, toe last as they leave
    for (const [L, sg] of [[legL, 1], [legR, -1]]) {
      const back = sg * s, swing = sg * c < 0;
      L.an.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x) * 0.85 + Math.max(0, back) * 0.35 * amp - (swing ? 0.12 * amp : 0);
    }
    // the pelvis turns with the stepping leg and the shoulders turn against it; the head stays on the road
    const tw = -s * (0.09 + run * 0.06) * amp;
    hips.rotation.y = tw; legL.hp.rotation.y = legR.hp.rotation.y = -tw * 1.6; neck.rotation.y = -tw * 0.9;
    body.position.z = 0; const sway = c * 0.022 * amp * (1 - run * 0.5);
    armL.sh.rotation.set(-s * (0.5 + run * 0.35) * amp, 0, 0.08 + run * 0.08); armR.sh.rotation.set(s * (0.5 + run * 0.35) * amp, 0, -0.08 - run * 0.08);
    armL.el.rotation.x = -0.25 - run * 1.0 - Math.max(0, s) * 0.3; armR.el.rotation.x = -0.25 - run * 1.0 - Math.max(0, -s) * 0.3;
    // standing still: breathing, weight drifting foot to foot, glancing round at a world coming apart
    const idle = Math.max(0, 1 - spd / 0.4);
    if (idle > 0 && st.mode === 'walk') {
      roll += Math.sin(t * 0.45) * 0.018 * idle;
      const look = st.lookAround ?? 1;
      neck.rotation.y += (Math.sin(t * 0.21) * 0.35 + Math.sin(t * 0.53) * 0.12) * idle * look; neck.rotation.x = Math.sin(t * 0.17) * 0.06 * idle * look;
      armL.sh.rotation.z += Math.sin(t * 1.6) * 0.012 * idle; armR.sh.rotation.z -= Math.sin(t * 1.6) * 0.012 * idle;
      armL.el.rotation.x -= 0.1 * idle; armR.el.rotation.x -= 0.1 * idle;
    } else neck.rotation.x = 0;
    if ((!st.healed || st.hp < 65) && spd > 0.1) { roll = Math.sin(ph * 0.5) * (st.healed ? 0.09 : 0.06); tilt += 0.08; bodyY -= Math.max(0, Math.sin(ph)) * 0.05; }    // dazed or hurt: stumbling, limping
    if (st.dodge.t > 0) { const k = Math.sin((1 - st.dodge.t / 0.45) * Math.PI); tilt = 0.9 * k; bodyY -= 0.35 * k; }
    if (!st.onGround && st.mode === 'walk') { legL.kn.rotation.x = 0.6; legR.kn.rotation.x = 0.3; legL.hp.rotation.x = -0.3; }
    if (st.mode === 'fly') {
      // standing in the jets: upright, knees soft, legs trailing a little, arms out for balance
      const sw = Math.sin(t * 2.1) * 0.04;
      legL.hp.rotation.x = 0.18 + sw; legR.hp.rotation.x = 0.06 - sw; legL.kn.rotation.x = 0.42; legR.kn.rotation.x = 0.26;
      armL.sh.rotation.set(-0.15 + sw, 0, 0.5); armR.sh.rotation.set(-0.15 - sw, 0, -0.5); armL.el.rotation.x = armR.el.rotation.x = -0.35;
      tilt = 0.05; bodyY = 0;
    }
    if (st.mode === 'sit') {
      // in a pilot seat: thighs level, shins down, hands on the armrests
      legL.hp.rotation.x = legR.hp.rotation.x = -1.42; legL.kn.rotation.x = legR.kn.rotation.x = 1.45;
      armL.sh.rotation.set(-0.55, 0, 0.12); armR.sh.rotation.set(-0.55, 0, -0.12); armL.el.rotation.x = armR.el.rotation.x = -0.95;
      tilt = -0.08; bodyY = -0.43; roll = 0;
    }
    if (st.mode === 'float') {
      // weightless: limbs drift loose, half-bent
      const a = Math.sin(t * 0.9), b = Math.sin(t * 0.7 + 1.3);
      legL.hp.rotation.x = -0.25 + a * 0.08; legR.hp.rotation.x = -0.05 - a * 0.08; legL.kn.rotation.x = 0.55 + b * 0.05; legR.kn.rotation.x = 0.35 - b * 0.05;
      armL.sh.rotation.set(-0.35 + b * 0.06, 0, 0.55); armR.sh.rotation.set(-0.3 - b * 0.06, 0, -0.55); armL.el.rotation.x = armR.el.rotation.x = -0.6;
      tilt = 0.12 + a * 0.04; bodyY = 0; roll = b * 0.05;
    }
    chest.scale.y = 0.7 + Math.sin(t * 1.6) * 0.012;
    if (st.thrown && st.lying <= 0) { const k = 1 - st.stagger; body.rotation.x = -1.3 * Math.min(1, k * 1.6); body.position.y = 0.3 * k; armL.sh.rotation.set(-2.2, 0, 0.6); armR.sh.rotation.set(-2.2, 0, -0.6); }
    else if (st.lying > 0) { body.rotation.x = -Math.PI / 2 * Math.min(1, st.lying); body.position.y = 0.2 * Math.min(1, st.lying); }
    else { body.rotation.x = damp(body.rotation.x, tilt, 10, dt); body.position.y = damp(body.position.y, bodyY, 14, dt); }
    body.rotation.z = damp(body.rotation.z, roll, 8, dt);
    body.position.x = (st.hurtT > 0 ? Math.sin(t * 60) * 0.02 * st.hurtT : 0) + (st.mode === 'walk' && st.onGround ? sway : 0);
    // Rocket Jack flames
    for (const f of flames) { f.material.uniforms.uT.value = t; f.material.uniforms.uK.value = st.thrust; f.scale.set(1 + st.thrust * 0.4, 0.3 + st.thrust * 2.6, 1 + st.thrust * 0.4); }
    thrustLight.intensity = st.thrust * 60;
    rjAccent.emissiveIntensity = 0.1 + st.thrust * 1.1;      // the nozzle rings only glow when it burns
    shieldMat.uniforms.uT.value = t; edgeMat.uniforms.uT.value = t;
    if (rig.pose) rig.pose(dt, t);                 // combat (or anything else) can take over the limbs after the base pose
  }
  // k: 0..1 glow; dir: world direction of travel (the bow faces it)
  function setShield(k, dir) {
    shield.visible = k > 0.01; if (!shield.visible) return;
    shieldMat.uniforms.uK.value = k;
    _q.setFromUnitVectors(_z, _o.copy(dir).normalize()).premultiply(root.quaternion.clone().invert());
    shield.quaternion.copy(_q); shield.scale.set(1.0, 1.1, 1.45 + k * 0.35);
    shield.position.set(0, 1.0, 0).add(_o.set(0, 0, 0.3 + k * 0.2).applyQuaternion(_q));
  }
  function damage(n, from, knock = 5) {
    if (st.inv > 0 || st.dead || n <= 0) return false;
    st.hp = Math.max(0, st.hp - n); st.hurtT = 0.4; st.inv = 0.5;
    if (from) { const k = new THREE.Vector3().subVectors(st.pos, from).setY(0); if (k.lengthSq() < 1e-4) k.set(1, 0, 0); st.knock.copy(k.normalize().multiplyScalar(knock)); }
    if (knock >= 8 && st.mode === 'walk') { st.vy = 4.6; st.onGround = false; st.stagger = 1; st.thrown = true; st.yaw = Math.atan2(-st.knock.x, -st.knock.z); }   // blown off your feet, facing the blast
    audio.burst(200, 0.25, 0.3, 'lowpass');
    if (st.hp <= 0) st.dead = true;
    return true;
  }
  const rig = { body, hips, armL, armR, legL, legR, neck, cutter, edge, edgeMat, edgeLight, pose: null };
  function setCutter(on, k = 0, heat = 0) {
    cutter.visible = on; edgeMat.uniforms.uK.value = k; edgeMat.uniforms.uHeat.value = heat; edge.visible = k > 0.01;
    edgeLight.intensity = k * 1.4;          // enough to tint the suit beside it, never to blow it out
    edgeLight.color.setRGB(lerpC(0.62, 1, heat), lerpC(0.78, 0.62, heat), lerpC(1, 0.35, heat));
  }
  const lerpC = (a, b, k) => a + (b - a) * k;
  return {
    root, st, update, damage, setSuit, setRocket, setHelmet, setVisorUp, setVisorGlow, shadow, animate, setShield, rig, setCutter,
    heal() { st.healed = true; },
    headPos(v) { return v.set(st.pos.x, st.pos.y + 1.62, st.pos.z); },
    place(p, yaw = 0) { st.pos.copy(p); st.yaw = yaw; st.vy = 0; st.onGround = true; st.knock.set(0, 0, 0); st.fell = false; st.thrown = false; st.stagger = 0; st.getUp = false; st.lastSafe.copy(p); root.position.copy(p); },
  };
}
