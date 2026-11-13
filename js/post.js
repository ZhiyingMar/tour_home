// 后期效果：泛光（火、灯、星星会晕开）+ 移轴景深（画面上下两端轻微虚化，像在看一个小模型）
// + 环境反射（让木头、陶瓷、金属有一点光泽）。帧率不够时会自动降级，见 main.js。
import * as THREE from 'three';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../vendor/environments/RoomEnvironment.js';

const TiltShift = {
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 0.5 }, uAmount: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uFocus; uniform float uAmount; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float r = smoothstep(0.2, 0.62, abs(vUv.y - uFocus)) * uAmount;
      if (r < 0.02) { gl_FragColor = c; return; }
      vec4 sum = c; float n = 1.0;
      for (int i = 1; i <= 12; i++) {
        float f = float(i), a = f * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * sqrt(f / 12.0) * r * 7.0 * uTexel;
        sum += texture2D(tDiffuse, vUv + o); n += 1.0;
      }
      gl_FragColor = sum / n;
    }`,
};

export function createPost(renderer, scene, camera) {
  // 环境反射：一张柔和的“摄影棚”环境图
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.45, 1.5);
  composer.addPass(bloom);
  const tilt = new ShaderPass(TiltShift);
  composer.addPass(tilt);
  composer.addPass(new OutputPass());

  const V = new THREE.Vector3();
  return {
    enabled: true,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr); composer.setSize(w, h);
      tilt.uniforms.uTexel.value.set(1 / w, 1 / h);
    },
    // focus：世界坐标，画面里这一横条最清楚；night 越大泛光越明显
    render(focus, night, amount) {
      V.copy(focus).project(camera);
      const u = tilt.uniforms;
      u.uFocus.value += (THREE.MathUtils.clamp(V.y * 0.5 + 0.5, 0.25, 0.75) - u.uFocus.value) * 0.08;
      u.uAmount.value = amount;
      bloom.strength = 0.1 + 0.4 * night; // 白天几乎不泛光，不然整个画面会发灰
      composer.render();
    },
  };
}
