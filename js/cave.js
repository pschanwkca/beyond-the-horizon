// Beyond the Horizon · the lava tube under the plain: a skylight you drop through, brine pools, the blind walkers'
// galleries, and at the far end the warm chamber where the guardian keeps the shard.
// A lava tube is the drained channel of an old lava flow: a long arched tunnel, here ~10 m high and 12–18 m wide,
// opening into a wider chamber. The shard's steady heat keeps the perchlorate brine liquid (the salt lowers its
// freezing point to about −70 °C), so microbial mats grow round the pools and things that eat them.
import * as THREE from 'three';
import { makeEnv } from './env.js';
import { clamp, smooth, lerp, mulberry, canvasTex, GLSL_NOISE } from './util.js';

// the path of the tube (x, z), metres; the skylight is over the first point
const PATH = [[0, 0], [2, 18], [-6, 38], [-4, 58], [8, 78], [14, 96], [10, 114], [2, 130], [0, 146], [0, 166]];
const CH_C = 2;                       // samples per metre
export function createCave(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0706, 0.022);
  scene.background = new THREE.Color(0x030202);
  // dim reflections: black rock, a warm glow up the tube, cold blue frost underfoot
  scene.environment = makeEnv(renderer, { zenith: 0x0c0806, horizon: 0x2a1a12, ground: 0x0e1418, sun: new THREE.Vector3(0, 1, 0.3), sunColor: 0xffb070, sunK: 0.25, band: 0.1, gain: 0.6 });
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = curve.getLength(), N = Math.ceil(L * CH_C);
  const S = [];                       // samples: point, tangent, side, half width, height
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u), tg = curve.getTangentAt(u).setY(0).normalize();
    const s = u * L;
    const chamber = smooth(L - 40, L - 22, s), end = smooth(L - 6, L, s);
    const w = lerp(6.5 + 1.6 * Math.sin(s * 0.09) + 0.8 * Math.sin(s * 0.23 + 1), 19, chamber) * (1 - end * 0.85);
    const h = lerp(8.5 + 1.5 * Math.sin(s * 0.07 + 2), 15, chamber) * (1 - end * 0.6);
    S.push({ p, tg, side: new THREE.Vector3(tg.z, 0, -tg.x), w: Math.max(0.6, w), h, s });
  }
  const ENTRY = S[6].p.clone(), CHAMBER = S[Math.round((L - 20) * CH_C)].p.clone(), SHARD = CHAMBER.clone();
  const SKY = S[0].p.clone();

  // ---------------- the tunnel shell ----------------
  const RING = 48, pos = [], uv = [], idx = [];
  const R0 = mulberry(4);
  const bump = (a, b) => (Math.sin(a * 1.7 + b * 0.31) * 0.5 + Math.sin(a * 4.1 - b * 0.73) * 0.25 + Math.sin(a * 9.3 + b * 1.9) * 0.12);
  for (let i = 0; i <= N; i++) {
    const { p, side, w, h, s } = S[i];
    for (let j = 0; j <= RING; j++) {
      const th = j / RING * Math.PI;                    // 0 = right floor edge, π = left floor edge, over the top
      const n = 1 + 0.08 * bump(th * 3, s * 0.4) + 0.05 * bump(th * 7 + 3, s * 1.3);
      const x = Math.cos(th) * w * n, y = Math.sin(th) * h * n - 0.2 + (th < 0.15 || th > Math.PI - 0.15 ? -0.3 : 0);
      pos.push(p.x + side.x * x, y, p.z + side.z * x); uv.push(j / RING * 6, s / 6);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < RING; j++) {
    const a = i * (RING + 1) + j, b = a + RING + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  const rockTex = canvasTex(512, 512, (g, w) => {
    const R = mulberry(12); g.fillStyle = '#4a3530'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 2200; i++) { const v = R(); g.fillStyle = v < 0.5 ? `rgba(20,12,10,${0.1 + R() * 0.2})` : `rgba(140,96,80,${0.05 + R() * 0.12})`; g.beginPath(); g.arc(R() * w, R() * w, 1 + R() * 10, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(15,8,6,0.5)'; for (let i = 0; i < 60; i++) { g.lineWidth = 1 + R() * 2; g.beginPath(); let x = R() * w, y = R() * w; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 60; y += R() * 30; g.lineTo(x, y); } g.stroke(); }
    // white salt bloom low on the walls
    const gr = g.createLinearGradient(0, 0, 0, w); gr.addColorStop(0, 'rgba(230,224,214,0)'); gr.addColorStop(0.9, 'rgba(230,224,214,0)'); gr.addColorStop(1, 'rgba(230,224,214,0.0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { repeat: true });
  const wall = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.93, metalness: 0, side: THREE.DoubleSide, color: 0xbfa59a });
  wall.onBeforeCompile = (sh) => {     // frost and salt near the floor, more of it as the chamber cools (uFrost)
    sh.uniforms.uFrost = frostU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uFrost;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat fr = smoothstep(1.6, 0.0, vWp.y) * 0.55 + uFrost * smoothstep(9.0, 0.0, vWp.y) * 0.8;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.82), clamp(fr, 0.0, 0.9));');
  };
  const frostU = { value: 0 };
  const shell = new THREE.Mesh(tg, wall); shell.receiveShadow = true; scene.add(shell);

  // floor: a strip under the tube, gently uneven, darker basalt with sand drifts
  const fpos = [], fidx = [], fuv = [];
  for (let i = 0; i <= N; i++) {
    const { p, side, w, s } = S[i];
    for (let j = 0; j <= 16; j++) { const x = (j / 16 * 2 - 1) * (w + 0.4); fpos.push(p.x + side.x * x, floorBump(p.x + side.x * x, p.z + side.z * x), p.z + side.z * x); fuv.push(j / 16 * w / 3, s / 3); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 16; j++) { const a = i * 17 + j, b = a + 17; fidx.push(a, b, a + 1, a + 1, b, b + 1); }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2)); fg.setIndex(fidx); fg.computeVertexNormals();
  const floorTex = canvasTex(512, 512, (g, w) => { const R = mulberry(21); g.fillStyle = '#3a2b26'; g.fillRect(0, 0, w, w); for (let i = 0; i < 3000; i++) { g.fillStyle = R() < 0.6 ? `rgba(15,9,7,${0.15 + R() * 0.25})` : `rgba(150,105,80,${0.08 + R() * 0.15})`; g.fillRect(R() * w, R() * w, 1 + R() * 4, 1 + R() * 4); } }, { repeat: true });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.96, color: 0xc8b0a4 });
  floorMat.onBeforeCompile = (sh) => {    // the floor frosts only as the chamber cools
    sh.uniforms.uFrost = frostU;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFrost;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.82), uFrost * 0.55);');
  };
  const floor = new THREE.Mesh(fg, floorMat); floor.receiveShadow = true; scene.add(floor);
  function floorBump(x, z) { return 0.12 * Math.sin(x * 0.7) * Math.sin(z * 0.45) + 0.08 * Math.sin(x * 2.1 + z * 1.3); }

  // ---------------- light ----------------
  const hemi = new THREE.HemisphereLight(0x6a5a64, 0x1a0e0a, 0.18); scene.add(hemi);
  // daylight down the skylight: a hard pool on the sand, a beam in the dust
  const skyL = new THREE.SpotLight(0xffd6b0, 150, 40, 0.42, 0.55, 1.6); skyL.position.set(SKY.x, 22, SKY.z); skyL.target.position.copy(SKY); skyL.castShadow = true; skyL.shadow.mapSize.set(1024, 1024);
  scene.add(skyL, skyL.target);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 5.2, 13, 32, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `${GLSL_NOISE} uniform float uT; varying vec2 vUv; varying vec3 vP; void main(){ float n = fbm3(vec3(vP.x * 0.5, vP.y * 0.3 - uT * 0.2, vP.z * 0.5));
      float a = (0.03 + 0.05 * n) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y); gl_FragColor = vec4(vec3(1.0, 0.82, 0.62) * a, 1.0); }`,
  })); beam.position.set(SKY.x, 6.5, SKY.z); scene.add(beam);
  const skyHole = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), new THREE.MeshBasicMaterial({ color: 0xb89a80, fog: false })); skyHole.rotation.x = Math.PI / 2; skyHole.position.set(SKY.x, S[0].h - 0.4, SKY.z); scene.add(skyHole);
  const sand = new THREE.Mesh(new THREE.ConeGeometry(5.5, 1.4, 40), floorMat); sand.position.set(SKY.x, 0.55, SKY.z); sand.receiveShadow = true; scene.add(sand);
  // the shard: an amber prism on a basalt plinth, warm enough to light the whole chamber
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 1.2, 9), new THREE.MeshStandardMaterial({ color: 0x241a17, roughness: 0.8 })); plinth.position.copy(SHARD).setY(0.6); plinth.castShadow = plinth.receiveShadow = true; scene.add(plinth);
  const shardM = new THREE.MeshStandardMaterial({ color: 0x5a2400, emissive: 0xffa040, emissiveIntensity: 3.2, roughness: 0.2, metalness: 0.1 });
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), shardM); shard.scale.set(0.6, 1.5, 0.6); shard.position.copy(SHARD).setY(1.95); scene.add(shard);
  const shardL = new THREE.PointLight(0xff9a40, 140, 40, 1.8); shardL.position.copy(SHARD).setY(2.4); shardL.castShadow = true; shardL.shadow.mapSize.set(512, 512); scene.add(shardL); let shardBase = 140;
  // the helmet lamp: follows where you look
  const lamp = new THREE.SpotLight(0xeef2ff, 60, 30, 0.48, 0.6, 1.6); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0006; scene.add(lamp, lamp.target);
  // a soft light that rides with the camera, so Vega reads against the dark (a character light, as film sets use)
  const fillL = new THREE.PointLight(0xc8d4ff, 2.2, 9, 2); scene.add(fillL);

  // ---------------- brine, mats, salt ----------------
  const R = mulberry(33);
  const brineM = new THREE.MeshStandardMaterial({ color: 0x0c1416, roughness: 0.04, metalness: 0.5, transparent: true, opacity: 0.88 });
  const matM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `${GLSL_NOISE} uniform float uT, uK; varying vec2 vUv; void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0;
      float n = fbm3(vec3(vUv * 7.0, uT * 0.15)); float web = smoothstep(0.45, 0.62, n) * smoothstep(1.0, 0.4, r);
      float pulse = 0.65 + 0.35 * sin(uT * 1.3 + n * 9.0);
      gl_FragColor = vec4(mix(vec3(0.1, 0.9, 0.7), vec3(0.35, 0.55, 1.0), n) * web * pulse * 0.8 * uK, 1.0); }`,
  });
  const lights = [];
  const pools = [];
  for (let i = 0; i < 9; i++) {
    const k = 16 + Math.floor(R() * (N - 70)), smp = S[k], off = (R() < 0.5 ? -1 : 1) * (smp.w * (0.35 + R() * 0.3));
    const c = smp.p.clone().addScaledVector(smp.side, off), r = 1.6 + R() * 2.4;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 32), brineM); pool.rotation.x = -Math.PI / 2; pool.position.set(c.x, floorBump(c.x, c.z) + 0.04, c.z); pool.receiveShadow = true; scene.add(pool); pools.push(pool);
    const mat = new THREE.Mesh(new THREE.CircleGeometry(r * 1.9, 32), matM); mat.rotation.x = -Math.PI / 2; mat.position.set(c.x, floorBump(c.x, c.z) + 0.06, c.z); scene.add(mat);
    if (i % 2 === 0 && lights.length < 4) { const l = new THREE.PointLight(0x40ffc8, 6, 12, 2); l.position.set(c.x, 0.8, c.z); scene.add(l); lights.push(l); }
    // salt crystals on the rims
    for (let j = 0; j < 6; j++) {
      const a = R() * Math.PI * 2, rr = r * (1 + R() * 0.3), cr = new THREE.Mesh(new THREE.ConeGeometry(0.06 + R() * 0.08, 0.3 + R() * 0.5, 5), new THREE.MeshStandardMaterial({ color: 0xf0ece6, roughness: 0.3, transparent: true, opacity: 0.85 }));
      cr.position.set(c.x + Math.cos(a) * rr, 0.15, c.z + Math.sin(a) * rr); cr.rotation.set((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6); scene.add(cr);
    }
  }
  // wall mats, glowing threads up the walls
  for (let i = 0; i < 26; i++) {
    const k = 10 + Math.floor(R() * (N - 20)), smp = S[k], th = 0.2 + R() * 0.9, sideS = R() < 0.5 ? 1 : -1;
    const x = Math.cos(sideS > 0 ? th : Math.PI - th) * smp.w * 0.97, y = Math.sin(th) * smp.h * 0.97;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 + R() * 3, 2 + R() * 3), matM);
    m.position.set(smp.p.x + smp.side.x * x, y, smp.p.z + smp.side.z * x);
    m.lookAt(smp.p.x, y * 0.6 + 1, smp.p.z); scene.add(m);
  }
  // rock fall and boulders (scenery; the big ones block)
  const blockers = [];
  const bm = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, color: 0x9a8078 });
  for (let i = 0; i < 40; i++) {
    const k = 8 + Math.floor(R() * (N - 60)), smp = S[k], off = (R() * 2 - 1) * smp.w * 0.85, sz = 0.3 + Math.pow(R(), 3) * 2.2;
    const c = smp.p.clone().addScaledVector(smp.side, off);
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 1), bm); b.position.set(c.x, sz * 0.4, c.z); b.rotation.set(R() * 3, R() * 3, R() * 3); b.scale.y = 0.7;
    b.castShadow = b.receiveShadow = true; scene.add(b);
    if (sz > 1.1) blockers.push({ x: c.x, z: c.z, r: sz * 0.9 });
  }

  { const s0 = S[0], back = s0.p.clone().addScaledVector(s0.tg, -3.5);
    for (let i = 0; i < 7; i++) { const r = 3.5 + R() * 3; const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), bm); b.position.set(back.x + s0.side.x * (i - 3) * 3.2, r * 0.6 + (i % 2) * 3, back.z + s0.side.z * (i - 3) * 3.2); b.scale.y = 0.8; b.castShadow = b.receiveShadow = true; scene.add(b); }
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x1a120f, roughness: 1 })); cap.position.copy(back).addScaledVector(s0.tg, -3).setY(9); cap.lookAt(s0.p.x, 9, s0.p.z); scene.add(cap); }

  // ---------------- queries ----------------
  // nearest sample along the path: lateral offset, the sample itself
  function locate(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= N; i += 2) { const d = (S[i].p.x - x) ** 2 + (S[i].p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    for (let i = Math.max(0, best - 2); i <= Math.min(N, best + 2); i++) { const d = (S[i].p.x - x) ** 2 + (S[i].p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    const smp = S[best]; const dx = x - smp.p.x, dz = z - smp.p.z;
    return { i: best, smp, lat: dx * smp.side.x + dz * smp.side.z, lon: dx * smp.tg.x + dz * smp.tg.z };
  }
  // keep a body (radius r) inside the tube and off the boulders
  function bound(p, r) {
    const L0 = locate(p.x, p.z), lim = L0.smp.w * 0.86 - r;
    if (Math.abs(L0.lat) > lim) { const k = Math.sign(L0.lat) * lim - L0.lat; p.x += L0.smp.side.x * k; p.z += L0.smp.side.z * k; }
    if (L0.i < 2 && L0.lon < 0) { p.x -= L0.smp.tg.x * L0.lon; p.z -= L0.smp.tg.z * L0.lon; }
    if (L0.i > N - 10) { const e = S[N - 10]; const lon = (p.x - e.p.x) * e.tg.x + (p.z - e.p.z) * e.tg.z; if (lon > 0) { p.x -= e.tg.x * lon; p.z -= e.tg.z * lon; } }
    for (const b of blockers) { const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz), m = b.r + r; if (d < m && d > 1e-3) { p.x = b.x + dx / d * m; p.z = b.z + dz / d * m; } }
    const pd = Math.hypot(p.x - SHARD.x, p.z - SHARD.z), pm = 1.6 + r; if (pd < pm && pd > 1e-3) { p.x = SHARD.x + (p.x - SHARD.x) / pd * pm; p.z = SHARD.z + (p.z - SHARD.z) / pd * pm; }
  }
  const floorAt = (x, z) => { const ds = Math.hypot(x - SKY.x, z - SKY.z); return floorBump(x, z) + (ds < 5.5 ? 1.4 * (1 - ds / 5.5) - 0.15 : 0); };
  const ceilingAt = (x, z) => { const l = locate(x, z); return Math.sin(Math.acos(clamp(l.lat / l.smp.w, -1, 1))) * l.smp.h - 0.6; };
  // the camera: inside the walls, under the roof
  function clampCam(c, pivot) {
    const l = locate(c.x, c.z), lim = l.smp.w * 0.82;
    if (Math.abs(l.lat) > lim) { const k = Math.sign(l.lat) * lim - l.lat; c.x += l.smp.side.x * k; c.z += l.smp.side.z * k; }
    if (l.i < 3 && l.lon < -1) { c.x -= l.smp.tg.x * (l.lon + 1); c.z -= l.smp.tg.z * (l.lon + 1); }
    const top = ceilingAt(c.x, c.z); if (c.y > top) c.y = top;
    const f = floorAt(c.x, c.z) + 0.35; if (c.y < f) c.y = f;
    void pivot;
  }
  function update(dt, t, hero, cam) {
    beam.material.uniforms.uT.value = t; matM.uniforms.uT.value = t;
    shard.rotation.y += dt * 0.4; shard.position.y = 1.95 + Math.sin(t * 1.2) * 0.04;
    // an inverse-square light blows a white suit out at arm's length: ease it off as you close in (the eye adapts)
    { const d = Math.hypot(hero.st.pos.x - SHARD.x, hero.st.pos.z - SHARD.z); shardL.intensity = shardBase * (0.22 + 0.78 * Math.min(1, Math.max(0, (d - 1) / 7)) ** 1.5); }
    // lamp at the helmet, aimed along the view
    const head = hero.st.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    // a camera out in front of him (a cutscene) would turn his lamp round onto the wall behind: it shines where he faces
    const fh = new THREE.Vector3(Math.sin(hero.st.yaw), -0.12, Math.cos(hero.st.yaw)).normalize();
    if (f.dot(fh) < 0.2) f.copy(fh);
    lamp.position.copy(head).addScaledVector(f, 0.45).add(new THREE.Vector3(0, 0.1, 0)); lamp.target.position.copy(head).addScaledVector(f, 12);
    fillL.position.copy(cam.position).add(new THREE.Vector3(0, 0.6, 0));
  }
  function setCold(k) { frostU.value = k; shardBase = 140 * (1 - k * 0.85); matM.uniforms.uK.value = 1 - k * 0.8; lights.forEach((l) => (l.intensity = 6 * (1 - k * 0.8))); scene.fog.color.setRGB(0.04 + k * 0.03, 0.03 + k * 0.04, 0.025 + k * 0.06); }
  function takeShard() { shard.visible = false; shardM.emissiveIntensity = 0; }
  return { scene, S, L, ENTRY, CHAMBER, SHARD, SKY, floorAt, bound, clampCam, update, setCold, takeShard, shard, lamp, locate, skyTop: S[0].h };
}
