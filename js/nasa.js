// Beyond the Horizon · NASA East Coast launch site and the RJ-7 lab, built like a working aerospace facility:
// chain-link perimeter, a guard post, a concrete apron with safety markings, flood-light masts, a corrugated-steel
// hangar on a concrete plinth, a launch tower on the skyline and the fallen evacuation rocket. Inside: an epoxy
// floor with painted aisles, steel columns and roof trusses, high-bay lamps, benches, racks and shelving, and the
// RJ-7 on its test rig under a broken case, with a meteor in a crater beneath the hole it punched in the roof.
// Gameplay positions (door x 200 z -5..5, pickup at 216,0,2.4, roof hole x 210-222 z -6..6) are unchanged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry, canvasTex, fbm } from './util.js';
import { safeBump, rockGeo } from './rock.js';

const FONT = '"Noto Sans TC", "Michroma", system-ui, sans-serif';

// ---------- textures ----------
function corrugatedTex() {
  const S = 256, r = mulberry(71);
  return canvasTex(S, S, (g) => {
    for (let x = 0; x < S; x++) { const k = 0.82 + 0.18 * Math.cos(x / S * Math.PI * 2 * 8); const v = 196 * k; g.fillStyle = `rgb(${v | 0},${v * 0.99 | 0},${v * 0.96 | 0})`; g.fillRect(x, 0, 1, S); }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${r() < 0.4 ? '120,60,30' : '40,34,30'},${0.06 + r() * 0.14})`; g.fillRect(r() * S, r() * S * 0.7, 2 + r() * 6, 30 + r() * 160); }   // rust and grime runs
    g.fillStyle = 'rgba(30,26,22,0.35)'; g.fillRect(0, S - 6, S, 6);                                                                        // panel lap
  }, { repeat: true });
}
function apronTex() {
  const S = 512, r = mulberry(72);
  return canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 112 + 22 * fbm(x / 90, y / 90, 3) + (r() - 0.5) * 16, i = (y * S + x) * 4; img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.92; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(25,22,20,0.8)'; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);                                                    // slab joints (6 m slabs)
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(20,18,16,${0.1 + r() * 0.2})`; g.beginPath(); g.ellipse(r() * S, r() * S, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(15,12,10,0.6)'; g.lineWidth = 1.2; for (let i = 0; i < 6; i++) { g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  }, { repeat: true });
}
function epoxyTex() {
  const S = 512, r = mulberry(73);
  return canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 118 + 14 * fbm(x / 120, y / 120, 3) + (r() - 0.5) * 6, i = (y * S + x) * 4; img.data[i] = v * 0.9; img.data[i + 1] = v * 0.97; img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(20,20,20,0.18)'; g.lineWidth = 14; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, r() * S); g.bezierCurveTo(S * 0.3, r() * S, S * 0.6, r() * S, S, r() * S); g.stroke(); }   // trolley-wheel scuffs
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(30,30,30,${r() * 0.15})`; g.fillRect(r() * S, r() * S, 2 + r() * 4, 1 + r() * 2); }
  }, { repeat: true });
}
function hazardTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#e0b020'; g.fillRect(0, 0, w, h); g.fillStyle = '#141414';
    for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.fill(); }
    const r = mulberry(5); for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(90,80,70,${r() * 0.5})`; g.fillRect(r() * w, r() * h, 2 + r() * 5, 1 + r() * 2); }
  }, { repeat: true });
}
function chainTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#b4b8bc'; g.lineWidth = 3;
    for (let k = -w; k < w * 2; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke(); }
  }, { repeat: true, srgb: true });
}
function screenTex(kind, seed) {
  return canvasTex(256, 160, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = '#04080c'; g.fillRect(0, 0, w, h);
    if (kind === 'dead') { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, 0, w * 0.6, h * 0.4); return; }
    if (kind === 'alert') { g.fillStyle = '#3a0806'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff5a3c'; g.font = `600 30px ${FONT}`; g.textAlign = 'center'; g.fillText('撤離', w / 2, 70); g.font = `400 16px ${FONT}`; g.fillText('EVACUATE · 所有人員前往 LC-39', w / 2, 104); return; }
    g.strokeStyle = 'rgba(142,201,255,0.25)'; g.lineWidth = 1; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#8ec9ff'; g.lineWidth = 2; g.beginPath(); let y = h * 0.6; g.moveTo(0, y); for (let x = 0; x < w; x += 6) { y += (r() - 0.5) * 18; y = Math.max(20, Math.min(h - 20, y)); g.lineTo(x, y); } g.stroke();
    g.strokeStyle = '#ffc27a'; g.beginPath(); g.moveTo(0, h * 0.8); for (let x = 0; x < w; x += 4) g.lineTo(x, h * 0.8 - Math.sin(x / 20 + seed) * 18 - x * 0.15); g.stroke();
    g.fillStyle = '#edebe6'; g.font = `500 14px ${FONT}`; g.fillText(`RJ-7 推力 ${(r() * 900 + 1200) | 0} N`, 10, 20); g.fillStyle = '#8e8a84'; g.fillText('等離子護盾 待命', 10, 38);
  });
}
function ledTex() {
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#0a0b0c'; g.fillRect(0, 0, w, h); const r = mulberry(9);
    for (let y = 6; y < h; y += 14) { g.fillStyle = '#1a1c1f'; g.fillRect(4, y, w - 8, 10); for (let x = 8; x < w - 8; x += 6) if (r() < 0.35) { g.fillStyle = r() < 0.7 ? '#4cff8a' : r() < 0.5 ? '#ffb030' : '#ff3a2a'; g.fillRect(x, y + 3, 2, 2); } }
  });
}

export function buildNasa(root, { col, fireSpots, smokeSpots, updaters, signTex, burnt, metal }) {
  const R = mulberry(7700), rr = (a, b) => a + (b - a) * R();
  // static geometry is merged per material: a whole facility in a few draws
  const stat = new Map();
  const put = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    if (!stat.has(mat)) stat.set(mat, []); stat.get(mat).push(g);
  };
  const tileUV = (g, tile) => { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) / tile, (ay > 0.5 ? p.getZ(i) : p.getY(i)) / tile); } return g; };
  const boxW = (x0, y0, z0, x1, y1, z1, mat, tile = 0, solid = true) => {   // world-aligned box with world-space UVs
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed(); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); if (tile) tileUV(g, tile);
    put(g, mat); if (solid) col(x0, y0, z0, x1, y1, z1);
  };
  const ibeam = (len, d = 0.36, w = 0.3) => mergeGeometries([new THREE.BoxGeometry(w, len, 0.04).translate(0, 0, d / 2 - 0.02), new THREE.BoxGeometry(w, len, 0.04).translate(0, 0, -d / 2 + 0.02), new THREE.BoxGeometry(0.03, len, d)].map((g) => g.toNonIndexed()));

  // ---------- materials ----------
  const corrT = corrugatedTex();
  const clad = new THREE.MeshStandardMaterial({ map: corrT, bumpMap: corrT, bumpScale: 3, roughness: 0.55, metalness: 0.45 }); clad.onBeforeCompile = safeBump;
  const cladIn = new THREE.MeshStandardMaterial({ color: 0xd6d8da, map: corrT, roughness: 0.7, metalness: 0.2 });
  const plinthM = new THREE.MeshStandardMaterial({ color: 0x8c867c, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3c4a5a, roughness: 0.5, metalness: 0.7 });           // painted structural steel, blue-grey
  const steelY = new THREE.MeshStandardMaterial({ color: 0xc89a20, roughness: 0.55, metalness: 0.5 });         // crane rail and guards, safety yellow
  const alu = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 });
  const darkPanel = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.6 });
  const redCab = new THREE.MeshStandardMaterial({ color: 0x9a1e18, roughness: 0.45, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const haz = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.7 });
  const apronT = apronTex(); apronT.repeat.set(1, 1);
  const apron = new THREE.MeshStandardMaterial({ map: apronT, bumpMap: apronT, bumpScale: 0.8, roughness: 0.88 }); apron.onBeforeCompile = safeBump;
  const epoT = epoxyTex();
  const epoxy = new THREE.MeshStandardMaterial({ map: epoT, roughness: 0.28, metalness: 0.05 });
  const paintY = new THREE.MeshStandardMaterial({ color: 0xd8a820, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  const paintW = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  // indoors, the burning sky is only a glow through the hole and the door: interior surfaces barely reflect it
  cladIn.envMapIntensity = 0.3; epoxy.envMapIntensity = 0.45; steel.envMapIntensity = 0.5; steelY.envMapIntensity = 0.5; darkPanel.envMapIntensity = 0.4;
  const chainT = chainTex(); const chain = new THREE.MeshStandardMaterial({ map: chainT, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.7 });

  // ---------- ground ----------
  { const g = new THREE.PlaneGeometry(112, 90); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 112 / 12, uv.getY(i) * 90 / 12); g.rotateX(-Math.PI / 2); g.translate(215, 0.02, 0); const m = new THREE.Mesh(g, apron); m.receiveShadow = true; root.add(m); }
  // painted lines on the apron: a walkway to the lab door, a vehicle lane, hatched no-go by the fallen rocket
  for (const z of [-3.2, 3.2]) put(new THREE.PlaneGeometry(36, 0.18).rotateX(-Math.PI / 2), paintY, 182, 0.04, z);
  for (let x = 166; x < 198; x += 4) put(new THREE.PlaneGeometry(2.2, 0.16).rotateX(-Math.PI / 2), paintW, x, 0.04, 9.5);
  put(new THREE.PlaneGeometry(10, 1.2).rotateX(-Math.PI / 2), haz, 236, 0.045, 22);

  // ---------- perimeter: chain-link on galvanised posts, barbed wire on top ----------
  const fenceRun = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const g = new THREE.PlaneGeometry(L, 2.9); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.8, uv.getY(i) * 2.9 / 0.8);
    put(g, chain, (x0 + x1) / 2, 1.55, (z0 + z1) / 2, 0, -ang, 0);
    for (let d = 0; d <= L + 0.01; d += 3) { const x = x0 + Math.cos(ang) * d, z = z0 + Math.sin(ang) * d; put(new THREE.CylinderGeometry(0.045, 0.045, 3.4, 6), alu, x, 1.7, z); put(new THREE.BoxGeometry(0.04, 0.5, 0.04), alu, x, 3.55, z, 0, -ang, 0.5); }
    for (const h of [3.2, 3.42, 3.64]) put(new THREE.CylinderGeometry(0.008, 0.008, L, 3).rotateZ(Math.PI / 2), alu, (x0 + x1) / 2 + Math.sin(ang) * 0.12, h, (z0 + z1) / 2 - Math.cos(ang) * 0.12, 0, -ang, 0);
    col(Math.min(x0, x1) - 0.08, 0, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, 3.2, Math.max(z0, z1) + 0.08);
  };
  fenceRun(160, -44, 160, -8); fenceRun(160, 8, 160, 44); fenceRun(160, -44, 270, -44); fenceRun(160, 44, 270, 44); fenceRun(270, -44, 270, 44);
  // gate leaves knocked open, a guard post, the boom arm snapped
  const leaf = (x, z, ry) => { const g = new THREE.PlaneGeometry(5, 2.6); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3.2); put(g, chain, x, 1.4, z, 0, ry, 0); put(new THREE.BoxGeometry(5, 0.07, 0.07), alu, x, 2.72, z, 0, ry, 0); put(new THREE.BoxGeometry(5, 0.07, 0.07), alu, x, 0.1, z, 0, ry, 0); };
  leaf(162.2, -8.6, 1.0); leaf(162.6, 8.8, -1.15);
  boxW(165, 0, -16, 168.6, 0.2, -12.4, plinthM, 0, false);
  boxW(165.2, 0.2, -15.8, 168.4, 1.1, -12.6, white, 0, true);
  put(new THREE.BoxGeometry(3.2, 1.6, 3.2), glass, 166.8, 1.9, -14.2);
  for (const [x, z] of [[165.2, -15.8], [168.4, -15.8], [165.2, -12.6], [168.4, -12.6]]) put(new THREE.BoxGeometry(0.12, 1.6, 0.12), steel, x, 1.9, z);
  put(new THREE.BoxGeometry(4.2, 0.22, 4.2), white, 166.8, 2.82, -14.2);
  put(new THREE.BoxGeometry(0.3, 1.1, 0.3), steelY, 166.6, 0.55, -10.2);
  put(new THREE.BoxGeometry(4.8, 0.12, 0.12), haz, 166.7, 1.06, -7.8, 0, 0.1, -0.08);                 // boom arm, snapped and drooping
  put(new THREE.BoxGeometry(2.6, 0.12, 0.12), haz, 166.2, 0.25, -4.6, 0.3, 1.3, 0.2);                  // its broken half on the ground
  col(166.3, 0, -10.5, 166.9, 1.1, -9.9);

  // ---------- monument sign: brushed letters on a concrete slab, uplit ----------
  boxW(168.2, 0, -21, 170.2, 0.4, -10, plinthM, 0, true);
  boxW(168.6, 0.4, -20.6, 169.8, 3.4, -10.4, new THREE.MeshStandardMaterial({ color: 0x4a4844, roughness: 0.85 }), 0, true);
  const monT = signTex([['NASA', 210, 104, '#e6e4de', 300], ['東岸發射站  EAST COAST LAUNCH SITE', 46, 216, '#b8b2a8', 400]], { w: 1024, h: 300, bg: '#3c3a37' });
  const mon = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.8), new THREE.MeshStandardMaterial({ map: monT, roughness: 0.4, metalness: 0.5 })); mon.position.set(168.58, 1.9, -15.5); mon.rotation.y = -Math.PI / 2; root.add(mon);
  mon.material.emissive = new THREE.Color(0xffffff); mon.material.emissiveMap = monT; mon.material.emissiveIntensity = 0.35;

  // ---------- flood-light masts ----------
  const mast = (x, z, on) => {
    put(new THREE.CylinderGeometry(0.14, 0.24, 18, 8), alu, x, 9, z);
    put(new THREE.BoxGeometry(2.6, 0.12, 0.12), alu, x, 17.6, z);
    for (const dx of [-1.1, -0.37, 0.37, 1.1]) put(new THREE.BoxGeometry(0.55, 0.38, 0.32), darkPanel, x + dx, 17.3, z + 0.1, -0.5, 0, 0);
    if (on) { const lamp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff4e0 })); lamp.position.set(x, 17.12, z + 0.2); lamp.rotation.x = Math.PI / 2 + 0.5; root.add(lamp); }
    col(x - 0.25, 0, z - 0.25, x + 0.25, 18, z + 0.25);
  };
  mast(178, -24, true); mast(184, 26, false);

  // ---------- the hangar: concrete plinth, steel columns, corrugated cladding, ribbon windows, sliding doors ----------
  const LH = 12, lx0 = 200, lx1 = 232, lz = 15;
  // a concrete plinth band round the outside of the cladding (not across the floor)
  for (const [x0, z0, x1, z1] of [[lx0 - 0.3, -lz - 0.8, lx0, -5], [lx0 - 0.3, 5, lx0, lz + 0.8], [lx0 - 0.3, -lz - 0.8, lx1 + 0.3, -lz - 0.5], [lx0 - 0.3, lz + 0.5, lx1 + 0.3, lz + 0.8], [lx1, -lz - 0.8, lx1 + 0.3, lz + 0.8]]) boxW(x0, 0, z0, x1, 1.0, z1, plinthM, 0, false);
  // walls (cladding outside, lining inside), leaving the door opening z -5..5 below 7 m on the west side
  const wall = (x0, z0, x1, z1, y0 = 0, y1 = LH) => { boxW(x0, y0, z0, x1, y1, z1, clad, 2.4, true); };
  wall(lx0, -lz, lx0 + 0.5, -5); wall(lx0, 5, lx0 + 0.5, lz); wall(lx0, -5, lx0 + 0.5, 5, 7, LH);
  wall(lx0, -lz - 0.5, lx1, -lz); wall(lx0, lz, lx1, lz + 0.5); wall(lx1 - 0.5, -lz, lx1, lz);
  for (const [x0, z0, x1, z1] of [[lx0 + 0.5, -lz, lx0 + 0.55, -5], [lx0 + 0.5, 5, lx0 + 0.55, lz], [lx0 + 0.5, -lz, lx1 - 0.5, -lz + 0.05], [lx0 + 0.5, lz - 0.05, lx1 - 0.5, lz], [lx1 - 0.55, -lz, lx1 - 0.5, lz]]) boxW(x0, 0, z0, x1, LH, z1, cladIn, 2.4, false);
  // ribbon windows high on the long walls
  for (const z of [-lz - 0.52, lz + 0.52]) for (let x = lx0 + 3; x < lx1 - 2; x += 6) put(new THREE.BoxGeometry(4.6, 1.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.05, metalness: 0.3, emissive: 0xffd9a0, emissiveIntensity: R() < 0.4 ? 0.25 : 0 }), x, 9.6, z);
  // exterior steel: columns at 6 m, a fascia, the door track and two door leaves slid back
  for (let z = -lz; z <= lz + 0.1; z += 6) put(ibeam(LH + 0.6), steel, lx0 - 0.2, (LH + 0.6) / 2, z, 0, Math.PI / 2, 0);
  put(new THREE.BoxGeometry(0.4, 0.8, 2 * lz + 1.4), steel, lx0 - 0.25, LH + 0.3, 0);
  put(new THREE.BoxGeometry(0.25, 0.3, 22), steel, lx0 - 0.35, 7.25, 0);
  for (const s of [-1, 1]) {
    const dz = s * 9.4; boxW(lx0 - 0.62, 0.05, dz - 2.5, lx0 - 0.42, 7.1, dz + 2.5, clad, 2.4, true);
    put(new THREE.BoxGeometry(0.06, 0.4, 5), haz, lx0 - 0.64, 0.4, dz);
  }
  // lettering: building number and the lab's name on a backlit sign over the door
  const numT = canvasTex(512, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(30,40,58,0.92)'; g.font = `700 420px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('07', w / 2, h / 2 + 20); });
  const num = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshStandardMaterial({ map: numT, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 })); num.position.set(lx0 - 0.03, 9.7, -10.4); num.scale.setScalar(0.52); num.rotation.y = -Math.PI / 2; root.add(num);
  const signT = signTex([['RJ-7 火箭背包實驗室', 92, 110, '#f0ebe0', 500], ['ROCKET PACK LABORATORY · BLDG 07', 34, 196, '#8ec9ff', 400]], { w: 1024, h: 256, bg: '#14171b' });
  const lsM = new THREE.MeshStandardMaterial({ map: signT, emissive: 0xffffff, emissiveMap: signT, emissiveIntensity: 0.7 });
  const ls = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 9.6), [lsM, darkPanel, darkPanel, darkPanel, darkPanel, darkPanel]); ls.position.set(lx0 - 0.45, 8.9, 0); ls.rotation.y = Math.PI; root.add(ls);
  // roof deck with the punched hole; torn panels bent down into the hall instead of loose blocks
  const roofM = new THREE.MeshStandardMaterial({ color: 0x6e6c68, roughness: 0.85, metalness: 0.3 });
  boxW(lx0, LH, -lz - 0.5, 210, LH + 0.5, lz + 0.5, roofM); boxW(222, LH, -lz - 0.5, lx1, LH + 0.5, lz + 0.5, roofM);
  boxW(210, LH, -lz - 0.5, 222, LH + 0.5, -6, roofM); boxW(210, LH, 6, 222, LH + 0.5, lz + 0.5, roofM);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + rr(-0.2, 0.2), rad = 6.2, x = 216 + Math.cos(a) * rad * 0.97, z = Math.sin(a) * rad;
    const L = rr(1.6, 3.4), g = new THREE.PlaneGeometry(rr(1.2, 2.2), L, 1, 4), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = (p.getY(k) + L / 2) / L; p.setZ(k, -Math.pow(1 - t, 2) * 0.8 + (R() - 0.5) * 0.12); }
    g.computeVertexNormals(); g.translate(0, -L / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: corrT, color: 0x9a948c, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }));
    m.position.set(x, LH + 0.1, z); m.rotation.set(0, -a + Math.PI / 2, 0); m.rotateX(rr(0.5, 1.2)); m.castShadow = true; root.add(m);
  }
  // roof trusses (the one under the hole is snapped and hangs down), columns inside, crane rails
  const truss = (() => {
    const parts = [], b = (w, h, d, x, y, z, rz = 0) => parts.push(new THREE.BoxGeometry(w, h, d).rotateZ(rz).translate(x, y, z).toNonIndexed());
    const span = 2 * lz - 1, n = 12, dz = span / n;
    const chord = (y) => parts.push(new THREE.BoxGeometry(0.2, 0.2, span).translate(0, y, 0).toNonIndexed());
    chord(0); chord(-1.6);
    for (let i = 0; i <= n; i++) { const z = -span / 2 + i * dz; parts.push(new THREE.BoxGeometry(0.1, 1.6, 0.1).translate(0, -0.8, z).toNonIndexed()); if (i < n) { const g = new THREE.BoxGeometry(0.08, Math.hypot(1.6, dz), 0.08); g.rotateX((i % 2 ? 1 : -1) * Math.atan2(dz, 1.6)); g.translate(0, -0.8, z + dz / 2); parts.push(g.toNonIndexed()); } }
    void b; return mergeGeometries(parts);
  })();
  for (const x of [204, 210, 222, 228]) put(truss, steel, x, LH - 0.1, 0);
  { const m = new THREE.Mesh(truss, steel); m.position.set(211, 6.0, -4); m.rotation.set(1.23, 0.12, 0); m.scale.set(1, 1, 0.42); m.castShadow = true; root.add(m); col(210.5, 0, -2.8, 211.5, 1.4, -1.2); }   // snapped, one end on the floor
  for (let x = lx0 + 4; x < lx1 - 1; x += 6) for (const z of [-lz + 0.45, lz - 0.45]) put(ibeam(LH), steel, x, LH / 2, z);
  for (const z of [-lz + 0.9, lz - 0.9]) put(new THREE.BoxGeometry(lx1 - lx0 - 1.5, 0.45, 0.3), steelY, (lx0 + lx1) / 2, 9.0, z);

  // ---------- hall floor: epoxy, painted aisles, hazard border round the test rig ----------
  { const g = new THREE.PlaneGeometry(lx1 - lx0 - 1, 2 * lz - 0.2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (lx1 - lx0) / 8, uv.getY(i) * 2 * lz / 8); g.rotateX(-Math.PI / 2); g.translate((lx0 + lx1) / 2, 0.035, 0); const m = new THREE.Mesh(g, epoxy); m.receiveShadow = true; root.add(m); }
  for (const z of [-4.2, 4.2]) put(new THREE.PlaneGeometry(26, 0.14).rotateX(-Math.PI / 2), paintY, 215, 0.045, z);
  for (const [x, z, w, d] of [[216, -3.4, 5.6, 0.5], [216, 3.4, 5.6, 0.5], [213.45, 0, 0.5, 6.3], [218.55, 0, 0.5, 6.3]]) { const g = new THREE.PlaneGeometry(w, d); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 2, uv.getY(i)); if (d > w) g.rotateZ(Math.PI / 2); put(g.rotateX(-Math.PI / 2), haz, x, 0.05, z); }

  // ---------- the RJ-7 test rig: a round plinth, an aluminium frame, the pack, a case that's been smashed ----------
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.9, 40), darkPanel); base.position.set(216, 0.45, 0); base.castShadow = base.receiveShadow = true; root.add(base); col(214.6, 0, -1.4, 217.4, 0.9, 1.4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.03, 6, 64), new THREE.MeshBasicMaterial({ color: 0x8ec9ff })); ring.rotation.x = Math.PI / 2; ring.position.set(216, 0.91, 0); root.add(ring);
    for (const [x, z] of [[215.1, -0.9], [216.9, -0.9]]) put(new THREE.BoxGeometry(0.08, 2.1, 0.08), alu, x, 1.95, z);
    put(new THREE.BoxGeometry(1.9, 0.08, 0.08), alu, 216, 3.0, -0.9); put(new THREE.BoxGeometry(1.9, 0.08, 0.08), alu, 216, 1.2, -0.9);
    for (const [w, h, d, x, y, z, ry] of [[2.6, 2.2, 0.04, 216, 2.0, -1.25, 0], [0.04, 2.2, 2.6, 214.7, 2.0, 0, 0], [2.6, 2.2, 0.04, 216, 2.0, 1.25, 0]]) put(new THREE.BoxGeometry(w, h, d), glass, x, y, z, 0, ry, 0);
    for (let i = 0; i < 26; i++) put(new THREE.BoxGeometry(rr(0.05, 0.3), 0.01, rr(0.05, 0.25)), glass, 217.6 + rr(-0.4, 1.6), 0.04, rr(-1.6, 1.6), 0, rr(0, 3), 0);   // the fourth pane, on the floor
    const plaque = signTex([['RJ-7', 120, 90, '#edebe6', 600], ['個人火箭背包 · 試飛樣機', 34, 178, '#b8b2a8', 400], ['試飛員：維加', 30, 224, '#ffc27a', 400]], { w: 512, h: 256, bg: '#1a1c20' });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.4, metalness: 0.4 })); pl.position.set(214.32, 0.55, 0); pl.rotation.set(0, -Math.PI / 2, 0); pl.rotateX(-0.3); root.add(pl); }
  // the pack itself, in the same shape as the one he'll wear
  const rocketProp = new THREE.Group(); rocketProp.position.set(216, 0.9, 0); root.add(rocketProp);
  { const rjBody = new THREE.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.42, metalness: 0.55 }), rjDark = new THREE.MeshStandardMaterial({ color: 0x5b6069, roughness: 0.38, metalness: 0.6 });
    const rjAccent = new THREE.MeshStandardMaterial({ color: 0xffc27a, emissive: 0xff9a40, emissiveIntensity: 0.8 });
    const S = 1.9, g = new THREE.Group(); g.scale.setScalar(S); g.position.y = 1.15; rocketProp.add(g);
    const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 6, 14), rjBody); core.scale.set(1.25, 1, 0.62); g.add(core);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.02), rjDark); panel.position.set(0, 0.02, -0.1); g.add(panel);
    for (const s of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 6, 14), rjDark); pod.position.set(0.22 * s, -0.06, -0.05); g.add(pod);
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.08, 14, 1, true), rjDark); noz.position.set(0.22 * s, -0.36, -0.05); g.add(noz);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 18), rjAccent); ring.rotation.x = Math.PI / 2; ring.position.set(0.22 * s, -0.33, -0.05); g.add(ring);
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.2), rjAccent); strip.position.y = 0.2; g.add(strip);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    for (const [x, y] of [[-0.4, 0.4], [0.5, 0.2]]) { const c = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, y + 1.15, -0.12), new THREE.Vector3(x * 1.4, 0.6, -0.5), new THREE.Vector3(x * 1.1, 0.02, -0.8)]), 12, 0.018, 5), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 })); rocketProp.add(c); }
  }

  // ---------- the working hall: benches with monitors, tool chests, racks, shelving, crates ----------
  const bench = (x, z, ry, screens) => {
    put(new THREE.BoxGeometry(3.0, 0.06, 1.0), alu, x, 0.92, z, 0, ry, 0);
    for (const [dx, dz] of [[-1.4, -0.42], [1.4, -0.42], [-1.4, 0.42], [1.4, 0.42]]) { const v = new THREE.Vector3(dx, 0, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); put(new THREE.BoxGeometry(0.06, 0.9, 0.06), steel, x + v.x, 0.45, z + v.z); }
    screens.forEach((kind, i) => {
      const v = new THREE.Vector3(-0.8 + i * 1.0, 0, -0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      const st = screenTex(kind, i + x), sm = new THREE.MeshStandardMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: kind === 'dead' ? 0 : 1.0, roughness: 0.2 });
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.04), [darkPanel, darkPanel, darkPanel, darkPanel, sm, darkPanel]); mon.position.set(x + v.x, 1.25, z + v.z); mon.rotation.y = ry; root.add(mon);
      put(new THREE.BoxGeometry(0.06, 0.3, 0.06), darkPanel, x + v.x, 1.05, z + v.z);
    });
    const c = new THREE.Vector3(1.5, 0, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    col(x - Math.abs(c.x) - 0.1, 0, z - Math.abs(c.z) - 0.1, x + Math.abs(c.x) + 0.1, 0.95, z + Math.abs(c.z) + 0.1);
  };
  bench(206, -10.5, 0, ['telemetry', 'telemetry', 'dead']); bench(206, 10.5, Math.PI, ['alert', 'telemetry', 'telemetry']); bench(228.5, -9.5, Math.PI / 2, ['telemetry', 'dead']);
  for (const [x, z] of [[202.2, -13.6], [203.4, -13.6], [229.6, 13.6]]) { boxW(x - 0.5, 0, z - 0.35, x + 0.5, 1.1, z + 0.35, redCab, 0, true); for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(0.9, 0.02, 0.01), alu, x, 0.25 + k * 0.24, z + 0.36); }
  // server racks with blinking lights
  const ledT = ledTex(), ledM = new THREE.MeshStandardMaterial({ map: ledT, emissive: 0xffffff, emissiveMap: ledT, emissiveIntensity: 1.2 });
  for (let i = 0; i < 4; i++) { const x = 222 + i * 0.75, z = 13.9; const rk = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 1.0), [darkPanel, darkPanel, darkPanel, darkPanel, darkPanel, ledM]); rk.position.set(x, 1.05, z); rk.castShadow = true; root.add(rk); }
  col(221.6, 0, 13.3, 224.6, 2.1, 14.5);
  updaters.push((dt, t) => { ledT.offset.y = Math.floor(t * 3) * 0.13 % 1; });
  // shelving along the east wall, with crates and parts boxes
  for (const z of [-11, -5.5, 5.5]) {
    for (const y of [0.05, 1.0, 1.95, 2.9]) put(new THREE.BoxGeometry(0.9, 0.04, 4.6), steelY, 230.9, y, z);
    for (const dz of [-2.25, 2.25]) for (const dx of [-0.42, 0.42]) put(new THREE.BoxGeometry(0.06, 3.0, 0.06), steel, 230.9 + dx, 1.5, z + dz);
    for (const y of [0.07, 1.02, 1.97]) for (let k = 0; k < 3; k++) if (R() < 0.8) { const w = rr(0.6, 1.2), h = rr(0.4, 0.8); put(new THREE.BoxGeometry(0.7, h, w), R() < 0.5 ? new THREE.MeshStandardMaterial({ color: 0x6a5a42, roughness: 0.9 }) : darkPanel, 230.9, y + h / 2, z - 1.5 + k * 1.5); }
    col(230.4, 0, z - 2.3, 231.4, 3, z + 2.3);
  }
  // equipment cases and a pallet by the door, papers blown across the floor
  for (const [x, z, ry] of [[203.5, 6.5, 0.2], [204.6, 7.4, -0.3], [227, -2, 0.8]]) { boxW(x - 0.6, 0, z - 0.4, x + 0.6, 0.6, z + 0.4, darkPanel, 0, true); put(new THREE.BoxGeometry(1.24, 0.04, 0.84), alu, x, 0.4, z, 0, ry * 0, 0); }
  for (let i = 0; i < 40; i++) put(new THREE.PlaneGeometry(0.21, 0.297).rotateX(-Math.PI / 2), white, rr(202, 214), 0.05 + i * 0.0005, rr(-12, 12), 0, rr(0, 6), 0);

  // ---------- the meteor: a real rock in a crater of broken floor slabs, glowing through its cracks ----------
  { // fused crust, hairline fractures with heat bleeding out of them (thin, branching, glowing; not brush strokes)
    const lavaT = canvasTex(512, 512, (g, w, h) => { const r = mulberry(17);
      const img = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 14 + 16 * (fbm(x / 40, y / 40, 4) * 0.5 + 0.5), i = (y * w + x) * 4; img.data[i] = v * 1.2; img.data[i + 1] = v * 0.8; img.data[i + 2] = v * 0.6; img.data[i + 3] = 255; } g.putImageData(img, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const crack = (x, y, ang, len, wd, depth) => { g.beginPath(); g.moveTo(x, y); for (let k = 0; k < len; k++) { ang += (r() - 0.5) * 0.7; x += Math.cos(ang) * 7; y += Math.sin(ang) * 7; g.lineTo(x, y); if (depth < 2 && r() < 0.12) crack(x, y, ang + (r() < 0.5 ? 1 : -1) * (0.6 + r()), len * 0.5 | 0, wd * 0.6, depth + 1); } g.lineWidth = wd; g.stroke(); };
      g.shadowColor = '#ff5a08'; g.shadowBlur = 10; g.strokeStyle = '#ff7a1c';
      for (let i = 0; i < 9; i++) crack(r() * w, r() * h, r() * 6.28, 18 + r() * 20, 1.6 + r() * 1.4, 0);
      g.shadowBlur = 0; g.strokeStyle = '#ffd890'; for (let i = 0; i < 9; i++) { /* hot cores already drawn by the glow pass */ } }, { repeat: true });
    const rockM = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.95, emissive: 0xffffff, emissiveMap: lavaT, emissiveIntensity: 1.6, bumpMap: lavaT, bumpScale: 2 }); rockM.onBeforeCompile = safeBump;
    const met = new THREE.Mesh(rockGeo(222, { detail: 3, flat: 0.25, sharp: 0.8 }), rockM); met.scale.set(2.3, 1.7, 2.0); met.position.set(226, 0.5, 9); met.rotation.set(0.3, 0.8, 0.1); met.castShadow = true; root.add(met); col(224, 0, 7, 228.5, 2.4, 11.5);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, d = rr(2.6, 3.4); put(new THREE.BoxGeometry(rr(1.0, 1.8), 0.22, rr(0.8, 1.4)), epoxy, 226 + Math.cos(a) * d, 0.15, 9 + Math.sin(a) * d, rr(-0.5, 0.5) * 0 + Math.sin(a) * 0.45, a, Math.cos(a) * -0.45); }
    const glow = new THREE.PointLight(0xff5a10, 60, 14, 2); glow.position.set(226, 1.5, 9); root.add(glow);
    updaters.push((dt, t) => { glow.intensity = 50 + 18 * Math.sin(t * 7) + 10 * Math.sin(t * 13.3); rockM.emissiveIntensity = 1.4 + 0.3 * Math.sin(t * 2.1); });
    fireSpots.push([new THREE.Vector3(226, 0.5, 9), 2.0]); smokeSpots.push([new THREE.Vector3(226, 2, 9), 2, 5]); }

  // ---------- light in the hall: high-bay lamps (some dead, one flickering), red beacons, a key light on the rig ----------
  const lampM = new THREE.MeshBasicMaterial({ color: 0xfff2dc }), lampOff = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.6 });
  const bays = [];
  for (const x of [204, 228]) for (const z of [-8, 0, 8]) bays.push([x, z]);
  bays.forEach(([x, z], i) => {
    put(new THREE.CylinderGeometry(0.01, 0.01, 2.2, 3), alu, x, LH - 1.2, z);
    const on = i !== 1 && i !== 4, sh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 0.45, 18, 1, true), steel); sh.position.set(x, LH - 2.45, z); root.add(sh);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), on ? lampM : lampOff); lens.rotation.x = Math.PI / 2; lens.position.set(x, LH - 2.68, z); root.add(lens);
    if (on && (i === 0 || i === 5)) { const s = new THREE.SpotLight(0xfff0d8, 260, 22, 0.9, 0.7, 2); s.position.set(x, LH - 2.7, z); s.target.position.set(x, 0, z); root.add(s, s.target); if (i === 5) updaters.push((dt, t) => { const f = Math.sin(t * 31) * Math.sin(t * 7.7) > 0.55 ? 0.15 : 1; s.intensity = 260 * f; lens.material = f < 1 ? lampOff : lampM; }); }
  });
  const rjSpot = new THREE.SpotLight(0xfff0dd, 220, 16, 0.38, 0.5, 2); rjSpot.position.set(216, 11, 2); rjSpot.target.position.set(216, 1, 0); rjSpot.castShadow = false; root.add(rjSpot, rjSpot.target);
  const beaconM = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const beacons = [[lx0 + 0.6, 7.8, -6], [lx0 + 0.6, 7.8, 6]].map(([x, y, z]) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12), beaconM); b.position.set(x, y, z); root.add(b); return b; });
  const labRed = new THREE.PointLight(0xff3020, 30, 26, 2); labRed.position.set(206, 9, -11); root.add(labRed);
  updaters.push((dt, t) => { const k = Math.max(0, Math.sin(t * 4)); labRed.intensity = 10 + 30 * k; beacons.forEach((b) => (b.visible = k > 0.2)); });
  // dust hanging in the light that comes down through the hole
  { const beam = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.6, LH, 32, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vU; varying vec3 vN; varying vec3 vV; void main(){ vU = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec2 vU; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(1.0 - abs(dot(vN, vV)), 1.5); float a = 0.05 * (1.0 - edge) * smoothstep(0.0, 0.35, vU.y); gl_FragColor = vec4(vec3(1.0, 0.62, 0.38) * a, 1.0); }' }));
    beam.position.set(216, LH / 2, 0); root.add(beam); }

  // ---------- on the skyline: a launch tower, and the evacuation rocket that never left ----------
  { const parts = [], H = 72, W = 7;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(new THREE.BoxGeometry(0.5, H, 0.5).translate(x * W / 2, H / 2, z * W / 2).toNonIndexed());
    for (let y = 0; y < H; y += 6) for (const [ax, rot] of [['x', 0], ['z', Math.PI / 2]]) for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(W, 0.3, 0.3); if (rot) g.rotateY(rot); g.translate(ax === 'x' ? 0 : s * W / 2, y, ax === 'x' ? s * W / 2 : 0); parts.push(g.toNonIndexed());
      const d = new THREE.BoxGeometry(Math.hypot(W, 6), 0.2, 0.2); d.rotateZ(Math.atan2(6, W) * (y / 6 % 2 ? 1 : -1)); if (rot) d.rotateY(rot); d.translate(ax === 'x' ? 0 : s * W / 2, y + 3, ax === 'x' ? s * W / 2 : 0); parts.push(d.toNonIndexed());
    }
    for (const y of [30, 48, 62]) parts.push(new THREE.BoxGeometry(14, 0.8, 1.6).translate(-W / 2 - 7, y, 0).toNonIndexed());   // service arms
    const tower = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: 0x6a2a20, roughness: 0.6, metalness: 0.5 })); tower.position.set(300, 0, -78); root.add(tower);
    const bk = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010, fog: false })); bk.position.set(300, H + 1, -78); root.add(bk);
    updaters.push((dt, t) => { bk.visible = (t % 1.6) < 0.25; }); }
  { const g = new THREE.Group(); g.position.set(250, 3.6, 30); g.rotation.set(0, 0, Math.PI / 2 - 0.12); root.add(g);
    const body = new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.5, metalness: 0.15 }), band = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6 });
    const seg = (h, y, r0, r1, m) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 32), m); s.position.y = y; s.castShadow = true; g.add(s); };
    seg(20, -14, 3.2, 3.2, body); seg(1.2, -3.4, 3.2, 3.2, band); seg(14, 4.2, 3.2, 3.2, body); seg(1.0, 11.7, 3.2, 3.0, band); seg(6, 15.2, 3.0, 1.8, body); seg(4, 20.2, 1.8, 0.4, body);
    for (const [x, z] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 2.4, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide })); b.position.set(x, -25.2, z); g.add(b); }
    for (let y = -22; y < 10; y += 8) { const r = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.4, 0.02), band); r.position.set(0, y, 3.18); g.add(r); }
    fireSpots.push([new THREE.Vector3(232, 2, 29), 6], [new THREE.Vector3(244, 4, 31), 4]); smokeSpots.push([new THREE.Vector3(238, 5, 30), 4, 24]); }

  // ---------- bake ----------
  for (const [mat, list] of stat) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = !mat.transparent && mat !== chain; m.receiveShadow = true; root.add(m); }
  stat.clear();
  return { rocketProp };
}
