// Beyond the Horizon · rocks that read as rock: a noise-displaced, smooth-shaded icosphere with a flattened base,
// a grainy bump texture, per-instance colour, and a field of pebbles that follows whoever is walking.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, mulberry, fbm, vnoise } from './util.js';

// cheap 3-D value noise from the 2-D one (three crossed planes)
const n3 = (x, y, z) => (vnoise(x + 3.1, y - 1.7) + vnoise(y + 7.3, z + 2.9) + vnoise(z - 5.1, x + 4.3)) / 3;

export function rockGeo(seed = 1, { detail = 3, sharp = 0.5, flat = 0.32 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3(), R = mulberry(seed);
  const o = [R() * 50, R() * 50, R() * 50];
  // a few cleavage planes make it look broken rather than blobby
  const planes = Array.from({ length: 4 }, () => ({ n: new THREE.Vector3(R() - 0.5, R() * 0.6 - 0.1, R() - 0.5).normalize(), d: 0.62 + R() * 0.25 }));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.34 * n3(v.x * 1.6 + o[0], v.y * 1.6 + o[1], v.z * 1.6 + o[2]) + 0.1 * n3(v.x * 5 + o[1], v.y * 5, v.z * 5 + o[2]);
    v.multiplyScalar(k);
    for (const pl of planes) { const s = v.dot(pl.n); if (s > pl.d) v.addScaledVector(pl.n, -(s - pl.d) * (0.6 + sharp * 0.4)); }
    if (v.y < -flat) v.y = -flat + (v.y + flat) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // uvs from a box projection so the bump texture wraps
  const uv = new Float32Array(p.count * 2), nm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const ax = Math.abs(nm.getX(i)), ay = Math.abs(nm.getY(i)), az = Math.abs(nm.getZ(i));
    if (ay > ax && ay > az) { uv[i * 2] = v.x; uv[i * 2 + 1] = v.z; } else if (ax > az) { uv[i * 2] = v.z; uv[i * 2 + 1] = v.y; } else { uv[i * 2] = v.x; uv[i * 2 + 1] = v.y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

let _bump = null, _alb = null;
export function rockBump() {
  if (_bump) return _bump;
  _bump = canvasTex(256, 256, (g, w) => {
    const R = mulberry(77), img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const n = 0.5 * (fbm(x / 22, y / 22, 4) * 0.5 + 0.5) + 0.3 * (fbm(x / 6 + 9, y / 6, 2) * 0.5 + 0.5) + 0.2 * R();
      const v = Math.round(n * 255), i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2;           // hairline fractures
    for (let k = 0; k < 18; k++) { g.beginPath(); let x = R() * w, y = R() * w; g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  }, { srgb: false, repeat: true });
  return _bump;
}
export function rockAlbedo() {
  if (_alb) return _alb;
  _alb = canvasTex(256, 256, (g, w) => {
    const R = mulberry(78), img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const n = 0.6 * (fbm(x / 30 + 4, y / 30, 4) * 0.5 + 0.5) + 0.4 * R();
      const v = 175 + n * 80, i = (y * w + x) * 4; img.data[i] = v; img.data[i + 1] = v * 0.95; img.data[i + 2] = v * 0.9; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '30,22,18' : '235,215,190'},${0.1 + R() * 0.2})`; g.fillRect(R() * w, R() * w, 1 + R() * 2, 1 + R() * 2); }   // grains
  }, { repeat: true });
  return _alb;
}
// three's bump mapping normalises screen-space derivatives; far away (or edge-on) they can be exactly zero, the normal
// turns NaN, and bloom smears the NaN into a white fog across the screen. Same maths, with guards.
const SAFE_BUMP = THREE.ShaderChunk.bumpmap_pars_fragment
  .replace('vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );', 'vec3 vSigmaX = dFdx( surf_pos.xyz ); vSigmaX *= inversesqrt( max( dot( vSigmaX, vSigmaX ), 1e-24 ) );')
  .replace('vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );', 'vec3 vSigmaY = dFdy( surf_pos.xyz ); vSigmaY *= inversesqrt( max( dot( vSigmaY, vSigmaY ), 1e-24 ) );')
  .replace('return normalize( abs( fDet ) * surf_norm - vGrad );', 'vec3 nB = abs( fDet ) * surf_norm - vGrad; return dot( nB, nB ) > 1e-12 ? normalize( nB ) : surf_norm;');
export function safeBump(sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <bumpmap_pars_fragment>', SAFE_BUMP); }
// dust settles on the tops of rocks: blend toward the ground colour where the normal faces up
export function rockMat(color = 0x5a3a2a, dust = 0xb07a52, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, map: rockAlbedo(), bumpMap: rockBump(), bumpScale: 2.2, ...opts });
  const dc = new THREE.Color(dust);
  m.onBeforeCompile = (sh) => {
    safeBump(sh); sh.uniforms.uDust = { value: dc };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vUp;').replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n#ifdef USE_INSTANCING\n vUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;\n#else\n vUp = normalize(mat3(modelMatrix) * objectNormal).y;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vUp; uniform vec3 uDust;').replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, uDust * (0.85 + 0.3 * texture2D(map, vMapUv * 0.37).r), smoothstep(0.45, 0.9, vUp) * ' + (m.userData.dustK ?? 0.75).toFixed(2) + ');');
  };
  return m;
}

// a scatter of rocks: several shapes, one InstancedMesh each, per-instance tint
export function rockField(parent, place, { count = 300, kinds = 4, seed = 5, color = 0x5a3a2a, dust = 0xb07a52, detail = 3, shadow = true } = {}) {
  const R = mulberry(seed), mat = rockMat(color, dust), meshes = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const per = Math.ceil(count / kinds);
  for (let k = 0; k < kinds; k++) {
    const im = new THREE.InstancedMesh(rockGeo(seed * 13 + k, { detail, sharp: R(), flat: 0.2 + R() * 0.3 }), mat, per);
    let n = 0;
    for (let i = 0; i < per; i++) { const r = place(R, i + k * per); if (!r) continue;
      p.set(r.x, r.y, r.z); q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.5, R() * 6.28, (R() - 0.5) * 0.5)); s.set(r.s * (0.8 + R() * 0.5), r.s * (0.55 + R() * 0.4), r.s * (0.8 + R() * 0.5));
      im.setMatrixAt(n, m4.compose(p, q, s)); im.setColorAt(n, c.setHSL(0.04 + R() * 0.03, 0.25 + R() * 0.2, 0.55 + R() * 0.35)); n++; }
    im.count = n; im.castShadow = shadow; im.receiveShadow = true; parent.add(im); meshes.push(im);
  }
  return meshes;
}

// pebbles: the small stuff at your feet, laid out cell by cell around a moving centre
export function pebbleField(parent, heightAt, { cell = 16, reach = 3, per = 70, seed = 9, color = 0x3e2c24, dust = 0xa8714a, skip = null } = {}) {
  const N = (reach * 2 + 1) ** 2 * per, mat = rockMat(color, dust, { bumpScale: 1.2, flatShading: true }); mat.userData.dustK = 0.3;
  const geos = [rockGeo(seed, { detail: 1, flat: 0.25 }), rockGeo(seed + 1, { detail: 0, flat: 0.4, sharp: 1 })];
  const ims = geos.map((g) => { const im = new THREE.InstancedMesh(g, mat, N); im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false; parent.add(im); return im; });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
  let ci = 1e9, cj = 1e9;
  const hsh = (i, j) => (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ seed) >>> 0;
  function update(pos) {
    const i0 = Math.floor(pos.x / cell), j0 = Math.floor(pos.z / cell);
    if (i0 === ci && j0 === cj) return; ci = i0; cj = j0;
    const n = [0, 0];
    for (let di = -reach; di <= reach; di++) for (let dj = -reach; dj <= reach; dj++) {
      const R = mulberry(hsh(i0 + di, j0 + dj));
      for (let k = 0; k < per; k++) {
        const x = (i0 + di + R()) * cell, z = (j0 + dj + R()) * cell;
        // clustered: most pebbles gather in a few patches per cell
        const sz = 0.012 + Math.pow(R(), 4) * 0.3, kind = R() < 0.6 ? 0 : 1, rot = R() * 6.28, ti = R(), tl = R();
        if (skip && skip(x, z)) continue;
        p.set(x, heightAt(x, z) + sz * 0.15, z); q.setFromEuler(e.set((ti - 0.5) * 0.6, rot, (tl - 0.5) * 0.6)); s.set(sz * (0.8 + ti * 0.6), sz * (0.5 + tl * 0.4), sz * (0.8 + tl * 0.5));
        const im = ims[kind]; im.setMatrixAt(n[kind], m4.compose(p, q, s)); im.setColorAt(n[kind], c.setHSL(0.04 + ti * 0.03, 0.3, 0.45 + tl * 0.45)); n[kind]++;
      }
    }
    ims.forEach((im, k) => { im.count = n[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  }
  return { update, meshes: ims, set visible(v) { ims.forEach((m) => (m.visible = v)); } };
}

// fused crust with fine fractures, white where hot: an emissive map for anything glowing from inside its cracks
let _crack = null;
export function rockCracks() {
  if (_crack) return _crack;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), r = mulberry(404);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.lineCap = 'round'; g.lineJoin = 'round';
  const crack = (x, y, a, n, w, d) => { g.beginPath(); g.moveTo(x, y); for (let k = 0; k < n; k++) { a += (r() - 0.5) * 0.8; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); if (d < 2 && r() < 0.14) crack(x, y, a + (r() < 0.5 ? 1 : -1) * (0.6 + r()), n / 2 | 0, w * 0.6, d + 1); } g.lineWidth = w; g.stroke(); };
  g.shadowColor = '#fff'; g.shadowBlur = 6; g.strokeStyle = '#fff';
  for (let i = 0; i < 12; i++) crack(r() * S, r() * S, r() * 6.28, 14 + r() * 16, 1.2 + r() * 1.6, 0);
  _crack = new THREE.CanvasTexture(c); _crack.wrapS = _crack.wrapT = THREE.RepeatWrapping; return _crack;
}
