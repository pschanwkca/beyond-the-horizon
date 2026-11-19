// Beyond the Horizon · Earth as it really looks from orbit (NASA Blue Marble day map, night lights,
// cloud cover), lit by the real Sun at dawn over the launch site, with the damage of the last day laid
// on top: smoke palls, wildfires, impact scars, and (in the finale) the tidal fault lines.
import * as THREE from 'three';
import { GLSL_NOISE } from './util.js';
import { SUN_DIR, COMPASS } from './doomsky.js';

let tex = null;
export function earthTextures() {
  if (tex) return tex;
  const L = new THREE.TextureLoader();
  const u = (f) => new URL('../tex/' + f, import.meta.url).href;
  const day = L.load(u('earth_day.jpg')), night = L.load(u('earth_night.jpg')), clouds = L.load(u('earth_clouds.jpg'));
  day.colorSpace = THREE.SRGBColorSpace; night.colorSpace = THREE.SRGBColorSpace;
  [day, night, clouds].forEach((t) => { t.anisotropy = 4; });
  tex = { day, night, clouds };
  return tex;
}

// launch site: NASA's east-coast pad, Cape Canaveral (28.5° N, 80.6° W)
export const SITE = { lat: 28.5, lon: -80.6 };
// the Sun at 06:21 local in April: rising a little north of east, 7° below the horizon at the pad
export const SUN_LOCAL = SUN_DIR;

// rotation that puts the launch site on top (+y), with local north turned to match the game's compass (see doomsky.js)
export function siteQuaternion() {
  const lat = SITE.lat * Math.PI / 180, u = (SITE.lon + 180) / 360, a = 2 * Math.PI * u;
  const P = new THREE.Vector3(-Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat));   // SphereGeometry's own convention
  const E = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const N = new THREE.Vector3(Math.cos(a) * Math.sin(lat), Math.cos(lat), -Math.sin(a) * Math.sin(lat));
  const B = new THREE.Matrix4().makeBasis(E, P, N.clone().negate());   // local frame -> Earth's object frame
  const q = new THREE.Quaternion().setFromRotationMatrix(B.clone().invert());
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), COMPASS).multiply(q);   // world axes are turned against the compass
}

export function earthMaterial({ cracks = false } = {}) {
  const t = earthTextures();
  return new THREE.ShaderMaterial({
    uniforms: { uDay: { value: t.day }, uNight: { value: t.night }, uClouds: { value: t.clouds }, uSun: { value: SUN_LOCAL.clone() }, uT: { value: 0 },
      uCrack: { value: 0 }, uStretch: { value: 0 }, uA: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: `uniform float uStretch; uniform vec3 uA; varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vWA;
      void main(){ vUv = uv; vP = normalize(position);
        vec3 wn = normalize(mat3(modelMatrix) * normal); vN = wn;
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz; vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vec3 r = wp - c;
        ${cracks ? 'r += uA * dot(r, uA) * uStretch - (r - uA * dot(r, uA)) * uStretch * 0.25;' : ''}
        vWA = normalize(r);
        gl_Position = projectionMatrix * viewMatrix * vec4(c + r, 1.0); }`,
    fragmentShader: `${GLSL_NOISE} uniform sampler2D uDay, uNight, uClouds; uniform vec3 uSun, uA; uniform float uT, uCrack;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vWA;
      void main(){
        vec3 N = normalize(vN);
        float l = dot(N, uSun);
        float dayK = smoothstep(-0.08, 0.18, l);
        vec3 day = texture2D(uDay, vUv).rgb;
        vec3 col = day * (0.025 + 1.1 * max(l, 0.0));
        float landK = smoothstep(-0.02, 0.06, day.r + day.g - 2.0 * day.b);   // ocean is blue-dominant in the Blue Marble map
        // the last day: palls of smoke over burning land, scorched patches
        float smoke = smoothstep(0.6, 0.85, fbm3(vP * 9.0 + 2.0)) * 0.35 * (0.3 + 0.7 * landK);
        col = mix(col, vec3(0.18, 0.13, 0.1) * (0.04 + 1.1 * max(l, 0.0)), smoke);
        float cl = texture2D(uClouds, vUv + vec2(uT * 0.0000015, 0.0)).r;
        col = mix(col, vec3(0.95, 0.95, 0.97) * (0.025 + 1.05 * max(l, 0.0)), cl * 0.9);
        // sunrise/sunset band: the light reddens along the terminator
        col *= mix(vec3(1.0), vec3(1.0, 0.62, 0.42), smoothstep(0.28, 0.0, abs(l)) * dayK * 0.6);
        // night side: half the grids have failed; fires and impact glows everywhere
        vec3 night = texture2D(uNight, vUv).rgb;
        float alive = 0.35 + 0.65 * smoothstep(0.42, 0.58, fbm3(vP * 160.0));   // failed grids as soft regions: a hashed 40 km cell would show as a lit tile
        // up close the map's 20 km pixels would show as tiles: break each into scattered towns and lamps
        vec3 q = vP * 3200.0; float fq = length(fwidth(q)), detail = 1.0 - smoothstep(0.35, 1.2, fq);
        vec3 qf = fract(q) - 0.5; float town = step(0.62, h13(floor(q))) * exp(-dot(qf, qf) * 9.0);
        float lights = night.r * mix(1.0, town * 3.2, detail);
        col += vec3(1.0, 0.74, 0.42) * lights * alive * (1.0 - dayK) * 1.3 * (1.0 - cl * 0.7);
        vec3 fp = vP * 900.0; vec3 ff = fract(fp) - 0.5;
        float fire = step(0.986, h13(floor(fp))) * exp(-dot(ff, ff) * 18.0) * (1.0 - cl) * landK;
        col += vec3(1.0, 0.42, 0.1) * fire * mix(0.5, 1.6, 1.0 - dayK);
        ${cracks ? `float r1 = 1.0 - abs(fbm3(vP * 5.0) * 2.0 - 1.0), r2 = 1.0 - abs(fbm3(vP * 13.0 + 7.0) * 2.0 - 1.0);
        float pull = abs(dot(vWA, uA));
        // fault lines: thin at first, opening where the tide pulls hardest (facing and opposite the hole)
        float crack = smoothstep(0.992 - 0.014 * uCrack, 0.999, max(r1, r2 * 0.96)) * smoothstep(0.0, 0.35, uCrack - (1.0 - pull) * 0.6);
        col = mix(col, col * 0.4, smoothstep(0.6, 1.0, uCrack) * pull * 0.5);                   // dust thrown up dims the surface
        col += vec3(1.0, 0.32, 0.06) * crack * (0.5 + 1.1 * uCrack);
        col += vec3(0.5, 0.1, 0.02) * uCrack * uCrack * 0.08 * pull;` : ''}
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// a thin blue shell: Rayleigh-scattered sunlight on the limb, reddening at the terminator
export function atmosphereMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCam: { value: new THREE.Vector3() }, uSun: { value: SUN_LOCAL.clone() }, uK: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `varying vec3 vN; varying vec3 vW; uniform vec3 uCam, uSun; uniform float uK;
      void main(){ vec3 V = normalize(uCam - vW); float f = pow(1.0 - abs(dot(-vN, V)), 2.6);
        float l = dot(normalize(vN), uSun);
        vec3 c = mix(vec3(0.35, 0.6, 1.0), vec3(1.0, 0.5, 0.25), smoothstep(0.35, -0.05, l)) * smoothstep(-0.3, 0.15, l);
        gl_FragColor = vec4(c * f * 1.0 * uK, f); }`,
  });
}
