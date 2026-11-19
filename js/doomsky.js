// Beyond the Horizon · the sky of Earth's last 15 minutes, shared by the street and the climb to space.
// The Wanderer (a 1 solar-mass primordial black hole) shows as a lensing ring around a growing accretion flare;
// the Moon, inside its tidal-disruption radius first, stretches into a stream that bends toward it.
// Angular sizes are drawn well above real so they read on a phone screen.
import * as THREE from 'three';
import { GLSL_NOISE } from './util.js';

// World axes vs the compass: the boulevard runs along +x. Compass north is turned so the Wanderer stands
// straight over the far end of it: world azimuth = true azimuth − 65° (true SSE lies along world +x).
export const COMPASS = 65 * Math.PI / 180;
export const fromCompass = (elDeg, azDeg) => {
  const az = azDeg * Math.PI / 180 - COMPASS, el = elDeg * Math.PI / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
};
// From the N-body study (1 solar-mass primordial hole at 1,000 km/s): at 06:21 it hangs 12° above the
// south-south-east horizon (true azimuth 155°). It still misses the Sun by ~1 AU, so Mars keeps a safe orbit;
// Jupiter and Saturn are left on crossing orbits and start pulling at each other some centuries later.
export const BH_DIR = fromCompass(12, 155);
export const MOON_DIR = fromCompass(34, 172);   // the Moon's remains, ~22° above it: its stream pours down toward the hole
// the Sun at 06:21 local, mid-April, Cape Canaveral: azimuth ~80° (a little north of east), 7° below the horizon
export const SUN_DIR = fromCompass(-7, 80);
// Mars, near opposition (0.70 AU away): just set in the west. In open space it is the red point the ship heads for.
export const MARS_DIR = fromCompass(-4.2, 277.3);

const FRAG = `${GLSL_NOISE} varying vec3 vD; uniform float uT, uProg, uFlash, uAir, uDip, uSpace; uniform vec3 uBH, uMoon, uSun, uMars;
void main(){
  vec3 d = normalize(vD); float el = d.y + uDip;      // elevation above the true horizon
  float air = uAir;
  // a burning city lights its own smoke from below: orange at the horizon, dull red-brown overhead
  vec3 zen = vec3(0.075, 0.032, 0.03) * air, hor = vec3(0.78, 0.31, 0.11) * mix(0.25, 1.0, air);
  vec3 col = mix(hor, zen, smoothstep(-0.05, mix(0.08, 0.5, air), el)) * (1.0 - uSpace);   // in open space there is no horizon, only black
  float sm = fbm3(d * 3.5 + vec3(uT * 0.004, 0.0, uT * 0.002));
  float sm2 = fbm3(d * 9.0 - vec3(uT * 0.01, 0.0, 0.0));
  float smoke = smoothstep(0.35, 0.8, sm * 0.7 + sm2 * 0.4) * air;
  vec3 smokeC = mix(vec3(0.09, 0.045, 0.04), vec3(0.6, 0.24, 0.09), exp(-max(el, 0.0) * 3.0)) * (0.75 + 0.5 * sm2);
  col = mix(col, smokeC, smoke * smoothstep(-0.03, 0.15, el) * 0.85);
  vec3 sp = d * 260.0; vec3 sc = floor(sp); float sh = h13(sc);
  float stars = step(0.9972, sh) * (0.4 + 0.6 * h13(sc + 2.7)) * mix(smoothstep(mix(-0.02, 0.15, air), mix(0.1, 0.6, air), el), 1.0, uSpace) * (1.0 - smoke);
  col += vec3(stars) * mix(1.4, 0.6, air);
  // Mars: a steady red-orange point (bright: it is at opposition)
  float ma = acos(clamp(dot(d, uMars), -1.0, 1.0));
  col += vec3(1.0, 0.5, 0.28) * (exp(-ma / 0.0016) * 2.2 + exp(-ma / 0.01) * 0.12) * mix(0.4, 1.0, uSpace) * (1.0 - smoke);
  float veil = 1.0 - 0.35 * smoke;                   // the sky objects show through the smoke, a little dimmed
  // the Sun, 7 degrees below the eastern horizon at 06:21: first a twilight glow, then (from ~48 km up) the disk
  float sunEl = uSun.y + uDip;
  float hl = length(d.xz), sl = length(uSun.xz);
  float toward = (hl > 1e-4 && sl > 1e-4) ? max(dot(d.xz / hl, uSun.xz / sl), 0.0) : 0.0;
  float dawn = smoothstep(-0.3, 0.03, sunEl);
  col += vec3(0.95, 0.46, 0.22) * pow(toward, 6.0) * exp(-max(el, 0.0) * mix(16.0, 6.0, uSpace)) * dawn * mix(0.22, 0.75, 1.0 - air) * (1.0 - 0.5 * uSpace);
  float sa = acos(clamp(dot(d, uSun), -1.0, 1.0));
  float above = mix(smoothstep(-0.004, 0.004, el), 1.0, step(0.5, uSpace));
  vec3 sunC = mix(vec3(1.0, 0.52, 0.26), vec3(1.0, 0.96, 0.9), clamp(1.0 - air + uSpace, 0.0, 1.0));
  col += sunC * (smoothstep(0.0072, 0.0056, sa) * 30.0 + exp(-sa / 0.012) * 1.4 + exp(-sa / 0.12) * 0.2) * veil * above;
  // the Wanderer: lensing ring around an accretion flare
  float a = acos(clamp(dot(d, uBH), -1.0, 1.0));
  float rE = mix(0.042, 0.064, uProg);               // drawn ~15-20x its real size so it looms over the horizon
  float acc = smoothstep(0.35, 0.9, uProg);
  col *= mix(0.08, 1.0, smoothstep(rE * 0.5, rE * 0.97, a));   // the shadow: blacker than any smoke behind it
  col += (vec3(1.0, 0.88, 0.76) * exp(-pow((a - rE) / (rE * 0.055), 2.0)) * (1.5 + 0.8 * acc)
        + vec3(1.0, 0.72, 0.46) * exp(-pow((a - rE * 1.1) / (rE * 0.22), 2.0)) * 0.2
        + vec3(0.9, 0.95, 1.0) * exp(-a / 0.003) * (0.5 + 3.0 * acc)
        + vec3(1.0, 0.58, 0.32) * exp(-a / 0.13) * 0.24 * (0.3 + acc)) * veil;
  // the Moon and its tidal stream
  vec3 n = normalize(cross(uMoon, uBH));
  vec3 bp = normalize(uBH - uMoon * dot(uBH, uMoon));
  float total = acos(clamp(dot(uMoon, uBH), -1.0, 1.0));
  float off = asin(clamp(dot(d, n), -1.0, 1.0));
  float along = atan(dot(d, bp), dot(d, uMoon));
  float s = along / total;
  float rm = 0.03;
  float stretch = 1.0 + 2.2 * smoothstep(0.0, 0.5, uProg);
  float md = length(vec2(along / stretch, off));
  float alive = 1.0 - 0.6 * smoothstep(0.5, 1.0, uProg);
  float shade = 0.55 + 0.45 * fbm3(vec3(along * 90.0, off * 90.0, 3.0));
  float disk = smoothstep(rm, rm * 0.8, md) * alive * step(-0.5, dot(d, uMoon)) * veil;
  vec3 moonC = vec3(0.78, 0.74, 0.7) * shade;
  float cracks = smoothstep(0.62, 0.7, fbm3(vec3(along * 160.0, off * 160.0, 1.0))) * smoothstep(0.08, 0.4, uProg);
  moonC += vec3(1.0, 0.45, 0.12) * cracks;
  col = mix(col, moonC, disk);
  float bow = 0.04 * sin(clamp(s, 0.0, 1.0) * 3.14159);
  float head = clamp(uProg * 1.6, 0.0, 1.02);
  float wdt = mix(rm * 0.95, 0.005, smoothstep(0.0, 1.0, s)) * (0.7 + 0.9 * uProg);
  float dist = abs(off - bow);
  float clump = fbm3(vec3(s * 36.0 - uT * 0.02, off * 260.0, 7.0));
  float stream = smoothstep(wdt, wdt * 0.2, dist) * smoothstep(-0.03, 0.02, s) * smoothstep(head, head - 0.1, s) * smoothstep(0.02, 0.1, uProg);
  col += vec3(0.95, 0.72, 0.52) * stream * (0.35 + 1.0 * clump) * (1.0 - disk) * veil;
  // fire glow along the horizon, impact flashes, ground below the horizon
  col += vec3(0.6, 0.2, 0.05) * exp(-max(el, 0.0) * mix(40.0, 12.0, air)) * mix(0.35, 0.6, air) * (1.0 - uSpace);
  col += vec3(1.0, 0.7, 0.45) * uFlash * air;
  if (el < 0.0 && uSpace < 0.5) col = mix(col, vec3(0.12, 0.05, 0.03) * air, smoothstep(0.0, -0.06, el));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createDoomSky(radius) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uT: { value: 0 }, uProg: { value: 0 }, uAir: { value: 1 }, uDip: { value: 0 }, uSpace: { value: 0 }, uFlash: { value: 0 }, uBH: { value: BH_DIR.clone() }, uMoon: { value: MOON_DIR.clone() }, uSun: { value: SUN_DIR.clone() }, uMars: { value: MARS_DIR.clone() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: FRAG,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  return sky;
}
