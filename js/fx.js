// Beyond the Horizon · shared effects: sparks, fires, smoke columns, embers, impact flashes
import * as THREE from 'three';
import { GLSL_NOISE } from './util.js';

const R = Math.random;

// ---------- sparks (one pooled point cloud) ----------
export function makeSparks(scene, n = 400) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), col = new Float32Array(n * 3), v = [], life = new Float32Array(n);
  for (let i = 0; i < n; i++) { v.push(new THREE.Vector3()); p[i * 3 + 1] = -999; }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // round, soft sparks (a bare point sprite is a square)
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g2 = c.getContext('2d'); const gr = g2.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const m = new THREE.PointsMaterial({ size: 0.11, map: dot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  let k = 0;
  return {
    emit(pos, count, speed = 4, c = [1, 0.62, 0.25], up = 0.6) {
      for (let j = 0; j < count; j++) {
        const i = k++ % n; life[i] = 0.5 + R() * 0.8;
        p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
        v[i].set(R() - 0.5, R() * up + (1 - up) * (R() - 0.5), R() - 0.5).normalize().multiplyScalar(speed * (0.4 + R()));
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      }
    },
    update(dt, g0 = 9.8) {
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt; v[i].y -= g0 * dt;
        p[i * 3] += v[i].x * dt; p[i * 3 + 1] += v[i].y * dt; p[i * 3 + 2] += v[i].z * dt;
        if (p[i * 3 + 1] < 0.02) { p[i * 3 + 1] = 0.02; v[i].y *= -0.3; v[i].x *= 0.6; v[i].z *= 0.6; }
        const f = Math.max(0, life[i]) / 1.3; col[i * 3] *= 0.985; col[i * 3 + 1] *= 0.97; col[i * 3 + 2] *= 0.95;
        if (life[i] <= 0) p[i * 3 + 1] = -999; else if (f < 0.05) p[i * 3 + 1] = -999;
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
  };
}

// ---------- flames: crossed billboards with a noise shader, shared material ----------
const flameMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uT: { value: 0 } },
  vertexShader: `varying vec2 vUv; varying float vSeed; attribute float seed; void main(){ vUv = uv; vSeed = seed;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `${GLSL_NOISE} varying vec2 vUv; varying float vSeed; uniform float uT;
    void main(){ vec2 q = vUv; float x = (q.x - 0.5) * 2.0;
      float n = fbm3(vec3(q.x * 3.0 + vSeed, q.y * 2.5 - uT * 2.2, uT * 0.6 + vSeed));
      float shape = (1.0 - abs(x) * (1.0 + q.y * 1.6)) * (1.0 - q.y) + n * 0.55 - 0.35;
      float a = smoothstep(0.0, 0.35, shape);
      vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.82, 0.45), smoothstep(0.2, 0.9, shape));
      gl_FragColor = vec4(c * a * 1.35, a); }`,
});
export function makeFires(scene, max = 64) {
  // two crossed quads per flame, instanced
  const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const q2 = quad.clone().rotateY(Math.PI / 2);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array([...quad.attributes.position.array, ...q2.attributes.position.array]);
  const uv = new Float32Array([...quad.attributes.uv.array, ...q2.attributes.uv.array]);
  const idx = [...quad.index.array, ...Array.from(q2.index.array, (i) => i + 4)];
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const seeds = new Float32Array(max); for (let i = 0; i < max; i++) seeds[i] = R() * 50;
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 1));
  const mesh = new THREE.InstancedMesh(geo, flameMat, max); mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh);
  const list = []; const m4 = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3();
  const lights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xff7a30, 0, 22, 2); scene.add(l); return l; });
  function write(i) { const f = list[i]; const s = f.size * f.life01; sc.set(s * 0.8, s * (1.2 + 0.15 * Math.sin(f.ph)), s * 0.8); m4.compose(f.pos, qn, sc); mesh.setMatrixAt(i, m4); }
  return {
    add(p, size = 2, ttl = Infinity) { if (list.length >= max) list.shift(); list.push({ pos: p.clone(), size, ttl, life01: ttl === Infinity ? 1 : 0.2, ph: R() * 6 }); mesh.count = list.length; },
    update(dt, t, near) {
      flameMat.uniforms.uT.value = t;
      for (let i = list.length - 1; i >= 0; i--) {
        const f = list[i]; f.ph += dt * 7;
        if (f.ttl !== Infinity) { f.ttl -= dt; f.life01 = Math.min(1, f.life01 + dt * 2) * Math.min(1, f.ttl / 3); if (f.ttl <= 0) list.splice(i, 1); }
      }
      mesh.count = list.length;
      for (let i = 0; i < list.length; i++) write(i);
      mesh.instanceMatrix.needsUpdate = true;
      // four real lights follow the flames nearest the viewer
      if (near) {
        const sorted = list.map((f) => [f, f.pos.distanceToSquared(near)]).sort((a, b) => a[1] - b[1]);
        lights.forEach((l, i) => { const e = sorted[i]; if (!e) { l.intensity = 0; return; } l.position.copy(e[0].pos).y += e[0].size * 0.6; l.intensity = 22 * e[0].size * e[0].life01 * (0.8 + 0.2 * Math.sin(t * 13 + i * 2)); });
      }
    },
    get count() { return list.length; },
  };
}

// ---------- smoke columns: soft dark puffs rising from fires ----------
export function makeSmoke(scene, max = 700) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(max * 3), a = new Float32Array(max), s = new Float32Array(max);
  for (let i = 0; i < max; i++) p[i * 3 + 1] = -999;
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('alpha', new THREE.BufferAttribute(a, 1)); g.setAttribute('psize', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 400 }, uLit: { value: new THREE.Color(0x5a3a2a) } },
    vertexShader: `attribute float alpha; attribute float psize; varying float vA; uniform float uScale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; uniform vec3 uLit; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float k = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(mix(vec3(0.06,0.05,0.05), uLit, 0.35 * (1.0 - gl_PointCoord.y)), k * vA); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 2; scene.add(pts);
  const vel = [], life = new Float32Array(max), maxL = new Float32Array(max), size0 = new Float32Array(max); let k = 0;
  for (let i = 0; i < max; i++) vel.push(new THREE.Vector3());
  const sources = [];
  return {
    material: m,
    addSource(pos, rate = 3, size = 6) { sources.push({ pos: pos.clone(), rate, size, acc: 0 }); },
    puff(pos, size, up = 2.5, lifeS = 9) {
      const i = k++ % max; life[i] = maxL[i] = lifeS * (0.7 + R() * 0.6); size0[i] = size;
      p[i * 3] = pos.x + (R() - 0.5) * size * 0.3; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z + (R() - 0.5) * size * 0.3;
      vel[i].set((R() - 0.5) * 0.6 + 0.8, up * (0.7 + R() * 0.6), (R() - 0.5) * 0.6);
    },
    update(dt, near) {
      for (const sct of sources) {
        if (near && sct.pos.distanceToSquared(near) > 320 * 320) continue;
        sct.acc += dt * sct.rate; while (sct.acc > 1) { sct.acc -= 1; this.puff(sct.pos, sct.size); }
      }
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt; const f = 1 - life[i] / maxL[i];
        p[i * 3] += vel[i].x * dt; p[i * 3 + 1] += vel[i].y * dt; p[i * 3 + 2] += vel[i].z * dt;
        a[i] = Math.min(1, f * 6) * (1 - f) * 0.55; s[i] = size0[i] * (0.6 + f * 2.2);
        if (life[i] <= 0) p[i * 3 + 1] = -999;
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.psize.needsUpdate = true;
    },
  };
}

// ---------- embers + ash drifting around the viewer ----------
export function makeAsh(scene, n = 900) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = (R() - 0.5) * 60; p[i * 3 + 1] = R() * 30; p[i * 3 + 2] = (R() - 0.5) * 60;
    const ember = R() < 0.18; c[i * 3] = ember ? 1 : 0.35; c[i * 3 + 1] = ember ? 0.45 : 0.32; c[i * 3 + 2] = ember ? 0.12 : 0.3;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return {
    update(dt, t, center, lift = 0) {
      for (let i = 0; i < n; i++) {
        let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        x += (0.9 + Math.sin(t * 0.7 + i) * 0.4) * dt; y += (-0.35 + lift + Math.sin(t * 1.3 + i * 1.7) * 0.2) * dt; z += Math.cos(t * 0.5 + i * 0.3) * 0.3 * dt;
        if (x - center.x > 30) x -= 60; if (x - center.x < -30) x += 60;
        if (z - center.z > 30) z -= 60; if (z - center.z < -30) z += 60;
        if (y < 0) y += 30; if (y > 30) y -= 30;
        p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}
