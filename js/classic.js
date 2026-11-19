// Beyond the Horizon · early-twentieth-century masonry street fronts: a stone base with pilasters and shopfronts,
// a brick or limestone shaft of deep-set sash windows with stone surrounds, belt courses, and a heavy cornice.
// Depth is real geometry (surrounds, sills, pilasters and cornices stand proud of the wall and throw shadows);
// windows, surrounds and dentils are instanced across every building, so a whole street costs a handful of draws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry, canvasTex, fbm } from './util.js';
import { safeBump } from './rock.js';

const FONT = '"Noto Sans TC", "Michroma", system-ui, sans-serif';
const GROUND = 5.2, STOREY = 3.6, BAY = 3.2, WIN_W = 1.25, WIN_H = 2.1, SILL = 0.85;

// ---------- masonry textures (true scale: `tile` metres per repeat) ----------
function noiseFill(g, S, base, amt, seed, sx = 60, sy = 60) {
  const img = g.createImageData(S, S), r = mulberry(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = 1 + amt * (fbm(x / sx + seed, y / sy, 3) * 0.6 + (r() - 0.5) * 0.5), i = (y * S + x) * 4;
    img.data[i] = base[0] * n; img.data[i + 1] = base[1] * n; img.data[i + 2] = base[2] * n; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function ashlarTex(seed, base, rows = 8, cols = 4, groove = 0) {
  const S = 512, r = mulberry(seed);
  return canvasTex(S, S, (g) => {
    noiseFill(g, S, base, 0.16, seed);
    const rh = S / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * (S / cols / 2);
      for (let x = -1; x < cols + 1; x++) {   // block-to-block tone shifts
        const v = (r() - 0.5) * 0.14; g.fillStyle = v > 0 ? `rgba(255,248,235,${v})` : `rgba(30,24,18,${-v})`; g.fillRect(x * S / cols + off, y * rh, S / cols, rh);
      }
      g.fillStyle = groove ? 'rgba(20,16,12,0.75)' : 'rgba(60,52,44,0.55)'; g.fillRect(0, y * rh, S, groove || 2);
      if (groove) { g.fillStyle = 'rgba(255,245,230,0.18)'; g.fillRect(0, y * rh + groove, S, 2); }
      g.fillStyle = 'rgba(60,52,44,0.45)';
      for (let x = 0; x <= cols; x++) g.fillRect(x * S / cols + off, y * rh, 2, rh);
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,16,12,${0.04 + r() * 0.08})`; g.fillRect(r() * S, r() * S, 1 + r() * 3, 20 + r() * 120); }   // runs of grime
  }, { repeat: true });
}
function brickTex(seed, base) {
  const S = 512, r = mulberry(seed), BH = S / 44, BW = BH * 3.3;     // 44 courses per 3 m
  return canvasTex(S, S, (g) => {
    g.fillStyle = '#8f877a'; g.fillRect(0, 0, S, S);                 // mortar
    for (let y = 0; y < 44; y++) {
      const off = (y % 2) * BW / 2;
      for (let x = -1; x < S / BW + 1; x++) {
        const k = 0.8 + r() * 0.35, burnt = r() < 0.06 ? 0.6 : 1;
        g.fillStyle = `rgb(${base[0] * k * burnt | 0},${base[1] * k * burnt | 0},${base[2] * k * burnt | 0})`;
        g.fillRect(x * BW + off + 1, y * BH + 1, BW - 2, BH - 2);
      }
    }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,240,220'},${r() * 0.12})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(30,24,18,${0.05 + r() * 0.1})`; g.fillRect(r() * S, r() * S, 2 + r() * 4, 30 + r() * 140); }
  }, { repeat: true });
}
function masonryMat(map, tileU, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: opts.bump ?? 1.4, roughness: 0.9, ...opts.mat });
  m.userData.tile = tileU;
  // weathering that never repeats: long vertical streaks from the same texture stretched, dirt splashed up the base, soot near the top
  m.onBeforeCompile = (sh) => {
    safeBump(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <map_fragment>', `#include <map_fragment>
      float streak = texture2D(map, vec2((vWP.x + vWP.z) * 0.071, vWP.y * 0.006)).g;
      float dirt = 1.0 - smoothstep(0.2, 2.6, vWP.y);
      diffuseColor.rgb *= mix(1.0, 0.62 + 0.7 * streak, 0.42);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.46, 0.42), dirt * 0.7);`);
  };
  return m;
}

// ---------- window, shopfront and sign textures ----------
function sashTex(kind) {
  return canvasTex(128, 256, (g, w, h) => {
    const r = mulberry(kind === 'lit' ? 3 : kind === 'broken' ? 5 : 7);
    const gl = g.createLinearGradient(0, 0, 0, h); gl.addColorStop(0, kind === 'lit' ? '#6a4a2a' : '#1d242b'); gl.addColorStop(1, kind === 'lit' ? '#3a2614' : '#0a0c0e');
    g.fillStyle = kind === 'broken' ? '#040303' : gl; g.fillRect(0, 0, w, h);
    if (kind === 'lit') { g.fillStyle = 'rgba(220,170,110,0.35)'; g.fillRect(8, 10, 40, h - 20); g.fillRect(w - 48, 10, 40, h - 20); }   // curtains
    if (kind === 'broken') {   // shards left in the frame
      g.fillStyle = '#1d242b'; for (let i = 0; i < 4; i++) { g.beginPath(); const x = r() * w, y = r() < 0.5 ? 0 : h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (y ? -1 : 1) * (20 + r() * 70)); g.lineTo(x + (r() - 0.5) * 40, y); g.fill(); }
    }
    const fr = kind === 'lit' ? '#5a4632' : '#e2dccd';
    g.fillStyle = fr; g.fillRect(0, 0, w, 7); g.fillRect(0, h - 7, w, 7); g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h);
    g.fillRect(0, h / 2 - 5, w, 10); g.fillRect(w / 2 - 3, 0, 6, h);                // meeting rail and muntins: two over two
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(9, 9, w / 2 - 14, 18);
  });
}
function shopTex(kind, seed) {
  return canvasTex(512, 384, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h);
    if (kind === 'boarded') {     // plywood over the glass, spray-painted
      for (let i = 0; i < 5; i++) { const v = 120 + r() * 30; g.fillStyle = `rgb(${v},${v * 0.82 | 0},${v * 0.58 | 0})`; g.fillRect(i * w / 5 + 2, 60, w / 5 - 4, h - 70); }
      g.strokeStyle = 'rgba(200,40,30,0.85)'; g.lineWidth = 9; g.beginPath(); g.moveTo(60, 120); g.lineTo(200, 300); g.moveTo(200, 120); g.lineTo(60, 300); g.stroke();
      g.fillStyle = 'rgba(30,30,30,0.9)'; g.font = `700 54px ${FONT}`; g.fillText('已撤離', 250, 230);
    } else {
      const gl = g.createLinearGradient(0, 60, 0, h); gl.addColorStop(0, '#2a3036'); gl.addColorStop(1, '#0b0d0f'); g.fillStyle = gl; g.fillRect(10, 64, w - 20, h - 110);
      if (kind === 'broken') { g.fillStyle = '#050404'; g.beginPath(); g.moveTo(80, 64); g.lineTo(300, 64); g.lineTo(260, 180); g.lineTo(330, 274); g.lineTo(60, 274); g.lineTo(120, 170); g.fill(); }
      g.fillStyle = '#2c2a26'; g.fillRect(w / 2 - 4, 64, 8, h - 110); g.fillRect(10, h - 50, w - 20, 40);   // mullion, kickplate
    }
    g.fillStyle = '#121314'; g.fillRect(0, 0, w, 56);   // sign band, letters long gone
    g.fillStyle = 'rgba(200,190,170,0.25)'; for (let i = 0; i < 6; i++) g.fillRect(40 + i * 70 + r() * 10, 16, 40, 24);
  });
}
function bladeSignTex(name, sub) {
  return canvasTex(256, 1536, (g, w, h) => {
    g.fillStyle = '#20140e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b88a4a'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
    const r = mulberry(13);
    for (let y = 40; y < h - 30; y += 46) for (const x of [34, w - 34]) { const on = r() > 0.35; g.fillStyle = on ? '#ffd9a0' : '#3a2a1a'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
    g.fillStyle = '#f4ead8'; g.font = `600 150px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...name].forEach((ch, i) => g.fillText(ch, w / 2, 190 + i * 230));
    g.font = `400 46px ${FONT}`; g.fillStyle = '#d8a860'; g.save(); g.translate(w / 2, h - 170); g.fillText(sub, 0, 0); g.restore();
  });
}
function posterTex() {
  return canvasTex(512, 768, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b1626'); gr.addColorStop(1, '#02050a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`; g.fillRect(Math.random() * w, Math.random() * h * 0.6, 2, 2); }
    g.fillStyle = '#c86a2a'; g.beginPath(); g.arc(w / 2, h * 1.05, w * 0.75, 0, 7); g.fill();
    g.fillStyle = '#e8d8c0'; g.beginPath(); g.moveTo(w / 2, h * 0.3); g.lineTo(w / 2 + 36, h * 0.52); g.lineTo(w / 2 - 36, h * 0.52); g.fill();   // the ark, rising
    g.fillStyle = '#f2ece2'; g.font = `600 76px ${FONT}`; g.textAlign = 'center'; g.fillText('方舟計劃', w / 2, 120);
    g.font = `300 32px ${FONT}`; g.fillStyle = '#ffc27a'; g.fillText('一個位都唔可以浪費', w / 2, 172);
    g.font = `300 24px ${FONT}`; g.fillStyle = '#8ec9ff'; g.fillText('地平線研究所 · 登記截止 3384 年 12 月', w / 2, h - 40);
  });
}
function flagTex() {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#16233a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8a050'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, h * 1.3, h * 0.95, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.fillStyle = '#e8e0d0'; g.beginPath(); g.arc(w / 2, h * 0.36, 9, 0, 7); g.fill();
  });
}

// ---------- shapes ----------
function corniceGeo(len, out = 1.1, hgt = 1.0) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.18, 0); s.lineTo(0.18, 0.12); s.quadraticCurveTo(0.3, 0.14, 0.34, 0.3);    // bed moulding
  s.lineTo(out * 0.82, 0.42); s.quadraticCurveTo(out, 0.46, out, 0.62);                                  // corona soffit and cyma
  s.lineTo(out, hgt * 0.78); s.lineTo(out - 0.08, hgt * 0.84); s.lineTo(out - 0.08, hgt); s.lineTo(0, hgt); s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); g.translate(len, 0, 0);          // runs along +x, projects toward +z
  return g;
}
function surroundGeo() {
  const parts = [];
  const b = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  b(WIN_W + 0.42, 0.3, 0.22, 0, WIN_H / 2 + 0.15, 0.11);           // lintel
  b(0.26, 0.36, 0.26, 0, WIN_H / 2 + 0.17, 0.13);                    // keystone
  b(WIN_W + 0.3, 0.12, 0.3, 0, -WIN_H / 2 - 0.06, 0.15);             // sill
  b(0.15, WIN_H, 0.14, -WIN_W / 2 - 0.075, 0, 0.07); b(0.15, WIN_H, 0.14, WIN_W / 2 + 0.075, 0, 0.07);   // jambs
  return mergeGeometries(parts);
}

export function createClassicStreet(root, { cols, fireSpots, smokeSpots, shadow = true } = {}) {
  const R = mulberry(1907), rr = (a, b) => a + (b - a) * R();
  const P = {
    lime: { wall: masonryMat(ashlarTex(31, [184, 168, 140]), 4.8), trim: new THREE.MeshStandardMaterial({ color: 0xc4b498, roughness: 0.85 }) },
    buff: { wall: masonryMat(brickTex(32, [176, 140, 98]), 3), trim: new THREE.MeshStandardMaterial({ color: 0xbfb197, roughness: 0.85 }) },
    red:  { wall: masonryMat(brickTex(33, [132, 70, 52]), 3), trim: new THREE.MeshStandardMaterial({ color: 0xb9ab92, roughness: 0.85 }) },
    sand: { wall: masonryMat(ashlarTex(34, [196, 176, 140], 10, 5), 4.8), trim: new THREE.MeshStandardMaterial({ color: 0xd2c2a2, roughness: 0.85 }) },
  };
  const baseM = masonryMat(ashlarTex(35, [150, 140, 124], 8, 3, 7), 5.2, { bump: 2.2 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.95 });
  const ironM = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.6, metalness: 0.7 });
  const winGeo = new THREE.PlaneGeometry(WIN_W, WIN_H), surGeo = surroundGeo(), dentGeo = new THREE.BoxGeometry(0.16, 0.2, 0.22);
  const shopGeo = new THREE.PlaneGeometry(1, 1);
  const winMats = { glass: new THREE.MeshStandardMaterial({ map: sashTex('glass'), roughness: 0.08 }), lit: new THREE.MeshStandardMaterial({ map: sashTex('lit'), emissive: 0xffffff, emissiveMap: sashTex('lit'), emissiveIntensity: 1.1, roughness: 0.3 }), broken: new THREE.MeshStandardMaterial({ map: sashTex('broken'), roughness: 0.9 }) };
  const shopMats = { glass: new THREE.MeshStandardMaterial({ map: shopTex('glass', 1), roughness: 0.1 }), broken: new THREE.MeshStandardMaterial({ map: shopTex('broken', 2), roughness: 0.6 }), boarded: new THREE.MeshStandardMaterial({ map: shopTex('boarded', 3), roughness: 0.9 }) };
  const inst = { win: { glass: [], lit: [], broken: [] }, shop: { glass: [], broken: [], boarded: [] }, sur: new Map(), dent: new Map() };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const push = (list, frame, x, y, z, sx = 1, sy = 1, sz = 1) => { v.set(x, y, z).applyMatrix4(frame); list.push(new THREE.Matrix4().compose(v.clone(), q.setFromRotationMatrix(frame).clone(), sc.set(sx, sy, sz).clone())); };
  const keyed = (map, mat) => { if (!map.has(mat)) map.set(mat, []); return map.get(mat); };
  const meshes = [];
  // static trim is baked into one merged mesh per material at finish(): hundreds of pilasters and cornices, a few draws
  const stat = new Map(), _t = new THREE.Matrix4();
  const add = (geo, mat, frame, x, y, z) => {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(_t.copy(frame).multiply(new THREE.Matrix4().makeTranslation(x, y, z)));
    if (!stat.has(mat)) stat.set(mat, []); stat.get(mat).push(g); return g;
  };
  const boxUVd = (g, sx, sy, sz, tile) => { const uv = g.attributes.uv, n = g.attributes.normal; for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); uv.setXY(i, uv.getX(i) * (ax > 0.5 ? sz : sx) / tile, uv.getY(i) * (ay > 0.5 ? sz : sy) / tile); } return g; };

  // one facade, in its own frame: x along the front (0..W), y up, +z out to the street
  function facade(frame, W, H, pal, { base = true, floors, from = GROUND, shopKinds, top = true, burning = false }) {
    const nb = Math.max(1, Math.floor((W - 1.2) / BAY)), x0 = (W - nb * BAY) / 2;
    if (base) {
      add(boxUVd(new THREE.BoxGeometry(W + 0.2, GROUND, 0.3), W + 0.2, GROUND, 0.3, 5.2), baseM, frame, W / 2, GROUND / 2, 0.15);
      for (let k = 0; k <= nb; k++) add(new THREE.BoxGeometry(0.7, GROUND - 0.3, 0.32), baseM, frame, x0 + k * BAY, (GROUND - 0.3) / 2, 0.42);
      for (let k = 0; k < nb; k++) {
        const kind = shopKinds ? shopKinds[k % shopKinds.length] : (R() < 0.3 ? 'boarded' : R() < 0.35 ? 'broken' : 'glass');
        push(inst.shop[kind], frame, x0 + (k + 0.5) * BAY, 2.45, 0.31, BAY - 0.75, 4.1, 1);
      }
      add(new THREE.BoxGeometry(W + 0.7, 0.5, 0.75), pal.trim, frame, W / 2, GROUND + 0.05, 0.37);   // belt course over the base
    }
    for (let f = 0; f < floors; f++) {
      const yf = from + f * STOREY, yc = yf + SILL + WIN_H / 2;
      for (let k = 0; k < nb; k++) {
        const r = R(), kind = r < 0.1 ? 'broken' : r < 0.17 ? 'lit' : 'glass';
        push(inst.win[kind], frame, x0 + (k + 0.5) * BAY, yc, 0.025);
        push(keyed(inst.sur, pal.trim), frame, x0 + (k + 0.5) * BAY, yc, 0);
        if (kind === 'broken' && burning && R() < 0.3 && fireSpots) { const p = new THREE.Vector3(x0 + (k + 0.5) * BAY, yc - 0.6, 0.6).applyMatrix4(frame); fireSpots.push([p, rr(1.2, 2.2)]); }
      }
      if (f === floors - 2 && floors > 3) add(new THREE.BoxGeometry(W + 0.3, 0.28, 0.32), pal.trim, frame, W / 2, yf + STOREY - 0.12, 0.16);   // a string course under the top storey
    }
    // quoins up the corners
    const qh = H - (base ? GROUND : from);
    for (const xx of [0.32, W - 0.32]) add(new THREE.BoxGeometry(0.64, qh, 0.1), pal.trim, frame, xx, H - qh / 2, 0.05);
    if (top) {
      add(corniceGeo(W + 1.0), pal.trim, frame, -0.5, H, 0);
      for (let x = -0.3; x < W + 0.3; x += 0.42) push(keyed(inst.dent, pal.trim), frame, x, H + 0.3, 0.3);
    }
  }

  // a block: footprint x0..x1 along the street, depth into the block; side 'N' (street at +z) or 'S' (street at -z)
  function block({ x0, x1, zFace, depth = 20, side = 'N', floors = 6, pal = 'lime', base = true, from = GROUND, sides = true, shopKinds, burning = false }) {
    const W = x1 - x0, H = from + floors * STOREY + 0.6, pp = P[pal];
    const sgn = side === 'N' ? 1 : -1, zBack = zFace - sgn * depth;
    const body = new THREE.Mesh(boxUVd(new THREE.BoxGeometry(W, H - (base ? 0 : from), depth), W, H - (base ? 0 : from), depth, pp.wall.userData.tile), [pp.wall, pp.wall, roofM, roofM, pp.wall, pp.wall]);
    body.position.set((x0 + x1) / 2, base ? H / 2 : from + (H - from) / 2, (zFace + zBack) / 2); body.castShadow = body.receiveShadow = shadow; root.add(body); meshes.push(body);
    if (cols) cols(x0, base ? 0 : from, Math.min(zFace, zBack), x1, H + 1, Math.max(zFace, zBack));
    // parapet
    add(new THREE.BoxGeometry(W, 0.9, 0.35), pp.wall, new THREE.Matrix4(), (x0 + x1) / 2, H + 1.45, zFace - sgn * 0.2);
    // street front
    const fr = new THREE.Matrix4().makeRotationY(side === 'N' ? 0 : Math.PI).setPosition(side === 'N' ? x0 : x1, 0, zFace);
    facade(fr, W, H, pp, { base, floors, from, shopKinds, burning });
    // ends that face the cross streets
    // ends that face the cross streets (west end faces -x and runs toward +z; east end faces +x and runs toward -z)
    const ends = sides === true ? [0, 1] : sides === 'w' ? [0] : sides === 'e' ? [1] : [];
    for (const end of ends) {
      const zMin = Math.min(zFace, zBack), zMax = Math.max(zFace, zBack);
      const f2 = new THREE.Matrix4().makeRotationY(end ? Math.PI / 2 : -Math.PI / 2).setPosition(end ? x1 : x0, 0, end ? zMax : zMin);
      facade(f2, depth, H, pp, { base, floors, from, burning });
    }
    if (burning && smokeSpots) smokeSpots.push([new THREE.Vector3((x0 + x1) / 2, H + 1, zFace - sgn * depth * 0.4), 1.6, 16]);
    return { H, sgn };
  }

  // ---------- street furniture in the same idiom ----------
  function bladeSign(x, zFace, sgn, y0, name, sub) {
    const tex = bladeSignTex(name, sub);
    const face = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.5 });
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 1.5), [face, face, ironM, ironM, ironM, ironM]);
    g.position.set(x, y0 + 4.5, zFace + sgn * 1.25); g.castShadow = true; root.add(g);
    for (const yy of [y0 + 1, y0 + 8]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.0), ironM); br.position.set(x, yy, zFace + sgn * 0.5); root.add(br); }
  }
  function flags(x, zFace, sgn, y) {
    const ft = flagTex(), fm = new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.85 });
    for (const dx of [-2.2, 2.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 6), ironM);
      pole.position.set(x + dx, y + 1.0, zFace + sgn * 1.1); pole.rotation.x = sgn * 0.75; root.add(pole);
      const g = new THREE.PlaneGeometry(1.5, 0.95, 8, 1), pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) { const u = (pa.getX(i) + 0.75) / 1.5; pa.setZ(i, Math.sin(u * 3.2) * 0.08 * u); pa.setY(i, pa.getY(i) - u * u * 0.18); }
      g.computeVertexNormals();
      const fl = new THREE.Mesh(g, fm); fl.rotation.y = Math.PI / 2; fl.position.set(x + dx, y + 1.95, zFace + sgn * 2.3); fl.castShadow = true; root.add(fl);
    }
  }
  function busShelter(x, z, sgn) {
    const glassM = new THREE.MeshStandardMaterial({ color: 0x8aa0b0, roughness: 0.05, transparent: true, opacity: 0.22 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 1.7), ironM); roof.position.set(x, 2.55, z); roof.castShadow = true; root.add(roof);
    for (const dx of [-2.1, 2.1]) for (const dz of [-0.75, 0.75]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 0.08), ironM); p.position.set(x + dx, 1.25, z + dz); root.add(p); }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.0), glassM); back.position.set(x - 0.5, 1.3, z + sgn * 0.78); if (sgn < 0) back.rotation.y = Math.PI; root.add(back);
    const pt = posterTex(), pm = new THREE.MeshStandardMaterial({ map: pt, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: 0.8 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.1, 1.4), [pm, pm, ironM, ironM, ironM, ironM]); panel.position.set(x + 2.1, 1.2, z); panel.castShadow = true; root.add(panel);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.4), ironM); bench.position.set(x - 0.4, 0.48, z + sgn * 0.45); root.add(bench);
    if (cols) cols(x - 2.2, 0, z - 0.85, x + 2.3, 2.6, z + 0.85);
  }

  function finish() {
    const mk = (geo, mat, list, castS = true) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mm, i) => im.setMatrixAt(i, mm)); im.castShadow = castS && shadow; im.receiveShadow = shadow; root.add(im); meshes.push(im); };
    for (const k in inst.win) mk(winGeo, winMats[k], inst.win[k], false);
    for (const k in inst.shop) mk(shopGeo, shopMats[k], inst.shop[k], false);
    for (const [mat, list] of inst.sur) mk(surGeo, mat, list);
    for (const [mat, list] of inst.dent) mk(dentGeo, mat, list);
    for (const [mat, list] of stat) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = m.receiveShadow = shadow; root.add(m); meshes.push(m); }
    stat.clear();
  }
  return { block, bladeSign, flags, busShelter, finish, P, GROUND, STOREY };
}

// painted masonry for the distant towers: same palette, windows with their recess shadow drawn in
export function masonryFacade(seed, kind) {
  const S = 512, PX = S / 14, FL = 3.5 * PX, r = mulberry(seed);
  const wall = kind === 'brick' ? [128, 82, 60] : kind === 'sand' ? [190, 170, 136] : [170, 156, 130];
  const cA = document.createElement('canvas'), cE = document.createElement('canvas'); cA.width = cA.height = cE.width = cE.height = S;
  const a = cA.getContext('2d'), e = cE.getContext('2d');
  noiseFill(a, S, wall, 0.14, seed);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  for (let f = 0; f < 4; f++) {
    const fy = S - (f + 1) * FL;
    if (f === 3) { a.fillStyle = 'rgba(255,245,225,0.25)'; a.fillRect(0, fy, S, 10); a.fillStyle = 'rgba(0,0,0,0.35)'; a.fillRect(0, fy + 10, S, 6); }   // a belt every four storeys
    for (let k = 0; k < 4; k++) {
      const w = 1.25 * PX, h = 2.1 * PX, x = k * S / 4 + (S / 4 - w) / 2, y = fy + FL - (0.85 * PX + h);
      a.fillStyle = 'rgba(235,225,205,0.55)'; a.fillRect(x - 5, y - 8, w + 10, h + 14);                          // stone surround
      const st = r(); a.fillStyle = st < 0.1 ? '#050404' : '#141a20'; a.fillRect(x, y, w, h);
      a.fillStyle = 'rgba(0,0,0,0.55)'; a.fillRect(x, y, w, 7); a.fillRect(x, y, 6, h);                         // the reveal's shadow
      a.fillStyle = '#d8d0c0'; a.fillRect(x, y + h / 2 - 2, w, 4); a.fillRect(x + w / 2 - 2, y, 4, h);
      if (st > 0.94) { e.fillStyle = '#c8904c'; e.fillRect(x, y, w, h); } else if (st > 0.92) { e.fillStyle = '#ff6a18'; e.fillRect(x, y, w, h); }
      a.fillStyle = 'rgba(0,0,0,0.12)'; a.fillRect(x + r() * w, y + h + 6, 2, FL * 0.4 * r());
    }
  }
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const map = T(cA, true), emi = T(cE, true);
  const m = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: emi, emissiveIntensity: 1.3, bumpMap: map, bumpScale: 1, roughness: 0.88 });
  m.onBeforeCompile = safeBump; return m;
}
