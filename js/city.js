// Beyond the Horizon · prologue level: an open city boulevard in Earth's last five minutes.
// Layout (metres): the walkable corridor is the boulevard, x -24..160, z -18..18. Low shops line it
// with wide gaps, so the skyline, the collapsing towers and the sky stay in view (disaster-film framing).
// Route (~230 m, 40-60 s at a run): wake at x 2 → Stellar Suits (north side, x 40-58) → jump the lava
// fissure across the road at x 96-99 → NASA gate at x 160 → RJ-7 lab (x 200-232), roof hole over x 216.
import * as THREE from 'three';
import { mulberry, canvasTex, GLSL_NOISE, fbm } from './util.js';
import { safeBump, rockGeo, rockMat } from './rock.js';
import { createClassicStreet, masonryFacade } from './classic.js';
import { buildNasa } from './nasa.js';
import { createPlayer } from './player.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDoomSky, BH_DIR, MOON_DIR } from './doomsky.js';
export { BH_DIR, MOON_DIR };

const R = mulberry(3385);
const rr = (a, b) => a + (b - a) * R();
const FONT = '"Noto Sans TC", "Michroma", system-ui, sans-serif';

// ---------- textures ----------
// Facades at true scale: one texture = a 14 m x 14 m patch of wall, 3.5 m storeys. Four maps per style:
// albedo, emissive (lit rooms, fires), ORM (G roughness, B metalness: glass is glossy, concrete isn't) and bump (glass sits in a recess).
export const FT = 14;
function facadeTex(seed, style = 'grid') {
  const rnd = mulberry(seed), S = 512, PX = S / FT, FL = 3.5 * PX;
  const P = {
    grid:    { wall: [138, 130, 120], bay: 1.75, ww: 0.78, wh: 0.6, wy: 0.16, glass: '#141b22', gm: 30, frame: '#2b2c2e' },
    punched: { wall: [112, 78, 62],   bay: 3.5,  ww: 0.5,  wh: 0.5, wy: 0.22, glass: '#10161c', gm: 20, frame: '#d8d2c6' },
    ribbon:  { wall: [150, 146, 138], bay: 3.5,  ww: 0.98, wh: 0.46, wy: 0.24, glass: '#1a232c', gm: 40, frame: '#3a3c3f' },
    curtain: { wall: [64, 72, 82],    bay: 1.4,  ww: 0.96, wh: 0.82, wy: 0.06, glass: '#4a5866', gm: 150, frame: '#202326' },
  }[style];
  const cA = document.createElement('canvas'), cE = document.createElement('canvas'), cO = document.createElement('canvas'), cB = document.createElement('canvas');
  [cA, cE, cO, cB].forEach((c) => (c.width = c.height = S));
  const a = cA.getContext('2d'), e = cE.getContext('2d'), o = cO.getContext('2d'), b = cB.getContext('2d');
  // wall: base colour, grain, broad weathering
  const img = a.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = 0.85 + 0.12 * (fbm(x / 70 + seed, y / 50, 3) * 0.5 + 0.5) + (rnd() - 0.5) * 0.09, i = (y * S + x) * 4;
    img.data[i] = P.wall[0] * n; img.data[i + 1] = P.wall[1] * n; img.data[i + 2] = P.wall[2] * n; img.data[i + 3] = 255;
  }
  a.putImageData(img, 0, 0);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  o.fillStyle = 'rgb(0,232,0)'; o.fillRect(0, 0, S, S);
  b.fillStyle = '#c8c8c8'; b.fillRect(0, 0, S, S);
  const bays = Math.round(FT / P.bay), BW = S / bays;
  for (let f = 0; f < 4; f++) {
    const fy = S - (f + 1) * FL;                                 // top of this storey (canvas y grows down; v=0 is the ground)
    // floor slab / spandrel line with a shadow under it
    a.fillStyle = 'rgba(255,255,255,0.08)'; a.fillRect(0, fy, S, 6); a.fillStyle = 'rgba(0,0,0,0.28)'; a.fillRect(0, fy + 6, S, 3);
    b.fillStyle = '#ffffff'; b.fillRect(0, fy, S, 6);
    for (let k = 0; k < bays; k++) {
      const w = BW * P.ww, h = FL * P.wh, x = k * BW + (BW - w) / 2, y = fy + FL * P.wy + 8;
      const r = rnd(), state = r < 0.07 ? 'broken' : r < 0.1 ? 'fire' : r < 0.15 ? 'lit' : r < 0.27 ? 'blinds' : 'glass';
      // frame and sill
      a.fillStyle = P.frame; a.fillRect(x - 3, y - 3, w + 6, h + 6); a.fillStyle = 'rgba(255,255,255,0.18)'; a.fillRect(x - 5, y + h + 3, w + 10, 3);
      o.fillStyle = 'rgb(0,110,170)'; o.fillRect(x - 3, y - 3, w + 6, h + 6); b.fillStyle = '#ffffff'; b.fillRect(x - 3, y - 3, w + 6, h + 6);
      // pane
      if (state === 'broken' || state === 'fire') { a.fillStyle = '#060504'; o.fillStyle = 'rgb(0,250,0)'; }
      else { const g = a.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, P.glass); g.addColorStop(1, '#07090b'); a.fillStyle = g; o.fillStyle = `rgb(0,${style === 'curtain' ? 18 : 14},${P.gm})`; }
      a.fillRect(x, y, w, h); o.fillRect(x, y, w, h); b.fillStyle = '#3a3a3a'; b.fillRect(x, y, w, h);
      if (style === 'grid' || style === 'curtain') { a.fillStyle = P.frame; a.fillRect(x + w / 2 - 1.5, y, 3, h); o.fillStyle = 'rgb(0,110,170)'; o.fillRect(x + w / 2 - 1.5, y, 3, h); }
      if (state === 'blinds') { const d = h * (0.3 + rnd() * 0.6); a.fillStyle = '#8e8474'; a.fillRect(x, y, w, d); a.fillStyle = 'rgba(0,0,0,0.25)'; for (let yy = y; yy < y + d; yy += 4) a.fillRect(x, yy, w, 1); o.fillStyle = 'rgb(0,30,0)'; o.fillRect(x, y, w, d); }
      if (state === 'lit') { e.fillStyle = rnd() < 0.5 ? '#c8904c' : '#9fb0c0'; e.fillRect(x, y, w, h); a.fillStyle = '#6a5038'; a.fillRect(x, y, w, h); e.fillStyle = 'rgba(0,0,0,0.5)'; e.fillRect(x, y + h * 0.55, w * 0.4, h * 0.45); }
      if (state === 'fire') { const g = e.createLinearGradient(0, y + h, 0, y); g.addColorStop(0, '#ff7a18'); g.addColorStop(0.6, '#c83a08'); g.addColorStop(1, '#300800'); e.fillStyle = g; e.fillRect(x, y, w, h); }
      // soot: smoke leaves a black plume up the wall above a broken or burning window
      if (state === 'broken' || state === 'fire') {
        const g = a.createLinearGradient(0, y, 0, y - FL * (0.8 + rnd() * 1.2)); g.addColorStop(0, 'rgba(8,6,5,0.85)'); g.addColorStop(1, 'rgba(8,6,5,0)');
        a.fillStyle = g; a.beginPath(); a.moveTo(x - 4, y); a.quadraticCurveTo(x + w / 2, y - FL * 0.4, x - 10, y - FL * 1.8); a.lineTo(x + w + 10, y - FL * 1.8); a.quadraticCurveTo(x + w / 2, y - FL * 0.4, x + w + 4, y); a.fill();
      }
      // rain streaks dripping off the sill
      a.fillStyle = 'rgba(0,0,0,0.10)'; for (let s2 = 0; s2 < 3; s2++) if (rnd() < 0.5) a.fillRect(x + rnd() * w, y + h + 6, 1 + rnd() * 2, FL * (0.2 + rnd() * 0.5));
    }
  }
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  return { map: T(cA, true), emi: T(cE, true), orm: T(cO, false), bump: T(cB, false) };
}
function facadeMat(seed, style, emissive = 1) {
  const { map, emi, orm, bump } = facadeTex(seed, style);
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: emissive, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, bumpMap: bump, bumpScale: 1.6 });
  m.onBeforeCompile = safeBump; return m;
}
// asphalt at 1.4 cm a pixel: aggregate, tar patches, cracks, oil, tyre polish along the lanes, ash
function roadTex() {
  const S = 1024, rnd = mulberry(7);
  return canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const broad = fbm(x / 160, y / 160, 3) * 0.5 + 0.5, grit = rnd();
      let v = 40 + broad * 12 + (grit < 0.08 ? 26 : grit > 0.94 ? -14 : (grit - 0.5) * 10);
      const i = (y * S + x) * 4; img.data[i] = v; img.data[i + 1] = v * 0.98; img.data[i + 2] = v * 0.95; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(14,13,12,${0.35 + rnd() * 0.3})`; g.fillRect(rnd() * S, rnd() * S, 60 + rnd() * 240, 40 + rnd() * 160); }       // patched trenches
    for (let i = 0; i < 18; i++) { const r = 8 + rnd() * 40; const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(6,6,8,0.55)'); gr.addColorStop(1, 'rgba(6,6,8,0)'); g.save(); g.translate(rnd() * S, rnd() * S); g.scale(1.6, 1); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore(); }   // oil
    g.fillStyle = 'rgba(0,0,0,0.10)'; for (let i = 0; i < 4; i++) g.fillRect(0, rnd() * S, S, 30 + rnd() * 40);   // tyre polish runs along x
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {                                                                           // cracks with branches
      let x = rnd() * S, y = rnd() * S, ang = rnd() * 6.28; g.strokeStyle = `rgba(6,5,4,${0.6 + rnd() * 0.3})`; g.lineWidth = 1 + rnd() * 2.2; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 14; k++) { ang += (rnd() - 0.5) * 1.1; x += Math.cos(ang) * 14; y += Math.sin(ang) * 14; g.lineTo(x, y); if (rnd() < 0.15) { g.moveTo(x, y); } }
      g.stroke();
    }
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(150,140,130,${rnd() * 0.18})`; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3); }   // ash fall
  }, { repeat: true });
}
// concrete paving slabs, 1.5 m, for the pavements
function paverTex() {
  const S = 512, rnd = mulberry(19), C = S / 4;
  return canvasTex(S, S, (g) => {
    g.fillStyle = '#26221f'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 92 + rnd() * 22; g.fillStyle = `rgb(${v},${v - 4},${v - 9})`; g.fillRect(x * C + 2, y * C + 2, C - 4, C - 4);
      for (let k = 0; k < 140; k++) { const u = rnd(); g.fillStyle = `rgba(${u < 0.5 ? '0,0,0' : '255,250,240'},${0.05 + rnd() * 0.08})`; g.fillRect(x * C + 2 + rnd() * (C - 6), y * C + 2 + rnd() * (C - 6), 2, 2); }
      if (rnd() < 0.25) { g.strokeStyle = 'rgba(10,8,6,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x * C + rnd() * C, y * C + 2); g.lineTo(x * C + rnd() * C, y * C + C - 2); g.stroke(); }
    }
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(20,16,12,${0.15 + rnd() * 0.2})`; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 10 + rnd() * 40, 6 + rnd() * 25, rnd() * 3, 0, 7); g.fill(); }
  }, { repeat: true });
}
function tileTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#cfd2d4'; g.fillRect(0, 0, w, h);
    const rnd = mulberry(5);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = 196 + rnd() * 18; g.fillStyle = `rgb(${v},${v + 2},${v + 4})`; g.fillRect(x * 64 + 1, y * 64 + 1, 62, 62); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 30; i++) g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 30, 1 + rnd() * 2);
  }, { repeat: true });
}
function lineTex() {
  return canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(190,170,120,0.6)'; g.fillRect(0, 26, 140, 12); });
}
function signTex(lines, { w = 1024, h = 256, bg = '#0d0f12', glow = false } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
    lines.forEach(([txt, size, y, color, weight, x, align]) => {
      g.font = `${weight || 500} ${size}px ${FONT}`;
      g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillStyle = color || '#eee';
      if (glow) { g.shadowColor = color; g.shadowBlur = 26; }
      g.fillText(txt, x ?? w / 2, y);
    });
  });
}
function posterTex(title, sub, accent) {
  return canvasTex(512, 768, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0e1a2a'); gr.addColorStop(1, '#03060a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // a planet arc and a suited figure silhouette
    g.fillStyle = accent; g.globalAlpha = 0.85; g.beginPath(); g.arc(w * 0.5, h * 1.25, w * 0.95, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = '#e8edf2'; g.beginPath(); g.ellipse(w * 0.5, h * 0.42, 46, 50, 0, 0, 7); g.fill();
    g.fillStyle = '#1b2a3a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.43, 34, 26, 0, 0, 7); g.fill();
    g.fillStyle = '#e8edf2'; g.fillRect(w * 0.5 - 58, h * 0.48, 116, 150); g.fillRect(w * 0.5 - 58, h * 0.48 + 150, 48, 120); g.fillRect(w * 0.5 + 10, h * 0.48 + 150, 48, 120);
    g.fillStyle = '#e8edf2'; g.font = `600 64px ${FONT}`; g.textAlign = 'center'; g.fillText(title, w / 2, 110);
    g.fillStyle = accent; g.font = `400 30px ${FONT}`; g.fillText(sub, w / 2, 160);
  });
}

// scale box UVs so textures keep a physical tile size
function boxUV(geo, sx, sy, sz, tile) {
  const uv = geo.attributes.uv, n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const su = ax > 0.5 ? sz : sx, sv = ay > 0.5 ? sz : sy;
    uv.setXY(i, uv.getX(i) * su / tile, uv.getY(i) * sv / tile);
  }
  return geo;
}

export function buildCity(scene) {
  const root = new THREE.Group(); scene.add(root);
  const colliders = [], pits = [], updaters = [], fireSpots = [], smokeSpots = [];
  const col = (x0, y0, z0, x1, y1, z1, extra = {}) => { const c = { min: [x0, y0, z0], max: [x1, y1, z1], on: true, ...extra }; colliders.push(c); return c; };

  // ---------- materials ----------
  // the city is old stone and brick; a few glass towers stand behind it
  const facades = [masonryFacade(11, 'lime'), masonryFacade(23, 'brick'), masonryFacade(37, 'sand')];
  const towerFacades = [masonryFacade(51, 'lime'), facadeMat(67, 'grid', 1.4), masonryFacade(71, 'sand'), masonryFacade(83, 'brick')];
  const roofTop = new THREE.MeshStandardMaterial({ color: 0x3c3834, roughness: 0.95 });
  const wrap = (m) => [m, m, roofTop, roofTop, m, m];          // box faces: +x -x +y -y +z -z
  const burnt = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.95 });
  // cast concrete: soft mottling, water stains, chipped arrises (reads right even stretched over a long kerb)
  const concT = canvasTex(256, 256, (g, w, h) => { const r = mulberry(91); const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 150 + 30 * fbm(x / 40, y / 40, 3) + (r() - 0.5) * 18, i = (y * w + x) * 4; img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.93; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(30,26,22,${0.08 + r() * 0.12})`; g.fillRect(r() * w, r() * h * 0.5, 4 + r() * 20, 40 + r() * 140); } }, { repeat: true });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8278, map: concT, bumpMap: concT, bumpScale: 0.8, roughness: 0.92 }); concrete.onBeforeCompile = safeBump;
  const concreteL = new THREE.MeshStandardMaterial({ color: 0xa8a094, map: concT, bumpMap: concT, bumpScale: 0.8, roughness: 0.9 }); concreteL.onBeforeCompile = safeBump;
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.55, metalness: 0.6 });
  const roadT = roadTex();
  const road = new THREE.MeshStandardMaterial({ map: roadT, bumpMap: roadT, bumpScale: 1.2, roughness: 0.9 }); road.onBeforeCompile = safeBump;
  const paveT = paverTex();
  const walk = new THREE.MeshStandardMaterial({ map: paveT, bumpMap: paveT, bumpScale: 1.4, roughness: 0.92 }); walk.onBeforeCompile = safeBump;
  const curbM = new THREE.MeshStandardMaterial({ color: 0x7c776e, roughness: 0.85 });
  const soilM = new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 1, map: roadT });
  const glassDark = new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.15, metalness: 0.8 });

  const box = (x0, y0, z0, x1, y1, z1, mat, solid = true, tile = 0) => {
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const g = new THREE.BoxGeometry(sx, sy, sz); if (tile) boxUV(g, sx, sy, sz, tile);
    const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); root.add(m);
    m.castShadow = m.receiveShadow = true;
    if (solid) col(x0, y0, z0, x1, y1, z1);
    return m;
  };
  const wall = (x0, z0, x1, z1) => col(x0, 0, z0, x1, 8, z1, { invisible: true });   // invisible boundary

  // ---------- ground: a wide plain with the fissure cut out of the boulevard ----------
  const ground = (x0, z0, x1, z1, mat) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 14, uv.getY(i) * (z1 - z0) / 14);
    const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; root.add(m); return m;
  };
  const FX0 = 96, FX1 = 99;   // fissure: 3 m wide, right across the corridor
  ground(-1200, -1200, FX0, 1200, road); ground(FX1, -1200, 1200, 1200, road);
  ground(FX0, 24, FX1, 1200, road); ground(FX0, -1200, FX1, -24, road);
  // lane markings + crossings
  const lineM = new THREE.MeshStandardMaterial({ map: lineTex(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const z of [-7, 7]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(180, 0.25), lineM.clone()); l.material.map = lineM.map.clone(); l.material.map.needsUpdate = true; l.material.map.repeat.set(180 / 7, 1); l.rotation.x = -Math.PI / 2; l.position.set(68, 0.01, z); root.add(l); }
  // road paint is lit like the road (it was glowing white in the dark), and worn where the tyres run
  const zebraT = canvasTex(256, 64, (g, w, h) => { const r = mulberry(4); g.fillStyle = '#cfc8b8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(48,44,40,${0.15 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 10, 1 + r() * 4, 0, 0, 7); g.fill(); } const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0.25, 'rgba(48,44,40,0)'); gr.addColorStop(0.36, 'rgba(48,44,40,0.4)'); gr.addColorStop(0.47, 'rgba(48,44,40,0)'); gr.addColorStop(0.6, 'rgba(48,44,40,0)'); gr.addColorStop(0.68, 'rgba(48,44,40,0.35)'); gr.addColorStop(0.76, 'rgba(48,44,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const zebra = new THREE.MeshStandardMaterial({ map: zebraT, transparent: true, opacity: 0.8, depthWrite: false, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const x of [28, 132]) for (let z = -13; z <= 13; z += 2.2) { const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.1), zebra); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.012, z); root.add(s); }
  // sidewalks
  box(-30, 0, -18.6, 160, 0.16, -14, walk, false, 6); box(-30, 0, 14, 160, 0.16, 18.6, walk, false, 6);
  box(-30, 0, -14.25, 160, 0.18, -13.95, curbM, false); box(-30, 0, 13.95, 160, 0.18, 14.25, curbM, false);
  // median with planters (low: hop over, or use the gaps)
  for (let x = -14; x < 150; x += 14) {
    if (x > 84 && x < 106) continue;
    box(x, 0, -1, x + 8, 0.55, 1, concreteL, true); box(x + 0.15, 0.5, -0.85, x + 7.85, 0.58, 0.85, soilM, false);
    const tree = new THREE.Group(); tree.position.set(x + 4, 0.55, 0); root.add(tree);
    const tm = new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4, 6), tm); trunk.position.y = 2; tree.add(trunk);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 2, 5), tm); b.position.set(0, 3.2 + i * 0.2, 0); b.rotation.set(rr(-1, 1), rr(0, 6), rr(0.6, 1.1)); b.translateY(0.9); tree.add(b); }
  }

  // ---------- the fissure across the boulevard ----------
  pits.push({ x0: FX0, x1: FX1, z0: -24, z1: 24, safe: new THREE.Vector3(FX0 - 4, 0, 4) });
  const lavaMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = (modelMatrix*vec4(position,1.0)).xz; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }',
    fragmentShader: `${GLSL_NOISE} varying vec2 vP; uniform float uT;
      void main(){ float n = fbm3(vec3(vP*0.6, uT*0.15)); float v = smoothstep(0.35, 0.75, n);
        vec3 c = mix(vec3(0.35,0.03,0.0), vec3(1.0,0.45,0.08), v) + vec3(1.0,0.85,0.5)*pow(v,6.0);
        gl_FragColor = vec4(c*1.6, 1.0); }`,
  });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(FX1 - FX0, 48), lavaMat); lava.rotation.x = -Math.PI / 2; lava.position.set((FX0 + FX1) / 2, -3.2, 0); root.add(lava);
  const rock = new THREE.MeshStandardMaterial({ color: 0x241712, roughness: 1, emissive: 0x3a0e02, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  [FX0, FX1].forEach((x, i) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(48, 3.3), rock); w.rotation.y = i ? -Math.PI / 2 : Math.PI / 2; w.position.set(x, -1.6, 0); root.add(w); });
  // broken road slabs tilting up at the lips of the crack
  for (let z = -16; z <= 16; z += 4) for (const s of [-1, 1]) { const b = box(0, 0, 0, 2, 0.35, 3.6, concreteL, false); b.position.set(s < 0 ? FX0 - 1 : FX1 + 1, 0.12, z + rr(-0.5, 0.5)); b.rotation.set(rr(-0.1, 0.1), rr(-0.15, 0.15), s * rr(0.08, 0.22)); }
  const lavaLights = [-10, 10].map((z) => { const l = new THREE.PointLight(0xff5a14, 50, 22, 2); l.position.set((FX0 + FX1) / 2, 0.8, z); root.add(l); return l; });
  updaters.push((dt, t) => { lavaMat.uniforms.uT.value = t; lavaLights.forEach((l, i) => (l.intensity = 44 + Math.sin(t * 3 + i) * 8)); });
  smokeSpots.push([new THREE.Vector3(97.5, 0, -8), 2, 4], [new THREE.Vector3(97.5, 0, 9), 2, 4]);

  // ---------- frontage: low buildings with wide gaps, set back from the corridor ----------
  function building(x0, z0, x1, z1, h, kind = 'plain', mats = facades) {
    const mat = mats[(R() * mats.length) | 0];
    let hh = kind === 'broken' ? h * rr(0.5, 0.75) : h;
    box(x0, 0, z0, x1, hh, z1, wrap(mat), true, FT);
    box(x0 - 0.05, 0, z0 - 0.05, x1 + 0.05, 4.2, z1 + 0.05, concrete, false, 6);
    if (kind === 'broken') {
      for (let i = 0; i < 5; i++) {
        const w = (x1 - x0) * rr(0.15, 0.4), d = (z1 - z0) * rr(0.2, 0.5), cx = rr(x0 + w / 2, x1 - w / 2), cz = rr(z0 + d / 2, z1 - d / 2);
        const b = box(cx - w / 2, hh, cz - d / 2, cx + w / 2, hh + rr(2, 9), cz + d / 2, burnt, false); b.rotation.set(rr(-0.2, 0.2), rr(-0.3, 0.3), rr(-0.2, 0.2));
      }
      smokeSpots.push([new THREE.Vector3((x0 + x1) / 2, hh + 2, (z0 + z1) / 2), 1.2, 14]);
    } else for (let i = 0; i < 3; i++) { const cx = rr(x0 + 2, x1 - 2), cz = rr(z0 + 2, z1 - 2); box(cx - 1.2, hh, cz - 1, cx + 1.2, hh + 1.4, cz + 1, metal, false); }
    if (kind === 'burning') {
      const face = Math.abs(z0) < Math.abs(z1) ? z0 : z1, sgn = face === z0 ? -1 : 1;
      for (let i = 0; i < 2; i++) fireSpots.push([new THREE.Vector3(rr(x0 + 3, x1 - 3), rr(5, Math.max(6, hh - 2)), face + sgn * 0.3), rr(2, 3.5)]);
      smokeSpots.push([new THREE.Vector3((x0 + x1) / 2, hh, face), 1.5, 12]);
    }
  }
  // frontage: an old street canyon, stone and brick blocks flush to the pavement; cross streets at the
  // two crossings and where the fissure runs, so the black hole still hangs at the far end of the canyon
  const CL = createClassicStreet(root, { cols: (a, b, c, d, e2, f) => col(a, b, c, d, e2, f), fireSpots, smokeSpots });
  const NZ = -18.6, SZ = 18.6;
  CL.block({ x0: -30, x1: 24, zFace: NZ, side: 'N', floors: 6, pal: 'lime', sides: 'e' });
  CL.bladeSign(9, NZ, 1, 7, '獵戶戲院', 'ORION');
  CL.block({ x0: 33, x1: 39.6, zFace: NZ, side: 'N', floors: 5, pal: 'buff', sides: 'w', depth: 18 });
  CL.block({ x0: 39.6, x1: 58.4, zFace: -18.25, side: 'N', floors: 4, pal: 'red', base: false, from: 5.2, sides: false, depth: 18 });
  CL.block({ x0: 58.4, x1: 92, zFace: NZ, side: 'N', floors: 8, pal: 'sand', sides: 'e', burning: true, shopKinds: ['glass', 'glass', 'broken', 'glass'] });
  CL.flags(72, NZ, 1, 6.2);
  CL.block({ x0: 104, x1: 126, zFace: NZ, side: 'N', floors: 6, pal: 'buff', sides: true });
  CL.block({ x0: 136, x1: 158, zFace: NZ, side: 'N', floors: 9, pal: 'lime', sides: true });
  CL.block({ x0: -30, x1: 20, zFace: SZ, side: 'S', floors: 5, pal: 'red', sides: 'e' });
  CL.block({ x0: 30, x1: 62, zFace: SZ, side: 'S', floors: 8, pal: 'lime', sides: 'w' });
  CL.block({ x0: 62, x1: 92, zFace: SZ, side: 'S', floors: 6, pal: 'buff', sides: 'e', burning: true });
  CL.block({ x0: 104, x1: 124, zFace: SZ, side: 'S', floors: 5, pal: 'red', sides: true, burning: true });
  CL.block({ x0: 136, x1: 158, zFace: SZ, side: 'S', floors: 10, pal: 'sand', sides: true });
  CL.busShelter(8, 16.6, 1);
  CL.finish();
  // corridor walls (invisible), with the shop doorway left open; concrete barriers make the edge read
  wall(-30, -19, 45, -18); wall(53, -19, 160, -18); wall(-30, 18, 160, 19);
  wall(-26, -18, -24, 18);
  const jersey = new THREE.MeshStandardMaterial({ color: 0xc8c0b2, map: concT, roughness: 0.9 });
  const barrierRow = (x0, x1, z) => { for (let x = x0; x < x1; x += 3.2) { if (R() < 0.12) continue; const b = box(x, 0, z - 0.3, x + 3, 0.85, z + 0.3, jersey, false); b.rotation.y = rr(-0.08, 0.08); if (R() < 0.15) { b.rotation.z = rr(-0.5, 0.5); b.position.y += 0.2; } } };
  barrierRow(24.3, 33, -19.2); barrierRow(92.3, 96, -19.2); barrierRow(99, 104, -19.2); barrierRow(126.3, 136, -19.2);
  barrierRow(20.3, 30, 19.2); barrierRow(92.3, 96, 19.2); barrierRow(99, 104, 19.2); barrierRow(124.3, 136, 19.2);
  // open lots: rubble, a few wrecks, a dead little park across from the shop
  [[98, -36], [98, 40], [28, -40], [130, 36], [100, -60], [30, 60]].forEach(([x, z]) => {
    for (let i = 0; i < 5; i++) { const s = rr(0.8, 2.2); const b = box(x + rr(-6, 6) - s, 0, z + rr(-4, 4) - s, x + rr(-6, 6) + s, s * rr(0.6, 1.4), z + rr(-4, 4) + s, i % 2 ? burnt : concreteL, false); b.rotation.set(rr(-0.3, 0.3), rr(0, 3), rr(-0.3, 0.3)); }
  });
  // west end: rubble wall + a burning tanker
  for (let i = 0; i < 12; i++) { const z = -18 + i * 3; const b = box(-30 - rr(0, 3), 0, z, -24 + rr(-1, 1), rr(3, 7), z + 3, i % 3 ? concrete : burnt, false); b.rotation.y = rr(-0.3, 0.3); }
  fireSpots.push([new THREE.Vector3(-22, 1, -6), 4], [new THREE.Vector3(-22, 1, 8), 3]);
  smokeSpots.push([new THREE.Vector3(-22, 2, 0), 3, 14]);

  // mid-distance blocks and the skyline (far): this is where the city reads as a city
  const midSpots = [[-20, -160, 40], [60, -170, 34], [140, -190, 52], [230, -170, 30], [-10, 170, 46], [80, 160, 28], [180, 200, 60], [-110, -70, 30], [-120, 80, 42]];
  midSpots.forEach(([x, z, h], i) => building(x - 14, z - 12, x + 14, z + 12, h, i % 3 === 0 ? 'burning' : i % 3 === 1 ? 'broken' : 'plain'));
  const towers = [];
  for (let i = 0; i < 46; i++) {
    const ang = rr(0, Math.PI * 2), dist = rr(240, 720);
    const x = 80 + Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (Math.abs(Math.atan2(z, x - 80)) < 0.22 || Math.hypot(x - 320, z - 42) < 60) continue;   // keep the sky above the boulevard's end clear, and room for the collapsing tower
    const w = rr(22, 46), d = rr(22, 46), h = rr(70, 230);
    const m = box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, wrap(towerFacades[i % towerFacades.length]), false, FT);
    towers.push({ m, x, z, w, d, h });
    if (R() < 0.3) { fireSpots.push([new THREE.Vector3(x - w / 2 - 0.5, h * rr(0.4, 0.85), z), rr(7, 14)]); smokeSpots.push([new THREE.Vector3(x, h, z), 0.8, 50]); }
    if (R() < 0.25) { m.scale.y = rr(0.5, 0.8); m.position.y = h * m.scale.y / 2; }
    col(x - w / 2, 0, z - d / 2, x + w / 2, h * m.scale.y, z + d / 2, { fly: true });   // only matters in the air
  }
  // the set piece: a tall tower NW of the shop leans and collapses as you run past it
  const fall = { x: 320, z: 42, h: 150, w: 30 };       // framed in the far end of the street canyon, right of the black hole, so it can be seen going
  const fallPivot = new THREE.Group(); fallPivot.position.set(fall.x, 0, fall.z - fall.w / 2); root.add(fallPivot);
  const fallM = new THREE.Mesh(boxUV(new THREE.BoxGeometry(fall.w, fall.h, fall.w), fall.w, fall.h, fall.w, FT), wrap(towerFacades[0])); fallM.position.set(0, fall.h / 2, fall.w / 2); fallPivot.add(fallM);
  fireSpots.push([new THREE.Vector3(fall.x - fall.w / 2 - 0.5, fall.h * 0.55, fall.z), 16]);
  const collapse = { on: false, t: 0, done: false };

  // ---------- cars: a traffic jam, doors flung open, some burning ----------
  // a sedan: extruded side profile with bevelled edges, a glass greenhouse, tyres with rims, lamps
  const carShape = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(-2.22, 0.3); sh.lineTo(-2.26, 0.62); sh.quadraticCurveTo(-2.24, 0.86, -2.02, 0.92); sh.lineTo(-1.2, 0.98);
    sh.lineTo(1.08, 0.98); sh.quadraticCurveTo(1.9, 0.9, 2.18, 0.76); sh.quadraticCurveTo(2.3, 0.6, 2.24, 0.42); sh.lineTo(2.2, 0.3);
    // wheel arches
    sh.lineTo(1.82, 0.3); sh.absarc(1.4, 0.3, 0.42, 0, Math.PI, false); sh.lineTo(-0.98, 0.3); sh.absarc(-1.4, 0.3, 0.42, 0, Math.PI, false); sh.lineTo(-2.22, 0.3);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.66, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3, curveSegments: 10 }); g.translate(0, 0, -0.83); return g;
  })();
  const cabinShape = (() => {
    const sh = new THREE.Shape(); sh.moveTo(-1.22, 0.96); sh.lineTo(-0.72, 1.42); sh.quadraticCurveTo(-0.1, 1.5, 0.42, 1.44); sh.lineTo(1.08, 0.96); sh.lineTo(-1.22, 0.96);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 8 }); g.translate(0, 0, -0.75); return g;
  })();
  const tyreG = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18), rimG = new THREE.CylinderGeometry(0.21, 0.21, 0.25, 14);
  const tyreM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }), rimM = new THREE.MeshStandardMaterial({ color: 0x9a9c9e, roughness: 0.35, metalness: 0.85 });
  const carGlass = new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.04, metalness: 0.2 });
  const headM = new THREE.MeshStandardMaterial({ color: 0xdedad0, emissive: 0xfff2d8, emissiveIntensity: 0, roughness: 0.2 });
  const carCols = [0x5b2420, 0x2c3a4a, 0x6b6a66, 0x1e1f22, 0x7a6a4a, 0x384236, 0x8a8a86, 0xb8b6b0];
  // per car: the painted shell (body, roof, a door hanging open) is one merged mesh and the glass another;
  // tyres, rims and lamps are instanced across the whole jam
  const carI = { tyre: [], rim: [], rimB: [], head: [], headLit: [], tail: [], tailLit: [] };
  const roofG = new THREE.BoxGeometry(1.0, 0.05, 1.5), doorG = new THREE.BoxGeometry(1.05, 0.62, 0.06), lampG = new THREE.BoxGeometry(0.06, 0.12, 0.34);
  const carBody = carShape.index ? carShape.toNonIndexed() : carShape;
  const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3(1, 1, 1), _ce = new THREE.Euler();
  function car(x, z, yaw, flipped = false, burning = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; if (flipped) { g.rotation.z = Math.PI; g.position.y = 1.55; } root.add(g); g.updateMatrixWorld(true);
    const paint = burning ? new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.95 }) : new THREE.MeshStandardMaterial({ color: carCols[(R() * carCols.length) | 0], roughness: 0.32, metalness: 0.6 });
    const parts = [carBody.clone(), roofG.clone().toNonIndexed().translate(-0.15, 1.47, 0)];
    if (R() < 0.6 && !flipped && !burning) parts.push(doorG.clone().toNonIndexed().rotateY(-0.85).translate(0.55, 0.68, 1.3));
    const shell = new THREE.Mesh(mergeGeometries(parts), paint); shell.castShadow = shell.receiveShadow = true; g.add(shell);
    const cab = new THREE.Mesh(cabinShape, burning ? burnt : carGlass); cab.castShadow = true; g.add(cab);
    const at = (list, px, py, pz, rx = 0) => { _cq.setFromEuler(_ce.set(rx, 0, 0)); _cm.compose(new THREE.Vector3(px, py, pz), _cq, _cs).premultiply(g.matrixWorld); list.push(_cm.clone()); };
    const lit = !burning && R() < 0.45;
    for (const sz of [-0.62, 0.62]) { at(lit ? carI.headLit : carI.head, 2.25, 0.7, sz); at(lit ? carI.tailLit : carI.tail, -2.3, 0.78, sz); }
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.82, 0.82]) { at(carI.tyre, sx, 0.34, sz, Math.PI / 2); at(burning ? carI.rimB : carI.rim, sx, 0.34, sz + Math.sign(sz) * 0.01, Math.PI / 2); }
    const c0 = Math.abs(Math.cos(yaw)) * 2.3 + Math.abs(Math.sin(yaw)) * 1.0, c1 = Math.abs(Math.sin(yaw)) * 2.3 + Math.abs(Math.cos(yaw)) * 1.0;
    col(x - c0, 0, z - c1, x + c0, 1.6, z + c1);
    if (burning) { fireSpots.push([new THREE.Vector3(x, 1.2, z), 2.2]); smokeSpots.push([new THREE.Vector3(x, 1.5, z), 1.6, 6]); }
  }
  const carsDone = () => {
    const headLitM = headM.clone(); headLitM.emissiveIntensity = 2.2;
    [[tyreG, tyreM, carI.tyre], [rimG, rimM, carI.rim], [rimG, burnt, carI.rimB], [lampG, headM, carI.head], [lampG, headLitM, carI.headLit],
     [lampG, new THREE.MeshBasicMaterial({ color: 0x3a0c08 }), carI.tail], [lampG, new THREE.MeshBasicMaterial({ color: 0xff2a1a }), carI.tailLit]].forEach(([geo, mat, list]) => {
      if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mm, i) => im.setMatrixAt(i, mm)); im.castShadow = im.receiveShadow = true; root.add(im);
    });
  };
  [[9, 9.6, 0.25], [6, -9, -0.15, false, true], [22, 10.5, 0.05], [24, 4, 2.9], [36, -5, 3.1], [44, -11, 0.2], [54, 6, 0.4, true], [66, -4, 3.0, false, true], [70, 10, 0.1], [78, -11, 3.2],
   [84, 3, 0.9], [110, -6, 0.2], [116, 9, 2.8, false, true], [124, -11, 0.1], [140, 4, 3.0], [144, -6, 0.5, true], [150, 11, 0.1], [-8, 10, 0.2], [-12, -4, 2.8], [30, -12, 0.0]].forEach((c) => car(...c));
  carsDone();
  // a city bus slewed across two lanes
  const bus = box(126, 0, -3, 139, 3.1, 0.2, new THREE.MeshStandardMaterial({ color: 0xb08a2a, roughness: 0.6, metalness: 0.3 }), true); bus.rotation.y = 0.12;
  fireSpots.push([new THREE.Vector3(137, 3.2, -1), 2.6]); smokeSpots.push([new THREE.Vector3(137, 3.5, -1), 2, 8]);
  // street lamps, traffic lights, a bus shelter
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.5 });
  const lampHead = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const flick = [];
  for (let x = -16; x < 160; x += 26) for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(x + (s > 0 ? 13 : 0), 0, s * 16.4); root.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 8, 6), lampMat); pole.position.y = 4; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), lampMat); arm.position.set(0, 8, -s * 1.1); g.add(arm);
    const bent = R() < 0.3; if (bent) { g.rotation.z = rr(-0.6, 0.6); g.rotation.x = rr(-0.3, 0.3); }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.9), R() < 0.55 ? lampHead : burnt); head.position.set(0, 7.95, -s * 2.1); g.add(head);
    if (head.material === lampHead && !bent && flick.length < 5) { const l = new THREE.PointLight(0xffc890, 40, 24, 2); l.position.set(0, 7.6, -s * 2.1); g.add(l); flick.push({ l, seed: x + s }); }
  }
  updaters.push((dt, t) => { for (const f of flick) { const n = Math.sin(t * 17 + f.seed) * Math.sin(t * 5.3 + f.seed * 3); f.l.intensity = n > 0.7 ? 3 : 40; } });
  // debris scattered (instanced, decoration only)
  const debM = rockMat(0x6e6a64, 0x77726b, { flatShading: true, bumpScale: 0.8 }); debM.userData.dustK = 0.25;
  const deb = new THREE.InstancedMesh(rockGeo(41, { detail: 0, flat: 0.35, sharp: 1 }), debM, 220); deb.castShadow = deb.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  for (let i = 0; i < 220; i++) {
    let x = rr(-20, 158); const z = rr(-17.5, 17.5);
    if (x > FX0 - 2 && x < FX1 + 2) x += 6;
    const s = rr(0.08, 0.45) ** 1.3 * 1.6; p3.set(x, s * 0.12, z); e.set(rr(-0.3, 0.3), rr(0, 3), rr(-0.3, 0.3)); q.setFromEuler(e); s3.set(s * rr(0.8, 1.8), s * rr(0.3, 0.6), s * rr(0.6, 1.4));
    m4.compose(p3, q, s3); deb.setMatrixAt(i, m4);
  }
  root.add(deb);
  // a smoking crater from an earlier impact
  const crater = new THREE.Mesh(new THREE.CircleGeometry(6, 28), new THREE.MeshBasicMaterial({ color: 0x050302, transparent: true, opacity: 0.92, depthWrite: false }));
  crater.rotation.x = -Math.PI / 2; crater.position.set(118, 0.02, 3); root.add(crater);
  fireSpots.push([new THREE.Vector3(116, 0, 2), 3], [new THREE.Vector3(120, 0, 5), 2.4]); smokeSpots.push([new THREE.Vector3(118, 0.5, 3), 3, 9]);
  col(114, 0, -1, 122, 1.2, 7);

  // ---------- emergency billboard (shows the real countdown) ----------
  const bbCanvas = document.createElement('canvas'); bbCanvas.width = 1024; bbCanvas.height = 512;
  const bbTex = new THREE.CanvasTexture(bbCanvas); bbTex.colorSpace = THREE.SRGBColorSpace;
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: bbTex, toneMapped: false }));
  bb.position.set(42, 13.5, SZ - 0.32); bb.rotation.y = Math.PI; root.add(bb);
  box(34.6, 9.7, SZ - 0.3, 49.4, 17.3, SZ - 0.05, metal, false);       // the screen's steel frame, bolted to the facade
  let bbLast = -1;
  function paintBillboard(secs) {
    const s = Math.max(0, Math.ceil(secs)); if (s === bbLast) return; bbLast = s;
    const g = bbCanvas.getContext('2d');
    g.fillStyle = '#120404'; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = s % 2 ? '#ff3a24' : '#c8281a'; g.fillRect(0, 0, 1024, 92);
    g.fillStyle = '#fff'; g.font = `500 54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('全球緊急撤離', 512, 48);
    g.fillStyle = '#ffd0b0'; g.font = `300 40px ${FONT}`; g.fillText('地球潮汐瓦解倒數', 512, 160);
    g.fillStyle = '#fff'; g.font = `200 170px ${FONT}`; g.fillText(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, 512, 300);
    g.fillStyle = '#ffb090'; g.font = `300 34px ${FONT}`; g.fillText('前往最近發射站　唔好留喺室內', 512, 448);
    bbTex.needsUpdate = true;
  }

  // ---------- Stellar Suits: a real shop, bright and clean inside ----------
  const SH = 5.2, sx0 = 40, sx1 = 58, sz0 = -36, sz1 = -18;
  const white = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8ec9ff, emissive: 0x3a7cc0, emissiveIntensity: 0.9 });
  const tiles = new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.18, metalness: 0.1 });
  // indoors the burning sky shouldn't tint the white shop pink: the room is lit by its own panels
  white.envMapIntensity = 0.25; tiles.envMapIntensity = 0.45;
  tiles.map.repeat.set(3, 3);
  // shell
  box(sx0, 0, sz0, sx0 + 0.5, SH, sz1, white, true); box(sx1 - 0.5, 0, sz0, sx1, SH, sz1, white, true); box(sx0, 0, sz0, sx1, SH, sz0 + 0.5, white, true);
  box(sx0, 0, sz1 - 0.5, 45, SH, sz1, white, true); box(53, 0, sz1 - 0.5, sx1, SH, sz1, white, true);
  box(45, 3.6, sz1 - 0.5, 53, SH, sz1, white, false);
  box(sx0, SH - 0.12, sz0, sx1, SH, sz1, white, false);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(sx1 - sx0 - 1, sz1 - sz0 - 1), tiles); floor.rotation.x = -Math.PI / 2; floor.position.set((sx0 + sx1) / 2, 0.02, (sz0 + sz1) / 2); root.add(floor);
  // accent light strips along the walls + ceiling light panels
  box(sx0 + 0.5, 3.2, sz0 + 0.5, sx1 - 0.5, 3.28, sz0 + 0.56, trim, false);
  box(sx0 + 0.5, 3.2, sz0 + 0.5, sx0 + 0.56, 3.28, sz1 - 0.5, trim, false); box(sx1 - 0.56, 3.2, sz0 + 0.5, sx1 - 0.5, 3.28, sz1 - 0.5, trim, false);
  const panelM = new THREE.MeshBasicMaterial({ color: 0xf2f6ff });
  const panels = [];
  for (let x = 43; x < 57; x += 4.5) for (let z = -33; z < -20; z += 5) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.2), panelM.clone()); p.position.set(x + 1.3, SH - 0.16, z + 0.6); root.add(p); panels.push(p); }
  panels[4].rotation.z = 0.5; panels[4].position.y -= 0.8;     // one fell and hangs by a wire
  const shopLights = [[44.5, -22], [53.5, -22], [49, -31]].map(([x, z]) => { const l = new THREE.PointLight(0xeef3ff, 40, 16, 2); l.position.set(x, SH - 0.5, z); root.add(l); return l; });
  updaters.push((dt, t) => { shopLights[1].intensity = Math.sin(t * 23) * Math.sin(t * 3.1) > 0.55 ? 3 : 40; panels[4].material.color.setScalar(shopLights[1].intensity > 10 ? 1 : 0.25); });
  // storefront glass (some panes gone) and the sign
  const glassM = new THREE.MeshStandardMaterial({ color: 0x9fc0d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
  for (const [x0, x1] of [[40.5, 45], [53, 57.5]]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 3.4), glassM); g.position.set((x0 + x1) / 2, 1.9, sz1 + 0.02); root.add(g); }
  const shards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.5, side: THREE.DoubleSide }), 70);
  for (let i = 0; i < 70; i++) { p3.set(rr(41, 57), 0.03, rr(-21, -14)); e.set(-Math.PI / 2, 0, rr(0, 6)); q.setFromEuler(e); s3.set(rr(0.4, 1.4), rr(0.4, 1.4), 1); m4.compose(p3, q, s3); shards.setMatrixAt(i, m4); }
  root.add(shards);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: signTex([['星環太空衣', 118, 100, '#eef6ff', 400], ['STELLAR SUITS', 42, 196, '#8ec9ff', 300]], { bg: null, glow: true }), transparent: true, toneMapped: false }));
  sign.position.set(49, 4.5, sz1 + 0.35); root.add(sign);
  const signBack = box(42, 3.4, sz1 + 0.05, 56, 5.6, sz1 + 0.3, new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.4, metalness: 0.5 }), false);
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.1), new THREE.MeshBasicMaterial({ map: signTex([['EVA-9 新款到貨', 92, 90, '#ffc27a', 500], ['撤離季　全場免費', 64, 186, '#ffffff', 300]], { bg: null, w: 1024, h: 280 }), transparent: true, toneMapped: false }));
  decal.position.set(42.8, 2.6, sz1 + 0.04); root.add(decal);
  // posters on the back wall
  [['EVA-9', '去火星，著得舒服啲', '#c6702e'], ['ORBIT 3', '輕過羽毛嘅頭盔', '#3a7cc0'], ['STELLAR', '公元 3385 年夏季系列', '#8a5ac8']].forEach(([a, b, c], i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), new THREE.MeshBasicMaterial({ map: posterTex(a, b, c), toneMapped: false })); p.position.set(43.5 + i * 5.5, 2.3, sz0 + 0.52); root.add(p);
  });
  // helmet wall: shelves with helmets on both side walls
  const helmM = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.3, metalness: 0.05 });
  const visorM = new THREE.MeshStandardMaterial({ color: 0xd9b072, roughness: 0.08, metalness: 0.95, envMapIntensity: 1.4 });
  const ringM = new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.4, metalness: 0.7 });
  const helmGeo = mergeGeometries([new THREE.SphereGeometry(0.19, 28, 20).toNonIndexed()]), visGeo = new THREE.SphereGeometry(0.193, 28, 16, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.38);
  const neckGeo = new THREE.TorusGeometry(0.13, 0.035, 10, 28).rotateX(Math.PI / 2).translate(0, -0.17, 0);
  const helmet = (x, y, z, yaw, tilt = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(tilt, yaw, 0); root.add(g);
    for (const [geo, m] of [[helmGeo, helmM], [visGeo, visorM], [neckGeo, ringM]]) { const o = new THREE.Mesh(geo, m); o.castShadow = true; g.add(o); } return g; };
  for (const xw of [sx0 + 0.9, sx1 - 0.9]) for (let lvl = 0; lvl < 3; lvl++) {
    box(xw - 0.4, 0.9 + lvl * 0.9, -34, xw + 0.4, 0.96 + lvl * 0.9, -27, white, false);
    for (let k = 0; k < 5; k++) { if (R() < 0.2) continue; helmet(xw, 1.17 + lvl * 0.9 + 0.04, -33.4 + k * 1.4, (xw < 49 ? Math.PI / 2 : -Math.PI / 2) + rr(-0.25, 0.25)); }
  }
  [[44, -24, 0.4], [45.2, -23.4, 2.1], [52.5, -20.5, 4.0]].forEach(([x, z, a]) => helmet(x, 0.17, z, a, 1.2));     // knocked off the shelves
  // counter with a till screen
  box(50.5, 0, -24, 55.5, 1.05, -23, white, true); box(50.4, 1.05, -24.1, 55.6, 1.12, -22.9, new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.3, metalness: 0.5 }), false);
  const till = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshBasicMaterial({ color: 0x5aa8ff })); till.position.set(53, 1.42, -23.45); till.rotation.x = -0.3; root.add(till);
  // display suits: on podiums with spot lights; any of them can be taken
  const suitW = new THREE.MeshStandardMaterial({ color: 0xd2d6dc, roughness: 0.55 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xc6702e, roughness: 0.5 });
  const suits = [];
  // display suits: the same suit he will wear, posed on a mannequin stand and baked into a few static meshes
  const suitBake = (() => {
    const tmp = new THREE.Scene(), pl = createPlayer(tmp, { noShadow: true });
    pl.setSuit(true); pl.st.mode = 'walk'; pl.st.speed = 0; pl.place(new THREE.Vector3(0, 0, 0), 0); pl.animate(0.016, 0, 0);
    const r = pl.rig; r.armL.sh.rotation.set(0.05, 0, 0.32); r.armR.sh.rotation.set(0.05, 0, -0.32); r.armL.el.rotation.x = r.armR.el.rotation.x = -0.18;
    r.neck.rotation.set(0, 0, 0); r.hips.rotation.set(0, 0, 0);
    pl.root.updateMatrixWorld(true);
    const byMat = new Map();
    pl.root.traverse((o) => { if (!o.isMesh) return; let vis = o.visible; o.traverseAncestors((a) => { if (!a.visible) vis = false; }); if (!vis) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(g); });
    const parts = [...byMat].map(([m, gs]) => [mergeGeometries(gs), m]);
    tmp.remove(pl.root); return parts;
  })();
  function suit(x, z, yaw, podium = true) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; root.add(g);
    if (podium) { const pd = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.3, 24), white); pd.position.y = 0.15; g.add(pd); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.025, 6, 32), trim); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 })); post.position.set(0, 0.75, -0.18); g.add(post); }
    const body = new THREE.Group(); body.position.y = podium ? 0.3 : 0; body.rotation.y = Math.PI; g.add(body);    // face the shop floor
    for (const [geo, mat] of suitBake) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; body.add(m); }
    col(x - 0.6, 0, z - 0.6, x + 0.6, 2.2, z + 0.6);
    suits.push(g); return g;
  }
  suit(44, -33.2, 0); suit(49, -33.2, 0); suit(54, -33.2, 0); suit(44.5, -27.5, 0.6); suit(53.5, -27.8, -0.6);
  const knocked = suit(47, -21.5, 0, false); knocked.rotation.z = Math.PI / 2; knocked.position.y = 0.3; colliders.pop(); suits.pop();
  suits.forEach((g) => { const sp = new THREE.SpotLight(0xffffff, 70, 7, 0.45, 0.6, 2); sp.position.set(g.position.x, SH - 0.3, g.position.z + 0.6); sp.target.position.copy(g.position); root.add(sp, sp.target); });

  // ---------- NASA east-coast launch site and the RJ-7 lab ----------
  const { rocketProp } = buildNasa(root, { col, fireSpots, smokeSpots, updaters, signTex, burnt, metal });

  // ---------- evacuation launches in the distance (the last ships leaving) ----------
  const launches = [{ t0: 6, x: 520, z: 420 }, { t0: 32, x: 640, z: -380 }].map((L) => {
    const trailG = new THREE.BufferGeometry(); const N = 90; const tp = new Float32Array(N * 3).fill(-999); trailG.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    const trail = new THREE.Points(trailG, new THREE.PointsMaterial({ color: 0xcfc4b8, size: 9, transparent: true, opacity: 0.55, depthWrite: false, fog: false })); trail.frustumCulled = false; root.add(trail);
    const head = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2d8, fog: false })); head.visible = false; root.add(head);
    return { ...L, trail, tp, N, head, k: 0 };
  });

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0x9a6050, 0x2e1a12, 1.7); scene.add(hemi);
  const glow = new THREE.DirectionalLight(0xffb48a, 1.3); glow.position.copy(BH_DIR).multiplyScalar(200); scene.add(glow, glow.target);
  // the black hole's disc is the low key light: long hard-ish shadows down the boulevard, in a box that follows you
  glow.castShadow = true; glow.shadow.mapSize.set(2048, 2048); glow.shadow.bias = -0.0004; glow.shadow.normalBias = 0.03;
  Object.assign(glow.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 420 }); glow.shadow.camera.updateProjectionMatrix();
  const shadowFollow = (p) => { glow.target.position.set(Math.round(p.x), 0, Math.round(p.z)); glow.position.copy(glow.target.position).addScaledVector(BH_DIR, 200); };
  // under a roof the open-sky ambient goes: ease the hemisphere light down inside the lab (the eye adjusts over a second)
  let indoorK = 0; const HEMI0 = 1.7;
  const indoor = (p, dt) => { const inLab = p.x > 200.5 && p.x < 231.5 && p.z > -14.5 && p.z < 14.5; indoorK += ((inLab ? 1 : 0) - indoorK) * Math.min(1, dt * 1.5); hemi.intensity = HEMI0 * (1 - 0.62 * indoorK); };

  // ---------- sky ----------
  const sky = createDoomSky(1500); scene.add(sky); const skyMat = sky.material;

  const spots = {
    wake: new THREE.Vector3(2, 0, 4),
    shopDoor: new THREE.Vector3(49, 0, -16),
    shopOut: new THREE.Vector3(49, 0, -14),
    fissure: new THREE.Vector3(97.5, 0, 0),
    gate: new THREE.Vector3(158, 0, 0),
    labDoor: new THREE.Vector3(198, 0, 0),
    rocket: new THREE.Vector3(216, 0, 2.4),
    launch: new THREE.Vector3(216, 0.9, 0),
  };

  // floor height under a point (stand on low rubble, cars, the pedestal; pits drop away)
  function floorAt(x, z, y, r = 0.3) {
    for (const p of pits) if (x > p.x0 + r * 0.5 && x < p.x1 - r * 0.5 && z > p.z0 && z < p.z1) return -60;
    let f = 0;
    for (const c of colliders) {
      if (!c.on || c.invisible || c.max[1] > y + 0.5) continue;
      if (x > c.min[0] - r * 0.4 && x < c.max[0] + r * 0.4 && z > c.min[2] - r * 0.4 && z < c.max[2] + r * 0.4) f = Math.max(f, c.max[1]);
    }
    return f;
  }
  function ceilingAt(x, z) {
    if (x > sx0 && x < sx1 && z > sz0 && z < sz1 - 0.3) return SH - 0.3;
    if (x > 200 && x < 232 && z > -15 && z < 15) return (x > 210 && x < 222 && z > -6 && z < 6) ? 400 : 12 - 0.3;   // the lab ceiling, open under the hole
    return 400;
  }
  const inShop = (x, z) => x > sx0 && x < sx1 && z > sz0 && z < sz1 - 0.2;

  return {
    root, colliders, pits, spots, floorAt, ceilingAt, inShop, fireSpots, smokeSpots, rocketProp, suits, sky, skyMat, hemi, glow, shadowFollow, indoor,
    // nearest display suit within reach (any of them can be taken)
    suitNear(p, reach = 2.1) { let best = null, bd = reach; for (const g of suits) { if (!g.visible) continue; const d = Math.hypot(g.position.x - p.x, g.position.z - p.z); if (d < bd) { bd = d; best = g; } } return best; },
    startCollapse() { if (!collapse.on) { collapse.on = true; collapse.t = 0; } },
    get collapsing() { return collapse.on && !collapse.done; },
    update(dt, t, prog, secsLeft, smoke) {
      skyMat.uniforms.uT.value = t; skyMat.uniforms.uProg.value = prog;
      paintBillboard(secsLeft);
      for (const u of updaters) u(dt, t);
      // the tower: leans slowly, then goes, sinking into its own dust
      if (collapse.on && !collapse.done) {
        collapse.t += dt; const k = collapse.t;
        fallPivot.rotation.x = 0.55 * Math.pow(Math.min(1, k / 11), 2.2);
        fallPivot.position.y = -Math.max(0, k - 4) * 9;
        if (smoke && Math.random() < dt * 14) smoke.puff(new THREE.Vector3(fall.x + (Math.random() - 0.5) * 60, Math.random() * 20, fall.z + (Math.random() - 0.5) * 40), 60, 6, 16);
        if (k > 14) { collapse.done = true; fallPivot.visible = false; }
      }
      // evacuation launches: a bright point climbing on a bending column of smoke
      for (const L of launches) {
        const k = t - L.t0; if (k < 0) continue;
        if (k > 40) { L.head.visible = false; continue; }
        const y = 6 * k * k + 20 * k, x = L.x + k * k * 2.5;
        L.head.visible = true; L.head.position.set(x, y, L.z);
        const i = Math.min(L.N - 1, Math.floor(k * 3)); if (i > L.k) { for (let j = L.k; j <= i; j++) { L.tp[j * 3] = x; L.tp[j * 3 + 1] = y; L.tp[j * 3 + 2] = L.z; } L.k = i + 1; L.trail.geometry.attributes.position.needsUpdate = true; }
      }
    },
  };
}
