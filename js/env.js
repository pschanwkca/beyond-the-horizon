// Beyond the Horizon · image-based light: a small procedural sky/ground panorama baked through PMREM,
// so metal, visors and suits pick up the world around them instead of rendering black.
import * as THREE from 'three';

const FRAG = `
uniform vec3 uZen, uHor, uGnd, uSunC, uSun; uniform float uSunK, uBand;
varying vec3 vD;
void main(){
  vec3 d = normalize(vD); float y = d.y;
  vec3 c = y > 0.0 ? mix(uHor, uZen, pow(y, 0.55)) : mix(uHor * 0.6, uGnd, smoothstep(0.0, -0.25, y));
  c += uHor * uBand * exp(-abs(y) * 18.0);                       // bright haze band at the horizon
  float s = max(dot(d, uSun), 0.0);
  c += uSunC * (pow(s, 600.0) * 10.0 + pow(s, 24.0) * 0.5) * uSunK;  // the sun and its glow
  gl_FragColor = vec4(c, 1.0);
}`;

export function makeEnv(renderer, { zenith = 0x5a4030, horizon = 0xd8a77c, ground = 0x4a2c1e, sun = new THREE.Vector3(0, 1, 0), sunColor = 0xfff0dd, sunK = 1, band = 0.25, gain = 1 } = {}) {
  const sc = new THREE.Scene();
  const col = (h) => new THREE.Color(h).multiplyScalar(gain);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { uZen: { value: col(zenith) }, uHor: { value: col(horizon) }, uGnd: { value: col(ground) }, uSunC: { value: col(sunColor) }, uSun: { value: sun.clone().normalize() }, uSunK: { value: sunK }, uBand: { value: band } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: FRAG });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.02, 0.1, 50);
  pm.dispose(); m.dispose();
  return rt.texture;
}
