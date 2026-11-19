// Beyond the Horizon · a light post-processing stack for the walkable worlds: bloom on hot things only,
// a filmic grade, vignette and grain. Half-resolution bloom keeps it affordable on phones.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.035 }, uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uAb: { value: 0.0015 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT, uVig, uGrain, uAb; uniform vec3 uLift, uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      // a hair of lens fringing toward the corners
      vec3 col; col.r = texture2D(tDiffuse, vUv - c * uAb * r2 * 4.0).r; col.g = texture2D(tDiffuse, vUv).g; col.b = texture2D(tDiffuse, vUv + c * uAb * r2 * 4.0).b;
      col = col * uTint + uLift;
      col *= 1.0 - uVig * smoothstep(0.08, 0.55, r2);
      col += (h(vUv * 1000.0 + uT) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const rp = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.55, 0.9);
  const out = new OutputPass();                 // tone mapping and sRGB, after bloom (so bloom works on linear light)
  const grade = new ShaderPass(GRADE);
  composer.addPass(rp); composer.addPass(bloom); composer.addPass(out); composer.addPass(grade);
  let w = 0, h = 0;
  return {
    bloom, grade,
    render(scene, cam, W, H, t) {
      const pr = renderer.getPixelRatio();
      if (W !== w || H !== h) { w = W; h = H; composer.setPixelRatio(pr); composer.setSize(W, H); bloom.resolution.set(W * pr / 2, H * pr / 2); }
      rp.scene = scene; rp.camera = cam; grade.uniforms.uT.value = t % 100;
      composer.render();
    },
    look(o) { if (o.bloom != null) bloom.strength = o.bloom; if (o.thr != null) bloom.threshold = o.thr; if (o.vig != null) grade.uniforms.uVig.value = o.vig; if (o.grain != null) grade.uniforms.uGrain.value = o.grain; if (o.tint) grade.uniforms.uTint.value.set(...o.tint); if (o.lift) grade.uniforms.uLift.value.set(...o.lift); },
  };
}
